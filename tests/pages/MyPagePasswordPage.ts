import { Page, expect } from '@playwright/test';

/**
 * 비밀번호 변경 (/mypage/change-password)
 *  #ChangePassword > #Input ×3 (label + .input-item > input#oldPassword / #newPassword / #reconfPassword + svg 보이기/숨기기)
 *                  > ul.info (조건 안내) > .button-group [취소][확인]
 *  공통 알럿 #CommonAlert : .modal-body 문구 + .modal-footer 버튼 ([취소][확인] 또는 [확인])
 */
const FIELD_IDS = ['oldPassword', 'newPassword', 'reconfPassword'] as const;

export class MyPagePasswordPage {
  constructor(private page: Page) {}

  private get form() { return this.page.locator('#ChangePassword'); }
  private get alertBox() { return this.page.locator('#CommonAlert'); }
  /** 0 현재 / 1 새 / 2 새 확인 — 보이기 토글 시 type 이 바뀌므로 id 로 찾음 */
  private field(index: number) { return this.form.locator(`#${FIELD_IDS[index]}`); }

  async verifyPasswordChangePageVisible() {
    await expect(this.field(0), '[UI/셀렉터] 비밀번호 변경 입력 필드(#oldPassword)를 찾을 수 없음 — 로그인 세션 또는 셀렉터 확인').toBeVisible({ timeout: 10000 });
    const fields = this.form.locator('input[type="password"]');
    const count = await fields.count();
    const labels = (await this.form.locator('#Input label').allInnerTexts()).map(s => s.trim());
    console.log(`✅ 비밀번호 변경 페이지 확인 (URL ${new URL(this.page.url()).pathname}, password 필드 ${count}개: ${labels.join(' / ')})`);
    expect(count, '[앱오류] 비밀번호 변경 페이지에 password 필드가 3개 미만 — 화면 구성 오류').toBeGreaterThanOrEqual(3);
  }

  async verifyAllPasswordPlaceholders() {
    const labels = (await this.form.locator('#Input label').allInnerTexts()).map(s => s.trim());
    for (let i = 0; i < FIELD_IDS.length; i++) {
      const ph = await this.field(i).getAttribute('placeholder') ?? '';
      console.log(`✅ ${labels[i] ?? `필드[${i}]`} placeholder: "${ph}"`);
      expect(ph, `[앱오류] ${labels[i] ?? `비밀번호 필드[${i}]`} placeholder가 예상 문구와 다름 (실제 "${ph}")`).toMatch(/비밀번호를 입력해 주세요/);
    }
  }

  async verifyPasswordRuleText() {
    const info = this.form.locator('ul.info');
    await expect(info, '[앱오류] 비밀번호 조건 안내 문구 영역이 표시되지 않음').toBeVisible({ timeout: 10000 });
    const text = (await info.innerText()).trim();
    console.log(`✅ 비밀번호 조건 안내 문구: ${JSON.stringify(text.split('\n').map(s => s.trim()).filter(Boolean))}`);
    expect(text, '[앱오류] 비밀번호 조건 안내 문구(영문·숫자·특수문자/8자 이상)가 표시되지 않음').toMatch(/영문.*숫자.*특수문자|8자 이상/);
  }

  /** 입력 필드 오른쪽 눈 모양 아이콘(svg) 클릭 */
  async togglePasswordVisibility(fieldIndex: number = 0) {
    const eye = this.form.locator('#Input').nth(fieldIndex).locator('.input-item svg').first();
    await expect(eye, `[UI/셀렉터] 비밀번호 필드[${fieldIndex}] 보이기/숨기기 아이콘을 찾을 수 없음`).toBeVisible({ timeout: 5000 });
    await eye.click();
    console.log(`🖱️ 비밀번호 필드[${fieldIndex}] 보이기/숨기기 아이콘 클릭 (현재 type=${await this.field(fieldIndex).getAttribute('type')})`);
  }

  async verifyFieldTypeChangedToText(fieldIndex: number = 0) {
    await expect(this.field(fieldIndex), `[앱오류] 보이기 아이콘 클릭 후 비밀번호 필드[${fieldIndex}]가 표시되지 않음(type=text 아님) — METADEMY-870`).toHaveAttribute('type', 'text', { timeout: 3000 });
    console.log(`✅ 비밀번호 필드[${fieldIndex}] 표시 확인 (type=text)`);
  }

