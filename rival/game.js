// RIVAL — a one-thumb duel against an AI that studies how you fight and counters it.
// Plain JS + canvas, no dependencies. Save + learning live in localStorage.
(() => {
'use strict';

// ---------- constants ----------
const W = 420, H = 720;                 // logical arena (portrait phone)
const PR = 10, PHIT = 6, RR = 22;       // player radius, player hit radius, rival radius
const DASH_SPEED = 960, DASH_DUR = .19, MAX_CHARGES = 2, SHARDS_PER_DASH = 3, HEARTS = 3, SHARDS_ON_FIELD = 3;
const C = { bg:'#07080f', arena:'#0d1022', grid:'#161a36', cyan:'#3df2ff', pink:'#ff3d81',
            gold:'#ffd23d', green:'#5dff9b', red:'#ff4b4b', ink:'#eef1ff', dim:'#8a90b8', vent:'#3dffd8' };
const SECT = ['the right','below-right','below','below-left','the left','above-left','above','above-right'];
const ZONES = ['top-left corner','top','top-right corner','left side','dead centre','right side','bottom-left corner','bottom','bottom-right corner'];
const EDGES = ['left wall','right wall','top wall','bottom wall'];
const TRAILS = [ {c:'#3df2ff', n:'Cyan'}, {c:'#5dff9b', n:'Mint'}, {c:'#ffd23d', n:'Gold'}, {c:'#b98cff', n:'Violet'}, {c:'#ffffff', n:'Ghost'} ];
const ROMAN = ['', 'I', 'II', 'III'];

// Counters it can build. Top four answer HOW you attack; bottom four answer WHERE you stand.
const CT = {
  shield:   { name:'SHIELD',      col:'#5ad1ff', title:'THE WALL',        habit:'you always attack from the same side', desc:'Blocks dashes from your favourite side. Flank it.' },
  feint:    { name:'FEINT',       col:'#ffd23d', title:'THE TRICKSTER',   habit:'you wait for it to open up',         desc:'Fakes its cooldown to bait your dash, then punishes.' },
  sidestep: { name:'SIDESTEP',    col:'#b98cff', title:'THE DANCER',      habit:'you dash in from far away',           desc:'Sees long dashes coming and steps aside.' },
  thorns:   { name:'THORNS',      col:'#ff7ad9', title:'THE BRAMBLE',     habit:'you fight up close',                  desc:'Bursts spikes when you crowd it.' },
  bombs:    { name:'BOMBS',       col:'#ff9a3d', title:'THE FORECASTER',  habit:'you move predictably',                desc:'Lobs bombs where you’re about to be.' },
  mines:    { name:'MINES',       col:'#ff4b4b', title:'THE MINELAYER',   habit:'you camp the same spots',             desc:'Seeds mines in your path.' },
  lasers:   { name:'WALL LASERS', col:'#3d8bff', title:'THE WALL-BREAKER',habit:'you hug the walls',                   desc:'Burns the wall you lean on.' },
  seekers:  { name:'SEEKERS',     col:'#c6ff3d', title:'THE HUNTER',      habit:'you keep your distance',              desc:'Missiles that chase you down.' },
};
const MIRROR = { name:'MIRROR', col:'#ffffff' };
const SRC = { shots:{ name:'SHOTS', col:C.pink }, barrage:{ name:'BARRAGE', col:C.pink }, feint:CT.feint, mirror:MIRROR };
const nameOf = id => (CT[id] || SRC[id] || SRC.shots).name;
const colOf = id => (CT[id] || SRC[id] || SRC.shots).col;
const CAD = { bombs:[0,3,2.3], mines:[0,2.4,1.8], lasers:[0,4.4,3.4], seekers:[0,4.8,3.6], thorns:[0,3.3,2.5] };
const CHALLENGES = [
  { id:'win',   text:'Win a duel', goal:1 },
  { id:'crits', text:'Land 6 crits on a venting rival', goal:6 },
  { id:'flank', text:'Hit it 3× while its shield is up', goal:3 },
  { id:'clean', text:'Win taking at most 1 hit', goal:1 },
];

// ---------- canvas ----------
const cvs = document.getElementById('c'), ctx = cvs.getContext('2d'), ov = document.getElementById('ov');
let dpr = 1, sc = 1, ox = 0, oy = 0;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const ww = innerWidth, wh = innerHeight;
  cvs.width = ww * dpr; cvs.height = wh * dpr; cvs.style.width = ww + 'px'; cvs.style.height = wh + 'px';
  sc = Math.min(ww / W, wh / H); ox = (ww - W * sc) / 2; oy = (wh - H * sc) / 2;
  Object.assign(ov.style, { left: ox + 'px', top: oy + 'px', width: W * sc + 'px', height: H * sc + 'px', fontSize: (15 * sc) + 'px' });
}
addEventListener('resize', resize); resize();

// ---------- helpers ----------
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const sum = a => a.reduce((x, y) => x + y, 0);
const norm = a => { const s = sum(a) || 1; return a.map(v => v / s); };
const argmax = a => a.reduce((bi, v, i) => v > a[bi] ? i : bi, 0);
const pct = v => Math.round(clamp(v, 0, 1) * 100) + '%';
const mmss = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
const zoneOf = (x, y) => clamp(Math.floor(y / (H / 3)), 0, 2) * 3 + clamp(Math.floor(x / (W / 3)), 0, 2);
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const sectorOf = a => ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
const share3 = s => s.map((v, i) => v + s[(i + 7) % 8] + s[(i + 1) % 8]);   // a 'side' = sector ± neighbours (135° arc; uniform = .375)

// ---------- save ----------
const KEY = 'rival_duel_v1';
function defSave() {
  return { level: 1, wins: 0, losses: 0, duelsToday: 0, bestWin: null, playbook: {}, memory: null, habits: {},
    form: 1, signature: null,
    prof: { sectors: Array(8).fill(1 / 8), zones: Array(9).fill(1 / 9), range: 170, waitRatio: 0, edge: 0 },
    lastDay: null, streak: 0, days: 1, dayOffset: 0, chal: null, trails: ['#3df2ff'], trail: '#3df2ff', muted: false };
}
let save = (() => { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.prof) return Object.assign(defSave(), s); } catch (e) {} return defSave(); })();
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} };
const rivalHP = () => 10 + 2 * (save.level - 1);
const rivalTitle = () => save.signature ? CT[save.signature].title : '';

// ---------- days (D1 hook) ----------
const dayStr = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const today = () => { const d = new Date(); d.setDate(d.getDate() + (save.dayOffset || 0)); return dayStr(d); };
const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
const newChal = () => ({ day: today(), id: CHALLENGES[(save.days - 1) % CHALLENGES.length].id, progress: 0, done: false });
const chalDef = () => CHALLENGES.find(c => c.id === save.chal.id);
function checkNewDay() {
  const t = today();
  if (!save.lastDay) { save.lastDay = t; save.streak = 1; save.chal = newChal(); persist(); return null; }
  if (!save.chal) save.chal = newChal();
  const diff = dayDiff(save.lastDay, t);
  if (diff <= 0) return null;
  save.streak = diff === 1 ? save.streak + 1 : 1; save.days++; save.lastDay = t; save.chal = newChal();
  const evo = save.duelsToday > 0 ? evolve() : null;
  save.duelsToday = 0; persist();
  return evo;
}
// Overnight: it reviews every counter it had to build against you and trains a signature.
function evolve() {
  const ids = Object.keys(save.habits).sort((a, b) => save.habits[b] - save.habits[a]);
  if (!ids.length) return null;
  const sig = ids[0], prevLvl = save.playbook[sig] || 0;
  save.form++; save.signature = sig; save.playbook[sig] = Math.min(2, prevLvl + 1);
  return { sig, count: save.habits[sig], lvl: save.playbook[sig] };
}
function tonightHint() {
  const ids = Object.keys(save.habits).sort((a, b) => save.habits[b] - save.habits[a]);
  if (!ids.length) return 'Tonight it studies you.';
  return `Tonight it trains against your recordings. It’s leaning towards <b style="color:${CT[ids[0]].col}">${CT[ids[0]].title}</b>…`;
}

// ---------- audio ----------
let AC = null;
function audio() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (AC && AC.state === 'suspended') AC.resume(); }
function beep(f, d = .08, type = 'square', v = .04, slide = 0, delay = 0) {
  if (!AC || save.muted) return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
  o.connect(g).connect(AC.destination); o.start(t); o.stop(t + d + .02);
}
const sfx = {
  dash: () => beep(520, .12, 'triangle', .04, 500),
  hit: crit => { beep(crit ? 180 : 140, .18, 'square', .07, -60); beep(crit ? 1200 : 800, .1, 'triangle', .05, -300); },
  block: () => { beep(1600, .06, 'square', .05, -900); beep(300, .2, 'triangle', .04, -150, .03); },
  hurt: () => { beep(120, .3, 'sawtooth', .08, -60); },
  graze: () => beep(1400, .04, 'sine', .025),
  fire: () => beep(220, .03, 'sawtooth', .008, -80),
  warn: () => beep(160, .15, 'square', .02),
  boom: () => { beep(110, .35, 'sawtooth', .07, -70); beep(60, .4, 'square', .05, -20); },
  adapt: () => { beep(330, .18, 'sawtooth', .05, -120); beep(247, .25, 'sawtooth', .05, -100, .16); beep(165, .5, 'square', .05, -60, .34); },
  vent: () => beep(600, .25, 'sine', .03, -300),
  win: () => [523, 659, 784, 1046, 1318].forEach((f, i) => beep(f, .16, 'triangle', .05, 0, i * .09)),
  lose: () => { beep(200, .5, 'sawtooth', .08, -170); beep(90, .6, 'square', .06, -50); },
};

// ---------- input ----------
const keys = {};
// Phones: a fixed joystick at the bottom (grab anywhere in the bottom third), tap anywhere above it to dash.
const JOY = { x: W / 2, y: H - 112, r: 56, knob: 26, zoneY: H * .66, speed: 340 };
let joy = null;                // {id, kx, ky}  — active steering touch
let tapT = null;               // {id, x, y, t0} — candidate dash tap in the upper area
let touchUI = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const toLogical = e => [(e.clientX - ox) / sc, (e.clientY - oy) / sc];
addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase(); if (keys[k]) return; keys[k] = true; audio();
  if (k === 'm') { save.muted = !save.muted; persist(); }
  if (k === ' ' || k === 'enter') { e.preventDefault();
    if (state === 'play') tryDash(); else if (state === 'menu' || (state === 'over' && canRestart())) startFight(); }
});
addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
cvs.addEventListener('pointerdown', e => {
  audio(); const [x, y] = toLogical(e);
  if (e.pointerType === 'mouse') { touchUI = false; P.tx = x; P.ty = y; if (state === 'play') tryDash(); return; }
  touchUI = true; e.preventDefault();
  if (state !== 'play') return;
  if (!joy && (y > JOY.zoneY || dist(x, y, JOY.x, JOY.y) < JOY.r * 1.6)) { joy = { id: e.pointerId, kx: x, ky: y }; return; }  // steer
  if (F.banner) { tryDash(); return; }                                                                                 // tap skips pause
  if (joy) { tryDash(); return; }                                    // second finger while steering = dash right away
  tapT = { id: e.pointerId, x, y, t0: performance.now() };           // upper area: dash on a clean tap
}, { passive: false });
addEventListener('pointermove', e => {
  const [x, y] = toLogical(e);
  if (e.pointerType === 'mouse') { P.tx = x; P.ty = y; return; }
  if (joy && e.pointerId === joy.id) { joy.kx = x; joy.ky = y; }
  if (tapT && e.pointerId === tapT.id && dist(x, y, tapT.x, tapT.y) > 18) tapT = null;
});
const endTouch = e => {
  if (joy && e.pointerId === joy.id) { joy = null; P.tx = P.x; P.ty = P.y; }
  if (tapT && e.pointerId === tapT.id) { if (state === 'play' && performance.now() - tapT.t0 < 300) tryDash(); tapT = null; }
};
addEventListener('pointerup', endTouch);
addEventListener('pointercancel', endTouch);

