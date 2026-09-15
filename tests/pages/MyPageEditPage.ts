import { Page, expect } from '@playwright/test';

/**
 * 프로필 수정 (/mypage/edit)
 *  1단계 #CheckPassword : .input-item > input#checkPassWord + svg(보이기/숨기기) / .button-group [확인]
 *  2단계 #EditForm      : table#ProfileTable > tr(th 항목 + td 값) / .button-group [취소][수정]
 *  공통 알럿 #CommonAlert : .modal-body 문구 + .modal-footer 버튼
 */
export class MyPageEditPage {
  constructor(private page: Page) {}

  private get checkForm() { return this.page.locator('#CheckPassword'); }
  /** 보이기 토글 시 type 이 password ↔ text 로 바뀌므로 type 으로 찾지 않음 */
  private get checkInput() { return this.checkForm.locator('.input-item input').first(); }
  private get alertBox() { return this.page.locator('#CommonAlert'); }
  private get editForm() { return this.page.locator('#EditForm'); }
  private get emailRow() {
    return this.editForm.locator('tr').filter({ has: this.page.locator('th', { hasText: /^\s*E-mail\s*$/ }) });
  }
  private get emailInput() {
    return this.emailRow.locator('input:not([type="checkbox"]):not([type="radio"])').first();
  }

  // ── 비밀번호 확인 단계 (프로필 수정 진입 전) ────────────────────────────

