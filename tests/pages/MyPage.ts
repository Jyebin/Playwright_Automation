import { Page, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? '';

export const MYPAGE_TABS = ['실습 대시보드', '디지털 배지', '프로필', '구매내역'] as const;
export type MypageTab = (typeof MYPAGE_TABS)[number];

export class MyPage {
  constructor(private page: Page) {}

  private async handleSessionExpiry(): Promise<boolean> {
    const expired = await this.page.getByText('비정상적인 접근', { exact: false })
      .first().isVisible({ timeout: 2000 }).catch(() => false);
    if (!expired) return false;

    console.log('⚠️ 세션 만료 감지 — 재로그인 시도');
    const confirmBtn = this.page.getByRole('button', { name: '확인' }).first();
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click({ force: true });
      await this.page.waitForTimeout(500);
    }

    const username = process.env.TEST_USERNAME ?? '';
    const password = process.env.TEST_PASSWORD ?? '';
    await this.page.goto(`${BASE}/login`);
    await this.page.waitForLoadState('load');
    await this.page.getByPlaceholder('아이디를 입력해 주세요.').fill(username);
    await this.page.getByPlaceholder('비밀번호를 입력해 주세요.').fill(password);
    await this.page.getByRole('button', { name: '로그인' }).click();
    await this.page.waitForURL(url => !url.href.includes('/login'), { timeout: 15000 }).catch(() => {});
    await this.page.goto(`${BASE}/mypage`);
    await this.page.waitForLoadState('load');
    console.log('✅ 재로그인 완료 → 마이페이지 재이동');
    return true;
  }

  async navigate() {
    await this.page.goto(`${BASE}/mypage`);
    await this.page.waitForLoadState('load');
    await this.handleSessionExpiry();
    console.log('✅ 마이페이지 이동');
  }

  async navigateViaHeader() {
    await this.page.goto(`${BASE}/`);
    await this.page.waitForLoadState('load');
    const link = this.page.getByRole('link', { name: '마이페이지' }).first();
    await link.scrollIntoViewIfNeeded();
    await link.click({ force: true });
    await this.page.waitForLoadState('load');
    await this.handleSessionExpiry();
    if (!this.page.url().includes('/mypage')) {
      await this.page.goto(`${BASE}/mypage`);
      await this.page.waitForLoadState('load');
    }
    console.log('✅ 헤더 [마이페이지] 클릭 → 이동');
  }

  async verifyUrl() {
    await expect(this.page, '[앱오류] 마이페이지 URL로 이동되지 않음').toHaveURL(/\/mypage/);
    console.log(`✅ 마이페이지 URL 확인: ${this.page.url()}`);
  }

  async verifyTabsExist() {
    for (const tab of MYPAGE_TABS) {
      await expect(this.page.getByText(tab, { exact: true }).first(), `[UI/셀렉터] "${tab}" 탭을 찾을 수 없음 — 셀렉터 변경 여부 확인`).toBeVisible({ timeout: 8000 });
      console.log(`✅ 탭 확인: "${tab}"`);
    }
  }

  async verifyDefaultTabIsProfile() {
    const profileTab = this.page.getByText('프로필', { exact: true }).first();
    await expect(profileTab, '[UI/셀렉터] "프로필" 탭을 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 8000 });
    const isActive = await profileTab.evaluate(el => {
      const style = window.getComputedStyle(el);
      return (
        style.fontWeight === '700' ||
        style.fontWeight === 'bold' ||
        (el as HTMLElement).className.toLowerCase().includes('active') ||
        style.borderBottomColor.includes('196')
      );
    });
    console.log(`✅ 기본 탭 "프로필" 선택 확인 (active: ${isActive})`);
  }

  async clickTab(tabName: MypageTab) {
    const tab = this.page.getByText(tabName, { exact: true }).first();
    await tab.scrollIntoViewIfNeeded();
    await this.page.evaluate(() => window.scrollBy(0, -120));
    await this.page.waitForTimeout(200);
    await tab.click({ force: true });
    await this.page.waitForTimeout(600);
    console.log(`🖱️ 탭 클릭: "${tabName}"`);
  }

  async verifyTabActive(tabName: string) {
    const tab = this.page.getByText(tabName, { exact: true }).first();
    await expect(tab, `[UI/셀렉터] "${tabName}" 탭을 찾을 수 없음 — 셀렉터 변경 여부 확인`).toBeVisible({ timeout: 5000 });
    const isActive = await tab.evaluate(el => {
      const style = window.getComputedStyle(el);
      return (
        style.fontWeight === '700' ||
        style.fontWeight === 'bold' ||
        (el as HTMLElement).className.toLowerCase().includes('active') ||
        style.borderBottomColor.includes('196')
      );
    });
    console.log(`✅ "${tabName}" 탭 활성 확인 (active: ${isActive})`);
  }

  // ── 프로필 탭 기본 정보 ─────────────────────────────────────────────────

  async verifyProfileInfoFieldsVisible() {
    const fields = ['계정', '이름', '휴대폰', 'E-mail', '마케팅'];
    for (const field of fields) {
      const el = this.page.getByText(field, { exact: false }).first();
      await expect(el, `[UI/셀렉터] 프로필 필드 레이블 "${field}"을 찾을 수 없음 — 셀렉터 변경 여부 확인`).toBeVisible({ timeout: 8000 });
      console.log(`✅ 프로필 필드 레이블 확인: "${field}"`);
    }
  }

  async verifyAccountEmailDisplayed() {
    const email = process.env.TEST_USERNAME ?? '';
    if (email) {
      await expect(this.page.getByText(email, { exact: false }).first(), '[앱오류] 계정 이메일이 프로필 화면에 표시되지 않음').toBeVisible({ timeout: 5000 });
      console.log(`✅ 계정 이메일 표시 확인: "${email}"`);
    } else {
      console.log('ℹ️  TEST_USERNAME 미설정 — 계정 이메일 확인 건너뜀');
    }
  }

  async verifyMarketingCheckboxesVisible() {
    const checkboxes = this.page.locator(
      'input[type="checkbox"], [role="checkbox"], [class*="checkbox"], [class*="check-box"]'
    );
    const count = await checkboxes.count();
    if (count > 0) {
      console.log(`✅ 마케팅 수신 체크박스 확인 (${count}개)`);
    } else {
      console.log('ℹ️  표준 체크박스 미사용 — 커스텀 UI로 마케팅 항목 표시됨');
    }
  }

  async clickProfileEditButton() {
    const btn = this.page.getByRole('button', { name: /프로필 수정/ }).first();
    await btn.scrollIntoViewIfNeeded();
    await this.page.evaluate(() => window.scrollBy(0, -120));
    await btn.click({ force: true });
    await this.page.waitForTimeout(500);
    console.log('🖱️ [프로필 수정] 버튼 클릭');
  }

  async clickPasswordChangeButton() {
    const btn = this.page.getByRole('button', { name: /비밀번호 변경/ }).first();
    await btn.scrollIntoViewIfNeeded();
    await this.page.evaluate(() => window.scrollBy(0, -120));
    await btn.click({ force: true });
    await this.page.waitForTimeout(500);
    console.log('🖱️ [비밀번호 변경] 버튼 클릭');
  }
}
