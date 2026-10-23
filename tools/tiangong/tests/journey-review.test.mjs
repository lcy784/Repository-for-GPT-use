import {describe,it,expect} from 'vitest';
import {assessJourneyReview} from '../../../scripts/quality/p06-review.mjs';
const request={reviewInputHash:'a'.repeat(64)};
const accepted=()=>({version:1,status:'accepted-by-user',scope:'P06-core-journey',reviewInputHash:request.reviewInputHash,source:{quote:'synthetic test acceptance; not a real product approval'},reviewedRequest:'quality/reports/2026-10-23T11-13-13-035Z-4866a9ee/P06-review-request.json',images:Array.from({length:6},(_,i)=>({path:`synthetic-${i}.png`,sha256:'b'.repeat(64)}))});
describe('P06-04: user acceptance cannot be replaced by automatic checks',()=>{
 it('keeps a missing user review blocked even when automatic checks pass',()=>{expect(assessJourneyReview(null,request).status).toBe('BLOCKED');});
 it('rejects a review after a runtime input changes',()=>{expect(()=>assessJourneyReview(accepted(),{reviewInputHash:'c'.repeat(64)})).toThrow('differs');});
 it('rejects automated approval, missing source and an incomplete image set',()=>{
  for(const change of [{status:'automatic-pass'},{source:{quote:''}},{images:[]}])expect(()=>assessJourneyReview({...accepted(),...change},request)).toThrow();
 });
 it('accepts only the bound review structure and rejects paths outside formal reports',()=>{
  expect(assessJourneyReview(accepted(),request).status).toBe('PASS');expect(()=>assessJourneyReview({...accepted(),reviewedRequest:'../../approval.json'},request)).toThrow();
 });
});
