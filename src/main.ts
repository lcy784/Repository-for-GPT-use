import './style.css';
import { Application } from './runtime/application';

const container = document.querySelector<HTMLElement>('#scene')!;
const notice = document.querySelector<HTMLElement>('#notice')!;
const metrics = document.querySelector<HTMLElement>('#metrics')!;
const camera = document.querySelector<HTMLButtonElement>('#camera')!;
const stop = document.querySelector<HTMLButtonElement>('#stop')!;
let application: Application | null = null;
let totalFrames = 0;
let generation = 0;
function observe() { return Object.freeze({ ...application?.observe(), totalFrames, generation, canvases: container.querySelectorAll('canvas').length }); }
Object.defineProperty(window, '__TIANGONG_OBSERVE__', { value: observe, writable: false, configurable: false });
function update(): void {
  const value = application?.observe();
  if (!value) return;
  const mode=value.player?JSON.parse(value.player).mode:null;
  const flightLabel=mode==='flying'?'飞行中 · 空格上升 · Ctrl 下降 · F 收起飞行':mode==='falling'?'下落中 · F 可重新起飞':'地面行走 · F 起飞';
  const labels = { loading: '正在准备三维空间…', ready: value.fixture?.startsWith('p04-') ? flightLabel : value.fixture?.startsWith('p03-') ? '点击场景开始行走 · WASD / 方向键 · 拖动转向 · 失焦即停' : '空间已就绪 · 拖动旋转，滚轮缩放', paused: '预览已暂停，返回此页后恢复', disposed: '预览已结束，可重新载入', error: value.error || '场景启动失败' };
  notice.textContent = labels[value.phase];
  notice.dataset.error = String(value.phase === 'error');
  camera.disabled = value.phase !== 'ready';
  stop.disabled = value.phase === 'disposed' || value.phase === 'error';
  metrics.textContent = JSON.stringify(value, null, 2);
}
function start(): void {
  application?.dispose();
  generation++;
  application = new Application(container, update, () => { totalFrames++; });
  update();
  void application.start();
}
document.querySelector('#restart')!.addEventListener('click', start);
camera.addEventListener('click', () => application?.changeCamera());
stop.addEventListener('click', () => application?.dispose());
window.addEventListener('pagehide', () => application?.dispose(), { once: true });
start();
