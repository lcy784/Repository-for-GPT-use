import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { NullEngine, Scene } from '@babylonjs/core';
import RAPIER from '@dimforge/rapier3d-compat';
import { chromium } from '@playwright/test';
import validator from 'gltf-validator';

const root = fileURLToPath(new URL('../../', import.meta.url));
const engine = new NullEngine();
const scene = new Scene(engine);
assert.equal(scene.getEngine(), engine);
scene.dispose();
engine.dispose();
await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
world.step();
world.free();
assert.equal(typeof validator.validateBytes, 'function');
console.log('Babylon NullEngine, Rapier bundled WASM, and glTF validator: ready.');

for (const tool of ['tsc', 'vite', 'vitest', 'playwright']) {
  console.log(execFileSync(path.join(root, 'tools/tiangong/node_modules/.bin', tool), ['--version'], { encoding: 'utf8' }).trim());
}

const systemBrowser = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].find(existsSync);
const executablePath = process.env.CHROMIUM_PATH || systemBrowser || chromium.executablePath();
assert(existsSync(executablePath), 'Install Chromium in the cloud image, or run npm --prefix tools/tiangong run browser:install.');
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const html = readFileSync(path.join(root, 'docs/天宫HTML/input/jiangnan-offline.html'));
const server = createServer((request, response) => {
  if (request.url !== '/jiangnan-offline.html') { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(html);
});
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const externalRequests = [];
  await context.route(/^https?:\/\//, route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    externalRequests.push(route.request().url());
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${origin}/jiangnan-offline.html`);
  await page.waitForFunction(() => document.querySelector('#loading')?.classList.contains('done'), null, { timeout: 60000 });
  await context.setOffline(true);
  const captured = await page.locator('#view').evaluate(element => ({ width: element.width, height: element.height, dataUrl: element.toDataURL() }));
  const canvas = { width: captured.width, height: captured.height, bytes: captured.dataUrl.length };
  assert(canvas.width > 0 && canvas.height > 0 && canvas.bytes > 10000, 'Canvas did not produce a nontrivial image.');
  await page.locator('#settings').click();
  await assert.doesNotReject(() => page.locator('#mood').selectOption('blue'));
  assert.equal(await page.locator('body.night').count(), 1, 'Mood control did not update the page.');
  await page.locator('#settings').click();
  await page.keyboard.press('h');
  assert.equal(await page.locator('body.clean').count(), 1, 'Hide-interface control did not update the page.');
  await page.keyboard.press('h');
  assert.equal(await page.locator('body.clean').count(), 0, 'Restore-interface control did not update the page.');
  assert.equal(externalRequests.length, 0, 'Reference HTML attempted external networking.');
  assert.deepEqual(errors, [], 'Browser reported script or console errors.');
  const artifacts = mkdtempSync(path.join(tmpdir(), 'tiangong-cloud-check-'));
  writeFileSync(path.join(artifacts, 'reference-canvas.png'), Buffer.from(captured.dataUrl.split(',')[1], 'base64'));
  console.log(JSON.stringify({ browser: await browser.version(), referenceHtmlLocalHttpThenOffline: 'PASS', fileScheme: 'not-tested-policy-blocked', canvas, externalRequests: externalRequests.length, browserErrors: errors.length, artifacts }));
} finally {
  await browser.close();
  if (server.listening) await new Promise(resolve => server.close(resolve));
}
