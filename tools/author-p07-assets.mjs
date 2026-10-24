import {createServer} from './tiangong/node_modules/vite/dist/node/index.js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null},ssr:{noExternal:['@babylonjs/core']}});
try{
 const {journeyTerrain,JOURNEY}=await server.ssrLoadModule('/src/game/journey.ts');
 mkdirSync('public/registry',{recursive:true});
 const put=(file,obj)=>writeFileSync('public/registry/'+file,JSON.stringify(obj,null,2)+'\n');
 const sources=names=>names.map(path=>({path,sha256:hash(readFileSync(path))}));
 put('palace.json',{version:1,factory:'palace-v1',units:'metres',coordinates:'right-handed-Y-up',sources:sources(['src/runtime/palace.ts','src/runtime/roof.ts'])});
 put('journey.json',{version:1,factory:'journey-v1',palaceLift:JOURNEY.palaceLift,cloudHeight:JOURNEY.cloudHeight,sources:sources(['src/runtime/journey-view.ts','src/game/journey.ts'])});
 put('collisions.json',{version:1,coordinates:'metres-right-handed-Y-up',shapes:journeyTerrain()});
 put('world.json',{version:1,id:'p06-core-journey',coordinates:'metres-right-handed-Y-up',entry:{position:[...JOURNEY.spawn]},regions:[{id:'jiangnan',bounds:[[-46,0,162],[46,15,310]]},{id:'palace',bounds:[[-90,120,-100],[90,272,193]]}],recipes:['palace.recipe','journey.recipe'],model:'traveler.model',collision:'journey.collision',lods:[],streaming:false});
 const asset=(id,kind,uri,dependencies,files,extra={})=>({id,kind,uri,version:'1',sha256:hash(readFileSync('public/'+uri)),dependencies,lods:[],source:{authorship:'original repository authored; no downloaded assets',files:sources(files)},...extra});
 writeFileSync('public/registry/p07-texture.bin',new Uint8Array([255,80,20,255,20,160,220,255,20,160,220,255,255,80,20,255]));
 put('p07.json',{version:1,coordinates:'metres-right-handed-Y-up',assets:[
  asset('fixture.texture','texture','registry/p07-texture.bin',[],['tools/author-p07-assets.mjs'],{usage:'diagnostic-fixture'}),
  asset('palace.recipe','recipe','registry/palace.json',[],['src/runtime/palace.ts','src/runtime/roof.ts']),
  asset('journey.recipe','recipe','registry/journey.json',['palace.recipe'],['src/runtime/journey-view.ts','src/game/journey.ts']),
  asset('journey.collision','collision','registry/collisions.json',[],['src/game/journey.ts','src/game/flight-terrain.ts','src/game/terrain.ts','src/game/collision.ts','src/runtime/roof.ts']),
  asset('traveler.model','model','characters/p05/traveler.glb',[],['tools/author-p05-avatar.py','public/characters/p05/README.md']),
  asset('journey.world','world','registry/world.json',['palace.recipe','journey.recipe','journey.collision','traveler.model'],['src/game/journey.ts'],{collisionRef:'journey.collision'})
 ]});
}finally{await server.close();}
