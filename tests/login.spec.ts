import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { captureEvidence, tcStep } from './utils/evidence';

// 로그인 관련 TC는 세션 없이 시작
test.use({ storageState: { cookies: [], origins: [] } });

const USERNAME = process.env.TEST_USERNAME ?? '';
const PASSWORD = process.env.TEST_PASSWORD ?? '';

// ─────────────────────────────────────────────────────────────────────────────
// T416 간편인증 로그인
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T416 간편인증 로그인', () => {
  test('간편인증 로그인 탭 이동 확인', { annotation: tcStep(1) }, async ({ page }) => {
    test.skip(true, '간편인증(PASS 앱 등)은 실제 인증 앱 필요 — 자동화 제외');
  });
  test('간편인증 - 미가입 회원 알럿 확인', { annotation: tcStep(2) }, async ({ page }) => {
    test.skip(true, '간편인증(PASS 앱 등)은 실제 인증 앱 필요 — 자동화 제외');
  });
  test('간편인증 - 기가입 회원 로그인 성공', { annotation: tcStep(3) }, async ({ page }) => {
    test.skip(true, '간편인증(PASS 앱 등)은 실제 인증 앱 필요 — 자동화 제외');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T417 로그인 페이지 UI 확인
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T417 로그인 페이지 UI 확인', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await page.waitForLoadState('load');
  });

  test('로그인 페이지 URL 이동 확인', { annotation: tcStep(1) }, async ({ page }) => {
    await test.step('[검증] URL /login 확인', async () => {
      await expect(page).toHaveURL(/\/login/);
      console.log('✅ 로그인 페이지 URL 확인');
    });
  });

  test('로그인 탭 기본 선택 — 볼드 및 보라색 밑줄 확인', { annotation: tcStep(2) }, async ({ page }) => {
    // 탭 구조: .tabs-group > div(.active) > p(탭 이름) + span.border(밑줄)
    const tabs = page.locator('.tabs-group > div');
    const loginTab = tabs.filter({ has: page.locator('p', { hasText: /^로그인$/ }) });
    // 보라색 판정: 파랑이 강하고 빨강·초록보다 충분히 큼 (진입 시 색 전환 애니메이션 중간색도 보라로 인정, 회색은 제외)
    const isPurple = (color: string) => {
      const [r, g, b] = (color.match(/\d+/g) || []).map(Number);
      return b >= 150 && b - r >= 40 && b - g >= 60;
    };

    await test.step('[검증] 중앙 [로그인] 탭 기본 선택', async () => {
      await expect(tabs, '[UI/셀렉터] 로그인 방식 탭 3개를 찾을 수 없음').toHaveCount(3);
      await expect(loginTab, '[앱오류] [로그인] 탭이 기본 선택(active) 상태가 아님').toHaveClass(/\bactive\b/);
    });

    await test.step('[검증] 볼드 처리 및 보라색 밑줄', async () => {
      const style = await loginTab.evaluate(tab => {
        const text = getComputedStyle(tab.querySelector('p')!);
        const border = tab.querySelector('.border');
        return {
          weight: Number(text.fontWeight),
          color: text.color,
          underline: border ? getComputedStyle(border).backgroundColor : '',
          height: border ? border.getBoundingClientRect().height : 0,
        };
      });
      const inactiveUnderlines = await tabs.evaluateAll(list => list
        .filter(t => !t.classList.contains('active'))
        .map(t => { const b = t.querySelector('.border'); return b ? getComputedStyle(b).backgroundColor : ''; }));

      console.log(`✅ [로그인] 탭 글자 굵기 ${style.weight}, 글자색 ${style.color}, 밑줄 ${style.underline} (${style.height}px)`);
      console.log(`✅ 선택되지 않은 탭 밑줄 색: ${inactiveUnderlines.join(', ')}`);

      expect(style.weight, '[앱오류] [로그인] 탭 글자가 볼드 처리되지 않음').toBeGreaterThanOrEqual(600);
      expect(style.height, '[앱오류] [로그인] 탭 밑줄이 표시되지 않음').toBeGreaterThan(0);
      await expect.poll(
        async () => isPurple(await loginTab.locator('.border').evaluate(b => getComputedStyle(b).backgroundColor)),
        { message: `[앱오류] [로그인] 탭 밑줄이 보라색이 아님 (${style.underline})`, timeout: 3000 },
      ).toBe(true);
      expect(inactiveUnderlines.filter(isPurple), '[앱오류] 선택되지 않은 탭에도 보라색 밑줄이 표시됨').toHaveLength(0);

      await captureEvidence(page.locator('.tabs-group'), '로그인 방식 탭 (진입 시 기본 선택)');
    });
  });

  test('환영 문구 노출 확인', { annotation: tcStep(3) }, async ({ page }) => {
    const loginPage = new LoginPage(page);
    await test.step('[검증] 환영 문구 확인', async () => {
      await loginPage.verifyWelcomeText();
    });
  });

  test('소셜 로그인 버튼 노출 확인', { annotation: tcStep(4) }, async ({ page }) => {
    const loginPage = new LoginPage(page);
    await test.step('[검증] 소셜 로그인 버튼 확인', async () => {
      await loginPage.verifySocialLoginButtons();
    });
  });

  test('소셜/ID-PW 구분선 "또는" 노출 확인', { annotation: tcStep(5) }, async ({ page }) => {
    const loginPage = new LoginPage(page);
    await test.step('[검증] 구분선 "또는" 확인', async () => {
      await loginPage.verifyDivider();
    });
  });

  test('계정/비밀번호 입력 필드 및 로그인 버튼 확인', { annotation: tcStep(6) }, async ({ page }) => {
    const loginPage = new LoginPage(page);
    await test.step('[검증] 입력 필드 및 로그인 버튼 확인', async () => {
      await loginPage.verifyInputFieldsVisible();
    });
  });

  test('아이디 찾기 / 비밀번호 찾기 버튼 노출 확인', { annotation: tcStep(7) }, async ({ page }) => {
    const loginPage = new LoginPage(page);
    await test.step('[검증] 찾기 버튼 확인', async () => {
      await loginPage.verifyFindButtons();
    });
  });

  test('"아직 회원이 아닌가요?" 문구 및 회원가입하기 버튼 확인', { annotation: tcStep(8) }, async ({ page }) => {
    const loginPage = new LoginPage(page);
    await test.step('[검증] 회원가입 문구 및 버튼 확인', async () => {
      await loginPage.verifyRegisterLink();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T418 모바일 학생증(QR) 로그인
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T418 모바일 학생증(QR) 로그인', () => {
  test('QR 코드 노출 및 안내 문구 확인', { annotation: tcStep(1) }, async ({ page }) => {
    test.skip(true, 'QR 로그인은 모바일 기기 스캔 필요 — 자동화 제외');
  });
  test('QR 유효시간 카운트다운 및 재시도 버튼 확인', { annotation: tcStep(2) }, async ({ page }) => {
    test.skip(true, 'QR 로그인은 모바일 기기 스캔 필요 — 자동화 제외');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T760 계정/비밀번호 로그인 (auth.spec.ts 미포함 추가 시나리오)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T760 계정/비밀번호 로그인', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await page.waitForLoadState('load');
  });

  test('잘못된 비밀번호로 로그인 시도 → 실패 알럿 확인', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await test.step('[셋업] 잘못된 비밀번호로 로그인 시도', async () => {
      await loginPage.loginWithWrongCredentials(USERNAME, 'WrongPass999!');
    });
    await test.step('[검증] 로그인 실패 메시지 확인', async () => {
      await loginPage.verifyLoginFailMessage();
    });
  });

  test('엔터키로 로그인 성공', { annotation: tcStep(6) }, async ({ page }) => {
    const loginPage = new LoginPage(page);
    await test.step('[셋업] 계정/비밀번호 입력 후 엔터키 입력', async () => {
      await loginPage.loginWithEnterKey(USERNAME, PASSWORD);
    });
    await test.step('[검증] 로그인 성공 확인', async () => {
      await loginPage.verifyLoginSuccess();
    });
  });

  test('비밀번호 보이기/숨기기 버튼 동작 확인', { annotation: tcStep(4) }, async ({ page }) => {
    const loginPage = new LoginPage(page);
    await test.step('[검증] 비밀번호 토글 버튼 동작 확인', async () => {
      await loginPage.verifyPasswordToggle();
    });
  });
});
