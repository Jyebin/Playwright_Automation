#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9998;
const ROOT = __dirname;
const DB_FILE = path.join(ROOT, 'test-report-db.json');

// ─── XML 탐색 ──────────────────────────────────────────────────────────────────
function findXMLFiles() {
  const dirs = [ROOT, path.join(ROOT, 'tests')];
  const files = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      fs.readdirSync(dir).filter(f => f.endsWith('.xml'))
        .forEach(f => files.push(path.join(dir, f)));
    } catch (e) {}
  }
  return files;
}

// ─── DB ────────────────────────────────────────────────────────────────────────
/*
  DB 구조:
  {
    specs: {                          // XML 원본 스펙 (동기화 시 덮어씀)
      "TCMETA-T416": {
        key, name, folder, objective, precondition, priority,
        steps: [{ index, description, expectedResult, testData }],
        issues: [{ key, summary }],
        synced_at
      }
    },
    results: {                        // 자동화 실행 결과 (report-db-reporter.ts가 기록)
      "TCMETA-T416": {
        status: "pending"|"pass"|"fail"|"skip",
        actual_result: "",            // 요약 + 실패 메시지
        tests: [{ title, status, duration, error, steps: [{ title, status, error }], tcSteps: [1, 2] }],
        step_status: { "1": "pass" }, // TC 스텝 번호(1부터) → 결과
        run_at, updated_at, auto_synced
      }
    },
    revisions: {                      // 사용자가 입력한 수정결과 (XML 동기화에도 유지)
      "TCMETA-T416": {
        "0": { expectedResult, original, updated_at, code_applied, applied_at }   // 키는 스텝 index(0부터)
      }
    },
    meta: { last_sync, files }
  }
*/
function loadDB() {
  let db = {};
  try {
    if (fs.existsSync(DB_FILE)) {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      // 마이그레이션: test_cases → specs
      if (db.test_cases && !db.specs) {
        db.specs = db.test_cases;
        delete db.test_cases;
      }
    }
  } catch (e) { console.error('DB 로드 오류:', e.message); }

  db.specs = db.specs || {};
  db.results = db.results || {};
  db.revisions = db.revisions || {};
  db.meta = db.meta || { last_sync: null, files: [] };

  // 마이그레이션: 수동 판정 필드 제거 (결과는 자동화 실행으로만 판정)
  for (const r of Object.values(db.results)) {
    delete r.step_results;
    delete r.notes;
  }
  return db;
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

// ─── HTML 정제 ────────────────────────────────────────────────────────────────
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '$1')
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '$1')
    .replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1')
    .replace(/<span[^>]*>([\s\S]*?)<\/span>/gi, '$1')
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n')
    .replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, '$1\n')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
    .replace(/<td[^>]*>([\s\S]*?)<\/td>/gi, ' $1 |')
    .replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, '$1\n')
    .replace(/<table[\s\S]*?<\/table>/gi, m =>
      m.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim())
    .replace(/<img[^>]*alt="([^"]+)"[^>]*>/gi, (_, alt) => alt ? `[이미지: ${alt}]` : '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#160;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getCDATA(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  if (!m) return '';
  const inner = m[1];
  const cd = inner.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return cd ? cd[1] : inner.replace(/<!\[CDATA\[|\]\]>/g, '').trim();
}

// ─── XML 파싱 ─────────────────────────────────────────────────────────────────
function parseTestCases(xmlContent) {
  const cases = [];
  const tcRe = /<testCase\s[^>]*key="([^"]+)"[^>]*>([\s\S]*?)<\/testCase>/g;
  let m;

  while ((m = tcRe.exec(xmlContent)) !== null) {
    const [, key, content] = m;

    const name        = stripHtml(getCDATA(content, 'name'));
    const folder      = stripHtml(getCDATA(content, 'folder'));
    const objective   = stripHtml(getCDATA(content, 'objective'));
    const precondition = stripHtml(getCDATA(content, 'precondition'));
    const priority    = stripHtml(getCDATA(content, 'priority'));

    // 이슈
    const issues = [];
    const issueRe = /<issue>([\s\S]*?)<\/issue>/g;
    let im;
    while ((im = issueRe.exec(content)) !== null) {
      const ikey = (getCDATA(im[1], 'key') || im[1].match(/<key>([^<]+)<\/key>/)?.[1] || '').trim();
      const isummary = stripHtml(getCDATA(im[1], 'summary'));
      if (ikey) issues.push({ key: ikey, summary: isummary });
    }

    // 스텝
    const steps = [];
    const stepsBlock = content.match(/<steps>([\s\S]*?)<\/steps>/);
    if (stepsBlock) {
      const stepRe = /<step\s+index="(\d+)">([\s\S]*?)<\/step>/g;
      let sm;
      while ((sm = stepRe.exec(stepsBlock[1])) !== null) {
        const [, idx, sc] = sm;
        const description   = stripHtml(getCDATA(sc, 'description'));
        const expectedResult = stripHtml(getCDATA(sc, 'expectedResult'));
        const testData       = stripHtml(getCDATA(sc, 'testData'));
        if (description || expectedResult) {
          steps.push({ index: parseInt(idx, 10), description, expectedResult, testData: testData || '' });
        }
      }
    }

    if (key && name) {
      cases.push({ key, name, folder, objective, precondition, priority, steps, issues });
    }
  }
  return cases;
}

