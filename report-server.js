#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

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
    specs: {
      "TCMETA-T416": {
        key, name, folder, objective, precondition, priority,
        steps: [{ index, description, expectedResult, testData }],
        issues: [{ key, summary }],
        synced_at
      }
    },
    results: {
      "TCMETA-T416": {
        status: "pending"|"pass"|"fail"|"skip",
        actual_result: "",          // TC 종합 실제동작
        step_results: [             // 스텝별 실제동작
          { index: 0, status: "pending", actual: "" }
        ],
        notes: "",
        updated_at: ""
      }
    },
    meta: { last_sync, files }
  }
*/
function loadDB() {
  let raw = { specs: {}, results: {}, meta: { last_sync: null, files: [] } };
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      // 마이그레이션: test_cases → specs
      if (parsed.test_cases && !parsed.specs) {
        parsed.specs = parsed.test_cases;
        delete parsed.test_cases;
      }
      raw = { ...raw, ...parsed };
    }
  } catch (e) { console.error('DB 로드 오류:', e.message); }
  return raw;
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
        const isNew = !db.specs[tc.key];
        // 스펙 저장
        db.specs[tc.key] = { ...tc, synced_at: new Date().toISOString() };

        if (isNew) {
          newCount++;
          db.results[tc.key] = makeEmptyResult(tc.steps);
        } else {
          // 결과 초기화 또는 스텝 구조 갱신
          if (!db.results[tc.key]) {
            db.results[tc.key] = makeEmptyResult(tc.steps);
          } else {
            db.results[tc.key] = migrateResult(db.results[tc.key], tc.steps);
          }
        }
      }
    } catch (e) {
      console.error(`XML 파싱 오류 [${path.basename(xmlPath)}]:`, e.message);
    }
  }

  db.meta = { last_sync: new Date().toISOString(), files: xmlFiles.map(f => path.basename(f)) };
  saveDB(db);
  return { total: Object.keys(db.specs).length, new: newCount, files: xmlFiles.length };
}

function makeEmptyResult(steps) {
  return {
    status: 'pending',
    actual_result: '',
    step_results: (steps || []).map(s => ({ index: s.index, status: 'pending', actual: '' })),
    notes: '',
    updated_at: ''
  };
}

function migrateResult(existing, steps) {
  // step_results 없으면 초기화, 있으면 기존 데이터 보존하며 갱신
  if (!existing.step_results) {
    existing.step_results = (steps || []).map(s => ({ index: s.index, status: 'pending', actual: '' }));
  } else {
    const existMap = {};
    existing.step_results.forEach(sr => { existMap[sr.index] = sr; });
    existing.step_results = (steps || []).map(s =>
      existMap[s.index] || { index: s.index, status: 'pending', actual: '' }
    );
  }
  return existing;
}

// ─── 통계 ────────────────────────────────────────────────────────────────────
function getStats(db) {
  const rs = Object.values(db.results);
  return {
    total: rs.length,
    pass: rs.filter(r => r.status === 'pass').length,
    fail: rs.filter(r => r.status === 'fail').length,
    pending: rs.filter(r => r.status === 'pending').length,
    skip: rs.filter(r => r.status === 'skip').length,
  };
}

// ─── HTML ─────────────────────────────────────────────────────────────────────
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

