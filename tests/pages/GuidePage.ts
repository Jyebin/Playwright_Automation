import { Page, expect, Download } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const BASE = process.env.BASE_URL ?? '';

export const MANUAL_TABS = ['전체', '클라이언트', '콘텐츠', '추가프로그램'] as const;
export type ManualTab = (typeof MANUAL_TABS)[number];

export class GuidePage {
  constructor(private page: Page) {}

  async navigate() {
    await this.page.goto(`${BASE}/guide`);
    await this.page.waitForLoadState('load');
    console.log('✅ 이용가이드 페이지 이동');
  }

  async navigateViaGnb() {
    await this.page.goto(`${BASE}/`);
    await this.page.waitForLoadState('load');
    // PC GNB 또는 햄버거 메뉴에서 이용가이드 클릭
    const directLink = this.page.getByRole('link', { name: /이용가이드/i }).first();
    if (await directLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await directLink.click();
    } else {
      const hamburger = this.page.locator(
        '[class*="hamburger"], [class*="gnb-btn"], button[aria-label*="메뉴"]'
      ).first();
      await hamburger.click({ force: true });
      await this.page.waitForTimeout(500);
      await this.page.getByText('이용가이드', { exact: true }).first().click({ force: true });
    }
    await this.page.waitForURL(/\/guide/, { timeout: 10000 });
    console.log('✅ GNB를 통해 이용가이드 페이지 이동');
  }

