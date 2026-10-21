import {Scene} from '@babylonjs/core/scene';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {CreateBox} from '@babylonjs/core/Meshes/Builders/boxBuilder';
import {CreateCylinder} from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import {CreateSphere} from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {HemisphericLight} from '@babylonjs/core/Lights/hemisphericLight';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import type {TerrainShape} from './terrain';
export function createGroundView(scene:Scene,shapes:readonly TerrainShape[],fixture:boolean):TransformNode{
 const material=(name:string,color:string)=>{const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor=new Color3(.12,.12,.12);return m;};
 const stone=material('walk-limestone','#d8d4bb'),red=material('walk-footboard','#641e19'),robe=material('player-robe','#e5e9d5'),jade=material('player-jade','#235e50'),hair=material('player-hair','#212523');
 if(fixture){new HemisphericLight('fixture-daylight',new Vector3(.3,1,.2),scene).intensity=1.3;}
 for(const shape of shapes){if(!shape.render)continue;const mesh=CreateBox(`walk/${shape.id}`,{width:shape.size[0],height:shape.size[1],depth:shape.size[2]},scene);mesh.position.set(...shape.centre);mesh.rotation.x=shape.angleX||0;mesh.material=shape.id.startsWith('front-footboard')?red:stone;mesh.receiveShadows=true;}
 const root=new TransformNode('ground-player',scene);
 const body=CreateCylinder('player-robe',{height:1.25,diameterTop:.32,diameterBottom:.62,tessellation:12},scene);body.parent=root;body.position.y=-.25;body.material=robe;
 const head=CreateSphere('player-head',{diameter:.27,segments:12},scene);head.parent=root;head.position.y=.66;head.material=hair;
 const bun=CreateSphere('player-bun',{diameter:.12,segments:8},scene);bun.parent=root;bun.position.y=.815;bun.material=hair;
 const belt=CreateCylinder('player-jade-belt',{height:.08,diameter:.42,tessellation:12},scene);belt.parent=root;belt.position.y=.1;belt.material=jade;
 let min=Infinity,max=-Infinity;for(const mesh of root.getChildMeshes()){mesh.computeWorldMatrix(true);const b=mesh.getBoundingInfo().boundingBox;min=Math.min(min,b.minimumWorld.y);max=Math.max(max,b.maximumWorld.y);}
 root.metadata={visualHeightMeters:max-min};
 return root;
}
