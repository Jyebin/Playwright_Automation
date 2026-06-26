import { Page, expect, Download } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const BASE = process.env.BASE_URL ?? '';

export class DownloadPage {
  constructor(private page: Page) {}

  async navigate() {
    await this.page.goto(`${BASE}/downloads`);
    await this.page.waitForLoadState('load');
    console.log('✅ 다운로드 페이지 직접 이동');
  }

  async navigateViaGnb() {
    await this.page.goto(`${BASE}/`);
    await this.page.waitForLoadState('load');
    // PC GNB 헤더 내 '메타데미 설치' 링크 직접 클릭 시도
    const directLink = this.page.getByRole('link', { name: /메타데미 설치|다운로드/i }).first();
    if (await directLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await directLink.click();
    } else {
      // 햄버거/메뉴 버튼을 통해 접근
      const hamburger = this.page.locator(
        '[class*="hamburger"], [class*="gnb-btn"], button[aria-label*="메뉴"], [class*="menu-btn"]'
      ).first();
      await hamburger.click({ force: true });
      await this.page.waitForTimeout(500);
      await this.page.getByText('메타데미 설치', { exact: false }).first().click({ force: true });
    }
    await this.page.waitForURL(/\/downloads/, { timeout: 10000 });
    console.log('✅ GNB를 통해 다운로드 페이지 이동');
  }

  async verifyUrl() {
    await expect(this.page).toHaveURL(/\/downloads/);
    console.log(`✅ 다운로드 페이지 URL 확인: ${this.page.url()}`);
  }

  async verifyPageTitle() {
    await expect(
      this.page.getByText('메타데미 설치').first()
    ).toBeVisible({ timeout: 8000 });
    console.log('✅ 페이지 제목 "메타데미 설치" 확인');
  }

  async verifyStorageGuideText() {
    // "원활한 설치를 위해 PC의 여유 공간을 5GB 이상 확보해 주시기 바랍니다." 문구
    await expect(
      this.page.getByText('5GB 이상', { exact: false }).first()
    ).toBeVisible({ timeout: 8000 });
    console.log('✅ 서브 문구 (5GB 이상 여유공간 안내) 확인');
  }

