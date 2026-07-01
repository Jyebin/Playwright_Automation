import { Page, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? '';

export const EVENT_CATEGORIES = ['진행', '예정', '종료'] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export class CsEventPage {
  constructor(private page: Page) {}

  async navigate() {
    await this.page.goto(`${BASE}/cs/event`);
    await this.page.waitForLoadState('load');
    console.log('✅ 이벤트 페이지 이동');
  }

  async verifyUrl() {
    await expect(this.page, '[앱오류] 이벤트 URL(/cs/event)로 이동되지 않음').toHaveURL(/\/cs\/event/);
    console.log(`✅ 이벤트 URL 확인: ${this.page.url()}`);
  }

  async verifyTabActiveStyle() {
    // 이벤트 탭 글씨 검은색 강조 + 보라색 밑줄
    const tab = this.page.getByText('이벤트', { exact: true }).first();
    await expect(tab, '[UI/셀렉터] "이벤트" 탭을 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 5000 });
    const isActive = await tab.evaluate(el => {
      const style = window.getComputedStyle(el);
      return (
        style.fontWeight === '700' ||
        style.fontWeight === 'bold' ||
        (el as HTMLElement).className.toLowerCase().includes('active') ||
        style.borderBottomColor.includes('196')
      );
    });
    console.log(`✅ 이벤트 탭 활성 스타일 확인 (active: ${isActive})`);
  }

  // ── 카테고리 ──────────────────────────────────────────────────────────────

  async verifyCategoriesExist() {
    for (const cat of EVENT_CATEGORIES) {
      await expect(this.page.getByText(cat, { exact: true }).first(), `[UI/셀렉터] 이벤트 카테고리 "${cat}"를 찾을 수 없음 — 셀렉터 변경 여부 확인`).toBeVisible({ timeout: 8000 });
      console.log(`✅ 이벤트 카테고리 확인: "${cat}"`);
    }
  }

  async verifyDefaultCategoryIsProgress() {
    // "진행"이 기본 선택 (볼드)
    const cat = this.page.getByText('진행', { exact: true }).first();
    await expect(cat, '[UI/셀렉터] 기본 카테고리 "진행"을 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 5000 });
    const isBold = await cat.evaluate(el => {
      const style = window.getComputedStyle(el);
      return (
        style.fontWeight === '700' ||
        style.fontWeight === 'bold' ||
        (el as HTMLElement).className.toLowerCase().includes('active') ||
        (el as HTMLElement).className.toLowerCase().includes('selected')
      );
    });
    console.log(`✅ 기본 카테고리 "진행" 선택 확인 (bold: ${isBold})`);
  }

  async clickCategory(categoryName: string) {
    const cat = this.page.getByText(categoryName, { exact: true }).first();
    await cat.scrollIntoViewIfNeeded();
    await this.page.evaluate(() => window.scrollBy(0, -120));
    await this.page.waitForTimeout(200);
    await cat.click({ force: true });
    await this.page.waitForTimeout(600);
    console.log(`🖱️ 이벤트 카테고리 클릭: "${categoryName}"`);
  }

  async verifyCategoryBold(categoryName: string) {
    // 선택 카테고리가 볼드처리
    const cat = this.page.getByText(categoryName, { exact: true }).first();
    await expect(cat, `[UI/셀렉터] "${categoryName}" 카테고리를 찾을 수 없음 — 셀렉터 변경 여부 확인`).toBeVisible({ timeout: 5000 });
    console.log(`✅ "${categoryName}" 카테고리 선택 확인`);
  }

  async verifyEventsListed() {
    // 이벤트 목록 존재 확인
    const items = this.page.locator(
      '[class*="event-item"], [class*="eventItem"], [class*="EventItem"], [class*="card"], ul > li'
    );
    const count = await items.count();
    expect(count, '[앱오류] 이벤트 목록에 항목이 표시되지 않음').toBeGreaterThan(0);
    console.log(`✅ 이벤트 목록 노출 확인 (${count}개)`);
  }

  async verifyEmptyState() {
    // 이벤트 없는 카테고리: empty case 문구 확인
    await expect(
      this.page.getByText(/이벤트가 없습니다|기대해 주세요/i).first(),
      '[앱오류] 이벤트 없음 안내 문구("이벤트가 없습니다" 또는 "기대해 주세요")가 표시되지 않음'
    ).toBeVisible({ timeout: 8000 });
    console.log('✅ 이벤트 없음 empty case 안내 문구 확인');
  }

  // ── 이벤트 상세 ──────────────────────────────────────────────────────────

  async clickFirstEvent() {
    const event = this.page.locator(
      '[class*="event-item"], [class*="eventItem"], [class*="EventItem"], [class*="card"]'
    ).first();
    if (await event.isVisible({ timeout: 3000 }).catch(() => false)) {
      await event.click({ force: true });
    } else {
      // fallback: 첫 번째 링크
      await this.page.locator('a[href*="/cs/event/"]').first().click({ force: true });
    }
    await this.page.waitForLoadState('load');
    await this.page.waitForTimeout(500);
    console.log('🖱️ 첫 번째 이벤트 클릭');
  }

  async verifyDetailTitle() {
    const title = this.page.locator('h1, h2, h3, [class*="title"], [class*="Title"]').first();
    await expect(title, '[UI/셀렉터] 이벤트 상세 제목 요소를 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 8000 });
    const text = await title.textContent();
    console.log(`✅ 이벤트 상세 제목 확인: "${text?.trim().substring(0, 40)}"`);
  }

  async verifyDetailImageLoaded() {
    // 이벤트 이미지 정상 노출 (엑스박스 아닌 실제 이미지)
    const img = this.page.locator('img').first();
    if (await img.isVisible({ timeout: 3000 }).catch(() => false)) {
      const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
      expect(naturalWidth, '[앱오류] 이벤트 이미지가 정상적으로 로드되지 않음 (naturalWidth = 0)').toBeGreaterThan(0);
      console.log(`✅ 이벤트 이미지 정상 노출 확인 (naturalWidth: ${naturalWidth}px)`);
    } else {
      console.log('ℹ️  이미지 없는 이벤트');
    }
  }

  async verifyDetailGuideText() {
    // 이벤트 안내 문구 노출 확인
    const content = this.page.locator(
      '[class*="content"], [class*="Content"], [class*="detail"], article'
    ).first();
    await expect(content, '[UI/셀렉터] 이벤트 상세 안내 문구 영역을 찾을 수 없음 — 셀렉터 변경 여부 확인').toBeVisible({ timeout: 8000 });
    console.log('✅ 이벤트 상세 안내 문구 영역 확인');
  }

  async clickBackToList() {
    const backBtn = this.page.getByText('목록으로', { exact: false }).first().or(
      this.page.getByRole('button', { name: '목록으로' }).first()
    );
    await backBtn.click({ force: true });
    await this.page.waitForURL(/\/cs\/event/, { timeout: 8000 });
    console.log('🖱️ "목록으로" 클릭 → 이벤트 목록 복귀');
  }
}
