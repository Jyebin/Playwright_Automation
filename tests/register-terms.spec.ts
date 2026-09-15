import { test, expect } from '@playwright/test';
import { tcStep, captureEvidence } from './utils/evidence';
import { findLatestVerificationToken } from './helpers/emailHelper';

// 회원가입 약관 화면은 세션 없이 실행
test.use({ storageState: { cookies: [], origins: [] } });

const BASE = process.env.BASE_URL ?? '';

// ─────────────────────────────────────────────────────────────────────────────
// T758 Step 3 — 약관 [보기] 모달 (이용약관 / 개인정보 수집 및 이용 / 마케팅 수신)
//
// 진입 방법: 새 인증 메일을 보내지 않고 메일함에 이미 받은 인증 링크(/regist_data?token=…)를 재사용.
//   토큰이 만료돼도 /regist_data 화면(약관 동의 영역 포함)은 그대로 렌더링됨 (이메일 자동입력만 비어 있음).
// register.spec.ts 는 파일 전체가 serial 모드라 앞 테스트가 실패하면 이 테스트들이 실행되지 않고,
//   그 파일의 T758 beforeAll 은 인증 메일을 실제로 발송함 → 별도 파일로 분리 (결과서는 제목의 T758 로 연결).
// ⚠️ 약관 동의 체크·[회원가입] 제출은 하지 않음 — 모달 열기/닫기만.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('T758 - 이용약관 동의 · 약관 [보기] 모달 (Step 3)', () => {
  let token = '';

  test.beforeAll(async () => {
    test.setTimeout(60_000);
    const found = await findLatestVerificationToken().catch((e: Error) => {
      console.warn(`[T758 Step 3] IMAP 조회 실패: ${e.message}`);
      return null;
    });
    if (!found) return;
    token = found.token;
    const expired = !!found.expiresAt && found.expiresAt.getTime() < Date.now();
    console.log(
      `[T758 Step 3] 메일함의 기존 인증 링크 재사용 (새 메일 발송 없음) — 수신 ${found.receivedAt?.toISOString() ?? '?'}, ` +
      `만료 ${found.expiresAt?.toISOString() ?? '?'} → ${expired ? '만료된 토큰 (화면 진입에는 영향 없음)' : '유효한 토큰'}`,
    );
  });

  test.beforeEach(async ({ page }) => {
    test.skip(!token, '⚠️ 메일함에 회원가입 인증 메일(/regist_data 링크)이 없음 — 인증 메일을 1회 발송(수동) 후 실행');
    await page.goto(`${BASE}/regist_data?token=${token}`);
    await page.waitForLoadState('load');
    await expect(
      page.locator('.terms-box').filter({ hasText: '약관동의' }), // 입력 폼 박스도 .terms-box 클래스라 약관동의 박스로 한정
      '[환경] 인증 링크로 약관 동의 화면에 진입하지 못함 (토큰 거부 가능성 — 새 인증 메일 필요)',
    ).toBeVisible({ timeout: 15_000 });
  });

  // modalTitle: 모달 상단(본문 첫 줄)에 있어야 하는 제목. 이용약관 모달은 제목이 없는 것이 정상(null)
  const TERMS = [
    { label: '라온 메타데미 이용약관', title: '[필수] 라온 메타데미 이용약관', content: /본 약관|제1조/, mustScroll: true, modalTitle: null },
    { label: '개인정보 수집 및 이용 동의', title: '[필수] 개인정보 수집 및 이용 동의', content: /개인정보 수집 및 이용/, mustScroll: false, modalTitle: '개인정보 수집 및 이용 동의' },
    { label: '마케팅 정보 수신 동의', title: '[선택] 마케팅 정보 수신 동의', content: /마케팅 정보 수신/, mustScroll: false, modalTitle: '마케팅 정보 수신 동의' },
  ];

  for (const term of TERMS) {
    test(`${term.title} [보기] — 약관 모달 노출·레이아웃·스크롤·X 닫힘 확인`, { annotation: tcStep(3) }, async ({ page }) => {
      const row = page.locator('.terms-box .input-item').filter({ hasText: term.label });
      const viewBtn = row.locator('.more', { hasText: '[보기]' });
      const modal = page.locator('#TermsModal');
      const dialog = modal.locator('.modal-dialog');
      const body = dialog.locator('.modal-body');
      const closeBtn = dialog.locator('.modal-header svg');

      // 모달이 떠 있는 동안의 console error 수집
      const consoleErrors: string[] = [];
      let recording = false;
      page.on('console', msg => { if (recording && msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)); });
      page.on('pageerror', err => { if (recording) consoleErrors.push(`pageerror: ${err.message.slice(0, 200)}`); });

      await test.step(`[동작] ${term.title} [보기] 클릭`, async () => {
        await expect(row, `[UI/셀렉터] "${term.label}" 약관 행을 찾을 수 없음`).toHaveCount(1);
        await expect(viewBtn, `[UI/셀렉터] "${term.label}" [보기] 버튼이 보이지 않음`).toBeVisible();
        recording = true;
        await viewBtn.click();
      });

      await test.step('[검증] 약관 모달 노출 및 클릭한 약관 내용 표시', async () => {
        await expect(dialog, `[앱오류] ${term.title} [보기] 클릭 후 약관 모달이 뜨지 않음`).toBeVisible({ timeout: 5000 });
        await expect(body, `[앱오류] 모달에 ${term.title} 내용이 표시되지 않음`).toContainText(term.content, { timeout: 5000 });
        // 열림 애니메이션이 끝나 모달 위치·크기가 고정될 때까지 대기
        let prev = '';
        await expect.poll(async () => {
          const cur = JSON.stringify(await dialog.boundingBox());
          const stable = cur === prev;
          prev = cur;
          return stable;
        }, { message: '[앱오류] 약관 모달 위치/크기가 안정되지 않음', intervals: [200], timeout: 5000 }).toBe(true);
        console.log(`✅ ${term.title} 약관 모달 노출 — 본문 시작: "${(await body.innerText()).trim().replace(/\s+/g, ' ').slice(0, 30)}…"`);
      });

      await test.step('[검증] 화면 구성 — 뷰포트/가로 넘침/요소 겹침/본문 영역/이미지', async () => {
        const m = await dialog.evaluate((dlg) => {
          const box = (r: DOMRect) => ({ x: Math.round(r.left), y: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) });
          const firstTextRect = (root: Element) => {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.textContent ?? '').trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP });
            const node = walker.nextNode();
            if (!node) return null;
            const range = document.createRange();
            range.selectNodeContents(node);
            return { text: (node.textContent ?? '').trim().slice(0, 30), rect: range.getBoundingClientRect() };
          };
          const header = dlg.querySelector('.modal-header')!;
          const bodyEl = dlg.querySelector('.modal-body') as HTMLElement;
          const contentEl = bodyEl.querySelector('.content') as HTMLElement | null;
          const close = header.querySelector('svg')!;
          const headerTitle = firstTextRect(header);
          const title = headerTitle ?? firstTextRect(bodyEl); // 헤더에 제목 텍스트가 없으면 본문 첫 제목을 제목으로 사용
          const dlgRect = dlg.getBoundingClientRect();
          const bodyRect = bodyEl.getBoundingClientRect();
          const closeRect = close.getBoundingClientRect();
          const cx = closeRect.left + closeRect.width / 2;
          const cy = closeRect.top + closeRect.height / 2;
          const topAtClose = document.elementFromPoint(cx, cy);
          return {
            viewport: { w: window.innerWidth, h: window.innerHeight },
            dialog: box(dlgRect),
            body: box(bodyRect),
            close: box(closeRect),
            closeOnTop: !!topAtClose && (topAtClose === close || close.contains(topAtClose)),
            titleInHeader: !!headerTitle,
            titleText: title?.text ?? '',
            title: title ? box(title.rect) : null,
            overflowX: [
              { name: '모달', sw: dlg.scrollWidth, cw: dlg.clientWidth },
              { name: '본문', sw: bodyEl.scrollWidth, cw: bodyEl.clientWidth },
              ...(contentEl ? [{ name: '본문 content', sw: contentEl.scrollWidth, cw: contentEl.clientWidth }] : []),
            ],
            scroll: { sh: bodyEl.scrollHeight, ch: bodyEl.clientHeight, overflowY: getComputedStyle(bodyEl).overflowY },
            images: [...dlg.querySelectorAll('img')].map(img => ({ src: img.getAttribute('src')?.slice(-60) ?? '', naturalWidth: img.naturalWidth })),
          };
        });

        const overlap = (a: { x: number; y: number; r: number; b: number }, b: { x: number; y: number; r: number; b: number }) =>
          Math.min(a.r, b.r) - Math.max(a.x, b.x) > 1 && Math.min(a.b, b.b) - Math.max(a.y, b.y) > 1;
        const inside = (inner: { x: number; y: number; r: number; b: number }, outer: { x: number; y: number; r: number; b: number }) =>
          inner.x >= outer.x - 1 && inner.y >= outer.y - 1 && inner.r <= outer.r + 1 && inner.b <= outer.b + 1;

        console.log(`✅ 뷰포트 ${m.viewport.w}x${m.viewport.h}, 모달 (${m.dialog.x},${m.dialog.y})~(${m.dialog.r},${m.dialog.b}) ${m.dialog.w}x${m.dialog.h}`);
        console.log(`✅ 가로 넘침: ${m.overflowX.map(o => `${o.name} scrollWidth ${o.sw}/clientWidth ${o.cw}`).join(', ')}`);
        console.log(`✅ 요소 위치: 제목 "${m.titleText}"${m.titleInHeader ? '' : ' (헤더에 제목 텍스트 없음 → 본문 첫 제목 기준)'} ${JSON.stringify(m.title)}, 본문 ${JSON.stringify(m.body)}, X 버튼 ${JSON.stringify(m.close)} (X 최상단 노출 ${m.closeOnTop})`);
        console.log(`✅ 본문 세로: scrollHeight ${m.scroll.sh} / clientHeight ${m.scroll.ch} (overflow-y: ${m.scroll.overflowY}), 이미지 ${m.images.length}개`);

        expect(inside(m.dialog, { x: 0, y: 0, r: m.viewport.w, b: m.viewport.h }),
          `[앱오류] 약관 모달이 화면(뷰포트 ${m.viewport.w}x${m.viewport.h}) 밖으로 벗어남: ${JSON.stringify(m.dialog)}`).toBe(true);
        for (const o of m.overflowX) {
          expect(o.sw, `[앱오류] ${o.name}에 가로 넘침 발생 (scrollWidth ${o.sw} > clientWidth ${o.cw})`).toBeLessThanOrEqual(o.cw + 1);
        }
        expect(m.body.w > 0 && m.body.h > 0, '[앱오류] 약관 모달 본문이 보이지 않음').toBe(true);
        expect(m.close.w > 0 && m.close.h > 0 && m.closeOnTop, '[앱오류] 약관 모달 X 버튼이 보이지 않거나 다른 요소에 가려짐').toBe(true);
        // 모달 제목: 개인정보·마케팅은 제목이 있어야 하고, 이용약관은 제목이 없는 것이 정상
        if (term.modalTitle) {
          expect(m.title && m.title.w > 0 && m.title.h > 0, `[앱오류] ${term.title} 모달에 제목이 보이지 않음`).toBe(true);
          expect(m.titleText, `[앱오류] ${term.title} 모달 제목이 "${term.modalTitle}" 이 아님 (실제 첫 줄: "${m.titleText}")`).toContain(term.modalTitle);
          expect(overlap(m.title!, m.close), `[앱오류] 약관 모달 제목과 X 버튼이 겹침`).toBe(false);
          console.log(`✅ 모달 제목 "${m.titleText}" 노출 (기대 제목: "${term.modalTitle}")`);
        } else {
          console.log(`✅ ${term.title} 모달은 별도 제목 없음 (기대대로) — 본문 첫 줄 "${m.titleText}"`);
        }
        expect(overlap(m.body, m.close), `[앱오류] 약관 모달 본문과 X 버튼이 겹침`).toBe(false);
        if (m.titleInHeader) expect(overlap(m.title!, m.body), '[앱오류] 약관 모달 제목과 본문이 겹침').toBe(false);
        expect(inside(m.body, m.dialog), `[앱오류] 약관 본문이 모달 밖으로 넘침: 본문 ${JSON.stringify(m.body)} / 모달 ${JSON.stringify(m.dialog)}`).toBe(true);
        for (const img of m.images) {
          expect(img.naturalWidth, `[앱오류] 약관 모달 이미지 로드 실패: ${img.src}`).toBeGreaterThan(0);
        }
        await captureEvidence(dialog, `${term.title} 약관 모달`);
      });

      await test.step('[검증] 본문 스크롤', async () => {
        const { sh, ch } = await body.evaluate(el => ({ sh: el.scrollHeight, ch: el.clientHeight }));
        if (sh > ch + 1) {
          await body.hover();
          await page.mouse.wheel(0, 800);
          await expect.poll(() => body.evaluate(el => el.scrollTop), {
            message: `[앱오류] ${term.title} 본문이 길지만(scrollHeight ${sh} > clientHeight ${ch}) 스크롤되지 않음`, timeout: 3000,
          }).toBeGreaterThan(0);
          const scrollTop = await body.evaluate(el => el.scrollTop);
          console.log(`✅ 본문 스크롤 가능 — 휠 스크롤 후 scrollTop 0 → ${Math.round(scrollTop)} (scrollHeight ${sh} / clientHeight ${ch})`);
          await captureEvidence(dialog, `${term.title} 약관 모달 — 스크롤 후`);
        } else {
          expect(term.mustScroll, `[앱오류] ${term.title} 본문이 스크롤되지 않음 (scrollHeight ${sh} <= clientHeight ${ch})`).toBe(false);
          console.log(`✅ 본문이 모달 안에 모두 표시됨 — 스크롤 불필요 (scrollHeight ${sh} / clientHeight ${ch})`);
        }
      });

      await test.step('[동작/검증] X 버튼 클릭 → 모달 닫힘', async () => {
        expect(consoleErrors, `[앱오류] 약관 모달이 떠 있는 동안 console error 발생: ${consoleErrors.join(' | ')}`).toEqual([]);
        console.log('✅ 모달 표시 중 console error 없음');
        await closeBtn.click();
        recording = false;
        await expect(modal, '[앱오류] X 버튼 클릭 후 약관 모달이 닫히지 않음').toBeHidden({ timeout: 5000 });
        await expect(page, '[앱오류] 모달을 닫은 뒤 회원가입 화면을 벗어남').toHaveURL(/\/regist_data/);
        await expect(row, '[앱오류] 모달을 닫은 뒤 약관 동의 영역이 보이지 않음').toBeVisible();
        console.log(`✅ X 버튼 클릭 → 약관 모달 닫힘, 약관 동의 화면 유지`);
      });
    });
  }
});
