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

  const [response] = await Promise.all([
    page.waitForResponse(res =>
      res.url().includes('login') &&
      res.request().method() === 'POST' &&
      (res.headers()['content-type'] || '').includes('application/json')
    ),
    page.getByRole('button', { name: '로그인' }).click(),
  ]);

  const body = await response.json();
  if (body.status_code !== 200) {
    throw new Error(`Global setup 로그인 실패: ${body.msg}`);
  }

  await page.waitForURL(`${baseURL}/`);
  await page.context().storageState({ path: '.auth/user.json' });

  console.log('✅ [Global Setup] 로그인 완료 — 세션 저장됨');
  await browser.close();
}

export default globalSetup;
