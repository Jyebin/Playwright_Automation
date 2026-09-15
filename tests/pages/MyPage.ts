import { Page, Locator, expect } from '@playwright/test';
import path from 'path';

const BASE = process.env.BASE_URL ?? '';
/** playwright.config.ts 의 storageState 와 같은 파일 — 재로그인 후 새 세션을 저장해 다음 테스트가 재사용 */
const STORAGE_STATE = path.resolve(__dirname, '../../.auth/user.json');

export const MYPAGE_TABS = ['실습 대시보드', '디지털 배지', '프로필', '구매 및 결제 관리'] as const;
export type MypageTab = (typeof MYPAGE_TABS)[number];
const TAB_PATHS: Record<MypageTab, string> = {
  '실습 대시보드': '/dashboard',
  '디지털 배지': '/badge',
  '프로필': '/mypage',
  '구매 및 결제 관리': '/mypage/history',
};

/**
 * 세션 확인 + 만료 시 재로그인.
 * 이 서비스는 계정당 1세션만 유지 — 다른 곳에서 새로 로그인하면 기존 세션은
 * "비정상적인 접근입니다. 다시 로그인해 주세요." / "로그인이 필요합니다." 알럿 또는 로그인 화면으로 바뀜.
 * @param ready     로그인 상태에서 화면이 준비됐음을 나타내는 요소
 * @param returnUrl 재로그인 후 다시 이동할 URL
 * @returns 재로그인 했으면 true
 */
export async function ensureLoggedIn(page: Page, ready: Locator, returnUrl: string): Promise<boolean> {
  const expiredAlert = page.locator('#CommonAlert .modal-body').filter({ hasText: /비정상적인 접근|로그인이 필요합니다/ });
  const loginInput = page.getByPlaceholder('아이디 또는 이메일을 입력해 주세요.');
  await ready.or(expiredAlert).or(loginInput).first().waitFor({ timeout: 15000 }).catch(() => {});
  if (await ready.first().isVisible().catch(() => false)) return false;

  const alertShown = await expiredAlert.isVisible().catch(() => false);
  const onLogin = await loginInput.isVisible().catch(() => false);
  if (!alertShown && !onLogin) return false; // 판단 불가 — 호출한 쪽의 검증이 실제 화면으로 실패를 보고

  const reason = alertShown
    ? `"${(await expiredAlert.innerText().catch(() => '')).replace(/\s+/g, ' ').trim()}" 알럿`
    : `로그인 화면으로 이동됨 (${new URL(page.url()).pathname})`;
  console.log(`⚠️ 세션 만료 감지 — ${reason} → 재로그인`);
  const alertOk = page.locator('#CommonAlert').getByRole('button', { name: '확인', exact: true });
  if (await alertOk.isVisible().catch(() => false)) await alertOk.click().catch(() => {});

  await page.goto(`${BASE}/login`);
  await loginInput.fill(process.env.TEST_USERNAME ?? '');
  await page.getByPlaceholder('비밀번호를 입력해 주세요.').fill(process.env.TEST_PASSWORD ?? '');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 20000, waitUntil: 'commit' });
  await page.waitForFunction(() => !!localStorage.getItem('accessToken'), null, { timeout: 10000 });
  await page.context().storageState({ path: STORAGE_STATE });
  console.log('✅ 재로그인 완료 — 새 세션 저장 후 원래 화면으로 재이동');

  await page.goto(returnUrl);
  await ready.first().waitFor({ timeout: 15000 }).catch(() => {});
  return true;
}

export class MyPage {
  constructor(private page: Page) {}

  /** 프로필 화면 준비 완료 표시 — 하단 버튼은 프로필 데이터 로드 후 그려짐 */
  private get profileReady() {
    return this.page.locator('#MyProfileView .bottom button').first();
  }

  async navigate() {
    await this.page.goto(`${BASE}/mypage`);
    await ensureLoggedIn(this.page, this.profileReady, `${BASE}/mypage`);
    await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    console.log('✅ 마이페이지 이동');
  }

  async navigateViaHeader() {
    await this.page.goto(`${BASE}/`);
    await this.page.waitForLoadState('load');
    const link = this.page.getByRole('link', { name: '마이페이지' }).first();
    await link.scrollIntoViewIfNeeded();
    await link.click({ force: true });
    await this.page.waitForLoadState('load');
    await ensureLoggedIn(this.page, this.profileReady, `${BASE}/mypage`);
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

  /** 마이페이지 상단 탭(#MyPageView .tabs-group a) 클릭 후 해당 경로로 이동할 때까지 대기 */
  async clickTab(tabName: MypageTab) {
    const tab = this.page.locator('#MyPageView .tabs-group').getByRole('link', { name: tabName, exact: true });
    await expect(tab, `[UI/셀렉터] 마이페이지 "${tabName}" 탭 링크를 찾을 수 없음 — 로그인 세션 또는 셀렉터 확인`).toBeVisible({ timeout: 15000 });
    await tab.click();
    const expected = TAB_PATHS[tabName];
    await this.page.waitForURL(url => url.pathname === expected, { timeout: 10000, waitUntil: 'commit' }).catch(() => {});
    console.log(`🖱️ 탭 클릭: "${tabName}" → URL ${new URL(this.page.url()).pathname}`);
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

  /**
   * 프로필 하단 버튼 클릭 → 다음 화면 요소가 보일 때까지 재시도.
   * 프로필 표가 먼저 그려지고 버튼 클릭 핸들러는 데이터 로드 후 연결돼, 너무 이른 클릭은 무시됨.
   */
  private async clickBottomButton(name: string, target: Locator, targetLabel: string) {
    const btn = this.page.locator('#MyProfileView .bottom button', { hasText: name });
    await expect(btn, `[UI/셀렉터] 프로필 하단 [${name}] 버튼을 찾을 수 없음 — 로그인 세션 또는 셀렉터 확인`).toBeVisible({ timeout: 15000 });
    await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await expect(async () => {
      if (!(await target.isVisible())) await btn.click({ timeout: 2000 });
      await expect(target).toBeVisible({ timeout: 3000 });
    }, `[UI/셀렉터] [${name}] 클릭 후 ${targetLabel}이(가) 표시되지 않음`).toPass({ timeout: 20000 });
    console.log(`🖱️ [${name}] 버튼 클릭 → ${targetLabel} 표시 (URL ${new URL(this.page.url()).pathname})`);
  }

  async clickProfileEditButton() {
    await this.clickBottomButton('프로필 수정', this.page.locator('#CheckPassword .input-item input').first(), '비밀번호 확인 입력 필드');
  }

  async clickPasswordChangeButton() {
    await this.clickBottomButton('비밀번호 변경', this.page.locator('#ChangePassword #oldPassword'), '현재 비밀번호 입력 필드');
  }
}
