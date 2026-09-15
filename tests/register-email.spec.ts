import { test, expect, type Page } from '@playwright/test';
import { tcStep, captureEvidence } from './utils/evidence';
import { findVerificationEmails, type ReceivedVerificationEmail } from './helpers/emailHelper';

// 인증 메일 내용·회원가입 화면은 세션 없이 확인
test.use({ storageState: { cookies: [], origins: [] } });

const BASE = process.env.BASE_URL ?? '';

// ─────────────────────────────────────────────────────────────────────────────
// T421 Step 2~5 — 회원가입 인증 메일 내용 / 메일 버튼 / 가입 화면 placeholder / [취소] 버튼
//
// 새 인증 메일을 보내지 않음: Gmail(IMAP) 메일함에 이미 받은 인증 메일을 읽어서 검증
//   (메일 발송은 reCAPTCHA 로 막히고, 통과되면 실제 메일이 나가므로 사람이 1회 발송해 둔 메일을 재사용)
// 메일 본문은 받은 메일 HTML 을 브라우저에 그대로 띄워 문구·버튼을 확인하고 캡처 (결과서 기대 결과 이미지와 비교용)
// ⚠️ 비밀번호 입력·약관 동의·[회원가입] 제출은 하지 않음
// ─────────────────────────────────────────────────────────────────────────────

// 기대 결과 — XML T421 Step 2 표(제목·보낸 사람) + 기대 결과 이미지(본문 문구)
const EXPECTED = {
  ko: {
    label: '국문',
    subject: '[라온 메타데미] 이메일 인증 링크입니다.',
    fromAddress: 'metademy@raon.com',
    button: '계속해서 회원가입',
    body: [
      '라온 메타데미 이메일 인증 안내',
      '회원가입 진행 시 필요한 이메일 인증 링크를 보내드립니다.',
      '아래 버튼을 클릭해 회원가입을 계속해서 진행해 주세요.',
      '계속해서 회원가입',
      '회원가입을 본인이 진행하고 있는 것이 아닌 경우, 서비스 이용 문의를 통해 문의해 주세요.',
      '본 메일은 중요한 정보를 포함하고 있으므로, 메일 알림 수신에 동의하지 않으신 분에게도 발송하고 있습니다.',
      '본 메일은 발신 전용 메일로 회신되지 않습니다. 문의사항은 고객센터를 이용해주세요.',
      '라온메타(주) | 대표이사 : 이순형 | 사업자등록번호 : 702-86-03034',
      '대표전화 : 02-761-4540 (월~금 10:00 ~ 17:00 / 점심시간 12:00 ~ 13:00 주말 및 공휴일 휴무)',
      '이메일 : metademy@raoncorp.com',
      '주소 : 서울특별시 영등포구 여의대로 108, 타워2 47층(여의도동, 파크원)',
      '© RaonMeta. All rights reserved.',
    ],
  },
  en: {
    label: '영문',
    subject: '[RAON METADEMY] Email Verification Link',
    fromAddress: 'metademy@raon.com',
    button: 'Continue Sign-up',
    body: [
      'RAON Metademy Email Verification Guide',
      'This is the email verification link required to complete your membership registration.',
      'Please click the button below to continue the sign-up process.',
      'Continue Sign-up',
      'If you did not request this registration, please contact us through customer support page.',
      'This email contains important information and has been sent even to users who have not opted in for email notifications.',
      'This is a no-reply email. For inquiries, please contact our Customer Support Center.',
      '© RaonMeta. All rights reserved.',
    ],
  },
} as const;

type Lang = keyof typeof EXPECTED;

// 띄어쓰기·문장부호 차이는 무시하고 문구만 비교 (기대 결과가 이미지라 표기 차이가 흔함)
const normalize = (s: string) => s.replace(/[\s,.·|:()~\/\-]/g, '').toLowerCase();
const hideToken = (s: string) => s.replace(/token=[\w.\-]+/g, 'token=<JWT>');
const maskEmail = (s: string) => s.replace(/^(.{3})[^@]*/, '$1***');
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const mails: Partial<Record<Lang, ReceivedVerificationEmail>> = {};
let imapError = '';

