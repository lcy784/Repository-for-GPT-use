import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {chromium} from '../../tools/tiangong/node_modules/@playwright/test/index.mjs';
import {preview} from '../../tools/tiangong/node_modules/vite/dist/node/index.js';
import {hash,readJson,writeJson} from './lib.mjs';
const context=readJson(process.env.TIANGONG_GATE_CONTEXT),{root,runDir}=context;
const output=path.join(runDir,'P03-browser');mkdirSync(output,{recursive:true});
const profile=readJson(path.join(root,'quality/acceptance-profile.json'));const results=[];
let browser,server;
const observe=page=>page.evaluate(()=>window.__TIANGONG_OBSERVE__());
const state=async page=>JSON.parse((await observe(page)).player);
async function ticks(page,count){const tick=(await state(page)).tick;await page.waitForFunction(t=>JSON.parse(window.__TIANGONG_OBSERVE__().player).tick>=t,tick+count,{timeout:60000});}
function distance(a,b){return Math.hypot(a.x-b.x,a.z-b.z);}
async function open(fixture=true){
 const base=`http://127.0.0.1:${server.httpServer.address().port}`,session=await browser.newContext({viewport:profile.cloud.viewport,deviceScaleFactor:1});
 const errors=[],network=[],external=[];
 await session.route(/^https?:\/\//,route=>{if(new URL(route.request().url()).origin!==base){external.push(route.request().url());return route.abort();}if(fixture&&route.request().url().endsWith('/runtime-config.json'))return route.fulfill({contentType:'application/json',body:JSON.stringify(readJson(path.join(root,'quality/fixtures/P03/runtime-config.json')))});return route.continue();});
 const page=await session.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>network.push({path:new URL(r.url()).pathname,status:r.status()}));
 await page.goto(base);await page.waitForFunction(()=>['ready','error'].includes(window.__TIANGONG_OBSERVE__?.().phase),null,{timeout:45000});
 const o=await observe(page);assert.equal(o.phase,'ready',o.error||JSON.stringify(errors));assert.equal(o.controllers,1);assert.equal(o.inputListeners,6);
 await ticks(page,20);
 return {session,page,errors,network,external};
}
function clean(item){assert.deepEqual(item.errors,[]);assert.equal(item.external.length,0);assert(item.network.every(r=>r.status<400));}
async function image(page,name){const data=await page.locator('canvas').evaluate(c=>c.toDataURL());const bytes=Buffer.from(data.split(',')[1],'base64');assert(bytes.length>5000);writeFileSync(path.join(output,name),bytes);return {file:name,sha256:hash(bytes)};}
async function check(id,body){try{results.push({id,status:'PASS',...await body()});}catch(error){results.push({id,status:'FAIL',executed:1,error:error.stack});}writeJson(path.join(output,'results.json'),{runId:context.runId,candidate:context.candidate,browser:browser?.version(),results});}
try{
 server=await preview({root,configFile:path.join(root,'vite.config.mjs'),preview:{host:'127.0.0.1',port:0}});
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 await check('P03-01',async()=>{const item=await open();try{
  const {page}=item;await page.locator('canvas').click({position:{x:640,y:300},noWaitAfter:true});assert((await observe(page)).inputFocused);
  const moves=[];
  for(const key of ['w','a','s','d','ArrowUp']){const before=await state(page);await page.keyboard.down(key);await ticks(page,18);await page.keyboard.up(key);await ticks(page,3);const after=await state(page);assert(distance(before.position,after.position)>.35,`No displacement from ${key}`);moves.push({key,before,after});}
  const stopped=await state(page);await ticks(page,18);const idle=await state(page);assert(distance(stopped.position,idle.position)<.005,'Released input kept moving');
  await page.keyboard.down('d');await ticks(page,12);await page.locator('#camera').click({noWaitAfter:true});await page.waitForFunction(()=>window.__TIANGONG_OBSERVE__().pressedKeys===''&&!window.__TIANGONG_OBSERVE__().inputFocused);
  const blurred=await state(page);await ticks(page,18);const afterBlur=await state(page);assert(distance(blurred.position,afterBlur.position)<.005,'Focus loss left a held key active');await page.keyboard.up('d');
  await page.locator('canvas').click({position:{x:640,y:300},noWaitAfter:true});await ticks(page,12);assert(distance(afterBlur.position,(await state(page)).position)<.005,'Refocus restored a stale key');
  const capture=await image(page,'terrain-real-input.png');clean(item);
  return {executed:moves.length+3,moves,stopped,idle,blurred,afterBlur,capture,network:item.network};
 }finally{await item.session.close();}});
 await check('P03-02',async()=>{const item=await open(false);try{
  const {page}=item;assert.equal((await observe(page)).fixture,'p03-palace-walk');const before=await state(page);assert.equal(before.supportId,'palace-terrace');
  await page.locator('canvas').click({position:{x:640,y:300},noWaitAfter:true,timeout:60000});await page.keyboard.down('w');await ticks(page,12);await page.keyboard.up('w');await ticks(page,3);
  const after=await state(page);assert(distance(before.position,after.position)>.25);assert.equal(after.mode,'grounded');
  const snapshot=await observe(page),capture=await image(page,'palace-ground-walking.png');clean(item);
  return {executed:1,before,after,snapshot,capture,network:item.network};
 }finally{await item.session.close();}});
 await check('P03-04',async()=>{const item=await open();try{
  const {page}=item,cycles=[];
  const consistent=async()=>{const o=await observe(page),s=JSON.parse(o.player),p=JSON.parse(o.physics),a=o.avatarPosition.split(',').map(Number),b=JSON.parse(p.physicalPosition);assert.equal(o.controllers,1);assert.equal(o.engines,1);assert.equal(p.bodyCount,1);assert.equal(p.controllerCount,1);assert.equal(o.canvases,1);assert(Math.hypot(a[0]-s.position.x,a[1]-s.position.y,a[2]-s.position.z)<.001);assert(Math.hypot(b.x-s.position.x,b.y-s.position.y,b.z-s.position.z)<.001);assert.equal(p.tick,s.tick);assert.equal(p.capsuleAxis,"+Y");assert(Math.abs(p.capsuleHeightMeters-1.75)<.001);assert(Math.abs(o.avatarHeightMeters-1.75)<.001);assert(Math.abs(o.avatarYaw-s.yaw)<.001);return o;};
  for(let i=0;i<3;i++){await page.locator('#stop').click({noWaitAfter:true});const stopped=await observe(page);assert.equal(stopped.controllers,0);assert.equal(stopped.engines,0);assert.equal(stopped.inputListeners,0);await page.waitForTimeout(150);assert.equal((await observe(page)).totalFrames,stopped.totalFrames);await page.locator('#restart').click({noWaitAfter:true});await page.waitForFunction(()=>window.__TIANGONG_OBSERVE__().phase==='ready');await ticks(page,5);cycles.push({stopped,restarted:await consistent()});}
  const generation=(await observe(page)).generation;await page.locator('#restart').dblclick({noWaitAfter:true});await page.waitForFunction(g=>{const o=window.__TIANGONG_OBSERVE__();return o.generation===g+2&&o.phase==='ready';},generation);await ticks(page,5);const rapidRestart=await consistent();
  assert(await page.evaluate(()=>Object.isFrozen(window.__TIANGONG_OBSERVE__())&&Object.getOwnPropertyDescriptor(window,'__TIANGONG_OBSERVE__').writable===false));clean(item);
  return {executed:cycles.length+1,cycles,rapidRestart};
 }finally{await item.session.close();}});
 assert(results.length===3&&results.every(r=>r.status==='PASS'),'P03 browser check failed');
}finally{await browser?.close();if(server)await new Promise(resolve=>server.httpServer.close(resolve));}
