#!/usr/bin/env node
'use strict';

const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 9999;
const ROOT = __dirname;
const TEST_DIR = path.join(ROOT, 'tests');

const CATEGORIES = {
  '인증 / 계정': ['auth.spec.ts', 'login.spec.ts', 'login-validation.spec.ts', 'find-id.spec.ts', 'register.spec.ts'],
  '공통 UI': ['main.spec.ts', 'header.spec.ts', 'footer.spec.ts', 'search.spec.ts'],
  '콘텐츠': ['contents.spec.ts', 'contents-detail.spec.ts', 'contents-html.spec.ts', 'contents-purchase.spec.ts', 'category.spec.ts', 'download.spec.ts'],
  '마이페이지': ['mypage.spec.ts'],
  '고객센터': ['cs.spec.ts', 'corporate-inquiry.spec.ts'],
  '시각적 회귀': ['visual.spec.ts'],
  '기타': ['chat.spec.ts'],
};

let currentProc = null;

function getSpecFiles() {
  try {
    return fs.readdirSync(TEST_DIR).filter(f => f.endsWith('.spec.ts')).sort();
  } catch (e) {
    return [];
  }
}

function buildCategoryData() {
  const allFiles = getSpecFiles();
  const assigned = new Set();
  const result = {};

  for (const [cat, files] of Object.entries(CATEGORIES)) {
    const existing = files.filter(f => allFiles.includes(f));
    if (existing.length > 0) {
      result[cat] = existing;
      existing.forEach(f => assigned.add(f));
    }
  }

  const rest = allFiles.filter(f => !assigned.has(f));
  if (rest.length > 0) {
    result['기타'] = [...(result['기타'] || []), ...rest];
  }

  return { categories: result, allFiles };
}

