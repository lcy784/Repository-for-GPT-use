import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {hash,readJson,writeJson} from '../lib.mjs';
const context=readJson(process.env.TIANGONG_GATE_CONTEXT),{root,runDir,stage}=context;
const evidence=file=>({path:path.relative(runDir,file),sha256:hash(readFileSync(file))});
try{
 const decisions=readJson(path.join(root,'quality/implementation-decisions.json'));
 const rules=readJson(path.join(root,'quality/flight-rules/P04-20261023.json'));
 const selected=rules.status==='user-selected'&&!decisions.unresolved.some(item=>item.blocks==='P04');
 const ruleCopy=path.join(runDir,'P04-selected-rules.json');writeJson(ruleCopy,rules);
 if(!selected){
  writeJson(context.resultFile,{runId:context.runId,candidate:context.candidate,stage:stage.id,status:'BLOCKED',cases:stage.requiredCases.map(id=>({id,status:'BLOCKED',executed:1,details:['Flight and fall rules require a recorded user selection.'],evidence:[evidence(ruleCopy)]}))});
 }else{
  const output=path.join(runDir,'P04-physics-tests.json');
  const unit=spawnSync(process.execPath,['tools/tiangong/node_modules/vitest/vitest.mjs','run','tools/tiangong/tests/flight.test.mjs','tools/tiangong/tests/flight-collisions.test.mjs','--config','quality/vitest.config.mjs','--reporter=json',`--outputFile=${output}`],{cwd:root,encoding:'utf8',timeout:30000});
  const unitLog=path.join(runDir,'P04-physics-tests.log');writeFileSync(unitLog,`${unit.stdout||''}\n${unit.stderr||''}`);
  const assertions=readJson(output).testResults.flatMap(s=>s.assertionResults);assert(unit.status===0&&assertions.length>=16&&assertions.every(t=>t.status==='passed'),'Flight physics checks failed/skipped');
  const browser=spawnSync(process.execPath,['scripts/quality/p04-browser.mjs'],{cwd:root,encoding:'utf8',timeout:300000,maxBuffer:8*1024*1024,env:process.env});
  const browserLog=path.join(runDir,'P04-browser.log');writeFileSync(browserLog,`${browser.stdout||''}\n${browser.stderr||''}`);
  const result=path.join(runDir,'P04-browser/results.json'),report=readJson(result);assert.equal(report.runId,context.runId);assert.equal(report.candidate,context.candidate);
  const observations=path.join(runDir,'P04-physics-observations.json'),physics=readJson(observations);assert.equal(physics.runId,context.runId);assert.equal(physics.candidate,context.candidate);assert(physics.observations.length>=13);
  const common=[evidence(ruleCopy),evidence(observations),evidence(output),evidence(unitLog),evidence(result),evidence(browserLog),evidence(path.join(runDir,'P01-production-manifest.json'))];
  const cases=stage.requiredCases.map(id=>{
   const r=report.results.find(r=>r.id===id),tests=assertions.filter(t=>t.fullName.includes(`${id}:`));assert(r&&r.executed>0&&tests.length>0);
   return {id,status:r.status,executed:r.executed+tests.length,details:r.error?[r.error]:[],evidence:[...common,...(r.captures||[]).map(c=>evidence(path.join(runDir,'P04-browser',c.file)))]};
  });
  if(browser.status!==0&&cases.every(c=>c.status==='PASS'))throw new Error('Browser exited unsuccessfully despite passing assertions');
  writeJson(context.resultFile,{runId:context.runId,candidate:context.candidate,stage:stage.id,status:cases.every(c=>c.status==='PASS')?'PASS':'FAIL',cases,environment:{browser:report.browser,physics:'Rapier 0.21.0 WASM; fixed 60 Hz; bounded swept substeps',scope:'cloud-functional-only; native Chromium tab visibility; not Windows performance evidence'}});
 }
}catch(error){const failure=path.join(runDir,'P04-failure.log');writeFileSync(failure,error.stack||error.message);writeJson(context.resultFile,{runId:context.runId,candidate:context.candidate,stage:stage.id,status:'FAIL',cases:stage.requiredCases.map(id=>({id,status:'FAIL',executed:1,details:[error.message],evidence:[evidence(failure)]}))});}
