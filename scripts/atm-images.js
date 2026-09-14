#!/usr/bin/env node
'use strict';
/*
  ATM(Zephyr Scale) 스텝에 첨부된 이미지를 atm-assets/ 로 내려받아 결과서에서 클릭 없이 바로 보이게 한다.
  ATM 이미지 주소는 로그인(JWT) 없이는 "JWT was not found in cookies or headers" 로 막히므로,
  브라우저를 띄워 Jira에 로그인한 세션으로 받는다. (로그인 정보는 .auth/atm-browser 에 저장, git 제외)

    npm run atm-images      브라우저가 열리면 Jira 로그인 → ATM 테스트 케이스 하나를 열면 자동으로 전체 다운로드
                            이미 받은 이미지는 건너뜀 (XML이 바뀌면 새 이미지만 추가로 받음)
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env'), quiet: true });

const OUT_DIR = path.join(ROOT, 'atm-assets');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');
const PROFILE = path.join(ROOT, '.auth', 'atm-browser');
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
const EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };

const baseUrl = u => u.split('?')[0];

// XML 전체에서 ATM 이미지 주소 수집 (주소 → 처음 나온 TC 키)
function collectImages() {
  const found = new Map();
  for (const dir of [ROOT, path.join(ROOT, 'tests')]) {
    for (const name of fs.readdirSync(dir).filter(n => n.endsWith('.xml'))) {
      const xml = fs.readFileSync(path.join(dir, name), 'utf8');
      for (const tc of xml.matchAll(/<testCase\s[^>]*key="([^"]+)"[^>]*>([\s\S]*?)<\/testCase>/g)) {
        for (const m of tc[2].matchAll(/<img[^>]*\bsrc="(https:\/\/cloudfront\.tm4j\.smartbear\.com[^"]+)"/gi)) {
          const url = m[1].replace(/&amp;/g, '&');
          if (!found.has(url)) found.set(url, tc[1]);
        }
      }
    }
  }
  return found;
}

function loadManifest() {
  try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch (e) { return {}; }
}

function save(manifest, url, body, contentType) {
  const type = String(contentType || '').split(';')[0].trim();
  const ext = EXT[type] || path.extname(baseUrl(url)).toLowerCase() || '.png';
  const file = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16) + ext;
  fs.writeFileSync(path.join(OUT_DIR, file), body);
  manifest[url] = { file: 'atm-assets/' + file, downloaded_at: new Date().toISOString() };
}

(async () => {
  const images = collectImages();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const manifest = loadManifest();
  const pending = [...images.keys()].filter(u => !(manifest[u] && fs.existsSync(path.join(ROOT, manifest[u].file))));
  console.log(`ATM 이미지 ${images.size}개 중 받을 이미지 ${pending.length}개`);
  if (!pending.length) return;

  const pendingByBase = new Map(pending.map(u => [baseUrl(u), u]));
  let authQuery = '';   // ATM 화면이 이미지 주소에 붙여 쓰는 인증 쿼리가 있으면 재사용

  const context = await chromium.launchPersistentContext(PROFILE, { headless: false, viewport: null });

  // ATM 화면이 불러오는 이미지 응답을 그대로 저장 (인증 방식과 무관하게 동작)
  context.on('response', async res => {
    const original = pendingByBase.get(baseUrl(res.url()));
    if (!original || manifest[original] || !res.ok()) return;
    try {
      save(manifest, original, await res.body(), res.headers()['content-type']);
      const q = res.url().slice(baseUrl(res.url()).length);
      if (q) authQuery = q;
    } catch (e) {}
  });

  const tryFetch = async url => {
    for (const candidate of [url, authQuery && baseUrl(url) + authQuery].filter(Boolean)) {
      try {
        const r = await context.request.get(candidate, { timeout: 30000 });
        if (r.ok() && String(r.headers()['content-type'] || '').startsWith('image/')) return r;
      } catch (e) {}
    }
    return null;
  };

  // 1) 이미 로그인된 세션이면 바로 받기, 아니면 로그인 안내 후 대기
  const probe = pending[0];
  if (!(await tryFetch(probe))) {
    const page = context.pages()[0] || await context.newPage();
    const jira = (process.env.JIRA_URL || 'https://id.atlassian.com').replace(/\/$/, '');
    const firstKey = images.get(probe);
    const project = firstKey.split('-')[0];
    await page.goto(`${jira}/projects/${project}?selectedItem=com.atlassian.plugins.atlassian-connect-plugin:com.kanoah.test-manager__main-project-page#!/testCase/${firstKey}`).catch(() => {});
    console.log('\n브라우저에서 Jira에 로그인한 뒤, ATM 테스트 케이스(예: ' + firstKey + ')가 이미지와 함께 보이면 자동으로 다운로드를 시작합니다.');
    console.log('(최대 10분 대기, 창을 닫으면 중단)\n');

    const started = Date.now();
    let ok = false;
    while (Date.now() - started < LOGIN_TIMEOUT_MS) {
      await new Promise(r => setTimeout(r, 5000));
      if (context.pages().length === 0) break;
      if (manifest[probe] || await tryFetch(probe)) { ok = true; break; }
    }
    if (!ok) {
      console.log('로그인 세션으로 이미지를 받지 못했습니다. ATM 테스트 케이스 화면에서 이미지가 보이는지 확인 후 다시 실행해 주세요.');
      fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
      await context.close();
      process.exitCode = 1;
      return;
    }
  }

  // 2) 남은 이미지 병렬 다운로드
  const queue = pending.filter(u => !manifest[u]);
  let failed = [];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const url = queue.shift();
      const r = await tryFetch(url);
      if (r) save(manifest, url, await r.body(), r.headers()['content-type']);
      else failed.push(url);
    }
  }));

  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  await context.close();
  const done = pending.length - failed.length;
  console.log(`\n✅ 다운로드 ${done}개, 실패 ${failed.length}개 → atm-assets/ (결과서 새로고침하면 바로 보입니다)`);
  if (failed.length) {
    console.log('실패한 이미지 (TC):', failed.slice(0, 10).map(u => images.get(u)).join(', '), failed.length > 10 ? '…' : '');
    process.exitCode = 1;
  }
})().catch(e => { console.error('오류:', e.message); process.exit(1); });
