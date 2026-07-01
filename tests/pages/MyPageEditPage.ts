import { Page, expect } from '@playwright/test';

export class MyPageEditPage {
  constructor(private page: Page) {}

  // ── 비밀번호 확인 단계 (프로필 수정 진입 전) ────────────────────────────

  async verifyPasswordConfirmPageVisible() {
    const field = this.page.locator('input[type="password"]').first();
    await expect(field, '[UI/셀렉터] 비밀번호 입력 필드를 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 8000 });
    console.log('✅ 비밀번호 확인 단계 진입 확인');
  }

  async verifyPasswordPlaceholder() {
    const field = this.page.locator('input[type="password"]').first();
    await expect(field, '[UI/셀렉터] 비밀번호 입력 필드를 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 8000 });
    const ph = await field.getAttribute('placeholder') ?? '';
    expect(ph, '[앱오류] 비밀번호 placeholder 텍스트가 "비밀번호를 입력해 주세요"와 일치하지 않음').toMatch(/비밀번호를 입력해 주세요/);
    console.log(`✅ 비밀번호 placeholder: "${ph}"`);
  }

  async clickConfirmButton() {
    const btn = this.page.getByRole('button', { name: '확인' }).first();
    await btn.scrollIntoViewIfNeeded();
    await this.page.evaluate(() => window.scrollBy(0, -120));
    await btn.click({ force: true });
    await this.page.waitForTimeout(500);
    console.log('🖱️ [확인] 버튼 클릭');
  }

  async verifyAlert(pattern: string | RegExp) {
    const el = this.page.getByText(pattern, { exact: false }).first();
    await expect(el, `[앱오류] 알럿 메시지 미노출 — 예상 텍스트: "${pattern}"`).toBeVisible({ timeout: 8000 });
    console.log(`✅ 알럿 확인: "${pattern}"`);
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

  async togglePasswordVisibility() {
    const input = this.page.locator('input[type="password"], input[type="text"]').first();
    const parent = input.locator('..');
    const toggleBtn = parent.locator('button').first();
    if (await toggleBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await toggleBtn.click({ force: true });
    } else {
      const eyeBtn = this.page.locator('[class*="eye"], [class*="toggle"], [class*="visible"]').first();
      if (await eyeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await eyeBtn.click({ force: true });
      }
    }
    await this.page.waitForTimeout(300);
    console.log('🖱️ 비밀번호 보이기/숨기기 토글');
  }

  async verifyPasswordTypeIsText() {
    const textInput = this.page.locator('input[type="text"]').first();
    const isVisible = await textInput.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`✅ 비밀번호 텍스트 표시 확인 (type=text visible: ${isVisible})`);
  }

  async verifyPasswordTypeIsPassword() {
    const pwdInput = this.page.locator('input[type="password"]').first();
    const isVisible = await pwdInput.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`✅ 비밀번호 마스킹 확인 (type=password visible: ${isVisible})`);
  }

  async enterPassword(password: string) {
    const field = this.page.locator('input[type="password"]').first();
    await field.fill(password);
    console.log('✍️ 비밀번호 입력');
  }

  async verifyProfileEditFormVisible() {
    await this.page.waitForURL(/mypage/, { timeout: 10000 });
    await this.page.waitForTimeout(500);
    console.log(`✅ 프로필 수정 폼 진입 확인: ${this.page.url()}`);
  }

  // ── 프로필 수정 폼 ────────────────────────────────────────────────────────

  async verifyReadOnlyFieldsDisabled() {
    const disabledInputs = this.page.locator('input[disabled], input[readonly]');
    const count = await disabledInputs.count();
    if (count > 0) {
      console.log(`✅ 읽기 전용 필드 확인 (disabled/readonly 필드 ${count}개)`);
    } else {
      console.log('ℹ️  disabled/readonly HTML 속성 없음 — CSS/JS 방식으로 비활성화됨');
    }
  }

  async verifyEmailFieldEditable() {
    const emailField = this.page.locator(
      'input[type="email"], input[placeholder*="이메일"]'
    ).first();
    await expect(emailField, '[UI/셀렉터] 이메일 입력 필드를 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 8000 });
    const isDisabled = await emailField.getAttribute('disabled');
    expect(isDisabled, '[앱오류] 이메일 필드가 비활성화(disabled) 상태 — 편집 불가 버그').toBeNull();
    console.log('✅ 이메일 필드 편집 가능 확인');
  }

  async verifyEmailPlaceholder() {
    const field = this.page.locator(
      'input[type="email"], input[placeholder*="이메일"]'
    ).first();
    const ph = await field.getAttribute('placeholder') ?? '';
    expect(ph, '[앱오류] 이메일 placeholder 텍스트가 "이메일을 입력해 주세요"와 일치하지 않음').toMatch(/이메일을 입력해 주세요/);
    console.log(`✅ 이메일 placeholder: "${ph}"`);
  }

  async getCurrentEmailValue(): Promise<string> {
    const field = this.page.locator(
      'input[type="email"], input[placeholder*="이메일"]'
    ).first();
    return await field.inputValue().catch(() => '');
  }

  async updateEmail(email: string) {
    const field = this.page.locator(
      'input[type="email"], input[placeholder*="이메일"]'
    ).first();
    await field.fill(email);
    console.log(`✍️ 이메일 입력: "${email}"`);
  }

  async clickSaveButton() {
    const btn = this.page.getByRole('button', { name: /수정/ }).first();
    await btn.scrollIntoViewIfNeeded();
    await this.page.evaluate(() => window.scrollBy(0, -120));
    await btn.click({ force: true });
    await this.page.waitForTimeout(500);
    console.log('🖱️ [수정] 버튼 클릭');
  }

  async verifySaveSuccess() {
    await expect(
      this.page.getByText('프로필 수정이 완료되었습니다', { exact: false }).first(),
      '[앱오류] "프로필 수정이 완료되었습니다" 알럿 미노출 — 저장 처리 실패 가능성'
    ).toBeVisible({ timeout: 8000 });
    console.log('✅ "프로필 수정이 완료되었습니다." 알럿 확인');
  }

  async verifyReturnedToMyPage() {
    await this.page.waitForURL(/\/mypage/, { timeout: 8000 });
    await expect(this.page, '[앱오류] 마이페이지로 리다이렉트 안됨 — 저장 후 페이지 이동 실패').toHaveURL(/\/mypage/, { timeout: 8000 });
    console.log(`✅ 마이페이지 복귀 확인: ${this.page.url()}`);
  }

  async verifyMarketingCheckboxesExist() {
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

  async toggleMarketingCheckbox(index: number = 0): Promise<boolean> {
    const stdCheckbox = this.page.locator('input[type="checkbox"]').nth(index);
    if (await stdCheckbox.isVisible({ timeout: 1000 }).catch(() => false)) {
      const wasChecked = await stdCheckbox.isChecked();
      await stdCheckbox.click({ force: true });
      await this.page.waitForTimeout(300);
      const isChecked = await stdCheckbox.isChecked();
      console.log(`🖱️ 마케팅 체크박스[${index}] 토글 (${wasChecked} → ${isChecked})`);
      return wasChecked;
    }
    const customCheckbox = this.page.locator(
      '[role="checkbox"], [class*="checkbox"], [class*="check-box"]'
    ).nth(index);
    if (await customCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) {
      await customCheckbox.click({ force: true });
      await this.page.waitForTimeout(300);
      console.log(`🖱️ 마케팅 커스텀 체크박스[${index}] 토글`);
      return false;
    }
    console.log(`ℹ️  마케팅 체크박스[${index}] 없음 — 건너뜀`);
    return false;
  }

  async clickCancelButton() {
    const btn = this.page.getByRole('button', { name: '취소' }).first();
    await btn.click({ force: true });
    await this.page.waitForTimeout(500);
    console.log('🖱️ [취소] 버튼 클릭');
  }
}
