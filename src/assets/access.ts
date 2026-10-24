import {localPath,validateRegistry,type Registry} from './schema.mjs';
import {ResourcePool,type Lease,type Owned} from './pool';
export interface AssetAccess{read(uri:string,signal:AbortSignal):Promise<Uint8Array>}
export class HttpAssets implements AssetAccess{
 constructor(private base:URL){}
 async read(uri:string,signal:AbortSignal){const url=new URL(localPath(uri),this.base);if(url.origin!==this.base.origin||!url.pathname.startsWith(this.base.pathname))throw Error('Asset escaped content root');const response=await fetch(url,{signal,cache:'no-store'});if(!response.ok)throw Error(`Asset read failed: ${uri} (HTTP ${response.status})`);return new Uint8Array(await response.arrayBuffer());}
}
export class EmbeddedAssets implements AssetAccess{
 constructor(private files:ReadonlyMap<string,Uint8Array>){}
 async read(uri:string,signal:AbortSignal){localPath(uri);if(signal.aborted)throw new DOMException('Cancelled','AbortError');const data=this.files.get(uri);if(!data)throw Error('Embedded asset missing: '+uri);return data.slice();}
}
export async function digest(bytes:Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes)))).map(n=>n.toString(16).padStart(2,'0')).join('');}
export class AssetScope{
 readonly registry:Registry;private bytes=new ResourcePool<Uint8Array>();private resources=new ResourcePool<unknown>();private leases:Array<Lease<unknown>>=[];private disposed=false;
 constructor(registry:unknown,private access:AssetAccess){this.registry=validateRegistry(registry);}
 static async open(uri:string,access:AssetAccess,signal:AbortSignal){const bytes=await access.read(uri,signal);return new AssetScope(JSON.parse(new TextDecoder().decode(bytes)),access);}
 acquire(id:string):Lease<Uint8Array>{
  const asset=this.registry.assets.find(a=>a.id===id);if(!asset)throw Error('Unknown asset '+id);
  return this.bytes.acquire(id,async signal=>{
   const deps=asset.dependencies.map(id=>this.acquire(id)),release=()=>deps.forEach(d=>d.release());
   signal.addEventListener('abort',release,{once:true});
   try{if(signal.aborted){release();throw new DOMException('Cancelled','AbortError');}await Promise.all(deps.map(d=>d.ready));const data=await this.access.read(asset.uri,signal);if(await digest(data)!==asset.sha256)throw Error('Asset hash mismatch: '+id);return {value:data,dispose:()=>{signal.removeEventListener('abort',release);release();}};}
   catch(error){signal.removeEventListener('abort',release);release();throw error;}
  });
 }
 hold(id:string){if(this.disposed)throw Error('Asset scope disposed');const l=this.acquire(id);this.leases.push(l);return l.ready;}
 own<T>(key:string,load:(signal:AbortSignal)=>Promise<Owned<T>>):Promise<T>{if(this.disposed)throw Error('Asset scope disposed');const l=this.resources.acquire(key,load);this.leases.push(l);return l.ready as Promise<T>;}
 observe(){return {bytes:this.bytes.observe(),decoded:this.resources.observe(),scopeLeases:this.leases.length};}
 dispose(){if(this.disposed)return;this.disposed=true;for(const l of this.leases.reverse())l.release();this.leases=[];this.resources.dispose();this.bytes.dispose();}
}
