/** Logical contracts only. No gameplay or world dimensions are implemented here. */
export type Vec3 = Readonly<{ x: number; y: number; z: number }>;
export type PlayerIntent = Readonly<{
  sequence: number;
  movement: Vec3;
  viewDelta: Readonly<{ yaw: number; pitch: number }>;
  flightRequest: 'start' | 'stop' | null;
  interactionRequest: string | null;
}>;
export type PlayerState = Readonly<{
  id: string;
  tick: number;
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  mode: 'grounded' | 'flying' | 'falling' | 'water-reserved';
  supportId: string | null;
}>;
export type WorldManifest = Readonly<{
  version: string;
  coordinateSystem: 'meters-right-handed-Y-up';
  zones: readonly Readonly<{ id: string; min: Vec3; max: Vec3; assetIds: readonly string[] }>[];
  assets: readonly Readonly<{ id: string; path: string; sha256: string; collisionAssetId: string | null }>[];
  spawn: Vec3;
}>;
/** Only the local session commits simulation results; consumers receive snapshots. */
export interface LocalSession {
  readonly snapshot: PlayerState;
  commitSimulationResult(previousTick: number, result: PlayerState): void;
}
