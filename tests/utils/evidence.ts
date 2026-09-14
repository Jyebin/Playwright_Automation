import { test, type Locator, type Page } from '@playwright/test';

/**
 * 결과서 "📸 실제 결과"에 표시할 캡처를 현재 테스트에 첨부한다.
 * report-db-reporter가 이미지를 report-assets/ 로 복사하고 결과서 스텝에 연결한다.
 *
 * 결과서 스텝과 연결하려면 테스트에 tcstep annotation 지정:
 *   test('제목', { annotation: { type: 'tcstep', description: '4' } }, async ({ page }) => { ... })
 *
 * @param target 캡처 대상 — 페이지 전체(Page) 또는 특정 영역(Locator)
 * @param name   결과서에 표시할 캡션
 */
export async function captureEvidence(target: Page | Locator, name: string): Promise<void> {
  const body = 'goto' in target
    ? await target.screenshot({ animations: 'disabled' })
    : await target.screenshot({ animations: 'disabled' });
  await test.info().attach(name, { body, contentType: 'image/png' });
}
