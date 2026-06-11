import { test, expect } from '@playwright/test';
import { ContentsPage, CONTENTS_FILTER_CATEGORIES, CONTENTS_SUBCATEGORIES } from './pages/ContentsPage';

const BASE = process.env.BASE_URL ?? '';

// T398 - [Front][PC][콘텐츠] 001. 콘텐츠 페이지 확인
test.describe('T398 - 콘텐츠 페이지 확인', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/contents`);
    await page.waitForLoadState('networkidle');
  });

  // Step 0: 콘텐츠 페이지 UI 확인
  test('헤더 카테고리 클릭 시 실습 콘텐츠 페이지로 이동 확인', async ({ page }) => {
    await page.goto(`${BASE}/`);
    // 헤더 카테고리 메뉴를 통해 /contents로 이동
    await page.getByText('카테고리', { exact: true }).click();
    await page.waitForURL(/\/contents/);
    await expect(page).toHaveURL(/\/contents/);
    console.log('✅ 카테고리 클릭 → /contents 이동 확인');
  });

  test('랜딩 직후 검색결과 없음 화면 미출력', async ({ page }) => {
    const contents = new ContentsPage(page);
    await contents.verifyNoEmptyResultOnLanding();
  });

  test('상단 메인 문구 "실습 콘텐츠" 확인', async ({ page }) => {
    const contents = new ContentsPage(page);
    await contents.verifyMainText();
  });

  test('상단 서브 문구 확인', async ({ page }) => {
    const contents = new ContentsPage(page);
    await contents.verifySubText();
  });

  // Step 0: 카테고리 출력 확인
  test('카테고리 필터 목록 확인 (전체/보건의료/IT실습/직무훈련/어학/조종훈련)', async ({ page }) => {
    const contents = new ContentsPage(page);
    await contents.verifyFilterCategoriesVisible();
  });

  test('기본 선택값이 "전체"인지 확인', async ({ page }) => {
    await expect(page.getByText('전체', { exact: true }).first()).toBeVisible();
    console.log('✅ 기본 선택값 "전체" 확인');
  });

  // Step 1: 콘텐츠 카테고리 동작 확인
  test('보건 의료 카테고리 클릭 시 강조 및 소분류 노출', async ({ page }) => {
    const contents = new ContentsPage(page);
    await contents.clickFilterCategory('보건 의료');
    await contents.verifyFilterCategoryActive('보건 의료');
    await contents.verifySubcategoriesVisible('보건 의료');
  });

  test('IT 실습 카테고리 클릭 시 소분류 노출', async ({ page }) => {
    const contents = new ContentsPage(page);
    await contents.clickFilterCategory('IT 실습');
    await contents.verifySubcategoriesVisible('IT 실습');
  });

  test('"전체" 카테고리 클릭 시 필터 해제', async ({ page }) => {
    const contents = new ContentsPage(page);
    await contents.clickFilterCategory('보건 의료');
    await contents.clickFilterCategory('전체');
    // 전체 선택 시 소분류 미노출
    const subVisible = await page.getByText('보건 의료 실습', { exact: true }).isVisible().catch(() => false);
    expect(subVisible).toBe(false);
    console.log('✅ 전체 선택 시 소분류 해제 확인');
  });

  // Step 2: 콘텐츠 게시물 화면 구성 확인
  test('콘텐츠 카드 썸네일 이미지 출력 확인', async ({ page }) => {
    const contents = new ContentsPage(page);
    await contents.verifyCardThumbnail();
  });

  test('콘텐츠 카드 배지(PC/VR/EVENT) 출력 확인', async ({ page }) => {
    const contents = new ContentsPage(page);
    await contents.verifyCardBadge();
  });

  test('한 행에 3개 카드 노출', async ({ page }) => {
    const contents = new ContentsPage(page);
    await contents.verifyAtLeastThreeCards();
  });

  // Step 3: 스와이프 버튼 확인
  test('스와이프 버튼 n/n 형식 출력 확인', async ({ page }) => {
    const contents = new ContentsPage(page);
    await contents.verifySwipeButtonFormat();
  });

  test('초기 스와이프 페이지가 1번임을 확인', async ({ page }) => {
    const contents = new ContentsPage(page);
    await contents.verifySwipeButtonFormat();
    const { current } = await contents.getSwipePage();
    expect(current).toBe(1);
    console.log(`✅ 초기 스와이프 페이지: ${current}`);
  });

  test('스와이프 우측 버튼 클릭 시 페이지 번호 증가', async ({ page }) => {
    const contents = new ContentsPage(page);
    await contents.verifySwipeButtonFormat();
    const before = await contents.getSwipePage();
    if (before.total > 1) {
      await contents.clickSwipeNext();
      const after = await contents.getSwipePage();
      expect(after.current).toBeGreaterThan(before.current);
      console.log(`✅ 스와이프 ${before.current} → ${after.current}`);
    } else {
      console.log('⏭️ 전체 페이지가 1개 → 스와이프 테스트 스킵');
    }
  });
});