test.beforeAll(async () => {
  test.setTimeout(90_000);
  try {
    const found = await findVerificationEmails();
    mails.ko = found.find(m => m.lang === 'ko');
    mails.en = found.find(m => m.lang === 'en');
    for (const m of [mails.ko, mails.en]) {
      if (m) console.log(`[T421] 메일함의 ${EXPECTED[m.lang].label} 인증 메일 사용 (새 메일 발송 없음) — 수신 ${m.receivedAt?.toISOString() ?? '?'}, 링크 만료 ${m.expiresAt?.toISOString() ?? '?'}`);
    }
  } catch (e) {
    imapError = (e as Error).message;
    console.warn(`[T421] IMAP 조회 실패: ${imapError}`);
  }
});

function requireMail(lang: Lang): ReceivedVerificationEmail {
  const mail = mails[lang];
  test.skip(!mail, imapError
    ? `⚠️ IMAP 조회 실패 — ${imapError}`
    : `⚠️ 메일함에 ${EXPECTED[lang].label} 회원가입 인증 메일 없음 — ${lang === 'en' ? '영문(English) 설정에서 ' : ''}인증 메일 1회 발송(수동) 후 실행`);
  return mail!;
}

// 받은 메일 HTML 을 메일 화면처럼 띄움
async function openEmail(page: Page, mail: ReceivedVerificationEmail) {
  await page.setViewportSize({ width: 760, height: 900 });
  await page.setContent(mail.html, { waitUntil: 'load' });
}

// 인증 링크로 회원가입 입력 화면 진입 → E-mail·비밀번호 입력 박스 반환
async function openSignupForm(page: Page, mail: ReceivedVerificationEmail) {
  await page.goto(mail.link);
  await page.waitForLoadState('load');
  const form = page.locator('.terms-box')   // 약관동의 박스도 .terms-box 라 비밀번호 입력이 있는 박스로 한정
    .filter({ hasText: 'E-mail' })
    .filter({ has: page.locator('input[type="password"]') });
  await expect(form, '[환경] 인증 링크로 회원가입 입력 화면에 진입하지 못함 (토큰 거부 가능성 — 새 인증 메일 필요)').toBeVisible({ timeout: 15_000 });
  return form;
}

async function verifySubjectAndSender(mail: ReceivedVerificationEmail, lang: Lang) {
  const expected = EXPECTED[lang];
  const subjectOk = mail.subject === expected.subject;
  console.log(`${subjectOk ? '✅' : '❌'} 제목: "${mail.subject}"${subjectOk ? '' : ` (기대: "${expected.subject}")`}`);
  expect.soft(mail.subject, `[스펙 불일치] ${expected.label} 인증 메일 제목 — 기대 "${expected.subject}" / 실제 "${mail.subject}"`).toBe(expected.subject);

  const fromOk = mail.fromAddress.toLowerCase() === expected.fromAddress;
  console.log(`${fromOk ? '✅' : '❌'} 보낸 사람: "${mail.fromName}" <${mail.fromAddress}>${fromOk ? '' : ` (기대: ${expected.fromAddress})`}`);
  expect.soft(mail.fromAddress.toLowerCase(), `[스펙 불일치] ${expected.label} 인증 메일 보낸 사람 — 기대 ${expected.fromAddress} / 실제 ${mail.fromAddress}`).toBe(expected.fromAddress);
}

