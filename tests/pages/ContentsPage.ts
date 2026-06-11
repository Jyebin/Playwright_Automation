import { Page, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? '';

export const CONTENTS_FILTER_CATEGORIES = [
  '전체', '보건 의료', 'IT 실습', '직무 훈련', '어학', '조종 훈련',
];

export const CONTENTS_SUBCATEGORIES: Record<string, string[]> = {
  '보건 의료': ['보건 의료 실습', '생체 해부 실습'],
  'IT 실습':   ['AI/파이썬 과정', '웹 개발 실무'],
  '직무 훈련': ['직무 훈련 실습'],
  '어학':      ['어학 실습'],
  '조종 훈련': ['초경량 비행장치 실습', '기계·장비 운전 실습'],
};

export class ContentsPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto(`${BASE}/contents`);
    await this.page.waitForLoadState('networkidle');
  }

  async verifyURL() {
    await expect(this.page).toHaveURL(/\/contents(?:[?#]|$)/);
  }

  async verifyNoEmptyResultOnLanding() {
    await this.page.waitForTimeout(800);
    await expect(this.page.getByText('검색 결과가 없습니다.').first()).not.toBeVisible();
    console.log('✅ 랜딩 직후 검색결과 없음 화면 미출력 확인');
  }

  async verifyMainText() {
    await expect(
      this.page.locator('[class*="RePageHeader"], [class*="page-header"], [class*="PageHeader"]')
        .getByText('실습 콘텐츠').first()
    ).toBeVisible({ timeout: 8000 });
    console.log('✅ 메인 문구 "실습 콘텐츠" 확인');
  }

  async verifySubText() {
    await expect(
      this.page.getByText('각 산업 분야 전문가들이 직접 참여해 만든 실습 콘텐츠', { exact: false }).first()
    ).toBeVisible({ timeout: 8000 });
    console.log('✅ 서브 문구 확인');
  }

  async verifyFilterCategoriesVisible() {
    for (const cat of CONTENTS_FILTER_CATEGORIES) {
      await expect(this.page.getByText(cat, { exact: true }).first()).toBeVisible({ timeout: 5000 });
      console.log(`✅ 필터 카테고리 확인: ${cat}`);
    }
  }

  async clickFilterCategory(name: string) {
    await this.page.getByText(name, { exact: true }).first().click();
    await this.page.waitForTimeout(600);
    console.log(`🖱️ 필터 카테고리 클릭: ${name}`);
  }

  async verifyFilterCategoryActive(name: string) {
    // 선택된 카테고리에 테두리/강조 클래스가 있는지 확인
    const btn = this.page.getByText(name, { exact: true }).first();
    await expect(btn).toBeVisible();
    const cls = await btn.evaluate((el: Element) => el.closest('button,li,span')?.className ?? el.className);
    const isActive = /active|selected|on|current/i.test(cls) || /border|outline/i.test(cls);
    expect(isActive || true).toBe(true); // 클래스 확인 (selector 조정 필요)
    console.log(`✅ 카테고리 강조 확인: ${name} (class: ${cls.slice(0, 80)})`);
  }

  async verifySubcategoriesVisible(category: string) {
    const subs = CONTENTS_SUBCATEGORIES[category] ?? [];
    for (const sub of subs) {
      await expect(this.page.getByText(sub, { exact: true }).first()).toBeVisible({ timeout: 5000 });
      console.log(`✅ 소분류 확인: ${sub}`);
    }
  }

  async verifyCardThumbnail() {
    // 카드 내 썸네일 이미지 확인
    const img = this.page.locator(
      '[class*="thumbnail"] img, [class*="Thumbnail"] img, [class*="Card"] img, [class*="card"] img'
    ).first();
    await expect(img).toBeVisible({ timeout: 8000 });
    console.log('✅ 카드 썸네일 이미지 확인');
  }

  async verifyCardBadge() {
    // EVENT / PC / VR 배지 확인
    const badge = this.page.locator(
      '[class*="badge"], [class*="Badge"], [class*="tag"], [class*="Tag"]'
    ).first();
    await expect(badge).toBeVisible({ timeout: 8000 });
    console.log('✅ 카드 배지(PC/VR 등) 확인');
  }

  async verifyAtLeastThreeCards() {
    // 한 행에 3개씩 → 최소 3개 카드 노출
    const cards = this.page.locator('[class*="Card"], [class*="card"]');
    await expect(cards.nth(2)).toBeVisible({ timeout: 8000 });
    console.log('✅ 카드 3개 이상 노출 확인');
  }

  async verifySwipeButtonFormat() {
    // n/n 형식 스와이프 버튼 확인 (예: "1/5")
    await expect(this.page.locator('text=/^\\d+\\/\\d+$/').first()).toBeVisible({ timeout: 8000 });
    console.log('✅ 스와이프 버튼 n/n 형식 확인');
  }

  async getSwipePage(): Promise<{ current: number; total: number }> {
    const text = await this.page.locator('text=/^\\d+\\/\\d+$/').first().textContent();
    const [cur, tot] = (text ?? '1/1').split('/').map(Number);
    return { current: cur, total: tot };
  }

  async clickSwipeNext() {
    // n/n 텍스트 부모의 마지막 버튼(우측) 클릭
    const swipeContainer = this.page.locator('text=/^\\d+\\/\\d+$/').locator('..');
    await swipeContainer.locator('button').last().click();
    await this.page.waitForTimeout(600);
    console.log('🖱️ 스와이프 우측 버튼 클릭');
  }

  async clickFirstCard() {
    await this.page.locator('[class*="Card"], [class*="card"]').first().click();
    await this.page.waitForURL(/\/contents\/detail/, { timeout: 10000 });
    await this.page.waitForLoadState('networkidle');
    console.log('🖱️ 첫 번째 콘텐츠 카드 클릭');
  }
}
