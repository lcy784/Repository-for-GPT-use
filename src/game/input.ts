import type {PlayerIntent} from '../shared/contracts';
export class GroundInput {
 private keys=new Set<string>();private remove:(()=>void)[]=[];private sequence=0;private toggles=0;
 constructor(canvas:HTMLCanvasElement,private readonly flightEnabled=false){
  canvas.tabIndex=0;
  const listen=(target:EventTarget,type:string,handler:EventListener)=>{target.addEventListener(type,handler);this.remove.push(()=>target.removeEventListener(type,handler));};
  const recognized=(code:string)=>['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight',...(flightEnabled?['KeyF','Space','ControlLeft','ControlRight']:[])].includes(code);
  listen(window,'keydown',event=>{const e=event as KeyboardEvent;if(document.activeElement!==canvas||!recognized(e.code))return;e.preventDefault();if(e.code==='KeyF'&&!e.repeat&&!this.keys.has(e.code))this.toggles++;this.keys.add(e.code);});
  listen(window,'keyup',event=>{this.keys.delete((event as KeyboardEvent).code);});
  listen(window,'blur',()=>this.clear());listen(canvas,'blur',()=>this.clear());
  listen(canvas,'pointerdown',()=>canvas.focus({preventScroll:true}));
  listen(document,'visibilitychange',()=>{if(document.hidden)this.clear();});
 }
 consume(forward:{x:number;z:number},flying=false):PlayerIntent{
  const key=(...codes:string[])=>codes.some(c=>this.keys.has(c))?1:0;
  let x=key('KeyD','ArrowRight')-key('KeyA','ArrowLeft'),z=key('KeyW','ArrowUp')-key('KeyS','ArrowDown');
  const n=Math.max(1,Math.hypot(x,z));x/=n;z/=n;
  const flightRequest=this.toggles>0?(flying?'stop':'start'):null;if(this.toggles>0)this.toggles--;
  return Object.freeze({sequence:++this.sequence,movement:Object.freeze({x:forward.x*z-forward.z*x,y:this.flightEnabled?key('Space')-key('ControlLeft','ControlRight'):0,z:forward.z*z+forward.x*x}),viewDelta:Object.freeze({yaw:0,pitch:0}),flightRequest,interactionRequest:null});
 }
 clear(){this.keys.clear();this.toggles=0;}
 get listeners(){return this.remove.length;}
 get pressed(){return [...this.keys].sort().join(',');}
 dispose(){this.clear();for(const remove of this.remove.splice(0))remove();}
}