// ---------- state ----------
let state = 'menu', F = null, P = { x: W / 2, y: H * .7, tx: W / 2, ty: H * .7, vx: 0, vy: 0, trail: [] };
let parts = [], texts = [], shake = 0, flash = 0, hitstop = 0, timeScale = 1, overAt = 0, result = null;
const canRestart = () => performance.now() - overAt > 650;
const newWin = () => ({ t: 0, zones: Array(9).fill(0), edges: [0, 0, 0, 0], edgeT: 0, stillT: 0, moveT: 0, straightSum: 0, straightN: 0, distSum: 0, closeT: 0 });

function newFight() {
  return { t: 0, hp: rivalHP(), maxHp: rivalHP(), hearts: HEARTS, inv: 0, stun: 0, charges: 1, shards: [], shardT: .3, shardsTaken: 0, dash: null,
    rival: { x: W / 2, y: 150, a: -Math.PI / 2, ang: Math.PI / 2, pulse: 0, flash: 0, windup: 0, vent: 0, fakeVent: 0, side: null, sideCd: 0,
      shieldAng: null, thorns: 0, mirror: null, mirrorT: 2, counterT: 0 },
    bullets: [], bombs: [], blasts: [], mines: [], lasers: [], missiles: [],
    arsenal: {}, wt: {}, reads: [], readT: 0, final: false, nextAdapt: 3 + Math.floor(rnd(0, 2)), lastAdapt: -99, pendingAdapt: 0, order: [],
    win: newWin(), dashes: [], hits: [], lastOpen: -9, fireT: 1.4, barrageT: 5.5, barrage: null,
    bark: null, banner: null, tint: null, crits: 0, flanks: 0, hitsTaken: 0, killer: null,
    svx: 0, svy: 0, lastHead: null, headT: 0, zonesFight: Array(9).fill(0), edgeFight: 0 };
}
function activate(id, lvl) { F.arsenal[id] = Math.max(F.arsenal[id] || 0, lvl); F.wt[id] = 1.4; if (id === 'shield' && F.rival.shieldAng == null) F.rival.shieldAng = favAngle(); }

function startFight() {
  audio(); state = 'play'; ov.classList.add('hide');
  P = { x: W / 2, y: H * .74, tx: W / 2, ty: H * .74, vx: 0, vy: 0, trail: [] };
  joy = null; tapT = null;
  parts = []; texts = []; shake = 0; flash = 0; hitstop = 0; timeScale = 1;
  F = newFight();
  const pb = Object.keys(save.playbook);
  for (const id of pb.slice(-3)) activate(id, save.playbook[id]);
  if (save.memory && !F.arsenal[save.memory]) activate(save.memory, 1);
  const start = Object.keys(F.arsenal);
  for (const id of start) F.wt[id] = 2.4;
  if (start.length) {
    const id = save.memory && start.includes(save.memory) ? save.memory : start[0];
    F.banner = { title: 'IT REMEMBERS', id, lvl: F.arsenal[id], why: id === save.memory ? `${nameOf(id)} beat you last time.` : `It studied how you beat it: ${CT[id].habit}.`, life: 2.6, max: 2.6 };
    bark(pick(['I’ve been practising.', 'Let’s see if you’ve changed.', 'I remember you.']));
  } else {
    say(save.wins + save.losses === 0 ? '3 shards = 1 dash → tap to DASH into it' : 'Round ' + (save.wins + save.losses + 1), W / 2, H * .5, C.ink, 18, 2.2);
    bark(save.wins + save.losses === 0 ? 'Show me how you fight.' : 'Again?');
  }
}

// ---------- the read: how did you fight, and what counters it? ----------
function fightSectors() {
  const c = Array(8).fill(0); for (const d of F.dashes) c[d.sector]++;
  const n = F.dashes.length; if (!n) return save.prof.sectors.slice();
  const fn = norm(c), wgt = Math.min(.75, n / 8);
  return save.prof.sectors.map((v, i) => v * (1 - wgt) + fn[i] * wgt);
}
function favSector() { return argmax(share3(fightSectors())); }
function favAngle() { return favSector() * Math.PI / 4; }
function readFight() {
  const w = F.win, T = Math.max(w.t, .1), ds = F.dashes, n = ds.length;
  const s3 = share3(fightSectors()), fs = argmax(s3), side = s3[fs];        // share of attacks from one side (uniform = .375)
  const wait = n ? ds.filter(d => d.waited).length / n : 0;
  const range = n ? sum(ds.map(d => d.range)) / n : 0;
  const zs = sum(w.zones) || 1, zi = argmax(w.zones), conc = w.zones[zi] / zs;
  const straight = w.straightN > 3 ? clamp((w.straightSum / w.straightN - .45) / .55, 0, 1) : 0;
  const moving = w.moveT / T, still = w.stillT / T, edge = w.edgeT / T, avgD = w.distSum / T, close = w.closeT / T;
  const ok = n >= 2;
  return {
    shield:   { s: ok ? (side - .45) * 2.6 : 0, why: `You attacked from ${SECT[fs]} ${pct(side)} of the time.`, bark: `You always come from ${SECT[fs]}.` },
    feint:    { s: ok ? (wait - .3) * 1.8 : 0, why: `${pct(wait)} of your dashes came right after its attacks.`, bark: 'You wait for my opening. Noted.' },
    sidestep: { s: ok ? (range - 165) / 35 : 0, why: `You dash in from ${Math.round(range)}px away. Long, readable dashes.`, bark: 'I can see you coming from there.' },
    thorns:   { s: close * 2.2 + (ok && range < 150 ? .3 : 0), why: `You spent ${pct(close)} of the time right on top of it.`, bark: 'You like it close? Let’s get close.' },
    bombs:    { s: straight * Math.min(1, moving * 1.3) * .9 + .12, why: straight > .45 ? `Your movement was ${pct(straight)} predictable.` : 'You never stop moving. It aims where you’re going.', bark: 'I know where you’re going.' },
    mines:    { s: Math.max(0, conc - .3) * 1.2 + still * .6, why: `You camped the ${ZONES[zi]} for ${pct(conc)} of that read.`, bark: 'Comfortable there?' },
    lasers:   { s: edge * 1.7, why: `You hugged the ${EDGES[argmax(w.edges)]} ${pct(edge)} of the time.`, bark: 'Walls won’t save you.' },
    seekers:  { s: clamp((avgD - 260) / 120, 0, 1), why: `You kept ${Math.round(avgD)}px away from it.`, bark: 'Stop running.' },
  };
}
function adapt(kind) {
  const reads = readFight(), activeN = Object.keys(F.arsenal).length;
  let best = null;
  for (const id in reads) {
    const lv = F.arsenal[id] || 0;
    if (lv >= 2) continue;
    const s = reads[id].s * (lv ? .55 : 1) * rnd(.92, 1.08);
    if (!best || s > best.s) best = { id, s, ...reads[id] };
  }
  F.win = newWin(); F.readT = rnd(-4, 0); F.lastAdapt = F.t;
  if (!best) return;
  let dropped = null;
  if (!F.arsenal[best.id] && Object.keys(F.arsenal).length >= 3) {
    dropped = F.order.find(id => F.arsenal[id]) || Object.keys(F.arsenal)[0];
    delete F.arsenal[dropped]; delete F.wt[dropped]; if (dropped === 'shield') F.rival.shieldAng = null;
  }
  const lvl = (F.arsenal[best.id] || 0) + 1; activate(best.id, lvl);
  F.order = F.order.filter(id => id !== best.id && F.arsenal[id]); F.order.push(best.id);
  if (best.id === 'shield') F.rival.shieldAng = favAngle();
  save.habits[best.id] = (save.habits[best.id] || 0) + 1;
  F.reads.push({ t: F.t, id: best.id, lvl, why: best.why, kind });
  F.banner = { title: lvl > 1 ? 'IT GOT STRONGER' : 'NEW MOVE', id: best.id, lvl, why: best.why + (dropped ? ` (Dropped ${CT[dropped].name}.)` : ''), life: 2.6, max: 2.6 };
  // sell it: freeze, flash, shockwave
  flash = .3; shake = 9; F.tint = { col: CT[best.id].col, life: .8 }; F.rival.pulse = 1.6; sfx.adapt();
  burst(F.rival.x, F.rival.y, CT[best.id].col, 34, 320, .8, 4);
  F.bullets.forEach(b => { if (dist(b.x, b.y, P.x, P.y) < 70) b.dead = true; });   // fairness: clear shots on top of you
}
function finalRead() {
  F.final = true;
  const gaps = []; for (let i = 1; i < F.dashes.length; i++) gaps.push(F.dashes[i].t - F.dashes[i - 1].t);
  const rhythm = clamp(gaps.length ? sum(gaps) / gaps.length : 2, 1.3, 2.6), fs = favSector();
  F.rival.mirror = { st: 'cool', t: 0, rhythm, sector: fs };
  F.reads.push({ t: F.t, id: 'mirror', lvl: 1, why: `It copied your dash: every ${rhythm.toFixed(1)}s, from ${SECT[fs]}.`, kind: 'final' });
  F.banner = { title: 'NEW MOVE', id: 'mirror', lvl: 1, why: `It copied your dash. Every ${rhythm.toFixed(1)}s, from ${SECT[fs]}.`, life: 3, max: 3 };
  flash = .5; shake = 12; F.tint = { col: '#ffffff', life: 1 }; sfx.adapt();
  burst(F.rival.x, F.rival.y, '#ffffff', 50, 380, 1, 4);
  F.bullets = [];
}

