import { Page, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? '';

export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto(`${BASE_URL}/login`);
  }

  async login(username: string, password: string) {
    await this.page.getByPlaceholder('아이디 또는 이메일을 입력해 주세요.').fill(username);
    await this.page.getByPlaceholder('비밀번호를 입력해 주세요.').fill(password);

    const [response] = await Promise.all([
      this.page.waitForResponse(res =>
        res.url().includes('login') &&
        res.request().method() === 'POST' &&
        (res.headers()['content-type'] || '').includes('application/json')
      ),
      this.page.getByRole('button', { name: '로그인' }).click(),
    ]);

    const body = await response.json();

    expect(response.status()).toBe(200);
    expect(body.status_code).toBe(200);
    expect(body.msg).toBe('로그인 성공');
    expect(body.content.access_token).toBeTruthy();

    console.log('✅ 로그인 성공:', body.msg);
    console.log('🔑 토큰 발급 확인:', body.content.access_token?.slice(0, 20) + '...');

    return body.content.access_token;
  }

  async verifyLoginSuccess() {
    await expect(this.page).toHaveURL(`${BASE_URL}/`);

    const toast = this.page.locator('[data-testid="toast-content"]').filter({ hasText: '로그인 되었습니다.' });
    await expect(toast).toBeVisible();

    console.log('✅ URL 이동 확인: 메인 페이지');
    console.log('✅ 로그인 토스트 메세지 확인');
  }

  async fillUsername(username: string) {
    await this.page.getByPlaceholder('아이디 또는 이메일을 입력해 주세요.').fill(username);
  }

  async typeUsername(username: string) {
    await this.page.getByPlaceholder('아이디 또는 이메일을 입력해 주세요.').pressSequentially(username);
  }

  async fillPassword(password: string) {
    await this.page.getByPlaceholder('비밀번호를 입력해 주세요.').fill(password);
  }

  async verifyFieldMaxLength(placeholder: string, maxLength: number) {
    const input = this.page.getByPlaceholder(placeholder);
    const value = await input.inputValue();
    expect(value.length).toBeLessThanOrEqual(maxLength);
    console.log(`✅ maxlength 확인 (${maxLength}): 실제 입력값 길이 ${value.length}`);
  }

  async clickLoginButton() {
    await this.page.getByRole('button', { name: '로그인' }).click();
  }

  async verifyInputValidationMessage(message: string) {
    await this.page.keyboard.press('Tab');
    const msg = this.page.getByText(message);
    await expect(msg).toBeVisible();
    const actual = await msg.innerText();
    console.log(`📋 기대값: ${message}`);
    console.log(`✅ 실제값: ${actual}`);
  }

  async verifyModalAndClose(message: string) {
    const modal = this.page.locator('#CommonAlert');
    await expect(modal).toBeVisible({ timeout: 10000 });
    await expect(modal.locator('.modal-body')).toContainText(message);

    await modal.getByRole('button', { name: '확인' }).click();
    await expect(modal).not.toBeVisible();
  }

  // ── T417 로그인 페이지 UI 확인 ────────────────────────────────────────────

  async verifyWelcomeText() {
    await expect(
      this.page.getByText('메타데미에 오신 것을 환영합니다', { exact: false }).first(),
      '[앱오류] 환영 문구가 로그인 페이지에 없음'
    ).toBeVisible({ timeout: 8000 });
    console.log('✅ 환영 문구 확인');
  }

  async verifySocialLoginButtons() {
    const social = this.page.locator(
      '[class*="social"], [class*="kakao"], [class*="naver"], [class*="google"], [class*="Social"]'
    );
    const count = await social.count();
    expect(count, '[앱오류] 소셜 로그인 버튼이 없음').toBeGreaterThan(0);
    console.log(`✅ 소셜 로그인 버튼 ${count}개 확인`);
  }

  async verifyDivider() {
    await expect(
      this.page.getByText('또는', { exact: true }).first(),
      '[앱오류] 소셜/ID-PW 구분선 "또는" 텍스트 없음'
    ).toBeVisible({ timeout: 5000 });
    console.log('✅ 구분선 "또는" 확인');
  }

  async verifyInputFieldsVisible() {
    await expect(
      this.page.getByPlaceholder('아이디 또는 이메일을 입력해 주세요.').first()
    ).toBeVisible({ timeout: 5000 });
    await expect(
      this.page.getByPlaceholder('비밀번호를 입력해 주세요.').first()
    ).toBeVisible({ timeout: 5000 });
    await expect(
      this.page.getByRole('button', { name: '로그인' }).first()
    ).toBeVisible({ timeout: 5000 });
    console.log('✅ 계정/비밀번호 입력 필드 및 로그인 버튼 확인');
  }

  async verifyFindButtons() {
    await expect(
      this.page.getByText('아이디 찾기', { exact: false }).first(),
      '[앱오류] 아이디 찾기 버튼 없음'
    ).toBeVisible({ timeout: 5000 });
    await expect(
      this.page.getByText('비밀번호 찾기', { exact: false }).first(),
      '[앱오류] 비밀번호 찾기 버튼 없음'
    ).toBeVisible({ timeout: 5000 });
    console.log('✅ 아이디 찾기 / 비밀번호 찾기 버튼 확인');
  }

  async verifyRegisterLink() {
    await expect(
      this.page.getByText('아직 회원이 아닌가요', { exact: false }).first(),
      '[앱오류] "아직 회원이 아닌가요?" 문구 없음'
    ).toBeVisible({ timeout: 5000 });
    await expect(
      this.page.getByText('회원가입', { exact: false }).first(),
      '[앱오류] 회원가입하기 버튼 없음'
    ).toBeVisible({ timeout: 5000 });
    console.log('✅ "아직 회원이 아닌가요?" 및 회원가입 링크 확인');
  }

  // ── T760 계정/비밀번호 로그인 추가 시나리오 ──────────────────────────────

  async loginWithWrongCredentials(username: string, password: string) {
    await this.page.getByPlaceholder('아이디 또는 이메일을 입력해 주세요.').fill(username);
    await this.page.getByPlaceholder('비밀번호를 입력해 주세요.').fill(password);
    await this.page.getByRole('button', { name: '로그인' }).click();
    await this.page.waitForTimeout(1500);
    console.log('🔐 잘못된 정보로 로그인 시도');
  }

  async verifyLoginFailMessage() {
    const modal = this.page.locator('#CommonAlert');
    const isModalVisible = await modal.isVisible({ timeout: 5000 }).catch(() => false);
    if (isModalVisible) {
      console.log('✅ 로그인 실패 알럿 확인');
      await modal.getByRole('button', { name: '확인' }).first().click({ force: true });
      return;
    }
    const errorMsg = this.page.getByText(/아이디|비밀번호|로그인 실패|일치하지 않/, { exact: false }).first();
    const isVisible = await errorMsg.isVisible({ timeout: 5000 }).catch(() => false);
    expect(isVisible, '[앱오류] 로그인 실패 메시지가 화면에 표시되지 않음').toBe(true);
    console.log('✅ 로그인 실패 메시지 확인');
  }

  async loginWithEnterKey(username: string, password: string) {
    await this.page.getByPlaceholder('아이디 또는 이메일을 입력해 주세요.').fill(username);
    await this.page.getByPlaceholder('비밀번호를 입력해 주세요.').fill(password);
    await this.page.keyboard.press('Enter');
    console.log('⌨️ 엔터키로 로그인 시도');
  }

  async verifyPasswordToggle() {
    const pwInput = this.page.getByPlaceholder('비밀번호를 입력해 주세요.').first();
    await pwInput.fill('testpass123!');
    const initialType = await pwInput.getAttribute('type');

    const toggle = this.page.locator(
      '[class*="eye"], [class*="toggle"], [class*="pwd"] button, [class*="password"] button, button[aria-label*="비밀번호"]'
    ).first();
    const hasToggle = await toggle.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasToggle) {
      await toggle.click({ force: true });
      const changedType = await pwInput.getAttribute('type');
      expect(changedType, '[앱오류] 비밀번호 토글 후 input type이 변경되지 않음').not.toBe(initialType);
      console.log(`✅ 비밀번호 토글: ${initialType} → ${changedType}`);
    } else {
      console.log('ℹ️  비밀번호 보이기/숨기기 버튼 셀렉터 확인 필요');
    }
  }
}
