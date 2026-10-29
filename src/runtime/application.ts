import {ZoneScheduler} from '../streaming/scheduler';
import {type StreamingWorld,type Zone} from '../streaming/zones';
import {AssetScope,HttpAssets} from '../assets/access';
import {ownScene} from '../assets/scene-owner';
import type {CollisionShape} from '../game/collision';
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
import {createJourneyView,type JourneyView} from './journey-view';
import {journeyLocation} from '../game/journey';
import { createPalace, PALACE } from './palace';
import { GroundInput } from '../game/input';
import { createGroundView } from '../game/view';
import type { GroundSession } from '../game/session';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type {AvatarView} from '../game/avatar';
import type {PlayerCamera} from '../game/player-camera';
import { FixedClock } from './clock';
import { loadRuntimeConfig, type RuntimeConfig } from './config';

let groundSessionClass: typeof import('../game/session').GroundSession | null = null;
let avatarClass:typeof import('../game/avatar').AvatarView|null=null;
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
  private animatedAvatar:AvatarView|null=null;
  private playerCamera:PlayerCamera|null=null;
  private journey:JourneyView|null=null;
  private assets:AssetScope|null=null;
  private streaming:ZoneScheduler<readonly CollisionShape[]>|null=null;
  private streamingWorld:StreamingWorld|null=null;
  private zoneShapes=new Map<string,readonly CollisionShape[]>();
  private collisionShapes:readonly CollisionShape[]|undefined;
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
      if(this.config.assetRegistry){
        const assets=await AssetScope.open(this.config.assetRegistry,new HttpAssets(new URL('./',document.baseURI)),this.abort.signal);
        if(this.abort.signal.aborted){assets.dispose();return;}this.assets=assets;
        const world=JSON.parse(new TextDecoder().decode(await assets.hold('journey.world')));
        if(this.config.streamingWorld){this.streamingWorld=world;this.collisionShapes=[];}
        else{if(world.version!==1||world.id!=='p06-core-journey'||world.collision!=='journey.collision'||world.model!=='traveler.model')throw Error('Invalid world asset contract');
        const collision=JSON.parse(new TextDecoder().decode(await assets.hold(world.collision)));
        if(collision.version!==1||collision.coordinates!=='metres-right-handed-Y-up'||!Array.isArray(collision.shapes))throw Error('Invalid collision asset');this.collisionShapes=collision.shapes;}
      }
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
      if (['p02-palace','p03-palace-walk','p04-palace-flight','p05-palace-avatar','p06-journey'].includes(this.config.sceneFixture)) { if(this.assets){const assets=this.assets,scene=this.scene;this.journey=await assets.own('journey.scene',async()=>{const palace=JSON.parse(new TextDecoder().decode(await assets.hold('palace.recipe'))),journey=JSON.parse(new TextDecoder().decode(await assets.hold('journey.recipe')));if(palace.factory!=='palace-v1'||journey.factory!=='journey-v1'||journey.palaceLift!==120||journey.cloudHeight!==100)throw Error('Unsupported procedural recipe');return ownScene(scene,()=>{createPalace(scene);return createJourneyView(scene);});});if(this.abort.signal.aborted)return;}else{createPalace(this.scene); if(this.config.sceneFixture==='p06-journey')this.journey=createJourneyView(this.scene);} } else if (this.config.sceneFixture === 'p01-depth') {
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
      if(/^p0[3456]-/.test(this.config.sceneFixture)) {
        const {GroundSession}=await import('../game/session');groundSessionClass=GroundSession;
        if(this.abort.signal.aborted)return;
        const spawn=this.config.spawn!;
        const p05=/^p0[56]-/.test(this.config.sceneFixture);
        const flight=this.config.sceneFixture.startsWith('p04-')||p05;
        const fixture=['p03-terrain','p04-flight','p05-camera'].includes(this.config.sceneFixture);
        const ground=await GroundSession.create(this.config.sceneFixture==='p06-journey'?'journey':this.config.sceneFixture==='p05-camera'?'camera-fixture':fixture?'fixture':'palace',{x:spawn[0],y:spawn[1],z:spawn[2]},{flight,flightSpeed:this.config.flightSpeedMetersPerSecond,shapes:this.collisionShapes,canMove:this.streamingWorld?(a,b)=>this.streaming?.permits(a,b)===true:undefined});
        if(this.abort.signal.aborted){ground.dispose();return;}
        this.ground=ground;
        if(this.streamingWorld){
          const assets=this.assets!;
          this.streaming=new ZoneScheduler(this.streamingWorld,(zone:Zone)=>{
            const lease=assets.acquire(zone.assetId);return {ready:lease.ready.then(bytes=>{const data=JSON.parse(new TextDecoder().decode(bytes));if(data.version!==1||!Array.isArray(data.shapes))throw Error('Invalid zone colliders');return data.shapes;}),release:lease.release};
          },(zone,shapes)=>{const owned=ground.addCollisions(shapes);this.zoneShapes.set(zone.id,shapes);return {value:shapes,dispose:()=>{this.zoneShapes.delete(zone.id);owned.dispose();}};},(zone,id)=>this.zoneShapes.get(zone.id)?.some(s=>s.id===id)===true);
        }
        this.ground=ground;this.input=new GroundInput(this.canvas,flight);
        const groundScene=this.scene;
        this.avatar=this.assets?await this.assets.own('ground.view',async()=>ownScene(groundScene,()=>createGroundView(groundScene,ground.shapes,fixture,!p05))):createGroundView(this.scene,ground.shapes,fixture,!p05);
        if(this.abort.signal.aborted)return;
        this.camera.lowerRadiusLimit=2;this.camera.upperRadiusLimit=60;this.camera.lowerBetaLimit=.05;this.camera.upperBetaLimit=Math.PI*.49;
        if(p05){
          this.avatar.dispose();this.avatar=null;
          const [{AvatarView},{PlayerCamera}]=await Promise.all([import('../game/avatar'),import('../game/player-camera')]);avatarClass=AvatarView;
          if(this.abort.signal.aborted)return;
          const scene=this.scene;
          const animated=this.assets?await this.assets.own('traveler.view',async()=>{const view=await AvatarView.load(scene,await this.assets!.hold('traveler.model'));return {value:view,dispose:()=>view.dispose()};}):await AvatarView.load(scene,new URL('characters/p05/traveler.glb',document.baseURI).href);
          if(this.abort.signal.aborted){animated.dispose();return;}
          this.animatedAvatar=animated;this.avatar=animated.root;
          this.camera.dispose();this.camera=null;
          const offset=this.config.cameraPositions[0].map((v,i)=>v-spawn[i]);
          this.playerCamera=new PlayerCamera(this.scene,this.canvas,ground,this.config.thirdPersonDistance,offset);
          this.scene.activeCamera=this.playerCamera.camera;
        }
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
      if(this.streaming&&this.ground){const s=this.ground.snapshot,f=this.playerCamera?.forward()||{x:0,z:-1};this.streaming.update(s.position,s.velocity,{x:f.x,y:0,z:f.z},s.supportId);}
      if(this.ground&&this.input&&(this.camera||this.playerCamera)) {
        const forward=this.playerCamera?.forward();
        const dx=forward?.x??this.camera!.target.x-this.camera!.position.x,dz=forward?.z??this.camera!.target.z-this.camera!.position.z;
        const n=Math.max(.00001,Math.hypot(dx,dz));
        for(let i=0;i<steps;i++)this.ground.step(this.input.consume({x:dx/n,z:dz/n},this.ground.snapshot.mode==='flying'));
        this.syncPlayerView(steps/this.config!.simulationHz);
      }
      const renderStart = performance.now();
      if(this.lastFrameTime) { this.intervals.push(renderStart-this.lastFrameTime); if(this.intervals.length>120) this.intervals.shift(); }
      this.lastFrameTime=renderStart;
      if(this.journey&&this.scene.activeCamera)this.journey.update(this.scene.activeCamera.position);
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
  private syncPlayerView(dt=0):void {
    if(!this.ground||!this.avatar)return;
    if(this.animatedAvatar&&this.playerCamera){
      this.animatedAvatar.update(this.ground.snapshot,dt);this.playerCamera.update(this.ground.snapshot,dt);this.animatedAvatar.setVisible(this.playerCamera.avatarVisible);return;
    }
    if(!this.camera)return;
    const state=this.ground.snapshot,p=state.position;
    this.avatar.position.set(p.x,p.y,p.z);this.avatar.rotation.y=state.yaw;
    const {alpha,beta,radius}=this.camera;
    this.camera.setTarget(new Vector3(p.x,p.y+.6,p.z));
    this.camera.alpha=alpha;this.camera.beta=beta;this.camera.radius=radius;
  }
  retryRegions():void{this.streaming?.retry();}
  changeCamera(): void {
    if(this.playerCamera){this.playerCamera.toggle();this.animatedAvatar?.setVisible(this.playerCamera.avatarVisible);this.canvas.focus({preventScroll:true});this.update();return;}
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
    this.playerCamera?.dispose();this.playerCamera=null;this.animatedAvatar?.dispose();this.animatedAvatar=null;
    this.streaming?.dispose();this.zoneShapes.clear();
    this.input?.dispose();this.input=null;this.ground?.dispose();this.ground=null;this.avatar=null;
    for (const remove of this.removeListeners.splice(0)) remove();
    this.engine?.stopRenderLoop(this.render);
    this.assets?.dispose();this.collisionShapes=undefined;
    this.instrumentation?.dispose(); this.instrumentation=null;
    this.scene?.dispose(); this.engine?.dispose();
    this.scene = null; this.engine = null; this.camera = null;this.journey=null;
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

      cameraEye: (this.playerCamera?.camera||this.camera)?.position.asArray().join(',') || null,
      cameraTarget: (this.playerCamera?.camera.getTarget()||this.camera?.target)?.asArray().join(',') || null,
      perspective:this.playerCamera?.perspective||null,cameraState:this.playerCamera?JSON.stringify(this.playerCamera.observe()):null,
      avatarAnimation:this.animatedAvatar?JSON.stringify(this.animatedAvatar.observe()):null,animatedAvatars:avatarClass?.instances||0,
      player:this.ground?JSON.stringify(this.ground.snapshot):null,
      physics:this.ground?JSON.stringify(this.ground.observe()):null,
      avatarHeightMeters:this.avatar?.metadata?.visualHeightMeters||null,
      avatarYaw:this.avatar?.rotation.y??null,
      avatarPosition:this.avatar?.position.asArray().join(',')||null,
      controllers:groundSessionClass?.instances||0,inputListeners:this.input?.listeners||0,pressedKeys:this.input?.pressed||'',
      inputFocused:document.activeElement===this.canvas,
      streaming:this.streaming?JSON.stringify(this.streaming.observe()):null,
      assets:this.assets?JSON.stringify(this.assets.observe()):null,
      journey:this.journey&&this.ground?JSON.stringify({location:journeyLocation(this.ground.snapshot),...this.journey.observe()}):null,
      fixture: this.config?.sceneFixture || null, renderer: this.renderer,
    });
  }
}
