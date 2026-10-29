import {describe,it,expect,afterAll} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {ZoneScheduler} from '../../../src/streaming/scheduler.ts';
import {validateWorld,contains} from '../../../src/streaming/zones.ts';
import {GroundSession,idleIntent} from '../../../src/game/session.ts';
import {AssetScope,EmbeddedAssets} from '../../../src/assets/access.ts';
import {journeyTerrain} from '../../../src/game/journey.ts';
const world=JSON.parse(readFileSync('public/streaming/world.json')),registry=JSON.parse(readFileSync('public/streaming/registry.json'));
const forward={x:0,y:0,z:-1},zero={x:0,y:0,z:0},records=[];
const files=new Map(registry.assets.map(a=>[a.uri,new Uint8Array(readFileSync('public/'+a.uri))]));
const flush=()=>new Promise(r=>setTimeout(r,0));
async function system(spawn={x:-18,y:.91,z:282},speed=60,access=new EmbeddedAssets(files)){
 let scheduler;const session=await GroundSession.create('journey',spawn,{flight:true,flightSpeed:speed,shapes:[],canMove:(a,b)=>scheduler.permits(a,b)}),scope=new AssetScope(registry,access),active=new Map();
 scheduler=new ZoneScheduler(world,z=>{const l=scope.acquire(z.assetId);return {ready:l.ready.then(b=>JSON.parse(new TextDecoder().decode(b)).shapes),release:l.release};},(z,shapes)=>{const h=session.addCollisions(shapes);active.set(z.id,shapes);return {value:shapes,dispose(){active.delete(z.id);h.dispose();}};},(z,id)=>active.get(z.id)?.some(s=>s.id===id));
 const update=()=>{const s=session.snapshot;scheduler.update(s.position,s.velocity,forward,s.supportId);};
 const step=(v=zero,flightRequest=null)=>{update();session.step({...idleIntent(session.snapshot.tick),movement:v,flightRequest});expect(session.observe().penetration).toBeLessThan(.01);};
 const settle=async()=>{for(let i=0;i<25;i++){update();await flush();}expect(scheduler.permits(session.snapshot.position,session.snapshot.position)).toBe(true);};
 const move=async(axis,target)=>{const sign=Math.sign(target-session.snapshot.position[axis]);for(let i=0;i<16000&&sign*(target-session.snapshot.position[axis])>.08;i++){step({...zero,[axis]:sign*Math.min(1,Math.abs(target-session.snapshot.position[axis])/(session.snapshot.mode==='flying'?speed/60:3/60))});if(i%5===0)await flush();}expect(Math.abs(session.snapshot.position[axis]-target)).toBeLessThan(.2);};
 const mark=label=>records.push({label,state:session.snapshot,physics:session.observe(),streaming:scheduler.observe(),assets:scope.observe()});
 const dispose=()=>{scheduler.dispose();expect(scope.observe().bytes.references).toBe(0);scope.dispose();session.dispose();};
 return {session,scheduler,scope,step,update,settle,move,mark,dispose,active};
}
afterAll(()=>{if(process.env.TIANGONG_GATE_CONTEXT){const c=JSON.parse(readFileSync(process.env.TIANGONG_GATE_CONTEXT));writeFileSync(path.join(c.runDir,'P08-physics-observations.json'),JSON.stringify({runId:c.runId,candidate:c.candidate,records},null,2)+'\n');}});
describe('P08-01: qualified spatial handoff',()=>{
 it('partitions all 253 original colliders exactly and rejects bad geometry bounds',()=>{expect(validateWorld(world).zones.length).toBe(60);const known=new Map(journeyTerrain().map(s=>[s.id,s]));const seen=new Set();for(const z of world.zones){const data=JSON.parse(new TextDecoder().decode(files.get(registry.assets.find(a=>a.id===z.assetId).uri)));for(const s of data.shapes){expect(s).toEqual(known.get(s.id));seen.add(s.id);}}expect(seen.size).toBe(253);expect(()=>validateWorld({...world,zones:[...world.zones,world.zones[0]]})).toThrow();expect(()=>validateWorld({...world,zones:[{...world.zones[0],min:world.zones[0].max}]})).toThrow();expect(()=>validateWorld({...world,prefetch:NaN})).toThrow();expect(()=>validateWorld({...world,zones:world.zones.slice(1)})).toThrow('gaps');});
 it.each([10,60])('crosses horizontal/vertical/indoor/roof cells on real Rapier at %i m/s',async speed=>{
 const t=await system(undefined,speed);try{await t.settle();for(let i=0;i<40;i++)t.step();await t.move('z',272);await t.move('x',0);t.mark('bridge-'+speed);t.step(zero,'start');await t.move('y',142);t.mark('vertical-'+speed);await t.move('z',54);await t.move('y',138.9);for(let i=0;i<8;i++)t.step();expect(t.session.snapshot.supportId).toBe('palace-terrace');await t.move('z',0);t.mark('interior-'+speed);await t.move('z',54);t.step(zero,'start');await t.move('y',285);await t.move('x',15);await t.move('z',0);for(let i=0;i<600&&t.session.snapshot.mode!=='grounded';i++){t.step({x:0,y:-1,z:0});if(i%5===0)await flush();}expect(t.session.snapshot.supportId).toMatch(/^palace-roof-/);expect(t.session.observe().recoveryCount).toBe(0);t.mark('roof-'+speed);expect(t.scheduler.observe().maxLoading).toBeLessThanOrEqual(2);}finally{t.dispose();}
 },30000);
});
describe('P08-02: slow and rejected loads preserve support',()=>{
 it('holds at an unloaded boundary, reports error once and continues after explicit retry',async()=>{
 let deny=true,calls=0;const normal=new EmbeddedAssets(files),t=await system({x:-18,y:.91,z:260},60,{read:async(uri,signal)=>{if(uri.includes('cell-1-0-3')){calls++;if(deny)throw Error('HTTP 503 delayed region');}return normal.read(uri,signal);}});
 try{for(let i=0;i<120;i++){t.step({x:0,y:0,z:-1});await flush();}const before=t.session.snapshot;expect(before.position.z).toBeGreaterThan(256);expect(t.scheduler.observe().zones.some(z=>z.state==='error')).toBe(true);const attempts=calls;for(let i=0;i<30;i++){t.step({x:0,y:0,z:-1});await flush();}expect(calls).toBe(attempts);expect(t.session.snapshot.position).toEqual(before.position);t.mark('failed-boundary-held');deny=false;t.scheduler.retry();await t.settle();await t.move('z',250);expect(t.session.observe().recoveryCount).toBe(0);t.mark('retry-crossed');}finally{t.dispose();}
 });
 it('pins an old supporting cell through a look-away and never exposes a partially prepared cell',async()=>{const t=await system();try{await t.settle();for(let i=0;i<40;i++)t.step();const id=t.session.snapshot.supportId;expect(id).not.toBeNull();const held=t.scheduler.observe().ready.filter(z=>t.active.get(z).some(s=>s.id===id));t.scheduler.update({x:800,y:600,z:800},zero,forward,id);expect(held.every(z=>t.scheduler.observe().ready.includes(z))).toBe(true);expect(t.session.hasCollision(id)).toBe(true);t.mark('support-pinned');}finally{t.dispose();}});
});
describe('P08-03: reversal and late generations',()=>{
 it('does not adopt a cancelled old result after a fast reversal',async()=>{let finish;const pending=new Promise(r=>finish=r),adopted=[];const small={...world,prefetch:2,retention:3,lookAheadSeconds:0,zones:[{id:'a',assetId:'a',min:[0,0,0],max:[10,10,10]},{id:'b',assetId:'b',min:[10,0,0],max:[20,10,10]}]};const s=new ZoneScheduler(small,z=>({ready:z.id==='b'?pending:Promise.resolve(z.id),release(){}}),(z,d)=>{adopted.push(d);return {value:d,dispose(){}};},()=>false);s.update({x:15,y:5,z:5},zero,zero,null);s.update({x:5,y:5,z:5},zero,zero,null);finish('obsolete-b');await flush();s.update({x:5,y:5,z:5},zero,zero,null);expect(adopted).toEqual(['a']);expect(s.observe().ready).toEqual(['a']);expect(s.observe().maxLoading).toBeLessThanOrEqual(2);s.dispose();expect(s.observe().zones).toEqual([]);});
 it('adopts at most one prepared zone per frame and rejects out-of-world travel',async()=>{const t=await system({x:34,y:23,z:255});try{await flush();t.update();await flush();t.update();await flush();for(let i=0;i<12;i++){t.update();expect(t.scheduler.observe().activations).toBeLessThanOrEqual(1);await flush();}expect(t.scheduler.permits(t.session.snapshot.position,{x:9999,y:1,z:1})).toBe(false);}finally{t.dispose();}});
});
describe('P08-04: warmed round trips and release',()=>{
 it('crosses cells ten times with stable physical/byte ownership, then releases everything',async()=>{const t=await system({x:-18,y:.91,z:282});try{await t.settle();for(let i=0;i<40;i++)t.step();await t.move('z',230);await t.move('z',282);await t.settle();const counts=[];for(let i=0;i<10;i++){await t.move('z',230);await t.move('z',282);await t.settle();counts.push([t.session.observe().colliders,t.scope.observe().bytes.entries,t.scheduler.observe().ready.length]);t.mark('round-trip-'+i);}expect(counts.every(c=>JSON.stringify(c)===JSON.stringify(counts[0]))).toBe(true);expect(t.session.observe().recoveryCount).toBe(0);}finally{t.dispose();}expect(GroundSession.instances).toBe(0);},30000);
});
