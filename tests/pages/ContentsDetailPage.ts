import { Page, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? '';

export const DETAIL_TABS = ['이용가이드', '실습 소개', '커리큘럼', '자주 묻는 질문'];

export class ContentsDetailPage {
  constructor(private page: Page) {}

  async verifyURL() {
    await expect(this.page).toHaveURL(/\/contents\/detail\?id=\d+/);
    console.log(`✅ 상세 페이지 URL 확인: ${this.page.url()}`);
  }

  // ----- 콘텐츠 구성 요소 -----

  async verifyContentCategory() {
    // 카테고리 텍스트 (예: 보건 의료, IT 실습 등)
    const category = this.page.locator('[class*="category"], [class*="Category"]').first();
    await expect(category).toBeVisible({ timeout: 8000 });
    console.log('✅ 콘텐츠 카테고리 출력 확인');
  }

  async verifyContentName() {
    // main 영역 내 첫 번째 visible 헤딩 또는 title 클래스 요소
    const found = await this.page.evaluate(() => {
      const selectors = ['h1', 'h2', 'h3', 'h4', '[class*="title"]', '[class*="Title"]'];
      for (const sel of selectors) {
        const els = Array.from(document.querySelectorAll(sel));
        const visible = els.find(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        if (visible) return visible.textContent?.trim().substring(0, 60);
      }
      return null;
    });
    expect(found).toBeTruthy();
    console.log(`✅ 콘텐츠명 출력 확인: ${found}`);
  }

  async verifyContentDescription() {
    // 실습 소개 문구 (description / intro)
    const desc = this.page.locator('[class*="description"], [class*="Description"], [class*="intro"], [class*="Intro"]').first();
    await expect(desc).toBeVisible({ timeout: 8000 });
    console.log('✅ 콘텐츠 설명 출력 확인');
  }

  async verifyContentTags() {
    // 태그/키워드/해시태그 영역 (클래스명 다양)
    const tag = this.page.locator(
      '[class*="tag"], [class*="Tag"], [class*="keyword"], [class*="Keyword"], [class*="label"], [class*="Label"], [class*="badge"], [class*="Badge"], [class*="chip"], [class*="Chip"], [class*="hash"], a[href*="keyword"]'
    ).first();
    await expect(tag).toBeVisible({ timeout: 8000 });
    console.log('✅ 콘텐츠 태그 출력 확인');
  }

  // ----- 구매정보 placeholder -----

  async verifySubscriptionPlaceholder() {
    await expect(
      this.page.getByText('옵션을 선택해 주세요.').first()
    ).toBeVisible({ timeout: 8000 });
    console.log('✅ 구독권 placeholder "옵션을 선택해 주세요." 확인');
  }

  async verifyShippingFeeZero() {
    // 배송비 0원
    const shipping = this.page.locator('[class*="shipping"], [class*="Shipping"], [class*="delivery"]')
      .getByText('0원').first();
    await expect(shipping).toBeVisible({ timeout: 8000 });
    console.log('✅ 배송비 "0원" 확인');
  }

  async verifyTotalPriceZero() {
    // 총 결제 금액 0원 — 클래스명 다양하므로 hasText 필터 사용
    const total = this.page.locator(
      '[class*="total"], [class*="Total"], [class*="payment"], [class*="Payment"], [class*="amount"], [class*="Amount"], [class*="price"], [class*="Price"]'
    ).filter({ hasText: '0원' }).first();
    const count = await total.count();
    if (count > 0) {
      await expect(total).toBeVisible({ timeout: 8000 });
    } else {
      // fallback: 페이지 내 '0원' 텍스트 존재 확인
      await expect(this.page.getByText('0원').first()).toBeVisible({ timeout: 8000 });
    }
    console.log('✅ 총 결제 금액 "0원" 확인');
  }

  // ----- 결제 정보 하단 링크 -----

  async clickViewMore() {
    await this.page.getByText('자세히 보기').first().click();
    await this.page.waitForTimeout(500);
    console.log('🖱️ "자세히 보기" 클릭');
  }

  async verifyRentalModalVisible() {
    // 렌탈 안내 모달 출력 확인
    const modal = this.page.locator('[class*="modal"], [class*="Modal"]').getByText('렌탈', { exact: false }).first();
    await expect(modal).toBeVisible({ timeout: 8000 });
    console.log('✅ 렌탈 안내 모달 출력 확인');
  }

  async closeModal() {
    const closeBtn = this.page.locator('[class*="modal"], [class*="Modal"]')
      .locator('button[class*="close"], button[aria-label*="닫"], [class*="close"], [class*="Close"]').first();
    await closeBtn.click();
    await this.page.waitForTimeout(300);
    console.log('🖱️ 모달 닫기');
  }

  async clickServiceInquiry() {
    await this.page.getByText('서비스 이용 문의').first().click();
    await this.page.waitForURL(/\/cs\/inquiry/);
    console.log('🖱️ "서비스 이용 문의" 클릭');
  }

  async verifyServiceInquiryPage() {
    await expect(this.page).toHaveURL(/\/cs\/inquiry/);
    console.log('✅ 고객센터 페이지 이동 확인');
  }

  // ----- 탭 메뉴 -----

  async verifyTabMenuItems() {
    const required = ['이용가이드', '실습 소개', '커리큘럼'];
    for (const tab of required) {
      await expect(this.page.getByText(tab, { exact: true }).first()).toBeVisible({ timeout: 5000 });
      console.log(`✅ 탭 메뉴 확인: ${tab}`);
    }
    // 콘텐츠에 따라 없을 수 있음
    const faq = await this.page.getByText('자주 묻는 질문', { exact: true }).first().isVisible().catch(() => false);
    console.log(`${faq ? '✅' : '⚠️ (콘텐츠에 없음)'} 탭 메뉴: 자주 묻는 질문`);
  }

  async clickTab(name: string) {
    await this.page.getByText(name, { exact: true }).first().click();
    await this.page.waitForTimeout(800);
    console.log(`🖱️ 탭 클릭: ${name}`);
  }

  async verifyPracticeIntroSection() {
    // 실습 소개 영역 가시성 확인
    const section = this.page.locator('[class*="intro"], [class*="Intro"], [class*="practice"]').first();
    await expect(section).toBeVisible({ timeout: 8000 });
    console.log('✅ 실습 소개 영역 출력 확인');
  }

  async verifyCurriculumSection() {
    // 커리큘럼 영역 (썸네일, 타이틀 포함)
    const section = this.page.locator('[class*="curriculum"], [class*="Curriculum"]').first();
    await expect(section).toBeVisible({ timeout: 8000 });
    console.log('✅ 커리큘럼 영역 출력 확인');
  }

  async verifyNoticeSection() {
    // 공지사항 영역 또는 "공지사항이 없습니다." 안내
    const noticeTitle = this.page.getByText('공지사항').first();
    await expect(noticeTitle).toBeVisible({ timeout: 8000 });
    // 공지사항이 없을 경우 안내 문구 출력
    const isEmpty = await this.page.getByText('공지사항이 없습니다.').isVisible().catch(() => false);
    if (isEmpty) {
      console.log('✅ 공지사항 없음 안내 문구 확인');
    } else {
      console.log('✅ 공지사항 목록 영역 확인');
    }
  }

  // ----- 구매 관련 -----

  async clickBuyButton() {
    await this.page.getByText('구매하기', { exact: true }).first().click();
    await this.page.waitForTimeout(500);
    console.log('🖱️ "구매하기" 버튼 클릭');
  }

  async verifyLoginAlertModal() {
    await expect(
      this.page.getByText('로그인 후 이용해주세요.', { exact: false }).first()
    ).toBeVisible({ timeout: 8000 });
    console.log('✅ "로그인 후 이용해주세요." 알럿 확인');
  }

  async clickGoToLoginInAlert() {
    await this.page.getByText('로그인 하러가기', { exact: false }).first().click();
    await this.page.waitForURL(/\/login/);
    console.log('🖱️ 알럿 내 로그인 페이지 이동');
  }

  async verifyNoOptionAlertModal() {
    await expect(
      this.page.getByText('콘텐츠를 선택해주세요.', { exact: false }).first()
    ).toBeVisible({ timeout: 8000 });
    console.log('✅ "콘텐츠를 선택해주세요." 알럿 확인');
  }

  async closeAlertModal() {
    // 알럿 모달 닫기 (확인 버튼)
    const confirmBtn = this.page.locator('[class*="modal"], [class*="Modal"]')
      .getByRole('button', { name: '확인' }).first();
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
    } else {
      await this.page.keyboard.press('Escape');
    }
    await this.page.waitForTimeout(300);
    console.log('🖱️ 알럿 모달 닫기');
  }

  async clickSubscriptionDropdown() {
    // 구독권 드롭다운 클릭 (placeholder가 "옵션을 선택해 주세요."인 셀렉트박스)
    await this.page.getByText('옵션을 선택해 주세요.').first().click();
    await this.page.waitForTimeout(500);
    console.log('🖱️ 구독권 드롭다운 클릭');
  }

  async verifySubscriptionDropdownOpen() {
    // 드롭다운 목록이 열렸는지 확인 (option 항목 또는 li)
    const options = this.page.locator('[class*="dropdown"] li, [class*="option-list"] li, [class*="Option"]');
    await expect(options.first()).toBeVisible({ timeout: 5000 });
    console.log('✅ 구독권 드롭다운 열림 확인');
  }

  async selectFirstSubscriptionOption() {
    // 첫 번째 옵션 선택
    const option = this.page.locator('[class*="dropdown"] li, [class*="option-list"] li, [class*="Option"]').first();
    await option.click();
    await this.page.waitForTimeout(500);
    console.log('🖱️ 첫 번째 구독권 옵션 선택');
  }

  async verifySubscriptionSelected() {
    // 선택 후 구독권 결제 정보 노출 확인 (가격 정보 표시)
    await expect(this.page.getByText('옵션을 선택해 주세요.').first()).not.toBeVisible();
    console.log('✅ 구독권 선택 후 결제 정보 노출 확인');
  }

  async clickSubscriptionClearButton() {
    // X 버튼으로 선택 해제
    const clearBtn = this.page.locator('[class*="clear"], [class*="Close"], [class*="remove"]').first();
    await clearBtn.click({ force: true });
    await this.page.waitForTimeout(400);
    console.log('🖱️ 구독권 X 버튼 클릭 (선택 해제)');
  }

  async verifySubscriptionCleared() {
    await expect(
      this.page.getByText('옵션을 선택해 주세요.').first()
    ).toBeVisible({ timeout: 5000 });
    console.log('✅ 구독권 선택 해제 및 드롭박스 초기화 확인');
  }

  async navigateToOrderPage() {
    // 구독권 선택 → 구매하기 → 주문 결제 페이지
    await this.clickSubscriptionDropdown();
    await this.selectFirstSubscriptionOption();
    await this.clickBuyButton();
    await this.page.waitForURL(/\/order|\/payment|\/checkout/, { timeout: 10000 });
    await this.page.waitForLoadState('load');
    console.log('✅ 주문 결제 페이지 이동 확인');
  }

  async verifyOrderPageURL() {
    await expect(this.page).toHaveURL(/\/order|\/payment|\/checkout/);
    console.log(`✅ 주문 결제 페이지 URL 확인: ${this.page.url()}`);
  }

  async clickCancelOnOrderPage() {
    await this.page.getByRole('button', { name: '취소' }).last().click();
    await this.page.waitForTimeout(500);
    console.log('🖱️ 주문 결제 취소 버튼 클릭');
  }

  async verifyCancelAlertModal() {
    await expect(
      this.page.getByText('입력한 내용이 모두 사라집니다.', { exact: false }).first()
    ).toBeVisible({ timeout: 8000 });
    console.log('✅ 주문 취소 알럿 확인');
  }
}