// ─── XML → DB 동기화 ──────────────────────────────────────────────────────────
function syncXML() {
  const xmlFiles = findXMLFiles();
  const db = loadDB();
  let newCount = 0;

  for (const xmlPath of xmlFiles) {
    try {
      const content = fs.readFileSync(xmlPath, 'utf-8');
      const cases = parseTestCases(content);

      for (const tc of cases) {
        if (!db.specs[tc.key]) newCount++;
        // 스펙은 XML 원본으로 갱신 — 사용자 수정결과는 db.revisions에 따로 보존됨
        db.specs[tc.key] = { ...tc, synced_at: new Date().toISOString() };
        if (!db.results[tc.key]) db.results[tc.key] = makeEmptyResult();
      }
    } catch (e) {
      console.error(`XML 파싱 오류 [${path.basename(xmlPath)}]:`, e.message);
    }
  }

  db.meta = { last_sync: new Date().toISOString(), files: xmlFiles.map(f => path.basename(f)) };
  saveDB(db);
  return { total: Object.keys(db.specs).length, new: newCount, files: xmlFiles.length };
}

function makeEmptyResult() {
  return { status: 'pending', actual_result: '', tests: [], step_status: {}, updated_at: '' };
}

// ─── 통계 ────────────────────────────────────────────────────────────────────
function getStats(db) {
  const keys = Object.keys(db.specs);
  const statusOf = k => (db.results[k] && db.results[k].status) || 'pending';
  return {
    total: keys.length,
    pass: keys.filter(k => statusOf(k) === 'pass').length,
    fail: keys.filter(k => statusOf(k) === 'fail').length,
    pending: keys.filter(k => statusOf(k) === 'pending').length,
    skip: keys.filter(k => statusOf(k) === 'skip').length,
    revised: keys.filter(k => Object.values(db.revisions[k] || {}).some(v => !v.code_applied)).length,
  };
}

