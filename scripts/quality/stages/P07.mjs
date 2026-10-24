import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {hash,readJson,writeJson,inside} from '../lib.mjs';
import {verifyAssets} from '../p07-contracts.mjs';
const context=readJson(process.env.TIANGONG_GATE_CONTEXT),{root,runDir,stage}=context;
const evidence=file=>({path:path.relative(runDir,file),sha256:hash(readFileSync(file))});
try{
 const contracts=path.join(runDir,'P07-contracts.json');writeJson(contracts,{runId:context.runId,candidate:context.candidate,...verifyAssets(root)});
 const units=path.join(runDir,'P07-asset-tests.json'),unit=spawnSync(process.execPath,['tools/tiangong/node_modules/vitest/vitest.mjs','run','tools/tiangong/tests/assets.test.mjs','--config','quality/vitest.config.mjs','--reporter=json',`--outputFile=${units}`],{cwd:root,encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024});
 const unitLog=path.join(runDir,'P07-asset-tests.log');writeFileSync(unitLog,`${unit.stdout||''}\n${unit.stderr||''}`);const assertions=readJson(units).testResults.flatMap(s=>s.assertionResults);assert(unit.status===0&&assertions.length>=29&&assertions.every(t=>t.status==='passed'),'P07 asset tests failed or skipped');
 const browser=spawnSync(process.execPath,['scripts/quality/p07-browser.mjs'],{cwd:root,encoding:'utf8',timeout:stage.timeoutMs-60000,maxBuffer:8*1024*1024,env:process.env});const browserLog=path.join(runDir,'P07-browser.log');writeFileSync(browserLog,`${browser.stdout||''}\n${browser.stderr||''}`);assert.equal(browser.status,0,browser.error?.message||'P07 actual browser checks failed');
 const browserFile=path.join(runDir,'P07-browser/results.json'),report=readJson(browserFile);assert.equal(report.runId,context.runId);assert.equal(report.candidate,context.candidate);assert.equal(report.results.length,4);assert(report.results.every(r=>r.status==='PASS'));assert.equal(report.external.length,0);assert.deepEqual(report.errors,[]);assert(report.captures.length>=6);assert(report.snapshots.filter(s=>s.label.startsWith('world-disposed-')).length===10);
 for(const image of report.captures)assert.equal(hash(readFileSync(inside(path.join(runDir,'P07-browser'),image.file))),image.sha256);
 const production=readJson(path.join(runDir,'P01-production-manifest.json'));assert.equal(production.candidate,context.candidate);
 const common=[contracts,units,unitLog,browserFile,browserLog,path.join(runDir,'P01-production-manifest.json')].map(evidence);
 const cases=stage.requiredCases.map(id=>{const tests=assertions.filter(t=>t.fullName.includes(`${id}:`)),result=report.results.find(r=>r.id===id);assert(result&&tests.length);return {id,status:'PASS',executed:result.executed+tests.length,details:result.details,evidence:[...common,...report.captures.map(i=>evidence(path.join(runDir,'P07-browser',i.file)))]};});
 writeJson(context.resultFile,{runId:context.runId,candidate:context.candidate,stage:stage.id,status:'PASS',cases,environment:{browser:report.browser,scope:'Real WebGL ownership, late decodes, local HTTP errors, migration pixel comparison and ten P06 world lifetimes; no streaming or target-device performance claim',executionBudgetMs:stage.timeoutMs}});
}catch(error){const failure=path.join(runDir,'P07-failure.log');writeFileSync(failure,error.stack||error.message);writeJson(context.resultFile,{runId:context.runId,candidate:context.candidate,stage:stage.id,status:'FAIL',cases:stage.requiredCases.map(id=>({id,status:'FAIL',executed:1,details:[error.message],evidence:[evidence(failure)]}))});}
