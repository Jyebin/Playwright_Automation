import { Page, Locator, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? '';

/**
 * 비밀번호 찾기 (/find-password) — T509
 * ⚠️ 재설정 메일 발송은 인증 잔여 횟수(5회/24시간)를 소모하므로, 발송이 필요한 동작은 spec 에서 가드한다.
 */
export class FindPasswordPage {
  constructor(private page: Page) {}

  // 입력 박스 (약관동의 등 다른 박스와 구분: 아이디 입력 칸을 가진 박스)
  get form(): Locator {
    return this.page.locator('.terms-box')
      .filter({ has: this.page.getByPlaceholder('아이디를 입력해 주세요.') })
      .or(this.page.locator('form').filter({ has: this.page.getByPlaceholder('아이디를 입력해 주세요.') }))
      .first();
  }

  get idInput(): Locator { return this.page.getByPlaceholder('아이디를 입력해 주세요.').first(); }
  get nameInput(): Locator { return this.page.getByPlaceholder('이름을 입력해 주세요.').first(); }
  get emailInput(): Locator { return this.page.getByPlaceholder('메일 주소를 입력해 주세요.').first(); }
  get sendButton(): Locator { return this.page.getByRole('button', { name: /재설정 메일 받기|재전송/ }).first(); }
  get cancelButton(): Locator { return this.page.getByRole('button', { name: '취소', exact: true }).first(); }
  // 안내 모달 — 이 화면의 모달에는 id 가 없어 보이는 .modal-dialog 로 찾는다
  get alertModal(): Locator { return this.page.locator('.modal-dialog:visible').first(); }

  async navigate() {
    await this.page.goto(`${BASE}/find-password`);
    await this.page.waitForLoadState('load');
    await expect(this.idInput, '[환경] 비밀번호 찾기 화면이 뜨지 않음').toBeVisible({ timeout: 15_000 });
    console.log('✅ 비밀번호 찾기 페이지 이동');
  }

  /** 메인 → 헤더 [로그인] → 로그인 페이지 → [비밀번호 찾기] (Step 1 의 진입 경로 그대로) */
  async navigateFromMain() {
    await this.page.goto(`${BASE}/`);
    await this.page.waitForLoadState('load');
    const loginLink = this.page.getByRole('link', { name: '로그인', exact: true })
      .or(this.page.locator('header').getByText('로그인', { exact: true })).first();
    await loginLink.click();
    await this.page.waitForLoadState('load');
    await expect(this.page, '[앱오류] 헤더 [로그인] 클릭 후 로그인 페이지로 이동하지 않음').toHaveURL(/\/login/, { timeout: 15_000 });
    console.log(`✅ 메인 → 로그인 페이지 이동: ${this.page.url()}`);

    const findPw = this.page.getByRole('link', { name: '비밀번호 찾기' })
      .or(this.page.getByText('비밀번호 찾기', { exact: true })).first();
    await expect(findPw, '[앱오류] 로그인 페이지에 [비밀번호 찾기] 가 없음').toBeVisible({ timeout: 10_000 });
    await findPw.click();
    await this.page.waitForLoadState('load');
    console.log(`✅ 로그인 → 비밀번호 찾기 이동: ${this.page.url()}`);
  }

  /** 버튼이 활성화된 뒤 클릭하고, 서버 응답(있으면)까지 기다린다 — 병렬 실행 시 모달이 늦게 뜨는 것 방지 */
  async clickSend() {
    await expect(this.sendButton, '[앱오류] [재설정 메일 받기] 버튼이 활성화되지 않음').not.toHaveClass(/disabled/, { timeout: 10_000 });
    const [response] = await Promise.all([
      this.page.waitForResponse(r => /\/member\/auth\/find\/pwd/.test(r.url()), { timeout: 20_000 }).catch(() => null),
      this.sendButton.click(),
    ]);
    if (response) console.log(`ℹ️ 서버 응답 ${response.status()} (${new URL(response.url()).pathname})`);
    return response;
  }

  async fillAll(id: string, name: string, email: string) {
    await this.idInput.fill(id);
    await this.nameInput.fill(name);
    await this.emailInput.fill(email);
    await this.emailInput.blur();
    await this.page.waitForTimeout(300);
  }

  /** 입력 필드 placeholder (Step 2) */
  async verifyPlaceholders() {
    const fields: [string, string][] = [
      ['아이디', '아이디를 입력해 주세요.'],
      ['이름', '이름을 입력해 주세요.'],
      ['이메일 주소', '메일 주소를 입력해 주세요.'],
    ];
    for (const [label, ph] of fields) {
      await expect(this.page.getByPlaceholder(ph).first(), `[스펙 불일치] ${label} placeholder "${ph}" 없음`).toBeVisible({ timeout: 10_000 });
      console.log(`✅ ${label} placeholder "${ph}"`);
    }
  }

  /** 화면에 표시된 잔여 횟수 (없으면 null) — 실제 문구는 "발송 잔여 횟수", 스펙 문구는 "인증 잔여 횟수" */
  async remainingCount(): Promise<number | null> {
    const text = await this.page.locator('body').innerText();
    const m = text.match(/(?:인증|발송)\s*잔여\s*횟수[\s\S]{0,20}?(\d+)\s*회/);
    return m ? parseInt(m[1], 10) : null;
  }

  /** 잔여 횟수 옆에 실제로 쓰인 라벨 (스펙 문구와 비교용) */
  async remainingLabel(): Promise<string> {
    const text = await this.page.locator('body').innerText();
    const m = text.match(/(인증|발송)\s*잔여\s*횟수/);
    return m ? m[0].replace(/\s+/g, ' ') : '';
  }

  /** 알럿 문구 — 모달(#CommonAlert) 또는 브라우저 alert 어느 쪽이든 읽는다 */
  async readAlert(nativeAlerts: string[], timeout = 15_000): Promise<string> {
    // isVisible() 은 기다리지 않으므로(모달이 1초쯤 뒤에 뜸) waitFor 로 대기
    const modalVisible = await this.alertModal.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    if (modalVisible) {
      const text = (await this.alertModal.locator('.modal-body').innerText().catch(async () => await this.alertModal.innerText()))
        .replace(/\s+/g, ' ').trim();
      return text;
    }
    return nativeAlerts.join(' | ').trim();
  }

  async closeAlert() {
    const confirm = this.alertModal.getByRole('button', { name: /확인|닫기/ }).first();
    if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirm.click();
      await expect(this.alertModal).toBeHidden({ timeout: 5000 });
    }
  }
}
