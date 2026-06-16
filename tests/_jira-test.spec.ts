import { test, expect } from '@playwright/test';

// Jira 리포터 연동 테스트용 — 실행 후 삭제
test.describe('대시보드 - empty case 확인', () => {
  test('실습 콘텐츠 둘러보기 버튼이 노출되어야 함', async ({ page }) => {
    await page.goto(process.env.BASE_URL + '/');
    await page.waitForLoadState('load');
    // 존재하지 않는 요소를 찾아 의도적으로 실패
    await expect(
      page.getByText('실습 콘텐츠 둘러보기', { exact: true }).first()
    ).toBeVisible({ timeout: 5000 });
  });
});
