#!/usr/bin/env node
'use strict';
/*
  결과서에서 입력한 "수정결과"(기대결과 변경) 목록을 보여주고, 코드 반영 완료를 표시합니다.

    npm run revisions                          코드 반영 대기 목록
    npm run revisions -- --all                 반영 완료 포함 전체 목록
    npm run revisions -- --applied T417 2      TCMETA-T417 Step 2를 반영 완료로 표시
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DB_FILE = path.join(ROOT, 'test-report-db.json');
const TESTS_DIR = path.join(ROOT, 'tests');

const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
db.revisions = db.revisions || {};
const args = process.argv.slice(2);

const FIELD_LABELS = { description: '절차', expectedResult: '기대결과', testData: '테스트 데이터' };
const indent = s => (s ? String(s) : '(없음)').replace(/\n/g, '\n            ');

function normalizeKey(k) {
  return /^TCMETA-/.test(k) ? k : 'TCMETA-' + (/^T/i.test(k) ? k.toUpperCase() : 'T' + k);
}

// test.describe('T417 ...') 가 있는 spec 파일 위치
function findSpecLocations(tcKey) {
  const num = tcKey.replace(/^TCMETA-/, '');
  const re = new RegExp(`describe\\(\\s*['"\`]${num}\\b`);
  const found = [];
  const walk = dir => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) { if (ent.name !== 'node_modules') walk(p); continue; }
      if (!ent.name.endsWith('.spec.ts')) continue;
      fs.readFileSync(p, 'utf-8').split('\n').forEach((line, i) => {
        if (re.test(line)) found.push(`${path.relative(ROOT, p)}:${i + 1}`);
      });
    }
  };
  walk(TESTS_DIR);
  return found;
}

if (args[0] === '--applied') {
  const key = normalizeKey(args[1] || '');
  const stepNo = parseInt(args[2], 10);
  const rev = db.revisions[key] && db.revisions[key][stepNo - 1];
  if (!rev) {
    console.error(`수정결과 없음: ${key} Step ${args[2]}`);
    process.exit(1);
  }
  rev.code_applied = true;
  rev.applied_at = new Date().toISOString();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  console.log(`✅ 반영 완료 표시: ${key} Step ${stepNo}`);
  process.exit(0);
}

const showAll = args.includes('--all');
let count = 0;
for (const [key, revs] of Object.entries(db.revisions)) {
  const spec = db.specs[key] || {};
  const items = Object.entries(revs).filter(([, r]) => showAll || !r.code_applied);
  if (!items.length) continue;

  console.log(`\n■ ${key} ${spec.name || ''}`);
  const locs = findSpecLocations(key);
  console.log(`  테스트 코드: ${locs.length ? locs.join(', ') : '(해당 describe 없음)'}`);
  for (const [idx, r] of items) {
    count++;
    console.log(`  - Step ${Number(idx) + 1} [${r.code_applied ? '반영 완료' : '반영 대기'}] ${r.updated_at}`);
    // v1 형식 { expectedResult, original: "..." } 도 읽을 수 있게 처리
    const fields = r.fields || { expectedResult: r.expectedResult };
    const original = r.fields ? (r.original || {}) : { expectedResult: r.original };
    for (const [f, value] of Object.entries(fields)) {
      console.log(`    [${FIELD_LABELS[f] || f}]`);
      console.log(`      원본: ${indent(original[f])}`);
      console.log(`      수정: ${indent(value)}`);
    }
  }
}
console.log(count ? `\n총 ${count}건` : (showAll ? '수정결과가 없습니다.' : '코드 반영 대기 중인 수정결과가 없습니다.'));
