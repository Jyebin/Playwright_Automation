import { test, expect, type Page } from '@playwright/test';
import { FindPasswordPage } from './pages/FindPasswordPage';
import { tcStep, captureEvidence } from './utils/evidence';

// 비밀번호 찾기는 비로그인 상태에서 진행
test.use({ storageState: { cookies: [], origins: [] } });

// ─────────────────────────────────────────────────────────────────────────────
// T509 - [Front][PC][로그인] 009. 비밀번호 찾기
//
// 자동화 범위
//   Step 1·2·3(표시)·4·5·10 → 항상 실행 (메일 발송 없음)
//   Step 3(감소)·6           → 재설정 메일이 실제로 발송되므로 ALLOW_RESET_MAIL=1 일 때만 실행
//                              (인증 잔여 횟수 5회/24시간을 소모함)
//   Step 7·8·9               → 만료 대기 / 만료된 메일 / 잔여 횟수 소진 상태가 필요해 자동화 제외
// ⚠️ 비밀번호를 실제로 변경하지 않는다.
// ─────────────────────────────────────────────────────────────────────────────

const ALLOW_MAIL = process.env.ALLOW_RESET_MAIL === '1';
const ACCOUNT = {
  id: process.env.TEST_USERNAME ?? '',
  name: process.env.TEST_NAME ?? '',
  email: process.env.TEST_EMAIL ?? process.env.EMAIL_IMAP_USER ?? '',
};
const WRONG = { id: 'nosuchuser01', name: '없는사람', email: 'notexist@notexist.com' };
const BAD_FORMAT_EMAIL = 'a@a.aaa';

const EXPECTED_ALERT = {
  notFound: '회원 정보를 찾을 수 없습니다. 입력하신 가입 정보를 다시 확인해 주세요.',
  limit: '인증 요청 제한 횟수를 초과했습니다. 24시간 후에 다시 시도해 주세요.',
};

// 브라우저 alert 로 뜨는 경우도 있어 함께 수집 (모달이면 readAlert 가 모달을 읽는다)
function collectDialogs(page: Page): string[] {
  const out: string[] = [];
  page.on('dialog', async d => { out.push(d.message().replace(/\s+/g, ' ').trim()); await d.dismiss().catch(() => {}); });
  return out;
}

