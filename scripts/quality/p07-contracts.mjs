import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {validateRegistry,localPath} from '../../src/assets/schema.mjs';
export function verifyAssets(root){
 const manifest=validateRegistry(JSON.parse(readFileSync(path.join(root,'public/registry/p07.json'),'utf8'))),hash=b=>createHash('sha256').update(b).digest('hex');
 for(const a of manifest.assets){
  if(hash(readFileSync(path.join(root,'public',localPath(a.uri))))!==a.sha256)throw Error('Asset hash mismatch '+a.id);
  for(const f of a.source.files)if(hash(readFileSync(path.join(root,localPath(f.path))))!==f.sha256)throw Error('Asset authoring source changed '+f.path);
 }
 const world=JSON.parse(readFileSync(path.join(root,'public/registry/world.json'),'utf8'));
 if(world.version!==1||world.coordinates!==manifest.coordinates||!Array.isArray(world.regions)||world.regions.length!==2||world.streaming!==false)throw Error('Invalid P07 world manifest');
 for(const id of [...world.recipes,world.model,world.collision])if(!manifest.assets.some(a=>a.id===id))throw Error('Missing world asset '+id);
 const shapes=JSON.parse(readFileSync(path.join(root,'public/registry/collisions.json'),'utf8')).shapes;
 if(!Array.isArray(shapes)||!shapes.length||new Set(shapes.map(s=>s.id)).size!==shapes.length)throw Error('Invalid collision population');
 return {assets:manifest.assets.length,colliders:shapes.length,world:world.id};
}