async function verifyBody(page: Page, mail: ReceivedVerificationEmail, lang: Lang) {
  const expected = EXPECTED[lang];
  await openEmail(page, mail);

  await test.step('[검증] 로고·버튼 노출', async () => {
    const logos = await page.locator('img').evaluateAll(imgs => imgs.map(img => ({ alt: (img as HTMLImageElement).alt, w: (img as HTMLImageElement).naturalWidth })));
    expect(logos.length, '[앱오류] 메일 본문에 로고 이미지가 없음').toBeGreaterThan(0);
    for (const logo of logos) expect(logo.w, `[앱오류] 메일 로고 이미지 로드 실패 (alt "${logo.alt}")`).toBeGreaterThan(0);
    await expect(page.getByRole('link', { name: expected.button, exact: true }), `[앱오류] 메일에 [${expected.button}] 버튼이 없음`).toBeVisible();
    console.log(`✅ 로고 이미지 ${logos.length}개 로드, [${expected.button}] 버튼 노출`);
  });

  await test.step('[검증] 본문 문구 (기대 결과 이미지 기준)', async () => {
    const lines = (await page.locator('body').innerText()).split('\n').map(s => s.trim()).filter(Boolean);
    const actual = normalize(lines.join(''));
    const missing: string[] = [];
    for (const line of expected.body) {
      const ok = actual.includes(normalize(line));
      if (!ok) missing.push(line);
      console.log(`${ok ? '✅' : '❌'} ${line}`);
    }
    const expectedAll = normalize(expected.body.join(''));
    const extra = lines.filter(l => !expectedAll.includes(normalize(l)));
    if (extra.length) console.log(`ℹ️ 기대 결과에 없는 실제 문구: ${extra.map(l => `"${l}"`).join(', ')}`);
    await captureEvidence(page.locator('body'), `${expected.label} 인증 메일 본문 (받은 메일)`);
    expect.soft(missing, `[스펙 불일치] ${expected.label} 인증 메일 본문에 기대 문구 ${missing.length}개 없음 (실제 문구와 비교: ${extra.join(' / ')})`).toEqual([]);
  });
}

test.describe('T421 - 회원가입 인증 메일 내용 확인 (Step 2)', () => {
  test('(국문) 인증 메일 제목 · 보낸 사람', { annotation: tcStep(2) }, async () => {
    await verifySubjectAndSender(requireMail('ko'), 'ko');
  });

  test('(국문) 인증 메일 본문 — 로고 · 안내 문구 · [계속해서 회원가입] 버튼 · 하단 안내', { annotation: tcStep(2) }, async ({ page }) => {
    await verifyBody(page, requireMail('ko'), 'ko');
  });

  test('(영문) 인증 메일 제목 · 보낸 사람 · 본문', { annotation: tcStep(2) }, async ({ page }) => {
    const mail = requireMail('en');
    await verifySubjectAndSender(mail, 'en');
    await verifyBody(page, mail, 'en');
  });
});

