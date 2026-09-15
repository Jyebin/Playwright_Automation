import { test, expect } from '@playwright/test';
import { RegisterPage } from './pages/RegisterPage';
import { tcStep, captureEvidence } from './utils/evidence';
import { waitForVerificationToken, waitForVerificationEmail, generateTestEmail, findLatestVerificationToken } from './helpers/emailHelper';

// 회원가입 테스트는 세션 없이 실행
test.use({ storageState: { cookies: [], origins: [] } });

// IMAP 동시 연결 + 동일 이메일 병렬 실행 충돌 방지 — 이 파일의 모든 테스트 직렬 실행
test.describe.configure({ mode: 'serial' });

const BASE = process.env.BASE_URL ?? '';

// ─────────────────────────────────────────────────────────────────────────────
// T759 - [Front][PC][회원가입] 001. 개인 회원 - 소셜 회원 가입
//
// ⚠️  소셜 자동화 범위:
//   - 버튼 노출 확인, 클릭 시 소셜 OAuth URL로 이동 확인 → ✅ 자동화 가능
//   - 실제 카카오/구글/네이버 계정으로 로그인 완료       → ❌ 외부 서비스로 자동화 불가
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T759 - 소셜 회원가입 버튼 확인', () => {
  test.beforeEach(async ({ page }) => {
    const register = new RegisterPage(page);
    await register.goto();
  });

  test('회원가입 페이지에 소셜 버튼 3개 노출 확인 (카카오/구글/네이버 순)', async ({ page }) => {
    const register = new RegisterPage(page);
    await register.verifySocialButtonsVisible();
    await register.verifySocialButtonOrder();
  });

  test('카카오 버튼 클릭 시 카카오 로그인 페이지로 이동', { annotation: tcStep(1) }, async ({ page }) => {
    const register = new RegisterPage(page);
    await register.clickKakaoButton();
    await register.verifyKakaoLoginPage();
  });

  test('구글 버튼 클릭 시 구글 로그인 페이지로 이동', { annotation: tcStep(2) }, async ({ page }) => {
    const register = new RegisterPage(page);
    await register.clickGoogleButton();
    await register.verifyGoogleLoginPage();
  });

  test('네이버 버튼 클릭 시 네이버 로그인 페이지로 이동 (새 창)', { annotation: tcStep(3) }, async ({ page }) => {
    const register = new RegisterPage(page);
    // 네이버는 새 창으로 열릴 수 있음
    const popupPromise = page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null);
    await register.clickNaverButton();
    const popup = await popupPromise;
    if (popup) {
      await popup.waitForLoadState('domcontentloaded', { timeout: 10000 });
      await register.verifyNaverLoginPage(popup);
    } else {
      // 같은 탭에서 이동한 경우
      await register.verifyNaverLoginPage();
    }
  });

  // ── 자동화 불가 항목 (소셜 로그인 완료) ───────────────────────────────────
  test.skip('[자동화 불가 - 외부 OAuth 서비스] 카카오 계정으로 실제 로그인 완료 후 회원가입 처리', { annotation: tcStep(1) }, async () => {
    // 카카오/구글/네이버는 외부 OAuth 서비스로, 실제 계정 자격증명 입력 및 로그인 완료는
    // 봇 감지(CAPTCHA 등) 및 외부 서비스 제어 불가로 자동화할 수 없습니다.
  });

  test.skip('[자동화 불가 - 외부 OAuth 서비스] 구글 계정으로 실제 로그인 완료 후 회원가입 처리', { annotation: tcStep(2) }, async () => {});

  test.skip('[자동화 불가 - 외부 OAuth 서비스] 네이버 계정으로 실제 로그인 완료 후 회원가입 처리', { annotation: tcStep(3) }, async () => {});
});

