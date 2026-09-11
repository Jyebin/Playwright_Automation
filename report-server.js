#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 9998;
const ROOT = __dirname;
const DB_FILE = path.join(ROOT, 'test-report-db.json');

// ─── XML Files 자동 탐색 ───────────────────────────────────────────────────────
function findXMLFiles() {
  const dirs = [ROOT, path.join(ROOT, 'tests')];
  const result = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      fs.readdirSync(dir)
        .filter(f => f.endsWith('.xml'))
        .forEach(f => result.push(path.join(dir, f)));
    } catch (e) {}
  }
  return result;
}

// ─── DB (JSON 파일) ────────────────────────────────────────────────────────────
function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    }
  } catch (e) {}
  return { test_cases: {}, results: {}, meta: { last_sync: null, files: [] } };
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

// ─── HTML 파싱 헬퍼 ────────────────────────────────────────────────────────────
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
    .replace(/<table[\s\S]*?<\/table>/gi, (m) => {
      // 테이블을 텍스트로 간단히 변환
      return m.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
    })
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, (m, alt) => alt ? `[이미지: ${alt}]` : '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#160;/g, ' ')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n)))
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
  const cdataMatch = inner.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  if (cdataMatch) return cdataMatch[1];
  return inner.replace(/<!\[CDATA\[|\]\]>/g, '').trim();
}

// ─── XML 파싱 ──────────────────────────────────────────────────────────────────
function parseTestCases(xmlContent) {
  const cases = [];
  const tcRegex = /<testCase\s[^>]*key="([^"]+)"[^>]*>([\s\S]*?)<\/testCase>/g;
  let m;

  while ((m = tcRegex.exec(xmlContent)) !== null) {
    const [, key, content] = m;

    const name = stripHtml(getCDATA(content, 'name'));
    const folder = stripHtml(getCDATA(content, 'folder'));
    const objective = stripHtml(getCDATA(content, 'objective'));
    const precondition = stripHtml(getCDATA(content, 'precondition'));
    const priority = stripHtml(getCDATA(content, 'priority'));

    // 관련 이슈 추출
    const issues = [];
    const issueRe = /<issue>([\s\S]*?)<\/issue>/g;
    let im;
    while ((im = issueRe.exec(content)) !== null) {
      const issueKey = stripHtml(getCDATA(im[1], 'key') || im[1].match(/<key>([^<]+)<\/key>/)?.[1] || '');
      const issueSummary = stripHtml(getCDATA(im[1], 'summary'));
      if (issueKey) issues.push({ key: issueKey, summary: issueSummary });
    }

    // Step 파싱
    const steps = [];
    const stepsBlock = content.match(/<steps>([\s\S]*?)<\/steps>/);
    if (stepsBlock) {
      const stepsContent = stepsBlock[1];
      const stepRegex = /<step\s+index="(\d+)">([\s\S]*?)<\/step>/g;
      let sm;
      while ((sm = stepRegex.exec(stepsContent)) !== null) {
        const [, stepIdx, stepContent] = sm;
        const description = stripHtml(getCDATA(stepContent, 'description'));
        const expectedResult = stripHtml(getCDATA(stepContent, 'expectedResult'));
        const testData = stripHtml(getCDATA(stepContent, 'testData'));
        if (description || expectedResult) {
          steps.push({
            index: parseInt(stepIdx, 10),
            description,
            expectedResult,
            testData: testData || ''
          });
        }
      }
    }

    if (key && name) {
      cases.push({ key, name, folder, objective, precondition, priority, steps, issues });
    }
  }

  return cases;
}

// ─── XML → DB 동기화 ───────────────────────────────────────────────────────────
function syncXML() {
  const xmlFiles = findXMLFiles();
  const db = loadDB();
  let newCount = 0;

  for (const xmlPath of xmlFiles) {
    try {
      const content = fs.readFileSync(xmlPath, 'utf-8');
      const cases = parseTestCases(content);

      for (const tc of cases) {
        const isNew = !db.test_cases[tc.key];
        db.test_cases[tc.key] = tc;
        if (isNew) newCount++;
        if (!db.results[tc.key]) {
          db.results[tc.key] = {
            status: 'pending',
            actual_result: '',
            notes: '',
            updated_at: ''
          };
        }
      }
    } catch (e) {
      console.error(`XML 파싱 오류 [${path.basename(xmlPath)}]:`, e.message);
    }
  }

  db.meta = {
    last_sync: new Date().toISOString(),
    files: xmlFiles.map(f => path.basename(f))
  };
  saveDB(db);
  return { total: Object.keys(db.test_cases).length, new: newCount, files: xmlFiles.length };
}

