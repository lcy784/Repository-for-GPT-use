import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {chromium} from '../../tools/tiangong/node_modules/@playwright/test/index.mjs';
import {preview} from '../../tools/tiangong/node_modules/vite/dist/node/index.js';
import {hash,readJson,writeJson} from './lib.mjs';
const context=readJson(process.env.TIANGONG_GATE_CONTEXT),{root,runDir}=context,output=path.join(runDir,'P06-browser');mkdirSync(output,{recursive:true});
const results=[],checkpoints=[],captures=[],clouds=[],errors=[],external=[],network=[];
let browser,server,session,page;
const observe=()=>page.evaluate(()=>window.__TIANGONG_OBSERVE__());
const state=async()=>JSON.parse((await observe()).player);
async function ticks(count){const t=(await state()).tick;await page.waitForFunction(t=>JSON.parse(window.__TIANGONG_OBSERVE__().player).tick>=t,t+count,{timeout:60000});}
async function focus(){await page.locator('canvas').click({position:{x:430,y:180},noWaitAfter:true});}
async function look(yaw,pitch){
 for(let i=0;i<10;i++){
  const camera=JSON.parse((await observe()).cameraState),dx=Math.max(-240,Math.min(240,(yaw-camera.yaw)/.005)),dy=Math.max(-130,Math.min(130,(camera.pitch-pitch)/.005));
  if(Math.abs(dx)<1&&Math.abs(dy)<1)return;
  await page.mouse.move(340,190);await page.mouse.down();await page.mouse.move(340+dx,190+dy,{steps:5});await page.mouse.up();await ticks(1);
 }
 const camera=JSON.parse((await observe()).cameraState);assert(Math.abs(camera.yaw-yaw)<.02&&Math.abs(camera.pitch-pitch)<.02,'Could not aim with real pointer input');
}
async function capture(name){
 await page.setViewportSize({width:1280,height:720});await ticks(2);
 const data=await page.evaluate(()=>{const canvas=document.querySelector('canvas');if(!(canvas instanceof HTMLCanvasElement))throw Error('Missing actual render canvas');return canvas.toDataURL();}),bytes=Buffer.from(data.split(',')[1],'base64');assert(bytes.length>5000);
 const item={file:`${name}.png`,sha256:hash(bytes)};writeFileSync(path.join(output,item.file),bytes);captures.push(item);
 await page.setViewportSize({width:640,height:480});await ticks(2);return item;
}
async function mark(label){const o=await observe(),s=JSON.parse(o.player),p=JSON.parse(o.physics),a=o.avatarPosition.split(',').map(Number);
 assert.equal(o.generation,1);if(checkpoints.length)assert(s.tick>JSON.parse(checkpoints.at(-1).snapshot.player).tick,'Player tick reset during continuous journey');assert.equal(o.controllers,1);assert.equal(o.engines,1);assert.equal(o.animatedAvatars,1);assert.equal(p.controllerCount,1);assert.equal(p.recoveryCount,0);assert(p.penetration<.01);assert.deepEqual(JSON.parse(p.physicalPosition),s.position);assert(Math.hypot(a[0]-s.position.x,a[1]-s.position.y,a[2]-s.position.z)<.001);assert.equal(s.id,'local-player');
 const record={label,snapshot:o};checkpoints.push(record);writeJson(path.join(output,'checkpoints.json'),{runId:context.runId,candidate:context.candidate,checkpoints});return o;
}
async function move(axis,target){
 const s=await state(),positive=target>s.position[axis],key=axis==='y'?(positive?'Space':'Control'):axis==='x'?(positive?'d':'a'):(positive?'s':'w');
 await focus();await page.keyboard.down(key);
 try{await page.waitForFunction(({axis,target,positive})=>{const o=window.__TIANGONG_OBSERVE__();if(o.phase==='error')throw Error(o.error);const s=JSON.parse(o.player);return positive?s.position[axis]>=target:s.position[axis]<=target;},{axis,target,positive},{timeout:120000});}finally{await page.keyboard.up(key);}
}
async function land(){await focus();await page.keyboard.down('Control');try{await page.waitForFunction(()=>JSON.parse(window.__TIANGONG_OBSERVE__().player).mode==='grounded',null,{timeout:60000});}finally{await page.keyboard.up('Control');}await ticks(3);}
function save(){writeJson(path.join(output,'results.json'),{runId:context.runId,candidate:context.candidate,browser:browser?.version(),functionalViewport:{width:640,height:480},captureViewport:{width:1280,height:720},defaultFlightSpeed:10,results,checkpoints,clouds,captures,errors,external,network});}
try{
 server=await preview({root,configFile:path.join(root,'vite.config.mjs'),preview:{host:'127.0.0.1',port:0}});
 const base=`http://127.0.0.1:${server.httpServer.address().port}`;
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 session=await browser.newContext({viewport:{width:640,height:480},deviceScaleFactor:1});
 await session.route(/^https?:\/\//,route=>{if(new URL(route.request().url()).origin!==base){external.push(route.request().url());return route.abort();}return route.continue();});
 page=await session.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>network.push({path:new URL(r.url()).pathname,status:r.status()}));
 await page.goto(base);await page.waitForFunction(()=>['ready','error'].includes(window.__TIANGONG_OBSERVE__?.().phase),null,{timeout:60000});assert.equal((await observe()).phase,'ready',(await observe()).error);assert.equal((await observe()).fixture,'p06-journey');await ticks(40);
 await look(.8,-.12);await mark('jiangnan-bank');await capture('01-jiangnan');await look(0,-.20);
 await move('z',272);await move('x',0);assert.equal((await state()).supportId,'jiangnan-bridge');await mark('stone-bridge');await capture('02-bridge');
 await page.keyboard.press('f');await move('y',70);
 for(const [height,expected]of [[70,'below'],[100,'inside'],[130,'above']]){
  if(height!==70)await move('y',height);await look(0,.08);
  for(const perspective of ['third','first']){
   if((await observe()).perspective!==perspective){await focus();await page.keyboard.press('v');await ticks(2);}
   const o=await mark(`cloud-${expected}-${perspective}`),cloud=JSON.parse(o.journey);assert.equal(cloud.cameraCloudBand,expected);assert(o.activeMeshes>=3&&o.glError===0);if(expected==='inside')assert(cloud.cloudOpacity<.1,'Cloud surface did not fade near the camera');clouds.push({height,perspective,cloud,capture:await capture(`03-cloud-${expected}-${perspective}`)});
  }
 }
 await page.keyboard.press('v');await look(0,-.22);await move('y',143);await move('z',54);await land();assert.equal((await state()).supportId,'palace-terrace');await mark('palace-terrace');await look(0,.35);await capture('04-palace-entrance');await look(0,-.15);
 await move('z',0);assert(JSON.parse((await observe()).journey).location.includes('室内'));await mark('palace-interior');await look(0,.20);await capture('05-interior');
 // Leave the same hall along a different lane; the physical matrix separately tests both entry lanes.
 await look(0,-.15);await move('x',8);await move('z',54);await mark('interior-offset-exit');
 await page.keyboard.press('f');await move('y',285);await move('x',15);await move('z',0);await land();assert.match((await state()).supportId,/^palace-roof-/);await mark('palace-roof');await look(.8,-.35);await capture('06-roof');
 const roof=(await state()).position;await ticks(40);assert(Math.hypot(...Object.values((await state()).position).map((v,i)=>v-Object.values(roof)[i]))<.005);await focus();await page.keyboard.press('v');await ticks(2);await capture('07-roof-first');
 await page.keyboard.press('f');await move('y',285);await mark('roof-departure');await look(Math.PI,-.48);await capture('08-return-view');
 assert.deepEqual(errors,[]);assert.equal(external.length,0);assert(network.every(r=>r.status<400));
 results.push({id:'P06-01',status:'PASS',executed:8,details:['Default production configuration, 10 m/s; one continuous player, real keyboard/pointer input; no reload or state injection.']},{id:'P06-02',status:'PASS',executed:4,details:['Central indoor entry and offset exit, actual roof landing, stable support and takeoff; both entry lanes also run in the physics matrix.']},{id:'P06-03',status:'PASS',executed:6,details:['Below/inside/above cloud with both perspectives, actual rendered captures; user review remains separate.']});save();
}catch(error){results.push({id:'P06-browser-error',status:'FAIL',executed:1,error:error.stack});save();throw error;}
finally{await session?.close();await browser?.close();if(server)await new Promise(resolve=>server.httpServer.close(resolve));}
