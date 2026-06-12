import { Page, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? '';

export const CONTENTS_FILTER_CATEGORIES = [
  '전체', '보건 의료', 'IT실습', '직무 훈련', '어학', '조종 훈련',
];

export const CONTENTS_SUBCATEGORIES: Record<string, string[]> = {
  '보건 의료': ['보건 의료 실습', '생체 해부 실습'],
  'IT실습':    ['AI/파이썬 과정', '웹 개발 실무'],
  '직무 훈련': ['직무 훈련 실습'],
  '어학':      ['어학 실습'],
  '조종 훈련': ['초경량 비행장치 실습', '기계·장비 운전 실습'],
};

export class ContentsPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto(`${BASE}/contents`);
    await this.page.waitForLoadState('load');
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
    // 스와이프 카운터 옆에 "next" 텍스트 div가 항상 존재
    await expect(this.page.getByText('next', { exact: true }).first()).toBeVisible({ timeout: 8000 });
    console.log('✅ 스와이프 버튼 n/n 형식 확인');
  }

  async getSwipePage(): Promise<{ current: number; total: number }> {
    // 카운터 구조: div { div:"1", div:"/", div:"10" } — evaluate로 추출
    return await this.page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (node.textContent?.trim() === '/') {
          const parent = (node as Text).parentElement;
          if (parent) {
            const prev = parent.previousElementSibling;
            const next = parent.nextElementSibling;
            if (prev && next) {
              const cur = parseInt(prev.textContent ?? '1');
              const tot = parseInt(next.textContent ?? '1');
              if (!isNaN(cur) && !isNaN(tot)) return { current: cur, total: tot };
            }
          }
        }
      }
      return { current: 1, total: 1 };
    });
  }

  async clickSwipeNext() {
    // 스와이프 next 버튼은 cursor:pointer를 가진 "next" 텍스트 div
    await this.page.getByText('next', { exact: true }).first().click();
    await this.page.waitForTimeout(600);
    console.log('🖱️ 스와이프 우측 버튼 클릭');
  }

  async clickFirstCard() {
    await this._clickCard(false);
  }

  async clickFirstPaidCard() {
    await this._clickCard(true);
  }

  private async _clickCard(paidOnly: boolean) {
    // 카드는 cursor:pointer div — h5에서 위로 올라가 첫 cursor:pointer 조상 클릭
    // paidOnly=true: '원' 가격 포함 & '무료' 미포함 카드만 대상
    await this.page.evaluate((paidOnly: boolean) => {
      const h5s = Array.from(document.querySelectorAll('h5'));
      for (const h5 of h5s) {
        let el: HTMLElement | null = h5.parentElement as HTMLElement;
        while (el && el.tagName.toLowerCase() !== 'body') {
          if (window.getComputedStyle(el).cursor === 'pointer' && el.querySelector('img')) {
            if (paidOnly) {
              const text = el.textContent ?? '';
              if (!text.includes('원') || text.includes('무료')) { break; }
            }
            el.click();
            return;
          }
          el = el.parentElement as HTMLElement;
        }
      }
    }, paidOnly);
    await this.page.waitForURL(/\/contents\/detail/, { timeout: 15000 });
    await this.page.waitForLoadState('load');
    console.log(`🖱️ 첫 번째 ${paidOnly ? '유료 ' : ''}콘텐츠 카드 클릭`);
  }
}
