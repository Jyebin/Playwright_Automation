import { chromium } from '@playwright/test';
import * as fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function globalSetup() {
  const baseURL = process.env.BASE_URL;
  const username = process.env.TEST_USERNAME;
  const password = process.env.TEST_PASSWORD;

  if (!baseURL || !username || !password) {
    throw new Error('.env 파일에 BASE_URL, TEST_USERNAME, TEST_PASSWORD를 설정해 주세요.');
  }

  fs.mkdirSync('.auth', { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`${baseURL}/login`);
  await page.getByPlaceholder('아이디를 입력해 주세요.').fill(username);
  await page.getByPlaceholder('비밀번호를 입력해 주세요.').fill(password);

  await page.getByRole('button', { name: '로그인' }).click();

  // 로그인 후 /login 에서 벗어날 때까지 대기
  await page.waitForURL(url => !url.href.includes('/login'), { timeout: 20000 });

  // 여전히 로그인 페이지면 실패
  if (page.url().includes('/login')) {
    throw new Error('Global setup 로그인 실패: /login 페이지에서 벗어나지 못했습니다.');
  }
  await page.context().storageState({ path: '.auth/user.json' });

  console.log('✅ [Global Setup] 로그인 완료 — 세션 저장됨');
  await browser.close();
}

export default globalSetup;
