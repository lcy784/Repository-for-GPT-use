export type Owned<T>={value:T;dispose:()=>void};
export type Lease<T>={ready:Promise<T>;release:()=>void};
type Entry<T>={refs:number;state:'loading'|'ready'|'failed';controller:AbortController;task:Promise<Owned<T>>;resource?:Owned<T>};
const cancelled=()=>new DOMException('Asset consumer cancelled','AbortError');
/** Each consumer owns one lease. A cancelled generation can never replace a new one. */
export class ResourcePool<T>{
 private entries=new Map<string,Entry<T>>();private leases=new Set<()=>void>();private disposed=false;private loads=0;private lateDisposed=0;
 acquire(key:string,load:(signal:AbortSignal)=>Promise<Owned<T>>):Lease<T>{
  if(this.disposed)throw Error('Asset pool disposed');
  let entry=this.entries.get(key);
  if(entry?.state==='failed'){this.entries.delete(key);entry=undefined;}
  if(!entry){
   const fresh:Entry<T>={refs:0,state:'loading',controller:new AbortController(),task:null!};entry=fresh;this.entries.set(key,fresh);this.loads++;
   fresh.task=Promise.resolve().then(()=>load(fresh.controller.signal)).then(resource=>{
    if(this.disposed||fresh.controller.signal.aborted||this.entries.get(key)!==fresh||fresh.refs===0){resource.dispose();this.lateDisposed++;throw cancelled();}
    fresh.resource=resource;fresh.state='ready';return resource;
   }).catch(error=>{fresh.state='failed';if(this.entries.get(key)===fresh)this.entries.delete(key);throw error;}).finally(()=>{this.loads--;});
   void fresh.task.catch(()=>{});
  }
  const held=entry;held.refs++;let active=true,rejectLease:(reason:unknown)=>void=()=>{};
  const ready=new Promise<T>((resolve,reject)=>{rejectLease=reject;held.task.then(r=>{if(active)resolve(r.value);},e=>{if(active)reject(e);});});void ready.catch(()=>{});
  const release=()=>{if(!active)return;active=false;this.leases.delete(release);rejectLease(cancelled());held.refs--;if(held.refs===0){held.controller.abort();if(this.entries.get(key)===held)this.entries.delete(key);held.resource?.dispose();held.resource=undefined;}};
  this.leases.add(release);return {ready,release};
 }
 observe(){return {entries:this.entries.size,references:this.leases.size,ready:[...this.entries.values()].filter(e=>e.state==='ready').length,loading:this.loads,lateDisposed:this.lateDisposed};}
 dispose(){if(this.disposed)return;this.disposed=true;for(const release of [...this.leases])release();for(const e of this.entries.values()){e.controller.abort();e.resource?.dispose();e.resource=undefined;}this.entries.clear();}
}
