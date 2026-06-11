import { test, expect } from '@playwright/test';
import { FooterPage, FAMILY_SITES } from './pages/FooterPage';

const BASE = process.env.BASE_URL ?? '';

// T397 - 푸터 검증
test.describe('T397 - 푸터', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/`);
  });

  test('푸터 회사 정보 노출', async ({ page }) => {
    const footer = new FooterPage(page);
    await footer.scrollToFooter();
    await footer.verifyCompanyInfo();
  });

  test('회사소개 링크 이동', async ({ page }) => {
    const footer = new FooterPage(page);
    await footer.scrollToFooter();
    await footer.clickFooterLink('회사소개');
    await expect(page).toHaveURL(`${BASE}/company`);
    console.log('✅ 회사소개 링크 이동');
  });

  test('개인정보 처리방침 링크 이동', async ({ page }) => {
    const footer = new FooterPage(page);
    await footer.scrollToFooter();
    await footer.clickFooterLink('개인정보 처리방침');
    await expect(page).toHaveURL(/privacy-policy/);
    console.log('✅ 개인정보 처리방침 링크 이동');
  });

  test('이용약관 링크 이동', async ({ page }) => {
    const footer = new FooterPage(page);
    await footer.scrollToFooter();
    await footer.clickFooterLink('이용약관');
    await expect(page).toHaveURL(/agreement/);
    console.log('✅ 이용약관 링크 이동');
  });

  test('제휴 문의 링크 이동', async ({ page }) => {
    const footer = new FooterPage(page);
    await footer.scrollToFooter();
    await footer.clickFooterLink('제휴 문의');
    await expect(page).toHaveURL(/\/cs\/inquiry/);
    console.log('✅ 제휴 문의 링크 이동');
  });

  test('FamilySite 드롭다운 항목 노출', async ({ page }) => {
    const footer = new FooterPage(page);
    await footer.scrollToFooter();
    await footer.verifyFamilySiteDropdownItems();
  });

  for (const site of FAMILY_SITES) {
    test(`FamilySite - ${site.name} 클릭 시 새 탭 오픈`, async ({ page }) => {
      const footer = new FooterPage(page);
      await footer.scrollToFooter();
      await footer.openFamilySiteDropdown();
      const popup = await footer.clickFamilySiteItem(site.name);
      // 팝업이 열렸으면 성공 (about:blank가 아닌 실제 URL)
      expect(popup.url()).not.toBe('');
      console.log(`✅ FamilySite 새 탭 오픈: ${site.name} → ${popup.url()}`);
      await popup.close();
    });
  }

  test('SNS 블로그 링크 새 탭 오픈', async ({ page }) => {
    const footer = new FooterPage(page);
    await footer.scrollToFooter();
    const popup = await footer.clickSnsLink('blog.naver.com');
    expect(popup.url()).toMatch(/naver\.com/);
    await popup.close();
  });

  test('SNS 인스타그램 링크 새 탭 오픈', async ({ page }) => {
    const footer = new FooterPage(page);
    await footer.scrollToFooter();
    const popup = await footer.clickSnsLink('instagram.com');
    expect(popup.url()).toMatch(/instagram\.com/);
    await popup.close();
  });

  test('SNS 페이스북 링크 새 탭 오픈', async ({ page }) => {
    const footer = new FooterPage(page);
    await footer.scrollToFooter();
    const popup = await footer.clickSnsLink('facebook.com');
    expect(popup.url()).toMatch(/facebook\.com/);
    await popup.close();
  });

  test('SNS 유튜브 링크 새 탭 오픈', async ({ page }) => {
    const footer = new FooterPage(page);
    await footer.scrollToFooter();
    const popup = await footer.clickSnsLink('youtube.com');
    expect(popup.url()).toMatch(/youtube\.com/);
    await popup.close();
  });
});
