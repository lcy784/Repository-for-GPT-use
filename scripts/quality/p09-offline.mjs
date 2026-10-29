import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,copyFileSync} from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {chromium} from '../../tools/tiangong/node_modules/@playwright/test/index.mjs';
import {hash,writeJson} from './lib.mjs';
export async function checkCopies(file,output){
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const copies=[],fileChecks=[];
 let activeFile=file;
 const server=createServer((req,res)=>{if(req.url!=='/artifact.html'){res.writeHead(404);res.end();return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(readFileSync(activeFile));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const httpURL=`http://127.0.0.1:${server.address().port}/artifact.html`;
 try{for(const dir of ['中文 空格目录','copied ordinary folder']){
  const folder=path.join(output,dir);mkdirSync(folder,{recursive:true});const copy=path.join(folder,'天宫 A.html');copyFileSync(file,copy);assert.equal(hash(readFileSync(copy)),hash(readFileSync(file)));
  activeFile=copy;
  const probe=await browser.newContext({offline:true,serviceWorkers:'block'});try{const page=await probe.newPage();await page.goto(pathToFileURL(copy).href);fileChecks.push({path:copy,status:'PASS'});}catch(error){if(!error.message.includes('ERR_BLOCKED_BY_ADMINISTRATOR'))throw error;fileChecks.push({path:copy,status:'BLOCKED',reason:'Managed Chromium URL policy rejects file:// navigation',error:error.message});}finally{await probe.close();}
  const session=await browser.newContext({offline:fileChecks.at(-1).status==='PASS',serviceWorkers:'block',viewport:{width:640,height:480}}),requests=[],errors=[];
  try{
   await session.route(/^https?:\/\//,r=>{if(r.request().url()===httpURL)return r.continue();requests.push(r.request().url());return r.abort();});
   const page=await session.newPage(),url=fileChecks.at(-1).status==='PASS'?pathToFileURL(copy).href:httpURL;page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(r.url()!==url&&!/^(data:|blob:)/.test(r.url()))requests.push(r.url());});
   const cdp=await session.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.clearBrowserCache');await page.goto(url);
   await page.waitForFunction(()=>['ready','error'].includes(window.__TIANGONG_OBSERVE__?.().phase),null,{timeout:180000});
   const observe=()=>page.evaluate(()=>window.__TIANGONG_OBSERVE__());let s=await observe();assert.equal(s.phase,'ready',s.error);assert.equal(s.fixture,'p06-journey');
   await page.locator('canvas').click({position:{x:430,y:180},noWaitAfter:true});const t=JSON.parse(s.player).tick;
   await page.keyboard.down('w');try{await page.waitForFunction(t=>JSON.parse(window.__TIANGONG_OBSERVE__().player).tick>t+30,t,{timeout:120000});}finally{await page.keyboard.up('w');}
   let next=await observe();assert(JSON.parse(next.player).position.z<JSON.parse(s.player).position.z-.2);
   await page.keyboard.press('v');await page.waitForFunction(p=>window.__TIANGONG_OBSERVE__().perspective!==p,s.perspective);assert.notEqual((await observe()).perspective,s.perspective);
   const pixels=await page.evaluate(()=>{const c=document.querySelector('canvas'),gl=c.getContext('webgl2'),p=new Uint8Array(c.width*c.height*4);gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,p);const colors=new Set();for(let i=0;i<p.length;i+=16)colors.add(p[i]+','+p[i+1]+','+p[i+2]);return colors.size;});assert(pixels>50,'Actual rendered image is blank');
   const png=await page.locator('canvas').screenshot();const image=path.join(folder,'render.png');await import('node:fs').then(fs=>fs.writeFileSync(image,png));
   await page.locator('#stop').click({noWaitAfter:true});s=await observe();assert.equal(s.phase,'disposed');assert.equal(s.engines,0);assert.equal(s.controllers,0);assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
   copies.push({path:copy,sha256:hash(readFileSync(copy)),image:path.relative(output,image),imageSha256:hash(png),pixelColors:pixels,requests,errors,disposed:s});
  }finally{await session.close();}
 }}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
 writeJson(path.join(output,'copies.json'),{browser:browser.version(),networkMode:fileChecks.every(t=>t.status==='PASS')?'offline file protocol':'all non-loopback requests blocked; cold local HTTP diagnostic',fileChecks,serviceWorkers:'block',freshContextPerCopy:true,copies});return {copies,fileChecks};
}
