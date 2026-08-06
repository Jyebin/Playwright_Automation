import { test, expect } from '@playwright/test';
import { FindIdPage } from './pages/FindIdPage';

// 아이디 찾기는 비로그인 상태에서 진행
test.use({ storageState: { cookies: [], origins: [] } });

// ─────────────────────────────────────────────────────────────────────────────
// T419 아이디 찾기 - 휴대폰 번호로 찾기
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T419 아이디 찾기 - 휴대폰 번호로 찾기', () => {
  test('아이디 찾기 페이지 이동 및 휴대폰 번호로 찾기 탭 선택', async ({ page }) => {
    const findIdPage = new FindIdPage(page);
    await test.step('[셋업] 아이디 찾기 페이지 이동', async () => {
      await findIdPage.navigate();
    });
    await test.step('[셋업] 휴대폰 번호로 찾기 탭 선택', async () => {
      await findIdPage.selectPhoneTab();
    });
    await test.step('[검증] 아이디 찾기 페이지 URL 확인', async () => {
      await expect(page).toHaveURL(/find-id/);
      console.log('✅ 아이디 찾기 URL 확인');
    });
  });

  test('이름 / 휴대폰 번호 / 인증번호 placeholder 확인', async ({ page }) => {
    const findIdPage = new FindIdPage(page);
    await test.step('[셋업] 아이디 찾기(휴대폰) 탭 이동', async () => {
      await findIdPage.navigate();
      await findIdPage.selectPhoneTab();
    });
    await test.step('[검증] 입력 필드 placeholder 확인', async () => {
      await findIdPage.verifyPhonePlaceholders();
    });
  });

  test('이름 + 휴대폰 번호 입력 시 인증번호 받기 버튼 활성화 확인', async ({ page }) => {
    const findIdPage = new FindIdPage(page);
    await test.step('[셋업] 아이디 찾기(휴대폰) 탭 이동 및 정보 입력', async () => {
      await findIdPage.navigate();
      await findIdPage.selectPhoneTab();
      await findIdPage.fillNameAndPhone('테스트', '01012345678');
    });
    await test.step('[검증] 인증번호 받기 버튼 활성화 확인', async () => {
      await findIdPage.verifyVerificationButtonActive();
    });
  });

  test('잘못된 이름/휴대폰 번호 입력 → "가입 시 등록한 정보를 다시 확인해 주세요." 알럿', async ({ page }) => {
    const findIdPage = new FindIdPage(page);
    await test.step('[셋업] 잘못된 정보 입력 및 인증번호 받기 클릭', async () => {
      await findIdPage.navigate();
      await findIdPage.selectPhoneTab();
      await findIdPage.fillNameAndPhone('없는사람', '01099999999');
      await findIdPage.clickSendVerification();
    });
    await test.step('[검증] 잘못된 정보 알럿 확인', async () => {
      await findIdPage.verifyWrongInfoAlert();
    });
  });

  test('취소 버튼 클릭 → 로그인 페이지 이동', async ({ page }) => {
    const findIdPage = new FindIdPage(page);
    await test.step('[셋업] 아이디 찾기 페이지 이동 및 취소 클릭', async () => {
      await findIdPage.navigate();
      await findIdPage.clickCancel();
    });
    await test.step('[검증] 로그인 페이지 이동 확인', async () => {
      await findIdPage.verifyCancelNavigatesToLogin();
    });
  });

  // Steps 4-12: 실제 SMS 수신 후 인증 진행 필요 → 자동화 불가
  test('인증번호 발송 및 인증 완료 → 아이디 찾기 결과 확인', async ({ page }) => {
    test.skip(true, '실제 SMS 인증 필요 — 자동화 제외 (인증번호 발송/입력/결과 확인)');
  });
  test('인증 5회 실패 → 제한 초과 알럿 확인', async ({ page }) => {
    test.skip(true, '실제 SMS 인증 필요 — 자동화 제외');
  });
  test('인증번호 입력 시간 만료 → 만료 알럿 확인', async ({ page }) => {
    test.skip(true, '실제 SMS 인증 필요 — 자동화 제외 (3분 만료 대기)');
  });
  test('인증 잔여 횟수 초과 → 24시간 제한 알럿', async ({ page }) => {
    test.skip(true, '실제 SMS 인증 및 횟수 초과 필요 — 담당 QA 문의 후 진행');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T423 아이디 찾기 - 이메일 주소로 찾기
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T423 아이디 찾기 - 이메일 주소로 찾기', () => {
  test('아이디 찾기 페이지 이동 및 이메일 주소로 찾기 탭 선택', async ({ page }) => {
    const findIdPage = new FindIdPage(page);
    await test.step('[셋업] 아이디 찾기 페이지 이동', async () => {
      await findIdPage.navigate();
    });
    await test.step('[셋업] 이메일 주소로 찾기 탭 선택', async () => {
      await findIdPage.selectEmailTab();
    });
    await test.step('[검증] 아이디 찾기 페이지 URL 확인', async () => {
      await expect(page).toHaveURL(/find-id/);
      console.log('✅ 아이디 찾기 URL 확인');
    });
  });

  test('이름 / 이메일 주소 / 인증번호 placeholder 확인', async ({ page }) => {
    const findIdPage = new FindIdPage(page);
    await test.step('[셋업] 아이디 찾기(이메일) 탭 이동', async () => {
      await findIdPage.navigate();
      await findIdPage.selectEmailTab();
    });
    await test.step('[검증] 입력 필드 placeholder 확인', async () => {
      await findIdPage.verifyEmailPlaceholders();
    });
  });

  test('이름 + 이메일 입력 시 인증번호 받기 버튼 활성화 확인', async ({ page }) => {
    const findIdPage = new FindIdPage(page);
    await test.step('[셋업] 아이디 찾기(이메일) 탭 이동 및 정보 입력', async () => {
      await findIdPage.navigate();
      await findIdPage.selectEmailTab();
      await findIdPage.fillNameAndEmail('테스트', 'test@test.com');
    });
    await test.step('[검증] 인증번호 받기 버튼 활성화 확인', async () => {
      await findIdPage.verifyVerificationButtonActive();
    });
  });

  test('잘못된 이름/이메일 입력 → "가입 시 등록한 정보를 다시 확인해 주세요." 알럿', async ({ page }) => {
    const findIdPage = new FindIdPage(page);
    await test.step('[셋업] 잘못된 정보 입력 및 인증번호 받기 클릭', async () => {
      await findIdPage.navigate();
      await findIdPage.selectEmailTab();
      await findIdPage.fillNameAndEmail('없는사람', 'notexist@notexist.com');
      await findIdPage.clickSendVerification();
    });
    await test.step('[검증] 잘못된 정보 알럿 확인', async () => {
      await findIdPage.verifyWrongInfoAlert();
    });
  });

  test('취소 버튼 클릭 → 로그인 페이지 이동', async ({ page }) => {
    const findIdPage = new FindIdPage(page);
    await test.step('[셋업] 아이디 찾기 페이지 이동 및 취소 클릭', async () => {
      await findIdPage.navigate();
      await findIdPage.clickCancel();
    });
    await test.step('[검증] 로그인 페이지 이동 확인', async () => {
      await findIdPage.verifyCancelNavigatesToLogin();
    });
  });

  // Steps 4-13: 실제 이메일 수신 후 인증 진행 필요 → 자동화 불가
  test('인증번호 발송 및 인증 완료 → 아이디 찾기 결과 확인', async ({ page }) => {
    test.skip(true, '실제 이메일 인증 필요 — 자동화 제외');
  });
  test('인증 5회 실패 → 제한 초과 알럿 확인', async ({ page }) => {
    test.skip(true, '실제 이메일 인증 필요 — 자동화 제외');
  });
  test('인증번호 입력 시간 만료 → 만료 알럿 확인', async ({ page }) => {
    test.skip(true, '실제 이메일 인증 필요 — 자동화 제외');
  });
  test('인증 잔여 횟수 초과 → 24시간 제한 알럿', async ({ page }) => {
    test.skip(true, '실제 이메일 인증 및 횟수 초과 필요 — 담당 QA 문의 후 진행');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T424 전체 아이디 찾기 - 이메일 주소로 찾기 (Deprecated)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T424 전체 아이디 찾기 - 이메일 주소로 찾기', () => {
  test('(Deprecated)', async ({ page }) => {
    test.skip(true, 'status: Deprecated');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T510 비밀번호 찾기 - 비밀번호 재설정
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T510 비밀번호 찾기 - 비밀번호 재설정', () => {
  test('비밀번호 재설정 링크를 통한 재설정 플로우', async ({ page }) => {
    test.skip(true, '비밀번호 재설정 링크는 이메일로만 수신 가능 — 자동화 제외');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T1596 전체 아이디 찾기 - 휴대폰 번호로 찾기 (Deprecated)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T1596 전체 아이디 찾기 - 휴대폰 번호로 찾기', () => {
  test('(Deprecated)', async ({ page }) => {
    test.skip(true, 'status: Deprecated');
  });
});
