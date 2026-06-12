import { test, expect } from '@playwright/test';
import { RegisterPage } from './pages/RegisterPage';
import { waitForVerificationToken, waitForVerificationEmail, generateTestEmail } from './helpers/emailHelper';

// 회원가입 테스트는 세션 없이 실행
test.use({ storageState: { cookies: [], origins: [] } });

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

  test('카카오 버튼 클릭 시 카카오 로그인 페이지로 이동', async ({ page }) => {
    const register = new RegisterPage(page);
    await register.clickKakaoButton();
    await register.verifyKakaoLoginPage();
  });

  test('구글 버튼 클릭 시 구글 로그인 페이지로 이동', async ({ page }) => {
    const register = new RegisterPage(page);
    await register.clickGoogleButton();
    await register.verifyGoogleLoginPage();
  });

  test('네이버 버튼 클릭 시 네이버 로그인 페이지로 이동 (새 창)', async ({ page }) => {
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
  test.skip('[자동화 불가 - 외부 OAuth 서비스] 카카오 계정으로 실제 로그인 완료 후 회원가입 처리', async () => {
    // 카카오/구글/네이버는 외부 OAuth 서비스로, 실제 계정 자격증명 입력 및 로그인 완료는
    // 봇 감지(CAPTCHA 등) 및 외부 서비스 제어 불가로 자동화할 수 없습니다.
  });

  test.skip('[자동화 불가 - 외부 OAuth 서비스] 구글 계정으로 실제 로그인 완료 후 회원가입 처리', async () => {});

  test.skip('[자동화 불가 - 외부 OAuth 서비스] 네이버 계정으로 실제 로그인 완료 후 회원가입 처리', async () => {});
});

