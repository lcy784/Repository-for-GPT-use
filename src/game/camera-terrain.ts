import type {TerrainShape} from './terrain';
export function cameraTerrain():TerrainShape[]{
 return [
  {id:'camera-ground',kind:'box',size:[80,1,80],centre:[0,-.5,0],render:true},
  {id:'camera-side-wall',kind:'box',size:[.18,4,12],centre:[3,2,0],render:true},
  {id:'camera-door-left',kind:'box',size:[5,4,.18],centre:[-4,2,-5],render:true},
  {id:'camera-door-right',kind:'box',size:[5,4,.18],centre:[4,2,-5],render:true},
  {id:'camera-door-header',kind:'box',size:[3,1,.3],centre:[0,3.5,-5],render:true},
  {id:'camera-eave',kind:'box',size:[9,.2,5],centre:[0,3.9,-7.5],render:true},
  {id:'camera-back-wall',kind:'box',size:[12,5,.18],centre:[0,2.5,8],render:true},
 ];
}
