export type TerrainShape = Readonly<{ id:string; kind:'box'|'cylinder'; centre:readonly[number,number,number]; size:readonly[number,number,number]; angleX?:number; render?:boolean }>;
export const PLAYER = Object.freeze({height:1.75,radius:.3,halfSegment:.575,skin:.02,speed:3,gravity:9.81,hz:60,maxStep:.35,snap:.45,maxSlopeDegrees:40,minSlideDegrees:45});
export function terrain(kind:'palace'|'fixture'):TerrainShape[] {
 const shapes:TerrainShape[]=[];
 const box=(id:string,size:TerrainShape['size'],centre:TerrainShape['centre'],render=false,angleX=0)=>shapes.push({id,kind:'box',size,centre,render,angleX});
 if(kind==='fixture') {
  box('flat-ground',[100,1,100],[0,-.5,0],true);
  box('wall-forward',[8,3,.3],[0,1.5,-5],true);box('wall-corner',[.3,3,10],[4,1.5,-2],true);
  for(let i=0;i<3;i++)box(`allowed-step-${i}`,[4,(i+1)*.25,1.2],[12,(i+1)*.125,-i*1.2],true);
  box('blocked-step',[4,.7,2],[20,.35,0],true);
  box('gentle-slope',[4,.2,Math.hypot(8,2.4)],[-12,1.2,0],true,Math.atan2(2.4,8));
  box('steep-slope',[4,.2,10],[-22,4,0],true,Math.atan2(8,6));
  box('raised-edge',[8,3,6],[32,1.5,0],true);
  return shapes;
 }
 box('palace-terrace',[168.75,18,159.65],[0,9,-13.95]);
 box('lower-approach',[90,1,50],[0,-.5,215],true);
 for(const side of [-1,1])box(`lower-rail-side-${side}`,[1,1.5,50],[side*45,.75,215],true);
 box('lower-rail-back',[90,1.5,1],[0,.75,240],true);
 for(const side of [-1,1])box(`lower-rail-front-${side}`,[24,1.5,1],[side*33,.75,190],true);
 box('stair-upper-landing',[40.5,.5,10.4],[0,17.75,70.5],true);
 for(let i=0;i<60;i++) {
  const h=(i+1)*.3,z=(124-i*1.28)*1.55;
  box(`palace-step-${i}`,[40.5,h,2.046],[0,h/2,z]);
  if(i%3===0) for(const side of [-1,1])box(`stair-parapet-${side}-${i}`,[1.755,2.55,6.045],[side*22.68,h+1.275,z-2.015]);
 }
 for(const x of [-42,-28,-14,14,28,42]) for(const z of [22,8,-6,-20,-34,-50]) {
  box(`column-plinth-${x}-${z}`,[6.21,1.33,7.13],[x*1.35,18.665,z*1.55]);
  shapes.push({id:`column-base-${x}-${z}`,kind:'cylinder',centre:[x*1.35,20.66,z*1.55],size:[3.41,2.66,3.41]});
  shapes.push({id:`column-shaft-${x}-${z}`,kind:'cylinder',centre:[x*1.35,54.48,z*1.55],size:[2.17,64.98,2.17]});
 }
 for(const x of [-35,-21,21,35]) {
  box(`front-bay-${x}`,[14.85,51.3,2.1],[x*1.35,43.65,29.45]);
  box(`front-footboard-${x}`,[14.85,1.9,2.1],[x*1.35,18.95,29.45],true);
 }
 box('back-wall',[118.8,74,1.55],[0,55,-75.95]);
 for(const x of [-43.5,43.5])box(`side-wall-${x}`,[1.35,74,106.95],[x*1.35,55,-23.25]);
 // Low rail collision bands match the visible human-scale perimeter, leaving the stair entrance open.
 for(const x of [-82.35,82.35])box(`terrace-rail-side-${x}`,[1,2.6,155],[x,19.3,-13.95]);
 box('terrace-rail-back',[168,2.6,1],[0,19.3,-91.45]);
 for(const side of [-1,1])box(`terrace-rail-front-${side}`,[59,2.6,1],[side*53,19.3,63.55]);
 return shapes;
}
