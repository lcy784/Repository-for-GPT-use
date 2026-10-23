import {afterEach,afterAll,describe,it,expect} from 'vitest';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import validator from 'gltf-validator';
import {NullEngine} from '../../../node_modules/@babylonjs/core/Engines/nullEngine.js';
import {Scene} from '../../../node_modules/@babylonjs/core/scene.js';
import {FreeCamera} from '../../../node_modules/@babylonjs/core/Cameras/freeCamera.js';
import {Vector3} from '../../../node_modules/@babylonjs/core/Maths/math.vector.js';
import {AvatarView} from '../../../src/game/avatar.ts';
import {PlayerCamera} from '../../../src/game/player-camera.ts';
import {GroundSession,idleIntent} from '../../../src/game/session.ts';
const asset=new Uint8Array(readFileSync('public/characters/p05/traveler.glb'));
const scenes=[],avatars=[],sessions=[],cameras=[],observations=[];
function scene(){const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;new FreeCamera('test-camera',new Vector3(0,2,6),scene);scenes.push({scene,engine});return scene;}
async function avatar(s=scene()){const a=await AvatarView.load(s,asset);avatars.push(a);return {a,scene:s};}
async function session(spawn={x:0,y:.91,z:0}){const s=await GroundSession.create('camera-fixture',spawn,{flight:true});sessions.push(s);return s;}
function step(s,movement={x:0,y:0,z:0},flightRequest=null){s.step({...idleIntent(s.snapshot.tick),movement,flightRequest});}
function animate(item,s,count,movement={x:0,y:0,z:0}){for(let i=0;i<count;i++){step(s,movement);item.a.update(s.snapshot,1/60);item.scene.render();}}
afterEach(()=>{observations.push({test:expect.getState().currentTestName,avatars:avatars.map(a=>({position:a.root.position.asArray(),rotation:a.root.rotation.asArray(),animation:a.observe()})),sessions:sessions.map(s=>({state:s.snapshot,physics:s.observe()})),cameras:cameras.map(c=>c.observe())});for(const c of cameras.splice(0))c.dispose();for(const a of avatars.splice(0))a.dispose();for(const s of sessions.splice(0))s.dispose();for(const {scene,engine} of scenes.splice(0)){scene.dispose();engine.dispose();}delete globalThis.window;delete globalThis.document;expect(AvatarView.instances).toBe(0);expect(GroundSession.instances).toBe(0);});
afterAll(()=>{if(process.env.TIANGONG_GATE_CONTEXT){const c=JSON.parse(readFileSync(process.env.TIANGONG_GATE_CONTEXT,'utf8'));writeFileSync(path.join(c.runDir,'P05-model-camera-observations.json'),JSON.stringify({runId:c.runId,candidate:c.candidate,observations},null,2)+'\n');}});
describe('P05-03: authored model and real animation groups',()=>{
 it('validates the self-contained GLB and reproduces it from the source generator',async()=>{
  const r=await validator.validateBytes(asset);expect(r.issues.numErrors).toBe(0);expect(r.issues.numWarnings).toBe(0);
  const dir=mkdtempSync(path.join(tmpdir(),'tiangong-avatar-source-'));
  try{const file=path.join(dir,'traveler.glb'),result=spawnSync('python3',['tools/author-p05-avatar.py','--output',file]);expect(result.status).toBe(0);expect(Buffer.from(readFileSync(file))).toEqual(Buffer.from(asset));}finally{rmSync(dir,{recursive:true,force:true});}
 });
 it('imports a real 1.75 m articulated model with four GLB clips and aligned feet',async()=>{
  const {a,scene:s}=await avatar();a.update({position:{x:0,y:.875,z:0},velocity:{x:0,y:0,z:0},yaw:0,mode:'grounded'},0);s.render();
  expect(a.root.metadata.visualHeightMeters).toBeCloseTo(1.75,4);expect(a.observe().groups).toBe(4);expect(a.observe().meshes).toBeGreaterThan(20);const b=a.root.getHierarchyBoundingVectors(true);expect(b.min.y).toBeCloseTo(0,3);
 });
 it('changes actual limb poses while walking and blends back to standing without root motion',async()=>{
  const item=await avatar(),s=await session();animate(item,s,45);const idle=item.a.observe();animate(item,s,12,{x:0,y:0,z:1});const moving=item.a.observe();
  expect(moving.action).toBe('walk');expect(moving.weights.walk).toBeGreaterThan(.7);expect(moving.joints).not.toEqual(idle.joints);
  const p=s.snapshot.position;animate(item,s,90);expect(item.a.observe().action).toBe('idle');expect(item.a.observe().weights.idle).toBeGreaterThan(.99);const q=s.snapshot.position;expect(item.a.root.position.asArray()).toEqual([q.x,q.y,q.z]);expect(Math.hypot(q.x-p.x,q.z-p.z)).toBeLessThan(.001);
 });
 it('maps real flight and falling to different animated poses with the physics position authoritative',async()=>{
  const item=await avatar(),s=await session();animate(item,s,45);step(s,{x:0,y:0,z:0},'start');animate(item,s,40,{x:0,y:1,z:0});const flying=item.a.observe();
  expect(flying.action).toBe('fly');expect(flying.weights.fly).toBeGreaterThan(.99);step(s,{x:0,y:0,z:0},'stop');animate(item,s,15);const falling=item.a.observe();expect(falling.action).toBe('fall');expect(falling.joints).not.toEqual(flying.joints);
  const p=s.snapshot.position;const q=s.snapshot.position;expect(item.a.root.position.asArray()).toEqual([q.x,q.y,q.z]);expect(Math.hypot(q.x-p.x,q.z-p.z)).toBeLessThan(.001);expect(item.a.root.rotation.y).toBe(-s.snapshot.yaw);
 });
 it('loops and blends GLB actions without moving the animation origin or resetting session state',async()=>{
  const item=await avatar(),s=await session();animate(item,s,45);const state=s.snapshot;
  for(let i=0;i<240;i++){item.a.update(state,1/60);item.scene.render();}
  expect(s.snapshot).toBe(state);expect(item.a.root.position.asArray()).toEqual([state.position.x,state.position.y,state.position.z]);expect(item.a.observe().rootOffset).toEqual([0,-.875,0]);
  const before=item.scene.meshes.length;for(let i=0;i<12;i++){item.a.setVisible(i%2===0);expect(item.a.root.isEnabled()).toBe(i%2===0);expect(item.a.root.getChildMeshes().every(m=>m.isEnabled()===(i%2===0))).toBe(true);}expect(item.scene.meshes.length).toBe(before);expect(AvatarView.instances).toBe(1);
 });
});
describe('P05-02: real Rapier camera obstruction queries',()=>{
 it('excludes the player capsule and leaves an unobstructed camera segment unchanged',async()=>{
  const s=await session(),before=s.snapshot;const result=s.cameraObstruction({x:0,y:1.6,z:0},{x:0,y:1.6,z:6});expect(result.distance).toBeCloseTo(6,5);expect(result.colliderId).toBeNull();expect(s.snapshot).toBe(before);
 });
 it('finds a side wall with a sphere clearance margin without mutating physics',async()=>{
  const s=await session(),before=s.snapshot,events=s.events;const result=s.cameraObstruction({x:0,y:1.6,z:0},{x:6,y:1.6,z:0});expect(result.colliderId).toBe('camera-side-wall');expect(result.distance).toBeGreaterThan(2.5);expect(result.distance).toBeLessThan(2.8);expect(s.snapshot).toBe(before);expect(s.events).toBe(events);
 });
 it('keeps the doorway opening clear and contracts below an eave',async()=>{
  const s=await session();expect(s.cameraObstruction({x:0,y:1.6,z:0},{x:0,y:1.6,z:-8}).colliderId).toBeNull();const roof=s.cameraObstruction({x:0,y:2,z:-7},{x:0,y:6,z:-7});expect(roof.colliderId).toBe('camera-eave');expect(roof.distance).toBeLessThan(1.65);
 });
 it('contracts immediately at a wall and restores distance after the player leaves it',async()=>{
  const s=await session(),sc=scene();globalThis.window=new EventTarget();globalThis.document=new EventTarget();const canvas=new EventTarget();canvas.hasPointerCapture=()=>false;
  const c=new PlayerCamera(sc,canvas,s,6,[6,.725,0]);cameras.push(c);expect(c.observe().distance).toBeLessThan(2.8);expect(c.observe().blocker).toBe('camera-side-wall');
  step(s,{x:0,y:0,z:0},'start');for(let i=0;i<75;i++){step(s,{x:0,y:0,z:1});c.update(s.snapshot,1/60);}expect(c.observe().blocker).toBeNull();expect(c.observe().distance).toBeGreaterThan(5.8);
 });
});
describe('P05-01: perspective state continuity',()=>{
 it('changes only the camera and model visibility across twelve perspective switches',async()=>{
  const s=await session(),sc=scene();globalThis.window=new EventTarget();globalThis.document=new EventTarget();const canvas=new EventTarget();canvas.hasPointerCapture=()=>false;
  const c=new PlayerCamera(sc,canvas,s);cameras.push(c);const state=s.snapshot;
  for(let i=0;i<12;i++){c.toggle();c.update(state,1/60);expect(c.perspective).toBe(i%2===0?'first':'third');expect(c.avatarVisible).toBe(i%2!==0);expect(s.snapshot).toBe(state);if(i%2===0)expect(c.camera.position.y).toBeCloseTo(state.position.y+.725,6);}
  expect(c.observe().toggles).toBe(12);expect(c.observe().listeners).toBe(10);
 });
});

describe('P05-04: model lifecycle',()=>{
 it('releases imported meshes and animation groups across three reloads',async()=>{
  const sc=scene();for(let i=0;i<3;i++){const {a}=await avatar(sc);expect(AvatarView.instances).toBe(1);expect(sc.animationGroups.length).toBe(4);a.dispose();expect(AvatarView.instances).toBe(0);expect(sc.animationGroups.length).toBe(0);expect(sc.meshes.length).toBe(0);}
 });
});
