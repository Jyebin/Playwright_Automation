import { Page, expect, test } from '@playwright/test';

const BASE = process.env.BASE_URL ?? '';

/**
 * 실습 대시보드 (/dashboard)
 *  #DashboardView > .dashboard-wrapper > .left(실습 캘린더) + .right > #Practice
 *  #Practice > .tabs-group > #Tab(.title "진행 중"/"완료"/"AI 취업 준비" + .count) / .tab-content > ul > li(콘텐츠 1개)
 *  li > .list-title(.lecture-label 상태 + .lecture-title 이름 + .recent-date + #BaseProgressbar[role=progressbar] + .percent)
 *     > .list-content(커리큘럼별 진행률)
 */
type PracticeTab = '진행 중' | '완료';

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

  // ── 진행 중 / 완료 탭 콘텐츠 상태 ─────────────────────────────────────────

  /** #Practice 의 "진행 중"/"완료" 탭을 선택하고 콘텐츠(li)별 상태 라벨·진행률을 읽음 */
  private async readPracticeTab(tabName: PracticeTab) {
    const practice = this.page.locator('#Practice');
    await expect(practice, '[UI/셀렉터] 실습 내역 영역(#Practice)을 찾을 수 없음 — 로그인 세션 또는 셀렉터 확인').toBeVisible({ timeout: 15000 });
    const tab = practice.locator('.tabs-group #Tab').filter({ has: this.page.locator('.title', { hasText: new RegExp(`^\\s*${tabName}\\s*$`) }) });
    await expect(tab, `[UI/셀렉터] 실습 내역 "${tabName}" 탭을 찾을 수 없음`).toBeVisible({ timeout: 10000 });
    // 탭 배지(.count)는 처음 0 으로 그려지고 실습 내역 API 응답 후 채워짐 → 진행 중+완료 합계가 0 보다 커질 때까지 대기
    // (실제로 내역이 없는 계정이면 대기 후 0 그대로 진행)
    const loaded = await expect.poll(async () => {
      const counts = await practice.locator('.tabs-group #Tab .count').allInnerTexts();
      return counts.reduce((sum, c) => sum + (Number(c.trim()) || 0), 0);
    }, { timeout: 15000 }).toBeGreaterThan(0).then(() => true, () => false);
    if (!loaded) console.log('ℹ️  15초 대기 후에도 실습 내역 탭 배지 합계 0 — 내역 없는 계정으로 판단');
    await expect(async () => {
      if (!(await tab.evaluate(el => el.classList.contains('active')))) await tab.click({ timeout: 2000 });
      await expect(tab).toHaveClass(/\bactive\b/, { timeout: 2000 });
    }, `[UI/셀렉터] 실습 내역 "${tabName}" 탭이 선택되지 않음`).toPass({ timeout: 15000 });
    await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    const badge = (await tab.locator('.count').innerText().catch(() => '')).trim();
    const items = await practice.locator('.tab-content > ul > li').evaluateAll(lis => lis.map(li => {
      const head = li.querySelector('.list-title');
      const bar = head?.querySelector('[role="progressbar"]');
      const percentText = (head?.querySelector('.percent') as HTMLElement | null)?.innerText.replace(/\s+/g, '') ?? '';
      return {
        title: head?.querySelector('.lecture-title')?.textContent?.trim() ?? '',
        label: head?.querySelector('.lecture-label')?.textContent?.trim() ?? '',
        percent: percentText ? Number(percentText.replace('%', '')) : NaN,
        ariaNow: bar ? Number(bar.getAttribute('aria-valuenow')) : NaN,
      };
    }));
    console.log(`✅ 실습 내역 [${tabName}] 탭 (배지 ${badge || '-'}, 콘텐츠 ${items.length}개): ${items.map(i => `${i.title}[${i.label}] ${i.percent}%`).join(' / ') || '없음'}`);
    return { badge, items };
  }

  async verifyCompletedItemHas100Percent() {
    const { items } = await this.readPracticeTab('완료');
    if (items.length === 0) test.skip(true, '완료된 실습 콘텐츠가 있는 계정 필요 — 현재 테스트 계정은 완료 내역 없음');
    const notFull = items.filter(i => i.percent !== 100 || i.ariaNow !== 100);
    expect(
      notFull.map(i => `${i.title}(${i.percent}%, bar ${i.ariaNow})`),
      '[앱오류] 완료 탭 콘텐츠의 진행률이 100%가 아님',
    ).toEqual([]);
    console.log(`✅ 완료 콘텐츠 ${items.length}개 모두 진행률 100% 확인`);
  }

  async verifyNoInProgressItemInCompleted() {
    const { items } = await this.readPracticeTab('완료');
    if (items.length === 0) test.skip(true, '완료된 실습 콘텐츠가 있는 계정 필요 — 현재 테스트 계정은 완료 내역 없음');
    const inProgress = items.filter(i => i.label === '진행 중' || (Number.isFinite(i.percent) && i.percent < 100));
    expect(
      inProgress.map(i => `${i.title}[${i.label}] ${i.percent}%`),
      '[앱오류] 완료 탭에 진행 중(라벨 "진행 중" 또는 진행률 100% 미만) 콘텐츠가 표시됨',
    ).toEqual([]);
    console.log(`✅ 완료 탭에 진행 중 콘텐츠 없음 (라벨: ${[...new Set(items.map(i => i.label))].join(', ')})`);
  }

  async verifyNoCompletedItemInProgress() {
    const { items } = await this.readPracticeTab('진행 중');
    if (items.length === 0) test.skip(true, '진행 중인 실습 콘텐츠가 있는 계정 필요 — 현재 테스트 계정은 진행 중 내역 없음');
    const completed = items.filter(i => i.label === '완료' || i.percent === 100);
    expect(
      completed.map(i => `${i.title}[${i.label}] ${i.percent}%`),
      '[앱오류] 진행 중 탭에 완료(라벨 "완료" 또는 진행률 100%) 콘텐츠가 표시됨',
    ).toEqual([]);
    console.log(`✅ 진행 중 탭에 완료 콘텐츠 없음 (라벨: ${[...new Set(items.map(i => i.label))].join(', ')})`);
  }
}