// ---------- the player's dash ----------
function tryDash() {
  if (F && F.banner) { if (F.banner.max - F.banner.life > .6) F.banner.life = Math.min(F.banner.life, .18); return; }   // tap skips the pause
  if (!F || F.dash || F.stun > 0 || F.charges < 1) { if (F && F.charges < 1 && !F.dash && F.t - (F.nagT || -9) > 1.5) { F.nagT = F.t; say('need 3 shards', P.x, P.y - 20, C.green, 12, .7); beep(140, .08, 'square', .02); } return; }
  const r = F.rival, a = Math.atan2(r.y - P.y, r.x - P.x), range = dist(P.x, P.y, r.x, r.y);
  F.charges -= 1;
  F.dash = { vx: Math.cos(a) * DASH_SPEED, vy: Math.sin(a) * DASH_SPEED, t: 0 };
  const sector = sectorOf(Math.atan2(P.y - r.y, P.x - r.x));
  const waited = r.vent > 0 || r.fakeVent > 0 || F.t - F.lastOpen < .8;
  F.dashes.push({ t: F.t, sector, range, waited });
  if (!F.final && F.dashes.length >= F.nextAdapt && F.t - F.lastAdapt > 7) { F.pendingAdapt = rnd(.5, 1.4); F.nextAdapt = F.dashes.length + 3 + Math.floor(rnd(0, 3)); }
  sfx.dash(); burst(P.x, P.y, save.trail, 8, 120, .3, 2);
  // counters that react to the dash itself
  if (r.fakeVent > 0) { r.fakeVent = 0; r.counterT = .3; sidestep(a, 95); bark(pick(['Gotcha.', 'Too eager.', 'Fooled you.']), true); }
  else if (F.arsenal.sidestep && range > (F.arsenal.sidestep > 1 ? 120 : 150) && r.sideCd <= 0 && r.vent <= 0 && !r.mirror?.dashing) {
    r.sideCd = F.arsenal.sidestep > 1 ? 1.4 : 2.4; sidestep(a, 90); if (Math.random() < .5) bark(pick(['Saw that coming.', 'Too slow.', 'From there? Really?']));
  }
}
function sidestep(a, d) {
  const r = F.rival, s = Math.random() < .5 ? 1 : -1, pa = a + s * Math.PI / 2;
  let tx = r.x + Math.cos(pa) * d, ty = r.y + Math.sin(pa) * d;
  if (tx < 30 || tx > W - 30 || ty < 30 || ty > H - 30) { tx = r.x - Math.cos(pa) * d; ty = r.y - Math.sin(pa) * d; }
  r.side = { x0: r.x, y0: r.y, x1: clamp(tx, 30, W - 30), y1: clamp(ty, 90, H - 30), t: 0, dur: .16 };
  for (let i = 0; i < 6; i++) parts.push({ x: r.x, y: r.y, vx: 0, vy: 0, life: .25 + i * .03, max: .4, color: CT.sidestep.col, size: 14 - i * 2 });
}
function hitRival() {
  const r = F.rival, d = F.dash, ang = Math.atan2(P.y - r.y, P.x - r.x);
  const back = () => { const l = Math.hypot(d.vx, d.vy) || 1; P.x -= d.vx / l * 26; P.y -= d.vy / l * 26; P.tx = P.x - d.vx / l * 70; P.ty = P.y - d.vy / l * 70; F.dash = null; F.inv = Math.max(F.inv, .25); };
  // shield: blocks dashes that come from the side it's guarding
  if (F.arsenal.shield && r.shieldAng != null && Math.abs(angDiff(ang, r.shieldAng)) < Math.PI / 3) {
    sfx.block(); shake = 6; hitstop = .06; F.stun = .55; back();
    burst(r.x + Math.cos(ang) * 34, r.y + Math.sin(ang) * 34, CT.shield.col, 18, 260, .4, 3);
    say('BLOCKED', P.x, P.y - 22, CT.shield.col, 16, .8); bark(pick([`From ${SECT[sectorOf(ang)]} again?`, 'Predictable.', 'Try another side.']));
    return;
  }
  if (r.armor > 0) {                                          // just got hit: armored while it recovers
    sfx.block(); shake = 3; back(); say('ARMOR', P.x, P.y - 22, C.dim, 13, .6); burst(r.x, r.y, '#ffffff', 8, 160, .3, 2); return;
  }
  const crit = r.vent > 0, dmg = crit ? 2 : 1, flank = !!F.arsenal.shield;
  F.hp -= dmg; F.hits.push({ sector: F.dashes[F.dashes.length - 1].sector, range: F.dashes[F.dashes.length - 1].range, crit });
  if (crit) F.crits++; if (flank) F.flanks++;
  r.flash = .15; r.pulse = 1.2; hitstop = crit ? .14 : .08; shake = crit ? 11 : 7; sfx.hit(crit);
  burst(r.x, r.y, crit ? C.vent : '#fff', crit ? 34 : 20, crit ? 340 : 240, .5, 3); burst(r.x, r.y, C.pink, 12, 200, .5, 3);
  say(crit ? 'CRIT −2' : '−1', r.x, r.y - 36, crit ? C.vent : C.ink, crit ? 22 : 16, .9);
  const l = Math.hypot(d.vx, d.vy) || 1;
  r.side = { x0: r.x, y0: r.y, x1: clamp(r.x + d.vx / l * 85, 34, W - 34), y1: clamp(r.y + d.vy / l * 85, 90, H - 34), t: 0, dur: .2 };
  r.armor = 1; back();
  if (Math.random() < .2 && !crit) bark(pick(['Lucky.', 'Hm.', 'Noted.', 'Interesting.']));
  if (crit) r.vent = Math.min(r.vent, .35);
  if (F.hp <= 0) return endFight(true);
  const frac = F.hp / F.maxHp;
  if (!F.final && frac <= .25) finalRead();
}
function hurt(src) {
  if (F.inv > 0 || F.dash) return;
  F.hearts--; F.hitsTaken++; F.killer = src; F.inv = 1.2;
  sfx.hurt(); shake = 13; flash = .35; hitstop = .14; timeScale = .3;
  burst(P.x, P.y, save.trail, 24, 260, .6, 3); burst(P.x, P.y, C.red, 12, 200, .5, 3);
  say('−1 ♥', P.x, P.y - 24, C.red, 16, .9);
  if (F.hearts <= 0) return endFight(false);
  if (Math.random() < .4) bark(pick(['Read you.', 'Called it.', 'Predictable.', 'Too easy.']));
}

function spawnShard() {
  const r = F.rival;
  for (let k = 0; k < 40; k++) {
    // a third of shards spawn near the rival: greed has a price
    const near = Math.random() < .33, a = rnd(0, 6.28);
    const x = near ? r.x + Math.cos(a) * rnd(70, 120) : rnd(30, W - 30), y = near ? r.y + Math.sin(a) * rnd(70, 120) : rnd(80, H - 50);
    if (x < 25 || x > W - 25 || y < 75 || y > H - 45) continue;
    if (dist(x, y, P.x, P.y) < 110 || dist(x, y, r.x, r.y) < 55) continue;
    if (touchUI && dist(x, y, JOY.x, JOY.y) < JOY.r + 30) continue;
    if (F.mines.some(m => dist(m.x, m.y, x, y) < 40) || F.shards.some(o => dist(o.x, o.y, x, y) < 90)) continue;
    F.shards.push({ x, y, a: 0, life: 0 }); return;
  }
}
// ---------- rival attacks ----------
function bullet(x, y, ang, speed, src, r = 6) { F.bullets.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r, src, minD: 1e9, passed: false, armed: 0 }); }
const shotSpeed = () => 190 + 8 * save.level + (F.final ? 20 : 0);
function lead(sec) { return [clamp(P.x + F.svx * sec, 20, W - 20), clamp(P.y + F.svy * sec, 20, H - 20)]; }
function throwBomb(lvl) {
  const r = F.rival, [lx, ly] = lead(.95), targets = [[lx, ly]];
  if (lvl >= 2) targets.push([P.x, P.y]);
  for (const [tx, ty] of targets) F.bombs.push({ sx: r.x, sy: r.y, tx, ty, t: 0, dur: .95, r: 48 });
  beep(300, .2, 'triangle', .03, 300);
}
function dropMine(lvl) {
  if (F.mines.length >= 12) F.mines.shift();
  const sp = Math.hypot(F.svx, F.svy), a = sp > 40 ? Math.atan2(F.svy, F.svx) + rnd(-.5, .5) : rnd(0, 6.28), d = rnd(75, 125);
  const x = clamp(P.x + Math.cos(a) * d, 20, W - 20), y = clamp(P.y + Math.sin(a) * d, 20, H - 20);
  if (dist(x, y, P.x, P.y) < 55 || dist(x, y, F.rival.x, F.rival.y) < 50) return;
  F.mines.push({ x, y, t: 0, arm: .75, life: 10 - lvl * 2 }); beep(500, .06, 'square', .02, -200);
}
function fireLaser(lvl) {
  const e = argmax(F.win.edges.map((v, i) => v + rnd(0, .01) + (i === argmax(F.win.edges) ? 0 : 0))), band = 60 + 36 * (lvl - 1);
  const L = [{ x: 0, y: 0, w: band, h: H }, { x: W - band, y: 0, w: band, h: H }, { x: 0, y: 0, w: W, h: band }, { x: 0, y: H - band, w: W, h: band }][e];
  F.lasers.push(Object.assign({ t: 0, warn: .95, on: .38 }, L)); sfx.warn();
}
function seeker(lvl) { const r = F.rival; F.missiles.push({ x: r.x, y: r.y, ang: r.ang, sp: 140 + 25 * lvl, turn: 2.1 + .4 * lvl, life: 5.5 }); beep(900, .15, 'square', .02, 500); }
function thorns(lvl) { F.rival.thorns = .55; F.rival.thornsN = 12 + 4 * lvl; sfx.warn(); }
const FIRE = { bombs: throwBomb, mines: dropMine, lasers: fireLaser, seekers: seeker, thorns };

// ---------- feedback ----------
function say(text, x, y, color, size = 16, life = 1) { texts.push({ text, x, y, color, size, life, max: life }); }
function bark(text, force) { if (!F || (!force && F.t - (F.barkAt ?? -99) < 6)) return; F.barkAt = F.t; F.bark = { text, life: 2.2 }; }
function burst(x, y, color, n = 12, sp = 160, life = .5, size = 3) {
  for (let i = 0; i < n; i++) { const a = rnd(0, Math.PI * 2), s = rnd(sp * .3, sp);
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(life * .5, life), max: life, color, size }); }
}
function blast(x, y, r, col) { F.blasts.push({ x, y, r, col, life: .32 }); burst(x, y, col, 24, 280, .55, 4); shake = Math.max(shake, 6); sfx.boom(); }

