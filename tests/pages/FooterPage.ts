import { Page, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? '';

export const FOOTER_LINKS = [
  { name: '회사소개',           url: `${BASE}/company` },
  { name: '개인정보 처리방침',   url: /privacy-policy/ },
  { name: '이용약관',           url: /agreement/ },
];

export const FAMILY_SITES = [
  { name: 'Raon IT Group',          url: /raon\.com/ },
  { name: 'RaonSecure',             url: /raonsecure\.com/ },
  { name: 'RaonVentures',           url: /raon\.vc/ },
  { name: 'INBIZNET',               url: /inbiznetcorp\.com/ },
  { name: 'Digital Trust Networks', url: /digitaltrustnetworks\.com/ },
  { name: 'OmniOne',                url: /omnione\.net/ },
  { name: 'Security IQ UP',         url: /squp\.kr/ },
];

export const SNS_LINKS = [
  { label: 'blog',      url: /naver\.com/ },
  { label: 'instagram', url: /instagram\.com/ },
  { label: 'facebook',  url: /facebook\.com/ },
  { label: 'youtube',   url: /youtube\.com/ },
];

export class FooterPage {
  constructor(private page: Page) {}

  async scrollToFooter() {
    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await this.page.waitForTimeout(600);
  }

  async verifyCompanyInfo() {
    const footer = this.page.locator('footer');
    await expect(footer.getByText('라온메타(주)')).toBeVisible();
    await expect(footer.getByText('이순형')).toBeVisible();
    await expect(footer.getByText('702-86-03034')).toBeVisible();
    await expect(footer.getByText('02-761-4540')).toBeVisible();
    await expect(footer.getByText('metademy@raon.com')).toBeVisible();
    await expect(footer.getByText(/여의대로 108/)).toBeVisible();
    await expect(footer.getByText(/제2024-서울마포-3005호/)).toBeVisible();
    await expect(footer.getByText(/RaonMeta All rights reserved/)).toBeVisible();
    console.log('✅ 푸터 회사 정보 확인');
  }

  async verifyFamilySiteDropdownItems() {
    await this.page.locator('footer').getByText('FamilySite').click();
    await this.page.waitForTimeout(400);
    for (const site of FAMILY_SITES) {
      await expect(this.page.getByText(site.name, { exact: true })).toBeVisible();
      console.log(`✅ FamilySite 항목 확인: ${site.name}`);
    }
  }

  async clickFooterLink(name: string) {
    await this.page.locator('footer').getByRole('link', { name }).click();
    console.log(`🖱️ 푸터 링크 클릭: ${name}`);
  }

  async clickFamilySiteItem(name: string) {
    // FamilySite 항목은 <li><p>텍스트</p></li> 구조 - onclick으로 window.open
    const item = this.page.locator('.dropdown-list').getByText(name, { exact: true });
    const [popup] = await Promise.all([
      this.page.context().waitForEvent('page', { timeout: 15000 }),
      item.click(),
    ]);
    await popup.waitForLoadState('domcontentloaded', { timeout: 15000 });
    console.log(`🖱️ FamilySite 클릭: ${name} → ${popup.url()}`);
    return popup;
  }

  async clickSnsLink(hrefPattern: string) {
    // SNS 링크는 텍스트 없이 아이콘만 있으므로 href로 식별
    const link = this.page.locator(`footer a[href*="${hrefPattern}"]`).first();
    const [popup] = await Promise.all([
      this.page.context().waitForEvent('page'),
      link.click(),
    ]);
    await popup.waitForLoadState('domcontentloaded');
    console.log(`🖱️ SNS 클릭: href*="${hrefPattern}" → ${popup.url()}`);
    return popup;
  }

  async openFamilySiteDropdown() {
    await this.page.locator('footer').getByText('FamilySite').click();
    await this.page.waitForTimeout(400);
    console.log('🖱️ FamilySite 드롭다운 열기');
  }
}
