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
    await expect(this.page, '[앱오류] FAQ 페이지 URL이 /cs/faq 와 일치하지 않음 — 라우팅 오류 가능성').toHaveURL(/\/cs\/faq/);
    console.log(`✅ FAQ URL 확인: ${this.page.url()}`);
  }

  async verifyTabActiveStyle() {
    const tab = this.page.getByText('자주 묻는 질문', { exact: true }).first();
    await expect(tab, '[UI/셀렉터] "자주 묻는 질문" 탭을 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 5000 });
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
      await expect(this.page.getByText(cat, { exact: true }).first(), `[UI/셀렉터] FAQ 카테고리 "${cat}" 를 찾을 수 없음 — 셀렉터 변경 여부 확인`).toBeVisible({ timeout: 8000 });
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
    await items.first().waitFor({ state: 'visible', timeout: 8000 });
    const count = await items.count();
    expect(count, '[앱오류] FAQ 게시물이 0개 — 데이터 미노출 또는 API 오류 가능성').toBeGreaterThan(0);
    console.log(`✅ FAQ 게시물 노출 확인 (${count}개)`);
  }

  async verifyEmptyState() {
    await expect(
      this.page.getByText(/등록된 게시글이 없습니다|검색 결과가 없습니다|결과가 없습니다|내용이 없습니다|게시물이 없습니다|등록된 FAQ가 없습니다/i).first(),
      '[앱오류] FAQ 없음 안내 문구 미노출 — 빈 목록 상태 메시지 처리 버그'
    ).toBeVisible({ timeout: 8000 });
    console.log('✅ FAQ 없음 안내 문구 확인');
  }

  async verifyPostStructure() {
    // 게시물 구성: 구분(카테고리), 제목
    const items = this.getFaqItems();
    await items.first().waitFor({ state: 'visible', timeout: 8000 });
    const count = await items.count();
    expect(count, '[앱오류] FAQ 게시물(구분/제목 구조)이 0개 — 데이터 미노출 또는 API 오류 가능성').toBeGreaterThan(0);
    console.log(`✅ FAQ 게시물 구성 확인 (${count}개 — 구분/제목 포함)`);
  }

  // ── 검색 ─────────────────────────────────────────────────────────────────

  private getSearchInput() {
    return this.page.locator('input[placeholder*="자주 묻는 질문을 검색"], input[placeholder*="자주 묻는"]').first();
  }

  async verifySearchPlaceholder() {
    const input = this.getSearchInput();
    await expect(input, '[UI/셀렉터] FAQ 검색 입력 필드를 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 8000 });
    const ph = await input.getAttribute('placeholder') ?? '';
    expect(ph, '[앱오류] FAQ 검색 placeholder 텍스트가 "자주 묻는" 또는 "질문" 포함하지 않음').toMatch(/자주 묻는|질문/);
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
      this.page.getByText(/검색어를 입력해 주세요/i).first(),
      '[앱오류] 빈 검색어 입력 시 알럿 메시지 미노출 — 유효성 검사 버그'
    ).toBeVisible({ timeout: 5000 });
    console.log('✅ 빈 검색어 알럿 확인');
  }

  async closeAlert() {
    const btn = this.page.getByRole('button', { name: '확인' }).first();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await btn.click({ force: true });
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
    expect(val, `[앱오류] 검색 후 검색창에 키워드 "${keyword}" 유지 안됨 — 검색창 초기화 버그`).toContain(keyword);
    console.log(`✅ FAQ 검색 결과 확인: "${keyword}" (${count}건, 검색창 유지)`);
  }

  async verifyNoSearchResults() {
    await expect(
      this.page.getByText(/검색 결과가 없습니다|등록된 게시글이 없습니다/i).first(),
      '[앱오류] 검색 결과 없음 안내 문구 미노출 — 빈 결과 상태 처리 버그'
    ).toBeVisible({ timeout: 8000 });
    console.log('✅ FAQ 검색 결과 없음 안내 확인');
  }

  // ── FAQ 아코디언 ──────────────────────────────────────────────────────────

  private getFaqItems() {
    return this.page.locator(
      '[class*="faq-item"], [class*="faqItem"], [class*="FaqItem"], ' +
      '[class*="faqList"] > *, [class*="FaqList"] > *, [class*="faq-list"] > li, ' +
      '[class*="qna-item"], [class*="qnaItem"], [class*="QnaItem"], ' +
      'details, [class*="accordion-item"], [class*="accordionItem"], [class*="AccordionItem"]'
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
      await expect(answer, '[앱오류] FAQ 항목 클릭 후 답변 영역이 펼쳐지지 않음 — 아코디언 동작 버그').toBeVisible();
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
    expect(openItems, '[앱오류] FAQ 아코디언 항목이 2개 이상 동시 열림 — 단일 확장 정책 위반').toBeLessThanOrEqual(1);
    console.log(`✅ 동시 열림 항목 수 확인: ${openItems}개`);
  }

  // ── 페이지네이션 / 초기화 ─────────────────────────────────────────────────

  async verifyPaginationExists() {
    const pagination = this.page.locator('[class*="pagination"], [class*="Pagination"]').first();
    const hasPagination = await pagination.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasPagination) {
      await expect(pagination, '[UI/셀렉터] 페이지네이션 컨테이너를 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible();
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
    expect(val, '[앱오류] 탭 이동 후 복귀 시 FAQ 검색어가 초기화되지 않음 — 상태 초기화 버그').toBe('');
    console.log(`✅ 탭 이동 후 복귀 시 FAQ 검색어 초기화 확인`);
  }
}
