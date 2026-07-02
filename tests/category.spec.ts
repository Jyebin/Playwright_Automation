import { test } from '@playwright/test';
import { CategoryPage, SUB_ITEMS } from './pages/CategoryPage';

const BASE = process.env.BASE_URL ?? '';

test.describe('카테고리 드롭다운', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/`);
  });

  test('카테고리 hover 시 드롭다운 표시 및 7개 카테고리 확인', async ({ page }) => {
    const categoryPage = new CategoryPage(page);
    await categoryPage.hoverCategoryMenu();
    await categoryPage.verifyMainCategoriesVisible();
  });

  test('보건의료 서브메뉴 확인 및 스크롤', async ({ page }) => {
    const categoryPage = new CategoryPage(page);
    await categoryPage.hoverCategoryMenu();
    await categoryPage.hoverSubCategory('보건 의료');

    for (const item of SUB_ITEMS['보건 의료'].top) {
      await categoryPage.verifySubItemVisible(item);
    }
    for (const item of SUB_ITEMS['보건 의료'].bottom) {
      await categoryPage.verifySubItemScrollable(item);
    }
  });

  test('AI · IT 실습 서브메뉴 확인 및 스크롤', async ({ page }) => {
    const categoryPage = new CategoryPage(page);
    await categoryPage.hoverCategoryMenu();
    await categoryPage.hoverSubCategory('AI · IT 실습');

    for (const item of SUB_ITEMS['AI · IT 실습'].top) {
      await categoryPage.verifySubItemVisible(item);
    }
    for (const item of SUB_ITEMS['AI · IT 실습'].bottom) {
      await categoryPage.verifySubItemScrollable(item);
    }
  });

  test('직무훈련 서브메뉴 확인', async ({ page }) => {
    const categoryPage = new CategoryPage(page);
    await categoryPage.hoverCategoryMenu();
    await categoryPage.hoverSubCategory('직무 훈련');

    for (const item of SUB_ITEMS['직무 훈련'].top) {
      await categoryPage.verifySubItemVisible(item);
    }
  });

  test('어학 서브메뉴 확인', async ({ page }) => {
    const categoryPage = new CategoryPage(page);
    await categoryPage.hoverCategoryMenu();
    await categoryPage.hoverSubCategory('어학');

    for (const item of SUB_ITEMS['어학'].top) {
      await categoryPage.verifySubItemVisible(item);
    }
  });

  test('정비훈련 서브메뉴 확인', async ({ page }) => {
    const categoryPage = new CategoryPage(page);
    await categoryPage.hoverCategoryMenu();
    await categoryPage.hoverSubCategory('정비 훈련');

    for (const item of SUB_ITEMS['정비 훈련'].top) {
      await categoryPage.verifySubItemVisible(item);
    }
  });

  test('조종훈련 서브메뉴 확인 및 스크롤', async ({ page }) => {
    const categoryPage = new CategoryPage(page);
    await categoryPage.hoverCategoryMenu();
    await categoryPage.hoverSubCategory('조종 훈련');

    for (const item of SUB_ITEMS['조종 훈련'].top) {
      await categoryPage.verifySubItemVisible(item);
    }
    for (const item of SUB_ITEMS['조종 훈련'].bottom) {
      await categoryPage.verifySubItemScrollable(item);
    }
  });

  test('장애인 직업훈련 서브메뉴 확인', async ({ page }) => {
    const categoryPage = new CategoryPage(page);
    await categoryPage.hoverCategoryMenu();
    await categoryPage.hoverSubCategory('장애인 직업훈련');

    for (const item of SUB_ITEMS['장애인 직업훈련'].top) {
      await categoryPage.verifySubItemVisible(item);
    }
  });
});

test.describe('카테고리 클릭 시 페이지 이동', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/`);
  });

  const CLICK_TESTS: { category: string; item: string }[] = [
    { category: '보건 의료', item: '간호술기 (360VR)' },
    { category: 'AI · IT 실습', item: '파이썬 마스터' },
    { category: '직무 훈련', item: '일반실험 - 토질역학 압밀시험' },
    { category: '어학',      item: 'TOPIK 쓰기 강의 + AI 선생님' },
    { category: '정비 훈련', item: 'EV 교육' },
    { category: '조종 훈련', item: '초경량 비행장치 기초 비행 교육' },
  ];

  for (const { category, item } of CLICK_TESTS) {
    test(`${category} > ${item} 클릭 시 콘텐츠 상세 페이지 이동`, async ({ page }) => {
      const categoryPage = new CategoryPage(page);
      await categoryPage.hoverCategoryMenu();
      await categoryPage.hoverSubCategory(category);
      await categoryPage.clickSubItem(item);
      await categoryPage.verifyContentsDetailPage();
    });
  }
});
