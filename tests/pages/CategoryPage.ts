import { Page, expect } from '@playwright/test';

export const MAIN_CATEGORIES = [
  '보건 의료', 'IT실습', '직무 훈련', '어학', '정비 훈련', '조종 훈련', '장애인 직업훈련',
];

export const SUB_ITEMS = {
  '보건 의료': {
    top: ['간호술기 (360VR)', '물리치료 (360VR)', '요양보호사'],
    bottom: ['두경부 해부학', 'SIMDEMY(동물 해부 실습)'],
  },
  'IT실습': {
    top: ['파이썬 마스터', '파이썬 심화', '속 시원한 프롬프트 엔지니어링'],
    bottom: ['임직원_파이썬과 AI로 끝내는 업무 자동화', '임직원_소프트웨어 개발 실무를 위한 IT 영어'],
  },
  '직무 훈련': {
    top: [
      '일반실험 - 토질역학 압밀시험',
      '일반실험 - 재료역학 인장시험',
      '일반실험 - 일반물리 운동량과 충돌 실험',
      '일반실험 - 일반화학 아스피린 합성',
    ],
    bottom: [],
  },
  '어학': {
    top: ['TOPIK 쓰기 강의 + AI 선생님'],
    bottom: [],
  },
  '정비 훈련': {
    top: ['EV 교육'],
    bottom: [],
  },
  '조종 훈련': {
    top: ['초경량 비행장치 기초 비행 교육', '초경량 비행장치 시설물 점검 교육'],
    bottom: ['임직원_지게차 훈련 실습', '임직원_동력보트 자격 시험 실습'],
  },
  '장애인 직업훈련': {
    top: ['수정'],
    bottom: [],
  },
};

export class CategoryPage {
  private activeSubCategory: string | null = null;

  constructor(private page: Page) {}

  async hoverCategoryMenu() {
    await this.page.getByText('카테고리', { exact: true }).hover();
    await expect(this.page.getByText('보건 의료').first()).toBeVisible({ timeout: 10000 });
    console.log('🖱️ 카테고리 메뉴 hover');
  }

  async verifyMainCategoriesVisible() {
    for (const category of MAIN_CATEGORIES) {
      await expect(this.page.getByText(category).first()).toBeVisible();
      console.log(`✅ 카테고리 확인: ${category}`);
    }
  }

  async hoverSubCategory(categoryName: string) {
    this.activeSubCategory = categoryName;
    await this.page.getByText(categoryName).first().hover();
    await this.page.waitForTimeout(600);
    console.log(`🖱️ 서브 카테고리 hover: ${categoryName}`);
  }

  private async ensureSubPanelVisible(item: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const visible = await this.page.getByText(item, { exact: true }).first().isVisible().catch(() => false);
      if (visible) return;
      if (this.activeSubCategory) {
        // Re-open dropdown then hover sub-category (dropdown may have closed)
        await this.page.getByText('카테고리', { exact: true }).hover();
        await this.page.waitForTimeout(300);
        await this.page.getByText(this.activeSubCategory).first().hover();
        await this.page.waitForTimeout(800);
      }
    }
  }

  async verifySubItemVisible(item: string) {
    await this.ensureSubPanelVisible(item);
    await expect(this.page.getByText(item, { exact: true }).first()).toBeVisible({ timeout: 5000 });
    console.log(`✅ 서브 항목 확인: ${item}`);
  }

  async verifySubItemScrollable(item: string) {
    await this.page.mouse.wheel(0, 500);
    const locator = this.page.getByText(item, { exact: true }).first();
    await expect(locator).toBeVisible();
    console.log(`✅ 스크롤 후 확인: ${item}`);
  }

  async clickSubItem(item: string) {
    await this.ensureSubPanelVisible(item);
    const el = this.page.getByText(item, { exact: true }).first();
    await el.click({ timeout: 10000 });
    console.log(`🖱️ 서브 항목 클릭: ${item}`);
  }

  async verifyContentsDetailPage() {
    await expect(this.page).toHaveURL(/\/contents\/detail\?id=\d+/);
    console.log(`✅ 콘텐츠 상세 페이지 이동 확인: ${this.page.url()}`);
  }
}
