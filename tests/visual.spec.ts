import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? '';

// ─────────────────────────────────────────────────────────────────────────────
// 시각적 회귀 테스트 (Visual Regression)
//
// 첫 실행 시: 기준 스크린샷 생성
//   npx playwright test visual --update-snapshots
//
// 이후 실행 시: 기준 스크린샷과 픽셀 비교 → 차이 발생 시 실패
//   npx playwright test visual
//
// 기준 이미지 위치: tests/visual.spec.ts-snapshots/
// ─────────────────────────────────────────────────────────────────────────────

// 날짜/시간 영역 셀렉터 (매번 바뀌므로 마스킹) — CSS only
const DATE_SEL = '[class*="date"], [class*="Date"], [class*="time"], [class*="Time"], time';

// ─────────────────────────────────────────────────────────────────────────────
// 공개 페이지
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Visual - 메인 페이지', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/`);
    await page.waitForLoadState('networkidle');
  });

  test('메인 페이지 전체', async ({ page }) => {
    await expect(page).toHaveScreenshot('main-full.png', {
      fullPage: true,
      mask: [
        // 배너/슬라이더는 콘텐츠가 수시로 바뀌므로 마스킹
        page.locator('[class*="banner"], [class*="Banner"], [class*="slider"], [class*="Slider"], [class*="carousel"]'),
        page.locator(DATE_SEL),
      ],
    });
  });

  test('헤더 (GNB)', async ({ page }) => {
    const header = page.locator('header, [class*="header"]:not([class*="sub"]), [class*="Header"]:not([class*="Sub"])').first();
    await expect(header).toHaveScreenshot('gnb.png');
  });

  test('푸터', async ({ page }) => {
    const footer = page.locator('footer, [class*="footer"], [class*="Footer"]').first();
    await footer.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await expect(footer).toHaveScreenshot('footer.png');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 고객센터
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Visual - 고객센터', () => {
  test('공지사항 목록', async ({ page }) => {
    await page.goto(`${BASE}/cs`);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('cs-notice.png', {
      fullPage: true,
      mask: [page.locator(DATE_SEL)],
    });
  });

  test('이벤트 목록', async ({ page }) => {
    await page.goto(`${BASE}/cs/event`);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('cs-event.png', {
      fullPage: true,
      mask: [page.locator(DATE_SEL)],
    });
  });

  test('자주 묻는 질문', async ({ page }) => {
    await page.goto(`${BASE}/cs/faq`);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('cs-faq.png', { fullPage: true });
  });

  test('서비스 이용 문의 폼', async ({ page }) => {
    await page.goto(`${BASE}/cs/inquiry`);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('cs-inquiry.png', { fullPage: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 콘텐츠 목록
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Visual - 콘텐츠', () => {
  test('콘텐츠 목록 페이지', async ({ page }) => {
    await page.goto(`${BASE}/contents`);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('contents-list.png', {
      fullPage: true,
      mask: [page.locator(DATE_SEL)],
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 마이페이지 (로그인 필요 — storageState 자동 적용됨)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Visual - 마이페이지', () => {
  test('프로필 탭', async ({ page }) => {
    await page.goto(`${BASE}/mypage`);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('mypage-profile.png', {
      fullPage: true,
      mask: [
        // 개인정보(이메일, 이름, 전화번호) 마스킹
        page.locator('[class*="email"], [class*="Email"], [class*="phone"], [class*="Phone"], [class*="name"], [class*="Name"]'),
        page.locator(DATE_SEL),
      ],
    });
  });

  test('구매 및 결제 관리 탭', async ({ page }) => {
    await page.goto(`${BASE}/mypage`);
    await page.waitForLoadState('load');
    const tab = page.getByText('구매 및 결제 관리', { exact: true }).first();
    await tab.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -120));
    await page.waitForTimeout(300);
    await tab.click({ force: true });
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot('mypage-purchase.png', {
      fullPage: true,
      mask: [page.locator(DATE_SEL)],
    });
  });

  test('실습 대시보드 탭', async ({ page }) => {
    await page.goto(`${BASE}/mypage`);
    await page.waitForLoadState('load');
    const tab = page.getByText('실습 대시보드', { exact: true }).first();
    await tab.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -120));
    await page.waitForTimeout(300);
    await tab.click({ force: true });
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot('mypage-dashboard.png', {
      fullPage: true,
      mask: [
        page.locator(DATE_SEL),
        page.locator('[class*="progress"], [class*="Progress"]'),
      ],
    });
  });
});