// ─── 통계 계산 ────────────────────────────────────────────────────────────────
function getStats(db) {
  const results = Object.values(db.results);
  return {
    total: results.length,
    pass: results.filter(r => r.status === 'pass').length,
    fail: results.filter(r => r.status === 'fail').length,
    pending: results.filter(r => r.status === 'pending').length,
    skip: results.filter(r => r.status === 'skip').length,
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
  --bg:      #0c0c14;
  --surface: #13131f;
  --surface2:#1a1a2c;
  --surface3:#22223a;
  --border:  #2a2a44;
  --border2: #3a3a58;
  --text:    #e2e8f0;
  --text2:   #94a3b8;
  --text3:   #64748b;
  --accent:  #7c3aed;
  --accent2: #a78bfa;
  --pass:    #22c55e;
  --fail:    #ef4444;
  --pending: #64748b;
  --skip:    #f59e0b;
  --pass-bg: #052e16;
  --fail-bg: #2d0808;
  --pending-bg: #1e2535;
  --skip-bg: #2d1f04;
  --radius:  8px;
}
html, body { height: 100%; background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Malgun Gothic', sans-serif; }
body { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

/* ── 헤더 ── */
.app-header {
  background: #0a0a15;
  border-bottom: 1px solid var(--border);
  padding: 0 24px;
  height: 56px;
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}
.app-header h1 { font-size: 16px; font-weight: 700; color: var(--accent2); letter-spacing: -0.3px; }
.header-sub { font-size: 12px; color: var(--text3); }
.header-spacer { flex: 1; }
.sync-btn {
  background: var(--surface3);
  border: 1px solid var(--border2);
  color: var(--accent2);
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s;
}
.sync-btn:hover { background: #2a2a48; border-color: var(--accent); }
.sync-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.sync-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent2); }
.sync-dot.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ── 요약 카드 ── */
.stats-bar {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 10px 24px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.stat-card {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 8px 16px;
  cursor: pointer;
  transition: all 0.15s;
  min-width: 110px;
}
.stat-card:hover { border-color: var(--border2); background: var(--surface3); }
.stat-card.active { border-color: var(--accent); background: rgba(124,58,237,0.12); }
.stat-icon { font-size: 15px; }
.stat-label { font-size: 11px; color: var(--text3); }
.stat-num { font-size: 22px; font-weight: 700; line-height: 1; }
.stat-num.pass { color: var(--pass); }
.stat-num.fail { color: var(--fail); }
.stat-num.pending { color: var(--pending); }
.stat-num.skip { color: var(--skip); }
.stat-num.total { color: var(--text); }
.stat-info { display: flex; flex-direction: column; gap: 2px; }

/* ── 툴바 ── */
.toolbar {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 8px 24px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.search-box {
  background: var(--surface2);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  width: 240px;
  outline: none;
}
.search-box:focus { border-color: var(--accent); }
.search-box::placeholder { color: var(--text3); }
.folder-select {
  background: var(--surface2);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  outline: none;
}
.folder-select:focus { border-color: var(--accent); }
.tb-spacer { flex: 1; }
.result-count { font-size: 12px; color: var(--text3); }
.result-count strong { color: var(--text2); }

/* ── 테이블 영역 ── */
.table-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 0;
}
.table-wrap::-webkit-scrollbar { width: 6px; }
.table-wrap::-webkit-scrollbar-track { background: transparent; }
.table-wrap::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
thead {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--surface2);
}
thead th {
  padding: 10px 16px;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  color: var(--text3);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

/* ── TC 행 ── */
.tc-row {
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.1s;
}
.tc-row:hover > td { background: var(--surface2); }
.tc-row.expanded > td { background: var(--surface2); }
.tc-row td {
  padding: 12px 16px;
  vertical-align: middle;
}

/* ── 상태 배지 ── */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  letter-spacing: 0.3px;
}
.badge-pass    { background: var(--pass-bg);    color: var(--pass);    border: 1px solid rgba(34,197,94,0.3); }
.badge-fail    { background: var(--fail-bg);    color: var(--fail);    border: 1px solid rgba(239,68,68,0.3); }
.badge-pending { background: var(--pending-bg); color: var(--pending); border: 1px solid rgba(100,116,139,0.3); }
.badge-skip    { background: var(--skip-bg);    color: var(--skip);    border: 1px solid rgba(245,158,11,0.3); }

/* ── TC 기본 정보 ── */
.tc-key { font-size: 11px; font-weight: 600; color: var(--accent2); white-space: nowrap; }
.tc-name { font-weight: 500; color: var(--text); line-height: 1.4; }
.tc-objective { font-size: 12px; color: var(--text2); line-height: 1.4; margin-top: 2px; max-width: 400px; }
.tc-folder { font-size: 11px; color: var(--text3); white-space: nowrap; }
.tc-step-count { font-size: 11px; color: var(--text3); text-align: center; }
.expand-arrow { font-size: 10px; color: var(--text3); transition: transform 0.2s; display: inline-block; }
.tc-row.expanded .expand-arrow { transform: rotate(90deg); }

/* ── 상세 패널 ── */
.detail-row { display: none; }
.detail-row.open { display: table-row; }
.detail-cell {
  padding: 0 16px 20px 40px;
  background: #0f0f1c;
  border-bottom: 1px solid var(--border);
}

.detail-inner { max-width: 1100px; }

/* 전제조건 */
.precondition-box {
  background: rgba(124,58,237,0.06);
  border: 1px solid rgba(124,58,237,0.2);
  border-radius: 6px;
  padding: 8px 14px;
  font-size: 12px;
  color: var(--accent2);
  margin-bottom: 16px;
  margin-top: 12px;
}
.precondition-label { font-size: 10px; font-weight: 700; color: var(--text3); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }

/* 스텝 목록 */
.steps-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
.step-item {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px 14px;
}
.step-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.step-num {
  background: var(--surface3);
  color: var(--accent2);
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  white-space: nowrap;
}
.step-title { font-size: 12px; font-weight: 600; color: var(--text); }
.step-body { display: flex; flex-direction: column; gap: 6px; }
.step-field-label { font-size: 10px; font-weight: 600; color: var(--text3); text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 2px; }
.step-text {
  font-size: 12px;
  color: var(--text2);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
.step-text.expected { color: #a5f3c4; }
.step-data { background: var(--surface2); border-radius: 4px; padding: 4px 8px; font-size: 11px; color: var(--text3); margin-top: 4px; white-space: pre-wrap; }

/* 결과 입력 폼 */
.result-form {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  margin-top: 4px;
}
.form-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text3);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 14px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.form-row { display: flex; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.form-group { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 200px; }
.form-label { font-size: 11px; font-weight: 600; color: var(--text3); }
.status-select {
  background: var(--surface3);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  outline: none;
  width: 160px;
}
.status-select:focus { border-color: var(--accent); }
.result-textarea {
  background: var(--surface3);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.6;
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
  outline: none;
  width: 100%;
}
.result-textarea:focus { border-color: var(--accent); }
.result-textarea::placeholder { color: var(--text3); }
.form-actions { display: flex; align-items: center; gap: 10px; }
.save-btn {
  background: var(--accent);
  color: #fff;
  border: none;
  padding: 8px 20px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.save-btn:hover { background: #6d28d9; }
.save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.save-status { font-size: 12px; color: var(--pass); opacity: 0; transition: opacity 0.3s; }
.save-status.visible { opacity: 1; }

/* 이슈 태그 */
.issues-list { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.issue-tag {
  background: rgba(239,68,68,0.08);
  border: 1px solid rgba(239,68,68,0.2);
  color: #fca5a5;
  border-radius: 4px;
  font-size: 10px;
  padding: 2px 8px;
}

/* ── 빈 상태 ── */
.empty-state {
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 24px;
  text-align: center;
  gap: 12px;
}
.empty-state.show { display: flex; }
.empty-icon { font-size: 48px; }
.empty-title { font-size: 18px; font-weight: 600; color: var(--text); }
.empty-sub { font-size: 13px; color: var(--text3); }
.sync-now-btn {
  background: var(--accent);
  color: #fff;
  border: none;
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 8px;
  transition: background 0.15s;
}
.sync-now-btn:hover { background: #6d28d9; }

/* ── 토스트 알림 ── */
.toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  background: var(--surface3);
  border: 1px solid var(--border2);
  color: var(--text);
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 13px;
  opacity: 0;
  transform: translateY(8px);
  transition: all 0.25s;
  z-index: 999;
  pointer-events: none;
}
.toast.show { opacity: 1; transform: translateY(0); }
.toast.success { border-color: rgba(34,197,94,0.4); }
.toast.error { border-color: rgba(239,68,68,0.4); }

/* ── 진행 표시줄 ── */
.progress-bar {
  height: 2px;
  background: var(--accent);
  width: 0%;
  transition: width 0.4s;
  position: fixed;
  top: 0; left: 0;
  z-index: 1000;
}
</style>
</head>
<body>

<!-- 진행 표시줄 -->
<div class="progress-bar" id="progress-bar"></div>

<!-- 헤더 -->
<header class="app-header">
  <h1>📋 테스트 결과서</h1>
  <span class="header-sub" id="header-sub">로딩 중...</span>
  <div class="header-spacer"></div>
  <button class="sync-btn" id="sync-btn" onclick="doSync()">
    <span class="sync-dot" id="sync-dot"></span>
    XML 동기화
  </button>
</header>

<!-- 요약 카드 -->
<div class="stats-bar" id="stats-bar">
  <div class="stat-card active" data-filter="all" onclick="setFilter('all')">
    <div class="stat-icon">📊</div>
    <div class="stat-info">
      <div class="stat-label">전체</div>
      <div class="stat-num total" id="stat-total">0</div>
    </div>
  </div>
  <div class="stat-card" data-filter="pass" onclick="setFilter('pass')">
    <div class="stat-icon">✅</div>
    <div class="stat-info">
      <div class="stat-label">통과</div>
      <div class="stat-num pass" id="stat-pass">0</div>
    </div>
  </div>
  <div class="stat-card" data-filter="fail" onclick="setFilter('fail')">
    <div class="stat-icon">❌</div>
    <div class="stat-info">
      <div class="stat-label">실패</div>
      <div class="stat-num fail" id="stat-fail">0</div>
    </div>
  </div>
  <div class="stat-card" data-filter="pending" onclick="setFilter('pending')">
    <div class="stat-icon">⏳</div>
    <div class="stat-info">
      <div class="stat-label">미완</div>
      <div class="stat-num pending" id="stat-pending">0</div>
    </div>
  </div>
  <div class="stat-card" data-filter="skip" onclick="setFilter('skip')">
    <div class="stat-icon">⏭️</div>
    <div class="stat-info">
      <div class="stat-label">스킵</div>
      <div class="stat-num skip" id="stat-skip">0</div>
    </div>
  </div>
</div>

<!-- 툴바 -->
<div class="toolbar">
  <input class="search-box" id="search-box" type="text" placeholder="🔍  TC 번호, 이름, 목적 검색..." oninput="applyFilters()">
  <select class="folder-select" id="folder-select" onchange="applyFilters()">
    <option value="">전체 폴더</option>
  </select>
  <div class="tb-spacer"></div>
  <span class="result-count"><strong id="visible-count">0</strong>개 표시</span>
</div>

<!-- 테이블 -->
<div class="table-wrap" id="table-wrap">
  <div class="empty-state" id="empty-state">
    <div class="empty-icon">📂</div>
    <div class="empty-title">테스트 케이스가 없습니다</div>
    <div class="empty-sub">XML 파일에서 테스트 케이스를 불러오세요</div>
    <button class="sync-now-btn" onclick="doSync()">지금 XML 동기화</button>
  </div>
  <table id="tc-table">
    <thead>
      <tr>
        <th style="width:40px"></th>
        <th style="width:80px">상태</th>
        <th style="width:130px">TC 번호</th>
        <th>테스트 케이스</th>
        <th style="width:180px">폴더</th>
        <th style="width:60px;text-align:center">스텝</th>
      </tr>
    </thead>
    <tbody id="tc-tbody"></tbody>
  </table>
</div>

<!-- 토스트 -->
<div class="toast" id="toast"></div>

<script>
var allCases = [];
var allResults = {};
var currentFilter = 'all';
var expandedKey = null;

// ── 초기 로드 ──
(function init() {
  loadData();
})();

function loadData() {
  fetch('/api/cases')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      allCases = data.cases || [];
      allResults = data.results || {};
      updateStats(data.stats || {});
      populateFolderFilter();
      applyFilters();
      var sub = data.meta && data.meta.last_sync
        ? '마지막 동기화: ' + formatDate(data.meta.last_sync) + ' (' + (data.meta.files || []).length + '개 파일)'
        : 'XML 동기화가 필요합니다';
      document.getElementById('header-sub').textContent = sub;
    })
    .catch(function(e) {
      showToast('데이터 로드 실패: ' + e.message, 'error');
    });
}

// ── 통계 ──
function updateStats(stats) {
  document.getElementById('stat-total').textContent = stats.total || 0;
  document.getElementById('stat-pass').textContent = stats.pass || 0;
  document.getElementById('stat-fail').textContent = stats.fail || 0;
  document.getElementById('stat-pending').textContent = stats.pending || 0;
  document.getElementById('stat-skip').textContent = stats.skip || 0;
}

// ── 폴더 필터 ──
function populateFolderFilter() {
  var folders = [...new Set(allCases.map(function(c) { return c.folder; }).filter(Boolean))].sort();
  var sel = document.getElementById('folder-select');
  sel.innerHTML = '<option value="">전체 폴더</option>';
  folders.forEach(function(f) {
    var opt = document.createElement('option');
    opt.value = f;
    opt.textContent = f;
    sel.appendChild(opt);
  });
}

// ── 필터 적용 ──
function setFilter(f) {
  currentFilter = f;
  document.querySelectorAll('.stat-card').forEach(function(c) {
    c.classList.toggle('active', c.dataset.filter === f);
  });
  applyFilters();
}

function applyFilters() {
  var search = (document.getElementById('search-box').value || '').toLowerCase();
  var folder = document.getElementById('folder-select').value;

  var visible = allCases.filter(function(tc) {
    var result = allResults[tc.key] || {};
    var status = result.status || 'pending';
    if (currentFilter !== 'all' && status !== currentFilter) return false;
    if (folder && tc.folder !== folder) return false;
    if (search) {
      var haystack = (tc.key + ' ' + tc.name + ' ' + tc.objective).toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  renderTable(visible);
  document.getElementById('visible-count').textContent = visible.length;

  var empty = document.getElementById('empty-state');
  empty.classList.toggle('show', allCases.length === 0);
  document.getElementById('tc-table').style.display = allCases.length === 0 ? 'none' : '';
}

// ── 테이블 렌더링 ──
function renderTable(cases) {
  var tbody = document.getElementById('tc-tbody');
  var html = '';

  cases.forEach(function(tc) {
    var result = allResults[tc.key] || {};
    var status = result.status || 'pending';
    var badgeClass = 'badge-' + status;
    var badgeText = { pass: '통과', fail: '실패', pending: '미완', skip: '스킵' }[status] || '미완';
    var badgeIcon = { pass: '✓', fail: '✗', pending: '○', skip: '–' }[status] || '○';
    var isOpen = expandedKey === tc.key;

    html += '<tr class="tc-row' + (isOpen ? ' expanded' : '') + '" data-key="' + esc(tc.key) + '" onclick="toggleRow(\'' + esc(tc.key) + '\')">';
    html += '<td><span class="expand-arrow">▶</span></td>';
    html += '<td><span class="status-badge ' + badgeClass + '">' + badgeIcon + ' ' + badgeText + '</span></td>';
    html += '<td><div class="tc-key">' + esc(tc.key) + '</div></td>';
    html += '<td>';
    html += '<div class="tc-name">' + esc(tc.name) + '</div>';
    if (tc.objective) html += '<div class="tc-objective">' + esc(tc.objective) + '</div>';
    html += '</td>';
    html += '<td><span class="tc-folder">' + esc(tc.folder || '') + '</span></td>';
    html += '<td><span class="tc-step-count">' + (tc.steps ? tc.steps.length : 0) + '</span></td>';
    html += '</tr>';

    // 상세 행
    html += '<tr class="detail-row' + (isOpen ? ' open' : '') + '" data-key="' + esc(tc.key) + '">';
    html += '<td class="detail-cell" colspan="6">';
    html += buildDetailHTML(tc, result);
    html += '</td></tr>';
  });

  tbody.innerHTML = html;

  // 저장 버튼 이벤트 등록
  tbody.querySelectorAll('.save-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var key = btn.dataset.key;
      saveResult(key);
    });
  });

  // textarea, select 클릭 시 행 확장 방지
  tbody.querySelectorAll('.result-form input, .result-form textarea, .result-form select').forEach(function(el) {
    el.addEventListener('click', function(e) { e.stopPropagation(); });
  });
}

function buildDetailHTML(tc, result) {
  var html = '<div class="detail-inner">';

  // 전제조건
  if (tc.precondition) {
    html += '<div class="precondition-box">';
    html += '<div class="precondition-label">전제조건</div>';
    html += '<div>' + escNl(tc.precondition) + '</div>';
    html += '</div>';
  }

  // 관련 이슈
  if (tc.issues && tc.issues.length > 0) {
    html += '<div class="issues-list">';
    tc.issues.forEach(function(issue) {
      html += '<span class="issue-tag">🐛 ' + esc(issue.key) + (issue.summary ? ': ' + esc(issue.summary.substring(0, 60)) : '') + '</span>';
    });
    html += '</div>';
  }

  // 스텝 목록
  if (tc.steps && tc.steps.length > 0) {
    html += '<div class="steps-list">';
    tc.steps.forEach(function(step) {
      html += '<div class="step-item">';
      html += '<div class="step-header">';
      html += '<span class="step-num">Step ' + (step.index + 1) + '</span>';

      // 스텝 제목 추출 (첫 줄 또는 대괄호 내용)
      var title = '';
      if (step.description) {
        var m = step.description.match(/\\[([^\\]]+)\\]/);
        title = m ? m[1] : step.description.split('\\n')[0];
        if (title.length > 60) title = title.substring(0, 60) + '...';
      }
      html += '<span class="step-title">' + esc(title) + '</span>';
      html += '</div>';
      html += '<div class="step-body">';

      if (step.description) {
        html += '<div class="step-field-label">📋 절차</div>';
        html += '<div class="step-text">' + escNl(step.description) + '</div>';
      }
      if (step.expectedResult) {
        html += '<div class="step-field-label" style="margin-top:8px">✅ 기대 결과</div>';
        html += '<div class="step-text expected">' + escNl(step.expectedResult) + '</div>';
      }
      if (step.testData) {
        html += '<div class="step-data">📌 테스트 데이터: ' + esc(step.testData) + '</div>';
      }

      html += '</div></div>';
    });
    html += '</div>';
  }

  // 결과 입력 폼
  var key = tc.key;
  var curStatus = result.status || 'pending';
  var curActual = result.actual_result || '';
  var curNotes = result.notes || '';

  html += '<div class="result-form">';
  html += '<div class="form-title">🖊️ 테스트 결과 입력</div>';
  html += '<div class="form-row">';
  html += '<div class="form-group" style="max-width:180px">';
  html += '<label class="form-label">테스트 결과</label>';
  html += '<select class="status-select" id="sel-' + esc(key) + '" onclick="event.stopPropagation()">';
  ['pass', 'fail', 'pending', 'skip'].forEach(function(s) {
    var labels = { pass: '✓ 통과', fail: '✗ 실패', pending: '○ 미완', skip: '– 스킵' };
    html += '<option value="' + s + '"' + (curStatus === s ? ' selected' : '') + '>' + labels[s] + '</option>';
  });
  html += '</select></div></div>';

  html += '<div class="form-row">';
  html += '<div class="form-group">';
  html += '<label class="form-label">실제 동작 내용</label>';
  html += '<textarea class="result-textarea" id="act-' + esc(key) + '" placeholder="실제로 어떻게 동작했는지 입력하세요..." onclick="event.stopPropagation()">' + esc(curActual) + '</textarea>';
  html += '</div>';
  html += '<div class="form-group">';
  html += '<label class="form-label">비고 / 이슈</label>';
  html += '<textarea class="result-textarea" id="note-' + esc(key) + '" placeholder="특이사항, 이슈 번호 등..." onclick="event.stopPropagation()">' + esc(curNotes) + '</textarea>';
  html += '</div>';
  html += '</div>';

  html += '<div class="form-actions">';
  html += '<button class="save-btn" data-key="' + esc(key) + '">💾 저장</button>';
  html += '<span class="save-status" id="saved-' + esc(key) + '">✓ 저장됨</span>';
  html += '</div>';
  html += '</div>';

  html += '</div>';
  return html;
}

// ── 행 토글 ──
function toggleRow(key) {
  if (expandedKey === key) {
    expandedKey = null;
  } else {
    expandedKey = key;
  }
  applyFilters();
  if (expandedKey) {
    setTimeout(function() {
      var el = document.querySelector('.detail-row.open');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }
}

// ── 결과 저장 ──
function saveResult(key) {
  var statusEl = document.getElementById('sel-' + key);
  var actualEl = document.getElementById('act-' + key);
  var noteEl = document.getElementById('note-' + key);
  if (!statusEl) return;

  var btn = document.querySelector('.save-btn[data-key="' + key + '"]');
  if (btn) btn.disabled = true;

  fetch('/api/result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: key,
      status: statusEl.value,
      actual_result: actualEl ? actualEl.value : '',
      notes: noteEl ? noteEl.value : ''
    })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.ok) {
      allResults[key] = data.result;
      showToast('저장 완료: ' + key, 'success');
      var savedEl = document.getElementById('saved-' + key);
      if (savedEl) { savedEl.classList.add('visible'); setTimeout(function() { savedEl.classList.remove('visible'); }, 2000); }
      // 상태 배지 갱신
      updateStats(data.stats);
    } else {
      showToast('저장 실패', 'error');
    }
    if (btn) btn.disabled = false;
  })
  .catch(function(e) {
    showToast('저장 오류: ' + e.message, 'error');
    if (btn) btn.disabled = false;
  });
}

// ── XML 동기화 ──
function doSync() {
  var btn = document.getElementById('sync-btn');
  var dot = document.getElementById('sync-dot');
  btn.disabled = true;
  dot.classList.add('spin');
  setProgress(30);

  fetch('/api/sync', { method: 'POST' })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      setProgress(100);
      showToast('동기화 완료: TC ' + data.total + '개 (' + data.new + '개 신규)', 'success');
      setTimeout(function() {
        setProgress(0);
        loadData();
      }, 400);
    })
    .catch(function(e) {
      showToast('동기화 오류: ' + e.message, 'error');
      setProgress(0);
    })
    .finally(function() {
      btn.disabled = false;
      dot.classList.remove('spin');
    });
}

