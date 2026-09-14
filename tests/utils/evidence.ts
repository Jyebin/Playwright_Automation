import { test, type Locator, type Page } from '@playwright/test';

/**
 * 결과서 TC 스텝 연결용 annotation (결과서 Step 번호 = XML step index + 1).
 *   test('제목', { annotation: tcStep(3) }, async ({ page }) => { ... })
 *   여러 스텝을 함께 검증하면 tcStep(1, 2)
 * 연결된 테스트의 결과·캡처(종료 시 화면 포함)가 결과서 해당 스텝의 "실제" 칸에 표시된다.
 */
export function tcStep(...steps: number[]) {
  return { type: 'tcstep', description: steps.join(',') };
}

/**
 * 결과서 TC 지정 annotation. describe 제목에 'T번호'가 없는 파일에서 어느 TC인지 알려줄 때 사용.
 *   test('제목', { annotation: [tcCase('T760'), tcStep(2)] }, async ({ page }) => { ... })
 */
export function tcCase(key: string) {
  return { type: 'tc', description: key };
}

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
