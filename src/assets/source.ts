import {EmbeddedAssets,HttpAssets,type AssetAccess} from './access';
declare const __TIANGONG_EMBEDDED__: Record<string,string> | undefined;
// Only the A build defines this constant. Normal HTTP builds retain the original adapter.
export function contentAccess():AssetAccess {
 if(typeof __TIANGONG_EMBEDDED__ !== 'undefined'){
  const files=new Map<string,Uint8Array>();
  for(const [uri,encoded] of Object.entries(__TIANGONG_EMBEDDED__))files.set(uri,Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)));
  return new EmbeddedAssets(files);
 }
 return new HttpAssets(new URL('./',document.baseURI));
}
