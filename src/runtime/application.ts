import { Engine } from '@babylonjs/core/Engines/engine';
import { EngineStore } from '@babylonjs/core/Engines/engineStore';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Culling/ray';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';
import { createPalace, PALACE } from './palace';
import { GroundInput } from '../game/input';
import { createGroundView } from '../game/view';
import type { GroundSession } from '../game/session';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { FixedClock } from './clock';
import { loadRuntimeConfig, type RuntimeConfig } from './config';

let groundSessionClass: typeof import('../game/session').GroundSession | null = null;
type Phase = 'loading' | 'ready' | 'paused' | 'disposed' | 'error';
export class Application {
  private engine: Engine | null = null;
  private scene: Scene | null = null;
  private instrumentation: SceneInstrumentation | null = null;
  private camera: ArcRotateCamera | null = null;
  private config: RuntimeConfig | null = null;
  private clock: FixedClock | null = null;
  private abort = new AbortController();
  private removeListeners: (() => void)[] = [];
  private view = 0;
  private frames = 0;
  private phase: Phase = 'loading';
  private failure: string | null = null;
  private visibilityTransitions = 0;
  private glError = 0;
  private renderer: string | null = null;
  private frameTimes: number[] = [];
  private intervals: number[] = [];
  private lastFrameTime = 0;
  private depthWitness = '';
  private witnessView = -1;
  private projectedEnvelope = '';
  private ground: GroundSession | null = null;
  private input: GroundInput | null = null;
  private avatar: TransformNode | null = null;
  private canvas: HTMLCanvasElement;
  constructor(private readonly container: HTMLElement, private readonly update: () => void, private readonly countFrame: () => void) {
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-label', '可旋转的三维巨殿视觉样本');
    this.container.replaceChildren(this.canvas);
  }
  async start(): Promise<void> {
    try {
      this.config = await loadRuntimeConfig(this.abort.signal);
      if (this.abort.signal.aborted) return;
      if (typeof WebAssembly === 'undefined' || !WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0]))) throw new Error('当前浏览器不支持必需的 WebAssembly');
      await WebAssembly.instantiate(new Uint8Array([0,97,115,109,1,0,0,0]));
      if (this.abort.signal.aborted) return;
      const gl = this.canvas.getContext('webgl2', { alpha: false, stencil: true, preserveDrawingBuffer: true });
      if (!gl) throw new Error('无法启动 WebGL 2，请检查浏览器硬件加速设置');
      this.engine = new Engine(gl, true, { preserveDrawingBuffer: true, stencil: true });
      if (this.engine.webGLVersion !== 2) throw new Error('需要 WebGL 2 渲染后端');
      const rendererInfo = gl.getExtension('WEBGL_debug_renderer_info');
      this.renderer = String(gl.getParameter(rendererInfo ? rendererInfo.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
      this.scene = new Scene(this.engine);
      this.instrumentation = new SceneInstrumentation(this.scene);
      this.scene.useRightHandedSystem = true;
      this.scene.clearColor = new Color4(...this.config.background, 1);
      this.camera = new ArcRotateCamera('viewer', 0, 0, 1, new Vector3(0, 1.5, 0), this.scene);
      this.camera.setTarget(Vector3.FromArray(this.config.cameraTargets?.[0] || [0,1.5,0]));
      this.camera.setPosition(Vector3.FromArray(this.config.cameraPositions[0]));
      this.camera.fov = Math.PI / 3;
      this.camera.minZ = .1; this.camera.maxZ = 3000;
      this.camera.attachControl(this.canvas, true);
      this.camera.lowerRadiusLimit = 6;
      this.camera.upperRadiusLimit = this.config.sceneFixture === 'p02-palace' ? 650 : 45;
      this.camera.wheelPrecision = 15;
      if (['p02-palace','p03-palace-walk'].includes(this.config.sceneFixture)) { createPalace(this.scene); } else if (this.config.sceneFixture === 'p01-depth') {
        const light = new HemisphericLight('sky-light', new Vector3(-0.6, 1, -0.3), this.scene);
        light.intensity = 1.25;
        const material = (name: string, color: Color3): StandardMaterial => {
          const value = new StandardMaterial(name, this.scene!); value.diffuseColor = color; value.specularColor = new Color3(.12,.12,.12); return value;
        };
        const stone = material('jade-stone', new Color3(.43,.66,.57));
        const warm = material('warm-stone', new Color3(.78,.56,.29));
        const dark = material('dark-stone', new Color3(.18,.32,.30));
        for (const [name, width, height, depth, x, y, z, mat] of [
          ['platform',18,.4,14,0,-.2,0,dark], ['near-cube',3,3,3,-3,1.5,-2,stone],
          ['far-column',2,7,2,3,3.5,3,warm], ['far-cube',4,1.5,3,-3,.75,4,stone],
        ] as const) {
          const mesh = CreateBox(name, { width, height, depth }, this.scene); mesh.position.set(x,y,z); mesh.material = mat;
        }
      }
      if(this.config.sceneFixture.startsWith('p03-')) {
        const {GroundSession}=await import('../game/session');groundSessionClass=GroundSession;
        if(this.abort.signal.aborted)return;
        const spawn=this.config.spawn!;
        const ground=await GroundSession.create(this.config.sceneFixture==='p03-terrain'?'fixture':'palace',{x:spawn[0],y:spawn[1],z:spawn[2]});
        if(this.abort.signal.aborted){ground.dispose();return;}
        this.ground=ground;this.input=new GroundInput(this.canvas);
        this.avatar=createGroundView(this.scene,ground.shapes,this.config.sceneFixture==='p03-terrain');
        this.camera.lowerRadiusLimit=2;this.camera.upperRadiusLimit=60;this.camera.lowerBetaLimit=.05;this.camera.upperBetaLimit=Math.PI*.49;
        this.syncPlayerView();
      }
      this.clock = new FixedClock(this.config.simulationHz, this.config.maxCatchUpSteps);
      const resize = (): void => { this.engine?.resize(); this.update(); };
      const visibility = (): void => {
        if (!this.engine || !this.clock) return;
        this.visibilityTransitions++;
        this.clock.reset(); this.lastFrameTime=0;
        if (document.hidden) { this.engine.stopRenderLoop(this.render); this.phase = 'paused'; }
        else { this.phase = 'loading'; this.engine.runRenderLoop(this.render); }
        this.update();
      };
      window.addEventListener('resize', resize);
      document.addEventListener('visibilitychange', visibility);
      this.removeListeners.push(() => window.removeEventListener('resize', resize), () => document.removeEventListener('visibilitychange', visibility));
      this.engine.resize();
      if (document.hidden) { this.phase = 'paused'; this.update(); }
      else this.engine.runRenderLoop(this.render);
    } catch (error) {
      if (!this.abort.signal.aborted) this.fail(error);
    }
  }
  private render = (): void => {
    if (!this.engine || !this.scene || !this.clock) return;
    try {
      const steps=this.clock.advance(performance.now());
      if(this.ground&&this.input&&this.camera) {
        const dx=this.camera.target.x-this.camera.position.x,dz=this.camera.target.z-this.camera.position.z;
        const n=Math.max(.00001,Math.hypot(dx,dz));
        for(let i=0;i<steps;i++)this.ground.step(this.input.consume({x:dx/n,z:dz/n}));
        this.syncPlayerView();
      }
      const renderStart = performance.now();
      if(this.lastFrameTime) { this.intervals.push(renderStart-this.lastFrameTime); if(this.intervals.length>120) this.intervals.shift(); }
      this.lastFrameTime=renderStart;
      this.scene.render();
      this.frameTimes.push(performance.now() - renderStart);
      if (this.frameTimes.length > 120) this.frameTimes.shift();
      if(this.scene.isReady() && this.witnessView!==this.view && this.config?.sceneFixture==='p02-palace') {
        this.depthWitness = JSON.stringify([.43,.5,.57].map(x=>{ const hit=this.scene!.pick(this.canvas.width*x,this.canvas.height*.52);return {screenX:x,hit:hit?.pickedMesh?.name || null,distance:hit?.distance || null,point:hit?.pickedPoint?.asArray() || null}; }));
        const viewport=this.camera!.viewport.toGlobal(this.canvas.width,this.canvas.height);
        this.projectedEnvelope=JSON.stringify(PALACE.roofEnvelope.x.flatMap(x=>PALACE.roofEnvelope.y.flatMap(y=>PALACE.roofEnvelope.z.map(z=>Vector3.Project(new Vector3(x,y,z),Matrix.Identity(),this.scene!.getTransformMatrix(),viewport).asArray()))));
        this.witnessView=this.view;
      }
      this.frames++; this.countFrame();
      this.glError = (this.canvas.getContext('webgl2')?.getError() || 0);
      if (this.glError !== 0) throw new Error(`WebGL 渲染失败（${this.glError}）`);
      if (this.scene.isReady() && this.scene.getActiveMeshes().length >= 3) this.phase = 'ready';
      this.update();
    } catch (error) { this.fail(error); }
  };
  private syncPlayerView():void {
    if(!this.ground||!this.avatar||!this.camera)return;
    const state=this.ground.snapshot,p=state.position;
    this.avatar.position.set(p.x,p.y,p.z);this.avatar.rotation.y=state.yaw;
    const {alpha,beta,radius}=this.camera;
    this.camera.setTarget(new Vector3(p.x,p.y+.6,p.z));
    this.camera.alpha=alpha;this.camera.beta=beta;this.camera.radius=radius;
  }
  changeCamera(): void {
    if (!this.config || !this.camera) return;
    this.intervals=[]; this.frameTimes=[]; this.lastFrameTime=0;
    this.view = (this.view + 1) % this.config.cameraPositions.length;
    this.camera.setTarget(Vector3.FromArray(this.config.cameraTargets?.[this.view] || [0,1.5,0]));
    if(this.ground&&this.config.spawn) {
      const p=this.ground.snapshot.position,offset=Vector3.FromArray(this.config.cameraPositions[this.view]).subtract(Vector3.FromArray(this.config.spawn));
      this.camera.setTarget(new Vector3(p.x,p.y+.6,p.z));this.camera.setPosition(new Vector3(p.x,p.y,p.z).add(offset));
    } else this.camera.setPosition(Vector3.FromArray(this.config.cameraPositions[this.view]));
    this.update();
  }
  private release(): void {
    this.abort.abort();
    this.input?.dispose();this.input=null;this.ground?.dispose();this.ground=null;this.avatar=null;
    for (const remove of this.removeListeners.splice(0)) remove();
    this.engine?.stopRenderLoop(this.render);
    this.instrumentation?.dispose(); this.instrumentation=null;
    this.scene?.dispose(); this.engine?.dispose();
    this.scene = null; this.engine = null; this.camera = null;
  }
  private fail(error: unknown): void {
    this.failure = error instanceof Error ? error.message : String(error);
    this.phase = 'error'; this.release(); this.update();
  }
  dispose(): void { this.release(); this.phase = 'disposed'; this.update(); }
  observe() {
    return Object.freeze({ phase: this.phase, error: this.failure, frame: this.frames, tick: this.clock?.tick || 0,
      maxStepsInFrame: this.clock?.maxObservedSteps || 0, backend: this.engine ? `WebGL${this.engine.webGLVersion}` : null,
      meshes: this.scene?.meshes.length || 0, activeMeshes: this.scene?.getActiveMeshes().length || 0,
      engines: EngineStore.Instances.length, listeners: this.removeListeners.length,
      width: this.canvas.width, height: this.canvas.height, visibility: document.visibilityState,
      visibilityTransitions: this.visibilityTransitions, camera: this.view, glError: this.glError,
      depthWitness: this.depthWitness,
      projectedRoofEnvelope: this.projectedEnvelope,
      frameIntervalMsMedian: [...this.intervals].sort((a,b)=>a-b)[Math.floor(this.intervals.length/2)] || 0,
      frameIntervalMsP95: [...this.intervals].sort((a,b)=>a-b)[Math.min(this.intervals.length-1,Math.floor(this.intervals.length*.95))] || 0,
      drawCalls: this.instrumentation?.drawCallsCounter.current || 0,
      assemblyMetrics: this.scene?.metadata?.palaceStudy ? JSON.stringify(this.scene.metadata.palaceStudy) : null,
      study: this.config?.sceneFixture==='p02-palace' ? JSON.stringify(PALACE) : null,
      triangles: this.scene?.getActiveIndices() ? this.scene.getActiveIndices() / 3 : 0,
      materials: this.scene?.materials.length || 0, textures: this.scene?.textures.length || 0,
      renderCpuMsMedian: [...this.frameTimes].sort((a,b)=>a-b)[Math.floor(this.frameTimes.length/2)] || 0,

      cameraEye: this.camera?.position.asArray().join(',') || null,
      cameraTarget: this.camera?.target.asArray().join(',') || null,
      player:this.ground?JSON.stringify(this.ground.snapshot):null,
      physics:this.ground?JSON.stringify(this.ground.observe()):null,
      avatarHeightMeters:this.avatar?.metadata?.visualHeightMeters||null,
      avatarYaw:this.avatar?.rotation.y??null,
      avatarPosition:this.avatar?.position.asArray().join(',')||null,
      controllers:groundSessionClass?.instances||0,inputListeners:this.input?.listeners||0,pressedKeys:this.input?.pressed||'',
      inputFocused:document.activeElement===this.canvas,
      fixture: this.config?.sceneFixture || null, renderer: this.renderer,
    });
  }
}
