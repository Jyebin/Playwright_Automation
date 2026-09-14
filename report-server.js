#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9998;
const ROOT = __dirname;
const DB_FILE = path.join(ROOT, 'test-report-db.json');
const ASSETS_DIR = path.join(ROOT, 'report-assets');   // 리포터가 저장한 테스트 캡처 이미지 (실행마다 재생성, git 제외)
const SPEC_ASSETS_DIR = path.join(ROOT, 'spec-assets'); // 사용자가 올린 기대 화면(정상 스펙) 이미지 (git 포함)
const ATM_ASSETS_DIR = path.join(ROOT, 'atm-assets');   // ATM 첨부 이미지 로컬 사본 (npm run atm-images, git 제외)

// ATM 이미지 원래 주소 → 로컬 파일 경로 (실제로 파일이 있는 것만)
function loadAtmImages() {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(ATM_ASSETS_DIR, 'manifest.json'), 'utf-8'));
    const map = {};
    for (const [url, info] of Object.entries(manifest)) {
      if (info && info.file && fs.existsSync(path.join(ROOT, info.file))) map[url] = info.file;
    }
    return map;
  } catch (e) {
    return {};
  }
}
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

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
    revisions: {                      // 결과서에서 수정한 스펙 (XML 동기화에도 유지)
      "TCMETA-T416": {
        "0": {                        // 키는 스텝 index(0부터)
          fields:   { description?, expectedResult?, testData? },   // 원본과 달라진 항목만
          original: { ...같은 항목의 XML 원본 },
          updated_at, code_applied, applied_at
        }
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
  db.spec_images = db.spec_images || {};   // { TC키: { 스텝index: [{ id, name, path, uploaded_at }] } }
  db.hidden_atm_images = db.hidden_atm_images || {};   // 결과서에서 삭제한 ATM 기대 결과 이미지 { TC키: { 스텝index: [원래 주소] } } (XML 원본은 유지)
  db.meta = db.meta || { last_sync: null, files: [] };

  // 마이그레이션: 수동 판정 필드 제거 (결과는 자동화 실행으로만 판정)
  for (const r of Object.values(db.results)) {
    delete r.step_results;
    delete r.notes;
  }

  // 마이그레이션: 수정결과 v1 { expectedResult, original: "..." } → v2 { fields, original: {...} }
  for (const revs of Object.values(db.revisions)) {
    for (const rev of Object.values(revs)) {
      if (rev.fields) continue;
      rev.fields = { expectedResult: rev.expectedResult };
      rev.original = { expectedResult: rev.original || '' };
      delete rev.expectedResult;
    }
  }
  return db;
}

// 결과서에서 수정 가능한 스텝 항목
const REV_FIELDS = ['description', 'expectedResult', 'testData'];

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

// Zephyr 표 구조를 결과서에 그대로 보여주기 위한 최소 HTML
// 표·줄바꿈·굵게·목록·이미지(https 주소)만 남기고 속성·스타일·스크립트·링크 등은 제거
function sanitizeRichHtml(html) {
  const ALLOWED = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li']);
  const ZWSP = new RegExp(String.fromCharCode(0x200B), 'g');
  return String(html || '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (tag, name, attrs) => {
      const n = name.toLowerCase();
      const closing = tag.startsWith('</');
      if (n === 'img') {
        const m = attrs.match(/\bsrc="([^"]+)"/i);
        const src = m ? m[1].replace(/&amp;/g, '&') : '';
        return /^https:\/\//.test(src) ? `<img src="${src.replace(/"/g, '&quot;')}">` : '';
      }
      if (n === 'p' || n === 'div') return closing ? '<br>' : '';
      if (!ALLOWED.has(n)) return '';
      if (n === 'br') return closing ? '' : '<br>';
      if (closing) return `</${n}>`;
      if (n === 'td' || n === 'th') {
        const span = (attrs.match(/\b(?:colspan|rowspan)="\d+"/gi) || []).join(' ');
        return `<${n}${span ? ' ' + span : ''}>`;
      }
      return `<${n}>`;
    })
    .replace(ZWSP, '')
    .replace(/(<br>\s*){3,}/g, '<br><br>')
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
        const raw = {
          description:    getCDATA(sc, 'description'),
          expectedResult: getCDATA(sc, 'expectedResult'),
          testData:       getCDATA(sc, 'testData'),
        };
        const description    = stripHtml(raw.description);
        const expectedResult = stripHtml(raw.expectedResult);
        const testData       = stripHtml(raw.testData);

        // ATM에 첨부된 이미지(기대 화면 등): stripHtml 에서 사라지므로 주소를 따로 보존
        const images = {};
        // 표가 있는 필드는 표 구조를 살린 안전한 HTML 도 보존 (평문으로 풀면 표 안의 표·칸 속 이미지가 뒤섞임)
        const html = {};
        for (const [field, fieldHtml] of Object.entries(raw)) {
          const srcs = [...fieldHtml.matchAll(/<img[^>]*\bsrc="([^"]+)"/gi)].map(m => m[1].replace(/&amp;/g, '&'));
          if (srcs.length) images[field] = srcs;
          if (/<table[\s>]/i.test(fieldHtml)) html[field] = sanitizeRichHtml(fieldHtml);
        }

        if (description || expectedResult || images.expectedResult) {
          steps.push({
            index: parseInt(idx, 10), description, expectedResult, testData: testData || '',
            ...(Object.keys(images).length ? { images } : {}),
            ...(Object.keys(html).length ? { html } : {}),
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
// ─── 스펙 텍스트 표시용 포맷터 ─────────────────────────────────────────────────
// 원문은 그대로 두고 화면에만 적용: 번호/대시 목록, 줄바꿈, 평탄화된 "a | b | c |" 표 복원.
// 브라우저에서도 쓰이므로(HTML에 toString()으로 삽입) 외부 변수 없이 자체 완결로 작성할 것.
function formatSpecText(text, opts) {
  opts = opts || {};
  var esc = function (v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  var invisible = new RegExp('[' + String.fromCharCode(0x200B, 0xA0) + ']', 'g');
  var src = String(text || '').replace(/\r/g, '').replace(invisible, ' ').trim();
  if (opts.dropTitle) src = src.replace(/^\[[^\]\n]*\]\s*/, '');
  // 표 칸 하나 변환 (richHtml 에서 사용): 빨간 안내 문구·마스킹·placeholder 미리보기 적용
  if (opts.cell) return src ? valueHtml(src, opts.headCol || '', opts.rowKey || '') : '';
  if (!src) return '<span class="none">없음</span>';

  // 문장 뒤에 붙은 번호 항목을 새 줄로: "변경된다.4. 구분" / "진행 2. 로그인" / "[제목] 1. 내용"
  src = src.replace(/([^\d\s-])[ \t]*(?=\d{1,2}(?:-\d{1,2})?\.\s)/g, '$1\n');

  var HEADER = /^(항목|구분|필드명|No|검색탭|탭 항목)$/;

  function chips(label, list) {
    return (label ? '<div class="fx-chips-l">' + esc(label) + '</div>' : '') +
      '<div class="fx-chips">' + list.map(function (c) { return '<span class="fx-chip">' + esc(c) + '</span>'; }).join('') + '</div>';
  }

  // 입력 필드 미리보기: 빨간 안내 문구 / 마스킹 입력 / 문구 없음
  function mockField(state, content, help, note) {
    return '<div class="mock"><div class="mock-input ' + state + '">' + (content || '') + '</div>' +
      (help ? '<div class="mock-help">' + help + '</div>' : '') +
      (note ? '<div class="mock-note">' + note + '</div>' : '') + '</div>';
  }

  // 문장 안의 미리보기: "'문구' 가 필드 하단에 출력" → 입력칸+빨간 문구, "'문구' 알럿" → 알럿 박스
  function richText(s) {
    var h = esc(s);
    h = h.replace(/['‘]([^'’]{2,150})['’]\s*(?:가|이)?\s*(?:입력\s*)?필드\s*(?:하단|아래)에?\s*(?:빨간색으로\s*)?(?:출력|노출|표시)(?:됨|된다|되며|되고)?/g, function (_, m) {
      return '<span class="mock inline"><span class="mock-input err"></span><span class="mock-help">' + m + '</span></span>';
    });
    h = h.replace(/['‘]([^'’]{2,150})['’]\s*(알럿|alert|모달|modal|팝업)/gi, function (_, m, kind) {
      return '<span class="mock-alert"><span class="mock-alert-k">' + kind + '</span>' + m + '</span>';
    });
    return h;
  }

  // 표의 값 칸: placeholder / 빨간 안내 문구 / 마스킹 입력 / 문구 없음 은 입력 필드 미리보기로
  function valueHtml(v, headCol, rowKey) {
    if (/placeholder/i.test(headCol || '') || /^placeholder$/i.test(rowKey || '')) {
      return mockField('ph', esc(v));
    }
    var red = v.match(/^(.+?)\s*(?:text|텍스트|문구)(?:가|이)\s*(?:입력\s*필드\s*아래에?\s*)?빨간색으로\s*(?:출력|노출|표시)/);
    if (red) return mockField('err', '', esc(red[1].replace(/^['‘"]|['’"]$/g, '')));
    var noMsg = /아무런\s*(?:문구|text|텍스트)가\s*(?:뜨지|출력되지)\s*않|아무것도\s*출력되지\s*않/.test(v);
    var mask = v.match(/(\d+)\s*자리의?\s*마스킹/);
    if (mask) return mockField('ok', new Array(Math.min(20, +mask[1]) + 1).join('●'), '', noMsg ? '안내 문구 없음' : '');
    if (noMsg) return mockField('ok', '', '', '안내 문구 없음');
    return richText(v);
  }

  function isTable(body) {
    return body.split('|').filter(function (c) { return c.trim(); }).length >= 3;
  }

  function pipeHtml(body) {
    if (body.indexOf('|') === -1) return richText(body);
    var cells = body.split('|').map(function (c) { return c.trim(); }).filter(Boolean);
    if (cells.length < 3) return richText(body.replace(/\s*\|\s*$/, ''));   // 끝에 남은 "|" 제거

    var lead = '';
    var head = null;
    // "구분 및 내용을 확인한다. 구분 내용 한글" → 설명 / 헤더(구분, 내용) / 첫 셀(한글)
    var merged = cells[0].match(/^(.*?)\s*(구분|항목|No)\s+(내용|데이터)\s+(.+)$/);
    // "…표시됨항목" → 설명 / 헤더 첫 칸(항목)
    var tail = cells[0].match(/^(.+?)\s*(항목|구분|필드명)$/);
    if (merged) {
      lead = merged[1]; head = [merged[2], merged[3]]; cells[0] = merged[4];
    } else if (tail && cells.length % 2 === 0) {
      lead = tail[1]; cells[0] = tail[2];
    }
    if (!head && cells.length % 2 === 0 && HEADER.test(cells[0])) head = cells.splice(0, 2);

    var html = lead ? '<div>' + esc(lead) + '</div>' : '';
    if (!head || cells.length % 2 === 1) {
      // "탭 목록 | 공지사항 | 이벤트 |" 처럼 라벨 + 나열
      return html + (head ? chips(head.join(' / '), cells) : chips(cells[0], cells.slice(1)));
    }
    html += '<div class="fx-kv"><div class="fx-kv-h"><span>' + esc(head[0]) + '</span><span>' + esc(head[1]) + '</span></div>';
    for (var i = 0; i < cells.length; i += 2) {
      html += '<div class="fx-kv-r"><b>' + esc(cells[i]) + '</b><div>' + valueHtml(cells[i + 1], head[1], cells[i]) + '</div></div>';
    }
    return html + '</div>';
  }

  var NUM = /^(\d{1,2}(?:-\d{1,2})?)\.\s*(.*)$/;

  // 표 칸 안의 줄바꿈 복원: "|"로 끝나지 않은 표 줄은 다음 줄(번호 항목 제외)과 합침
  var lines = [];
  src.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).forEach(function (line) {
    var prev = lines[lines.length - 1];
    if (prev && prev.indexOf('|') !== -1 && !/\|$/.test(prev) && !NUM.test(line)) lines[lines.length - 1] = prev + ' ' + line;
    else lines.push(line);
  });

  var out = [];
  var items = [];   // { marker, body: [html...] }
  var pendingNum = '';
  function flush() {
    if (items.length) {
      out.push('<ul class="fx-list">' + items.map(function (it) {
        var sub = it.marker.indexOf('-') > 0;
        return '<li' + (sub ? ' class="sub"' : '') + '><span class="fx-mk">' + esc(it.marker) + '</span><div class="fx-b">' + it.body.join('') + '</div></li>';
      }).join('') + '</ul>');
    }
    items = [];
  }

  lines.forEach(function (line) {
    var title = line.match(/^\[([^\]]+)\]$/);
    if (title) { flush(); out.push('<div class="fx-title">' + esc(title[1]) + '</div>'); return; }

    var num = line.match(NUM);
    var dash = line.match(/^[-*•·]\s+(.*)$/);
    if (num && !num[2]) { pendingNum = num[1]; return; }   // "3." 만 있는 줄은 다음 줄에 번호로 붙임

    // 번호/대시 없는 표 줄은 새 항목 대신 바로 앞 항목에 붙임 ("2. 검색탭" + 표)
    if (!num && !dash && !pendingNum && items.length && isTable(line)) {
      items[items.length - 1].body.push(pipeHtml(line));
      return;
    }

    var marker = '-';
    var body = line;
    if (num) { marker = num[1] + '.'; body = num[2]; }
    else if (dash) { body = dash[1]; }
    else if (pendingNum) { marker = pendingNum + '.'; }
    pendingNum = '';
    items.push({ marker: marker, body: [pipeHtml(body)] });
  });
  flush();
  return '<div class="fx">' + out.join('') + '</div>';
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
.dc{padding:0 16px 24px 16px;background:#f8faff;border-bottom:3px solid var(--bd);}
.di{max-width:none;width:100%;}   /* 스텝 3분할이 화면 폭을 꽉 채우도록 */

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

.cmp-grid{display:grid;grid-template-columns:120px 1fr 1fr;gap:10px 16px;padding:12px 0;align-items:start;}
.cmp-h{font-size:11px;font-weight:700;color:var(--tx3);letter-spacing:.4px;}
.cmp-lbl{font-size:12px;font-weight:700;color:var(--tx2);padding-top:8px;display:flex;flex-direction:column;align-items:flex-start;gap:4px;}
.cmp-grid .sg-txt{background:var(--s2);padding:8px 12px;border-radius:6px;min-height:40px;}
.cmp-grid .sg-txt.exp{background:#eef2ff;}
.cmp-grid .sg-txt.missing{background:#fef2f2;color:#b91c1c;border:1px dashed #fca5a5;font-size:13px;}
.req{font-size:10px;font-weight:700;color:#b91c1c;background:#fee2e2;border-radius:8px;padding:1px 6px;}
.rev-ta.invalid{border-color:var(--fail);background:#fef2f2;}
.xml-imgs{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;}
.xml-img{display:inline-flex;align-items:center;padding:4px 10px;border:1px dashed var(--bd2);border-radius:6px;background:#fff;font-size:12px;color:var(--tx2);text-decoration:none;}
.xml-thumb{display:block;max-width:min(520px,100%);}
.xml-thumb img{display:block;max-width:100%;max-height:420px;border:1px solid var(--bd);border-radius:6px;background:#fff;}
.sg-txt.old .xml-img,.sg-txt.old .xml-thumb img{opacity:.6;}
.cmp-grid .sg-txt.old{background:var(--s2);color:var(--tx3);text-decoration:line-through;}
.none{color:var(--tx3);font-style:italic;}

/* 스펙 텍스트 포맷 (formatSpecText) */
.sg-txt.fxw{white-space:normal;}
.fx{font-size:13px;line-height:1.7;color:var(--tx2);word-break:break-word;}
.fx-title{font-weight:700;color:var(--tx);margin:2px 0 6px;}
.fx-list{list-style:none;margin:0 0 6px;padding:0;display:flex;flex-direction:column;gap:6px;}
.fx-list li{display:flex;gap:8px;align-items:flex-start;}
.fx-list li.sub{margin-left:20px;}
.fx-mk{flex-shrink:0;min-width:16px;font-weight:700;color:var(--ac);}
.fx-b{flex:1;min-width:0;}
.fx-kv{margin:6px 0 2px;border:1px solid var(--bd);border-radius:6px;overflow:hidden;background:rgba(255,255,255,.7);}
.fx-kv-h,.fx-kv-r{display:grid;grid-template-columns:minmax(90px,35%) 1fr;gap:10px;padding:5px 10px;}
.fx-kv-h{font-size:11px;font-weight:700;color:var(--tx3);background:rgba(148,163,184,.12);}
.fx-kv-r{border-top:1px solid var(--bd);}
.fx-kv-r b{font-weight:600;color:var(--tx);}
.fx-chips-l{font-weight:600;color:var(--tx);margin-top:4px;}
.fx-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;}
.fx-chip{background:rgba(255,255,255,.8);border:1px solid var(--bd2);border-radius:12px;padding:1px 10px;font-size:12px;color:var(--tx);}
.pre-box .fx{color:var(--ac2);}

/* 화면 미리보기 (입력 필드 / 알럿) */
.mock{display:flex;flex-direction:column;gap:3px;max-width:360px;}
.mock.inline{display:inline-flex;vertical-align:top;margin:3px 0;}
.mock-input{min-height:30px;min-width:200px;border:1px solid var(--bd2);border-bottom:2px solid var(--bd2);border-radius:4px;background:#fff;padding:4px 10px;font-size:13px;color:var(--tx);letter-spacing:2px;display:flex;align-items:center;}
.mock-input.err{border-bottom-color:#dc2626;}
.mock-input.ok{border-bottom-color:var(--ac);}
.mock-input.ph{color:var(--tx3);letter-spacing:0;}
.mock-help{font-size:12px;color:#dc2626;line-height:1.5;}
.mock-note{font-size:11px;color:var(--tx3);line-height:1.5;}
.mock-alert{display:inline-flex;flex-direction:column;gap:2px;background:#fff;border:1px solid var(--bd2);border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.08);padding:8px 12px;margin:3px 0;font-size:13px;color:var(--tx);max-width:440px;vertical-align:top;}
.mock-alert-k{font-size:10px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.4px;}
.sg-txt.old .mock-input,.sg-txt.old .mock-alert{opacity:.6;}

/* 테스트 캡처 (📸 실제 결과) */
.ev-list{display:flex;flex-wrap:wrap;gap:12px;margin-top:6px;}
.ev{margin:0;border:1px solid var(--bd);border-radius:8px;background:#fff;overflow:hidden;max-width:min(460px,100%);box-shadow:var(--shadow);}
.ev a{display:block;background:var(--s2);}
.ev img{display:block;max-width:100%;max-height:280px;margin:0 auto;object-fit:contain;}
.ev figcaption{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 10px;font-size:12px;color:var(--tx2);border-top:1px solid var(--bd);}
.ev figcaption .badge{padding:2px 8px;font-size:11px;}
.ev-n{font-weight:600;color:var(--tx);}
.ev-t{color:var(--tx3);}

/* 기대 화면 이미지 업로드 */
.ev-spec{border-color:#c7d2fe;}
.drop{margin-top:8px;border:2px dashed var(--bd2);border-radius:8px;padding:10px 14px;font-size:12px;color:var(--tx3);display:flex;align-items:center;gap:10px;flex-wrap:wrap;outline:none;cursor:pointer;transition:all .15s;}
.drop:focus,.drop.over{border-color:var(--ac);background:#eef2ff;color:var(--ac2);}
.drop.need{border-color:#fca5a5;background:#fef2f2;color:#b91c1c;}
.drop.need:focus,.drop.need.over{border-color:var(--fail);}
.img-pick{background:#fff;border:1px solid var(--bd2);border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;color:var(--tx2);}
.img-pick:hover{border-color:var(--ac);color:var(--ac2);}
.img-del{margin-left:auto;background:none;border:none;color:var(--tx3);cursor:pointer;font-size:12px;padding:0 2px;}
.img-del:hover{color:var(--fail);}
.atm-restore{align-self:flex-start;margin-top:6px;background:#fff;border:1px dashed var(--bd2);border-radius:6px;padding:4px 10px;font-size:12px;color:var(--tx2);cursor:pointer;}
.atm-restore:hover{border-color:var(--ac);color:var(--ac2);}

/* Zephyr 표 그대로 보여주기 (richHtml) */
.rich{overflow-x:auto;font-size:13px;line-height:1.6;color:var(--tx2);}
.rich table{border-collapse:collapse;width:100%;margin:6px 0;background:#fff;font-size:12.5px;}
.rich th,.rich td{border:1px solid var(--bd2);padding:6px 8px;vertical-align:top;text-align:left;}
.rich th{background:var(--s2);font-weight:700;color:var(--tx2);white-space:nowrap;}
.rich td{color:var(--tx);}
.rich table table{margin:0;}
.rich td .mock{max-width:100%;}
.rich td .mock-input{min-width:140px;}
.rich-img{position:relative;display:inline-block;max-width:100%;}
.rich-img img{display:block;max-width:100%;max-height:320px;border:1px solid var(--bd);border-radius:4px;background:#fff;}
.rich-img .img-del{position:absolute;top:4px;right:4px;margin:0;background:rgba(255,255,255,.95);border:1px solid var(--bd2);border-radius:4px;padding:1px 6px;}
.rich-hidden{font-size:11px;color:var(--tx3);}

/* 보기 모드 3분할: 절차·테스트 데이터 | 기대 | 실제 */
.tri{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr);gap:14px;padding:12px 0;}
.tri-col{display:flex;flex-direction:column;gap:12px;min-width:0;border-radius:8px;padding:12px;background:#fafbfc;border:1px solid var(--bd);}
.tri-exp{background:#f8f9ff;border-color:#c7d2fe;}
.tri-act{background:#fff;}
.tri-act.st-pass{border-color:#86efac;background:#f7fef9;}
.tri-act.st-fail{border-color:#fca5a5;background:#fffafa;}
.tri-act.st-skip{border-color:#fcd34d;background:#fffdf5;}
.tri-h{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;font-weight:800;color:var(--tx2);padding-bottom:8px;border-bottom:1px solid var(--bd);}
.tri-h .badge{font-size:12px;padding:3px 10px;}
.tri-field{display:flex;flex-direction:column;gap:6px;min-width:0;}
.tri-field > .cmp-lbl{padding-top:0;flex-direction:row;align-items:center;flex-wrap:wrap;}
.tri .sg-txt{background:#fff;padding:8px 12px;border-radius:6px;min-height:40px;border:1px solid var(--bd);}
.tri .sg-txt.exp{background:#eef2ff;border-color:#e0e7ff;}
.tri .sg-txt.missing{background:#fef2f2;color:#b91c1c;border:1px dashed #fca5a5;font-size:13px;}
.tri .ev{max-width:100%;}
.act-tests{display:flex;flex-direction:column;gap:8px;}
.act-test{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:13px;}
.act-test .badge{padding:2px 8px;font-size:11px;}
.act-test .run-err{width:100%;margin-top:0;}
.act-title{color:var(--tx);font-weight:600;}
.act-empty{font-size:12px;color:var(--tx3);line-height:1.7;background:var(--s2);border-radius:6px;padding:10px 12px;}
@media (max-width:1100px){ .tri{grid-template-columns:1fr;} }
.sg-col{display:flex;flex-direction:column;gap:6px;min-width:0;}
.sg-lbl{font-size:11px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.4px;display:flex;align-items:center;gap:6px;}
.sg-txt{font-size:13px;color:var(--tx2);line-height:1.7;white-space:pre-wrap;word-break:break-word;}
.sg-txt.exp{color:#312e81;background:#eef2ff;padding:8px 12px;border-radius:6px;}   /* 기대 결과: 중립색 (초록은 통과 전용) */
.sg-txt.exp.old{color:var(--tx3);background:var(--s2);text-decoration:line-through;}
.test-data{background:var(--s2);border-radius:6px;padding:6px 10px;font-size:12px;color:var(--tx3);margin-top:4px;white-space:pre-wrap;border:1px solid var(--bd);}

/* 수정결과 */
.rev-ta{background:#fff;border:2px solid var(--bd);color:var(--tx);padding:10px 12px;border-radius:var(--r);font-size:13px;line-height:1.6;resize:vertical;min-height:84px;font-family:inherit;outline:none;width:100%;transition:border-color .15s;}
.rev-ta:focus{border-color:var(--ac);}
.rev-ta.changed{border-color:#f59e0b;background:#fffbeb;}
/* 보기 모드: 라벨 | 내용 두 열 / 편집 모드: 라벨 | 원본 | 수정 세 열 */
.cmp-grid.view{grid-template-columns:120px 1fr;}
/* 편집 모드 수정 칸: 원본 칸 높이 이상 + 내용 줄 수만큼 (원본/수정 셀 모두 행 높이로 stretch) */
.cmp-grid .sg-txt{align-self:stretch;}
.cmp-grid .rev-cell{display:flex;align-self:stretch;min-height:72px;}
.cmp-grid .rev-cell .rev-ta{flex:1;min-height:0;resize:vertical;}
.step.editing{border-color:var(--ac);box-shadow:0 0 0 3px rgba(99,102,241,.12);}
/* 스텝 결과별 색: 왼쪽 띠 + 머리 배경 (통과 초록 / 실패 빨강 / 스킵 주황 / 미실행·미연결 회색) */
.step{border-left:5px solid var(--bd2);}
.step.st-pass{border-left-color:var(--pass);}
.step.st-pass .step-head{background:#f0fdf4;}
.step.st-fail{border-left-color:var(--fail);}
.step.st-fail .step-head{background:#fef2f2;}
.step.st-skip{border-left-color:var(--skip);}
.step.st-skip .step-head{background:#fffbeb;}
.step-head .badge{font-size:13px;padding:5px 14px;}
.orig-d{margin-top:6px;font-size:12px;color:var(--tx3);}
.orig-d summary{cursor:pointer;user-select:none;width:max-content;}
.orig-d .sg-txt{margin-top:6px;}
.rev-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-top:1px solid var(--bd);padding-top:12px;}
.rev-reset{background:#fff;color:var(--tx2);border:1px solid var(--bd2);padding:8px 14px;border-radius:var(--r);font-size:13px;font-weight:600;cursor:pointer;}
.rev-reset:hover{border-color:var(--fail);color:var(--fail);}
.rev-reset:disabled{opacity:.45;cursor:not-allowed;}
.rev-edit{background:#eef2ff;color:var(--ac2);border:1px solid #c7d2fe;padding:8px 16px;border-radius:var(--r);font-size:13px;font-weight:700;cursor:pointer;}
.rev-edit:hover{background:#e0e7ff;}
.rev-cancel{background:#fff;color:var(--tx2);border:1px solid var(--bd2);padding:8px 14px;border-radius:var(--r);font-size:13px;font-weight:600;cursor:pointer;}
.rev-cancel:hover{border-color:var(--tx2);}
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
  .cmp-grid, .cmp-grid.view{grid-template-columns:1fr;}
  .cmp-h{display:none;}
  .cmp-grid .rev-cell{min-height:84px;}
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
      <th style="width:90px">스펙 수정</th>
      <th style="width:170px">폴더</th>
      <th style="width:54px;text-align:center">스텝</th>
    </tr></thead>
    <tbody id="tbody"></tbody>
  </table>
</div>

<div class="toast" id="toast"></div>

<script>
${formatSpecText.toString()}

var cases = [];
var results = {};
var revisions = {};
var specImages = {};   // 기대 화면 이미지 { TC키: { 스텝index: [...] } }
var atmImages = {};    // ATM 이미지 원래 주소 → 로컬 사본 경로 (npm run atm-images)
var hiddenAtm = {};    // 결과서에서 삭제한 ATM 기대 결과 이미지 { TC키: { 스텝index: [원래 주소] } }
var curFilter = 'all';
var expandedKey = null;
var editing = {};   // "TC키#스텝index" → 편집 모드
var drafts = {};    // "TC키#스텝index#항목" → 편집 중 입력값 (다시 그려도 유지)
var toastTimer = null;

var LABEL = { pass:'통과', fail:'실패', pending:'미실행', skip:'스킵', unmapped:'미연결' };
var ICON  = { pass:'✓', fail:'✗', pending:'○', skip:'–', unmapped:'·' };

// 행 토글 / 수정결과 저장 (이벤트 위임 — 인라인 onclick에 TC 키를 넣지 않음)
document.getElementById('tbody').addEventListener('click', function(e) {
  var saveBtn = e.target.closest('.rev-save');
  if (saveBtn) { saveRevision(saveBtn.dataset.key, parseInt(saveBtn.dataset.idx, 10), false); return; }
  var resetBtn = e.target.closest('.rev-reset');
  if (resetBtn) { saveRevision(resetBtn.dataset.key, parseInt(resetBtn.dataset.idx, 10), true); return; }
  var pickBtn = e.target.closest('.img-pick');
  if (pickBtn) { pickBtn.parentNode.querySelector('.img-input').click(); return; }
  var delBtn = e.target.closest('.img-del');
  if (delBtn) {
    if (delBtn.dataset.kind === 'atm') hideAtmImage(delBtn.dataset.key, parseInt(delBtn.dataset.idx, 10), delBtn.dataset.src);
    else deleteSpecImage(delBtn.dataset.key, parseInt(delBtn.dataset.idx, 10), delBtn.dataset.id);
    return;
  }
  var restoreBtn = e.target.closest('.atm-restore');
  if (restoreBtn) { restoreAtmImages(restoreBtn.dataset.key, parseInt(restoreBtn.dataset.idx, 10)); return; }
  var editBtn = e.target.closest('.rev-edit');
  if (editBtn) { startEdit(editBtn.dataset.key, parseInt(editBtn.dataset.idx, 10)); return; }
  var cancelBtn = e.target.closest('.rev-cancel');
  if (cancelBtn) { endEdit(cancelBtn.dataset.key, parseInt(cancelBtn.dataset.idx, 10)); return; }
  if (e.target.closest('textarea, button, a, .dr')) return;
  var tr = e.target.closest('tr.tr');
  if (tr) toggleRow(tr.dataset.key);
});

// 기대 화면 이미지: 파일 선택 / 드래그 앤 드롭 / 붙여넣기(업로드 영역 클릭 후 Ctrl+V)
(function() {
  var tbody = document.getElementById('tbody');
  var target = function(e) { var d = e.target.closest && e.target.closest('.drop'); return d ? { el: d, key: d.dataset.key, idx: parseInt(d.dataset.idx, 10) } : null; };

  tbody.addEventListener('change', function(e) {
    var input = e.target.closest('.img-input');
    if (!input) return;
    uploadSpecImages(input.dataset.key, parseInt(input.dataset.idx, 10), Array.prototype.slice.call(input.files));
    input.value = '';
  });
  tbody.addEventListener('dragover', function(e) {
    var t = target(e);
    if (t) { e.preventDefault(); t.el.classList.add('over'); }
  });
  tbody.addEventListener('dragleave', function(e) {
    var t = target(e);
    if (t) t.el.classList.remove('over');
  });
  tbody.addEventListener('drop', function(e) {
    var t = target(e);
    if (!t) return;
    e.preventDefault();
    t.el.classList.remove('over');
    uploadSpecImages(t.key, t.idx, e.dataTransfer.files);
  });
  tbody.addEventListener('paste', function(e) {
    var t = target(e);
    if (!t) return;
    var files = e.clipboardData && e.clipboardData.files;
    e.preventDefault();
    if (!files || !files.length) { toast('클립보드에 이미지가 없습니다. 화면을 캡처한 뒤 붙여넣어 주세요.', 'err'); return; }
    uploadSpecImages(t.key, t.idx, files);
  });
})();

loadData();

function loadData() {
  fetch('/api/cases')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      cases     = data.cases     || [];
      results   = data.results   || {};
      revisions = data.revisions || {};
      specImages = data.spec_images || {};
      atmImages  = data.atm_images || {};
      hiddenAtm  = data.hidden_atm_images || {};
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
  // 편집 중인 스텝의 입력값 보존
  document.querySelectorAll('#tbody .rev-ta').forEach(function(ta) {
    if (editing[ta.dataset.key + '#' + ta.dataset.idx]) drafts[ta.dataset.key + '#' + ta.dataset.idx + '#' + ta.dataset.field] = ta.value;
  });

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
    html += '<div class="pre-box"><div class="pre-lbl">전제조건</div>' + formatSpecText(tc.precondition) + '</div>';
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
      if (t.attachments && t.attachments.length) html += evidenceList(t.attachments);
      html += '</div></div>';
    });
  } else if (r.actual_result) {
    html += formatSpecText(r.actual_result);
  } else {
    html += '<div class="run-empty">아직 실행 기록이 없습니다. npx playwright test 실행 후 새로고침하세요.</div>';
  }
  html += '</div>';

  // 스텝별: 절차 / 기대결과 / 수정결과 + 통과 여부
  var stepStatus = r.step_status || {};
  var stepEvidence = r.step_evidence || {};
  var revs = revisions[key] || {};
  var ran = status0(r) !== 'pending';

  html += '<div class="steps">';
  (tc.steps || []).forEach(function(step) {
    var no  = step.index + 1;
    var sst = stepStatus[no] || (ran ? 'unmapped' : 'pending');
    var rev = revs[step.index];
    var isEditing = !!editing[key + '#' + step.index];
    var title = '';
    if (step.description) {
      var m = step.description.match(/\\[([^\\]]+)\\]/);
      title = m ? m[1] : step.description.split('\\n')[0];
      if (title.length > 70) title = title.substring(0, 70) + '…';
    }

    html += '<div class="step st-' + sst + (isEditing ? ' editing' : '') + '">';
    html += '<div class="step-head"><span class="step-num">Step ' + no + '</span><span class="step-title">' + eh(title) + '</span>';
    html += '<span class="hdr-sp"></span>' + badge(sst, sst === 'unmapped' ? '이 스텝에 연결된 자동화 테스트가 없습니다 (tcstep annotation 필요)' : '') + '</div>';
    var rf = (rev && rev.fields) || {};
    if (isEditing) {
      html += '<div class="step-body"><div class="cmp-grid editing">';
      html += '<div class="cmp-h"></div><div class="cmp-h">원본 스펙</div><div class="cmp-h">✏️ 수정 (내용을 고친 뒤 저장)</div>';
      html += cmpRow(key, step, rf, 'description', '📋 절차', '', true);
      html += cmpRow(key, step, rf, 'expectedResult', '✅ 기대 결과', ' exp', true);
      html += cmpRow(key, step, rf, 'testData', '📌 테스트 데이터', '', true);
      html += '</div>';
    } else {
      // 보기 모드 3분할: [절차·테스트 데이터] | [기대: 기대 결과·기대 화면] | [실제: 자동화 결과·캡처]
      html += '<div class="step-body"><div class="tri">';
      html += '<div class="tri-col tri-proc"><div class="tri-h">📋 절차 · 테스트 데이터</div>' +
        '<div class="tri-field">' + cmpRow(key, step, rf, 'description', '📋 절차', '', false) + '</div>' +
        '<div class="tri-field">' + cmpRow(key, step, rf, 'testData', '📌 테스트 데이터', '', false) + '</div></div>';
      html += '<div class="tri-col tri-exp"><div class="tri-h">✅ 기대</div>' +
        '<div class="tri-field">' + cmpRow(key, step, rf, 'expectedResult', '기대 결과', ' exp', false) + expectedGallery(key, step, sst) + '</div></div>';
      html += '<div class="tri-col tri-act st-' + sst + '"><div class="tri-h">🔍 실제' + badge(sst) + '</div>' +
        actualBlock(r, no, stepEvidence[no], sst) + '</div>';
      html += '</div>';
    }

    var attrs = ' data-key="' + eh(key) + '" data-idx="' + step.index + '"';
    html += '<div class="rev-actions">';
    if (isEditing) html += '<button class="rev-save"' + attrs + '>💾 저장</button><button class="rev-cancel"' + attrs + '>취소</button>';
    else html += '<button class="rev-edit"' + attrs + '>✏️ 수정</button>';
    if (rev) html += '<button class="rev-reset"' + attrs + '>↺ 원래대로</button>';
    html += revState(rev) + '</div>';

    html += '</div></div>';
  });
  html += '</div>';

  html += '</div>';
  return html;
}

function status0(r) { return (r && r.status) || 'pending'; }

// 테스트 캡처 썸네일 목록 (클릭 시 원본 새 탭)
function evidenceList(list) {
  return '<div class="ev-list">' + list.map(function(a) {
    var src = '/' + String(a.path).split('/').map(encodeURIComponent).join('/');
    return '<figure class="ev"><a href="' + eh(src) + '" target="_blank" rel="noopener"><img src="' + eh(src) + '" alt="' + eh(a.name) + '" loading="lazy"></a>' +
      '<figcaption>' + (a.status ? badge(a.status) : '') + '<span class="ev-n">' + eh(a.name) + '</span>' +
      (a.testTitle ? '<span class="ev-t">' + eh(a.testTitle) + '</span>' : '') + '</figcaption></figure>';
  }).join('') + '</div>';
}

// 기대 결과 이미지 중 결과서에서 삭제하지 않은 ATM(XML) 이미지
function visibleAtmImages(key, step) {
  var hidden = (hiddenAtm[key] || {})[step.index] || [];
  return ((step.images && step.images.expectedResult) || []).filter(function(src) { return hidden.indexOf(src) === -1; });
}

// 표(html) 칸 안에 들어 있는 이미지 주소 — richHtml 이 칸 안에 표시하므로 목록에서는 제외
function inlineSrcs(step, field) {
  var html = step.html && step.html[field];
  var out = [];
  if (html) html.replace(/<img src="([^"]+)">/g, function(m, s) { out.push(s.split('&quot;').join('"')); return m; });
  return out;
}

// 기대 결과 이미지 목록에 따로 보여줄 ATM 이미지 (삭제 안 함 + 표 칸 밖)
function galleryAtmImages(key, step) {
  var inline = inlineSrcs(step, 'expectedResult');
  return visibleAtmImages(key, step).filter(function(src) { return inline.indexOf(src) === -1; });
}

function expectedImageCount(key, step) {
  return visibleAtmImages(key, step).length + ((specImages[key] || {})[step.index] || []).length;
}

// 기대 결과 이미지 목록: ATM에서 가져온 이미지 + 직접 올린 이미지 (모두 삭제 가능) + 업로드 영역
// 실패한 스텝인데 이미지가 하나도 없으면 업로드 영역을 강조
function expectedGallery(key, step, stepStatus) {
  var idx = step.index;
  var attrs = ' data-key="' + eh(key) + '" data-idx="' + idx + '"';
  var figs = [];

  galleryAtmImages(key, step).forEach(function(src) {
    var local = atmImages[src];
    var href = local ? '/' + String(local).split('/').map(encodeURIComponent).join('/') : '';
    figs.push('<figure class="ev ev-spec">' +
      (local
        ? '<a href="' + eh(href) + '" target="_blank" rel="noopener"><img src="' + eh(href) + '" alt="ATM 이미지" loading="lazy"></a>'
        : '<a class="xml-img" href="' + eh(src) + '" target="_blank" rel="noopener">🖼️ 미다운로드 (npm run atm-images)</a>') +
      '<figcaption><span class="ev-t">ATM(Zephyr) 원본</span>' +
      '<button class="img-del"' + attrs + ' data-kind="atm" data-src="' + eh(src) + '">삭제</button></figcaption></figure>');
  });

  ((specImages[key] || {})[idx] || []).forEach(function(img) {
    var src = '/' + String(img.path).split('/').map(encodeURIComponent).join('/');
    figs.push('<figure class="ev ev-spec"><a href="' + eh(src) + '" target="_blank" rel="noopener"><img src="' + eh(src) + '" alt="' + eh(img.name) + '" loading="lazy"></a>' +
      '<figcaption><span class="ev-n">' + eh(img.name) + '</span><span class="ev-t">직접 업로드 · ' + fmtDate(img.uploaded_at) + '</span>' +
      '<button class="img-del"' + attrs + ' data-kind="upload" data-id="' + eh(img.id) + '">삭제</button></figcaption></figure>');
  });

  var html = figs.length ? '<div class="ev-list">' + figs.join('') + '</div>' : '';
  var hiddenCount = ((hiddenAtm[key] || {})[idx] || []).length;
  if (hiddenCount) html += '<button class="atm-restore"' + attrs + '>↺ 삭제한 ATM 이미지 ' + hiddenCount + '개 되돌리기</button>';

  var need = !figs.length && stepStatus === 'fail';
  html += '<div class="drop' + (need ? ' need' : '') + '" tabindex="0"' + attrs + '>' +
    '<span>' + (need ? '⚠️ 실패한 스텝입니다. ' : '📎 ') + '기대 결과 이미지를 끌어다 놓거나, 여기를 클릭한 뒤 Ctrl+V로 붙여넣기</span>' +
    '<button class="img-pick"' + attrs + '>파일 선택</button>' +
    '<input type="file" class="img-input" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden' + attrs + '></div>';
  return html;
}

function postJSON(url, body) {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) })
    .then(function(r) { return r.json(); })
    .then(function(d) { if (!d.ok) throw new Error(d.error || '요청 실패'); return d; });
}

function setHiddenAtm(key, idx, list) {
  if (!hiddenAtm[key]) hiddenAtm[key] = {};
  if (list && list.length) hiddenAtm[key][idx] = list;
  else delete hiddenAtm[key][idx];
}

function hideAtmImage(key, idx, src) {
  if (!confirm('ATM에서 가져온 이 기대 결과 이미지를 삭제할까요? XML 원본은 그대로 두고 결과서에서만 삭제되며, 되돌릴 수 있습니다.')) return;
  postJSON('/api/atm-image/hide', { key: key, index: idx, src: src })
    .then(function(d) { setHiddenAtm(key, idx, d.hidden); applyFilters(); toast('ATM 이미지 삭제', 'ok'); })
    .catch(function(e) { toast('오류: ' + e.message, 'err'); });
}

function restoreAtmImages(key, idx) {
  postJSON('/api/atm-image/restore', { key: key, index: idx })
    .then(function() { setHiddenAtm(key, idx, []); applyFilters(); toast('삭제한 ATM 이미지를 되돌렸습니다', 'ok'); })
    .catch(function(e) { toast('오류: ' + e.message, 'err'); });
}

// 기대 화면 이미지 업로드 (파일 선택 / 드래그 / 붙여넣기 공통), 여러 장이면 순서대로
function uploadSpecImages(key, idx, fileList) {
  // (템플릿 리터럴 안이라 정규식 백슬래시 대신 목록 비교)
  var allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  var files = Array.prototype.filter.call(fileList || [], function(f) { return allowed.indexOf(f.type) !== -1; });
  if (!files.length) { toast('PNG/JPG/WEBP/GIF 이미지만 올릴 수 있습니다.', 'err'); return Promise.resolve(); }
  if (files.some(function(f) { return f.size > 10 * 1024 * 1024; })) { toast('10MB 이하 이미지만 올릴 수 있습니다.', 'err'); return Promise.resolve(); }

  toast('이미지 업로드 중… (' + files.length + '개)');
  return files.reduce(function(p, f) {
    return p.then(function() { return readDataURL(f); })
      .then(function(data) {
        return fetch('/api/spec-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({ key: key, index: idx, name: f.name || '붙여넣은 이미지', data: data })
        });
      })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (!d.ok) throw new Error(d.error || '업로드 실패');
        setSpecImages(key, idx, d.images);
      });
  }, Promise.resolve())
    .then(function() { applyFilters(); toast('기대 결과 이미지 ' + files.length + '개 저장', 'ok'); })
    .catch(function(e) { applyFilters(); toast('오류: ' + e.message, 'err'); });
}

function deleteSpecImage(key, idx, id) {
  if (!confirm('직접 올린 이 기대 결과 이미지를 삭제할까요?')) return;
  fetch('/api/spec-image/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ key: key, index: idx, id: id })
  })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (!d.ok) throw new Error(d.error || '삭제 실패');
      setSpecImages(key, idx, d.images);
      applyFilters();
      toast('기대 결과 이미지 삭제', 'ok');
    })
    .catch(function(e) { toast('오류: ' + e.message, 'err'); });
}

function setSpecImages(key, idx, images) {
  if (!specImages[key]) specImages[key] = {};
  if (images && images.length) specImages[key][idx] = images;
  else delete specImages[key][idx];
}

function readDataURL(file) {
  return new Promise(function(resolve, reject) {
    var fr = new FileReader();
    fr.onload = function() { resolve(fr.result); };
    fr.onerror = function() { reject(new Error('파일 읽기 실패')); };
    fr.readAsDataURL(file);
  });
}

// 3분할 오른쪽 "실제" 칸: 이 스텝(tcstep)에 연결된 자동화 테스트 결과 + 캡처
function actualBlock(r, no, evidence, stepStatus) {
  var tests = (r.tests || []).filter(function(t) { return (t.tcSteps || []).indexOf(no) !== -1; });
  var html = '';
  if (tests.length) {
    html += '<div class="tri-field"><div class="cmp-lbl">🤖 자동화 결과</div><div class="act-tests">' + tests.map(function(t) {
      return '<div class="act-test">' + badge(t.status) + '<span class="act-title">' + eh(t.title) + '</span>' +
        (t.error ? '<div class="run-err">' + eh(t.error) + '</div>' : '') + '</div>';
    }).join('') + '</div></div>';
  }
  if (evidence && evidence.length) html += '<div class="tri-field">' + evidenceRow(evidence) + '</div>';
  if (!tests.length) {
    html += '<div class="act-empty">' + (stepStatus === 'pending'
      ? '아직 실행 기록이 없습니다.'
      : '이 스텝에 연결된 자동화 테스트가 없습니다.<br>테스트별 결과와 캡처는 위 "자동화 실행 결과"에서 확인하세요.') + '</div>';
  }
  return html;
}

// 스텝 보기 모드의 "📸 실제 결과" 행 (tcstep으로 연결된 테스트의 캡처)
function evidenceRow(list) {
  if (!list || !list.length) return '';
  return '<div class="cmp-lbl">📸 실제 결과</div><div>' + evidenceList(list) + '</div>';
}

// 한 항목 행.
//  보기 모드: [라벨 | 현재 유효한 값(수정본 우선)], 수정된 항목은 원본을 "원본 보기"로 접어 둠
//  편집 모드: [라벨 | 원본 | 수정 입력], 입력 칸에는 작성 중인 값 → 수정본 → 원본 순으로 채움
// Zephyr 표 구조 그대로 표시 (서버에서 정리한 HTML)
//  - 칸 속 ATM 이미지: 로컬 사본으로 표시, 기대 결과(보기 모드)는 칸 안에서 바로 삭제 가능
//  - 글자만 있는 칸: 빨간 안내 문구·마스킹·placeholder 미리보기 적용
function richHtml(html, key, step, field, readonly) {
  var tpl = document.createElement('template');
  tpl.innerHTML = html;
  var root = tpl.content;

  if (field === 'description') {   // 첫 줄 [제목]은 스텝 머리에 있으므로 제거
    var first = root.firstChild;
    var title = first && first.nodeName === 'STRONG' ? first.textContent.trim() : '';
    if (title.charAt(0) === '[' && title.charAt(title.length - 1) === ']') {
      root.removeChild(first);
      while (root.firstChild && (root.firstChild.nodeName === 'BR' || (root.firstChild.nodeType === 3 && !root.firstChild.textContent.trim()))) {
        root.removeChild(root.firstChild);
      }
    }
  }

  var hidden = (hiddenAtm[key] || {})[step.index] || [];
  Array.prototype.slice.call(root.querySelectorAll('img')).forEach(function(img) {
    var src = img.getAttribute('src') || '';
    var wrap = document.createElement('span');
    if (hidden.indexOf(src) !== -1) {
      wrap.className = 'rich-hidden';
      wrap.textContent = '🗑️ 삭제한 이미지';
    } else {
      wrap.className = 'rich-img';
      var local = atmImages[src];
      var a = document.createElement('a');
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
      if (local) {
        a.setAttribute('href', '/' + String(local).split('/').map(encodeURIComponent).join('/'));
        var im = document.createElement('img');
        im.setAttribute('src', a.getAttribute('href'));
        im.setAttribute('loading', 'lazy');
        a.appendChild(im);
      } else {
        a.className = 'xml-img';
        a.setAttribute('href', src);
        a.textContent = '🖼️ 미다운로드 (npm run atm-images)';
      }
      wrap.appendChild(a);
      if (!readonly && field === 'expectedResult') {
        var del = document.createElement('button');
        del.className = 'img-del';
        del.setAttribute('data-kind', 'atm');
        del.setAttribute('data-key', key);
        del.setAttribute('data-idx', String(step.index));
        del.setAttribute('data-src', src);
        del.textContent = '삭제';
        wrap.appendChild(del);
      }
    }
    img.parentNode.replaceChild(wrap, img);
  });

  Array.prototype.slice.call(root.querySelectorAll('td')).forEach(function(td) {
    if (td.querySelector('table')) return;   // 안에 표가 또 있는 칸은 그대로
    // 칸의 글자(굵게·줄바꿈 포함)만 모아 미리보기로 바꾸고, 칸 속 이미지(삭제 버튼 포함)는 뒤에 그대로 둠
    var keep = [];
    var text = '';
    Array.prototype.slice.call(td.childNodes).forEach(function(n) {
      if (n.nodeType === 1 && (n.classList.contains('rich-img') || n.classList.contains('rich-hidden'))) keep.push(n);
      else text += n.nodeName === 'BR' ? ' ' : n.textContent;
    });
    text = text.trim();
    if (!text) return;
    var row = td.parentNode;
    var cells = Array.prototype.slice.call(row.children);
    var table = row.closest('table');
    var headRow = table ? table.querySelector('tr') : null;
    var headCell = headRow && headRow !== row ? headRow.children[cells.indexOf(td)] : null;
    td.innerHTML = formatSpecText(text, {
      cell: true,
      headCol: headCell && headCell.nodeName === 'TH' ? headCell.textContent.trim() : '',
      rowKey: cells[0] && cells[0] !== td ? cells[0].textContent.trim() : ''
    });
    keep.forEach(function(n) { td.appendChild(n); });
  });

  return '<div class="rich">' + tpl.innerHTML + '</div>';
}

function cmpRow(key, step, rf, field, label, cls, isEditing) {
  var orig    = step[field] || '';
  var changed = Object.prototype.hasOwnProperty.call(rf, field);
  var val     = changed ? rf[field] : orig;
  var opts    = { dropTitle: field === 'description' };
  var required = field === 'expectedResult' || field === 'testData';   // 필수 항목
  var html    = '<div class="cmp-lbl">' + label + (required ? '<span class="req">필수</span>' : '') + (changed ? '<span class="tag tag-wait">수정됨</span>' : '') + '</div>';

  // 보기 모드의 기대 결과 이미지는 expectedGallery 에서 따로(삭제·업로드 가능하게) 표시
  var gallery = field === 'expectedResult' && !isEditing;
  var imgs    = gallery ? '' : xmlImages(step, field, key);   // XML(ATM) 첨부 이미지 — 텍스트가 없어도 내용으로 인정
  var NONE    = '<span class="none">없음</span>';

  var origHtml = step.html && step.html[field];   // Zephyr 표 구조 (수정본이 있으면 수정본 글을 우선 표시)

  if (!isEditing) {
    var body      = !changed && origHtml ? richHtml(origHtml, key, step, field, false) : formatSpecText(val, opts);
    var hasImages = !!imgs || (gallery && expectedImageCount(key, step) > 0);
    var missing   = required && body === NONE && !hasImages;
    if (body === NONE && hasImages) body = gallery ? '<span class="none">아래 이미지 참고</span>' : '';
    html += '<div>';
    html += '<div class="sg-txt fxw' + cls + (missing ? ' missing' : '') + '">' +
      (missing ? '⚠️ 필수 항목이 비어 있습니다. ✏️ 수정을 눌러 입력하거나 아래에 이미지를 올려 주세요.' : body + imgs) + '</div>';
    if (changed) html += '<details class="orig-d"><summary>원본 보기</summary><div class="sg-txt fxw old">' +
      (origHtml ? richHtml(origHtml, key, step, field, true) : formatSpecText(orig, opts)) + '</div></details>';
    return html + '</div>';
  }

  var draft = drafts[key + '#' + step.index + '#' + field];
  var cur   = draft != null ? draft : val;
  return html +
    '<div class="sg-txt fxw' + cls + (changed ? ' old' : '') + '">' +
      (origHtml ? richHtml(origHtml, key, step, field, true) : formatSpecText(orig, opts)) + imgs + '</div>' +
    '<div class="rev-cell"><textarea class="rev-ta' + (changed ? ' changed' : '') + '" rows="' + taRows(cur) + '" data-field="' + field + '" data-key="' + eh(key) + '" data-idx="' + step.index + '">' + eh(cur) + '</textarea></div>';
}

// XML(ATM)에 첨부된 이미지: 로컬 사본(npm run atm-images)이 있으면 바로 보이게, 없으면 안내 카드
// (ATM 원래 주소는 로그인 JWT가 필요해 결과서에서 직접 열 수 없음)
function xmlImages(step, field, key) {
  var inline = inlineSrcs(step, field);   // 표 칸 안 이미지는 richHtml 에서 표시
  var list = (field === 'expectedResult' && key ? visibleAtmImages(key, step) : ((step.images && step.images[field]) || []))
    .filter(function(src) { return inline.indexOf(src) === -1; });
  if (!list.length) return '';
  return '<div class="xml-imgs">' + list.map(function(src, i) {
    var local = atmImages[src];
    if (local) {
      var href = '/' + String(local).split('/').map(encodeURIComponent).join('/');
      return '<a class="xml-thumb" href="' + eh(href) + '" target="_blank" rel="noopener"><img src="' + eh(href) + '" alt="ATM 첨부 이미지" loading="lazy"></a>';
    }
    return '<span class="xml-img" title="터미널에서 npm run atm-images 를 실행해 내려받으면 여기서 바로 보입니다">🖼️ ATM 첨부 이미지' + (list.length > 1 ? ' ' + (i + 1) : '') + ' · 미다운로드 (npm run atm-images)</span>';
  }).join('') + '</div>';
}

function stepHasImages(key, idx, field) {
  var tc = cases.filter(function(c) { return c.key === key; })[0];
  var st = tc && (tc.steps || []).filter(function(s) { return s.index === idx; })[0];
  if (!st) return false;
  if (field === 'expectedResult') return expectedImageCount(key, st) > 0;   // ATM(삭제 안 한 것) + 직접 올린 이미지
  return !!(st.images && st.images[field] && st.images[field].length);
}

function startEdit(key, idx) {
  editing[key + '#' + idx] = true;
  applyFilters();
  var ta = document.querySelector('.rev-ta[data-key="' + key + '"][data-idx="' + idx + '"]');
  if (ta) ta.focus({ preventScroll: true });
}

function endEdit(key, idx) {
  delete editing[key + '#' + idx];
  clearDrafts(key, idx);
  applyFilters();
}

function clearDrafts(key, idx) {
  var prefix = key + '#' + idx + '#';
  Object.keys(drafts).forEach(function(k) { if (k.indexOf(prefix) === 0) delete drafts[k]; });
}

// 입력 칸 줄 수 = 내용 줄 수 + 1 (3~20줄). 편집 모드에서 내용이 잘리지 않게
function taRows(v) {
  return Math.min(20, Math.max(3, String(v || '').split(String.fromCharCode(10)).length + 1));
}

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
// 펼친 TC 행의 윗부분이 목록 맨 위(고정 헤더 바로 아래)에 오도록 스크롤
function toggleRow(key) {
  expandedKey = expandedKey === key ? null : key;
  applyFilters();
  if (!expandedKey) return;

  var tw   = document.getElementById('tw');
  var row  = document.querySelector('tr.tr.open');
  var head = tw.querySelector('thead');
  if (!row) return;
  var top = row.getBoundingClientRect().top - tw.getBoundingClientRect().top + tw.scrollTop - (head ? head.offsetHeight : 0);
  tw.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

// ── 수정결과 저장 ─────────────────────────────────────────
// reset=true 이면 이 스텝의 수정 내용을 지우고 원본 스펙으로 되돌림
function saveRevision(key, idx, reset) {
  var sel = '[data-key="' + key + '"][data-idx="' + idx + '"]';
  if (reset && !confirm('이 스텝의 수정 내용을 지우고 원본 스펙으로 되돌릴까요?')) return;

  // 세 항목을 항상 함께 전송 (보내지 않은 항목은 수정 없음으로 처리됨)
  var fields = {};
  if (!reset) {
    document.querySelectorAll('.rev-ta' + sel).forEach(function(ta) { fields[ta.dataset.field] = ta.value; });

    // 필수 항목(기대 결과, 테스트 데이터) 비어 있으면 저장 안 함
    var ZWSP = String.fromCharCode(0x200B);
    var missingFields = ['expectedResult', 'testData'].filter(function(f) {
      return !String(fields[f] || '').split(ZWSP).join('').trim() && !stepHasImages(key, idx, f);
    });
    document.querySelectorAll('.rev-ta' + sel).forEach(function(ta) {
      ta.classList.toggle('invalid', missingFields.indexOf(ta.dataset.field) !== -1);
    });
    if (missingFields.length) {
      toast(missingFields.map(function(f) { return f === 'expectedResult' ? '기대 결과' : '테스트 데이터'; }).join(', ') + '은(는) 필수 항목입니다.', 'err');
      return;
    }
  }
  var btns = document.querySelectorAll('.rev-save' + sel + ', .rev-reset' + sel);
  btns.forEach(function(b) { b.disabled = true; });

  fetch('/api/revision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ key: key, index: idx, fields: fields })
  })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.ok) throw new Error(data.error || '저장 실패');
      delete editing[key + '#' + idx];   // 저장/원래대로 후 보기 모드로
      clearDrafts(key, idx);
      if (!revisions[key]) revisions[key] = {};
      if (data.revision) revisions[key][idx] = data.revision;
      else delete revisions[key][idx];
      updateStats(data.stats);
      applyFilters();
      toast(data.revision ? '스펙 수정 저장됨 — 코드 반영 대기' : (reset ? '원본 스펙으로 되돌림' : '원본과 같음 — 저장할 수정 없음'), 'ok');
    })
    .catch(function(e) { toast('오류: ' + e.message, 'err'); })
    .finally(function() { btns.forEach(function(b) { b.disabled = false; }); });
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
// maxBytes 초과 시 본문을 버리고 오류 (이미지 업로드만 크게 허용)
function readJSON(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size <= maxBytes) chunks.push(c);
    });
    req.on('error', reject);
    req.on('end', () => {
      if (size > maxBytes) { reject(new Error('요청 크기가 너무 큽니다.')); return; }
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

  // ── GET /report-assets/*, /spec-assets/* ── 테스트 캡처 / 기대 화면 이미지 (각 폴더 밖 접근 차단)
  const assetDirs = { '/report-assets/': ASSETS_DIR, '/spec-assets/': SPEC_ASSETS_DIR, '/atm-assets/': ATM_ASSETS_DIR };
  const assetPrefix = Object.keys(assetDirs).find(p => pathname.startsWith(p));
  if (req.method === 'GET' && assetPrefix) {
    const baseDir = assetDirs[assetPrefix];
    let file = '';
    try { file = path.resolve(ROOT, '.' + decodeURIComponent(pathname)); } catch (e) {}
    const type = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }[path.extname(file).toLowerCase()];
    if (!file.startsWith(baseDir + path.sep) || !type || !fs.existsSync(file)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
    return;
  }

  // ── GET /api/cases ──
  if (req.method === 'GET' && pathname === '/api/cases') {
    const db = loadDB();
    sendJSON(res, 200, {
      cases:     Object.values(db.specs),
      results:   db.results,
      revisions: db.revisions,
      spec_images: db.spec_images,
      atm_images: loadAtmImages(),
      hidden_atm_images: db.hidden_atm_images,
      stats:     getStats(db),
      meta:      db.meta
    });
    return;
  }

  // ── POST /api/revision ── 스텝 스펙 수정 { key, index, fields: { description, expectedResult, testData } }
  //    원본과 달라진 항목만 저장. 달라진 항목이 없으면(fields: {} 포함) 수정 취소
  if (req.method === 'POST' && pathname === '/api/revision') {
    try {
      const { key, index, fields } = await readJSON(req);
      const db = loadDB();
      const spec = db.specs[key];
      if (!spec) { sendJSON(res, 404, { ok: false, error: 'TC를 찾을 수 없습니다: ' + key }); return; }
      const step = (spec.steps || []).find(s => s.index === index);
      if (!step) { sendJSON(res, 400, { ok: false, error: '스텝을 찾을 수 없습니다: ' + index }); return; }

      const changed = {};
      for (const f of REV_FIELDS) {
        if (!fields || typeof fields[f] !== 'string') continue;
        const text = fields[f].trim();
        if (text !== (step[f] || '').trim()) changed[f] = text;
      }

      // 필수 항목: 수정 후 유효값(수정본 또는 원본)의 기대 결과·테스트 데이터가 비어 있으면 거부 (되돌리기는 허용)
      if (Object.keys(changed).length) {
        const ZWSP = String.fromCharCode(0x200B);
        // 이미지만 있어도 내용으로 인정: XML(ATM) 이미지 중 삭제하지 않은 것 + (기대 결과) 직접 올린 이미지
        const hiddenAtm = (db.hidden_atm_images[key] || {})[index] || [];
        const imageCount = f => ((step.images || {})[f] || []).filter(u => !hiddenAtm.includes(u)).length
          + (f === 'expectedResult' ? ((db.spec_images[key] || {})[index] || []).length : 0);
        const blank = f => !String(f in changed ? changed[f] : (step[f] || '')).split(ZWSP).join('').trim() && !imageCount(f);
        const missingReq = ['expectedResult', 'testData'].filter(blank);
        if (missingReq.length) {
          sendJSON(res, 400, { ok: false, error: '필수 항목이 비어 있습니다: ' + missingReq.map(f => (f === 'expectedResult' ? '기대 결과' : '테스트 데이터')).join(', ') });
          return;
        }
      }

      const revs = db.revisions[key] || {};
      const prev = revs[index];
      if (!Object.keys(changed).length) {
        delete revs[index];
      } else if (!prev || JSON.stringify(prev.fields) !== JSON.stringify(changed)) {
        // 내용이 바뀌었을 때만 갱신 → 코드 반영 상태도 다시 "대기"
        revs[index] = {
          fields: changed,
          original: Object.fromEntries(Object.keys(changed).map(f => [f, step[f] || ''])),
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

  // ── POST /api/spec-image ── 기대 화면 이미지 업로드 { key, index, name, data: "data:image/png;base64,..." }
  if (req.method === 'POST' && pathname === '/api/spec-image') {
    try {
      const { key, index, name, data } = await readJSON(req, MAX_IMAGE_BYTES * 1.4 + 4096);
      const db = loadDB();
      const spec = db.specs[key];   // TC키는 XML 스펙에 있는 것만 허용 (경로에 쓰이므로)
      if (!spec) { sendJSON(res, 404, { ok: false, error: 'TC를 찾을 수 없습니다: ' + key }); return; }
      if (!(spec.steps || []).some(s => s.index === index)) { sendJSON(res, 400, { ok: false, error: '스텝을 찾을 수 없습니다: ' + index }); return; }

      const m = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(String(data || ''));
      if (!m) { sendJSON(res, 400, { ok: false, error: 'PNG/JPG/WEBP/GIF 이미지만 올릴 수 있습니다.' }); return; }
      const buf = Buffer.from(m[2], 'base64');
      if (!buf.length || buf.length > MAX_IMAGE_BYTES) { sendJSON(res, 400, { ok: false, error: '10MB 이하 이미지만 올릴 수 있습니다.' }); return; }

      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const ext = { png: '.png', jpeg: '.jpg', webp: '.webp', gif: '.gif' }[m[1]];
      const rel = `spec-assets/${key}/step${index + 1}/${id}${ext}`;
      fs.mkdirSync(path.dirname(path.join(ROOT, rel)), { recursive: true });
      fs.writeFileSync(path.join(ROOT, rel), buf);

      const byStep = db.spec_images[key] = db.spec_images[key] || {};
      const list = byStep[index] = byStep[index] || [];
      list.push({ id, name: String(name || '이미지').slice(0, 100), path: rel, uploaded_at: new Date().toISOString() });
      saveDB(db);
      sendJSON(res, 200, { ok: true, images: list });
    } catch (e) {
      sendJSON(res, 400, { ok: false, error: e.message });
    }
    return;
  }

  // ── POST /api/spec-image/delete ── 기대 화면 이미지 삭제 { key, index, id }
  if (req.method === 'POST' && pathname === '/api/spec-image/delete') {
    try {
      const { key, index, id } = await readJSON(req);
      const db = loadDB();
      const list = (db.spec_images[key] || {})[index] || [];
      const pos = list.findIndex(img => img.id === id);
      if (pos === -1) { sendJSON(res, 404, { ok: false, error: '이미지를 찾을 수 없습니다.' }); return; }

      const file = path.resolve(ROOT, list[pos].path);
      if (file.startsWith(SPEC_ASSETS_DIR + path.sep)) fs.rmSync(file, { force: true });
      list.splice(pos, 1);
      if (!list.length) delete db.spec_images[key][index];
      if (!Object.keys(db.spec_images[key]).length) delete db.spec_images[key];
      saveDB(db);
      sendJSON(res, 200, { ok: true, images: list });
    } catch (e) {
      sendJSON(res, 400, { ok: false, error: e.message });
    }
    return;
  }

  // ── POST /api/atm-image/hide ── ATM(XML) 기대 결과 이미지를 결과서에서 삭제 { key, index, src } (XML 원본은 유지)
  if (req.method === 'POST' && pathname === '/api/atm-image/hide') {
    try {
      const { key, index, src } = await readJSON(req);
      const db = loadDB();
      const step = ((db.specs[key] || {}).steps || []).find(s => s.index === index);
      if (!step || !((step.images || {}).expectedResult || []).includes(src)) {
        sendJSON(res, 404, { ok: false, error: '이미지를 찾을 수 없습니다.' });
        return;
      }
      const byStep = db.hidden_atm_images[key] = db.hidden_atm_images[key] || {};
      const list = byStep[index] = byStep[index] || [];
      if (!list.includes(src)) list.push(src);
      saveDB(db);
      sendJSON(res, 200, { ok: true, hidden: list });
    } catch (e) {
      sendJSON(res, 400, { ok: false, error: e.message });
    }
    return;
  }

  // ── POST /api/atm-image/restore ── 삭제한 ATM 이미지 되돌리기 { key, index }
  if (req.method === 'POST' && pathname === '/api/atm-image/restore') {
    try {
      const { key, index } = await readJSON(req);
      const db = loadDB();
      if (db.hidden_atm_images[key]) {
        delete db.hidden_atm_images[key][index];
        if (!Object.keys(db.hidden_atm_images[key]).length) delete db.hidden_atm_images[key];
      }
      saveDB(db);
      sendJSON(res, 200, { ok: true, hidden: [] });
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
// node report-server.js 로 직접 실행할 때만 서버 시작 (require 시에는 함수만 사용)
if (require.main === module) {
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
}

module.exports = { formatSpecText, parseTestCases, stripHtml };
