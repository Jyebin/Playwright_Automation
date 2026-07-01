import { test, expect } from '@playwright/test';
import { MyPage, MYPAGE_TABS } from './pages/MyPage';
import { MyPageEditPage } from './pages/MyPageEditPage';
import { MyPagePasswordPage } from './pages/MyPagePasswordPage';
import { MyPagePurchasePage } from './pages/MyPagePurchasePage';

const PASSWORD = process.env.TEST_PASSWORD ?? '';
const WRONG_PASSWORD = 'WrongPass123!';
const VALID_NEW_PASSWORD = 'NewPass1!';

// ─────────────────────────────────────────────────────────────────────────────
// T425 마이페이지 프로필
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T425 마이페이지 프로필', () => {
  test('헤더 [마이페이지] 클릭 시 마이페이지 이동', async ({ page }) => {
    const myPage = new MyPage(page);
    await test.step('[셋업] 헤더를 통해 마이페이지 이동', async () => {
      await myPage.navigateViaHeader();
    });
    await test.step('[검증] 마이페이지 URL 확인', async () => {
      await myPage.verifyUrl();
    });
  });

  test('마이페이지 URL 확인', async ({ page }) => {
    const myPage = new MyPage(page);
    await test.step('[셋업] 마이페이지 이동', async () => {
      await myPage.navigate();
    });
    await test.step('[검증] 마이페이지 URL 확인', async () => {
      await myPage.verifyUrl();
    });
  });

  test('마이페이지 탭 목록 4개 확인 (실습 대시보드/디지털 배지/프로필/구매내역)', async ({ page }) => {
    const myPage = new MyPage(page);
    await test.step('[셋업] 마이페이지 이동', async () => {
      await myPage.navigate();
    });
    await test.step('[검증] 탭 목록 4개 노출 확인', async () => {
      await myPage.verifyTabsExist();
    });
  });

  test('기본 탭 [프로필] 선택 확인', async ({ page }) => {
    const myPage = new MyPage(page);
    await test.step('[셋업] 마이페이지 이동', async () => {
      await myPage.navigate();
    });
    await test.step('[검증] 기본 탭 프로필 선택 확인', async () => {
      await myPage.verifyDefaultTabIsProfile();
    });
  });

  test('프로필 기본 정보 항목 확인 (계정/이름/휴대폰/E-mail/마케팅)', async ({ page }) => {
    const myPage = new MyPage(page);
    await test.step('[셋업] 마이페이지 이동', async () => {
      await myPage.navigate();
    });
    await test.step('[검증] 프로필 기본 정보 항목 노출 확인', async () => {
      await myPage.verifyProfileInfoFieldsVisible();
      await myPage.verifyAccountEmailDisplayed();
      await myPage.verifyMarketingCheckboxesVisible();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T426 프로필 수정
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T426 프로필 수정', () => {
  test('[프로필 수정] 버튼 클릭 → 비밀번호 확인 페이지 진입', async ({ page }) => {
    const myPage = new MyPage(page);
    const editPage = new MyPageEditPage(page);
    await test.step('[셋업] 마이페이지 이동 및 프로필 수정 버튼 클릭', async () => {
      await myPage.navigate();
      await myPage.clickProfileEditButton();
    });
    await test.step('[검증] 비밀번호 확인 페이지 진입 확인', async () => {
      await editPage.verifyPasswordConfirmPageVisible();
    });
  });

  test('비밀번호 placeholder "비밀번호를 입력해 주세요." 확인', async ({ page }) => {
    const myPage = new MyPage(page);
    const editPage = new MyPageEditPage(page);
    await test.step('[셋업] 마이페이지 이동 및 프로필 수정 버튼 클릭', async () => {
      await myPage.navigate();
      await myPage.clickProfileEditButton();
    });
    await test.step('[검증] 비밀번호 placeholder 확인', async () => {
      await editPage.verifyPasswordPlaceholder();
    });
  });

  test('비밀번호 미입력 → "비밀번호가 입력되지 않았습니다." 알럿', async ({ page }) => {
    const myPage = new MyPage(page);
    const editPage = new MyPageEditPage(page);
    await test.step('[셋업] 마이페이지 이동 및 프로필 수정 버튼 클릭 후 확인 버튼 클릭', async () => {
      await myPage.navigate();
      await myPage.clickProfileEditButton();
      await editPage.clickConfirmButton();
    });
    await test.step('[검증] "비밀번호 입력 안됨" 알럿 노출', async () => {
      await editPage.verifyAlert('비밀번호가 입력되지 않았습니다');
      await editPage.closeAlert();
    });
  });

  test('비밀번호 보이기/숨기기 토글 동작 확인', async ({ page }) => {
    const myPage = new MyPage(page);
    const editPage = new MyPageEditPage(page);
    await test.step('[셋업] 마이페이지 이동 및 프로필 수정 버튼 클릭', async () => {
      await myPage.navigate();
      await myPage.clickProfileEditButton();
      await editPage.enterPassword('TestPassword1!');
    });
    await test.step('[검증] 비밀번호 기본 타입 password 확인', async () => {
      await editPage.verifyPasswordTypeIsPassword();
    });
    await test.step('[셋업] 비밀번호 보이기 토글', async () => {
      await editPage.togglePasswordVisibility();
    });
    await test.step('[검증] 비밀번호 타입 text 전환 확인', async () => {
      await editPage.verifyPasswordTypeIsText();
    });
    await test.step('[셋업] 비밀번호 숨기기 토글', async () => {
      await editPage.togglePasswordVisibility();
    });
    await test.step('[검증] 비밀번호 타입 password 복원 확인', async () => {
      await editPage.verifyPasswordTypeIsPassword();
    });
  });

  test('틀린 비밀번호 → "비밀번호가 올바르지 않습니다." 알럿', async ({ page }) => {
    const myPage = new MyPage(page);
    const editPage = new MyPageEditPage(page);
    await test.step('[셋업] 마이페이지 이동, 틀린 비밀번호 입력 후 확인 버튼 클릭', async () => {
      await myPage.navigate();
      await myPage.clickProfileEditButton();
      await editPage.enterPassword(WRONG_PASSWORD);
      await editPage.clickConfirmButton();
    });
    await test.step('[검증] "비밀번호 올바르지 않음" 알럿 노출', async () => {
      await editPage.verifyAlert('비밀번호가 올바르지 않습니다');
      await editPage.closeAlert();
    });
  });

  test('올바른 비밀번호 입력 → 프로필 수정 폼 이동', async ({ page }) => {
    test.skip(!PASSWORD, 'TEST_PASSWORD 환경변수 미설정');
    const myPage = new MyPage(page);
    const editPage = new MyPageEditPage(page);
    await test.step('[셋업] 마이페이지 이동, 올바른 비밀번호 입력 후 확인 버튼 클릭', async () => {
      await myPage.navigate();
      await myPage.clickProfileEditButton();
      await editPage.enterPassword(PASSWORD);
      await editPage.clickConfirmButton();
    });
    await test.step('[검증] 프로필 수정 폼 이동 확인', async () => {
      await editPage.verifyProfileEditFormVisible();
    });
  });

  test('수정 가능/불가능 필드 확인', async ({ page }) => {
    test.skip(!PASSWORD, 'TEST_PASSWORD 환경변수 미설정');
    const myPage = new MyPage(page);
    const editPage = new MyPageEditPage(page);
    await test.step('[셋업] 프로필 수정 폼 진입', async () => {
      await myPage.navigate();
      await myPage.clickProfileEditButton();
      await editPage.enterPassword(PASSWORD);
      await editPage.clickConfirmButton();
    });
    await test.step('[검증] 수정 가능/불가능 필드 확인', async () => {
      await editPage.verifyProfileEditFormVisible();
      await editPage.verifyReadOnlyFieldsDisabled();
      await editPage.verifyEmailFieldEditable();
    });
  });

  test('E-mail placeholder "이메일을 입력해 주세요." 확인', async ({ page }) => {
    test.skip(!PASSWORD, 'TEST_PASSWORD 환경변수 미설정');
    const myPage = new MyPage(page);
    const editPage = new MyPageEditPage(page);
    await test.step('[셋업] 프로필 수정 폼 진입', async () => {
      await myPage.navigate();
      await myPage.clickProfileEditButton();
      await editPage.enterPassword(PASSWORD);
      await editPage.clickConfirmButton();
    });
    await test.step('[검증] 이메일 placeholder 확인', async () => {
      await editPage.verifyProfileEditFormVisible();
      await editPage.verifyEmailPlaceholder();
    });
  });

  test('E-mail 수정 후 [수정] → "프로필 수정이 완료되었습니다." 알럿 → 마이페이지 복귀', async ({ page }) => {
    test.skip(!PASSWORD, 'TEST_PASSWORD 환경변수 미설정');
    const myPage = new MyPage(page);
    const editPage = new MyPageEditPage(page);
    await test.step('[셋업] 프로필 수정 폼 진입 및 이메일 재입력 후 저장', async () => {
      await myPage.navigate();
      await myPage.clickProfileEditButton();
      await editPage.enterPassword(PASSWORD);
      await editPage.clickConfirmButton();
      await editPage.verifyProfileEditFormVisible();
      // 현재 이메일 그대로 재입력 (non-destructive)
      const currentEmail = await editPage.getCurrentEmailValue();
      if (currentEmail) {
        await editPage.updateEmail(currentEmail);
      }
      await editPage.clickSaveButton();
    });
    await test.step('[검증] 저장 성공 알럿 노출 및 마이페이지 복귀 확인', async () => {
      await editPage.verifySaveSuccess();
      await editPage.closeAlert();
      await editPage.verifyReturnedToMyPage();
    });
  });

  test('마케팅 수신 체크박스 토글 후 저장 확인', async ({ page }) => {
    test.skip(!PASSWORD, 'TEST_PASSWORD 환경변수 미설정');
    const myPage = new MyPage(page);
    const editPage = new MyPageEditPage(page);
    await test.step('[셋업] 프로필 수정 폼 진입 및 마케팅 체크박스 토글 후 저장', async () => {
      await myPage.navigate();
      await myPage.clickProfileEditButton();
      await editPage.enterPassword(PASSWORD);
      await editPage.clickConfirmButton();
      await editPage.verifyProfileEditFormVisible();
      await editPage.verifyMarketingCheckboxesExist();
      // 토글 후 이메일도 재입력하여 저장 성공 메시지가 반드시 트리거되도록 함
      await editPage.toggleMarketingCheckbox(0);
      const email1 = await editPage.getCurrentEmailValue();
      if (email1) await editPage.updateEmail(email1);
      await editPage.clickSaveButton();
    });
    await test.step('[검증] 저장 성공 알럿 노출 확인', async () => {
      await editPage.verifySaveSuccess();
      await editPage.closeAlert();
    });
    await test.step('[셋업] 체크박스 원상 복원 및 저장', async () => {
      // 복원
      await myPage.navigate();
      await myPage.clickProfileEditButton();
      await editPage.enterPassword(PASSWORD);
      await editPage.clickConfirmButton();
      await editPage.verifyProfileEditFormVisible();
      await editPage.toggleMarketingCheckbox(0);
      const email2 = await editPage.getCurrentEmailValue();
      if (email2) await editPage.updateEmail(email2);
      await editPage.clickSaveButton();
    });
    await test.step('[검증] 복원 저장 성공 알럿 노출 확인', async () => {
      await editPage.verifySaveSuccess();
      await editPage.closeAlert();
    });
  });

  test('[취소] 버튼 → 마이페이지 복귀', async ({ page }) => {
    test.skip(!PASSWORD, 'TEST_PASSWORD 환경변수 미설정');
    const myPage = new MyPage(page);
    const editPage = new MyPageEditPage(page);
    await test.step('[셋업] 프로필 수정 폼 진입 후 취소 버튼 클릭', async () => {
      await myPage.navigate();
      await myPage.clickProfileEditButton();
      await editPage.enterPassword(PASSWORD);
      await editPage.clickConfirmButton();
      await editPage.verifyProfileEditFormVisible();
      await editPage.clickCancelButton();
    });
    await test.step('[검증] 마이페이지 복귀 확인', async () => {
      await editPage.verifyReturnedToMyPage();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T428 비밀번호 변경
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T428 비밀번호 변경', () => {
  test('[비밀번호 변경] 버튼 클릭 → 비밀번호 변경 페이지 이동', async ({ page }) => {
    const myPage = new MyPage(page);
    const pwdPage = new MyPagePasswordPage(page);
    await test.step('[셋업] 마이페이지 이동 및 비밀번호 변경 버튼 클릭', async () => {
      await myPage.navigate();
      await myPage.clickPasswordChangeButton();
    });
    await test.step('[검증] 비밀번호 변경 페이지 이동 확인', async () => {
      await pwdPage.verifyPasswordChangePageVisible();
    });
  });

  test('비밀번호 보이기/숨기기 토글 동작 확인', async ({ page }) => {
    const myPage = new MyPage(page);
    const pwdPage = new MyPagePasswordPage(page);
    await test.step('[셋업] 비밀번호 변경 페이지 진입 및 현재 비밀번호 입력', async () => {
      await myPage.navigate();
      await myPage.clickPasswordChangeButton();
      await pwdPage.verifyPasswordChangePageVisible();
      await pwdPage.fillCurrentPassword('TestPassword1!');
      await pwdPage.togglePasswordVisibility(0);
    });
    await test.step('[검증] 비밀번호 타입 text 전환 확인', async () => {
      await pwdPage.verifyFieldTypeChangedToText(0);
    });
    await test.step('[셋업] 비밀번호 숨기기 토글', async () => {
      await pwdPage.togglePasswordVisibility(0);
    });
    await test.step('[검증] 비밀번호 타입 password 복원 확인', async () => {
      await pwdPage.verifyFieldTypeChangedToPassword();
    });
  });

  test('비밀번호 필드 placeholder 3개 확인 ("비밀번호를 입력해 주세요.")', async ({ page }) => {
    const myPage = new MyPage(page);
    const pwdPage = new MyPagePasswordPage(page);
    await test.step('[셋업] 비밀번호 변경 페이지 진입', async () => {
      await myPage.navigate();
      await myPage.clickPasswordChangeButton();
    });
    await test.step('[검증] 비밀번호 필드 placeholder 3개 확인', async () => {
      await pwdPage.verifyPasswordChangePageVisible();
      await pwdPage.verifyAllPasswordPlaceholders();
    });
  });

  test('비밀번호 조건 안내 문구 확인 (영문/숫자/특수문자 8자 이상)', async ({ page }) => {
    const myPage = new MyPage(page);
    const pwdPage = new MyPagePasswordPage(page);
    await test.step('[셋업] 비밀번호 변경 페이지 진입', async () => {
      await myPage.navigate();
      await myPage.clickPasswordChangeButton();
    });
    await test.step('[검증] 비밀번호 조건 안내 문구 확인', async () => {
      await pwdPage.verifyPasswordChangePageVisible();
      await pwdPage.verifyPasswordRuleText();
    });
  });

  test('현재 비밀번호 미입력 → "현재 사용 중인 비밀번호를 입력해 주세요." 알럿', async ({ page }) => {
    const myPage = new MyPage(page);
    const pwdPage = new MyPagePasswordPage(page);
    await test.step('[셋업] 비밀번호 변경 페이지 진입 후 확인 버튼 클릭', async () => {
      await myPage.navigate();
      await myPage.clickPasswordChangeButton();
      await pwdPage.verifyPasswordChangePageVisible();
      await pwdPage.clickConfirmButton();
    });
    await test.step('[검증] "현재 비밀번호 미입력" 알럿 노출', async () => {
      await pwdPage.verifyAlert('현재 사용 중인 비밀번호를 입력해 주세요');
      await pwdPage.closeAlert();
    });
  });

  test('현재 비밀번호만 입력 → "새 비밀번호 입력칸에 새로 사용하실 비밀번호를 입력해 주세요." 알럿', async ({ page }) => {
    const myPage = new MyPage(page);
    const pwdPage = new MyPagePasswordPage(page);
    await test.step('[셋업] 비밀번호 변경 페이지 진입, 현재 비밀번호만 입력 후 확인 버튼 클릭', async () => {
      await myPage.navigate();
      await myPage.clickPasswordChangeButton();
      await pwdPage.verifyPasswordChangePageVisible();
      await pwdPage.fillCurrentPassword(PASSWORD || 'CurrentPass1!');
      await pwdPage.clickConfirmButton();
    });
    await test.step('[검증] "새 비밀번호 미입력" 알럿 노출', async () => {
      await pwdPage.verifyAlert('새 비밀번호 입력칸에');
      await pwdPage.closeAlert();
    });
  });

  test('현재+새 비밀번호만 입력 → "새 비밀번호 확인 입력칸에..." 알럿', async ({ page }) => {
    const myPage = new MyPage(page);
    const pwdPage = new MyPagePasswordPage(page);
    await test.step('[셋업] 현재+새 비밀번호 입력 후 확인 버튼 클릭', async () => {
      await myPage.navigate();
      await myPage.clickPasswordChangeButton();
      await pwdPage.verifyPasswordChangePageVisible();
      await pwdPage.fillCurrentPassword(PASSWORD || 'CurrentPass1!');
      await pwdPage.fillNewPassword(VALID_NEW_PASSWORD);
      await pwdPage.clickConfirmButton();
    });
    await test.step('[검증] "새 비밀번호 확인 미입력" 알럿 노출', async () => {
      await pwdPage.verifyAlert('새 비밀번호 확인 입력칸에');
      await pwdPage.closeAlert();
    });
  });

  test('새 비밀번호 != 확인 → "새로운 비밀번호가 일치하지 않습니다." 알럿', async ({ page }) => {
    const myPage = new MyPage(page);
    const pwdPage = new MyPagePasswordPage(page);
    await test.step('[셋업] 새 비밀번호와 확인 불일치 입력 후 확인 버튼 클릭', async () => {
      await myPage.navigate();
      await myPage.clickPasswordChangeButton();
      await pwdPage.verifyPasswordChangePageVisible();
      await pwdPage.fillCurrentPassword(PASSWORD || 'CurrentPass1!');
      await pwdPage.fillNewPassword(VALID_NEW_PASSWORD);
      await pwdPage.fillNewPasswordConfirm('DifferentPass1!');
      await pwdPage.clickConfirmButton();
    });
    await test.step('[검증] "새 비밀번호 불일치" 알럿 노출', async () => {
      await pwdPage.verifyAlert('새로운 비밀번호가 일치하지 않습니다');
      await pwdPage.closeAlert();
    });
  });

  test('조건 불충족 비밀번호 → "새로운 비밀번호가 조건에 맞지 않습니다." 알럿', async ({ page }) => {
    const myPage = new MyPage(page);
    const pwdPage = new MyPagePasswordPage(page);
    await test.step('[셋업] 조건 불충족 비밀번호 입력 후 확인 버튼 클릭', async () => {
      await myPage.navigate();
      await myPage.clickPasswordChangeButton();
      await pwdPage.verifyPasswordChangePageVisible();
      await pwdPage.fillCurrentPassword(PASSWORD || 'CurrentPass1!');
      await pwdPage.fillNewPassword('simple');       // 조건 불충족
      await pwdPage.fillNewPasswordConfirm('simple');
      await pwdPage.clickConfirmButton();
    });
    await test.step('[검증] "비밀번호 조건 불충족" 알럿 노출', async () => {
      await pwdPage.verifyAlert('새로운 비밀번호가 조건에 맞지 않습니다');
      await pwdPage.closeAlert();
    });
  });

  test('틀린 현재 비밀번호 + 조건에 맞는 새 비밀번호 → 변경 확인 알럿 → 취소로 실제 변경 방지', async ({ page }) => {
    const myPage = new MyPage(page);
    const pwdPage = new MyPagePasswordPage(page);
    await test.step('[셋업] 틀린 현재 비밀번호 + 조건 충족 새 비밀번호 입력 후 확인 버튼 클릭', async () => {
      await myPage.navigate();
      await myPage.clickPasswordChangeButton();
      await pwdPage.verifyPasswordChangePageVisible();
      await pwdPage.fillCurrentPassword(WRONG_PASSWORD);
      await pwdPage.fillNewPassword(VALID_NEW_PASSWORD);
      await pwdPage.fillNewPasswordConfirm(VALID_NEW_PASSWORD);
      await pwdPage.clickConfirmButton();
    });
    await test.step('[검증] 비밀번호 변경 확인 알럿 노출 및 취소로 변경 방지', async () => {
      // '비밀번호를 변경하시겠습니까?' 확인 알럿
      await pwdPage.verifyChangeConfirmAlert();
      // 취소로 실제 변경 방지
      await pwdPage.clickAlertCancel();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T430 구매내역
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T430 구매내역', () => {
  test('[구매내역] 탭 클릭 → 구매내역 페이지 이동', async ({ page }) => {
    const myPage = new MyPage(page);
    const purchasePage = new MyPagePurchasePage(page);
    await test.step('[셋업] 마이페이지 이동 및 구매내역 탭 클릭', async () => {
      await myPage.navigate();
      await myPage.clickTab('구매내역');
    });
    await test.step('[검증] 구매내역 탭 활성화 확인', async () => {
      await myPage.verifyTabActive('구매내역');
    });
  });

  test('구매내역이 없는 경우 "구매 내역이 없습니다." 문구 확인', async ({ page }) => {
    const purchasePage = new MyPagePurchasePage(page);
    await test.step('[셋업] 구매내역 페이지 이동', async () => {
      await purchasePage.navigate();
    });
    await test.step('[검증] 구매내역 없음 문구 확인', async () => {
      const hasPurchase = await purchasePage.hasPurchaseHistory();
      if (!hasPurchase) {
        await purchasePage.verifyEmptyState();
      } else {
        console.log('ℹ️  구매내역 있는 계정 — empty state 테스트 건너뜀');
      }
    });
  });

  test('상단 [문의하기] 버튼 확인 및 클릭 → /cs/inquiry 이동', async ({ page }) => {
    const purchasePage = new MyPagePurchasePage(page);
    await test.step('[셋업] 구매내역 페이지 이동 및 문의하기 버튼 클릭', async () => {
      await purchasePage.navigate();
      await purchasePage.verifyTopInquiryButtonExists();
      await purchasePage.clickTopInquiryButton();
    });
    await test.step('[검증] /cs/inquiry 이동 확인', async () => {
      await expect(page).toHaveURL(/\/cs\/inquiry/);
    });
  });

  test('구매내역 항목 구성 확인 (썸네일/결제일시/주문번호/구매항목명/금액)', async ({ page }) => {
    const purchasePage = new MyPagePurchasePage(page);
    await test.step('[셋업] 구매내역 페이지 이동', async () => {
      await purchasePage.navigate();
    });
    await test.step('[검증] 구매내역 항목 구성 확인', async () => {
      const hasPurchase = await purchasePage.hasPurchaseHistory();
      if (hasPurchase) {
        await purchasePage.verifyPurchaseItemStructure();
      } else {
        console.log('ℹ️  구매내역 없는 계정 — 항목 구성 확인 건너뜀');
      }
    });
  });

  test('구매내역 페이지당 최대 5개 표시 확인', async ({ page }) => {
    const purchasePage = new MyPagePurchasePage(page);
    await test.step('[셋업] 구매내역 페이지 이동', async () => {
      await purchasePage.navigate();
    });
    await test.step('[검증] 페이지당 최대 5개 및 페이지네이션 확인', async () => {
      const hasPurchase = await purchasePage.hasPurchaseHistory();
      if (hasPurchase) {
        await purchasePage.verifyItemsPerPage();
        await purchasePage.verifyPaginationExists();
      } else {
        console.log('ℹ️  구매내역 없는 계정 — 페이지네이션 확인 건너뜀');
      }
    });
  });

  test('구매내역 [주문 상세] 클릭 → 모달 내용 확인 → 닫기', async ({ page }) => {
    const purchasePage = new MyPagePurchasePage(page);
    await test.step('[셋업] 구매내역 페이지 이동 및 주문 상세 버튼 클릭', async () => {
      await purchasePage.navigate();
    });
    await test.step('[검증] 주문 상세 모달 내용 확인 및 닫기', async () => {
      const hasPurchase = await purchasePage.hasPurchaseHistory();
      if (hasPurchase) {
        const opened = await purchasePage.clickOrderDetailButton();
        if (opened) {
          await purchasePage.verifyOrderDetailModalContent();
          await purchasePage.closeModal();
        }
      } else {
        console.log('ℹ️  구매내역 없는 계정 — 주문 상세 확인 건너뜀');
      }
    });
  });

  test('구매내역 항목 [문의하기] → /cs/inquiry 이동', async ({ page }) => {
    const purchasePage = new MyPagePurchasePage(page);
    await test.step('[셋업] 구매내역 페이지 이동', async () => {
      await purchasePage.navigate();
    });
    await test.step('[검증] 항목 문의하기 클릭 후 /cs/inquiry 이동 확인', async () => {
      const hasPurchase = await purchasePage.hasPurchaseHistory();
      if (hasPurchase) {
        await purchasePage.clickPurchaseItemInquiry();
      } else {
        console.log('ℹ️  구매내역 없는 계정 — 항목 문의하기 확인 건너뜀');
      }
    });
  });
});
