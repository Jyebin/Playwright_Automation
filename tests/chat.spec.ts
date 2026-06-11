import { test, expect } from '@playwright/test';
import { ChatPage } from './pages/ChatPage';

const BASE = process.env.BASE_URL ?? '';

// T1629 - 채팅 버튼 검증
test.describe('T1629 - 채팅 버튼', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/`);
    // 채팅 위젯(Channel.io 등) 로드 대기
    await page.waitForTimeout(2000);
  });

  test('채팅 버튼 우측 하단 노출', async ({ page }) => {
    const chat = new ChatPage(page);
    await chat.verifyChatButtonVisible();
  });

  test('채팅 버튼 클릭 시 채팅창 열림', async ({ page }) => {
    const chat = new ChatPage(page);
    await chat.openChat();
    await chat.verifyChatWindowVisible();
  });

  test('채팅창 닫기 버튼 클릭 시 채팅창 닫힘', async ({ page }) => {
    const chat = new ChatPage(page);
    await chat.openChat();
    await chat.verifyChatWindowVisible();
    await chat.closeChat();
    console.log('✅ 채팅창 닫기 확인');
  });

  test('채팅 버튼 빠른 반복 클릭 시 채팅창 중복 생성 없음', async ({ page }) => {
    const chat = new ChatPage(page);
    await chat.rapidClickChatButton(5);
    await chat.verifySingleChatWindow();
  });
});
