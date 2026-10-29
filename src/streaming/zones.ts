import type {Vec3} from '../shared/contracts';
export type Point=readonly [number,number,number];
export type Zone={id:string;min:Point;max:Point;assetId:string;label:string};
export type StreamingWorld={version:1;zones:Zone[];prefetch:number;retention:number;lookAheadSeconds:number;maxLoads:number;maxActivations:number;residentVisuals:string[]};
export const contains=(z:Zone,p:Vec3,margin=0)=>[p.x,p.y,p.z].every((v,i)=>v-margin>=z.min[i]&&v+margin<z.max[i]);
export const distance=(z:Zone,p:Vec3)=>Math.hypot(...[p.x,p.y,p.z].map((v,i)=>Math.max(z.min[i]-v,0,v-z.max[i])));
export function validateWorld(w:StreamingWorld){
 if(![w.prefetch,w.retention,w.lookAheadSeconds].every(Number.isFinite)||w.version!==1||!Array.isArray(w.zones)||!w.zones.length||new Set(w.zones.map(z=>z.id)).size!==w.zones.length||w.maxLoads!==2||w.maxActivations!==1||w.prefetch<2||w.retention<=w.prefetch||w.lookAheadSeconds<0)throw Error('Invalid streaming world');
 for(const z of w.zones)if(!z.id||!z.assetId||z.min.length!==3||z.max.length!==3||z.min.some((v,i)=>!Number.isFinite(v)||!Number.isFinite(z.max[i])||v>=z.max[i]))throw Error('Invalid streaming zone');
 for(let i=0;i<w.zones.length;i++)for(let j=0;j<i;j++)if(w.zones[i].min.every((v,k)=>v<w.zones[j].max[k]&&w.zones[i].max[k]>w.zones[j].min[k]))throw Error('Overlapping streaming zones');
 const lower=[0,1,2].map(i=>Math.min(...w.zones.map(z=>z.min[i]))),upper=[0,1,2].map(i=>Math.max(...w.zones.map(z=>z.max[i])));
 const volume=w.zones.reduce((n,z)=>n+z.min.reduce((v,a,i)=>v*(z.max[i]-a),1),0);
 if(volume!==lower.reduce((v,a,i)=>v*(upper[i]-a),1))throw Error('Streaming world contains gaps');
 return w;
}
