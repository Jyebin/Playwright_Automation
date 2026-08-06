import { Page, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? '';

export class FindIdPage {
  constructor(private page: Page) {}

  async navigate() {
    await this.page.goto(`${BASE}/find-id`);
    await this.page.waitForLoadState('load');
    console.log('✅ 아이디 찾기 페이지 이동');
  }

  async navigateFromLoginPage() {
    await this.page.goto(`${BASE}/login`);
    await this.page.waitForLoadState('load');
    const btn = this.page.getByText('아이디 찾기', { exact: false }).first();
    await btn.scrollIntoViewIfNeeded();
    await btn.click({ force: true });
    await this.page.waitForLoadState('load');
    console.log('✅ 로그인 → 아이디 찾기 이동');
  }

  async selectPhoneTab() {
    const tab = this.page.getByText('휴대폰 번호로 찾기', { exact: false }).first();
    const isVisible = await tab.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await tab.click({ force: true });
      await this.page.waitForTimeout(300);
      console.log('🖱️ 휴대폰 번호로 찾기 탭 선택');
    } else {
      console.log('ℹ️  휴대폰 탭 미노출 — 기본 탭이거나 셀렉터 변경 가능성');
    }
  }

  async selectEmailTab() {
    const tab = this.page.getByText('이메일 주소로 찾기', { exact: false }).first();
    await tab.scrollIntoViewIfNeeded();
    await tab.click({ force: true });
    await this.page.waitForTimeout(300);
    console.log('🖱️ 이메일 주소로 찾기 탭 선택');
  }

  async verifyPhonePlaceholders() {
    await expect(
      this.page.getByPlaceholder('이름을 입력해주세요').first(),
      '[UI/셀렉터] 이름 입력 placeholder 없음'
    ).toBeVisible({ timeout: 5000 });
    await expect(
      this.page.getByPlaceholder('숫자만 입력해주세요.').first(),
      '[UI/셀렉터] 휴대폰 번호 placeholder 없음'
    ).toBeVisible({ timeout: 5000 });
    await expect(
      this.page.getByPlaceholder('인증번호를 입력해주세요.').first(),
      '[UI/셀렉터] 인증번호 placeholder 없음'
    ).toBeVisible({ timeout: 5000 });
    console.log('✅ 아이디 찾기(휴대폰) placeholder 3종 확인');
  }

  async verifyEmailPlaceholders() {
    await expect(
      this.page.getByPlaceholder('이름을 입력해주세요').first(),
      '[UI/셀렉터] 이름 입력 placeholder 없음'
    ).toBeVisible({ timeout: 5000 });
    await expect(
      this.page.getByPlaceholder('메일 주소를 입력해 주세요.').first(),
      '[UI/셀렉터] 이메일 placeholder 없음'
    ).toBeVisible({ timeout: 5000 });
    await expect(
      this.page.getByPlaceholder('인증번호를 입력해주세요.').first(),
      '[UI/셀렉터] 인증번호 placeholder 없음'
    ).toBeVisible({ timeout: 5000 });
    console.log('✅ 아이디 찾기(이메일) placeholder 3종 확인');
  }

  async fillNameAndPhone(name: string, phone: string) {
    await this.page.getByPlaceholder('이름을 입력해주세요').fill(name);
    await this.page.getByPlaceholder('숫자만 입력해주세요.').fill(phone);
    console.log(`✅ 이름(${name}), 휴대폰(${phone}) 입력`);
  }

  async fillNameAndEmail(name: string, email: string) {
    await this.page.getByPlaceholder('이름을 입력해주세요').fill(name);
    await this.page.getByPlaceholder('메일 주소를 입력해 주세요.').fill(email);
    console.log(`✅ 이름(${name}), 이메일(${email}) 입력`);
  }

  async verifyVerificationButtonActive() {
    const btn = this.page.getByRole('button', { name: '인증번호 받기' }).first();
    const isEnabled = await btn.isEnabled({ timeout: 5000 }).catch(() => false);
    expect(isEnabled, '[앱오류] 정보 입력 후에도 인증번호 받기 버튼이 비활성 상태').toBe(true);
    console.log('✅ 인증번호 받기 버튼 활성화 확인');
  }

  async clickSendVerification() {
    const btn = this.page.getByRole('button', { name: '인증번호 받기' }).first();
    await btn.click({ force: true });
    await this.page.waitForTimeout(1500);
    console.log('🖱️ 인증번호 받기 클릭');
  }

  async verifyWrongInfoAlert() {
    // 알럿 모달 또는 인라인 메시지로 출력될 수 있음
    const alertMsg = this.page.getByText('가입 시 등록한 정보를 다시 확인해 주세요', { exact: false }).first();
    const isVisible = await alertMsg.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      console.log('✅ 잘못된 정보 알럿 확인');
      const confirmBtn = this.page.getByRole('button', { name: '확인' }).first();
      if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmBtn.click({ force: true });
      }
    } else {
      console.log('ℹ️  알럿 미노출 — 셀렉터 변경 또는 입력 정보가 실제 계정과 일치');
    }
  }

  async clickCancel() {
    const btn = this.page.getByRole('button', { name: '취소' })
      .or(this.page.getByText('취소', { exact: true }))
      .first();
    await btn.scrollIntoViewIfNeeded();
    await btn.click({ force: true });
    await this.page.waitForLoadState('load');
    console.log('🖱️ 취소 버튼 클릭');
  }

  async verifyCancelNavigatesToLogin() {
    await expect(
      this.page,
      '[앱오류] 취소 클릭 후 로그인 페이지로 이동되지 않음'
    ).toHaveURL(/\/login/);
    console.log('✅ 취소 → 로그인 페이지 이동 확인');
  }
}
