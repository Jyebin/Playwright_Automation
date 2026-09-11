import type { Reporter, TestCase, TestResult, FullResult } from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';

const DB_FILE = path.resolve(__dirname, '../../test-report-db.json');

// "T416 간편인증 로그인" → "TCMETA-T416"
function extractTCKey(title: string): string | null {
  const m = title.match(/\bT(\d+)\b/);
  return m ? `TCMETA-T${m[1]}` : null;
}

interface TCCounts {
  pass: number;
  fail: number;
  skip: number;
  testTitles: string[];
  errorMessages: string[];
}

interface DBShape {
  specs: Record<string, unknown>;
  results: Record<string, {
    status: string;
    actual_result: string;
    step_results: unknown[];
    notes: string;
    updated_at: string;
    auto_synced?: boolean;
  }>;
  meta: Record<string, unknown>;
}

function loadDB(): DBShape {
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')) as DBShape & { test_cases?: unknown };
      if (parsed.test_cases && !parsed.specs) {
        parsed.specs = parsed.test_cases as Record<string, unknown>;
        delete parsed.test_cases;
      }
      return parsed;
    }
  } catch (e) {}
  return { specs: {}, results: {}, meta: {} };
}

function saveDB(db: DBShape): void {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

class ReportDBReporter implements Reporter {
  private tcCounts: Map<string, TCCounts> = new Map();

  onTestEnd(test: TestCase, result: TestResult): void {
    // titlePath: ['', 'T416 간편인증 로그인', '테스트 제목'] 형태
    const titlePath = test.titlePath().filter(Boolean);
    if (titlePath.length === 0) return;

    // 모든 경로 세그먼트에서 TC 키 추출 (최상위 describe 우선)
    let tcKey: string | null = null;
    for (const segment of titlePath) {
      tcKey = extractTCKey(segment);
      if (tcKey) break;
    }
    if (!tcKey) return;

    if (!this.tcCounts.has(tcKey)) {
      this.tcCounts.set(tcKey, { pass: 0, fail: 0, skip: 0, testTitles: [], errorMessages: [] });
    }

    const counts = this.tcCounts.get(tcKey)!;
    counts.testTitles.push(test.title);

    if (result.status === 'passed') {
      counts.pass++;
    } else if (result.status === 'failed' || result.status === 'timedOut') {
      counts.fail++;
      if (result.error?.message) {
        const cleanMsg = result.error.message.replace(/\x1b\[[0-9;]*m/g, '').split('\n')[0].trim();
        if (cleanMsg) counts.errorMessages.push(`${test.title}: ${cleanMsg}`);
      }
    } else if (result.status === 'skipped') {
      counts.skip++;
    }
  }

  async onEnd(_result: FullResult): Promise<void> {
    if (this.tcCounts.size === 0) return;

    let db: DBShape;
    try {
      db = loadDB();
    } catch (e) {
      console.error('[ReportDB] DB 로드 실패:', e);
      return;
    }

    let savedCount = 0;
    for (const [tcKey, counts] of this.tcCounts) {
      let status: 'pass' | 'fail' | 'skip' | 'pending';
      if (counts.fail > 0)        status = 'fail';
      else if (counts.pass > 0)   status = 'pass';
      else if (counts.skip > 0)   status = 'skip';
      else                        status = 'pending';

      const parts: string[] = [];
      if (counts.pass > 0)  parts.push(`통과 ${counts.pass}개`);
      if (counts.fail > 0)  parts.push(`실패 ${counts.fail}개`);
      if (counts.skip > 0)  parts.push(`스킵 ${counts.skip}개`);
      const summary = `[자동화] ${parts.join(' / ')}`;

      const actualResult = counts.errorMessages.length > 0
        ? `${summary}\n실패 내용:\n${counts.errorMessages.slice(0, 3).join('\n')}`
        : summary;

      const existing = db.results[tcKey] || { step_results: [], notes: '' };

      db.results[tcKey] = {
        status,
        actual_result: actualResult,
        step_results: existing.step_results || [],
        notes: existing.notes || '',
        updated_at: new Date().toISOString(),
        auto_synced: true,
      };

      savedCount++;
    }

    try {
      saveDB(db);
      console.log(`\n[ReportDB] ✅ 결과 자동 저장: ${savedCount}개 TC → test-report-db.json`);
      console.log('[ReportDB] 결과 확인: http://localhost:9998');
    } catch (e) {
      console.error('[ReportDB] DB 저장 실패:', e);
    }
  }
}

export default ReportDBReporter;
