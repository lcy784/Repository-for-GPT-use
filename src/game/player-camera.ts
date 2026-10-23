import {FreeCamera} from '@babylonjs/core/Cameras/freeCamera';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import type {Scene} from '@babylonjs/core/scene';
import type {GroundSession} from './session';
import type {PlayerState} from '../shared/contracts';
export const CAMERA=Object.freeze({eyeOffset:.725,defaultDistance:6,minDistance:2,maxDistance:12,radius:.16,nearPlane:.05,dragSensitivity:.005,restoreRate:7});
export class PlayerCamera {
 readonly camera:FreeCamera;
 private mode:'first'|'third'='third';
 private yaw:number;
 private pitch=-.25;
 private desiredDistance:number;
 private distance:number;
 private blocker:string|null=null;
 private toggles=0;
 private remove:(()=>void)[]=[];
 private dragging=false;
 private pointerId:number|null=null;
 private vHeld=false;
 constructor(scene:Scene,private readonly canvas:HTMLCanvasElement,private readonly session:GroundSession,distance:number=CAMERA.defaultDistance,initialOffset?:readonly number[]){
  this.desiredDistance=distance;this.distance=distance;
  this.yaw=initialOffset?Math.atan2(-initialOffset[0],initialOffset[2]):0;
  if(initialOffset)this.pitch=-Math.atan2(initialOffset[1]-CAMERA.eyeOffset,Math.hypot(initialOffset[0],initialOffset[2]));
  this.camera=new FreeCamera('player-view',Vector3.Zero(),scene);this.camera.minZ=CAMERA.nearPlane;this.camera.maxZ=3000;this.camera.fov=Math.PI/3;
  const listen=(target:EventTarget,type:string,handler:EventListener,options?:AddEventListenerOptions)=>{target.addEventListener(type,handler,options);this.remove.push(()=>target.removeEventListener(type,handler,options));};
  listen(canvas,'pointerdown',event=>{const e=event as PointerEvent;if(e.button!==0)return;canvas.focus({preventScroll:true});this.dragging=true;this.pointerId=e.pointerId;canvas.setPointerCapture(e.pointerId);});
  listen(canvas,'pointermove',event=>{const e=event as PointerEvent;if(!this.dragging)return;this.yaw+=e.movementX*CAMERA.dragSensitivity;this.pitch=Math.max(-1.35,Math.min(1.35,this.pitch-e.movementY*CAMERA.dragSensitivity));});
  listen(canvas,'pointerup',()=>this.releasePointer());listen(canvas,'lostpointercapture',()=>{this.dragging=false;this.pointerId=null;});
  listen(canvas,'wheel',event=>{const e=event as WheelEvent;e.preventDefault();this.desiredDistance=Math.max(CAMERA.minDistance,Math.min(CAMERA.maxDistance,this.desiredDistance+e.deltaY*.008));},{passive:false});
  listen(window,'keydown',event=>{const e=event as KeyboardEvent;if(document.activeElement!==canvas||e.code!=='KeyV')return;e.preventDefault();if(!e.repeat&&!this.vHeld)this.toggle();this.vHeld=true;});
  listen(window,'keyup',event=>{if((event as KeyboardEvent).code==='KeyV')this.vHeld=false;});
  const clear=()=>{this.vHeld=false;this.releasePointer();};
  listen(window,'blur',clear);listen(canvas,'blur',clear);listen(document,'visibilitychange',()=>{if(document.hidden)clear();});
  this.update(session.snapshot,0);
 }
 private releasePointer(){if(this.pointerId!==null&&this.canvas.hasPointerCapture(this.pointerId))this.canvas.releasePointerCapture(this.pointerId);this.pointerId=null;this.dragging=false;}
 toggle(){this.mode=this.mode==='third'?'first':'third';this.toggles++;this.update(this.session.snapshot,0);}
 forward(){return Object.freeze({x:Math.sin(this.yaw),z:-Math.cos(this.yaw)});}
 update(state:PlayerState,dt:number){
  const eye=new Vector3(state.position.x,state.position.y+CAMERA.eyeOffset,state.position.z);
  const forward=new Vector3(Math.sin(this.yaw)*Math.cos(this.pitch),Math.sin(this.pitch),-Math.cos(this.yaw)*Math.cos(this.pitch));
  if(this.mode==='first'){this.camera.position.copyFrom(eye);this.camera.setTarget(eye.add(forward));this.blocker=null;return;}
  const desired=eye.subtract(forward.scale(this.desiredDistance));
  const query=this.session.cameraObstruction(eye,desired,CAMERA.radius);this.blocker=query.colliderId;
  const allowed=Math.min(this.desiredDistance,query.distance);
  this.distance=allowed<this.distance?allowed:this.distance+(allowed-this.distance)*(1-Math.exp(-CAMERA.restoreRate*Math.max(0,dt)));
  this.camera.position.copyFrom(eye.subtract(forward.scale(this.distance)));this.camera.setTarget(eye);
 }
 get avatarVisible(){return this.mode==='third'&&this.distance>.7;}
 get perspective(){return this.mode;}
 observe(){return Object.freeze({mode:this.mode,yaw:this.yaw,pitch:this.pitch,desiredDistance:this.desiredDistance,distance:this.mode==='first'?0:this.distance,blocker:this.blocker,toggles:this.toggles,listeners:this.remove.length,dragging:this.dragging});}
 dispose(){this.releasePointer();for(const remove of this.remove.splice(0))remove();this.camera.dispose();}
}
