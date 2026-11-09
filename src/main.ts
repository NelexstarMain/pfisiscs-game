import { ALL_TYPES, DEFS, type ComponentType } from './components/defs';
import { compile, CompileError, type World } from './compile/world';
import { EXAMPLES } from './examples';
import { Doc } from './model/doc';
import { computeNets } from './model/nets';
import { Scope } from './ui/scope';
import { SchematicView } from './ui/schematic-view';
import { WaterView, type NetLabels } from './ui/water-view';
import { R_MAX, R_MIN } from './compile/calibration';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const doc = new Doc();
const status = $('status');
const setStatus = (m: string) => (status.textContent = m);

const schematic = new SchematicView($<HTMLCanvasElement>('schematic'), doc, {
  onSelect: () => renderProps(),
  onStatus: setStatus,
});
const water = new WaterView($<HTMLCanvasElement>('water'));
const scope = new Scope($<HTMLCanvasElement>('scope'));
let scopeNets: string[] = [];

let world: World | null = null;
let running = true;
let speed = 2;
let rebuildTimer = 0;

// ---------- paleta ----------
const palette = $('palette');
const palButtons = new Map<ComponentType, HTMLButtonElement>();
for (const t of ALL_TYPES) {
  const b = document.createElement('button');
  b.textContent = DEFS[t].label;
  b.title = DEFS[t].water;
  b.addEventListener('click', () => {
    schematic.placing = schematic.placing === t ? null : t;
    updatePalette();
    setStatus(schematic.placing ? `Kliknij na schemacie, aby postawić: ${DEFS[t].label}` : '');
  });
  palette.appendChild(b);
  palButtons.set(t, b);
}
function updatePalette() {
  for (const [t, b] of palButtons) b.classList.toggle('active', schematic.placing === t);
}

// ---------- kompilacja świata ----------
const SHORT: Partial<Record<ComponentType, string>> = { resistor: 'R', capacitor: 'C', diode: 'Dioda', led: 'LED', fuse: 'Bezp.', bulb: 'Żarówka' };
function labelsFor(): NetLabels {
  const nl = computeNets(doc);
  const net = new Map<string, string>();
  const comp = new Map<string, string>();
  let n = 1;
  for (const nt of nl.nets) {
    let name = '';
    for (const p of nt.ports) {
      const c = doc.components.get(p.slice(0, p.lastIndexOf(':')));
      if (c && (c.type === 'supply' || c.type === 'battery') && p.endsWith(':1')) name = `+${c.value} V`;
      if (c && c.type === 'ac' && p.endsWith(':1')) name = `AC ±${c.value} V`;
    }
    if (nt.id === nl.groundNet) name = 'Masa (GND)';
    net.set(nt.id, name || `Węzeł ${n++}`);
  }
  for (const c of doc.components.values()) {
    const u = DEFS[c.type].unit;
    comp.set(c.id, c.type === 'switch' ? `Przełącznik: ${c.value >= 0.5 ? 'zwarty' : 'rozwarty'}` : `${SHORT[c.type] ?? DEFS[c.type].label} ${c.value}${u ? ' ' + u : ''}`);
  }
  return { net, comp };
}

function rebuild() {
  try {
    world = compile(doc);
    water.message = '';
    const volts = [...doc.components.values()].filter((c) => c.type === 'supply' || c.type === 'battery' || c.type === 'ac').map((c) => c.value);
    water.vmax = schematic.vmax = Math.max(5, ...volts);
  } catch (e) {
    world = null;
    water.message = e instanceof CompileError ? e.message.replace('. ', '.\n') : `Błąd: ${(e as Error).message}`;
  }
  water.world = world;
  schematic.world = world;
  water.labels = labelsFor();
  scope.reset();
  scopeNets = [];
  const wd = world;
  if (wd) {
    const nl = computeNets(doc);
    const probed = [...doc.components.values()].filter((c) => c.type === 'voltmeter').map((c) => nl.netOf.get(`${c.id}:0`)!);
    const pool = probed.length ? probed : [...wd.tanks.keys()].filter((n) => n !== wd.gnd.net);
    scopeNets = [...new Set(pool)].filter((n) => wd.tanks.has(n)).slice(0, 5);
  }
}
function scheduleRebuild() {
  window.clearTimeout(rebuildTimer);
  rebuildTimer = window.setTimeout(rebuild, 120);
}
doc.subscribe((cmd) => {
  // przełącznik zmieniamy w locie, bez resetu wody; przesunięcia i obroty nie zmieniają obwodu
  const kinds = cmd.kind === 'batch' ? cmd.cmds.map((c) => c.kind) : [cmd.kind];
  if (kinds.length && kinds.every((k) => k === 'move' || k === 'rotate')) return;
  if (cmd.kind === 'value') {
    const c = doc.components.get(cmd.id);
    if (c && c.type !== 'switch' && world && world.setValue(c.id, c.value)) {
      // zmiana w locie, bez resetu wody
      water.labels = labelsFor();
      if (c.type === 'supply' || c.type === 'ac') water.vmax = schematic.vmax = Math.max(5, c.value);
      renderProps();
      return;
    }
    if (c && c.type === 'switch' && world) {
      world.setSwitch(c.id, c.value >= 0.5);
      water.labels = labelsFor();
      renderProps();
      return;
    }
  }
  scheduleRebuild();
  renderProps();
});

