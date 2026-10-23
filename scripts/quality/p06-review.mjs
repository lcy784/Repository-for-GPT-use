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
 if(!existsSync(file))return assessJourneyReview(null,request);
 const record=readJson(file),accepted=readJson(inside(root,record.reviewedRequest));
 assert.equal(accepted.reviewInputHash,record.reviewInputHash);
 assert.deepEqual(record.images,accepted.images,'The acceptance must name all images in the reviewed request');
 for(const image of record.images)assert.equal(hash(readFileSync(inside(root,image.path))),image.sha256,'Reviewed image changed');
 return assessJourneyReview(record,request);
}