// ─── HTML ──────────────────────────────────────────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Playwright Test Runner</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0d0d0d;
    --bg2: #141414;
    --bg3: #1a1a1a;
    --bg4: #222;
    --border: #2a2a2a;
    --text: #e0e0e0;
    --text2: #999;
    --text3: #666;
    --accent: #7c3aed;
    --accent-light: #a78bfa;
    --green: #22c55e;
    --red: #ef4444;
    --yellow: #f59e0b;
    --blue: #3b82f6;
  }
  html, body { height: 100%; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Malgun Gothic', sans-serif;
    background: var(--bg);
    color: var(--text);
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  /* ── Header ── */
  .app-header {
    background: #0f0f1a;
    border-bottom: 1px solid #1e1e3a;
    padding: 0 20px;
    height: 52px;
    display: flex;
    align-items: center;
    gap: 16px;
    flex-shrink: 0;
  }
  .app-header h1 { font-size: 16px; font-weight: 700; color: var(--accent-light); letter-spacing: -0.3px; }
  .header-badge {
    background: #1e1e3a;
    color: var(--accent-light);
    border-radius: 20px;
    padding: 2px 10px;
    font-size: 11px;
    font-weight: 600;
  }
  .header-spacer { flex: 1; }
  .header-hint { font-size: 12px; color: var(--text3); }

  /* ── Layout ── */
  .app-body {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* ── Sidebar ── */
  .sidebar {
    width: 280px;
    min-width: 200px;
    background: var(--bg2);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    flex-shrink: 0;
  }
  .sidebar-top {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .sidebar-top-label { font-size: 11px; font-weight: 600; color: var(--text3); text-transform: uppercase; letter-spacing: 0.6px; }
  .mini-btns { display: flex; gap: 4px; }
  .mini-btn {
    background: var(--bg3);
    border: 1px solid var(--border);
    color: var(--text2);
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.12s;
  }
  .mini-btn:hover { background: var(--bg4); color: var(--text); border-color: #444; }

  .file-tree { flex: 1; overflow-y: auto; padding: 6px 0; }
  .file-tree::-webkit-scrollbar { width: 4px; }
  .file-tree::-webkit-scrollbar-track { background: transparent; }
  .file-tree::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  .category-header {
    display: flex;
    align-items: center;
    padding: 6px 12px;
    cursor: pointer;
    user-select: none;
    gap: 6px;
  }
  .category-header:hover { background: var(--bg3); }
  .cat-arrow { font-size: 9px; color: var(--text3); transition: transform 0.15s; }
  .cat-arrow.open { transform: rotate(90deg); }
  .cat-name { font-size: 11px; font-weight: 600; color: var(--text2); text-transform: uppercase; letter-spacing: 0.4px; flex: 1; }
  .cat-count { font-size: 10px; color: var(--text3); }

  .category-files { display: none; }
  .category-files.open { display: block; }

  .file-item {
    display: flex;
    align-items: center;
    padding: 5px 12px 5px 24px;
    cursor: pointer;
    gap: 8px;
    border-left: 2px solid transparent;
    transition: all 0.1s;
    position: relative;
  }
  .file-item:hover { background: var(--bg3); }
  .file-item.selected { border-left-color: var(--accent); background: #1a1a2e; }
  .file-item input[type="checkbox"] { accent-color: var(--accent); width: 13px; height: 13px; flex-shrink: 0; cursor: pointer; }
  .file-item-name { font-size: 12.5px; color: #c8c8c8; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file-item.selected .file-item-name { color: var(--accent-light); }
  .file-status { width: 7px; height: 7px; border-radius: 50%; background: var(--bg4); flex-shrink: 0; transition: background 0.2s; }
  .file-status.pass { background: var(--green); }
  .file-status.fail { background: var(--red); }
  .file-status.running { background: var(--yellow); animation: blink 0.8s ease-in-out infinite; }

  @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }

  /* ── Main content ── */
  .main-content { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }

  /* ── Controls bar ── */
  .controls-bar {
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    background: var(--bg2);
    flex-shrink: 0;
  }
  .btn {
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    padding: 7px 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.12s;
    white-space: nowrap;
  }
  .btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-primary:hover:not(:disabled) { background: #6d28d9; }
  .btn-secondary { background: #1a1a2e; color: var(--accent-light); border: 1px solid #3a3a6a; }
  .btn-secondary:hover:not(:disabled) { background: #1e1e3a; }
  .btn-stop { background: #3a1a1a; color: #fca5a5; border: 1px solid #5a2a2a; }
  .btn-stop:hover:not(:disabled) { background: #4a2020; }
  .btn-ghost { background: var(--bg3); color: var(--text2); border: 1px solid var(--border); }
  .btn-ghost:hover:not(:disabled) { background: var(--bg4); color: var(--text); }

  .select-box {
    background: var(--bg3);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 13px;
    cursor: pointer;
    outline: none;
  }
  .select-box:focus { border-color: var(--accent); }

  .controls-sep { width: 1px; height: 20px; background: var(--border); }
  .sel-info { font-size: 12px; color: var(--text3); }
  .sel-info strong { color: var(--accent-light); }
  .ml-auto { margin-left: auto; }

  /* ── Console ── */
  .console-wrap { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
  .console-header {
    padding: 6px 16px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--bg3);
    flex-shrink: 0;
  }
  .console-label { font-size: 11px; font-weight: 600; color: var(--text3); text-transform: uppercase; letter-spacing: 0.5px; }
  .stat-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 10px;
    font-weight: 600;
  }
  .stat-pass { background: #14301a; color: var(--green); }
  .stat-fail { background: #301414; color: var(--red); }
  .stat-skip { background: #2a2a14; color: var(--yellow); }
  .elapsed { font-size: 11px; color: var(--text3); }

  .console-out {
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px;
    background: #060606;
    font-family: 'Cascadia Code', 'Consolas', 'Courier New', monospace;
    font-size: 12px;
    line-height: 1.65;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .console-out::-webkit-scrollbar { width: 5px; }
  .console-out::-webkit-scrollbar-track { background: transparent; }
  .console-out::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
  .console-out .L { display: block; }
  .console-out .L-pass { color: #4ade80; }
  .console-out .L-fail { color: #f87171; }
  .console-out .L-skip { color: #fbbf24; }
  .console-out .L-info { color: #64748b; }
  .console-out .L-done { color: var(--accent-light); font-weight: 700; }
  .console-out .L-err  { color: #f87171; }
  .console-out .L-sep  { color: #333; }

  /* ── Status bar ── */
  .status-bar {
    padding: 5px 16px;
    background: #0a0a0a;
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 11px;
    color: var(--text3);
    flex-shrink: 0;
  }
  .status-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--bg4); }
  .status-dot.idle { background: var(--text3); }
  .status-dot.running { background: var(--yellow); animation: blink 0.8s ease-in-out infinite; }
  .status-dot.pass { background: var(--green); }
  .status-dot.fail { background: var(--red); }
  .cmd-preview { font-family: monospace; color: #555; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
  .cmd-copy { cursor: pointer; color: #444; font-size: 11px; transition: color 0.1s; }
  .cmd-copy:hover { color: var(--accent-light); }
</style>
</head>
<body>

<header class="app-header">
  <h1>&#127917; Playwright Test Runner</h1>
  <span class="header-badge" id="total-badge">로딩 중...</span>
  <div class="header-spacer"></div>
  <span class="header-hint">테스트를 선택하고 실행하세요</span>
</header>

<div class="app-body">
  <!-- Sidebar -->
  <aside class="sidebar">
    <div class="sidebar-top">
      <span class="sidebar-top-label">테스트 파일</span>
      <div class="mini-btns">
        <button class="mini-btn" onclick="selectAll()">전체</button>
        <button class="mini-btn" onclick="clearAll()">해제</button>
      </div>
    </div>
    <div class="file-tree" id="file-tree">
      <span style="padding:16px;color:#555;font-size:12px;display:block">로딩 중...</span>
    </div>
  </aside>

  <!-- Main -->
  <div class="main-content">
    <div class="controls-bar">
      <button class="btn btn-primary" id="btn-run" onclick="runSelected()" disabled>
        &#9654; 선택 실행
      </button>
      <button class="btn btn-secondary" id="btn-all" onclick="runAll()">
        &#9654;&#9654; 전체 실행
      </button>
      <button class="btn btn-stop" id="btn-stop" onclick="stopRun()" style="display:none">
        &#9646;&#9646; 중단
      </button>
      <div class="controls-sep"></div>
      <select class="select-box" id="proj-select">
        <option value="">모든 브라우저</option>
        <option value="chromium">Chromium</option>
        <option value="webkit">WebKit (Safari)</option>
      </select>
      <div class="controls-sep"></div>
      <span class="sel-info"><strong id="sel-count">0</strong>개 선택됨</span>
      <button class="btn btn-ghost ml-auto" onclick="clearConsole()">콘솔 지우기</button>
    </div>

    <div class="console-wrap">
      <div class="console-header">
        <span class="console-label">출력</span>
        <span class="stat-badge stat-pass" id="stat-pass" style="display:none">&#10003; <span id="pass-cnt">0</span>개 통과</span>
        <span class="stat-badge stat-fail" id="stat-fail" style="display:none">&#10007; <span id="fail-cnt">0</span>개 실패</span>
        <span class="stat-badge stat-skip" id="stat-skip" style="display:none">&#8722; <span id="skip-cnt">0</span>개 스킵</span>
        <span class="elapsed" id="elapsed"></span>
      </div>
      <div class="console-out" id="console-out">
        <span class="L L-info">&#9474; Playwright Test Runner 준비됨</span>
        <span class="L L-info">&#9474; 좌측에서 테스트 파일을 선택하고 실행 버튼을 누르세요.</span>
        <span class="L L-sep">&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;</span>
      </div>
    </div>

    <div class="status-bar">
      <div class="status-dot idle" id="status-dot"></div>
      <span id="status-text">대기 중</span>
      <span class="cmd-preview" id="cmd-preview"></span>
      <span class="cmd-copy" id="cmd-copy" onclick="copyCmd()" style="display:none">복사</span>
    </div>
  </div>
</div>

<script>
var catData = {};
var allFiles = [];
var selected = {};
var running = false;
var abortCtrl = null;
var startTime = 0;
var lastCmd = '';
var timerInterval = null;

// ── Load tests ──
fetch('/api/tests')
  .then(function(r) { return r.json(); })
  .then(function(data) {
    catData = data.categories;
    allFiles = data.allFiles;
    renderTree();
    var total = allFiles.length;
    document.getElementById('total-badge').textContent = total + '개 파일';
  })
  .catch(function() {
    document.getElementById('file-tree').innerHTML = '<span style="padding:16px;color:#f87171;font-size:12px;display:block">파일 로드 실패</span>';
  });

function renderTree() {
  var html = '';
  var cats = Object.keys(catData);
  for (var i = 0; i < cats.length; i++) {
    var cat = cats[i];
    var files = catData[cat];
    var openClass = i < 3 ? ' open' : '';
    var arrowClass = i < 3 ? ' open' : '';
    html += '<div class="category-section" id="cat-' + i + '">';
    html += '<div class="category-header" onclick="toggleCat(' + i + ')">';
    html += '<span class="cat-arrow' + arrowClass + '" id="arr-' + i + '">&#9654;</span>';
    html += '<span class="cat-name">' + escHtml(cat) + '</span>';
    html += '<span class="cat-count">' + files.length + '</span>';
    html += '</div>';
    html += '<div class="category-files' + openClass + '" id="files-' + i + '">';
    for (var j = 0; j < files.length; j++) {
      var f = files[j];
      var label = f.replace('.spec.ts', '');
      var chk = selected[f] ? ' checked' : '';
      var selClass = selected[f] ? ' selected' : '';
      html += '<div class="file-item' + selClass + '" id="item-' + f + '">';
      html += '<input type="checkbox" id="cb-' + f + '"' + chk + ' onchange="toggleFile(\'' + escJs(f) + '\')">';
      html += '<span class="file-item-name" onclick="toggleFile(\'' + escJs(f) + '\')">' + escHtml(label) + '</span>';
      html += '<div class="file-status" id="fs-' + f + '"></div>';
      html += '</div>';
    }
    html += '</div>';
    html += '</div>';
  }
  document.getElementById('file-tree').innerHTML = html;
  updateSelCount();
}

function toggleCat(i) {
  var el = document.getElementById('files-' + i);
  var arr = document.getElementById('arr-' + i);
  if (el.classList.contains('open')) {
    el.classList.remove('open');
    arr.classList.remove('open');
  } else {
    el.classList.add('open');
    arr.classList.add('open');
  }
}

function toggleFile(f) {
  selected[f] = !selected[f];
  var cb = document.getElementById('cb-' + f);
  if (cb) cb.checked = !!selected[f];
  var item = document.getElementById('item-' + f);
  if (item) {
    if (selected[f]) item.classList.add('selected');
    else item.classList.remove('selected');
  }
  updateSelCount();
}

function selectAll() {
  for (var i = 0; i < allFiles.length; i++) selected[allFiles[i]] = true;
  renderTree();
}

function clearAll() {
  selected = {};
  renderTree();
}

function updateSelCount() {
  var cnt = Object.keys(selected).filter(function(k) { return selected[k]; }).length;
  document.getElementById('sel-count').textContent = cnt;
  document.getElementById('btn-run').disabled = cnt === 0 || running;
}

function getSelected() {
  return Object.keys(selected).filter(function(k) { return selected[k]; });
}

// ── Run ──
function runSelected() {
  var files = getSelected();
  if (!files.length) return;
  startRun(files);
}

function runAll() {
  startRun([]);
}

function stopRun() {
  if (abortCtrl) { abortCtrl.abort(); abortCtrl = null; }
  fetch('/api/stop', { method: 'POST' }).catch(function() {});
  setRunning(false);
  appendLog('\\n&#9646; 실행 중단됨', 'skip');
  document.getElementById('status-dot').className = 'status-dot idle';
  document.getElementById('status-text').textContent = '중단됨';
  stopTimer();
}

function startRun(files) {
  if (running) return;
  clearConsole();
  setRunning(true);
  resetStats();

  var proj = document.getElementById('proj-select').value;
  var cmd = 'npx playwright test';
  if (proj) cmd += ' --project=' + proj;
  if (files.length > 0) {
    cmd += ' ' + files.map(function(f) { return 'tests/' + f; }).join(' ');
  }
  lastCmd = cmd;
  document.getElementById('cmd-preview').textContent = cmd;
  document.getElementById('cmd-copy').style.display = 'inline';

  var label = files.length ? files.map(function(f) { return f.replace('.spec.ts', ''); }).join(', ') : '전체';
  appendLog('> ' + cmd, 'info');
  appendLog('실행 시작: ' + label, 'info');
  appendLog('────────────────────────────────────────', 'sep');

  // Set running status on selected files
  files.forEach(function(f) {
    var fs = document.getElementById('fs-' + f);
    if (fs) fs.className = 'file-status running';
  });
  if (!files.length) {
    allFiles.forEach(function(f) {
      var fs = document.getElementById('fs-' + f);
      if (fs) fs.className = 'file-status running';
    });
  }

  startTime = Date.now();
  startTimer();

  document.getElementById('status-dot').className = 'status-dot running';
  document.getElementById('status-text').textContent = '실행 중...';

  abortCtrl = new AbortController();

  fetch('/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: files, project: proj }),
    signal: abortCtrl.signal
  }).then(function(res) {
    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var buf = '';
    var passCnt = 0, failCnt = 0, skipCnt = 0;

    function read() {
      reader.read().then(function(chunk) {
        if (chunk.done) { setRunning(false); return; }
        buf += decoder.decode(chunk.value, { stream: true });
        var parts = buf.split('\\n\\n');
        buf = parts.pop();
        parts.forEach(function(part) {
          var dataLine = part.split('\\n').filter(function(l) { return l.startsWith('data: '); })[0];
          if (!dataLine) return;
          try {
            var msg = JSON.parse(dataLine.slice(6));
            if (msg.type === 'line') {
              var text = msg.text;
              var cls = classifyLine(text);
              appendLog(stripAnsi(text), cls);
              if (cls === 'pass') passCnt++;
              else if (cls === 'fail') failCnt++;
              else if (cls === 'skip') skipCnt++;
              updateStats(passCnt, failCnt, skipCnt);
            } else if (msg.type === 'done') {
              stopTimer();
              var elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
              var ok = msg.code === 0;
              appendLog('────────────────────────────────────────', 'sep');
              appendLog((ok ? '&#10003; 완료: 모든 테스트 통과' : '&#10007; 완료: 실패한 테스트 있음') + '  (' + elapsed + 's)', ok ? 'done' : 'fail');
              document.getElementById('elapsed').textContent = elapsed + 's';
              document.getElementById('status-dot').className = 'status-dot ' + (ok ? 'pass' : 'fail');
              document.getElementById('status-text').textContent = ok ? '통과 ✓' : '실패 ✗';
              // Update file statuses
              var targetFiles = files.length ? files : allFiles;
              targetFiles.forEach(function(f) {
                var fsEl = document.getElementById('fs-' + f);
                if (fsEl) fsEl.className = 'file-status ' + (ok ? 'pass' : 'fail');
              });
              setRunning(false);
            }
          } catch(e) {}
        });
        read();
      }).catch(function() { setRunning(false); stopTimer(); });
    }
    read();
  }).catch(function(e) {
    if (e.name !== 'AbortError') {
      appendLog('연결 오류: ' + e.message, 'err');
    }
    setRunning(false);
    stopTimer();
  });
}

function setRunning(v) {
  running = v;
  document.getElementById('btn-run').disabled = v || getSelected().length === 0;
  document.getElementById('btn-all').disabled = v;
  document.getElementById('btn-stop').style.display = v ? 'inline-flex' : 'none';
}

// ── Console ──
function appendLog(text, cls) {
  var out = document.getElementById('console-out');
  var span = document.createElement('span');
  span.className = 'L L-' + (cls || '');
  span.innerHTML = text;
  out.appendChild(span);
  out.scrollTop = out.scrollHeight;
}

function clearConsole() {
  document.getElementById('console-out').innerHTML = '';
  resetStats();
  document.getElementById('elapsed').textContent = '';
}

function resetStats() {
  document.getElementById('stat-pass').style.display = 'none';
  document.getElementById('stat-fail').style.display = 'none';
  document.getElementById('stat-skip').style.display = 'none';
  document.getElementById('pass-cnt').textContent = '0';
  document.getElementById('fail-cnt').textContent = '0';
  document.getElementById('skip-cnt').textContent = '0';
}

function updateStats(p, f, s) {
  if (p > 0) { document.getElementById('stat-pass').style.display = 'flex'; document.getElementById('pass-cnt').textContent = p; }
  if (f > 0) { document.getElementById('stat-fail').style.display = 'flex'; document.getElementById('fail-cnt').textContent = f; }
  if (s > 0) { document.getElementById('stat-skip').style.display = 'flex'; document.getElementById('skip-cnt').textContent = s; }
}

// ── Timer ──
function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(function() {
    var e = ((Date.now() - startTime) / 1000).toFixed(1);
    document.getElementById('elapsed').textContent = e + 's';
  }, 500);
}
function stopTimer() { clearInterval(timerInterval); }

// ── Classify output lines ──
function classifyLine(line) {
  if (/passed|\\u2713|\\u2714|\\u2705/.test(line)) return 'pass';
  if (/failed|\\u2717|\\u2718|\\u274c|Error:|FAILED/.test(line)) return 'fail';
  if (/skipped|\\u2796|\\u23e9|pending/.test(line)) return 'skip';
  if (/^\\s*(Running|\\[)/.test(line)) return 'info';
  return '';
}

// ── Strip ANSI color codes ──
function stripAnsi(str) {
  return str.replace(/\\x1B\\[[0-9;]*m/g, '').replace(/\\x1B\\[[0-9;]*[A-Za-z]/g, '');
}

// ── Copy command ──
function copyCmd() {
  if (!lastCmd) return;
  navigator.clipboard.writeText(lastCmd).then(function() {
    var el = document.getElementById('cmd-copy');
    el.textContent = '복사됨!';
    setTimeout(function() { el.textContent = '복사'; }, 1500);
  });
}

// ── Helpers ──
function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escJs(s) { return s.replace(/\\\\/g,'\\\\\\\\').replace(/'/g,"\\\\'"); }
</script>
</body>
</html>`;

// ─── Server ────────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // ── GET / ──
  if (req.method === 'GET' && pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
    return;
  }

  // ── GET /api/tests ──
  if (req.method === 'GET' && pathname === '/api/tests') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(buildCategoryData()));
    return;
  }

  // ── POST /api/run ──
  if (req.method === 'POST' && pathname === '/api/run') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let files = [], project = '';
      try {
        const parsed = JSON.parse(body);
        files = parsed.files || [];
        project = parsed.project || '';
      } catch (e) {}

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const args = ['playwright', 'test', '--reporter=line'];
      if (project) args.push('--project=' + project);
      files.forEach(f => args.push('tests/' + f));

      const proc = spawn('npx', args, {
        cwd: ROOT,
        shell: true,
        env: { ...process.env },
      });

      currentProc = proc;

      const sendLine = (text) => {
        const lines = text.split(/\r?\n/);
        lines.forEach(line => {
          if (line) {
            res.write('data: ' + JSON.stringify({ type: 'line', text: line }) + '\n\n');
          }
        });
      };

      proc.stdout.on('data', data => sendLine(data.toString()));
      proc.stderr.on('data', data => sendLine(data.toString()));

      proc.on('close', code => {
        res.write('data: ' + JSON.stringify({ type: 'done', code: code || 0 }) + '\n\n');
        res.end();
        currentProc = null;
      });

      req.on('close', () => {
        if (proc && !proc.killed) proc.kill('SIGTERM');
      });
    });
    return;
  }

  // ── POST /api/stop ──
  if (req.method === 'POST' && pathname === '/api/stop') {
    if (currentProc && !currentProc.killed) {
      currentProc.kill('SIGTERM');
      currentProc = null;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  ==========================================');
  console.log('   Playwright Test Runner');
  console.log('  ==========================================');
  console.log('');
  console.log('  브라우저에서 열기: http://localhost:' + PORT);
  console.log('');
  console.log('  종료: Ctrl+C');
  console.log('');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error('  오류: 포트 ' + PORT + ' 이미 사용 중입니다.');
    console.error('  기존 서버를 종료하거나 PORT 변수를 변경하세요.');
    process.exit(1);
  }
  throw e;
});
