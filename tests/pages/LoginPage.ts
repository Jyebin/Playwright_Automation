import { Page, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? '';

export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto(`${BASE_URL}/login`);
  }

  async login(username: string, password: string) {
    await this.page.getByPlaceholder('아이디를 입력해 주세요.').fill(username);
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
    await this.page.getByPlaceholder('아이디를 입력해 주세요.').fill(username);
  }

  async typeUsername(username: string) {
    await this.page.getByPlaceholder('아이디를 입력해 주세요.').pressSequentially(username);
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
}
