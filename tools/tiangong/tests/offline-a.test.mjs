import {describe,it,expect} from 'vitest';
import {assembleHtml} from '../../../scripts/build-offline-a.mjs';
const template='<script type="module" src="/src/main.ts"></script>';
const chunk=code=>({type:'chunk',fileName:'main.js',code,imports:[],dynamicImports:[]});
describe('P09-01: standalone artifact closure',()=>{
 it('rejects unresolved static and dynamic chunks',()=>{for(const field of ['imports','dynamicImports'])expect(()=>assembleHtml(template,[{...chunk('ok'),[field]:['missing.js']}])).toThrow('Unresolved');});
 it('allows Rolldown self metadata only when the bundled chunk has no external edge',()=>{expect(assembleHtml(template,[{...chunk('ok'),dynamicImports:['main.js']}])).toContain('<script>ok</script>');});
 it('rejects sidecar assets and remote CSS',()=>{expect(()=>assembleHtml(template,[chunk('ok'),{type:'asset',fileName:'missing.wasm'}])).toThrow();for(const source of ['@import "https://example.com/font"','a{background:url(./missing.png)}'])expect(()=>assembleHtml(template,[chunk('ok'),{type:'asset',fileName:'style.css',source}])).toThrow('CSS');});
 it('preserves dollar replacement literals and prevents a script terminator escaping the HTML',()=>{const html=assembleHtml(template,[chunk('console.log("$& </script>")')]);expect(html).toContain('$& <\\/script>');expect(html.match(/<\/script>/g)).toHaveLength(1);expect(html).not.toContain('/src/main.ts');});
});
