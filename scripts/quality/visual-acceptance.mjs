import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { candidateFingerprint, hash, inside, readJson } from './lib.mjs';

const buildFiles = new Set(['index.html','vite.config.mjs','tsconfig.json','package.json','package-lock.json','tools/tiangong/package.json','tools/tiangong/package-lock.json']);
export const visualInputs = files => files.filter(f => f.path.startsWith('src/') || f.path.startsWith('public/') || buildFiles.has(f.path));
export const palaceArtInputs = files => files.filter(f=>['src/runtime/palace.ts','src/runtime/roof.ts'].includes(f.path)||f.path.startsWith('public/assets/'));
export function assessVisualApproval(record, originalCandidate, currentInputs, images, continuation=false) {
  if (!record) return { status:'BLOCKED', reason:'No user visual acceptance has been recorded.' };
  assert.equal(record.version,1);assert.equal(record.status,'accepted-by-user');assert.equal(record.scope,'P02-visual-only');
  assert.equal(record.source.quote,'验收通过');assert.match(record.approvedCommit,/^[0-9a-f]{40}$/);
  assert.equal(hash(JSON.stringify(originalCandidate.files)),record.approvedCandidate,'Accepted historical candidate was altered');
  assert.equal(originalCandidate.sha256,record.approvedCandidate);
  assert.deepEqual(record.renderInputs,visualInputs(originalCandidate.files),'Acceptance input list differs from the reviewed candidate');
  assert.deepEqual(record.images.map(i=>i.name),['far','stairs','human']);
  assert(record.images.every(i=>/^[0-9a-f]{64}$/.test(i.sha256)));
  if (JSON.stringify(continuation?palaceArtInputs(currentInputs):currentInputs)!==JSON.stringify(continuation?palaceArtInputs(record.renderInputs):record.renderInputs)) return {status:'BLOCKED',reason:'Runtime, assets or build inputs changed after the accepted sample.'};
  if (images.length!==3 || images.some((v,i)=>v.name!==record.images[i].name || v.sha256!==record.images[i].sha256)) return {status:'BLOCKED',reason:'Current pixels differ from the user-accepted images; no automatic baseline update.'};
  return {status:'PASS',reason:'User acceptance applies: current visual inputs and three rendered images match the accepted sample.',approvedCommit:record.approvedCommit,approvedCandidate:record.approvedCandidate};
}
export function evaluateVisualApproval(root,currentReport) {
  const file=inside(root,'quality/visual-acceptance/P02-20261021.json');
  if(!existsSync(file)) return assessVisualApproval(null);
  const record=readJson(file);
  assert.match(record.approvedRunDirectory,/^quality\/reports\/[0-9TZ:.a-f-]+$/);
  for(const image of record.images) {
    assert.equal(image.path,`${record.approvedRunDirectory}/P02-browser/${image.name}.png`);
    assert.equal(hash(readFileSync(inside(root,image.path))),image.sha256,'Approved image was altered');
  }
  const originalCandidate=readJson(inside(root,`${record.approvedRunDirectory}/candidate.json`));
  const continuationFile=inside(root,'quality/visual-acceptance/P02-CONTINUED-DEVELOPMENT.json');
  let continuation=false;
  if(existsSync(continuationFile)) {
    const policy=readJson(continuationFile);assert.equal(policy.status,'user-confirmed-continue');assert.equal(policy.source.quote,'这个也通过了。继续执行开发。');
    assert.equal(policy.visualFixture.automaticBaselineReplacement,false);
    const config=record.renderInputs.find(f=>f.path==='public/runtime-config.json');
    assert(config);assert.equal(hash(readFileSync(inside(root,policy.visualFixture.config))),config.sha256,'Frozen P02 review config changed');
    continuation=true;
  }
  const result=assessVisualApproval(record,originalCandidate,visualInputs(candidateFingerprint(root).files),currentReport.views,continuation);
  return {...result,record};
}
