import { Page, expect } from '@playwright/test';

// 서비스의 1차 카테고리 (GET /api/v2/lecture/intro/category/first 응답 순서와 동일)
// 2026-10-16 확인: "정비 훈련" 이 없어지고 "산업안전" 이 추가됨
export const MAIN_CATEGORIES = [
  'AI · IT 실습', '보건 의료', '직무 훈련', '조종 훈련', '산업안전', '장애인 직업훈련', '어학',
];

// 카테고리별 노출 콘텐츠 (GET /api/v2/lecture/intro/contents 의 category.classification 기준)
// top: 드롭다운에서 바로 보이는 항목 / bottom: 스크롤해야 보이는 항목
// 테스트용 더미 콘텐츠(이름에 test·테스트가 들어가는 것)는 수시로 바뀌므로 제외한다.
export const SUB_ITEMS = {
  'AI · IT 실습': {
    top: ['파이썬 마스터', '가볍게 시작하는 AI입문', '속 시원한 프롬프트 엔지니어링'],
    bottom: ['서버보안실습(진단)', '가볍게 시작하는 SQL 입문'],
  },
  '보건 의료': {
    top: ['물리치료 (360VR)', '요양보호사', '간호술기 (동작인식특화)'],
    bottom: ['두경부 해부학', 'SIMDEMY(동물 해부 실습)'],
  },
  '직무 훈련': {
    top: ['전기차 정비', '시설관리', '가상실험실 (4종)', '용접'],
    bottom: [],
  },
  '조종 훈련': {
    top: ['초경량 비행장치 기초 비행 교육', '초경량 비행장치 시설물 점검 교육'],
    bottom: ['지게차 훈련 실습', '동력보트 자격 시험 실습'],
  },
  '산업안전': {
    top: ['산업안전 (안전교육)'],
    bottom: [],
  },
  '장애인 직업훈련': {
    top: ['휠마스터', '지하철 타기', '편의점 직무훈련', '바리스타'],
    bottom: [],
  },
  '어학': {
    top: ['TOPIK 쓰기 강의 + AI 선생님'],
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
      // 드롭다운이 닫혔을 경우 재hover (마우스가 이동하면 CSS hover 드롭다운이 닫힐 수 있음)
      const el = this.page.getByText(category, { exact: true }).first();
      if (!await el.isVisible({ timeout: 1500 }).catch(() => false)) {
        await this.page.getByText('카테고리', { exact: true }).hover();
        await this.page.waitForTimeout(300);
      }
      await expect(el, `[UI/셀렉터] 드롭다운에서 "${category}" 카테고리 항목 미노출 — 셀렉터 또는 드롭다운 구조 변경 확인`).toBeVisible({ timeout: 5000 });
      console.log(`✅ 카테고리 확인: ${category}`);
    }
  }

  async hoverSubCategory(categoryName: string) {
    this.activeSubCategory = categoryName;
    // header/nav 영역으로 범위 제한 → 콘텐츠 카드의 카테고리 배지와 혼동 방지
    const navArea = this.page.locator('header, nav');
    const navItem = navArea.getByText(categoryName, { exact: true }).first();
    if (await navItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await navItem.hover({ force: true });
    } else {
      // fallback: 전체 페이지에서 탐색, force: true로 캐러셀 애니메이션 안정성 이슈 우회
      await this.page.getByText(categoryName, { exact: true }).first().hover({ force: true });
    }
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
    // 드롭다운 항목은 <a> 가 아니라 <p> + JS 이동이라 href 로 찾을 수 없다.
    // 2차 카테고리 제목과 콘텐츠명이 같은 경우(예: 산업안전 (안전교육))가 있어,
    // 같은 이름의 후보를 차례로 눌러 실제로 상세로 이동하는 항목을 찾는다.
    const candidates = this.page.getByText(item, { exact: true });
    const total = Math.min(await candidates.count(), 4);
    for (let i = 0; i < Math.max(total, 1); i++) {
      await candidates.nth(i).click({ timeout: 10000, force: true }).catch(() => {});
      const moved = await this.page
        .waitForURL(/\/contents\/detail\?id=\d+/, { timeout: 4000 })
        .then(() => true)
        .catch(() => false);
      if (moved) {
        console.log(`🖱️ 서브 항목 클릭: ${item} (후보 ${i + 1}/${total})`);
        return;
      }
      // 이동하지 않았으면 드롭다운을 다시 열고 다음 후보 시도
      await this.hoverCategoryMenu();
      if (this.activeSubCategory) await this.hoverSubCategory(this.activeSubCategory);
      await this.ensureSubPanelVisible(item);
    }
    console.log(`🖱️ 서브 항목 클릭: ${item} (이동 없음 — 후보 ${total}개 모두 시도)`);
  }

  async verifyContentsDetailPage() {
    await expect(this.page).toHaveURL(/\/contents\/detail\?id=\d+/);
    console.log(`✅ 콘텐츠 상세 페이지 이동 확인: ${this.page.url()}`);
  }
}
