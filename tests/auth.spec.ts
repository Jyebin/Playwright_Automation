import { test } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { LogoutPage } from './pages/LogoutPage';

// 로그인/로그아웃 기능 자체를 검증하므로 저장된 세션 없이 시작
test.use({ storageState: { cookies: [], origins: [] } });

const USERNAME = process.env.TEST_USERNAME ?? '';
const PASSWORD = process.env.TEST_PASSWORD ?? '';

test('로그인 성공', async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.goto();
  await loginPage.login(USERNAME, PASSWORD);
  await loginPage.verifyLoginSuccess();
});

test('로그아웃', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const logoutPage = new LogoutPage(page);

  await loginPage.goto();
  await loginPage.login(USERNAME, PASSWORD);
  await loginPage.verifyLoginSuccess();

  await logoutPage.logout();
  await logoutPage.verifyLogoutSuccess();
});
