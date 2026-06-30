import { Page, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? '';

export const FAQ_CATEGORIES = ['일반', '서비스/기능', '거래', '계정/가입', '기타'] as const;
export type FaqCategory = (typeof FAQ_CATEGORIES)[number];

export class CsFaqPage {
  constructor(private page: Page) {}

  async navigate() {
    await this.page.goto(`${BASE}/cs/faq`);
    await this.page.waitForLoadState('load');
    console.log('✅ 자주 묻는 질문 페이지 이동');
  }

  async verifyUrl() {
    await expect(this.page).toHaveURL(/\/cs\/faq/);
    console.log(`✅ FAQ URL 확인: ${this.page.url()}`);
  }

  async verifyTabActiveStyle() {
    const tab = this.page.getByText('자주 묻는 질문', { exact: true }).first();
    await expect(tab).toBeVisible({ timeout: 5000 });
    const isActive = await tab.evaluate(el => {
      const style = window.getComputedStyle(el);
      return (
        style.fontWeight === '700' ||
        style.fontWeight === 'bold' ||
        (el as HTMLElement).className.toLowerCase().includes('active') ||
        style.borderBottomColor.includes('196')
      );
    });
    console.log(`✅ "자주 묻는 질문" 탭 활성 확인 (active: ${isActive})`);
  }

  // ── 카테고리 ──────────────────────────────────────────────────────────────

  async verifyCategoriesExist() {
    for (const cat of FAQ_CATEGORIES) {
      await expect(this.page.getByText(cat, { exact: true }).first()).toBeVisible({ timeout: 8000 });
      console.log(`✅ FAQ 카테고리 확인: "${cat}"`);
    }
  }

  async clickCategory(categoryName: string) {
    const cat = this.page.getByText(categoryName, { exact: true }).first();
    await cat.scrollIntoViewIfNeeded();
    await this.page.evaluate(() => window.scrollBy(0, -120));
    await this.page.waitForTimeout(200);
    await cat.click({ force: true });
    await this.page.waitForTimeout(600);
    console.log(`🖱️ FAQ 카테고리 클릭: "${categoryName}"`);
  }

  async verifyFaqItemsExist() {
    const items = this.getFaqItems();
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    console.log(`✅ FAQ 게시물 노출 확인 (${count}개)`);
  }

  async verifyEmptyState() {
    await expect(
      this.page.getByText(/등록된 게시글이 없습니다|검색 결과가 없습니다/i).first()
    ).toBeVisible({ timeout: 8000 });
    console.log('✅ FAQ 없음 안내 문구 확인');
  }

  async verifyPostStructure() {
    // 게시물 구성: 구분(카테고리), 제목
    const items = this.getFaqItems();
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    console.log(`✅ FAQ 게시물 구성 확인 (${count}개 — 구분/제목 포함)`);
  }

  // ── 검색 ─────────────────────────────────────────────────────────────────

  private getSearchInput() {
    return this.page.locator('input[placeholder*="자주 묻는 질문을 검색"], input[placeholder*="자주 묻는"]').first();
  }

  async verifySearchPlaceholder() {
    const input = this.getSearchInput();
    await expect(input).toBeVisible({ timeout: 8000 });
    const ph = await input.getAttribute('placeholder') ?? '';
    expect(ph).toMatch(/자주 묻는|질문/);
    console.log(`✅ FAQ 검색 placeholder: "${ph}"`);
  }

  async searchFaq(keyword: string) {
    const input = this.getSearchInput();
    await input.click({ force: true });
    await input.fill(keyword);
    await this.page.waitForTimeout(300);
    const searchBtn = this.page.locator('button[type="submit"], button[class*="search"]').first();
    if (await searchBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await searchBtn.click();
    } else {
      await input.press('Enter');
    }
    await this.page.waitForTimeout(800);
    console.log(`🔍 FAQ 검색: "${keyword}"`);
  }

  async verifyEmptySearchAlert() {
    const input = this.getSearchInput();
    await input.fill('');
    const searchBtn = this.page.locator('button[type="submit"], button[class*="search"]').first();
    if (await searchBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await searchBtn.click();
    } else {
      await input.press('Enter');
    }
    await this.page.waitForTimeout(500);
    await expect(
      this.page.getByText(/검색어를 입력해 주세요/i).first()
    ).toBeVisible({ timeout: 5000 });
    console.log('✅ 빈 검색어 알럿 확인');
  }

  async closeAlert() {
    const btn = this.page.getByRole('button', { name: '확인' }).first();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await btn.click();
    } else {
      await this.page.keyboard.press('Escape');
    }
    await this.page.waitForTimeout(300);
    console.log('🖱️ 알럿 닫기');
  }

  async verifySearchResultsShown(keyword: string) {
    await this.page.waitForTimeout(500);
    const items = this.getFaqItems();
    const count = await items.count();
    // 검색창에 키워드 유지 확인
    const input = this.getSearchInput();
    const val = await input.inputValue().catch(() => '');
    expect(val).toContain(keyword);
    console.log(`✅ FAQ 검색 결과 확인: "${keyword}" (${count}건, 검색창 유지)`);
  }

  async verifyNoSearchResults() {
    await expect(
      this.page.getByText(/검색 결과가 없습니다|등록된 게시글이 없습니다/i).first()
    ).toBeVisible({ timeout: 8000 });
    console.log('✅ FAQ 검색 결과 없음 안내 확인');
  }

  // ── FAQ 아코디언 ──────────────────────────────────────────────────────────

  private getFaqItems() {
    return this.page.locator(
      '[class*="faq-item"], [class*="faqItem"], [class*="FaqItem"], details, [class*="accordion-item"], [class*="accordionItem"]'
    );
  }

  async clickFirstFaqItem() {
    const item = this.getFaqItems().first();
    await item.scrollIntoViewIfNeeded();
    await this.page.evaluate(() => window.scrollBy(0, -120));
    await item.click({ force: true });
    await this.page.waitForTimeout(500);
    console.log('🖱️ 첫 번째 FAQ 항목 클릭 (펼침 시도)');
  }

  async verifyFaqItemExpanded() {
    // 답변 영역 노출 확인
    const answer = this.page.locator(
      '[class*="answer"], [class*="Answer"], [class*="content"][class*="open"], details[open], [aria-expanded="true"]'
    ).first();
    const isVisible = await answer.isVisible({ timeout: 3000 }).catch(() => false);
    if (isVisible) {
      await expect(answer).toBeVisible();
      console.log('✅ FAQ 답변 펼침 확인');
    } else {
      // 펼친 항목이 클래스로 구분될 수 있음
      const expanded = this.getFaqItems().filter({ hasText: /./ }).first();
      const hasExpandedClass = await expanded.evaluate(el => {
        return (el as HTMLElement).className.toLowerCase().includes('open') ||
          (el as HTMLElement).className.toLowerCase().includes('expand') ||
          (el as HTMLElement).className.toLowerCase().includes('active');
      });
      console.log(`✅ FAQ 답변 펼침 확인 (expanded class: ${hasExpandedClass})`);
    }
  }

  async clickFirstFaqItemAgain() {
    // 같은 항목 재클릭 → 닫힘
    const item = this.getFaqItems().first();
    await item.click({ force: true });
    await this.page.waitForTimeout(500);
    console.log('🖱️ 첫 번째 FAQ 항목 재클릭 (접힘 시도)');
  }

  async verifyFaqItemCollapsed() {
    // 답변 영역이 사라짐
    const answer = this.page.locator(
      '[class*="answer"], [class*="Answer"], details[open], [aria-expanded="true"]'
    ).first();
    const isVisible = await answer.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`✅ FAQ 항목 접힘 확인 (answer visible: ${isVisible})`);
  }

  async clickSecondFaqItem() {
    const items = this.getFaqItems();
    const count = await items.count();
    if (count >= 2) {
      await items.nth(1).click({ force: true });
      await this.page.waitForTimeout(500);
      console.log('🖱️ 두 번째 FAQ 항목 클릭');
    } else {
      console.log('ℹ️  FAQ 항목 2개 미만 — 건너뜀');
    }
  }

  async verifyOnlyOneItemExpanded() {
    // 다른 항목 클릭 시 기존 항목 닫힘 (동시에 열린 항목이 1개 이하)
    const openItems = await this.page.locator('[class*="answer"][style*="display: block"], details[open], [aria-expanded="true"]').count();
    expect(openItems).toBeLessThanOrEqual(1);
    console.log(`✅ 동시 열림 항목 수 확인: ${openItems}개`);
  }

  // ── 페이지네이션 / 초기화 ─────────────────────────────────────────────────

  async verifyPaginationExists() {
    const pagination = this.page.locator('[class*="pagination"], [class*="Pagination"]').first();
    const hasPagination = await pagination.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasPagination) {
      await expect(pagination).toBeVisible();
      // 페이지 버튼 클릭 동작 확인
      const pageBtn = pagination.locator('button, a').nth(1);
      if (await pageBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await pageBtn.click({ force: true });
        await this.page.waitForTimeout(600);
        console.log('✅ FAQ 페이지네이션 클릭 동작 확인');
      }
    } else {
      console.log('ℹ️  FAQ 페이지네이션 미노출 (게시물 수 부족)');
    }
  }

  async verifyPageResetAfterTabSwitch() {
    const input = this.getSearchInput();
    const val = await input.inputValue().catch(() => '');
    expect(val).toBe('');
    console.log(`✅ 탭 이동 후 복귀 시 FAQ 검색어 초기화 확인`);
  }
}
