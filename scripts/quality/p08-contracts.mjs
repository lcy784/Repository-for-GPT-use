import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {validateRegistry} from '../../src/assets/schema.mjs';
import {validateWorld} from '../../src/streaming/zones.ts';
import {hash} from './lib.mjs';
export function verifyZones(root){
 const read=p=>readFileSync(path.join(root,p)),registry=validateRegistry(JSON.parse(read('public/streaming/registry.json'))),world=validateWorld(JSON.parse(read('public/streaming/world.json')));
 for(const a of registry.assets){assert.equal(hash(read('public/'+a.uri)),a.sha256,'Streaming asset hash mismatch');for(const f of a.source.files)assert.equal(hash(read(f.path)),f.sha256,'Streaming author source changed');}
 const all=JSON.parse(read('public/registry/collisions.json')).shapes,known=new Map(all.map(s=>[s.id,s])),seen=new Set();
 for(const z of world.zones){const a=registry.assets.find(a=>a.id===z.assetId);assert(a);const data=JSON.parse(read('public/'+a.uri));for(const shape of data.shapes){assert.deepEqual(shape,known.get(shape.id),'Streaming changed an original collision shape');seen.add(shape.id);}}
 assert.equal(seen.size,all.length);assert.equal(world.zones.length,60);return {zones:world.zones.length,colliders:seen.size,assets:registry.assets.length,residentVisuals:world.residentVisuals};
}
