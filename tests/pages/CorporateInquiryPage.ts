import { Page, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? '';

export class CorporateInquiryPage {
  constructor(private page: Page) {}

  async navigate() {
    await this.page.goto(`${BASE}/corporate-inquiry`);
    await this.page.waitForLoadState('load');
    console.log('✅ 단체 문의 페이지 이동');
  }

  async verifyUrl() {
    await expect(this.page, '[앱오류] 단체 문의 페이지 URL이 /corporate-inquiry 와 일치하지 않음 — 라우팅 오류 가능성').toHaveURL(/\/corporate-inquiry/);
    console.log(`✅ 단체 문의 URL 확인: ${this.page.url()}`);
  }

  // ── Placeholder / 필드 존재 확인 ─────────────────────────────────────────

  async verifyNameFieldVisible() {
    const field = this.page.locator('input[placeholder*="이름"], input[placeholder*="담당자"]').first();
    await expect(field, '[UI/셀렉터] 이름(담당자) 입력 필드를 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 8000 });
    const ph = await field.getAttribute('placeholder') ?? '';
    console.log(`✅ 이름 필드 확인 (placeholder: "${ph}")`);
  }

  async verifyOrganizationFieldVisible() {
    const field = this.page.locator(
      'input[placeholder*="기관"], input[placeholder*="회사"], input[placeholder*="단체"], input[placeholder*="소속"]'
    ).first();
    await expect(field, '[UI/셀렉터] 기관명/회사명 입력 필드를 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 8000 });
    const ph = await field.getAttribute('placeholder') ?? '';
    console.log(`✅ 기관명 필드 확인 (placeholder: "${ph}")`);
  }

  async verifyEmailFieldVisible() {
    const field = this.page.locator(
      'input[placeholder*="이메일"], input[placeholder*="E-mail"], input[type="email"]'
    ).first();
    await expect(field, '[UI/셀렉터] 이메일 입력 필드를 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 8000 });
    const ph = await field.getAttribute('placeholder') ?? '';
    console.log(`✅ 이메일 필드 확인 (placeholder: "${ph}")`);
  }

  async verifyPhoneFieldVisible() {
    const field = this.page.locator(
      'input[placeholder*="전화"], input[placeholder*="연락"], input[placeholder*="번호"], input[type="tel"]'
    ).first();
    await expect(field, '[UI/셀렉터] 전화번호 입력 필드를 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 8000 });
    const ph = await field.getAttribute('placeholder') ?? '';
    console.log(`✅ 전화번호 필드 확인 (placeholder: "${ph}")`);
  }

  async verifyContentFieldVisible() {
    const field = this.page.locator('textarea').first();
    await expect(field, '[UI/셀렉터] 문의내용 textarea 필드를 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 8000 });
    const ph = await field.getAttribute('placeholder') ?? '';
    console.log(`✅ 문의내용 필드 확인 (placeholder: "${ph}")`);
  }

  async verifySubmitButtonVisible() {
    const btn = this.page.getByRole('button', { name: /문의|접수|제출|보내기|신청/ }).first();
    await expect(btn, '[UI/셀렉터] 제출 버튼을 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 8000 });
    console.log('✅ 제출 버튼 확인');
  }

  // ── 필드 입력 ─────────────────────────────────────────────────────────────

  async fillName(name: string) {
    const field = this.page.locator('input[placeholder*="이름"], input[placeholder*="담당자"]').first();
    await field.fill(name);
    console.log(`✍️ 이름 입력: "${name}"`);
  }

  async fillOrganization(org: string) {
    const field = this.page.locator(
      'input[placeholder*="기관"], input[placeholder*="회사"], input[placeholder*="단체"], input[placeholder*="소속"]'
    ).first();
    await field.fill(org);
    console.log(`✍️ 기관명 입력: "${org}"`);
  }

  async fillEmail(email: string) {
    const field = this.page.locator(
      'input[placeholder*="이메일"], input[placeholder*="E-mail"], input[type="email"]'
    ).first();
    await field.fill(email);
    console.log(`✍️ 이메일 입력: "${email}"`);
  }

  async fillPhone(phone: string) {
    const field = this.page.locator(
      'input[placeholder*="전화"], input[placeholder*="연락"], input[placeholder*="번호"], input[type="tel"]'
    ).first();
    await field.fill(phone);
    console.log(`✍️ 전화번호 입력: "${phone}"`);
  }

  async fillContent(content: string) {
    await this.page.locator('textarea').first().fill(content);
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
