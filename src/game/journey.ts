import {flightTerrain} from './flight-terrain';
import type {CollisionShape,TriangleTerrainShape} from './collision';
import type {TerrainShape} from './terrain';
import type {PlayerState} from '../shared/contracts';

/** Adjustable P06 sample dimensions, not the final map or the P10 route. */
export const JOURNEY=Object.freeze({palaceLift:120,terraceTop:138,cloudHeight:100,cloudHalfDepth:12,
 spawn:[-18,.91,282] as const,bridgeZ:272,roofPoint:[15,0] as const});

export const HOUSES=Object.freeze([-1,1].flatMap(side=>[190,214,262,286].map((z,i)=>({
 id:`water-house-${side}-${i}`,x:side*(29+i%2*2),z,width:12,depth:16,height:8+i%2*2,
}))));

function shift(shape:CollisionShape,lift:number):CollisionShape{
 if(shape.kind==='mesh')return {...shape,vertices:shape.vertices.map((v,i)=>i%3===1?v+lift:v)};
 return {...shape,centre:[shape.centre[0],shape.centre[1]+lift,shape.centre[2]]};
}

export function houseRoof(h:typeof HOUSES[number]):TriangleTerrainShape{
 const x=h.width/2+1.2,z=h.depth/2+1.4,y=h.height,r=y+3;
 const vertices=[-x,y,-z,x,y,-z,x,y,z,-x,y,z,0,r,-z,0,r,z]
 .map((v,i)=>i%3===0?v+h.x:i%3===2?v+h.z:v);
 return {id:`${h.id}-roof`,kind:'mesh',vertices,indices:[0,4,1,3,2,5,0,3,5,0,5,4,1,4,5,1,5,2,0,1,2,0,2,3]};
}

export function villageTerrain():CollisionShape[]{
 const box=(id:string,size:TerrainShape['size'],centre:TerrainShape['centre']):TerrainShape=>({id,kind:'box',size,centre});
 return [
  ...[-1,1].map(side=>box(`jiangnan-bank-${side}`,[38,2,148],[side*27,-1,236])),
  box('jiangnan-bridge',[20,1,12],[0,-.5,JOURNEY.bridgeZ]),
  ...[-1,1].flatMap(side=>[
   box(`canal-rail-${side}-north`,[.3,1.1,JOURNEY.bridgeZ-168],[side*8,.55,(162+JOURNEY.bridgeZ-6)/2]),
   box(`canal-rail-${side}-south`,[.3,1.1,304-JOURNEY.bridgeZ],[side*8,.55,(310+JOURNEY.bridgeZ+6)/2]),
  ]),
  ...HOUSES.flatMap(h=>[box(h.id,[h.width,h.height,h.depth],[h.x,h.height/2,h.z]),houseRoof(h)]),
 ];
}

export function journeyTerrain():CollisionShape[]{
 // The P03 lower safety pad belongs to its stair fixture. Suspending it over the
 // village would introduce an artificial opaque slab in the P06 upward view.
 const palace=flightTerrain('palace').filter(shape=>!shape.id.startsWith('lower-'));
 return [...palace.map(shape=>shift(shape,JOURNEY.palaceLift)),...villageTerrain()];
}

export function journeyLocation(state:Pick<PlayerState,'position'|'supportId'>):string{
 const p=state.position;
 if(state.supportId?.startsWith('palace-roof-'))return '屋顶 · 已落脚，可再次起飞';
 if(p.y<18)return '江南水巷 · 沿岸走向石桥，F 起飞';
 if(p.y<JOURNEY.cloudHeight-JOURNEY.cloudHalfDepth)return '云下 · 空格上升，朝巨殿飞行';
 if(p.y<JOURNEY.cloudHeight+JOURNEY.cloudHalfDepth)return '云中 · 继续上升，前方是天宫';
 if(p.y<212&&Math.abs(p.x)<57&&p.z<28&&p.z>-75)return '巨殿室内 · 中轴通行，向门外可再起飞';
 if(state.supportId==='palace-terrace')return '巨殿台面 · 正门在前方，W 入殿';
 return '云上天宫 · 殿前台面可降落，绕檐升高可到屋顶';
}
