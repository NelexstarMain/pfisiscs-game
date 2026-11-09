/// <reference lib="webworker" />
import { SimHost } from './host';
import type { FromWorker, ToWorker } from './protocol';

const host = new SimHost();
const ctx = self as unknown as {
  postMessage(m: FromWorker, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
};
let inflight = 0;
const spare: Float32Array[] = [];
let last = performance.now();

ctx.onmessage = (e) => {
  const m = e.data;
  switch (m.type) {
    case 'build': {
      const r = host.build(m.id, m.doc, m.k);
      inflight = 0;
      spare.length = 0;
      last = performance.now();
      if (typeof r === 'string') ctx.postMessage({ type: 'error', id: m.id, message: r });
      else ctx.postMessage({ type: 'built', id: m.id, info: r });
      break;
    }
    case 'run':
      host.running = m.running;
      host.speed = m.speed;
      break;
    case 'cmd':
      if (host.command(m.cmd, m.id, m.value)) ctx.postMessage({ type: 'needRebuild' });
      break;
    case 'ack':
      inflight = Math.max(0, inflight - 1);
      spare.push(m.buf);
      break;
  }
};

/** pętla: posuwa symulację w tempie rzeczywistym × prędkość, ramki wysyła tylko, gdy interfejs nadąża */
function tick() {
  const now = performance.now();
  const realDt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (host.world && host.running && inflight < 2) {
    const r = host.advance(realDt * host.speed, 12);
    const f = host.frame(r.steps, r.stepMs, spare.pop());
    if (f) {
      inflight++;
      ctx.postMessage({ type: 'frame', ...f }, [f.pos.buffer]);
    }
  }
  setTimeout(tick, 0);
}
tick();