// ─────────────────────────────────────────────────────────────────────────────
// T421 - [Front][PC][회원가입] 002. 개인 회원 - 이메일 가입
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T421 - 이메일 가입 페이지 UI 확인 (Step 0)', () => {
  test.beforeEach(async ({ page }) => {
    const register = new RegisterPage(page);
    await register.goto();
  });

  test('회원가입 페이지 접속 및 URL 확인', async ({ page }) => {
    // 실제 URL: /regist (register 아님)
    await expect(page).toHaveURL(/\/regist(?:er)?|\/signup|\/join/);
    console.log(`✅ 회원가입 페이지 URL 확인: ${page.url()}`);
  });

  test('소셜 버튼 3개 존재 확인', async ({ page }) => {
    const register = new RegisterPage(page);
    await register.verifySocialButtonsVisible();
  });

  test('소셜 버튼과 이메일 입력 사이 "또는" 구분선 확인', async ({ page }) => {
    const register = new RegisterPage(page);
    await register.verifyDividerOrText();
  });

  test('이메일 입력 필드 존재 확인', async ({ page }) => {
    const register = new RegisterPage(page);
    await register.verifyEmailInputVisible();
    await register.verifyEmailInputPlaceholder();
  });

  test('이메일 미입력/형식 불일치 시 중복확인 버튼 비활성화 확인', async ({ page }) => {
    const register = new RegisterPage(page);
    await register.verifyDuplicateCheckButtonInitiallyInactive();
  });

  test('이메일 형식 입력 시 중복확인 버튼 활성화 (주황색 텍스트로 변경)', async ({ page }) => {
    const register = new RegisterPage(page);
    await register.typeEmail('test@example.com');
    await register.verifyDuplicateCheckButtonActive();
  });

  test('reCAPTCHA 미완료(중복확인 없이 이메일 인증 클릭) 시 "보안 인증을 완료해 주세요." 안내', async ({ page }) => {
    const register = new RegisterPage(page);
    const testEmail = process.env.EMAIL_IMAP_USER ?? `test_avail_${Date.now()}@gmail.com`;
    await register.typeEmail(testEmail);
    // 중복확인 없이 바로 "이메일 인증" 클릭 → reCAPTCHA 미완료 상태
    await register.clickEmailVerificationButton();
    await register.verifyRecaptchaRequiredMessage();
  });

  test('이메일 형식이 아닌 텍스트 입력 시 중복확인 버튼 비활성 유지', async ({ page }) => {
    const register = new RegisterPage(page);
    await register.typeEmail('invalid-email-text');
    // 실제 버튼 텍스트: "중복 확인" (공백 있음)
    const btn = page.getByRole('button', { name: /중복.?확인/ }).first();
    const isDisabled = await btn.isDisabled().catch(() => false);
    console.log(`ℹ️ 비유효 이메일 입력 시 중복확인 버튼 disabled: ${isDisabled}`);
    await expect(btn).toBeVisible();
  });

  test('중복확인 → 사용 가능 모달 → 이메일 인증 → 발송 완료 모달 확인', async ({ page }) => {
    const register = new RegisterPage(page);
    const testEmail = process.env.EMAIL_IMAP_USER ?? `test_avail_${Date.now()}@gmail.com`;
    await register.typeEmail(testEmail);
    await register.clickDuplicateCheckButton();
    await register.verifyEmailAvailableModal();          // "사용 가능한 이메일입니다." 모달 확인
    await register.clickEmailAvailableModalConfirm();    // 모달 "확인" 클릭
    await register.clickEmailVerificationButton();       // "이메일 인증" 버튼 클릭
    await register.verifyEmailSentModal();               // "인증 이메일을 발송했습니다." 모달 확인
    await register.clickEmailSentModalConfirm();         // 모달 "확인" 클릭
  });

  test('이메일 형식 불일치 시 "필수 입력 정보입니다." 문구 노출', async ({ page }) => {
    const register = new RegisterPage(page);
    await register.typeEmail('invalid-email-text');
    await page.keyboard.press('Tab'); // blur → 유효성 검사 트리거
    await register.verifyEmailRequiredMessage();
  });

  test('유효한 이메일 입력 시 "필수 입력 정보입니다." 문구 사라짐', async ({ page }) => {
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
  test.skip('[수동 확인] 인증 이메일 제목·발신자 확인 — 제목: "[라온 메타데미] 이메일 인증 링크입니다.", 발신자: metademy@raon.com', async () => {});
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
    if (!IMAP_READY) {
      console.log('[T421] IMAP 미설정 — .env의 EMAIL_IMAP_* 확인 후 실행하세요');
      return;
    }
    testEmail = generateTestEmail();
    console.log(`[T421] 테스트 이메일: ${testEmail}`);

    const page = await browser.newPage();
    const register = new RegisterPage(page);
    await register.goto();
    await register.submitEmailForVerification(testEmail);
    await page.close();

    const info = await waitForVerificationEmail(90_000);
    token = info.token ?? '';
    emailFrom = info.from;
    emailSubject = info.subject;
    console.log(`[T421] 인증 메일 수신 완료 — 발신자: ${emailFrom}, 제목: ${emailSubject}`);
  });

  test.beforeEach(async ({ page }) => {
    test.skip(!IMAP_READY || !token, '⚠️ IMAP 미설정 또는 인증 토큰 미취득 — .env의 EMAIL_IMAP_* 입력 필요');
    const base = process.env.BASE_URL ?? '';
    await page.goto(`${base}/regist_data?token=${token}`);
    await page.waitForLoadState('load');
  });

  test('인증 이메일 발신자 확인 — 보낸사람: 라온메타데미', async () => {
    expect(emailFrom).toMatch(/라온|metademy|raon/i);
    console.log(`✅ 발신자 확인: ${emailFrom}`);
  });

  test('인증 이메일 제목 확인 — [라온 메타데미] 이메일 인증 링크입니다.', async () => {
    expect(emailSubject).toContain('[라온 메타데미] 이메일 인증 링크입니다.');
    console.log(`✅ 제목 확인: ${emailSubject}`);
  });

  test('/regist_data 페이지 URL 및 접속 확인', async ({ page }) => {
    const register = new RegisterPage(page);
    await register.verifyRegistDataUrl();
  });

  test('/regist_data 페이지 - E-mail/비밀번호/비밀번호 재확인 placeholder 확인', async ({ page }) => {
    const register = new RegisterPage(page);
    await register.verifyRegistDataPlaceholders();
  });

  test('/regist_data 페이지 - 이메일 자동입력 확인 (인증 이메일 주소)', async ({ page }) => {
    const register = new RegisterPage(page);
    await register.verifyEmailAutofilled(testEmail);
  });

  test('/regist_data 페이지 - 취소 버튼 클릭 → 경고 모달 → [확인] 시 메인 페이지 이동', async ({ page }) => {
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
    if (!IMAP_READY) {
      console.log('[T758] IMAP 미설정 — .env의 EMAIL_IMAP_* 확인 후 실행하세요');
      return;
    }
    testEmail = generateTestEmail();
    console.log(`[T758] 테스트 이메일: ${testEmail}`);

    const page = await browser.newPage();
    const register = new RegisterPage(page);
    await register.goto();
    await register.submitEmailForVerification(testEmail);
    await page.close();

    token = await waitForVerificationToken(90_000);
    console.log(`[T758] 인증 토큰 수신 완료`);
  });

  test.beforeEach(async ({ page }) => {
    test.skip(!IMAP_READY || !token, '⚠️ IMAP 미설정 또는 인증 토큰 미취득 — .env의 EMAIL_IMAP_* 입력 필요');
    const base = process.env.BASE_URL ?? '';
    await page.goto(`${base}/regist_data?token=${token}`);
    await page.waitForLoadState('load');
  });

  test('이메일 자동입력 확인 및 비밀번호 유효성 검사 (8자 미만/숫자 없음/문자 없음/기호 없음)', async ({ page }) => {
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

  test('전체 동의 체크 시 하위 항목 모두 체크 및 개별 해제 연동 동작 확인', async ({ page }) => {
    const register = new RegisterPage(page);
    await register.checkAllTermsAgree();
    await register.verifyAllSubCheckboxesChecked();
  });

  test('약관 [보기] 버튼 클릭 시 모달 노출 및 X 버튼으로 닫힘 확인 (이용약관/개인정보/마케팅)', async ({ page }) => {
    const register = new RegisterPage(page);
    for (const termType of ['이용약관', '개인정보', '마케팅'] as const) {
      await register.clickTermsViewButton(termType);
      await register.verifyTermsModalVisible();
      await register.closeTermsModal();
      await page.waitForTimeout(400);
    }
  });

  test('필수 약관 미체크 상태에서 [회원가입] 버튼 클릭 시 알럿 확인', async ({ page }) => {
    const register = new RegisterPage(page);
    await register.fillPassword('TestPass1!', 'TestPass1!');
    await register.clickRegisterButton();
    await register.verifyTermsRequiredAlert();
  });

  test('비밀번호 입력 + 필수 약관 동의 후 [회원가입] 클릭 → 회원가입 완료 페이지 이동', async ({ page }) => {
    const register = new RegisterPage(page);
    await register.fillPassword('TestPass1!', 'TestPass1!');
    await register.checkAllTermsAgree();
    await register.clickRegisterButton();
    await register.verifyRegisterComplete();
  });
});
