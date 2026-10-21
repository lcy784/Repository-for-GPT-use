import { afterEach, describe, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertCandidateUnchanged, candidateFingerprint, executeStage, hash, readJson, runChain, selectChain, validateStageResult, writeJson } from '../../../scripts/quality/lib.mjs';
import { inspectImplementationInputs } from '../../../scripts/quality/contracts.mjs';

const directories = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'tiangong-gate-fixture-'));
  directories.push(root);
  const runDir = path.join(root, 'quality/reports/current');
  mkdirSync(runDir, { recursive: true });
  return { root, runDir, context: { runId: 'synthetic-current-run', candidate: 'synthetic-candidate' } };
}
function stageFile(f, id = 'P00', options = {}) {
  const stage = { id, enabled: true, entry: `${id}.mjs`, requiredCases: [`${id}-01`] };
  const source = `
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const c = JSON.parse(readFileSync(process.env.TIANGONG_GATE_CONTEXT, 'utf8'));
const options = ${JSON.stringify(options)};
appendFileSync(path.join(c.runDir, 'actual-calls.log'), c.stage.id + '\\n');
if (options.timeout) { setInterval(() => {}, 1000); } else {
 const filename = path.join(c.runDir, c.stage.id + '.evidence.txt');
 writeFileSync(filename, c.runId);
 const item = { id: c.stage.requiredCases[0], status: options.caseStatus || 'PASS', executed: options.empty ? 0 : 1, evidence: [{path:path.basename(filename),sha256:createHash('sha256').update(c.runId).digest('hex')}] };
 const result = { runId: options.wrongRun ? 'old-run' : c.runId, candidate:options.wrongCandidate ? 'old-candidate' : c.candidate, stage:c.stage.id, status:'PASS', cases:options.duplicate ? [item,item] : [item] };
 if (options.badHash) item.evidence[0].sha256 = 'invalid';
 if (options.missingEvidence) item.evidence[0].path = 'missing-evidence';
 if (options.unknownCase) item.id = c.stage.id + '-99';
 if (!options.noReport) writeFileSync(c.resultFile, JSON.stringify(result));
 process.exitCode = options.nonzero ? 7 : 0;
}
`;
  writeFileSync(path.join(f.root, stage.entry), source);
  return stage;
}
const execute = (f, stage, timeout = 5000) => executeStage(f.root, stage, f.context, f.runDir, timeout);

function inputFixture() {
  const f = fixture();
  const source = fileURLToPath(new URL('../../../', import.meta.url));
  for (const name of ['implementation-decisions.json', 'acceptance-profile.json', 'contracts.json']) {
    writeJson(path.join(f.root, 'quality', name), readJson(path.join(source, 'quality', name)));
  }
  const decisionsFile = path.join(f.root, 'quality/implementation-decisions.json');
  const decisions = readJson(decisionsFile);
  decisions.firstRelease.status = 'pending-user-preference';
  decisions.architecture.find(item => item.id === 'A-03').status = 'pending-user-preference';
  writeJson(decisionsFile, decisions);
  const sourceDir = path.join(f.root, 'docs/天宫HTML');
  mkdirSync(path.join(sourceDir, 'input'), { recursive: true });
  for (const name of ['user-requirements', 'product-requirements', 'system-architecture', 'phased-development-plan']) writeFileSync(path.join(sourceDir, `tiangong-${name}-v1.0.md`), 'Isolated prerequisite fixture, not a product document.');
  for (const filename of readJson(path.join(f.root, 'quality/acceptance-profile.json')).visualReview.referenceFiles) writeFileSync(path.join(f.root, filename), 'Isolated reference-presence fixture.');
  return f;
}

