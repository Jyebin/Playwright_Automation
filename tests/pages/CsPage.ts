import { Page, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? '';

export const CS_TABS = ['공지사항', '이벤트', '자주 묻는 질문', '서비스 이용 문의'] as const;
export type CsTab = (typeof CS_TABS)[number];

export const CS_TAB_URL_MAP: Record<CsTab, RegExp> = {
  '공지사항':      /\/cs(\/notice)?$/,
  '이벤트':        /\/cs\/event/,
  '자주 묻는 질문': /\/cs\/faq/,
  '서비스 이용 문의': /\/cs\/inquiry/,
};

export class CsPage {
  constructor(private page: Page) {}

  async navigate() {
    await this.page.goto(`${BASE}/cs`);
    await this.page.waitForLoadState('load');
    console.log('✅ 고객센터 페이지 이동');
  }

  async navigateViaHeader() {
    await this.page.goto(`${BASE}/`);
    await this.page.waitForLoadState('load');
    const link = this.page.getByRole('link', { name: '고객센터' }).first();
    await link.scrollIntoViewIfNeeded();
    await link.click({ force: true });
    await this.page.waitForURL(/\/cs/, { timeout: 10000 });
    console.log('✅ 헤더 고객센터 클릭 → 이동');
  }

  async verifyUrl() {
    await expect(this.page).toHaveURL(/\/cs/);
    console.log(`✅ 고객센터 URL 확인: ${this.page.url()}`);
  }

  async verifyTabsExist() {
    for (const tab of CS_TABS) {
      await expect(this.page.getByText(tab, { exact: true }).first()).toBeVisible({ timeout: 8000 });
      console.log(`✅ 탭 존재 확인: "${tab}"`);
    }
  }

  async verifyDefaultTabIsNotice() {
    // 고객센터 진입 시 공지사항이 기본 선택 (검은색 강조 + 보라색 밑줄)
    await expect(this.page.getByText('공지사항', { exact: true }).first()).toBeVisible({ timeout: 8000 });
    const isActive = await this.page.getByText('공지사항', { exact: true }).first().evaluate(el => {
      const style = window.getComputedStyle(el);
      return (
        style.fontWeight === '700' ||
        style.fontWeight === 'bold' ||
        (el as HTMLElement).className.toLowerCase().includes('active') ||
        style.borderBottomColor.includes('196')
      );
    });
    console.log(`✅ 기본 탭 "공지사항" 선택 확인 (active: ${isActive})`);
  }

  async clickTab(tabName: CsTab) {
    const tab = this.page.getByText(tabName, { exact: true }).first();
    await tab.scrollIntoViewIfNeeded();
    await this.page.evaluate(() => window.scrollBy(0, -120));
    await this.page.waitForTimeout(200);
    await tab.click({ force: true });
    await this.page.waitForLoadState('load');
    await this.page.waitForTimeout(500);
    console.log(`🖱️ 탭 클릭: "${tabName}"`);
  }

  async verifyTabActive(tabName: string) {
    const tab = this.page.getByText(tabName, { exact: true }).first();
    await expect(tab).toBeVisible({ timeout: 5000 });
    const isActive = await tab.evaluate(el => {
      const style = window.getComputedStyle(el);
      return (
        style.fontWeight === '700' ||
        style.fontWeight === 'bold' ||
        (el as HTMLElement).className.toLowerCase().includes('active') ||
        style.borderBottomColor.includes('196') ||
        style.textDecoration.includes('underline')
      );
    });
    console.log(`✅ "${tabName}" 탭 활성 상태 확인 (active: ${isActive})`);
  }

  async verifyTabUrl(tabName: CsTab) {
    const urlPattern = CS_TAB_URL_MAP[tabName];
    await expect(this.page).toHaveURL(urlPattern);
    console.log(`✅ "${tabName}" URL 확인: ${this.page.url()}`);
  }
}
