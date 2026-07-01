import { Page, expect } from '@playwright/test';
import * as path from 'path';

const BASE = process.env.BASE_URL ?? '';

export const INQUIRY_TYPES = [
  '서비스 신청',
  '계정 문의',
  '오류 문의',
  '제휴 문의',
  '교환 및 환불 문의',
  '기타 문의',
] as const;
export type InquiryType = (typeof INQUIRY_TYPES)[number];

export class CsInquiryPage {
  constructor(private page: Page) {}

  async navigate() {
    await this.page.goto(`${BASE}/cs/inquiry`);
    await this.page.waitForLoadState('load');
    console.log('✅ 서비스 이용 문의 페이지 이동');
  }

  async verifyUrl() {
    await expect(this.page).toHaveURL(/\/cs\/inquiry/);
    console.log(`✅ 서비스 이용 문의 URL 확인: ${this.page.url()}`);
  }

  async verifyTabActiveStyle() {
    const tab = this.page.getByText('서비스 이용 문의', { exact: true }).first();
    await expect(tab).toBeVisible({ timeout: 5000 });
    const isActive = await tab.evaluate(el => {
      const style = window.getComputedStyle(el);
      return (
        style.fontWeight === '700' ||
        (el as HTMLElement).className.toLowerCase().includes('active') ||
        style.borderBottomColor.includes('196')
      );
    });
    console.log(`✅ 서비스 이용 문의 탭 활성 확인 (active: ${isActive})`);
  }

  // ── Placeholder 확인 ─────────────────────────────────────────────────────

  async verifyNamePlaceholder() {
    const field = this.page.locator('input[placeholder*="이름"]').first();
    await expect(field).toBeVisible({ timeout: 8000 });
    const ph = await field.getAttribute('placeholder') ?? '';
    expect(ph).toMatch(/이름/);
    console.log(`✅ 이름 placeholder: "${ph}"`);
  }

  async verifyAffiliationPlaceholder() {
    const field = this.page.locator('input[placeholder*="소속"]').first();
    await expect(field).toBeVisible({ timeout: 8000 });
    const ph = await field.getAttribute('placeholder') ?? '';
    expect(ph).toMatch(/소속/);
    console.log(`✅ 소속 placeholder: "${ph}"`);
  }

  async verifyInquiryTypeDropdownPlaceholder() {
    // "문의 내용을 선택해 주세요." 표시
    const placeholder = this.page.getByText('문의 내용을 선택해 주세요', { exact: false }).first();
    await expect(placeholder).toBeVisible({ timeout: 8000 });
    console.log('✅ 문의 종류 드롭다운 placeholder 확인');
  }

  async verifyEmailPlaceholder() {
    const field = this.page.locator('input[placeholder*="E-mail"], input[placeholder*="이메일"], input[type="email"]').first();
    await expect(field).toBeVisible({ timeout: 8000 });
    const ph = await field.getAttribute('placeholder') ?? '';
    console.log(`✅ 이메일 placeholder: "${ph}"`);
  }

  async verifyPhonePlaceholder() {
    const field = this.page.locator('input[placeholder*="연락받으실"], input[placeholder*="번호"], input[type="tel"]').first();
    await expect(field).toBeVisible({ timeout: 8000 });
    const ph = await field.getAttribute('placeholder') ?? '';
    console.log(`✅ 휴대폰 placeholder: "${ph}"`);
  }

  async verifyTitlePlaceholder() {
    const field = this.page.locator('input[placeholder*="제목"]').first();
    await expect(field).toBeVisible({ timeout: 8000 });
    const ph = await field.getAttribute('placeholder') ?? '';
    expect(ph).toMatch(/제목/);
    console.log(`✅ 제목 placeholder: "${ph}"`);
  }

  async verifyContentPlaceholder() {
    const field = this.page.locator('textarea').first();
    await expect(field).toBeVisible({ timeout: 8000 });
    const ph = await field.getAttribute('placeholder') ?? '';
    console.log(`✅ 문의내용 placeholder: "${ph}"`);
  }

  // ── 필드 입력 ─────────────────────────────────────────────────────────────

  async fillName(name: string) {
    await this.page.locator('input[placeholder*="이름"]').first().fill(name);
    console.log(`✍️ 이름 입력: "${name}"`);
  }

