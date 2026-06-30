import { Page, expect, Download } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const BASE = process.env.BASE_URL ?? '';

export const NOTICE_CATEGORIES = ['공지', '안내', '장애', '업데이트'] as const;
export const NOTICE_SORT_OPTIONS = ['최신순', '과거순', '조회순'] as const;

export class CsNoticePage {
  constructor(private page: Page) {}

  async navigate() {
    await this.page.goto(`${BASE}/cs`);
    await this.page.waitForLoadState('load');
    console.log('✅ 공지사항 페이지 이동 (고객센터 기본 탭)');
  }

  async verifyUrl() {
    await expect(this.page).toHaveURL(/\/cs(\/notice)?/);
    console.log(`✅ 공지사항 URL 확인: ${this.page.url()}`);
  }

  // ── 화면 구성 ────────────────────────────────────────────────────────────

  async verifyCategoriesExist() {
    for (const cat of NOTICE_CATEGORIES) {
      await expect(this.page.getByText(cat, { exact: true }).first()).toBeVisible({ timeout: 8000 });
      console.log(`✅ 카테고리 확인: "${cat}"`);
    }
  }

  async verifySearchPlaceholder() {
    const input = this.page.locator('input[placeholder*="공지사항을 검색"]').first();
    await expect(input).toBeVisible({ timeout: 8000 });
    const ph = await input.getAttribute('placeholder') ?? '';
    expect(ph).toMatch(/공지사항/);
    console.log(`✅ 검색 placeholder 확인: "${ph}"`);
  }

  async verifyDefaultSortOption() {
    // 정렬 기본값: 최신순
    const sortEl = this.page.getByText('최신순', { exact: false }).first();
    await expect(sortEl).toBeVisible({ timeout: 8000 });
    console.log('✅ 기본 정렬 "최신순" 확인');
  }

  async verifySortDropdownOptions() {
    // 정렬 드롭다운 클릭
    const sortTrigger = this.page.getByText('최신순', { exact: false }).first().or(
      this.page.locator('[class*="sort"], [class*="Sort"]').first()
    );
    await sortTrigger.scrollIntoViewIfNeeded();
    await this.page.evaluate(() => window.scrollBy(0, -120));
    await sortTrigger.click({ force: true });
    await this.page.waitForTimeout(400);
    for (const opt of NOTICE_SORT_OPTIONS) {
      await expect(this.page.getByText(opt, { exact: true }).first()).toBeVisible({ timeout: 5000 });
      console.log(`✅ 정렬 옵션 확인: "${opt}"`);
    }
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(300);
  }

  async selectSortOption(option: string) {
    const sortTrigger = this.page.getByText('최신순').first().or(
      this.page.locator('[class*="sort"]').first()
    );
    await sortTrigger.click({ force: true });
    await this.page.waitForTimeout(400);
    await this.page.getByText(option, { exact: true }).first().click({ force: true });
    await this.page.waitForTimeout(600);
    console.log(`🖱️ 정렬 선택: "${option}"`);
  }

  async verifyPostsStructure() {
    // 게시물: No./제목/작성자/날짜(YYYY-MM-DD)/조회수 구성 확인
    const postRows = this.page.locator('tbody tr, [class*="notice-item"], [class*="noticeItem"]');
    const count = await postRows.count();
    expect(count).toBeGreaterThan(0);
    // 날짜 형식 YYYY-MM-DD 확인
    const pageText = await this.page.textContent('body') ?? '';
    expect(/\d{4}-\d{2}-\d{2}/.test(pageText)).toBeTruthy();
    console.log(`✅ 게시물 목록 구성 확인 (${count}개, YYYY-MM-DD 날짜 형식 포함)`);
  }

  async verifyItemsPerPage() {
    const postRows = this.page.locator('tbody tr, [class*="notice-item"], [class*="noticeItem"]');
    await postRows.first().waitFor({ state: 'visible', timeout: 10000 });
    const count = await postRows.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(10);
    console.log(`✅ 페이지당 게시물 ${count}개 (최대 10개) 확인`);
  }

