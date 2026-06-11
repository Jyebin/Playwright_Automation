import { Page, expect } from '@playwright/test';

export class SearchPage {
  constructor(private page: Page) {}

  get searchInput() {
    return this.page.getByPlaceholder('실습할 콘텐츠를 검색해보세요.');
  }

  // span.border가 포인터 이벤트 차단 → JS 직접 click으로 우회
  private async clickSearchIcon() {
    await this.page.evaluate(() => {
      const icon = document.querySelector('[class*="ri-search-line"]') as HTMLElement;
      if (icon) icon.click();
    });
  }

  async search(keyword: string) {
    await this.searchInput.fill(keyword);
    await this.searchInput.press('Enter');
    await this.page.waitForURL(/\/contents/);
    await this.page.waitForLoadState('networkidle');
  }

  async searchByButton(keyword: string) {
    await this.searchInput.fill(keyword);
    await this.clickSearchIcon();
    await this.page.waitForURL(/\/contents/);
    await this.page.waitForLoadState('networkidle');
  }

  async searchEmpty() {
    await this.searchInput.click();
    await this.searchInput.press('Enter');
    await this.page.waitForURL(/\/contents/);
  }

  async searchEmptyByButton() {
    await this.clickSearchIcon();
    await this.page.waitForURL(/\/contents/);
  }

  async verifyOnContentsPage() {
    await expect(this.page).toHaveURL(/\/contents/);
    console.log(`✅ 콘텐츠 페이지 이동 확인: ${this.page.url()}`);
  }

  async verifySearchResultTitle(keyword: string) {
    // 실제 텍스트: "간호(으)로 검색한 결과입니다." → RePageHeader 엘리먼트에 있음
    await expect(this.page.locator('[class*="RePageHeader"]')).toBeVisible({ timeout: 8000 });
    const headerText = await this.page.locator('[class*="RePageHeader"]').textContent();
    expect(headerText).toContain(keyword);
    console.log(`✅ 검색 결과 문구 확인: "${headerText?.trim()}"`);
  }

  async verifyKeywordPersists(keyword: string) {
    const value = await this.searchInput.inputValue();
    expect(value).toBe(keyword);
    console.log(`✅ 검색어 잔여 확인: "${value}"`);
  }

  async verifyNoResults() {
    await expect(this.page.getByText('검색 결과가 없습니다.')).toBeVisible({ timeout: 8000 });
    console.log('✅ 검색 결과 없음 메세지 확인');
  }
}
