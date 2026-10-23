import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {chromium} from '../../tools/tiangong/node_modules/@playwright/test/index.mjs';
import {preview} from '../../tools/tiangong/node_modules/vite/dist/node/index.js';
import {hash,readJson,writeJson} from './lib.mjs';
import {nativeBrowser} from './p04-native-browser.mjs';
const context=readJson(process.env.TIANGONG_GATE_CONTEXT),{root,runDir}=context,output=path.join(runDir,'P05-browser');mkdirSync(output,{recursive:true});
const profile=readJson(path.join(root,'quality/acceptance-profile.json')),results=[];
let browser,server;
const observe=page=>page.evaluate(()=>window.__TIANGONG_OBSERVE__());
const state=async page=>JSON.parse((await observe(page)).player);
const animation=async page=>JSON.parse((await observe(page)).avatarAnimation);
const camera=async page=>JSON.parse((await observe(page)).cameraState);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
async function ticks(page,count){const t=(await state(page)).tick;await page.waitForFunction(t=>JSON.parse(window.__TIANGONG_OBSERVE__().player).tick>=t,t+count,{timeout:60000});}
async function ready(page){await page.waitForFunction(()=>['ready','error'].includes(window.__TIANGONG_OBSERVE__?.().phase),null,{timeout:60000});const o=await observe(page);assert.equal(o.phase,'ready',o.error);return o;}
async function open(config='fixture',existing,missingAvatar=false){
 const base=`http://127.0.0.1:${server.httpServer.address().port}`,session=existing||await browser.newContext({viewport:profile.cloud.viewport,deviceScaleFactor:1});
 const errors=[],network=[],external=[];
 await session.route(/^https?:\/\//,route=>{const url=route.request().url();if(new URL(url).origin!==base){external.push(url);return route.abort();}if(missingAvatar&&url.endsWith('/traveler.glb'))return route.fulfill({status:404,body:'Missing test avatar'});if(config&&url.endsWith('/runtime-config.json'))return route.fulfill({contentType:'application/json',body:JSON.stringify(config==='fixture'?readJson(path.join(root,'quality/fixtures/P05/runtime-config.json')):config)});return route.continue();});
 const page=await session.newPage();await page.setViewportSize(profile.cloud.viewport);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>network.push({path:new URL(r.url()).pathname,status:r.status()}));
 await page.bringToFront();await page.goto(base);if(missingAvatar)await page.waitForFunction(()=>window.__TIANGONG_OBSERVE__?.().phase==='error');else{await ready(page);await ticks(page,40);}return {session,page,errors,network,external};
}
async function focus(page){const size=page.viewportSize();await page.locator('canvas').click({position:{x:size.width/2,y:size.height/2},noWaitAfter:true,timeout:60000});}
async function look(page,yaw,pitch){
 for(let i=0;i<8;i++){
  const c=await camera(page),dx=Math.max(-300,Math.min(300,(yaw-c.yaw)/.005)),dy=Math.max(-220,Math.min(220,(c.pitch-pitch)/.005));
  if(Math.abs(dx)<2&&Math.abs(dy)<2)break;
  await page.mouse.move(640,360);await page.mouse.down();await page.mouse.move(640+dx,360+dy,{steps:10});await page.mouse.up();await ticks(page,2);
 }
}
function clean(item){assert.deepEqual(item.errors,[]);assert.equal(item.external.length,0);assert(item.network.every(r=>r.status<400));assert(item.network.some(r=>r.path.endsWith('/traveler.glb')&&r.status===200));}
async function capture(page,name){const data=await page.locator('canvas').evaluate(c=>c.toDataURL());const bytes=Buffer.from(data.split(',')[1],'base64');assert(bytes.length>5000);writeFileSync(path.join(output,name),bytes);return {file:name,sha256:hash(bytes)};}
function consistent(o){const s=JSON.parse(o.player),p=JSON.parse(o.physics),a=o.avatarPosition.split(',').map(Number);assert.deepEqual(JSON.parse(p.physicalPosition),s.position);assert(distance({x:a[0],y:a[1],z:a[2]},s.position)<.001);assert.equal(o.animatedAvatars,1);assert.equal(o.controllers,1);assert.equal(o.engines,1);assert.equal(o.canvases,1);assert.equal(JSON.parse(o.avatarAnimation).groups,4);assert.equal(JSON.parse(o.cameraState).listeners,10);assert(Math.abs(o.avatarHeightMeters-1.75)<.001);}
async function check(id,body){try{results.push({id,status:'PASS',...await body()});}catch(error){results.push({id,status:'FAIL',executed:1,error:error.stack});}writeJson(path.join(output,'results.json'),{runId:context.runId,candidate:context.candidate,browser:browser?.version(),results});}
try{
 server=await preview({root,configFile:path.join(root,'vite.config.mjs'),preview:{host:'127.0.0.1',port:0}});
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 await check('P05-01',async()=>{const item=await open(null);try{
  const {page}=item;await focus(page);const before=await state(page),third=await capture(page,'avatar-third.png');assert.equal((await observe(page)).perspective,'third');assert((await animation(page)).visible);
  await page.keyboard.press('v');await page.waitForFunction(()=>window.__TIANGONG_OBSERVE__().perspective==='first'&&!JSON.parse(window.__TIANGONG_OBSERVE__().avatarAnimation).visible);const first=await observe(page);assert(distance(before.position,JSON.parse(first.player).position)<.005);const eye=first.cameraEye.split(',').map(Number);assert(Math.abs(eye[1]-JSON.parse(first.player).position.y-.725)<.001);
  assert.equal(JSON.parse(first.avatarAnimation).enabledMeshes,0);const firstImage=await capture(page,'avatar-first.png');assert.notEqual(third.sha256,firstImage.sha256);
  await page.keyboard.down('w');await ticks(page,12);await page.keyboard.up('w');const moved=await state(page);assert(distance(before.position,moved.position)>.25);
  await page.locator('#camera').click({noWaitAfter:true});await page.waitForFunction(()=>window.__TIANGONG_OBSERVE__().perspective==='third'&&JSON.parse(window.__TIANGONG_OBSERVE__().avatarAnimation).visible);const returned=await observe(page);assert(distance(moved.position,JSON.parse(returned.player).position)<.005);consistent(returned);clean(item);
  return {executed:4,before,first,moved,returned,captures:[third,firstImage],network:item.network};
 }finally{await item.session.close();}});
 await check('P05-02',async()=>{const item=await open();try{
  const {page}=item,positions=[];await focus(page);const before=await state(page);
  await look(page,-Math.PI/2,-.25);await ticks(page,5);const wall=await observe(page),wc=JSON.parse(wall.cameraState);assert.equal(wc.blocker,'camera-side-wall');assert(wc.distance<3.2);assert(wall.cameraEye.split(',').map(Number)[0]<2.8);positions.push(wall);
  const image=await capture(page,'camera-wall.png');await look(page,0,-.25);await ticks(page,60);const clear=await observe(page);assert.equal(JSON.parse(clear.cameraState).blocker,null);assert(JSON.parse(clear.cameraState).distance>5.9);positions.push(clear);
  await look(page,Math.PI,0);await ticks(page,60);const door=await observe(page);assert.equal(JSON.parse(door.cameraState).blocker,null);assert(JSON.parse(door.cameraState).distance>5.9);assert(distance(before.position,JSON.parse(door.player).position)<.005);positions.push(door);
  await look(page,0,0);await page.keyboard.down('w');await page.waitForFunction(()=>JSON.parse(window.__TIANGONG_OBSERVE__().player).position.z<-6.8,null,{timeout:30000});await page.keyboard.up('w');await look(page,0,-1.1);await ticks(page,5);const eave=await observe(page);assert.equal(JSON.parse(eave.cameraState).blocker,'camera-eave');assert(JSON.parse(eave.cameraState).distance<3);positions.push(eave);consistent(eave);clean(item);
  return {executed:4,positions,captures:[image,await capture(page,'camera-eave.png')]};
 }finally{await item.session.close();}});
 await check('P05-03',async()=>{const item=await open();try{
  const {page}=item;await focus(page);const idle=await animation(page);assert.equal(idle.action,'idle');
  await page.keyboard.down('w');await ticks(page,18);const walking=await observe(page);await page.keyboard.up('w');assert.equal(JSON.parse(walking.avatarAnimation).action,'walk');assert.notDeepEqual(JSON.parse(walking.avatarAnimation).joints,idle.joints);consistent(walking);
  await page.keyboard.press('f');await page.keyboard.down('Space');await ticks(page,24);await page.keyboard.up('Space');const flying=await observe(page);assert.equal(JSON.parse(flying.avatarAnimation).action,'fly');assert(JSON.parse(flying.avatarAnimation).weights.fly>.9);consistent(flying);
  const flyImage=await capture(page,'avatar-flight.png');await page.keyboard.press('f');await ticks(page,8);const falling=await observe(page);assert.equal(JSON.parse(falling.avatarAnimation).action,'fall');assert.notDeepEqual(JSON.parse(flying.avatarAnimation).joints,JSON.parse(falling.avatarAnimation).joints);consistent(falling);
  await page.waitForFunction(()=>JSON.parse(window.__TIANGONG_OBSERVE__().player).mode==='grounded',null,{timeout:30000});await ticks(page,40);const landed=await observe(page);assert.equal(JSON.parse(landed.avatarAnimation).action,'idle');consistent(landed);clean(item);
  return {executed:4,idle,walking,flying,falling,landed,captures:[flyImage]};
 }finally{await item.session.close();}});
 await check('P05-04',async()=>{
  const item=await open(),records=[];
  try{
   const {page}=item;await focus(page);const before=await state(page);
   for(let i=0;i<12;i++){
    if(i%2===0)await page.keyboard.press('v');else await page.locator('#camera').click({noWaitAfter:true});
    await page.waitForFunction(mode=>window.__TIANGONG_OBSERVE__().perspective===mode,i%2===0?'first':'third');
    if(i===3||i===7||i===11){const [width,height]=i===7?[1280,720]:[1024,640];await page.setViewportSize({width,height});await page.waitForFunction(([w,h])=>{const o=window.__TIANGONG_OBSERVE__();return o.width===w&&o.height===h;},[width,height]);}
    await ticks(page,2);const o=await observe(page);consistent(o);assert(distance(before.position,JSON.parse(o.player).position)<.005);records.push(o);
   }
   await focus(page);await page.keyboard.down('w');await ticks(page,6);await page.locator('#camera').click({noWaitAfter:true});await page.keyboard.up('w');const released=await state(page);await ticks(page,15);assert(distance(released.position,(await state(page)).position)<.005);assert.equal((await observe(page)).pressedKeys,'');
   await page.locator('#stop').click({noWaitAfter:true});const stopped=await observe(page);assert.equal(stopped.animatedAvatars,0);assert.equal(stopped.controllers,0);assert.equal(stopped.engines,0);
   await page.locator('#restart').dblclick({noWaitAfter:true});await ready(page);await ticks(page,5);const restarted=await observe(page);consistent(restarted);clean(item);records.push({stopped,restarted});
  }finally{await item.session.close();}
  const native=await nativeBrowser(root);let focusRecord;
  try{
   const nativeItem=await open('fixture',native.session),{page}=nativeItem;await focus(page);await page.keyboard.down('v');await page.mouse.move(640,360);await page.mouse.down();await page.mouse.move(700,360);
   const other=await native.session.newPage();await other.goto('about:blank');await other.bringToFront();await page.waitForFunction(()=>window.__TIANGONG_OBSERVE__().phase==='paused',null,{polling:50});const hidden=await observe(page);assert.equal(JSON.parse(hidden.cameraState).dragging,false);assert.equal(hidden.pressedKeys,'');
   await page.bringToFront();await ready(page);await page.keyboard.up('v');await page.mouse.up();const prior=(await observe(page)).perspective;await focus(page);await page.keyboard.press('v');await page.waitForFunction(previous=>window.__TIANGONG_OBSERVE__().perspective!==previous,prior);focusRecord={hidden,restored:await observe(page)};consistent(focusRecord.restored);clean(nativeItem);
  }finally{await native.close();}
  const missing=await open('fixture',undefined,true);let missingRecord;try{missingRecord=await observe(missing.page);assert.equal(missingRecord.engines,0);assert.equal(missingRecord.controllers,0);assert.equal(missingRecord.animatedAvatars,0);assert.equal(await missing.page.locator('#notice').getAttribute('data-error'),'true');}finally{await missing.session.close();}
  return {executed:17,records,nativeFocus:focusRecord,missingAvatar:missingRecord};
 });
 assert(results.length===4&&results.every(r=>r.status==='PASS'),'P05 browser check failed');
}finally{await browser?.close();if(server)await new Promise(resolve=>server.httpServer.close(resolve));}