test.describe('T509 비밀번호 찾기', () => {
  test('로그인 페이지 → [비밀번호 찾기] 진입 및 입력 화면 구성 확인', { annotation: tcStep(1) }, async ({ page }) => {
    const findPw = new FindPasswordPage(page);

    await test.step('[동작] 메인 → 헤더 [로그인] → [비밀번호 찾기]', async () => {
      await findPw.navigateFromMain();
    });

    await test.step('[검증] /find-password 진입 및 입력 필드·버튼 노출', async () => {
      await expect(page, '[앱오류] [비밀번호 찾기] 클릭 후 비밀번호 찾기 페이지로 이동하지 않음').toHaveURL(/\/find-password/, { timeout: 15_000 });
      await expect(findPw.idInput, '[앱오류] 아이디 입력 필드가 없음').toBeVisible();
      await expect(findPw.nameInput, '[앱오류] 이름 입력 필드가 없음').toBeVisible();
      await expect(findPw.emailInput, '[앱오류] 이메일 주소 입력 필드가 없음').toBeVisible();
      await expect(findPw.sendButton, '[앱오류] [재설정 메일 받기] 버튼이 없음').toBeVisible();
      console.log(`✅ 비밀번호 찾기 화면 구성 확인 — 아이디/이름/이메일 입력 필드 + [${(await findPw.sendButton.innerText()).trim()}] 버튼`);
      await captureEvidence(page, '비밀번호 찾기 페이지 진입');
    });
  });

  test('아이디 / 이름 / 이메일 주소 placeholder 확인', { annotation: tcStep(2) }, async ({ page }) => {
    const findPw = new FindPasswordPage(page);
    await findPw.navigate();
    await findPw.verifyPlaceholders();
    await captureEvidence(page, '입력 필드 placeholder');
  });

  test('인증 잔여 횟수 표시 확인 (기본 5회)', { annotation: tcStep(3) }, async ({ page }) => {
    const findPw = new FindPasswordPage(page);
    await findPw.navigate();
    const count = await findPw.remainingCount();
    const label = await findPw.remainingLabel();
    expect(count, '[앱오류] 화면에 잔여 횟수가 표시되지 않음').not.toBeNull();
    console.log(`✅ ${label || '잔여 횟수'} 표시: ${count}회`);
    if (label && label !== '인증 잔여 횟수') console.log(`ℹ️ 스펙 문구는 "인증 잔여 횟수", 실제 화면은 "${label}"`);
    // 5회가 아니면 오늘 이미 발송한 이력이 있는 것 — 표시 자체는 정상
    if (count !== 5) console.log(`ℹ️ 기대(초기 상태)는 5회 — 현재 ${count}회는 오늘 발송 이력이 있는 계정/IP 일 수 있음`);
    await captureEvidence(page, `인증 잔여 횟수 ${count}회`);
  });

  test('미입력 시 [재설정 메일 받기] 비활성 → 3개 항목 입력 시 활성', { annotation: tcStep(4) }, async ({ page }) => {
    const findPw = new FindPasswordPage(page);
    await findPw.navigate();

    await test.step('[검증] 미입력 상태에서 버튼 비활성', async () => {
      const disabled = await findPw.sendButton.isDisabled();
      const cls = (await findPw.sendButton.getAttribute('class')) ?? '';
      const looksDisabled = disabled || /disabled|inactive|off/i.test(cls);
      console.log(`${looksDisabled ? '✅' : '❌'} 미입력 상태 [재설정 메일 받기] — disabled=${disabled}, class="${cls}"`);
      expect(looksDisabled, '[앱오류] 미입력 상태인데 [재설정 메일 받기] 버튼이 활성 상태임').toBe(true);
    });

    await test.step('[동작/검증] 아이디·이름·이메일 입력 시 버튼 활성', async () => {
      await findPw.fillAll(WRONG.id, WRONG.name, WRONG.email);   // 활성화 여부만 확인, 클릭하지 않음
      const disabled = await findPw.sendButton.isDisabled();
      const cls = (await findPw.sendButton.getAttribute('class')) ?? '';
      console.log(`${!disabled ? '✅' : '❌'} 입력 후 [재설정 메일 받기] — disabled=${disabled}, class="${cls}"`);
      expect(disabled, '[앱오류] 세 항목을 모두 입력했는데 [재설정 메일 받기] 버튼이 비활성 상태임').toBe(false);
      await captureEvidence(page, '3개 항목 입력 시 버튼 활성');
    });
  });

  test('잘못된 정보 입력 → "회원 정보를 찾을 수 없습니다." 안내', { annotation: tcStep(5) }, async ({ page }) => {
    const findPw = new FindPasswordPage(page);
    const dialogs = collectDialogs(page);
    await findPw.navigate();

    await test.step('[동작] 가입되지 않은 아이디·이름·이메일 입력 후 [재설정 메일 받기]', async () => {
      await findPw.fillAll(WRONG.id, WRONG.name, WRONG.email);
      await findPw.clickSend();
    });

    await test.step('[검증] 안내 문구', async () => {
      const text = await findPw.readAlert(dialogs);
      console.log(`실제 안내: "${text}"`);
      expect(text, '[앱오류] 미가입 정보 입력 후 안내 문구가 뜨지 않음').not.toBe('');
      await captureEvidence(page, '미가입 정보 입력 시 안내');
      expect(text.replace(/\s+/g, ''), `[스펙 불일치] 기대 "${EXPECTED_ALERT.notFound}" / 실제 "${text}"`)
        .toContain(EXPECTED_ALERT.notFound.replace(/\s+/g, ''));
      await findPw.closeAlert();
    });

    await test.step('[동작/검증] 잘못된 형식의 이메일(a@a.aaa) 입력', async () => {
      await findPw.emailInput.fill(BAD_FORMAT_EMAIL);
      await findPw.emailInput.blur();
      await findPw.clickSend().catch(() => {});
      const text = await findPw.readAlert(dialogs, 5000);
      console.log(`잘못된 형식 이메일 입력 시 안내: "${text || '(문구 없음)'}"`);
      await captureEvidence(page, '잘못된 형식 이메일 입력');
      expect(text, '[앱오류] 잘못된 형식 이메일인데 아무 안내도 뜨지 않음').not.toBe('');
      await findPw.closeAlert();
    });
  });

  test('올바른 정보 입력 → 재설정 메일 발송 안내 · 잔여 횟수 감소', { annotation: tcStep(3, 6) }, async ({ page }) => {
    test.skip(!ALLOW_MAIL, '⚠️ 실제 재설정 메일이 발송되고 인증 잔여 횟수(5회/24시간)를 소모하는 테스트 — ALLOW_RESET_MAIL=1 일 때만 실행');
    test.skip(!ACCOUNT.id || !ACCOUNT.name || !ACCOUNT.email, '⚠️ .env 에 TEST_USERNAME / TEST_NAME / TEST_EMAIL 이 필요합니다');
    const findPw = new FindPasswordPage(page);
    const dialogs = collectDialogs(page);
    await findPw.navigate();

    const before = await findPw.remainingCount();
    await findPw.fillAll(ACCOUNT.id, ACCOUNT.name, ACCOUNT.email);
    await findPw.clickSend();

    const text = await findPw.readAlert(dialogs);
    console.log(`✅ 발송 안내: "${text}"`);
    expect(text, '[앱오류] 발송 안내 문구가 뜨지 않음').not.toBe('');
    await captureEvidence(page, '재설정 메일 발송 안내');
    await findPw.closeAlert();

    await expect.poll(() => findPw.remainingCount(), {
      message: `[앱오류] 발송 후 인증 잔여 횟수가 줄지 않음 (발송 전 ${before}회)`, timeout: 10_000,
    }).toBeLessThan(before ?? 6);
    console.log(`✅ 인증 잔여 횟수 ${before} → ${await findPw.remainingCount()}`);

    const sendDisabled = await findPw.sendButton.isDisabled();
    console.log(`${sendDisabled ? '✅' : 'ℹ️'} 발송 후 [재설정 메일 받기] 버튼 비활성: ${sendDisabled}`);
  });

  test('[취소] 버튼 클릭 → 로그인 페이지 이동', { annotation: tcStep(10) }, async ({ page }) => {
    const findPw = new FindPasswordPage(page);
    await findPw.navigate();
    await test.step('[동작] [취소] 클릭', async () => {
      await expect(findPw.cancelButton, '[앱오류] [취소] 버튼이 없음').toBeVisible();
      await findPw.cancelButton.click();
    });
    await test.step('[검증] 로그인 페이지로 이동 (관련 이슈 METADEMY-850, METADEMY-681)', async () => {
      await expect(page, '[앱오류] [취소] 클릭 후 로그인 페이지로 이동하지 않음 (METADEMY-850 / METADEMY-681)')
        .toHaveURL(/\/login/, { timeout: 10_000 });
      console.log(`✅ [취소] → 로그인 페이지 이동: ${page.url()}`);
      await captureEvidence(page, '[취소] 클릭 후 화면');
    });
  });

  // 아래 3개는 상태 준비가 필요해 자동화하지 않음 (결과서에 "왜 안 하는지"를 남기기 위한 skip)
  test('재설정 시간 만료 → [재전송] 버튼으로 변경', { annotation: tcStep(7) }, async () => {
    test.skip(true, '재설정 메일을 보낸 뒤 유효시간이 끝날 때까지 기다려야 함 — 대기 시간이 길어 자동화 제외 (수동 확인)');
  });
  test('만료된 재설정 메일의 [비밀번호 변경하기] → "잘못된 접근입니다." 알럿', { annotation: tcStep(8) }, async () => {
    test.skip(true, '메일함에 "만료된" 재설정 메일이 있어야 함 — 메일 발송 후 시간이 지나야 만들 수 있는 상태라 자동화 제외 (수동 확인)');
  });
  test('인증 잔여 횟수 소진 → 24시간 제한 알럿', { annotation: tcStep(9) }, async () => {
    test.skip(true, '잔여 횟수 5회를 모두 소진해야 하며, 소진 시 계정이 24시간 잠겨 다른 테스트가 막힘 — 자동화 제외 (담당 QA 문의 후 수동 확인)');
  });
});
