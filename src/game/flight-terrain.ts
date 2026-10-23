import {roofVertexData} from '../runtime/roof';
import {terrain,type TerrainShape} from './terrain';
import type {CollisionShape,TriangleTerrainShape} from './collision';

/** Existing palace roof dimensions and author transforms, with a closed collision shell. */
export function palaceRoofCollisions():TriangleTerrainShape[] {
 return [[112,88,51.5,64],[89,62,60,70],[67,40,67,79]].map(([width,depth,eave,ridge],tier)=>{
  const data=roofVertexData(width,depth,eave,ridge);
  const source=Array.from(data.positions!),sourceIndices=Array.from(data.indices!);
  const vertices=source.map((value,index)=>index%3===0?value*1.35:index%3===1?value*1.9-4.8:value*1.55);
  const count=vertices.length/3,indices:number[]=[];
  // The visual mesh uses Babylon clockwise faces; Rapier needs outward shell winding.
  for(let i=0;i<sourceIndices.length;i+=3){
   const [a,b,c]=sourceIndices.slice(i,i+3);
   indices.push(a,c,b,a+count,b+count,c+count);
  }
  vertices.push(...vertices.map((value,index)=>index%3===1?value-.25:value));
  const edge=(a:number,b:number)=>indices.push(a,b,b+count,a,b+count,a+count);
  const nx=48,nz=32,stride=nx+1;
  for(let i=0;i<nx;i++){edge(i,i+1);edge(nz*stride+i+1,nz*stride+i);}
  for(let j=0;j<nz;j++){edge((j+1)*stride,j*stride);edge(j*stride+nx,(j+1)*stride+nx);}
  return {id:`palace-roof-${tier}`,kind:'mesh' as const,vertices,indices};
 });
}

/** Isolated test terrain; these objects do not alter the approved palace visual scene. */
export function flightFixture():TerrainShape[] {
 return [
  {id:'flight-ground',kind:'box',size:[100,1,100],centre:[0,-.5,0],render:true},
  {id:'flight-thin-wall',kind:'box',size:[10,20,.08],centre:[0,10,-5],render:true},
  {id:'flight-thin-roof',kind:'box',size:[6,.08,6],centre:[0,10,0],render:true},
  {id:'flight-roof-platform',kind:'box',size:[8,.2,8],centre:[12,7.9,0],render:true},
  {id:'flight-high-platform',kind:'box',size:[8,.2,8],centre:[0,19.9,20],render:true},
 ];
}

export function flightTerrain(kind:'palace'|'fixture'):CollisionShape[] {
 if(kind==='fixture')return flightFixture();
 return [
  ...terrain('palace'),...palaceRoofCollisions(),
  {id:'palace-ceiling',kind:'box',size:[118.8,.855,111.6],centre:[0,92.1,-21.7]},
 ];
}