  async verifyFieldTypeChangedToPassword(fieldIndex: number = 0) {
    await expect(this.field(fieldIndex), `[앱오류] 숨기기 아이콘 클릭 후 비밀번호 필드[${fieldIndex}]가 마스킹되지 않음(type=password 아님)`).toHaveAttribute('type', 'password', { timeout: 3000 });
    console.log(`✅ 비밀번호 필드[${fieldIndex}] 마스킹 확인 (type=password)`);
  }

  async fillCurrentPassword(pwd: string) {
    await this.field(0).fill(pwd);
    console.log('✍️ 현재 비밀번호 입력');
  }

  async fillNewPassword(pwd: string) {
    await this.field(1).fill(pwd);
    console.log('✍️ 새 비밀번호 입력');
  }

  async fillNewPasswordConfirm(pwd: string) {
    await this.field(2).fill(pwd);
    console.log('✍️ 새 비밀번호 확인 입력');
  }

  /** 폼 하단 [확인] (알럿의 [확인]과 구분) */
  async clickConfirmButton() {
    const btn = this.form.locator('.button-group').getByRole('button', { name: '확인', exact: true });
    await expect(btn, '[UI/셀렉터] 비밀번호 변경 [확인] 버튼을 찾을 수 없음').toBeVisible({ timeout: 10000 });
    await btn.click();
    console.log('🖱️ [확인] 버튼 클릭');
  }

  async verifyAlert(pattern: string | RegExp) {
    const body = this.alertBox.locator('.modal-body');
    await expect(body, `[앱오류] 알럿 메시지 "${pattern}" 미노출`).toBeVisible({ timeout: 8000 });
    const text = (await body.innerText()).replace(/\s+/g, ' ').trim();
    console.log(`✅ 알럿 문구: "${text}"`);
    if (typeof pattern === 'string') {
      expect(text, `[앱오류] 알럿 문구가 예상과 다름 — 예상 포함: "${pattern}", 실제: "${text}"`).toContain(pattern);
    } else {
      expect(text, `[앱오류] 알럿 문구가 예상과 다름 — 예상: ${pattern}, 실제: "${text}"`).toMatch(pattern);
    }
  }

  async closeAlert() {
    const btn = this.alertBox.getByRole('button', { name: '확인', exact: true });
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await expect(this.alertBox, '[UI/셀렉터] 알럿 [확인] 클릭 후에도 알럿이 닫히지 않음').toBeHidden({ timeout: 5000 });
      console.log('🖱️ 알럿 [확인]으로 닫기');
    } else {
      console.log('ℹ️  닫을 알럿 없음');
    }
  }

  async verifyChangeConfirmAlert() {
    await expect(
      this.alertBox.locator('.modal-body'),
      '[앱오류] "비밀번호를 변경하시겠습니까?" 확인 알럿이 표시되지 않음'
    ).toContainText('비밀번호를 변경하시겠습니까', { timeout: 8000 });
    const buttons = (await this.alertBox.locator('button').allInnerTexts()).map(s => s.trim());
    console.log(`✅ "비밀번호를 변경하시겠습니까?" 확인 알럿 (버튼: ${buttons.join(' / ')})`);
  }

  /** 계정 보호: 반드시 알럿(#CommonAlert) 안의 [취소]만 클릭 — 폼의 [취소]나 알럿 [확인]을 누르지 않음 */
  async clickAlertCancel() {
    const btn = this.alertBox.locator('button').filter({ hasText: /^\s*취소\s*$/ });
    await expect(btn, '[UI/셀렉터] 확인 알럿의 [취소] 버튼을 찾을 수 없음').toHaveCount(1, { timeout: 5000 });
    await btn.click();
    await expect(this.alertBox, '[앱오류] 알럿 [취소] 클릭 후에도 알럿이 닫히지 않음').toBeHidden({ timeout: 5000 });
    console.log(`🖱️ 알럿 [취소] 클릭 → 알럿 닫힘, 변경 미진행 (URL ${new URL(this.page.url()).pathname})`);
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
