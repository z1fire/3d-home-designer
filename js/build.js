/* build.js — turns the project model into three.js geometry:
   walls with real openings, floors, and flat / vaulted / shed / barrel / tray ceilings. */
(function () {
  const HA = window.HA, U = HA.util;
  const B = HA.build = {};
  const UP = new THREE.Vector3(0, 1, 0);

  /* ─────────── ceiling height field ─────────── */
  /** pre-compute the projection range used by every sloped ceiling type */
  B.ceilInfo = function (room) {
    const a = ((room.ceiling && room.ceiling.angle) || 0) * Math.PI / 180;
    const nx = Math.cos(a), nz = Math.sin(a);
    let min = Infinity, max = -Infinity;
    room.points.forEach(p => {
      const d = p.x * nx + p.z * nz;
      if (d < min) min = d; if (d > max) max = d;
    });
    return { nx, nz, min, max, span: Math.max(.001, max - min) };
  };

  /** ceiling height (ft above floor) at a plan point */
  B.ceilingH = function (room, x, z, info) {
    const c = room.ceiling || { type: 'flat' };
    const base = room.wallHeight;
    if (c.type === 'flat' || !c.rise) return base;
    info = info || B.ceilInfo(room);
    let t = ((x * info.nx + z * info.nz) - info.min) / info.span;
    t = U.clamp(t, 0, 1);
    const rise = c.rise;
    switch (c.type) {
      case 'shed': return base + rise * t;
      case 'gable': return base + rise * (1 - Math.abs(2 * t - 1));
      case 'flattop': {                       // vault that levels off into a flat centre
        const f = U.clamp((c.flat || 0) / info.span, 0, .96);
        const run = (1 - f) / 2;              // sloped fraction on each side
        if (run < 1e-5) return base + rise;
        return base + rise * U.clamp(Math.min(t, 1 - t) / run, 0, 1);
      }
      case 'barrel': return base + rise * Math.sqrt(Math.max(0, 1 - Math.pow(2 * t - 1, 2)));
      case 'tray': {
        const m = .1, ramp = .03;
        if (t < m || t > 1 - m) return base;
        if (t < m + ramp) return base + rise * (t - m) / ramp;
        if (t > 1 - m - ramp) return base + rise * (1 - m - t) / ramp;
        return base + rise;
      }
    }
    return base;
  };

  /** tallest point of the room (for camera framing / opening limits) */
  B.peakH = function (room) {
    const c = room.ceiling || {};
    return room.wallHeight + (c.type && c.type !== 'flat' ? (c.rise || 0) : 0);
  };

  /* ─────────── ceiling mesh ─────────── */
  function tessellate(pts, levels) {
    const contour = pts.map(p => new THREE.Vector2(p.x, p.z));
    let tris;
    try { tris = THREE.ShapeUtils.triangulateShape(contour, []); }
    catch (e) { tris = []; }
    let verts = pts.map(p => ({ x: p.x, z: p.z }));
    for (let l = 0; l < levels; l++) {
      const mid = new Map(), out = [];
      const gm = (a, b) => {
        const k = a < b ? a + ':' + b : b + ':' + a;
        let i = mid.get(k);
        if (i === undefined) {
          i = verts.length;
          verts.push({ x: (verts[a].x + verts[b].x) / 2, z: (verts[a].z + verts[b].z) / 2 });
          mid.set(k, i);
        }
        return i;
      };
      for (const t of tris) {
        const a = t[0], b = t[1], c = t[2];
        const ab = gm(a, b), bc = gm(b, c), ca = gm(c, a);
        out.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
      }
      tris = out;
      if (tris.length > 20000) break;
    }
    return { verts, tris };
  }

  function ceilingMesh(room) {
    const flat = !room.ceiling || room.ceiling.type === 'flat' || !room.ceiling.rise;
    const bb = U.bbox(room.points);
    let levels = 0;
    if (!flat) {
      const big = Math.max(bb.w, bb.d);
      levels = U.clamp(Math.ceil(Math.log2(big / 1.2)), 1, 4);
    }
    const { verts, tris } = tessellate(room.points, levels);
    if (!tris.length) return null;
    const info = B.ceilInfo(room);
    const pos = new Float32Array(verts.length * 3);
    verts.forEach((v, i) => {
      pos[i * 3] = v.x;
      pos[i * 3 + 1] = flat ? room.wallHeight : B.ceilingH(room, v.x, v.z, info);
      pos[i * 3 + 2] = v.z;
    });
    const idx = [];
    tris.forEach(t => idx.push(t[0], t[1], t[2]));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: new THREE.Color(room.ceilColor), roughness: .95, side: THREE.DoubleSide
    }));
    m.receiveShadow = true;
    m.userData = { kind: 'ceiling', roomId: room.id };
    return m;
  }

  /* ─────────── floor ─────────── */
  function floorMesh(room) {
    const shape = new THREE.Shape(room.points.map(p => new THREE.Vector2(p.x, -p.z)));
    const geo = new THREE.ShapeGeometry(shape);   // UVs come out in world feet
    geo.rotateX(-Math.PI / 2);
    const kind = room.floorMat || 'solid';
    const map = HA.tex.floor(kind, room.floorColor, room.floorAngle || 0);
    const fin = HA.tex.finish[kind] || HA.tex.finish.solid;
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: new THREE.Color(map ? '#ffffff' : room.floorColor),
      map: map, roughness: fin.roughness, metalness: fin.metalness
    }));
    m.position.y = 0.005;
    m.receiveShadow = true;
    m.userData = { kind: 'floor', roomId: room.id };
    return m;
  }

  /* ─────────── one wall (edge i) ─────────── */
  function wallGroup(room, i) {
    const pts = room.points, n = pts.length;
    const p0 = pts[i], p1 = pts[(i + 1) % n];
    const dx = p1.x - p0.x, dz = p1.z - p0.z;
    const L = Math.hypot(dx, dz);
    if (L < .05) return null;
    const t = room.wallThickness;
    const ex = new THREE.Vector3(dx / L, 0, dz / L);
    const inw = new THREE.Vector3(-dz / L, 0, dx / L);        // interior side
    const e0 = U.reflex(pts, i) ? t : 0.004;
    const e1 = U.reflex(pts, (i + 1) % n) ? t : 0.004;
    const info = B.ceilInfo(room);

    // top profile: highest of outer-face and inner-face ceiling height so no gaps appear
    const topAt = u => {
      const ox = p0.x + ex.x * u, oz = p0.z + ex.z * u;
      const a = B.ceilingH(room, ox, oz, info);
      const b = B.ceilingH(room, ox + inw.x * t, oz + inw.z * t, info);
      return Math.max(a, b) + .01;
    };

    const shape = new THREE.Shape();
    shape.moveTo(-e0, 0);
    shape.lineTo(L + e1, 0);
    const flat = !room.ceiling || room.ceiling.type === 'flat' || !room.ceiling.rise;
    const steps = flat ? 1 : Math.max(2, Math.ceil(L / .5));
    for (let s = steps; s >= 0; s--) {
      const u = -e0 + (L + e0 + e1) * (s / steps);
      shape.lineTo(u, topAt(u));
    }
    shape.lineTo(-e0, 0);

    const wallTopMin = Math.min(topAt(0), topAt(L)) ;
    const ops = (room.openings || []).filter(o => o.edge === i && o.offset > -1 && o.offset < L + 1);
    ops.forEach(o => {
      const w = Math.min(o.width, L - .2);
      const u0 = U.clamp(o.offset - w / 2, .05, L - .1);
      const u1 = U.clamp(o.offset + w / 2, u0 + .2, L - .05);
      const y0 = Math.max(0, o.sill);
      const y1 = Math.min(y0 + o.height, Math.min(topAt(u0), topAt(u1)) - .2);
      if (y1 <= y0 + .1) return;
      o._u0 = u0; o._u1 = u1; o._y0 = y0; o._y1 = y1;
      const h = new THREE.Path();
      h.moveTo(u0, y0); h.lineTo(u1, y0); h.lineTo(u1, y1); h.lineTo(u0, y1); h.lineTo(u0, y0);
      shape.holes.push(h);
    });

    const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 2 });
    const faceMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(room.wallColors[i] || room.wallColor), roughness: .93
    });
    const sideMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(room.trimColor || '#F6F6F2'), roughness: .8
    });
    const mesh = new THREE.Mesh(geo, [faceMat, sideMat]);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData = { kind: 'wall', roomId: room.id, edge: i };

    const g = new THREE.Group();
    g.add(mesh);

    /* baseboard, split around anything that meets the floor */
    if (room.baseboard) {
      const cuts = ops.filter(o => o._y0 !== undefined && o._y0 < .1)
        .map(o => [o._u0 - .06, o._u1 + .06]).sort((a, b) => a[0] - b[0]);
      let u = 0;
      const bbMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(room.trimColor || '#F6F6F2'), roughness: .7 });
      const add = (a, b) => {
        if (b - a < .1) return;
        const m = new THREE.Mesh(new THREE.BoxGeometry(b - a, .48, .06), bbMat);
        m.position.set((a + b) / 2, .24, t + .03);
        m.castShadow = false; m.receiveShadow = true;
        g.add(m);
      };
      cuts.forEach(c => { add(u, Math.max(u, c[0])); u = Math.max(u, c[1]); });
      add(u, L);
    }

    /* crown, only where the ceiling is flat */
    if (room.crown && flat) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(L, .38, .28),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(room.trimColor || '#F6F6F2'), roughness: .7 }));
      m.position.set(L / 2, room.wallHeight - .19, t + .14);
      g.add(m);
    }

    /* doors, windows, casing */
    ops.forEach(o => {
      if (o._y0 === undefined) return;
      buildOpening(g, room, o, t);
    });

    const M = new THREE.Matrix4().makeBasis(ex, UP, inw).setPosition(p0.x, 0, p0.z);
    g.applyMatrix4(M);
    g.userData = {
      kind: 'wallGroup', roomId: room.id, edge: i,
      outward: inw.clone().negate(),
      mid: new THREE.Vector3(p0.x + dx / 2, wallTopMin / 2, p0.z + dz / 2)
    };
    return g;
  }

  function buildOpening(g, room, o, t) {
    const w = o._u1 - o._u0, h = o._y1 - o._y0, cx = (o._u0 + o._u1) / 2;
    const trim = new THREE.MeshStandardMaterial({ color: new THREE.Color(o.color || '#F6F6F2'), roughness: .65 });
    const box = (bw, bh, bd, x, y, z, mtl) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mtl || trim);
      m.position.set(x, y, z); m.castShadow = false; m.receiveShadow = true;
      g.add(m); return m;
    };

    /* no casing: line the reveal in the wall colour, the way a drywall return reads */
    if (HA.casingOf(o) < .02) {
      const wallMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(room.wallColors[o.edge] || room.wallColor), roughness: .93
      });
      const e = .012;
      box(e, h, t, o._u0 + e / 2, o._y0 + h / 2, t / 2, wallMat);
      box(e, h, t, o._u1 - e / 2, o._y0 + h / 2, t / 2, wallMat);
      box(w, e, t, cx, o._y1 - e / 2, t / 2, wallMat);
      if (o._y0 > .05 && o.kind !== 'window') box(w, e, t, cx, o._y0 + e / 2, t / 2, wallMat);
    }

    if (o.kind === 'window') {
      const glass = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#BFD8DE'), transparent: true, opacity: .3,
        roughness: .05, metalness: .2, side: THREE.DoubleSide
      });
      box(w - .1, h - .1, .04, cx, o._y0 + h / 2, t / 2, glass);
      box(.1, h, .12, o._u0 + .05, o._y0 + h / 2, t / 2);          // jambs
      box(.1, h, .12, o._u1 - .05, o._y0 + h / 2, t / 2);
      box(w, .1, .12, cx, o._y1 - .05, t / 2);                      // head
      box(w, .1, .12, cx, o._y0 + .05, t / 2);
      box(w, .06, .3, cx, o._y0 + .05, t + .1);                     // interior sill
      if (h > 2.6) box(w - .2, .06, .1, cx, o._y0 + h / 2, t / 2);  // muntin
      box(.06, h - .2, .1, cx, o._y0 + h / 2, t / 2);
      casing(box, o, w, h, cx, t, true);
    } else {
      casing(box, o, w, h, cx, t, true);
      if (o.kind === 'door') {
        const hinge = new THREE.Group();
        const swing = o.swing === -1 ? -1 : 1;
        const slab = new THREE.Mesh(new THREE.BoxGeometry(w - .06, h - .06, .14),
          new THREE.MeshStandardMaterial({ color: new THREE.Color(o.color || '#F6F6F2'), roughness: .6 }));
        slab.position.set(swing * (w - .06) / 2, 0, 0);
        slab.castShadow = true;
        const knob = new THREE.Mesh(new THREE.SphereGeometry(.09, 10, 8),
          new THREE.MeshStandardMaterial({ color: new THREE.Color('#B7A16A'), metalness: .8, roughness: .3 }));
        knob.position.set(swing * (w - .35), 0, .12);
        hinge.add(slab, knob);
        hinge.position.set(cx - swing * w / 2, o._y0 + h / 2, t + .07);
        hinge.rotation.y = swing * -1.25;                            // stands ~72° open
        g.add(hinge);
      }
    }
  }

  function casing(box, o, w, h, cx, t, inside) {
    const cw = HA.casingOf(o);
    if (cw < .02) return;                                            // trimless / drywall return
    const z = t + .03;
    box(w + cw * 2, cw, .06, cx, o._y1 + cw / 2, z);
    box(cw, h + cw, .06, o._u0 - cw / 2, o._y0 + (h + cw) / 2 - cw / 2, z);
    box(cw, h + cw, .06, o._u1 + cw / 2, o._y0 + (h + cw) / 2 - cw / 2, z);
    box(w + cw * 2, cw, .06, cx, o._y1 + cw / 2, -.03);              // exterior side
  }

  /* ─────────── free-standing partition wall ─────────── */

  /** How far to run an end past its point so a joint builds solid instead of
      leaving a notch. For two walls meeting at a corner, each has to reach the
      other's far face: half the other's thickness × tan(half the turn). Held a
      hair short so the end cap stays buried and can't z-fight that face. */
  function jointRun(w, endKey) {
    const f = HA.wallFrame(w), p = w[endKey];
    const toward = endKey === 'b' ? f.ex : { x: -f.ex.x, z: -f.ex.z };
    let run = 0;
    HA.walls().forEach(o => {
      if (o.id === w.id) return;
      ['a', 'b'].forEach(k => {
        if (Math.hypot(o[k].x - p.x, o[k].z - p.z) > .06) return;     // not this joint
        const fo = HA.wallFrame(o);
        const away = k === 'a' ? fo.ex : { x: -fo.ex.x, z: -fo.ex.z };
        const turn = Math.acos(U.clamp(toward.x * away.x + toward.z * away.z, -1, 1));
        const e = (o.thickness / 2) * Math.tan(Math.min(turn, 2.6) / 2);
        run = Math.max(run, U.clamp(e, 0, o.thickness * 3));
      });
    });
    return Math.max(0, run - .01);
  }

  B.jointRun = jointRun;

  B.freeWall = function (w) {
    const f = HA.wallFrame(w);
    if (f.L < .1) return null;
    const t = w.thickness;
    const e0 = jointRun(w, 'a'), e1 = jointRun(w, 'b');
    const ex = new THREE.Vector3(f.ex.x, 0, f.ex.z);
    const nz = new THREE.Vector3(f.n.x, 0, f.n.z);

    const shape = new THREE.Shape();
    shape.moveTo(-e0, 0); shape.lineTo(f.L + e1, 0);
    shape.lineTo(f.L + e1, w.height); shape.lineTo(-e0, w.height); shape.lineTo(-e0, 0);

    const ops = (w.openings || []).filter(o => o.offset > -1 && o.offset < f.L + 1);
    ops.forEach(o => {
      const ow = Math.min(o.width, f.L - .2);
      const u0 = U.clamp(o.offset - ow / 2, .02, f.L - .1);
      const u1 = U.clamp(o.offset + ow / 2, u0 + .2, f.L - .02);
      const y0 = Math.max(0, o.sill);
      const y1 = Math.min(y0 + o.height, w.height - .15);
      if (y1 <= y0 + .1) return;
      o._u0 = u0; o._u1 = u1; o._y0 = y0; o._y1 = y1;
      const h = new THREE.Path();
      h.moveTo(u0, y0); h.lineTo(u1, y0); h.lineTo(u1, y1); h.lineTo(u0, y1); h.lineTo(u0, y0);
      shape.holes.push(h);
    });

    const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 2 });
    const mesh = new THREE.Mesh(geo, [
      new THREE.MeshStandardMaterial({ color: new THREE.Color(w.color), roughness: .93 }),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(w.trimColor || '#F6F6F2'), roughness: .8 })
    ]);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData = { kind: 'swall', wallId: w.id };

    const g = new THREE.Group();
    g.add(mesh);

    if (w.baseboard) {                                   // both faces are finished
      const bbMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(w.trimColor || '#F6F6F2'), roughness: .7 });
      const cuts = ops.filter(o => o._y0 !== undefined && o._y0 < .1)
        .map(o => [o._u0 - .06, o._u1 + .06]).sort((a, b) => a[0] - b[0]);
      const run = (a, b) => {
        if (b - a < .1) return;
        [-.03, t + .03].forEach(z => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(b - a, .48, .06), bbMat);
          m.position.set((a + b) / 2, .24, z);
          m.receiveShadow = true;
          g.add(m);
        });
      };
      let u = -e0;                                       // carry the baseboard into the joint
      cuts.forEach(c => { run(u, Math.max(u, c[0])); u = Math.max(u, c[1]); });
      run(u, f.L + e1);
    }

    const shim = { wallColor: w.color, wallColors: {} };  // for trimless reveals
    ops.forEach(o => { if (o._y0 !== undefined) buildOpening(g, shim, o, t); });

    const M = new THREE.Matrix4().makeBasis(ex, UP, nz)
      .setPosition(w.a.x - f.n.x * t / 2, 0, w.a.z - f.n.z * t / 2);   // centred on the line
    g.applyMatrix4(M);
    g.userData = { kind: 'freeWallGroup', wallId: w.id };
    return g;
  };

  /* ─────────── whole project ─────────── */
  /** builds everything into `root`; returns { pick:[], walls:[], items:[] } */
  B.house = function (root, opts) {
    const out = { pick: [], walls: [], items: [] };
    const showCeiling = opts && opts.ceiling;

    HA.rooms().forEach(room => {
      if (room.points.length < 3) return;
      const rg = new THREE.Group();
      rg.userData = { kind: 'roomGroup', roomId: room.id };

      const f = floorMesh(room);
      rg.add(f); out.pick.push(f);

      const c = ceilingMesh(room);
      if (c) { c.visible = !!showCeiling; rg.add(c); out.pick.push(c); c.userData.isCeiling = true; }

      for (let i = 0; i < room.points.length; i++) {
        const wg = wallGroup(room, i);
        if (!wg) continue;
        rg.add(wg); out.walls.push(wg);
        wg.traverse(o => { if (o.isMesh && o.userData.kind === 'wall') out.pick.push(o); });
      }
      root.add(rg);
    });

    HA.walls().forEach(w => {
      const g = B.freeWall(w);
      if (!g) return;
      root.add(g);
      g.traverse(o => { if (o.isMesh && o.userData.kind === 'swall') out.pick.push(o); });
    });

    HA.furn().forEach(it => {
      const g = HA.furniture.build(it);
      const def = HA.furniture.def(it.type);
      let y = it.elev || 0;
      if (def && def.hang) {
        const room = HA.roomAt(it.x, it.z);
        const ch = room ? B.ceilingH(room, it.x, it.z) : 9;
        y = ch - (it.h || def.h);
      }
      g.position.y = y;
      root.add(g);
      out.items.push(g);
      g.traverse(o => { if (o.isMesh) { o.userData.kind = o.userData.kind || 'furnPart'; o.userData.itemId = it.id; out.pick.push(o); } });
    });

    return out;
  };
})();