test.describe('T421 - 인증 메일 버튼 → 회원가입 페이지 (Step 3)', () => {
  for (const lang of ['ko', 'en'] as const) {
    const expected = EXPECTED[lang];
    test(`(${expected.label}) 메일 [${expected.button}] 클릭 → 새 창 회원가입 페이지 · URL 형식 확인`, { annotation: tcStep(3) }, async ({ page, context }) => {
      const mail = requireMail(lang);
      await openEmail(page, mail);
      const button = page.getByRole('link', { name: expected.button, exact: true });
      const registLink = new RegExp(`^${escapeRegExp(new URL(BASE).origin)}/regist_data\\?token=[\\w-]+\\.[\\w-]+\\.[\\w-]+$`);

      await test.step('[검증] 버튼 링크 형식 — <QA 주소>/regist_data?token=<JWT>', async () => {
        await expect(button, `[앱오류] 메일에 [${expected.button}] 버튼이 없음`).toBeVisible();
        const href = (await button.getAttribute('href')) ?? '';
        expect(href, `[앱오류] 버튼 링크가 ${new URL(BASE).origin}/regist_data?token=<JWT> 형식이 아님: ${hideToken(href)}`).toMatch(registLink);
        console.log(`✅ 버튼 링크 형식: ${hideToken(href)} (token 은 JWT 3단 구조)`);
        const recipient = (mail.tokenEmail ?? '').toLowerCase();
        expect(recipient, '[앱오류] 인증 링크 토큰의 이메일이 메일을 받은 계정과 다름').toBe(mail.toAddress.toLowerCase());
        console.log(`✅ 토큰의 이메일 = 메일 받은 계정 (${maskEmail(recipient)})`);
      });

      const signup = await test.step('[동작] 버튼 클릭 → 새 창', async () => {
        const target = await button.getAttribute('target');
        // 메일 HTML 링크에는 target 이 없고, 새 창 여부는 메일 클라이언트가 결정 (Gmail 웹은 메일 링크를 새 탭으로 엶) → 동일하게 재현
        console.log(`ℹ️ 메일 링크 target 속성: ${target ?? '없음'} → 메일 클라이언트처럼 새 창(target="_blank")으로 열어 확인`);
        await button.evaluate(a => a.setAttribute('target', '_blank'));
        const [popup] = await Promise.all([context.waitForEvent('page'), button.click()]);
        await popup.waitForLoadState('load');
        return popup;
      });

      await test.step('[검증] 새 창이 회원가입 페이지', async () => {
        expect(signup.url(), `[앱오류] 새 창 주소가 인증 링크와 다름: ${hideToken(signup.url())}`).toMatch(registLink);
        const title = signup.locator('h1, h2, h3, [class*="title"]').filter({ hasText: /^\s*(회원가입|Sign up)\s*$/i }).first();
        await expect(title, `[앱오류] 새 창에 [${lang === 'ko' ? '회원가입' : 'Sign up'}] 페이지 제목이 보이지 않음`).toBeVisible({ timeout: 15_000 });
        console.log(`✅ 새 창 열림 → ${hideToken(signup.url())}, 페이지 제목 "${(await title.innerText()).trim()}"`);
        // 캡처 전 E-mail 자동 입력이 끝날 때까지 대기 (링크가 만료됐으면 비어 있는 채로 캡처)
        await expect(signup.locator('.terms-box input:not([type="password"]):not([type="checkbox"])').first())
          .not.toHaveValue('', { timeout: 5000 }).catch(() => console.log('ℹ️ E-mail 자동 입력 없음 (링크 만료 가능) — 페이지 이동만 확인'));
        await captureEvidence(signup, `${expected.label} 메일 버튼 클릭 → 새 창 회원가입 페이지`);
      });
    });
  }
});

test.describe('T421 - 회원가입 화면 입력 항목 (Step 4)', () => {
  test('E-mail 항목 — 인증 메일을 받은(가입할) 계정 이메일 표시', { annotation: tcStep(4) }, async ({ page }) => {
    const mail = requireMail('ko');
    const expired = !!mail.expiresAt && mail.expiresAt.getTime() < Date.now();
    test.skip(expired, `⚠️ 인증 링크 만료(${mail.expiresAt?.toISOString()}) — 만료된 링크는 E-mail 이 채워지지 않음. 인증 메일 1회 발송(수동) 후 실행`);
    const form = await openSignupForm(page, mail);
    const expectedEmail = mail.tokenEmail ?? mail.toAddress;

    await expect(form, '[앱오류] "E-mail" 항목명이 보이지 않음').toContainText('E-mail');
    const email = form.locator('input:not([type="password"]):not([type="checkbox"])').first();
    await expect(email, '[앱오류] E-mail 입력 칸이 보이지 않음').toBeVisible();
    await expect(email, `[앱오류] E-mail 항목에 인증한 계정 이메일(${maskEmail(expectedEmail)})이 표시되지 않음`)
      .toHaveValue(new RegExp(`^${escapeRegExp(expectedEmail)}$`, 'i'));
    const disabled = await email.isDisabled();
    console.log(`✅ E-mail 항목: "${maskEmail(await email.inputValue())}" — 인증 메일 받은 계정과 동일, 수정 ${disabled ? '불가(비활성)' : '가능'}`);
    await captureEvidence(form, 'E-mail · 비밀번호 입력 항목');
  });

  test('비밀번호 · 비밀번호 재확인 placeholder', { annotation: tcStep(4) }, async ({ page }) => {
    const form = await openSignupForm(page, requireMail('ko'));
    const passwords = form.locator('input[type="password"]');
    await expect(passwords, '[UI/셀렉터] 비밀번호 입력 칸이 2개(비밀번호/재확인)가 아님').toHaveCount(2);

    const fields = [
      { label: '비밀번호', input: passwords.nth(0), placeholder: '8자 이상 문자,숫자, 기호 사용 가능' },
      { label: '비밀번호 재확인', input: passwords.nth(1), placeholder: '비밀번호를 다시 한번 입력해 주세요.' },
    ];
    for (const f of fields) {
      await expect(form, `[앱오류] "${f.label}" 항목명이 보이지 않음`).toContainText(f.label);
      const actual = (await f.input.getAttribute('placeholder')) ?? '';
      const ok = actual.replace(/\s+/g, '') === f.placeholder.replace(/\s+/g, '');
      const note = actual === f.placeholder ? '' : ok ? ` (기대 결과 표기 "${f.placeholder}" 와 띄어쓰기만 다름)` : ` (기대: "${f.placeholder}")`;
      console.log(`${ok ? '✅' : '❌'} ${f.label} placeholder: "${actual}"${note}`);
      expect.soft(ok, `[스펙 불일치] ${f.label} placeholder — 기대 "${f.placeholder}" / 실제 "${actual}"`).toBe(true);
    }
    await captureEvidence(form, '비밀번호 · 비밀번호 재확인 placeholder');
  });
});

