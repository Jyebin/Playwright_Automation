import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const POLL_INTERVAL_MS = 5000;
const MAX_WAIT_MS = parseInt(process.env.EMAIL_MAX_WAIT_MS ?? '60000');
const LOOK_BACK_MS = 15 * 60 * 1000; // 최근 15분 이내 메일 검색

// 이메일에서 /regist_data?token=<JWT> URL 패턴 추출
const TOKEN_REGEX = /\/regist_data\?token=([\w.\-]+)/;

function getImapConfig() {
  const host = process.env.EMAIL_IMAP_HOST;
  const user = process.env.EMAIL_IMAP_USER;
  const pass = process.env.EMAIL_IMAP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      '[emailHelper] .env에 EMAIL_IMAP_HOST, EMAIL_IMAP_USER, EMAIL_IMAP_PASS를 설정해 주세요.'
    );
  }

  return {
    host,
    port: parseInt(process.env.EMAIL_IMAP_PORT ?? '993'),
    secure: (process.env.EMAIL_IMAP_SECURE ?? 'true') === 'true',
    user,
    pass,
  };
}

async function scanInbox(since: Date): Promise<string | null> {
  const { host, port, secure, user, pass } = getImapConfig();

  const client = new ImapFlow({
    host,
    port,
    secure,
    auth: { user, pass },
    logger: false,
    tls: { rejectUnauthorized: false },
  });

  await client.connect();
  const lock = await client.getMailboxLock('INBOX');

  try {
    // since 날짜 이후 받은 모든 메시지 UID 검색
    const uids = (await client.search({ since }, { uid: true })) as number[];
    if (!uids.length) return null;

    // 최신 순으로 최대 20개 검사
    for (const uid of [...uids].reverse().slice(0, 20)) {
      let source: Buffer | undefined;
      try {
        const msg = await client.fetchOne(`${uid}`, { source: true }, { uid: true });
        source = msg?.source as Buffer | undefined;
      } catch {
        continue;
      }
      if (!source) continue;

      const parsed = await simpleParser(source);
      const html = (parsed.html as string) ?? '';
      const text = (parsed.text as string) ?? '';
      const body = html || text;

      const match = body.match(TOKEN_REGEX);
      if (match) {
        console.log(`[emailHelper] 인증 토큰 발견 (uid=${uid})`);
        return match[1];
      }
    }
    return null;
  } finally {
    lock.release();
    await client.logout();
  }
}

/**
 * IMAP 메일함을 폴링해 회원가입 인증 JWT 토큰을 반환합니다.
 *
 * .env 필수 설정:
 *   EMAIL_IMAP_HOST  — IMAP 서버 주소 (예: imap.gmail.com, imap.naver.com)
 *   EMAIL_IMAP_USER  — 이메일 주소
 *   EMAIL_IMAP_PASS  — 비밀번호 또는 앱 비밀번호
 *
 * Gmail 사용 시: Google 계정 → 2FA 활성화 → 앱 비밀번호 발급 후 사용
 * Naver 사용 시: 네이버 메일 → 설정 → IMAP/SMTP 사용함 → 앱 비밀번호
 */
export async function waitForVerificationToken(maxWaitMs = MAX_WAIT_MS): Promise<string> {
  const since = new Date(Date.now() - LOOK_BACK_MS);
  const deadline = Date.now() + maxWaitMs;

  console.log(`[emailHelper] 인증 메일 대기 중... (최대 ${maxWaitMs / 1000}초)`);

  while (Date.now() < deadline) {
    const token = await scanInbox(since).catch((err) => {
      console.warn(`[emailHelper] IMAP 연결 오류 (재시도): ${err.message}`);
      return null;
    });

    if (token) return token;

    const remaining = Math.ceil((deadline - Date.now()) / 1000);
    console.log(`[emailHelper] 토큰 미발견, ${remaining}초 남음. ${POLL_INTERVAL_MS / 1000}초 후 재시도...`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(
    `[emailHelper] 인증 토큰을 ${maxWaitMs / 1000}초 내에 찾지 못했습니다.\n` +
      '확인사항: IMAP 설정(.env), 이메일 발송 여부, 스팸 폴더'
  );
}

/**
 * Gmail plus addressing 방식으로 테스트용 고유 이메일 생성
 * 예) base = "test@gmail.com" → "test+1749600000000@gmail.com"
 * 모두 base 계정 받은편지함으로 수신됨
 */
export function generateTestEmail(base?: string): string {
  const addr = base ?? process.env.EMAIL_IMAP_USER ?? '';
  if (!addr) throw new Error('[emailHelper] EMAIL_IMAP_USER 또는 base 이메일을 지정해 주세요.');

  const [local, domain] = addr.split('@');
  const ts = Date.now();
  return `${local}+${ts}@${domain}`;
}
