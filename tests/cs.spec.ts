import { test, expect } from '@playwright/test';
import { CsPage, CS_TABS } from './pages/CsPage';
import { CsNoticePage, NOTICE_CATEGORIES, NOTICE_SORT_OPTIONS } from './pages/CsNoticePage';
import { CsEventPage, EVENT_CATEGORIES } from './pages/CsEventPage';
import { CsFaqPage, FAQ_CATEGORIES } from './pages/CsFaqPage';
import { CsInquiryPage, INQUIRY_TYPES } from './pages/CsInquiryPage';

// ─────────────────────────────────────────────────────────────────────────────
// T1631 고객센터 기본
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T1631 고객센터 기본', () => {
  test('헤더 고객센터 클릭 시 고객센터 페이지로 이동', async ({ page }) => {
    const cs = new CsPage(page);
    await cs.navigateViaHeader();
    await cs.verifyUrl();
  });

  test('고객센터 URL 확인', async ({ page }) => {
    const cs = new CsPage(page);
    await cs.navigate();
    await cs.verifyUrl();
  });

  test('고객센터 탭 목록 4개 노출 확인', async ({ page }) => {
    const cs = new CsPage(page);
    await cs.navigate();
    await cs.verifyTabsExist();
  });

  test('고객센터 기본 탭은 공지사항', async ({ page }) => {
    const cs = new CsPage(page);
    await cs.navigate();
    await cs.verifyDefaultTabIsNotice();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T411 공지사항
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T411 공지사항', () => {
  test('공지사항 화면 구성 확인 (카테고리, 검색, 정렬, 게시물)', async ({ page }) => {
    const notice = new CsNoticePage(page);
    await notice.navigate();
    await notice.verifyUrl();
    await notice.verifyCategoriesExist();
    await notice.verifySearchPlaceholder();
    await notice.verifyDefaultSortOption();
    await notice.verifyPostsStructure();
  });

  test('공지사항 정렬 드롭다운 옵션 (최신순/과거순/조회순)', async ({ page }) => {
    const notice = new CsNoticePage(page);
    await notice.navigate();
    await notice.verifySortDropdownOptions();
  });

  test('공지사항 정렬 선택 동작', async ({ page }) => {
    const notice = new CsNoticePage(page);
    await notice.navigate();
    await notice.selectSortOption('과거순');
    await notice.verifyPostsStructure();
  });

  test('공지사항 빈 검색어 알럿 확인', async ({ page }) => {
    const notice = new CsNoticePage(page);
    await notice.navigate();
    await notice.verifyEmptySearchAlert();
    await notice.closeAlert();
  });

  test('공지사항 키워드 검색 후 검색창 유지', async ({ page }) => {
    const notice = new CsNoticePage(page);
    await notice.navigate();
    await notice.searchByKeyword('공지');
    await notice.verifySearchKeywordRetained('공지');
  });

  test('공지사항 버튼/Enter 검색 결과 동일 확인', async ({ page }) => {
    const notice = new CsNoticePage(page);
    await notice.navigate();
    await notice.verifySearchByButton();
  });

  test('공지사항 카테고리 필터링', async ({ page }) => {
    const notice = new CsNoticePage(page);
    await notice.navigate();
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

  test('공지사항 카테고리 초기화', async ({ page }) => {
    const notice = new CsNoticePage(page);
    await notice.navigate();
    await notice.clickCategory('공지');
    await notice.verifyCategoryReset();
  });

  test('공지사항 XSS 방어', async ({ page }) => {
    const notice = new CsNoticePage(page);
    await notice.navigate();
    await notice.verifyXssDefense();
  });

  test('공지사항 SQL Injection 방어', async ({ page }) => {
    const notice = new CsNoticePage(page);
    await notice.navigate();
    await notice.verifySqlInjectionDefense();
  });

  test('공지사항 페이지당 게시물 수 확인 (최대 10개)', async ({ page }) => {
    const notice = new CsNoticePage(page);
    await notice.navigate();
    await notice.verifyItemsPerPage();
    await notice.verifyPaginationExists();
  });

  test('공지사항 상세 페이지 — 본문/날짜 확인', async ({ page }) => {
    const notice = new CsNoticePage(page);
    await notice.navigate();
    await notice.clickFirstPost();
    await notice.verifyDetailPageContent();
    await notice.verifyNoAttachmentMessage();
    await notice.verifyNoPrevNextPost();
    await notice.verifyHtmlEntitiesRendered();
  });

  test('공지사항 상세 → 목록으로 복귀', async ({ page }) => {
    const notice = new CsNoticePage(page);
    await notice.navigate();
    await notice.clickFirstPost();
    await notice.clickBackToList();
    await notice.verifyUrl();
  });

  test('공지사항 탭 이동 후 복귀 시 초기화', async ({ page }) => {
    const cs = new CsPage(page);
    const notice = new CsNoticePage(page);
    await notice.navigate();
    await notice.searchByKeyword('테스트');
    // 이벤트 탭 이동
    await cs.clickTab('이벤트');
    // 공지사항 탭으로 복귀
    await cs.clickTab('공지사항');
    await notice.verifyPageResetAfterTabSwitch();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T412 이벤트
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T412 이벤트', () => {
  test('이벤트 탭 이동 및 URL 확인', async ({ page }) => {
    const cs = new CsPage(page);
    const ev = new CsEventPage(page);
    await cs.navigate();
    await cs.clickTab('이벤트');
    await ev.verifyUrl();
    await ev.verifyTabActiveStyle();
  });

  test('이벤트 카테고리 (진행/예정/종료) 노출 확인', async ({ page }) => {
    const ev = new CsEventPage(page);
    await ev.navigate();
    await ev.verifyCategoriesExist();
  });

  test('이벤트 기본 카테고리 "진행" 선택 확인', async ({ page }) => {
    const ev = new CsEventPage(page);
    await ev.navigate();
    await ev.verifyDefaultCategoryIsProgress();
  });

  test('이벤트 카테고리 클릭 및 목록/빈 상태 확인', async ({ page }) => {
    const ev = new CsEventPage(page);
    await ev.navigate();
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

  test('이벤트 상세 — 제목/이미지/안내문구 확인', async ({ page }) => {
    const ev = new CsEventPage(page);
    await ev.navigate();
    await ev.verifyDefaultCategoryIsProgress();
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

// ─────────────────────────────────────────────────────────────────────────────
// T413 자주 묻는 질문
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T413 자주 묻는 질문', () => {
  test('FAQ 탭 이동 및 URL 확인', async ({ page }) => {
    const cs = new CsPage(page);
    const faq = new CsFaqPage(page);
    await cs.navigate();
    await cs.clickTab('자주 묻는 질문');
    await faq.verifyUrl();
    await faq.verifyTabActiveStyle();
  });

  test('FAQ 카테고리 노출 확인', async ({ page }) => {
    const faq = new CsFaqPage(page);
    await faq.navigate();
    await faq.verifyCategoriesExist();
  });

  test('FAQ 카테고리별 클릭 및 게시물 확인', async ({ page }) => {
    const faq = new CsFaqPage(page);
    await faq.navigate();
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

  test('FAQ 검색 placeholder 확인', async ({ page }) => {
    const faq = new CsFaqPage(page);
    await faq.navigate();
    await faq.verifySearchPlaceholder();
  });

  test('FAQ 빈 검색어 알럿 확인', async ({ page }) => {
    const faq = new CsFaqPage(page);
    await faq.navigate();
    await faq.verifyEmptySearchAlert();
    await faq.closeAlert();
  });

  test('FAQ 키워드 검색 결과 확인', async ({ page }) => {
    const faq = new CsFaqPage(page);
    await faq.navigate();
    await faq.searchFaq('서비스');
    const count = await page.locator(
      '[class*="faq-item"], [class*="faqItem"], details, [class*="accordion-item"]'
    ).count();
    if (count > 0) {
      await faq.verifySearchResultsShown('서비스');
    } else {
      await faq.verifyNoSearchResults();
    }
  });

  test('FAQ 아코디언 — 항목 클릭 시 펼침', async ({ page }) => {
    const faq = new CsFaqPage(page);
    await faq.navigate();
    await faq.verifyFaqItemsExist();
    await faq.clickFirstFaqItem();
    await faq.verifyFaqItemExpanded();
  });

  test('FAQ 아코디언 — 같은 항목 재클릭 시 닫힘', async ({ page }) => {
    const faq = new CsFaqPage(page);
    await faq.navigate();
    await faq.verifyFaqItemsExist();
    await faq.clickFirstFaqItem();
    await faq.verifyFaqItemExpanded();
    await faq.clickFirstFaqItemAgain();
    await faq.verifyFaqItemCollapsed();
  });

  test('FAQ 아코디언 — 다른 항목 클릭 시 기존 항목 닫힘', async ({ page }) => {
    const faq = new CsFaqPage(page);
    await faq.navigate();
    await faq.verifyFaqItemsExist();
    await faq.clickFirstFaqItem();
    await faq.verifyFaqItemExpanded();
    await faq.clickSecondFaqItem();
    await faq.verifyOnlyOneItemExpanded();
  });

  test('FAQ 페이지네이션 확인', async ({ page }) => {
    const faq = new CsFaqPage(page);
    await faq.navigate();
    await faq.verifyPaginationExists();
  });

  test('FAQ 탭 이동 후 복귀 시 초기화', async ({ page }) => {
    const cs = new CsPage(page);
    const faq = new CsFaqPage(page);
    await cs.navigate();
    await cs.clickTab('자주 묻는 질문');
    await faq.searchFaq('테스트');
    // 이벤트 탭으로 이동 후 복귀
    await cs.clickTab('이벤트');
    await cs.clickTab('자주 묻는 질문');
    await faq.verifyPageResetAfterTabSwitch();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T414 서비스 이용 문의
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T414 서비스 이용 문의', () => {
  test('서비스 이용 문의 탭 이동 및 URL 확인', async ({ page }) => {
    const cs = new CsPage(page);
    const inquiry = new CsInquiryPage(page);
    await cs.navigate();
    await cs.clickTab('서비스 이용 문의');
    await inquiry.verifyUrl();
    await inquiry.verifyTabActiveStyle();
  });

  test('서비스 이용 문의 화면 구성 — placeholder 확인', async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    await inquiry.navigate();
    await inquiry.verifyNamePlaceholder();
    await inquiry.verifyAffiliationPlaceholder();
    await inquiry.verifyInquiryTypeDropdownPlaceholder();
    await inquiry.verifyEmailPlaceholder();
    await inquiry.verifyPhonePlaceholder();
    await inquiry.verifyTitlePlaceholder();
    await inquiry.verifyContentPlaceholder();
  });

  test('서비스 이용 문의 탭 이동 후 복귀 시 초기화', async ({ page }) => {
    const cs = new CsPage(page);
    const inquiry = new CsInquiryPage(page);
    await cs.navigate();
    await cs.clickTab('서비스 이용 문의');
    await inquiry.fillName('테스트');
    // 다른 탭 이동 후 복귀
    await cs.clickTab('이벤트');
    await cs.clickTab('서비스 이용 문의');
    await inquiry.verifyFieldsReset();
  });

  test('이름 미입력 → 알럿 "이름을 입력해 주세요."', async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    await inquiry.navigate();
    await inquiry.clickSubmitButton();
    await inquiry.verifyAlert('이름을 입력해 주세요');
    await inquiry.closeAlert();
  });

  test('소속 미입력 → 알럿 "소속을 입력해 주세요."', async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    await inquiry.navigate();
    await inquiry.fillName('테스트 사용자');
    await inquiry.clickSubmitButton();
    await inquiry.verifyAlert('소속을 입력해 주세요');
    await inquiry.closeAlert();
  });

  test('문의 종류 미선택 → 알럿 "문의 종류를 선택해 주세요."', async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    await inquiry.navigate();
    await inquiry.fillName('테스트 사용자');
    await inquiry.fillAffiliation('테스트 회사');
    await inquiry.clickSubmitButton();
    await inquiry.verifyAlert('문의 종류를 선택해 주세요');
    await inquiry.closeAlert();
  });

  test('문의 종류 드롭다운 항목 6개 확인', async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    await inquiry.navigate();
    await inquiry.verifyInquiryTypeOptions();
  });

  test('이메일 미입력 → 알럿 "E-mail 주소를 입력해 주세요."', async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    await inquiry.navigate();
    await inquiry.fillName('테스트 사용자');
    await inquiry.fillAffiliation('테스트 회사');
    await inquiry.selectInquiryType('기타 문의');
    await inquiry.clickSubmitButton();
    await inquiry.verifyAlert(/E-mail 주소를 입력해 주세요|이메일.+입력해 주세요/);
    await inquiry.closeAlert();
  });

  test('이메일 잘못된 형식 → 필드 하단 오류 메시지', async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    await inquiry.navigate();
    await inquiry.fillName('테스트 사용자');
    await inquiry.fillAffiliation('테스트 회사');
    await inquiry.selectInquiryType('기타 문의');
    await inquiry.fillEmail('invalid-email');
    await inquiry.clickSubmitButton();
    await inquiry.verifyEmailValidationError();
  });

  test('전화번호 미입력 → 알럿 "전화번호를 입력해 주세요."', async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    await inquiry.navigate();
    await inquiry.fillName('테스트 사용자');
    await inquiry.fillAffiliation('테스트 회사');
    await inquiry.selectInquiryType('기타 문의');
    await inquiry.fillEmail('test@example.com');
    await inquiry.clickSubmitButton();
    await inquiry.verifyAlert(/전화번호를 입력해 주세요/);
    await inquiry.closeAlert();
  });

  test('전화번호 잘못된 형식 → 필드 하단 오류 메시지', async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    await inquiry.navigate();
    await inquiry.fillName('테스트 사용자');
    await inquiry.fillAffiliation('테스트 회사');
    await inquiry.selectInquiryType('기타 문의');
    await inquiry.fillEmail('test@example.com');
    await inquiry.fillPhone('1234');
    await inquiry.clickSubmitButton();
    await inquiry.verifyPhoneValidationError();
  });

  test('제목 미입력 → 알럿 "제목을 입력해 주세요."', async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    await inquiry.navigate();
    await inquiry.fillName('테스트 사용자');
    await inquiry.fillAffiliation('테스트 회사');
    await inquiry.selectInquiryType('기타 문의');
    await inquiry.fillEmail('test@example.com');
    await inquiry.fillPhone('010-1234-5678');
    await inquiry.clickSubmitButton();
    await inquiry.verifyAlert('제목을 입력해 주세요');
    await inquiry.closeAlert();
  });

  test('내용 미입력 → 알럿 "이용 문의 내용이 작성되지 않았습니다."', async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    await inquiry.navigate();
    await inquiry.fillName('테스트 사용자');
    await inquiry.fillAffiliation('테스트 회사');
    await inquiry.selectInquiryType('기타 문의');
    await inquiry.fillEmail('test@example.com');
    await inquiry.fillPhone('010-1234-5678');
    await inquiry.fillTitle('테스트 제목');
    await inquiry.clickSubmitButton();
    await inquiry.verifyAlert('이용 문의 내용이 작성되지 않았습니다');
    await inquiry.closeAlert();
  });

  test('개인정보 미동의 → 알럿 확인', async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    await inquiry.navigate();
    await inquiry.fillName('테스트 사용자');
    await inquiry.fillAffiliation('테스트 회사');
    await inquiry.selectInquiryType('기타 문의');
    await inquiry.fillEmail('test@example.com');
    await inquiry.fillPhone('010-1234-5678');
    await inquiry.fillTitle('테스트 제목');
    await inquiry.fillContent('테스트 내용입니다.');
    await inquiry.clickSubmitButton();
    await inquiry.verifyAlert(/개인정보 수집.*동의/);
    await inquiry.closeAlert();
  });

  test('파일 업로드 — 파일명 노출 확인', async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    await inquiry.navigate();
    const buf = Buffer.from('test file content');
    await inquiry.uploadFileByBuffer('test.txt', 'text/plain', buf);
    await inquiry.verifyFileUploaded('test.txt');
  });

  test('파일 업로드 — 1개 초과 업로드 시 알럿', async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    await inquiry.navigate();
    const buf = Buffer.from('test file content');
    await inquiry.uploadFileByBuffer('test1.txt', 'text/plain', buf);
    await inquiry.verifyFileUploaded('test1.txt');
    await inquiry.uploadFileByBuffer('test2.txt', 'text/plain', buf);
    await inquiry.verifyMaxFileCountAlert();
    await inquiry.closeAlert();
  });

  test('파일 업로드 — 파일 삭제 후 재업로드', async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    await inquiry.navigate();
    const buf = Buffer.from('test file content');
    await inquiry.uploadFileByBuffer('test.txt', 'text/plain', buf);
    await inquiry.verifyFileUploaded('test.txt');
    await inquiry.deleteUploadedFile();
    // 재업로드
    await inquiry.uploadFileByBuffer('reupload.txt', 'text/plain', buf);
    await inquiry.verifyFileUploaded('reupload.txt');
  });

  test('개인정보 동의 체크 확인', async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    await inquiry.navigate();
    await inquiry.checkPrivacyConsent();
    await inquiry.verifyPrivacyConsentChecked();
  });

  test('문의 접수 완료 — 접수일시 및 메인 이동', async ({ page }) => {
    const inquiry = new CsInquiryPage(page);
    await inquiry.navigate();
    await inquiry.fillAllRequiredFields({
      name: '테스트 사용자',
      affiliation: '테스트 회사',
      inquiryType: '기타 문의',
      email: 'test@example.com',
      phone: '010-1234-5678',
      title: '자동화 테스트 문의',
      content: 'Playwright 자동화 테스트로 작성된 문의입니다.',
    });
    await inquiry.clickSubmitButton();
    // 접수 확인 알럿이 나올 수 있음
    const confirmAlert = page.getByRole('button', { name: '확인' }).first();
    if (await confirmAlert.isVisible({ timeout: 3000 }).catch(() => false)) {
      await inquiry.clickAlertConfirm();
    }
    await inquiry.verifySubmitSuccessPage();
    await inquiry.verifyReceiptDatetime();
    await inquiry.clickGoToMain();
  });
});
