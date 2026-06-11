import { Page, expect } from '@playwright/test';

export class LogoutPage {
  constructor(private page: Page) {}

  async logout() {
    const [response] = await Promise.all([
      this.page.waitForResponse(res =>
        res.url().includes('logout') && res.request().method() === 'POST'
      ),
      this.page.getByText('로그아웃', { exact: true }).click(),
    ]);

    const body = await response.json();

    expect(response.status()).toBe(200);
    expect(body.status_code).toBe(200);
    expect(body.code).toBe('MB20100200');
    expect(body.msg).toBe('로그아웃 성공');

    console.log('✅ 로그아웃 성공:', body.msg);
    console.log('🔑 응답 코드:', body.code);
  }

  async verifyLogoutSuccess() {
    const toast = this.page.locator('[data-testid="toast-content"]').filter({ hasText: '로그아웃 되었습니다.' });
    await expect(toast).toBeVisible();

    console.log('✅ 로그아웃 토스트 메세지 확인');
  }
}
