import { Page, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? '';

export const HEADER_NAV_LINKS = [
  { name: '이용가이드', url: `${BASE}/guide` },
  { name: '실습장비',   url: `${BASE}/device` },
  { name: '고객센터',   url: `${BASE}/cs` },
  { name: '단체문의',   url: `${BASE}/corporate-inquiry` },
];

export class HeaderPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto(`${BASE}/`);
  }

  async verifyHeaderElements() {
    await expect(this.page.getByAltText('메타데미_로고')).toBeVisible();
    await expect(this.page.getByPlaceholder('실습할 콘텐츠를 검색해보세요.')).toBeVisible();
    for (const { name } of HEADER_NAV_LINKS) {
      await expect(this.page.getByRole('link', { name })).toBeVisible();
    }
    await expect(this.page.getByText('카테고리', { exact: true })).toBeVisible();
    await expect(this.page.getByRole('link', { name: '이벤트' })).toBeVisible();
    console.log('✅ 헤더 구성 확인 완료');
  }

  async clickLogo() {
    await this.page.getByAltText('메타데미_로고').click();
  }

  async clickNavLink(name: string) {
    await this.page.getByRole('link', { name }).click();
    console.log(`🖱️ 헤더 링크 클릭: ${name}`);
  }

  async clickEventLink() {
    await this.page.getByRole('link', { name: '이벤트' }).click();
  }

  async verifySearchPlaceholder() {
    const input = this.page.getByPlaceholder('실습할 콘텐츠를 검색해보세요.');
    await expect(input).toBeVisible();
    const placeholder = await input.getAttribute('placeholder');
    expect(placeholder).toBe('실습할 콘텐츠를 검색해보세요.');
    console.log('✅ 검색창 placeholder 확인');
  }

  async focusSearchBar() {
    await this.page.getByPlaceholder('실습할 콘텐츠를 검색해보세요.').click();
  }

  // 비로그인 상태 버튼
  async clickLoginButton() {
    await this.page.getByRole('link', { name: '로그인' }).click();
  }

  async clickRegisterButton() {
    await this.page.getByRole('link', { name: '회원가입' }).click();
  }

  // 로그인 상태 버튼
  async clickMyPage() {
    await this.page.getByRole('link', { name: '마이페이지' }).click();
  }

  async scrollDown(pixels = 800) {
    await this.page.mouse.wheel(0, pixels);
    await this.page.waitForTimeout(500);
  }

  async scrollToTop() {
    await this.page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await this.page.waitForTimeout(600);
  }

  async verifyHeaderVisible() {
    // <header> 태그 없음 - div.header-container 사용
    const header = this.page.locator('[class*="header-container"]').first();
    await expect(header).toBeVisible();
    console.log('✅ 헤더 노출 확인');
  }

  async hoverInstallButton() {
    await this.page.getByRole('button', { name: /메타데미 설치/ }).hover();
    await this.page.waitForTimeout(400);
  }

  async verifyInstallTooltip() {
    await expect(this.page.getByText(/XR 실습을 진행하기위해/)).toBeVisible({ timeout: 5000 });
    console.log('✅ 설치 버튼 툴팁 확인');
  }
}