// ---------- update ----------
function update(dt) {
  for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .92; p.vy *= .92; p.life -= dt; }
  parts = parts.filter(p => p.life > 0);
  for (const t of texts) { t.y -= 22 * dt; t.life -= dt; }
  texts = texts.filter(t => t.life > 0);
  shake = Math.max(0, shake - dt * 30); flash = Math.max(0, flash - dt); 
  if (state !== 'play') { if (state === 'ending') { timeScale += (1 - timeScale) * dt; } return; }
  if (hitstop > 0) { hitstop -= dt; return; }
  const r = F.rival;
  if (F.banner) { F.banner.life -= dt; if (F.banner.life <= 0) { F.banner = null; if (F.banner2) { F.banner = F.banner2; F.banner2 = null; } } return; }   // paused while the rival explains itself
  for (const k of ['bark', 'tint']) if (F[k]) { F[k].life -= dt; if (F[k].life <= 0) F[k] = null; }
  timeScale += (1 - timeScale) * Math.min(1, dt * 2.4);
  const g = dt * timeScale; F.t += g;
  F.inv = Math.max(0, F.inv - g); F.stun = Math.max(0, F.stun - g);
  // shards: the only way to charge your dash
  if (F.shards.length < SHARDS_ON_FIELD) { F.shardT -= g; if (F.shardT <= 0) { spawnShard(); F.shardT = .45; } }

  // --- player ---
  const x0 = P.x, y0 = P.y;
  if (F.dash) {
    const d = F.dash; d.t += g; P.x += d.vx * g; P.y += d.vy * g;
    if (dist(P.x, P.y, r.x, r.y) < RR + PR) hitRival();
    if (state !== 'play') return;
    if (F.dash && (d.t >= DASH_DUR || P.x < PR || P.x > W - PR || P.y < PR || P.y > H - PR)) { F.dash = null; F.inv = Math.max(F.inv, .1); }
    P.tx = P.x; P.ty = P.y;
  } else if (F.stun <= 0) {
    const kx = (keys['arrowright'] || keys['d'] ? 1 : 0) - (keys['arrowleft'] || keys['a'] ? 1 : 0);
    const ky = (keys['arrowdown'] || keys['s'] ? 1 : 0) - (keys['arrowup'] || keys['w'] ? 1 : 0);
    if (kx || ky) { const l = Math.hypot(kx, ky); P.x += kx / l * 330 * g; P.y += ky / l * 330 * g; P.tx = P.x; P.ty = P.y; }
    else if (joy) {
      const dx = joy.kx - JOY.x, dy = joy.ky - JOY.y, d = Math.hypot(dx, dy), m = clamp((d / JOY.r - .12) / .88, 0, 1);
      if (m > 0) { P.x += dx / d * m * JOY.speed * g; P.y += dy / d * m * JOY.speed * g; }
      P.tx = P.x; P.ty = P.y;
    } else if (touchUI) { P.tx = P.x; P.ty = P.y; }
    else {
      P.tx = clamp(P.tx, PR, W - PR); P.ty = clamp(P.ty, PR, H - PR);
      const dx = P.tx - P.x, dy = P.ty - P.y, d = Math.hypot(dx, dy), step = 560 * g;
      if (d <= step) { P.x = P.tx; P.y = P.ty; } else { P.x += dx / d * step; P.y += dy / d * step; }
    }
  }
  P.x = clamp(P.x, PR, W - PR); P.y = clamp(P.y, PR, H - PR);
  P.vx = (P.x - x0) / Math.max(g, 1e-4); P.vy = (P.y - y0) / Math.max(g, 1e-4);
  if (!F.dash) { const k = Math.min(1, g * 7); F.svx += (P.vx - F.svx) * k; F.svy += (P.vy - F.svy) * k; }
  P.trail.push({ x: P.x, y: P.y, d: !!F.dash }); if (P.trail.length > 16) P.trail.shift();
  for (const sh of F.shards) { sh.a += g * 3; sh.life += g;
    if (dist(sh.x, sh.y, P.x, P.y) < PR + 13) { sh.got = true; F.shardsTaken++;
      const before = Math.floor(F.charges + 1e-6); F.charges = Math.min(MAX_CHARGES, F.charges + 1 / SHARDS_PER_DASH);
      burst(sh.x, sh.y, C.green, 12, 180, .4);
      if (Math.floor(F.charges + 1e-6) > before) { say('DASH READY', P.x, P.y - 22, C.green, 14, .8); beep(880, .14, 'triangle', .045, 400); shake = Math.max(shake, 3); }
      else beep(520 + 160 * ((F.charges * SHARDS_PER_DASH) % SHARDS_PER_DASH), .07, 'square', .03, 150); } }
  F.shards = F.shards.filter(sh => !sh.got);

  // --- what it observes ---
  const w = F.win; w.t += g;
  const zi = zoneOf(P.x, P.y); w.zones[zi] += g; F.zonesFight[zi] += g;
  const m = 55, ed = [P.x < m, P.x > W - m, P.y < m, P.y > H - m];
  if (ed.some(Boolean)) { w.edgeT += g; F.edgeFight += g; ed.forEach((v, i) => v && (w.edges[i] += g)); }
  const sp = Math.hypot(F.svx, F.svy); if (sp < 35) w.stillT += g; else w.moveT += g;
  F.headT += g;
  if (F.headT >= .2) { F.headT = 0;
    if (sp > 80) { const hx = F.svx / sp, hy = F.svy / sp; if (F.lastHead) { w.straightSum += hx * F.lastHead[0] + hy * F.lastHead[1]; w.straightN++; } F.lastHead = [hx, hy]; } else F.lastHead = null; }
  const dR = dist(P.x, P.y, r.x, r.y); w.distSum += dR * g; if (dR < 130) w.closeT += g;
  // a read also happens on a timer, so playing passively doesn't freeze it
  if (F.pendingAdapt > 0 && !F.dash) { F.pendingAdapt -= g; if (F.pendingAdapt <= 0) adapt('dash'); }
  F.readT += g; if (F.readT >= 29 && !F.final) adapt('time');

  // --- rival movement ---
  r.sideCd -= g; r.flash = Math.max(0, r.flash - g); r.armor = Math.max(0, (r.armor || 0) - g); r.pulse = Math.max(0, r.pulse - g * 3);
  if (r.side) { const s = r.side; s.t += g; const k = Math.min(1, s.t / s.dur); r.x = s.x0 + (s.x1 - s.x0) * k; r.y = s.y0 + (s.y1 - s.y0) * k; if (k >= 1) r.side = null; }
  else if (r.mirror && r.mirror.st !== 'cool') mirrorStep(g);
  else if (r.vent <= 0 && r.fakeVent <= 0) {
    r.a += g * .5; const want = 205;
    const tx = clamp(P.x + Math.cos(r.a) * want, 34, W - 34), ty = clamp(P.y + Math.sin(r.a) * want * .85 - 40, 90, H - 34);
    r.x += (tx - r.x) * Math.min(1, g * 1.1); r.y += (ty - r.y) * Math.min(1, g * 1.1);
  }
  if (!r.mirror?.dashing) r.ang = Math.atan2(P.y - r.y, P.x - r.x);
  if (F.arsenal.shield && r.shieldAng != null && F.arsenal.shield > 1) {        // level II shield tracks you slowly
    const to = Math.atan2(P.y - r.y, P.x - r.x); r.shieldAng += clamp(angDiff(to, r.shieldAng), -.9 * g, .9 * g);
  }
  if (r.mirror && r.mirror.st === 'cool') { r.mirror.t += g; if (r.mirror.t >= r.mirror.rhythm) { r.mirror.st = 'move'; r.mirror.t = 0; } }

  // --- base attack pattern: aimed shots, then a barrage, then it vents (open for crits) ---
  if (r.vent > 0) { r.vent -= g; if (r.vent <= 0) F.lastOpen = F.t; }
  else if (r.fakeVent > 0) { r.fakeVent -= g; }
  else if (F.barrage) {
    F.barrage.t -= g;
    if (F.barrage.t <= 0) { F.barrage.n--; F.barrage.t = .28; const a = Math.atan2(P.y - r.y, P.x - r.x);
      for (let i = -2; i <= 2; i++) bullet(r.x, r.y, a + i * .2, shotSpeed() * .9, 'barrage'); r.pulse = 1; sfx.fire();
      if (F.barrage.n <= 0) { F.barrage = null; F.lastOpen = F.t;
        const fk = F.arsenal.feint ? (F.arsenal.feint > 1 ? .8 : .55) : 0;
        if (Math.random() < fk) r.fakeVent = 1.1; else { r.vent = 1.35; sfx.vent(); } } }
  } else if (!r.mirror || r.mirror.st === 'cool') {
    F.barrageT -= g; F.fireT -= g;
    if (F.barrageT <= 0) { F.barrageT = Math.max(4.2, 6 - .3 * F.reads.length); F.barrage = { n: 3, t: .5 }; r.windup = .5; }
    else if (F.fireT <= 0) {
      if (r.windup <= 0) r.windup = .22;
      r.windup -= g;
      if (r.windup <= 0) { F.fireT = Math.max(.55, 1.15 - .05 * save.level - .07 * F.reads.length); r.windup = 0;
        bullet(r.x, r.y, Math.atan2(P.y - r.y, P.x - r.x), shotSpeed(), 'shots'); r.pulse = .7; sfx.fire(); }
    }
  }
  if (F.barrage && r.windup > 0) r.windup -= g;
  // feint punish
  if (r.counterT > 0) { r.counterT -= g; if (r.counterT <= 0) { const [lx, ly] = [P.x, P.y], a = Math.atan2(ly - r.y, lx - r.x);
    for (let i = -3; i <= 3; i++) bullet(r.x, r.y, a + i * .16, shotSpeed() * 1.15, 'feint', 6); r.pulse = 1.4; shake = Math.max(shake, 4); beep(150, .12, 'sawtooth', .05, -60); } }
  // thorns nova
  if (r.thorns > 0) { r.thorns -= g; if (r.thorns <= 0) { const n = r.thornsN, o = rnd(0, 1);
    for (let i = 0; i < n; i++) bullet(r.x, r.y, (i + o) / n * Math.PI * 2, 175, 'thorns', 5); shake = Math.max(shake, 4); beep(200, .15, 'square', .04, -100); } }
  // learned weapons on their own clocks
  for (const id in F.arsenal) { if (!FIRE[id]) continue; F.wt[id] -= g; if (F.wt[id] <= 0) { F.wt[id] = CAD[id][F.arsenal[id]]; FIRE[id](F.arsenal[id]); } }

  // --- hazards ---
  for (const b of F.bullets) {
    if (b.armed > 0) { b.armed -= g; continue; }
    b.x += b.vx * g; b.y += b.vy * g;
    const d = dist(b.x, b.y, P.x, P.y);
    if (d < PHIT + b.r && !F.dash && F.inv <= 0) { b.dead = true; hurt(b.src); if (state !== 'play') return; continue; }
    if (d < b.minD) b.minD = d;
    else if (!b.passed && d > b.minD + 3) { b.passed = true;
      if (b.minD < PHIT + b.r + 15 && !F.dash) { F.charges = Math.min(MAX_CHARGES, F.charges + 1 / (SHARDS_PER_DASH * 2)); sfx.graze(); burst(b.x, b.y, C.cyan, 6, 90, .25, 2); }
    }
    if (b.x < -40 || b.x > W + 40 || b.y < -40 || b.y > H + 40) b.dead = true;
  }
  F.bullets = F.bullets.filter(b => !b.dead);
  for (const b of F.bombs) { b.t += g;
    if (b.t >= b.dur && !b.done) { b.done = true; blast(b.tx, b.ty, b.r, CT.bombs.col); if (dist(b.tx, b.ty, P.x, P.y) < b.r + PHIT) { hurt('bombs'); if (state !== 'play') return; } } }
  F.bombs = F.bombs.filter(b => !b.done);
  for (const bl of F.blasts) bl.life -= g; F.blasts = F.blasts.filter(bl => bl.life > 0);
  for (const mn of F.mines) { mn.t += g;
    if (mn.t > mn.arm && mn.t < mn.life && !mn.gone && dist(mn.x, mn.y, P.x, P.y) < 9 + PHIT + 2 && !F.dash) { mn.gone = true; blast(mn.x, mn.y, 30, CT.mines.col); hurt('mines'); if (state !== 'play') return; } }
  F.mines = F.mines.filter(mn => !mn.gone && mn.t < mn.life);
  for (const L of F.lasers) { L.t += g;
    if (L.t >= L.warn && L.t < L.warn + L.on && P.x > L.x - PHIT && P.x < L.x + L.w + PHIT && P.y > L.y - PHIT && P.y < L.y + L.h + PHIT) { hurt('lasers'); if (state !== 'play') return; }
    if (L.t >= L.warn && !L.fx) { L.fx = true; shake = Math.max(shake, 5); beep(70, .3, 'sawtooth', .06, 60); } }
  F.lasers = F.lasers.filter(L => L.t < L.warn + L.on);
  for (const s of F.missiles) { s.life -= g;
    const want = Math.atan2(P.y - s.y, P.x - s.x); s.ang += clamp(angDiff(want, s.ang), -s.turn * g, s.turn * g);
    s.x += Math.cos(s.ang) * s.sp * g; s.y += Math.sin(s.ang) * s.sp * g;
    if (Math.random() < .5) parts.push({ x: s.x, y: s.y, vx: rnd(-20, 20), vy: rnd(-20, 20), life: .3, max: .3, color: CT.seekers.col, size: 2 });
    if (dist(s.x, s.y, P.x, P.y) < PHIT + 6 && !F.dash) { s.life = 0; burst(s.x, s.y, CT.seekers.col, 14, 160, .35); hurt('seekers'); if (state !== 'play') return; }
    if (s.life <= 0) burst(s.x, s.y, CT.seekers.col, 10, 120, .3); }
  F.missiles = F.missiles.filter(s => s.life > 0);
}
// MIRROR (last stand): it uses your own dash against you — your rhythm, your favourite angle.
function mirrorStep(g) {
  const r = F.rival, m = r.mirror; m.t += g;
  const a = m.sector * Math.PI / 4;                       // you attacked from this side of it → it attacks from this side of you
  if (m.st === 'move') {
    const tx = clamp(P.x + Math.cos(a) * 190, 34, W - 34), ty = clamp(P.y + Math.sin(a) * 190, 34, H - 34);
    r.x += (tx - r.x) * Math.min(1, g * 6); r.y += (ty - r.y) * Math.min(1, g * 6);
    if (m.t > .45) { m.st = 'tele'; m.t = 0; m.ax = P.x; m.ay = P.y; sfx.warn(); }
  } else if (m.st === 'tele') {
    m.ax += (P.x - m.ax) * Math.min(1, g * 3); m.ay += (P.y - m.ay) * Math.min(1, g * 3);
    r.ang = Math.atan2(m.ay - r.y, m.ax - r.x);
    if (m.t > .5) { m.st = 'dash'; m.t = 0; m.dashing = true; m.vx = Math.cos(r.ang) * 1050; m.vy = Math.sin(r.ang) * 1050; beep(400, .15, 'sawtooth', .05, 600); }
  } else if (m.st === 'dash') {
    r.x += m.vx * g; r.y += m.vy * g;
    parts.push({ x: r.x, y: r.y, vx: 0, vy: 0, life: .3, max: .3, color: '#ffffff', size: 10 });
    if (dist(r.x, r.y, P.x, P.y) < RR + PHIT && !F.dash && F.inv <= 0) hurt('mirror');
    if (m.t > .3 || r.x < 24 || r.x > W - 24 || r.y < 24 || r.y > H - 24) { r.x = clamp(r.x, 30, W - 30); r.y = clamp(r.y, 30, H - 30);
      m.st = 'cool'; m.t = 0; m.dashing = false; r.vent = .9; sfx.vent(); }       // it also leaves itself open, just like you
  }
}

