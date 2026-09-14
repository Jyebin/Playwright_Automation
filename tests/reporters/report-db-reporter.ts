import type { Reporter, TestCase, TestResult, TestStep, FullResult } from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const DB_FILE = path.join(ROOT, 'test-report-db.json');
const ASSETS_DIR = path.join(ROOT, 'report-assets');   // 결과서용 캡처 이미지 (git 제외)

/*
  TC 스텝 연결 방법 (스텝별 통과 여부 + 캡처 표시용):
    test('테스트 제목', { annotation: { type: 'tcstep', description: '2' } }, async ({ page }) => { ... });
  description은 결과서의 Step 번호(1부터). 여러 스텝이면 '1,2'.
  캡처 첨부: tests/utils/evidence.ts 의 captureEvidence(page 또는 locator, '캡션')
*/

type Status = 'pass' | 'fail' | 'skip' | 'pending';

// "T416 간편인증 로그인" → "TCMETA-T416"
function extractTCKey(title: string): string | null {
  const m = title.match(/\bT(\d+)\b/);
  return m ? `TCMETA-T${m[1]}` : null;
}

function firstLine(message: string | undefined): string {
  if (!message) return '';
  const line = message.replace(/\x1b\[[0-9;]*m/g, '').split('\n').map(s => s.trim()).find(Boolean) || '';
  return line.slice(0, 300);
}

function toStatus(status: TestResult['status']): Status {
  if (status === 'passed') return 'pass';
  if (status === 'skipped') return 'skip';
  return 'fail';  // failed / timedOut / interrupted
}

// 실패 > 통과 > 스킵 순으로 우선
function aggregate(statuses: Status[]): Status {
  if (statuses.includes('fail')) return 'fail';
  if (statuses.includes('pass')) return 'pass';
  if (statuses.includes('skip')) return 'skip';
  return 'pending';
}

interface Evidence {
  name: string;
  path: string;          // ROOT 기준 상대경로 (report-assets/TCMETA-T470/xxx.png)
  status?: Status;       // step_evidence 에서만: 캡처한 테스트의 결과
  testTitle?: string;
}

interface TestEntry {
  title: string;
  status: Status;
  duration: number;
  error?: string;
  steps: { title: string; status: Status; error?: string }[];
  tcSteps: number[];
  attachments: Evidence[];
}

interface DBShape {
  specs: Record<string, unknown>;
  results: Record<string, unknown>;
  revisions?: Record<string, unknown>;
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
      parsed.results = parsed.results || {};
      return parsed;
    }
  } catch (e) {}
  return { specs: {}, results: {}, meta: {} };
}

