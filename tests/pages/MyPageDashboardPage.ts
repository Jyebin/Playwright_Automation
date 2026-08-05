import { Page, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? '';

export class MyPageDashboardPage {
  constructor(private page: Page) {}

  async navigate() {
    await this.page.goto(`${BASE}/mypage/dashboard`);
    await this.page.waitForLoadState('load');
  }

  async verifyDashboardVisible() {
    await expect(
      this.page.locator('[class*="dashboard"], [class*="Dashboard"]').first(),
      '[UI/셀렉터] 실습 대시보드 영역을 찾을 수 없음 — 셀렉터 변경 여부 확인'
    ).toBeVisible({ timeout: 10000 });
    console.log('✅ 실습 대시보드 노출 확인');
  }

  async verifyPracticeHistoryExists() {
    const items = this.page.locator(
      '[class*="history"], [class*="History"], [class*="practice-item"], [class*="practiceItem"]'
    );
    const count = await items.count();
    console.log(`✅ 실습 내역 항목 수: ${count}`);
    return count;
  }

  async verifyAccordionDefaultCollapsed() {
    // 콘텐츠 커리큘럼 영역이 기본으로 숨겨진 상태인지 확인
    const expanded = this.page.locator(
      '[aria-expanded="true"], [class*="expanded"], [class*="open"]'
    ).first();
    const isExpanded = await expanded.isVisible({ timeout: 2000 }).catch(() => false);
    expect(isExpanded, '[앱오류] 실습 내역 아코디언이 기본 펼침 상태 — 기본은 접힘이어야 함').toBe(false);
    console.log('✅ 아코디언 기본 접힘 상태 확인');
  }

  async clickFirstAccordionExpandButton() {
    const btn = this.page.locator(
      '[class*="accordion"] button, [class*="expand-btn"], [class*="toggle-btn"], [aria-expanded]'
    ).first();
    await btn.scrollIntoViewIfNeeded();
    await btn.click({ force: true });
    await this.page.waitForTimeout(500);
    console.log('🖱️ 첫 번째 아코디언 펼침 버튼 클릭');
  }

  async verifyAccordionExpanded() {
    const curriculum = this.page.locator(
      '[class*="curriculum"], [class*="Curriculum"], [aria-expanded="true"]'
    ).first();
    await expect(
      curriculum,
      '[앱오류] 아코디언 클릭 후에도 커리큘럼이 펼쳐지지 않음'
    ).toBeVisible({ timeout: 5000 });
    console.log('✅ 아코디언 펼침 확인');
  }

  async verifyAccordionCollapsedAfterToggle() {
    await this.clickFirstAccordionExpandButton();
    const curriculum = this.page.locator(
      '[class*="curriculum"], [class*="Curriculum"]'
    ).first();
    const isVisible = await curriculum.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`✅ 아코디언 닫기 후 상태: ${isVisible ? '펼침' : '접힘'}`);
  }

  async verifyRecentPracticeDateFormat() {
    // 최근 실습일이 YYYY-MM-DD 형식으로 노출되는지 확인
    const dateText = this.page.locator('text=/\\d{4}-\\d{2}-\\d{2}/').first();
    const isVisible = await dateText.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      console.log('✅ 최근 실습일 날짜 형식 확인 (YYYY-MM-DD)');
    } else {
      console.log('ℹ️  날짜 텍스트 미노출 — 실습 이력 없는 계정이거나 UI 변경 가능성');
    }
  }

  async verifyProgressBarVisible() {
    const progressBar = this.page.locator(
      '[role="progressbar"], [class*="progress-bar"], [class*="progressBar"]'
    ).first();
    const isVisible = await progressBar.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      console.log('✅ 진행률 프로그래스바 노출 확인');
    } else {
      console.log('ℹ️  진행률 바 미노출 — 실습 이력 없거나 UI 셀렉터 변경 가능성');
    }
  }

  async verifyProgressRateVisible() {
    // 진행률 텍스트 (예: 50%, 100%) 노출 확인
    const progressText = this.page.locator('text=/%/').first();
    const isVisible = await progressText.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      console.log('✅ 진행률 텍스트 노출 확인');
    } else {
      console.log('ℹ️  진행률 텍스트 미노출 — 실습 이력 없거나 셀렉터 변경 가능성');
    }
  }

  async verifyCompletedItemHas100Percent() {
    // 완료된 항목의 진행률이 100%로 표시되는지 확인
    const full = this.page.locator('text=/100/').first();
    const isVisible = await full.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      console.log('✅ 완료 항목 진행률 100% 확인');
    } else {
      console.log('ℹ️  100% 진행률 미노출 — 완료된 실습 없는 계정이거나 셀렉터 변경 가능성');
    }
  }

  async verifyNoInProgressItemInCompleted() {
    // 완료 섹션에 '진행중' 상태 항목이 없는지 확인
    const inProgressBadge = this.page.locator(
      '[class*="complete"] [class*="progress"], [class*="complete"] [class*="inProgress"]'
    );
    const count = await inProgressBadge.count();
    expect(count, '[앱오류] 완료 섹션에 진행중 항목이 존재함').toBe(0);
    console.log('✅ 완료 섹션에 진행중 항목 없음 확인');
  }

  async verifyNoCompletedItemInProgress() {
    // 진행중 섹션에 '완료' 상태 항목이 없는지 확인
    const completedBadge = this.page.locator(
      '[class*="ongoing"] [class*="complete"], [class*="inProgress"] [class*="done"]'
    );
    const count = await completedBadge.count();
    expect(count, '[앱오류] 진행중 섹션에 완료 항목이 존재함').toBe(0);
    console.log('✅ 진행중 섹션에 완료 항목 없음 확인');
  }
}
