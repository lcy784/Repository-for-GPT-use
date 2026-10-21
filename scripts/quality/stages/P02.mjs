import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {hash,readJson,writeJson} from '../lib.mjs';
import {evaluateVisualApproval} from '../visual-acceptance.mjs';
const context=readJson(process.env.TIANGONG_GATE_CONTEXT);
const {root,runDir,stage}=context;
const evidence=file=>({path:path.relative(runDir,file),sha256:hash(readFileSync(file))});
const log=path.join(runDir,'P02-browser.log');
try {
 // P01 in this same chain has already rebuilt the current production package.
 const production=readJson(path.join(runDir,'P01-production-manifest.json'));
 assert.equal(production.candidate,context.candidate);
 for(const file of production.files) assert.equal(hash(readFileSync(path.join(root,'dist',file.path))),file.sha256);
 const geometryOutput=path.join(runDir,'P02-unit-tests.json');
 const geometry=spawnSync(process.execPath,['tools/tiangong/node_modules/vitest/vitest.mjs','run','tools/tiangong/tests/roof.test.mjs','tools/tiangong/tests/visual-acceptance.test.mjs','--config','quality/vitest.config.mjs','--reporter=json',`--outputFile=${geometryOutput}`],{cwd:root,encoding:'utf8',timeout:20000});
 const geometryLog=path.join(runDir,'P02-unit-tests.log');writeFileSync(geometryLog,`${geometry.stdout||''}\n${geometry.stderr||''}`);
 const assertions=readJson(geometryOutput).testResults.flatMap(suite=>suite.assertionResults);
 assert(geometry.status===0&&assertions.length===9&&assertions.every(t=>t.status==='passed'),'Roof/visual-acceptance checks failed or were skipped');
 const browser=spawnSync(process.execPath,['scripts/quality/p02-browser.mjs'],{cwd:root,encoding:'utf8',timeout:480000,maxBuffer:8*1024*1024,env:process.env});
 writeFileSync(log,`${browser.stdout||''}\n${browser.stderr||''}`);
 const filename=path.join(runDir,'P02-browser/results.json'),report=readJson(filename);
 assert.equal(report.runId,context.runId);assert.equal(report.candidate,context.candidate);
 assert.equal(browser.status,0,report.error||'P02 browser process failed');assert.equal(report.status,'PASS',report.error);
 const approval=evaluateVisualApproval(root,report);
 const approvalFile=path.join(runDir,'P02-visual-acceptance.json');writeJson(approvalFile,approval);
 const review=path.join(runDir,'P02-review-request.json');
 writeJson(review,{runId:context.runId,candidate:context.candidate,status:approval.status==='PASS'?'accepted-by-user':'pending-human-review',approvedBaseline:approval.status==='PASS',acceptanceEvidence:'P02-visual-acceptance.json',
   references:readJson(path.join(root,'quality/acceptance-profile.json')).visualReview.referenceFiles,
   images:report.views.map(v=>({file:`P02-browser/${v.name}.png`,sha256:v.sha256})),
   criteria:['Small figure versus giant columns and long stair','Roof silhouette, depth of colonnade and warm main lighting','Cloud depth and material direction worth continuing'],
   requiredDecision:approval.reason});
 const cost=path.join(runDir,'P02-cost-record.json');
 writeJson(cost,{runId:context.runId,candidate:context.candidate,cloudOnly:true,targetDeviceStatus:'BLOCKED-missing-real-Windows-device',
  note:'RAF intervals include software rendering, GPU command latency and browser test capture overhead. CPU render submission time is not GPU time or target FPS. No hardware budget is approved from these readings.',
  browser:report.browser,views:report.views.map(v=>({camera:v.name,...v.snapshot})),resources:report.resources,
  targetEvidenceRequired:['Windows hardware/GPU and driver','Resolution/DPR and quality preset','Per-view frame-time distribution and draw calls','Resource size and browser version']});
 const common=[evidence(log),evidence(filename),evidence(path.join(runDir,'P01-production-manifest.json'))];
 const images=report.views.map(v=>evidence(path.join(runDir,'P02-browser',`${v.name}.png`)));
 const cases=[
  {id:'P02-01',status:'PASS',executed:report.views.length+3,details:['Actual local PBR assets, authored cameras and sample/source dimensions loaded.'],evidence:[...common,...images,evidence(geometryOutput),evidence(geometryLog)]},
  {id:'P02-02',status:approval.status,executed:11,details:['Repeated and rebuilt pixels are stable.',approval.reason],evidence:[...common,...images,evidence(review),evidence(approvalFile),evidence(geometryOutput),evidence(geometryLog),evidence(path.join(runDir,'P02-browser/far-repeat.png')),evidence(path.join(runDir,'P02-browser/far-restarted.png'))]},
  {id:'P02-03',status:'PASS',executed:3,details:['Actual triangle ray intersections at changed cameras demonstrate different surfaces and world-space depths.'],evidence:common},
  {id:'P02-04',status:'BLOCKED',executed:3,details:['Actual cloud resource and per-view timing readings recorded. Required target Windows device evidence is unavailable; software results cannot replace it.'],evidence:[...common,evidence(cost)]}
 ];
 writeJson(context.resultFile,{runId:context.runId,candidate:context.candidate,stage:stage.id,status:'BLOCKED',cases,environment:{browser:report.browser,graphics:report.views[0].snapshot.renderer,scope:'cloud-functional-only'}});
} catch(error) {
 const failure=path.join(runDir,'P02-failure.log');writeFileSync(failure,error.stack||error.message);
 writeJson(context.resultFile,{runId:context.runId,candidate:context.candidate,stage:stage.id,status:'FAIL',cases:stage.requiredCases.map(id=>({id,status:'FAIL',executed:1,details:[error.message],evidence:[evidence(failure)]}))});
}
