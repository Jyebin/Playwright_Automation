import { test, expect } from '@playwright/test';
import { CsPage, CS_TABS } from './pages/CsPage';
import { CsNoticePage, NOTICE_CATEGORIES, NOTICE_SORT_OPTIONS } from './pages/CsNoticePage';
import { CsEventPage, EVENT_CATEGORIES } from './pages/CsEventPage';
import { CsFaqPage, FAQ_CATEGORIES } from './pages/CsFaqPage';
import { CsInquiryPage, INQUIRY_TYPES } from './pages/CsInquiryPage';
import { tcStep, captureEvidence } from './utils/evidence';

// ─────────────────────────────────────────────────────────────────────────────
// T1631 고객센터 기본
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T1631 고객센터 기본', () => {
  test('헤더 고객센터 클릭 시 고객센터 페이지로 이동', { annotation: tcStep(1) }, async ({ page }) => {
    const cs = new CsPage(page);
    await test.step('[셋업] 헤더 고객센터 클릭', async () => {
      await cs.navigateViaHeader();
    });
    await test.step('[검증] URL /cs 확인', async () => {
      await cs.verifyUrl();
    });
  });

  test('고객센터 URL 확인', { annotation: tcStep(1) }, async ({ page }) => {
    const cs = new CsPage(page);
    await test.step('[셋업] 고객센터 페이지 이동', async () => {
      await cs.navigate();
    });
    await test.step('[검증] URL /cs 확인', async () => {
      await cs.verifyUrl();
    });
  });

  test('고객센터 탭 목록 4개 노출 확인', { annotation: tcStep(2) }, async ({ page }) => {
    const cs = new CsPage(page);
    await test.step('[셋업] 고객센터 페이지 이동', async () => {
      await cs.navigate();
    });
    await test.step('[검증] 탭 목록 4개 노출 확인', async () => {
      await cs.verifyTabsExist();
    });
  });

  test('고객센터 기본 탭은 공지사항', { annotation: tcStep(2) }, async ({ page }) => {
    const cs = new CsPage(page);
    await test.step('[셋업] 고객센터 페이지 이동', async () => {
      await cs.navigate();
    });
    await test.step('[검증] 기본 탭이 공지사항인지 확인', async () => {
      await cs.verifyDefaultTabIsNotice();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T411 공지사항
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T411 공지사항', () => {
  test('공지사항 화면 구성 확인 (카테고리, 검색, 정렬, 게시물)', { annotation: tcStep(2) }, async ({ page }) => {
    const notice = new CsNoticePage(page);
    await test.step('[셋업] 공지사항 페이지 이동', async () => {
      await notice.navigate();
    });
    await test.step('[검증] URL /cs/notice 확인', async () => {
      await notice.verifyUrl();
    });
    await test.step('[검증] 카테고리 목록 노출 확인', async () => {
      await notice.verifyCategoriesExist();
    });
    await test.step('[검증] 검색창 placeholder 확인', async () => {
      await notice.verifySearchPlaceholder();
    });
    await test.step('[검증] 기본 정렬 옵션 확인', async () => {
      await notice.verifyDefaultSortOption();
    });
    await test.step('[검증] 게시물 구조 확인', async () => {
      await notice.verifyPostsStructure();
    });
  });

  test('공지사항 정렬 드롭다운 옵션 (최신순/과거순/조회순)', { annotation: tcStep(7) }, async ({ page }) => {
    const notice = new CsNoticePage(page);
    await test.step('[셋업] 공지사항 페이지 이동', async () => {
      await notice.navigate();
    });
    await test.step('[검증] 정렬 드롭다운 옵션 3개(최신순/과거순/조회순) 확인', async () => {
      await notice.verifySortDropdownOptions();
    });
  });

  test('공지사항 정렬 선택 동작', { annotation: tcStep(7) }, async ({ page }) => {
    const notice = new CsNoticePage(page);
    await test.step('[셋업] 공지사항 페이지 이동 후 과거순 선택', async () => {
      await notice.navigate();
      await notice.selectSortOption('과거순');
    });
    await test.step('[검증] 정렬 변경 후 게시물 구조 확인', async () => {
      await notice.verifyPostsStructure();
    });
  });

  test('공지사항 빈 검색어 알럿 확인', { annotation: tcStep(5) }, async ({ page }) => {
    const notice = new CsNoticePage(page);
    await test.step('[셋업] 공지사항 페이지 이동', async () => {
      await notice.navigate();
    });
    await test.step('[검증] 빈 검색어 입력 시 알럿 노출 확인', async () => {
      await notice.verifyEmptySearchAlert();
      await notice.closeAlert();
    });
  });

  test('공지사항 키워드 검색 후 검색창 유지', { annotation: tcStep(5) }, async ({ page }) => {
    const notice = new CsNoticePage(page);
    await test.step('[셋업] 공지사항 페이지 이동 후 키워드 검색', async () => {
      await notice.navigate();
      await notice.searchByKeyword('공지');
    });
    await test.step('[검증] 검색 후 검색창에 키워드 유지 확인', async () => {
      await notice.verifySearchKeywordRetained('공지');
    });
  });

  test('공지사항 버튼/Enter 검색 결과 동일 확인', { annotation: tcStep(3) }, async ({ page }) => {
    const notice = new CsNoticePage(page);
    await test.step('[셋업] 공지사항 페이지 이동', async () => {
      await notice.navigate();
    });
    await test.step('[검증] 버튼/Enter 검색 결과 동일 확인', async () => {
      await notice.verifySearchByButton();
    });
  });

  test('공지사항 카테고리 필터링', { annotation: tcStep(4) }, async ({ page }) => {
    const notice = new CsNoticePage(page);
    await test.step('[셋업] 공지사항 페이지 이동', async () => {
      await notice.navigate();
    });
    await test.step('[검증] 카테고리별 필터링 결과 확인', async () => {
      for (const cat of NOTICE_CATEGORIES) {
        await notice.clickCategory(cat);
        const hasResults = await page.locator('tbody tr, [class*="notice-item"], [class*="noticeItem"]').count();
        if (hasResults > 0) {
          await notice.verifyFilteredResults();
        } else {
          await notice.verifyNoResults();
        }
      }
    });
  });

  test('공지사항 카테고리 초기화', { annotation: tcStep(12) }, async ({ page }) => {
    const notice = new CsNoticePage(page);
    await test.step('[셋업] 공지사항 페이지 이동 후 카테고리 선택', async () => {
      await notice.navigate();
      await notice.clickCategory('공지');
    });
    await test.step('[검증] 카테고리 초기화 확인', async () => {
      await notice.verifyCategoryReset();
    });
  });

  test('공지사항 XSS 방어', { annotation: tcStep(6) }, async ({ page }) => {
    const notice = new CsNoticePage(page);
    await test.step('[셋업] 공지사항 페이지 이동', async () => {
      await notice.navigate();
    });
    await test.step('[검증] XSS 스크립트 입력 방어 확인', async () => {
      await notice.verifyXssDefense();
    });
  });

  test('공지사항 SQL Injection 방어', { annotation: tcStep(6) }, async ({ page }) => {
    const notice = new CsNoticePage(page);
    await test.step('[셋업] 공지사항 페이지 이동', async () => {
      await notice.navigate();
    });
    await test.step('[검증] SQL Injection 입력 방어 확인', async () => {
      await notice.verifySqlInjectionDefense();
    });
  });

  test('공지사항 페이지당 게시물 수 확인 (최대 10개)', { annotation: tcStep(8) }, async ({ page }) => {
    const notice = new CsNoticePage(page);
    await test.step('[셋업] 공지사항 페이지 이동', async () => {
      await notice.navigate();
    });
    await test.step('[검증] 페이지당 게시물 수 최대 10개 확인', async () => {
      await notice.verifyItemsPerPage();
    });
    await test.step('[검증] 페이지네이션 노출 확인', async () => {
      await notice.verifyPaginationExists();
    });
  });

  test('공지사항 상세 페이지 — 본문/날짜 확인', { annotation: tcStep(9, 11, 13) }, async ({ page }) => {
    const notice = new CsNoticePage(page);
    await test.step('[셋업] 공지사항 페이지 이동 후 첫 번째 게시물 클릭', async () => {
      await notice.navigate();
      await notice.clickFirstPost();
    });
    await test.step('[검증] 상세 페이지 본문/날짜 확인', async () => {
      await notice.verifyDetailPageContent();
    });
    await test.step('[검증] 첨부파일 없음 메시지 확인', async () => {
      await notice.verifyNoAttachmentMessage();
    });
    await test.step('[검증] 이전/다음 게시물 없음 확인', async () => {
      await notice.verifyNoPrevNextPost();
    });
    await test.step('[검증] HTML 엔티티 렌더링 확인', async () => {
      await notice.verifyHtmlEntitiesRendered();
    });
  });

  test('공지사항 상세 → 목록으로 복귀', { annotation: tcStep(9) }, async ({ page }) => {
    const notice = new CsNoticePage(page);
    await test.step('[셋업] 공지사항 페이지 이동 후 첫 번째 게시물 클릭', async () => {
      await notice.navigate();
      await notice.clickFirstPost();
    });
    await test.step('[셋업] 목록으로 복귀 버튼 클릭', async () => {
      await notice.clickBackToList();
    });
    await test.step('[검증] 공지사항 목록 URL 확인', async () => {
      await notice.verifyUrl();
    });
  });

  test('공지사항 탭 이동 후 복귀 시 초기화', { annotation: tcStep(10) }, async ({ page }) => {
    const cs = new CsPage(page);
    const notice = new CsNoticePage(page);
    await test.step('[셋업] 공지사항 검색 후 이벤트 탭 이동 → 공지사항 탭 복귀', async () => {
      await notice.navigate();
      await notice.searchByKeyword('테스트');
      // 이벤트 탭 이동
      await cs.clickTab('이벤트');
      // 공지사항 탭으로 복귀
      await cs.clickTab('공지사항');
    });
    await test.step('[검증] 탭 복귀 후 검색 상태 초기화 확인', async () => {
      await notice.verifyPageResetAfterTabSwitch();
    });
  });

  test('헤더 [고객센터] 재클릭 시 동작 없음 — 공지사항 기본 탭 유지', { annotation: tcStep(1) }, async ({ page }) => {
    const cs = new CsPage(page);
    // 탭 구조: #CSCenterView > .tabs-group > div#Tab(.active) > a(탭 이름) + span.border
    const tabs = page.locator('.tabs-group > div');
    const headerCsLink = page.getByRole('link', { name: '고객센터' }).first();
    const rows = page.locator('tbody tr');
    const snapshot = async () => ({
      url: page.url(),
      activeTab: ((await tabs.filter({ has: page.locator('a') }).evaluateAll(list =>
        list.filter(t => t.classList.contains('active')).map(t => t.textContent?.trim() ?? ''))).join(', ')),
      rowCount: await rows.count(),
      firstRow: ((await rows.first().textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim(),
    });

    await test.step('[셋업] 메인에서 헤더 [고객센터] 클릭 → 고객센터 진입', async () => {
      await cs.navigateViaHeader();
    });

    let before: Awaited<ReturnType<typeof snapshot>>;
    await test.step('[검증] 고객센터 진입 시 공지사항 탭 기본 선택', async () => {
      await expect(page, '[앱오류] 헤더 [고객센터] 클릭 후 /cs 로 이동되지 않음').toHaveURL(/\/cs(\/notice)?$/);
      await expect(tabs, '[UI/셀렉터] 고객센터 탭 4개를 찾을 수 없음').toHaveCount(4);
      await expect(tabs.filter({ hasText: /^공지사항$/ }), '[앱오류] 고객센터 진입 시 [공지사항] 탭이 기본 선택(active) 상태가 아님').toHaveClass(/\bactive\b/);
      await expect(rows.first(), '[앱오류] 공지사항 목록이 표시되지 않음').toBeVisible({ timeout: 10000 });
      before = await snapshot();
      console.log(`✅ 클릭 전 URL: ${before.url}`);
      console.log(`✅ 클릭 전 선택 탭: "${before.activeTab}", 목록 ${before.rowCount}건, 첫 행: "${before.firstRow}"`);
    });

    await test.step('[셋업] 헤더 [고객센터] 한 번 더 클릭', async () => {
      // 전체 새로고침 여부 판별용 마커 + 메인 프레임 이동 기록
      await page.evaluate(() => { (window as any).__csReclickMarker = true; });
      const navs: string[] = [];
      const onNav = (f: import('@playwright/test').Frame) => { if (f === page.mainFrame()) navs.push(f.url()); };
      page.on('framenavigated', onNav);
      await headerCsLink.scrollIntoViewIfNeeded();
      await headerCsLink.click({ force: true });
      await page.waitForTimeout(1500);
      page.off('framenavigated', onNav);
      console.log(`✅ 재클릭 중 메인 프레임 이동 이벤트: ${navs.length}건${navs.length ? ` (${navs.join(', ')})` : ''}`);
    });

    await test.step('[검증] 재클릭 후 URL·선택 탭·목록 변화 없음', async () => {
      const reloaded = !(await page.evaluate(() => (window as any).__csReclickMarker === true));
      const after = await snapshot();
      console.log(`✅ 클릭 후 URL: ${after.url}`);
      console.log(`✅ 클릭 후 선택 탭: "${after.activeTab}", 목록 ${after.rowCount}건, 첫 행: "${after.firstRow}"`);
      console.log(`✅ 페이지 새로고침 발생: ${reloaded ? '예' : '아니오'}`);

      expect(after.url, '[앱오류] [고객센터] 재클릭 시 URL이 변경됨').toBe(before.url);
      expect(reloaded, '[앱오류] [고객센터] 재클릭 시 페이지가 새로고침됨 (동작 없음이어야 함)').toBe(false);
      expect(after.activeTab, '[앱오류] [고객센터] 재클릭 후 선택 탭이 공지사항에서 변경됨').toBe(before.activeTab);
      expect(after.rowCount, '[앱오류] [고객센터] 재클릭 후 공지사항 목록 건수가 변경됨').toBe(before.rowCount);
      expect(after.firstRow, '[앱오류] [고객센터] 재클릭 후 공지사항 목록 내용이 변경됨').toBe(before.firstRow);

      await captureEvidence(page, '헤더 [고객센터] 재클릭 후 화면 (공지사항 탭 유지)');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T412 이벤트
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T412 이벤트', () => {
  test('이벤트 탭 이동 및 URL 확인', { annotation: tcStep(1) }, async ({ page }) => {
    const cs = new CsPage(page);
    const ev = new CsEventPage(page);
    await test.step('[셋업] 고객센터 페이지 이동 후 이벤트 탭 클릭', async () => {
      await cs.navigate();
      await cs.clickTab('이벤트');
    });
    await test.step('[검증] 이벤트 URL 확인', async () => {
      await ev.verifyUrl();
    });
    await test.step('[검증] 이벤트 탭 활성 스타일 확인', async () => {
      await ev.verifyTabActiveStyle();
    });
  });

  test('이벤트 카테고리 (진행/예정/종료) 노출 확인', { annotation: tcStep(2) }, async ({ page }) => {
    const ev = new CsEventPage(page);
    await test.step('[셋업] 이벤트 페이지 이동', async () => {
      await ev.navigate();
    });
    await test.step('[검증] 카테고리(진행/예정/종료) 노출 확인', async () => {
      await ev.verifyCategoriesExist();
    });
  });

  test('이벤트 기본 카테고리 "진행" 선택 확인', { annotation: tcStep(2) }, async ({ page }) => {
    const ev = new CsEventPage(page);
    await test.step('[셋업] 이벤트 페이지 이동', async () => {
      await ev.navigate();
    });
    await test.step('[검증] 기본 카테고리가 "진행"인지 확인', async () => {
      await ev.verifyDefaultCategoryIsProgress();
    });
  });

  test('이벤트 카테고리 클릭 및 목록/빈 상태 확인', { annotation: tcStep(2, 4) }, async ({ page }) => {
    const ev = new CsEventPage(page);
    await test.step('[셋업] 이벤트 페이지 이동', async () => {
      await ev.navigate();
    });
    await test.step('[검증] 카테고리별 클릭 시 목록/빈 상태 확인', async () => {
      for (const cat of EVENT_CATEGORIES) {
        await ev.clickCategory(cat);
        await ev.verifyCategoryBold(cat);
        const count = await page.locator(
          '[class*="event-item"], [class*="eventItem"], [class*="EventItem"], [class*="card"], ul > li'
        ).count();
        if (count > 0) {
          await ev.verifyEventsListed();
        } else {
          await ev.verifyEmptyState();
        }
      }
    });
  });

  test('이벤트 상세 — 제목/이미지/안내문구 확인', { annotation: tcStep(3) }, async ({ page }) => {
    const ev = new CsEventPage(page);
    await test.step('[셋업] 이벤트 페이지 이동 후 진행 카테고리 확인', async () => {
      await ev.navigate();
      await ev.verifyDefaultCategoryIsProgress();
    });
    await test.step('[검증] 이벤트 상세 제목/이미지/안내문구 확인', async () => {
      const count = await page.locator(
        '[class*="event-item"], [class*="eventItem"], [class*="EventItem"], [class*="card"]'
      ).count();
      if (count > 0) {
        await ev.clickFirstEvent();
        await ev.verifyDetailTitle();
        await ev.verifyDetailImageLoaded();
        await ev.verifyDetailGuideText();
        await ev.clickBackToList();
      } else {
        console.log('ℹ️  진행 이벤트 없음 — 상세 테스트 건너뜀');
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T413 자주 묻는 질문
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T413 자주 묻는 질문', () => {
  test('FAQ 탭 이동 및 URL 확인', { annotation: tcStep(1) }, async ({ page }) => {
    const cs = new CsPage(page);
    const faq = new CsFaqPage(page);
    await test.step('[셋업] 고객센터 페이지 이동 후 FAQ 탭 클릭', async () => {
      await cs.navigate();
      await cs.clickTab('자주 묻는 질문');
    });
    await test.step('[검증] FAQ URL 확인', async () => {
      await faq.verifyUrl();
    });
    await test.step('[검증] FAQ 탭 활성 스타일 확인', async () => {
      await faq.verifyTabActiveStyle();
    });
  });

  test('FAQ 카테고리 노출 확인', { annotation: tcStep(2) }, async ({ page }) => {
    const faq = new CsFaqPage(page);
    await test.step('[셋업] FAQ 페이지 이동', async () => {
      await faq.navigate();
    });
    await test.step('[검증] 카테고리 목록 노출 확인', async () => {
      await faq.verifyCategoriesExist();
    });
  });

  test('FAQ 카테고리별 클릭 및 게시물 확인', { annotation: tcStep(2, 3) }, async ({ page }) => {
    const faq = new CsFaqPage(page);
    await test.step('[셋업] FAQ 페이지 이동', async () => {
      await faq.navigate();
    });
    await test.step('[검증] 카테고리별 게시물/빈 상태 확인', async () => {
      for (const cat of FAQ_CATEGORIES) {
        await faq.clickCategory(cat);
        const count = await page.locator(
          '[class*="faq-item"], [class*="faqItem"], [class*="FaqItem"], details, [class*="accordion-item"], [class*="accordionItem"]'
        ).count();
        if (count > 0) {
          await faq.verifyFaqItemsExist();
          await faq.verifyPostStructure();
        } else {
          await faq.verifyEmptyState();
        }
      }
    });
  });

  test('FAQ 검색 placeholder 확인', { annotation: tcStep(4) }, async ({ page }) => {
    const faq = new CsFaqPage(page);
    await test.step('[셋업] FAQ 페이지 이동', async () => {
      await faq.navigate();
    });
    await test.step('[검증] 검색창 placeholder 확인', async () => {
      await faq.verifySearchPlaceholder();
    });
  });

  test('FAQ 빈 검색어 알럿 확인', { annotation: tcStep(4) }, async ({ page }) => {
    const faq = new CsFaqPage(page);
    await test.step('[셋업] FAQ 페이지 이동', async () => {
      await faq.navigate();
    });
    await test.step('[검증] 빈 검색어 입력 시 알럿 노출 확인', async () => {
      await faq.verifyEmptySearchAlert();
      await faq.closeAlert();
    });
  });

  test('FAQ 키워드 검색 결과 확인', { annotation: tcStep(4) }, async ({ page }) => {
    const faq = new CsFaqPage(page);
    await test.step('[셋업] FAQ 페이지 이동 후 키워드 검색', async () => {
      await faq.navigate();
      await faq.searchFaq('서비스');
    });
    await test.step('[검증] 키워드 검색 결과 확인', async () => {
      const count = await page.locator(
        '[class*="faq-item"], [class*="faqItem"], details, [class*="accordion-item"]'
      ).count();
      if (count > 0) {
        await faq.verifySearchResultsShown('서비스');
      } else {
        await faq.verifyNoSearchResults();
      }
    });
  });

  test('FAQ 아코디언 — 항목 클릭 시 펼침', { annotation: tcStep(6) }, async ({ page }) => {
    const faq = new CsFaqPage(page);
    await test.step('[셋업] FAQ 페이지 이동 후 첫 번째 항목 클릭', async () => {
      await faq.navigate();
      await faq.verifyFaqItemsExist();
      await faq.clickFirstFaqItem();
    });
    await test.step('[검증] 첫 번째 항목 펼침 확인', async () => {
      await faq.verifyFaqItemExpanded();
    });
  });

  test('FAQ 아코디언 — 같은 항목 재클릭 시 닫힘', { annotation: tcStep(6) }, async ({ page }) => {
    const faq = new CsFaqPage(page);
    await test.step('[셋업] FAQ 페이지 이동 후 첫 번째 항목 펼침', async () => {
      await faq.navigate();
      await faq.verifyFaqItemsExist();
      await faq.clickFirstFaqItem();
      await faq.verifyFaqItemExpanded();
    });
    await test.step('[셋업] 같은 항목 재클릭', async () => {
      await faq.clickFirstFaqItemAgain();
    });
    await test.step('[검증] 재클릭 시 항목 닫힘 확인', async () => {
      await faq.verifyFaqItemCollapsed();
    });
  });

  test('FAQ 아코디언 — 다른 항목 클릭 시 기존 항목 닫힘', { annotation: tcStep(6) }, async ({ page }) => {
    const faq = new CsFaqPage(page);
    await test.step('[셋업] FAQ 페이지 이동 후 첫 번째 항목 펼침', async () => {
      await faq.navigate();
      await faq.verifyFaqItemsExist();
      await faq.clickFirstFaqItem();
      await faq.verifyFaqItemExpanded();
    });
    await test.step('[셋업] 두 번째 항목 클릭', async () => {
      await faq.clickSecondFaqItem();
    });
    await test.step('[검증] 하나의 항목만 펼쳐진 상태 확인', async () => {
      await faq.verifyOnlyOneItemExpanded();
    });
  });

  test('FAQ 페이지네이션 확인', { annotation: tcStep(5) }, async ({ page }) => {
    const faq = new CsFaqPage(page);
    await test.step('[셋업] FAQ 페이지 이동', async () => {
      await faq.navigate();
    });
    await test.step('[검증] 페이지네이션 노출 확인', async () => {
      await faq.verifyPaginationExists();
    });
  });

  test('FAQ 탭 이동 후 복귀 시 초기화', { annotation: tcStep(7) }, async ({ page }) => {
    const cs = new CsPage(page);
    const faq = new CsFaqPage(page);
    await test.step('[셋업] FAQ 검색 후 이벤트 탭 이동 → FAQ 탭 복귀', async () => {
      await cs.navigate();
      await cs.clickTab('자주 묻는 질문');
      await faq.searchFaq('테스트');
      // 이벤트 탭으로 이동 후 복귀
      await cs.clickTab('이벤트');
      await cs.clickTab('자주 묻는 질문');
    });
    await test.step('[검증] 탭 복귀 후 검색 상태 초기화 확인', async () => {
      await faq.verifyPageResetAfterTabSwitch();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T414 서비스 이용 문의
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T414 서비스 이용 문의', () => {
  test('서비스 이용 문의 탭 이동 및 URL 확인', { annotation: tcStep(1) }, async ({ page }) => {
    const cs = new CsPage(page);
    const inquiry = new CsInquiryPage(page);
    await test.step('[셋업] 고객센터 페이지 이동 후 서비스 이용 문의 탭 클릭', async () => {
      await cs.navigate();
      await cs.clickTab('서비스 이용 문의');
    });
    await test.step('[검증] 서비스 이용 문의 URL 확인', async () => {
      await inquiry.verifyUrl();
    });
    await test.step('[검증] 서비스 이용 문의 탭 활성 스타일 확인', async () => {
      await inquiry.verifyTabActiveStyle();
    });
  });

  test('서비스 이용 문의 화면 구성 — placeholder 확인', { annotation: tcStep(3, 4, 5, 6, 7) }, async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    await test.step('[셋업] 서비스 이용 문의 페이지 이동', async () => {
      await inquiry.navigate();
    });
    await test.step('[검증] 각 입력 필드 placeholder 확인', async () => {
      await inquiry.verifyNamePlaceholder();
      await inquiry.verifyAffiliationPlaceholder();
      await inquiry.verifyInquiryTypeDropdownPlaceholder();
      await inquiry.verifyEmailPlaceholder();
      await inquiry.verifyPhonePlaceholder();
      await inquiry.verifyTitlePlaceholder();
      await inquiry.verifyContentPlaceholder();
    });
  });

  test('서비스 이용 문의 탭 이동 후 복귀 시 초기화', { annotation: tcStep(2) }, async ({ page }) => {
    const cs = new CsPage(page);
    const inquiry = new CsInquiryPage(page);
    await test.step('[셋업] 문의 탭에서 이름 입력 후 다른 탭 이동 → 복귀', async () => {
      await cs.navigate();
      await cs.clickTab('서비스 이용 문의');
      await inquiry.fillName('테스트');
      // 다른 탭 이동 후 복귀
      await cs.clickTab('이벤트');
      await cs.clickTab('서비스 이용 문의');
    });
    await test.step('[검증] 탭 복귀 후 입력 필드 초기화 확인', async () => {
      await inquiry.verifyFieldsReset();
    });
  });

  test('이름 미입력 → 알럿 "이름을 입력해 주세요."', { annotation: tcStep(3) }, async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    await test.step('[셋업] 서비스 이용 문의 페이지 이동 후 제출 클릭', async () => {
      await inquiry.navigate();
      await inquiry.clickSubmitButton();
    });
    await test.step('[검증] 이름 미입력 알럿 확인', async () => {
      await inquiry.verifyAlert('이름을 입력해 주세요');
      await inquiry.closeAlert();
    });
  });

  test('소속 미입력 → 알럿 "소속을 입력해 주세요."', { annotation: tcStep(3) }, async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    await test.step('[셋업] 이름만 입력 후 제출 클릭', async () => {
      await inquiry.navigate();
      await inquiry.fillName('테스트 사용자');
      await inquiry.clickSubmitButton();
    });
    await test.step('[검증] 소속 미입력 알럿 확인', async () => {
      await inquiry.verifyAlert('소속을 입력해 주세요');
      await inquiry.closeAlert();
    });
  });

  test('문의 종류 미선택 → 알럿 "문의 종류를 선택해 주세요."', { annotation: tcStep(3, 4) }, async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    await test.step('[셋업] 이름/소속 입력 후 제출 클릭', async () => {
      await inquiry.navigate();
      await inquiry.fillName('테스트 사용자');
      await inquiry.fillAffiliation('테스트 회사');
      await inquiry.clickSubmitButton();
    });
    await test.step('[검증] 문의 종류 미선택 알럿 확인', async () => {
      await inquiry.verifyAlert('문의 종류를 선택해 주세요');
      await inquiry.closeAlert();
    });
  });

  test('문의 종류 드롭다운 항목 6개 확인', { annotation: tcStep(4) }, async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    await test.step('[셋업] 서비스 이용 문의 페이지 이동', async () => {
      await inquiry.navigate();
    });
    await test.step('[검증] 문의 종류 드롭다운 항목 6개 확인', async () => {
      await inquiry.verifyInquiryTypeOptions();
    });
  });

  test('이메일 미입력 → 알럿 "E-mail 주소를 입력해 주세요."', { annotation: tcStep(5) }, async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    await test.step('[셋업] 이름/소속/문의종류 입력 후 제출 클릭', async () => {
      await inquiry.navigate();
      await inquiry.fillName('테스트 사용자');
      await inquiry.fillAffiliation('테스트 회사');
      await inquiry.selectInquiryType('기타 문의');
      await inquiry.clickSubmitButton();
    });
    await test.step('[검증] 이메일 미입력 알럿 확인', async () => {
      await inquiry.verifyAlert(/E-mail 주소를 입력해 주세요|이메일.+입력해 주세요/);
      await inquiry.closeAlert();
    });
  });

  test('이메일 잘못된 형식 → 필드 하단 오류 메시지', { annotation: tcStep(5) }, async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    await test.step('[셋업] 잘못된 형식의 이메일 입력 후 제출 클릭', async () => {
      await inquiry.navigate();
      await inquiry.fillName('테스트 사용자');
      await inquiry.fillAffiliation('테스트 회사');
      await inquiry.selectInquiryType('기타 문의');
      await inquiry.fillEmail('invalid-email');
      await inquiry.clickSubmitButton();
    });
    await test.step('[검증] 이메일 형식 오류 메시지 확인', async () => {
      await inquiry.verifyEmailValidationError();
    });
  });

  test('전화번호 미입력 → 알럿 "전화번호를 입력해 주세요."', { annotation: tcStep(5, 6) }, async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    await test.step('[셋업] 이름/소속/문의종류/이메일 입력 후 제출 클릭', async () => {
      await inquiry.navigate();
      await inquiry.fillName('테스트 사용자');
      await inquiry.fillAffiliation('테스트 회사');
      await inquiry.selectInquiryType('기타 문의');
      await inquiry.fillEmail('test@example.com');
      await inquiry.clickSubmitButton();
    });
    await test.step('[검증] 전화번호 미입력 알럿 확인', async () => {
      await inquiry.verifyAlert(/전화번호를 입력해 주세요/);
      await inquiry.closeAlert();
    });
  });

  test('전화번호 잘못된 형식 → 필드 하단 오류 메시지', { annotation: tcStep(6) }, async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    await test.step('[셋업] 잘못된 형식의 전화번호 입력 후 제출 클릭', async () => {
      await inquiry.navigate();
      await inquiry.fillName('테스트 사용자');
      await inquiry.fillAffiliation('테스트 회사');
      await inquiry.selectInquiryType('기타 문의');
      await inquiry.fillEmail('test@example.com');
      await inquiry.fillPhone('1234');
      await inquiry.clickSubmitButton();
    });
    await test.step('[검증] 전화번호 형식 오류 메시지 확인', async () => {
      await inquiry.verifyPhoneValidationError();
    });
  });

  test('제목 미입력 → 알럿 "제목을 입력해 주세요."', { annotation: tcStep(6, 7) }, async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    await test.step('[셋업] 이름/소속/문의종류/이메일/전화번호 입력 후 제출 클릭', async () => {
      await inquiry.navigate();
      await inquiry.fillName('테스트 사용자');
      await inquiry.fillAffiliation('테스트 회사');
      await inquiry.selectInquiryType('기타 문의');
      await inquiry.fillEmail('test@example.com');
      await inquiry.fillPhone('010-1234-5678');
      await inquiry.clickSubmitButton();
    });
    await test.step('[검증] 제목 미입력 알럿 확인', async () => {
      await inquiry.verifyAlert('제목을 입력해 주세요');
      await inquiry.closeAlert();
    });
  });

  test('내용 미입력 → 알럿 "이용 문의 내용이 작성되지 않았습니다."', { annotation: tcStep(7) }, async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    await test.step('[셋업] 이름/소속/문의종류/이메일/전화번호/제목 입력 후 제출 클릭', async () => {
      await inquiry.navigate();
      await inquiry.fillName('테스트 사용자');
      await inquiry.fillAffiliation('테스트 회사');
      await inquiry.selectInquiryType('기타 문의');
      await inquiry.fillEmail('test@example.com');
      await inquiry.fillPhone('010-1234-5678');
      await inquiry.fillTitle('테스트 제목');
      await inquiry.clickSubmitButton();
    });
    await test.step('[검증] 내용 미입력 알럿 확인', async () => {
      await inquiry.verifyAlert('이용 문의 내용이 작성되지 않았습니다');
      await inquiry.closeAlert();
    });
  });

  test('개인정보 미동의 → 알럿 확인', { annotation: tcStep(7) }, async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    await test.step('[셋업] 모든 필드 입력(개인정보 미동의) 후 제출 클릭', async () => {
      await inquiry.navigate();
      await inquiry.fillName('테스트 사용자');
      await inquiry.fillAffiliation('테스트 회사');
      await inquiry.selectInquiryType('기타 문의');
      await inquiry.fillEmail('test@example.com');
      await inquiry.fillPhone('010-1234-5678');
      await inquiry.fillTitle('테스트 제목');
      await inquiry.fillContent('테스트 내용입니다.');
      await inquiry.clickSubmitButton();
    });
    await test.step('[검증] 개인정보 수집 동의 요구 알럿 확인', async () => {
      await inquiry.verifyAlert(/개인정보 수집.*동의/);
      await inquiry.closeAlert();
    });
  });

  test('파일 업로드 — 파일명 노출 확인', { annotation: tcStep(8) }, async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    const buf = Buffer.from('test file content');
    await test.step('[셋업] 서비스 이용 문의 페이지 이동 후 파일 업로드', async () => {
      await inquiry.navigate();
      await inquiry.uploadFileByBuffer('test.txt', 'text/plain', buf);
    });
    await test.step('[검증] 업로드된 파일명 노출 확인', async () => {
      await inquiry.verifyFileUploaded('test.txt');
    });
  });

  test('파일 업로드 — 1개 초과 업로드 시 알럿', { annotation: tcStep(8) }, async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    const buf = Buffer.from('test file content');
    await test.step('[셋업] 첫 번째 파일 업로드', async () => {
      await inquiry.navigate();
      await inquiry.uploadFileByBuffer('test1.txt', 'text/plain', buf);
      await inquiry.verifyFileUploaded('test1.txt');
    });
    await test.step('[셋업] 두 번째 파일 업로드 시도', async () => {
      await inquiry.uploadFileByBuffer('test2.txt', 'text/plain', buf);
    });
    await test.step('[검증] 파일 1개 초과 업로드 알럿 확인', async () => {
      await inquiry.verifyMaxFileCountAlert();
      await inquiry.closeAlert();
    });
  });

  test('파일 업로드 — 파일 삭제 후 재업로드', { annotation: tcStep(8) }, async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    const buf = Buffer.from('test file content');
    await test.step('[셋업] 파일 업로드 후 삭제', async () => {
      await inquiry.navigate();
      await inquiry.uploadFileByBuffer('test.txt', 'text/plain', buf);
      await inquiry.verifyFileUploaded('test.txt');
      await inquiry.deleteUploadedFile();
    });
    await test.step('[셋업] 삭제 후 재업로드', async () => {
      // 재업로드
      await inquiry.uploadFileByBuffer('reupload.txt', 'text/plain', buf);
    });
    await test.step('[검증] 재업로드된 파일명 노출 확인', async () => {
      await inquiry.verifyFileUploaded('reupload.txt');
    });
  });

  // 업로드 영역 구조: .file-upload-group > .file-name > .file-item > p(파일명) + label#FileUploadButton > input#file-upload
  test('파일 업로드 — 허용 확장자(.jpg) 첨부 시 파일명 노출', { annotation: tcStep(9) }, async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    const fileInput = page.locator('input#file-upload');
    const uploadGroup = page.locator('.file-upload-group');
    const fileName = 'qa-allowed-image.jpg';
    // 1x1 JPEG
    const jpg = Buffer.from(
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
      'base64',
    );
    const dialogs: string[] = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });

    await test.step('[셋업] 서비스 이용 문의 페이지 이동', async () => {
      await inquiry.navigate();
      await expect(fileInput, '[UI/셀렉터] [파일 불러오기] 파일 input(#file-upload)을 찾을 수 없음').toHaveCount(1);
      console.log(`✅ [파일 불러오기] accept 속성: "${await fileInput.getAttribute('accept')}"`);
    });

    await test.step('[셋업] .jpg 파일 선택', async () => {
      await fileInput.setInputFiles({ name: fileName, mimeType: 'image/jpeg', buffer: jpg });
      console.log(`📎 파일 선택: ${fileName} (image/jpeg, ${jpg.length} bytes)`);
    });

    await test.step('[검증] 파일명이 [파일 불러오기] 버튼 상단에 표시됨', async () => {
      const shown = uploadGroup.locator('.file-name .file-item p');
      await expect(shown, `[앱오류] 허용 확장자(.jpg) 파일 첨부 후 파일명 "${fileName}" 미노출`).toHaveText(fileName, { timeout: 5000 });
      const modalVisible = await page.locator('.modal').isVisible().catch(() => false);
      const modalText = modalVisible ? ((await page.locator('.modal .modal-body').textContent()) ?? '').trim() : '';
      console.log(`✅ 표시된 파일명: "${(await shown.textContent())?.trim()}"`);
      console.log(`✅ 오류 알럿: ${modalVisible ? `"${modalText}"` : '없음'}${dialogs.length ? `, 브라우저 dialog: ${dialogs.join(' / ')}` : ''}`);
      expect(modalVisible, `[앱오류] 허용 확장자(.jpg) 첨부 시 오류 알럿이 표시됨: "${modalText}"`).toBe(false);
      await captureEvidence(uploadGroup, '.jpg 파일 첨부 후 업로드 영역');
    });
  });

  test('파일 업로드 — 허용되지 않는 확장자(.exe) 첨부 거부', { annotation: tcStep(10) }, async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    const fileInput = page.locator('input#file-upload');
    const uploadGroup = page.locator('.file-upload-group');
    const fileName = 'qa-not-allowed.exe';
    const dialogs: string[] = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });

    await test.step('[셋업] 서비스 이용 문의 페이지 이동', async () => {
      await inquiry.navigate();
      await expect(fileInput, '[UI/셀렉터] [파일 불러오기] 파일 input(#file-upload)을 찾을 수 없음').toHaveCount(1);
      console.log(`✅ [파일 불러오기] accept 속성: "${await fileInput.getAttribute('accept')}"`);
    });

    await test.step('[셋업] .exe 파일 선택', async () => {
      await fileInput.setInputFiles({ name: fileName, mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ dummy exe for QA') });
      console.log(`📎 파일 선택: ${fileName} (application/x-msdownload, 더미)`);
    });

    await test.step('[검증] .exe 파일이 첨부되지 않음', async () => {
      const modal = page.locator('.modal');
      const modalVisible = await modal.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false);
      const modalText = modalVisible ? ((await modal.locator('.modal-body').textContent()) ?? '').trim() : '';
      await page.waitForTimeout(300);
      const shownNames = (await uploadGroup.locator('.file-name .file-item p').allTextContents()).map(t => t.trim());
      const attached = shownNames.some(n => n.includes(fileName));

      console.log(`✅ 오류 알럿: ${modalVisible ? `"${modalText}"` : '없음'}${dialogs.length ? `, 브라우저 dialog: ${dialogs.join(' / ')}` : ''}`);
      console.log(`✅ 업로드 영역에 표시된 파일명: ${shownNames.length ? shownNames.map(n => `"${n}"`).join(', ') : '없음'}`);
      console.log(`✅ 실제 동작: ${attached ? '.exe 파일이 그대로 첨부됨' : '.exe 파일 첨부 거부됨 (파일명 미표시)'}`);

      if (modalVisible) await captureEvidence(page, '.exe 파일 선택 시 알럿');

      expect(attached, `[앱오류] 허용되지 않는 확장자(.exe)가 첨부됨 — 표시된 파일명: ${shownNames.join(', ')}`).toBe(false);

      if (modalVisible) {
        await modal.getByRole('button', { name: '확인' }).click({ force: true });
        await expect(modal, '[앱오류] 알럿 [확인] 클릭 후 알럿이 닫히지 않음').toBeHidden({ timeout: 3000 });
        console.log('🖱️ 알럿 [확인] 클릭 → 닫힘');
      }
      await captureEvidence(uploadGroup, '.exe 파일 선택 후 업로드 영역 (첨부되지 않음)');
    });
  });

  test('개인정보 동의 체크 확인', { annotation: tcStep(11) }, async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    await test.step('[셋업] 서비스 이용 문의 페이지 이동 후 개인정보 동의 체크', async () => {
      await inquiry.navigate();
      await inquiry.checkPrivacyConsent();
    });
    await test.step('[검증] 개인정보 동의 체크 상태 확인', async () => {
      await inquiry.verifyPrivacyConsentChecked();
    });
  });

  // 실제 등록이 발생하므로 주석처리 — textfield/유효성 테스트만 운영
  // test('문의 접수 완료 — 접수일시 및 메인 이동', async ({ page }) => {
  //   const inquiry = new CsInquiryPage(page);
  //   await test.step('[셋업] 모든 필수 항목 입력 후 제출', async () => {
  //     await inquiry.navigate();
  //     await inquiry.fillAllRequiredFields({
  //       name: '테스트 사용자',
  //       affiliation: '테스트 회사',
  //       inquiryType: '기타 문의',
  //       email: 'test@example.com',
  //       phone: '010-1234-5678',
  //       title: '자동화 테스트 문의',
  //       content: 'Playwright 자동화 테스트로 작성된 문의입니다.',
  //     });
  //     await inquiry.clickSubmitButton();
  //     const confirmAlert = page.getByRole('button', { name: '확인' }).first();
  //     if (await confirmAlert.isVisible({ timeout: 3000 }).catch(() => false)) {
  //       await inquiry.clickAlertConfirm();
  //     }
  //   });
  //   await test.step('[검증] 문의 접수 완료 페이지 확인', async () => {
  //     await inquiry.verifySubmitSuccessPage();
  //   });
  //   await test.step('[검증] 접수 일시 노출 확인', async () => {
  //     await inquiry.verifyReceiptDatetime();
  //   });
  //   await test.step('[셋업] 메인으로 이동 버튼 클릭', async () => {
  //     await inquiry.clickGoToMain();
  //   });
  // });
});