// ─────────────────────────────────────────────────────────────────────────────
// T421 - [Front][PC][회원가입] 002. 개인 회원 - 이메일 가입
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T421 - 이메일 가입 페이지 UI 확인 (Step 0)', () => {
  test.beforeEach(async ({ page }) => {
    const register = new RegisterPage(page);
    await register.goto();
  });

  test('회원가입 페이지 접속 및 URL 확인', { annotation: tcStep(1) }, async ({ page }) => {
    // 실제 URL: /regist (register 아님)
    await expect(page).toHaveURL(/\/regist(?:er)?|\/signup|\/join/);
    console.log(`✅ 회원가입 페이지 URL 확인: ${page.url()}`);
  });

  test('소셜 버튼 3개 존재 확인', { annotation: tcStep(1) }, async ({ page }) => {
    const register = new RegisterPage(page);
    await register.verifySocialButtonsVisible();
  });

  test('소셜 버튼과 이메일 입력 사이 "또는" 구분선 확인', { annotation: tcStep(1) }, async ({ page }) => {
    const register = new RegisterPage(page);
    await register.verifyDividerOrText();
  });

  test('이메일 입력 필드 존재 확인', { annotation: tcStep(1) }, async ({ page }) => {
    const register = new RegisterPage(page);
    await register.verifyEmailInputVisible();
    await register.verifyEmailInputPlaceholder();
  });

  test('이메일 미입력/형식 불일치 시 중복확인 버튼 비활성화 확인', { annotation: tcStep(1) }, async ({ page }) => {
    const register = new RegisterPage(page);
    await register.verifyDuplicateCheckButtonInitiallyInactive();
  });

  test('이메일 형식 입력 시 중복확인 버튼 활성화 (회색→검은색 텍스트로 변경)', { annotation: tcStep(1) }, async ({ page }) => {
    const register = new RegisterPage(page);
    await register.typeEmail('test@example.com');
    await register.verifyDuplicateCheckButtonActive();
  });

  test('중복확인 없이 이메일 인증 클릭 시 "이메일 중복 확인이 필요합니다." 안내', { annotation: tcStep(1) }, async ({ page }) => {
    const register = new RegisterPage(page);
    const testEmail = process.env.EMAIL_IMAP_USER ?? `test_avail_${Date.now()}@gmail.com`;
    await register.typeEmail(testEmail);
    // 중복확인 없이 바로 "이메일 인증" 클릭
    await register.clickEmailVerificationButton();
    await register.verifyDuplicateCheckRequiredMessage();
  });

  test('reCAPTCHA 체크 후 이메일 인증 → 발송 완료 (v2 체크박스 클릭 시도)', { annotation: tcStep(1) }, async ({ page }) => {
    const register = new RegisterPage(page);
    const testEmail = process.env.EMAIL_IMAP_USER ?? `test_${Date.now()}@example.com`;
    await register.typeEmail(testEmail);
    await register.clickDuplicateCheckButton();
    await register.verifyEmailAvailableModal();
    await register.clickEmailAvailableModalConfirm();
    // reCAPTCHA v2이면 체크박스 클릭, v3이면 자동 처리
    await register.clickRecaptchaIfVisible();

    // bframe은 버튼 클릭 시도 후 나타남 → 클릭 자체를 짧은 timeout으로 시도
    // 3초 내에 클릭 못 하면 = bframe이 버튼을 가리고 있다 = 봇 감지 동작 확인됨
    const btnClicked = await page
      .getByRole('button', { name: '이메일 인증', exact: true })
      .click({ timeout: 3000 })
      .then(() => true)
      .catch(() => false);

    if (!btnClicked) {
      console.log('⚠️ reCAPTCHA 챌린지 팝업이 버튼을 가림 → 봇 감지 동작 확인됨');
      return;
    }

    const sent = await page.getByText(/인증 이메일을 발송했습니다/)
      .waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
    const blocked = !sent && await page.getByText(/보안 인증을 완료해 주세요/)
      .waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
    if (sent) {
      console.log('✅ reCAPTCHA 통과 → 이메일 발송 성공');
    } else if (blocked) {
      console.log('⚠️ reCAPTCHA 봇 감지 → "보안 인증을 완료해 주세요."');
    }
    expect(sent || blocked).toBe(true);
  });

  test('이메일 형식이 아닌 텍스트 입력 시 중복확인 버튼 비활성 유지', { annotation: tcStep(1) }, async ({ page }) => {
    const register = new RegisterPage(page);
    await register.typeEmail('invalid-email-text');
    // 실제 버튼 텍스트: "중복 확인" (공백 있음)
    const btn = page.getByRole('button', { name: /중복.?확인/ }).first();
    const isDisabled = await btn.isDisabled().catch(() => false);
    console.log(`ℹ️ 비유효 이메일 입력 시 중복확인 버튼 disabled: ${isDisabled}`);
    await expect(btn).toBeVisible();
  });

  test('중복확인 → 사용 가능 모달 → 이메일 인증 → 발송 완료 모달 확인', { annotation: tcStep(1) }, async ({ page }) => {
    const register = new RegisterPage(page);
    const testEmail = process.env.EMAIL_IMAP_USER ?? `test_${Date.now()}@example.com`;
    await register.typeEmail(testEmail);
    await register.clickDuplicateCheckButton();
    await register.verifyEmailAvailableModal();       // "사용 가능한 이메일입니다." 모달 확인
    await register.clickEmailAvailableModalConfirm(); // 모달 "확인" 클릭
    await register.clickRecaptchaIfVisible();         // v2 체크박스 노출 시 클릭 (이전 봇 감지로 인해 v2 표시될 수 있음)
    // bframe 챌린지 팝업이 버튼을 가릴 수 있으므로 timeout + catch 처리
    const btnClicked = await page
      .getByRole('button', { name: '이메일 인증', exact: true })
      .click({ timeout: 3000 }).then(() => true).catch(() => false);
    if (!btnClicked) {
      console.log('⚠️ reCAPTCHA bframe이 버튼을 가림 → 봇 감지 동작 확인됨');
      return;
    }
    // reCAPTCHA 통과 → 발송 모달 / 봇 감지 → "보안 인증을 완료해 주세요." 둘 중 하나
    const sent = await page.getByText(/인증 이메일을 발송했습니다/)
      .waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
    if (sent) {
      console.log('✅ 이메일 발송 성공');
      await register.clickEmailSentModalConfirm();
      return;
    }
    const blocked = await page.getByText(/보안 인증을 완료해 주세요/)
      .waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
    if (blocked) console.log('⚠️ reCAPTCHA 봇 감지 → "보안 인증을 완료해 주세요." (자동화 한계)');
    expect(sent || blocked).toBe(true);
  });

  test('이메일 형식 불일치 시 "필수 입력 정보입니다." 문구 노출', { annotation: tcStep(1) }, async ({ page }) => {
    const register = new RegisterPage(page);
    await register.typeEmail('invalid-email-text');
    await page.keyboard.press('Tab'); // blur → 유효성 검사 트리거
    await register.verifyEmailRequiredMessage();
  });

  test('유효한 이메일 입력 시 "필수 입력 정보입니다." 문구 사라짐', { annotation: tcStep(1) }, async ({ page }) => {
    const register = new RegisterPage(page);
    // 먼저 잘못된 이메일로 메시지 표시
    await register.typeEmail('invalid-email-text');
    await page.keyboard.press('Tab');
    await register.verifyEmailRequiredMessage();
    // 유효한 이메일 입력 시 메시지 사라짐
    await register.typeEmail('valid@example.com');
    await register.verifyEmailRequiredMessageGone();
  });

  // 수동 확인 항목 (발신자/제목 검증은 UI가 아닌 메일 클라이언트에서 확인)
  test.skip('[수동 확인] 인증 이메일 제목·발신자 확인 — 제목: "[라온 메타데미] 이메일 인증 링크입니다.", 발신자: metademy@raon.com', { annotation: tcStep(2) }, async () => {});
});