  async verifyPasswordConfirmPageVisible() {
    await expect(this.checkInput, '[UI/셀렉터] 비밀번호 입력 필드를 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 10000 });
    const title = (await this.checkForm.locator('h5').first().innerText().catch(() => '')).trim();
    console.log(`✅ 비밀번호 확인 단계 진입 확인 (제목 "${title}", URL ${new URL(this.page.url()).pathname})`);
  }

  async verifyPasswordPlaceholder() {
    await expect(this.checkInput, '[UI/셀렉터] 비밀번호 입력 필드를 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 10000 });
    const ph = await this.checkInput.getAttribute('placeholder') ?? '';
    console.log(`✅ 비밀번호 placeholder: "${ph}"`);
    expect(ph, '[앱오류] 비밀번호 placeholder 텍스트가 "비밀번호를 입력해 주세요"와 일치하지 않음').toMatch(/비밀번호를 입력해 주세요/);
  }

  async clickConfirmButton() {
    const btn = this.checkForm.locator('.button-group').getByRole('button', { name: '확인', exact: true });
    await expect(btn, '[UI/셀렉터] 비밀번호 확인 [확인] 버튼을 찾을 수 없음').toBeVisible({ timeout: 10000 });
    await btn.click();
    console.log('🖱️ [확인] 버튼 클릭');
  }

  async verifyAlert(pattern: string | RegExp) {
    const body = this.alertBox.locator('.modal-body');
    await expect(body, `[앱오류] 알럿 메시지 미노출 — 예상 텍스트: "${pattern}"`).toBeVisible({ timeout: 8000 });
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

  /** 입력 필드 오른쪽 눈 모양 아이콘(svg) 클릭 */
  async togglePasswordVisibility() {
    const eye = this.checkForm.locator('.input-item svg').first();
    await expect(eye, '[UI/셀렉터] 비밀번호 보이기/숨기기 아이콘을 찾을 수 없음').toBeVisible({ timeout: 5000 });
    await eye.click();
    console.log(`🖱️ 비밀번호 보이기/숨기기 아이콘 클릭 (현재 type=${await this.checkInput.getAttribute('type')})`);
  }

  async verifyPasswordTypeIsText() {
    await expect(this.checkInput, '[앱오류] 보이기 아이콘 클릭 후 비밀번호가 표시되지 않음(type=text 아님) — METADEMY-870').toHaveAttribute('type', 'text', { timeout: 3000 });
    console.log('✅ 비밀번호 표시 확인 (type=text)');
  }

  async verifyPasswordTypeIsPassword() {
    await expect(this.checkInput, '[앱오류] 비밀번호가 마스킹되지 않음(type=password 아님)').toHaveAttribute('type', 'password', { timeout: 3000 });
    console.log('✅ 비밀번호 마스킹 확인 (type=password)');
  }

  async enterPassword(password: string) {
    await expect(this.checkInput, '[UI/셀렉터] 비밀번호 입력 필드를 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 10000 });
    await this.checkInput.fill(password);
    console.log('✍️ 비밀번호 입력');
  }

  async verifyProfileEditFormVisible() {
    await expect(this.editForm, '[앱오류] 비밀번호 확인 후 프로필 수정 폼(#EditForm)이 표시되지 않음').toBeVisible({ timeout: 10000 });
    await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    console.log(`✅ 프로필 수정 폼 진입 확인: ${new URL(this.page.url()).pathname}`);
  }

  // ── 프로필 수정 폼 ────────────────────────────────────────────────────────

  /** 폼의 항목별 편집 가능 여부 (텍스트 입력 필드 / 체크박스 / 텍스트 표시) */
  private async readFormRows() {
    await expect(this.editForm, '[앱오류] 프로필 수정 폼(#EditForm)이 표시되지 않음').toBeVisible({ timeout: 10000 });
    return this.editForm.locator('tr').evaluateAll(trs => trs.map(tr => {
      const td = tr.querySelector('td') as HTMLElement | null;
      const controls = [...(td?.querySelectorAll('input, textarea, select') ?? [])] as HTMLInputElement[];
      return {
        label: tr.querySelector('th')?.textContent?.trim() ?? '',
        value: (td?.innerText ?? '').replace(/\s+/g, ' ').trim(),
        editable: controls.filter(c => c.type !== 'checkbox' && c.type !== 'radio' && !c.disabled && !c.readOnly)
          .map(c => `${c.tagName.toLowerCase()}[type=${c.type}]${c.id ? '#' + c.id : ''}`),
        checkboxes: controls.filter(c => c.type === 'checkbox').map(c => ({ id: c.id, disabled: c.disabled })),
      };
    }));
  }

  /** 스펙: 계정(ID/E-mail)·이름·휴대폰 번호 = 수정 불가 / E-mail·마케팅 정보 수신 = 수정 가능 */
  async verifyReadOnlyFieldsDisabled() {
    const rows = await this.readFormRows();
    console.log(`✅ 프로필 수정 폼 항목: ${rows.map(r =>
      `${r.label}=${r.editable.length ? `입력필드(${r.editable.join(',')})` : r.checkboxes.length ? `체크박스(${r.checkboxes.map(c => c.id + (c.disabled ? ':disabled' : '')).join(',')})` : `텍스트("${r.value}")`}`,
    ).join(' / ')}`);

    for (const label of ['계정(ID/E-mail)', '이름', '휴대폰 번호']) {
      const row = rows.find(r => r.label === label);
      expect.soft(row, `[UI/셀렉터] 프로필 수정 폼에 "${label}" 항목이 없음`).toBeTruthy();
      expect.soft(row?.editable ?? [], `[앱오류] "${label}"은(는) 수정 불가 항목인데 입력 필드가 활성화되어 있음`).toEqual([]);
    }
    const marketing = rows.find(r => r.label === '마케팅 정보 수신 확인');
    expect.soft(marketing?.checkboxes.length ?? 0, '[앱오류] 마케팅 정보 수신 확인 체크박스(문자 메시지/E-mail) 2개가 없음').toBe(2);
    expect.soft(marketing?.checkboxes.filter(c => c.disabled).map(c => c.id) ?? [], '[앱오류] 마케팅 정보 수신 체크박스가 비활성화되어 있음').toEqual([]);
  }

  async verifyEmailFieldEditable() {
    const rows = await this.readFormRows();
    const email = rows.find(r => r.label === 'E-mail');
    expect(email, '[UI/셀렉터] 프로필 수정 폼에 "E-mail" 항목이 없음').toBeTruthy();
    expect(
      email!.editable.length,
      `[앱오류] E-mail은 스펙상 수정 가능 항목이나 입력 필드가 없음 — 실제: 텍스트 "${email!.value}"만 표시`,
    ).toBeGreaterThan(0);
    console.log(`✅ E-mail 입력 필드 편집 가능 확인 (${email!.editable.join(',')})`);
  }

  async verifyEmailPlaceholder() {
    await expect(this.editForm, '[앱오류] 프로필 수정 폼(#EditForm)이 표시되지 않음').toBeVisible({ timeout: 10000 });
    const shown = (await this.emailRow.locator('td').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    const count = await this.emailInput.count();
    console.log(`✅ E-mail 항목 표시: 입력 필드 ${count}개, 표시 값 "${shown}"`);
    expect(count, `[앱오류] E-mail 입력 필드가 없어 placeholder("이메일을 입력해 주세요.") 확인 불가 — 실제: 텍스트 "${shown}"만 표시`).toBeGreaterThan(0);
    const ph = await this.emailInput.getAttribute('placeholder') ?? '';
    console.log(`✅ 이메일 placeholder: "${ph}"`);
    expect(ph, '[앱오류] 이메일 placeholder 텍스트가 "이메일을 입력해 주세요"와 일치하지 않음').toMatch(/이메일을 입력해 주세요/);
  }

  async getCurrentEmailValue(): Promise<string> {
    if (await this.emailInput.count() === 0) return '';
    return await this.emailInput.inputValue().catch(() => '');
  }

  async updateEmail(email: string) {
    await this.emailInput.fill(email);
    console.log(`✍️ 이메일 입력: "${email}"`);
  }

  async clickSaveButton() {
    const btn = this.editForm.locator('.button-group').getByRole('button', { name: '수정', exact: true });
    await btn.click();
    console.log('🖱️ [수정] 버튼 클릭');
  }

  async verifySaveSuccess() {
    await expect(
      this.alertBox.locator('.modal-body'),
      '[앱오류] "프로필 수정이 완료되었습니다" 알럿 미노출 — 저장 처리 실패 가능성'
    ).toContainText('프로필 수정이 완료되었습니다', { timeout: 8000 });
    console.log('✅ "프로필 수정이 완료되었습니다." 알럿 확인');
  }

  async verifyReturnedToMyPage() {
    await expect(this.page.locator('#MyProfileView'), '[앱오류] 마이페이지 > 프로필 화면으로 돌아가지 않음').toBeVisible({ timeout: 10000 });
    await expect(this.page, '[앱오류] 마이페이지(/mypage)로 이동되지 않음').toHaveURL(url => url.pathname === '/mypage', { timeout: 8000 });
    console.log(`✅ 마이페이지 복귀 확인: ${new URL(this.page.url()).pathname}`);
  }

  async verifyMarketingCheckboxesExist() {
    const count = await this.editForm.locator('#Checkbox input[type="checkbox"]').count();
    if (count > 0) {
      console.log(`✅ 마케팅 수신 체크박스 확인 (${count}개)`);
    } else {
      console.log('ℹ️  마케팅 수신 체크박스 없음');
    }
  }

  async toggleMarketingCheckbox(index: number = 0): Promise<boolean> {
    // 구조: #Checkbox > input(숨김) + label.checkbox(클릭 영역)
    const box = this.editForm.locator('#Checkbox').nth(index);
    if (!(await box.isVisible().catch(() => false))) {
      console.log(`ℹ️  마케팅 체크박스[${index}] 없음 — 건너뜀`);
      return false;
    }
    const input = box.locator('input[type="checkbox"]');
    const wasChecked = await input.isChecked();
    await box.locator('label').click();
    const isChecked = await input.isChecked();
    console.log(`🖱️ 마케팅 체크박스[${index}] 토글 (${wasChecked} → ${isChecked})`);
    return wasChecked;
  }

  async clickCancelButton() {
    const btn = this.editForm.locator('.button-group').getByRole('button', { name: '취소', exact: true });
    await btn.click();
    console.log('🖱️ [취소] 버튼 클릭');
  }
}
