import { Page, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? '';

export class CorporateInquiryPage {
  constructor(private page: Page) {}

  async navigate() {
    await this.page.goto(`${BASE}/corporate-inquiry`);
    await this.page.waitForLoadState('load');
    // 폼이 히어로 섹션 아래에 있으므로 스크롤하여 노출
    await this.page.evaluate(() => window.scrollTo(0, 800));
    await this.page.waitForTimeout(400);
    console.log('✅ 단체 문의 페이지 이동');
  }

  async verifyUrl() {
    await expect(this.page, '[앱오류] 단체 문의 페이지 URL이 /corporate-inquiry 와 일치하지 않음 — 라우팅 오류 가능성').toHaveURL(/\/corporate-inquiry/);
    console.log(`✅ 단체 문의 URL 확인: ${this.page.url()}`);
  }

  // ── Placeholder / 필드 존재 확인 ─────────────────────────────────────────

  private async scrollToForm() {
    // 폼이 히어로 섹션 아래에 있으므로 스크롤 (navigate()에서도 호출하지만 개별 검증 시 재호출)
    await this.page.evaluate(() => window.scrollTo(0, Math.max(800, document.body.scrollHeight / 3)));
    await this.page.waitForTimeout(300);
  }

  async verifyNameFieldVisible() {
    await this.scrollToForm();
    const field = this.page.locator(
      'input[placeholder*="이름"], input[placeholder*="담당자"], input[placeholder*="성함"], form input:nth-child(1)'
    ).first();
    await field.scrollIntoViewIfNeeded().catch(() => {});
    await expect(field, '[UI/셀렉터] 이름(담당자) 입력 필드를 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 8000 });
    const ph = await field.getAttribute('placeholder') ?? '';
    console.log(`✅ 이름 필드 확인 (placeholder: "${ph}")`);
  }

  async verifyOrganizationFieldVisible() {
    await this.scrollToForm();
    const field = this.page.locator(
      'input[placeholder*="기관"], input[placeholder*="회사"], input[placeholder*="단체"], input[placeholder*="소속"], input[placeholder*="학교"]'
    ).first();
    await field.scrollIntoViewIfNeeded().catch(() => {});
    await expect(field, '[UI/셀렉터] 기관명/회사명 입력 필드를 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 8000 });
    const ph = await field.getAttribute('placeholder') ?? '';
    console.log(`✅ 기관명 필드 확인 (placeholder: "${ph}")`);
  }

  async verifyEmailFieldVisible() {
    await this.scrollToForm();
    const field = this.page.locator(
      'input[placeholder*="이메일"], input[placeholder*="E-mail"], input[placeholder*="e-mail"], input[type="email"]'
    ).first();
    await field.scrollIntoViewIfNeeded().catch(() => {});
    await expect(field, '[UI/셀렉터] 이메일 입력 필드를 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 8000 });
    const ph = await field.getAttribute('placeholder') ?? '';
    console.log(`✅ 이메일 필드 확인 (placeholder: "${ph}")`);
  }

  async verifyPhoneFieldVisible() {
    await this.scrollToForm();
    const field = this.page.locator(
      'input[placeholder*="전화"], input[placeholder*="연락"], input[placeholder*="번호"], input[placeholder*="휴대"], input[type="tel"]'
    ).first();
    await field.scrollIntoViewIfNeeded().catch(() => {});
    await expect(field, '[UI/셀렉터] 전화번호 입력 필드를 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 8000 });
    const ph = await field.getAttribute('placeholder') ?? '';
    console.log(`✅ 전화번호 필드 확인 (placeholder: "${ph}")`);
  }

  async verifyContentFieldVisible() {
    await this.scrollToForm();
    const field = this.page.locator('textarea').first();
    await field.scrollIntoViewIfNeeded().catch(() => {});
    await expect(field, '[UI/셀렉터] 문의내용 textarea 필드를 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 8000 });
    const ph = await field.getAttribute('placeholder') ?? '';
    console.log(`✅ 문의내용 필드 확인 (placeholder: "${ph}")`);
  }

  async verifySubmitButtonVisible() {
    await this.scrollToForm();
    // button[type="submit"] 우선 탐색, 없으면 form 내 버튼으로 범위 제한
    const submitBtn = this.page.locator('button[type="submit"]').first();
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('✅ 제출 버튼(type=submit) 확인');
      return;
    }
    const formBtn = this.page.locator('form').getByRole('button').first();
    if (await formBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('✅ 제출 버튼(form button) 확인');
      return;
    }
    // fallback: 텍스트 기반 탐색, 하지만 nav 링크 제외를 위해 button 역할로만
    const btn = this.page.locator('button').filter({ hasText: /접수|제출|보내기|신청|문의하기/ }).first();
    await expect(btn, '[UI/셀렉터] 제출 버튼을 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 8000 });
    console.log('✅ 제출 버튼 확인');
  }

  // ── 필드 입력 ─────────────────────────────────────────────────────────────

  async fillName(name: string) {
    await this.scrollToForm();
    const field = this.page.locator(
      'input[placeholder*="이름"], input[placeholder*="담당자"], input[placeholder*="성함"]'
    ).first();
    await field.scrollIntoViewIfNeeded().catch(() => {});
    await field.fill(name);
    console.log(`✍️ 이름 입력: "${name}"`);
  }

  async fillOrganization(org: string) {
    await this.scrollToForm();
    const field = this.page.locator(
      'input[placeholder*="기관"], input[placeholder*="회사"], input[placeholder*="단체"], input[placeholder*="소속"], input[placeholder*="학교"]'
    ).first();
    await field.scrollIntoViewIfNeeded().catch(() => {});
    await field.fill(org);
    console.log(`✍️ 기관명 입력: "${org}"`);
  }

  async fillEmail(email: string) {
    await this.scrollToForm();
    const field = this.page.locator(
      'input[placeholder*="이메일"], input[placeholder*="E-mail"], input[placeholder*="e-mail"], input[type="email"]'
    ).first();
    await field.scrollIntoViewIfNeeded().catch(() => {});
    await field.fill(email);
    console.log(`✍️ 이메일 입력: "${email}"`);
  }

  async fillPhone(phone: string) {
    await this.scrollToForm();
    const field = this.page.locator(
      'input[placeholder*="전화"], input[placeholder*="연락"], input[placeholder*="번호"], input[placeholder*="휴대"], input[type="tel"]'
    ).first();
    await field.scrollIntoViewIfNeeded().catch(() => {});
    await field.fill(phone);
    console.log(`✍️ 전화번호 입력: "${phone}"`);
  }

  async fillContent(content: string) {
    await this.scrollToForm();
    const field = this.page.locator('textarea').first();
    await field.scrollIntoViewIfNeeded().catch(() => {});
    await field.fill(content);
    console.log('✍️ 문의내용 입력');
  }

  // ── 알럿 처리 ─────────────────────────────────────────────────────────────

  async verifyAlert(pattern: string | RegExp) {
    const alert = this.page.getByText(pattern, { exact: false }).first();
    await expect(alert, `[앱오류] 알럿 메시지 미노출 — 예상 텍스트: "${pattern}"`).toBeVisible({ timeout: 8000 });
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

  // ── 등록 (실제 데이터 생성 — 주석 해제 시 주의) ─────────────────────────

  async clickSubmitButton() {
    const btn = this.page.getByRole('button', { name: /문의|접수|제출|보내기|신청/ }).first();
    await btn.scrollIntoViewIfNeeded();
    await this.page.evaluate(() => window.scrollBy(0, -120));
    await btn.click({ force: true });
    await this.page.waitForTimeout(500);
    console.log('🖱️ 제출 버튼 클릭');
  }

  async verifySubmitSuccessPage() {
    await expect(
      this.page.getByText(/문의.*완료|접수.*완료|감사합니다/i).first(),
      '[앱오류] 단체 문의 접수 완료 메시지 미노출 — 제출 처리 실패 가능성'
    ).toBeVisible({ timeout: 15000 });
    console.log('✅ 단체 문의 접수 완료 페이지 확인');
  }
}
