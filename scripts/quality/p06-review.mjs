import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {hash,inside,readJson} from './lib.mjs';

/** The user reviews a concrete production build and its actual journey captures. */
export function assessJourneyReview(record,request){
 if(!record)return {status:'BLOCKED',reason:'P06 core journey and cloud views await user visual/experience acceptance.'};
 assert.equal(record.version,1);assert.equal(record.status,'accepted-by-user');assert.equal(record.scope,'P06-core-journey');
 assert.equal(record.reviewInputHash,request.reviewInputHash,'The accepted build differs from the current runtime inputs');
 assert(typeof record.source?.quote==='string'&&record.source.quote.trim().length>0,'Missing user acceptance source');
 assert.match(record.reviewedRequest,/^quality\/reports\/[0-9TZ.a-f-]+\/P06-review-request\.json$/);
 assert(record.images?.length>=6&&record.images.every(i=>typeof i.path==='string'&&/^[a-f0-9]{64}$/.test(i.sha256)),'Missing reviewed journey images');
 return {status:'PASS',reason:'User accepted this production build and its recorded core journey.',source:record.source};
}
export function evaluateJourneyReview(root,request){
 const file=inside(root,'quality/visual-acceptance/P06-CORE-JOURNEY.json');
 if(!existsSync(file)){
  const continuation=inside(root,'quality/visual-acceptance/P06-CONTINUED-DEVELOPMENT.json');
  if(!existsSync(continuation))return assessJourneyReview(null,request);
  const policy=readJson(continuation);assert.equal(policy.version,1);assert.equal(policy.status,'user-directed-continue');assert.equal(policy.scope,'P06-to-P07-development-only');assert.equal(policy.source.quote,'执行p07开发');assert.equal(policy.artisticAcceptance,'not-independently-confirmed');assert.equal(policy.P15FormalMeasurementsStillRequired,true);
  assert.match(policy.priorRequest,/^quality\/reports\/[0-9TZ.a-f-]+\/P06-review-request\.json$/);
  assert.equal(hash(readFileSync(inside(root,policy.priorRequest))),policy.priorRequestSha256);
  assert.deepEqual(policy.preservedInputs.map(i=>i.path),['src/runtime/palace.ts','src/runtime/roof.ts','src/runtime/journey-view.ts','src/game/journey.ts','public/characters/p05/traveler.glb']);
  for(const input of policy.preservedInputs)assert.equal(hash(readFileSync(inside(root,input.path))),input.sha256,'P06 continuation cannot authorize changed artwork');
  return {status:'PASS',reason:'User explicitly directed P07 development on preserved P06 artwork. Continuation authorization supersedes the stop; independent artistic acceptance and P15 hardware measurements remain outstanding.',authorization:'continued-development-only',artisticAcceptance:'not-independently-confirmed',source:policy.source};
 }
 const record=readJson(file),accepted=readJson(inside(root,record.reviewedRequest));
 assert.equal(accepted.reviewInputHash,record.reviewInputHash);
 assert.deepEqual(record.images,accepted.images,'The acceptance must name all images in the reviewed request');
 for(const image of record.images)assert.equal(hash(readFileSync(inside(root,image.path))),image.sha256,'Reviewed image changed');
 return assessJourneyReview(record,request);
}