// ---------- end of fight: it studies the result ----------
function endFight(won) {
  state = 'ending'; overAt = performance.now() + 900; timeScale = .15;
  const r = F.rival;
  if (won) { sfx.win(); shake = 18; flash = .7; burst(r.x, r.y, C.pink, 70, 420, 1.2, 4); burst(r.x, r.y, '#fff', 30, 300, .9, 3); }
  else { sfx.lose(); shake = 16; flash = .5; burst(P.x, P.y, save.trail, 40, 320, .9, 4); }
  // long-term profile of how you fight
  const p = save.prof, wgt = clamp(F.t / 60, .25, .6);
  if (F.dashes.length) { const c = Array(8).fill(0); F.dashes.forEach(d => c[d.sector]++); const n = norm(c); p.sectors = norm(p.sectors.map((v, i) => v * (1 - wgt) + n[i] * wgt));
    p.range = p.range * (1 - wgt) + sum(F.dashes.map(d => d.range)) / F.dashes.length * wgt;
    p.waitRatio = p.waitRatio * (1 - wgt) + F.dashes.filter(d => d.waited).length / F.dashes.length * wgt; }
  if (sum(F.zonesFight) > .5) { const n = norm(F.zonesFight); p.zones = norm(p.zones.map((v, i) => v * (1 - wgt) + n[i] * wgt)); }
  p.edge = p.edge * (1 - wgt) + F.edgeFight / Math.max(F.t, 1) * wgt;
  save.duelsToday++;
  const lvlFought = save.level, dmg = F.maxHp - Math.max(0, F.hp);
  const sc = { damage: dmg * 100, crits: F.crits * 50, win: won ? 1000 * lvlFought : 0, hearts: won ? F.hearts * 300 : 0, speed: won ? Math.max(0, Math.round((90 - F.t) * 10)) : 0 };
  const score = sum(Object.values(sc));
  save.bestScore = Math.max(save.bestScore || 0, score);
  let lesson = null;
  if (won) {
    save.wins++; save.bestWin = save.bestWin == null ? F.t : Math.min(save.bestWin, F.t);
    lesson = studyDefeat(); save.playbook[lesson.id] = Math.min(2, (save.playbook[lesson.id] || 0) + 1);
    save.level++; save.memory = null;
  } else { save.losses++; save.memory = CT[F.killer] ? F.killer : null; }
  const c = save.chal; let chalDone = false;
  if (c && !c.done) {
    const v = { win: won ? 1 : 0, crits: F.crits, flank: F.flanks, clean: won && F.hitsTaken <= 1 ? 1 : 0 }[c.id];
    c.progress = Math.min(chalDef().goal, c.progress + v);
    if (c.progress >= chalDef().goal) { c.done = true; chalDone = true; const next = TRAILS.find(t => !save.trails.includes(t.c)); if (next) { save.trails.push(next.c); save.trail = next.c; } }
  }
  persist();
  result = { won, t: F.t, hpLeft: F.hp / F.maxHp, hitsTaken: F.hitsTaken, crits: F.crits, killer: F.killer, reads: F.reads.slice(), lesson, chalDone, dashes: F.dashes.length, hits: F.hits.length, score, sc, lvlFought, ts: Date.now() + Math.random() };
  setTimeout(() => { state = 'over'; showResult(); }, 1100);
}
// After losing, it works out which counter would have stopped the hits that beat it.
function studyDefeat() {
  const hits = F.hits, n = Math.max(1, hits.length);
  const c = Array(8).fill(0); hits.forEach(h => c[h.sector]++);
  const s3 = share3(norm(c)), fs = argmax(s3), side = s3[fs];
  const critShare = hits.filter(h => h.crit).length / n, range = sum(hits.map(h => h.range)) / n;
  const opts = [
    { id: 'shield', s: (side - .45) * 2.6, why: `${pct(side)} of your winning hits came from ${SECT[fs]}.` },
    { id: 'feint', s: (critShare - .25) * 2, why: `${pct(critShare)} of your hits landed while it was recovering.` },
    { id: 'sidestep', s: (range - 165) / 35, why: `Your hits came from ${Math.round(range)}px away. It’ll watch for long dashes.` },
    { id: 'thorns', s: (150 - range) / 40, why: `You beat it up close (${Math.round(range)}px dashes).` },
  ].filter(o => (save.playbook[o.id] || 0) < 2).sort((a, b) => b.s - a.s);
  return opts[0] || { id: 'shield', why: 'It studied every hit you landed.' };
}

// ---------- leaderboard ----------
// Stored on this device by default. To make it global: create a Supabase table `scores`
// (name text, score int4, level int4, won bool, created_at timestamptz default now()) with RLS policies
// allowing anon INSERT and SELECT, then paste the project URL and public anon key below.
const BOARD_URL = '', BOARD_KEY = '';
const BOARD_LOCAL = 'rival_board_v1';
const fmt = n => Math.round(n).toLocaleString('en-US');
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cleanName = n => String(n || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
const Board = {
  online: !!(BOARD_URL && BOARD_KEY),
  local() { try { return JSON.parse(localStorage.getItem(BOARD_LOCAL)) || []; } catch (e) { return []; } },
  async top(n = 10) {
    if (this.online) { try {
      const r = await fetch(`${BOARD_URL}/rest/v1/scores?select=name,score,level,won&order=score.desc&limit=${n}`, { headers: { apikey: BOARD_KEY, Authorization: 'Bearer ' + BOARD_KEY } });
      if (r.ok) return await r.json(); } catch (e) {} }
    return this.local().slice(0, n);
  },
  async submit(entry) {
    const list = this.local(); list.push(entry); list.sort((a, b) => b.score - a.score);
    try { localStorage.setItem(BOARD_LOCAL, JSON.stringify(list.slice(0, 50))); } catch (e) {}
    if (this.online) { try {
      await fetch(`${BOARD_URL}/rest/v1/scores`, { method: 'POST', headers: { apikey: BOARD_KEY, Authorization: 'Bearer ' + BOARD_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ name: entry.name, score: entry.score, level: entry.level, won: entry.won }) }); } catch (e) {} }
  },
};
const ORD = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH', '7TH', '8TH', '9TH', '10TH'];
const ROWCOL = ['#ffd23d', '#ff9a3d', '#ff3d81', '#b98cff', '#3df2ff', '#5dff9b', '#ffd23d', '#ff9a3d', '#ff3d81', '#b98cff'];
function boardRows(list, mine) {
  const rows = list.map((e, i) => `<div class="arow${i === mine ? ' me' : ''}" style="color:${ROWCOL[i]}">
      <span>${ORD[i]}</span><span>${String(Math.max(0, Math.round(e.score))).padStart(7, '0')}</span><span>${esc(String(e.name).slice(0, 3))}</span></div>`).join('');
  return `<div class="arcade"><div class="arow head"><span>RANK</span><span>SCORE</span><span>NAME</span></div>${rows || '<p class="dim" style="text-align:center;margin:.6em 0">NO SCORES YET</p>'}</div>`;
}
async function fillBoardSlot() {
  const slot = document.getElementById('boardSlot'), R = result; if (!slot || !R) return;
  if (!save.name) {
    const top = await Board.top(10), makes = top.length < 10 || R.score > top[top.length - 1].score;
    if (!document.getElementById('boardSlot')) return;
    slot.innerHTML = `<p class="blink gold" style="margin-top:.6em;letter-spacing:.15em">${makes ? 'NEW HIGH SCORE!' : 'GAME OVER'}</p>
      <p class="dim" style="letter-spacing:.1em">ENTER YOUR INITIALS</p>
      <div class="row" style="margin-top:.35em"><input id="nm" class="initials" maxlength="3" placeholder="AAA" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="ghost" id="nmok">OK</button></div>`;
    const nm = document.getElementById('nm'); nm.oninput = () => { nm.value = cleanName(nm.value); };
    const go = () => { const n = cleanName(document.getElementById('nm').value); if (!n) return; save.name = n; persist(); fillBoardSlot(); };
    document.getElementById('nmok').onclick = e => { e.stopPropagation(); go(); };
    nm.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
    return;
  }
  if (!R.submitted) { R.submitted = true; await Board.submit({ name: save.name, score: R.score, level: R.lvlFought, won: R.won, ts: R.ts }); }
  const top = await Board.top(10);
  const mine = top.findIndex(e => e.ts === R.ts || (e.name === save.name && e.score === R.score));
  if (!document.getElementById('boardSlot')) return;
  slot.innerHTML = `<p class="${mine >= 0 ? 'blink gold' : 'dim'}" style="margin:.6em 0 .3em;letter-spacing:.12em">${mine >= 0 ? `YOU RANK ${ORD[mine]}` : 'NOT IN THE TOP 10 — YET'}</p>${boardRows(top.slice(0, 5), mine)}`;
}
async function showBoard() {
  ov.classList.remove('hide');
  ov.innerHTML = `<h1 class="pop" style="font-size:2.4em;color:var(--gold);text-shadow:0 0 .4em rgba(255,210,61,.5)">HIGH SCORES</h1>
    <div class="card" id="boardList" style="background:#05060c"><p class="dim" style="text-align:center">LOADING…</p></div>
    <button id="back">BACK</button>`;
  bind();
  const top = await Board.top(10), el = document.getElementById('boardList');
  if (el) el.innerHTML = boardRows(top, top.findIndex(e => e.name === save.name && e.score === save.bestScore));
}

