import { level, makeTwoTanks } from '../src/engine/scenes';
const gamma = Number(process.argv[2] ?? 20);
const t = makeTwoTanks({ wA: 12, wB: 12, fillA: 26, fillB: 6, gamma, slotLen: 8, slotH: 3 });
const s = t.sim;
const surf = (x0:number,x1:number)=>{ // 95. percentyl wysokości cząstek
  const ys:number[]=[]; for(let i=s.nB;i<s.n;i++) if(s.px[i]>=x0&&s.px[i]<x1) ys.push(s.py[i]-t.floor);
  ys.sort((a,b)=>a-b); return ys[Math.floor(ys.length*0.97)];
};
for (let sec=1; sec<=30; sec++){
  for (let k=0;k<240;k++) s.step();
  if (sec%3===0){
    let vm=0; for(let i=s.nB;i<s.n;i++) vm=Math.max(vm,Math.hypot(s.vx[i],s.vy[i]));
    console.log(`t=${sec} countA=${level(t,'a').toFixed(2)} countB=${level(t,'b').toFixed(2)} surfA=${surf(t.a.x0,t.a.x1).toFixed(2)} surfB=${surf(t.b.x0,t.b.x1).toFixed(2)} vmax=${vm.toFixed(2)}`);
  }
}
