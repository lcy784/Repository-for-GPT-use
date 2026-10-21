import {describe,it,expect} from 'vitest';
import {roofHeight,roofVertexData} from '../../../src/runtime/roof.ts';
describe('Right-handed hipped roof surface',()=>{
 it('has upward unit normals on both tiers, including upturned corners',()=>{
  for(const dimensions of [[112,88,51.5,64],[89,62,60,70],[67,40,67,79]]) {
   const data=roofVertexData(...dimensions);
   for(let i=0;i<data.normals.length;i+=3) {
    const [x,y,z]=data.normals.slice(i,i+3);expect(y).toBeGreaterThan(0);expect(Math.hypot(x,y,z)).toBeCloseTo(1,5);
   }
  }
 });
 it('matches the Babylon clockwise front faces used by batched primitives',()=>{
  const data=roofVertexData(112,88,51.5,64),p=data.positions;
  expect(data.indices.length/3).toBe(3072);expect(p.every(Number.isFinite)).toBe(true);
  for(let i=0;i<data.indices.length;i+=3) {
   const [a,b,c]=data.indices.slice(i,i+3).map(n=>n*3);
   const ux=p[b]-p[a],uz=p[b+2]-p[a+2],vx=p[c]-p[a],vz=p[c+2]-p[a+2];
   expect(uz*vx-ux*vz).toBeLessThan(0);
  }
 });
 it('preserves a raised ridge, lifted corners and left/right symmetry',()=>{
  const y=(x,z)=>roofHeight(x,z,112,88,51.5,64);
  expect(y(0,0)).toBe(64);expect(y(56,44)).toBeGreaterThan(y(0,44)+2);
  for(const x of [0,10,28,56]) for(const z of [0,5,22,44]) expect(y(x,z)).toBeCloseTo(y(-x,-z),9);
 });
});
