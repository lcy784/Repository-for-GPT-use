import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import os from 'node:os';

export const hash = data => createHash('sha256').update(data).digest('hex');
export const readJson = filename => JSON.parse(readFileSync(filename, 'utf8'));
export function writeJson(filename, value) {
  mkdirSync(path.dirname(filename), { recursive: true });
  writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`);
}
export function inside(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) throw new Error('Expected relative path');
  const resolved = path.resolve(root, relative);
  const relation = path.relative(path.resolve(root), resolved);
  if (relation === '..' || relation.startsWith(`..${path.sep}`)) throw new Error('Path escapes allowed directory');
  let cursor = path.resolve(root);
  for (const part of relation.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error('Symbolic evidence or entry is not allowed');
  }
  return resolved;
}
export function candidateFingerprint(root) {
  const files = [];
  function walk(relative = '') {
    for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      if (['.git', 'node_modules', '.cloud-tools', '__pycache__'].includes(entry.name)) continue;
      const filename = path.posix.join(relative, entry.name);
      if (filename === 'quality/reports') continue;
      if (entry.isSymbolicLink()) throw new Error(`Symbolic candidate input: ${filename}`);
      if (entry.isDirectory()) walk(filename);
      else if (entry.isFile()) files.push({ path: filename, sha256: hash(readFileSync(path.join(root, filename))) });
    }
  }
  walk();
  return { sha256: hash(JSON.stringify(files)), files };
}
export function selectChain(manifest, through) {
  if (manifest.version !== 1 || !Array.isArray(manifest.stages) || !manifest.stages.length) throw new Error('Invalid stage manifest');
  const ids = manifest.stages.map(stage => stage.id);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate stage ID');
  for (const stage of manifest.stages) {
    if (!/^[PXN]\d{2}$/.test(stage.id) || !Array.isArray(stage.requiredCases) || !stage.requiredCases.length || new Set(stage.requiredCases).size !== stage.requiredCases.length) throw new Error('Invalid required cases');
    if (stage.requiredCases.some(id => !new RegExp(`^${stage.id}-\\d{2}$`).test(id))) throw new Error('Invalid case ID');
    if (typeof stage.enabled !== 'boolean') throw new Error('Missing enabled state');
  }
  const main = manifest.stages.filter(stage => stage.id.startsWith('P'));
  if (!main.length || main.some((stage, index) => stage.id !== `P${String(index).padStart(2, '0')}` || !stage.enabled)) throw new Error('Main stages must begin at P00 and stay contiguous and enabled');
  const optional = manifest.stages.filter(stage => !stage.id.startsWith('P'));
  if (optional.some(stage => stage.enabled) && main.length !== 18) throw new Error('Extensions require the complete P00-P17 main chain');
  if (manifest.stages.slice(0, main.length).some(stage => !stage.id.startsWith('P'))) throw new Error('Optional stages cannot precede the main chain');
  const enabled = manifest.stages.filter(stage => stage.enabled);
  const index = enabled.findIndex(stage => stage.id === through);
  if (index < 0) throw new Error('Target stage is unknown or deferred');
  return enabled.slice(0, index + 1);
}
export function validateStageResult(result, context, stage, runDir) {
  if (result.runId !== context.runId || result.stage !== stage.id || result.candidate !== context.candidate) throw new Error('Result is bound to a different run or candidate');
  if (!['PASS', 'FAIL', 'BLOCKED'].includes(result.status) || !Array.isArray(result.cases)) throw new Error('Invalid stage status or cases');
  const ids = result.cases.map(item => item.id);
  if (new Set(ids).size !== ids.length || ids.length !== stage.requiredCases.length || ids.some(id => !stage.requiredCases.includes(id))) throw new Error('Missing, duplicate or unexpected case');
  for (const item of result.cases) {
    if (!['PASS', 'FAIL', 'BLOCKED'].includes(item.status)) throw new Error('Skipped, todo or unknown case status');
    if (!Number.isInteger(item.executed) || item.executed < 1) throw new Error('Empty test case');
    if (!Array.isArray(item.evidence) || !item.evidence.length) throw new Error('Missing case evidence');
    for (const evidence of item.evidence) {
      const filename = inside(runDir, evidence.path);
      if (!existsSync(filename) || !lstatSync(filename).isFile() || hash(readFileSync(filename)) !== evidence.sha256) throw new Error('Evidence missing or hash mismatch');
    }
  }
  if (result.status === 'PASS' && result.cases.some(item => item.status !== 'PASS')) throw new Error('PASS has non-passing cases');
  return result;
}
export function executeStage(root, stage, context, runDir, timeoutMs) {
  const entry = inside(root, stage.entry);
  if (!existsSync(entry) || !lstatSync(entry).isFile()) return { stage: stage.id, status: 'BLOCKED', reason: 'Stage entry is missing; no empty success substitute was used.' };
  const contextFile = path.join(runDir, `context-${stage.id}.json`);
  const resultFile = path.join(runDir, `stage-${stage.id}.json`);
  writeJson(contextFile, { ...context, resultFile, runDir, root, stage });
  const startedAt = new Date().toISOString();
  const child = spawnSync(process.execPath, [entry], {
    cwd: root, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, TIANGONG_GATE_CONTEXT: contextFile },
  });
  writeFileSync(path.join(runDir, `${stage.id}.stdout.log`), child.stdout || '');
  writeFileSync(path.join(runDir, `${stage.id}.stderr.log`), child.stderr || '');
  const execution = { startedAt, endedAt: new Date().toISOString(), exitCode: child.status, signal: child.signal, environment: { node: process.versions.node, os: os.platform(), arch: os.arch() } };
  if (child.error || child.status !== 0) return { stage: stage.id, status: 'FAIL', reason: child.error?.code || 'Stage process exited unsuccessfully', ...execution };
  try {
    return { ...validateStageResult(readJson(resultFile), context, stage, runDir), ...execution };
  } catch (error) {
    return { stage: stage.id, status: 'FAIL', reason: error.message, ...execution };
  }
}
export function runChain(chain, execute) {
  const results = [];
  for (const stage of chain) {
    const result = execute(stage);
    results.push(result);
    if (result.status !== 'PASS') return { status: result.status, stages: results, nextStageEligible: false };
  }
  return { status: 'PASS', stages: results, nextStageEligible: true };
}
export function assertCandidateUnchanged(before, after) {
  if (before !== after) throw new Error('Candidate changed during the run; results cannot qualify a different candidate');
}
export function newRunId() { return `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`; }