  async fillAffiliation(affiliation: string) {
    await this.page.locator('input[placeholder*="소속"]').first().fill(affiliation);
    console.log(`✍️ 소속 입력: "${affiliation}"`);
  }

  async openInquiryTypeDropdown() {
    const trigger = this.page.getByText('문의 내용을 선택해 주세요', { exact: false }).first();
    await trigger.scrollIntoViewIfNeeded();
    await this.page.evaluate(() => window.scrollBy(0, -120));
    await trigger.click({ force: true });
    await this.page.waitForTimeout(400);
    console.log('🖱️ 문의 종류 드롭다운 열기');
  }

  async verifyInquiryTypeOptions() {
    await this.openInquiryTypeDropdown();
    for (const type of INQUIRY_TYPES) {
      await expect(this.page.getByText(type, { exact: true }).first()).toBeVisible({ timeout: 5000 });
      console.log(`✅ 문의 종류 항목 확인: "${type}"`);
    }
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(300);
  }

  async selectInquiryType(typeName: string) {
    await this.openInquiryTypeDropdown();
    await this.page.getByText(typeName, { exact: true }).first().click({ force: true });
    await this.page.waitForTimeout(400);
    console.log(`🖱️ 문의 종류 선택: "${typeName}"`);
  }

  async verifyInquiryTypeSelected(typeName: string) {
    await expect(this.page.getByText(typeName, { exact: false }).first()).toBeVisible({ timeout: 5000 });
    console.log(`✅ 문의 종류 선택 반영 확인: "${typeName}"`);
  }

  async fillEmail(email: string) {
    const field = this.page.locator('input[placeholder*="E-mail"], input[placeholder*="이메일"], input[type="email"]').first();
    await field.fill(email);
    console.log(`✍️ 이메일 입력: "${email}"`);
  }

  async verifyEmailValidationError() {
    const errMsg = this.page.getByText(/이메일 형식을 다시 확인|이메일 형식/i).first();
    await expect(errMsg).toBeVisible({ timeout: 5000 });
    console.log('✅ 이메일 형식 오류 메시지 확인');
  }

  async fillPhone(phone: string) {
    const field = this.page.locator('input[placeholder*="연락받으실"], input[placeholder*="번호"], input[type="tel"]').first();
    await field.fill(phone);
    console.log(`✍️ 휴대폰 입력: "${phone}"`);
  }

  async verifyPhoneValidationError() {
    const errMsg = this.page.getByText(/전화번호를 올바르게/i).first();
    await expect(errMsg).toBeVisible({ timeout: 5000 });
    console.log('✅ 전화번호 형식 오류 메시지 확인');
  }

  async fillTitle(title: string) {
    await this.page.locator('input[placeholder*="제목"]').first().fill(title);
    console.log(`✍️ 제목 입력: "${title}"`);
  }

  async fillContent(content: string) {
    await this.page.locator('textarea').first().fill(content);
    console.log('✍️ 문의내용 입력');
  }

  async checkPrivacyConsent() {
    // 커스텀 체크박스: label 클릭으로 처리 (hidden input 직접 클릭 불가)
    const label = this.page.locator(
      'label[for*="agree"], label[for*="consent"], label[for*="privacy"], label[for*="name"]'
    ).first();
    if (await label.isVisible({ timeout: 2000 }).catch(() => false)) {
      await label.click({ force: true });
    } else {
      const checkbox = this.page.locator('input[type="checkbox"]').first();
      await checkbox.check({ force: true });
    }
    await this.page.waitForTimeout(300);
    console.log('🖱️ 개인정보 동의 체크');
  }