// ---------- screens ----------
const chip = id => `<span class="tag" style="color:${colOf(id)};border-color:${colOf(id)}55;background:${colOf(id)}18">${nameOf(id)}</span>`;
function chalHTML() {
  const c = save.chal, def = chalDef(), done = c.done;
  return `<div style="width:100%;text-align:left">
    <p class="dim" style="font-size:.7em;letter-spacing:.14em;margin:0 0 .25em .2em">DAILY CHALLENGE</p>
    <div class="card" style="padding:.4em .7em;font-size:.82em"><div class="flex" style="justify-content:space-between;gap:.5em"><span>🎁 ${def.text}</span><span class="${done ? 'win' : 'gold'}">${done ? '✓' : c.progress + '/' + def.goal}</span></div>
    <div class="bar" style="height:.3em;margin-top:.25em"><i style="width:${c.progress / def.goal * 100}%"></i></div></div></div>`;
}
function rivalCard() {
  const moves = [...new Set([...Object.keys(save.playbook), ...(save.memory ? [save.memory] : [])])];
  return `<div class="card"><div class="flex" style="justify-content:space-between"><h2 class="lose">RIVAL · LV ${save.level}${rivalTitle() ? ' · ' + rivalTitle() : ''}</h2>
    <span title="Day streak">🔥 ${save.streak}</span></div>
    ${moves.length ? `<div style="margin-top:.35em">${moves.map(id => chip(id)).join('')}</div>` : ''}</div>`;
}
// ---------- tutorial (shown once ever; replayable from the menu) ----------
const SV = (body) => `<svg viewBox="0 0 160 84" width="100%" style="max-width:15em;display:block;margin:.2em auto .5em">${body}</svg>`;
const orb = (x, y) => `<circle cx="${x}" cy="${y}" r="13" fill="${C.cyan}" opacity=".22"/><circle cx="${x}" cy="${y}" r="8" fill="${C.cyan}"/><circle cx="${x}" cy="${y}" r="3.5" fill="#fff"/>`;
const foe = (x, y, rot = 180, extra = '') => `<g transform="translate(${x} ${y}) rotate(${rot})">${extra}<circle r="18" fill="${C.pink}" opacity=".2"/><path d="M15 0 L-10 -11 L-4 0 L-10 11 Z" fill="${C.pink}"/><circle cx="4" r="2.6" fill="#fff"/></g>`;
const gem = (x, y, c = C.green) => `<g transform="translate(${x} ${y}) rotate(45)"><rect x="-5" y="-5" width="10" height="10" fill="${c}"/></g>`;
function tutSteps() {
  return [
    { t: 'MOVE', img: SV(`${orb(80, 44)}
        <g stroke="${C.dim}" stroke-width="2" fill="none" stroke-linecap="round"><path d="M80 18v-8M80 70v8M54 44h-8M106 44h8"/></g>
        <g fill="${C.dim}"><path d="M80 6l-4 6h8zM80 82l-4-6h8zM42 44l6-4v8zM118 44l-6-4v8z"/></g>`),
      d: touchUI ? 'Use the <b class="cy">joystick</b> at the bottom of the screen to move.' : 'Move with your <b class="cy">mouse</b>. Your orb follows the cursor.' },
    { t: 'COLLECT SHARDS', img: SV(`${gem(28, 42)}${gem(52, 42)}${gem(76, 42)}
        <path d="M92 42h16" stroke="${C.dim}" stroke-width="2"/><path d="M112 42l-6-4v8z" fill="${C.dim}"/>
        <circle cx="134" cy="42" r="14" fill="none" stroke="${C.cyan}" stroke-width="2.5"/><circle cx="134" cy="42" r="10" fill="${C.cyan}"/>
        <text x="134" y="74" fill="${C.dim}" font-size="10" text-anchor="middle" font-family="monospace">1 DASH</text>`),
      d: 'Grab <b class="win">3 green shards</b> to charge <b>1 dash</b>. You can only hold 2 dash charges.' },
    { t: 'DASH INTO IT', img: SV(`<g opacity=".5">${[0, 1, 2, 3].map(i => `<circle cx="${22 + i * 13}" cy="${58 - i * 5}" r="${4 + i}" fill="#fff" opacity="${.15 + i * .15}"/>`).join('')}</g>
        ${orb(78, 40)}${foe(128, 26, 200)}<path d="M92 36l18-6" stroke="#fff" stroke-width="2" stroke-dasharray="3 3"/>`),
      d: `${touchUI ? '<b class="cy">Tap</b>' : '<b class="cy">Click</b>'} to dash at the rival. Ram it to deal damage. You can’t be hit mid-dash.` },
    { t: 'HIT IT WHEN IT’S OPEN', img: SV(`${foe(80, 42, 180, `<circle r="30" fill="${C.vent}" opacity=".22"/><circle r="30" fill="none" stroke="${C.vent}" stroke-width="2"/>`)}
        <text x="80" y="10" fill="${C.vent}" font-size="11" font-weight="bold" text-anchor="middle" font-family="monospace">OPEN</text>
        <text x="132" y="48" fill="${C.vent}" font-size="13" font-weight="bold" text-anchor="middle" font-family="monospace">CRIT</text>`),
      d: `After it attacks, it glows <b style="color:${C.vent}">OPEN</b>. Hit it then for <b style="color:${C.vent}">double damage</b>.` },
    { t: 'IT LEARNS YOU', img: SV(`${foe(80, 50, 180, `<path d="M0 -36 A36 36 0 0 1 31 18" fill="none" stroke="${CT.shield.col}" stroke-width="5" opacity=".9"/>`)}
        <rect x="2" y="2" width="156" height="20" rx="6" fill="#eef1ff"/>
        <text x="80" y="15.5" fill="#14081a" font-size="8.6" font-weight="bold" text-anchor="middle" font-family="monospace" textLength="146" lengthAdjust="spacingAndGlyphs">You always come from below.</text>`),
      d: 'Your rival <b class="lose">reads your moves and adapts</b>. Keep changing how you fight.' },
  ];
}
function showTutorial(fromMenu, i = 0) {
  state = 'menu'; ov.classList.remove('hide');
  const steps = tutSteps(), st = steps[i], last = i === steps.length - 1;
  ov.innerHTML = `
    <p class="dim" style="letter-spacing:.18em;font-size:.8em">HOW TO PLAY</p>
    <div class="card pop" style="text-align:center;padding:1em .9em">
      ${st.img}
      <h2 style="font-size:1.25em;margin-bottom:.35em">${st.t}</h2>
      <p>${st.d}</p>
    </div>
    <div class="row" style="gap:.45em">${steps.map((_, k) => `<span style="width:.55em;height:.55em;border-radius:50%;background:${k === i ? C.cyan : '#2a2f55'}"></span>`).join('')}</div>
    <button id="tnext" class="${last ? 'pulse' : ''}">${last ? (fromMenu ? 'GOT IT' : 'FIGHT') : 'NEXT'}</button>
    <div class="row">${i > 0 ? '<button class="ghost" id="tprev">Back</button>' : ''}${!last ? '<button class="ghost" id="tskip">Skip</button>' : ''}</div>`;
  const on = (id, f) => { const el = document.getElementById(id); if (el) el.onclick = e => { e.stopPropagation(); audio(); f(); }; };
  const done = () => { save.tutorialSeen = true; persist(); if (fromMenu) showMenu(); else startFight(); };
  on('tnext', () => last ? done() : showTutorial(fromMenu, i + 1));
  on('tprev', () => showTutorial(fromMenu, i - 1));
  on('tskip', done);
}
function showMenu() {
  state = 'menu'; ov.classList.remove('hide');
  const first = save.wins + save.losses === 0;
  ov.innerHTML = `
    <h1 class="pop">RIVAL</h1>
    <p class="dim">An AI duelist that learns how you fight.</p>
    ${rivalCard()}${chalHTML()}
    <button id="play" class="pulse">${first ? 'FIGHT' : save.memory ? 'REMATCH' : 'FIGHT LV ' + save.level}</button>
    <div class="row"><button class="ghost" id="howto">How to Play?</button><button class="ghost" id="board">High scores</button>${first ? '' : '<button class="ghost" id="dossier">Stats</button>'}<button class="ghost" id="mute">${save.muted ? 'Sound: off' : 'Sound: on'}</button></div>
    ${save.bestScore ? `<p class="dim">Best ${fmt(save.bestScore)}</p>` : ''}`;
  bind();
}
function readsHTML(reads) {
  return reads.length ? reads.map(e => `<p style="margin:.25em 0"><span class="dim">${mmss(e.t)}</span> ${chip(e.id)} <span class="dim">${e.why}</span></p>`).join('')
    : `<p class="dim">It didn’t need to adapt.</p>`;
}
function showResult() {
  ov.classList.remove('hide'); const R = result;
  const head = R.won
    ? `<p class="dim">${mmss(R.t)} · ${R.hits} hits landed · ${R.crits} crits · ${R.hitsTaken} hit${R.hitsTaken === 1 ? '' : 's'} taken</p>
       <h1 class="pop" style="color:${C.green};font-size:2.6em">RIVAL DOWN</h1>
       <div class="card pop" style="border-color:${CT[R.lesson.id].col}88"><p class="dim">IT STUDIED ITS DEFEAT</p><p>${R.lesson.why}</p>
       <p style="margin-top:.4em">It keeps ${chip(R.lesson.id)} <span class="dim">— ${CT[R.lesson.id].desc}</span></p>
       <p style="margin-top:.4em" class="lose"><b style="color:inherit">LV ${save.level} · ${rivalHP()} HP</b> <span class="dim">is waiting.</span></p></div>`
    : `<p class="dim">${mmss(R.t)} · it had ${pct(R.hpLeft)} HP left</p>
       <h1 class="pop" style="font-size:2.6em">IT BEAT YOU</h1>
       <p class="dim">Finished by ${chip(R.killer)}</p>
       ${save.memory ? `<div class="card pop" style="border-color:${colOf(save.memory)}66"><p>It remembers. Next fight it starts with ${chip(save.memory)}</p></div>` : ''}`;
  ov.innerHTML = `${head}
    <div class="card"><div class="flex" style="justify-content:space-between"><span class="dim">SCORE${R.score >= (save.bestScore || 0) && R.score > 0 ? ' · <span class="gold">BEST</span>' : ''}</span><b class="gold" style="font-size:1.6em">${fmt(R.score)}</b></div>
      <div id="boardSlot"></div></div>
    ${R.chalDone ? `<div class="card pop"><p class="win">Daily challenge complete! New trail unlocked.</p></div>` : ''}
    <button id="play">${R.won ? 'FIGHT LV ' + save.level : 'REMATCH'}</button>
    <div class="row"><button class="ghost" id="board">High scores</button><button class="ghost" id="dossier">Stats</button><button class="ghost" id="menu">Menu</button></div>`;
  bind(); fillBoardSlot();
}
function showDossier() {
  ov.classList.remove('hide'); const p = save.prof, zmax = Math.max(...p.zones), smax = Math.max(...p.sectors);
  const habits = Object.keys(CT).map(id => ({ id, n: save.habits[id] || 0 })).sort((a, b) => b.n - a.n), hmax = Math.max(1, ...habits.map(h => h.n));
  // compass of where you attack it from (3x3 grid, centre = rival)
  const cell = [5, 6, 7, 4, -1, 0, 3, 2, 1];
  const compass = cell.map(i => i < 0 ? `<div style="background:${C.pink};opacity:1;border-radius:50%"></div>` : `<div style="background:${C.cyan};opacity:${(.08 + .92 * p.sectors[i] / smax).toFixed(2)}"></div>`).join('');
  ov.innerHTML = `
    <h2 class="lose">STATS</h2>
    <div class="card flex"><div class="heat" style="grid-template-rows:repeat(3,1.6em)">${compass}</div>
      <div><p class="dim">How you attack it</p><p>Favourite side: <b>${SECT[argmax(share3(p.sectors))]}</b></p><p>Dash range: ${Math.round(p.range)}px</p><p>Waits for openings: ${pct(p.waitRatio)}</p></div></div>
    <div class="card flex"><div class="heat">${p.zones.map(v => `<div style="opacity:${(.08 + .92 * v / zmax).toFixed(2)}"></div>`).join('')}</div>
      <div><p class="dim">Where you stand</p><p>Favourite: <b>${ZONES[argmax(p.zones)]}</b></p><p>Walls: ${pct(p.edge)}</p></div></div>
    <div class="card"><p class="dim" style="margin-bottom:.3em">Counters it has built against you</p>
      ${habits.map(h => `<div class="flex" style="gap:.5em;margin:.12em 0"><span style="width:7.5em;color:${CT[h.id].col};font-size:.8em">${CT[h.id].name}</span>
        <div class="bar" style="flex:1;margin:0"><i style="width:${h.n / hmax * 100}%;background:${CT[h.id].col}"></i></div><span class="dim" style="width:1.5em;text-align:right">${h.n}</span></div>`).join('')}</div>
    <p class="dim">${tonightHint()}</p>
    <div class="row"><button class="ghost" id="trail">Trail: ${(TRAILS.find(t => t.c === save.trail) || TRAILS[0]).n} (${save.trails.length}/${TRAILS.length})</button></div>
    <button id="back">BACK</button>
    <div class="row"><button class="ghost" id="tomorrow">⏭ Simulate tomorrow (for reviewers)</button><button class="ghost" id="reset">Reset save</button></div>`;
  bind();
}
function showOvernight(o) {
  state = 'menu'; ov.classList.remove('hide'); const s = CT[o.sig];
  ov.innerHTML = `
    <p class="dim">DAY ${save.days} · 🔥 STREAK ${save.streak}</p>
    <h2 class="pop">WHILE YOU WERE AWAY…</h2>
    <p>Your rival replayed every duel you fought.</p>
    <div class="card pop" style="border-color:${s.col}88">
      <p class="dim">IT CONCLUDED</p>
      <p>It had to build <b style="color:${s.col}">${s.name}</b> against you ${o.count}× — ${s.habit}.</p>
      <p style="margin-top:.7em;font-size:1.2em;color:${s.col}"><b style="color:inherit">NEW TITLE: ${s.title}</b></p>
      <p>› Starts every fight with ${chip(o.sig)} <span class="dim">— ${s.desc}</span></p></div>
    ${rivalCard()}
    ${chalHTML()}
    <button id="play" class="pulse">FIGHT IT</button>`;
  bind();
}
function bind() {
  const on = (id, f) => { const el = document.getElementById(id); if (el) el.onclick = e => { e.stopPropagation(); audio(); f(); }; };
  on('play', () => { if (state !== 'over' || canRestart()) startFight(); });
  on('menu', showMenu); on('dossier', showDossier); on('board', showBoard); on('howto', () => showTutorial(true));
  on('back', () => state === 'over' ? showResult() : showMenu());   // (showResult won't resubmit: result.submitted)
  on('mute', () => { save.muted = !save.muted; persist(); showMenu(); });
  on('trail', () => { const i = save.trails.indexOf(save.trail); save.trail = save.trails[(i + 1) % save.trails.length]; persist(); showDossier(); });
  on('tomorrow', () => { if (!save.duelsToday && save.wins + save.losses) save.duelsToday = 1; save.dayOffset = (save.dayOffset || 0) + 1; persist(); const o = checkNewDay(); if (o) showOvernight(o); else showMenu(); });
  on('reset', () => { if (confirm('Wipe your rival and start over?')) { save = defSave(); checkNewDay(); persist(); showMenu(); } });
}