describe('P00-01 prerequisite and scope checks', () => {
  test('keeps unresolved user choices blocked after technical validation succeeds', () => {
    const f = inputFixture();
    expect(inspectImplementationInputs(f.root).blockers.length).toBeGreaterThan(0);
  });
  test('releases only the scope blocker after a user selection is recorded', () => {
    const f = inputFixture();
    const filename = path.join(f.root, 'quality/implementation-decisions.json');
    const decisions = readJson(filename);
    decisions.firstRelease.status = 'user-selected';
    decisions.architecture.find(item => item.id === 'A-03').status = 'user-selected';
    decisions.unresolved = decisions.unresolved.filter(item => item.blocks !== 'P00');
    writeJson(filename, decisions);
    expect(inspectImplementationInputs(f.root).blockers).toEqual([]);
    expect(decisions.unresolved.some(item => item.blocks === 'P04')).toBe(true);
  });
  test('refuses placeholder and missing movement thresholds', () => {
    const f = inputFixture();
    const filename = path.join(f.root, 'quality/acceptance-profile.json');
    const profile = readJson(filename);
    profile.provisionalSimulationParameters.positionToleranceMeters = 'TBD';
    writeJson(filename, profile);
    expect(() => inspectImplementationInputs(f.root)).toThrow(/Missing numeric/);
    delete profile.provisionalSimulationParameters.positionToleranceMeters;
    writeJson(filename, profile);
    expect(() => inspectImplementationInputs(f.root)).toThrow(/Missing numeric/);
  });
  test('refuses a missing source and a cloud substitute for Windows performance', () => {
    const f = inputFixture();
    const filename = path.join(f.root, 'quality/acceptance-profile.json');
    const profile = readJson(filename);
    profile.targetWindows.mayUseCloudResultsInstead = true;
    writeJson(filename, profile);
    expect(() => inspectImplementationInputs(f.root)).toThrow();
    profile.targetWindows.mayUseCloudResultsInstead = false;
    writeJson(filename, profile);
    rmSync(path.join(f.root, 'docs/天宫HTML/tiangong-product-requirements-v1.0.md'));
    expect(() => inspectImplementationInputs(f.root)).toThrow(/Required source/);
  });
});

describe('P00-02 actual child-process fault injection', () => {
  test('rejects a missing stage instead of making an empty success script', () => {
    const f = fixture();
    expect(execute(f, { id: 'P00', entry: 'missing.mjs', requiredCases: ['P00-01'] }).status).toBe('BLOCKED');
  });
  test.each([
    ['nonzero exit even when a child wrote PASS', { nonzero: true }],
    ['zero executed cases', { empty: true }],
    ['skipped required case', { caseStatus: 'SKIP' }],
    ['todo required case', { caseStatus: 'TODO' }],
    ['failed required case hidden by claimed PASS', { caseStatus: 'FAIL' }],
    ['duplicate case IDs', { duplicate: true }],
    ['unregistered case IDs', { unknownCase: true }],
    ['missing result report', { noReport: true }],
    ['missing evidence file', { missingEvidence: true }],
  ])('rejects %s', (_label, options) => {
    const f = fixture();
    expect(execute(f, stageFile(f, 'P00', options)).status).toBe('FAIL');
  });
  test('terminates a timed-out stage and refuses a passing result', () => {
    const f = fixture();
    const result = execute(f, stageFile(f, 'P00', { timeout: true }), 100);
    expect(result.status).toBe('FAIL');
    expect(result.reason).toBe('ETIMEDOUT');
  });
  test('does not enter the next stage after the previous actual process fails', () => {
    const f = fixture();
    const chain = [stageFile(f, 'P00', { nonzero: true }), stageFile(f, 'P01')];
    const result = runChain(chain, stage => execute(f, stage));
    expect(result.status).toBe('FAIL');
    expect(result.nextStageEligible).toBe(false);
    expect(readFileSync(path.join(f.runDir, 'actual-calls.log'), 'utf8')).toBe('P00\n');
  });
  test('rejects a traversal entry before launching a child process', () => {
    const f = fixture();
    expect(() => execute(f, { id: 'P00', entry: '../outside.mjs' })).toThrow(/escapes/);
  });
});

