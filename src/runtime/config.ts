export type RuntimeConfig = {
  version: 1;
  sceneFixture: 'p01-depth' | 'p02-palace';
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
  if (config.version !== 1 || !['p01-depth', 'p02-palace'].includes(config.sceneFixture) || !Number.isFinite(config.simulationHz) || config.simulationHz < 1 || config.simulationHz > 240 || !Number.isInteger(config.maxCatchUpSteps) || config.maxCatchUpSteps < 1 || config.maxCatchUpSteps > 10 || !Array.isArray(config.cameraPositions) || config.cameraPositions.length < 2 || !config.cameraPositions.every(vector) || !vector(config.background)) throw new Error('运行配置格式无效');
  if (config.sceneFixture === 'p02-palace' && (!Array.isArray(config.cameraTargets) || config.cameraTargets.length !== config.cameraPositions.length || !config.cameraTargets.every(vector))) throw new Error('巨殿机位配置格式无效');
  return config;
}
