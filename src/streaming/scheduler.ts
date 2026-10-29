import type {Vec3} from '../shared/contracts';
import type {Lease,Owned} from '../assets/pool';
import {contains,distance,validateWorld,type StreamingWorld,type Zone} from './zones';
type Task<T>={zone:Zone;lease:Lease<T>;state:'loading'|'prepared'|'ready'|'error';data?:T;active?:Owned<unknown>;error?:string};
/** Loads are cancellable; physics/render adoption happens only on the caller's frame boundary. */
export class ZoneScheduler<T>{
 readonly world:StreamingWorld;private tasks=new Map<string,Task<T>>();private wanted=new Set<string>();private priorities:Zone[]=[];private disposed=false;private blocked:string[]=[];private maxLoading=0;private activations=0;
 constructor(world:StreamingWorld,private load:(zone:Zone)=>Lease<T>,private activate:(zone:Zone,data:T)=>Owned<unknown>,private supports:(zone:Zone,supportId:string)=>boolean){this.world=validateWorld(world);}
 update(position:Vec3,velocity:Vec3,forward:Vec3,supportId:string|null){
  if(this.disposed)return;this.activations=0;
  const aim={x:position.x+(velocity.x+forward.x*10)*this.world.lookAheadSeconds,y:position.y+velocity.y*this.world.lookAheadSeconds,z:position.z+(velocity.z+forward.z*10)*this.world.lookAheadSeconds};
  this.wanted=new Set(this.world.zones.filter(z=>distance(z,position)<=this.world.prefetch||distance(z,aim)<=this.world.prefetch).map(z=>z.id));
  // Existing support is pinned even if a cell is no longer in the predicted working set.
  for(const [id,t]of this.tasks)if(!this.wanted.has(id)&&distance(t.zone,position)>this.world.retention&&!(supportId&&t.state==='ready'&&this.supports(t.zone,supportId))){this.drop(t);}
  const rank=(z:Zone)=>contains(z,position)?-1e9:distance(z,position)+distance(z,aim)*.25;
  this.priorities=this.world.zones.filter(z=>this.wanted.has(z.id)).sort((a,b)=>rank(a)-rank(b)||a.id.localeCompare(b.id));
  for(const z of this.priorities){const t=this.tasks.get(z.id);if(t?.state==='prepared'&&this.activations<this.world.maxActivations){try{t.active=this.activate(z,t.data!);t.state='ready';this.activations++;}catch(e){t.state='error';t.error=String(e);t.lease.release();}}}
  this.pump();
 }
 private pump(){
  if(this.disposed)return;
  for(const z of this.priorities){if(this.tasks.has(z.id))continue;if([...this.tasks.values()].filter(t=>t.state==='loading').length>=this.world.maxLoads)break;
   const lease=this.load(z),t:Task<T>={zone:z,lease,state:'loading'};this.tasks.set(z.id,t);this.maxLoading=Math.max(this.maxLoading,[...this.tasks.values()].filter(t=>t.state==='loading').length);
   lease.ready.then(data=>{if(this.disposed||this.tasks.get(z.id)!==t){lease.release();return;}t.data=data;t.state='prepared';},e=>{if(this.tasks.get(z.id)===t){t.state='error';t.error=String(e);lease.release();}});
  }
 }
 /** Conservative swept cell test, including the entire capsule and a support margin. */
 permits(from:Vec3,to:Vec3){
  this.blocked=[];const min=[Math.min(from.x,to.x)-.5,Math.min(from.y,to.y)-1.2,Math.min(from.z,to.z)-.5],max=[Math.max(from.x,to.x)+.5,Math.max(from.y,to.y)+1.2,Math.max(from.z,to.z)+.5];
  for(const z of this.world.zones)if(z.min.every((v,i)=>v<=max[i]&&z.max[i]>=min[i])&&this.tasks.get(z.id)?.state!=='ready')this.blocked.push(z.id);
  const covered=this.world.zones.some(z=>contains(z,to));return covered&&this.blocked.length===0;
 }
 retry(){for(const t of [...this.tasks.values()])if(t.state==='error')this.drop(t);this.pump();}
 private drop(t:Task<T>){if(this.tasks.get(t.zone.id)!==t)return;this.tasks.delete(t.zone.id);t.active?.dispose();t.lease.release();}
 observe(){return {disposed:this.disposed,blocked:[...this.blocked],maxLoading:this.maxLoading,activations:this.activations,zones:[...this.tasks.values()].map(t=>({id:t.zone.id,state:t.state,error:t.error})),ready:[...this.tasks.values()].filter(t=>t.state==='ready').map(t=>t.zone.id)};}
 dispose(){if(this.disposed)return;this.disposed=true;for(const t of [...this.tasks.values()])this.drop(t);this.wanted.clear();this.priorities=[];this.blocked=[];}
}
