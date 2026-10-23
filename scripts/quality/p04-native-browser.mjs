import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {chromium} from '../../tools/tiangong/node_modules/@playwright/test/index.mjs';

/** Own Chromium tabs without Playwright's forced-focus defaults. Visibility stays native. */
export async function nativeBrowser(root){
 const executable=process.env.XVFB_PATH||(existsSync('/usr/bin/Xvfb')?'/usr/bin/Xvfb':path.join(root,'.cloud-tools/xvfb/usr/bin/Xvfb'));
 assert(existsSync(executable),'Xvfb is required for real P04 tab visibility');
 const display=spawn(executable,['-displayfd','3','-screen','0','1920x1080x24','-nolisten','tcp','-ac'],{stdio:['ignore','ignore','pipe','pipe']});
 let chrome,browser;const profile=mkdtempSync(path.join(tmpdir(),'tiangong-p04-native-'));
 const close=async()=>{await browser?.close().catch(()=>{});if(chrome&&chrome.exitCode===null){const exited=new Promise(resolve=>chrome.once('exit',resolve));chrome.kill('SIGTERM');await exited;}display.kill('SIGTERM');rmSync(profile,{recursive:true,force:true});};
 try{
  const name=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Xvfb startup timeout')),10000);display.once('error',reject);display.stdio[3].once('data',data=>{clearTimeout(timer);resolve(`:${String(data).trim()}`);});});
  chrome=spawn(process.env.CHROMIUM_PATH||'/usr/bin/chromium',['--no-sandbox','--no-first-run','--no-default-browser-check','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],{env:{...process.env,DISPLAY:name},stdio:['ignore','ignore','pipe']});
  const endpoint=await new Promise((resolve,reject)=>{let diagnostics='';const timer=setTimeout(()=>reject(new Error('Native Chromium startup timeout')),10000);chrome.once('error',reject);chrome.stderr.on('data',data=>{diagnostics=(diagnostics+data).slice(-20000);const match=diagnostics.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});});
  browser=await chromium.connectOverCDP(endpoint,{noDefaults:true});
  return {session:browser.contexts()[0],close};
 }catch(error){await close();throw error;}
}
