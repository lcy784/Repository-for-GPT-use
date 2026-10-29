import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from '../tools/tiangong/node_modules/vite/dist/node/index.js';
import {verifyAssets} from './quality/p07-contracts.mjs';
import {verifyZones} from './quality/p08-contracts.mjs';
import {hash,readJson,writeJson,inside} from './quality/lib.mjs';
export function assembleHtml(template,outputs){
 const scripts=outputs.filter(o=>o.type==='chunk'),css=outputs.filter(o=>o.type==='asset'&&o.fileName.endsWith('.css'));
 assert.equal(scripts.length,1);assert(scripts.every(c=>!c.imports?.length&&(c.dynamicImports??[]).every(name=>name===c.fileName)),'Unresolved code dependency');assert(css.every(c=>!/@import|url\((?![\"\x27]?data:)/i.test(String(c.source))),'External CSS dependency');assert(outputs.every(o=>scripts.includes(o)||css.includes(o)),'Unexpected unembedded dependency');
 const html=template.replace(/<script type="module" src="\/src\/main.ts"><\/script>/,()=>'<style>'+css.map(o=>o.source).join('\n')+'</style>\n<script>'+scripts[0].code.replace(/<\/script/gi,'<\\/script')+'</script>');
 assert(!html.includes('src="/src/main.ts"'));assert(!/<script[^>]+src=|<link[^>]+(?:href=["\x27](?!data:))/i.test(html));
 return html;
}
export async function buildOfflineA(root,out){
 verifyAssets(root);verifyZones(root);
 const config=readJson(path.join(root,'public/runtime-config.json'));
 assert.equal(config.sceneFixture,'p06-journey');assert.equal(config.streamingWorld,true);
 const registry=readJson(inside(root,'public/'+config.assetRegistry));
 const paths=[...new Set(['runtime-config.json',config.assetRegistry,...registry.assets.map(a=>a.uri)])].sort();
 const embedded=Object.fromEntries(paths.map(uri=>[uri,readFileSync(inside(root,'public/'+uri)).toString('base64')]));
 const result=await build({root,configFile:false,publicDir:false,define:{__TIANGONG_EMBEDDED__:JSON.stringify(embedded)},build:{write:false,target:'es2022',minify:true,lib:{entry:path.join(root,'src/main.ts'),name:'TiangongOfflineA',formats:['iife']},rolldownOptions:{output:{codeSplitting:false}},sourcemap:false}});
 const outputs=(Array.isArray(result)?result:[result]).flatMap(r=>r.output);
 const html=assembleHtml(readFileSync(path.join(root,'index.html'),'utf8'),outputs);
 mkdirSync(out,{recursive:true});const file=path.join(out,'天宫-A.html');writeFileSync(file,html);
 const manifest={version:1,format:'single-html-file',entry:'天宫-A.html',sha256:hash(Buffer.from(html)),bytes:Buffer.byteLength(html),embedded:paths.map(uri=>({uri,sha256:hash(readFileSync(inside(root,'public/'+uri)))})),matrix:{P03:'walking, bridge and hall collision',P04:'flight, hover, descent and fall',P05:'temporary avatar and both perspectives',P06:'bank, bridge, clouds, palace interior, roof and departure',P07:'shared asset ownership',P08:'embedded collision zones and support handoff'},limits:['P06 independent artistic acceptance outstanding','P15 target Windows performance not measured','Expanded world, water and interactions remain P10+']};writeJson(path.join(out,'manifest.json'),manifest);return {file,manifest};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const root=fileURLToPath(new URL('../',import.meta.url));console.log(JSON.stringify(await buildOfflineA(root,path.join(root,'dist/offline-a')),null,2));}