describe('P00-03 cumulative execution', () => {
  test('actually calls P00, P01 and P02 in order for every run', () => {
    const f = fixture();
    const stages = ['P00', 'P01', 'P02'].map(id => stageFile(f, id));
    const manifest = { version: 1, stages };
    const chain = selectChain(manifest, 'P02');
    for (const runId of ['synthetic-first-run', 'synthetic-second-run']) {
      f.context.runId = runId;
      const result = runChain(chain, stage => execute(f, stage));
      expect(result.status).toBe('PASS');
      expect(result.stages.map(stage => stage.stage)).toEqual(['P00', 'P01', 'P02']);
      expect(result.stages.every(stage => stage.runId === runId && stage.exitCode === 0)).toBe(true);
    }
    expect(readFileSync(path.join(f.runDir, 'actual-calls.log'), 'utf8')).toBe('P00\nP01\nP02\nP00\nP01\nP02\n');
  });
  test('refuses unknown and deferred stages rather than silently shortening the chain', () => {
    const f = fixture();
    const manifest = { version: 1, stages: [stageFile(f), { ...stageFile(f, 'X01'), enabled: false }] };
    expect(() => selectChain(manifest, 'P99')).toThrow();
    expect(() => selectChain(manifest, 'X01')).toThrow();
  });
  test('rejects duplicate stages and empty mandatory case lists', () => {
    const f = fixture();
    const stage = stageFile(f);
    expect(() => selectChain({ version: 1, stages: [stage, stage] }, 'P00')).toThrow();
    expect(() => selectChain({ version: 1, stages: [{ ...stage, requiredCases: [] }] }, 'P00')).toThrow();
  });
  test('cannot disable or remove a historical main stage', () => {
    const f = fixture();
    const first = stageFile(f, 'P00');
    const second = stageFile(f, 'P01');
    expect(() => selectChain({ version: 1, stages: [{ ...first, enabled: false }, second] }, 'P01')).toThrow();
    expect(() => selectChain({ version: 1, stages: [first, stageFile(f, 'P02')] }, 'P02')).toThrow();
    expect(() => selectChain({ version: 1, stages: [second, first] }, 'P01')).toThrow();
  });
});

describe('P00-04 run, candidate and evidence binding', () => {
  test.each([
    ['an old run ID', { wrongRun: true }],
    ['an old candidate fingerprint', { wrongCandidate: true }],
    ['a mismatched evidence hash', { badHash: true }],
  ])('rejects %s', (_label, options) => {
    const f = fixture();
    expect(execute(f, stageFile(f, 'P00', options)).status).toBe('FAIL');
  });
  test.each(['asset.bin', 'contracts.json', 'case-manifest.json', 'package-lock.json'])('changing %s invalidates a candidate', filename => {
    const f = fixture();
    const target = path.join(f.root, filename);
    writeFileSync(target, 'before');
    const before = candidateFingerprint(f.root).sha256;
    writeFileSync(target, 'after');
    const after = candidateFingerprint(f.root).sha256;
    expect(() => assertCandidateUnchanged(before, after)).toThrow(/Candidate changed/);
  });
  test('generated run reports do not change the candidate that they describe', () => {
    const f = fixture();
    writeFileSync(path.join(f.root, 'input.txt'), 'source');
    const before = candidateFingerprint(f.root).sha256;
    writeJson(path.join(f.runDir, 'summary.json'), { candidate: before });
    expect(candidateFingerprint(f.root).sha256).toBe(before);
  });
  test('refuses evidence outside the run directory, including symlinks', () => {
    const f = fixture();
    const stage = stageFile(f);
    expect(execute(f, stage).status).toBe('PASS');
    const result = readJson(path.join(f.runDir, 'stage-P00.json'));
    const outside = path.join(f.root, 'outside.txt');
    writeFileSync(outside, f.context.runId);
    symlinkSync(outside, path.join(f.runDir, 'linked-evidence'));
    result.cases[0].evidence[0] = { path: 'linked-evidence', sha256: hash(f.context.runId) };
    expect(() => validateStageResult(result, f.context, stage, f.runDir)).toThrow(/Symbolic/);
    result.cases[0].evidence[0].path = '../../outside.txt';
    expect(() => validateStageResult(result, f.context, stage, f.runDir)).toThrow(/escapes/);
  });
});
