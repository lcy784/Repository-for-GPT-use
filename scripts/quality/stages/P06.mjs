import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {hash,readJson,writeJson,inside} from '../lib.mjs';
import {visualInputs} from '../visual-acceptance.mjs';
import {evaluateJourneyReview} from '../p06-review.mjs';
const context=readJson(process.env.TIANGONG_GATE_CONTEXT),{root,runDir,stage}=context;
const evidence=file=>({path:path.relative(runDir,file),sha256:hash(readFileSync(file))});
try{
 const units=path.join(runDir,'P06-physics-tests.json'),unit=spawnSync(process.execPath,['tools/tiangong/node_modules/vitest/vitest.mjs','run','tools/tiangong/tests/journey.test.mjs','tools/tiangong/tests/journey-review.test.mjs','--config','quality/vitest.config.mjs','--reporter=json',`--outputFile=${units}`],{cwd:root,encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024});
 const unitLog=path.join(runDir,'P06-physics-tests.log');writeFileSync(unitLog,`${unit.stdout||''}\n${unit.stderr||''}`);
 const assertions=readJson(units).testResults.flatMap(s=>s.assertionResults);assert(unit.status===0&&assertions.length===13&&assertions.every(t=>t.status==='passed'),'P06 physics or review safeguards failed or skipped');
 const observations=path.join(runDir,'P06-physics-observations.json'),physical=readJson(observations);assert.equal(physical.runId,context.runId);assert.equal(physical.candidate,context.candidate);assert(physical.records.length>=13);
 const browser=spawnSync(process.execPath,['scripts/quality/p06-browser.mjs'],{cwd:root,encoding:'utf8',timeout:(stage.timeoutMs??600000)-120000,maxBuffer:8*1024*1024,env:process.env});
 const browserLog=path.join(runDir,'P06-browser.log');writeFileSync(browserLog,`${browser.stdout||''}\n${browser.stderr||''}`);
 assert.equal(browser.status,0,browser.error?.message||'P06 browser process failed; see its execution log');
 const browserFile=path.join(runDir,'P06-browser/results.json'),report=readJson(browserFile);assert.equal(report.runId,context.runId);assert.equal(report.candidate,context.candidate);assert.equal(browser.status,0,'Actual browser journey failed');
 assert.equal(report.results.length,3);assert(report.results.every(r=>r.status==='PASS'));assert(report.captures.length>=12);assert.equal(report.defaultFlightSpeed,10);assert.equal(report.external.length,0);assert.deepEqual(report.errors,[]);
 for(const image of report.captures)assert.equal(hash(readFileSync(inside(path.join(runDir,'P06-browser'),image.file))),image.sha256);
 const production=readJson(path.join(runDir,'P01-production-manifest.json'));assert.equal(production.candidate,context.candidate);
 const request={version:1,stage:'P06',candidate:context.candidate,reviewInputHash:hash(JSON.stringify(visualInputs(readJson(path.join(runDir,'candidate.json')).files))),status:'awaiting-user-review',scope:'P06-core-journey',route:['jiangnan-bank','stone-bridge','cloud-below','cloud-inside','cloud-above','palace-terrace','palace-interior','palace-roof','roof-departure'],images:report.captures.map(i=>({path:path.posix.join(path.relative(root,runDir),'P06-browser',i.file),sha256:i.sha256})),referenceFiles:['docs/天宫HTML/input/IMG_20261019_161331.jpg','docs/天宫HTML/input/IMG_20261019_161156.jpg','docs/天宫HTML/input/jiangnan-offline.html'],reviewQuestions:['Does the ground-to-palace journey feel continuous and the palace retain its intended monumental scale?','Are interior access, roof landing and the below/inside/above-cloud views acceptable in both perspectives?'],targetPerformance:'Cloud functional evidence only. P15 still requires real Windows measurements.'};
 const requestFile=path.join(runDir,'P06-review-request.json');writeJson(requestFile,request);
 const review=evaluateJourneyReview(root,request),reviewFile=path.join(runDir,'P06-user-review.json');writeJson(reviewFile,review);
 const common=[units,unitLog,observations,browserFile,browserLog,path.join(runDir,'P01-production-manifest.json'),requestFile].map(evidence);
 const cases=stage.requiredCases.map(id=>{const tests=assertions.filter(t=>t.fullName.includes(`${id}:`));if(id==='P06-04')return {id,status:review.status,executed:tests.length,details:[review.reason],evidence:[...common,evidence(reviewFile)]};const result=report.results.find(r=>r.id===id);assert(result&&tests.length);return {id,status:'PASS',executed:result.executed+tests.length,details:result.details,evidence:[...common,...report.captures.map(i=>evidence(path.join(runDir,'P06-browser',i.file)))]};});
 writeJson(context.resultFile,{runId:context.runId,candidate:context.candidate,stage:stage.id,status:review.status,cases,environment:{browser:report.browser,functionalViewport:report.functionalViewport,captureViewport:report.captureViewport,scope:'actual default production journey plus physics matrix; cloud functional checks; user artistic acceptance separate',executionBudgetMs:stage.timeoutMs??600000,browserBudgetMs:(stage.timeoutMs??600000)-120000}});
}catch(error){const failure=path.join(runDir,'P06-failure.log');writeFileSync(failure,error.stack||error.message);writeJson(context.resultFile,{runId:context.runId,candidate:context.candidate,stage:stage.id,status:'FAIL',cases:stage.requiredCases.map(id=>({id,status:'FAIL',executed:1,details:[error.message],evidence:[evidence(failure)]}))});}
