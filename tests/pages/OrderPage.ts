import { Page, expect } from '@playwright/test';

export const DELIVERY_REQUEST_OPTIONS = [
  '배송 전 연락바랍니다.',
  '경비실에 맡겨주세요.',
  '집 앞에 놔주세요.',
  '택배함에 놔주세요.',
  '부재 시 핸드폰으로 연락주세요.',
  '부재 시 경비실에 맡겨주세요.',
  '부재 시 집 앞에 놔주세요.',
  '직접 입력',
];

export class OrderPage {
  constructor(private page: Page) {}

  async verifyBuyerNameAutofilled() {
    // 이름 필드: 계정 정보와 동일한 값이 자동 입력됨
    const nameInput = this.page.getByLabel('이름').or(
      this.page.locator('input[placeholder*="이름"]')
    ).first();
    const value = await nameInput.inputValue();
    expect(value.length).toBeGreaterThan(0);
    console.log(`✅ 구매자 이름 자동입력 확인: "${value}"`);
  }

  async verifyBuyerPhoneAutofilled() {
    // 휴대폰 필드: 계정 정보와 동일한 값이 자동 입력됨
    const phoneInput = this.page.getByLabel('휴대폰').or(
      this.page.locator('input[placeholder*="휴대폰"], input[placeholder*="연락처"]')
    ).first();
    const value = await phoneInput.inputValue();
    expect(value.length).toBeGreaterThan(0);
    console.log(`✅ 구매자 휴대폰 자동입력 확인: "${value}"`);
  }

  async verifyAddressEmpty() {
    // 주소 필드: 자동 입력되지 않음
    const addrInput = this.page.getByLabel('주소').or(
      this.page.locator('input[placeholder*="주소"]')
    ).first();
    const value = await addrInput.inputValue();
    expect(value.length).toBe(0);
    console.log('✅ 주소 필드 비어있음 확인');
  }

  async clickPaymentRequest() {
    await this.page.getByRole('button', { name: '결제 요청' }).or(
      this.page.getByText('결제요청', { exact: true })
    ).first().click();
    await this.page.waitForTimeout(500);
    console.log('🖱️ "결제 요청" 버튼 클릭');
  }

  async verifyAddressRequiredAlert() {
    await expect(
      this.page.getByText('배송지가 입력되지 않았습니다.', { exact: false }).first()
    ).toBeVisible({ timeout: 8000 });
    console.log('✅ "배송지가 입력되지 않았습니다." 알럿 확인');
  }

  async closeAlertModal() {
    const btn = this.page.getByRole('button', { name: '확인' }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
    } else {
      await this.page.keyboard.press('Escape');
    }
    await this.page.waitForTimeout(300);
    console.log('🖱️ 알럿 닫기');
  }

  async clickAddressSearch() {
    await this.page.getByRole('button', { name: '우편번호 찾기' }).or(
      this.page.getByText('우편번호 찾기')
    ).first().click();
    await this.page.waitForTimeout(1000);
    console.log('🖱️ "우편번호 찾기" 클릭');
  }

  async verifyAddressPopupOpened() {
    // 다음 주소 검색 팝업이 열렸는지 확인 (새 팝업 또는 iframe)
    const popup = this.page.locator('iframe[src*="daum"], iframe[src*="kakao"], [class*="address-popup"], [class*="AddressPopup"]').first();
    const isVisible = await popup.isVisible().catch(() => false);
    if (!isVisible) {
      // 새 페이지로 열린 경우
      const pages = this.page.context().pages();
      expect(pages.length).toBeGreaterThanOrEqual(2);
      console.log('✅ 주소 검색 팝업(새 창) 열림 확인');
    } else {
      await expect(popup).toBeVisible({ timeout: 5000 });
      console.log('✅ 주소 검색 팝업(iframe) 열림 확인');
    }
  }

  async clickDeliveryRequestDropdown() {
    // 배송 요청사항 드롭다운 클릭
    const dropdown = this.page.locator('[class*="delivery"], [class*="Delivery"]')
      .getByRole('combobox').or(
        this.page.getByText('배송 요청사항').locator('..').locator('select, [class*="select"], [class*="dropdown"]')
      ).first();
    await dropdown.click();
    await this.page.waitForTimeout(500);
    console.log('🖱️ 배송 요청사항 드롭다운 클릭');
  }

