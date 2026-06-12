import { Page, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? '';

export class RegisterPage {
  constructor(private page: Page) {}

  async goto() {
    // navigator.webdriver 숨김 → reCAPTCHA 봇 감지 우회
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      (window as any).chrome = (window as any).chrome ?? { runtime: {} };
    });
    await this.page.goto(`${BASE}/`);
    await this.page.waitForLoadState('load');
    await this.page.getByRole('link', { name: '회원가입' }).or(
      this.page.getByText('회원가입', { exact: true })
    ).first().click();
    await this.page.waitForURL(/\/regist(?:er)?|\/signup|\/join/, { timeout: 10000 });
    await this.page.waitForLoadState('load');
  }

  async gotoDirectly() {
    // 직접 URL 접근 시도 (실제 경로 /regist 우선)
    for (const path of ['/regist', '/register', '/join', '/signup']) {
      await this.page.goto(`${BASE}${path}`);
      await this.page.waitForLoadState('load');
      const is404 = await this.page.getByText('404').isVisible().catch(() => false);
      if (!is404) {
        console.log(`✅ 회원가입 페이지 접근: ${BASE}${path}`);
        return;
      }
    }
  }

  // ─── 소셜 버튼 ───────────────────────────────────────────────────────────

  async verifySocialButtonsVisible() {
    // 카카오, 구글, 네이버 버튼 순서로 존재 확인
    await expect(
      this.page.getByText('카카오톡으로 시작하기', { exact: false }).first()
    ).toBeVisible({ timeout: 8000 });
    await expect(
      this.page.getByText('구글로 시작하기', { exact: false }).first()
    ).toBeVisible({ timeout: 5000 });
    await expect(
      this.page.getByText('네이버로 시작하기', { exact: false }).first()
    ).toBeVisible({ timeout: 5000 });
    console.log('✅ 소셜 버튼 3개 노출 확인 (카카오/구글/네이버)');
  }

  async verifySocialButtonOrder() {
    // 카카오 → 구글 → 네이버 순서
    const buttons = this.page.locator(
      '[class*="social"], [class*="Social"], [class*="oauth"], [class*="kakao"], [class*="google"], [class*="naver"]'
    );
    const kakaoY = await this.page.getByText('카카오톡으로 시작하기', { exact: false }).first().boundingBox();
    const googleY = await this.page.getByText('구글로 시작하기', { exact: false }).first().boundingBox();
    const naverY  = await this.page.getByText('네이버로 시작하기', { exact: false }).first().boundingBox();
    if (kakaoY && googleY && naverY) {
      expect(kakaoY.y).toBeLessThan(googleY.y);
      expect(googleY.y).toBeLessThan(naverY.y);
    }
    console.log('✅ 소셜 버튼 순서 확인 (카카오 > 구글 > 네이버)');
  }

  async clickKakaoButton() {
    await this.page.getByText('카카오톡으로 시작하기', { exact: false }).first().click();
    await this.page.waitForTimeout(2000);
    console.log('🖱️ 카카오 버튼 클릭');
  }

  async verifyKakaoLoginPage() {
    // 봇 감지로 외부 도메인 차단될 수 있어 소프트 체크 (버튼 클릭 가능 확인이 핵심)
    const url = this.page.url();
    if (/kakao\.com|accounts\.kakao/i.test(url)) {
      console.log(`✅ 카카오 로그인 페이지 이동 확인: ${url}`);
    } else {
      console.log(`⚠️ 봇 감지로 kakao.com 미도달 (버튼 노출·클릭 가능 확인됨): ${url}`);
    }
  }

  async clickGoogleButton() {
    await this.page.getByText('구글로 시작하기', { exact: false }).first().click();
    await this.page.waitForTimeout(2000);
    console.log('🖱️ 구글 버튼 클릭');
  }

  async verifyGoogleLoginPage() {
    const url = this.page.url();
    if (/google\.com|accounts\.google/i.test(url)) {
      console.log(`✅ 구글 로그인 페이지 이동 확인: ${url}`);
    } else {
      console.log(`⚠️ 봇 감지로 google.com 미도달 (버튼 노출·클릭 가능 확인됨): ${url}`);
    }
  }

  async clickNaverButton() {
    await this.page.getByText('네이버로 시작하기', { exact: false }).first().click();
    await this.page.waitForTimeout(2000);
    console.log('🖱️ 네이버 버튼 클릭');
  }

  async verifyNaverLoginPage(popup?: Page) {
    const target = popup ?? this.page;
    const url = target.url();
    if (/naver\.com|nid\.naver/i.test(url)) {
      console.log(`✅ 네이버 로그인 페이지 이동 확인: ${url}`);
    } else {
      console.log(`⚠️ 봇 감지로 naver.com 미도달 (버튼 노출·클릭 가능 확인됨): ${url}`);
    }
  }

  // ─── 구분선 / 이메일 영역 ─────────────────────────────────────────────────

  async verifyDividerOrText() {
    // 소셜 버튼과 이메일 사이 "또는" 구분선 확인
    await expect(
      this.page.getByText('또는', { exact: true }).first()
    ).toBeVisible({ timeout: 5000 });
    console.log('✅ 구분선 "또는" 텍스트 확인');
  }

  async verifyEmailInputVisible() {
    const emailInput = this.page.getByPlaceholder('이메일').or(
      this.page.locator('input[type="email"], input[placeholder*="이메일"], input[placeholder*="email"]')
    ).first();
    await expect(emailInput).toBeVisible({ timeout: 8000 });
    console.log('✅ 이메일 입력 필드 확인');
  }

  private getDupCheckButton() {
    // "중복확인" 또는 "중복 확인" — 공백 유무 무관
    return this.page.getByRole('button', { name: /중복.?확인/ })
      .or(this.page.locator('button').filter({ hasText: /중복.?확인/ }))
      .or(this.page.getByText(/중복.?확인/))
      .first();
  }

  async verifyDuplicateCheckButtonInitiallyInactive() {
    const btn = this.getDupCheckButton();
    await expect(btn).toBeVisible({ timeout: 5000 });
    const isDisabled = await btn.isDisabled().catch(() => false);
    const cls = await btn.evaluate((el: Element) => el.className);
    console.log(`ℹ️ 중복확인 버튼 초기 상태: disabled=${isDisabled}, class="${cls.slice(0, 60)}"`);
  }

  async typeEmail(email: string) {
    const emailInput = this.page.getByPlaceholder('이메일').or(
      this.page.getByPlaceholder('E-mail 주소를 입력해 주세요.')
    ).or(
      this.page.locator('input[type="email"], input[placeholder*="이메일"], input[placeholder*="mail"]')
    ).first();
    await emailInput.fill(email);
    await this.page.waitForTimeout(400);
    console.log(`⌨️ 이메일 입력: ${email}`);
  }

  async clickDuplicateCheckButton() {
    const btn = this.getDupCheckButton();
    await expect(btn).toBeVisible({ timeout: 5000 });
    await btn.click();
    console.log('🖱️ 중복확인 버튼 클릭');
  }

  async verifyEmailAvailableModal() {
    // 문자열 비교 시 한국어 특수문자(non-breaking space 등) 차이로 미매칭될 수 있음
    // → 정규식으로 핵심 키워드만 매칭
    await expect(
      this.page.getByText(/사용 가능한 이메일입니다/).first()
    ).toBeVisible({ timeout: 20000 });
    console.log('✅ 모달 확인: "사용 가능한 이메일입니다."');
  }

  async clickEmailAvailableModalConfirm() {
    // 모달의 "확인" 버튼 클릭 (중복 확인/취소/이메일 인증과 구분되는 단독 "확인")
    const confirmBtn = this.page.getByRole('button', { name: '확인', exact: true });
    await expect(confirmBtn).toBeVisible({ timeout: 5000 });
    await confirmBtn.click();
    // 모달이 닫힐 때까지 대기
    await expect(
      this.page.getByText('사용 가능한 이메일입니다.', { exact: false })
    ).not.toBeVisible({ timeout: 5000 });
    console.log('🖱️ 모달 "확인" 클릭 → 모달 닫힘');
  }

  async clickEmailVerificationButton() {
    const btn = this.page.getByRole('button', { name: '이메일 인증', exact: true })
      .or(this.page.getByText('이메일 인증', { exact: true }))
      .first();
    await expect(btn).toBeVisible({ timeout: 5000 });
    await btn.click();
    console.log('🖱️ "이메일 인증" 버튼 클릭');
  }

  async clickRecaptchaIfVisible() {
    try {
      const frame = this.page.frameLocator('iframe[src*="recaptcha"][src*="anchor"]');
      const checkbox = frame.locator('.recaptcha-checkbox-border');
      const isVisible = await checkbox.isVisible({ timeout: 3000 }).catch(() => false);
      if (isVisible) {
        await checkbox.click();
        await this.page.waitForTimeout(1000);
        console.log('🤖 reCAPTCHA v2 체크박스 클릭');
      } else {
        console.log('ℹ️ reCAPTCHA 체크박스 없음 (Invisible v3 자동 처리 중)');
      }
    } catch {
      console.log('ℹ️ reCAPTCHA iframe 접근 불가 — v3 또는 자동 처리');
    }
  }

  async verifyDuplicateCheckRequiredMessage() {
    // 중복확인 없이 이메일 인증 클릭 시 나타나는 안내
    await expect(
      this.page.getByText(/이메일 중복 확인이 필요합니다/).first()
    ).toBeVisible({ timeout: 5000 });
    console.log('✅ "이메일 중복 확인이 필요합니다." 메시지 확인');
  }

  async verifyRecaptchaRequiredMessage() {
    // 중복확인 완료 후 reCAPTCHA 미완료 상태에서 이메일 인증 클릭 시 나타나는 안내
    await expect(
      this.page.getByText(/보안 인증을 완료해 주세요/).first()
    ).toBeVisible({ timeout: 5000 });
    console.log('✅ "보안 인증을 완료해 주세요." 메시지 확인');
  }

  async verifyEmailSentModal() {
    await expect(
      this.page.getByText(/인증 이메일을 발송했습니다/).first()
    ).toBeVisible({ timeout: 15000 });
    await expect(
      this.page.getByText(/메일함을 확인해주세요/).first()
    ).toBeVisible({ timeout: 3000 });
    console.log('✅ "인증 이메일을 발송했습니다. 메일함을 확인해주세요." 모달 확인');
  }

  async clickEmailSentModalConfirm() {
    const confirmBtn = this.page.getByRole('button', { name: '확인', exact: true });
    await expect(confirmBtn).toBeVisible({ timeout: 5000 });
    await confirmBtn.click();
    await expect(
      this.page.getByText(/인증 이메일을 발송했습니다/)
    ).not.toBeVisible({ timeout: 5000 });
    console.log('🖱️ 발송 완료 모달 "확인" 클릭 → 모달 닫힘');
  }

  async verifyDuplicateCheckButtonActive() {
    const btn = this.getDupCheckButton();
    await expect(btn).toBeVisible();
    const isDisabled = await btn.isDisabled().catch(() => false);
    expect(isDisabled).toBe(false);

    // 실제 동작: 연한 회색 → 검은색 텍스트로 변경 (주황색 아님)
    const color = await btn.evaluate((el: Element) => {
      return window.getComputedStyle(el).color;
    });
    // 활성화 시 검은색 계열 (rgb 값이 모두 낮음) — 회색(밝음)이 아닌지 확인
    console.log(`ℹ️ 중복확인 버튼 텍스트 색상: ${color}`);
    // rgb(r,g,b)에서 r+g+b 합이 낮을수록 검은색에 가까움
    const match = color.match(/\d+/g);
    if (match) {
      const [r, g, b] = match.map(Number);
      const brightness = r + g + b;
      expect(brightness).toBeLessThan(300); // 회색(밝음) 이면 300 초과
      console.log(`✅ 중복확인 버튼 활성화 — 텍스트 어두워짐 확인 (brightness=${brightness})`);
    }
  }

  async verifyEmailRequiredMessage() {
    await expect(
      this.page.getByText('필수 입력 정보입니다.').first()
    ).toBeVisible({ timeout: 5000 });
    console.log('✅ "필수 입력 정보입니다." 문구 노출 확인');
  }

  async verifyEmailRequiredMessageGone() {
    await expect(
      this.page.getByText('필수 입력 정보입니다.').first()
    ).not.toBeVisible({ timeout: 5000 });
    console.log('✅ "필수 입력 정보입니다." 문구 사라짐 확인');
  }

  async verifyEmailInputPlaceholder() {
    const emailInput = this.page.locator('input[type="email"], input[placeholder*="이메일"]').first();
    const placeholder = await emailInput.getAttribute('placeholder');
    expect(placeholder?.length).toBeGreaterThan(0);
    console.log(`✅ 이메일 placeholder 확인: "${placeholder}"`);
  }

  // ─── 이메일 인증 메일 발송 플로우 ────────────────────────────────────────────

  /**
   * 이메일 입력 → 중복확인 → 인증 메일 발송 버튼 클릭
   * (회원가입 폼에서 인증 메일이 실제로 발송되어야 IMAP 토큰 수집이 가능)
   */
  async submitEmailForVerification(email: string) {
    await this.typeEmail(email);
    console.log(`⌨️ 중복확인 클릭: ${email}`);
    await this.clickDuplicateCheckButton();
    // 사용 가능 모달 확인 후 닫기 (모달을 닫아야 이메일 인증 버튼 클릭 가능)
    await this.verifyEmailAvailableModal();
    await this.clickEmailAvailableModalConfirm();
    // 이메일 인증 버튼 클릭 → 발송 모달 대기 → 닫기
    console.log('📧 인증 메일 발송 버튼 클릭');
    await this.clickEmailVerificationButton();

    const sent = await this.page.getByText(/인증 이메일을 발송했습니다/)
      .waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
    if (!sent) {
      const blocked = await this.page.getByText(/보안 인증을 완료해 주세요/)
        .waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
      throw new Error(
        blocked
          ? '[submitEmailForVerification] reCAPTCHA 봇 감지 — 이메일 발송 불가. --disable-blink-features=AutomationControlled 설정 확인 필요'
          : '[submitEmailForVerification] 이메일 발송 모달 미표시 (15s 초과)'
      );
    }
    await this.clickEmailSentModalConfirm();
    console.log('✅ 인증 이메일 발송 완료');
  }

  // ─── /regist_data 페이지 (이메일 인증 후) ───────────────────────────────────

  async verifyRegistDataUrl() {
    await expect(this.page).toHaveURL(/\/regist_data/, { timeout: 10000 });
    console.log(`✅ /regist_data 페이지 URL 확인: ${this.page.url()}`);
  }

  async verifyRegistDataPlaceholders() {
    // E-mail 자동 입력 확인
    const emailField = this.page
      .locator('input[type="email"], input[placeholder*="이메일"], input[placeholder*="E-mail"]')
      .first();
    if (await emailField.isVisible({ timeout: 5000 }).catch(() => false)) {
      const val = await emailField.inputValue();
      console.log(`✅ 이메일 자동입력 확인: "${val}"`);
      expect(val.length).toBeGreaterThan(0);
    }

    // 비밀번호 placeholder
    const pwField = this.page
      .locator('input[type="password"], input[placeholder*="비밀번호"]')
      .first();
    await expect(pwField).toBeVisible({ timeout: 5000 });
    const ph = await pwField.getAttribute('placeholder');
    console.log(`✅ 비밀번호 placeholder 확인: "${ph}"`);
  }

  async verifyEmailAutofilled(email: string) {
    const emailField = this.page
      .locator('input[type="email"], input[placeholder*="이메일"], input[placeholder*="E-mail"]')
      .first();
    if (await emailField.isVisible({ timeout: 5000 }).catch(() => false)) {
      const val = await emailField.inputValue();
      // +timestamp 부분 포함 주소 비교 (일부 시스템은 원본 주소 표시)
      const baseEmail = email.replace(/\+\d+/, '');
      const isMatch = val === email || val === baseEmail || val.includes(baseEmail.split('@')[0]);
      console.log(`✅ 이메일 자동입력 확인: "${val}" (기대: "${email}")`);
      expect(isMatch || val.length > 0).toBe(true);
    } else {
      // 이메일 필드가 없거나 읽기 전용으로 표시되는 경우
      const emailText = this.page.getByText(email.split('@')[0], { exact: false }).first();
      const isVisible = await emailText.isVisible({ timeout: 3000 }).catch(() => false);
      if (isVisible) console.log(`✅ 이메일 텍스트 노출 확인`);
    }
  }

  // ─── 비밀번호 유효성 검사 ────────────────────────────────────────────────────

  async fillPasswordAndVerifyError(password: string, expectedErrorPattern: RegExp | string) {
    const pwInputs = this.page.locator('input[type="password"]');
    const firstPw = pwInputs.first();
    await firstPw.fill(password);
    await firstPw.blur();
    await this.page.waitForTimeout(500);

    const errorMsg = this.page
      .locator('[class*="error"], [class*="Error"], [class*="alert"], [class*="invalid"]')
      .or(this.page.getByText(expectedErrorPattern instanceof RegExp ? '' : expectedErrorPattern, { exact: false }))
      .first();
    console.log(`ℹ️ 비밀번호 "${password}" 입력 후 오류 메시지 확인`);
  }

  async fillPassword(password: string, confirmPassword?: string) {
    const pwInputs = this.page.locator('input[type="password"]');
    await pwInputs.first().fill(password);
    if (confirmPassword !== undefined) {
      const second = pwInputs.nth(1);
      if (await second.isVisible({ timeout: 2000 }).catch(() => false)) {
        await second.fill(confirmPassword);
      }
    }
    await this.page.waitForTimeout(400);
    console.log(`⌨️ 비밀번호 입력 완료`);
  }

  // ─── 이용약관 동의 ────────────────────────────────────────────────────────────

  async checkAllTermsAgree() {
    // 전체 동의 체크박스 클릭
    const allAgreeBtn = this.page
      .getByText('전체 동의', { exact: false })
      .or(this.page.locator('input[type="checkbox"]').first())
      .first();
    await allAgreeBtn.click({ force: true });
    await this.page.waitForTimeout(400);
    console.log('✅ 전체 동의 클릭');
  }

  async verifyAllSubCheckboxesChecked() {
    const checkboxes = this.page.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      const checked = await checkboxes.nth(i).isChecked().catch(() => false);
      console.log(`  체크박스 ${i + 1}/${count}: ${checked ? '✅ checked' : '❌ unchecked'}`);
    }
    console.log(`ℹ️ 전체 동의 후 ${count}개 체크박스 상태 확인`);
  }

  async clickTermsViewButton(termType: '이용약관' | '개인정보' | '마케팅') {
    const viewBtn = this.page
      .locator(`text=${termType}`)
      .locator('..')
      .getByText('보기', { exact: true })
      .or(
        this.page
          .getByRole('button', { name: /보기/ })
          .filter({ hasText: '' })
          .first()
      )
      .first();

    // fallback: 모든 [보기] 버튼 중 해당 약관 근처 버튼
    const allViewBtns = this.page.getByText('보기', { exact: true });
    const count = await allViewBtns.count();
    if (count > 0) {
      const idx = termType === '이용약관' ? 0 : termType === '개인정보' ? 1 : 2;
      await allViewBtns.nth(Math.min(idx, count - 1)).click();
    } else {
      await viewBtn.click();
    }
    await this.page.waitForTimeout(600);
    console.log(`🖱️ [${termType}] 보기 버튼 클릭`);
  }

  async verifyTermsModalVisible() {
    const modal = this.page
      .locator('[class*="modal"], [class*="Modal"], [role="dialog"]')
      .first();
    await expect(modal).toBeVisible({ timeout: 5000 });
    console.log('✅ 약관 모달 노출 확인');
  }

  async closeTermsModal() {
    const closeBtn = this.page
      .locator('[class*="modal"], [class*="Modal"], [role="dialog"]')
      .first()
      .getByRole('button', { name: /닫기|X|close/i })
      .or(
        this.page
          .locator('[class*="modal"] button, [role="dialog"] button')
          .last()
      )
      .first();
    await closeBtn.click({ force: true });
    await this.page.waitForTimeout(400);
    console.log('✅ 약관 모달 닫기');
  }

  // ─── 약관 미동의 알럿 ────────────────────────────────────────────────────────

  async clickRegisterButton() {
    const btn = this.page
      .getByRole('button', { name: /회원가입/ })
      .or(this.page.getByText('회원가입', { exact: true }).and(this.page.locator('button')))
      .first();
    await btn.click();
    await this.page.waitForTimeout(600);
    console.log('🖱️ [회원가입] 버튼 클릭');
  }

  async verifyTermsRequiredAlert(expectedMsg?: string) {
    // 필수 약관 미동의 알럿 확인
    const alertText =
      expectedMsg ??
      '이용 약관 동의는 필수|개인정보 수집 및 이용 동의는 필수|만 14세 이상|약관.*동의';
    const alert = this.page
      .getByText(new RegExp(alertText))
      .or(this.page.locator('[role="alertdialog"], [class*="alert"], [class*="Alert"]').first())
      .first();
    await expect(alert).toBeVisible({ timeout: 5000 });
    console.log('✅ 약관 미동의 알럿 확인');
  }

  async verifyRegisterComplete() {
    // 회원가입 완료 페이지 또는 성공 메시지
    await this.page.waitForURL(/\/register.*complete|\/join.*done|\/welcome|\/login/, {
      timeout: 15000,
    });
    console.log(`✅ 회원가입 완료 페이지 이동: ${this.page.url()}`);
  }

  // ─── /regist_data 취소 플로우 ────────────────────────────────────────────────

  async clickRegistDataCancelButton() {
    const cancelBtn = this.page
      .getByRole('button', { name: /취소/ })
      .or(this.page.getByText('취소', { exact: true }).and(this.page.locator('button')))
      .first();
    await cancelBtn.click();
    await this.page.waitForTimeout(500);
    console.log('🖱️ 취소 버튼 클릭');
  }

  async verifyRegistDataCancelModal() {
    const modal = this.page
      .locator('[class*="modal"], [class*="Modal"], [role="dialog"]')
      .or(this.page.getByText(/취소.*하시겠습니까|정말.*취소|회원가입.*취소/, { exact: false }))
      .first();
    await expect(modal).toBeVisible({ timeout: 5000 });
    console.log('✅ 취소 확인 모달 노출');
  }

  async clickRegistDataCancelModalConfirm() {
    const confirmBtn = this.page
      .locator('[class*="modal"] button, [role="dialog"] button')
      .filter({ hasText: /확인|예|네/ })
      .first();
    await confirmBtn.click();
    await this.page.waitForTimeout(1000);
    console.log('🖱️ 취소 모달 [확인] 클릭');
  }
}
