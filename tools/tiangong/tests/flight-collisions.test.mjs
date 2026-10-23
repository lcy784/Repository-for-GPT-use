import {beforeAll,afterEach,describe,it,expect} from 'vitest';
import RAPIER from '../../../node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs';
import {createTerrainCollider} from '../../../src/game/collision.ts';
import {palaceRoofCollisions,flightFixture} from '../../../src/game/flight-terrain.ts';
import {roofVertexData} from '../../../src/runtime/roof.ts';
const worlds=[];
beforeAll(()=>RAPIER.init());
afterEach(()=>{for(const world of worlds.splice(0))world.free();});
function worldFor(shapes){const world=new RAPIER.World({x:0,y:0,z:0});worlds.push(world);for(const shape of shapes)world.createCollider(createTerrainCollider(shape));world.step();return world;}
describe('P04-02: collision geometry',()=>{
 it('matches every collision top vertex to the actual transformed visual roof',()=>{
  const roofs=palaceRoofCollisions();
  for(const [tier,parameters] of [[112,88,51.5,64],[89,62,60,70],[67,40,67,79]].entries()){
   const source=Array.from(roofVertexData(...parameters).positions),roof=roofs[tier];
   expect(roof.vertices.length).toBe(source.length*2);
   for(let i=0;i<source.length;i++){
    const expected=i%3===0?source[i]*1.35:i%3===1?source[i]*1.9-4.8:source[i]*1.55;
    expect(roof.vertices[i]).toBeCloseTo(expected,8);
   }
   const edges=new Map();
   for(let i=0;i<roof.indices.length;i+=3)for(const [a,b] of [[0,1],[1,2],[2,0]]){
    const pair=[roof.indices[i+a],roof.indices[i+b]].sort((a,b)=>a-b).join(',');edges.set(pair,(edges.get(pair)||0)+1);
   }
   expect([...edges.values()].every(count=>count===2)).toBe(true);
  }
 });
 it('detects real roof surfaces from above and below',()=>{
  for(const roof of palaceRoofCollisions()){
   const world=worldFor([roof]),centre=(16*49+24)*3;
   const x=roof.vertices[centre],y=roof.vertices[centre+1],z=roof.vertices[centre+2];
   const above=world.castRay(new RAPIER.Ray({x,y:y+4,z},{x:0,y:-1,z:0}),10,true);
   const below=world.castRay(new RAPIER.Ray({x,y:y-4,z},{x:0,y:1,z:0}),10,true);
   expect(above).not.toBeNull();expect(above.timeOfImpact).toBeCloseTo(4,3);
   expect(below).not.toBeNull();expect(below.timeOfImpact).toBeCloseTo(3.75,3);
  }
 });
 it('sweeps a capsule against an 8 cm thin wall and underside of a thin roof',()=>{
  const world=worldFor(flightFixture());
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,5,0));
  const capsule=world.createCollider(RAPIER.ColliderDesc.capsule(.575,.3),body);
  const controller=world.createCharacterController(.02);world.step();
  controller.computeColliderMovement(capsule,{x:0,y:0,z:-20});
  expect(controller.computedMovement().z).toBeGreaterThan(-4.7);
  expect(controller.computedMovement().z).toBeLessThan(-4.5);
  controller.computeColliderMovement(capsule,{x:0,y:20,z:0});
  expect(controller.computedMovement().y).toBeLessThan(4.1);
  expect(controller.computedMovement().y).toBeGreaterThan(4.0);
  world.removeCharacterController(controller);
 });
});
