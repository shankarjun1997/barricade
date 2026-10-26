#!/usr/bin/env node
/**
 * Browser smoke test for the Phase C build.
 *
 * Requirements:
 *   - `npm run build` has produced apps/web/dist
 *   - Google Chrome (or set CHROME_PATH) is installed
 *
 * Starts `vite preview` on :4173, drives the real UI with Playwright, asserts the
 * core flows, writes screenshots to artifacts/, and exits non-zero on failure.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'apps/web/dist');
const artifacts = path.join(root, 'artifacts');
const base = 'http://127.0.0.1:4173';

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

async function serverUp() {
  try {
    const response = await fetch(base + '/', { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await serverUp()) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('vite preview did not start within 30s');
}

if (!existsSync(path.join(dist, 'index.html'))) {
  console.error('Missing production build. Run: npm run build');
  process.exit(1);
}

mkdirSync(artifacts, { recursive: true });

let server = null;
let reused = false;
if (await serverUp()) {
  reused = true;
  console.log('Using existing preview server on :4173');
} else {
  server = spawn(
    'npm',
    ['run', 'preview', '-w', '@barricade/web', '--', '--port', '4173', '--strictPort'],
    { cwd: root, stdio: 'ignore' },
  );
  await waitForServer();
}

const browser = await chromium.launch({ executablePath: findChrome(), headless: true });
const errors = [];
let failed = false;

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

  const step = (name) => console.log(`\n== ${name} ==`);

  step('Home');
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  assert.match(await page.title(), /Barricade/);
  assert.ok((await page.getByRole('link', { name: 'Quick match' }).count()) >= 1);
  await page.screenshot({ path: path.join(artifacts, 'home-desktop.png') });

  step('Local match, barriers, undo, resignation');
  await page.locator('.hero').getByRole('link', { name: 'Quick match' }).click();
  await page.getByRole('button', { name: /Start Dash match/ }).click();
  await page.waitForURL('**/match');
  await page.locator('.board').waitFor();
  await page.screenshot({ path: path.join(artifacts, 'match-desktop.png') });

  await page.getByRole('button', { name: 'Move to E2' }).click();
  await page.getByRole('button', { name: 'Move to E8' }).click();
  assert.match(await page.locator('.pill', { hasText: 'plies' }).textContent(), /2 plies/);

  await page.keyboard.press('w');
  const slots = page.locator('.wall-slot');
  assert.ok((await slots.count()) > 10, 'wall slots should appear in barrier mode');
  const target = slots.nth(Math.min(20, (await slots.count()) - 1));
  await target.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const box = await target.boundingBox();
  assert.ok(box, 'wall slot needs a bounding box');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(250);
  assert.equal(await page.locator('.wall').count(), 1, 'barrier should be placed');

  await page.getByRole('button', { name: 'Undo' }).first().click();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.wall').count(), 0, 'undo should remove the barrier');

  await page.getByRole('button', { name: 'Resign' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Resign' }).click();
  await page.waitForURL('**/result');
  await page.getByText('Unrated local match').waitFor();
  console.log('Result:', (await page.locator('.result-hero h1').textContent())?.trim());

  step('Rematch and refresh persistence');
  await page.getByRole('button', { name: 'Rematch' }).click();
  await page.waitForURL('**/match');
  await page.locator('.board').waitFor();
  await page.getByRole('button', { name: 'Move to E2' }).click();
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  assert.match(await page.locator('.pill', { hasText: 'plies' }).textContent(), /1 plies/);

  step('Bot match');
  await page.goto(base + '/bots', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Challenge Nova/ }).click();
  await page.waitForURL('**/match');
  await page.getByRole('button', { name: 'Move to E2' }).click();
  await page.waitForFunction(
    () => {
      const pill = [...document.querySelectorAll('.pill')].find((node) => /plies/.test(node.textContent || ''));
      return pill && /[2-9] plies/.test(pill.textContent || '');
    },
    undefined,
    { timeout: 20_000 },
  );
  await page.getByRole('button', { name: 'Resign' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Resign' }).click();
  await page.waitForURL('**/result');
  await page.locator('.result-hero').waitFor();
  console.log('Bot result:', (await page.locator('.result-hero h1').textContent())?.trim(), '|', (await page.locator('.pill-gold').first().textContent())?.trim());

  step('Puzzle solve');
  await page.goto(base + '/puzzles', { waitUntil: 'networkidle' });
  const openRoad = page.locator('.puzzle-card', { hasText: 'Open Road' });
  await openRoad.getByRole('button', { name: /Solve|Replay/ }).click();
  await page.waitForURL('**/match');
  for (const label of ['D2', 'D3', 'D4', 'D5', 'D6', 'E7']) {
    await page.getByRole('button', { name: `Move to ${label}` }).click();
    if (label !== 'E7') await page.waitForTimeout(400);
  }
  await page.waitForURL('**/result', { timeout: 8000 });
  await page.getByText('Puzzle XP').waitFor();
  assert.equal((await page.locator('.result-hero h1').textContent())?.trim(), 'Victory');

  step('Settings');
  await page.goto(base + '/settings', { waitUntil: 'networkidle' });
  await page.getByRole('switch', { name: 'Sound effects' }).click();
  await page.getByRole('button', { name: 'Reduced' }).click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.motion), 'off');
  await page.getByRole('button', { name: 'High contrast' }).click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'contrast');

  step('Mobile layout');
  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(base + '/config?mode=sprint', { waitUntil: 'networkidle' });
  await mobile.getByRole('button', { name: /Start Sprint match/ }).click();
  await mobile.waitForURL('**/match');
  await mobile.locator('.board').waitFor();
  const metrics = await mobile.evaluate(() => ({
    inner: window.innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.equal(metrics.scroll, metrics.inner, 'no horizontal overflow on mobile');
  await mobile.screenshot({ path: path.join(artifacts, 'match-mobile.png'), fullPage: true });

  assert.deepEqual(errors, [], `console errors: ${errors.join(' | ')}`);
  console.log('\nSmoke test passed. Screenshots in artifacts/.');
} catch (error) {
  failed = true;
  console.error('\nSmoke test failed:', error instanceof Error ? error.message : error);
} finally {
  await browser.close();
  if (server) server.kill('SIGTERM');
  if (reused) console.log('Left the existing preview server running.');
}

process.exit(failed ? 1 : 0);
