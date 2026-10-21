import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '../../tools/tiangong/node_modules/@playwright/test/index.mjs';
import { preview } from '../../tools/tiangong/node_modules/vite/dist/node/index.js';
import { hash, readJson, writeJson } from './lib.mjs';
const context = readJson(process.env.TIANGONG_GATE_CONTEXT);
const {root,runDir}=context;
const output=path.join(runDir,'P02-browser'); mkdirSync(output,{recursive:true});
const profile=readJson(path.join(root,'quality/acceptance-profile.json'));
let server,browser;const errors=[],network=[],external=[],views=[];
try {
 server=await preview({root,configFile:path.join(root,'vite.config.mjs'),preview:{host:'127.0.0.1',port:0}});
 const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const session=await browser.newContext({viewport:profile.cloud.viewport,deviceScaleFactor:1});
 await session.route(/^https?:\/\//,route=>{ if(new URL(route.request().url()).origin!==origin) { external.push(route.request().url());return route.abort();}return route.continue();});
 const page=await session.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
 page.on('response',r=>network.push({path:new URL(r.url()).pathname,status:r.status()}));
 const observe=()=>page.evaluate(()=>window.__TIANGONG_OBSERVE__());
 await page.goto(origin);
 await page.waitForFunction(()=>['ready','error'].includes(window.__TIANGONG_OBSERVE__?.().phase),null,{timeout:45000});
 let value=await observe();assert.equal(value.phase,'ready',JSON.stringify({value,errors}));
 const manifest=await page.evaluate(async()=>{const r=await fetch('assets/palace/source-manifest.json');if(!r.ok) throw new Error('Missing sample source manifest');return r.json();});
 const study=JSON.parse(value.study);assert.equal(study.seed,manifest.seed);assert.equal(study.humanHeight,manifest.dimensions.humanHeight);assert.equal(study.columnHeight,manifest.dimensions.columnHeight);assert.equal(study.units,manifest.units);assert(study.columnHeight/study.humanHeight>20);
 const assembled=JSON.parse(value.assemblyMetrics);
 assert(Math.abs(assembled.humanHeightMeters-manifest.dimensions.humanHeight)<.001,'Human reference was scaled');
 assert(Math.abs(assembled.shaftHeightMeters-manifest.dimensions.columnHeight)<.001,'Declared column height differs from world geometry');
 assert.equal(assembled.columnCount,manifest.assembly.columnCount);assert.equal(assembled.roofTiers,manifest.assembly.roofTiers);
 assert(assembled.shaftHeightMeters/assembled.humanHeightMeters>35,'Monumental scale revision missing');
 assert(manifest.collisionProxies.every(p=>p.enabled===false));
 for(const name of ['far','stairs','human']) {
   await page.waitForFunction(()=>window.__TIANGONG_OBSERVE__().frame>=5);
   const before=await observe();await page.waitForFunction(n=>window.__TIANGONG_OBSERVE__().frame>n+2,before.frame);
   const pixels=await page.locator('canvas').evaluate(c=>c.toDataURL());
   const png=Buffer.from(pixels.split(',')[1],'base64');assert(png.length>25000,'Trivial render');
   writeFileSync(path.join(output,`${name}.png`),png);
   const snapshot=await observe();
   assert.equal(snapshot.fixture,'p02-palace');assert.equal(snapshot.backend,'WebGL2');assert(snapshot.drawCalls>0&&snapshot.triangles>10000&&snapshot.materials>=8&&snapshot.textures>=4);
   const rays=JSON.parse(snapshot.depthWitness);assert(rays.filter(r=>r.hit?.startsWith('palace/')&&r.distance>0&&r.point?.length===3).length>=2,'No actual palace triangle intersections');
   if(name==='far') for(const p of JSON.parse(snapshot.projectedRoofEnvelope)) assert(p[0]>0&&p[0]<profile.cloud.viewport.width&&p[1]>0&&p[1]<profile.cloud.viewport.height&&p[2]>0&&p[2]<1,'Far camera clips palace roof envelope');
   const expected=profile.visualReview.views[views.length];
   for(const [got,want] of [[snapshot.cameraEye,expected.eyeMeters],[snapshot.cameraTarget,expected.targetMeters]]) got.split(',').map(Number).forEach((n,i)=>assert(Math.abs(n-want[i])<.00001,'Authored review camera mismatch'));
   views.push({name,sha256:hash(png),bytes:png.length,snapshot});
   await page.locator('#camera').click({noWaitAfter:true,timeout:60000});
   await page.waitForFunction(index=>window.__TIANGONG_OBSERVE__().camera===index,views.length%3);
 }
 assert(new Set(views.map(v=>v.snapshot.depthWitness)).size===3,'Ray depths do not change with the camera');
 assert(new Set(views.map(v=>v.sha256)).size===3,'Review cameras do not change pixels');
 await page.waitForFunction(()=>window.__TIANGONG_OBSERVE__().camera===0);
 const before=await observe();await page.waitForFunction(n=>window.__TIANGONG_OBSERVE__().frame>n+2,before.frame);
 const repeat=Buffer.from((await page.locator('canvas').evaluate(c=>c.toDataURL())).split(',')[1],'base64');
 writeFileSync(path.join(output,'far-repeat.png'),repeat);
 assert.equal(hash(repeat),views[0].sha256,'Frozen camera/lighting/seed did not reproduce identical pixels');
 // A fresh application recreates the procedural seed and all GPU resources.
 await page.locator('#restart').click({noWaitAfter:true,timeout:60000});
 await page.waitForFunction(()=>window.__TIANGONG_OBSERVE__().generation===2&&window.__TIANGONG_OBSERVE__().phase==='ready');
 const restarted=await observe();await page.waitForFunction(n=>window.__TIANGONG_OBSERVE__().frame>n+2,restarted.frame);
 const fresh=Buffer.from((await page.locator('canvas').evaluate(c=>c.toDataURL())).split(',')[1],'base64');
 writeFileSync(path.join(output,'far-restarted.png'),fresh);
 assert.equal(hash(fresh),views[0].sha256,'Fresh seeded scene differs');
 assert.deepEqual(errors,[]);assert.equal(external.length,0);assert(network.every(r=>r.status<400));
 const files=readJson(path.join(runDir,'P01-production-manifest.json')).files;
 const resources={productionFiles:files.length,productionBytes:files.reduce((sum,f)=>sum+statSync(path.join(root,'dist',f.path)).size,0),proceduralGpuResources:'created deterministically at runtime; no downloaded models or images',sourceManifest:manifest};
 writeJson(path.join(output,'results.json'),{runId:context.runId,candidate:context.candidate,resources,status:'PASS',browser:browser.version(),rendering:'cloud SwiftShader functional evidence only',views,repeatSha256:hash(repeat),restartSha256:hash(fresh),network,errors,external});
} catch(error) {
 writeJson(path.join(output,'results.json'),{runId:context.runId,candidate:context.candidate,status:'FAIL',error:error.stack,views,network,errors,external});process.exitCode=1;
} finally {await browser?.close();if(server) await new Promise(resolve=>server.httpServer.close(resolve));}