// ---------- panel właściwości ----------
function renderProps() {
  const body = $('props-body');
  const id = schematic.selected && !schematic.selected.startsWith('wire:') ? schematic.selected : null;
  const c = id ? doc.components.get(id) : null;
  if (!c) {
    body.innerHTML = '<p class="hint">Zaznacz element, aby zmienić jego wartość.</p>';
    return;
  }
  const def = DEFS[c.type];
  let html = `<div><b>${def.label}</b></div><div class="analogy">${def.water}</div>`;
  if (c.type === 'switch') {
    html += `<button id="toggle">${c.value >= 0.5 ? 'Rozewrzyj' : 'Zewrzyj'}</button>`;
  } else if (c.type !== 'ground' && c.type !== 'voltmeter') {
    const isR = c.type === 'resistor' || c.type === 'bulb';
    html += `<label>Wartość [${def.unit}]</label><input id="val" type="number" step="any" min="${isR ? R_MIN.toFixed(1) : 0}" ${isR ? `max="${R_MAX.toFixed(0)}"` : ''} value="${c.value}">`;
    const sl = sliderFor(c.type);
    if (sl) html += `<input id="slider" type="range" min="${sl.min}" max="${sl.max}" step="${sl.step}" value="${c.value}">`;
    if (isR) html += `<p class="hint">Zakres symulacji: ${R_MIN.toFixed(0)}…${R_MAX.toFixed(0)} Ω.</p>`;
  }
  if (world && (c.type === 'resistor' || c.type === 'bulb' || c.type === 'switch')) {
    html += `<div class="kv"><span>Prąd</span><b id="m-i">–</b></div><div class="kv"><span>Napięcie</span><b id="m-v">–</b></div><div class="kv"><span>Moc</span><b id="m-p">–</b></div>`;
  }
  body.innerHTML = html;
  $('toggle')?.addEventListener('click', () => doc.apply({ kind: 'value', id: c.id, value: c.value >= 0.5 ? 0 : 1 }));
  const slider = body.querySelector<HTMLInputElement>('#slider');
  slider?.addEventListener('input', () => {
    // podgląd na żywo: zmieniamy świat, ale jeszcze nie dokument (jedno cofnięcie na cały ruch suwaka)
    const v = Number(slider.value);
    world?.setValue(c.id, v);
    const num = body.querySelector<HTMLInputElement>('#val');
    if (num) num.value = String(v);
  });
  slider?.addEventListener('change', () => {
    const v = Number(slider.value);
    if (v !== c.value) doc.apply({ kind: 'value', id: c.id, value: v });
  });
  const inp = body.querySelector<HTMLInputElement>('#val');
  inp?.addEventListener('change', () => {
    let v = Number(inp.value);
    if (!Number.isFinite(v)) return;
    if (c.type === 'resistor' || c.type === 'bulb') v = Math.min(R_MAX, Math.max(R_MIN, v));
    if (v !== c.value) doc.apply({ kind: 'value', id: c.id, value: v });
  });
}
function sliderFor(t: ComponentType): { min: number; max: number; step: number } | null {
  switch (t) {
    case 'resistor':
    case 'bulb':
      return { min: R_MIN, max: R_MAX, step: 1 };
    case 'supply':
      return { min: 0, max: 12, step: 0.5 };
    case 'ac':
      return { min: 0, max: 6, step: 0.5 };
    case 'fuse':
      return { min: 0.05, max: 0.6, step: 0.05 };
    default:
      return null;
  }
}
function updateMeasurements() {
  const id = schematic.selected;
  if (!world || !id) return;
  const ci = world.conds.find((x) => x.id === id);
  if (!ci) return;
  const i = world.current(id);
  const v = world.voltage(ci.netA) - world.voltage(ci.netB);
  const set = (k: string, t: string) => {
    const el = document.getElementById(k);
    if (el) el.textContent = t;
  };
  set('m-i', `${(i * 1000).toFixed(0)} mA`);
  set('m-v', `${Math.abs(v).toFixed(2)} V`);
  set('m-p', `${Math.abs(v * i).toFixed(2)} W`);
}

