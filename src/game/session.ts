import RAPIER from '@dimforge/rapier3d-compat';
import type {LocalSession,PlayerIntent,PlayerState,Vec3} from '../shared/contracts';
import {PLAYER,terrain,type TerrainShape} from './terrain';
let initialized:Promise<void>|null=null;
const freezeState=(s:PlayerState):PlayerState=>Object.freeze({...s,position:Object.freeze({...s.position}),velocity:Object.freeze({...s.velocity})});
export class GroundSession implements LocalSession {
 static instances=0;
 private state:PlayerState;
 private disposed=false;
 private ids=new Map<number,string>();
 private readonly body:RAPIER.RigidBody;
 private readonly capsule:RAPIER.Collider;
 private readonly controller:RAPIER.KinematicCharacterController;
 private readonly world:RAPIER.World;
 readonly shapes:readonly TerrainShape[];
 readonly dt=1/PLAYER.hz;
 static async create(kind:'palace'|'fixture',spawn:Vec3):Promise<GroundSession>{
  initialized??=RAPIER.init();await initialized;return new GroundSession(kind,spawn);
 }
 private constructor(kind:'palace'|'fixture',spawn:Vec3){
  this.world=new RAPIER.World({x:0,y:-PLAYER.gravity,z:0});this.world.timestep=this.dt;
  this.shapes=terrain(kind);
  for(const shape of this.shapes){
   const [hx,hy,hz]=shape.size.map(v=>v/2);
   // Closed static triangle boxes provide exact planar normals for a small capsule on giant floors.
   // Very large convex boxes can return grazing GJK normals and intermittently consume lateral motion.
   const d=shape.kind==='box'?RAPIER.ColliderDesc.trimesh(new Float32Array([-hx,-hy,-hz,hx,-hy,-hz,hx,hy,-hz,-hx,hy,-hz,-hx,-hy,hz,hx,-hy,hz,hx,hy,hz,-hx,hy,hz]),new Uint32Array([0,2,1,0,3,2,4,5,6,4,6,7,0,7,3,0,4,7,1,2,6,1,6,5,3,7,6,3,6,2,0,1,5,0,5,4]),RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES):RAPIER.ColliderDesc.cylinder(shape.size[1]/2,shape.size[0]);
   d.setTranslation(...shape.centre);if(shape.angleX)d.setRotation({x:Math.sin(shape.angleX/2),y:0,z:0,w:Math.cos(shape.angleX/2)});
   this.ids.set(this.world.createCollider(d).handle,shape.id);
  }
  this.body=this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x,spawn.y,spawn.z));
  this.capsule=this.world.createCollider(RAPIER.ColliderDesc.capsule(PLAYER.halfSegment,PLAYER.radius).setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL),this.body);
  this.controller=this.world.createCharacterController(PLAYER.skin);
  this.controller.enableAutostep(PLAYER.maxStep,.25,false);this.controller.enableSnapToGround(PLAYER.snap);
  this.controller.setMaxSlopeClimbAngle(PLAYER.maxSlopeDegrees*Math.PI/180);this.controller.setMinSlopeSlideAngle(PLAYER.minSlideDegrees*Math.PI/180);
  this.world.step();
  this.state=freezeState({id:'local-player',tick:0,position:{...spawn},velocity:{x:0,y:0,z:0},yaw:0,mode:'falling',supportId:null});
  GroundSession.instances++;
 }
 get snapshot():PlayerState{return this.state;}
 step(intent:PlayerIntent):void{
  if(this.disposed)throw new Error('Session disposed');
  const previous=this.state;
  if(![intent.movement.x,intent.movement.y,intent.movement.z].every(Number.isFinite)||intent.movement.y!==0||intent.flightRequest)throw new Error('Invalid ground intent');
  const length=Math.hypot(intent.movement.x,intent.movement.z),scale=PLAYER.speed*this.dt/Math.max(1,length);
  const yaw=length>.001?Math.atan2(intent.movement.x,-intent.movement.z):previous.yaw;
  const vy=previous.mode==='grounded'?-PLAYER.gravity*this.dt:Math.max(-60,previous.velocity.y-PLAYER.gravity*this.dt);
  this.controller.computeColliderMovement(this.capsule,{x:intent.movement.x*scale,y:vy*this.dt,z:intent.movement.z*scale},RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
  const move=this.controller.computedMovement(),old=this.body.translation();
  this.body.setNextKinematicTranslation({x:old.x+move.x,y:old.y+move.y,z:old.z+move.z});
  this.world.step();
  const position=this.body.translation(),grounded=this.controller.computedGrounded();
  let supportId:string|null=null;
  if(grounded){
   const hit=this.world.castRay(new RAPIER.Ray(position,{x:0,y:-1,z:0}),PLAYER.height/2+PLAYER.snap+.1,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,this.capsule,this.body);
   if(hit)supportId=this.ids.get(hit.collider.handle)||null;
   for(let i=0;!supportId&&i<this.controller.numComputedCollisions();i++){
    const contact=this.controller.computedCollision(i);if(contact?.collider&&contact.normal1.y>.5)supportId=this.ids.get(contact.collider.handle)||null;
   }
  }
  const supported=grounded&&supportId!==null;
  this.commitSimulationResult(previous.tick,{...previous,tick:previous.tick+1,position,velocity:{x:(position.x-old.x)/this.dt,y:supported?0:(position.y-old.y)/this.dt,z:(position.z-old.z)/this.dt},yaw,mode:supported?'grounded':'falling',supportId:supported?supportId:null});
 }
 commitSimulationResult(previousTick:number,result:PlayerState):void{
  if(this.disposed||previousTick!==this.state.tick||result.tick!==previousTick+1||result.id!==this.state.id)throw new Error('Stale or invalid simulation commit');
  const values=[...Object.values(result.position),...Object.values(result.velocity),result.yaw];if(!values.every(Number.isFinite))throw new Error('Non-finite state');
  const physical=this.body.translation();if(Math.hypot(result.position.x-physical.x,result.position.y-physical.y,result.position.z-physical.z)>.001)throw new Error('Commit differs from physics result');
  this.state=freezeState(result);
 }
 observe(){
  if(this.disposed)return Object.freeze({active:false});
  const p=this.body.translation(),q=this.body.rotation(),shape=this.capsule.shape as RAPIER.Capsule;let penetration=0;
  this.world.contactPairsWith(this.capsule,other=>this.world.contactPair(this.capsule,other,manifold=>{for(let i=0;i<manifold.numContacts();i++)penetration=Math.max(penetration,-manifold.contactDist(i));}));
  return Object.freeze({active:true,tick:this.state.tick,position:JSON.stringify(this.state.position),physicalPosition:JSON.stringify(p),capsuleAxis:Math.hypot(q.x,q.z)<1e-6?"+Y":"tilted",capsuleHeightMeters:2*(shape.halfHeight+shape.radius),mode:this.state.mode,supportId:this.state.supportId,velocity:JSON.stringify(this.state.velocity),penetration,colliders:this.world.colliders.len(),bodyCount:this.world.bodies.len(),controllerCount:this.world.characterControllers.size});
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.world.removeCharacterController(this.controller);this.world.free();this.ids.clear();GroundSession.instances--;}
}
export const idleIntent=(sequence=0):PlayerIntent=>({sequence,movement:{x:0,y:0,z:0},viewDelta:{yaw:0,pitch:0},flightRequest:null,interactionRequest:null});