/* Toolbar */
.toolbar{background:var(--s1);border-bottom:1px solid var(--bd);padding:10px 28px;display:flex;align-items:center;gap:12px;flex-shrink:0;flex-wrap:wrap;}
.search{background:var(--s2);border:2px solid var(--bd);color:var(--tx);padding:9px 16px;border-radius:var(--r);font-size:14px;width:280px;outline:none;transition:border-color .15s;}
.search:focus{border-color:var(--ac);background:#fff;}
.search::placeholder{color:var(--tx3);}
.fsel{background:var(--s2);border:2px solid var(--bd);color:var(--tx);padding:9px 14px;border-radius:var(--r);font-size:13px;cursor:pointer;outline:none;transition:border-color .15s;}
.fsel:focus{border-color:var(--ac);}
.tb-sp{flex:1;}
.rcnt{font-size:13px;color:var(--tx3);background:var(--s2);padding:6px 14px;border-radius:20px;}
.rcnt strong{color:var(--tx2);font-weight:700;}

/* Table wrap */
.tw{flex:1;overflow-y:auto;}
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

.tc-key{font-size:12px;font-weight:700;color:var(--ac);background:#eef2ff;padding:2px 8px;border-radius:6px;display:inline-block;}
.tc-nm{font-weight:600;color:var(--tx);line-height:1.4;font-size:14px;}
.tc-obj{font-size:12px;color:var(--tx2);margin-top:3px;max-width:380px;}
.tc-folder{font-size:12px;color:var(--tx3);background:var(--s2);padding:2px 8px;border-radius:6px;display:inline-block;}
.tc-actual{font-size:12px;color:var(--tx2);max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.tc-actual.empty{color:var(--tx3);font-style:italic;}
.arrow{font-size:10px;color:var(--tx3);transition:transform .2s;display:inline-block;}
.tr.open .arrow{transform:rotate(90deg);}

/* Detail row */
.dr{display:none;}
.dr.open{display:table-row;}
.dc{padding:0 20px 24px 48px;background:#f8faff;border-bottom:3px solid var(--bd);}
.di{max-width:1200px;}

/* Precondition */
.pre-box{background:#f0f4ff;border:1px solid #c7d2fe;border-radius:var(--r);padding:12px 16px;font-size:13px;color:var(--ac2);margin:14px 0 18px;}
.pre-lbl{font-size:11px;font-weight:700;color:var(--ac);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;}

/* Steps */
.steps{display:flex;flex-direction:column;gap:8px;margin-bottom:20px;}
.step{background:var(--s1);border:1px solid var(--bd);border-radius:var(--r);overflow:hidden;box-shadow:var(--shadow);}
.step-head{display:flex;align-items:center;gap:10px;padding:12px 16px;background:var(--s2);border-bottom:1px solid var(--bd);}
.step-num{background:var(--ac);color:#fff;border-radius:6px;font-size:11px;font-weight:700;padding:3px 10px;white-space:nowrap;}
.step-title{font-size:13px;font-weight:600;color:var(--tx);}
.step-body{padding:4px 16px 14px;}

.spec-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:12px 0 14px;}
.sg-col{display:flex;flex-direction:column;gap:6px;}
.sg-lbl{font-size:11px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.4px;}
.sg-txt{font-size:13px;color:var(--tx2);line-height:1.7;white-space:pre-wrap;word-break:break-word;}
.sg-txt.exp{color:#166534;background:#dcfce7;padding:8px 12px;border-radius:6px;}
.test-data{background:var(--s2);border-radius:6px;padding:6px 10px;font-size:12px;color:var(--tx3);margin-top:4px;white-space:pre-wrap;border:1px solid var(--bd);}

/* Step result input */
.step-result{display:grid;grid-template-columns:1fr 160px;gap:12px;padding:12px 0 4px;border-top:1px solid var(--bd);margin-top:6px;align-items:start;}
.sr-lbl{font-size:11px;font-weight:700;color:var(--ac);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;}
.sr-ta{background:#fff;border:2px solid var(--bd);color:var(--tx);padding:10px 12px;border-radius:var(--r);font-size:13px;line-height:1.6;resize:vertical;min-height:70px;font-family:inherit;outline:none;width:100%;transition:border-color .15s;}
.sr-ta:focus{border-color:var(--ac);}
.sr-ta::placeholder{color:var(--tx3);}
.sr-sel{background:#fff;border:2px solid var(--bd);color:var(--tx);padding:10px 10px;border-radius:var(--r);font-size:13px;font-weight:600;cursor:pointer;outline:none;width:100%;transition:border-color .15s;}
.sr-sel:focus{border-color:var(--ac);}

/* TC 종합 폼 */
.tc-form{background:var(--s1);border:2px solid var(--bd);border-radius:var(--r);padding:20px;margin-top:10px;box-shadow:var(--shadow);}
.tf-title{font-size:13px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid var(--bd);}
.tf-row{display:grid;grid-template-columns:180px 1fr 1fr;gap:14px;margin-bottom:12px;align-items:start;}
.tf-group{display:flex;flex-direction:column;gap:7px;}
.tf-lbl{font-size:12px;font-weight:700;color:var(--tx2);}
.tf-sel{background:#fff;border:2px solid var(--bd);color:var(--tx);padding:11px 12px;border-radius:var(--r);font-size:14px;font-weight:600;cursor:pointer;outline:none;width:100%;transition:border-color .15s;}
.tf-sel:focus{border-color:var(--ac);}
.tf-ta{background:#fff;border:2px solid var(--bd);color:var(--tx);padding:11px 14px;border-radius:var(--r);font-size:13px;line-height:1.7;resize:vertical;min-height:76px;font-family:inherit;outline:none;width:100%;transition:border-color .15s;}
.tf-ta:focus{border-color:var(--ac);}
.tf-ta::placeholder{color:var(--tx3);}
.tf-actions{display:flex;align-items:center;gap:14px;margin-top:6px;}
.save-btn{background:var(--ac);color:#fff;border:none;padding:13px 32px;border-radius:var(--r);font-size:15px;font-weight:700;cursor:pointer;transition:all .15s;box-shadow:0 2px 8px rgba(99,102,241,.3);letter-spacing:-.2px;}
.save-btn:hover{background:var(--ac2);box-shadow:0 4px 14px rgba(99,102,241,.4);transform:translateY(-1px);}
.save-btn:disabled{opacity:.45;cursor:not-allowed;transform:none;box-shadow:none;}
.saved-msg{font-size:13px;color:var(--pass);opacity:0;transition:opacity .3s;font-weight:600;}
.saved-msg.show{opacity:1;}
.upd-time{font-size:12px;color:var(--tx3);}

/* Issues */
.issue-row{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;}
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
    <div class="sc-body"><span class="sc-lbl">미완</span><span class="sc-num u" id="sn-u">0</span></div>
  </div>
  <div class="sc" data-f="skip" onclick="setFilter('skip')">
    <span class="sc-icon">⏭️</span>
    <div class="sc-body"><span class="sc-lbl">스킵</span><span class="sc-num s" id="sn-s">0</span></div>
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
      <th style="width:90px">상태</th>
      <th style="width:130px">TC 번호</th>
      <th>테스트 케이스 / 목적</th>
      <th style="width:220px">실제동작 요약</th>
      <th style="width:170px">폴더</th>
      <th style="width:54px;text-align:center">스텝</th>
    </tr></thead>
    <tbody id="tbody"></tbody>
  </table>
</div>

<div class="toast" id="toast"></div>

<script>
var allCases = [];
var allResults = {};
var curFilter = 'all';
var expandedKey = null;
var toastTimer = null;

// ── 초기화 ──────────────────────────────────────────────────
(function(){ loadData(); })();

function loadData() {
  fetch('/api/cases')
    .then(r => r.json())
    .then(data => {
      allCases   = data.cases   || [];
      allResults = data.results || {};
      updateStats(data.stats || {});
      buildFolderOptions();
      applyFilters();
      var sync = data.meta && data.meta.last_sync;
      document.getElementById('hdr-sub').textContent = sync
        ? '마지막 동기화: ' + fmtDate(data.meta.last_sync) + '  |  ' + (data.meta.files||[]).length + '개 파일 · TC ' + allCases.length + '개'
        : 'XML 동기화가 필요합니다';
    })
    .catch(e => toast('로드 실패: ' + e.message, 'err'));
}

// ── 통계 ───────────────────────────────────────────────────
function updateStats(s) {
  document.getElementById('sn-t').textContent = s.total  || 0;
  document.getElementById('sn-p').textContent = s.pass   || 0;
  document.getElementById('sn-f').textContent = s.fail   || 0;
  document.getElementById('sn-u').textContent = s.pending|| 0;
  document.getElementById('sn-s').textContent = s.skip   || 0;
}

// ── 폴더 드롭다운 ──────────────────────────────────────────
function buildFolderOptions() {
  var folders = [...new Set(allCases.map(c => c.folder).filter(Boolean))].sort();
  var sel = document.getElementById('fsel');
  sel.innerHTML = '<option value="">전체 폴더</option>';
  folders.forEach(f => {
    var o = document.createElement('option');
    o.value = f; o.textContent = f;
    sel.appendChild(o);
  });
}

// ── 필터 ──────────────────────────────────────────────────
function setFilter(f) {
  curFilter = f;
  document.querySelectorAll('.sc').forEach(c => c.classList.toggle('active', c.dataset.f === f));
  applyFilters();
}

function applyFilters() {
  var q      = (document.getElementById('search').value||'').toLowerCase();
  var folder = document.getElementById('fsel').value;

  var vis = allCases.filter(tc => {
    var r = allResults[tc.key] || {};
    if (curFilter !== 'all' && (r.status||'pending') !== curFilter) return false;
    if (folder && tc.folder !== folder) return false;
    if (q && !(tc.key+' '+tc.name+' '+tc.objective).toLowerCase().includes(q)) return false;
    return true;
  });

  renderTable(vis);
  document.getElementById('rcnt').textContent = vis.length;
  document.getElementById('empty').classList.toggle('show', allCases.length === 0);
  document.getElementById('tbl').style.display = allCases.length === 0 ? 'none' : '';
}

// ── 테이블 렌더 ────────────────────────────────────────────
function renderTable(cases) {
  var html = '';
  cases.forEach(tc => {
    var r      = allResults[tc.key] || {};
    var status = r.status || 'pending';
    var open   = expandedKey === tc.key;
    var badgeLabel = {pass:'통과',fail:'실패',pending:'미완',skip:'스킵'}[status];
    var badgeIcon  = {pass:'✓',fail:'✗',pending:'○',skip:'–'}[status];
    var actualSummary = (r.actual_result||'').replace(/\\n/g,' ').substring(0,50);

    html += '<tr class="tr'+(open?' open':'')+'" data-key="'+eh(tc.key)+'" onclick="toggleRow(\''+ej(tc.key)+'\')">';
    html += '<td><span class="arrow">▶</span></td>';
    html += '<td><span class="badge b-'+status+'">'+badgeIcon+' '+badgeLabel+'</span></td>';
    html += '<td><div class="tc-key">'+eh(tc.key)+'</div></td>';
    html += '<td><div class="tc-nm">'+eh(tc.name)+'</div>'+(tc.objective?'<div class="tc-obj">'+eh(tc.objective)+'</div>':'')+'</td>';
    html += '<td><div class="tc-actual'+(actualSummary?'':' empty')+'">'+(actualSummary||'—')+'</div></td>';
    html += '<td><div class="tc-folder">'+eh(tc.folder||'')+'</div></td>';
    html += '<td style="text-align:center;color:var(--tx3);font-size:11px">'+(tc.steps?tc.steps.length:0)+'</td>';
    html += '</tr>';

    // 상세 행
    html += '<tr class="dr'+(open?' open':'')+'" data-key="'+eh(tc.key)+'">';
    html += '<td class="dc" colspan="7">'+buildDetail(tc, r)+'</td>';
    html += '</tr>';
  });

  var tbody = document.getElementById('tbody');
  tbody.innerHTML = html;

  // 클릭 이벤트 (row 토글 막기 위해 stopPropagation)
  tbody.querySelectorAll('textarea,select,input,.save-btn').forEach(el => {
    el.addEventListener('click', e => e.stopPropagation());
    el.addEventListener('mousedown', e => e.stopPropagation());
  });
  tbody.querySelectorAll('.save-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); saveResult(btn.dataset.key); });
  });
}

// ── 상세 패널 HTML 생성 ────────────────────────────────────
function buildDetail(tc, r) {
  var key = tc.key;
  var html = '<div class="di">';

  // 전제조건
  if (tc.precondition) {
    html += '<div class="pre-box"><div class="pre-lbl">전제조건</div><div>'+enl(tc.precondition)+'</div></div>';
  }

  // 이슈
  if (tc.issues && tc.issues.length) {
    html += '<div class="issue-row">';
    tc.issues.forEach(i => {
      html += '<span class="itag">🐛 '+eh(i.key)+(i.summary?' — '+eh(i.summary.substring(0,60)):'')+'</span>';
    });
    html += '</div>';
  }

  // 스텝별
  var stepMap = {};
  (r.step_results||[]).forEach(sr => { stepMap[sr.index] = sr; });

  html += '<div class="steps">';
  (tc.steps||[]).forEach(step => {
    var sr = stepMap[step.index] || { status:'pending', actual:'' };
    var title = '';
    if (step.description) {
      var m = step.description.match(/\\[([^\\]]+)\\]/);
      title = m ? m[1] : step.description.split('\\n')[0];
      if (title.length > 70) title = title.substring(0,70)+'…';
    }

    html += '<div class="step">';
    html += '<div class="step-head">';
    html += '<span class="step-num">Step '+(step.index+1)+'</span>';
    html += '<span class="step-title">'+eh(title)+'</span>';
    html += '</div>';
    html += '<div class="step-body">';

    // 절차 + 기대결과
    html += '<div class="spec-grid">';
    if (step.description) {
      html += '<div class="sg-col"><div class="sg-lbl">📋 절차</div><div class="sg-txt">'+enl(step.description)+'</div></div>';
    } else {
      html += '<div class="sg-col"></div>';
    }
    if (step.expectedResult) {
      html += '<div class="sg-col"><div class="sg-lbl">✅ 기대 결과</div><div class="sg-txt exp">'+enl(step.expectedResult)+'</div></div>';
    }
    html += '</div>';

    if (step.testData) {
      html += '<div class="test-data">📌 테스트 데이터: '+eh(step.testData)+'</div>';
    }

    // 실제동작 입력 (step-result 행)
    html += '<div class="step-result">';
    html += '<div><div class="sr-lbl">실제 동작</div>';
    html += '<textarea class="sr-ta" ';
    html += 'data-key="'+eh(key)+'" data-idx="'+step.index+'" ';
    html += 'placeholder="이 단계에서 실제로 어떻게 동작했는지 작성하세요...">';
    html += eh(sr.actual||'');
    html += '</textarea></div>';

    html += '<div><div class="sr-lbl">결과</div>';
    html += '<select class="sr-sel" data-key="'+eh(key)+'" data-idx="'+step.index+'">';
    [{v:'pending',l:'○ 미완'},{v:'pass',l:'✓ 통과'},{v:'fail',l:'✗ 실패'},{v:'skip',l:'– 스킵'}].forEach(o => {
      html += '<option value="'+o.v+'"'+(sr.status===o.v?' selected':'')+'>'+o.l+'</option>';
    });
    html += '</select></div>';
    html += '</div>';

    html += '</div></div>';
  });
  html += '</div>';

  // TC 종합 결과 폼
  var curStatus = r.status || 'pending';
  var curActual = r.actual_result || '';
  var curNotes  = r.notes || '';
  var updTime   = r.updated_at ? '최종 저장: '+fmtDate(r.updated_at) : '';

  html += '<div class="tc-form">';
  html += '<div class="tf-title">🖊️ TC 종합 결과</div>';
  html += '<div class="tf-row">';

  html += '<div class="tf-group"><div class="tf-lbl">최종 결과</div>';
  html += '<select class="tf-sel" id="sel-'+eh(key)+'">';
  [{v:'pending',l:'○ 미완'},{v:'pass',l:'✓ 통과'},{v:'fail',l:'✗ 실패'},{v:'skip',l:'– 스킵'}].forEach(o => {
    html += '<option value="'+o.v+'"'+(curStatus===o.v?' selected':'')+'>'+o.l+'</option>';
  });
  html += '</select></div>';

  html += '<div class="tf-group"><div class="tf-lbl">종합 실제동작</div>';
  html += '<textarea class="tf-ta" id="act-'+eh(key)+'" placeholder="테스트를 실행했을 때 전체적으로 실제 동작을 요약해서 작성하세요...">'+eh(curActual)+'</textarea></div>';

  html += '<div class="tf-group"><div class="tf-lbl">비고 / 이슈</div>';
  html += '<textarea class="tf-ta" id="note-'+eh(key)+'" placeholder="특이사항, 이슈 번호, 관련 링크 등...">'+eh(curNotes)+'</textarea></div>';

  html += '</div>';
  html += '<div class="tf-actions">';
  html += '<button class="save-btn" data-key="'+eh(key)+'">💾 저장</button>';
  html += '<span class="saved-msg" id="sv-'+eh(key)+'">✓ 저장되었습니다</span>';
  html += '<span class="upd-time" id="ut-'+eh(key)+'">'+updTime+'</span>';
  html += '</div>';
  html += '</div>';

  html += '</div>';
  return html;
}

// ── 행 토글 ───────────────────────────────────────────────
function toggleRow(key) {
  expandedKey = expandedKey === key ? null : key;
  applyFilters();
  if (expandedKey) {
    setTimeout(() => {
      var el = document.querySelector('.dr.open');
      if (el) el.scrollIntoView({ behavior:'smooth', block:'nearest' });
    }, 60);
  }
}

// ── 저장 ──────────────────────────────────────────────────
function saveResult(key) {
  var sel   = document.getElementById('sel-'  + key);
  var act   = document.getElementById('act-'  + key);
  var note  = document.getElementById('note-' + key);
  if (!sel) return;

  // 스텝별 실제동작 수집
  var stepResults = [];
  document.querySelectorAll('.sr-ta[data-key]').forEach(ta => {
    if (ta.dataset.key !== key) return;
    var idx = parseInt(ta.dataset.idx, 10);
    var stSel = document.querySelector('.sr-sel[data-key="'+key+'"][data-idx="'+idx+'"]');
    stepResults.push({
      index: idx,
      status: stSel ? stSel.value : 'pending',
      actual: ta.value
    });
  });

  var btn = document.querySelector('.save-btn[data-key="'+key+'"]');
  if (btn) btn.disabled = true;

  fetch('/api/result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key,
      status:        sel.value,
      actual_result: act  ? act.value  : '',
      step_results:  stepResults,
      notes:         note ? note.value : ''
    })
  })
  .then(r => r.json())
  .then(data => {
    if (data.ok) {
      allResults[key] = data.result;
      updateStats(data.stats);

      // 배지만 갱신 (전체 리렌더 없이)
      var row = document.querySelector('.tr[data-key="'+key+'"]');
      if (row) {
        var badge = row.querySelector('.badge');
        var status = data.result.status || 'pending';
        var bLabel = {pass:'통과',fail:'실패',pending:'미완',skip:'스킵'}[status];
        var bIcon  = {pass:'✓',fail:'✗',pending:'○',skip:'–'}[status];
        if (badge) { badge.className = 'badge b-'+status; badge.textContent = bIcon+' '+bLabel; }
        var actSummary = (data.result.actual_result||'').replace(/\\n/g,' ').substring(0,50);
        var actEl = row.querySelector('.tc-actual');
        if (actEl) {
          actEl.textContent = actSummary || '—';
          actEl.classList.toggle('empty', !actSummary);
        }
      }

      // 저장 시각 갱신
      var utEl = document.getElementById('ut-'+key);
      if (utEl) utEl.textContent = '최종 저장: '+fmtDate(data.result.updated_at);

      // 성공 메시지
      var sv = document.getElementById('sv-'+key);
      if (sv) { sv.classList.add('show'); setTimeout(() => sv.classList.remove('show'), 2500); }
      toast('저장 완료', 'ok');
    } else {
      toast('저장 실패: '+(data.error||''), 'err');
    }
  })
  .catch(e => toast('오류: '+e.message, 'err'))
  .finally(() => { if (btn) btn.disabled = false; });
}

// ── XML 동기화 ──────────────────────────────────────────────
function doSync() {
  var btn  = document.getElementById('sync-btn');
  var dot  = document.getElementById('sdot');
  btn.disabled = true; dot.classList.add('spin');
  setProg(30);

  fetch('/api/sync', { method:'POST' })
    .then(r => r.json())
    .then(data => {
      setProg(100);
      toast('동기화 완료 — TC '+data.total+'개 (신규 '+data.new+'개)', 'ok');
      setTimeout(() => { setProg(0); loadData(); }, 400);
    })
    .catch(e => { toast('동기화 오류: '+e.message, 'err'); setProg(0); })
    .finally(() => { btn.disabled=false; dot.classList.remove('spin'); });
}

// ── 유틸 ──────────────────────────────────────────────────
function eh(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function ej(s){return String(s||'').replace(/\\\\/g,'\\\\\\\\').replace(/'/g,"\\\\'");}
function enl(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>');}
function fmtDate(iso){if(!iso)return'';var d=new Date(iso);return d.toLocaleDateString('ko-KR')+' '+d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});}
function setProg(p){document.getElementById('prog').style.width=p+'%';}
function toast(msg,type){
  var el=document.getElementById('toast');
  el.textContent=msg;
  el.className='toast show '+(type||'');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{el.className='toast';},3000);
}
</script>
</body>
</html>`;

// ─── Server ────────────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const { pathname } = url.parse(req.url, true);

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
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      cases:   Object.values(db.specs),
      results: db.results,
      stats:   getStats(db),
      meta:    db.meta
    }));
    return;
  }

  // ── POST /api/result ──
  if (req.method === 'POST' && pathname === '/api/result') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const { key, status, actual_result, step_results, notes } = JSON.parse(body);
        if (!key) { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: 'key required' })); return; }

        const db = loadDB();

        // 기존 step_results 보존하며 업데이트
        const existing = db.results[key] || {};
        const existMap = {};
        (existing.step_results || []).forEach(sr => { existMap[sr.index] = sr; });

        const merged = (step_results || []).map(sr => ({
          index:  sr.index,
          status: sr.status || 'pending',
          actual: sr.actual || ''
        }));

        db.results[key] = {
          status:        status || 'pending',
          actual_result: actual_result || '',
          step_results:  merged.length > 0 ? merged : (existing.step_results || []),
          notes:         notes || '',
          updated_at:    new Date().toISOString()
        };

        saveDB(db);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, result: db.results[key], stats: getStats(db) }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // ── POST /api/sync ──
  if (req.method === 'POST' && pathname === '/api/sync') {
    try {
      const result = syncXML();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, ...result }));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ ok: false, error: e.message }));
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

// 시작 시 XML 자동 동기화 (기존 결과 보존)
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
