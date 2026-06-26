import { test, expect } from '@playwright/test';
import { DownloadPage } from './pages/DownloadPage';
import { GuidePage, MANUAL_TABS } from './pages/GuidePage';

const BASE = process.env.BASE_URL ?? '';

// ─────────────────────────────────────────────────────────────────────────────
// T470 - 클라이언트 다운로드
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T470 - 클라이언트 다운로드', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/downloads`);
    await page.waitForLoadState('load');
  });

  test('다운로드 페이지 이동 확인', async ({ page }) => {
    const dlPage = new DownloadPage(page);
    await dlPage.verifyUrl();
  });

  test('다운로드 페이지 안내문구 확인 - 메인/서브 문구', async ({ page }) => {
    const dlPage = new DownloadPage(page);
    await dlPage.verifyPageTitle();
    await dlPage.verifyStorageGuideText();
  });

  test('Windows OS 기본 선택 및 사양 카드 노출 확인', async ({ page }) => {
    const dlPage = new DownloadPage(page);
    await dlPage.verifyWindowsOsDefaultSelected();
    await dlPage.verifySpecCardsShown();
  });

  test('MacOS 탭 클릭 시 Mac 사양으로 변경 확인', async ({ page }) => {
    const dlPage = new DownloadPage(page);
    await dlPage.verifySpecCardsShown();
    await dlPage.clickMacOsTab();
    await dlPage.verifyMacSpecsShown();
  });

  test('Windows OS 탭 클릭 시 Windows 사양으로 변경 확인', async ({ page }) => {
    const dlPage = new DownloadPage(page);
    // MacOS 탭 먼저 클릭 후 Windows로 되돌아오기
    await dlPage.clickMacOsTab();
    await dlPage.verifyMacSpecsShown();
    await dlPage.clickWindowsOsTab();
    await dlPage.verifyWindowsSpecsShown();
  });

  test('권장 사양 카드 보라색 테두리 확인', async ({ page }) => {
    const dlPage = new DownloadPage(page);
    await dlPage.verifySpecCardsShown();
    await dlPage.verifyRecommendedSpecPurpleBorder();
  });

  test('클라이언트 다운로드 버튼 클릭 및 파일 다운로드 확인', async ({ page }) => {
    const dlPage = new DownloadPage(page);
    const download = await dlPage.clickDownloadButton();
    if (download) {
      // PC 환경: 실제 설치파일 (.exe / .dmg / .msi / .pkg) 다운로드 검증
      await dlPage.verifyDownloadFile(download, /\.(exe|dmg|msi|pkg)$/i);
    } else {
      // 모바일 환경 또는 다운로드 불가 상황: 페이지가 정상 상태인지 확인
      await expect(page).toHaveURL(/\/downloads/);
      console.log('ℹ️  파일 다운로드 대신 모달 또는 페이지 유지 확인');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T471 - 매뉴얼 다운로드 (이용가이드)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T471 - 매뉴얼 다운로드', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/guide`);
    await page.waitForLoadState('load');
  });

  test('이용가이드 페이지 URL 확인', async ({ page }) => {
    const guidePage = new GuidePage(page);
    await guidePage.verifyUrl();
  });

  test('4단계 이용가이드 카드 구성 확인', async ({ page }) => {
    const guidePage = new GuidePage(page);
    await guidePage.verifyStepGuideCards();
  });

  test('매뉴얼 탭 4개 항목 노출 및 "전체" 기본 선택 확인', async ({ page }) => {
    const guidePage = new GuidePage(page);
    await guidePage.verifyManualTabsExist();
    await guidePage.verifyDefaultTabSelected();
  });

  for (const tab of MANUAL_TABS) {
    test(`매뉴얼 탭 클릭 및 하이라이트 - ${tab}`, async ({ page }) => {
      const guidePage = new GuidePage(page);
      await guidePage.clickManualTab(tab);
      await guidePage.verifyTabHighlighted(tab);
    });
  }

  test('검색 placeholder "찾고있는 매뉴얼을 검색하세요" 노출 확인', async ({ page }) => {
    const guidePage = new GuidePage(page);
    await guidePage.verifySearchPlaceholder();
  });

  test('아무것도 입력하지 않은 상태에서 검색 시 전체 매뉴얼 노출', async ({ page }) => {
    const guidePage = new GuidePage(page);
    await guidePage.verifySearchPlaceholder();
    // 아무것도 입력하지 않고 Enter
    await page.locator('input[placeholder*="매뉴얼"], input[placeholder*="검색"]').first().press('Enter');
    await page.waitForTimeout(600);
    await guidePage.verifyAllManualsShown();
  });

  test('존재하는 키워드 검색 후 해당 매뉴얼만 필터링 확인', async ({ page }) => {
    const guidePage = new GuidePage(page);
    await guidePage.searchManual('클라이언트');
    await guidePage.verifySearchResultsFiltered('클라이언트');
  });

  test('검색 중 닫기 버튼 활성화 확인', async ({ page }) => {
    const guidePage = new GuidePage(page);
    await page.locator('input[placeholder*="매뉴얼"], input[placeholder*="검색"]').first().fill('설치');
    await page.waitForTimeout(400);
    await guidePage.verifyClearButtonVisible();
  });

  test('검색 후 매뉴얼 탭 클릭 시 탭+키워드 복합 필터링 확인', async ({ page }) => {
    const guidePage = new GuidePage(page);
    await guidePage.searchManual('설치');
    await guidePage.clickManualTab('클라이언트');
    await guidePage.verifyTabHighlighted('클라이언트');
    await guidePage.verifySearchResultsFiltered('설치');
  });

  test('존재하지 않는 키워드 검색 시 결과 없음 상태 확인', async ({ page }) => {
    const guidePage = new GuidePage(page);
    await guidePage.searchManual('ZZZZNOTEXIST9999');
    await guidePage.verifyNoSearchResults();
  });

  test('매뉴얼 다운로드 버튼 클릭 및 파일 다운로드 확인', async ({ page }) => {
    const guidePage = new GuidePage(page);
    const download = await guidePage.downloadFirstManual();
    await guidePage.verifyDownloadedManual(download);
  });

  test('페이지당 노출 매뉴얼 30개 이하 확인', async ({ page }) => {
    const guidePage = new GuidePage(page);
    await guidePage.verifyItemsPerPage(30);
  });

  test('30개 초과 시 페이지네이션 버튼 노출 확인', async ({ page }) => {
    const guidePage = new GuidePage(page);
    await guidePage.verifyItemsPerPage(30);
    await guidePage.verifyPaginationExists();
  });
});
