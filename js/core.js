/* core.js — units, geometry helpers, project model, undo/redo, persistence.
   All lengths are in FEET (decimal). The plan lives in the X/Z plane; Y is up. */
(function () {
  const HA = window.HA || (window.HA = {});

  /* ─────────────────────────── helpers ─────────────────────────── */
  let idc = 1;
  const U = HA.util = {
    uid(p) { return (p || 'i') + (Date.now().toString(36).slice(-4)) + (idc++).toString(36); },
    clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
    round(v, s) { return Math.round(v / s) * s; },

    /** 12.5 → 12' 6" ·  0.2917 → 3½" — rounded to the nearest eighth of an inch */
    ft(v) {
      const FR = ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞'];
      const neg = v < 0; v = Math.abs(v);
      let e = Math.round(v * 96);                     // eighths of an inch
      const f = Math.floor(e / 96); e -= f * 96;
      const i = Math.floor(e / 8); e -= i * 8;
      let s = '';
      if (f || (!i && !e)) s += f + "'";
      if (i || e) s += (s ? ' ' : '') + (i || (e ? '' : 0)) + FR[e] + '"';
      return (neg ? '-' : '') + s;
    },

    /** anything a tape measure would say: 12' 6", 12'6-1/2", 12.5, 12 6 1/2, 30", 3½" */
    parseFt(s, fallback) {
      if (typeof s === 'number') return isFinite(s) ? s : fallback;
      if (s === null || s === undefined) return fallback;
      let t = String(s).toLowerCase().trim()
        .replace(/[’′]/g, "'").replace(/[”″]/g, '"')
        .replace(/⅛/g, ' 1/8').replace(/¼/g, ' 1/4').replace(/⅜/g, ' 3/8').replace(/½/g, ' 1/2')
        .replace(/⅝/g, ' 5/8').replace(/¾/g, ' 3/4').replace(/⅞/g, ' 7/8')
        .replace(/\bfeet\b|\bfoot\b|\bft\b/g, "'").replace(/\binches\b|\binch\b|\bin\b/g, '"')
        .replace(/(\d)\s*-\s*(\d)/g, '$1 $2')          // 6-1/2 → 6 1/2
        .replace(/\s+/g, ' ').trim();
      if (!t) return fallback;

      /* "6", "6.5", "1/2", "6 1/2" → a single number */
      const num = str => {
        const parts = String(str).trim().split(' ').filter(Boolean);
        if (!parts.length) return NaN;
        let v = 0;
        for (const p of parts) {
          const fr = p.match(/^(\d+)\/(\d+)$/);
          if (fr) { v += (v < 0 ? -1 : 1) * (+fr[1] / +fr[2]); continue; }
          if (!/^-?\d*\.?\d+$/.test(p)) return NaN;
          v += parseFloat(p);
        }
        return v;
      };

      let m = t.match(/^(.*?)'\s*(.*?)"?$/);           // has a foot mark
      if (m) {
        const f = m[1].trim() ? num(m[1]) : 0, i = m[2].trim() ? num(m[2]) : 0;
        if (isFinite(f) && isFinite(i)) return f + (f < 0 ? -1 : 1) * i / 12;
      }
      m = t.match(/^(.*)"$/);                          // inches only
      if (m) { const i = num(m[1]); if (isFinite(i)) return i / 12; }

      /* no units: "12 6" and "12 6 1/2" are feet+inches; "6 1/2" is six and a half feet */
      const tk = t.split(' ').filter(Boolean);
      const isFrac = x => /^\d+\/\d+$/.test(x);
      if (tk.length === 3 && isFrac(tk[2]) && !isFrac(tk[0]) && !isFrac(tk[1])) {
        const f = num(tk[0]), i = num(tk[1] + ' ' + tk[2]);
        if (isFinite(f) && isFinite(i)) return f + (f < 0 ? -1 : 1) * i / 12;
      }
      if (tk.length === 2 && !isFrac(tk[0]) && !isFrac(tk[1])) {
        const f = num(tk[0]), i = num(tk[1]);
        if (isFinite(f) && isFinite(i)) return f + (f < 0 ? -1 : 1) * i / 12;
      }
      const v = num(t);
      return isFinite(v) ? v : fallback;
    },

    area(pts) {
      let a = 0;
      for (let i = 0, n = pts.length; i < n; i++) {
        const p = pts[i], q = pts[(i + 1) % n];
        a += p.x * q.z - q.x * p.z;
      }
      return a / 2;
    },
    /** force counter-clockwise (positive area) so interior is left of every edge */
    ccw(pts) { if (U.area(pts) < 0) pts.reverse(); return pts; },
    centroid(pts) {
      let a = 0, x = 0, z = 0;
      for (let i = 0, n = pts.length; i < n; i++) {
        const p = pts[i], q = pts[(i + 1) % n], f = p.x * q.z - q.x * p.z;
        a += f; x += (p.x + q.x) * f; z += (p.z + q.z) * f;
      }
      if (Math.abs(a) < 1e-9) {
        x = 0; z = 0; pts.forEach(p => { x += p.x; z += p.z; });
        return { x: x / pts.length, z: z / pts.length };
      }
      a *= 3; return { x: x / a, z: z / a };
    },
    bbox(pts) {
      const b = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
      pts.forEach(p => {
        b.x0 = Math.min(b.x0, p.x); b.z0 = Math.min(b.z0, p.z);
        b.x1 = Math.max(b.x1, p.x); b.z1 = Math.max(b.z1, p.z);
      });
      b.w = b.x1 - b.x0; b.d = b.z1 - b.z0;
      return b;
    },
    inPoly(pts, x, z) {
      let hit = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i], b = pts[j];
        if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) hit = !hit;
      }
      return hit;
    },
    /** distance from point to segment + parametric position */
    seg(x, z, a, b) {
      const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
      let t = L2 ? ((x - a.x) * dx + (z - a.z) * dz) / L2 : 0;
      t = U.clamp(t, 0, 1);
      const px = a.x + dx * t, pz = a.z + dz * t;
      return { t, x: px, z: pz, d: Math.hypot(x - px, z - pz), len: Math.sqrt(L2) };
    },
    edgeLen(pts, i) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      return Math.hypot(b.x - a.x, b.z - a.z);
    },
    /** true when the corner at vertex i turns inward (reflex) */
    reflex(pts, i) {
      const n = pts.length, p = pts[(i - 1 + n) % n], c = pts[i], q = pts[(i + 1) % n];
      return ((c.x - p.x) * (q.z - c.z) - (c.z - p.z) * (q.x - c.x)) < 0;
    },
    /** mitred inward offset of a CCW polygon — the inside face of the walls */
    inset(pts, t) {
      const n = pts.length, out = [];
      if (!t) return pts.map(p => ({ x: p.x, z: p.z }));
      for (let i = 0; i < n; i++) {
        const p = pts[i], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
        const l1 = Math.hypot(p.x - a.x, p.z - a.z) || 1;
        const l2 = Math.hypot(b.x - p.x, b.z - p.z) || 1;
        const n1 = { x: -(p.z - a.z) / l1, z: (p.x - a.x) / l1 };   // inward normals
        const n2 = { x: -(b.z - p.z) / l2, z: (b.x - p.x) / l2 };
        let mx = n1.x + n2.x, mz = n1.z + n2.z;
        const den = 1 + (n1.x * n2.x + n1.z * n2.z);
        if (Math.abs(den) < 1e-6) { mx = n1.x; mz = n1.z; }          // doubled-back edge
        else { mx /= den; mz /= den; }
        out.push({ x: p.x + mx * t, z: p.z + mz * t });
      }
      return out;
    },
    clone(o) { return JSON.parse(JSON.stringify(o)); }
  };

  /* ─────────────────────────── palette ─────────────────────────── */
  HA.palette = [
    ['Alabaster', '#EDEAE0'], ['Chantilly Lace', '#F6F6F2'], ['Swiss Coffee', '#E4E1D8'],
    ['Accessible Beige', '#D6C9B4'], ['Repose Gray', '#CAC6BD'], ['Mindful Gray', '#B6B0A6'],
    ['Chelsea Gray', '#8B867C'], ['Iron Ore', '#43464A'], ['Tricorn Black', '#1F2123'],
    ['Sea Salt', '#CFDBD4'], ['Palladian Blue', '#B4CFCC'], ['Rainwashed', '#C6D8D6'],
    ['Naval', '#2B3B4C'], ['Hale Navy', '#3A4655'], ['Denim', '#5A7391'],
    ['Sage', '#A6B48D'], ['Evergreen Fog', '#95978A'], ['Clary Sage', '#B7B69C'],
    ['Pewter Green', '#5A6152'], ['Forest', '#39493D'], ['Olive', '#7C7A4F'],
    ['Blush', '#E7CFC6'], ['Terracotta', '#C57B58'], ['Cinnamon', '#9A5B3D'],
    ['Marigold', '#D9A441'], ['Cranberry', '#7C2F3B'], ['Plum', '#5B4258'],
    ['Oak Floor', '#B98A5A'], ['Walnut Floor', '#8B5E3C'], ['Ash Floor', '#C9A87C'],
    ['Gray Wash', '#A9A49C'], ['Porcelain Tile', '#D9D6CF'], ['Slate Tile', '#7E8486'],
    ['Wool Carpet', '#BCB4A6'], ['Concrete', '#9A9A98'], ['Ceiling White', '#F4F3EF']
  ];

  /* ─────────────────────────── model ─────────────────────────── */
  HA.defaults = {
    wallHeight: 8, wallThickness: 0.5,
    wallColor: '#E4E1D8', floorColor: '#B98A5A', ceilColor: '#F4F3EF', trimColor: '#F6F6F2'
  };

  HA.newRoom = function (name, pts, opt) {
    const d = HA.defaults;
    return Object.assign({
      id: U.uid('r'), name: name || 'Room',
      points: U.ccw(pts.map(p => ({ x: p.x, z: p.z }))),
      wallHeight: d.wallHeight, wallThickness: d.wallThickness,
      ceiling: { type: 'flat', rise: 4, angle: 90, flat: 6 },
      floorColor: d.floorColor, floorMat: 'plank', floorAngle: 0,
      ceilColor: d.ceilColor, trimColor: d.trimColor,
      wallColor: d.wallColor, wallColors: {},   // per-edge overrides, keyed by edge index
      baseboard: true, crown: false,
      openings: []
    }, opt || {});
  };

  /** a free-standing wall: a partition that isn't part of any room outline.
      Unlike room walls it is centred on its line, and it has two finished faces. */
  HA.newWall = function (a, b, opt) {
    const d = HA.defaults;
    return Object.assign({
      id: U.uid('w'),
      a: { x: a.x, z: a.z }, b: { x: b.x, z: b.z },
      thickness: 5 / 12, height: d.wallHeight,
      color: d.wallColor, trimColor: d.trimColor,
      baseboard: true, openings: []
    }, opt || {});
  };
  HA.walls = () => S.project.walls || (S.project.walls = []);
  HA.wall = id => HA.walls().find(w => w.id === id);
  HA.wallLen = w => Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z);
  HA.wallAngle = w => Math.atan2(w.b.z - w.a.z, w.b.x - w.a.x) * 180 / Math.PI;
  /** unit vector along the wall and the normal to one face */
  HA.wallFrame = function (w) {
    const L = HA.wallLen(w) || 1;
    const ex = { x: (w.b.x - w.a.x) / L, z: (w.b.z - w.a.z) / L };
    return { L: L, ex: ex, n: { x: -ex.z, z: ex.x }, t: w.thickness };
  };

  /* ── wall joints ──
     Walls are joined simply by sharing a point. These find what is attached to
     what so a joint survives dragging either piece. */

  /** free-wall ends sitting on a point */
  HA.wallEndsAt = function (x, z, skipId, tol) {
    tol = tol || .06;
    const out = [];
    HA.walls().forEach(w => {
      if (skipId && w.id === skipId) return;
      ['a', 'b'].forEach(k => {
        if (Math.hypot(w[k].x - x, w[k].z - z) <= tol) out.push({ w: w, k: k, ox: w[k].x, oz: w[k].z });
      });
    });
    return out;
  };

  /** other walls tee'd into the run of this one, with how far along they sit */
  HA.wallTeesOn = function (w, tol) {
    tol = tol || .06;
    const out = [];
    HA.walls().forEach(o => {
      if (o.id === w.id) return;
      ['a', 'b'].forEach(k => {
        const q = o[k], g = U.seg(q.x, q.z, w.a, w.b);
        if (g.d <= tol && g.t > .001 && g.t < .999)      // ends-meeting is a different case
          out.push({ w: o, k: k, t: g.t, ox: q.x, oz: q.z });
      });
    });
    return out;
  };

  /** free-wall ends landing anywhere on a room's outline (corner or mid-wall) */
  HA.wallEndsOnRoom = function (room, tol) {
    tol = tol || .06;
    const out = [];
    HA.walls().forEach(w => {
      ['a', 'b'].forEach(k => {
        const q = w[k];
        let d = Infinity;
        room.points.forEach((a, i) => {
          const b = room.points[(i + 1) % room.points.length];
          d = Math.min(d, U.seg(q.x, q.z, a, b).d);
        });
        if (d <= tol) out.push({ w: w, k: k, ox: q.x, oz: q.z });
      });
    });
    return out;
  };

  /** default casing (trim) width — 3½", the common ranch/colonial size */
  HA.CASING = 3.5 / 12;
  HA.casingOf = o => (o.casing === undefined || o.casing === null ? HA.CASING : o.casing);

  HA.newOpening = function (kind, edge, offset) {
    const o = { id: U.uid('o'), kind, edge, offset, color: '#F6F6F2', casing: HA.CASING };
    if (kind === 'door') { o.width = 3; o.height = 6.75; o.sill = 0; o.swing = 1; }
    else if (kind === 'window') { o.width = 3.5; o.height = 4; o.sill = 2.5; }
    else { o.width = 5; o.height = 7; o.sill = 0; }          // cased opening
    return o;
  };

  /* ─────────────────────────── project state ─────────────────────────── */
  const S = HA.state = {
    project: null,
    sel: null,               // {kind:'room'|'vertex'|'opening'|'furniture'|'wall', id, index}
    tool: 'select',
    paintColor: '#E4E1D8',
    paintName: 'Swiss Coffee',
    placing: null,           // catalog id armed for placement
    undo: [], redo: [],
    listeners: {}
  };

  HA.on = function (ev, fn) { (S.listeners[ev] || (S.listeners[ev] = [])).push(fn); };
  HA.emit = function (ev, arg) { (S.listeners[ev] || []).forEach(f => f(arg)); };

  HA.rooms = () => S.project.rooms;
  HA.furn = () => S.project.furniture;
  HA.room = id => S.project.rooms.find(r => r.id === id);
  HA.item = id => S.project.furniture.find(f => f.id === id);

  /* ── dimensions ──
     Rooms are drawn as the OUTSIDE face of their walls and the walls build inward,
     so the finished room is the polygon inset by the wall thickness. `dimMode`
     decides which of the two every dimension in the app reports. */

  HA.insideMode = () => S.project && S.project.dimMode === 'inside';

  /** {pts, w, d, area, inside} for the room, in whichever mode is active */
  HA.dims = function (r) {
    const inside = HA.insideMode();
    const pts = inside ? U.inset(r.points, r.wallThickness || 0) : r.points;
    const b = U.bbox(pts);
    return {
      pts: pts, inside: inside,
      w: Math.max(0, b.w), d: Math.max(0, b.d),
      area: Math.max(0, U.area(pts))
    };
  };

  /** where one wall's inside face starts and ends, measured along the outside edge */
  HA.edgeRef = function (r, i) {
    const n = r.points.length;
    const a = r.points[i], b = r.points[(i + 1) % n];
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const ex = { x: (b.x - a.x) / L, z: (b.z - a.z) / L };
    if (!HA.insideMode()) return { s0: 0, s1: L, L: L, len: L };
    const ins = U.inset(r.points, r.wallThickness || 0);
    const p0 = ins[i], p1 = ins[(i + 1) % n];
    const s0 = (p0.x - a.x) * ex.x + (p0.z - a.z) * ex.z;
    const s1 = (p1.x - a.x) * ex.x + (p1.z - a.z) * ex.z;
    return { s0: s0, s1: s1, L: L, len: Math.max(0, s1 - s0) };
  };

  /* ── shared walls ──
     Every room owns its own wall skins, so where two rooms back onto each other
     there are two. An opening has to be cut through both or you get a hole that
     leads into a wall, so openings on a shared wall are kept as a linked pair. */

  /** the wall on the other side of (room, edge), if another room backs onto it */
  HA.twinFor = function (room, edge, rooms) {
    const n = room.points.length;
    const a = room.points[edge], b = room.points[(edge + 1) % n];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < .1) return null;
    const ex = { x: (b.x - a.x) / L, z: (b.z - a.z) / L };
    let found = null;
    (rooms || S.project.rooms).forEach(r2 => {
      if (r2.id === room.id || found) return;
      const m = r2.points.length;
      for (let j = 0; j < m; j++) {
        const c = r2.points[j], d = r2.points[(j + 1) % m];
        const L2 = Math.hypot(d.x - c.x, d.z - c.z);
        if (L2 < .1) continue;
        const ex2 = { x: (d.x - c.x) / L2, z: (d.z - c.z) / L2 };
        if (ex.x * ex2.x + ex.z * ex2.z > -0.999) continue;          // must run the other way
        const perp = Math.abs((c.x - a.x) * -ex.z + (c.z - a.z) * ex.x);
        const gap = room.wallThickness + r2.wallThickness + .1;
        if (perp > gap) continue;                                     // must be the same line
        const t0 = (c.x - a.x) * ex.x + (c.z - a.z) * ex.z;
        const t1 = (d.x - a.x) * ex.x + (d.z - a.z) * ex.z;
        if (Math.max(t0, t1) < .3 || Math.min(t0, t1) > L - .3) continue;   // must overlap
        found = { room: r2, edge: j, a: a, ex: ex, c: c, ex2: ex2 };
        return;
      }
    });
    return found;
  };

  /** a position along one edge, expressed along its twin (they run opposite ways) */
  function twinOffset(t, u) {
    const px = t.a.x + t.ex.x * u, pz = t.a.z + t.ex.z * u;
    return (px - t.c.x) * t.ex2.x + (pz - t.c.z) * t.ex2.z;
  }

  HA.twinOf = function (o) {
    if (!o || !o.pair) return null;
    const r = HA.room(o.pair.roomId);
    if (!r) return null;
    const tw = (r.openings || []).find(x => x.id === o.pair.id);
    return tw ? { room: r, opening: tw } : null;
  };

  /** create or refresh the matching opening on the far side of a shared wall */
  HA.syncTwin = function (room, o) {
    const t = HA.twinFor(room, o.edge);
    const existing = HA.twinOf(o);
    if (!t) {                                   // wall is no longer shared
      if (existing) { existing.opening.pair = null; o.pair = null; }
      return null;
    }
    let tw = existing && existing.room.id === t.room.id ? existing.opening : null;
    if (!tw) {
      if (existing) existing.opening.pair = null;
      tw = HA.newOpening(o.kind, t.edge, 0);
      t.room.openings.push(tw);
      o.pair = { roomId: t.room.id, id: tw.id };
      tw.pair = { roomId: room.id, id: o.id };
    }
    tw.edge = t.edge;
    tw.kind = o.kind; tw.width = o.width; tw.height = o.height; tw.sill = o.sill;
    tw.casing = o.casing; tw.color = o.color;
    tw.swing = o.swing === -1 ? 1 : -1;         // hinged from the same jamb, seen from the far side
    tw.offset = twinOffset(t, o.offset);
    return tw;
  };

  /** remove an opening and its twin */
  HA.dropOpening = function (room, o) {
    const tw = HA.twinOf(o);
    if (tw) tw.room.openings = tw.room.openings.filter(x => x.id !== tw.opening.id);
    room.openings = room.openings.filter(x => x.id !== o.id);
  };

  /** room whose polygon contains this point (last one wins = topmost) */
  HA.roomAt = function (x, z) {
    const rs = S.project.rooms;
    for (let i = rs.length - 1; i >= 0; i--) if (U.inPoly(rs[i].points, x, z)) return rs[i];
    return null;
  };

  HA.select = function (sel) {
    S.sel = sel;
    HA.emit('select', sel);
    HA.emit('redraw');
  };

  function shot() {
    return U.clone({ rooms: S.project.rooms, furniture: S.project.furniture, walls: HA.walls() });
  }

  /** call BEFORE mutating the model */
  HA.snapshot = function () {
    S.undo.push(shot());
    if (S.undo.length > 60) S.undo.shift();
    S.redo.length = 0;
  };

  HA.changed = function (structural) {
    S.project.modified = Date.now();
    HA.save();
    HA.emit('change', structural !== false);
    HA.emit('redraw');
  };

  function apply(snap) {
    S.project.rooms = snap.rooms;
    S.project.furniture = snap.furniture;
    S.project.walls = snap.walls || [];
    S.sel = null;
    HA.emit('select', null);
    HA.changed(true);
  }
  HA.undo = function () {
    if (!S.undo.length) return HA.status('Nothing to undo');
    S.redo.push(shot());
    apply(S.undo.pop()); HA.status('Undo');
  };
  HA.redo = function () {
    if (!S.redo.length) return HA.status('Nothing to redo');
    S.undo.push(shot());
    apply(S.redo.pop()); HA.status('Redo');
  };

  HA.status = function (msg) {
    const el = document.getElementById('statusMsg');
    if (el) el.textContent = msg;
  };

  /* ─────────────────────────── persistence ─────────────────────────── */
  const KEY = 'designoffice.project.v1';
  let saveTimer = null;
  HA.save = function () {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(S.project)); } catch (e) { /* quota */ }
    }, 400);
  };
  HA.load = function () {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return HA.migrate(JSON.parse(raw));
    } catch (e) { }
    return null;
  };
  /** fill in anything an older/hand-edited file is missing */
  HA.migrate = function (p) {
    if (!p || !Array.isArray(p.rooms)) return null;
    p.furniture = p.furniture || [];
    p.walls = p.walls || [];
    p.dimMode = p.dimMode === 'inside' ? 'inside' : 'outside';
    p.walls.forEach(w => {
      const d = HA.newWall(w.a || { x: 0, z: 0 }, w.b || { x: 1, z: 0 });
      for (const k in d) if (w[k] === undefined) w[k] = d[k];
      (w.openings || []).forEach(o => {
        o.id = o.id || U.uid('o');
        if (o.casing === undefined) o.casing = HA.CASING;
      });
    });
    p.rooms.forEach(r => {
      const d = HA.newRoom(r.name, r.points.length ? r.points : [{ x: 0, z: 0 }]);
      for (const k in d) if (r[k] === undefined) r[k] = d[k];
      r.ceiling = Object.assign({ type: 'flat', rise: 4, angle: 90, flat: 6 }, r.ceiling || {});
      r.wallColors = r.wallColors || {};
      if (!r.floorMat) r.floorMat = 'plank';
      r.floorAngle = r.floorAngle || 0;
      (r.openings || []).forEach(o => {
        o.id = o.id || U.uid('o');
        if (o.casing === undefined) o.casing = HA.CASING;
      });
      U.ccw(r.points);
    });
    p.furniture.forEach(f => { f.id = f.id || U.uid('f'); f.elev = f.elev || 0; });

    /* link up openings that already line up across a shared wall */
    p.rooms.forEach(r => {
      (r.openings || []).forEach(o => {
        if (o.pair) return;
        const t = HA.twinFor(r, o.edge, p.rooms);
        if (!t) return;
        const want = twinOffset(t, o.offset);
        const match = (t.room.openings || []).find(x =>
          !x.pair && x.edge === t.edge && Math.abs(x.offset - want) < .6 && Math.abs(x.width - o.width) < 1.5);
        if (match) {
          o.pair = { roomId: t.room.id, id: match.id };
          match.pair = { roomId: r.id, id: o.id };
        }
      });
    });
    return p;
  };

  HA.blank = function () {
    return { name: 'Untitled home', created: Date.now(), dimMode: 'outside', rooms: [], furniture: [], walls: [] };
  };

  /* ─────────────────────────── sample home ─────────────────────────── */
  HA.sample = function () {
    const p = HA.blank();
    p.name = 'Sample home';
    const R = (n, x0, z0, x1, z1, o) => {
      const r = HA.newRoom(n, [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }], o);
      p.rooms.push(r); return r;
    };

    const living = R('Living Room', 0, 0, 22, 16, {
      wallHeight: 8, floorColor: '#B98A5A', wallColor: '#E4E1D8',
      floorMat: 'plank', floorAngle: 0,
      ceiling: { type: 'gable', rise: 5, angle: 90 }
    });
    living.openings.push(
      Object.assign(HA.newOpening('door', 0, 5), { width: 3.2, height: 6.9 }),
      Object.assign(HA.newOpening('window', 0, 14), { width: 5, height: 4.5, sill: 2.2 }),
      Object.assign(HA.newOpening('window', 3, 8), { width: 4, height: 4.5, sill: 2.2 }),
      Object.assign(HA.newOpening('opening', 1, 11), { width: 7, height: 7.2 })
    );

    const kitchen = R('Kitchen', 22, 0, 36, 16, {
      wallHeight: 8, floorColor: '#D9D6CF', wallColor: '#CFDBD4',
      floorMat: 'tile12',
      ceiling: { type: 'flat' }
    });
    kitchen.openings.push(
      Object.assign(HA.newOpening('window', 1, 8), { width: 4, height: 3.5, sill: 3.6 }),
      Object.assign(HA.newOpening('opening', 3, 5), { width: 7, height: 7.2 })
    );

    const bed = R('Primary Bedroom', 0, 16, 18, 30, {
      wallHeight: 8, floorColor: '#BCB4A6', wallColor: '#B4CFCC',
      floorMat: 'carpet',
      ceiling: { type: 'shed', rise: 3.5, angle: 90 }
    });
    bed.openings.push(
      Object.assign(HA.newOpening('window', 2, 9), { width: 6, height: 4.5, sill: 2.4 }),
      Object.assign(HA.newOpening('door', 0, 15), { width: 3 })
    );

    const bath = R('Bath', 18, 16, 28, 24, {
      wallHeight: 8, floorColor: '#D9D6CF', wallColor: '#95978A',
      floorMat: 'mosaic',
      ceiling: { type: 'flat' }
    });
    bath.openings.push(
      Object.assign(HA.newOpening('door', 3, 6), { width: 2.7 }),
      Object.assign(HA.newOpening('window', 1, 4), { width: 2.5, height: 3, sill: 4 })
    );

    const F = (t, x, z, rot, extra) => {
      const it = HA.furniture.make(t, x, z, rot);
      if (it) { Object.assign(it, extra || {}); p.furniture.push(it); }
    };
    // living
    F('rug', 11, 7, 0, { w: 12, d: 9 });
    F('sofa', 11, 3.5, 0);
    F('armchair', 4.5, 8, 70);
    F('armchair', 17.5, 8, -70);
    F('coffeeTable', 11, 7, 0);
    F('tvStand', 11, 14.8, 180);
    F('tv', 11, 15.3, 180, { elev: 3.4 });
    F('bookshelf', 20.9, 12, -90);
    F('floorLamp', 2.5, 2.5, 0);
    F('plant', 20, 2.5, 0);
    F('ceilingFan', 11, 8, 0);
    // kitchen
    F('counter', 25.5, 1.5, 0, { w: 6 });
    F('range', 30, 1.5, 0);
    F('counter', 33.5, 1.5, 0, { w: 3.5 });
    F('fridge', 34.2, 4.5, -90);
    F('island', 28, 8, 0, { w: 8, d: 3.5 });
    F('barStool', 26, 10.4, 180); F('barStool', 28, 10.4, 180); F('barStool', 30, 10.4, 180);
    F('diningTable', 28.5, 13, 0);
    F('pendant', 28, 8, 0);
    // bedroom
    F('bedQueen', 9, 20, 0);
    F('nightstand', 5.2, 17.4, 0); F('nightstand', 12.8, 17.4, 0);
    F('dresser', 1.4, 26, 90);
    F('rug', 9, 23.5, 0, { w: 10, d: 8 });
    // bath
    F('vanity', 20.6, 17.5, 0);
    F('toilet', 26.5, 17.8, 0);
    F('bathtub', 23, 22.2, 180);
    return p;
  };
})();
