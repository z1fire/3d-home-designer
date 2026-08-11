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

    /** 12.5 → 12' 6"  */
    ft(v) {
      const neg = v < 0; v = Math.abs(v);
      let f = Math.floor(v + 1e-6);
      let i = Math.round((v - f) * 12);
      if (i === 12) { f++; i = 0; }
      return (neg ? '-' : '') + f + "'" + (i ? ' ' + i + '"' : '');
    },
    /** "12' 6" | 12.5 | 12 6 | 150in" → 12.5 */
    parseFt(s, fallback) {
      if (typeof s === 'number') return s;
      if (!s) return fallback;
      s = String(s).trim().replace(/[’′]/g, "'").replace(/[”″]/g, '"');
      let m = s.match(/^(-?[\d.]+)\s*(?:in|")$/i);
      if (m) return parseFloat(m[1]) / 12;
      m = s.match(/^(-?[\d.]+)\s*'\s*(?:([\d.]+)\s*"?)?$/);
      if (m) return parseFloat(m[1]) + (m[2] ? parseFloat(m[2]) / 12 : 0) * (parseFloat(m[1]) < 0 ? -1 : 1);
      m = s.match(/^(-?[\d.]+)[\s-]+([\d.]+)$/);
      if (m) return parseFloat(m[1]) + parseFloat(m[2]) / 12;
      const v = parseFloat(s);
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

  HA.newOpening = function (kind, edge, offset) {
    const o = { id: U.uid('o'), kind, edge, offset, color: '#F6F6F2' };
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

  /** call BEFORE mutating the model */
  HA.snapshot = function () {
    S.undo.push(U.clone({ rooms: S.project.rooms, furniture: S.project.furniture }));
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
    S.sel = null;
    HA.emit('select', null);
    HA.changed(true);
  }
  HA.undo = function () {
    if (!S.undo.length) return HA.status('Nothing to undo');
    S.redo.push(U.clone({ rooms: S.project.rooms, furniture: S.project.furniture }));
    apply(S.undo.pop()); HA.status('Undo');
  };
  HA.redo = function () {
    if (!S.redo.length) return HA.status('Nothing to redo');
    S.undo.push(U.clone({ rooms: S.project.rooms, furniture: S.project.furniture }));
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
    p.dimMode = p.dimMode === 'inside' ? 'inside' : 'outside';
    p.rooms.forEach(r => {
      const d = HA.newRoom(r.name, r.points.length ? r.points : [{ x: 0, z: 0 }]);
      for (const k in d) if (r[k] === undefined) r[k] = d[k];
      r.ceiling = Object.assign({ type: 'flat', rise: 4, angle: 90, flat: 6 }, r.ceiling || {});
      r.wallColors = r.wallColors || {};
      if (!r.floorMat) r.floorMat = 'plank';
      r.floorAngle = r.floorAngle || 0;
      (r.openings || []).forEach(o => { o.id = o.id || U.uid('o'); });
      U.ccw(r.points);
    });
    p.furniture.forEach(f => { f.id = f.id || U.uid('f'); f.elev = f.elev || 0; });
    return p;
  };

  HA.blank = function () {
    return { name: 'Untitled home', created: Date.now(), dimMode: 'outside', rooms: [], furniture: [] };
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
