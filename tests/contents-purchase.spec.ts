import { test, expect } from '@playwright/test';
import { ContentsPage } from './pages/ContentsPage';
import { ContentsDetailPage } from './pages/ContentsDetailPage';
import { OrderPage } from './pages/OrderPage';

const BASE = process.env.BASE_URL ?? '';

// ─── T401 [비로그인] ────────────────────────────────────────────────────────
test.describe('T401 - 비로그인 상태 구매', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('비로그인 상태에서 구매하기 클릭 시 "로그인 후 이용해주세요." 알럿 확인', async ({ page }) => {
    // 콘텐츠 상세 페이지로 직접 이동 (storageState 없는 상태)
    await page.goto(`${BASE}/contents`);
    await page.waitForLoadState('load');
    const contents = new ContentsPage(page);
    await contents.clickFirstCard();

    const detail = new ContentsDetailPage(page);
    await detail.clickBuyButton();
    await detail.verifyLoginAlertModal();
  });

  test('알럿 내 "로그인 하러가기" 클릭 시 로그인 페이지 이동', async ({ page }) => {
    await page.goto(`${BASE}/contents`);
    await page.waitForLoadState('load');
    const contents = new ContentsPage(page);
    await contents.clickFirstCard();

    const detail = new ContentsDetailPage(page);
    await detail.clickBuyButton();
    await detail.verifyLoginAlertModal();
    await detail.clickGoToLoginInAlert();
    await expect(page).toHaveURL(/\/login/);
    console.log('✅ 로그인 페이지 이동 확인');
  });
});

