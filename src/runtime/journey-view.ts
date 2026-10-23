import {Scene} from '@babylonjs/core/scene';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData';
import {CreateBox} from '@babylonjs/core/Meshes/Builders/boxBuilder';
import {CreateCylinder} from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import {CreateSphere} from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import type {ShadowGenerator} from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import {JOURNEY,HOUSES,villageTerrain} from '../game/journey';

export interface JourneyView{update(eye:Vector3):void;observe():Readonly<{cameraCloudBand:string;cloudOpacity:number;palaceLift:number}>}

/** P06 placement adapter; the approved P02 authoring module remains byte-identical. */
export function createJourneyView(scene:Scene):JourneyView{
 for(const mesh of [...scene.meshes]){
  if(mesh.name==='palace/cloud-water-droplets'){mesh.setEnabled(false);continue;}
  if(mesh.name==='atmosphere')continue;
  mesh.unfreezeWorldMatrix();mesh.position.y+=JOURNEY.palaceLift;mesh.computeWorldMatrix(true);mesh.freezeWorldMatrix();
 }
 const sun=scene.getLightByName('late-morning-sun');
 if(sun&&'position'in sun)(sun.position as Vector3).y+=JOURNEY.palaceLift;
 const material=(name:string,color:string)=>{const m=new PBRMaterial(name,scene);m.albedoColor=Color3.FromHexString(color);m.roughness=.85;m.metallic=0;m.environmentIntensity=.65;return m;};
 const stone=material('jiangnan-flagstone','#aaa992'),white=material('jiangnan-whitewash','#e6dfcc'),tile=material('jiangnan-grey-tiles','#263d3a'),wood=material('jiangnan-timber','#4c3125'),leaf=material('jiangnan-willow','#476b4c'),gold=material('jiangnan-warm-window','#d8b97b');
 const batches=new Map<PBRMaterial,Mesh[]>();
 const add=(mesh:Mesh,m:PBRMaterial)=>{mesh.material=m;mesh.receiveShadows=true;if(!batches.has(m))batches.set(m,[]);batches.get(m)!.push(mesh);return mesh;};
 const box=(name:string,size:readonly number[],p:readonly number[],m:PBRMaterial)=>{const mesh=CreateBox(name,{width:size[0],height:size[1],depth:size[2]},scene);mesh.position.set(p[0],p[1],p[2]);return add(mesh,m);};
 for(const shape of villageTerrain()){
  if(shape.kind==='mesh'){const data=new VertexData();data.positions=[...shape.vertices];data.indices=shape.indices.flatMap((_,i,a)=>i%3===0?[a[i],a[i+2],a[i+1]]:[]);const n:number[]=[];VertexData.ComputeNormals(data.positions,data.indices,n);data.normals=n;const mesh=new Mesh(shape.id,scene);data.applyToMesh(mesh);add(mesh,tile);}
  else box(shape.id,shape.size,shape.centre,shape.id.startsWith('water-house')?white:stone);
 }
 // Door and window decorations are on solid village houses; the accessible interior is the palace.
 for(const h of HOUSES){
  const facing=h.x<0?1:-1,x=h.x+facing*(h.width/2+.035);
  box(`${h.id}-door`,[.08,3,1.8],[x,1.5,h.z],wood);
  for(const dz of [-5,5]){
   box(`${h.id}-window`,[.09,2.1,2.6],[x,4,h.z+dz],wood);
   for(const stripe of [-.8,0,.8])box(`${h.id}-lattice`,[.11,1.9,.08],[x+facing*.02,4,h.z+dz+stripe],gold);
  }
  box(`${h.id}-footing`,[h.width+.4,.4,h.depth+.4],[h.x,.2,h.z],stone);
 }
 // Stone joints, a pair of lanterns and willow silhouettes carry the reference's water-town rhythm.
 for(const side of [-1,1])for(let z=170;z<=300;z+=5)box('bank-joint',[7,.012,.055],[side*12,.012,z],white);
 for(const side of [-1,1])for(const z of [178,250,298]){
  const x=side*16,trunk=CreateCylinder('willow-trunk',{height:7,diameter:.45,tessellation:6},scene);trunk.position.set(x,3.5,z);add(trunk,wood);
  const crown=CreateSphere('willow-crown',{diameter:6,segments:8},scene);crown.scaling.set(1,.65,.8);crown.position.set(x,7,z);add(crown,leaf);
  for(const dx of [-2,-1,1,2])box('willow-trailing',[.14,4,.22],[x+dx,4.8,z+.8],leaf);
 }
 for(const side of [-1,1]){box('bridge-lantern-base',[.7,1,.7],[side*10,.5,JOURNEY.bridgeZ-5],stone);box('bridge-lantern-light',[.5,.6,.5],[side*10,1.3,JOURNEY.bridgeZ-5],gold);}
 for(const [m,meshes]of batches){const merged=Mesh.MergeMeshes(meshes,true,true,undefined,false,false);if(!merged)throw new Error(`Cannot batch ${m.name}`);merged.name=`journey/${m.name}`;merged.material=m;merged.receiveShadows=true;}
 const water=box('jiangnan-canal',[16,.08,148],[0,-.65,236],material('jiangnan-water','#345e60'));
 const waterMaterial=water.material as PBRMaterial;waterMaterial.roughness=.15;waterMaterial.metallic=.2;
 // All current shadow casters and the sun are static. Reuse their actual first shadow render.
 const shadow=sun?.getShadowGenerator() as ShadowGenerator|null|undefined;
 if(shadow){shadow.normalBias=.6;shadow.bias=.0015;for(const mesh of scene.meshes)if(mesh.name.startsWith('journey/')&&mesh.name!=='journey/jiangnan-flagstone')shadow.addShadowCaster(mesh);const map=shadow.getShadowMap();if(map)map.refreshRate=0;}
 // Continuous transparent height field. It fades around the eye while crossing, including from below.
 const positions:number[]=[],indices:number[]=[],normals:number[]=[],n=72,extent=1800;
 for(let z=0;z<=n;z++)for(let x=0;x<=n;x++){
  const px=(x/n-.5)*extent,pz=(z/n-.5)*extent;
  positions.push(px,JOURNEY.cloudHeight+3*Math.sin(px*.017)*Math.cos(pz*.021)+1.8*Math.sin(pz*.045+px*.009),pz);
  if(x<n&&z<n){const a=z*(n+1)+x;indices.push(a,a+n+1,a+1,a+1,a+n+1,a+n+2);}
 }
 VertexData.ComputeNormals(positions,indices,normals);const cloud=new Mesh('journey/cloud-sea',scene),data=new VertexData();Object.assign(data,{positions,indices,normals});data.applyToMesh(cloud);cloud.isPickable=false;
 const cm=new ShaderMaterial('journey/traversable-cloud',scene,{
  vertexSource:'precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;varying vec3 p;void main(){p=position;gl_Position=worldViewProjection*vec4(position,1.);}',
  fragmentSource:`precision highp float;varying vec3 p;uniform vec3 eye;
   void main(){float d=abs(eye.y-p.y);float crossing=smoothstep(3.,24.,d);float rim=1.-smoothstep(650.,900.,length(p.xz));
    float field=.5+.22*sin(p.x*.023)*cos(p.z*.019)+.12*sin(p.x*.063+p.z*.041);
    float alpha=crossing*rim*(.60+field*.29);float light=.78+field*.19;
    gl_FragColor=vec4(vec3(.88,.92,.88)*light,alpha);}`,
 },{attributes:['position'],uniforms:['worldViewProjection','eye'],needAlphaBlending:true});
 cm.backFaceCulling=false;cm.disableDepthWrite=true;cloud.material=cm;
 let band='below',opacity=0;
 return {update(eye){cm.setVector3('eye',eye);const delta=eye.y-JOURNEY.cloudHeight;band=Math.abs(delta)<=JOURNEY.cloudHalfDepth?'inside':delta<0?'below':'above';opacity=Math.max(0,Math.min(1,(Math.abs(delta)-3)/21));scene.fogDensity=.0007+.004*Math.exp(-Math.pow(delta/9,2));},observe:()=>Object.freeze({cameraCloudBand:band,cloudOpacity:opacity,palaceLift:JOURNEY.palaceLift})};
}
