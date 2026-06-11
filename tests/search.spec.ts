import { test, expect } from '@playwright/test';
import { SearchPage } from './pages/SearchPage';

const BASE = process.env.BASE_URL ?? '';

// T393 - 검색 기능 검증
test.describe('T393 - 검색 기능', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/`);
  });

  test('검색창 placeholder 텍스트 확인', async ({ page }) => {
    const search = new SearchPage(page);
    await expect(search.searchInput).toBeVisible();
    const placeholder = await search.searchInput.getAttribute('placeholder');
    expect(placeholder).toBe('실습할 콘텐츠를 검색해보세요.');
    console.log('✅ 검색창 placeholder 확인');
  });

  test('검색어 없이 버튼 클릭 시 콘텐츠 페이지 이동', async ({ page }) => {
    const search = new SearchPage(page);
    await search.searchEmptyByButton();
    await search.verifyOnContentsPage();
  });

  test('검색어 없이 엔터 입력 시 콘텐츠 페이지 이동', async ({ page }) => {
    const search = new SearchPage(page);
    await search.searchEmpty();
    await search.verifyOnContentsPage();
  });

  test('"간호" 검색 시 결과 목록 노출', async ({ page }) => {
    const search = new SearchPage(page);
    await search.search('간호');
    await search.verifyOnContentsPage();
    await search.verifySearchResultTitle('간호');
    await expect(page.getByText('간호술기', { exact: false }).first()).toBeVisible({ timeout: 8000 });
    console.log('✅ "간호" 검색 결과 내 "간호술기" 노출 확인');
  });

  test('"간호" 검색 후 검색어 잔여 확인', async ({ page }) => {
    const search = new SearchPage(page);
    await search.search('간호');
    await search.verifyKeywordPersists('간호');
  });

  test('"ㅁ" 검색 시 결과 없음 메세지 노출', async ({ page }) => {
    const search = new SearchPage(page);
    await search.search('ㅁ');
    await search.verifyNoResults();
  });

  test('검색 버튼으로 "간호" 검색', async ({ page }) => {
    const search = new SearchPage(page);
    await search.searchByButton('간호');
    await search.verifyOnContentsPage();
    await search.verifySearchResultTitle('간호');
  });
});
