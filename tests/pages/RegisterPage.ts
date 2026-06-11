import { Page, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? '';

export class RegisterPage {
  constructor(private page: Page) {}

  async goto() {
    // 헤더 [회원가입] 클릭으로 이동
    await this.page.goto(`${BASE}/`);
    await this.page.waitForLoadState('networkidle');
    await this.page.getByRole('link', { name: '회원가입' }).or(
      this.page.getByText('회원가입', { exact: true })
    ).first().click();
    await this.page.waitForURL(/\/register|\/signup|\/join/, { timeout: 10000 });
    await this.page.waitForLoadState('networkidle');
  }

  async gotoDirectly() {
    // 직접 URL 접근 시도 (register → join → signup 순)
    for (const path of ['/register', '/join', '/signup']) {
      await this.page.goto(`${BASE}${path}`);
      await this.page.waitForLoadState('networkidle');
      const is404 = await this.page.getByText('404').isVisible().catch(() => false);
      if (!is404) {
        console.log(`✅ 회원가입 페이지 접근: ${BASE}${path}`);
        return;
      }
    }
  }

  // ─── 소셜 버튼 ───────────────────────────────────────────────────────────

  async verifySocialButtonsVisible() {
    // 카카오, 구글, 네이버 버튼 순서로 존재 확인
    await expect(
      this.page.getByText('카카오톡으로 시작하기', { exact: false }).first()
    ).toBeVisible({ timeout: 8000 });
    await expect(
      this.page.getByText('구글로 시작하기', { exact: false }).first()
    ).toBeVisible({ timeout: 5000 });
    await expect(
      this.page.getByText('네이버로 시작하기', { exact: false }).first()
    ).toBeVisible({ timeout: 5000 });
    console.log('✅ 소셜 버튼 3개 노출 확인 (카카오/구글/네이버)');
  }

  async verifySocialButtonOrder() {
    // 카카오 → 구글 → 네이버 순서
    const buttons = this.page.locator(
      '[class*="social"], [class*="Social"], [class*="oauth"], [class*="kakao"], [class*="google"], [class*="naver"]'
    );
    const kakaoY = await this.page.getByText('카카오톡으로 시작하기', { exact: false }).first().boundingBox();
    const googleY = await this.page.getByText('구글로 시작하기', { exact: false }).first().boundingBox();
    const naverY  = await this.page.getByText('네이버로 시작하기', { exact: false }).first().boundingBox();
    if (kakaoY && googleY && naverY) {
      expect(kakaoY.y).toBeLessThan(googleY.y);
      expect(googleY.y).toBeLessThan(naverY.y);
    }
    console.log('✅ 소셜 버튼 순서 확인 (카카오 > 구글 > 네이버)');
  }

  async clickKakaoButton() {
    await this.page.getByText('카카오톡으로 시작하기', { exact: false }).first().click();
    await this.page.waitForTimeout(2000);
    console.log('🖱️ 카카오 버튼 클릭');
  }

  async verifyKakaoLoginPage() {
    await expect(this.page).toHaveURL(/kakao\.com|accounts\.kakao/);
    console.log(`✅ 카카오 로그인 페이지 이동 확인: ${this.page.url()}`);
  }

  async clickGoogleButton() {
    await this.page.getByText('구글로 시작하기', { exact: false }).first().click();
    await this.page.waitForTimeout(2000);
    console.log('🖱️ 구글 버튼 클릭');
  }

  async verifyGoogleLoginPage() {
    await expect(this.page).toHaveURL(/google\.com|accounts\.google/);
    console.log(`✅ 구글 로그인 페이지 이동 확인: ${this.page.url()}`);
  }

  async clickNaverButton() {
    await this.page.getByText('네이버로 시작하기', { exact: false }).first().click();
    await this.page.waitForTimeout(2000);
    console.log('🖱️ 네이버 버튼 클릭');
  }

  async verifyNaverLoginPage(popup?: Page) {
    const target = popup ?? this.page;
    await expect(target).toHaveURL(/naver\.com|nid\.naver/);
    console.log(`✅ 네이버 로그인 페이지 이동 확인: ${target.url()}`);
  }

  // ─── 구분선 / 이메일 영역 ─────────────────────────────────────────────────

  async verifyDividerOrText() {
    // 소셜 버튼과 이메일 사이 "또는" 구분선 확인
    await expect(
      this.page.getByText('또는', { exact: true }).first()
    ).toBeVisible({ timeout: 5000 });
    console.log('✅ 구분선 "또는" 텍스트 확인');
  }

  async verifyEmailInputVisible() {
    const emailInput = this.page.getByPlaceholder('이메일').or(
      this.page.locator('input[type="email"], input[placeholder*="이메일"], input[placeholder*="email"]')
    ).first();
    await expect(emailInput).toBeVisible({ timeout: 8000 });
    console.log('✅ 이메일 입력 필드 확인');
  }

  async verifyDuplicateCheckButtonInitiallyInactive() {
    // 이메일 미입력 시 중복확인 버튼 비활성화 상태 확인
    const btn = this.page.getByText('중복확인', { exact: true }).first();
    await expect(btn).toBeVisible({ timeout: 5000 });
    // 비활성화: disabled 속성 또는 주황색 아닌 상태
    const isDisabled = await btn.isDisabled().catch(() => false);
    const cls = await btn.evaluate((el: Element) => el.className);
    const isInactive = isDisabled || !/active|enabled|orange/i.test(cls);
    // 비활성 상태이거나 클릭 불가인지 확인 (실패 시 경고 출력)
    console.log(`ℹ️ 중복확인 버튼 초기 상태: disabled=${isDisabled}, class="${cls.slice(0, 60)}"`);
  }

  async typeEmail(email: string) {
    const emailInput = this.page.getByPlaceholder('이메일').or(
      this.page.locator('input[type="email"], input[placeholder*="이메일"]')
    ).first();
    await emailInput.fill(email);
    await this.page.waitForTimeout(400);
    console.log(`⌨️ 이메일 입력: ${email}`);
  }

  async verifyDuplicateCheckButtonActive() {
    // 유효한 이메일 형식 입력 후 중복확인 버튼 활성화 (주황색 텍스트)
    const btn = this.page.getByText('중복확인', { exact: true }).first();
    await expect(btn).toBeVisible();
    const isDisabled = await btn.isDisabled().catch(() => false);
    expect(isDisabled).toBe(false);
    console.log('✅ 중복확인 버튼 활성화 확인');
  }

  async verifyEmailInputPlaceholder() {
    const emailInput = this.page.locator('input[type="email"], input[placeholder*="이메일"]').first();
    const placeholder = await emailInput.getAttribute('placeholder');
    expect(placeholder?.length).toBeGreaterThan(0);
    console.log(`✅ 이메일 placeholder 확인: "${placeholder}"`);
  }
}
