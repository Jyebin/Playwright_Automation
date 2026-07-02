import { test } from '@playwright/test';
import { CorporateInquiryPage } from './pages/CorporateInquiryPage';

const BASE = process.env.BASE_URL ?? '';

// ─────────────────────────────────────────────────────────────────────────────
// 단체 문의 (/corporate-inquiry)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('단체 문의', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/corporate-inquiry`);
    await page.waitForLoadState('load');
  });

  // ── URL / 페이지 진입 ────────────────────────────────────────────────────

  test('단체 문의 페이지 URL 확인', async ({ page }) => {
    const corp = new CorporateInquiryPage(page);
    await test.step('[검증] 단체 문의 URL 확인', async () => {
      await corp.verifyUrl();
    });
  });

  // ── 텍스트 필드 존재 및 placeholder 확인 ────────────────────────────────

  test('이름(담당자) 입력 필드 노출 확인', async ({ page }) => {
    const corp = new CorporateInquiryPage(page);
    await test.step('[검증] 이름 필드 노출 확인', async () => {
      await corp.verifyNameFieldVisible();
    });
  });

  test('기관명/회사명 입력 필드 노출 확인', async ({ page }) => {
    const corp = new CorporateInquiryPage(page);
    await test.step('[검증] 기관명 필드 노출 확인', async () => {
      await corp.verifyOrganizationFieldVisible();
    });
  });

  test('이메일 입력 필드 노출 확인', async ({ page }) => {
    const corp = new CorporateInquiryPage(page);
    await test.step('[검증] 이메일 필드 노출 확인', async () => {
      await corp.verifyEmailFieldVisible();
    });
  });

  test('전화번호 입력 필드 노출 확인', async ({ page }) => {
    const corp = new CorporateInquiryPage(page);
    await test.step('[검증] 전화번호 필드 노출 확인', async () => {
      await corp.verifyPhoneFieldVisible();
    });
  });

  test('문의내용 textarea 노출 확인', async ({ page }) => {
    const corp = new CorporateInquiryPage(page);
    await test.step('[검증] 문의내용 textarea 노출 확인', async () => {
      await corp.verifyContentFieldVisible();
    });
  });

  test('제출 버튼 노출 확인', async ({ page }) => {
    const corp = new CorporateInquiryPage(page);
    await test.step('[검증] 제출 버튼 노출 확인', async () => {
      await corp.verifySubmitButtonVisible();
    });
  });

  // ── 필드 입력 동작 확인 ──────────────────────────────────────────────────

  test('각 텍스트 필드에 값 입력 가능 확인', async ({ page }) => {
    const corp = new CorporateInquiryPage(page);
    await test.step('[셋업] 각 필드 값 입력', async () => {
      await corp.fillName('테스트 담당자');
      await corp.fillOrganization('테스트 기관');
      await corp.fillEmail('test@example.com');
      await corp.fillPhone('010-1234-5678');
      await corp.fillContent('단체 문의 자동화 테스트 내용입니다.');
    });
    await test.step('[검증] 제출 버튼 노출 확인 (입력 후 버튼 활성 여부)', async () => {
      await corp.verifySubmitButtonVisible();
    });
  });

  // ── 등록 (실제 데이터 생성 — 운영 중 주석 유지) ─────────────────────────

  // test('단체 문의 접수 완료 — 접수 완료 메시지 확인', async ({ page }) => {
  //   const corp = new CorporateInquiryPage(page);
  //   await test.step('[셋업] 모든 필수 항목 입력 후 제출', async () => {
  //     await corp.navigate();
  //     await corp.fillName('테스트 담당자');
  //     await corp.fillOrganization('테스트 기관');
  //     await corp.fillEmail('test@example.com');
  //     await corp.fillPhone('010-1234-5678');
  //     await corp.fillContent('Playwright 자동화 테스트로 작성된 단체 문의입니다.');
  //     await corp.clickSubmitButton();
  //   });
  //   await test.step('[검증] 접수 완료 페이지 확인', async () => {
  //     await corp.verifySubmitSuccessPage();
  //   });
  // });
});
