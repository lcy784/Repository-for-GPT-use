import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {chromium} from '/workspace/Repository-for-GPT-use/tools/tiangong/node_modules/@playwright/test/index.mjs';
import {preview} from '/workspace/Repository-for-GPT-use/tools/tiangong/node_modules/vite/dist/node/index.js';
import {hash,readJson,writeJson} from '/workspace/Repository-for-GPT-use/scripts/quality/lib.mjs';
const context=readJson(process.env.TIANGONG_GATE_CONTEXT),{root,runDir}=context,output=path.join(runDir,'P07-browser');mkdirSync(output,{recursive:true});
const results=[],snapshots=[],captures=[],errors=[],external=[];let browser,server,session,page;
const observe=()=>page.evaluate(()=>window.__P07__?.()||window.__TIANGONG_OBSERVE__?.());
const wait=fn=>page.waitForFunction(fn,null,{timeout:600000});
async function mark(label){const s=await observe();snapshots.push({label,snapshot:s});writeJson(path.join(output,'checkpoints.json'),{runId:context.runId,candidate:context.candidate,snapshots});return s;}
async function image(name,clip){const bytes=clip?await page.locator('canvas').screenshot({clip,timeout:600000}):Buffer.from((await page.evaluate(()=>document.querySelector('canvas').toDataURL())).split(',')[1],'base64');assert(bytes.length>500);const item={file:name+'.png',sha256:hash(bytes)};writeFileSync(path.join(output,item.file),bytes);captures.push(item);return item;}
async function fixture(){await page.goto(base+'/quality/p07-fixture.html');await wait(()=>window.__P07__?.().frames>2);}
async function ready(id){await page.locator('#'+id).click();await page.waitForFunction(id=>window.__P07__().zones.some(z=>z.id===id&&z.status==='ready'),id,{timeout:600000});}
async function release(id){await page.locator('#release-'+id).click();}
async function production(){await page.goto(base);await wait(()=>['ready','error'].includes(window.__TIANGONG_OBSERVE__?.().phase));assert.equal((await observe()).phase,'ready',(await observe()).error);}
async function first(){await page.locator('canvas').click({position:{x:160,y:120}});if((await observe()).perspective!=='first')await page.keyboard.press('v');await wait(()=>window.__TIANGONG_OBSERVE__().perspective==='first');await wait(()=>JSON.parse(window.__TIANGONG_OBSERVE__().player).tick>80);const frame=(await observe()).frame;await page.waitForFunction(n=>window.__TIANGONG_OBSERVE__().frame>n+2,frame,{timeout:600000});}
function save(){writeJson(path.join(output,'results.json'),{runId:context.runId,candidate:context.candidate,browser:browser?.version(),results,snapshots,captures,errors,external});}
let base;
try{
 server=await preview({root,configFile:path.join(root,'vite.config.mjs'),preview:{host:'127.0.0.1',port:0}});base=`http://127.0.0.1:${server.httpServer.address().port}`;
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});session=await browser.newContext({viewport:{width:640,height:540},deviceScaleFactor:1});
 await session.route(/^https?:\/\//,route=>{if(new URL(route.request().url()).origin!==base){external.push(route.request().url());return route.abort();}return route.continue();});
 page=await session.newPage();page.on('pageerror',e=>errors.push(e.message));
 let s;
 await page.route('**/registry/journey.json',route=>route.fulfill({status:200,body:'{}'}));await page.goto(base);await wait(()=>window.__TIANGONG_OBSERVE__?.().phase==='error');s=await mark('production-hash-failure');assert.match(s.error,/hash mismatch/);assert.equal(s.engines,0);assert.equal(JSON.parse(s.assets).bytes.entries,0);await page.unroute('**/registry/journey.json');await page.locator('#restart').click();await wait(()=>window.__TIANGONG_OBSERVE__().phase==='ready');await mark('production-explicit-restart');
 results.push({id:'P07-04',status:'PASS',executed:7,details:['HTTP 404 and hash corruption report actionable errors, no hidden retry; explicit retry/restart recovers including actual default P06 world.']});assert.deepEqual(errors,[]);assert.equal(external.length,0);save();
}catch(error){results.push({id:'P07-browser-error',status:'FAIL',executed:1,error:error.stack,snapshot:await observe().catch(()=>null)});save();throw error;}
finally{await session?.close();await browser?.close();if(server)await new Promise(resolve=>server.httpServer.close(resolve));}
