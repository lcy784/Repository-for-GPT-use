import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { candidateFingerprint, assertCandidateUnchanged, executeStage, newRunId, readJson, runChain, selectChain, writeJson } from './lib.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--through') {
  console.error('Usage: npm run gate -- --through P00');
  process.exit(2);
}
const runId = newRunId();
const runDir = path.join(root, 'quality/reports', runId);
mkdirSync(runDir, { recursive: true });
let summary;
try {
  const manifest = readJson(path.join(root, 'quality/stage-manifest.json'));
  const profile = readJson(path.join(root, 'quality/acceptance-profile.json'));
  const timeout = profile.cloud.stageTimeoutMs;
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 600000) throw new Error('Invalid stage timeout');
  const chain = selectChain(manifest, args[1]);
  const candidate = candidateFingerprint(root);
  writeJson(path.join(runDir, 'candidate.json'), candidate);
  const context = { runId, candidate: candidate.sha256 };
  const result = runChain(chain, stage => {
    const budget=stage.timeoutMs??timeout;
    if(!Number.isInteger(budget)||budget<1000||budget>2400000)throw new Error('Invalid explicit stage execution budget');
    return executeStage(root, stage, context, runDir, budget);
  });
  assertCandidateUnchanged(candidate.sha256, candidateFingerprint(root).sha256);
  summary = { runId, through: args[1], candidate: candidate.sha256, ...result, packages: { A: 'not-yet-delivered', B: 'not-yet-delivered', P01: result.stages.find(stage => stage.stage === 'P01')?.buildManifest || 'not-built-in-this-run' } };
} catch (error) {
  summary = { runId, through: args[1], status: 'FAIL', reason: error.message, nextStageEligible: false };
}
writeJson(path.join(runDir, 'summary.json'), summary);
console.log(JSON.stringify({ status: summary.status, through: summary.through, stages: summary.stages?.map(stage => ({ id: stage.stage, status: stage.status, reason: stage.reason })), nextStageEligible: summary.nextStageEligible, report: path.relative(root, path.join(runDir, 'summary.json')) }, null, 2));
process.exitCode = summary.status === 'PASS' ? 0 : summary.status === 'BLOCKED' ? 2 : 1;
