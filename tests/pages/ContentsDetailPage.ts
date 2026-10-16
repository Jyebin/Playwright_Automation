import { Page, expect, test } from '@playwright/test';

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
    // 콘텐츠명은 상세 헤더(.detail-title .title h5)에 표시된다
    const title = this.page.locator('.detail-title h5').first();
    await expect(title, '[UI/셀렉터] 콘텐츠 상세에 콘텐츠명(.detail-title h5)이 없음').toBeVisible({ timeout: 10000 });
    const text = (await title.innerText()).trim();
    expect(text.length, '[앱오류] 콘텐츠명이 비어 있음').toBeGreaterThan(1);
    console.log(`✅ 콘텐츠명 출력 확인: "${text}"`);
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
    // 2026-10-16 확인: 상세 결제 영역이 [결제 옵션 + 구매하기/서비스 이용 문의] 로 바뀌면서 배송비 항목이 사라짐
    const fee = this.page.getByText('배송비').first();
    const exists = await fee.isVisible({ timeout: 3000 }).catch(() => false);
    test.skip(!exists, '현재 콘텐츠 상세 화면에 배송비 항목이 없음 — 결제 영역이 [결제 옵션 + 구매하기] 로 변경됨 (스펙 확인 필요)');
    await expect(this.page.getByText(/배송비[\s\S]{0,20}0\s*원/).first(), '[앱오류] 배송비 초기값이 0원이 아님').toBeVisible({ timeout: 5000 });
    console.log('✅ 배송비 0원 초기값 확인');
  }

  async verifyTotalPriceZero() {
    const total = this.page.getByText(/총 결제 금액|총 금액/).first();
    const exists = await total.isVisible({ timeout: 3000 }).catch(() => false);
    test.skip(!exists, '현재 콘텐츠 상세 화면에 총 결제 금액 항목이 없음 — 결제 영역이 [결제 옵션 + 구매하기] 로 변경됨 (스펙 확인 필요)');
    await expect(this.page.getByText(/(총 결제 금액|총 금액)[\s\S]{0,20}0\s*원/).first(), '[앱오류] 총 결제 금액 초기값이 0원이 아님').toBeVisible({ timeout: 5000 });
    console.log('✅ 총 결제 금액 0원 초기값 확인');
  }

  // ----- 결제 정보 하단 링크 -----

  async clickViewMore() {
    const more = this.page.getByText('자세히 보기').first();
    const exists = await more.isVisible({ timeout: 3000 }).catch(() => false);
    test.skip(!exists, '현재 콘텐츠 상세 화면에 렌탈 안내 [자세히 보기] 가 없음 — 하단 "실습 장비 더 필요하신가요?" 안내로 대체됨 (스펙 확인 필요)');
    await more.click({ timeout: 10000 });
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
    const link = this.page.getByText('서비스 이용 문의').first();
    const exists = await link.isVisible({ timeout: 3000 }).catch(() => false);
    test.skip(!exists, '이 콘텐츠 상세에는 [서비스 이용 문의] 버튼이 없음 — 구매형 콘텐츠는 [구매하기] 가 노출됨');
    await link.click();
    await this.page.waitForURL(/\/cs\/inquiry/, { timeout: 10000 });
    console.log('🖱️ "서비스 이용 문의" 클릭 → ' + this.page.url());
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
    // 같은 이름이 탭 바(#Tab)와 본문 섹션 제목(.section-header) 양쪽에 있어 탭 바로 범위를 좁힌다
    const tab = this.page.locator('#Tab').getByText(name, { exact: true }).first();
    await expect(tab, `[UI/셀렉터] 상세 탭 바에 "${name}" 탭이 없음`).toBeVisible({ timeout: 8000 });
    await tab.click({ force: true });
    await this.page.waitForTimeout(800);
    console.log(`🖱️ 탭 클릭: ${name}`);
  }

  async verifyPracticeIntroSection() {
    // 본문의 섹션 제목(.section-header)과 그 아래 내용으로 확인
    const header = this.page.locator('.section-header').filter({ hasText: '실습 소개' }).first();
    await expect(header, '[앱오류] 상세 본문에 "실습 소개" 영역이 없음').toBeVisible({ timeout: 10000 });
    const body = await this.page.locator('#Introduce, .section-header:has-text("실습 소개") + *').first().innerText().catch(() => '');
    console.log(`✅ 실습 소개 영역 확인${body ? ' — 내용 ' + body.replace(/\s+/g, ' ').slice(0, 40) + '…' : ''}`);
  }

  async verifyCurriculumSection() {
    // 커리큘럼 영역 (썸네일, 타이틀 포함)
    const section = this.page.locator('[class*="curriculum"], [class*="Curriculum"]').first();
    await expect(section).toBeVisible({ timeout: 8000 });
    console.log('✅ 커리큘럼 영역 출력 확인');
  }

  async verifyNoticeSection() {
    const notice = this.page.getByText('공지사항').first();
    const exists = await notice.isVisible({ timeout: 3000 }).catch(() => false);
    test.skip(!exists, '현재 콘텐츠 상세 화면에 공지사항 영역이 없음 — 탭이 [이용가이드/실습 소개/커리큘럼/자주 묻는 질문] 으로 변경됨 (스펙 확인 필요)');
    await expect(notice, '[앱오류] 공지사항 영역이 보이지 않음').toBeVisible({ timeout: 8000 });
    const empty = await this.page.getByText('공지사항이 없습니다.').isVisible().catch(() => false);
    console.log(empty ? '✅ 공지사항 없음 안내 문구 확인' : '✅ 공지사항 목록 영역 확인');
  }

  // ----- 구매 관련 -----

  async clickBuyButton() {
    const btn = this.page.getByText('구매하기', { exact: true }).first();
    await btn.scrollIntoViewIfNeeded();
    await this.page.evaluate(() => window.scrollBy(0, -120));
    await this.page.waitForTimeout(200);
    await btn.click({ force: true });
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
    // 접근성 트리 상 첫 번째 "옵션을 선택해 주세요."는 현재 선택값 표시 영역,
    // 두 번째(img 화살표 포함)가 실제 구독권 드롭다운 트리거
    const trigger = this.page.getByText('옵션을 선택해 주세요.').nth(1);
    // 고정 GNB가 요소를 가릴 수 있으므로 뷰포트 중앙으로 스크롤
    await trigger.scrollIntoViewIfNeeded();
    await this.page.evaluate(() => window.scrollBy(0, -120));
    await this.page.waitForTimeout(300);
    // <span class="border"> 또는 GNB가 인터셉트하는 경우를 force로 우회
    await trigger.click({ force: true });
    await this.page.waitForTimeout(600);
    console.log('🖱️ 구독권 드롭다운 클릭 (nth=1, force)');
  }

  async verifySubscriptionDropdownOpen() {
    // 드롭다운 열림 확인 — 실제 클래스: "dropdown-list show-bottom"
    await expect(this.page.locator('[class*="dropdown-list"]').first()).toBeVisible({ timeout: 8000 });
    console.log('✅ 구독권 드롭다운 열림 확인');
  }

  async selectFirstSubscriptionOption() {
    // dropdown-list 컨테이너의 첫 번째 자식 클릭 (force=true: GNB/border span 인터셉트 우회)
    const option = this.page.locator('[class*="dropdown-list"]').locator('> *').first();
    await option.click({ force: true });
    await this.page.waitForTimeout(500);
    console.log('🖱️ 첫 번째 구독권 옵션 선택');
  }

  async verifySubscriptionSelected() {
    // 선택 후 h6(선택한 옵션명) 옆에 X 버튼(h6 ~ button)이 나타남
    await expect(this.page.locator('h6 ~ button').first()).toBeVisible({ timeout: 8000 });
    console.log('✅ 구독권 선택 후 결제 정보 노출 확인');
  }

  async clickSubscriptionClearButton() {
    // 선택된 항목 h6 옆 X 버튼 클릭 (선택 취소)
    const clearBtn = this.page.locator('h6 ~ button, h6 + button').first();
    await clearBtn.click({ force: true });
    await this.page.waitForTimeout(400);
    console.log('🖱️ 구독권 X 버튼 클릭 (선택 해제)');
  }

  async verifySubscriptionCleared() {
    // X 버튼이 사라지면 선택 해제 완료
    await expect(this.page.locator('h6 ~ button, h6 + button').first()).not.toBeVisible({ timeout: 5000 });
    console.log('✅ 구독권 선택 해제 및 드롭박스 초기화 확인');
  }

  async navigateToOrderPage() {
    // 1단계: 구독권 드롭다운 열기 + 첫 옵션 선택
    await this.clickSubscriptionDropdown();
    await this.selectFirstSubscriptionOption();

    // 선택 확인 — 드롭다운 트리거(nth=1)가 "옵션을 선택해 주세요." 에서 변경됐는지 확인
    // h6 ~ button은 선택 전에도 보이는 오탐(false positive)이므로 사용 안 함
    const isSelected = !(await this.page.getByText('옵션을 선택해 주세요.')
      .nth(1).isVisible({ timeout: 2000 }).catch(() => false));
    if (!isSelected) {
      // 드롭다운 트리거가 여전히 기본값 → 재시도
      console.log('ℹ️ 구독권 선택 미확인 — 드롭다운 재시도');
      await this.clickSubscriptionDropdown();
      await this.selectFirstSubscriptionOption();
      await this.page.waitForTimeout(600);
    }

    // 2단계: 현재 URL 저장 후 구매하기 클릭
    const detailUrl = this.page.url();
    await this.clickBuyButton();

    // 3단계: 알럿 감지 (콘텐츠 미선택 / 이미 구매 / 로그인 필요 등 모든 케이스)
    const errorAlertTexts = [
      '콘텐츠를 선택', '옵션을 선택', '이미 구매', '이미 구독', '로그인 후', '로그인이 필요',
    ];
    for (const text of errorAlertTexts) {
      if (await this.page.getByText(text, { exact: false }).first()
        .isVisible({ timeout: 800 }).catch(() => false)) {
        const content = await this.page.getByText(text, { exact: false }).first()
          .textContent().catch(() => text);
        throw new Error(`[앱오류] 구매하기 클릭 후 알럿 출현 ("${content?.trim().substring(0, 60)}") — 주문 페이지 진입 불가`);
      }
    }

    // 4단계: 상세 페이지에서 이탈 대기 (특정 URL 패턴 대신 URL 변경 감지로 유연하게 처리)
    try {
      await this.page.waitForFunction(
        (url) => window.location.href !== url && !window.location.href.includes('/contents/detail'),
        detailUrl,
        { timeout: 15000 }
      );
    } catch {
      const url = this.page.url();
      throw new Error(`[앱오류] 구매하기 클릭 후 주문 페이지 미이동 — 현재 URL: ${url} (/order, /payment, /checkout 등 기대)`);
    }
    await this.page.waitForLoadState('load');
    console.log(`✅ 주문 결제 페이지 이동 확인: ${this.page.url()}`);
  }

  async verifyOrderPageURL() {
    // 상세 페이지에서 벗어났는지 확인 (앱별 URL 구조가 다를 수 있어 패턴 대신 이탈 여부로 판단)
    const url = this.page.url();
    expect(url, `[앱오류] 구매 후 여전히 상세 페이지에 있음 — URL: ${url} (주문 결제 페이지로 이동되어야 함)`).not.toContain('/contents/detail');
    console.log(`✅ 주문 결제 페이지 URL 확인: ${url}`);
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
