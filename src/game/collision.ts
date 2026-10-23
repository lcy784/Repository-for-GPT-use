import RAPIER from '@dimforge/rapier3d-compat';
import type {TerrainShape} from './terrain';

export type TriangleTerrainShape = Readonly<{
 id:string;
 kind:'mesh';
 vertices:readonly number[];
 indices:readonly number[];
}>;
export type CollisionShape = TerrainShape | TriangleTerrainShape;

/** Render geometry and physical surfaces have separate ownership. */
export function createTerrainCollider(shape:CollisionShape):RAPIER.ColliderDesc {
 if(shape.kind==='mesh')return RAPIER.ColliderDesc.trimesh(
  new Float32Array(shape.vertices),new Uint32Array(shape.indices),RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES,
 );
 const [hx,hy,hz]=shape.size.map(v=>v/2);
 const descriptor=shape.kind==='box'?RAPIER.ColliderDesc.trimesh(
  new Float32Array([-hx,-hy,-hz,hx,-hy,-hz,hx,hy,-hz,-hx,hy,-hz,-hx,-hy,hz,hx,-hy,hz,hx,hy,hz,-hx,hy,hz]),
  new Uint32Array([0,2,1,0,3,2,4,5,6,4,6,7,0,7,3,0,4,7,1,2,6,1,6,5,3,7,6,3,6,2,0,1,5,0,5,4]),
  RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES,
 ):RAPIER.ColliderDesc.cylinder(shape.size[1]/2,shape.size[0]);
 descriptor.setTranslation(...shape.centre);
 if(shape.angleX)descriptor.setRotation({x:Math.sin(shape.angleX/2),y:0,z:0,w:Math.cos(shape.angleX/2)});
 return descriptor;
}