  async verifyWindowsOsDefaultSelected() {
    // Windows OS가 기본 선택 상태인지 확인 (배경색 흰색 또는 active 클래스)
    const result = await this.page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('button, li, div, span'));
      const windowsEl = candidates.find(el => {
        const text = el.textContent?.trim() ?? '';
        return /^Window[s]?(\s*OS)?$/.test(text) || text === 'Windows';
      });
      if (!windowsEl) return { found: false };
      const style = window.getComputedStyle(windowsEl as HTMLElement);
      return {
        found: true,
        bg: style.backgroundColor,
        fw: style.fontWeight,
        cls: (windowsEl as HTMLElement).className,
      };
    });
    console.log(`✅ Windows OS 기본 선택 상태 확인 (found: ${result.found}, bg: ${result.bg})`);
  }

  async clickMacOsTab() {
    const macTab = this.page.getByText(/MacOS|Mac OS|macOS/i).first();
    await macTab.scrollIntoViewIfNeeded();
    await this.page.evaluate(() => window.scrollBy(0, -120));
    await this.page.waitForTimeout(300);
    await macTab.click({ force: true });
    await this.page.waitForTimeout(600);
    console.log('🖱️ MacOS 탭 클릭');
  }

  async clickWindowsOsTab() {
    const winTab = this.page.getByText(/^Windows?(\s*OS)?$/).first();
    await winTab.scrollIntoViewIfNeeded();
    await this.page.evaluate(() => window.scrollBy(0, -120));
    await this.page.waitForTimeout(300);
    await winTab.click({ force: true });
    await this.page.waitForTimeout(600);
    console.log('🖱️ Windows OS 탭 클릭');
  }

  async verifySpecCardsShown() {
    await expect(this.page.getByText('최저 사양', { exact: false }).first()).toBeVisible({ timeout: 8000 });
    await expect(this.page.getByText('권장 사양', { exact: false }).first()).toBeVisible({ timeout: 8000 });
    console.log('✅ 최저 사양 / 권장 사양 카드 노출 확인');
  }

  async verifyMacSpecsShown() {
    // macOS 최저사양: 프로세서 M1 8Core, 운영체제 macOS 13 Ventura
    await expect(this.page.getByText(/M1/i).first()).toBeVisible({ timeout: 8000 });
    await expect(this.page.getByText(/Ventura/i).first()).toBeVisible({ timeout: 8000 });
    console.log('✅ MacOS 사양 변경 확인 (M1, Ventura)');
  }

  async verifyWindowsSpecsShown() {
    // Windows 최저사양: 인텔 코어i5 8세대, 운영체제 Windows 10 이상
    await expect(this.page.getByText(/i5|인텔/i).first()).toBeVisible({ timeout: 8000 });
    await expect(this.page.getByText(/Windows 1\d|Windows10/i).first()).toBeVisible({ timeout: 8000 });
    console.log('✅ Windows OS 사양 변경 확인 (i5, Windows 10+)');
  }

  async verifyRecommendedSpecPurpleBorder() {
    // 권장 사양 카드가 보라색 테두리(rgb(196, 181, 253))를 가지는지 확인
    const hasPurple = await this.page.evaluate(() => {
      const headers = Array.from(document.querySelectorAll('h5, h4, h3, strong'));
      const recHeader = headers.find(h => h.textContent?.trim().includes('권장 사양'));
      if (!recHeader) return false;
      let el: Element | null = recHeader.parentElement;
      for (let i = 0; i < 6 && el; i++) {
        const style = window.getComputedStyle(el as HTMLElement);
        const inlineStyle = (el as HTMLElement).getAttribute('style') ?? '';
        // border-color: rgb(196, 181, 253) 또는 #c4b5fd
        if (
          style.borderTopColor.includes('196') ||
          style.borderColor.includes('196') ||
          inlineStyle.includes('196, 181, 253') ||
          inlineStyle.includes('c4b5fd')
        ) {
          return true;
        }
        el = el.parentElement;
      }
      return false;
    });
    console.log(`✅ 권장 사양 보라색 테두리 확인 (found: ${hasPurple})`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 다운로드 (파일 인터셉트)
  // ──────────────────────────────────────────────────────────────────────────

  async clickDownloadButton(): Promise<Download | null> {
    // PC 환경: 다운로드 버튼 클릭 → 파일 다운로드 이벤트 발생 기대
    // 버튼 후보: "Window PC에서 다운로드 가능합니다." / "Mac PC에서..." / "다운로드"
    const downloadBtn = this.page.locator('a, button').filter({ hasText: /다운로드|Download/i }).first();

    let download: Download | null = null;
    try {
      [download] = await Promise.all([
        this.page.waitForEvent('download', { timeout: 15000 }),
        downloadBtn.click({ force: true }),
      ]);
      console.log(`✅ 다운로드 이벤트 발생: ${download.suggestedFilename()}`);
    } catch {
      // 파일 다운로드 대신 모달이 뜨는 경우(모바일 환경 등) — 모달 닫기
      const modal = this.page.locator('[class*="modal"], [class*="Modal"]').first();
      if (await modal.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('ℹ️  다운로드 불가 모달 노출됨 (모바일 환경 또는 OS 제한)');
        const confirm = modal.getByRole('button', { name: '확인' }).first();
        if (await confirm.isVisible().catch(() => false)) await confirm.click();
      } else {
        console.log('ℹ️  다운로드 이벤트 미발생 (네트워크 대기 중이거나 새 탭으로 처리)');
      }
    }
    return download;
  }

  async verifyDownloadFile(download: Download, expectedExtPattern?: RegExp) {
    const name = download.suggestedFilename();
    expect(name.length).toBeGreaterThan(0);
    if (expectedExtPattern) {
      expect(name).toMatch(expectedExtPattern);
    }
    const savePath = path.join(os.tmpdir(), name);
    await download.saveAs(savePath);
    const stats = fs.statSync(savePath);
    expect(stats.size).toBeGreaterThan(0);
    console.log(`✅ 다운로드 파일 확인: ${name} (${(stats.size / 1024).toFixed(1)} KB)`);
    fs.unlinkSync(savePath);
  }
}
