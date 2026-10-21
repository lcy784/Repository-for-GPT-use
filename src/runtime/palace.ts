import { Scene } from '@babylonjs/core/scene';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { roofHeight, roofVertexData } from './roof';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateTube } from '@babylonjs/core/Meshes/Builders/tubeBuilder';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { RawCubeTexture } from '@babylonjs/core/Materials/Textures/rawCubeTexture';
import { Constants } from '@babylonjs/core/Engines/constants';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import '@babylonjs/core/Materials/Textures/Loaders/envTextureLoader';

// Original parametric study. Coordinates are metres; no reference photograph is a runtime texture.
export const PALACE = Object.freeze({ seed: 20261021, units: 'metres', terraceTop: 12, columnHeight: 36,
  ridgeHeight: 70, humanHeight: 1.75, footprint: [120, 100], frozenSun: [-.65, -1, -.55] });
export function createPalace(scene: Scene): void {
  let seed = PALACE.seed;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const batches = new Map<PBRMaterial, Mesh[]>();
  const mat = (name: string, hex: string, roughness: number, metallic = 0): PBRMaterial => {
    const m = new PBRMaterial(name, scene); m.albedoColor = Color3.FromHexString(hex); m.roughness = roughness; m.metallic = metallic;
    m.environmentIntensity = .55; batches.set(m, []); return m;
  };
  const stone = mat('ivory-limestone', '#d8d4bb', .72), edge = mat('pale-stone-carving', '#f0e8d1', .58);
  const red = mat('vermilion-lacquer', '#641e19', .32), wood = mat('aged-cypress', '#3c201b', .65);
  const gold = mat('weathered-bronze', '#bc8c40', .34, .72), roof = mat('celadon-glazed-tiles', '#294e4d', .32, .18);
  const dark = mat('recess-shadow', '#192524', .8), cloud = mat('cloud-water-droplets', '#e6ecdf', 1);
  const robe = mat('scale-figure-ivory-robe', '#f7ecd4', .9), skin = mat('scale-figure-face', '#bf9670', .85);
  // Seeded local texture fields, including micrograin and floor joints; no network fonts or images.
  for (const [m, kind] of [[stone, 'stone'], [red, 'wood']] as const) {
    const texture = new DynamicTexture(`${kind}-seeded-grain`, { width: 256, height: 256 }, scene, true);
    const ctx = texture.getContext();
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const value = kind === 'stone' ? 220 + Math.floor(random() * 22) - ((x % 64 === 0 || y % 128 === 0) ? 45 : 0) : 220 + Math.floor(random()*6) + Math.sin(x * .16 + Math.sin(y*.012))*4;
      ctx.fillStyle = `rgb(${value},${value},${value})`; ctx.fillRect(x,y,1,1);
    }
    texture.update(false); texture.uScale = kind === 'stone' ? 8 : 1; texture.vScale = kind === 'stone' ? 8 : 3;
    m.albedoTexture = texture;
  }
  const cubeSize = 16;
  const faces = Array.from({ length: 6 }, (_, face) => {
    const data = new Uint8Array(cubeSize*cubeSize*4);
    for (let i=0; i<cubeSize*cubeSize; i++) {
      const brightness = face===2 ? 1 : face===3 ? .44 : .72 + (1-Math.floor(i/cubeSize)/cubeSize)*.16;
      data.set([165*brightness, 190*brightness, 201*brightness, 255], i*4);
    }
    return data;
  });
  scene.environmentTexture = new RawCubeTexture(scene, faces, cubeSize, Constants.TEXTUREFORMAT_RGBA, Constants.TEXTURETYPE_UNSIGNED_BYTE, true, false, Constants.TEXTURE_TRILINEAR_SAMPLINGMODE);
  scene.environmentTexture.name = 'local-daylight-cubemap';
  scene.environmentIntensity = .8;
  scene.imageProcessingConfiguration.exposure = 1.13;
  scene.imageProcessingConfiguration.contrast = 1.12;
  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.toneMappingType = 1;
  scene.fogMode = Scene.FOGMODE_EXP2; scene.fogDensity = .0014; scene.fogColor = Color3.FromHexString('#d4e0df');
  const sky = CreateSphere('atmosphere', { diameter: 2400, segments: 16 }, scene);
  const skyMaterial = new ShaderMaterial('local-atmosphere-gradient', scene, {
    vertexSource: 'precision highp float; attribute vec3 position; uniform mat4 worldViewProjection; varying vec3 direction; void main(){direction=position;gl_Position=worldViewProjection*vec4(position,1.0);}',
    fragmentSource: 'precision highp float; varying vec3 direction; void main(){float h=pow(max(normalize(direction).y,0.0),0.55);gl_FragColor=vec4(mix(vec3(0.8314,0.8784,0.8745),vec3(0.23,0.46,0.61),h),1.0);}',
  }, { attributes: ['position'], uniforms: ['worldViewProjection'] });
  skyMaterial.backFaceCulling=false;sky.material=skyMaterial;sky.isPickable=false;sky.infiniteDistance=true;
  const fill = new HemisphericLight('sky-bounce', new Vector3(0,1,0), scene); fill.intensity = .52; fill.groundColor = Color3.FromHexString('#65716d');
  const sun = new DirectionalLight('late-morning-sun', new Vector3(...PALACE.frozenSun), scene);
  sun.position.set(100,150,100); sun.intensity = 3.2; sun.diffuse = Color3.FromHexString('#fff0ce');
  sun.shadowMinZ = 1; sun.shadowMaxZ = 430; sun.autoCalcShadowZBounds = true;
  const shadows = new ShadowGenerator(1024, sun); shadows.usePercentageCloserFiltering = true; shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
  shadows.bias = .001; shadows.normalBias = .12; shadows.setDarkness(.28);
  const add = (mesh: Mesh, m: PBRMaterial, x: number,y: number,z: number): Mesh => {
    mesh.position.set(x,y,z); mesh.material = m; batches.get(m)!.push(mesh); return mesh;
  };
  const box = (w: number,h: number,d: number,x: number,y: number,z: number,m: PBRMaterial) => add(CreateBox('component', {width:w,height:h,depth:d}, scene),m,x,y,z);
  const cylinder = (diameter: number,height: number,x: number,y: number,z: number,m: PBRMaterial, top=diameter) => add(CreateCylinder('turned-component', { diameterBottom:diameter,diameterTop:top,height,tessellation:16 }, scene),m,x,y,z);
  const tube = (points: Vector3[], radius: number,m: PBRMaterial) => add(CreateTube('curved-trim', { path:points,radius,tessellation:6 }, scene),m,0,0,0);
  // Terraced plinth and one eighty-metre approach stair. The proxy manifest describes these separately.
  box(122,6,100,0,3,-9,stone); box(118,5.5,96,0,8.75,-9,stone);
  box(125,.5,103,0,11.75,-9,edge);
  for (const y of [2,5.8,7,10.8]) box(124,.4,102,0,y,-9,edge);
  for (let i=0; i<60; i++) {
    const y = (i+1)*.2, z = 124-i*1.28;
    box(30,y,1.32,0,y/2,z,stone);
    // Stone stair parapets follow the rise.
    if (i%3===0) for (const x of [-16.8,16.8]) {
      box(1.3,1.7,3.9,x,y+.85,z-1.3,edge); cylinder(1.5,.3,x,y+1.85,z,edge);
    }
  }
  // Relief panels around the plinth and rhythm of balustrades.
  for (let x=-58; x<=58; x+=4) for (const z of [-59,41]) {
    if(z===41 && Math.abs(x)<17) continue;
    box(.7,2.6,.7,x,13.3,z,edge); cylinder(1,.35,x,14.75,z,edge);
    box(3.4,.38,.45,x+1.7,13,z,edge); box(3.4,.38,.45,x+1.7,14.3,z,edge);
    for(let k=0;k<3;k++) box(.24,1.1,.24,x+.6+k*1.05,13.6,z,stone);
  }
  for(const x of [-61,61]) for(let z=-55;z<40;z+=4) {
    box(.7,2.6,.7,x,13.3,z,edge); cylinder(1,.35,x,14.75,z,edge);
    box(.45,.38,3.4,x,14.3,z+1.7,edge); box(.45,.38,3.4,x,13,z+1.7,edge);
  }
  // Deep colonnade, 36 metre red columns, stacked carved capitals and five bracket tiers.
  for (const x of [-42,-28,-14,14,28,42]) for (const z of [22,-2,-26,-50]) {
    box(4.6,.7,4.6,x,12.35,z,stone); cylinder(4.4,1.4,x,13.4,z,edge);
    cylinder(2.8,34.2,x,31.2,z,red,2.25);
    for (const y of [14.5,15,46.4,47]) cylinder(y<20?2.9:2.5,.22,x,y,z,gold);
    for(let j=0;j<5;j++) {
      box(3+j*.9,.52,2.6+j*.45,x,47.5+j*.65,z,wood);
      box(1.2,.5,4+j*.7,x,47.8+j*.65,z,gold);
    }
  }
  // Beams run through the hall; ceiling coffers are visible from the human camera.
  for (const z of [22,-2,-26,-50]) {
    box(93,2.1,2,0,49,z,red); box(94,.3,2.3,0,50.2,z,gold);
    for(let x=-45;x<=45;x+=3) { box(1.3,.45,5.6,x,50.6,z,wood); box(.5,.3,6.2,x,50.85,z,gold); }
  }
  for (const x of [-42,-28,-14,0,14,28,42]) box(1.5,1.8,77,x,49,-14,wood);
  box(88,.45,72,0,51,-14,dark);
  for (let x=-40;x<=40;x+=8) for(let z=-46;z<20;z+=8) {
    box(7.5,.3,.24,x,50.65,z,gold); box(.24,.3,7.5,x,50.65,z,gold);
  }
  // Recessed door bays and bronze lattice windows; centre remains a real, deep opening.
  for(const x of [-35,-21,21,35]) {
    box(11,26,1,x,26,18,wood);
    box(10,17,.3,x,28,18.7,dark);
    for(let dx=-4.8;dx<=5;dx+=1.2) box(.17,17,.3,x+dx,28,19,gold);
    for(let y=20;y<=36;y+=1.5) box(10,.14,.3,x,y,19,gold);
    box(10,5,.5,x,15.5,19,red);
    for(const dx of [-5.5,5.5]) box(.7,28,1,x+dx,27,19,red);
  }
  box(88,29,1,0,27,-49,red);
  for(const x of [-43.5,43.5]) box(1,29,69,x,27,-15,wood);
  box(26,6,1.6,0,44.5,21,red); box(22,3.7,.2,0,44.5,22,gold); box(21.4,3.1,.25,0,44.5,22.2,wood);
  // A simple original seal motif instead of a font-dependent inscription.
  for(const x of [-6,0,6]) { box(2.3,.2,.35,x,45.3,22.5,gold); box(.2,2,.35,x,44.5,22.5,gold); box(2.3,.2,.35,x,43.8,22.5,gold); }
  // Parametric hipped roofs: curved slopes, lifted corners and physically modelled tile ribs.
  function roofTier(width: number,depth: number,eave: number,ridge: number) {
    const height=(x:number,z:number)=>roofHeight(x,z,width,depth,eave,ridge);
    const mesh=new Mesh('curved-hipped-roof',scene);
    roofVertexData(width,depth,eave,ridge).applyToMesh(mesh);
    roof.backFaceCulling=false;roof.twoSidedLighting=true; add(mesh,roof,0,0,0);
    // Glazed roll tiles on both long slopes. Use a shared geometry batch, not hundreds of draw calls.
    for(let x=-width/2+1;x<width/2;x+=1.55) for(const sign of [-1,1]) {
      const points=Array.from({length:14},(_,j)=>{ const z=sign*(.4+(depth/2-.4)*j/13); return new Vector3(x,height(x,z)+.16,z-14); });
      tube(points,.15,roof);
    }
    for(const sign of [-1,1]) {
      tube(Array.from({length:49},(_,i)=>{const x=-width/2+i*width/48,z=sign*depth/2;return new Vector3(x,height(x,z)+.12,z-14);}),.36,gold);
      tube(Array.from({length:33},(_,i)=>{const z=-depth/2+i*depth/32,x=sign*width/2;return new Vector3(x,height(x,z)+.12,z-14);}),.36,gold);
    }
    tube([new Vector3(-width*.26,ridge+.5,-14),new Vector3(0,ridge+.5,-14),new Vector3(width*.26,ridge+.5,-14)],.55,gold);
    for(const sign of [-1,1]) for(let i=0;i<5;i++) cylinder(.65,1.3+i*.2,sign*(width*.26-i*1.5),ridge+1,-14,gold,.25);
  }
  roofTier(112,88,51.5,64); roofTier(89,62,60,70);
  // Small stone lanterns on the terrace.
  for(const x of [-24,24]) for(const z of [33,-43]) {
    box(2.3,.5,2.3,x,12.25,z,edge); cylinder(1.2,3.5,x,14.2,z,stone);
    box(2,2,2,x,16.4,z,wood); box(1.4,1.5,2.03,x,16.4,z,gold);
    add(CreateCylinder('lantern-cap',{diameterBottom:3.2,diameterTop:.5,height:1.2,tessellation:4},scene),roof,x,18,z).rotation.y=Math.PI/4;
  }
  // A single 1.75 m robed scale figure, not a playable character or collision body.
  const hx=5,hz=35;
  cylinder(.65,1.24,hx,12.62,hz,robe,.33);
  add(CreateSphere('scale-head',{diameter:.26,segments:12},scene),skin,hx,13.55,hz);
  add(CreateSphere('scale-hair',{diameter:.28,segments:12},scene),wood,hx,13.61,hz-.03);
  cylinder(.15,.17,hx,13.665,hz-.03,wood);
  for(const sign of [-1,1]) { const arm=box(.14,.68,.18,hx+sign*.22,13.05,hz,robe); arm.rotation.z=sign*.13; }
  // A continuous low-cost cloud surface avoids intersecting ellipsoid cut-outs and overdraw.
  cloud.emissiveColor = new Color3(.12,.15,.15);cloud.directIntensity=.75;
  const cloudPositions:number[]=[],cloudIndices:number[]=[],cloudNormals:number[]=[];
  const subdivisions=160,extent=2400;
  const lattice=(x:number,z:number):number=>{
    let n=(Math.imul(x,374761393)+Math.imul(z,668265263)+PALACE.seed)|0;
    n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;
  };
  const noise=(x:number,z:number):number=>{
    const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz;
    const u=fx*fx*(3-2*fx),v=fz*fz*(3-2*fz);
    const a=lattice(ix,iz)*(1-u)+lattice(ix+1,iz)*u;
    const b=lattice(ix,iz+1)*(1-u)+lattice(ix+1,iz+1)*u;
    return a*(1-v)+b*v;
  };
  for(let j=0;j<=subdivisions;j++) for(let i=0;i<=subdivisions;i++) {
    const x=(i/subdivisions-.5)*extent,z=(j/subdivisions-.5)*extent;
    const y=-47+28*noise(x/100,z/100)+9*noise(x/44,z/44)+3*noise(x/21,z/21);
    cloudPositions.push(x,y,z);
    if(i<subdivisions&&j<subdivisions) {const a=j*(subdivisions+1)+i;cloudIndices.push(a,a+1,a+subdivisions+1,a+1,a+subdivisions+2,a+subdivisions+1);}
  }
  const sea=new Mesh('seeded-cloud-sea',scene),cloudData=new VertexData();
  VertexData.ComputeNormals(cloudPositions,cloudIndices,cloudNormals);
  cloudData.positions=cloudPositions;cloudData.indices=cloudIndices;cloudData.normals=cloudNormals;cloudData.applyToMesh(sea);
  add(sea,cloud,0,0,0);
  // Static batches reduce draw calls, preserving separate transparent-free cloud depth.
  for(const [material,meshes] of batches) {
    if(!meshes.length) continue;
    const merged=Mesh.MergeMeshes(meshes,true,true,undefined,false,false);
    if(!merged) throw new Error(`Could not batch ${material.name}`);
    merged.name=`palace/${material.name}`;merged.material=material;
    merged.receiveShadows=material!==cloud;
    if(material!==cloud) shadows.addShadowCaster(merged);
    merged.freezeWorldMatrix();
  }
  // Invisible future physics proxies are deliberately not enabled as a second collision engine.
  for(const [name,size,position] of [
    ['terrace',[125,.5,103],[0,11.75,-9]],['hall-roof-envelope',[112,19,88],[0,60.5,-14]],
  ] as const) {
    const proxy=CreateBox(`proxy/${name}`,{width:size[0],height:size[1],depth:size[2]},scene);
    proxy.position.set(position[0],position[1],position[2]);proxy.isVisible=false;proxy.isPickable=false;
    proxy.metadata={ purpose:'future-physics-authoring-only',units:'metres',enabled:false };
  }
}
