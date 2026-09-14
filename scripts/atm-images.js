#!/usr/bin/env node
'use strict';
/*
  ATM(Zephyr Scale) 스텝에 첨부된 이미지를 atm-assets/ 로 내려받아 결과서에서 클릭 없이 바로 보이게 한다.

  ATM 이미지 주소는 JWT가 없으면 "JWT was not found in cookies or headers" 로 막힌다.
  Jira에 로그인한 브라우저에서 ATM 테스트 케이스 화면을 한 번 열면 ATM 앱(서비스 워커)이 인증을 준비하고,
  그 뒤로는 같은 세션에서 이미지 주소를 직접 받을 수 있다.

    npm run atm-images      저장된 로그인 세션(.auth/atm-browser)으로 창 없이 받기
                            세션이 없거나 만료됐으면 브라우저 창을 띄워 로그인 요청 → 로그인 후 자동 진행
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
const JIRA_URL = (process.env.JIRA_URL || '').replace(/\/$/, '');
const EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };

const baseUrl = u => u.split('?')[0];
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

// ATM 테스트 케이스 화면 열기 (여기서 ATM 앱이 이미지 인증을 준비)
async function openTestCase(context, key) {
  const page = context.pages()[0] || await context.newPage();
  const project = key.split('-')[0];
  await page.goto(`${JIRA_URL}/projects/${project}?selectedItem=com.atlassian.plugins.atlassian-connect-plugin:com.kanoah.test-manager__main-project-page#!/testCase/${key}`, { timeout: 60000 })
    .catch(() => {});
  return page;
}

const onLoginPage = page => /id\.atlassian\.com|\/login/.test(page.url());

async function tryFetch(context, url) {
  try {
    const r = await context.request.get(url, { timeout: 30000 });
    if (r.ok() && String(r.headers()['content-type'] || '').startsWith('image/')) return r;
  } catch (e) {}
  return null;
}

// 이미지 주소를 직접 받을 수 있을 때까지 대기 (창이 닫히면 중단)
async function waitForAccess(context, probe, timeoutMs, { reopenKey } = {}) {
  const started = Date.now();
  let reopened = false;
  while (Date.now() - started < timeoutMs) {
    if (context.pages().length === 0) return false;
    if (await tryFetch(context, probe)) return true;
    // 로그인 직후 Jira로 돌아왔는데 아직 인증 전이면 ATM 화면을 다시 열어 인증 준비
    const page = context.pages()[0];
    if (reopenKey && !reopened && page && !onLoginPage(page) && page.url().startsWith(JIRA_URL) && Date.now() - started > 15000) {
      await openTestCase(context, reopenKey);
      reopened = true;
    }
    await sleep(3000);
  }
  return false;
}

(async () => {
  if (!JIRA_URL) throw new Error('.env 에 JIRA_URL 이 필요합니다.');

  const images = collectImages();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const manifest = loadManifest();
  const pending = [...images.keys()].filter(u => !(manifest[u] && fs.existsSync(path.join(ROOT, manifest[u].file))));
  console.log(`ATM 이미지 ${images.size}개 중 받을 이미지 ${pending.length}개`);
  if (!pending.length) return;

  const probe = pending[0];
  const probeKey = images.get(probe);

  // 1) 저장된 세션으로 창 없이 시도
  let context = await chromium.launchPersistentContext(PROFILE, { headless: true, viewport: { width: 1600, height: 1000 } });
  let page = await openTestCase(context, probeKey);
  let ok = !onLoginPage(page) && await waitForAccess(context, probe, 60000);

  // 2) 세션 없음/만료 → 창을 띄워 로그인 요청
  if (!ok) {
    await context.close();
    context = await chromium.launchPersistentContext(PROFILE, { headless: false, viewport: null });
    page = await openTestCase(context, probeKey);
    console.log(`\n브라우저에서 Jira에 로그인해 주세요. 로그인 후 ATM 테스트 케이스(${probeKey}) 화면이 열리면 자동으로 다운로드를 시작합니다.`);
    console.log('(최대 10분 대기, 창을 닫으면 중단)\n');
    ok = await waitForAccess(context, probe, 10 * 60 * 1000, { reopenKey: probeKey });
    if (!ok) {
      await context.close().catch(() => {});
      console.log('이미지 접근 권한을 얻지 못했습니다. ATM 테스트 케이스 화면에서 이미지가 보이는지 확인 후 다시 실행해 주세요.');
      process.exitCode = 1;
      return;
    }
  }

  // 3) 병렬 다운로드
  console.log('인증 확인 — 다운로드 시작');
  const queue = [...pending];
  const failed = [];
  let done = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const url = queue.shift();
      const r = await tryFetch(context, url);
      if (r) {
        save(manifest, url, await r.body(), r.headers()['content-type']);
        if (++done % 50 === 0) console.log(`  ${done}/${pending.length}`);
      } else {
        failed.push(url);
      }
    }
  }));

  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  await context.close();
  console.log(`\n✅ 다운로드 ${done}개, 실패 ${failed.length}개 → atm-assets/ (결과서 새로고침하면 바로 보입니다)`);
  if (failed.length) {
    console.log('실패한 이미지의 TC:', [...new Set(failed.map(u => images.get(u)))].join(', '));
    process.exitCode = 1;
  }
})().catch(e => { console.error('오류:', e.message); process.exit(1); });