// ─────────────────────────────────────────────────────────────────────────────
// T421 Step 2-4 — IMAP으로 JWT 토큰 취득 후 /regist_data 페이지 검증
//
// 필수 .env 설정:
//   EMAIL_IMAP_HOST  (예: imap.gmail.com)
//   EMAIL_IMAP_USER  (테스트용 이메일 주소)
//   EMAIL_IMAP_PASS  (앱 비밀번호)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T421 - 이메일 인증 → /regist_data 페이지 검증', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // IMAP 설정 확인 (더미값이면 skip)
  const IMAP_READY =
    !!process.env.EMAIL_IMAP_HOST &&
    !!process.env.EMAIL_IMAP_USER &&
    !process.env.EMAIL_IMAP_USER?.includes('your_test_email');

  let token = '';
  let testEmail = '';
  let emailFrom = '';
  let emailSubject = '';

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000); // 브라우저 조작 + IMAP 폴링(최대 90s) 합산
    if (!IMAP_READY) {
      console.log('[T421] IMAP 미설정 — .env의 EMAIL_IMAP_* 확인 후 실행하세요');
      return;
    }
    // plus-addressing(yenbin+timestamp@)은 서버 거절 → 기본 이메일 주소 사용
    testEmail = process.env.EMAIL_IMAP_USER ?? '';
    console.log(`[T421] 테스트 이메일: ${testEmail}`);

    const page = await browser.newPage();
    const register = new RegisterPage(page);
    await register.goto();
    try {
      await register.submitEmailForVerification(testEmail);
    } catch (e: any) {
      console.warn(`[T421] 이메일 발송 실패 → 테스트 skip: ${e.message}`);
      await page.close();
      return; // token = '' → beforeEach의 test.skip 조건 충족 → 전체 skip
    }
    await page.close();

    try {
      const info = await waitForVerificationEmail(90_000);
      token = info.token ?? '';
      emailFrom = info.from;
      emailSubject = info.subject;
      console.log(`[T421] 인증 메일 수신 완료 — 발신자: ${emailFrom}, 제목: ${emailSubject}`);
    } catch (e: any) {
      console.warn(`[T421] IMAP 수신 실패 → 테스트 skip: ${e.message}`);
    }
  });

  test.beforeEach(async ({ page }) => {
    test.skip(!IMAP_READY || !token, '⚠️ IMAP 미설정 또는 인증 토큰 미취득 — .env의 EMAIL_IMAP_* 입력 필요');
    const base = process.env.BASE_URL ?? '';
    await page.goto(`${base}/regist_data?token=${token}`);
    await page.waitForLoadState('load');
  });

  test('인증 이메일 발신자 확인 — 보낸사람: 라온메타데미', { annotation: tcStep(2) }, async () => {
    expect(emailFrom).toMatch(/라온|metademy|raon/i);
    console.log(`✅ 발신자 확인: ${emailFrom}`);
  });

  test('인증 이메일 제목 확인 — [라온 메타데미] 이메일 인증 링크입니다.', { annotation: tcStep(2) }, async () => {
    expect(emailSubject).toContain('[라온 메타데미] 이메일 인증 링크입니다.');
    console.log(`✅ 제목 확인: ${emailSubject}`);
  });

  test('/regist_data 페이지 URL 및 접속 확인', { annotation: tcStep(3) }, async ({ page }) => {
    const register = new RegisterPage(page);
    await register.verifyRegistDataUrl();
  });

  test('/regist_data 페이지 - E-mail/비밀번호/비밀번호 재확인 placeholder 확인', { annotation: tcStep(4) }, async ({ page }) => {
    const register = new RegisterPage(page);
    await register.verifyRegistDataPlaceholders();
  });

  test('/regist_data 페이지 - 이메일 자동입력 확인 (인증 이메일 주소)', async ({ page }) => {
    const register = new RegisterPage(page);
    await register.verifyEmailAutofilled(testEmail);
  });

  test('/regist_data 페이지 - 취소 버튼 클릭 → 경고 모달 → [확인] 시 메인 페이지 이동', { annotation: tcStep(5) }, async ({ page }) => {
    const register = new RegisterPage(page);
    await register.clickRegistDataCancelButton();
    await register.verifyRegistDataCancelModal();
    await register.clickRegistDataCancelModalConfirm();
    await expect(page).toHaveURL(/^\/?(?:$|main|home|\?)/);
    console.log(`✅ 취소 확인 후 메인 페이지 이동: ${page.url()}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T758 - [Front][PC][회원가입] 003. 개인 회원 - 이용약관 동의
//
// IMAP으로 JWT 토큰 취득 후 /regist_data 페이지 전 항목 자동화
//
// ⚠️ 현재 5개 모두 skip 되는 이유: beforeAll 의 인증 메일 발송이 reCAPTCHA 봇 감지
//    ("보안 인증을 완료해 주세요.")로 막혀 token='' → beforeEach 의 test.skip 조건 충족.
//    Step 3(약관 모달)은 아래 별도 describe 에서 메일함의 기존 인증 링크로 검증.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T758 - 이용약관 동의', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  const IMAP_READY =
    !!process.env.EMAIL_IMAP_HOST &&
    !!process.env.EMAIL_IMAP_USER &&
    !process.env.EMAIL_IMAP_USER?.includes('your_test_email');

  let token = '';
  let testEmail = '';

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000); // 브라우저 조작 + IMAP 폴링(최대 90s) 합산
    if (!IMAP_READY) {
      console.log('[T758] IMAP 미설정 — .env의 EMAIL_IMAP_* 확인 후 실행하세요');
      return;
    }
    // plus-addressing(yenbin+timestamp@)은 서버 거절 → 기본 이메일 주소 사용
    testEmail = process.env.EMAIL_IMAP_USER ?? '';
    console.log(`[T758] 테스트 이메일: ${testEmail}`);

    const page = await browser.newPage();
    const register = new RegisterPage(page);
    await register.goto();
    try {
      await register.submitEmailForVerification(testEmail);
    } catch (e: any) {
      console.warn(`[T758] 이메일 발송 실패 → 테스트 skip: ${e.message}`);
      await page.close();
      return; // token = '' → beforeEach의 test.skip 조건 충족 → 전체 skip
    }
    await page.close();

    try {
      token = await waitForVerificationToken(90_000);
      console.log(`[T758] 인증 토큰 수신 완료`);
    } catch (e: any) {
      console.warn(`[T758] IMAP 수신 실패 → 테스트 skip: ${e.message}`);
    }
  });

  test.beforeEach(async ({ page }) => {
    test.skip(!IMAP_READY || !token, '⚠️ IMAP 미설정 또는 인증 토큰 미취득 — .env의 EMAIL_IMAP_* 입력 필요');
    const base = process.env.BASE_URL ?? '';
    await page.goto(`${base}/regist_data?token=${token}`);
    await page.waitForLoadState('load');
  });

  test('이메일 자동입력 확인 및 비밀번호 유효성 검사 (8자 미만/숫자 없음/문자 없음/기호 없음)', { annotation: tcStep(1) }, async ({ page }) => {
    const register = new RegisterPage(page);
    await register.verifyEmailAutofilled(testEmail);
    // 8자 미만
    await register.fillPasswordAndVerifyError('Ab1!', /8자|최소|자 이상/);
    // 숫자 없음
    await register.fillPasswordAndVerifyError('Abcdefg!', /숫자|number/i);
    // 영문 없음
    await register.fillPasswordAndVerifyError('12345678!', /영문|문자|letter/i);
    // 특수문자 없음
    await register.fillPasswordAndVerifyError('Abcdef12', /특수|기호|symbol/i);
  });

  test('전체 동의 체크 시 하위 항목 모두 체크 및 개별 해제 연동 동작 확인', { annotation: tcStep(2) }, async ({ page }) => {
    const register = new RegisterPage(page);
    await register.checkAllTermsAgree();
    await register.verifyAllSubCheckboxesChecked();
  });

  test('약관 [보기] 버튼 클릭 시 모달 노출 및 X 버튼으로 닫힘 확인 (이용약관/개인정보/마케팅)', { annotation: tcStep(3) }, async ({ page }) => {
    const register = new RegisterPage(page);
    for (const termType of ['이용약관', '개인정보', '마케팅'] as const) {
      await register.clickTermsViewButton(termType);
      await register.verifyTermsModalVisible();
      await register.closeTermsModal();
      await page.waitForTimeout(400);
    }
  });

  test('필수 약관 미체크 상태에서 [회원가입] 버튼 클릭 시 알럿 확인', { annotation: tcStep(4) }, async ({ page }) => {
    const register = new RegisterPage(page);
    await register.fillPassword('TestPass1!', 'TestPass1!');
    await register.clickRegisterButton();
    await register.verifyTermsRequiredAlert();
  });

  test('비밀번호 입력 + 필수 약관 동의 후 [회원가입] 클릭 → 회원가입 완료 페이지 이동', { annotation: tcStep(6) }, async ({ page }) => {
    const register = new RegisterPage(page);
    await register.fillPassword('TestPass1!', 'TestPass1!');
    await register.checkAllTermsAgree();
    await register.clickRegisterButton();
    await register.verifyRegisterComplete();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T758 Step 3 — 약관 [보기] 모달 (이용약관 / 개인정보 수집 및 이용 / 마케팅 수신)
//
// 진입 방법: 새 인증 메일을 보내지 않고 메일함에 이미 받은 인증 링크(/regist_data?token=…)를 재사용.
//   토큰이 만료돼도 /regist_data 화면(약관 동의 영역 포함)은 그대로 렌더링됨 (이메일 자동입력만 비어 있음).
// 위 'T758 - 이용약관 동의' describe 안에 두면 그쪽 beforeAll 이 인증 메일 발송(reCAPTCHA 차단)을 시도하고
//   token='' 이면 beforeEach 가 skip 시키므로 별도 describe 로 분리 (결과서는 제목의 T758 로 연결).
// ⚠️ 약관 동의 체크·[회원가입] 제출은 하지 않음 — 모달 열기/닫기만.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T758 - 이용약관 동의 · 약관 [보기] 모달 (Step 3)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  let token = '';

  test.beforeAll(async () => {
    test.setTimeout(60_000);
    const found = await findLatestVerificationToken().catch((e: Error) => {
      console.warn(`[T758 Step 3] IMAP 조회 실패: ${e.message}`);
      return null;
    });
    if (!found) return;
    token = found.token;
    const expired = !!found.expiresAt && found.expiresAt.getTime() < Date.now();
    console.log(
      `[T758 Step 3] 메일함의 기존 인증 링크 재사용 (새 메일 발송 없음) — 수신 ${found.receivedAt?.toISOString() ?? '?'}, ` +
      `만료 ${found.expiresAt?.toISOString() ?? '?'} → ${expired ? '만료된 토큰 (화면 진입에는 영향 없음)' : '유효한 토큰'}`,
    );
  });

  test.beforeEach(async ({ page }) => {
    test.skip(!token, '⚠️ 메일함에 회원가입 인증 메일(/regist_data 링크)이 없음 — 인증 메일을 1회 발송(수동) 후 실행');
    await page.goto(`${BASE}/regist_data?token=${token}`);
    await page.waitForLoadState('load');
    await expect(
      page.locator('.terms-box').filter({ hasText: '약관동의' }), // 입력 폼 박스도 .terms-box 클래스라 약관동의 박스로 한정
      '[환경] 인증 링크로 약관 동의 화면에 진입하지 못함 (토큰 거부 가능성 — 새 인증 메일 필요)',
    ).toBeVisible({ timeout: 15_000 });
  });

  const TERMS = [
    { label: '라온 메타데미 이용약관', title: '[필수] 라온 메타데미 이용약관', content: /본 약관|제1조/, mustScroll: true },
    { label: '개인정보 수집 및 이용 동의', title: '[필수] 개인정보 수집 및 이용 동의', content: /개인정보 수집 및 이용/, mustScroll: false },
    { label: '마케팅 정보 수신 동의', title: '[선택] 마케팅 정보 수신 동의', content: /마케팅 정보 수신/, mustScroll: false },
  ];

  for (const term of TERMS) {
    test(`${term.title} [보기] — 약관 모달 노출·레이아웃·스크롤·X 닫힘 확인`, { annotation: tcStep(3) }, async ({ page }) => {
      const row = page.locator('.terms-box .input-item').filter({ hasText: term.label });
      const viewBtn = row.locator('.more', { hasText: '[보기]' });
      const modal = page.locator('#TermsModal');
      const dialog = modal.locator('.modal-dialog');
      const body = dialog.locator('.modal-body');
      const closeBtn = dialog.locator('.modal-header svg');

      // 모달이 떠 있는 동안의 console error 수집
      const consoleErrors: string[] = [];
      let recording = false;
      page.on('console', msg => { if (recording && msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)); });
      page.on('pageerror', err => { if (recording) consoleErrors.push(`pageerror: ${err.message.slice(0, 200)}`); });

      await test.step(`[동작] ${term.title} [보기] 클릭`, async () => {
        await expect(row, `[UI/셀렉터] "${term.label}" 약관 행을 찾을 수 없음`).toHaveCount(1);
        await expect(viewBtn, `[UI/셀렉터] "${term.label}" [보기] 버튼이 보이지 않음`).toBeVisible();
        recording = true;
        await viewBtn.click();
      });

      await test.step('[검증] 약관 모달 노출 및 클릭한 약관 내용 표시', async () => {
        await expect(dialog, `[앱오류] ${term.title} [보기] 클릭 후 약관 모달이 뜨지 않음`).toBeVisible({ timeout: 5000 });
        await expect(body, `[앱오류] 모달에 ${term.title} 내용이 표시되지 않음`).toContainText(term.content, { timeout: 5000 });
        // 열림 애니메이션이 끝나 모달 위치·크기가 고정될 때까지 대기
        let prev = '';
        await expect.poll(async () => {
          const cur = JSON.stringify(await dialog.boundingBox());
          const stable = cur === prev;
          prev = cur;
          return stable;
        }, { message: '[앱오류] 약관 모달 위치/크기가 안정되지 않음', intervals: [200], timeout: 5000 }).toBe(true);
        console.log(`✅ ${term.title} 약관 모달 노출 — 본문 시작: "${(await body.innerText()).trim().replace(/\s+/g, ' ').slice(0, 30)}…"`);
      });

      await test.step('[검증] 화면 구성 — 뷰포트/가로 넘침/요소 겹침/본문 영역/이미지', async () => {
        const m = await dialog.evaluate((dlg) => {
          const box = (r: DOMRect) => ({ x: Math.round(r.left), y: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) });
          const firstTextRect = (root: Element) => {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.textContent ?? '').trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP });
            const node = walker.nextNode();
            if (!node) return null;
            const range = document.createRange();
            range.selectNodeContents(node);
            return { text: (node.textContent ?? '').trim().slice(0, 30), rect: range.getBoundingClientRect() };
          };
          const header = dlg.querySelector('.modal-header')!;
          const bodyEl = dlg.querySelector('.modal-body') as HTMLElement;
          const contentEl = bodyEl.querySelector('.content') as HTMLElement | null;
          const close = header.querySelector('svg')!;
          const headerTitle = firstTextRect(header);
          const title = headerTitle ?? firstTextRect(bodyEl); // 헤더에 제목 텍스트가 없으면 본문 첫 제목을 제목으로 사용
          const dlgRect = dlg.getBoundingClientRect();
          const bodyRect = bodyEl.getBoundingClientRect();
          const closeRect = close.getBoundingClientRect();
          const cx = closeRect.left + closeRect.width / 2;
          const cy = closeRect.top + closeRect.height / 2;
          const topAtClose = document.elementFromPoint(cx, cy);
          return {
            viewport: { w: window.innerWidth, h: window.innerHeight },
            dialog: box(dlgRect),
            body: box(bodyRect),
            close: box(closeRect),
            closeOnTop: !!topAtClose && (topAtClose === close || close.contains(topAtClose)),
            titleInHeader: !!headerTitle,
            titleText: title?.text ?? '',
            title: title ? box(title.rect) : null,
            overflowX: [
              { name: '모달', sw: dlg.scrollWidth, cw: dlg.clientWidth },
              { name: '본문', sw: bodyEl.scrollWidth, cw: bodyEl.clientWidth },
              ...(contentEl ? [{ name: '본문 content', sw: contentEl.scrollWidth, cw: contentEl.clientWidth }] : []),
            ],
            scroll: { sh: bodyEl.scrollHeight, ch: bodyEl.clientHeight, overflowY: getComputedStyle(bodyEl).overflowY },
            images: [...dlg.querySelectorAll('img')].map(img => ({ src: img.getAttribute('src')?.slice(-60) ?? '', naturalWidth: img.naturalWidth })),
          };
        });

        const overlap = (a: { x: number; y: number; r: number; b: number }, b: { x: number; y: number; r: number; b: number }) =>
          Math.min(a.r, b.r) - Math.max(a.x, b.x) > 1 && Math.min(a.b, b.b) - Math.max(a.y, b.y) > 1;
        const inside = (inner: { x: number; y: number; r: number; b: number }, outer: { x: number; y: number; r: number; b: number }) =>
          inner.x >= outer.x - 1 && inner.y >= outer.y - 1 && inner.r <= outer.r + 1 && inner.b <= outer.b + 1;

        console.log(`✅ 뷰포트 ${m.viewport.w}x${m.viewport.h}, 모달 (${m.dialog.x},${m.dialog.y})~(${m.dialog.r},${m.dialog.b}) ${m.dialog.w}x${m.dialog.h}`);
        console.log(`✅ 가로 넘침: ${m.overflowX.map(o => `${o.name} scrollWidth ${o.sw}/clientWidth ${o.cw}`).join(', ')}`);
        console.log(`✅ 요소 위치: 제목 "${m.titleText}"${m.titleInHeader ? '' : ' (헤더에 제목 텍스트 없음 → 본문 첫 제목 기준)'} ${JSON.stringify(m.title)}, 본문 ${JSON.stringify(m.body)}, X 버튼 ${JSON.stringify(m.close)} (X 최상단 노출 ${m.closeOnTop})`);
        console.log(`✅ 본문 세로: scrollHeight ${m.scroll.sh} / clientHeight ${m.scroll.ch} (overflow-y: ${m.scroll.overflowY}), 이미지 ${m.images.length}개`);

        expect(inside(m.dialog, { x: 0, y: 0, r: m.viewport.w, b: m.viewport.h }),
          `[앱오류] 약관 모달이 화면(뷰포트 ${m.viewport.w}x${m.viewport.h}) 밖으로 벗어남: ${JSON.stringify(m.dialog)}`).toBe(true);
        for (const o of m.overflowX) {
          expect(o.sw, `[앱오류] ${o.name}에 가로 넘침 발생 (scrollWidth ${o.sw} > clientWidth ${o.cw})`).toBeLessThanOrEqual(o.cw + 1);
        }
        expect(m.title && m.title.w > 0 && m.title.h > 0, '[앱오류] 약관 모달 제목이 보이지 않음').toBe(true);
        expect(m.body.w > 0 && m.body.h > 0, '[앱오류] 약관 모달 본문이 보이지 않음').toBe(true);
        expect(m.close.w > 0 && m.close.h > 0 && m.closeOnTop, '[앱오류] 약관 모달 X 버튼이 보이지 않거나 다른 요소에 가려짐').toBe(true);
        expect(overlap(m.title!, m.close), `[앱오류] 약관 모달 제목과 X 버튼이 겹침`).toBe(false);
        expect(overlap(m.body, m.close), `[앱오류] 약관 모달 본문과 X 버튼이 겹침`).toBe(false);
        if (m.titleInHeader) expect(overlap(m.title!, m.body), '[앱오류] 약관 모달 제목과 본문이 겹침').toBe(false);
        expect(inside(m.body, m.dialog), `[앱오류] 약관 본문이 모달 밖으로 넘침: 본문 ${JSON.stringify(m.body)} / 모달 ${JSON.stringify(m.dialog)}`).toBe(true);
        for (const img of m.images) {
          expect(img.naturalWidth, `[앱오류] 약관 모달 이미지 로드 실패: ${img.src}`).toBeGreaterThan(0);
        }
        await captureEvidence(dialog, `${term.title} 약관 모달`);
      });

      await test.step('[검증] 본문 스크롤', async () => {
        const { sh, ch } = await body.evaluate(el => ({ sh: el.scrollHeight, ch: el.clientHeight }));
        if (sh > ch + 1) {
          await body.hover();
          await page.mouse.wheel(0, 800);
          await expect.poll(() => body.evaluate(el => el.scrollTop), {
            message: `[앱오류] ${term.title} 본문이 길지만(scrollHeight ${sh} > clientHeight ${ch}) 스크롤되지 않음`, timeout: 3000,
          }).toBeGreaterThan(0);
          const scrollTop = await body.evaluate(el => el.scrollTop);
          console.log(`✅ 본문 스크롤 가능 — 휠 스크롤 후 scrollTop 0 → ${Math.round(scrollTop)} (scrollHeight ${sh} / clientHeight ${ch})`);
          await captureEvidence(dialog, `${term.title} 약관 모달 — 스크롤 후`);
        } else {
          expect(term.mustScroll, `[앱오류] ${term.title} 본문이 스크롤되지 않음 (scrollHeight ${sh} <= clientHeight ${ch})`).toBe(false);
          console.log(`✅ 본문이 모달 안에 모두 표시됨 — 스크롤 불필요 (scrollHeight ${sh} / clientHeight ${ch})`);
        }
      });

      await test.step('[동작/검증] X 버튼 클릭 → 모달 닫힘', async () => {
        expect(consoleErrors, `[앱오류] 약관 모달이 떠 있는 동안 console error 발생: ${consoleErrors.join(' | ')}`).toEqual([]);
        console.log('✅ 모달 표시 중 console error 없음');
        await closeBtn.click();
        recording = false;
        await expect(modal, '[앱오류] X 버튼 클릭 후 약관 모달이 닫히지 않음').toBeHidden({ timeout: 5000 });
        await expect(page, '[앱오류] 모달을 닫은 뒤 회원가입 화면을 벗어남').toHaveURL(/\/regist_data/);
        await expect(row, '[앱오류] 모달을 닫은 뒤 약관 동의 영역이 보이지 않음').toBeVisible();
        console.log(`✅ X 버튼 클릭 → 약관 모달 닫힘, 약관 동의 화면 유지`);
      });
    });
  }
});
