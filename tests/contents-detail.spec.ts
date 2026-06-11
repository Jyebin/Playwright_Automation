import { test, expect } from '@playwright/test';
import { ContentsPage } from './pages/ContentsPage';
import { ContentsDetailPage, DETAIL_TABS } from './pages/ContentsDetailPage';

const BASE = process.env.BASE_URL ?? '';

// T399 - [Front][PC][콘텐츠] 002. 콘텐츠 상세 확인
test.describe('T399 - 콘텐츠 상세 확인', () => {
  // 각 테스트마다 /contents → 첫 번째 카드 클릭하여 상세 진입
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/contents`);
    await page.waitForLoadState('networkidle');
    const contents = new ContentsPage(page);
    await contents.clickFirstCard();
  });

  // Step 0: 콘텐츠 클릭 → 상세 페이지 이동
  test('콘텐츠 클릭 시 상세 페이지 URL 확인', async ({ page }) => {
    const detail = new ContentsDetailPage(page);
    await detail.verifyURL();
  });

  // Step 1: 콘텐츠 상세 구성 요소 출력 확인
  test('콘텐츠 카테고리 출력 확인', async ({ page }) => {
    const detail = new ContentsDetailPage(page);
    await detail.verifyContentCategory();
  });

  test('콘텐츠명 출력 확인', async ({ page }) => {
    const detail = new ContentsDetailPage(page);
    await detail.verifyContentName();
  });

  test('콘텐츠 설명 출력 확인', async ({ page }) => {
    const detail = new ContentsDetailPage(page);
    await detail.verifyContentDescription();
  });

  test('콘텐츠 태그 출력 확인', async ({ page }) => {
    const detail = new ContentsDetailPage(page);
    await detail.verifyContentTags();
  });

  // Step 2: 구매정보 placeholder 확인
  test('구독권 placeholder "옵션을 선택해 주세요." 확인', async ({ page }) => {
    const detail = new ContentsDetailPage(page);
    await detail.verifySubscriptionPlaceholder();
  });

  test('배송비 "0원" 초기값 확인', async ({ page }) => {
    const detail = new ContentsDetailPage(page);
    await detail.verifyShippingFeeZero();
  });

  test('총 결제 금액 "0원" 초기값 확인', async ({ page }) => {
    const detail = new ContentsDetailPage(page);
    await detail.verifyTotalPriceZero();
  });

  // Step 3: 결제 정보 하단 링크 검증
  test('"자세히 보기" 클릭 시 렌탈 안내 모달 노출', async ({ page }) => {
    const detail = new ContentsDetailPage(page);
    await detail.clickViewMore();
    await detail.verifyRentalModalVisible();
  });

  test('"서비스 이용 문의" 클릭 시 고객센터 페이지 이동', async ({ page }) => {
    const detail = new ContentsDetailPage(page);
    await detail.clickServiceInquiry();
    await detail.verifyServiceInquiryPage();
  });

  // Step 4: 탭 메뉴 구성 확인
  test('탭 메뉴 항목 확인 (이용가이드/실습 소개/커리큘럼/자주 묻는 질문)', async ({ page }) => {
    const detail = new ContentsDetailPage(page);
    await detail.verifyTabMenuItems();
  });

  test('"실습 소개" 탭 클릭 시 해당 영역으로 이동', async ({ page }) => {
    const detail = new ContentsDetailPage(page);
    await detail.clickTab('실습 소개');
    await detail.verifyPracticeIntroSection();
  });

  test('"커리큘럼" 탭 클릭 시 해당 영역으로 이동', async ({ page }) => {
    const detail = new ContentsDetailPage(page);
    await detail.clickTab('커리큘럼');
    await detail.verifyCurriculumSection();
  });

  // Step 5~7: 각 영역 출력 확인
  test('실습 소개 영역 출력 확인', async ({ page }) => {
    const detail = new ContentsDetailPage(page);
    await page.evaluate(() => window.scrollBy(0, 600));
    await detail.verifyPracticeIntroSection();
  });

  test('커리큘럼 영역 출력 확인', async ({ page }) => {
    const detail = new ContentsDetailPage(page);
    await page.evaluate(() => window.scrollBy(0, 1000));
    await detail.verifyCurriculumSection();
  });

  test('공지사항 영역 출력 또는 "공지사항이 없습니다." 안내 확인', async ({ page }) => {
    const detail = new ContentsDetailPage(page);
    await page.evaluate(() => window.scrollBy(0, 1500));
    await detail.verifyNoticeSection();
  });
});
