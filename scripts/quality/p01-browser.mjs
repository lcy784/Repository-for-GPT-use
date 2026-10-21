import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from '../../tools/tiangong/node_modules/@playwright/test/index.mjs';
import { createServer, preview } from '../../tools/tiangong/node_modules/vite/dist/node/index.js';
import { hash, readJson, writeJson } from './lib.mjs';

const context = readJson(process.env.TIANGONG_GATE_CONTEXT);
const { root, runDir } = context;
const output = path.join(runDir, 'P01-browser');
mkdirSync(output, { recursive: true });
const profile = readJson(path.join(root, 'quality/acceptance-profile.json'));
const results = [];
let browser, virtualDisplay, production, development, displayName;
let displayErrors = '';
async function headedDisplay() {
  const executable = process.env.XVFB_PATH || (existsSync('/usr/bin/Xvfb') ? '/usr/bin/Xvfb' : path.join(root, '.cloud-tools/xvfb/usr/bin/Xvfb'));
  assert(existsSync(executable), 'Xvfb is required for a real tab-visibility check; run scripts/setup-p01-cloud.sh.');
  virtualDisplay = spawn(executable, ['-displayfd', '3', '-screen', '0', '1920x1080x24', '-nolisten', 'tcp', '-ac'], { stdio: ['ignore', 'ignore', 'pipe', 'pipe'] });
  virtualDisplay.stderr.on('data', data => { displayErrors = (displayErrors + data.toString()).slice(-10000); });
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Xvfb did not become ready: ${displayErrors}`)), 8000);
    virtualDisplay.once('error', error => { clearTimeout(timer); reject(error); });
    virtualDisplay.once('exit', code => { clearTimeout(timer); reject(new Error(`Xvfb exited ${code}: ${displayErrors}`)); });
    virtualDisplay.stdio[3].once('data', data => { clearTimeout(timer); assert(/^\d+\s*$/.test(String(data))); resolve(`:${String(data).trim()}`); });
  });
}
function origin(server) { return `http://127.0.0.1:${server.httpServer.address().port}`; }
async function pageAt(base, { init, configFailure } = {}, existingSession) {
  const session = existingSession || await browser.newContext({ viewport: profile.cloud.viewport, deviceScaleFactor: profile.cloud.deviceScaleFactor });
  const network = [], errors = [], external = [];
  await session.route(/^https?:\/\//, route => {
    const url = route.request().url();
    if (new URL(url).origin !== base) { external.push(url); return route.abort(); }
    if (url.endsWith('/runtime-config.json')) return route.fulfill({ status: configFailure ? 404 : 200, contentType: 'application/json', body: JSON.stringify(configFailure ? {} : readJson(path.join(root, 'quality/fixtures/P01/runtime-config.json'))) });
    return route.continue();
  });
  if (init) await session.addInitScript(init);
  const page = await session.newPage();
  if (existingSession) await page.setViewportSize(profile.cloud.viewport);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => network.push({ path: new URL(response.url()).pathname, status: response.status() }));
  await page.bringToFront();
  await page.goto(base);
  return { session, page, network, errors, external };
}
async function nativeTabs() {
  // A fresh owned browser, with public noDefaults support, avoids Playwright's
  // forced-focus override. It does not modify the application's visibility API.
  const chrome = spawn(process.env.CHROMIUM_PATH || '/usr/bin/chromium', [
    '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    `--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'tiangong-native-tabs-'))}`,
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  ], { env: { ...process.env, DISPLAY: displayName }, stdio: ['ignore', 'ignore', 'pipe'] });
  let diagnostics = '';
  let native;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Native Chromium startup timed out')), 10000);
      chrome.once('error', error => { clearTimeout(timer); reject(error); });
      chrome.stderr.on('data', data => {
        diagnostics = (diagnostics + data.toString()).slice(-20000);
        const found = diagnostics.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (found) { clearTimeout(timer); resolve(found[1]); }
      });
    });
    native = await chromium.connectOverCDP(endpoint, { noDefaults: true });
    return { session: native.contexts()[0], close: async () => { await native.close(); chrome.kill('SIGTERM'); } };
  } catch (error) { chrome.kill('SIGTERM'); throw error; }
}
const observe = page => page.evaluate(() => window.__TIANGONG_OBSERVE__());
async function ready(page) {
  await page.waitForFunction(() => ['ready', 'error'].includes(window.__TIANGONG_OBSERVE__?.().phase), null, { timeout: 20000 });
  const value = await observe(page);
  assert.equal(value.phase, 'ready', value.error || 'Scene never became ready');
  assert.equal(value.backend, 'WebGL2'); assert(value.activeMeshes >= 3);
  return value;
}
async function capture(page, filename) {
  const value = await page.locator('canvas').evaluate(canvas => {
    const copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height;
    const ctx = copy.getContext('2d'); ctx.drawImage(canvas, 0, 0);
    const pixels = ctx.getImageData(0, 0, copy.width, copy.height).data;
    const buckets = new Set();
    for (let i = 0; i < pixels.length; i += 64) buckets.add(`${pixels[i] >> 4}:${pixels[i+1] >> 4}:${pixels[i+2] >> 4}`);
    return { data: canvas.toDataURL(), colors: buckets.size, width: canvas.width, height: canvas.height };
  });
  assert(value.colors >= 6, 'Canvas contains too few colors to establish rendered geometry');
  const png = Buffer.from(value.data.split(',')[1], 'base64');
  assert(png.length > 5000, 'Canvas output is trivial');
  writeFileSync(path.join(output, filename), png);
  return { file: filename, sha256: hash(png), colors: value.colors, width: value.width, height: value.height };
}
async function check(id, body) {
  try { results.push({ id, status: 'PASS', ...(await body()) }); }
  catch (error) { results.push({ id, status: 'FAIL', executed: 1, error: error.stack || error.message }); }
  writeJson(path.join(output, 'results.json'), { runId: context.runId, candidate: context.candidate, browser: browser?.version(), display: 'real Chromium tabs on cloud Xvfb', results });
}
try {
  const display = await headedDisplay(); displayName = display;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: false,
    env: { ...process.env, DISPLAY: display }, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  production = await preview({ root, configFile: path.join(root, 'vite.config.mjs'), preview: { host: '127.0.0.1', port: 0 } });
  development = await createServer({ root, configFile: path.join(root, 'vite.config.mjs'), server: { host: '127.0.0.1', port: 0 } });
  await development.listen();
  await check('P01-01', async () => {
    const views = [];
    for (const [name, base] of [['production', origin(production)], ['development', origin(development)]]) {
      const item = await pageAt(base);
      try {
        const before = await ready(item.page);
        await item.page.waitForFunction(frame => window.__TIANGONG_OBSERVE__().frame >= frame + 3, before.frame);
        const a = await capture(item.page, `${name}-camera-a.png`);
        await item.page.locator('#camera').click();
        await item.page.waitForFunction(() => window.__TIANGONG_OBSERVE__().camera === 1);
        await item.page.waitForFunction(frame => window.__TIANGONG_OBSERVE__().frame > frame + 1, (await observe(item.page)).frame);
        const b = await capture(item.page, `${name}-camera-b.png`);
        assert.notEqual(a.sha256, b.sha256, 'Camera positions did not change actual pixels');
        assert.equal(item.external.length, 0); assert.deepEqual(item.errors, []);
        assert(item.network.every(response => response.status < 400), 'A required resource failed');
        const readonly = await item.page.evaluate(() => { const snapshot = window.__TIANGONG_OBSERVE__(); return Object.isFrozen(snapshot) && Object.getOwnPropertyDescriptor(window, '__TIANGONG_OBSERVE__').writable === false; });
        assert(readonly, 'Observation interface must be read-only');
        views.push({ mode: name, snapshot: await observe(item.page), captures: [a, b], network: item.network, errors: item.errors });
      } finally { await item.session.close(); }
    }
    return { executed: 2, views };
  });
  await check('P01-02', async () => {
    const failures = [
      { name: 'missing-WebGL2', init: () => { const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(type, ...args) { return type === 'webgl2' ? null : original.call(this, type, ...args); }; } },
      { name: 'missing-WASM', init: () => Object.defineProperty(window, 'WebAssembly', { value: undefined }) },
      { name: 'missing-runtime-config', configFailure: true },
      { name: 'render-error', init: () => { WebGL2RenderingContext.prototype.drawElements = function() { throw new Error('Injected render failure'); }; } },
    ];
    const evidence = [];
    for (const failure of failures) {
      const item = await pageAt(origin(production), failure);
      try {
        await item.page.waitForFunction(() => window.__TIANGONG_OBSERVE__?.().phase === 'error', null, { timeout: 20000 });
        const snapshot = await observe(item.page);
        assert(snapshot.error && snapshot.engines === 0 && snapshot.listeners === 0);
        assert.equal(await item.page.locator('#notice').getAttribute('data-error'), 'true');
        evidence.push({ fault: failure.name, snapshot, visibleMessage: await item.page.locator('#notice').innerText(), errors: item.errors, network: item.network });
      } finally { await item.session.close(); }
    }
    return { executed: failures.length, failures: evidence };
  });
  await check('P01-03', async () => {
    const native = await nativeTabs();
    try {
      const item = await pageAt(origin(production), {}, native.session);
      await ready(item.page);
      assert.equal((await observe(item.page)).visibility, 'visible');
      const other = await item.session.newPage();
      await other.goto(origin(production));
      await other.bringToFront();
      await item.page.waitForFunction(() => { const value = window.__TIANGONG_OBSERVE__(); return value.visibility === 'hidden' && value.phase === 'paused'; }, null, { polling: 50, timeout: 10000 });
      const hidden = await observe(item.page);
      await other.waitForTimeout(250);
      assert.equal((await observe(item.page)).frame, hidden.frame, 'A hidden tab kept rendering');
      await item.page.bringToFront(); await ready(item.page);
      await item.page.waitForFunction(frame => window.__TIANGONG_OBSERVE__().frame > frame, hidden.frame);
      const restored = await observe(item.page);
      assert(restored.visibilityTransitions >= 2 && restored.maxStepsInFrame <= profile.cloud.maxCatchUpSteps);
      assert.deepEqual(item.errors, []);
      return { executed: 1, nativeFocus: true, hidden, restored, errors: item.errors };
    } finally { await native.close(); }
  });
  await check('P01-04', async () => {
    const item = await pageAt(origin(production));
    const sizes = [], cycles = [];
    try {
      await ready(item.page);
      for (const [width, height] of [[640,480],[1366,768],[1024,640]]) {
        await item.page.setViewportSize({ width, height });
        await item.page.waitForFunction(([w,h]) => { const value = window.__TIANGONG_OBSERVE__(); return value.width === w && value.height === h; }, [width,height]);
        sizes.push(await observe(item.page));
      }
      for (let i = 0; i < 3; i++) {
        await item.page.locator('#stop').click();
        const stopped = await observe(item.page);
        assert.equal(stopped.phase, 'disposed'); assert.equal(stopped.engines, 0); assert.equal(stopped.listeners, 0);
        await item.page.waitForTimeout(150);
        assert.equal((await observe(item.page)).totalFrames, stopped.totalFrames, 'Disposed engine kept rendering');
        await item.page.locator('#restart').click(); await ready(item.page);
        const restarted = await observe(item.page);
        assert.equal(restarted.engines, 1); assert.equal(restarted.canvases, 1); assert.equal(restarted.listeners, 2);
        assert.equal(restarted.totalFrames - stopped.totalFrames, restarted.frame, 'An old rendering loop survived restart');
        cycles.push({ stopped, restarted });
      }
      assert.deepEqual(item.errors, []);
      return { executed: sizes.length + cycles.length, sizes, cycles, errors: item.errors };
    } finally { await item.session.close(); }
  });
  assert(results.every(result => result.status === 'PASS'), 'One or more P01 browser checks failed');
} finally {
  await browser?.close();
  await development?.close();
  if (production) await new Promise(resolve => production.httpServer.close(resolve));
  virtualDisplay?.kill('SIGTERM');
}
