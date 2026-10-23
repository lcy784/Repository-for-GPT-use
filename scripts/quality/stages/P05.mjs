import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {hash,readJson,writeJson} from '../lib.mjs';
const context=readJson(process.env.TIANGONG_GATE_CONTEXT),{root,runDir,stage}=context;
const evidence=file=>({path:path.relative(runDir,file),sha256:hash(readFileSync(file))});
try{
 const decisions=readJson(path.join(root,'quality/implementation-decisions.json')),rules=readJson(path.join(root,'quality/avatar-camera-rules/P05-20261023.json'));
 const ruleCopy=path.join(runDir,'P05-selected-rules.json');writeJson(ruleCopy,rules);
 const selected=rules.status==='user-selected'&&decisions.resolved.some(item=>item.id==='temporary-avatar-and-perspective-rules'&&item.status==='user-selected')&&!decisions.unresolved.some(item=>item.blocks==='P05');
 if(!selected)writeJson(context.resultFile,{runId:context.runId,candidate:context.candidate,stage:stage.id,status:'BLOCKED',cases:stage.requiredCases.map(id=>({id,status:'BLOCKED',executed:1,details:['Temporary avatar and camera rules need a user selection.'],evidence:[evidence(ruleCopy)]}))});
 else{
  const output=path.join(runDir,'P05-model-camera-tests.json');
  const unit=spawnSync(process.execPath,['tools/tiangong/node_modules/vitest/vitest.mjs','run','tools/tiangong/tests/avatar-camera.test.mjs','--config','quality/vitest.config.mjs','--reporter=json',`--outputFile=${output}`],{cwd:root,encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024});
  const unitLog=path.join(runDir,'P05-model-camera-tests.log');writeFileSync(unitLog,`${unit.stdout||''}\n${unit.stderr||''}`);
  const assertions=readJson(output).testResults.flatMap(s=>s.assertionResults);assert(unit.status===0&&assertions.length===11&&assertions.every(t=>t.status==='passed'),'Avatar/camera checks failed/skipped');
  const browser=spawnSync(process.execPath,['scripts/quality/p05-browser.mjs'],{cwd:root,encoding:'utf8',timeout:360000,maxBuffer:8*1024*1024,env:process.env});
  const browserLog=path.join(runDir,'P05-browser.log');writeFileSync(browserLog,`${browser.stdout||''}\n${browser.stderr||''}`);
  const file=path.join(runDir,'P05-browser/results.json'),report=readJson(file);assert.equal(report.runId,context.runId);assert.equal(report.candidate,context.candidate);
  const observations=path.join(runDir,'P05-model-camera-observations.json'),record=readJson(observations);assert.equal(record.candidate,context.candidate);assert.equal(record.runId,context.runId);assert.equal(record.observations.length,11);
  const asset=path.join(root,'public/characters/p05/traveler.glb'),assetRecord=path.join(runDir,'P05-asset-manifest.json');writeJson(assetRecord,{candidate:context.candidate,path:rules.avatar.asset,sha256:hash(readFileSync(asset)),source:rules.avatar.source,clips:rules.avatar.clips,provenance:'original repository-authored joint-node GLB; no downloaded character assets'});
  const common=[evidence(ruleCopy),evidence(assetRecord),evidence(output),evidence(unitLog),evidence(observations),evidence(file),evidence(browserLog),evidence(path.join(runDir,'P01-production-manifest.json'))];
  const cases=stage.requiredCases.map(id=>{const r=report.results.find(r=>r.id===id),tests=assertions.filter(t=>t.fullName.includes(`${id}:`));assert(r&&r.executed>0&&tests.length>0);return {id,status:r.status,executed:r.executed+tests.length,details:r.error?[r.error]:[],evidence:[...common,...(r.captures||[]).map(c=>evidence(path.join(runDir,'P05-browser',c.file)))]};});
  if(browser.status!==0&&cases.every(c=>c.status==='PASS'))throw new Error('Browser exited unsuccessfully despite passing assertions');
  writeJson(context.resultFile,{runId:context.runId,candidate:context.candidate,stage:stage.id,status:cases.every(c=>c.status==='PASS')?'PASS':'FAIL',cases,environment:{browser:report.browser,animation:'real imported GLB AnimationGroups; deterministic tick-sampled joint poses; no root motion',camera:'Rapier sphere sweeps; real keyboard, pointer, resize and native tab focus',scope:'cloud-functional-only; not Windows performance evidence'}});
 }
}catch(error){const failure=path.join(runDir,'P05-failure.log');writeFileSync(failure,error.stack||error.message);writeJson(context.resultFile,{runId:context.runId,candidate:context.candidate,stage:stage.id,status:'FAIL',cases:stage.requiredCases.map(id=>({id,status:'FAIL',executed:1,details:[error.message],evidence:[evidence(failure)]}))});}