// ─── T401 [로그인 후] ────────────────────────────────────────────────────────
test.describe('T401 - 로그인 후 구매 플로우', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/contents`);
    await page.waitForLoadState('load');
    const contents = new ContentsPage(page);
    await contents.clickFirstPaidCard();
  });

  test('옵션 미선택 상태에서 구매하기 클릭 시 "콘텐츠를 선택해주세요." 알럿', async ({ page }) => {
    const detail = new ContentsDetailPage(page);
    await detail.clickBuyButton();
    await detail.verifyNoOptionAlertModal();
  });

  test('구독권 드롭다운 클릭 시 옵션 목록 노출', async ({ page }) => {
    const detail = new ContentsDetailPage(page);
    await detail.clickSubscriptionDropdown();
    await detail.verifySubscriptionDropdownOpen();
  });

  test('구독권 옵션 선택 시 결제 정보 노출', async ({ page }) => {
    const detail = new ContentsDetailPage(page);
    await detail.clickSubscriptionDropdown();
    await detail.selectFirstSubscriptionOption();
    await detail.verifySubscriptionSelected();
  });

  test('구독권 X 버튼 클릭 시 선택 해제 및 드롭박스 초기화', async ({ page }) => {
    const detail = new ContentsDetailPage(page);
    await detail.clickSubscriptionDropdown();
    await detail.selectFirstSubscriptionOption();
    await detail.clickSubscriptionClearButton();
    await detail.verifySubscriptionCleared();
  });

  test('구독권 선택 후 구매하기 클릭 시 주문 결제 페이지 이동', async ({ page }) => {
    const detail = new ContentsDetailPage(page);
    await detail.navigateToOrderPage();
    await detail.verifyOrderPageURL();
  });

  test('주문 결제 페이지 취소 버튼 클릭 → 알럿 → [취소] 클릭 시 알럿 닫힘', async ({ page }) => {
    const detail = new ContentsDetailPage(page);
    await detail.navigateToOrderPage();
    const order = new OrderPage(page);
    await order.clickCancelButton();
    await order.verifyCancelConfirmAlert();
    await order.clickAlertCancel();
    // 알럿 닫히고 여전히 주문 결제 페이지에 있어야 함
    await expect(page).toHaveURL(/\/order|\/payment|\/checkout/);
    console.log('✅ 알럿 [취소] 클릭 → 알럿 닫히고 주문 페이지 유지');
  });

  test('주문 결제 페이지 취소 알럿 → [확인] 클릭 시 콘텐츠 상세 페이지 복귀', async ({ page }) => {
    const detail = new ContentsDetailPage(page);
    await detail.navigateToOrderPage();
    const order = new OrderPage(page);
    await order.clickCancelButton();
    await order.verifyCancelConfirmAlert();
    await order.clickAlertConfirm();
    await order.verifyReturnedToDetailPage();
  });
});

// ─── T402 [주문 결제 정보 입력] ──────────────────────────────────────────────
test.describe('T402 - 주문 결제 정보 입력 확인', () => {
  // 공유 상세 페이지 URL을 저장해두고 재사용
  let detailUrl = '';

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/contents`);
    await page.waitForLoadState('load');
    const contents = new ContentsPage(page);
    await contents.clickFirstPaidCard();
    detailUrl = page.url();
    const detail = new ContentsDetailPage(page);
    await detail.navigateToOrderPage();
  });

  test('구매자 이름 자동 입력 확인 (계정 정보와 동일)', async ({ page }) => {
    const order = new OrderPage(page);
    await order.verifyBuyerNameAutofilled();
  });

  test('구매자 휴대폰 자동 입력 확인', async ({ page }) => {
    const order = new OrderPage(page);
    await order.verifyBuyerPhoneAutofilled();
  });

  test('주소 미입력 상태에서 결제 요청 시 알럿 확인', async ({ page }) => {
    const order = new OrderPage(page);
    await order.clickPaymentRequest();
    await order.verifyAddressRequiredAlert();
  });

  test('"우편번호 찾기" 클릭 시 주소 검색 팝업 열림', async ({ page }) => {
    const order = new OrderPage(page);
    await order.clickAddressSearch();
    await order.verifyAddressPopupOpened();
  });

  test('배송 요청사항 드롭다운 클릭 시 목록 노출', async ({ page }) => {
    const order = new OrderPage(page);
    await order.clickDeliveryRequestDropdown();
    await order.verifyDeliveryRequestOptions();
  });

  test('"직접 입력" 선택 시 텍스트 입력 필드 노출', async ({ page }) => {
    const order = new OrderPage(page);
    await order.clickDeliveryRequestDropdown();
    await order.selectDeliveryRequestOption('직접입력');
    await order.verifyDirectInputFieldVisible();
  });

  test('약관 미동의 상태에서 결제 요청 시 "약관에 동의해 주세요" 알럿', async ({ page }) => {
    // 주소를 입력한 후 약관 미동의 상태로 결제 요청
    const order = new OrderPage(page);
    // 주소 입력 없이는 주소 알럿이 먼저 뜨므로, 약관 알럿은 주소 입력 후 테스트
    // 이 테스트에서는 주소 필드에 임의 텍스트를 강제 입력 후 진행
    await page.evaluate(() => {
      // React controlled input: native setter로 value 주입 (disabled 포함)
      const nativeSet = (Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') as any)?.set;
      const fields: Array<{ kw: string; val: string }> = [
        { kw: '우편번호', val: '06234' },
        { kw: '기본 주소', val: '서울시 강남구 테헤란로 1' },
        { kw: '상세 주소', val: '101호' },
      ];
      fields.forEach(({ kw, val }) => {
        const el = document.querySelector<HTMLInputElement>(`input[placeholder*="${kw}"]`);
        if (el) {
          el.removeAttribute('disabled');
          if (nativeSet) { nativeSet.call(el, val); }
          else { el.value = val; }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });
    await order.clickPaymentRequest();
    await order.verifyTermsUncheckedAlert();
  });

  test('약관 [상세보기] 클릭 시 서비스 이용약관 새 탭 열림', async ({ page }) => {
    const order = new OrderPage(page);
    await order.clickTermsDetailView();
  });

  test('취소 버튼 → 알럿 → [확인] 클릭 시 콘텐츠 상세 페이지 복귀', async ({ page }) => {
    const order = new OrderPage(page);
    await order.clickCancelButton();
    await order.verifyCancelConfirmAlert();
    await order.clickAlertConfirm();
    await order.verifyReturnedToDetailPage();
  });
});