// ---------- pasek narzędzi ----------
const runBtn = $<HTMLButtonElement>('run');
runBtn.addEventListener('click', () => {
  running = !running;
  runBtn.textContent = running ? '⏸ Pauza' : '▶ Start';
});
$('restart').addEventListener('click', rebuild);
$<HTMLSelectElement>('speed').addEventListener('change', (e) => (speed = Number((e.target as HTMLSelectElement).value)));
$('undo').addEventListener('click', () => doc.undo());
$('redo').addEventListener('click', () => doc.redo());
$<HTMLInputElement>('overlay').addEventListener('change', (e) => (water.overlay = (e.target as HTMLInputElement).checked));
const exSel = $<HTMLSelectElement>('examples');
for (const [k, v] of Object.entries(EXAMPLES)) exSel.add(new Option(v.label, k));
exSel.addEventListener('change', () => {
  const ex = EXAMPLES[exSel.value];
  if (ex) {
    doc.load(JSON.parse(JSON.stringify(ex.data)));
    schematic.select(null);
    setStatus(`Wczytano: ${ex.label}`);
  }
  exSel.value = '';
});
$('save').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(doc.toJSON(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'obwod.json';
  a.click();
  try {
    localStorage.setItem('pfisiscs-doc', JSON.stringify(doc.toJSON()));
  } catch {
    /* brak dostępu do localStorage */
  }
  setStatus('Zapisano plik obwod.json');
});
$('load').addEventListener('click', () => {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'application/json';
  inp.addEventListener('change', async () => {
    const f = inp.files?.[0];
    if (!f) return;
    try {
      doc.load(JSON.parse(await f.text()));
      setStatus('Wczytano plik.');
    } catch (e) {
      setStatus(`Nie udało się wczytać: ${(e as Error).message}`);
    }
  });
  inp.click();
});
const viewSel = $<HTMLSelectElement>('view');
viewSel.addEventListener('change', () => {
  $('pane-schematic').style.display = viewSel.value === 'water' ? 'none' : '';
  $('pane-water').style.display = viewSel.value === 'schematic' ? 'none' : '';
  layout();
});

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  if (e.key === ' ') {
    e.preventDefault();
    runBtn.click();
  } else if (e.key === 'Delete' || e.key === 'Backspace') schematic.deleteSelected();
  else if (e.key === 'r' || e.key === 'R') schematic.rotateSelected();
  else if (e.key === 'Escape') {
    schematic.cancel();
    updatePalette();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    e.shiftKey ? doc.redo() : doc.undo();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    doc.redo();
  }
  updatePalette();
});

// ---------- układ i pętla ----------
function layout() {
  for (const [pane, view] of [
    [$('pane-schematic'), schematic],
    [$('pane-water'), water],
  ] as const) {
    if (pane.style.display === 'none') continue;
    view.resize(Math.max(100, pane.clientWidth), Math.max(100, pane.clientHeight));
  }
}
function layoutScope() {
  const wrap = $('scope-wrap');
  scope.resize(Math.max(100, wrap.clientWidth), Math.max(60, wrap.clientHeight));
}
const baseLayout = layout;
window.addEventListener('resize', layoutScope);
void baseLayout;

let last = performance.now();
let frame = 0;
function loop(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (running && world) {
    const t0 = performance.now();
    const n = Math.round(4 * speed);
    for (let k = 0; k < n; k++) {
      world.step();
      scope.push(world, scopeNets);
      if (performance.now() - t0 > 14) break; // budżet czasu klatki
    }
  }
  if (!$('pane-schematic').style.display) schematic.draw(dt);
  if (!$('pane-water').style.display) water.draw();
  if (world) scope.draw(water.vmax, water.labels.net, scopeNets);
  if (++frame % 10 === 0) updateMeasurements();
  requestAnimationFrame(loop);
}

// start: przykładowy obwód lub zapisany
let startData = EXAMPLES.resistor.data;
try {
  const saved = localStorage.getItem('pfisiscs-doc');
  if (saved) startData = JSON.parse(saved);
} catch {
  /* brak dostępu do localStorage */
}
doc.load(JSON.parse(JSON.stringify(startData)));
rebuild();
layout();
layoutScope();
requestAnimationFrame(loop);
(window as unknown as { __app: unknown }).__app = { doc, get world() { return world; }, schematic, water };
