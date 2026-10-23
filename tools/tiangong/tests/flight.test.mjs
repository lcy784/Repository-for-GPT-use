import {describe,it,expect,afterEach,afterAll} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {GroundSession,idleIntent,FLIGHT} from '../../../src/game/session.ts';
import {FixedClock} from '../../../src/runtime/clock.ts';
const sessions=[],observations=[];
async function session(x=-12,y=.91,z=8,kind='fixture',speed=10){const s=await GroundSession.create(kind,{x,y,z},{flight:true,flightSpeed:speed});sessions.push(s);return s;}
const command=(s,movement={x:0,y:0,z:0},flightRequest=null)=>s.step({...idleIntent(s.snapshot.tick),movement,flightRequest});
function advance(s,count,movement={x:0,y:0,z:0}){let penetration=0;for(let i=0;i<count;i++){command(s,movement);penetration=Math.max(penetration,s.observe().penetration);}return penetration;}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
afterEach(()=>{observations.push({test:expect.getState().currentTestName,sessions:sessions.map(s=>({state:s.snapshot,physics:s.observe(),events:s.events}))});for(const s of sessions.splice(0))s.dispose();expect(GroundSession.instances).toBe(0);});
afterAll(()=>{if(process.env.TIANGONG_GATE_CONTEXT){const c=JSON.parse(readFileSync(process.env.TIANGONG_GATE_CONTEXT,'utf8'));writeFileSync(path.join(c.runDir,'P04-physics-observations.json'),JSON.stringify({runId:c.runId,candidate:c.candidate,observations},null,2)+'\n');}});
describe('P04-01: transitions and recovery',()=>{
 it('does not emit takeoff while a start-and-descent command stays on the ground',async()=>{
  const s=await session();advance(s,60);const before=s.events.length;
  command(s,{x:0,y:-1,z:0},'start');expect(s.snapshot.mode).toBe('grounded');expect(s.events.length).toBe(before);
  const y=s.snapshot.position.y;advance(s,60,{x:0,y:1,z:0});expect(s.snapshot.mode).toBe('grounded');expect(s.snapshot.position.y).toBeCloseTo(y,3);
 });
 it('repeats takeoff, gravity fall and supported landing ten times',async()=>{
  const s=await session();advance(s,60);
  for(let i=0;i<10;i++){
   command(s,{x:0,y:0,z:0},'start');expect(s.snapshot.mode).toBe('flying');
   advance(s,60,{x:0,y:1,z:0});expect(s.snapshot.position.y).toBeGreaterThan(10.8);
   const hover=s.snapshot.position;advance(s,60);expect(distance(hover,s.snapshot.position)).toBeLessThan(.001);
   command(s,{x:0,y:0,z:0},'stop');expect(s.snapshot.mode).toBe('falling');expect(s.snapshot.velocity.y).toBeLessThan(0);
   advance(s,160);expect(s.snapshot.mode).toBe('grounded');expect(s.snapshot.supportId).toBe('flight-ground');
  }
  expect(s.events.filter(e=>e.kind==='takeoff').length).toBe(10);
  expect(s.events.filter(e=>e.kind==='flight-stopped').length).toBe(10);
  expect(s.events.filter(e=>e.kind==='landed').length).toBe(11);
  expect(Object.isFrozen(s.events)&&Object.isFrozen(s.events[0])&&Object.isFrozen(s.events[0].position)).toBe(true);
 });
 it('normalizes three-axis motion to the configured speed and hovers without drift',async()=>{
  const s=await session(-30,20,8);command(s,{x:0,y:0,z:0},'start');const before=s.snapshot.position;
  advance(s,60,{x:1,y:1,z:1});expect(distance(before,s.snapshot.position)).toBeCloseTo(10,2);
  const hover=s.snapshot.position;advance(s,120);expect(distance(hover,s.snapshot.position)).toBeLessThan(.001);
 });
 it('can resume flying while falling and clears downward velocity',async()=>{
  const s=await session(-12,40,8);advance(s,30);const falling=s.snapshot.position;
  expect(s.snapshot.velocity.y).toBeLessThan(-4);command(s,{x:0,y:0,z:0},'start');
  expect(s.snapshot.mode).toBe('flying');expect(s.snapshot.velocity.y).toBe(0);advance(s,60,{x:0,y:1,z:0});
  expect(s.snapshot.position.y-falling.y).toBeCloseTo(10,2);
 });
 it('lands on an elevated roof by descending and restores ground controls',async()=>{
  const s=await session(12,14,0);command(s,{x:0,y:0,z:0},'start');advance(s,90,{x:0,y:-1,z:0});
  expect(s.snapshot.mode).toBe('grounded');expect(s.snapshot.supportId).toBe('flight-roof-platform');expect(s.snapshot.position.y).toBeCloseTo(8.895,2);
 });
 it('recovers only below the void plane to the last broad stable roof support',async()=>{
  const s=await session(12,8.91,0);advance(s,60);const safe=s.snapshot.position;
  expect(s.snapshot.supportId).toBe('flight-roof-platform');command(s,{x:0,y:0,z:0},'start');advance(s,60,{x:0,y:1,z:0});advance(s,300,{x:1,y:0,z:0});
  expect(s.snapshot.position.x).toBeGreaterThan(50);command(s,{x:0,y:0,z:0},'stop');
  let minY=Infinity;for(let i=0;i<900&&s.observe().recoveryCount===0;i++){command(s);minY=Math.min(minY,s.snapshot.position.y);}
  expect(minY).toBeLessThan(-79);expect(s.observe().recoveryCount).toBe(1);expect(distance(s.snapshot.position,safe)).toBeLessThan(.001);
  expect(s.events.at(-1).kind).toBe('recovered');expect(s.snapshot.velocity.y).toBe(0);advance(s,30);expect(s.snapshot.supportId).toBe('flight-roof-platform');
 });
 it('rejects invalid commands and speeds without changing the state',async()=>{
  const s=await session(),before=s.snapshot;
  expect(()=>command(s,{x:NaN,y:0,z:0})).toThrow();expect(()=>command(s,{x:0,y:0,z:0},'teleport')).toThrow();expect(s.snapshot).toBe(before);
  for(const speed of [0,61,Infinity])await expect(GroundSession.create('fixture',{x:0,y:1,z:0},{flight:true,flightSpeed:speed})).rejects.toThrow('Invalid flight speed');
 });
});
describe('P04-02: swept high-speed physics',()=>{
 it('cannot cross a thin wall at the 60 m/s configuration limit',async()=>{
  const s=await session(0,5,0,'fixture',60);command(s,{x:0,y:0,z:0},'start');const penetration=advance(s,90,{x:0,y:0,z:-1});
  expect(s.snapshot.position.z).toBeGreaterThan(-4.66);expect(s.snapshot.position.z).toBeLessThan(-4.5);expect(penetration).toBeLessThan(.01);
  expect(s.observe().maxSubsteps).toBeGreaterThanOrEqual(5);expect(s.observe().maxSweepDistance).toBeLessThanOrEqual(FLIGHT.maxSweepDistance+1e-8);
 });
 it('blocks ascent below a thin roof and lands above it at high descent speed',async()=>{
  const below=await session(0,5,0,'fixture',60);command(below,{x:0,y:0,z:0},'start');expect(advance(below,60,{x:0,y:1,z:0})).toBeLessThan(.01);expect(below.snapshot.position.y).toBeGreaterThan(9);expect(below.snapshot.position.y).toBeLessThan(9.1);
  const above=await session(0,15,0,'fixture',60);command(above,{x:0,y:0,z:0},'start');expect(advance(above,60,{x:0,y:-1,z:0})).toBeLessThan(.01);expect(above.snapshot.supportId).toBe('flight-thin-roof');expect(above.snapshot.position.y).toBeCloseTo(10.935,2);
 });
 it('falls onto the actual transformed palace roof collision surface',async()=>{
  const s=await session(15,170,0,'palace');const penetration=advance(s,300);
  expect(s.snapshot.mode).toBe('grounded');expect(s.snapshot.supportId).toMatch(/^palace-roof-/);expect(s.snapshot.position.y).toBeGreaterThan(100);expect(penetration).toBeLessThan(.01);
 });
});
describe('P04-03: fixed clock and pause recovery',()=>{
 it.each(['flying','falling'])('caps long-frame displacement and resets elapsed time while %s',async mode=>{
  const s=await session(-12,40,8),clock=new FixedClock(60,5);if(mode==='flying')command(s,{x:0,y:0,z:0},'start');
  clock.advance(0);const before=s.snapshot.position,count=clock.advance(120000);expect(count).toBe(5);
  advance(s,count,{x:0,y:mode==='flying'?1:0,z:0});expect(distance(before,s.snapshot.position)).toBeLessThan(1);
  const paused=s.snapshot;clock.reset();expect(clock.advance(300000)).toBe(0);expect(s.snapshot).toBe(paused);
  expect(clock.advance(300000+1000/60)).toBe(1);
 });
 it('replays flight and gravity transitions consistently at 30, 60 and 144 Hz',async()=>{
  const endpoints=[],logs=[];
  for(const fps of [30,60,144]){
   const s=await session(-30,20,8),clock=new FixedClock(60,5);clock.advance(0);
   for(let frame=1;s.snapshot.tick<480;frame++){
    const steps=clock.advance(frame*1000/fps);
    for(let j=0;j<steps&&s.snapshot.tick<480;j++){
     const tick=s.snapshot.tick,request=tick===0||tick===300?'start':tick===180||tick===360?'stop':null;
     command(s,{x:tick<120?1:0,y:tick<120?1:0,z:0},request);
    }
   }
   endpoints.push(s.snapshot.position);logs.push(s.events.map(e=>[e.tick,e.kind,e.to]));
  }
  for(const end of endpoints)expect(distance(end,endpoints[0])).toBeLessThan(.01);expect(logs[1]).toEqual(logs[0]);expect(logs[2]).toEqual(logs[0]);
 });
});
describe('P04-04: ground control and state ownership',()=>{
 it.each([[-12,8],[-4,10],[0,8],[20,10],[-30,20]])('walks at 3 m/s after landing at x=%i z=%i with one matching physics state',async(x,z)=>{
  const s=await session(x,.91,z);advance(s,60);command(s,{x:0,y:0,z:0},'start');advance(s,30,{x:0,y:1,z:0});command(s,{x:0,y:0,z:0},'stop');advance(s,150);
  expect(s.snapshot.mode).toBe('grounded');const before=s.snapshot.position;advance(s,60,{x:1,y:0,z:0});expect(s.snapshot.position.x-before.x).toBeCloseTo(3,2);
  const stopped=s.snapshot.position;advance(s,60);expect(distance(stopped,s.snapshot.position)).toBeLessThan(.001);
  const physics=s.observe();expect(JSON.parse(physics.physicalPosition)).toEqual(s.snapshot.position);expect(physics.bodyCount).toBe(1);expect(physics.controllerCount).toBe(1);expect(physics.capsuleAxis).toBe('+Y');expect(Object.isFrozen(s.snapshot.position)).toBe(true);
 });
});
