import {Scene} from '@babylonjs/core/scene';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {LoadAssetContainerAsync} from '@babylonjs/core/Loading/sceneLoader';
import type {AssetContainer} from '@babylonjs/core/assetContainer';
import type {AnimationGroup} from '@babylonjs/core/Animations/animationGroup';
import '@babylonjs/loaders/glTF';
import type {PlayerState} from '../shared/contracts';

export type AvatarAction='idle'|'walk'|'fly'|'fall';
export const avatarAction=(state:PlayerState):AvatarAction=>state.mode==='flying'?'fly':state.mode==='falling'?'fall':Math.hypot(state.velocity.x,state.velocity.z)>.1?'walk':'idle';
export class AvatarView {
 static instances=0;
 readonly root:TransformNode;
 private readonly groups:AnimationGroup[];
 private action:AvatarAction='idle';
 private weights:Record<AvatarAction,number>={idle:1,walk:0,fly:0,fall:0};
 private time=0;
 private disposed=false;
 private visible=true;
 private readonly body:TransformNode;
 private constructor(private readonly container:AssetContainer,scene:Scene){
  container.addAllToScene();this.groups=container.animationGroups;
  this.root=new TransformNode('p05-player',scene);this.body=new TransformNode('p05-model-origin',scene);this.body.parent=this.root;this.body.position.y=-.875;
  for(const node of container.rootNodes)if(node instanceof TransformNode)node.parent=this.body;
  for(const mesh of container.meshes){mesh.isPickable=false;mesh.receiveShadows=true;}
  const bounds=this.root.getHierarchyBoundingVectors(true);const height=bounds.max.y-bounds.min.y;
  if(Math.abs(height-1.75)>.001)throw new Error(`Invalid avatar height: ${height}`);
  this.root.metadata={visualHeightMeters:height};
  if(this.groups.length!==4||!['idle','walk','fly','fall'].every(name=>this.groups.some(g=>g.name===name)))throw new Error('Missing avatar animation clips');
  for(const group of this.groups){group.stop();group.start(true);group.pause();group.setWeightForAllAnimatables(group.name==='idle'?1:0);}
  AvatarView.instances++;
 }
 static async load(scene:Scene,source:string|Uint8Array):Promise<AvatarView>{
  const container=await LoadAssetContainerAsync(source,scene,{pluginExtension:'.glb',pluginOptions:{gltf:{animationStartMode:0}}});
  if(scene.isDisposed){container.dispose();throw new Error('Avatar scene was disposed while loading');}
  try{return new AvatarView(container,scene);}catch(error){container.dispose();throw error;}
 }
 update(state:PlayerState,dt:number){
  if(this.disposed)return;
  this.root.position.set(state.position.x,state.position.y,state.position.z);
  // The authored model faces -Z; simulation yaw uses atan2(x, -z).
  this.root.rotation.y=-state.yaw;
  this.action=avatarAction(state);this.time+=Math.max(0,dt);
  const blend=1-Math.exp(-Math.max(0,dt)/.12);
  for(const key of Object.keys(this.weights) as AvatarAction[])this.weights[key]+=(Number(key===this.action)-this.weights[key])*blend;
  const total=Object.values(this.weights).reduce((a,b)=>a+b,0);
  for(const group of this.groups){
   const name=group.name as AvatarAction;this.weights[name]/=total;
   group.setWeightForAllAnimatables(this.weights[name]);
   group.goToFrame(group.from+(this.time%1)*(group.to-group.from),true);
  }
 }
 setVisible(visible:boolean){this.visible=visible;this.root.setEnabled(visible);}
 observe(){
  if(this.disposed)return Object.freeze({active:false});
  const joints=this.container.transformNodes.filter(n=>/shoulder|hip$|knee/.test(n.name)).map(n=>({name:n.name,rotation:n.rotationQuaternion?.asArray()||n.rotation.asArray()}));
  return Object.freeze({active:true,action:this.action,weights:Object.freeze({...this.weights}),visible:this.visible,enabledMeshes:this.container.meshes.filter(m=>m.isEnabled()).length,time:this.time,joints,meshes:this.container.meshes.length,groups:this.groups.length,rootOffset:this.body.position.asArray(),heightMeters:this.root.metadata.visualHeightMeters,facing:{x:Math.sin(-this.root.rotation.y),z:-Math.cos(this.root.rotation.y)}});
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.container.dispose();this.root.dispose();AvatarView.instances--;}
}