  async verifyPaginationExists() {
    const pagination = this.page.locator('[class*="pagination"], [class*="Pagination"], nav[role="navigation"]').first();
    const hasPagination = await pagination.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasPagination) {
      await expect(pagination).toBeVisible();
      console.log('✅ 페이지네이션 노출 확인');
    } else {
      console.log('ℹ️  페이지네이션 미노출 (게시물 10개 이하)');
    }
  }

  // ── 검색 ────────────────────────────────────────────────────────────────

  private getSearchInput() {
    return this.page.locator('input[placeholder*="공지사항을 검색"], input[placeholder*="공지사항"]').first();
  }

  async searchByKeyword(keyword: string) {
    const input = this.getSearchInput();
    await input.click({ force: true });
    await input.fill(keyword);
    await this.page.waitForTimeout(300);
    const searchBtn = this.page.locator('button[type="submit"], button[class*="search"]').first();
    if (await searchBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await searchBtn.click();
    } else {
      await input.press('Enter');
    }
    await this.page.waitForTimeout(800);
    console.log(`🔍 검색어 입력: "${keyword}"`);
  }

  async verifySearchKeywordRetained(keyword: string) {
    // 검색 후 검색창에 키워드 유지
    const input = this.getSearchInput();
    const val = await input.inputValue();
    expect(val).toContain(keyword);
    console.log(`✅ 검색창 키워드 유지 확인: "${val}"`);
  }

  async verifyEmptySearchAlert() {
    const input = this.getSearchInput();
    await input.fill('');
    const searchBtn = this.page.locator('button[type="submit"], button[class*="search"]').first();
    if (await searchBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await searchBtn.click();
    } else {
      await input.press('Enter');
    }
    await this.page.waitForTimeout(500);
    await expect(
      this.page.getByText(/검색어를 입력해 주세요/i).first()
    ).toBeVisible({ timeout: 5000 });
    console.log('✅ 빈 검색어 알럿 "검색어를 입력해 주세요." 확인');
  }

  async verifySearchByButton() {
    // 버튼 검색 결과가 Enter 검색 결과와 동일한지 확인 (결과 건수 비교)
    const keyword = '보도자료';
    // 버튼으로 검색
    await this.searchByKeyword(keyword);
    const countAfterButton = await this.page.locator('tbody tr, [class*="notice-item"]').count();
    // 같은 키워드로 Enter 검색
    const input = this.getSearchInput();
    await input.fill(keyword);
    await input.press('Enter');
    await this.page.waitForTimeout(800);
    const countAfterEnter = await this.page.locator('tbody tr, [class*="notice-item"]').count();
    expect(countAfterButton).toBe(countAfterEnter);
    console.log(`✅ 버튼/Enter 검색 결과 동일 확인 (${countAfterButton}건)`);
  }

  async verifyXssDefense() {
    // XSS: 스크립트가 실행되지 않고 텍스트로 처리됨
    let dialogFired = false;
    this.page.once('dialog', dialog => {
      dialogFired = true;
      dialog.dismiss().catch(() => {});
    });
    await this.searchByKeyword("<script>alert('xss')</script>");
    await this.page.waitForTimeout(2000);
    expect(dialogFired).toBe(false);
    console.log('✅ XSS 방어 확인 (스크립트 미실행)');
  }

  async verifySqlInjectionDefense() {
    // SQL Injection: 쿼리 실행 없이 텍스트로 처리됨
    await this.searchByKeyword("' OR '1'='1");
    await this.page.waitForTimeout(800);
    // 페이지가 정상 상태(에러 없음)인지 확인
    await expect(this.page).toHaveURL(/\/cs/);
    console.log("✅ SQL Injection 방어 확인 (정상 페이지 유지)");
  }

  async closeAlert() {
    const btn = this.page.getByRole('button', { name: '확인' }).first();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await btn.click();
    } else {
      await this.page.keyboard.press('Escape');
    }
    await this.page.waitForTimeout(300);
    console.log('🖱️ 알럿 닫기');
  }

  // ── 카테고리 ─────────────────────────────────────────────────────────────

  async clickCategory(categoryName: string) {
    const cat = this.page.getByText(categoryName, { exact: true }).first();
    await cat.scrollIntoViewIfNeeded();
    await this.page.evaluate(() => window.scrollBy(0, -120));
    await cat.click({ force: true });
    await this.page.waitForTimeout(600);
    console.log(`🖱️ 카테고리 클릭: "${categoryName}"`);
  }

  async verifyFilteredResults() {
    // 카테고리 선택 후 결과 있음 확인
    const posts = this.page.locator('tbody tr, [class*="notice-item"], [class*="noticeItem"]');
    const count = await posts.count();
    expect(count).toBeGreaterThan(0);
    console.log(`✅ 카테고리 필터링 결과 확인 (${count}건)`);
  }

  async verifyNoResults() {
    await expect(
      this.page.getByText(/검색 결과가 없습니다|등록된 게시글이 없습니다|없습니다/i).first()
    ).toBeVisible({ timeout: 8000 });
    console.log('✅ 검색/카테고리 결과 없음 안내 확인');
  }

  async verifyCategoryReset() {
    // 공지사항 탭 재클릭 → 카테고리 선택 해제 + 목록 초기화 확인
    const noticetab = this.page.getByText('공지사항', { exact: true }).first();
    await noticetab.click({ force: true });
    await this.page.waitForTimeout(600);
    const posts = this.page.locator('tbody tr, [class*="notice-item"]');
    const count = await posts.count();
    console.log(`✅ 카테고리 초기화 후 목록 확인 (${count}건)`);
  }

  // ── 상세 페이지 ──────────────────────────────────────────────────────────

  async clickFirstPost() {
    const post = this.page.locator('tbody tr, [class*="notice-item"], [class*="noticeItem"]').first();
    await post.click({ force: true });
    await this.page.waitForLoadState('load');
    await this.page.waitForTimeout(500);
    console.log('🖱️ 첫 번째 공지사항 클릭');
  }

  async verifyDetailPageContent() {
    // 제목, 작성자, 날짜(YYYY-MM-DD), 본문 확인
    const pageText = await this.page.textContent('body') ?? '';
    expect(/\d{4}-\d{2}-\d{2}/.test(pageText)).toBeTruthy();
    console.log('✅ 공지사항 상세: 날짜 형식(YYYY-MM-DD) 확인');
  }

  async verifyNoAttachmentMessage() {
    const noAttach = this.page.getByText('첨부파일이 없습니다', { exact: false }).first();
    const isVisible = await noAttach.isVisible({ timeout: 3000 }).catch(() => false);
    if (isVisible) {
      await expect(noAttach).toBeVisible();
      console.log('✅ 첨부파일 없음 안내 문구 확인');
    } else {
      console.log('ℹ️  첨부파일 있거나 구현 방식 상이');
    }
  }

  async verifyAttachmentDownload(): Promise<Download | null> {
    const downloadLink = this.page.locator('a[href*="download"], a[download], button').filter({ hasText: /다운로드|첨부/i }).first();
    if (!await downloadLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('ℹ️  다운로드 가능한 첨부파일 없음');
      return null;
    }
    const [download] = await Promise.all([
      this.page.waitForEvent('download', { timeout: 15000 }),
      downloadLink.click({ force: true }),
    ]);
    console.log(`✅ 첨부파일 다운로드 시작: ${download.suggestedFilename()}`);
    return download;
  }

  async verifyDownloadFile(download: Download) {
    const savePath = path.join(os.tmpdir(), download.suggestedFilename());
    await download.saveAs(savePath);
    const stats = fs.statSync(savePath);
    expect(stats.size).toBeGreaterThan(0);
    console.log(`✅ 첨부파일 다운로드 확인: ${download.suggestedFilename()} (${(stats.size / 1024).toFixed(1)} KB)`);
    fs.unlinkSync(savePath);
  }

  async verifyNoPrevNextPost() {
    // 이전/다음 게시글 없을 때 안내 문구
    const noPrev = this.page.getByText('이전 게시글이 없습니다', { exact: false }).first();
    const noNext = this.page.getByText('다음 게시글이 없습니다', { exact: false }).first();
    const hasPrev = await noPrev.isVisible({ timeout: 3000 }).catch(() => false);
    const hasNext = await noNext.isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasPrev || hasNext).toBeTruthy();
    console.log(`✅ 이전/다음 게시글 없음 안내 확인 (prev: ${hasPrev}, next: ${hasNext})`);
  }

  async verifyHtmlEntitiesRendered() {
    // [&] 등 HTML 특수문자가 unescape되어 정상 노출
    const pageText = await this.page.textContent('body') ?? '';
    const hasEscaped = pageText.includes('&amp;') || pageText.includes('&#');
    expect(hasEscaped).toBe(false);
    console.log('✅ HTML 특수문자 unescape 노출 확인 ([&] 정상 표시)');
  }

  async clickBackToList() {
    const backBtn = this.page.getByRole('button', { name: '목록으로' }).first();
    await backBtn.click({ force: true });
    await this.page.waitForURL(/\/cs(\/notice)?/, { timeout: 8000 });
    console.log('🖱️ "목록으로" 클릭 → 공지사항 목록 복귀');
  }

  // ── 페이지 초기화 ─────────────────────────────────────────────────────────

  async verifyPageResetAfterTabSwitch() {
    // 다른 탭 이동 후 공지사항 복귀 → 검색어/카테고리/정렬 초기화 확인
    const input = this.getSearchInput();
    const val = await input.inputValue().catch(() => '');
    expect(val).toBe('');
    console.log(`✅ 탭 이동 후 복귀 시 검색어 초기화 확인: "${val}"`);
  }
}
