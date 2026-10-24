export function localPath(value){
 if(typeof value!=='string'||!value||value.startsWith('/')||/[\\:#?\0]/.test(value))throw Error('Asset path must be local and relative');
 let decoded;try{decoded=decodeURIComponent(value);}catch{throw Error('Invalid asset path encoding');}
 if(decoded!==value||value.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Unsafe asset path');return value;
}
export function validateRegistry(input){
 if(input?.version!==1||!Array.isArray(input.assets)||!input.assets.length||input.coordinates!=='metres-right-handed-Y-up')throw Error('Invalid asset registry');
 const ids=new Map();for(const a of input.assets){
  if(typeof a.id!=='string'||!/^[a-z][a-z0-9.-]+$/.test(a.id)||ids.has(a.id))throw Error('Missing or duplicate asset ID');
  if(!['model','texture','recipe','collision','world'].includes(a.kind)||typeof a.version!=='string'||!a.version||!/^[a-f0-9]{64}$/.test(a.sha256)||!Array.isArray(a.dependencies)||new Set(a.dependencies).size!==a.dependencies.length||!a.source?.authorship||!Array.isArray(a.source.files)||!a.source.files.length||!Array.isArray(a.lods))throw Error('Invalid asset contract '+a.id);
  localPath(a.uri);for(const f of a.source.files){localPath(f.path);if(!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('Invalid source hash');}ids.set(a.id,a);
 }
 const done=new Set(),active=new Set();const visit=id=>{const a=ids.get(id);if(!a)throw Error('Missing asset dependency '+id);if(active.has(id))throw Error('Cyclic asset dependency');if(done.has(id))return;active.add(id);for(const d of a.dependencies)visit(d);if(a.collisionRef){if(ids.get(a.collisionRef)?.kind!=='collision'||!a.dependencies.includes(a.collisionRef))throw Error('Invalid collision reference');}for(const d of a.lods)if(!ids.has(d))throw Error('Missing LOD');active.delete(id);done.add(id);};for(const id of ids.keys())visit(id);return input;
}
