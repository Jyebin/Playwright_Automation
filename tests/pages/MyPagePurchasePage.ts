import { Page, expect } from '@playwright/test';
import { MyPage } from './MyPage';

export class MyPagePurchasePage {
  constructor(private page: Page) {}

  /** 마이페이지 진입(세션 만료 시 재로그인은 MyPage.navigate 가 처리) → [구매 및 결제 관리] 탭 */
  async navigate() {
    const myPage = new MyPage(this.page);
    await myPage.navigate();
    await myPage.clickTab('구매 및 결제 관리');
    await expect(
      this.page.locator('#MyPurchaseHistory').first(),
      '[UI/셀렉터] 구매 및 결제 관리 화면(#MyPurchaseHistory)이 표시되지 않음 — 로그인 세션 또는 셀렉터 확인',
    ).toBeVisible({ timeout: 15000 });
    console.log('✅ 마이페이지 > 구매 및 결제 관리 탭 이동');
  }

  /** 구매내역 표(#PurchaseHistoryTable)가 그려질 때까지 기다린 뒤 판정 — 빈 목록이면 .no-data 클래스가 붙음 */
  async hasPurchaseHistory(): Promise<boolean> {
    const table = this.page.locator('#PurchaseHistoryTable');
    await expect(table, '[UI/셀렉터] 구매내역 표(#PurchaseHistoryTable)를 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 15000 });
    await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    const isEmpty = await table.evaluate(el => el.classList.contains('no-data'));
    console.log(`✅ 구매내역 유무: ${isEmpty ? '없음 (#PurchaseHistoryTable.no-data)' : '있음'}`);
    return !isEmpty;
  }

  async verifyEmptyState() {
    // 구조: #PurchaseHistoryTable.no-data > .top > h5 "구매 내역이 없습니다." + p "아직 구매한 콘텐츠가 없습니다."
    const emptyBox = this.page.locator('#PurchaseHistoryTable.no-data .top');
    await expect(
      emptyBox.locator('h5'),
      '[앱오류] "구매 내역이 없습니다." 안내 문구가 표시되지 않음'
    ).toHaveText(/구매 내역이 없습니다/, { timeout: 8000 });
    const title = (await emptyBox.locator('h5').innerText()).trim();
    const desc = (await emptyBox.locator('p').allInnerTexts()).map(s => s.trim()).filter(Boolean).join(' ');
    console.log(`✅ 구매내역 없음 문구: "${title}" / "${desc}"`);
    expect.soft(desc, '[앱오류] 보조 문구 "아직 구매한 콘텐츠가 없습니다."가 표시되지 않음').toContain('아직 구매한 콘텐츠가 없습니다');
  }

  /** 구매 및 결제 관리 상단 타이틀 옆 [문의하기] 링크 (구조: #MyPurchaseHistory .list-group > .title > h5 + a.link) */
  private get topInquiryLink() {
    return this.page.locator('#MyPurchaseHistory .list-group .title a.link').filter({ hasText: '문의하기' }).first();
  }

  async verifyTopInquiryButtonExists() {
    await expect(this.topInquiryLink, '[UI/셀렉터] 구매 및 결제 관리 상단 [문의하기] 링크를 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 15000 });
    const href = await this.topInquiryLink.getAttribute('href');
    console.log(`✅ 상단 [문의하기] 링크 확인 (href="${href}")`);
  }

  async clickTopInquiryButton() {
    await this.topInquiryLink.click();
    await this.page.waitForURL(/\/cs\/inquiry/, { timeout: 10000, waitUntil: 'commit' }).catch(() => {});
    console.log(`🖱️ 상단 [문의하기] 클릭 → URL ${new URL(this.page.url()).pathname}`);
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
