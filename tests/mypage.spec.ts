import { test, expect, type Page } from '@playwright/test';
import { MyPage, MYPAGE_TABS } from './pages/MyPage';
import { MyPageEditPage } from './pages/MyPageEditPage';
import { MyPagePasswordPage } from './pages/MyPagePasswordPage';
import { MyPagePurchasePage } from './pages/MyPagePurchasePage';
import { MyPageDashboardPage } from './pages/MyPageDashboardPage';
import { captureEvidence, tcStep } from './utils/evidence';

const PASSWORD = process.env.TEST_PASSWORD ?? '';
const WRONG_PASSWORD = 'WrongPass123!';
const VALID_NEW_PASSWORD = 'NewPass1!';

/** 마이페이지 > 프로필 화면(#MyProfileView) 진입. 세션 끊김("비정상적인 접근")은 MyPage.navigate()가 재로그인 처리 */
async function openProfileView(page: Page) {
  await new MyPage(page).navigate();
  await expect(
    page.locator('#MyProfileView #ProfileTable').first(),
    '[UI/셀렉터] 마이페이지 프로필 화면(#MyProfileView)이 표시되지 않음 — 로그인 세션 또는 셀렉터 확인',
  ).toBeVisible({ timeout: 15000 });
  // 표가 먼저 그려지고 소속 정보·하단 버튼(클릭 핸들러)은 데이터 로드 후 완성됨 → 렌더 완료까지 대기
  await expect(page.locator('#MyProfileView .bottom button').first(), '[UI/셀렉터] 프로필 하단 버튼을 찾을 수 없음').toBeVisible({ timeout: 10000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
}

/** 프로필 수정 폼(#EditForm) 진입 — 비밀번호 확인 단계만 통과하고 수정 제출은 하지 않음 */
async function openProfileEditForm(page: Page) {
  await openProfileView(page);
  const editButton = page.locator('#MyProfileView .bottom button', { hasText: '프로필 수정' });
  const pwInput = page.locator('#CheckPassword input[type="password"]');
  // 화면 준비 전 클릭이 무시되는 경우가 있어, 비밀번호 확인 화면이 뜰 때까지 클릭 재시도
  await expect(async () => {
    // 진입 중 알럿(예: "비밀번호가 입력되지 않았습니다.")이 떠 있으면 내용을 기록하고 [확인]으로 닫은 뒤 재시도
    const alertOk = page.getByRole('button', { name: '확인', exact: true }).first();
    if (!(await pwInput.isVisible()) && await alertOk.isVisible()) {
      const alertText = await page.locator('#CommonAlert .modal-body').innerText().catch(() => '');
      console.log(`ℹ️ [프로필 수정] 진입 중 알럿 노출 → 닫고 재시도: "${alertText.trim()}" (URL ${new URL(page.url()).pathname})`);
      await alertOk.click({ timeout: 2000 });
    }
    if (!(await pwInput.isVisible())) await editButton.click({ timeout: 2000 });
    await expect(pwInput).toBeVisible({ timeout: 3000 });
  }, '[UI/셀렉터] [프로필 수정] 클릭 후 비밀번호 확인 입력 필드를 찾을 수 없음').toPass({ timeout: 20000 });
  await pwInput.fill(PASSWORD);
  await page.locator('#CheckPassword').getByRole('button', { name: '확인', exact: true }).click();
  await expect(page.locator('#EditForm'), '[앱오류] 비밀번호 확인 후 프로필 수정 폼으로 이동하지 않음').toBeVisible({ timeout: 10000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// T425 마이페이지 프로필
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T425 마이페이지 프로필', () => {
  test('헤더 [마이페이지] 클릭 시 마이페이지 이동', { annotation: tcStep(1) }, async ({ page }) => {
    const myPage = new MyPage(page);
    await test.step('[셋업] 헤더를 통해 마이페이지 이동', async () => {
      await myPage.navigateViaHeader();
    });
    await test.step('[검증] 마이페이지 URL 확인', async () => {
      await myPage.verifyUrl();
    });
  });

  test('마이페이지 URL 확인', { annotation: tcStep(1) }, async ({ page }) => {
    const myPage = new MyPage(page);
    await test.step('[셋업] 마이페이지 이동', async () => {
      await myPage.navigate();
    });
    await test.step('[검증] 마이페이지 URL 확인', async () => {
      await myPage.verifyUrl();
    });
  });

  test('마이페이지 탭 목록 4개 확인 (실습 대시보드/디지털 배지/프로필/구매 및 결제 관리)', { annotation: tcStep(2) }, async ({ page }) => {
    const myPage = new MyPage(page);
    await test.step('[셋업] 마이페이지 이동', async () => {
      await myPage.navigate();
    });
    await test.step('[검증] 탭 목록 4개 노출 확인', async () => {
      await myPage.verifyTabsExist();
    });
  });

  test('기본 탭 [프로필] 선택 확인', { annotation: tcStep(2) }, async ({ page }) => {
    const myPage = new MyPage(page);
    await test.step('[셋업] 마이페이지 이동', async () => {
      await myPage.navigate();
    });
    await test.step('[검증] 기본 탭 프로필 선택 확인', async () => {
      await myPage.verifyDefaultTabIsProfile();
    });
  });

  test('프로필 기본 정보 항목 확인 (계정/이름/휴대폰/E-mail/마케팅)', { annotation: tcStep(3) }, async ({ page }) => {
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

  test('소속 정보(소속/학부·학과/학번) 노출 확인', { annotation: tcStep(4) }, async ({ page }) => {
    // 구조: #MyProfileView > .info-form(h5 "소속 정보") > table#ProfileTable > tr > th(항목) + td(값)
    const affiliation = page.locator('#MyProfileView .info-form')
      .filter({ has: page.locator('h5', { hasText: /^소속 정보$/ }) });

    const sectionCount = await test.step('[셋업] 마이페이지 프로필 화면 이동', async () => {
      await openProfileView(page);
      const count = await affiliation.count();
      console.log(`✅ 소속 정보 영역 유무: ${count > 0 ? '있음' : '없음'} (${count}개)`);
      return count;
    });
    if (sectionCount === 0) {
      await captureEvidence(page.locator('#MyProfileView'), '프로필 화면 (소속 정보 영역 없음)');
      test.skip(true, '스펙은 소속 정보가 있는 계정(raontest6 등) 기준 — 현재 테스트 계정은 소속 정보 없음');
    }

    await test.step('[검증] 소속/학부·학과/학번 항목 및 값 노출', async () => {
      await expect(affiliation, '[앱오류] 소속 정보 영역이 표시되지 않음').toBeVisible();
      const rows = await affiliation.locator('tr').evaluateAll(trs => trs.map(tr => ({
        label: tr.querySelector('th')?.textContent?.trim() ?? '',
        value: ((tr.querySelector('td') as HTMLElement | null)?.innerText ?? '').replace(/\s+/g, ' ').trim(),
      })));
      console.log(`✅ 소속 정보 항목: ${rows.map(r => `${r.label}="${r.value}"`).join(', ')}`);
      await captureEvidence(affiliation, '소속 정보 (소속/학부·학과/학번)');

      for (const label of ['소속', '학부/학과', '학번']) {
        const row = rows.find(r => r.label === label);
        expect.soft(row, `[앱오류] 소속 정보에 "${label}" 항목이 없음`).toBeTruthy();
        expect.soft(row?.value ?? '', `[앱오류] 소속 정보 "${label}" 값이 비어 있음`).not.toBe('');
      }
    });
  });

  test('하단 버튼 [비밀번호 변경]/[프로필 수정]/[회원 탈퇴] 클릭 시 각 페이지 이동 확인', { annotation: tcStep(5) }, async ({ page }) => {
    // 구조: #MyProfileView .bottom > .button-group > button.ReButton(비밀번호 변경 / 프로필 수정) + div.link(회원탈퇴)
    // 이동만 확인 — 이동한 페이지에서 입력·제출하지 않음
    const bottom = page.locator('#MyProfileView .bottom');
    const targets = [
      { name: '비밀번호 변경', button: bottom.locator('button', { hasText: '비밀번호 변경' }), url: /\/mypage\/change-password/, heading: '비밀번호 변경하기' },
      { name: '프로필 수정', button: bottom.locator('button', { hasText: '프로필 수정' }), url: /\/mypage\/edit/, heading: '프로필 수정' },
      { name: '회원 탈퇴', button: bottom.locator('.link', { hasText: '회원탈퇴' }), url: /\/delete-account/, heading: '회원탈퇴' },
    ];

    await test.step('[셋업] 마이페이지 프로필 화면 이동', async () => {
      await openProfileView(page);
      await expect(bottom, '[UI/셀렉터] 프로필 하단 버튼 영역(.bottom)을 찾을 수 없음').toBeVisible();
      const labels = (await bottom.locator('button, .link').allInnerTexts()).map(s => s.trim());
      console.log(`✅ 프로필 하단 버튼: ${labels.join(' / ')}`);
      await captureEvidence(bottom, '프로필 하단 버튼 (비밀번호 변경/프로필 수정/회원탈퇴)');
    });

    for (const t of targets) {
      await test.step(`[검증] [${t.name}] 클릭 → ${t.name} 페이지 이동`, async () => {
        await openProfileView(page);
        await expect(t.button, `[UI/셀렉터] 프로필 하단 [${t.name}] 버튼을 찾을 수 없음`).toBeVisible();
        await t.button.click();
        await expect.soft(page, `[앱오류] [${t.name}] 클릭 후 ${t.name} 페이지로 이동하지 않음`).toHaveURL(t.url, { timeout: 10000 });
        await expect.soft(
          page.getByRole('heading', { name: t.heading, exact: true }).first(),
          `[앱오류] [${t.name}] 클릭 후 "${t.heading}" 페이지 제목이 표시되지 않음`,
        ).toBeVisible({ timeout: 8000 });
        const headings = (await page.locator('#ReMainView').locator('h1, h2, h3, h4, h5').allInnerTexts())
          .map(h => h.trim()).filter(Boolean);
        console.log(`✅ [${t.name}] 클릭 → URL ${new URL(page.url()).pathname}, 페이지 제목 ${JSON.stringify(headings)}`);
        await captureEvidence(page, `[${t.name}] 클릭 후 이동한 페이지`);
      });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T426 프로필 수정
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T426 프로필 수정', () => {
  test('[프로필 수정] 버튼 클릭 → 비밀번호 확인 페이지 진입', { annotation: tcStep(1) }, async ({ page }) => {
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

  test('비밀번호 placeholder "비밀번호를 입력해 주세요." 확인', { annotation: tcStep(2) }, async ({ page }) => {
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

  test('비밀번호 미입력 → "비밀번호가 입력되지 않았습니다." 알럿', { annotation: tcStep(2) }, async ({ page }) => {
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

  test('비밀번호 보이기/숨기기 토글 동작 확인', { annotation: tcStep(3) }, async ({ page }) => {
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

  test('틀린 비밀번호 → "비밀번호가 올바르지 않습니다." 알럿', { annotation: tcStep(4) }, async ({ page }) => {
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

  test('올바른 비밀번호 입력 → 프로필 수정 폼 이동', { annotation: tcStep(4) }, async ({ page }) => {
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

  test('수정 가능/불가능 필드 확인', { annotation: tcStep(5) }, async ({ page }) => {
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

  test('E-mail placeholder "이메일을 입력해 주세요." 확인', { annotation: tcStep(8) }, async ({ page }) => {
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

  test('E-mail 수정 후 [수정] → "프로필 수정이 완료되었습니다." 알럿 → 마이페이지 복귀', { annotation: tcStep(8) }, async ({ page }) => {
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

  test('마케팅 수신 체크박스 토글 후 저장 확인', { annotation: tcStep(10) }, async ({ page }) => {
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

  test('[취소] 버튼 → 마이페이지 복귀', { annotation: tcStep(11) }, async ({ page }) => {
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

  test('프로필 수정 [수정] 버튼 색상 — 주황색이 아닌지 확인', { annotation: tcStep(7) }, async ({ page }) => {
    test.skip(!PASSWORD, 'TEST_PASSWORD 환경변수 미설정');
    // 구조: #MyProfileEditView > #EditForm > .button-group > button.ReButton(취소) + button.ReButton(수정)
    const buttonGroup = page.locator('#EditForm .button-group');
    const saveButton = buttonGroup.locator('button', { hasText: /^\s*수정\s*$/ });
    // 주황색 판정: 빨강 높고 초록 중간, 파랑 낮음
    const isOrange = (color: string) => {
      const [r, g, b] = (color.match(/\d+/g) || []).map(Number);
      return r >= 200 && g >= 80 && g <= 190 && b <= 100;
    };

    await test.step('[셋업] 프로필 수정 폼 진입 (비밀번호 확인만 통과, 수정 제출 안 함)', async () => {
      await openProfileEditForm(page);
    });

    await test.step('[검증] [수정] 버튼 배경색이 주황색이 아님', async () => {
      await expect(saveButton, '[UI/셀렉터] 프로필 수정 폼 [수정] 버튼을 찾을 수 없음').toBeVisible();
      const style = await saveButton.evaluate(b => {
        const s = getComputedStyle(b);
        return { bg: s.backgroundColor, color: s.color, border: s.borderColor, cls: b.className };
      });
      console.log(`✅ [수정] 버튼 배경색 ${style.bg}, 글자색 ${style.color}, 테두리 ${style.border} (class "${style.cls}")`);
      await captureEvidence(buttonGroup, '프로필 수정 폼 [취소]/[수정] 버튼');
      expect(isOrange(style.bg), `[앱오류] [수정] 버튼 배경색이 주황색임 (${style.bg}) — METADEMY-2314`).toBe(false);
    });
  });

  test('마케팅 정보 수신 확인 체크박스 기본값 — 미선택 상태 확인', { annotation: tcStep(9) }, async ({ page }) => {
    test.skip(!PASSWORD, 'TEST_PASSWORD 환경변수 미설정');
    // 구조: #EditForm tr(th "마케팅 정보 수신 확인") > td > #Checkbox > input#marketingSMS / input#marketingEmail + label.checkbox
    // 상태 확인만 — 체크박스 클릭·[수정] 제출 하지 않음
    const marketingRow = page.locator('#EditForm tr')
      .filter({ has: page.locator('th', { hasText: '마케팅 정보 수신 확인' }) });

    await test.step('[셋업] 프로필 수정 폼 진입 (비밀번호 확인만 통과, 수정 제출 안 함)', async () => {
      await openProfileEditForm(page);
    });

    await test.step('[검증] 문자메시지/E-mail 체크박스 기본 미선택', async () => {
      await expect(marketingRow.locator('input[type="checkbox"]'), '[UI/셀렉터] 마케팅 정보 수신 체크박스(문자메시지/E-mail) 2개를 찾을 수 없음').toHaveCount(2);
      const states = await marketingRow.locator('#Checkbox').evaluateAll(list => list.map(c => {
        const input = c.querySelector('input') as HTMLInputElement;
        return { label: (c.querySelector('label') as HTMLElement | null)?.innerText.trim() ?? '', id: input.id, checked: input.checked };
      }));
      console.log(`✅ 마케팅 정보 수신 체크박스 상태: ${states.map(s => `${s.label}(#${s.id})=${s.checked ? '체크됨' : '미체크'}`).join(', ')}`);
      await captureEvidence(marketingRow, '마케팅 정보 수신 확인 체크박스 기본 상태');

      const checked = states.filter(s => s.checked).map(s => s.label);
      expect(checked, `[앱오류] 마케팅 수신 기본값이 선택되어 있음(계정 수정 이력 확인 필요) — 체크됨: ${checked.join(', ')}`).toEqual([]);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T428 비밀번호 변경
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T428 비밀번호 변경', () => {
  test('[비밀번호 변경] 버튼 클릭 → 비밀번호 변경 페이지 이동', { annotation: tcStep(1) }, async ({ page }) => {
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

  test('비밀번호 보이기/숨기기 토글 동작 확인', { annotation: tcStep(2) }, async ({ page }) => {
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

  test('비밀번호 필드 placeholder 3개 확인 ("비밀번호를 입력해 주세요.")', { annotation: tcStep(3) }, async ({ page }) => {
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

  test('비밀번호 조건 안내 문구 확인 (영문/숫자/특수문자 8자 이상)', { annotation: tcStep(3) }, async ({ page }) => {
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

  test('현재 비밀번호 미입력 → "현재 사용 중인 비밀번호를 입력해 주세요." 알럿', { annotation: tcStep(3) }, async ({ page }) => {
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

  test('현재 비밀번호만 입력 → "새 비밀번호 입력칸에 새로 사용하실 비밀번호를 입력해 주세요." 알럿', { annotation: tcStep(4) }, async ({ page }) => {
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

  test('현재+새 비밀번호만 입력 → "새 비밀번호 확인 입력칸에..." 알럿', { annotation: tcStep(4) }, async ({ page }) => {
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

  test('새 비밀번호 != 확인 → "새로운 비밀번호가 일치하지 않습니다." 알럿', { annotation: tcStep(4) }, async ({ page }) => {
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

  test('조건 불충족 비밀번호 → "새로운 비밀번호가 조건에 맞지 않습니다." 알럿', { annotation: tcStep(5) }, async ({ page }) => {
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

  test('틀린 현재 비밀번호 + 조건에 맞는 새 비밀번호 → 변경 확인 알럿 → 취소로 실제 변경 방지', { annotation: tcStep(6) }, async ({ page }) => {
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
  test('[구매내역] 탭 클릭 → 구매내역 페이지 이동', { annotation: tcStep(1) }, async ({ page }) => {
    const myPage = new MyPage(page);
    const purchasePage = new MyPagePurchasePage(page);
    await test.step('[셋업] 마이페이지 이동 및 구매내역 탭 클릭', async () => {
      await myPage.navigate();
      await myPage.clickTab('구매 및 결제 관리');
    });
    await test.step('[검증] 구매 및 결제 관리 탭 활성화 확인', async () => {
      await myPage.verifyTabActive('구매 및 결제 관리');
    });
  });

  test('구매내역이 없는 경우 "구매 내역이 없습니다." 문구 확인', { annotation: tcStep(1) }, async ({ page }) => {
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

  test('구매내역 항목 구성 확인 (썸네일/결제일시/주문번호/구매항목명/금액)', { annotation: tcStep(2, 3) }, async ({ page }) => {
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

  test('구매내역 [주문 상세] 클릭 → 모달 내용 확인 → 닫기', { annotation: tcStep(7) }, async ({ page }) => {
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

// ─────────────────────────────────────────────────────────────────────────────
// T1798 실습 내역
// 전제조건: 실습 콘텐츠 실행 기록이 있는 계정으로 로그인
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T1798 실습 내역', () => {
  test('실습 대시보드 탭 이동 확인', { annotation: tcStep(1) }, async ({ page }) => {
    const myPage = new MyPage(page);
    const dashPage = new MyPageDashboardPage(page);
    await test.step('[셋업] 마이페이지 이동 후 실습 대시보드 탭 클릭', async () => {
      await myPage.navigate();
      await myPage.clickTab('실습 대시보드');
    });
    await test.step('[검증] 실습 대시보드 노출 확인', async () => {
      await dashPage.verifyDashboardVisible();
    });
  });

  test('진행중 실습내역 — 아코디언 기본 접힘 상태 확인', { annotation: tcStep(2) }, async ({ page }) => {
    const myPage = new MyPage(page);
    const dashPage = new MyPageDashboardPage(page);
    await test.step('[셋업] 실습 대시보드 이동', async () => {
      await myPage.navigate();
      await myPage.clickTab('실습 대시보드');
    });
    await test.step('[검증] 아코디언 기본 접힘 상태 확인', async () => {
      const count = await dashPage.verifyPracticeHistoryExists();
      if (count > 0) {
        await dashPage.verifyAccordionDefaultCollapsed();
      } else {
        console.log('ℹ️  실습 이력 없는 계정 — 아코디언 상태 확인 건너뜀');
      }
    });
  });

  test('진행중 실습내역 — 아코디언 펼침/닫기 동작 확인', { annotation: tcStep(2) }, async ({ page }) => {
    const myPage = new MyPage(page);
    const dashPage = new MyPageDashboardPage(page);
    await test.step('[셋업] 실습 대시보드 이동', async () => {
      await myPage.navigate();
      await myPage.clickTab('실습 대시보드');
    });
    await test.step('[검증] 아코디언 펼침 동작 확인', async () => {
      const count = await dashPage.verifyPracticeHistoryExists();
      if (count > 0) {
        await dashPage.clickFirstAccordionExpandButton();
        await dashPage.verifyAccordionExpanded();
      } else {
        console.log('ℹ️  실습 이력 없는 계정 — 아코디언 펼침 확인 건너뜀');
      }
    });
    await test.step('[검증] 아코디언 닫기 동작 확인', async () => {
      const count = await dashPage.verifyPracticeHistoryExists();
      if (count > 0) {
        await dashPage.verifyAccordionCollapsedAfterToggle();
      }
    });
  });

  test('진행중 실습내역 — 최근 실습일 YYYY-MM-DD 형식 노출 확인', { annotation: tcStep(2) }, async ({ page }) => {
    const myPage = new MyPage(page);
    const dashPage = new MyPageDashboardPage(page);
    await test.step('[셋업] 실습 대시보드 이동', async () => {
      await myPage.navigate();
      await myPage.clickTab('실습 대시보드');
    });
    await test.step('[검증] 최근 실습일 날짜 형식 확인', async () => {
      await dashPage.verifyRecentPracticeDateFormat();
    });
  });

  test('진행중 실습내역 — 진행률 프로그래스바 및 퍼센트 노출 확인', { annotation: tcStep(2) }, async ({ page }) => {
    const myPage = new MyPage(page);
    const dashPage = new MyPageDashboardPage(page);
    await test.step('[셋업] 실습 대시보드 이동', async () => {
      await myPage.navigate();
      await myPage.clickTab('실습 대시보드');
    });
    await test.step('[검증] 진행률 바 노출 확인', async () => {
      await dashPage.verifyProgressBarVisible();
    });
    await test.step('[검증] 진행률 텍스트 노출 확인', async () => {
      await dashPage.verifyProgressRateVisible();
    });
  });

  test('진행중 실습내역 — 완료 콘텐츠가 진행중으로 표시되지 않는지 확인', { annotation: tcStep(2) }, async ({ page }) => {
    const myPage = new MyPage(page);
    const dashPage = new MyPageDashboardPage(page);
    await test.step('[셋업] 실습 대시보드 이동', async () => {
      await myPage.navigate();
      await myPage.clickTab('실습 대시보드');
    });
    await test.step('[검증] 진행중 섹션에 완료 항목 미존재 확인', async () => {
      await dashPage.verifyNoCompletedItemInProgress();
    });
  });

  test('완료 실습내역 — 진행률 100% 노출 확인', { annotation: tcStep(3) }, async ({ page }) => {
    const myPage = new MyPage(page);
    const dashPage = new MyPageDashboardPage(page);
    await test.step('[셋업] 실습 대시보드 이동', async () => {
      await myPage.navigate();
      await myPage.clickTab('실습 대시보드');
    });
    await test.step('[검증] 완료 항목 진행률 100% 확인', async () => {
      await dashPage.verifyCompletedItemHas100Percent();
    });
  });

  test('완료 실습내역 — 진행중 콘텐츠가 완료로 표시되지 않는지 확인', { annotation: tcStep(3) }, async ({ page }) => {
    const myPage = new MyPage(page);
    const dashPage = new MyPageDashboardPage(page);
    await test.step('[셋업] 실습 대시보드 이동', async () => {
      await myPage.navigate();
      await myPage.clickTab('실습 대시보드');
    });
    await test.step('[검증] 완료 섹션에 진행중 항목 미존재 확인', async () => {
      await dashPage.verifyNoInProgressItemInCompleted();
    });
  });
});