// ---------- render ----------
function wrap(text, maxW) {
  const words = text.split(' '), lines = []; let line = '';
  for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = wd; } else line = t; }
  if (line) lines.push(line); return lines;
}
function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); }
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, cvs.width, cvs.height);
  const sx = shake ? rnd(-shake, shake) : 0, sy = shake ? rnd(-shake, shake) : 0;
  ctx.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * (ox + sx * sc), dpr * (oy + sy * sc));
  ctx.fillStyle = C.arena; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();          // keep everything inside the arena
  ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = 30; x < W; x += 30) { ctx.moveTo(x, 0); ctx.lineTo(x, H); } for (let y = 30; y < H; y += 30) { ctx.moveTo(0, y); ctx.lineTo(W, y); } ctx.stroke();
  if (F && F.tint) { ctx.globalAlpha = Math.min(1, F.tint.life) * .18; ctx.fillStyle = F.tint.col; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }

  if (F && state !== 'menu') {
    const r = F.rival; ctx.textAlign = 'center';
    // lasers
    for (const L of F.lasers) { const col = CT.lasers.col;
      if (L.t < L.warn) { ctx.globalAlpha = Math.sin(L.t * 30) > 0 ? .3 : .12; ctx.fillStyle = col; ctx.fillRect(L.x, L.y, L.w, L.h); ctx.globalAlpha = 1;
        ctx.strokeStyle = col; ctx.setLineDash([6, 6]); ctx.strokeRect(L.x + .5, L.y + .5, L.w - 1, L.h - 1); ctx.setLineDash([]); }
      else { ctx.fillStyle = col; ctx.globalAlpha = .9; ctx.fillRect(L.x, L.y, L.w, L.h); ctx.globalAlpha = 1; ctx.fillStyle = '#e8f1ff';
        if (L.w < L.h) ctx.fillRect(L.x + L.w * .35, 0, L.w * .3, H); else ctx.fillRect(0, L.y + L.h * .35, W, L.h * .3); } }
    // mines
    for (const mn of F.mines) { const armed = mn.t > mn.arm, fade = Math.min(1, mn.life - mn.t);
      ctx.globalAlpha = fade; ctx.fillStyle = CT.mines.col; ctx.strokeStyle = CT.mines.col; ctx.lineWidth = 1.5;
      if (!armed) { circle(mn.x, mn.y, 9 + (1 - mn.t / mn.arm) * 14); ctx.stroke(); }
      circle(mn.x, mn.y, armed ? 8 : 5); ctx.fill();
      if (armed) { ctx.globalAlpha = fade * (.15 + .12 * Math.sin(mn.t * 8)); circle(mn.x, mn.y, 18); ctx.fill(); }
      ctx.globalAlpha = 1; }
    // bombs
    for (const b of F.bombs) { const k = b.t / b.dur, col = CT.bombs.col;
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); circle(b.tx, b.ty, b.r); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = .08 + .28 * k; ctx.fillStyle = col; circle(b.tx, b.ty, b.r * k); ctx.fill(); ctx.globalAlpha = 1;
      const bx = b.sx + (b.tx - b.sx) * k, by = b.sy + (b.ty - b.sy) * k - Math.sin(Math.PI * k) * 130; circle(bx, by, 8); ctx.fill(); }
    for (const bl of F.blasts) { const k = bl.life / .32; ctx.globalAlpha = k; ctx.fillStyle = k > .6 ? '#fff' : bl.col; circle(bl.x, bl.y, bl.r * (1.15 - .15 * k)); ctx.fill(); ctx.globalAlpha = 1; }
    // mirror telegraph
    if (r.mirror && r.mirror.st === 'tele') { const m = r.mirror, k = m.t / .5; ctx.strokeStyle = `rgba(255,255,255,${.25 + .6 * k})`; ctx.lineWidth = 2 + 6 * k; ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + Math.cos(r.ang) * 330, r.y + Math.sin(r.ang) * 330); ctx.stroke(); ctx.setLineDash([]); }
    // shards
    for (const sh of F.shards) { const k = Math.min(1, sh.life * 5); ctx.save(); ctx.translate(sh.x, sh.y); ctx.rotate(sh.a); ctx.scale(k, k);
      ctx.fillStyle = 'rgba(93,255,155,.18)'; ctx.fillRect(-13, -13, 26, 26); ctx.fillStyle = C.green; ctx.rotate(Math.PI / 4); ctx.fillRect(-6.5, -6.5, 13, 13); ctx.restore(); }
    // bullets
    for (const b of F.bullets) { const col = colOf(b.src);
      ctx.fillStyle = col; ctx.globalAlpha = .25; circle(b.x, b.y, b.r + 4); ctx.fill(); ctx.globalAlpha = 1;
      circle(b.x, b.y, b.r); ctx.fill(); ctx.fillStyle = '#fff'; circle(b.x, b.y, b.r * .4); ctx.fill(); }
    for (const s of F.missiles) { ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.ang); ctx.fillStyle = CT.seekers.col;
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-7, -6); ctx.lineTo(-4, 0); ctx.lineTo(-7, 6); ctx.closePath(); ctx.fill(); ctx.restore(); }
    // rival
    if (F.hp > 0) drawRival(r);
    if (F.hearts > 0) drawPlayer();
  }
  // particles + texts
  for (const p of parts) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
  ctx.globalAlpha = 1; ctx.textAlign = 'center';
  for (const t of texts) { const a = Math.min(1, t.life / t.max * 2), pop = 1 + Math.max(0, (t.life - t.max + .15)) * 3;
    ctx.globalAlpha = a; ctx.fillStyle = t.color; ctx.font = `bold ${t.size * pop}px monospace`; ctx.fillText(t.text, t.x, t.y); }
  ctx.globalAlpha = 1;
  if (F && state === 'play') drawHUD();
  if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash * .35})`; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
  ctx.strokeStyle = '#2a2f55'; ctx.lineWidth = 2; ctx.strokeRect(0, 0, W, H);
}
function drawRival(r) {
  const ids = Object.keys(F.arsenal), size = 1 + .07 * ids.length + (F.final ? .15 : 0);
  ctx.save(); ctx.translate(r.x, r.y);
  // vent glow = open for crits (fake vent flickers pink: the tell)
  if (r.vent > 0 || r.fakeVent > 0) { const fake = r.fakeVent > 0, col = fake && Math.sin(F.t * 40) > .3 ? C.pink : C.vent;
    ctx.globalAlpha = .25 + .2 * Math.sin(F.t * 14); ctx.fillStyle = col; circle(0, 0, 40 * size); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = col; ctx.lineWidth = 2; circle(0, 0, 40 * size); ctx.stroke();
    ctx.fillStyle = col; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.fillText('OPEN', 0, -46 * size); }
  // thorns telegraph
  if (r.thorns > 0) { const k = 1 - r.thorns / .55; ctx.strokeStyle = CT.thorns.col; ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 24, Math.sin(a) * 24); ctx.lineTo(Math.cos(a) * (24 + 22 * k), Math.sin(a) * (24 + 22 * k)); ctx.stroke(); } }
  // shield
  if (F.arsenal.shield && r.shieldAng != null) { ctx.strokeStyle = CT.shield.col; ctx.lineWidth = 6; ctx.globalAlpha = .9;
    ctx.beginPath(); ctx.arc(0, 0, 34 * size, r.shieldAng - Math.PI / 3, r.shieldAng + Math.PI / 3); ctx.stroke();
    ctx.globalAlpha = .2; ctx.lineWidth = 16; ctx.stroke(); ctx.globalAlpha = 1; }
  // spikes = counters it has built
  ctx.save(); ctx.rotate(F.t * 1.2);
  ids.forEach((id, i) => { ctx.save(); ctx.rotate(i / ids.length * 6.28); ctx.fillStyle = CT[id].col;
    const len = 10 + 6 * F.arsenal[id]; ctx.beginPath(); ctx.moveTo(19 * size, -4); ctx.lineTo(19 * size + len, 0); ctx.lineTo(19 * size, 4); ctx.closePath(); ctx.fill(); ctx.restore(); });
  ctx.restore();
  ctx.rotate(r.ang); const s2 = size * (1 + r.pulse * .25 + (r.windup > 0 ? .12 : 0)); ctx.scale(s2, s2);
  ctx.fillStyle = F.final ? 'rgba(255,255,255,.18)' : 'rgba(255,61,129,.2)'; circle(0, 0, 26); ctx.fill();
  if (r.armor > 0 && Math.sin(F.t * 50) > 0) ctx.globalAlpha = .45;
  ctx.fillStyle = r.flash > 0 ? '#fff' : F.final ? '#ffd6e6' : C.pink;
  ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(-14, -15); ctx.lineTo(-6, 0); ctx.lineTo(-14, 15); ctx.closePath(); ctx.fill();
  ctx.fillStyle = r.windup > 0 ? C.gold : '#fff'; circle(6, 0, r.windup > 0 ? 5 : 3.5); ctx.fill();
  ctx.restore();
  // speech bubble
  if (F.bark && state === 'play') { const b = F.bark, a = Math.min(1, b.life * 3, (2.2 - b.life) * 8);
    ctx.font = 'bold 12px monospace'; const tw = ctx.measureText(b.text).width + 16, bx = clamp(r.x, tw / 2 + 4, W - tw / 2 - 4), by = r.y - 62 * size < 70 ? r.y + 58 * size : r.y - 58 * size;
    ctx.globalAlpha = a; ctx.fillStyle = '#eef1ff'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx - tw / 2, by - 14, tw, 24, 8) : ctx.rect(bx - tw / 2, by - 14, tw, 24); ctx.fill();
    ctx.fillStyle = '#14081a'; ctx.textAlign = 'center'; ctx.fillText(b.text, bx, by + 3); ctx.globalAlpha = 1; }
}
function drawPlayer() {
  const col = save.trail;
  for (let i = 0; i < P.trail.length; i++) { const t = P.trail[i], a = i / P.trail.length; ctx.globalAlpha = a * (t.d ? .8 : .4); ctx.fillStyle = t.d ? '#fff' : col;
    circle(t.x, t.y, PR * a * (t.d ? 1.1 : 1)); ctx.fill(); }
  ctx.globalAlpha = 1;
  if (F.inv > 0 && !F.dash && Math.sin(F.t * 40) > 0) ctx.globalAlpha = .35;
  ctx.fillStyle = col; ctx.globalAlpha *= .25; circle(P.x, P.y, PR + 7); ctx.fill(); ctx.globalAlpha = F.inv > 0 && !F.dash && Math.sin(F.t * 40) > 0 ? .35 : 1;
  ctx.fillStyle = F.dash ? '#fff' : col; circle(P.x, P.y, PR); ctx.fill(); ctx.fillStyle = '#fff'; circle(P.x, P.y, PHIT * .6); ctx.fill();
  ctx.globalAlpha = 1;
  if (F.stun > 0) { ctx.fillStyle = CT.shield.col; for (let i = 0; i < 3; i++) { const a = F.t * 6 + i * 2.09; circle(P.x + Math.cos(a) * 15, P.y - 16 + Math.sin(a) * 4, 2.5); ctx.fill(); } }
}
function drawHUD() {
  const r = F.rival;
  // rival HP bar
  ctx.textAlign = 'left'; ctx.fillStyle = C.pink; ctx.font = 'bold 12px monospace'; ctx.fillText(`RIVAL · LV ${save.level}`, 14, 22);
  ctx.textAlign = 'right'; ctx.fillStyle = C.ink; ctx.fillText(`HP ${Math.max(0, F.hp)}/${F.maxHp}`, W - 14, 22); ctx.textAlign = 'left';
  const bw = W - 28, frac = Math.max(0, F.hp / F.maxHp);
  ctx.fillStyle = '#1b1f40'; ctx.fillRect(14, 30, bw, 10);
  ctx.fillStyle = F.final ? '#fff' : C.pink; ctx.fillRect(14, 30, bw * frac, 10);
  // hearts
  ctx.font = 'bold 20px monospace'; ctx.textAlign = 'left';
  for (let i = 0; i < HEARTS; i++) { ctx.fillStyle = i < F.hearts ? C.red : '#2a2f55'; ctx.fillText('♥', 14 + i * 22, H - 16); }
  // dash charges
  {
  ctx.textAlign = 'right'; ctx.font = 'bold 10px monospace'; ctx.fillStyle = C.dim; ctx.fillText('DASH', W - 14 - MAX_CHARGES * 22, H - 21);
  for (let i = 0; i < MAX_CHARGES; i++) { const x = W - 22 - (MAX_CHARGES - 1 - i) * 24, y = H - 25, f = clamp(F.charges - i, 0, 1);
    ctx.strokeStyle = f >= 1 ? save.trail : '#2a2f55'; ctx.lineWidth = 2; circle(x, y, 9); ctx.stroke();
    for (let k = 0; k < SHARDS_PER_DASH; k++) {                 // one wedge per shard collected
      const part = clamp(f * SHARDS_PER_DASH - k + 1e-6, 0, 1); if (part <= .01) continue;
      const a0 = -Math.PI / 2 + k / SHARDS_PER_DASH * 6.2832 + .08, a1 = -Math.PI / 2 + (k + 1) / SHARDS_PER_DASH * 6.2832 - .08;
      ctx.fillStyle = f >= 1 ? save.trail : C.green; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 7, a0, a0 + (a1 - a0) * part); ctx.closePath(); ctx.fill(); } }
  }
  // fixed joystick (phones only)
  if (touchUI) {
    const dx = joy ? joy.kx - JOY.x : 0, dy = joy ? joy.ky - JOY.y : 0, d = Math.hypot(dx, dy) || 1, m = Math.min(d, JOY.r);
    const kx = JOY.x + (joy ? dx / d * m : 0), ky = JOY.y + (joy ? dy / d * m : 0);
    ctx.globalAlpha = joy ? .55 : .32;
    ctx.fillStyle = '#05060c'; circle(JOY.x, JOY.y, JOY.r); ctx.fill();
    ctx.strokeStyle = '#eef1ff'; ctx.lineWidth = 2; circle(JOY.x, JOY.y, JOY.r); ctx.stroke();
    // direction ticks
    ctx.fillStyle = '#eef1ff';
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.save(); ctx.translate(JOY.x + Math.cos(a) * (JOY.r - 9), JOY.y + Math.sin(a) * (JOY.r - 9)); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-3, -4); ctx.lineTo(-3, 4); ctx.closePath(); ctx.fill(); ctx.restore(); }
    ctx.globalAlpha = joy ? .9 : .5;
    ctx.fillStyle = '#eef1ff'; circle(kx, ky, JOY.knob); ctx.fill();
    ctx.fillStyle = save.trail; circle(kx, ky, JOY.knob - 7); ctx.fill();
    ctx.globalAlpha = 1;
    if (F.t < 6) { ctx.textAlign = 'center'; ctx.font = 'bold 11px monospace'; ctx.fillStyle = C.dim; ctx.fillText('TAP ABOVE TO DASH', W / 2, JOY.zoneY - 10); }
  }
  // banner
  if (F.banner) { const b = F.banner, k = b.life / b.max, a = Math.min(1, (b.max - b.life) * 6, k * 3), col = colOf(b.id), y = H * .36;
    ctx.globalAlpha = a * .92; ctx.fillStyle = '#07080f'; ctx.fillRect(0, y - 54, W, 116); ctx.globalAlpha = a;
    ctx.fillStyle = col; ctx.fillRect(0, y - 54, W, 3); ctx.fillRect(0, y + 59, W, 3);
    ctx.textAlign = 'center'; ctx.fillStyle = C.dim; ctx.font = 'bold 12px monospace'; ctx.fillText(b.title, W / 2, y - 32);
    const pop = 1 + Math.max(0, .15 - (b.max - b.life)) * 3;
    ctx.fillStyle = col; ctx.font = `bold ${30 * pop}px monospace`; ctx.fillText(nameOf(b.id), W / 2, y + 4);
    ctx.fillStyle = C.ink; ctx.font = '13px monospace'; wrap(b.why, W - 50).forEach((ln, i) => ctx.fillText(ln, W / 2, y + 27 + i * 16));
    ctx.fillStyle = col; ctx.fillRect(0, y + 59, W * (b.life / b.max), 3);
    ctx.fillStyle = C.dim; ctx.font = '10px monospace'; ctx.fillText(b.max - b.life > .6 ? '❚❚ PAUSED · tap to continue' : '❚❚ PAUSED', W / 2, y + 76);
    ctx.globalAlpha = 1; }
}

// ---------- loop ----------
let last = performance.now();
function frame(now) { const dt = Math.min(.05, (now - last) / 1000); last = now; update(dt); render(); requestAnimationFrame(frame); }
// Phones: this build is tuned for mouse play, so say so up front (with a way through for curious reviewers).
const isPhone = /Android|iPhone|iPod|Mobile|IEMobile|Opera Mini/i.test(navigator.userAgent)
  || (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600);
function boot() { const evo = checkNewDay(); if (!save.tutorialSeen) showTutorial(false); else if (evo) showOvernight(evo); else showMenu(); }
if (isPhone) {
  state = 'menu'; ov.classList.remove('hide');
  ov.innerHTML = `
    <h1 class="pop">RIVAL</h1>
    <div class="card" style="text-align:center">
      <p style="font-size:1.6em;margin-bottom:.3em">🖥️</p>
      <h2>Best played on a PC browser</h2>
      <p class="dim" style="margin-top:.5em">This prototype is tuned for mouse controls. Open the same link on a computer for the intended experience.</p>
    </div>
    <button class="ghost" id="anyway">Continue anyway</button>`;
  document.getElementById('anyway').onclick = e => { e.stopPropagation(); audio(); boot(); };
} else boot();
F = newFight();
requestAnimationFrame(frame);
window.__rival = { get save() { return save; }, get F() { return F; }, get state() { return state; }, get P() { return P; }, dash: () => tryDash(), read: () => readFight() }; // debug hook for playtesting
})();
