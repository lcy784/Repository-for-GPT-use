import {describe,it,expect} from 'vitest';
import {hash} from '../../../scripts/quality/lib.mjs';
import {assessVisualApproval,visualInputs} from '../../../scripts/quality/visual-acceptance.mjs';
function fixture(){
 const files=[{path:'docs/note.md',sha256:hash('notes')},{path:'public/runtime-config.json',sha256:hash('config')},{path:'src/runtime/palace.ts',sha256:hash('palace')}];
 const candidate={sha256:hash(JSON.stringify(files)),files};
 const images=['far','stairs','human'].map(name=>({name,sha256:hash(name)}));
 const record={version:1,status:'accepted-by-user',scope:'P02-visual-only',source:{quote:'验收通过'},approvedCommit:'a'.repeat(40),approvedCandidate:candidate.sha256,renderInputs:visualInputs(files),images};
 return {record,candidate,inputs:visualInputs(files),images};
}
describe('Visual acceptance binds user approval to actual reviewed inputs and pixels',()=>{
 it('keeps missing user acceptance blocked',()=>expect(assessVisualApproval(null).status).toBe('BLOCKED'));
 it('accepts unchanged visual inputs despite unrelated documentation changes',()=>{const f=fixture();expect(assessVisualApproval(f.record,f.candidate,visualInputs([...f.candidate.files,{path:'docs/acceptance.md',sha256:hash('new')}]),f.images).status).toBe('PASS');});
 it('blocks a modified palace while retaining the prior approval',()=>{const f=fixture();f.inputs=structuredClone(f.inputs);f.inputs[1].sha256=hash('modified');expect(assessVisualApproval(f.record,f.candidate,f.inputs,f.images).status).toBe('BLOCKED');});
 it('blocks newly added runtime assets even if existing files are unchanged',()=>{const f=fixture();f.inputs.push({path:'public/new-texture.png',sha256:hash('new')});expect(assessVisualApproval(f.record,f.candidate,f.inputs,f.images).status).toBe('BLOCKED');});
 it('blocks a changed screenshot rather than replacing the accepted baseline',()=>{const f=fixture();const changed=structuredClone(f.images);changed[1].sha256=hash('changed pixels');expect(assessVisualApproval(f.record,f.candidate,f.inputs,changed).status).toBe('BLOCKED');expect(f.record.images[1].sha256).toBe(hash('stairs'));});
 it('allows gameplay development only when accepted art and pixels remain identical',()=>{const f=fixture();const inputs=structuredClone(f.inputs);inputs.push({path:'src/game/session.ts',sha256:hash('new gameplay')});expect(assessVisualApproval(f.record,f.candidate,inputs,f.images,true).status).toBe('PASS');inputs.find(x=>x.path==='src/runtime/palace.ts').sha256=hash('changed art');expect(assessVisualApproval(f.record,f.candidate,inputs,f.images,true).status).toBe('BLOCKED');});
 it('still blocks changed pixels under continued-development authorization',()=>{const f=fixture();const images=structuredClone(f.images);images[0].sha256=hash('different roof');expect(assessVisualApproval(f.record,f.candidate,f.inputs,images,true).status).toBe('BLOCKED');});
 it('rejects a tampered historical candidate or wrong acceptance scope',()=>{const f=fixture();expect(()=>assessVisualApproval({...f.record,approvedCandidate:hash('forged')},f.candidate,f.inputs,f.images)).toThrow();expect(()=>assessVisualApproval({...f.record,scope:'all-performance'},f.candidate,f.inputs,f.images)).toThrow();});
});
