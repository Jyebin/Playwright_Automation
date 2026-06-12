import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? '';

// T531 - [Front][PC][콘텐츠][이슈반영] HTML 특수문자 escape 처리 상태 확인
// METADEMY-878: 콘텐츠 상세 > 부제 > HTML 문자 escape 처리상태로 출력됨
test.describe('T531 - HTML 특수문자 escape 처리 상태 확인', () => {
  const HTML_ENTITIES = ['&lt;', '&gt;', '&amp;', '&nbsp;', '&#', '&quot;'];

  function containsHtmlEntity(text: string): boolean {
    return HTML_ENTITIES.some(entity => text.includes(entity));
  }

  // Step 0: 콘텐츠 목록에서 HTML 특수문자 확인
  test('콘텐츠 목록 카드 설명에 HTML entity 미출력 확인 (두경부 해부학)', async ({ page }) => {
    await page.goto(`${BASE}/contents`);
    await page.waitForLoadState('load');

    // 보건 의료 카테고리로 필터링하여 두경부 해부학 콘텐츠 노출
    await page.getByText('보건 의료', { exact: true }).first().click();
    await page.waitForTimeout(600);

    // 두경부 해부학 카드가 있으면 해당 카드의 텍스트 검사
    const card = page.getByText('두경부 해부학', { exact: false }).first();
    const isVisible = await card.isVisible().catch(() => false);

    if (isVisible) {
      // 카드 부모 영역의 전체 텍스트 가져오기
      const cardText = await card.locator('..').textContent() ?? '';
      expect(containsHtmlEntity(cardText)).toBe(false);
      console.log('✅ 두경부 해부학 카드 설명에 HTML entity 없음 확인');
    } else {
      // 스크롤 후 재시도
      await page.evaluate(() => window.scrollBy(0, 600));
      await page.waitForTimeout(400);
      const cardAfterScroll = page.getByText('두경부 해부학', { exact: false }).first();
      if (await cardAfterScroll.isVisible().catch(() => false)) {
        const cardText = await cardAfterScroll.locator('..').textContent() ?? '';
        expect(containsHtmlEntity(cardText)).toBe(false);
        console.log('✅ 두경부 해부학 카드 설명에 HTML entity 없음 확인 (스크롤 후)');
      } else {
        console.log('⏭️ 두경부 해부학 카드 미노출 → 전체 카드 텍스트로 검사');
        // 전체 카드 텍스트 중 HTML entity 검사
        const allCards = page.locator('[class*="Card"], [class*="card"]');
        const count = await allCards.count();
        for (let i = 0; i < Math.min(count, 6); i++) {
          const text = await allCards.nth(i).textContent() ?? '';
          expect(containsHtmlEntity(text)).toBe(false);
        }
        console.log(`✅ 카드 ${Math.min(count, 6)}개 HTML entity 없음 확인`);
      }
    }
  });

  // Step 1: 콘텐츠 상세 페이지에서 HTML 특수문자 확인
  test('콘텐츠 상세 설명에 HTML entity 미출력 확인 (두경부 해부학 id=84)', async ({ page }) => {
    // 두경부 해부학 직접 URL 접근
    await page.goto(`${BASE}/contents/detail?id=84&memberType=false`);
    await page.waitForLoadState('load');

    // 페이지가 정상 로드되었는지 확인
    const notFound = await page.getByText('페이지를 찾을 수 없습니다', { exact: false }).isVisible().catch(() => false);
    if (notFound) {
      console.log('⏭️ id=84 콘텐츠 없음 → 첫 번째 콘텐츠로 대체 검사');
      await page.goto(`${BASE}/contents`);
      await page.waitForLoadState('load');
      await page.locator('[class*="Card"], [class*="card"]').first().click();
      await page.waitForURL(/\/contents\/detail/);
      await page.waitForLoadState('load');
    }

    // 콘텐츠 상세 설명 영역 전체 텍스트 검사
    const descArea = page.locator('[class*="description"], [class*="Description"], [class*="intro"], [class*="content-body"]').first();
    if (await descArea.isVisible({ timeout: 5000 }).catch(() => false)) {
      const text = await descArea.textContent() ?? '';
      expect(containsHtmlEntity(text)).toBe(false);
      console.log('✅ 콘텐츠 상세 설명 HTML entity 없음 확인');
    } else {
      // fallback: body 전체에서 검사 (visible 텍스트)
      const bodyText = await page.evaluate(() => document.body.innerText);
      expect(containsHtmlEntity(bodyText)).toBe(false);
      console.log('✅ 페이지 전체 텍스트 HTML entity 없음 확인');
    }
  });

  // 추가: 여러 콘텐츠 카드 일괄 확인
  test('콘텐츠 목록 전체 카드에서 HTML entity 미출력 확인', async ({ page }) => {
    await page.goto(`${BASE}/contents`);
    await page.waitForLoadState('load');

    const cards = page.locator('[class*="Card"], [class*="card"]');
    const count = await cards.count();
    const checkCount = Math.min(count, 9); // 최대 9개 확인

    for (let i = 0; i < checkCount; i++) {
      const text = await cards.nth(i).textContent() ?? '';
      if (containsHtmlEntity(text)) {
        throw new Error(`카드 ${i + 1}번에 HTML entity 발견: ${text.slice(0, 100)}`);
      }
    }
    console.log(`✅ 콘텐츠 카드 ${checkCount}개 HTML entity 없음 확인`);
  });
});
