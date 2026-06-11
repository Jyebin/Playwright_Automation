import { test, expect } from '@playwright/test';
import { HeaderPage, HEADER_NAV_LINKS } from './pages/HeaderPage';

const BASE = process.env.BASE_URL ?? '';

// T392 - 헤더 UI 검증 (로그인 상태)
test.describe('T392 - 헤더 UI (로그인)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/`);
  });

  test('헤더 구성 요소 노출', async ({ page }) => {
    const header = new HeaderPage(page);
    await header.verifyHeaderElements();
  });

  test('로고 클릭 - 최상단에서 클릭 시 페이지 이동 없음', async ({ page }) => {
    const header = new HeaderPage(page);
    await header.clickLogo();
    await expect(page).toHaveURL(`${BASE}/`);
    console.log('✅ 최상단 로고 클릭 - 메인페이지 유지');
  });

  test('로고 클릭 - 스크롤 후 클릭 시 메인 페이지로 이동', async ({ page }) => {
    const header = new HeaderPage(page);
    await header.scrollDown(800);
    await header.clickLogo();
    await expect(page).toHaveURL(`${BASE}/`);
    console.log('✅ 스크롤 후 로고 클릭 → 메인 페이지 이동');
  });

  test('이용가이드 링크 이동', async ({ page }) => {
    const header = new HeaderPage(page);
    await header.clickNavLink('이용가이드');
    await expect(page).toHaveURL(`${BASE}/guide`);
    console.log('✅ 이용가이드 링크 이동');
  });

  test('실습장비 링크 이동', async ({ page }) => {
    const header = new HeaderPage(page);
    await header.clickNavLink('실습장비');
    await expect(page).toHaveURL(`${BASE}/device`);
    console.log('✅ 실습장비 링크 이동');
  });

  test('고객센터 링크 이동', async ({ page }) => {
    const header = new HeaderPage(page);
    await header.clickNavLink('고객센터');
    await expect(page).toHaveURL(`${BASE}/cs`);
    console.log('✅ 고객센터 링크 이동');
  });

  test('단체문의 링크 이동', async ({ page }) => {
    const header = new HeaderPage(page);
    await header.clickNavLink('단체문의');
    await expect(page).toHaveURL(`${BASE}/corporate-inquiry`);
    console.log('✅ 단체문의 링크 이동');
  });

  test('이벤트 링크 이동', async ({ page }) => {
    const header = new HeaderPage(page);
    await header.clickEventLink();
    await expect(page).toHaveURL(/\/cs\/event/);
    console.log('✅ 이벤트 링크 이동');
  });

  test('검색창 placeholder 텍스트 확인', async ({ page }) => {
    const header = new HeaderPage(page);
    await header.verifySearchPlaceholder();
  });

  test('스크롤 다운 후 헤더 고정 노출', async ({ page }) => {
    const header = new HeaderPage(page);
    await header.scrollDown(1200);
    await header.verifyHeaderVisible();
  });

  test('메타데미 설치 버튼 툴팁 노출', async ({ page }) => {
    const header = new HeaderPage(page);
    await header.hoverInstallButton();
    await header.verifyInstallTooltip();
  });

  test('마이페이지 링크 이동 (로그인 상태)', async ({ page }) => {
    const header = new HeaderPage(page);
    await header.clickMyPage();
    await expect(page).toHaveURL(/\/mypage/);
    console.log('✅ 마이페이지 링크 이동');
  });
});

// T392 - 헤더 UI (비로그인 상태)
test.describe('T392 - 헤더 UI (비로그인)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/`);
  });

  test('비로그인 시 로그인 버튼 노출', async ({ page }) => {
    await expect(page.getByRole('link', { name: '로그인' })).toBeVisible();
    console.log('✅ 비로그인 상태 로그인 버튼 노출');
  });

  test('비로그인 시 회원가입 버튼 노출', async ({ page }) => {
    await expect(page.getByRole('link', { name: '회원가입' })).toBeVisible();
    console.log('✅ 비로그인 상태 회원가입 버튼 노출');
  });

  test('로그인 버튼 클릭 시 로그인 페이지 이동', async ({ page }) => {
    const header = new HeaderPage(page);
    await header.clickLoginButton();
    await expect(page).toHaveURL(`${BASE}/login`);
    console.log('✅ 로그인 버튼 클릭 → 로그인 페이지 이동');
  });

  test('회원가입 버튼 클릭 시 회원가입 페이지 이동', async ({ page }) => {
    const header = new HeaderPage(page);
    await header.clickRegisterButton();
    await expect(page).toHaveURL(/\/regist/);
    console.log('✅ 회원가입 버튼 클릭 → 회원가입 페이지 이동');
  });
});