// ── 유틸 ──
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function escNl(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>');
}
function formatDate(iso) {
  if (!iso) return '-';
  var d = new Date(iso);
  return d.toLocaleDateString('ko-KR') + ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}
function setProgress(p) {
  document.getElementById('progress-bar').style.width = p + '%';
}

var toastTimer = null;
function showToast(msg, type) {
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
const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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
      cases: Object.values(db.test_cases),
      results: db.results,
      stats: getStats(db),
      meta: db.meta
    }));
    return;
  }

  // ── POST /api/result ──
  if (req.method === 'POST' && pathname === '/api/result') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { key, status, actual_result, notes } = JSON.parse(body);
        if (!key) { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: 'key required' })); return; }

        const db = loadDB();
        db.results[key] = {
          status: status || 'pending',
          actual_result: actual_result || '',
          notes: notes || '',
          updated_at: new Date().toISOString()
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

// 시작 시 XML 자동 동기화
try {
  const result = syncXML();
  console.log('');
  console.log('  ✅ XML 동기화 완료: TC ' + result.total + '개 (' + result.files + '개 파일)');
} catch (e) {
  console.log('  ⚠️  XML 동기화 오류:', e.message);
}

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  브라우저에서 열기: http://localhost:' + PORT);
  console.log('');
  console.log('  종료: Ctrl+C');
  console.log('');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error('  오류: 포트 ' + PORT + ' 이미 사용 중입니다.');
    process.exit(1);
  }
  throw e;
});
