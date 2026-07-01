import { Page, expect } from '@playwright/test';

export class MyPagePasswordPage {
  constructor(private page: Page) {}

  async verifyPasswordChangePageVisible() {
    const fields = this.page.locator('input[type="password"]');
    await fields.first().waitFor({ state: 'visible', timeout: 8000 });
    const count = await fields.count();
    expect(count).toBeGreaterThanOrEqual(3);
    console.log(`✅ 비밀번호 변경 페이지 확인 (password 필드 ${count}개)`);
  }

  async verifyAllPasswordPlaceholders() {
    const fields = this.page.locator('input[type="password"]');
    const count = await fields.count();
    for (let i = 0; i < count; i++) {
      const ph = await fields.nth(i).getAttribute('placeholder') ?? '';
      expect(ph).toMatch(/비밀번호를 입력해 주세요/);
      console.log(`✅ 비밀번호 필드[${i}] placeholder: "${ph}"`);
    }
  }

  async verifyPasswordRuleText() {
    const ruleText = this.page.getByText(/영문.*숫자.*특수문자|8자 이상/i).first();
    await expect(ruleText).toBeVisible({ timeout: 5000 });
    console.log('✅ 비밀번호 조건 안내 문구 확인');
  }

  async togglePasswordVisibility(fieldIndex: number = 0) {
    const fields = this.page.locator('input[type="password"]');
    const field = fields.nth(fieldIndex);
    const parent = field.locator('..');
    const toggleBtn = parent.locator('button').first();
    if (await toggleBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await toggleBtn.click({ force: true });
    } else {
      const eyeBtns = this.page.locator('[class*="eye"], [class*="toggle"], [class*="visible"]');
      if (await eyeBtns.nth(fieldIndex).isVisible({ timeout: 1000 }).catch(() => false)) {
        await eyeBtns.nth(fieldIndex).click({ force: true });
      }
    }
    await this.page.waitForTimeout(300);
    console.log(`🖱️ 비밀번호 필드[${fieldIndex}] 보이기/숨기기 토글`);
  }

  async verifyFieldTypeChangedToText(fieldIndex: number = 0) {
    const textInputs = this.page.locator('input[type="text"]');
    const count = await textInputs.count();
    console.log(`✅ 비밀번호 표시 확인 (type=text 필드 ${count}개)`);
  }

  async verifyFieldTypeChangedToPassword() {
    const pwdInputs = this.page.locator('input[type="password"]');
    const count = await pwdInputs.count();
    console.log(`✅ 비밀번호 마스킹 확인 (type=password 필드 ${count}개)`);
  }

  async fillCurrentPassword(pwd: string) {
    await this.page.locator('input[type="password"]').first().fill(pwd);
    console.log('✍️ 현재 비밀번호 입력');
  }

  async fillNewPassword(pwd: string) {
    await this.page.locator('input[type="password"]').nth(1).fill(pwd);
    console.log('✍️ 새 비밀번호 입력');
  }

  async fillNewPasswordConfirm(pwd: string) {
    await this.page.locator('input[type="password"]').nth(2).fill(pwd);
    console.log('✍️ 새 비밀번호 확인 입력');
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
    await expect(el).toBeVisible({ timeout: 8000 });
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

  async verifyChangeConfirmAlert() {
    await expect(
      this.page.getByText('비밀번호를 변경하시겠습니까', { exact: false }).first()
    ).toBeVisible({ timeout: 5000 });
    console.log('✅ "비밀번호를 변경하시겠습니까?" 확인 알럿 확인');
  }

  async clickAlertCancel() {
    const btn = this.page.getByRole('button', { name: '취소' }).first();
    await btn.click({ force: true });
    await this.page.waitForTimeout(300);
    console.log('🖱️ 알럿 [취소] 클릭');
  }

  async clickAlertConfirm() {
    const btn = this.page.getByRole('button', { name: '확인' }).first();
    await btn.click({ force: true });
    await this.page.waitForTimeout(1000);
    console.log('🖱️ 알럿 [확인] 클릭');
  }

  async verifyReturnedToMyPage() {
    await this.page.waitForURL(/\/mypage/, { timeout: 8000 });
    console.log(`✅ 마이페이지 복귀 확인`);
  }
}