  async verifyDeliveryRequestOptions() {
    // 배송 요청사항 목록 중 일부 확인
    for (const opt of ['경비실에 맡겨주세요.', '직접 입력']) {
      await expect(
        this.page.getByText(opt, { exact: true }).first()
      ).toBeVisible({ timeout: 5000 });
      console.log(`✅ 배송 요청사항 옵션 확인: ${opt}`);
    }
  }

  async selectDeliveryRequestOption(name: string) {
    await this.page.getByText(name, { exact: true }).first().click();
    await this.page.waitForTimeout(400);
    console.log(`🖱️ 배송 요청사항 선택: ${name}`);
  }

  async verifyDirectInputFieldVisible() {
    // "직접 입력" 선택 시 텍스트 입력 필드 노출
    const inputField = this.page.locator(
      '[class*="delivery"] textarea, [class*="delivery"] input[type="text"], [placeholder*="직접 입력"], [placeholder*="입력해"]'
    ).first();
    await expect(inputField).toBeVisible({ timeout: 5000 });
    console.log('✅ 직접 입력 텍스트 필드 노출 확인');
  }

  async verifyTermsUncheckedAlert() {
    // 약관 미동의 상태에서 결제 요청 → 알럿
    await expect(
      this.page.getByText('약관에 동의해 주세요', { exact: false }).first()
    ).toBeVisible({ timeout: 8000 });
    console.log('✅ "약관에 동의해 주세요" 알럿 확인');
  }

  async clickTermsDetailView() {
    // 약관 [상세보기] 클릭 → 새 탭으로 서비스 이용약관 열림
    const [newPage] = await Promise.all([
      this.page.context().waitForEvent('page', { timeout: 10000 }),
      this.page.getByText('상세보기').first().click(),
    ]);
    await newPage.waitForLoadState('domcontentloaded', { timeout: 10000 });
    expect(newPage.url()).toContain('agreement');
    await newPage.close();
    console.log('✅ 약관 상세보기 → 서비스 이용약관 새 탭 열림 확인');
  }

  async clickCancelButton() {
    await this.page.getByRole('button', { name: '취소' }).last().click();
    await this.page.waitForTimeout(500);
    console.log('🖱️ 취소 버튼 클릭');
  }

  async verifyCancelConfirmAlert() {
    await expect(
      this.page.getByText('입력한 내용이 모두 사라집니다.', { exact: false }).first()
    ).toBeVisible({ timeout: 8000 });
    console.log('✅ 주문 취소 확인 알럿 출력 확인');
  }

  async clickAlertCancel() {
    // 알럿 내 [취소] 버튼 → 알럿 닫힘
    await this.page.locator('[class*="modal"], [class*="Modal"]')
      .getByRole('button', { name: '취소' }).first().click();
    await this.page.waitForTimeout(300);
    console.log('🖱️ 알럿 내 [취소] 버튼 클릭');
  }

  async clickAlertConfirm() {
    // 알럿 내 [확인] 버튼 → 이전 페이지(콘텐츠 상세)로 이동
    await this.page.locator('[class*="modal"], [class*="Modal"]')
      .getByRole('button', { name: '확인' }).first().click();
    await this.page.waitForURL(/\/contents\/detail/, { timeout: 10000 });
    console.log('🖱️ 알럿 내 [확인] 버튼 클릭 → 상세 페이지 복귀');
  }

  async verifyReturnedToDetailPage() {
    await expect(this.page).toHaveURL(/\/contents\/detail/);
    console.log('✅ 콘텐츠 상세 페이지 복귀 확인');
  }

  async checkTermsCheckbox() {
    // 약관 동의 체크박스
    const checkbox = this.page.locator('[class*="terms"] input[type="checkbox"], [class*="agreement"] input[type="checkbox"]').first();
    await checkbox.check({ force: true });
    console.log('🖱️ 약관 동의 체크');
  }
}
