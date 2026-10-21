import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectImplementationInputs } from '../contracts.mjs';
import { hash, readJson, writeJson } from '../lib.mjs';

assert(process.env.TIANGONG_GATE_CONTEXT, 'Run P00 through the cumulative gate.');
const context = readJson(process.env.TIANGONG_GATE_CONTEXT);
const { root, runDir, stage } = context;
const evidence = filename => ({ path: path.relative(runDir, filename), sha256: hash(readFileSync(filename)) });
const log = path.join(runDir, 'P00-input-checks.log');
const cases = [];
let inputs;
try {
  inputs = inspectImplementationInputs(root);
  const sourceCheck = spawnSync('python3', ['scripts/verify-tiangong-import.py'], { cwd: root, encoding: 'utf8', timeout: 15000 });
  assert.equal(sourceCheck.status, 0, 'Imported source verification failed.');
  const typeCheck = spawnSync(path.join(root, 'tools/tiangong/node_modules/.bin/tsc'), ['--noEmit', '--strict', '--target', 'es2022', '--module', 'nodenext', 'src/shared/contracts.ts'], { cwd: root, encoding: 'utf8', timeout: 30000 });
  assert.equal(typeCheck.status, 0, `Logical contract type checking failed: ${typeCheck.stderr || typeCheck.stdout}`);
  const built = path.join(runDir, 'candidate-contracts.json');
  writeJson(built, { candidate: context.candidate, contracts: inputs.contracts, acceptance: inputs.profile, decisions: inputs.decisions });
  writeFileSync(log, `${sourceCheck.stdout}\nLogical contracts typecheck passed.\n${inputs.blockers.join('\n')}\n`);
  cases.push({ id: 'P00-01', status: inputs.blockers.length ? 'BLOCKED' : 'PASS', executed: 1, details: inputs.blockers, evidence: [evidence(log), evidence(built)] });
} catch (error) {
  writeFileSync(log, error.stack || error.message);
  cases.push({ id: 'P00-01', status: 'FAIL', executed: 1, details: [error.message], evidence: [evidence(log)] });
}

const vitestOutput = path.join(runDir, 'P00-vitest.json');
const tests = spawnSync(process.execPath, [
  'tools/tiangong/node_modules/vitest/vitest.mjs', 'run', '--config', 'quality/vitest.config.mjs', '--reporter=json', `--outputFile=${vitestOutput}`,
], { cwd: root, encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024 });
const testLog = path.join(runDir, 'P00-vitest.log');
writeFileSync(testLog, `${tests.stdout || ''}\n${tests.stderr || ''}`);
let assertions = [];
try {
  const report = readJson(vitestOutput);
  assertions = report.testResults.flatMap(suite => suite.assertionResults);
  assert(tests.status === 0 && report.success === true && assertions.length > 0 && assertions.every(item => item.status === 'passed'), 'Vitest failed, skipped, crashed or ran no tests.');
  const inputCase = cases.find(item => item.id === 'P00-01');
  const inputTests = assertions.filter(item => item.fullName.includes('P00-01'));
  assert(inputTests.length > 0, 'Missing prerequisite-validator tests.');
  inputCase.executed += inputTests.length;
  inputCase.evidence.push(evidence(vitestOutput), evidence(testLog));
  for (const id of stage.requiredCases.filter(id => id !== 'P00-01')) {
    const selected = assertions.filter(item => item.fullName.includes(id));
    assert(selected.length > 0, `Missing fault-injection tests: ${id}`);
    cases.push({ id, status: 'PASS', executed: selected.length, evidence: [evidence(vitestOutput), evidence(testLog)] });
  }
} catch (error) {
  for (const id of stage.requiredCases.filter(id => id !== 'P00-01')) cases.push({ id, status: 'FAIL', executed: 1, details: [error.message], evidence: [evidence(testLog)] });
}
const status = cases.some(item => item.status === 'FAIL') ? 'FAIL' : cases.some(item => item.status === 'BLOCKED') ? 'BLOCKED' : 'PASS';
writeJson(context.resultFile, { runId: context.runId, candidate: context.candidate, stage: stage.id, status, cases, automaticTests: assertions.length, reason: status === 'BLOCKED' ? 'Initial release scope and launch preference are unresolved; P01 remains blocked.' : undefined });