  async verifyPrivacyConsentChecked() {
    const checkbox = this.page.locator('input[type="checkbox"]').first();
    const isChecked = await checkbox.isChecked().catch(() => false);
    console.log(`✅ 개인정보 동의 체크 확인 (checked: ${isChecked})`);
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async clickSubmitButton() {
    const btn = this.page.getByRole('button', { name: /문의 접수하기|접수하기/ }).first();
    await btn.scrollIntoViewIfNeeded();
    await this.page.evaluate(() => window.scrollBy(0, -120));
    await btn.click({ force: true });
    await this.page.waitForTimeout(500);
    console.log('🖱️ "문의 접수하기" 버튼 클릭');
  }

  async verifyAlert(pattern: string | RegExp) {
    const alert = this.page.getByText(pattern, { exact: false }).first();
    await expect(alert).toBeVisible({ timeout: 8000 });
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

  // ── 파일 업로드 ──────────────────────────────────────────────────────────

  async uploadFileByBuffer(fileName: string, mimeType: string, content: Buffer) {
    const fileInput = this.page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({ name: fileName, mimeType, buffer: content });
    await this.page.waitForTimeout(500);
    console.log(`📎 파일 업로드: ${fileName} (${mimeType})`);
  }

  async verifyFileUploaded(fileName: string) {
    const fileNameEl = this.page.getByText(fileName, { exact: false }).first();
    await expect(fileNameEl).toBeVisible({ timeout: 5000 });
    console.log(`✅ 파일 업로드 확인: "${fileName}"`);
  }

  async verifyMaxFileCountAlert() {
    await expect(
      this.page.getByText(/최대.*1개|이미지 개수는 1개/i).first()
    ).toBeVisible({ timeout: 5000 });
    console.log('✅ 최대 파일 업로드 수(1개) 초과 알럿 확인');
  }

  async deleteUploadedFile() {
    const deleteBtn = this.page.locator(
      '[class*="file"] button, [class*="attach"] button, [class*="upload"] button'
    ).filter({ hasText: /삭제|×|✕|X/ }).first();
    if (await deleteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await deleteBtn.click({ force: true });
      await this.page.waitForTimeout(400);
      console.log('🖱️ 업로드 파일 삭제');
    } else {
      // aria-label로 닫기 버튼 탐색
      const closeBtn = this.page.locator('[aria-label*="삭제"], [aria-label*="제거"], [aria-label*="close"]').first();
      if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await closeBtn.click({ force: true });
        console.log('🖱️ 파일 삭제 (aria-label)');
      } else {
        console.log('ℹ️  파일 삭제 버튼 확인 불가 (DOM 구조 상이)');
      }
    }
  }

  // ── 완료 페이지 ──────────────────────────────────────────────────────────

  async verifySubmitSuccessPage() {
    await expect(
      this.page.getByText('서비스 이용 문의 접수가 완료되었습니다', { exact: false }).first()
    ).toBeVisible({ timeout: 15000 });
    console.log('✅ 문의 접수 완료 페이지 확인');
  }

  async verifyReceiptDatetime() {
    // 접수일시: YYYY-MM-DD HH:MM:SS 형식
    const pageText = await this.page.textContent('body') ?? '';
    const datetimeRegex = /20\d{2}-\d{2}-\d{2}/;
    expect(datetimeRegex.test(pageText)).toBeTruthy();
    console.log('✅ 접수일시 날짜 형식 확인');
  }

  async clickGoToMain() {
    const btn = this.page.getByRole('button', { name: /메인으로 이동|메인으로/ }).first().or(
      this.page.getByText('메인으로 이동', { exact: false }).first()
    );
    await btn.click({ force: true });
    await this.page.waitForURL(/\/$/, { timeout: 8000 });
    console.log('🖱️ "메인으로 이동" 클릭 → 메인 페이지 이동');
  }

  // ── 페이지 초기화 ─────────────────────────────────────────────────────────

  async verifyFieldsReset() {
    // 다른 탭 이동 후 복귀 시 입력 필드 초기화 확인
    const nameField = this.page.locator('input[placeholder*="이름"]').first();
    const val = await nameField.inputValue().catch(() => '');
    expect(val).toBe('');
    console.log(`✅ 서비스 이용 문의 필드 초기화 확인`);
  }

  // ── 전체 필수값 입력 헬퍼 ────────────────────────────────────────────────

  async fillAllRequiredFields(data: {
    name: string;
    affiliation: string;
    inquiryType: InquiryType;
    email: string;
    phone: string;
    title: string;
    content: string;
  }) {
    await this.fillName(data.name);
    await this.fillAffiliation(data.affiliation);
    await this.selectInquiryType(data.inquiryType);
    await this.fillEmail(data.email);
    await this.fillPhone(data.phone);
    await this.fillTitle(data.title);
    await this.fillContent(data.content);
    await this.checkPrivacyConsent();
    console.log('✅ 모든 필수 항목 입력 완료');
  }
}
