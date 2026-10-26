#!/usr/bin/env node
/**
 * Two-player online smoke test against the real authoritative server.
 *
 * Requires:
 *   - `npm run build` and `npm run server:build`
 *   - Google Chrome (or CHROME_PATH)
 *
 * Starts the game server (temp persistence) and vite preview if needed, then drives
 * two isolated browser contexts through: rooms, invite links, moves, resignation,
 * Elo, rematch colour swap, disconnect/reconnect, global matchmaking, and mobile layout.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'artifacts');
const base = 'http://localhost:4173';
const health = 'http://127.0.0.1:8787/health';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('Chrome not found. Set CHROME_PATH to a Chrome/Chromium executable.');
}

async function reachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitFor(url, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await reachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

if (!existsSync(path.join(root, 'apps/web/dist/index.html'))) {
  console.error('Missing web build. Run: npm run build');
  process.exit(1);
}
if (!existsSync(path.join(root, 'apps/server/dist/index.js'))) {
  console.error('Missing server build. Run: npm run server:build');
  process.exit(1);
}

mkdirSync(artifacts, { recursive: true });

let server = null;
let preview = null;
let reusedServer = false;
let reusedPreview = false;
const dataDir = mkdtempSync(path.join(tmpdir(), 'barricade-online-smoke-'));

try {
  if (await reachable(health)) {
    reusedServer = true;
    console.log('Using existing game server on :8787');
  } else {
    server = spawn('node', ['apps/server/dist/index.js'], {
      cwd: root,
      stdio: 'ignore',
      env: {
        ...process.env,
        PORT: '8787',
        HOST: '0.0.0.0',
        NODE_ENV: 'production',
        DATA_FILE: path.join(dataDir, 'state.json'),
        ALLOWED_ORIGINS: 'http://localhost:4173',
      },
    });
    await waitFor(health);
    console.log('Game server started on :8787');
  }

  if (await reachable(base + '/')) {
    reusedPreview = true;
    console.log('Using existing preview server on :4173');
  } else {
    preview = spawn(
      'npm',
      ['run', 'preview', '-w', '@barricade/web', '--', '--port', '4173', '--strictPort'],
      { cwd: root, stdio: 'ignore' },
    );
    await waitFor(base + '/');
    console.log('Preview server started on :4173');
  }

  const browser = await chromium.launch({ executablePath: findChrome(), headless: true });
  const errors = [];
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  for (const [page, label] of [
    [a, 'A'],
    [b, 'B'],
  ]) {
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`${label}: ${message.text()}`);
    });
    page.on('pageerror', (error) => errors.push(`${label} pageerror: ${error.message}`));
  }

  const connect = async (page) => {
    await page.goto(base + '/online', { waitUntil: 'networkidle' });
    await page.locator('.page-head .pill').filter({ hasText: 'Connected' }).waitFor({ timeout: 15_000 });
  };
  const rename = async (page, name) => {
    await page.locator('#online-name').fill(name);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
  };
  const resign = async (page) => {
    await page.getByRole('button', { name: 'Resign' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Resign' }).click();
    await page.locator('.online-result').waitFor({ timeout: 10_000 });
  };
  const backToLobby = async (page) => {
    await page.getByRole('button', { name: 'Back to lobby' }).click();
    await page.waitForURL('**/online');
  };

  try {
    await connect(a);
    await rename(a, 'Smoke Alpha');
    await connect(b);
    await rename(b, 'Smoke Beta');

    console.log('\n== rooms + invite link ==');
    await a.getByRole('button', { name: 'Create room' }).click();
    await a.locator('.room-code').waitFor({ timeout: 10_000 });
    const code = (await a.locator('.room-code').innerText()).trim();
    assert.match(code, /^[A-Z2-9]{6}$/);
    await b.goto(`${base}/online?room=${code}`, { waitUntil: 'networkidle' });
    await b.waitForURL('**/online/match', { timeout: 15_000 });
    await a.waitForURL('**/online/match', { timeout: 15_000 });
    await a.locator('.board').waitFor();
    assert.ok(await a.locator('.page-head .pill').filter({ hasText: 'You are Blue' }).isVisible());

    console.log('== authoritative moves ==');
    await a.getByRole('button', { name: 'Move to E2' }).click();
    await b.getByRole('button', { name: 'Move to E8' }).waitFor({ timeout: 8_000 });
    await b.getByRole('button', { name: 'Move to E8' }).click();
    await a.getByText('2 plies').waitFor({ timeout: 8_000 });

    console.log('== resignation, Elo, rematch ==');
    await resign(b);
    assert.equal((await a.locator('.online-result h2').innerText()).trim(), 'Victory');
    assert.equal((await b.locator('.online-result h2').innerText()).trim(), 'Defeat');
    await a.getByRole('button', { name: 'Rematch' }).click();
    await b.getByRole('button', { name: 'Accept rematch' }).waitFor({ timeout: 8_000 });
    await b.getByRole('button', { name: 'Accept rematch' }).click();
    await a.locator('.page-head .pill').filter({ hasText: 'You are Red' }).waitFor({ timeout: 8_000 });

    console.log('== reconnect within grace ==');
    await b.goto('about:blank');
    await a.getByText('Opponent disconnected.').waitFor({ timeout: 8_000 });
    await b.goto(base + '/online/match', { waitUntil: 'networkidle' });
    await b.locator('.board').waitFor({ timeout: 15_000 });
    await a.getByText('Opponent disconnected.').waitFor({ state: 'hidden', timeout: 15_000 });
    await b.getByRole('button', { name: 'Move to E2' }).click();
    await a.getByText(/1 ply/).waitFor({ timeout: 8_000 });

    await resign(a);
    await backToLobby(a);
    await backToLobby(b);

    console.log('== global matchmaking ==');
    await a.getByRole('button', { name: 'Find opponent' }).click();
    await b.getByRole('button', { name: 'Find opponent' }).click();
    await a.waitForURL('**/online/match', { timeout: 15_000 });
    await b.waitForURL('**/online/match', { timeout: 15_000 });
    await a.locator('.board').waitFor();
    assert.match((await a.locator('.eyebrow').first().innerText()).toLowerCase(), /global match/);
    await a.screenshot({ path: path.join(artifacts, 'online-match-desktop.png'), fullPage: true });
    await resign(a);
    await backToLobby(a);
    await backToLobby(b);

    console.log('== mobile lobby ==');
    const ctxM = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const m = await ctxM.newPage();
    m.on('console', (message) => {
      if (message.type() === 'error') errors.push(`M: ${message.text()}`);
    });
    await connect(m);
    const metrics = await m.evaluate(() => ({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth }));
    assert.equal(metrics.scroll, metrics.inner, 'mobile lobby must not scroll horizontally');
    await m.screenshot({ path: path.join(artifacts, 'online-lobby-mobile.png'), fullPage: true });
    await ctxM.close();

    assert.deepEqual(errors, [], `console errors: ${errors.join(' | ')}`);
    console.log('\nOnline smoke passed. Screenshots in artifacts/.');
  } finally {
    await ctxA.close();
    await ctxB.close();
    await browser.close();
  }
} catch (error) {
  console.error('\nOnline smoke failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (preview) preview.kill('SIGTERM');
  if (server) server.kill('SIGTERM');
  if (reusedServer) console.log('Left the existing game server running.');
  if (reusedPreview) console.log('Left the existing preview server running.');
  rmSync(dataDir, { recursive: true, force: true });
}
