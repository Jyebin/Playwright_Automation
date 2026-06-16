import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';

// ─── 환경변수 ────────────────────────────────────────────────────────────────
const JIRA_URL       = (process.env.JIRA_URL       ?? '').replace(/\/$/, '');
const JIRA_EMAIL     = process.env.JIRA_EMAIL       ?? '';
const JIRA_TOKEN     = process.env.JIRA_TOKEN       ?? '';
const PROJECT_KEY    = process.env.JIRA_PROJECT_KEY ?? '';
const FRONT_VERSION  = process.env.FRONT_VERSION    ?? '미지정';
const CHROME_VERSION = process.env.CHROME_VERSION   ?? 'Chromium (Playwright)';

function authHeader() {
  return 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64');
}

// ─── 로케이터 → 한국어 설명 ──────────────────────────────────────────────────
function locatorToKorean(locatorStr: string): string {
  const s = locatorStr.trim();

  // getByText('텍스트') → "텍스트"
  const textMatch = s.match(/getByText\(['"](.+?)['"]/);
  if (textMatch) return `"${textMatch[1]}"`;

  // getByRole('button', { name: '확인' }) → "확인" 버튼
  const roleNameMatch = s.match(/getByRole\(['"](\w+)['"]\s*,\s*\{[^}]*name:\s*['"](.+?)['"]/);
  if (roleNameMatch) {
    const roleKo: Record<string, string> = {
      button: '버튼', link: '링크', textbox: '입력 필드',
      checkbox: '체크박스', combobox: '드롭다운', heading: '제목', row: '행',
    };
    return `"${roleNameMatch[2]}" ${roleKo[roleNameMatch[1]] ?? roleNameMatch[1]}`;
  }

  // getByRole('button') → 버튼
  const roleMatch = s.match(/getByRole\(['"](\w+)['"]\)/);
  if (roleMatch) {
    const roleKo: Record<string, string> = {
      button: '버튼', link: '링크', textbox: '입력 필드', checkbox: '체크박스',
    };
    return roleKo[roleMatch[1]] ?? roleMatch[1];
  }

  // getByPlaceholder('...') → "..." 입력 필드
  const phMatch = s.match(/getByPlaceholder\(['"](.+?)['"]/);
  if (phMatch) return `"${phMatch[1]}" 입력 필드`;

  // getByLabel('...') → "..." 레이블 필드
  const labelMatch = s.match(/getByLabel\(['"](.+?)['"]/);
  if (labelMatch) return `"${labelMatch[1]}" 필드`;

  // class 키워드 기반 의미 추출
  if (/dropdown/i.test(s))  return '드롭다운 목록';
  if (/modal|dialog/i.test(s)) return '모달 창';
  if (/button/i.test(s))    return '버튼';
  if (/input|textbox/i.test(s)) return '입력 필드';
  if (/checkbox/i.test(s))  return '체크박스';
  if (/h6.*button|button.*h6/i.test(s)) return 'X(삭제) 버튼';

  // 그 외: locator 문자열 앞부분만 노출
  return `"${s.substring(0, 50)}"`;
}

// ─── Playwright 에러 → 한국어 실제결과 / 기대결과 ─────────────────────────────
interface KoreanResult {
  actual: string;
  expected: string;
}

function parseErrorToKorean(test: TestCase, result: TestResult): KoreanResult {
  const raw = (result.error?.message ?? '').replace(/\x1b\[[0-9;]*m/g, '');

  // ── toBeVisible() failed ──
  const visibleFail = raw.match(
    /expect\((?:locator|received)\)\.toBeVisible\(\) failed[\s\S]*?Locator:\s*(.+?)(?:\n|$)/
  );
  if (visibleFail) {
    const elem = locatorToKorean(visibleFail[1]);
    return {
      actual:   `${elem} 요소가 화면에 표시되지 않았습니다.`,
      expected: `${elem} 요소가 화면에 표시되어야 합니다.`,
    };
  }

  // ── not.toBeVisible() failed ──
  const notVisibleFail = raw.match(
    /expect\((?:locator|received)\)\.not\.toBeVisible\(\) failed[\s\S]*?Locator:\s*(.+?)(?:\n|$)/
  );
  if (notVisibleFail) {
    const elem = locatorToKorean(notVisibleFail[1]);
    return {
      actual:   `${elem} 요소가 여전히 화면에 표시되어 있습니다.`,
      expected: `${elem} 요소가 화면에서 사라져야 합니다.`,
    };
  }

  // ── toHaveURL() failed ──
  const urlFail = raw.match(
    /expect\(page\)\.toHaveURL\(\) failed[\s\S]*?Expected.*?:\s*(.+?)(?:\n)[\s\S]*?Received.*?:\s*(.+?)(?:\n|$)/
  );
  if (urlFail) {
    return {
      actual:   `페이지가 "${urlFail[2].trim()}" URL에 머물렀습니다.`,
      expected: `페이지가 "${urlFail[1].trim()}" URL로 이동되어야 합니다.`,
    };
  }

  // ── toHaveText() failed ──
  const textFail = raw.match(
    /expect\(locator\)\.toHaveText\(\) failed[\s\S]*?Expected.*?:\s*(.+?)(?:\n)[\s\S]*?Received.*?:\s*(.+?)(?:\n|$)/
  );
  if (textFail) {
    return {
      actual:   `화면에 "${textFail[2].trim()}" 텍스트가 표시되었습니다.`,
      expected: `"${textFail[1].trim()}" 텍스트가 표시되어야 합니다.`,
    };
  }

  // ── toBeGreaterThan() failed (값 비어있음) ──
  if (/toBeGreaterThan/.test(raw)) {
    return {
      actual:   '입력 필드가 비어있습니다.',
      expected: '입력 필드에 값이 자동 입력되어 있어야 합니다.',
    };
  }

  // ── Timeout / locator not found ──
  if (/Timeout|timeout/.test(raw) && /waiting for/.test(raw)) {
    const waitMatch = raw.match(/waiting for (.+?)(?:\n|$)/);
    const elem = waitMatch ? locatorToKorean(waitMatch[1]) : '요소';
    return {
      actual:   `${elem} 요소가 지정된 시간 내에 나타나지 않았습니다.`,
      expected: `${elem} 요소가 일정 시간 내에 화면에 표시되어야 합니다.`,
    };
  }

  // ── Target closed (페이지 이탈) ──
  if (/Target closed|target closed/.test(raw)) {
    return {
      actual:   '동작 중 페이지가 예상치 않게 닫혔거나 이동되었습니다.',
      expected: '동작이 완료될 때까지 현재 페이지에 머물러야 합니다.',
    };
  }

  // ── 커스텀 에러 (throw new Error('...')) ──
  const customErr = raw.match(/^Error:\s*(.+?)(?:\n|$)/);
  if (customErr) {
    return {
      actual:   customErr[1].trim(),
      expected: `"${test.title}" 동작이 정상적으로 완료되어야 합니다.`,
    };
  }

  // ── fallback ──
  return {
    actual:   raw.split('\n').filter(Boolean).slice(0, 2).join(' '),
    expected: `"${test.title}" 테스트가 통과되어야 합니다.`,
  };
}

// ─── 이슈 제목 ───────────────────────────────────────────────────────────────
function buildSummary(test: TestCase): string {
  const parts = test.titlePath().filter(Boolean);
  const describe = parts.slice(0, -1).join(' > ');
  const title    = parts[parts.length - 1];
  return `[메타데미][WebView][PC] ${describe} - ${title}`;
}

// ─── Jira ADF 헬퍼 ──────────────────────────────────────────────────────────
function bold(text: string) {
  return { type: 'text', text, marks: [{ type: 'strong' }] };
}
function plain(text: string) {
  return { type: 'text', text };
}
function para(...nodes: object[]) {
  return { type: 'paragraph', content: nodes };
}
function blankLine() {
  return para(plain(' '));
}

// ─── 이슈 본문 (ADF) ─────────────────────────────────────────────────────────
function buildDescription(test: TestCase, result: TestResult): object {
  const { actual, expected } = parseErrorToKorean(test, result);

  const steps = test.titlePath()
    .filter(Boolean)
    .slice(1)
    .map((step, i) => ({
      type: 'listItem',
      content: [para(plain(`${i + 1}. ${step}`))],
    }));

  return {
    type: 'doc',
    version: 1,
    content: [
      // [테스트 환경]
      para(bold('[테스트 환경]')),
      para(plain(`Chrome ${CHROME_VERSION} / Front ${FRONT_VERSION}`)),
      blankLine(),

      // [재현순서]
      para(bold('[재현순서]')),
      {
        type: 'orderedList',
        content: steps.length > 0 ? steps : [
          { type: 'listItem', content: [para(plain(test.title))] },
        ],
      },
      blankLine(),

      // [실제결과]
      para(bold('[실제결과]')),
      para(plain(actual)),
      para(plain('※ 캡처본: 하단 첨부파일 참조')),
      blankLine(),

      // [기대결과]
      para(bold('[기대결과]')),
      para(plain(expected)),
      blankLine(),

      // [참고사항]
      para(bold('[참고사항]')),
      para(plain(`테스트 파일: ${path.basename(test.location.file)}:${test.location.line}`)),
    ],
  };
}

// ─── Jira API ────────────────────────────────────────────────────────────────
async function createIssue(test: TestCase, result: TestResult): Promise<string | null> {
  const res = await fetch(`${JIRA_URL}/rest/api/3/issue`, {
    method: 'POST',
    headers: {
      Authorization:  authHeader(),
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
    body: JSON.stringify({
      fields: {
        project:     { key: PROJECT_KEY },
        summary:     buildSummary(test),
        description: buildDescription(test, result),
        issuetype:   { name: 'Bug' },
      },
    }),
  });

  if (!res.ok) {
    console.error(`[JiraReporter] 이슈 생성 실패 (${res.status}): ${await res.text()}`);
    return null;
  }

  const data = await res.json() as { key: string; id: string };
  console.log(`[JiraReporter] ✅ 이슈 생성: ${JIRA_URL}/browse/${data.key}`);
  return data.id;
}

async function attachScreenshot(issueId: string, screenshotPath: string): Promise<void> {
  const buffer   = fs.readFileSync(screenshotPath);
  const fileName = path.basename(screenshotPath);

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'image/png' }), fileName);

  const res = await fetch(`${JIRA_URL}/rest/api/3/issue/${issueId}/attachments`, {
    method: 'POST',
    headers: {
      Authorization:       authHeader(),
      'X-Atlassian-Token': 'no-check',
    },
    body: form,
  });

  if (!res.ok) {
    console.error(`[JiraReporter] 첨부 실패 (${res.status}): ${await res.text()}`);
  } else {
    console.log(`[JiraReporter] 📎 스크린샷 첨부: ${fileName}`);
  }
}

// ─── Reporter ────────────────────────────────────────────────────────────────
class JiraReporter implements Reporter {
  async onTestEnd(test: TestCase, result: TestResult): Promise<void> {
    if (result.status !== 'failed') return;

    if (!JIRA_URL || !JIRA_EMAIL || !JIRA_TOKEN || !PROJECT_KEY) {
      return;
    }

    const issueId = await createIssue(test, result);
    if (!issueId) return;

    const screenshots = result.attachments.filter(
      a => a.name === 'screenshot' && a.path && fs.existsSync(a.path)
    );
    for (const s of screenshots) {
      await attachScreenshot(issueId, s.path!);
    }
  }
}

export default JiraReporter;
