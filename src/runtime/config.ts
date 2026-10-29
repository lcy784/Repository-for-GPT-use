export type RuntimeConfig = {
  version: 1;
  assetRegistry?:string;
  streamingWorld?:boolean;
  sceneFixture: 'p01-depth' | 'p02-palace' | 'p03-palace-walk' | 'p03-terrain' | 'p04-palace-flight' | 'p04-flight' | 'p05-palace-avatar' | 'p05-camera' | 'p06-journey';
  flightSpeedMetersPerSecond?:number;
  thirdPersonDistance?:number;
  spawn?: [number,number,number];
  cameraTargets?: [number, number, number][];
  simulationHz: number;
  maxCatchUpSteps: number;
  cameraPositions: [number, number, number][];
  background: [number, number, number];
};

export async function loadRuntimeConfig(signal: AbortSignal): Promise<RuntimeConfig> {
  const response = await fetch(new URL('runtime-config.json', document.baseURI), { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(`运行配置加载失败（HTTP ${response.status}）`);
  const config = await response.json();
  const vector = (value: unknown): boolean => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
  if (config.version !== 1 || !['p01-depth', 'p02-palace', 'p03-palace-walk', 'p03-terrain', 'p04-palace-flight', 'p04-flight', 'p05-palace-avatar', 'p05-camera', 'p06-journey'].includes(config.sceneFixture) || !Number.isFinite(config.simulationHz) || config.simulationHz < 1 || config.simulationHz > 240 || !Number.isInteger(config.maxCatchUpSteps) || config.maxCatchUpSteps < 1 || config.maxCatchUpSteps > 10 || !Array.isArray(config.cameraPositions) || config.cameraPositions.length < 2 || !config.cameraPositions.every(vector) || !vector(config.background)) throw new Error('运行配置格式无效');
  if (config.sceneFixture !== 'p01-depth' && (!Array.isArray(config.cameraTargets) || config.cameraTargets.length !== config.cameraPositions.length || !config.cameraTargets.every(vector))) throw new Error('巨殿机位配置格式无效');
  if (/^p0[3456]-/.test(config.sceneFixture) && (!vector(config.spawn) || config.simulationHz!==60)) throw new Error('人物出生点或模拟频率无效');
  if (/^p0[456]-/.test(config.sceneFixture) && (!Number.isFinite(config.flightSpeedMetersPerSecond) || config.flightSpeedMetersPerSecond<=0 || config.flightSpeedMetersPerSecond>60)) throw new Error('飞行速度应大于 0 且不超过 60 米／秒');
  if(/^p0[56]-/.test(config.sceneFixture)&&(!Number.isFinite(config.thirdPersonDistance)||config.thirdPersonDistance<2||config.thirdPersonDistance>12))throw new Error('第三人称距离应在 2 至 12 米之间');
  if(config.assetRegistry!==undefined&&(!['registry/p07.json','streaming/registry.json'].includes(config.assetRegistry)||config.sceneFixture!=='p06-journey'))throw new Error('Asset registry is only supported for the P06 journey');
  if(config.streamingWorld!==undefined&&(config.streamingWorld!==true||config.assetRegistry!=='streaming/registry.json'))throw Error('Invalid streaming configuration');
  return config;
}
