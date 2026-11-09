import { level, makeTwoTanks } from '../src/engine/scenes';
const [gamma, iters, eps, k] = process.argv.slice(2).map(Number);
const t = makeTwoTanks({ wA: 12, wB: 12, fillA: 26, fillB: 6, gamma, slotLen: 8, slotH: 3 });
const s = t.sim; s.tune.iterations = iters; s.tune.epsilon = eps; s.tune.scorrK = k;
const surf = (x0:number,x1:number)=>{const ys:number[]=[];for(let i=s.nB;i<s.n;i++) if(s.px[i]>=x0&&s.px[i]<x1) ys.push(s.py[i]-t.floor);ys.sort((a,b)=>a-b);return ys[Math.floor(ys.length*0.97)];};
const t0=Date.now();
for (let k2=0;k2<240*20;k2++) s.step();
let vm=0; for(let i=s.nB;i<s.n;i++) vm=Math.max(vm,Math.hypot(s.vx[i],s.vy[i]));
console.log(`gamma=${gamma} it=${iters} eps=${eps} k=${k}: cA=${level(t,'a').toFixed(2)} cB=${level(t,'b').toFixed(2)} surfA=${surf(t.a.x0,t.a.x1).toFixed(2)} surfB=${surf(t.b.x0,t.b.x1).toFixed(2)} vmax=${vm.toFixed(2)} ms=${Date.now()-t0}`);
