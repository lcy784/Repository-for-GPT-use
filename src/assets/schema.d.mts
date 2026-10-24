export type AssetDescriptor={id:string;kind:'model'|'texture'|'recipe'|'collision'|'world';version:string;uri:string;sha256:string;dependencies:string[];collisionRef?:string;lods:string[];source:{authorship:string;files:{path:string;sha256:string}[]}};
export type Registry={version:1;coordinates:'metres-right-handed-Y-up';assets:AssetDescriptor[]};
export function localPath(value:unknown):string;
export function validateRegistry(input:unknown):Registry;
