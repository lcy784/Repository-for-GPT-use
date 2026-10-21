import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';

export function roofHeight(x: number, z: number, width: number, depth: number, eave: number, ridge: number): number {
  const u=Math.abs(x)/(width/2), v=Math.abs(z)/(depth/2);
  const t=Math.max(v, Math.max(0,(u-.52)/.48));
  return ridge-(ridge-eave)*Math.pow(t,.63)+2.8*Math.pow(u,8)*Math.pow(v,4)+1.1*Math.pow(v,12);
}
export function roofVertexData(width: number, depth: number, eave: number, ridge: number): VertexData {
  const nx=48,nz=32,positions:number[]=[],indices:number[]=[],uvs:number[]=[],normals:number[]=[];
  for(let j=0;j<=nz;j++) for(let i=0;i<=nx;i++) {
    const x=-width/2+i*width/nx,z=-depth/2+j*depth/nz;
    positions.push(x,roofHeight(x,z,width,depth,eave,ridge),z-14);uvs.push(i/nx,j/nz);
    if(i<nx&&j<nz) {const a=j*(nx+1)+i;indices.push(a,a+1,a+nx+1,a+1,a+nx+2,a+nx+1);}
  }
  // Babylon primitives use clockwise front faces even in a right-handed world.
  // Match their winding before batching; outward world normals must point up.
  VertexData.ComputeNormals(positions,indices,normals);
  const data=new VertexData();data.positions=positions;data.indices=indices;data.normals=normals;data.uvs=uvs;
  return data;
}
