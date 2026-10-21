import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { hash, readJson, writeJson } from '../lib.mjs';

const context = readJson(process.env.TIANGONG_GATE_CONTEXT);
const { root, runDir, stage } = context;
const evidence = filename => ({ path: path.relative(runDir, filename), sha256: hash(readFileSync(filename)) });
const log = path.join(runDir, 'P01-build-and-tests.log');
const cases = [];
try {
  const build = spawnSync('npm', ['run', 'build'], { cwd: root, encoding: 'utf8', timeout: 45000, maxBuffer: 8 * 1024 * 1024 });
  writeFileSync(log, `${build.stdout || ''}\n${build.stderr || ''}`);
  assert.equal(build.status, 0, 'Production build failed');
  const files = [];
  function walk(relative = '') {
    for (const entry of readdirSync(path.join(root, 'dist', relative), { withFileTypes: true })) {
      const name = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) walk(name);
      else files.push({ path: name, sha256: hash(readFileSync(path.join(root, 'dist', name))) });
    }
  }
  walk();
  const bundle = path.join(runDir, 'P01-production-manifest.json');
  writeJson(bundle, { candidate: context.candidate, files, packageType: 'P01-runtime-base-not-final-A-or-B' });
  const clockOutput = path.join(runDir, 'P01-clock-tests.json');
  const clock = spawnSync(process.execPath, ['tools/tiangong/node_modules/vitest/vitest.mjs', 'run', 'tools/tiangong/tests/clock.test.mjs', '--config', 'quality/vitest.config.mjs', '--reporter=json', `--outputFile=${clockOutput}`], { cwd: root, encoding: 'utf8', timeout: 20000 });
  const clockLog = path.join(runDir, 'P01-clock-tests.log'); writeFileSync(clockLog, `${clock.stdout || ''}\n${clock.stderr || ''}`);
  const assertions = readJson(clockOutput).testResults.flatMap(suite => suite.assertionResults);
  assert(clock.status === 0 && assertions.length >= 6 && assertions.every(item => item.status === 'passed'), 'Clock checks failed or were skipped');
  const browser = spawnSync(process.execPath, ['scripts/quality/p01-browser.mjs'], { cwd: root, encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024, env: process.env });
  const browserLog = path.join(runDir, 'P01-browser.log'); writeFileSync(browserLog, `${browser.stdout || ''}\n${browser.stderr || ''}`);
  const browserFile = path.join(runDir, 'P01-browser/results.json');
  const report = readJson(browserFile);
  assert.equal(report.runId, context.runId); assert.equal(report.candidate, context.candidate);
  for (const id of stage.requiredCases) {
    const result = report.results.find(item => item.id === id);
    assert(result && result.executed > 0, `Missing actual browser check ${id}`);
    const items = [evidence(bundle), evidence(log), evidence(browserFile), evidence(browserLog)];
    if (id === 'P01-03') items.push(evidence(clockOutput), evidence(clockLog));
    if (id === 'P01-01') for (const view of result.views || []) for (const image of view.captures) items.push(evidence(path.join(runDir, 'P01-browser', image.file)));
    cases.push({ id, status: result.status, executed: result.executed + (id === 'P01-03' ? assertions.length : 0), details: result.error ? [result.error] : [], evidence: items });
  }
  if (browser.status !== 0 && cases.every(item => item.status === 'PASS')) throw new Error('Browser process failed despite claiming passing cases');
  writeJson(context.resultFile, { runId: context.runId, candidate: context.candidate, stage: stage.id, status: cases.every(item => item.status === 'PASS') ? 'PASS' : 'FAIL', cases, environment: { browser: report.browser, display: report.display, graphics: report.results.find(item => item.id === 'P01-01')?.views?.[0]?.snapshot.renderer || 'not-observed', viewport: readJson(path.join(root, 'quality/acceptance-profile.json')).cloud.viewport }, buildManifest: evidence(bundle) });
} catch (error) {
  const failure = path.join(runDir, 'P01-failure.log'); writeFileSync(failure, error.stack || error.message);
  writeJson(context.resultFile, { runId: context.runId, candidate: context.candidate, stage: stage.id, status: 'FAIL', cases: stage.requiredCases.map(id => ({ id, status: 'FAIL', executed: 1, details: [error.message], evidence: [evidence(failure), evidence(log)] })) });
}
