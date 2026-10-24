/** Dedicated verification page; not imported by the product entry or its UI. */
import {Engine} from '@babylonjs/core/Engines/engine';
import {Scene} from '@babylonjs/core/scene';
import {FreeCamera} from '@babylonjs/core/Cameras/freeCamera';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {Color3,Color4} from '@babylonjs/core/Maths/math.color';
import {HemisphericLight} from '@babylonjs/core/Lights/hemisphericLight';
import {RawTexture} from '@babylonjs/core/Materials/Textures/rawTexture';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {CreateBox} from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type {Mesh} from '@babylonjs/core/Meshes/mesh';
import {AssetScope,HttpAssets} from './access';
import {ResourcePool,type Lease} from './pool';
const canvas=document.querySelector<HTMLCanvasElement>('#view')!,engine=new Engine(canvas,false,{preserveDrawingBuffer:true}),scene=new Scene(engine);scene.clearColor=new Color4(.12,.17,.2,1);
const camera=new FreeCamera('camera',new Vector3(0,1,-10),scene);camera.setTarget(new Vector3(0,0,0));camera.minZ=.1;new HemisphericLight('light',new Vector3(0,1,-1),scene).intensity=1;
const scope=await AssetScope.open('registry/p07.json',new HttpAssets(new URL('../',document.baseURI)),new AbortController().signal),pool=new ResourcePool<RawTexture>();
const zones=new Map<string,{lease:Lease<RawTexture>;mesh?:Mesh;material?:StandardMaterial;status:string}>(),barriers:Array<()=>void>=[];let creates=0,frames=0,closed=false;
function release(id:string){const z=zones.get(id);if(!z)return;zones.delete(id);z.mesh?.dispose();z.material?.dispose();z.lease.release();}
async function add(id:string){
 release(id);const lease=pool.acquire('shared-texture',async signal=>{
  const bytes=scope.acquire('fixture.texture'),abort=()=>bytes.release();signal.addEventListener('abort',abort,{once:true});
  try{const data=await bytes.ready;if(document.querySelector<HTMLInputElement>('#delay')!.checked)await new Promise<void>(resolve=>barriers.push(resolve));
   const texture=RawTexture.CreateRGBATexture(data,2,2,scene,false,false,1);creates++;return {value:texture,dispose:()=>texture.dispose()};
  }finally{signal.removeEventListener('abort',abort);bytes.release();}
 });
 const zone:{lease:Lease<RawTexture>;mesh?:Mesh;material?:StandardMaterial;status:string}={lease,status:'loading'};zones.set(id,zone);
 try{const texture=await lease.ready;if(zones.get(id)!==zone)return;const material=new StandardMaterial('zone-'+id,scene);material.diffuseTexture=texture;material.specularColor=Color3.Black();const mesh=CreateBox('zone-'+id,{size:2},scene);mesh.position.x=id==='a'?-2:2;mesh.material=material;zone.mesh=mesh;zone.material=material;zone.status='ready';document.querySelector('#notice')!.textContent='ready';}
 catch(error){if(zones.get(id)===zone){zone.status='error';document.querySelector('#notice')!.textContent=String(error);}}
}
for(const id of ['a','b']){document.querySelector('#'+id)!.addEventListener('click',()=>void add(id));document.querySelector('#release-'+id)!.addEventListener('click',()=>release(id));}
document.querySelector('#finish')!.addEventListener('click',()=>{for(const done of barriers.splice(0))done();});
function dispose(){if(closed)return;closed=true;for(const id of [...zones.keys()])release(id);pool.dispose();scope.dispose();for(const done of barriers.splice(0))done();engine.stopRenderLoop();scene.dispose();engine.dispose();}
document.querySelector('#close')!.addEventListener('click',dispose);window.addEventListener('pagehide',dispose,{once:true});
Object.defineProperty(window,'__P07__',{value:()=>({frames,closed,creates,barriers:barriers.length,textures:scene.textures.length,meshes:scene.meshes.length,materials:scene.materials.length,pool:pool.observe(),assets:scope.observe(),zones:[...zones].map(([id,z])=>({id,status:z.status,textureId:z.material?.diffuseTexture?.uniqueId})),notice:document.querySelector('#notice')!.textContent})});
engine.runRenderLoop(()=>{scene.render();frames++;});
