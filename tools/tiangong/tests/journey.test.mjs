import {afterEach,afterAll,describe,it,expect} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {GroundSession,idleIntent} from '../../../src/game/session.ts';
import {JOURNEY,journeyTerrain,villageTerrain,journeyLocation} from '../../../src/game/journey.ts';
import {flightTerrain} from '../../../src/game/flight-terrain.ts';
const sessions=[],records=[];
async function create(spawn=JOURNEY.spawn){const s=await GroundSession.create('journey',{x:spawn[0],y:spawn[1],z:spawn[2]},{flight:true});sessions.push(s);return s;}
function step(s,movement={x:0,y:0,z:0},request=null){s.step({...idleIntent(s.snapshot.tick),movement,flightRequest:request});expect(s.observe().penetration).toBeLessThan(.01);}
function advance(s,count,movement){for(let i=0;i<count;i++)step(s,movement);}
function move(s,axis,target){
 const sign=Math.sign(target-s.snapshot.position[axis]);
 for(let i=0;i<6000&&sign*(target-s.snapshot.position[axis])>.08;i++)step(s,{x:0,y:0,z:0,[axis]:sign});
 expect(Math.abs(s.snapshot.position[axis]-target)).toBeLessThan(.18);
}
function mark(s,label){const o=s.observe();expect(o.controllerCount).toBe(1);expect(o.bodyCount).toBe(1);expect(JSON.parse(o.physicalPosition)).toEqual(s.snapshot.position);records.push({label,state:s.snapshot,physics:o});}
afterEach(()=>{for(const s of sessions.splice(0))s.dispose();expect(GroundSession.instances).toBe(0);});
afterAll(()=>{if(process.env.TIANGONG_GATE_CONTEXT){const c=JSON.parse(readFileSync(process.env.TIANGONG_GATE_CONTEXT,'utf8'));writeFileSync(path.join(c.runDir,'P06-physics-observations.json'),JSON.stringify({runId:c.runId,candidate:c.candidate,records},null,2)+'\n');}});

describe('P06-01: same-player continuous core journey',()=>{
 it('walks from bank across bridge, flies through the cloud band, enters the hall and lands on the actual roof',async()=>{
  const s=await create();advance(s,40);expect(s.snapshot.supportId).toBe('jiangnan-bank--1');mark(s,'bank');
  move(s,'z',JOURNEY.bridgeZ);move(s,'x',0);expect(s.snapshot.supportId).toBe('jiangnan-bridge');mark(s,'bridge');
  step(s,undefined,'start');move(s,'y',100);mark(s,'cloud');move(s,'y',142);move(s,'z',54);
  move(s,'y',138.9);advance(s,10);expect(s.snapshot.mode).toBe('grounded');expect(s.snapshot.supportId).toBe('palace-terrace');mark(s,'terrace');
  move(s,'z',0);expect(journeyLocation(s.snapshot)).toContain('室内');mark(s,'interior');move(s,'z',54);
  step(s,undefined,'start');move(s,'y',285);move(s,'x',15);move(s,'z',0);
  for(let i=0;i<1000&&s.snapshot.mode!=='grounded';i++)step(s,{x:0,y:-1,z:0});
  expect(s.snapshot.supportId).toMatch(/^palace-roof-/);expect(s.snapshot.position.y).toBeGreaterThan(220);mark(s,'roof');
  const roof=s.snapshot.position;advance(s,60);expect(Math.hypot(s.snapshot.position.x-roof.x,s.snapshot.position.y-roof.y,s.snapshot.position.z-roof.z)).toBeLessThan(.005);step(s,undefined,'start');advance(s,20,{x:0,y:1,z:0});expect(s.snapshot.mode).toBe('flying');mark(s,'roof-departure');
  expect(s.observe().recoveryCount).toBe(0);expect(s.snapshot.id).toBe('local-player');
 });
});
describe('P06-02: real interior and roof surfaces',()=>{
 it.each([-1,1])('enters and leaves the central open hall from side %i',async side=>{
  const s=await create([side*8,138.91,54]);advance(s,40);move(s,'z',-30);expect(s.snapshot.supportId).toBe('palace-terrace');expect(journeyLocation(s.snapshot)).toContain('室内');move(s,'z',54);mark(s,`hall-${side}`);
 });
 it.each([-15,0,15])('falls onto the transformed roof at x=%i, stays supported and can take off again',async x=>{
  const s=await create([x,290,0]);advance(s,400);expect(s.snapshot.mode).toBe('grounded');expect(s.snapshot.supportId).toMatch(/^palace-roof-/);const y=s.snapshot.position.y;advance(s,60);expect(s.snapshot.position.y).toBeCloseTo(y,3);step(s,undefined,'start');advance(s,30,{x:0,y:1,z:0});expect(s.snapshot.position.y).toBeGreaterThan(y+4);mark(s,`roof-${x}`);
 });
 it('has solid hall walls and ceiling rather than decorative collision envelopes',async()=>{
  const s=await create([0,138.91,0]);advance(s,30);move(s,'x',50);advance(s,300,{x:1,y:0,z:0});expect(s.snapshot.position.x).toBeLessThan(58.1);
  step(s,undefined,'start');advance(s,800,{x:0,y:1,z:0});expect(s.snapshot.position.y).toBeLessThan(212);expect(s.snapshot.position.y).toBeGreaterThan(210);mark(s,'hall-ceiling');
 });
});
describe('P06-03: sample geometry and cloud crossing boundaries',()=>{
 it('translates every existing palace collider by exactly the same lift and retains source roof geometry',()=>{
  const original=flightTerrain('palace').filter(s=>!s.id.startsWith('lower-')),current=journeyTerrain();expect(new Set(current.map(s=>s.id)).size).toBe(current.length);expect(current.some(s=>s.id.startsWith('lower-'))).toBe(false);
  for(let i=0;i<original.length;i++){const a=original[i],b=current[i];expect(a.id).toBe(b.id);if(a.kind==='mesh'){expect(b.indices).toEqual(a.indices);expect(b.vertices).toEqual(a.vertices.map((v,j)=>j%3===1?v+120:v));}else{expect(b.centre).toEqual([a.centre[0],a.centre[1]+120,a.centre[2]]);expect(b.size).toEqual(a.size);}}
  expect(villageTerrain().some(s=>s.id==='jiangnan-bridge')).toBe(true);
 });
 it('classifies the journey from actual position and support without writing the player state',()=>{
  for(const [y,support,label]of [[0,null,'江南'],[60,null,'云下'],[100,null,'云中'],[140,'palace-terrace','台面'],[250,'palace-roof-2','屋顶']]){const s=Object.freeze({position:Object.freeze({x:0,y,z:54}),supportId:support});expect(journeyLocation(s)).toContain(label);expect(s.position.y).toBe(y);}
 });
});
