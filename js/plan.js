/* plan.js — the 2D floor-plan editor (canvas 2D). */
(function () {
  const HA = window.HA, U = HA.util, S = HA.state;
  const P = HA.plan = {};

  let cv, ctx, W = 0, H = 0, dpr = 1;
  const cam = P.cam = { ox: 18, oz: 15, s: 14 };     // world point at canvas centre + px/ft
  let drag = null, hover = null, draft = null, spaceDown = false, mouse = { x: 0, z: 0 };

  const sx = x => (x - cam.ox) * cam.s + W / 2;
  const sz = z => (z - cam.oz) * cam.s + H / 2;
  const wx = px => (px - W / 2) / cam.s + cam.ox;
  const wz = py => (py - H / 2) / cam.s + cam.oz;
  P.toWorld = (px, py) => ({ x: wx(px), z: wz(py) });

  const CEIL_NAME = {
    flat: 'flat', gable: 'vaulted', flattop: 'flat-top vault',
    shed: 'shed', barrel: 'cathedral', tray: 'tray'
  };

  const snapOn = () => document.getElementById('snapChk').checked;
  function snap(v) { return snapOn() ? U.round(v, .25) : Math.round(v * 1000) / 1000; }
  /** last thing we snapped to, drawn as a ring so the join is visible */
  let snapHit = null;

  /** snap to wall ends and room corners first, then onto any wall face (a T joint) */
  function snapPt(p, skip) {
    const TOL_PT = .8, TOL_SEG = .55;
    let best = null;
    const take = (x, z, d, type) => { if (!best || d < best.d) best = { x: x, z: z, d: d, type: type }; };

    HA.walls().forEach(w => {
      ['a', 'b'].forEach(k => {
        if (skip && skip.wallId === w.id && skip.end === k) return;
        const q = w[k], d = Math.hypot(q.x - p.x, q.z - p.z);
        if (d < TOL_PT) take(q.x, q.z, d, 'end');
      });
    });
    HA.rooms().forEach(r => r.points.forEach((q, i) => {
      if (skip && skip.room === r && skip.index === i) return;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < TOL_PT) take(q.x, q.z, d, 'corner');
    }));

    if (!best) {                                   // nothing to land on — try a face
      HA.walls().forEach(w => {
        if (skip && skip.wallId === w.id) return;
        const g = U.seg(p.x, p.z, w.a, w.b);
        if (g.d < TOL_SEG && g.t > .02 && g.t < .98) take(g.x, g.z, g.d, 'wall');
      });
      HA.rooms().forEach(r => r.points.forEach((a, i) => {
        const n = r.points.length, b = r.points[(i + 1) % n];
        if (skip && skip.room === r && (skip.index === i || skip.index === (i + 1) % n)) return;
        const g = U.seg(p.x, p.z, a, b);
        if (g.d < TOL_SEG) take(g.x, g.z, g.d, 'edge');
      }));
    }

    if (best) { snapHit = best; return { x: best.x, z: best.z }; }
    snapHit = null;
    return { x: snap(p.x), z: snap(p.z) };
  }

  /* ─────────────── setup ─────────────── */
  P.init = function () {
    cv = document.getElementById('plan');
    ctx = cv.getContext('2d');
    resize();
    new ResizeObserver(resize).observe(cv.parentElement);
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    cv.addEventListener('wheel', wheel, { passive: false });
    cv.addEventListener('dblclick', dbl);
    cv.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => { if (e.code === 'Space') spaceDown = true; });
    window.addEventListener('keyup', e => { if (e.code === 'Space') spaceDown = false; });
    HA.on('redraw', P.draw);
  };

  function resize() {
    if (!cv || !cv.parentElement) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.parentElement.clientWidth; H = cv.parentElement.clientHeight;
    cv.width = Math.max(1, W * dpr); cv.height = Math.max(1, H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    P.draw();
  }
  P.resize = resize;

  P.fit = function () {
    const pts = [];
    HA.rooms().forEach(r => pts.push.apply(pts, r.points));
    HA.furn().forEach(f => pts.push({ x: f.x, z: f.z }));
    if (!pts.length) { cam.ox = 18; cam.oz = 15; cam.s = 14; return P.draw(); }
    const b = U.bbox(pts);
    cam.ox = (b.x0 + b.x1) / 2; cam.oz = (b.z0 + b.z1) / 2;
    if (W < 40 || H < 40) return;                     // panel hidden — keep the current zoom
    cam.s = U.clamp(Math.min(W / (b.w + 8), H / (b.d + 8)), 2, 60);
    P.draw();
  };

  /* ─────────────── drawing ─────────────── */
  P.draw = function () {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0f1113'; ctx.fillRect(0, 0, W, H);
    grid();
    const sel = S.sel;
    HA.rooms().forEach(r => room(r, sel && sel.id === r.id));
    HA.walls().forEach(w => freeWall(w, sel && sel.id === w.id));
    HA.furn().forEach(f => item(f, sel && sel.kind === 'furniture' && sel.id === f.id));
    HA.rooms().forEach(r => roomLabel(r, sel && sel.id === r.id));   // labels ride on top
    if (draft) drawDraft();
    if (snapHit && (draft || drag)) {
      ctx.beginPath(); ctx.arc(sx(snapHit.x), sz(snapHit.z), 8, 0, 7);
      ctx.strokeStyle = '#6cc17a'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(sx(snapHit.x), sz(snapHit.z), 2.5, 0, 7);
      ctx.fillStyle = '#6cc17a'; ctx.fill();
    }
    hudCoord();
  };

  function grid() {
    const step = cam.s < 4 ? 5 : 1;
    const x0 = Math.floor(wx(0) / step) * step, x1 = wx(W);
    const z0 = Math.floor(wz(0) / step) * step, z1 = wz(H);
    ctx.lineWidth = 1;
    for (let x = x0; x <= x1; x += step) {
      const maj = Math.abs(x % 5) < 1e-6;
      ctx.strokeStyle = maj ? '#20262c' : '#191d21';
      if (!maj && cam.s < 8) continue;
      ctx.beginPath(); ctx.moveTo(Math.round(sx(x)) + .5, 0); ctx.lineTo(Math.round(sx(x)) + .5, H); ctx.stroke();
    }
    for (let z = z0; z <= z1; z += step) {
      const maj = Math.abs(z % 5) < 1e-6;
      ctx.strokeStyle = maj ? '#20262c' : '#191d21';
      if (!maj && cam.s < 8) continue;
      ctx.beginPath(); ctx.moveTo(0, Math.round(sz(z)) + .5); ctx.lineTo(W, Math.round(sz(z)) + .5); ctx.stroke();
    }
    ctx.strokeStyle = '#2a3138';
    ctx.beginPath(); ctx.moveTo(sx(0), 0); ctx.lineTo(sx(0), H); ctx.moveTo(0, sz(0)); ctx.lineTo(W, sz(0)); ctx.stroke();
  }

  function path(pts) {
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(sx(p.x), sz(p.z)) : ctx.moveTo(sx(p.x), sz(p.z)));
    ctx.closePath();
  }

  function room(r, on) {
    const pts = r.points;
    if (pts.length < 2) return;
    /* floor */
    path(pts);
    ctx.fillStyle = shadeA(r.floorColor, on ? .5 : .34);
    ctx.fill();
    /* walls: stroke double-thick and clip to the polygon so only the inside half shows */
    ctx.save();
    path(pts); ctx.clip();
    path(pts);
    ctx.lineWidth = Math.max(2, r.wallThickness * cam.s * 2);
    ctx.strokeStyle = on ? '#cfd6dd' : '#9aa3ac';
    ctx.stroke();
    ctx.restore();
    /* openings punch through the wall band */
    (r.openings || []).forEach(o => opening(r, o, on));
    /* outline */
    path(pts);
    ctx.lineWidth = on ? 2 : 1;
    ctx.strokeStyle = on ? '#5aa9e6' : '#4a525a';
    ctx.stroke();

  }

  function roomLabel(r, on) {
    const pts = r.points;
    if (pts.length < 3) return;
    const c = U.centroid(pts);
    if (cam.s > 4) {
      const dm = HA.dims(r);
      ctx.save();
      ctx.shadowColor = 'rgba(10,12,14,.95)'; ctx.shadowBlur = 6;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = on ? '#e6e8ea' : '#aeb6bd';
      ctx.font = '600 12px "Segoe UI",sans-serif';
      ctx.fillText(r.name, sx(c.x), sz(c.z) - 7);
      ctx.font = '11px "Segoe UI",sans-serif'; ctx.fillStyle = '#8d959c';
      const dim = (pts.length === 4 ? U.ft(dm.w) + ' × ' + U.ft(dm.d) : Math.round(dm.area) + ' sq ft')
        + (dm.inside ? ' clear' : '');
      ctx.fillText(dim, sx(c.x), sz(c.z) + 8);
      const cl = r.ceiling && r.ceiling.type !== 'flat'
        ? CEIL_NAME[r.ceiling.type] + ' ' + U.ft(r.wallHeight) + '→' + U.ft(r.wallHeight + r.ceiling.rise)
        : U.ft(r.wallHeight) + ' flat';
      ctx.fillStyle = '#6f767d'; ctx.fillText(cl, sx(c.x), sz(c.z) + 21);
      ctx.restore();
    }

    /* selected: corner handles + edge dimensions */
    if (on) {
      for (let i = 0; i < pts.length; i++) edgeDim(pts, i, HA.edgeRef(r, i).len);
      pts.forEach((p, i) => {
        const isSel = S.sel && S.sel.kind === 'vertex' && S.sel.index === i;
        ctx.beginPath(); ctx.arc(sx(p.x), sz(p.z), isSel ? 6 : 4.5, 0, 7);
        ctx.fillStyle = isSel ? '#f0a04b' : '#5aa9e6'; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#0f1113'; ctx.stroke();
      });
    }
  }

  function edgeDim(pts, i, shownLen) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L * cam.s < 34) return;
    const label = shownLen === undefined ? L : shownLen;
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    const nx = -(b.z - a.z) / L, nz = (b.x - a.x) / L;     // inward normal
    const px = sx(mx + nx * .9), py = sz(mz + nz * .9);
    ctx.save();
    ctx.translate(px, py);
    let ang = Math.atan2(sz(b.z) - sz(a.z), sx(b.x) - sx(a.x));
    if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
    ctx.rotate(ang);
    ctx.font = '11px "Segoe UI",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const txt = U.ft(label), tw = ctx.measureText(txt).width;
    ctx.fillStyle = 'rgba(15,17,19,.85)'; ctx.fillRect(-tw / 2 - 3, -8, tw + 6, 15);
    ctx.fillStyle = '#f0a04b'; ctx.fillText(txt, 0, 0);
    ctx.restore();
  }

  /** a free-standing partition wall */
  function freeWall(w, on) {
    const f = HA.wallFrame(w);
    if (f.L < .05) return;
    const p = (u, v) => ({ x: w.a.x + f.ex.x * u + f.n.x * v, z: w.a.z + f.ex.z * u + f.n.z * v });
    const half = f.t / 2;
    path([p(0, -half), p(f.L, -half), p(f.L, half), p(0, half)]);
    ctx.fillStyle = on ? '#cfd6dd' : '#9aa3ac';
    ctx.fill();
    ctx.lineWidth = on ? 2 : 1;
    ctx.strokeStyle = on ? '#5aa9e6' : '#4a525a';
    ctx.stroke();

    (w.openings || []).forEach(o => {
      const ow = Math.min(o.width, f.L - .1);
      const u = U.clamp(o.offset, ow / 2, f.L - ow / 2);
      const c = [p(u - ow / 2, -half - .02), p(u + ow / 2, -half - .02),
      p(u + ow / 2, half + .02), p(u - ow / 2, half + .02)];
      const osel = S.sel && S.sel.kind === 'opening' && S.sel.id === o.id;
      path(c);
      ctx.fillStyle = o.kind === 'window' ? '#2b3d47' : '#0f1113';
      ctx.fill();
      ctx.lineWidth = osel ? 2 : 1;
      ctx.strokeStyle = osel ? '#f0a04b' : (o.kind === 'window' ? '#7fb6c9' : '#8d959c');
      ctx.stroke();
      if (o.kind === 'door') {
        const sw = o.swing === -1 ? -1 : 1;
        const h = p(u - sw * ow / 2, half);
        const a0 = Math.atan2(f.n.z, f.n.x);
        ctx.beginPath();
        ctx.moveTo(sx(h.x), sz(h.z));
        ctx.arc(sx(h.x), sz(h.z), ow * cam.s, a0 - (sw > 0 ? 0 : Math.PI / 2), a0 + (sw > 0 ? Math.PI / 2 : 0));
        ctx.strokeStyle = 'rgba(207,214,221,.55)'; ctx.lineWidth = 1; ctx.stroke();
      }
    });

    if (on) {
      edgeDim([w.a, w.b], 0, f.L);
      [w.a, w.b].forEach((q, i) => {
        const isEnd = S.sel && S.sel.kind === 'wallEnd' && S.sel.index === i;
        ctx.beginPath(); ctx.arc(sx(q.x), sz(q.z), isEnd ? 6 : 4.5, 0, 7);
        ctx.fillStyle = isEnd ? '#f0a04b' : '#5aa9e6'; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#0f1113'; ctx.stroke();
      });
    }
  }

  /** geometry of an opening in plan space */
  function opRect(r, o) {
    const pts = r.points, n = pts.length;
    if (o.edge >= n) return null;
    const a = pts[o.edge], b = pts[(o.edge + 1) % n];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const ex = { x: (b.x - a.x) / L, z: (b.z - a.z) / L };
    const inw = { x: -ex.z, z: ex.x };
    const w = Math.min(o.width, L - .2);
    const u = U.clamp(o.offset, w / 2 + .05, L - w / 2 - .05);
    const t = r.wallThickness;
    return { a, ex, inw, L, w, u, t, cx: a.x + ex.x * u, cz: a.z + ex.z * u };
  }

  function opening(r, o, roomOn) {
    const g = opRect(r, o); if (!g) return;
    const sel = S.sel && S.sel.kind === 'opening' && S.sel.id === o.id;
    const p = (du, dv) => ({ x: g.cx + g.ex.x * du + g.inw.x * dv, z: g.cz + g.ex.z * du + g.inw.z * dv });
    const c = [p(-g.w / 2, -.02), p(g.w / 2, -.02), p(g.w / 2, g.t + .02), p(-g.w / 2, g.t + .02)];
    path(c);
    ctx.fillStyle = o.kind === 'window' ? '#2b3d47' : shadeA(r.floorColor, .34);
    ctx.fill();
    ctx.lineWidth = sel ? 2 : 1;
    ctx.strokeStyle = sel ? '#f0a04b' : (o.kind === 'window' ? '#7fb6c9' : '#8d959c');
    ctx.stroke();
    if (o.kind === 'window') {
      const q0 = p(-g.w / 2, g.t / 2), q1 = p(g.w / 2, g.t / 2);
      ctx.beginPath(); ctx.moveTo(sx(q0.x), sz(q0.z)); ctx.lineTo(sx(q1.x), sz(q1.z));
      ctx.strokeStyle = '#cfe3ea'; ctx.lineWidth = 1.5; ctx.stroke();
    } else if (o.kind === 'door') {
      const sw = o.swing === -1 ? -1 : 1;
      const h = p(-sw * g.w / 2, g.t);
      const ang0 = Math.atan2(g.inw.z, g.inw.x);
      ctx.beginPath();
      ctx.moveTo(sx(h.x), sz(h.z));
      ctx.arc(sx(h.x), sz(h.z), g.w * cam.s, ang0 - (sw > 0 ? 0 : Math.PI / 2), ang0 + (sw > 0 ? Math.PI / 2 : 0));
      ctx.closePath();
      ctx.strokeStyle = 'rgba(207,214,221,.55)'; ctx.lineWidth = 1; ctx.stroke();
    }
  }

  function item(f, on) {
    const def = HA.furniture.def(f.type); if (!def) return;
    const r = f.rot * Math.PI / 180, cr = Math.cos(r), sr = Math.sin(r);
    const w = f.w || def.w, d = f.d || def.d;
    const cor = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(k => ({
      x: f.x + k[0] * w / 2 * cr - k[1] * d / 2 * sr,
      z: f.z + k[0] * w / 2 * sr + k[1] * d / 2 * cr
    }));
    path(cor);
    ctx.fillStyle = shadeA(f.color || def.c, on ? .95 : .8);
    ctx.fill();
    ctx.lineWidth = on ? 2 : 1;
    ctx.strokeStyle = on ? '#f0a04b' : 'rgba(15,17,19,.7)';
    ctx.stroke();
    /* front marker */
    const fx = f.x - Math.sin(r) * 0, fz = f.z;
    const front = { x: f.x - sr * (d / 2 - .18) * -1, z: f.z + cr * (d / 2 - .18) };
    void fx; void fz;
    ctx.beginPath();
    ctx.moveTo(sx(f.x), sz(f.z));
    ctx.lineTo(sx(f.x - sr * (d / 2 - .1)), sz(f.z + cr * (d / 2 - .1)));
    ctx.strokeStyle = 'rgba(15,17,19,.55)'; ctx.lineWidth = 1.5; ctx.stroke();
    void front;
    if (cam.s > 9 && (w * cam.s > 40)) {
      ctx.save();
      ctx.translate(sx(f.x), sz(f.z));
      let a = r; if (a > Math.PI / 2 || a < -Math.PI / 2) a += Math.PI;
      ctx.rotate(a);
      ctx.font = '10px "Segoe UI",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(10,12,14,.8)';
      ctx.fillText(def.n, 0, 0);
      ctx.restore();
    }
    if (on) {
      const hx = f.x - sr * (d / 2 + .9), hz = f.z + cr * (d / 2 + .9);
      ctx.beginPath(); ctx.moveTo(sx(f.x), sz(f.z)); ctx.lineTo(sx(hx), sz(hz));
      ctx.strokeStyle = '#f0a04b'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.arc(sx(hx), sz(hz), 5.5, 0, 7);
      ctx.fillStyle = '#f0a04b'; ctx.fill();
      ctx.strokeStyle = '#0f1113'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }

  function drawDraft() {
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#5aa9e6'; ctx.lineWidth = 1.5;
    if (draft.kind === 'rect') {
      const a = draft.a, b = draft.b;
      ctx.strokeRect(sx(Math.min(a.x, b.x)), sz(Math.min(a.z, b.z)),
        Math.abs(b.x - a.x) * cam.s, Math.abs(b.z - a.z) * cam.s);
      ctx.setLineDash([]);
      /* you drag the outside footprint; in inside mode report what it leaves you */
      const pad = HA.insideMode() ? 2 * HA.defaults.wallThickness : 0;
      const dw = Math.max(0, Math.abs(b.x - a.x) - pad), dd = Math.max(0, Math.abs(b.z - a.z) - pad);
      label(U.ft(dw) + ' × ' + U.ft(dd) + (pad ? ' clear' : ''),
        (sx(a.x) + sx(b.x)) / 2, (sz(a.z) + sz(b.z)) / 2);
    } else if (draft.kind === 'wall') {
      const a = draft.a, b = draft.b, t = HA.defaults.wallThickness;
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      ctx.setLineDash([]);
      ctx.lineWidth = Math.max(2, t * cam.s);
      ctx.strokeStyle = 'rgba(90,169,230,.75)';
      ctx.beginPath(); ctx.moveTo(sx(a.x), sz(a.z)); ctx.lineTo(sx(b.x), sz(b.z)); ctx.stroke();
      if (L > .1) {
        let ang = Math.round(Math.atan2(b.z - a.z, b.x - a.x) * 180 / Math.PI);
        if (ang < 0) ang += 360;
        label(U.ft(L) + '  ' + ang + '°', (sx(a.x) + sx(b.x)) / 2, (sz(a.z) + sz(b.z)) / 2 - 14);
      }
    } else if (draft.kind === 'poly') {
      ctx.beginPath();
      draft.pts.forEach((p, i) => i ? ctx.lineTo(sx(p.x), sz(p.z)) : ctx.moveTo(sx(p.x), sz(p.z)));
      ctx.lineTo(sx(mouse.x), sz(mouse.z));
      ctx.stroke();
      ctx.setLineDash([]);
      draft.pts.forEach(p => {
        ctx.beginPath(); ctx.arc(sx(p.x), sz(p.z), 4, 0, 7); ctx.fillStyle = '#5aa9e6'; ctx.fill();
      });
      if (draft.pts.length) {
        const a = draft.pts[draft.pts.length - 1];
        label(U.ft(Math.hypot(mouse.x - a.x, mouse.z - a.z)),
          (sx(a.x) + sx(mouse.x)) / 2, (sz(a.z) + sz(mouse.z)) / 2);
      }
    }
    ctx.setLineDash([]);
  }

  function label(txt, x, y) {
    ctx.font = '11px "Segoe UI",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(txt).width;
    ctx.fillStyle = 'rgba(15,17,19,.85)'; ctx.fillRect(x - w / 2 - 4, y - 9, w + 8, 17);
    ctx.fillStyle = '#f0a04b'; ctx.fillText(txt, x, y);
  }

  function shadeA(hex, a) {
    hex = hex || '#888888';
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function hudCoord() {
    const el = document.getElementById('planCoord');
    if (el) el.textContent = U.ft(mouse.x) + ', ' + U.ft(mouse.z);
  }

  /* ─────────────── hit testing ─────────────── */
  function pick(x, z) {
    const tol = 9 / cam.s;
    /* rotate handle of the selected item */
    const s = S.sel;
    if (s && s.kind === 'furniture') {
      const f = HA.item(s.id);
      if (f) {
        const def = HA.furniture.def(f.type), d = f.d || def.d;
        const r = f.rot * Math.PI / 180;
        const hx = f.x - Math.sin(r) * (d / 2 + .9), hz = f.z + Math.cos(r) * (d / 2 + .9);
        if (Math.hypot(x - hx, z - hz) < tol) return { kind: 'rotate', id: f.id };
      }
    }
    /* free-standing walls: ends first, then the body, then anything cut into it */
    const ws = HA.walls();
    for (let i = ws.length - 1; i >= 0; i--) {
      const w = ws[i];
      if (Math.hypot(x - w.a.x, z - w.a.z) < tol) return { kind: 'wallEnd', id: w.id, index: 0 };
      if (Math.hypot(x - w.b.x, z - w.b.z) < tol) return { kind: 'wallEnd', id: w.id, index: 1 };
    }
    for (let i = ws.length - 1; i >= 0; i--) {
      const w = ws[i], f = HA.wallFrame(w);
      const g = U.seg(x, z, w.a, w.b);
      if (g.d > Math.max(tol, f.t)) continue;
      const u = g.t * f.L;
      for (const o of (w.openings || [])) {
        if (Math.abs(u - o.offset) <= o.width / 2) return { kind: 'opening', id: o.id, wallId: w.id };
      }
      return { kind: 'swall', id: w.id, at: u };
    }

    const fs = HA.furn();
    for (let i = fs.length - 1; i >= 0; i--) {
      const f = fs[i], def = HA.furniture.def(f.type); if (!def) continue;
      const r = f.rot * Math.PI / 180, dx = x - f.x, dz = z - f.z;
      const lx = dx * Math.cos(r) + dz * Math.sin(r), lz = -dx * Math.sin(r) + dz * Math.cos(r);
      if (Math.abs(lx) <= (f.w || def.w) / 2 && Math.abs(lz) <= (f.d || def.d) / 2)
        return { kind: 'furniture', id: f.id };
    }
    const rooms = HA.rooms();
    for (let i = rooms.length - 1; i >= 0; i--) {
      const r = rooms[i];
      for (let k = 0; k < r.points.length; k++) {
        const p = r.points[k];
        if (Math.hypot(x - p.x, z - p.z) < tol) return { kind: 'vertex', id: r.id, index: k };
      }
    }
    for (let i = rooms.length - 1; i >= 0; i--) {
      const r = rooms[i];
      for (const o of (r.openings || [])) {
        const g = opRect(r, o); if (!g) continue;
        const dx = x - g.cx, dz = z - g.cz;
        const lu = dx * g.ex.x + dz * g.ex.z, lv = dx * g.inw.x + dz * g.inw.z;
        if (Math.abs(lu) <= g.w / 2 && lv >= -.25 && lv <= g.t + .25)
          return { kind: 'opening', id: o.id, roomId: r.id };
      }
    }
    for (let i = rooms.length - 1; i >= 0; i--) {
      const r = rooms[i];
      for (let k = 0; k < r.points.length; k++) {
        const a = r.points[k], b = r.points[(k + 1) % r.points.length];
        const g = U.seg(x, z, a, b);
        if (g.d < Math.max(tol, r.wallThickness)) return { kind: 'wall', id: r.id, index: k, t: g.t, len: g.len };
      }
    }
    const rr = HA.roomAt(x, z);
    if (rr) return { kind: 'room', id: rr.id };
    return null;
  }

  /* ─────────────── interaction ─────────────── */
  function evPt(e) {
    const r = cv.getBoundingClientRect();
    return { x: wx(e.clientX - r.left), z: wz(e.clientY - r.top), px: e.clientX, py: e.clientY };
  }

  function down(e) {
    cv.setPointerCapture(e.pointerId);
    const p = evPt(e);
    mouse = p;
    if (e.button === 1 || e.button === 2 || spaceDown) {
      drag = { kind: 'pan', px: e.clientX, py: e.clientY, ox: cam.ox, oz: cam.oz };
      return;
    }
    const tool = S.tool;

    if (S.placing) {                                     // drop a catalogue item
      HA.snapshot();
      const it = HA.furniture.make(S.placing, snap(p.x), snap(p.z), 0);
      const def = HA.furniture.def(S.placing);
      if (def && def.elev) it.elev = def.elev;
      HA.furn().push(it);
      HA.select({ kind: 'furniture', id: it.id });
      HA.changed();
      if (!e.shiftKey) HA.emit('placedone');
      drag = { kind: 'move', id: it.id, dx: 0, dz: 0 };
      return;
    }

    if (tool === 'rect') { draft = { kind: 'rect', a: { x: snap(p.x), z: snap(p.z) }, b: { x: snap(p.x), z: snap(p.z) } }; return; }

    if (tool === 'wall') { draft = { kind: 'wall', a: snapPt(p), b: snapPt(p) }; return; }

    if (tool === 'poly') {
      const q = snapPt(p);
      if (!draft) draft = { kind: 'poly', pts: [q] };
      else {
        const first = draft.pts[0];
        if (draft.pts.length > 2 && Math.hypot(q.x - first.x, q.z - first.z) < 12 / cam.s) return P.closePoly();
        draft.pts.push(q);
      }
      P.draw(); return;
    }

    if (tool === 'door' || tool === 'window' || tool === 'opening') {
      /* a free-standing wall under the pointer wins — it has no room to belong to */
      let fw = null;
      HA.walls().forEach(w => {
        const g = U.seg(p.x, p.z, w.a, w.b), f = HA.wallFrame(w);
        if (g.d < Math.max(1, f.t * 2) && (!fw || g.d < fw.d)) fw = { d: g.d, w: w, at: g.t * f.L, L: f.L };
      });
      if (fw) {
        HA.snapshot();
        const o = HA.newOpening(tool, 0, fw.at);
        o.width = Math.min(o.width, Math.max(1, fw.L - .4));
        o.offset = U.clamp(fw.at, o.width / 2, fw.L - o.width / 2);
        fw.w.openings.push(o);
        HA.select({ kind: 'opening', id: o.id, wallId: fw.w.id });
        HA.changed(true);
        drag = { kind: 'wallOpening', id: o.id, wallId: fw.w.id };
        return;
      }
      const inRoom = HA.roomAt(p.x, p.z);
      let best = null;
      HA.rooms().forEach(r => {
        r.points.forEach((a, k) => {
          const b = r.points[(k + 1) % r.points.length];
          const g = U.seg(p.x, p.z, a, b);
          if (!best || g.d < best.d) best = { d: g.d, r, edge: k, at: g.t * g.len, len: g.len };
        });
      });
      if (!best) return;
      if (best.d > Math.max(1.5, best.r.wallThickness * 2) && !(inRoom && inRoom === best.r)) {
        HA.status('Click on (or inside) a room to add a ' + tool + '.');
        return;
      }
      const r = best.r;
      HA.snapshot();
      const o = HA.newOpening(tool, best.edge, best.at);
      o.width = Math.min(o.width, Math.max(1, best.len - .6));
      o.offset = U.clamp(best.at, o.width / 2 + .1, best.len - o.width / 2 - .1);
      r.openings.push(o);
      const tw = HA.syncTwin(r, o);
      HA.select({ kind: 'opening', id: o.id, roomId: r.id });
      HA.changed();
      if (tw) HA.status('Cut through both sides of the wall shared with ' + HA.twinOf(o).room.name + '.');
      drag = { kind: 'opening', id: o.id, roomId: r.id };
      return;
    }

    if (tool === 'paint') {
      let fw = null;
      HA.walls().forEach(w => {
        const g = U.seg(p.x, p.z, w.a, w.b), f = HA.wallFrame(w);
        if (g.d < Math.max(.5, f.t) && (!fw || g.d < fw.d)) fw = { d: g.d, w: w };
      });
      if (fw) {
        HA.snapshot(); fw.w.color = S.paintColor; HA.changed(true);
        return HA.status('Painted the partition wall — ' + S.paintName);
      }
      let best = null;
      HA.rooms().forEach(r => {
        r.points.forEach((a, k) => {
          const b = r.points[(k + 1) % r.points.length];
          const g = U.seg(p.x, p.z, a, b);
          if (!best || g.d < best.d) best = { d: g.d, r, edge: k };
        });
      });
      const inRoom = HA.roomAt(p.x, p.z);
      const whole = document.getElementById('paintWholeRoom').checked;
      if (best && best.d < Math.max(.9, best.r.wallThickness * 1.6)) {
        HA.snapshot();
        if (whole) { best.r.wallColor = S.paintColor; best.r.wallColors = {}; }
        else best.r.wallColors[best.edge] = S.paintColor;
        HA.changed();
        HA.status('Painted ' + best.r.name + (whole ? ' — all walls' : ' wall ' + (best.edge + 1)) + ' — ' + S.paintName);
      } else if (inRoom) {
        HA.snapshot();
        inRoom.floorColor = S.paintColor;
        HA.changed();
        HA.status('New floor in ' + inRoom.name + ' — ' + S.paintName);
      }
      return;
    }

    /* select tool */
    const h = pick(p.x, p.z);
    if (!h) { HA.select(null); return; }
    if (h.kind === 'rotate') { drag = { kind: 'rotate', id: h.id }; return; }
    if (h.kind === 'vertex') {
      const r = HA.room(h.id);
      if (e.altKey && r.points.length > 3) {
        HA.snapshot(); r.points.splice(h.index, 1);
        r.openings = r.openings.filter(o => o.edge < r.points.length);
        HA.select({ kind: 'room', id: r.id }); HA.changed(); return;
      }
      HA.select({ kind: 'vertex', id: h.id, index: h.index });
      HA.snapshot();
      const v = r.points[h.index];
      drag = { kind: 'vertex', id: h.id, index: h.index, joined: HA.wallEndsAt(v.x, v.z) };
      return;
    }
    if (h.kind === 'furniture') {
      const f = HA.item(h.id);
      HA.select({ kind: 'furniture', id: h.id });
      HA.snapshot();
      drag = { kind: 'move', id: h.id, dx: p.x - f.x, dz: p.z - f.z };
      return;
    }
    if (h.kind === 'wallEnd') {
      HA.select({ kind: 'wallEnd', id: h.id, index: h.index });
      HA.snapshot();
      const w = HA.wall(h.id), q = h.index ? w.b : w.a;
      drag = {
        kind: 'wallEnd', id: h.id, index: h.index,
        joined: HA.wallEndsAt(q.x, q.z, w.id),     // anything sharing this point comes too
        tees: HA.wallTeesOn(w)                     // walls tee'd into this one slide along it
      };
      return;
    }
    if (h.kind === 'swall') {
      HA.select({ kind: 'swall', id: h.id });
      HA.snapshot();
      const w = HA.wall(h.id);
      drag = {
        kind: 'swall', id: h.id, x: p.x, z: p.z,
        a: { x: w.a.x, z: w.a.z }, b: { x: w.b.x, z: w.b.z },
        joined: HA.wallEndsAt(w.a.x, w.a.z, w.id)
          .concat(HA.wallEndsAt(w.b.x, w.b.z, w.id))
          .concat(HA.wallTeesOn(w))                // tee'd walls travel with it too
      };
      return;
    }
    if (h.kind === 'opening' && h.wallId) {
      HA.select({ kind: 'opening', id: h.id, wallId: h.wallId });
      HA.snapshot();
      drag = { kind: 'wallOpening', id: h.id, wallId: h.wallId };
      return;
    }
    if (h.kind === 'opening') {
      HA.select({ kind: 'opening', id: h.id, roomId: h.roomId });
      HA.snapshot();
      drag = { kind: 'opening', id: h.id, roomId: h.roomId };
      return;
    }
    if (h.kind === 'wall') {
      HA.select({ kind: 'wall', id: h.id, index: h.index });
      HA.snapshot();
      drag = {
        kind: 'room', id: h.id, x: p.x, z: p.z, pts: U.clone(HA.room(h.id).points),
        joined: HA.wallEndsOnRoom(HA.room(h.id))    // partitions attached to it come along
      };
      return;
    }
    if (h.kind === 'room') {
      HA.select({ kind: 'room', id: h.id });
      HA.snapshot();
      drag = {
        kind: 'room', id: h.id, x: p.x, z: p.z, pts: U.clone(HA.room(h.id).points),
        joined: HA.wallEndsOnRoom(HA.room(h.id))    // partitions attached to it come along
      };
    }
  }

  function move(e) {
    const p = evPt(e);
    mouse = p;
    if (!drag) {
      if (draft && draft.kind === 'wall') {
        let q = snapPt(p);
        if (e.shiftKey) {                                    // Shift constrains to 45°
          const dx = q.x - draft.a.x, dz = q.z - draft.a.z, L = Math.hypot(dx, dz);
          const ang = Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) * (Math.PI / 4);
          q = { x: snap(draft.a.x + Math.cos(ang) * L), z: snap(draft.a.z + Math.sin(ang) * L) };
        }
        draft.b = q;
        P.draw();
      } else if (draft) P.draw();
      else { hover = pick(p.x, p.z); cv.style.cursor = cursorFor(hover); hudCoord(); }
      return;
    }
    switch (drag.kind) {
      case 'pan':
        cam.ox = drag.ox - (e.clientX - drag.px) / cam.s;
        cam.oz = drag.oz - (e.clientY - drag.py) / cam.s;
        break;
      case 'vertex': {
        const r = HA.room(drag.id);
        const q = snapPt(p, { room: r, index: drag.index });
        r.points[drag.index].x = q.x; r.points[drag.index].z = q.z;
        drag.joined.forEach(j => { j.w[j.k].x = q.x; j.w[j.k].z = q.z; });
        break;
      }
      case 'room': {
        const r = HA.room(drag.id);
        const dx = snap(p.x - drag.x), dz = snap(p.z - drag.z);
        r.points.forEach((pt, i) => { pt.x = drag.pts[i].x + dx; pt.z = drag.pts[i].z + dz; });
        drag.joined.forEach(j => { j.w[j.k].x = j.ox + dx; j.w[j.k].z = j.oz + dz; });
        break;
      }
      case 'move': {
        const f = HA.item(drag.id);
        f.x = snap(p.x - drag.dx); f.z = snap(p.z - drag.dz);
        break;
      }
      case 'rotate': {
        const f = HA.item(drag.id);
        let a = Math.atan2(-(p.x - f.x), p.z - f.z) * 180 / Math.PI;
        if (!e.shiftKey) a = Math.round(a / 15) * 15;
        f.rot = ((a % 360) + 360) % 360;
        break;
      }
      case 'wallEnd': {
        const w = HA.wall(drag.id);
        const other = drag.index ? w.a : w.b;
        let q = snapPt(p, { wallId: w.id, end: drag.index ? 'b' : 'a' });
        if (e.shiftKey) {                                   // hold Shift for 45° steps
          const dx = q.x - other.x, dz = q.z - other.z;
          const L = Math.hypot(dx, dz);
          const a = Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) * (Math.PI / 4);
          q = { x: snap(other.x + Math.cos(a) * L), z: snap(other.z + Math.sin(a) * L) };
          snapHit = null;
        }
        const end = drag.index ? w.b : w.a;
        end.x = q.x; end.z = q.z;
        drag.joined.forEach(j => { j.w[j.k].x = q.x; j.w[j.k].z = q.z; });   // joint holds
        drag.tees.forEach(j => {                    // a tee keeps its place along the wall
          j.w[j.k].x = w.a.x + (w.b.x - w.a.x) * j.t;
          j.w[j.k].z = w.a.z + (w.b.z - w.a.z) * j.t;
        });
        break;
      }
      case 'swall': {
        const w = HA.wall(drag.id);
        const dx = snap(p.x - drag.x), dz = snap(p.z - drag.z);
        w.a.x = drag.a.x + dx; w.a.z = drag.a.z + dz;
        w.b.x = drag.b.x + dx; w.b.z = drag.b.z + dz;
        drag.joined.forEach(j => { j.w[j.k].x = j.ox + dx; j.w[j.k].z = j.oz + dz; });
        break;
      }
      case 'wallOpening': {
        const w = HA.wall(drag.wallId);
        const o = w && w.openings.find(k => k.id === drag.id);
        if (!o) break;
        const f = HA.wallFrame(w);
        const g = U.seg(p.x, p.z, w.a, w.b);
        o.offset = U.clamp(snap(g.t * f.L), o.width / 2, f.L - o.width / 2);
        break;
      }
      case 'opening': {
        const r = HA.room(drag.roomId);
        const o = r.openings.find(k => k.id === drag.id);
        if (!o) break;
        let bd = Infinity, edge = o.edge, at = o.offset;
        r.points.forEach((a, k) => {
          const b = r.points[(k + 1) % r.points.length];
          const g = U.seg(p.x, p.z, a, b);
          if (g.d < bd) { bd = g.d; edge = k; at = g.t * g.len; }
        });
        o.edge = edge;
        const L = U.edgeLen(r.points, edge);
        o.offset = U.clamp(snap(at), o.width / 2 + .1, L - o.width / 2 - .1);
        HA.syncTwin(r, o);                       // drag the far side along with it
        break;
      }
    }
    if (drag.kind === 'pan') P.draw();
    else { HA.changed(false); }
    if (drag.kind === 'vertex' || drag.kind === 'room' ||
      drag.kind === 'wallEnd' || drag.kind === 'swall') HA.emit('props');
    hudCoord();
  }

  function up(e) {
    if (draft && draft.kind === 'wall') {
      const a = draft.a, b = draft.b;
      draft = null;
      snapHit = null;
      if (Math.hypot(b.x - a.x, b.z - a.z) > .5) {
        HA.snapshot();
        const w = HA.newWall(a, b);
        HA.walls().push(w);
        HA.select({ kind: 'swall', id: w.id });
        HA.changed(true);
        HA.emit('tool', 'select');
      } else P.draw();
    }
    if (draft && draft.kind === 'rect') {
      const a = draft.a, b = { x: snap(mouse.x), z: snap(mouse.z) };
      draft = null;
      if (Math.abs(b.x - a.x) > .5 && Math.abs(b.z - a.z) > .5) {
        HA.snapshot();
        const r = HA.newRoom('Room ' + (HA.rooms().length + 1), [
          { x: a.x, z: a.z }, { x: b.x, z: a.z }, { x: b.x, z: b.z }, { x: a.x, z: b.z }]);
        HA.rooms().push(r);
        HA.select({ kind: 'room', id: r.id });
        HA.changed(true);
        HA.emit('tool', 'select');
      } else P.draw();
    }
    if (drag) {
      if (drag.kind === 'vertex' || drag.kind === 'room') U.ccw(HA.room(drag.id).points);
      if (drag.kind === 'wallEnd' && snapHit) {
        HA.status(snapHit.type === 'end' ? 'Joined to the end of another wall.'
          : snapHit.type === 'wall' ? 'Joined into the face of another wall.'
            : snapHit.type === 'corner' ? 'Joined to a room corner.' : 'Joined to a room wall.');
      }
      if (drag.kind !== 'pan') HA.changed(true);
      drag = null;
      snapHit = null;
      P.draw();
    }
  }

  P.closePoly = function () {
    if (draft && draft.kind === 'poly' && draft.pts.length > 2) {
      HA.snapshot();
      const r = HA.newRoom('Room ' + (HA.rooms().length + 1), draft.pts);
      HA.rooms().push(r);
      HA.select({ kind: 'room', id: r.id });
      HA.changed(true);
      HA.emit('tool', 'select');
    }
    draft = null;
    P.draw();
  };
  P.cancelDraft = function () { draft = null; P.draw(); };

  function dbl(e) {
    const p = evPt(e);
    const h = pick(p.x, p.z);
    if (h && h.kind === 'wall') {                       // insert a corner
      const r = HA.room(h.id);
      HA.snapshot();
      const a = r.points[h.index], b = r.points[(h.index + 1) % r.points.length];
      const g = U.seg(p.x, p.z, a, b);
      r.points.splice(h.index + 1, 0, { x: snap(g.x), z: snap(g.z) });
      r.openings.forEach(o => { if (o.edge > h.index) o.edge++; });
      HA.select({ kind: 'vertex', id: r.id, index: h.index + 1 });
      HA.changed(true);
    }
  }

  function wheel(e) {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const bx = wx(mx), bz = wz(my);
    cam.s = U.clamp(cam.s * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 1.5, 90);
    cam.ox = bx - (mx - W / 2) / cam.s;
    cam.oz = bz - (my - H / 2) / cam.s;
    P.draw();
  }

  function cursorFor(h) {
    if (!h) return S.tool === 'select' ? 'default' : 'crosshair';
    if (h.kind === 'vertex' || h.kind === 'rotate' || h.kind === 'wallEnd') return 'grab';
    if (h.kind === 'furniture' || h.kind === 'opening' || h.kind === 'room' || h.kind === 'swall') return 'move';
    if (h.kind === 'wall') return S.tool === 'select' ? 'move' : 'crosshair';
    return 'default';
  }
})();
