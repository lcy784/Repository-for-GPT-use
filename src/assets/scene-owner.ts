import type {Scene} from '@babylonjs/core/scene';
/** Track exactly the synchronous factory's allocations, including failure part-way through. */
export function ownScene<T>(scene:Scene,create:()=>T){
 const groups=()=>[scene.meshes,scene.transformNodes,scene.materials,scene.textures,scene.lights] as const;
 const previous={environmentTexture:scene.environmentTexture,metadata:scene.metadata,fogMode:scene.fogMode,fogDensity:scene.fogDensity,fogColor:scene.fogColor.clone(),environmentIntensity:scene.environmentIntensity};
 const ip=scene.imageProcessingConfiguration,processing={exposure:ip.exposure,contrast:ip.contrast,toneMappingEnabled:ip.toneMappingEnabled,toneMappingType:ip.toneMappingType};
 const before=groups().map(g=>new Set<unknown>(g));let owned:Array<{dispose:()=>void}>=[];
 const collect=()=>{owned=groups().flatMap((g,i)=>g.filter(v=>!before[i].has(v))) as Array<{dispose:()=>void}>;};
 let disposed=false;const dispose=()=>{if(disposed)return;disposed=true;for(const obj of owned)obj.dispose();Object.assign(scene,previous);Object.assign(ip,processing);};
 try{const value=create();collect();return {value,dispose};}catch(error){collect();dispose();throw error;}
}
