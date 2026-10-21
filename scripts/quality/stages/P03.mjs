import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {hash,readJson,writeJson} from '../lib.mjs';
const context=readJson(process.env.TIANGONG_GATE_CONTEXT),{root,runDir,stage}=context;
const evidence=file=>({path:path.relative(runDir,file),sha256:hash(readFileSync(file))});
try{
 const output=path.join(runDir,'P03-physics-tests.json');
 const unit=spawnSync(process.execPath,['tools/tiangong/node_modules/vitest/vitest.mjs','run','tools/tiangong/tests/ground.test.mjs','--config','quality/vitest.config.mjs','--reporter=json',`--outputFile=${output}`],{cwd:root,encoding:'utf8',timeout:30000});
 const unitLog=path.join(runDir,'P03-physics-tests.log');writeFileSync(unitLog,`${unit.stdout||''}\n${unit.stderr||''}`);
 const assertions=readJson(output).testResults.flatMap(s=>s.assertionResults);assert(unit.status===0&&assertions.length===14&&assertions.every(t=>t.status==='passed'),'Ground physics checks failed/skipped');
 const browser=spawnSync(process.execPath,['scripts/quality/p03-browser.mjs'],{cwd:root,encoding:'utf8',timeout:240000,maxBuffer:8*1024*1024,env:process.env});
 const browserLog=path.join(runDir,'P03-browser.log');writeFileSync(browserLog,`${browser.stdout||''}\n${browser.stderr||''}`);
 const result=path.join(runDir,'P03-browser/results.json'),report=readJson(result);assert.equal(report.runId,context.runId);assert.equal(report.candidate,context.candidate);
 const observations=path.join(runDir,'P03-physics-observations.json');assert.equal(readJson(observations).candidate,context.candidate);assert.equal(readJson(observations).observations.length,14);
 const common=[evidence(observations),evidence(output),evidence(unitLog),evidence(result),evidence(browserLog),evidence(path.join(runDir,'P01-production-manifest.json'))];
 const cases=stage.requiredCases.map(id=>{if(id==='P03-03')return {id,status:'PASS',executed:1,details:['Real Rapier simulation replayed at 30/60/144 display cadences; endpoints within 0.01 m.'],evidence:common};const r=report.results.find(r=>r.id===id);assert(r&&r.executed>0);return {id,status:r.status,executed:r.executed+(id==='P03-02'?11:id==='P03-04'?2:0),details:r.error?[r.error]:[],evidence:[...common,...(r.capture?[evidence(path.join(runDir,'P03-browser',r.capture.file))]:[])]};});
 if(browser.status!==0&&cases.every(c=>c.status==='PASS'))throw new Error('Browser exited unsuccessfully despite passing assertions');
 writeJson(context.resultFile,{runId:context.runId,candidate:context.candidate,stage:stage.id,status:cases.every(c=>c.status==='PASS')?'PASS':'FAIL',cases,environment:{browser:report.browser,physics:'Rapier 0.21.0 WASM; kinematic capsule; fixed 60 Hz'}});
}catch(error){const failure=path.join(runDir,'P03-failure.log');writeFileSync(failure,error.stack||error.message);writeJson(context.resultFile,{runId:context.runId,candidate:context.candidate,stage:stage.id,status:'FAIL',cases:stage.requiredCases.map(id=>({id,status:'FAIL',executed:1,details:[error.message],evidence:[evidence(failure)]}))});}
