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
  --bg:       #0c0c14;
  --s1:       #13131f;
  --s2:       #1a1a2c;
  --s3:       #22223a;
  --s4:       #2a2a48;
  --bd:       #2a2a44;
  --bd2:      #3a3a58;
  --tx:       #e2e8f0;
  --tx2:      #94a3b8;
  --tx3:      #64748b;
  --ac:       #7c3aed;
  --ac2:      #a78bfa;
  --pass:     #22c55e;
  --fail:     #ef4444;
  --pend:     #64748b;
  --skip:     #f59e0b;
  --pass-bg:  rgba(34,197,94,.08);
  --fail-bg:  rgba(239,68,68,.08);
  --pend-bg:  rgba(100,116,139,.08);
  --skip-bg:  rgba(245,158,11,.08);
  --r:        8px;
}
html,body{height:100%;background:var(--bg);color:var(--tx);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Malgun Gothic',sans-serif;}
body{display:flex;flex-direction:column;height:100vh;overflow:hidden;}

/* Header */
.hdr{background:#0a0a15;border-bottom:1px solid var(--bd);padding:0 24px;height:54px;display:flex;align-items:center;gap:14px;flex-shrink:0;}
.hdr h1{font-size:15px;font-weight:700;color:var(--ac2);letter-spacing:-.3px;}
.hdr-sub{font-size:11px;color:var(--tx3);}
.hdr-sp{flex:1;}
.sync-btn{background:var(--s3);border:1px solid var(--bd2);color:var(--ac2);padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;transition:all .15s;}
.sync-btn:hover{background:var(--s4);border-color:var(--ac);}
.sync-btn:disabled{opacity:.4;cursor:not-allowed;}
.sdot{width:7px;height:7px;border-radius:50%;background:var(--ac2);flex-shrink:0;}
.sdot.spin{animation:spin .8s linear infinite;}
@keyframes spin{to{transform:rotate(360deg);}}

/* Stats bar */
.stats{background:var(--s1);border-bottom:1px solid var(--bd);padding:10px 24px;display:flex;align-items:center;gap:10px;flex-shrink:0;flex-wrap:wrap;}
.sc{display:flex;align-items:center;gap:10px;background:var(--s2);border:1px solid var(--bd);border-radius:var(--r);padding:8px 16px;cursor:pointer;transition:all .15s;min-width:105px;}
.sc:hover{border-color:var(--bd2);background:var(--s3);}
.sc.active{border-color:var(--ac);background:rgba(124,58,237,.1);}
.sc-icon{font-size:15px;}
.sc-body{display:flex;flex-direction:column;gap:2px;}
.sc-lbl{font-size:10px;color:var(--tx3);}
.sc-num{font-size:22px;font-weight:700;line-height:1;}
.sc-num.t{color:var(--tx);}
.sc-num.p{color:var(--pass);}
.sc-num.f{color:var(--fail);}
.sc-num.u{color:var(--pend);}
.sc-num.s{color:var(--skip);}

/* Toolbar */
.toolbar{background:var(--s1);border-bottom:1px solid var(--bd);padding:8px 24px;display:flex;align-items:center;gap:10px;flex-shrink:0;flex-wrap:wrap;}
.search{background:var(--s2);border:1px solid var(--bd);color:var(--tx);padding:6px 12px;border-radius:6px;font-size:13px;width:240px;outline:none;}
.search:focus{border-color:var(--ac);}
.search::placeholder{color:var(--tx3);}
.fsel{background:var(--s2);border:1px solid var(--bd);color:var(--tx);padding:6px 10px;border-radius:6px;font-size:12px;cursor:pointer;outline:none;}
.fsel:focus{border-color:var(--ac);}
.tb-sp{flex:1;}
.rcnt{font-size:12px;color:var(--tx3);}
.rcnt strong{color:var(--tx2);}

/* Table wrap */
.tw{flex:1;overflow-y:auto;}
.tw::-webkit-scrollbar{width:5px;}
.tw::-webkit-scrollbar-track{background:transparent;}
.tw::-webkit-scrollbar-thumb{background:var(--bd);border-radius:3px;}

table{width:100%;border-collapse:collapse;font-size:13px;}
thead{position:sticky;top:0;z-index:10;background:var(--s2);}
thead th{padding:10px 14px;text-align:left;font-size:10px;font-weight:600;color:var(--tx3);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--bd);white-space:nowrap;}

/* TC row */
.tr{border-bottom:1px solid var(--bd);cursor:pointer;transition:background .1s;}
.tr:hover td{background:var(--s2);}
.tr.open td{background:var(--s2);}
.tr td{padding:11px 14px;vertical-align:middle;}

/* Status badge */
.badge{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;}
.b-pass{background:var(--pass-bg);color:var(--pass);border:1px solid rgba(34,197,94,.25);}
.b-fail{background:var(--fail-bg);color:var(--fail);border:1px solid rgba(239,68,68,.25);}
.b-pending{background:var(--pend-bg);color:var(--pend);border:1px solid rgba(100,116,139,.25);}
.b-skip{background:var(--skip-bg);color:var(--skip);border:1px solid rgba(245,158,11,.25);}

.tc-key{font-size:11px;font-weight:600;color:var(--ac2);}
.tc-nm{font-weight:500;color:var(--tx);line-height:1.4;}
.tc-obj{font-size:11px;color:var(--tx2);margin-top:2px;max-width:380px;}
.tc-folder{font-size:11px;color:var(--tx3);}
.tc-actual{font-size:11px;color:var(--tx2);max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.tc-actual.empty{color:var(--tx3);font-style:italic;}
.arrow{font-size:9px;color:var(--tx3);transition:transform .2s;display:inline-block;}
.tr.open .arrow{transform:rotate(90deg);}

/* Detail row */
.dr{display:none;}
.dr.open{display:table-row;}
.dc{padding:0 16px 20px 40px;background:#0e0e1c;border-bottom:2px solid var(--bd);}
.di{max-width:1200px;}

/* Precondition */
.pre-box{background:rgba(124,58,237,.06);border:1px solid rgba(124,58,237,.2);border-radius:6px;padding:8px 14px;font-size:12px;color:var(--ac2);margin:12px 0 16px;}
.pre-lbl{font-size:10px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;}

/* Steps */
.steps{display:flex;flex-direction:column;gap:1px;margin-bottom:20px;}
.step{background:var(--s1);border:1px solid var(--bd);border-radius:6px;overflow:hidden;}
.step-head{display:flex;align-items:center;gap:8px;padding:10px 14px 10px;background:var(--s2);}
.step-num{background:var(--s3);color:var(--ac2);border-radius:4px;font-size:10px;font-weight:700;padding:2px 8px;white-space:nowrap;}
.step-title{font-size:12px;font-weight:600;color:var(--tx);}
.step-body{padding:0 14px 12px;}

.spec-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:10px 0 12px;}
.sg-col{display:flex;flex-direction:column;gap:4px;}
.sg-lbl{font-size:10px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.4px;}
.sg-txt{font-size:12px;color:var(--tx2);line-height:1.6;white-space:pre-wrap;word-break:break-word;}
.sg-txt.exp{color:#a5f3c4;}
.test-data{background:var(--s2);border-radius:4px;padding:4px 8px;font-size:11px;color:var(--tx3);margin-top:2px;white-space:pre-wrap;}

/* Step result input */
.step-result{display:grid;grid-template-columns:1fr 140px;gap:10px;padding:10px 0 2px;border-top:1px solid var(--bd);margin-top:4px;align-items:start;}
.sr-lbl{font-size:10px;font-weight:700;color:var(--ac2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;}
.sr-ta{background:var(--s3);border:1px solid var(--bd);color:var(--tx);padding:7px 10px;border-radius:6px;font-size:12px;line-height:1.5;resize:vertical;min-height:62px;font-family:inherit;outline:none;width:100%;}
.sr-ta:focus{border-color:var(--ac);}
.sr-ta::placeholder{color:var(--tx3);}
.sr-sel{background:var(--s3);border:1px solid var(--bd);color:var(--tx);padding:7px 8px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;outline:none;width:100%;}
.sr-sel:focus{border-color:var(--ac);}

/* TC 종합 폼 */
.tc-form{background:var(--s2);border:1px solid var(--bd);border-radius:var(--r);padding:16px;margin-top:8px;}
.tf-title{font-size:11px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid var(--bd);}
.tf-row{display:grid;grid-template-columns:160px 1fr 1fr;gap:12px;margin-bottom:10px;align-items:start;}
.tf-group{display:flex;flex-direction:column;gap:6px;}
.tf-lbl{font-size:11px;font-weight:600;color:var(--tx3);}
.tf-sel{background:var(--s3);border:1px solid var(--bd);color:var(--tx);padding:8px 10px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;outline:none;width:100%;}
.tf-sel:focus{border-color:var(--ac);}
.tf-ta{background:var(--s3);border:1px solid var(--bd);color:var(--tx);padding:8px 12px;border-radius:6px;font-size:12px;line-height:1.6;resize:vertical;min-height:70px;font-family:inherit;outline:none;width:100%;}
.tf-ta:focus{border-color:var(--ac);}
.tf-ta::placeholder{color:var(--tx3);}
.tf-actions{display:flex;align-items:center;gap:12px;margin-top:4px;}
.save-btn{background:var(--ac);color:#fff;border:none;padding:9px 22px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s;}
.save-btn:hover{background:#6d28d9;}
.save-btn:disabled{opacity:.45;cursor:not-allowed;}
.saved-msg{font-size:12px;color:var(--pass);opacity:0;transition:opacity .3s;}
.saved-msg.show{opacity:1;}
.upd-time{font-size:11px;color:var(--tx3);}

/* Issues */
.issue-row{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;}
.itag{background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.2);color:#fca5a5;border-radius:4px;font-size:10px;padding:2px 8px;}

/* Empty */
.empty{display:none;flex-direction:column;align-items:center;justify-content:center;padding:80px 24px;text-align:center;gap:12px;}
.empty.show{display:flex;}
.empty-icon{font-size:48px;}
.empty-title{font-size:18px;font-weight:600;}
.empty-sub{font-size:13px;color:var(--tx3);}
.empty-btn{background:var(--ac);color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;margin-top:8px;transition:background .15s;}
.empty-btn:hover{background:#6d28d9;}

/* Toast */
.toast{position:fixed;bottom:24px;right:24px;background:var(--s3);border:1px solid var(--bd2);color:var(--tx);padding:10px 18px;border-radius:8px;font-size:13px;opacity:0;transform:translateY(6px);transition:all .25s;z-index:999;pointer-events:none;}
.toast.show{opacity:1;transform:translateY(0);}
.toast.ok{border-color:rgba(34,197,94,.4);}
.toast.err{border-color:rgba(239,68,68,.4);}

/* Progress */
.prog{height:2px;background:var(--ac);width:0%;transition:width .4s;position:fixed;top:0;left:0;z-index:1000;}
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
      <th style="width:82px">상태</th>
      <th style="width:124px">TC 번호</th>
      <th>테스트 케이스 / 목적</th>
      <th style="width:210px">실제동작 요약</th>
      <th style="width:160px">폴더</th>
      <th style="width:50px;text-align:center">스텝</th>
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
