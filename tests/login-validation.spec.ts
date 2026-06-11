import { test } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

// 로그인 페이지 유효성 검증이므로 저장된 세션 없이 시작
test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
});

test('아이디에 한글 입력 시 유효성 메세지', async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.fillUsername('한글');
  await loginPage.verifyInputValidationMessage('한글은 사용 하실 수 없습니다.');
});

test('아이디를 숫자로 시작 시 유효성 메세지', async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.typeUsername('1abc');
  await loginPage.verifyInputValidationMessage('아이디는 숫자로 시작할 수 없습니다.');
});

test('아이디 최소 입력 글자 수 미달 시 유효성 메세지', async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.typeUsername('a');
  await loginPage.clickLoginButton();
  await loginPage.verifyInputValidationMessage('입력한 계정이 최소 입력 글자 수보다 적습니다.');
});

test('아이디 최대 입력 글자 수 초과 시 254자로 제한', async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.fillUsername('a'.repeat(255));
  await loginPage.verifyFieldMaxLength('아이디를 입력해 주세요.', 254);
});

test('비밀번호 최대 입력 글자 수 초과 시 20자로 제한', async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.fillPassword('a'.repeat(21));
  await loginPage.verifyFieldMaxLength('비밀번호를 입력해 주세요.', 20);
});

test('비밀번호 미입력 상태로 로그인 버튼 클릭 시 모달', async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.fillUsername(process.env.TEST_USERNAME ?? '');
  await loginPage.clickLoginButton();
  await loginPage.verifyModalAndClose('아이디와 비밀번호를 모두 입력해 주세요');
});