// ─── HTML ─────────────────────────────────────────────────────────────────────
// 주의: 아래는 JS 템플릿 리터럴이므로 브라우저 코드의 백슬래시는 두 번(\\) 써야 함
const HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>테스트 결과서</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg:       #f5f7fa;
  --s1:       #ffffff;
  --s2:       #f1f5f9;
  --s3:       #e8edf4;
  --s4:       #dde4ee;
  --bd:       #e2e8f0;
  --bd2:      #cbd5e1;
  --tx:       #1e293b;
  --tx2:      #475569;
  --tx3:      #94a3b8;
  --ac:       #6366f1;
  --ac2:      #4f46e5;
  --pass:     #16a34a;
  --fail:     #dc2626;
  --pend:     #64748b;
  --skip:     #d97706;
  --pass-bg:  #dcfce7;
  --fail-bg:  #fee2e2;
  --pend-bg:  #f1f5f9;
  --skip-bg:  #fef3c7;
  --shadow:   0 1px 4px rgba(0,0,0,.07);
  --r:        10px;
}
html,body{height:100%;background:var(--bg);color:var(--tx);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Malgun Gothic',sans-serif;}
body{display:flex;flex-direction:column;height:100vh;overflow:hidden;}

/* Header */
.hdr{background:var(--s1);border-bottom:1px solid var(--bd);padding:0 28px;height:64px;display:flex;align-items:center;gap:16px;flex-shrink:0;box-shadow:var(--shadow);}
.hdr h1{font-size:18px;font-weight:800;color:var(--ac);letter-spacing:-.4px;}
.hdr-sub{font-size:12px;color:var(--tx3);background:var(--s2);padding:4px 10px;border-radius:20px;}
.hdr-sp{flex:1;}
.sync-btn{background:var(--ac);border:none;color:#fff;padding:10px 22px;border-radius:var(--r);font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:8px;transition:all .15s;box-shadow:0 2px 8px rgba(99,102,241,.3);}
.sync-btn:hover{background:var(--ac2);box-shadow:0 4px 12px rgba(99,102,241,.4);}
.sync-btn:disabled{opacity:.5;cursor:not-allowed;box-shadow:none;}
.sdot{width:8px;height:8px;border-radius:50%;background:#a5f3fc;flex-shrink:0;}
.sdot.spin{animation:spin .8s linear infinite;}
@keyframes spin{to{transform:rotate(360deg);}}

/* Stats bar */
.stats{background:var(--s1);border-bottom:1px solid var(--bd);padding:14px 28px;display:flex;align-items:center;gap:12px;flex-shrink:0;flex-wrap:wrap;}
.sc{display:flex;align-items:center;gap:14px;background:var(--s1);border:2px solid var(--bd);border-radius:var(--r);padding:12px 20px;cursor:pointer;transition:all .15s;min-width:120px;box-shadow:var(--shadow);}
.sc:hover{border-color:var(--ac);box-shadow:0 2px 8px rgba(99,102,241,.12);}
.sc.active{border-color:var(--ac);background:#eef2ff;box-shadow:0 2px 8px rgba(99,102,241,.15);}
.sc-icon{font-size:20px;}
.sc-body{display:flex;flex-direction:column;gap:2px;}
.sc-lbl{font-size:11px;color:var(--tx3);font-weight:600;text-transform:uppercase;letter-spacing:.4px;}
.sc-num{font-size:26px;font-weight:800;line-height:1;}
.sc-num.t{color:var(--tx);}
.sc-num.p{color:var(--pass);}
.sc-num.f{color:var(--fail);}
.sc-num.u{color:var(--pend);}
.sc-num.s{color:var(--skip);}
.sc-num.r{color:#b45309;}

/* Toolbar */
.toolbar{background:var(--s1);border-bottom:1px solid var(--bd);padding:10px 28px;display:flex;align-items:center;gap:12px;flex-shrink:0;flex-wrap:wrap;}
.search{background:var(--s2);border:2px solid var(--bd);color:var(--tx);padding:9px 16px;border-radius:var(--r);font-size:14px;width:280px;max-width:100%;outline:none;transition:border-color .15s;}
.search:focus{border-color:var(--ac);background:#fff;}
.search::placeholder{color:var(--tx3);}
.fsel{background:var(--s2);border:2px solid var(--bd);color:var(--tx);padding:9px 14px;border-radius:var(--r);font-size:13px;cursor:pointer;outline:none;transition:border-color .15s;}
.fsel:focus{border-color:var(--ac);}
.tb-sp{flex:1;}
.rcnt{font-size:13px;color:var(--tx3);background:var(--s2);padding:6px 14px;border-radius:20px;}
.rcnt strong{color:var(--tx2);font-weight:700;}

/* Table wrap */
.tw{flex:1;overflow:auto;}
.tw::-webkit-scrollbar{width:6px;}
.tw::-webkit-scrollbar-track{background:var(--s2);}
.tw::-webkit-scrollbar-thumb{background:var(--bd2);border-radius:4px;}

table{width:100%;border-collapse:collapse;font-size:14px;}
thead{position:sticky;top:0;z-index:10;background:var(--s2);}
thead th{padding:12px 16px;text-align:left;font-size:11px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--bd);white-space:nowrap;}

/* TC row */
.tr{border-bottom:1px solid var(--bd);cursor:pointer;transition:background .1s;}
.tr:hover td{background:#f8faff;}
.tr.open td{background:#f0f4ff;}
.tr td{padding:13px 16px;vertical-align:middle;}

/* Status badge */
.badge{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:20px;font-size:12px;font-weight:700;white-space:nowrap;}
.b-pass{background:var(--pass-bg);color:var(--pass);}
.b-fail{background:var(--fail-bg);color:var(--fail);}
.b-pending{background:var(--pend-bg);color:var(--pend);border:1px solid var(--bd);}
.b-skip{background:var(--skip-bg);color:var(--skip);}
.b-unmapped{background:#fff;color:var(--tx3);border:1px dashed var(--bd2);}

.tc-key{font-size:12px;font-weight:700;color:var(--ac);background:#eef2ff;padding:2px 8px;border-radius:6px;display:inline-block;}
.tc-nm{font-weight:600;color:var(--tx);line-height:1.4;font-size:14px;}
.tc-obj{font-size:12px;color:var(--tx2);margin-top:3px;max-width:380px;}
.tc-folder{font-size:12px;color:var(--tx3);background:var(--s2);padding:2px 8px;border-radius:6px;display:inline-block;}
.tc-actual{font-size:12px;color:var(--tx2);max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.tc-actual.empty{color:var(--tx3);font-style:italic;}
.arrow{font-size:10px;color:var(--tx3);transition:transform .2s;display:inline-block;}
.tr.open .arrow{transform:rotate(90deg);}

/* Detail row */
.dc{padding:0 20px 24px 48px;background:#f8faff;border-bottom:3px solid var(--bd);}
.di{max-width:1400px;}

/* Precondition / 실행 결과 */
.pre-box{background:#f0f4ff;border:1px solid #c7d2fe;border-radius:var(--r);padding:12px 16px;font-size:13px;color:var(--ac2);margin:14px 0 18px;}
.pre-lbl{font-size:11px;font-weight:700;color:var(--ac);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;}
.run-box{background:var(--s1);border:1px solid var(--bd);border-radius:var(--r);padding:12px 16px;margin:14px 0 18px;box-shadow:var(--shadow);}
.run-item{display:flex;gap:12px;align-items:flex-start;padding:8px 0;border-top:1px dashed var(--bd);}
.run-item:first-of-type{border-top:none;}
.run-body{flex:1;min-width:0;}
.run-title{font-size:13px;font-weight:600;color:var(--tx);}
.run-map{font-size:11px;color:var(--ac);font-weight:700;margin-left:6px;}
.run-steps{font-size:12px;color:var(--tx2);margin-top:4px;line-height:1.6;}
.run-err{font-family:Consolas,'D2Coding',monospace;font-size:12px;color:var(--fail);background:var(--fail-bg);border-radius:6px;padding:6px 10px;margin-top:6px;white-space:pre-wrap;word-break:break-word;}
.run-empty{font-size:13px;color:var(--tx3);white-space:pre-wrap;line-height:1.6;}

/* Steps */
.steps{display:flex;flex-direction:column;gap:8px;margin-bottom:20px;}
.step{background:var(--s1);border:1px solid var(--bd);border-radius:var(--r);overflow:hidden;box-shadow:var(--shadow);}
.step-head{display:flex;align-items:center;gap:10px;padding:12px 16px;background:var(--s2);border-bottom:1px solid var(--bd);}
.step-num{background:var(--ac);color:#fff;border-radius:6px;font-size:11px;font-weight:700;padding:3px 10px;white-space:nowrap;}
.step-title{font-size:13px;font-weight:600;color:var(--tx);}
.step-body{padding:4px 16px 14px;}

.spec-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;padding:12px 0 4px;}
.sg-col{display:flex;flex-direction:column;gap:6px;min-width:0;}
.sg-lbl{font-size:11px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.4px;display:flex;align-items:center;gap:6px;}
.sg-txt{font-size:13px;color:var(--tx2);line-height:1.7;white-space:pre-wrap;word-break:break-word;}
.sg-txt.exp{color:#166534;background:#dcfce7;padding:8px 12px;border-radius:6px;}
.sg-txt.exp.old{color:var(--tx3);background:var(--s2);text-decoration:line-through;}
.test-data{background:var(--s2);border-radius:6px;padding:6px 10px;font-size:12px;color:var(--tx3);margin-top:4px;white-space:pre-wrap;border:1px solid var(--bd);}

/* 수정결과 */
.rev-ta{background:#fff;border:2px solid var(--bd);color:var(--tx);padding:10px 12px;border-radius:var(--r);font-size:13px;line-height:1.6;resize:vertical;min-height:84px;font-family:inherit;outline:none;width:100%;transition:border-color .15s;}
.rev-ta:focus{border-color:var(--ac);}
.rev-ta::placeholder{color:var(--tx3);}
.rev-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.rev-save{background:var(--ac);color:#fff;border:none;padding:8px 18px;border-radius:var(--r);font-size:13px;font-weight:700;cursor:pointer;transition:background .15s;}
.rev-save:hover{background:var(--ac2);}
.rev-save:disabled{opacity:.45;cursor:not-allowed;}
.tag{font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;white-space:nowrap;text-transform:none;letter-spacing:0;}
.tag-wait{background:#fef3c7;color:#b45309;}
.tag-done{background:var(--pass-bg);color:#166534;}
.tag-old{background:var(--s3);color:var(--tx2);}
.upd-time{font-size:12px;color:var(--tx3);}

/* Issues */
.issue-row{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0;}
.itag{background:#fee2e2;border:1px solid #fca5a5;color:#991b1b;border-radius:6px;font-size:11px;padding:3px 10px;font-weight:600;}

/* Empty */
.empty{display:none;flex-direction:column;align-items:center;justify-content:center;padding:80px 24px;text-align:center;gap:14px;}
.empty.show{display:flex;}
.empty-icon{font-size:56px;}
.empty-title{font-size:20px;font-weight:700;color:var(--tx);}
.empty-sub{font-size:14px;color:var(--tx3);}
.empty-btn{background:var(--ac);color:#fff;border:none;padding:13px 32px;border-radius:var(--r);font-size:15px;font-weight:700;cursor:pointer;margin-top:10px;transition:all .15s;box-shadow:0 2px 8px rgba(99,102,241,.3);}
.empty-btn:hover{background:var(--ac2);box-shadow:0 4px 14px rgba(99,102,241,.4);}

/* Toast */
.toast{position:fixed;bottom:28px;right:28px;background:var(--tx);color:#fff;padding:12px 20px;border-radius:var(--r);font-size:14px;font-weight:600;opacity:0;transform:translateY(8px);transition:all .25s;z-index:999;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,.15);}
.toast.show{opacity:1;transform:translateY(0);}
.toast.ok{background:#166534;}
.toast.err{background:#991b1b;}

/* Progress */
.prog{height:3px;background:var(--ac);width:0%;transition:width .4s;position:fixed;top:0;left:0;z-index:1000;}

@media (max-width:900px){
  .spec-grid{grid-template-columns:1fr;}
  .dc{padding:0 12px 20px;}
}
</style>
</head>
<body>

<div class="prog" id="prog"></div>

<!-- Header -->
<header class="hdr">
  <h1>📋 테스트 결과서</h1>
  <span class="hdr-sub" id="hdr-sub">로딩 중...</span>
  <div class="hdr-sp"></div>
  <button class="sync-btn" id="sync-btn" onclick="doSync()">
    <span class="sdot" id="sdot"></span>XML 동기화
  </button>
</header>

<!-- Stats -->
<div class="stats">
  <div class="sc active" data-f="all" onclick="setFilter('all')">
    <span class="sc-icon">📊</span>
    <div class="sc-body"><span class="sc-lbl">전체</span><span class="sc-num t" id="sn-t">0</span></div>
  </div>
  <div class="sc" data-f="pass" onclick="setFilter('pass')">
    <span class="sc-icon">✅</span>
    <div class="sc-body"><span class="sc-lbl">통과</span><span class="sc-num p" id="sn-p">0</span></div>
  </div>
  <div class="sc" data-f="fail" onclick="setFilter('fail')">
    <span class="sc-icon">❌</span>
    <div class="sc-body"><span class="sc-lbl">실패</span><span class="sc-num f" id="sn-f">0</span></div>
  </div>
  <div class="sc" data-f="pending" onclick="setFilter('pending')">
    <span class="sc-icon">⏳</span>
    <div class="sc-body"><span class="sc-lbl">미실행</span><span class="sc-num u" id="sn-u">0</span></div>
  </div>
  <div class="sc" data-f="skip" onclick="setFilter('skip')">
    <span class="sc-icon">⏭️</span>
    <div class="sc-body"><span class="sc-lbl">스킵</span><span class="sc-num s" id="sn-s">0</span></div>
  </div>
  <div class="sc" data-f="revised" onclick="setFilter('revised')">
    <span class="sc-icon">✏️</span>
    <div class="sc-body"><span class="sc-lbl">코드 반영 대기</span><span class="sc-num r" id="sn-r">0</span></div>
  </div>
</div>

<!-- Toolbar -->
<div class="toolbar">
  <input class="search" id="search" type="text" placeholder="🔍  TC 번호 / 이름 / 목적 검색" oninput="applyFilters()">
  <select class="fsel" id="fsel" onchange="applyFilters()">
    <option value="">전체 폴더</option>
  </select>
  <div class="tb-sp"></div>
  <span class="rcnt"><strong id="rcnt">0</strong>개 표시</span>
</div>

<!-- Table -->
<div class="tw" id="tw">
  <div class="empty" id="empty">
    <div class="empty-icon">📂</div>
    <div class="empty-title">테스트 케이스가 없습니다</div>
    <div class="empty-sub">XML 파일에서 TC를 불러오세요</div>
    <button class="empty-btn" onclick="doSync()">지금 XML 동기화</button>
  </div>
  <table id="tbl" style="display:none">
    <thead><tr>
      <th style="width:36px"></th>
      <th style="width:90px">통과 여부</th>
      <th style="width:130px">TC 번호</th>
      <th>테스트 케이스 / 목적</th>
      <th style="width:240px">자동화 결과</th>
      <th style="width:90px">수정결과</th>
      <th style="width:170px">폴더</th>
      <th style="width:54px;text-align:center">스텝</th>
    </tr></thead>
    <tbody id="tbody"></tbody>
  </table>
</div>

<div class="toast" id="toast"></div>

<script>
var cases = [];
var results = {};
var revisions = {};
var curFilter = 'all';
var expandedKey = null;
var toastTimer = null;

var LABEL = { pass:'통과', fail:'실패', pending:'미실행', skip:'스킵', unmapped:'미연결' };
var ICON  = { pass:'✓', fail:'✗', pending:'○', skip:'–', unmapped:'·' };

// 행 토글 / 수정결과 저장 (이벤트 위임 — 인라인 onclick에 TC 키를 넣지 않음)
document.getElementById('tbody').addEventListener('click', function(e) {
  var saveBtn = e.target.closest('.rev-save');
  if (saveBtn) { saveRevision(saveBtn.dataset.key, parseInt(saveBtn.dataset.idx, 10)); return; }
  if (e.target.closest('textarea, button, a, .dr')) return;
  var tr = e.target.closest('tr.tr');
  if (tr) toggleRow(tr.dataset.key);
});

loadData();

function loadData() {
  fetch('/api/cases')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      cases     = data.cases     || [];
      results   = data.results   || {};
      revisions = data.revisions || {};
      updateStats(data.stats || {});
      buildFolderOptions();
      applyFilters();
      var meta = data.meta || {};
      document.getElementById('hdr-sub').textContent = meta.last_sync
        ? '마지막 동기화: ' + fmtDate(meta.last_sync) + '  |  ' + (meta.files || []).length + '개 파일 · TC ' + cases.length + '개'
        : 'XML 동기화가 필요합니다';
    })
    .catch(function(e) { toast('로드 실패: ' + e.message, 'err'); });
}

// ── 통계 ───────────────────────────────────────────────────
function updateStats(s) {
  document.getElementById('sn-t').textContent = s.total   || 0;
  document.getElementById('sn-p').textContent = s.pass    || 0;
  document.getElementById('sn-f').textContent = s.fail    || 0;
  document.getElementById('sn-u').textContent = s.pending || 0;
  document.getElementById('sn-s').textContent = s.skip    || 0;
  document.getElementById('sn-r').textContent = s.revised || 0;
}

function pendingRevCount(key) {
  var revs = revisions[key] || {};
  return Object.keys(revs).filter(function(i) { return !revs[i].code_applied; }).length;
}

// ── 폴더 드롭다운 ──────────────────────────────────────────
function buildFolderOptions() {
  var sel = document.getElementById('fsel');
  var cur = sel.value;
  var folders = Array.from(new Set(cases.map(function(c) { return c.folder; }).filter(Boolean))).sort();
  sel.innerHTML = '<option value="">전체 폴더</option>';
  folders.forEach(function(f) {
    var o = document.createElement('option');
    o.value = f; o.textContent = f;
    sel.appendChild(o);
  });
  sel.value = cur;
}

// ── 필터 ──────────────────────────────────────────────────
function setFilter(f) {
  curFilter = f;
  document.querySelectorAll('.sc').forEach(function(c) { c.classList.toggle('active', c.dataset.f === f); });
  applyFilters();
}

function applyFilters() {
  var q      = (document.getElementById('search').value || '').toLowerCase();
  var folder = document.getElementById('fsel').value;

  var vis = cases.filter(function(tc) {
    var status = (results[tc.key] || {}).status || 'pending';
    if (curFilter === 'revised') { if (!pendingRevCount(tc.key)) return false; }
    else if (curFilter !== 'all' && status !== curFilter) return false;
    if (folder && tc.folder !== folder) return false;
    if (q && (tc.key + ' ' + tc.name + ' ' + tc.objective).toLowerCase().indexOf(q) === -1) return false;
    return true;
  });

  renderTable(vis);
  document.getElementById('rcnt').textContent = vis.length;
  document.getElementById('empty').classList.toggle('show', cases.length === 0);
  document.getElementById('tbl').style.display = cases.length === 0 ? 'none' : '';
}

// ── 테이블 렌더 ────────────────────────────────────────────
function renderTable(list) {
  var html = '';
  list.forEach(function(tc) {
    var r       = results[tc.key] || {};
    var status  = r.status || 'pending';
    var open    = expandedKey === tc.key;
    var summary = (r.actual_result || '').split('\\n')[0];
    var revN    = pendingRevCount(tc.key);

    html += '<tr class="tr' + (open ? ' open' : '') + '" data-key="' + eh(tc.key) + '">';
    html += '<td><span class="arrow">▶</span></td>';
    html += '<td>' + badge(status) + '</td>';
    html += '<td><div class="tc-key">' + eh(tc.key) + '</div></td>';
    html += '<td><div class="tc-nm">' + eh(tc.name) + '</div>' + (tc.objective ? '<div class="tc-obj">' + eh(tc.objective) + '</div>' : '') + '</td>';
    html += '<td><div class="tc-actual' + (summary ? '' : ' empty') + '">' + (summary ? eh(summary) : '실행 기록 없음') + '</div></td>';
    html += '<td>' + (revN ? '<span class="tag tag-wait">대기 ' + revN + '</span>' : '') + '</td>';
    html += '<td><div class="tc-folder">' + eh(tc.folder || '') + '</div></td>';
    html += '<td style="text-align:center;color:var(--tx3);font-size:11px">' + (tc.steps ? tc.steps.length : 0) + '</td>';
    html += '</tr>';

    if (open) {
      html += '<tr class="dr open"><td class="dc" colspan="8">' + buildDetail(tc, r) + '</td></tr>';
    }
  });
  document.getElementById('tbody').innerHTML = html;
}

// ── 상세 패널 ──────────────────────────────────────────────
function buildDetail(tc, r) {
  var key  = tc.key;
  var html = '<div class="di">';

  if (tc.precondition) {
    html += '<div class="pre-box"><div class="pre-lbl">전제조건</div><div>' + enl(tc.precondition) + '</div></div>';
  }

  if (tc.issues && tc.issues.length) {
    html += '<div class="issue-row">';
    tc.issues.forEach(function(i) {
      html += '<span class="itag">🐛 ' + eh(i.key) + (i.summary ? ' — ' + eh(i.summary.substring(0, 60)) : '') + '</span>';
    });
    html += '</div>';
  }

  // 자동화 실행 결과 (실제 동작)
  var tests = r.tests || [];
  html += '<div class="run-box"><div class="pre-lbl">🤖 자동화 실행 결과 (실제 동작)' + (r.run_at ? ' · ' + fmtDate(r.run_at) : '') + '</div>';
  if (tests.length) {
    tests.forEach(function(t) {
      html += '<div class="run-item">' + badge(t.status) + '<div class="run-body">';
      html += '<div class="run-title">' + eh(t.title);
      if (t.tcSteps && t.tcSteps.length) html += '<span class="run-map">→ Step ' + t.tcSteps.join(', ') + '</span>';
      html += '</div>';
      if (t.steps && t.steps.length) {
        html += '<div class="run-steps">' + t.steps.map(function(s) {
          return (s.status === 'fail' ? '✗ ' : '✓ ') + eh(s.title);
        }).join('<br>') + '</div>';
      }
      if (t.error) html += '<div class="run-err">' + eh(t.error) + '</div>';
      html += '</div></div>';
    });
  } else if (r.actual_result) {
    html += '<div class="run-empty">' + enl(r.actual_result) + '</div>';
  } else {
    html += '<div class="run-empty">아직 실행 기록이 없습니다. npx playwright test 실행 후 새로고침하세요.</div>';
  }
  html += '</div>';

  // 스텝별: 절차 / 기대결과 / 수정결과 + 통과 여부
  var stepStatus = r.step_status || {};
  var revs = revisions[key] || {};
  var ran = status0(r) !== 'pending';

  html += '<div class="steps">';
  (tc.steps || []).forEach(function(step) {
    var no  = step.index + 1;
    var sst = stepStatus[no] || (ran ? 'unmapped' : 'pending');
    var rev = revs[step.index];
    var title = '';
    if (step.description) {
      var m = step.description.match(/\\[([^\\]]+)\\]/);
      title = m ? m[1] : step.description.split('\\n')[0];
      if (title.length > 70) title = title.substring(0, 70) + '…';
    }

    html += '<div class="step">';
    html += '<div class="step-head"><span class="step-num">Step ' + no + '</span><span class="step-title">' + eh(title) + '</span>';
    html += '<span class="hdr-sp"></span>' + badge(sst, sst === 'unmapped' ? '이 스텝에 연결된 자동화 테스트가 없습니다 (tcstep annotation 필요)' : '') + '</div>';
    html += '<div class="step-body"><div class="spec-grid">';

    html += '<div class="sg-col"><div class="sg-lbl">📋 절차</div><div class="sg-txt">' + enl(step.description || '—') + '</div>';
    if (step.testData) html += '<div class="test-data">📌 테스트 데이터: ' + eh(step.testData) + '</div>';
    html += '</div>';

    html += '<div class="sg-col"><div class="sg-lbl">✅ 기대 결과' + (rev ? ' <span class="tag tag-old">수정 전</span>' : '') + '</div>';
    html += '<div class="sg-txt exp' + (rev ? ' old' : '') + '">' + enl(step.expectedResult || '—') + '</div></div>';

    html += '<div class="sg-col"><div class="sg-lbl">✏️ 수정 결과</div>';
    html += '<textarea class="rev-ta" id="rev-' + eh(key) + '-' + step.index + '" placeholder="기대 결과를 바꿔야 하면 수정할 내용을 입력하고 저장하세요. 비우고 저장하면 원래 기대 결과로 돌아갑니다.">' + eh(rev ? rev.expectedResult : '') + '</textarea>';
    html += '<div class="rev-actions"><button class="rev-save" data-key="' + eh(key) + '" data-idx="' + step.index + '">💾 저장</button>' + revState(rev) + '</div>';
    html += '</div>';

    html += '</div></div></div>';
  });
  html += '</div>';

  html += '</div>';
  return html;
}

function status0(r) { return (r && r.status) || 'pending'; }

function badge(status, tip) {
  var s = LABEL[status] ? status : 'pending';
  return '<span class="badge b-' + s + '"' + (tip ? ' title="' + eh(tip) + '"' : '') + '>' + ICON[s] + ' ' + LABEL[s] + '</span>';
}

function revState(rev) {
  if (!rev) return '<span class="upd-time">수정 없음</span>';
  if (rev.code_applied) return '<span class="tag tag-done">코드 반영 완료</span><span class="upd-time">' + fmtDate(rev.applied_at) + '</span>';
  return '<span class="tag tag-wait">코드 반영 대기</span><span class="upd-time">' + fmtDate(rev.updated_at) + '</span>';
}

// ── 행 토글 ───────────────────────────────────────────────
function toggleRow(key) {
  expandedKey = expandedKey === key ? null : key;
  applyFilters();
  if (expandedKey) {
    setTimeout(function() {
      var el = document.querySelector('.dr.open');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
  }
}

// ── 수정결과 저장 ─────────────────────────────────────────
function saveRevision(key, idx) {
  var ta = document.getElementById('rev-' + key + '-' + idx);
  if (!ta) return;
  var btn = document.querySelector('.rev-save[data-key="' + key + '"][data-idx="' + idx + '"]');
  if (btn) btn.disabled = true;

  fetch('/api/revision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ key: key, index: idx, expectedResult: ta.value })
  })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.ok) throw new Error(data.error || '저장 실패');
      if (!revisions[key]) revisions[key] = {};
      if (data.revision) revisions[key][idx] = data.revision;
      else delete revisions[key][idx];
      updateStats(data.stats);
      applyFilters();
      toast(data.revision ? '수정 결과 저장됨 — 코드 반영 대기' : '수정 결과 삭제 — 원래 기대 결과 사용', 'ok');
    })
    .catch(function(e) { toast('오류: ' + e.message, 'err'); })
    .finally(function() { if (btn) btn.disabled = false; });
}

// ── XML 동기화 ──────────────────────────────────────────────
function doSync() {
  var btn = document.getElementById('sync-btn');
  var dot = document.getElementById('sdot');
  btn.disabled = true; dot.classList.add('spin');
  setProg(30);

  fetch('/api/sync', { method: 'POST' })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      setProg(100);
      toast('동기화 완료 — TC ' + data.total + '개 (신규 ' + data.new + '개)', 'ok');
      setTimeout(function() { setProg(0); loadData(); }, 400);
    })
    .catch(function(e) { toast('동기화 오류: ' + e.message, 'err'); setProg(0); })
    .finally(function() { btn.disabled = false; dot.classList.remove('spin'); });
}

// ── 유틸 ──────────────────────────────────────────────────
function eh(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function enl(s) { return eh(s).replace(/\\n/g, '<br>'); }
function fmtDate(iso) { if (!iso) return ''; var d = new Date(iso); return d.toLocaleDateString('ko-KR') + ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }); }
function setProg(p) { document.getElementById('prog').style.width = p + '%'; }
function toast(msg, type) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + (type || '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { el.className = 'toast'; }, 3000);
}
</script>
</body>
</html>`;

// ─── Server ────────────────────────────────────────────────────────────────────
function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

// 요청 본문을 Buffer로 모은 뒤 한 번에 UTF-8 디코딩 (청크 경계에서 한글이 잘려 깨지는 문제 방지)
function readJSON(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('error', reject);
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (text.includes('\uFFFD')) {
        reject(new Error('요청 본문이 UTF-8이 아닙니다. 한글이 깨지므로 저장하지 않았습니다.'));
        return;
      }
      try { resolve(JSON.parse(text || '{}')); }
      catch (e) { reject(new Error('JSON 파싱 오류: ' + e.message)); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── GET / ──
  if (req.method === 'GET' && pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
    return;
  }

  // ── GET /api/cases ──
  if (req.method === 'GET' && pathname === '/api/cases') {
    const db = loadDB();
    sendJSON(res, 200, {
      cases:     Object.values(db.specs),
      results:   db.results,
      revisions: db.revisions,
      stats:     getStats(db),
      meta:      db.meta
    });
    return;
  }

  // ── POST /api/revision ── 스텝 기대결과 수정 (비우거나 원본과 같으면 수정 취소)
  if (req.method === 'POST' && pathname === '/api/revision') {
    try {
      const { key, index, expectedResult } = await readJSON(req);
      const db = loadDB();
      const spec = db.specs[key];
      if (!spec) { sendJSON(res, 404, { ok: false, error: 'TC를 찾을 수 없습니다: ' + key }); return; }
      const step = (spec.steps || []).find(s => s.index === index);
      if (!step) { sendJSON(res, 400, { ok: false, error: '스텝을 찾을 수 없습니다: ' + index }); return; }

      const text = String(expectedResult || '').trim();
      const revs = db.revisions[key] || {};

      if (!text || text === (step.expectedResult || '').trim()) {
        delete revs[index];
      } else if (!revs[index] || revs[index].expectedResult !== text) {
        revs[index] = {
          expectedResult: text,
          original: step.expectedResult || '',
          updated_at: new Date().toISOString(),
          code_applied: false,
          applied_at: null
        };
      }

      if (Object.keys(revs).length) db.revisions[key] = revs;
      else delete db.revisions[key];
      saveDB(db);

      sendJSON(res, 200, { ok: true, revision: revs[index] || null, stats: getStats(db) });
    } catch (e) {
      sendJSON(res, 400, { ok: false, error: e.message });
    }
    return;
  }

  // ── POST /api/sync ──
  if (req.method === 'POST' && pathname === '/api/sync') {
    try {
      sendJSON(res, 200, { ok: true, ...syncXML() });
    } catch (e) {
      sendJSON(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// ─── 시작 ─────────────────────────────────────────────────────────────────────
console.log('');
console.log('  ══════════════════════════════════════');
console.log('   📋 테스트 결과서 서버');
console.log('  ══════════════════════════════════════');

// 시작 시 XML 자동 동기화 (기존 결과/수정결과 보존)
try {
  const r = syncXML();
  console.log('');
  console.log('  ✅ XML 동기화: TC ' + r.total + '개 / ' + r.files + '개 파일');
} catch (e) {
  console.log('  ⚠️  XML 동기화 오류:', e.message);
}

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  브라우저: http://localhost:' + PORT);
  console.log('  종료: Ctrl+C');
  console.log('');
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.error('  오류: 포트 ' + PORT + ' 이미 사용 중입니다.');
    process.exit(1);
  }
  throw e;
});
