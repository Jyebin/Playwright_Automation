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

// ─── 이슈 제목 ───────────────────────────────────────────────────────────────
// 형식: [메타데미][WebView][PC] {describe 블록} - {테스트 이름}
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
function para(...inlineNodes: object[]) {
  return { type: 'paragraph', content: inlineNodes };
}
function blankLine() {
  return para(plain(' '));
}

// ─── 이슈 본문 (ADF) ─────────────────────────────────────────────────────────
function buildDescription(test: TestCase, result: TestResult): object {
  const errorText = (result.error?.message ?? '알 수 없는 오류')
    .replace(/\x1b\[[0-9;]*m/g, '')   // ANSI 색상 코드 제거
    .split('\n')
    .slice(0, 8)
    .join('\n');

  // 재현순서: test.titlePath() 계층 → 순서 목록 (파일명 제외)
  const steps = test.titlePath()
    .filter(Boolean)
    .slice(1)   // 파일명 제외
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
        content: steps.length > 0 ? steps : [{
          type: 'listItem',
          content: [para(plain(test.title))],
        }],
      },
      blankLine(),

      // [실제결과]
      para(bold('[실제결과]')),
      para(plain(errorText)),
      para(plain('※ 캡처본: 하단 첨부파일 참조')),
      blankLine(),

      // [기대결과]
      para(bold('[기대결과]')),
      para(plain('테스트가 정상적으로 통과되어야 합니다.')),
      blankLine(),

      // [참고사항]
      para(bold('[참고사항]')),
      para(plain(`테스트 파일: ${path.basename(test.location.file)}:${test.location.line}`)),
    ],
  };
}

// ─── Jira API 호출 ───────────────────────────────────────────────────────────
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
      Authorization:        authHeader(),
      'X-Atlassian-Token':  'no-check',
    },
    body: form,
  });

  if (!res.ok) {
    console.error(`[JiraReporter] 첨부 실패 (${res.status}): ${await res.text()}`);
  } else {
    console.log(`[JiraReporter] 📎 스크린샷 첨부: ${fileName}`);
  }
}

// ─── Reporter 클래스 ─────────────────────────────────────────────────────────
class JiraReporter implements Reporter {
  async onTestEnd(test: TestCase, result: TestResult): Promise<void> {
    if (result.status !== 'failed') return;

    // 환경변수 미설정 시 조용히 건너뜀
    if (!JIRA_URL || !JIRA_EMAIL || !JIRA_TOKEN || !PROJECT_KEY) {
      return;
    }

    const issueId = await createIssue(test, result);
    if (!issueId) return;

    // playwright.config.ts의 screenshot: 'only-on-failure' 로 저장된 파일 첨부
    const screenshots = result.attachments.filter(
      a => a.name === 'screenshot' && a.path && fs.existsSync(a.path)
    );
    for (const s of screenshots) {
      await attachScreenshot(issueId, s.path!);
    }
  }
}

export default JiraReporter;
