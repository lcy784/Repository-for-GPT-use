import RAPIER from '@dimforge/rapier3d-compat';
import type {LocalSession,MovementEvent,PlayerIntent,PlayerState,Vec3} from '../shared/contracts';
import {PLAYER,terrain} from './terrain';
import {createTerrainCollider,type CollisionShape} from './collision';
import {flightTerrain} from './flight-terrain';
import {journeyTerrain} from './journey';
import {cameraTerrain} from './camera-terrain';

export const FLIGHT=Object.freeze({speed:10,maxSpeed:60,terminalFallSpeed:60,maxSweepDistance:.2,recoveryBelowY:-80,safeGroundTicks:30});
type Options=Readonly<{flight?:boolean;flightSpeed?:number}>;
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
 private readonly flightEnabled:boolean;
 private readonly flightSpeed:number;
 private safePosition:Vec3;
 private safeYaw=0;
 private stableTicks=0;
 private eventLog:readonly MovementEvent[]=Object.freeze([]);
 private lastSubsteps=0;
 private maxSubsteps=0;
 private maxSweepDistance=0;
 private recoveryCount=0;
 readonly shapes:readonly CollisionShape[];
 readonly dt=1/PLAYER.hz;

 static async create(kind:'palace'|'fixture'|'camera-fixture'|'journey',spawn:Vec3,options:Options={}):Promise<GroundSession>{
  if(!Object.values(spawn).every(Number.isFinite))throw new Error('Invalid spawn');
  if(options.flightSpeed!==undefined&&(!Number.isFinite(options.flightSpeed)||options.flightSpeed<=0||options.flightSpeed>FLIGHT.maxSpeed))throw new Error('Invalid flight speed');
  initialized??=RAPIER.init();await initialized;return new GroundSession(kind,spawn,options);
 }
 private constructor(kind:'palace'|'fixture'|'camera-fixture'|'journey',spawn:Vec3,options:Options){
  this.flightEnabled=options.flight===true;this.flightSpeed=options.flightSpeed??FLIGHT.speed;
  this.safePosition=Object.freeze({...spawn});
  this.world=new RAPIER.World({x:0,y:-PLAYER.gravity,z:0});this.world.timestep=this.dt;
  this.shapes=kind==='journey'?journeyTerrain():kind==='camera-fixture'?cameraTerrain():this.flightEnabled?flightTerrain(kind):terrain(kind);
  for(const shape of this.shapes)this.ids.set(this.world.createCollider(createTerrainCollider(shape)).handle,shape.id);
  this.body=this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x,spawn.y,spawn.z));
  this.capsule=this.world.createCollider(RAPIER.ColliderDesc.capsule(PLAYER.halfSegment,PLAYER.radius).setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL),this.body);
  this.controller=this.world.createCharacterController(PLAYER.skin);
  this.groundConstraints();
  this.controller.setMaxSlopeClimbAngle(PLAYER.maxSlopeDegrees*Math.PI/180);this.controller.setMinSlopeSlideAngle(PLAYER.minSlideDegrees*Math.PI/180);
  this.world.step();
  this.state=freezeState({id:'local-player',tick:0,position:{...spawn},velocity:{x:0,y:0,z:0},yaw:0,mode:'falling',supportId:null});
  GroundSession.instances++;
 }
 private groundConstraints(){this.controller.enableAutostep(PLAYER.maxStep,.25,false);this.controller.enableSnapToGround(PLAYER.snap);}
 get snapshot():PlayerState{return this.state;}
 get events():readonly MovementEvent[]{return this.eventLog;}
 /** Read-only sphere sweep for camera clearance; excludes the controlled capsule. */
 cameraObstruction(origin:Vec3,end:Vec3,radius=.16):Readonly<{distance:number;colliderId:string|null}>{
  if(this.disposed)throw new Error('Session disposed');
  if(![origin.x,origin.y,origin.z,end.x,end.y,end.z,radius].every(Number.isFinite)||radius<=0)throw new Error('Invalid camera query');
  const delta={x:end.x-origin.x,y:end.y-origin.y,z:end.z-origin.z},length=Math.hypot(delta.x,delta.y,delta.z);
  if(length<1e-8)return Object.freeze({distance:0,colliderId:null});
  const hit=this.world.castShape(origin,{x:0,y:0,z:0,w:1},{x:delta.x/length,y:delta.y/length,z:delta.z/length},new RAPIER.Ball(radius),.02,length,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,this.capsule,this.body);
  return Object.freeze({distance:hit?Math.max(0,hit.time_of_impact-.03):length,colliderId:hit?this.ids.get(hit.collider.handle)||null:null});
 }
 private event(kind:MovementEvent['kind'],from:PlayerState['mode']){
  const state=this.state;
  this.eventLog=Object.freeze([...this.eventLog,Object.freeze({tick:state.tick,kind,from,to:state.mode,position:state.position,supportId:state.supportId})].slice(-128));
 }
 private support(position:Vec3):string|null{
  const hit=this.world.castRay(new RAPIER.Ray(position,{x:0,y:-1,z:0}),PLAYER.height/2+PLAYER.snap+.1,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,this.capsule,this.body);
  let id=hit?this.ids.get(hit.collider.handle)||null:null;
  for(let i=0;!id&&i<this.controller.numComputedCollisions();i++){
   const contact=this.controller.computedCollision(i);if(contact?.collider&&contact.normal1.y>.5)id=this.ids.get(contact.collider.handle)||null;
  }
  return id;
 }
 private rememberSafePosition(){
  if(this.state.mode!=='grounded'){this.stableTicks=0;return;}
  this.stableTicks++;
  if(this.stableTicks<FLIGHT.safeGroundTicks)return;
  const p=this.state.position,margin=PLAYER.radius+.1;
  for(const [x,z] of [[margin,0],[-margin,0],[0,margin],[0,-margin]]){
   const hit=this.world.castRayAndGetNormal(new RAPIER.Ray({x:p.x+x,y:p.y,z:p.z+z},{x:0,y:-1,z:0}),PLAYER.height/2+.3,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,this.capsule,this.body);
   if(!hit||hit.normal.y<Math.cos(PLAYER.maxSlopeDegrees*Math.PI/180))return;
  }
  this.safePosition=p;this.safeYaw=this.state.yaw;
 }
 step(intent:PlayerIntent):void{
  if(this.disposed)throw new Error('Session disposed');
  if(![intent.movement.x,intent.movement.y,intent.movement.z].every(Number.isFinite)||![null,'start','stop'].includes(intent.flightRequest))throw new Error('Invalid movement intent');
  if(!this.flightEnabled&&(intent.movement.y!==0||intent.flightRequest))throw new Error('Invalid ground intent');
  const previous=this.state;
  let flying=previous.mode==='flying';
  if(intent.flightRequest==='start')flying=true;
  if(intent.flightRequest==='stop')flying=false;
  const horizontal=Math.hypot(intent.movement.x,intent.movement.z);
  const yaw=horizontal>.001?Math.atan2(intent.movement.x,-intent.movement.z):previous.yaw;
  const length=flying?Math.hypot(horizontal,intent.movement.y):horizontal;
  const scale=(flying?this.flightSpeed:PLAYER.speed)*this.dt/Math.max(1,length);
  // Flight has direct, drift-free control; exiting it starts a gravity-driven fall.
  const vy=previous.mode==='grounded'?0:previous.mode==='flying'?-PLAYER.gravity*this.dt:Math.max(-FLIGHT.terminalFallSpeed,previous.velocity.y-PLAYER.gravity*this.dt);
  const desired={x:intent.movement.x*scale,y:flying?intent.movement.y*scale:vy*this.dt,z:intent.movement.z*scale};
  if(flying){this.controller.disableAutostep();this.controller.disableSnapToGround();}else this.groundConstraints();
  const old={...this.body.translation()};
  const substeps=this.flightEnabled?Math.max(1,Math.ceil(Math.hypot(desired.x,desired.y,desired.z)/FLIGHT.maxSweepDistance)):1;
  this.lastSubsteps=substeps;this.maxSubsteps=Math.max(this.maxSubsteps,substeps);
  this.maxSweepDistance=Math.max(this.maxSweepDistance,Math.hypot(desired.x,desired.y,desired.z)/substeps);
  this.world.timestep=this.dt/substeps;
  for(let i=0;i<substeps;i++){
   this.controller.computeColliderMovement(this.capsule,{x:desired.x/substeps,y:desired.y/substeps,z:desired.z/substeps},RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
   const move=this.controller.computedMovement(),at=this.body.translation();
   this.body.setNextKinematicTranslation({x:at.x+move.x,y:at.y+move.y,z:at.z+move.z});
   this.world.step();
  }
  this.world.timestep=this.dt;
  const position={...this.body.translation()};
  const supportId=this.controller.computedGrounded()?this.support(position):null;
  const supported=supportId!==null&&(!flying||intent.movement.y<0);
  const mode=supported?'grounded':flying?'flying':'falling';
  if(this.flightEnabled&&position.y<FLIGHT.recoveryBelowY){
   this.body.setTranslation(this.safePosition,true);this.body.setNextKinematicTranslation(this.safePosition);this.world.step();
   this.commitSimulationResult(previous.tick,{...previous,tick:previous.tick+1,position:this.body.translation(),velocity:{x:0,y:0,z:0},yaw:this.safeYaw,mode:'falling',supportId:null});
   this.stableTicks=0;this.recoveryCount++;this.event('recovered',previous.mode);
  }else{
   this.commitSimulationResult(previous.tick,{...previous,tick:previous.tick+1,position,velocity:{x:(position.x-old.x)/this.dt,y:supported?0:(position.y-old.y)/this.dt,z:(position.z-old.z)/this.dt},yaw,mode,supportId:supported?supportId:null});
   if(this.flightEnabled)this.rememberSafePosition();
   if(mode==='flying'&&previous.mode!=='flying')this.event('takeoff',previous.mode);
   if(previous.mode==='flying'&&!flying)this.event('flight-stopped',previous.mode);
   if(supported&&previous.mode!=='grounded')this.event('landed',previous.mode);
  }
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
  return Object.freeze({active:true,tick:this.state.tick,position:JSON.stringify(this.state.position),physicalPosition:JSON.stringify(p),capsuleAxis:Math.hypot(q.x,q.z)<1e-6?'+Y':'tilted',capsuleHeightMeters:2*(shape.halfHeight+shape.radius),mode:this.state.mode,supportId:this.state.supportId,velocity:JSON.stringify(this.state.velocity),penetration,colliders:this.world.colliders.len(),bodyCount:this.world.bodies.len(),controllerCount:this.world.characterControllers.size,
   flightEnabled:this.flightEnabled,flightSpeed:this.flightSpeed,lastSubsteps:this.lastSubsteps,maxSubsteps:this.maxSubsteps,maxSweepDistance:this.maxSweepDistance,recoveryCount:this.recoveryCount,safePosition:this.safePosition,events:this.events});
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.world.removeCharacterController(this.controller);this.world.free();this.ids.clear();GroundSession.instances--;}
}
export const idleIntent=(sequence=0):PlayerIntent=>({sequence,movement:{x:0,y:0,z:0},viewDelta:{yaw:0,pitch:0},flightRequest:null,interactionRequest:null});
