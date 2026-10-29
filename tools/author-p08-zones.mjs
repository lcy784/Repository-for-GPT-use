import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex'),put=(p,o)=>writeFileSync('public/streaming/'+p,JSON.stringify(o)+'\n');
mkdirSync('public/streaming',{recursive:true});
const all=JSON.parse(readFileSync('public/registry/collisions.json')).shapes;
function bounds(s){if(s.kind==='mesh')return [0,1,2].map(i=>{const a=s.vertices.filter((_,j)=>j%3===i);return [Math.min(...a),Math.max(...a)];});const [x,y,z]=s.size.map(v=>v/2),a=s.angleX||0,c=Math.abs(Math.cos(a)),t=Math.abs(Math.sin(a)),half=s.kind==='cylinder'?[s.size[0],y,s.size[0]]:[x,y*c+z*t,z*c+y*t];return s.centre.map((v,i)=>[v-half[i],v+half[i]]);}
const zones=[],assets=[],xs=[-1024,-35,35,1024],ys=[-1024,24,112,200,1024],zs=[-1024,-48,48,160,256,1024];
for(let x=0;x<3;x++)for(let y=0;y<4;y++)for(let z=0;z<5;z++){
 const id=`cell-${x}-${y}-${z}`,min=[xs[x],ys[y],zs[z]],max=[xs[x+1],ys[y+1],zs[z+1]],shapes=all.filter(s=>bounds(s).every(([lo,hi],i)=>hi>=min[i]-2&&lo<=max[i]+2));
 put(id+'.json',{version:1,coordinates:'metres-right-handed-Y-up',shapes});zones.push({id,min,max,assetId:'zone.'+id,label:y===0?'江南地面':y===1?'穿云上升':y===2&&x===1&&z===1?'巨殿室内':y===3?'巨殿屋顶与高空':'天宫外部'});
 assets.push({id:'zone.'+id,kind:'collision',version:'1',uri:'streaming/'+id+'.json',sha256:hash(readFileSync('public/streaming/'+id+'.json')),dependencies:['palace.recipe','journey.recipe'],lods:[],source:{authorship:'Exact spatial subsets of original P06 authored collider geometry',files:[{path:'public/registry/collisions.json',sha256:hash(readFileSync('public/registry/collisions.json'))}]}});
}
put('world.json',{version:1,zones,prefetch:14,retention:28,lookAheadSeconds:2,maxLoads:2,maxActivations:1,residentVisuals:['palace.recipe','journey.recipe','traveler.model']});
const registry=JSON.parse(readFileSync('public/registry/p07.json'));registry.assets=registry.assets.filter(a=>['palace.recipe','journey.recipe','traveler.model'].includes(a.id));registry.assets.push(...assets,{id:'journey.world',kind:'world',version:'1',uri:'streaming/world.json',sha256:hash(readFileSync('public/streaming/world.json')),dependencies:['palace.recipe','journey.recipe','traveler.model'],lods:[],source:{authorship:'Original P08 spatial configuration',files:[{path:'tools/author-p08-zones.mjs',sha256:hash(readFileSync('tools/author-p08-zones.mjs'))}]}});put('registry.json',registry);
console.log(JSON.stringify({zones:zones.length,colliders:all.length}));
