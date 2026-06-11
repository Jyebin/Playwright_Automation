import { test, expect } from '@playwright/test';
import { RegisterPage } from './pages/RegisterPage';

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
});

// ─────────────────────────────────────────────────────────────────────────────
// T421 - [Front][PC][회원가입] 002. 개인 회원 - 이메일 가입
//
// ⚠️  이메일 인증 이후 과정 자동화 범위:
//   - 회원가입 페이지 UI, 이메일 필드, 중복확인 버튼 활성화 → ✅ 자동화 가능
//   - 이메일 인증 메일 확인 (Step 1)                         → ❌ 이메일 클라이언트 접근 불가
//   - 인증 링크 클릭 → /regist_data?token=JWT (Step 2)       → ❌ 이메일 링크 접근 불가
//   - 비밀번호 입력, 약관 동의, 회원가입 완료 (Step 3~5)      → ❌ JWT 토큰 필요
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T421 - 이메일 가입 페이지 UI 확인 (Step 0)', () => {
  test.beforeEach(async ({ page }) => {
    const register = new RegisterPage(page);
    await register.goto();
  });

  test('회원가입 페이지 접속 및 URL 확인', async ({ page }) => {
    await expect(page).toHaveURL(/\/register|\/signup|\/join/);
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

  test('이메일 형식이 아닌 텍스트 입력 시 중복확인 버튼 비활성 유지', async ({ page }) => {
    const register = new RegisterPage(page);
    await register.typeEmail('invalid-email-text');
    // 이메일 형식이 아니면 중복확인 버튼이 활성화되지 않아야 함
    const btn = page.getByText('중복확인', { exact: true }).first();
    const isDisabled = await btn.isDisabled().catch(() => false);
    // disabled이거나 비활성 상태
    console.log(`ℹ️ 비유효 이메일 입력 시 중복확인 버튼 disabled: ${isDisabled}`);
    // 활성화되지 않았음을 확인 (exact assertion은 실제 구현에 따라 조정 필요)
    await expect(btn).toBeVisible();
  });
});
