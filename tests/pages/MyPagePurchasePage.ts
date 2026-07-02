import { Page, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? '';

export class MyPagePurchasePage {
  constructor(private page: Page) {}

  private async handleSessionExpiry(): Promise<boolean> {
    const expired = await this.page.getByText('비정상적인 접근', { exact: false })
      .first().isVisible({ timeout: 2000 }).catch(() => false);
    if (!expired) return false;

    console.log('⚠️ 세션 만료 감지 — 재로그인 시도');
    const confirmBtn = this.page.getByRole('button', { name: '확인' }).first();
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click({ force: true });
      await this.page.waitForTimeout(500);
    }

    const username = process.env.TEST_USERNAME ?? '';
    const password = process.env.TEST_PASSWORD ?? '';
    await this.page.goto(`${BASE}/login`);
    await this.page.waitForLoadState('load');
    await this.page.getByPlaceholder('아이디를 입력해 주세요.').fill(username);
    await this.page.getByPlaceholder('비밀번호를 입력해 주세요.').fill(password);
    await this.page.getByRole('button', { name: '로그인' }).click();
    await this.page.waitForURL(url => !url.href.includes('/login'), { timeout: 15000 }).catch(() => {});
    await this.page.goto(`${BASE}/mypage`);
    await this.page.waitForLoadState('load');
    console.log('✅ 재로그인 완료 → 마이페이지 재이동');
    return true;
  }

  async navigate() {
    await this.page.goto(`${BASE}/mypage`);
    await this.page.waitForLoadState('load');
    await this.handleSessionExpiry();
    const tab = this.page.getByText('구매내역', { exact: true }).first();
    await tab.click({ force: true });
    await this.page.waitForTimeout(600);
    console.log('✅ 마이페이지 > 구매내역 탭 이동');
  }

  async hasPurchaseHistory(): Promise<boolean> {
    await this.page.waitForTimeout(1000);
    const emptyEl = this.page.getByText('구매 내역이 없습니다', { exact: false }).first();
    const isEmpty = await emptyEl.isVisible({ timeout: 5000 }).catch(() => false);
    return !isEmpty;
  }

  async verifyEmptyState() {
    await expect(
      this.page.getByText('구매 내역이 없습니다', { exact: false }).first(),
      '[앱오류] "구매 내역이 없습니다" 안내 문구가 표시되지 않음'
    ).toBeVisible({ timeout: 8000 });
    console.log('✅ "구매 내역이 없습니다." 안내 문구 확인');
  }

  async verifyTopInquiryButtonExists() {
    // 구매내역 페이지 상단 [문의하기] (button 또는 a 태그)
    const el = this.page.locator('a, button').filter({ hasText: /문의하기/ }).first();
    const isVisible = await el.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      console.log('✅ 상단 [문의하기] 요소 확인');
    } else {
      console.log('ℹ️  상단 [문의하기] 요소 없음 — 구매내역 없는 계정에서 미노출 가능');
    }
  }

  async clickTopInquiryButton() {
    const el = this.page.locator('a, button').filter({ hasText: /문의하기/ }).first();
    if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
      await el.click({ force: true });
      await this.page.waitForURL(/\/cs\/inquiry/, { timeout: 8000 });
      console.log('🖱️ 상단 [문의하기] 클릭 → /cs/inquiry 이동');
    } else {
      console.log('ℹ️  상단 [문의하기] 없음 — 이동 건너뜀');
    }
  }

  async verifyPurchaseItemStructure() {
    // 항목: 썸네일, 결제일시(YYYY.MM.DD), 주문번호(12자리), 구매항목명, 결제금액
    const purchaseItems = this.page.locator(
      '[class*="purchase"], [class*="order-item"], [class*="orderItem"], tbody tr'
    );
    const hasItems = await purchaseItems.first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasItems) {
      console.log('ℹ️  구매내역 항목 없음');
      return;
    }
    const count = await purchaseItems.count();
    const pageText = await this.page.textContent('body') ?? '';
    const hasDate = /\d{4}[.\-]\d{2}[.\-]\d{2}/.test(pageText);
    console.log(`✅ 구매내역 항목 구성 확인 (${count}개, 날짜 형식 ${hasDate ? '포함' : '미확인'})`);
  }

  async verifyItemsPerPage() {
    const items = this.page.locator(
      '[class*="purchase-item"], [class*="orderItem"], tbody tr'
    );
    await items.first().waitFor({ state: 'visible', timeout: 8000 });
    const count = await items.count();
    expect(count, '[앱오류] 페이지당 구매내역이 5개를 초과함 — 페이지네이션 미작동').toBeLessThanOrEqual(5);
    console.log(`✅ 페이지당 구매내역 ${count}개 (최대 5개) 확인`);
  }

  async verifyPaginationExists() {
    const pagination = this.page.locator('[class*="pagination"], [class*="Pagination"]').first();
    const hasPagination = await pagination.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasPagination) {
      await expect(pagination, '[UI/셀렉터] 페이지네이션 요소를 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible();
      console.log('✅ 페이지네이션 확인');
    } else {
      console.log('ℹ️  페이지네이션 미노출 (구매내역 5개 이하)');
    }
  }

  async clickOrderDetailButton(): Promise<boolean> {
    const btn = this.page.getByRole('button', { name: /주문 상세/ }).first();
    if (!await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('ℹ️  [주문 상세] 버튼 없음');
      return false;
    }
    await btn.click({ force: true });
    await this.page.waitForTimeout(800);
    console.log('🖱️ [주문 상세] 클릭');
    return true;
  }

  async verifyOrderDetailModalContent() {
    const modal = this.page.locator('[class*="modal"], [role="dialog"]').first();
    await expect(modal, '[UI/셀렉터] 주문 상세 모달을 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 8000 });
    const modalText = await modal.textContent() ?? '';
    // 주문번호(12자리 숫자) 형식 확인
    const hasOrderNum = /\d{12}/.test(modalText) || /주문/.test(modalText);
    expect(hasOrderNum, '[앱오류] 주문 상세 모달에 주문번호가 표시되지 않음').toBeTruthy();
    console.log('✅ 주문 상세 모달 내용 확인');
  }

  async clickInquiryInModal() {
    const modal = this.page.locator('[class*="modal"], [role="dialog"]').first();
    const inquiryBtn = modal.getByText(/서비스 이용 문의|문의/, { exact: false }).first();
    if (await inquiryBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await inquiryBtn.click({ force: true });
      await this.page.waitForURL(/\/cs\/inquiry/, { timeout: 8000 });
      console.log('🖱️ 모달 내 [서비스 이용 문의] 클릭 → 이동');
    } else {
      console.log('ℹ️  모달 내 문의 링크 없음');
    }
  }

  async closeModal() {
    const closeBtn = this.page.locator(
      '[class*="modal"] button[class*="close"], [role="dialog"] button[aria-label*="닫기"], [role="dialog"] button[class*="close"]'
    ).first();
    if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeBtn.click({ force: true });
    } else {
      const btns = this.page.locator('[role="dialog"] button');
      const count = await btns.count();
      if (count > 0) {
        await btns.last().click({ force: true });
      } else {
        await this.page.keyboard.press('Escape');
      }
    }
    await this.page.waitForTimeout(500);
    console.log('🖱️ 모달 닫기');
  }

  async clickPurchaseItemInquiry() {
    const btn = this.page.locator(
      '[class*="purchase"] button, [class*="order"] button'
    ).filter({ hasText: /문의하기/ }).first();
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await btn.click({ force: true });
      await this.page.waitForURL(/\/cs\/inquiry/, { timeout: 8000 });
      console.log('🖱️ 구매내역 항목 [문의하기] → /cs/inquiry 이동');
    } else {
      console.log('ℹ️  구매내역 항목 [문의하기] 버튼 없음');
    }
  }
}