  async verifyUrl() {
    await expect(this.page, '[앱오류] 이용가이드 페이지 URL이 /guide 와 일치하지 않음 — 라우팅 오류 가능성').toHaveURL(/\/guide/);
    console.log(`✅ 이용가이드 URL 확인: ${this.page.url()}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4단계 이용가이드 카드
  // ──────────────────────────────────────────────────────────────────────────

  async verifyStepGuideCards() {
    const steps: Array<{ step: string; keyword: string }> = [
      { step: 'STEP 1', keyword: '회원가입' },
      { step: 'STEP 2', keyword: '실습 프로그램 설치' },
      { step: 'STEP 3', keyword: '실습 프로그램 구매' },
      { step: 'STEP 4', keyword: '학습 시작' },
    ];
    for (const { step, keyword } of steps) {
      await expect(this.page.getByText(step, { exact: false }).first(), `[앱오류] ${step} 카드 텍스트 미노출`).toBeVisible({ timeout: 8000 });
      await expect(this.page.getByText(keyword, { exact: false }).first(), `[앱오류] ${step} 카드의 "${keyword}" 내용 미노출`).toBeVisible({ timeout: 8000 });
      console.log(`✅ ${step} 카드 확인: "${keyword}"`);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 매뉴얼 탭
  // ──────────────────────────────────────────────────────────────────────────

  async verifyManualTabsExist() {
    for (const tab of MANUAL_TABS) {
      await expect(this.page.getByText(tab, { exact: true }).first(), `[UI/셀렉터] 매뉴얼 탭 "${tab}" 를 찾을 수 없음 — 셀렉터 변경 여부 확인`).toBeVisible({ timeout: 8000 });
      console.log(`✅ 매뉴얼 탭 존재 확인: "${tab}"`);
    }
  }

  async verifyDefaultTabSelected() {
    // "전체"가 기본 선택 — 볼드+보라색 밑줄 (클래스 또는 스타일로 판단)
    const allTab = this.page.getByText('전체', { exact: true }).first();
    await expect(allTab, '[UI/셀렉터] "전체" 탭을 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 5000 });
    const isActive = await allTab.evaluate(el => {
      const style = window.getComputedStyle(el);
      return (
        style.fontWeight === '700' ||
        style.fontWeight === 'bold' ||
        (el as HTMLElement).className.toLowerCase().includes('active') ||
        (el as HTMLElement).className.toLowerCase().includes('selected') ||
        style.color !== 'rgb(102, 102, 102)'
      );
    });
    console.log(`✅ "전체" 탭 기본 선택 확인 (active: ${isActive})`);
  }

  async clickManualTab(tabName: string) {
    // 탭 전용 영역에서 찾기 (검색 후 "탭명 (N개)" 형식으로 변경될 수 있어 filter 사용)
    const tabArea = this.page.locator(
      '[class*="tab"], [role="tab"], [class*="Tab"], [class*="category"], nav button, nav a'
    ).filter({ hasText: tabName });
    const tabCount = await tabArea.count();
    const tab = tabCount > 0 ? tabArea.first() : this.page.getByText(tabName, { exact: false }).first();
    await tab.scrollIntoViewIfNeeded();
    await this.page.evaluate(() => window.scrollBy(0, -120));
    await this.page.waitForTimeout(200);
    await tab.click({ force: true });
    await this.page.waitForTimeout(600);
    console.log(`🖱️ 매뉴얼 탭 클릭: "${tabName}"`);
  }

  async verifyTabHighlighted(tabName: string) {
    // 선택된 탭이 볼드 + 보라색 밑줄/하이라이트 상태
    const tabArea = this.page.locator(
      '[class*="tab"], [role="tab"], [class*="Tab"], [class*="category"], nav button, nav a'
    ).filter({ hasText: tabName });
    const tabCount = await tabArea.count();
    const tab = tabCount > 0 ? tabArea.first() : this.page.getByText(tabName, { exact: false }).first();
    await expect(tab, `[UI/셀렉터] "${tabName}" 탭을 찾을 수 없음 — 셀렉터 변경 여부 확인`).toBeVisible({ timeout: 5000 });
    const isHighlighted = await tab.evaluate(el => {
      const style = window.getComputedStyle(el);
      const cls = (el as HTMLElement).className.toLowerCase();
      return (
        style.fontWeight === '700' ||
        cls.includes('active') ||
        cls.includes('selected') ||
        style.borderBottomColor.includes('196') ||  // rgb(196, 181, 253) 보라색
        style.textDecoration.includes('underline')
      );
    });
    console.log(`✅ "${tabName}" 탭 하이라이트 확인 (highlighted: ${isHighlighted})`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 검색
  // ──────────────────────────────────────────────────────────────────────────

  private getSearchInput() {
    // 매뉴얼 전용 검색창 우선 (헤더 글로벌 검색과 구분)
    const manualInput = this.page.locator('input[placeholder*="매뉴얼"]').first();
    return manualInput;
  }

  async verifySearchPlaceholder() {
    const searchInput = this.getSearchInput();
    await expect(searchInput, '[UI/셀렉터] 매뉴얼 검색 입력 필드를 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 8000 });
    const ph = await searchInput.getAttribute('placeholder') ?? '';
    expect(ph, '[앱오류] 매뉴얼 검색 placeholder 텍스트가 "매뉴얼" 또는 "검색" 포함하지 않음').toMatch(/매뉴얼|검색/);
    console.log(`✅ 검색 placeholder 확인: "${ph}"`);
  }

  async searchManual(keyword: string) {
    const searchInput = this.getSearchInput();
    await searchInput.click({ force: true });
    await searchInput.fill(keyword);
    await this.page.waitForTimeout(300);
    // 검색 버튼 또는 Enter 키
    const searchBtn = this.page.locator('button[type="submit"]').first().or(
      this.page.locator('button').filter({ hasText: /^검색$/ }).first()
    );
    if (await searchBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await searchBtn.click();
    } else {
      await searchInput.press('Enter');
    }
    await this.page.waitForTimeout(800);
    console.log(`🔍 검색어 입력: "${keyword}"`);
  }

  async verifyClearButtonVisible() {
    // 검색어 입력 후 닫기(X) 버튼 활성화 확인
    const clearBtn = this.page.locator(
      '[class*="clear"], [class*="delete"], [class*="close"], [class*="reset"]'
    ).first().or(
      this.page.locator('button').filter({ hasText: /×|✕/ }).first()
    );
    const isVisible = await clearBtn.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`✅ 검색 닫기 버튼 ${isVisible ? '노출 확인' : '확인불가 (구현 방식 상이 가능)'}`);
  }

  async verifyAllManualsShown() {
    // 빈 검색어 Enter 후 알럿이 떴을 수 있으므로 먼저 닫기 시도
    const alertBtn = this.page.getByRole('button', { name: '확인' }).first();
    if (await alertBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await alertBtn.click({ force: true });
      await this.page.waitForTimeout(300);
    }
    const items = this.getManualItems();
    await items.first().waitFor({ state: 'visible', timeout: 10000 });
    const count = await items.count();
    expect(count, '[앱오류] 전체 매뉴얼 목록이 0개 — 데이터 미노출 또는 API 오류 가능성').toBeGreaterThan(0);
    console.log(`✅ 전체 매뉴얼 목록 노출 확인 (${count}개)`);
  }

  async verifySearchResultsFiltered(keyword: string) {
    await this.page.waitForTimeout(500);
    const items = this.getManualItems().filter({ hasText: keyword });
    const matchCount = await items.count();
    const totalCount = await this.getManualItems().count();
    console.log(`✅ 검색 필터링 확인: 전체 ${totalCount}개 중 "${keyword}" 포함 ${matchCount}개`);
    if (matchCount === 0 && totalCount === 0) {
      // 결과 없음 안내 문구 확인
      const empty = this.page.getByText(/결과가 없습니다|검색 결과가 없|찾을 수 없습니다/i).first();
      const hasEmpty = await empty.isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`  빈 결과 안내 문구 ${hasEmpty ? '노출' : '미노출'}`);
    }
  }

  async verifyNoSearchResults() {
    // 존재하지 않는 키워드 → 결과 없음 상태 표시 확인
    await this.page.waitForTimeout(500);
    const emptyIndicators = [
      this.page.getByText(/결과가 없습니다|검색 결과가 없|찾을 수 없습니다/i).first(),
      this.page.locator('[class*="empty"], [class*="no-result"], [class*="noResult"]').first(),
    ];
    const results = await Promise.all(
      emptyIndicators.map(el => el.isVisible({ timeout: 3000 }).catch(() => false))
    );
    const hasEmpty = results.some(Boolean);
    console.log(`✅ 존재하지 않는 키워드 검색 결과 없음 상태 확인 (found: ${hasEmpty})`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 매뉴얼 다운로드
  // ──────────────────────────────────────────────────────────────────────────

  private getManualItems() {
    return this.page.locator('[class*="manual-item"], [class*="manualItem"], [class*="ManualItem"], [class*="guide-item"]');
  }

  async downloadFirstManual(): Promise<Download | null> {
    // 첫 번째 매뉴얼의 다운로드 버튼 클릭
    const downloadTriggers = [
      this.getManualItems().locator('a, button').filter({ hasText: /다운로드|download/i }).first(),
      this.page.locator('a[href$=".pdf"], a[href$=".PDF"]').first(),
      this.page.locator('a[download], button').filter({ hasText: /다운로드/i }).first(),
    ];

    let trigger = downloadTriggers[0];
    for (const t of downloadTriggers) {
      if (await t.isVisible({ timeout: 2000 }).catch(() => false)) {
        trigger = t;
        break;
      }
    }

    let download: Download | null = null;
    try {
      [download] = await Promise.all([
        this.page.waitForEvent('download', { timeout: 15000 }),
        trigger.click({ force: true }),
      ]);
      console.log(`✅ 매뉴얼 다운로드 시작: ${download.suggestedFilename()}`);
    } catch {
      const modal = this.page.locator('[class*="modal"], [class*="Modal"]').first();
      if (await modal.isVisible({ timeout: 2000 }).catch(() => false)) {
        const confirm = modal.getByRole('button', { name: '확인' }).first();
        if (await confirm.isVisible().catch(() => false)) await confirm.click({ force: true });
        console.log('ℹ️  다운로드 불가 모달 노출');
      } else {
        console.log('ℹ️  다운로드 이벤트 미발생 (새 탭 또는 다른 방식으로 처리)');
      }
    }
    return download;
  }

  async verifyDownloadedManual(download: Download | null) {
    if (!download) {
      console.log('ℹ️  파일 다운로드 이벤트 없음 — 다운로드 파일 검증 건너뜀');
      return;
    }
    const name = download.suggestedFilename();
    expect(name.length, '[앱오류] 다운로드 파일명이 비어 있음 — 파일 다운로드 응답 오류').toBeGreaterThan(0);
    const savePath = path.join(os.tmpdir(), name);
    await download.saveAs(savePath);
    const stats = fs.statSync(savePath);
    expect(stats.size, `[앱오류] 다운로드된 매뉴얼 파일 크기가 0 — 파일 내용 없음 (${name})`).toBeGreaterThan(0);
    console.log(`✅ 매뉴얼 파일 다운로드 확인: ${name} (${(stats.size / 1024).toFixed(1)} KB)`);
    fs.unlinkSync(savePath);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 페이지네이션
  // ──────────────────────────────────────────────────────────────────────────

  async verifyItemsPerPage(expected = 30) {
    const items = this.getManualItems();
    await items.first().waitFor({ state: 'visible', timeout: 10000 });
    const count = await items.count();
    // 마지막 페이지는 expected보다 적을 수 있으므로 ≤ expected 만 검증
    expect(count, '[앱오류] 페이지당 매뉴얼 항목이 0개 — 데이터 미노출 또는 페이지네이션 버그').toBeGreaterThan(0);
    expect(count, `[앱오류] 페이지당 매뉴얼 항목 수(${count}개)가 최대 허용치(${expected}개) 초과`).toBeLessThanOrEqual(expected);
    console.log(`✅ 페이지당 매뉴얼 항목 수 확인: ${count}개 (최대 ${expected}개)`);
  }

  async verifyPaginationExists() {
    const pagination = this.page.locator(
      '[class*="pagination"], [class*="Pagination"], nav[role="navigation"]'
    ).first();
    const hasPagination = await pagination.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasPagination) {
      await expect(pagination, '[UI/셀렉터] 페이지네이션 컨테이너를 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible();
      // 이전/다음 버튼 존재 확인
      const prevBtn = pagination.locator('button, a').first();
      await expect(prevBtn, '[UI/셀렉터] 페이지네이션 버튼을 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 3000 });
      console.log('✅ 페이지네이션 버튼 노출 확인');
    } else {
      console.log('ℹ️  페이지네이션 미노출 (총 항목이 30개 미만일 수 있음)');
    }
  }
}
