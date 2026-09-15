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

export interface VerificationEmailInfo {
  from: string;
  subject: string;
  token: string | null;
}

async function scanInboxForEmailInfo(since: Date): Promise<VerificationEmailInfo | null> {
  const { host, port, secure, user, pass } = getImapConfig();

  const client = new ImapFlow({
    host, port, secure,
    auth: { user, pass },
    logger: false,
    tls: { rejectUnauthorized: false },
  });

  await client.connect();
  const lock = await client.getMailboxLock('INBOX');

  try {
    const uids = (await client.search({ since }, { uid: true })) as number[];
    if (!uids.length) return null;

    for (const uid of [...uids].reverse().slice(0, 20)) {
      let source: Buffer | undefined;
      try {
        const msg = await client.fetchOne(`${uid}`, { source: true }, { uid: true });
        if (!msg) continue;
        source = (msg as any).source as Buffer | undefined;
      } catch { continue; }
      if (!source) continue;

      const parsed = await simpleParser(source);
      const subject = parsed.subject ?? '';
      if (!subject.includes('라온 메타데미') && !subject.includes('이메일 인증')) continue;

      const from = parsed.from?.text ?? '';
      const body = (parsed.html as string) || (parsed.text as string) || '';
      const match = body.match(TOKEN_REGEX);

      return { from, subject, token: match ? match[1] : null };
    }
    return null;
  } finally {
    lock.release();
    await client.logout();
  }
}

/**
 * IMAP으로 인증 메일의 발신자/제목/토큰을 함께 반환
 */
export async function waitForVerificationEmail(maxWaitMs = MAX_WAIT_MS): Promise<VerificationEmailInfo> {
  const since = new Date(Date.now() - LOOK_BACK_MS);
  const deadline = Date.now() + maxWaitMs;

  console.log(`[emailHelper] 인증 메일 대기 중... (최대 ${maxWaitMs / 1000}초)`);

  while (Date.now() < deadline) {
    const info = await scanInboxForEmailInfo(since).catch((err) => {
      console.warn(`[emailHelper] IMAP 연결 오류 (재시도): ${err.message}`);
      return null;
    });

    if (info) return info;

    const remaining = Math.ceil((deadline - Date.now()) / 1000);
    console.log(`[emailHelper] 메일 미발견, ${remaining}초 남음. ${POLL_INTERVAL_MS / 1000}초 후 재시도...`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(`[emailHelper] 인증 메일을 ${maxWaitMs / 1000}초 내에 찾지 못했습니다.`);
}

export interface ExistingVerificationToken {
  token: string;
  receivedAt: Date | null;
  /** JWT exp (없으면 null) — 만료돼도 /regist_data 화면 자체는 렌더링됨 (이메일 자동입력만 안 됨) */
  expiresAt: Date | null;
}

/** 메일함에 받은 회원가입 인증 메일 (제목·보낸 사람·본문·인증 링크) */
export interface ReceivedVerificationEmail {
  subject: string;
  fromName: string;
  fromAddress: string;
  toAddress: string;
  html: string;
  text: string;
  receivedAt: Date | null;
  /** 메일 언어 — html lang="en" 또는 영문 제목이면 en */
  lang: 'ko' | 'en';
  /** 메일 버튼의 회원가입 링크 (…/regist_data?token=<JWT>) */
  link: string;
  token: string;
  /** JWT payload 의 email (없으면 null) */
  tokenEmail: string | null;
  /** JWT exp (없으면 null) */
  expiresAt: Date | null;
}

// 메일 본문의 회원가입 링크 전체 (…/regist_data?token=<JWT>)
const REGIST_LINK_REGEX = /https?:\/\/[^\s"'<>]+?\/regist_data\?token=([\w.\-]+)/;

function decodeJwtPayload(token: string): { email?: string; exp?: number } {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  } catch {
    return {}; // JWT 형식이 아니면 이메일·만료 정보 없음
  }
}

/**
 * 새 메일 발송 없이, 메일함에 이미 받은 회원가입 인증 메일을 최신순으로 반환 (최대 max 개).
 * 메일 내용 검증·인증 링크 재사용에서 메일 발송(reCAPTCHA 차단)을 피하기 위해 사용.
 */
export async function findVerificationEmails(lookBackDays = 180, max = 10): Promise<ReceivedVerificationEmail[]> {
  const { host, port, secure, user, pass } = getImapConfig();
  const client = new ImapFlow({
    host, port, secure,
    auth: { user, pass },
    logger: false,
    tls: { rejectUnauthorized: false },
  });

  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  try {
    const since = new Date(Date.now() - lookBackDays * 24 * 60 * 60 * 1000);
    // 보낸 사람 주소가 바뀌어도(metademy@raoncorp.com → metademy@raon.com) 모두 'metademy' 포함
    const uids = ((await client.search({ since, from: 'metademy' }, { uid: true })) || []) as number[];
    const found: ReceivedVerificationEmail[] = [];
    for (const uid of [...uids].reverse().slice(0, 50)) {
      if (found.length >= max) break;
      const msg = await client.fetchOne(`${uid}`, { source: true }, { uid: true }).catch(() => null);
      const source = (msg as any)?.source as Buffer | undefined;
      if (!source) continue;

      const parsed = await simpleParser(source);
      const html = typeof parsed.html === 'string' ? parsed.html : '';
      const text = parsed.text ?? '';
      const match = (html + text).match(REGIST_LINK_REGEX);
      if (!match) continue;

      const subject = parsed.subject ?? '';
      const from = parsed.from?.value?.[0];
      const to = (Array.isArray(parsed.to) ? parsed.to[0] : parsed.to)?.value?.[0];
      const payload = decodeJwtPayload(match[1]);
      found.push({
        subject,
        fromName: from?.name ?? '',
        fromAddress: from?.address ?? '',
        toAddress: to?.address ?? '',
        html,
        text,
        receivedAt: parsed.date ?? null,
        lang: /\blang="en/i.test(html) || /verification link/i.test(subject) ? 'en' : 'ko',
        link: match[0],
        token: match[1],
        tokenEmail: payload.email ?? null,
        expiresAt: payload.exp ? new Date(payload.exp * 1000) : null,
      });
    }
    return found;
  } finally {
    lock.release();
    await client.logout();
  }
}

/**
 * 새 메일 발송 없이, 메일함에 이미 받은 가장 최근 회원가입 인증 메일의 토큰을 반환 (없으면 null).
 * 약관 모달처럼 토큰 유효성과 무관한 화면 검증에서 메일 발송(reCAPTCHA 차단)을 피하기 위해 사용.
 */
export async function findLatestVerificationToken(lookBackDays = 180): Promise<ExistingVerificationToken | null> {
  const [latest] = await findVerificationEmails(lookBackDays, 1);
  return latest ? { token: latest.token, receivedAt: latest.receivedAt, expiresAt: latest.expiresAt } : null;
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