test.describe('T421 - 회원가입 화면 [취소] 버튼 (Step 5)', () => {
  test('[취소] → 경고 모달 노출 → 모달 [취소] 닫힘 → 모달 [확인] 메인 페이지 이동', { annotation: tcStep(5) }, async ({ page }) => {
    await openSignupForm(page, requireMail('ko'));
    // 화면 하단 [취소] (경고 모달 #CommonAlert 안의 [취소] 와 구분)
    const cancelBtn = page.locator('button:not(#CommonAlert button)').filter({ hasText: /^\s*취소\s*$/ });
    const dialog = page.locator('#CommonAlert .modal-dialog');

    await test.step('[동작/검증] 1. [취소] 클릭 → 경고 모달 노출', async () => {
      await expect(cancelBtn, '[UI/셀렉터] 회원가입 화면 [취소] 버튼을 찾을 수 없음').toHaveCount(1);
      await cancelBtn.click();
      await expect(dialog, '[앱오류] [취소] 클릭 후 경고 모달이 뜨지 않음').toBeVisible({ timeout: 5000 });
      await expect(dialog.locator('.modal-body'), '[앱오류] 경고 모달에 취소 안내 문구가 없음').toContainText('취소하시겠습니까');
      console.log(`✅ 경고 모달 노출 — "${(await dialog.locator('.modal-body').innerText()).replace(/\s+/g, ' ').trim()}"`);
      await captureEvidence(dialog, '1. [취소] 클릭 → 경고 모달');
    });

    await test.step('[동작/검증] 2. 모달 [취소] → 모달 닫힘', async () => {
      await dialog.getByRole('button', { name: '취소', exact: true }).click();
      await expect(dialog, '[앱오류] 모달 [취소] 클릭 후 경고 모달이 닫히지 않음').toBeHidden({ timeout: 5000 });
      await expect(page, '[앱오류] 모달 [취소] 후 회원가입 화면을 벗어남').toHaveURL(/\/regist_data/);
      console.log('✅ 모달 [취소] → 모달 닫힘, 회원가입 화면 유지');
    });

    await test.step('[동작/검증] 3. 다시 [취소] → 모달 [확인] → 메인 페이지 이동', async () => {
      await cancelBtn.click();
      await expect(dialog, '[앱오류] 두 번째 [취소] 클릭 후 경고 모달이 뜨지 않음').toBeVisible({ timeout: 5000 });
      await dialog.getByRole('button', { name: '확인', exact: true }).click();
      await expect.poll(() => new URL(page.url()).pathname, {
        message: '[앱오류] 모달 [확인] 후 메인 페이지로 이동하지 않음', timeout: 10_000,
      }).toMatch(/^\/(main)?\/?$/);
      console.log(`✅ 모달 [확인] → 메인 페이지 이동: ${hideToken(page.url())}`);
      await captureEvidence(page, '3. 모달 [확인] → 메인 페이지');
    });
  });
});