function saveDB(db: DBShape): void {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

class ReportDBReporter implements Reporter {
  // TC 키 → (test.id → 마지막 실행 결과). 재시도 시 마지막 결과로 덮어씀
  private tcTests: Map<string, Map<string, TestEntry>> = new Map();
  // 이번 실행에서 캡처 폴더를 비운 TC (이전 실행 캡처 제거)
  private clearedTCs: Set<string> = new Set();

  onTestEnd(test: TestCase, result: TestResult): void {
    // titlePath: ['', 'chromium', 'login.spec.ts', 'T416 간편인증 로그인', '테스트 제목'] 형태
    let tcKey: string | null = null;
    for (const segment of test.titlePath().filter(Boolean)) {
      tcKey = extractTCKey(segment);
      if (tcKey) break;
    }
    if (!tcKey) return;

    const tcSteps = test.annotations
      .filter(a => a.type === 'tcstep')
      .flatMap(a => String(a.description || '').split(','))
      .map(s => parseInt(s.trim(), 10))
      .filter(n => n > 0);

    const steps = result.steps
      .filter((s: TestStep) => s.category === 'test.step')
      .map((s: TestStep) => ({
        title: s.title,
        status: (s.error ? 'fail' : 'pass') as Status,
        ...(s.error ? { error: firstLine(s.error.message) } : {}),
      }));

    const status = toStatus(result.status);
    const entry: TestEntry = {
      title: test.title,
      status,
      duration: result.duration,
      steps,
      tcSteps,
      attachments: this.saveImages(tcKey, test, result),
      ...(status === 'fail' ? { error: firstLine(result.error?.message) } : {}),
    };

    if (!this.tcTests.has(tcKey)) this.tcTests.set(tcKey, new Map());
    this.tcTests.get(tcKey)!.set(test.id, entry);
  }

  // 이미지 첨부(captureEvidence, 실패 스크린샷)를 report-assets/<TC>/ 로 복사
  private saveImages(tcKey: string, test: TestCase, result: TestResult): Evidence[] {
    const dir = path.join(ASSETS_DIR, tcKey);
    try {
      if (!this.clearedTCs.has(tcKey)) {
        fs.rmSync(dir, { recursive: true, force: true });
        this.clearedTCs.add(tcKey);
      }
      const images = result.attachments.filter(a => a.contentType.startsWith('image/') && (a.path || a.body));
      if (!images.length) return [];

      fs.mkdirSync(dir, { recursive: true });
      const safeId = test.id.replace(/[^\w-]/g, '_');
      return images.map((a, i) => {
        const file = path.join(dir, `${safeId}-r${result.retry}-${i}${a.contentType === 'image/jpeg' ? '.jpg' : '.png'}`);
        if (a.path) fs.copyFileSync(a.path, file);
        else fs.writeFileSync(file, a.body!);
        return {
          name: a.name === 'screenshot' ? '실패 시 화면' : a.name,
          path: path.relative(ROOT, file).split(path.sep).join('/'),
        };
      });
    } catch (e) {
      console.error(`[ReportDB] 캡처 저장 실패 (${tcKey}):`, e);
      return [];
    }
  }

  async onEnd(_result: FullResult): Promise<void> {
    if (this.tcTests.size === 0) return;

    let db: DBShape;
    try {
      db = loadDB();
    } catch (e) {
      console.error('[ReportDB] DB 로드 실패:', e);
      return;
    }

    const now = new Date().toISOString();
    for (const [tcKey, testMap] of this.tcTests) {
      const tests = [...testMap.values()];
      const counts = { pass: 0, fail: 0, skip: 0 };
      tests.forEach(t => { if (t.status !== 'pending') counts[t.status]++; });

      const parts: string[] = [];
      if (counts.pass > 0) parts.push(`통과 ${counts.pass}개`);
      if (counts.fail > 0) parts.push(`실패 ${counts.fail}개`);
      if (counts.skip > 0) parts.push(`스킵 ${counts.skip}개`);
      const summary = `[자동화] ${parts.join(' / ')}`;

      const errors = tests.filter(t => t.error).map(t => `${t.title}: ${t.error}`);
      const actualResult = errors.length > 0
        ? `${summary}\n실패 내용:\n${errors.slice(0, 3).join('\n')}`
        : summary;

      // 스텝 번호별 결과/캡처 집계 (tcstep annotation이 있는 테스트만)
      const byStep: Record<number, Status[]> = {};
      const stepEvidence: Record<string, Evidence[]> = {};
      tests.forEach(t => t.tcSteps.forEach(n => {
        (byStep[n] = byStep[n] || []).push(t.status);
        t.attachments.forEach(a => {
          (stepEvidence[n] = stepEvidence[n] || []).push({ ...a, status: t.status, testTitle: t.title });
        });
      }));
      const stepStatus: Record<string, Status> = {};
      Object.entries(byStep).forEach(([n, list]) => { stepStatus[n] = aggregate(list); });

      db.results[tcKey] = {
        status: aggregate(tests.map(t => t.status)),
        actual_result: actualResult,
        tests,
        step_status: stepStatus,
        step_evidence: stepEvidence,
        run_at: now,
        updated_at: now,
        auto_synced: true,
      };
    }

    try {
      saveDB(db);
      console.log(`\n[ReportDB] ✅ 결과 자동 저장: ${this.tcTests.size}개 TC → test-report-db.json`);
      console.log('[ReportDB] 결과 확인: http://localhost:9998');
    } catch (e) {
      console.error('[ReportDB] DB 저장 실패:', e);
    }
  }
}

export default ReportDBReporter;
