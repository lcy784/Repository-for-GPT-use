import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {chromium} from '../../tools/tiangong/node_modules/@playwright/test/index.mjs';
import {preview} from '../../tools/tiangong/node_modules/vite/dist/node/index.js';
import {hash,readJson,writeJson} from './lib.mjs';
import {nativeBrowser} from './p04-native-browser.mjs';
const context=readJson(process.env.TIANGONG_GATE_CONTEXT),{root,runDir}=context;
const output=path.join(runDir,'P04-browser');mkdirSync(output,{recursive:true});
const profile=readJson(path.join(root,'quality/acceptance-profile.json')),results=[];
let browser,server;
const observe=page=>page.evaluate(()=>window.__TIANGONG_OBSERVE__());
const state=async page=>JSON.parse((await observe(page)).player);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
async function ticks(page,count){const tick=(await state(page)).tick;await page.waitForFunction(t=>JSON.parse(window.__TIANGONG_OBSERVE__().player).tick>=t,tick+count,{timeout:60000});}
async function ready(page){await page.waitForFunction(()=>['ready','error'].includes(window.__TIANGONG_OBSERVE__?.().phase),null,{timeout:60000});const o=await observe(page);assert.equal(o.phase,'ready',o.error);return o;}
async function open(config='fixture',existing){
 const base=`http://127.0.0.1:${server.httpServer.address().port}`,session=existing||await browser.newContext({viewport:profile.cloud.viewport,deviceScaleFactor:1});
 const errors=[],network=[],external=[];
 await session.route(/^https?:\/\//,route=>{const url=route.request().url();if(new URL(url).origin!==base){external.push(url);return route.abort();}if(config&&url.endsWith('/runtime-config.json'))return route.fulfill({contentType:'application/json',body:JSON.stringify(config==='fixture'?readJson(path.join(root,'quality/fixtures/P04/runtime-config.json')):config)});return route.continue();});
 const page=await session.newPage();await page.setViewportSize(profile.cloud.viewport);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>network.push({path:new URL(r.url()).pathname,status:r.status()}));
 await page.bringToFront();await page.goto(base);await ready(page);await ticks(page,35);
 return {session,page,errors,network,external};
}
async function focus(page){await page.locator('canvas').click({position:{x:640,y:300},noWaitAfter:true,timeout:60000});}
function clean(item){assert.deepEqual(item.errors,[]);assert.equal(item.external.length,0);assert(item.network.every(r=>r.status<400));}
async function capture(page,name){const data=await page.locator('canvas').evaluate(c=>c.toDataURL());const bytes=Buffer.from(data.split(',')[1],'base64');assert(bytes.length>5000);writeFileSync(path.join(output,name),bytes);return {file:name,sha256:hash(bytes)};}
async function check(id,body){try{results.push({id,status:'PASS',...await body()});}catch(error){results.push({id,status:'FAIL',executed:1,error:error.stack});}writeJson(path.join(output,'results.json'),{runId:context.runId,candidate:context.candidate,browser:browser?.version(),results});}
try{
 server=await preview({root,configFile:path.join(root,'vite.config.mjs'),preview:{host:'127.0.0.1',port:0}});
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 await check('P04-01',async()=>{const item=await open();try{
  const {page}=item;await focus(page);await page.keyboard.down('f');await ticks(page,6);await page.keyboard.down('f');await ticks(page,12);await page.keyboard.up('f');assert.equal((await state(page)).mode,'flying');
  const before=await state(page);await page.keyboard.down('Space');await ticks(page,18);await page.keyboard.up('Space');await ticks(page,3);const raised=await state(page);assert(raised.position.y-before.position.y>2);
  await ticks(page,24);const hover=await state(page);assert(distance(raised.position,hover.position)<.005,'Released flight drifted');
  const captureInfo=await capture(page,'flight-hover.png');await page.keyboard.down('w');await ticks(page,12);await page.keyboard.up('w');const moved=await state(page);assert(distance(hover.position,moved.position)>1);
  await page.keyboard.press('f');await page.waitForFunction(()=>JSON.parse(window.__TIANGONG_OBSERVE__().player).mode==='falling');const falling=await state(page);
  await page.keyboard.press('f');await page.waitForFunction(()=>JSON.parse(window.__TIANGONG_OBSERVE__().player).mode==='flying');const rescued=await state(page);assert(Math.abs(rescued.velocity.y)<.001);
  await page.keyboard.down('Control');await page.waitForFunction(()=>JSON.parse(window.__TIANGONG_OBSERVE__().player).mode==='grounded',null,{timeout:30000});await page.keyboard.up('Control');
  const landed=await state(page);assert.equal(landed.supportId,'flight-ground');assert.equal(await page.evaluate(()=>window.scrollY),0);clean(item);
  return {executed:7,before,raised,hover,moved,falling,rescued,landed,events:JSON.parse((await observe(page)).physics).events,captures:[captureInfo]};
 }finally{await item.session.close();}});
 await check('P04-02',async()=>{
  const config=readJson(path.join(root,'quality/fixtures/P04/runtime-config.json'));Object.assign(config,{spawn:[0,5,0],flightSpeedMetersPerSecond:60,cameraPositions:[[0,8,10],[8,8,10]],cameraTargets:[[0,5.6,0],[0,5.6,0]]});
  const item=await open(config);try{
   const {page}=item;await focus(page);await page.keyboard.press('f');await page.keyboard.down('w');await ticks(page,18);
   await page.evaluate(()=>{const until=performance.now()+400;while(performance.now()<until){/* Deliberate long frame in the real rendering loop. */}});
   await ticks(page,12);await page.keyboard.up('w');const snapshot=await observe(page),player=JSON.parse(snapshot.player),physics=JSON.parse(snapshot.physics);
   assert(player.position.z>-4.66&&player.position.z<-4.5);assert(physics.penetration<.01);assert(physics.maxSweepDistance<=.20000001);assert(snapshot.maxStepsInFrame<=5);assert(physics.maxSubsteps>=5);clean(item);
   return {executed:2,snapshot,captures:[await capture(page,'high-speed-wall.png')]};
  }finally{await item.session.close();}
 });
 await check('P04-03',async()=>{
  const native=await nativeBrowser(root);try{
   const item=await open('fixture',native.session),{page}=item,records=[];await focus(page);await page.keyboard.press('f');await page.keyboard.down('Space');await ticks(page,45);
   for(const mode of ['flying','falling']){
    if(mode==='falling'){await page.keyboard.press('f');await page.waitForFunction(()=>JSON.parse(window.__TIANGONG_OBSERVE__().player).mode==='falling');}
    const other=await native.session.newPage();await other.goto('about:blank');await other.bringToFront();
    await page.waitForFunction(()=>{const o=window.__TIANGONG_OBSERVE__();return o.visibility==='hidden'&&o.phase==='paused';},null,{polling:50,timeout:10000});
    const hidden=await observe(page),hiddenPlayer=JSON.parse(hidden.player);assert.equal(hiddenPlayer.mode,mode);await other.waitForTimeout(300);
    const still=await observe(page);assert.equal(JSON.parse(still.player).tick,hiddenPlayer.tick);assert.equal(still.frame,hidden.frame);assert.equal(still.pressedKeys,'');
    await page.bringToFront();await ready(page);await ticks(page,3);const restored=await observe(page),restoredPlayer=JSON.parse(restored.player);
    assert(restored.maxStepsInFrame<=5);assert(restored.visibilityTransitions>=2);assert.equal(restoredPlayer.mode,mode);
    if(mode==='flying')assert(distance(restoredPlayer.position,hiddenPlayer.position)<.005,'Background key state survived resume');
    else assert(distance(restoredPlayer.position,hiddenPlayer.position)<(restoredPlayer.tick-hiddenPlayer.tick)+.01,'Background elapsed time caused a large jump');
    records.push({mode,hidden,still,restored});await other.close();
   }
   await page.keyboard.up('Space');clean(item);return {executed:2,nativeVisibility:true,records};
  }finally{await native.close();}
 });
 await check('P04-04',async()=>{const item=await open(null);try{
  const {page}=item;assert.equal((await observe(page)).fixture,'p04-palace-flight');await focus(page);const before=await state(page);
  await page.keyboard.press('f');await page.keyboard.down('Space');await ticks(page,12);await page.keyboard.up('Space');await ticks(page,3);const flying=await state(page);assert.equal(flying.mode,'flying');assert(flying.position.y-before.position.y>.5);
  const screenshot=await capture(page,'palace-flight.png');await page.keyboard.press('f');await page.waitForFunction(()=>JSON.parse(window.__TIANGONG_OBSERVE__().player).mode==='grounded',null,{timeout:60000});
  const landed=await state(page);await page.keyboard.down('w');await ticks(page,12);await page.keyboard.up('w');const walked=await state(page);assert(distance(landed.position,walked.position)>.25);
  const snapshot=await observe(page),physics=JSON.parse(snapshot.physics),avatar=snapshot.avatarPosition.split(',').map(Number);assert(distance({x:avatar[0],y:avatar[1],z:avatar[2]},walked.position)<.001);assert.deepEqual(JSON.parse(physics.physicalPosition),walked.position);assert.equal(physics.controllerCount,1);assert.equal(snapshot.controllers,1);
  await page.locator('#stop').click({noWaitAfter:true});const stopped=await observe(page);assert.equal(stopped.controllers,0);assert.equal(stopped.engines,0);assert.equal(stopped.inputListeners,0);
  await page.locator('#restart').click({noWaitAfter:true});await ready(page);const restarted=await observe(page);assert.equal(restarted.controllers,1);assert.equal(restarted.canvases,1);assert.equal(restarted.engines,1);clean(item);
  return {executed:4,before,flying,landed,walked,snapshot,stopped,restarted,captures:[screenshot]};
 }finally{await item.session.close();}});
 assert(results.length===4&&results.every(r=>r.status==='PASS'),'P04 browser check failed');
}finally{await browser?.close();if(server)await new Promise(resolve=>server.httpServer.close(resolve));}
