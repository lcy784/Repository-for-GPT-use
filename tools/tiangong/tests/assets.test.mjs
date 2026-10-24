import {describe,it,expect} from 'vitest';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {ResourcePool} from '../../../src/assets/pool.ts';
import {AssetScope,EmbeddedAssets,HttpAssets,digest} from '../../../src/assets/access.ts';
import {validateRegistry,localPath} from '../../../src/assets/schema.mjs';
import {evaluateJourneyReview} from '../../../scripts/quality/p06-review.mjs';
import {verifyAssets} from '../../../scripts/quality/p07-contracts.mjs';
import {journeyTerrain} from '../../../src/game/journey.ts';
import {NullEngine} from '../../../node_modules/@babylonjs/core/Engines/nullEngine.js';
import {Scene} from '../../../node_modules/@babylonjs/core/scene.js';
import {RawTexture} from '../../../node_modules/@babylonjs/core/Materials/Textures/rawTexture.js';
import {StandardMaterial} from '../../../node_modules/@babylonjs/core/Materials/standardMaterial.js';
import {CreateBox} from '../../../node_modules/@babylonjs/core/Meshes/Builders/boxBuilder.js';
import {ownScene} from '../../../src/assets/scene-owner.ts';
const registry=()=>JSON.parse(readFileSync('public/registry/p07.json','utf8'));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const drain=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const data=new TextEncoder().encode('actual-test-payload');
describe('P07-01: qualified assets and build failures',()=>{
 it('verifies all current assets, sources and exact generated collision shapes',()=>{expect(verifyAssets(process.cwd()).assets).toBe(6);expect(JSON.parse(readFileSync('public/registry/collisions.json')).shapes).toEqual(journeyTerrain());});
 it('bounds continued development to the explicit instruction and preserved P06 artwork',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'p07-continuation-')),file='quality/visual-acceptance/P06-CONTINUED-DEVELOPMENT.json',record=JSON.parse(readFileSync(file));
  try{for(const name of [file,record.priorRequest,...record.preservedInputs.map(i=>i.path)]){mkdirSync(path.dirname(path.join(dir,name)),{recursive:true});writeFileSync(path.join(dir,name),readFileSync(name));}expect(evaluateJourneyReview(dir,{})).toMatchObject({status:'PASS',authorization:'continued-development-only',artisticAcceptance:'not-independently-confirmed'});record.source.quote='automatic approval';writeFileSync(path.join(dir,file),JSON.stringify(record));expect(()=>evaluateJourneyReview(dir,{})).toThrow();record.source.quote='执行p07开发';writeFileSync(path.join(dir,file),JSON.stringify(record));writeFileSync(path.join(dir,record.preservedInputs[0].path),'modified art');expect(()=>evaluateJourneyReview(dir,{})).toThrow('changed artwork');}finally{rmSync(dir,{recursive:true,force:true});}
 });
 it.each(['missing-id','duplicate','dependency','cycle','collision-ref','hash'])('rejects %s in asset contracts',kind=>{const r=registry();if(kind==='missing-id')delete r.assets[0].id;if(kind==='duplicate')r.assets[1].id=r.assets[0].id;if(kind==='dependency')r.assets[0].dependencies=['absent'];if(kind==='cycle')r.assets[0].dependencies=[r.assets[0].id];if(kind==='collision-ref')r.assets[4].collisionRef='traveler.model';if(kind==='hash')r.assets[0].sha256='invalid';expect(()=>validateRegistry(r)).toThrow();});
 it.each(['/abs','https://cdn.test/a','../a','a/../../b','a\\b','a/%2e%2e/b','a?x=1','C:/assets','a//b'])('rejects external or unsafe asset path %s',uri=>expect(()=>localPath(uri)).toThrow());
 it('blocks the build for a changed runtime file and a changed author source',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'p07-build-'));
  try{const r=registry();mkdirSync(path.join(dir,'public/registry'),{recursive:true});for(const a of r.assets){const f=path.join(dir,'public',a.uri);mkdirSync(path.dirname(f),{recursive:true});writeFileSync(f,readFileSync('public/'+a.uri));for(const s of a.source.files){const f=path.join(dir,s.path);mkdirSync(path.dirname(f),{recursive:true});writeFileSync(f,readFileSync(s.path));}}writeFileSync(path.join(dir,'public/registry/p07.json'),JSON.stringify(r));const target=path.join(dir,'public',r.assets[0].uri);writeFileSync(target,'changed');expect(()=>verifyAssets(dir)).toThrow('hash mismatch');writeFileSync(target,readFileSync('public/'+r.assets[0].uri));writeFileSync(path.join(dir,r.assets[0].source.files[0].path),'changed');expect(()=>verifyAssets(dir)).toThrow('source changed');}finally{rmSync(dir,{recursive:true,force:true});}
 });
});
describe('P07-02: sharing, separate ownership and release',()=>{
 it('deduplicates simultaneous loads and keeps the shared value alive until the last release',async()=>{
  const p=new ResourcePool(),d=deferred();let loads=0,disposed=0;const load=async()=>{loads++;await d.promise;return {value:{texture:1},dispose:()=>disposed++};};const a=p.acquire('shared',load),b=p.acquire('shared',load);d.resolve();expect(await a.ready).toBe(await b.ready);expect(loads).toBe(1);a.release();a.release();expect(disposed).toBe(0);expect(p.observe().references).toBe(1);b.release();expect(disposed).toBe(1);expect(p.observe().entries).toBe(0);p.dispose();
 });
 it('shares a real Babylon texture between two independently owned meshes',async()=>{
  const engine=new NullEngine(),scene=new Scene(engine),pool=new ResourcePool();let created=0;
  const load=async()=>{created++;const t=RawTexture.CreateRGBATexture(new Uint8Array([255,80,20,255]),1,1,scene);return {value:t,dispose:()=>t.dispose()};};const a=pool.acquire('texture',load),b=pool.acquire('texture',load),texture=await a.ready;
  const first=CreateBox('zone-a',{},scene),second=CreateBox('zone-b',{},scene),ma=new StandardMaterial('a',scene),mb=new StandardMaterial('b',scene);ma.diffuseTexture=texture;mb.diffuseTexture=await b.ready;first.material=ma;second.material=mb;expect(created).toBe(1);first.dispose();ma.dispose();a.release();expect(scene.textures.includes(mb.diffuseTexture)).toBe(true);second.dispose();mb.dispose();b.release();expect(scene.textures.length).toBe(0);pool.dispose();scene.dispose();engine.dispose();
 });
 it('returns real scene-owned resources to baseline after ten factory load/release cycles, including partial failure',()=>{
  const engine=new NullEngine(),scene=new Scene(engine);const counts=()=>[scene.meshes.length,scene.materials.length,scene.textures.length,scene.lights.length,scene.transformNodes.length];const baseline=counts();
  for(let i=0;i<10;i++){const owned=ownScene(scene,()=>{const mesh=CreateBox('sample',{},scene);mesh.material=new StandardMaterial('sample-material',scene);return mesh;});expect(scene.meshes.length).toBe(1);owned.dispose();owned.dispose();expect(counts()).toEqual(baseline);}expect(()=>ownScene(scene,()=>{CreateBox('partial',{},scene);new StandardMaterial('partial',scene);throw Error('factory failed');})).toThrow();expect(counts()).toEqual(baseline);scene.dispose();engine.dispose();
 });
});
describe('P07-03: cancellation and generation races',()=>{
 it('cancels one consumer without cancelling another sharing the same request',async()=>{const p=new ResourcePool(),d=deferred();let aborted=false;const load=async signal=>{signal.addEventListener('abort',()=>aborted=true);await d.promise;return {value:1,dispose(){}};};const a=p.acquire('x',load),b=p.acquire('x',load);a.release();await expect(a.ready).rejects.toMatchObject({name:'AbortError'});expect(aborted).toBe(false);d.resolve();expect(await b.ready).toBe(1);b.release();expect(aborted).toBe(true);p.dispose();});
 it('disposes late resources and never replaces a newer generation',async()=>{
  const p=new ResourcePool(),d=deferred();let discarded=0;const old=p.acquire('x',async()=>{await d.promise;return {value:'old',dispose:()=>discarded++};});await drain();old.release();const next=p.acquire('x',async()=>({value:'new',dispose(){}}));expect(await next.ready).toBe('new');d.resolve();await drain();expect(discarded).toBe(1);const shared=p.acquire('x',async()=>{throw Error('unexpected load');});expect(await shared.ready).toBe('new');expect(p.observe().lateDisposed).toBe(1);next.release();shared.release();p.dispose();
 });
 it('releases dependency leases immediately when a parent is cancelled during a delayed read',async()=>{
  const r=registry(),d=deferred();r.assets=[{...r.assets[0],id:'child.asset',uri:'child.bin',dependencies:[],sha256:await digest(data)},{...r.assets[0],id:'parent.asset',uri:'parent.bin',dependencies:['child.asset'],sha256:await digest(data)}];let childAborted=false;
  const scope=new AssetScope(r,{read:async(uri,signal)=>{if(uri==='child.bin'){signal.addEventListener('abort',()=>childAborted=true);await d.promise;}return data;}}),l=scope.acquire('parent.asset');await drain();l.release();await expect(l.ready).rejects.toMatchObject({name:'AbortError'});expect(childAborted).toBe(true);expect(scope.observe().bytes.references).toBe(0);d.resolve();await drain();scope.dispose();expect(scope.observe().bytes.entries).toBe(0);
 });
 it('rejects pending leases immediately on shutdown and disposes unavoidable late decodes',async()=>{const p=new ResourcePool(),d=deferred();let disposed=0;const a=p.acquire('x',async()=>{await d.promise;return {value:1,dispose:()=>disposed++};});await drain();p.dispose();await expect(a.ready).rejects.toMatchObject({name:'AbortError'});d.resolve();await drain();expect(disposed).toBe(1);expect(p.observe().loading).toBe(0);expect(()=>p.acquire('x',async()=>({value:1,dispose(){}}))).toThrow('disposed');});
});
describe('P07-04: readable failures and explicit retry',()=>{
 it('exposes read failure, performs no automatic retry and allows a fresh request',async()=>{const p=new ResourcePool();let calls=0;const bad=p.acquire('x',async()=>{calls++;throw Error('HTTP 404');});await expect(bad.ready).rejects.toThrow('404');expect(calls).toBe(1);const good=p.acquire('x',async()=>({value:2,dispose(){}}));expect(await good.ready).toBe(2);bad.release();good.release();expect(p.observe().references).toBe(0);p.dispose();});
 it('validates embedded bytes and rejects tampering rather than accepting a ready flag',async()=>{const r=registry();r.assets=[{...r.assets[0],id:'test.asset',uri:'embedded.bin',dependencies:[],sha256:await digest(data)}];const scope=new AssetScope(r,new EmbeddedAssets(new Map([['embedded.bin',data]])));const a=scope.acquire('test.asset'),b=scope.acquire('test.asset');expect(await a.ready).toBe(await b.ready);a.release();b.release();scope.dispose();const bad=new AssetScope(r,new EmbeddedAssets(new Map([['embedded.bin',new Uint8Array([1])]])));const l=bad.acquire('test.asset');await expect(l.ready).rejects.toThrow('hash mismatch');l.release();bad.dispose();});
 it('requires a real embedded item and honors cancellation',async()=>{const access=new EmbeddedAssets(new Map()),controller=new AbortController();await expect(access.read('missing',controller.signal)).rejects.toThrow('missing');controller.abort();await expect(access.read('missing',controller.signal)).rejects.toMatchObject({name:'AbortError'});});
 it('rejects unsafe HTTP paths before any request is attempted',async()=>{const access=new HttpAssets(new URL('http://127.0.0.1/site/'));await expect(access.read('../escape',new AbortController().signal)).rejects.toThrow();});
});
