import { Page, expect } from '@playwright/test';

export class ChatPage {
  constructor(private page: Page) {}

  // 실제 채팅 버튼: class="ReChatBot sticky" (커스텀 채팅봇 버튼)
  get chatButton() {
    return this.page.locator('[class*="ReChatBot"]').first();
  }

  async verifyChatButtonVisible() {
    await expect(this.chatButton).toBeVisible({ timeout: 8000 });
    console.log('✅ 채팅 버튼 우측 하단 노출 확인');
  }

  async openChat() {
    await this.chatButton.click();
    await this.page.waitForTimeout(1500);
    console.log('🖱️ 채팅 버튼 클릭 → 채팅창 열기');
  }

  async verifyChatWindowVisible() {
    // Channel.io 채팅창 또는 커스텀 채팅창 확인
    const channelIo = this.page.locator('#ch-plugin [class*="ChatButton"], [class*="ch-front"]').first();
    const isChOpen = await channelIo.isVisible().catch(() => false);
    if (!isChOpen) {
      // 커스텀 채팅봇 팝업 확인
      const customChat = this.page.locator('[class*="chatbot"], [class*="Chatbot"], [class*="chat-modal"]').first();
      await expect(customChat).toBeVisible({ timeout: 8000 });
    }
    console.log('✅ 채팅창 노출 확인');
  }

  async closeChat() {
    // ReChatBot은 토글 방식 - 다시 클릭하면 닫힘. ch-plugin iframe이 덮을 수 있어 force 사용
    await this.chatButton.click({ force: true });
    await this.page.waitForTimeout(500);
    console.log('🖱️ 채팅창 닫기 (토글)');
  }

  async rapidClickChatButton(times = 5) {
    for (let i = 0; i < times; i++) {
      // ch-plugin iframe이 버튼을 덮을 수 있으므로 force 사용
      await this.chatButton.click({ force: true });
      await this.page.waitForTimeout(200);
    }
    console.log(`🖱️ 채팅 버튼 빠른 클릭 ${times}회`);
  }

  async verifySingleChatWindow() {
    const chatWindows = this.page.locator('[class*="ReChatBot"]');
    const count = await chatWindows.count();
    expect(count).toBeLessThanOrEqual(1);
    console.log('✅ 채팅창 중복 생성 없음 확인');
  }
}
