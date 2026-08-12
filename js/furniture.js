/* furniture.js — the catalog and the procedural 3D models. */
(function () {
  const HA = window.HA, U = HA.util;
  const F = HA.furniture = {};

  /* material cache so 500 boxes don't make 500 materials */
  const mats = new Map();
  function mat(color, opt) {
    const key = color + (opt ? JSON.stringify(opt) : '');
    let m = mats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial(Object.assign({ color: new THREE.Color(color), roughness: .75, metalness: .05 }, opt || {}));
      m.userData.cached = true;          // view.js must not dispose these
      mats.set(key, m);
    }
    return m;
  }
  F.mat = mat;
  F.clearCache = () => mats.clear();

  /* primitives — x = width, y = height, z = depth; y measured from the floor */
  const BOX = new THREE.BoxGeometry(1, 1, 1);
  const CYL = new THREE.CylinderGeometry(.5, .5, 1, 20);
  BOX.userData.shared = CYL.userData.shared = true;   // never disposed on rebuild
  function bx(g, w, h, d, x, y, z, color, ry) {
    const m = new THREE.Mesh(BOX, mat(color));
    m.scale.set(w, h, d); m.position.set(x, y + h / 2, z);
    if (ry) m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    g.add(m); return m;
  }
  function cy(g, r, h, x, y, z, color, rx) {
    const m = new THREE.Mesh(CYL, mat(color));
    m.scale.set(r * 2, h, r * 2); m.position.set(x, y + h / 2, z);
    if (rx) m.rotation.x = rx;
    m.castShadow = m.receiveShadow = true;
    g.add(m); return m;
  }
  function legs(g, w, d, h, color, inset) {
    const i = inset || .15, s = .12;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(p =>
      bx(g, s, h, s, p[0] * (w / 2 - i), 0, p[1] * (d / 2 - i), color));
  }
  /** a cylinder lying flat along x or z — unlike cy, (x,y,z) is its centre */
  function bar(g, r, len, x, y, z, color, axis) {
    const m = cy(g, r, len, x, y, z, color);
    m.position.set(x, y, z);
    m.rotation[axis === 'x' ? 'z' : 'x'] = Math.PI / 2;
    return m;
  }

  /* ─────────── catalog ───────────
     w = width (x), d = depth (z), h = height, c = main color, c2 = accent   */
  const C = F.catalog = [
    /* Living */
    { t: 'sofa', n: 'Sofa', g: 'Living', w: 7, d: 3.1, h: 2.7, c: '#6B7F8C', build: sofa },
    { t: 'loveseat', n: 'Loveseat', g: 'Living', w: 4.8, d: 3, h: 2.7, c: '#7E8B7A', build: sofa },
    { t: 'sectional', n: 'Sectional', g: 'Living', w: 9, d: 6, h: 2.7, c: '#8A8177', build: sectional },
    { t: 'armchair', n: 'Armchair', g: 'Living', w: 2.9, d: 3, h: 2.8, c: '#9A6B5A', build: sofa },
    { t: 'coffeeTable', n: 'Coffee table', g: 'Living', w: 4, d: 2.2, h: 1.4, c: '#8B5E3C', build: table },
    { t: 'sideTable', n: 'Side table', g: 'Living', w: 1.8, d: 1.8, h: 2, c: '#8B5E3C', build: table },
    { t: 'tvStand', n: 'TV stand', g: 'Living', w: 5, d: 1.4, h: 1.8, c: '#4A423C', build: cabinet },
    { t: 'tv', n: 'TV (wall)', g: 'Living', w: 5, d: .3, h: 2.9, c: '#141618', elev: 3.4, build: tv },
    { t: 'bookshelf', n: 'Bookshelf', g: 'Living', w: 3, d: 1.1, h: 6, c: '#7B5B41', build: shelf },
    { t: 'rug', n: 'Rug', g: 'Living', w: 9, d: 6, h: .06, c: '#9E8F7E', build: rug },
    { t: 'floorLamp', n: 'Floor lamp', g: 'Living', w: 1.4, d: 1.4, h: 5.2, c: '#3A3A3A', build: floorLamp },
    { t: 'plant', n: 'Plant', g: 'Living', w: 2.2, d: 2.2, h: 4.2, c: '#4E7A47', build: plant },
    { t: 'fireplace', n: 'Fireplace', g: 'Living', w: 5, d: 1.6, h: 4.5, c: '#B9B2A6', build: fireplace },

    /* Dining */
    { t: 'diningTable', n: 'Dining table', g: 'Dining', w: 6, d: 3.4, h: 2.5, c: '#8B5E3C', build: diningSet },
    { t: 'roundTable', n: 'Round table', g: 'Dining', w: 4.2, d: 4.2, h: 2.5, c: '#8B5E3C', build: roundTable },
    { t: 'chair', n: 'Chair', g: 'Dining', w: 1.6, d: 1.7, h: 3, c: '#6E5A47', build: chair },
    { t: 'barStool', n: 'Bar stool', g: 'Dining', w: 1.3, d: 1.3, h: 2.5, c: '#5A4E44', build: stool },
    { t: 'buffet', n: 'Buffet', g: 'Dining', w: 5, d: 1.6, h: 3, c: '#7B5B41', build: cabinet },

    /* Kitchen */
    { t: 'counter', n: 'Base cabinets', g: 'Kitchen', w: 6, d: 2, h: 3, c: '#DCD8D0', c2: '#5A5145', build: counter },
    { t: 'upper', n: 'Upper cabinets', g: 'Kitchen', w: 6, d: 1.1, h: 2.6, c: '#DCD8D0', elev: 4.5, build: upper },
    { t: 'island', n: 'Island', g: 'Kitchen', w: 7, d: 3.2, h: 3, c: '#3E4A52', c2: '#D8D5CE', build: island },
    { t: 'sinkBase', n: 'Sink run', g: 'Kitchen', w: 3, d: 2, h: 3, c: '#DCD8D0', build: sinkBase },
    { t: 'range', n: 'Range', g: 'Kitchen', w: 2.6, d: 2.1, h: 3, c: '#B8BCC0', build: range },
    { t: 'fridge', n: 'Refrigerator', g: 'Kitchen', w: 3, d: 2.6, h: 6, c: '#C2C7CB', build: fridge },
    { t: 'dishwasher', n: 'Dishwasher', g: 'Kitchen', w: 2, d: 2, h: 3, c: '#C2C7CB', build: appliance },
    { t: 'pantry', n: 'Pantry', g: 'Kitchen', w: 3, d: 2, h: 7, c: '#DCD8D0', build: shelf },

    /* Bedroom */
    { t: 'bedKing', n: 'Bed — king', g: 'Bedroom', w: 6.7, d: 7, h: 3.6, c: '#5C6670', c2: '#E8E5DE', build: bed },
    { t: 'bedQueen', n: 'Bed — queen', g: 'Bedroom', w: 5.2, d: 6.9, h: 3.6, c: '#5C6670', c2: '#E8E5DE', build: bed },
    { t: 'bedTwin', n: 'Bed — twin', g: 'Bedroom', w: 3.3, d: 6.5, h: 3.4, c: '#6E7A63', c2: '#E8E5DE', build: bed },
    { t: 'nightstand', n: 'Nightstand', g: 'Bedroom', w: 1.8, d: 1.5, h: 2.1, c: '#7B5B41', build: cabinet },
    { t: 'dresser', n: 'Dresser', g: 'Bedroom', w: 5, d: 1.7, h: 2.9, c: '#7B5B41', build: cabinet },
    { t: 'wardrobe', n: 'Wardrobe', g: 'Bedroom', w: 4, d: 2, h: 7, c: '#7B5B41', build: wardrobe },

    /* Office */
    { t: 'desk', n: 'Desk', g: 'Office', w: 4.5, d: 2.2, h: 2.5, c: '#8B5E3C', build: table },
    { t: 'deskL', n: 'L-shaped desk', g: 'Office', w: 5.5, d: 5, h: 2.5, c: '#7B5B41', build: deskL },
    { t: 'deskExec', n: 'Executive desk', g: 'Office', w: 6, d: 3, h: 2.5, c: '#6E4B33', build: deskExec },
    { t: 'deskStand', n: 'Standing desk', g: 'Office', w: 5, d: 2.5, h: 3.6, c: '#C9A87C', build: deskStand },
    { t: 'officeChair', n: 'Office chair', g: 'Office', w: 2, d: 2, h: 3.4, c: '#2E3236', build: officeChair },
    { t: 'guestChair', n: 'Guest chair', g: 'Office', w: 1.9, d: 2, h: 2.9, c: '#5A6270', build: chair },
    { t: 'monitor', n: 'Monitor', g: 'Office', w: 2, d: .7, h: 1.6, c: '#1A1C1E', elev: 2.5, build: monitor },
    { t: 'dualMonitor', n: 'Dual monitors', g: 'Office', w: 3.8, d: .8, h: 1.6, c: '#1A1C1E', elev: 2.5, build: dualMonitor },
    { t: 'deskLamp', n: 'Desk lamp', g: 'Office', w: .9, d: .9, h: 1.6, c: '#3A3D40', elev: 2.5, build: deskLamp },
    { t: 'printer', n: 'Printer', g: 'Office', w: 1.6, d: 1.4, h: 1.2, c: '#D8D6D2', build: printer },
    { t: 'fileCab', n: 'File cabinet', g: 'Office', w: 1.4, d: 2, h: 2.4, c: '#6C7278', build: (g, s) => drawers(g, s, 2) },
    { t: 'fileLateral', n: 'Lateral file', g: 'Office', w: 3, d: 1.6, h: 3.2, c: '#7B5B41', build: (g, s) => drawers(g, s, 3) },
    { t: 'credenza', n: 'Credenza', g: 'Office', w: 5, d: 1.5, h: 2.4, c: '#7B5B41', build: cabinet },
    { t: 'storageCab', n: 'Storage cabinet', g: 'Office', w: 3, d: 1.6, h: 6, c: '#8A8F94', build: wardrobe },
    { t: 'officeShelf', n: 'Shelving unit', g: 'Office', w: 3, d: 1.2, h: 7, c: '#7B5B41', build: shelf },
    { t: 'confTable', n: 'Conference table', g: 'Office', w: 10, d: 4, h: 2.5, c: '#6E4B33', build: confTable },
    { t: 'whiteboard', n: 'Whiteboard', g: 'Office', w: 6, d: .2, h: 4, c: '#F2F2EE', elev: 3, build: whiteboard },
    { t: 'rack', n: 'Equipment rack', g: 'Office', w: 2, d: 2.5, h: 6, c: '#26292B', build: rack },

    /* Bath */
    { t: 'toilet', n: 'Toilet', g: 'Bath', w: 1.5, d: 2.5, h: 2.5, c: '#F2F1ED', build: toilet },
    { t: 'vanity', n: 'Vanity', g: 'Bath', w: 4, d: 1.9, h: 2.9, c: '#DCD8D0', c2: '#E9E7E2', build: vanity },
    { t: 'bathtub', n: 'Bathtub', g: 'Bath', w: 5.2, d: 2.6, h: 1.8, c: '#F2F1ED', build: bathtub },
    { t: 'shower', n: 'Shower', g: 'Bath', w: 3.5, d: 3.5, h: 6.8, c: '#DCE4E6', build: shower },

    /* Structure & lights */
    { t: 'stairs', n: 'Stairs', g: 'Structure', w: 3.5, d: 10, h: 8, c: '#9C8979', build: stairs },
    { t: 'column', n: 'Column', g: 'Structure', w: 1.2, d: 1.2, h: 8, c: '#EDEAE0', build: column },
    { t: 'halfWall', n: 'Half wall', g: 'Structure', w: 6, d: .5, h: 3.5, c: '#E4E1D8', build: halfWall },
    { t: 'ceilingFan', n: 'Ceiling fan', g: 'Structure', w: 4.4, d: 4.4, h: 1.2, c: '#4A4A4A', hang: true, build: fan },
    { t: 'pendant', n: 'Pendant light', g: 'Structure', w: 1.2, d: 1.2, h: 2.5, c: '#2E3236', hang: true, build: pendant },
    { t: 'chandelier', n: 'Chandelier', g: 'Structure', w: 3, d: 3, h: 2.6, c: '#C9A227', hang: true, build: chandelier },

    /* Gym */
    { t: 'homeGym', n: 'Weider Pro 6900', g: 'Gym', w: 3.8, d: 6.6, h: 6.8, c: '#3D4247', c2: '#25282B', build: homeGym },

    /* Custom — stand in for anything the catalog hasn't got */
    { t: 'box', n: 'Box', g: 'Custom', w: 2, d: 2, h: 2, c: '#B9A88F', build: plainBox }
  ];

  const byType = {};
  C.forEach(d => byType[d.t] = d);
  F.def = t => byType[t];

  F.make = function (type, x, z, rot) {
    const d = byType[type];
    if (!d) return null;
    return {
      id: U.uid('f'), type, x, z, rot: rot || 0,
      w: d.w, d: d.d, h: d.h, elev: d.elev || 0,
      color: d.c, color2: d.c2 || null
    };
  };

  /** THREE.Group for one item, positioned/rotated, y placed by caller-aware elev/hang */
  F.build = function (it) {
    const d = byType[it.type];
    const g = new THREE.Group();
    g.userData = { kind: 'furniture', id: it.id };
    if (!d) return g;
    const spec = {
      w: it.w || d.w, d: it.d || d.d, h: it.h || d.h,
      c: it.color || d.c, c2: it.color2 || d.c2 || '#E8E5DE'
    };
    try { d.build(g, spec); } catch (e) { bx(g, spec.w, spec.h, spec.d, 0, 0, 0, spec.c); }
    g.position.set(it.x, 0, it.z);
    g.rotation.y = -(it.rot || 0) * Math.PI / 180;
    return g;
  };

  /* ─────────── builders ─────────── */
  function sofa(g, s) {
    const arm = Math.min(.55, s.w * .12), seat = s.h * .58;
    bx(g, s.w, seat * .55, s.d, 0, 0, 0, s.c);                                  // base
    bx(g, s.w - arm * 2, .35, s.d - .5, 0, seat * .55, .1, shade(s.c, 1.12));   // cushion
    bx(g, s.w, s.h - seat * .55, .55, 0, seat * .55, -s.d / 2 + .27, s.c);      // back
    bx(g, arm, s.h * .72, s.d, -s.w / 2 + arm / 2, 0, 0, s.c);
    bx(g, arm, s.h * .72, s.d, s.w / 2 - arm / 2, 0, 0, s.c);
  }
  function sectional(g, s) {
    const armW = .55, mainD = 3.1;
    sofa(g, { w: s.w, d: mainD, h: s.h, c: s.c });
    const legD = s.d - mainD;
    if (legD > .5) {
      const gg = new THREE.Group();
      bx(gg, mainD, s.h * .32, legD, 0, 0, 0, s.c);
      bx(gg, mainD, s.h * .18, legD, 0, s.h * .32, 0, shade(s.c, 1.12));
      bx(gg, .5, s.h, legD, mainD / 2 - .25, 0, 0, s.c);
      gg.position.set(s.w / 2 - mainD / 2, 0, mainD / 2 + legD / 2);
      g.add(gg);
    }
  }
  function table(g, s) {
    bx(g, s.w, .16, s.d, 0, s.h - .16, 0, s.c);
    legs(g, s.w, s.d, s.h - .16, shade(s.c, .8));
  }
  function roundTable(g, s) {
    cy(g, s.w / 2, .16, 0, s.h - .16, 0, s.c);
    cy(g, .22, s.h - .16, 0, 0, 0, shade(s.c, .8));
    cy(g, s.w / 3.2, .12, 0, 0, 0, shade(s.c, .8));
  }
  function chair(g, s) {
    bx(g, s.w, .18, s.d, 0, s.h * .48, 0, s.c);
    bx(g, s.w, s.h * .52, .16, 0, s.h * .48, -s.d / 2 + .08, s.c);
    legs(g, s.w, s.d, s.h * .48, shade(s.c, .8), .12);
  }
  function stool(g, s) {
    cy(g, s.w / 2, .2, 0, s.h - .2, 0, s.c);
    cy(g, .1, s.h - .2, 0, 0, 0, '#5A5F63');
    cy(g, s.w / 2.6, .08, 0, 0, 0, '#5A5F63');
  }
  function officeChair(g, s) {
    cy(g, s.w / 2.4, .16, 0, s.h * .48, 0, s.c);
    bx(g, s.w * .82, s.h * .5, .18, 0, s.h * .5, -s.d / 2 + .18, s.c);
    cy(g, .1, s.h * .48, 0, 0, 0, '#4A4E52');
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      bx(g, .8, .08, .16, Math.sin(a) * .45, .04, Math.cos(a) * .45, '#4A4E52', a);
    }
  }
  function diningSet(g, s) {
    table(g, s);
    const n = Math.max(1, Math.round(s.w / 2.2)), sp = s.w / n;
    for (let i = 0; i < n; i++) {
      const x = -s.w / 2 + sp * (i + .5);
      [1, -1].forEach(side => {
        const c = new THREE.Group();
        chair(c, { w: 1.5, d: 1.6, h: 2.9, c: shade(s.c, .85) });
        c.position.set(x, 0, side * (s.d / 2 + .85));
        c.rotation.y = side > 0 ? Math.PI : 0;
        g.add(c);
      });
    }
  }
  function cabinet(g, s) {
    bx(g, s.w, s.h, s.d, 0, 0, 0, s.c);
    const n = Math.max(1, Math.round(s.w / 1.8));
    for (let i = 0; i < n; i++)
      bx(g, s.w / n - .12, s.h * .8, .04, -s.w / 2 + s.w / n * (i + .5), s.h * .1, s.d / 2 + .01, shade(s.c, 1.14));
  }
  const BOOKS = ['#8A4B3C', '#3F5E77', '#6E7A4E', '#8A7A3C', '#5A4664',
    '#A8663A', '#3E6F63', '#7C3B44', '#4A5A7A', '#9A8451', '#2F4A3E', '#B08A5A'];
  function book(g, w, h, d, x, y, z) {          // the carcass casts for them; ~90 spines a shelf otherwise
    const m = bx(g, w, h, d, x, y, z, BOOKS[(Math.random() * BOOKS.length) | 0]);
    m.castShadow = false; return m;
  }
  function shelf(g, s) {
    const side = .09, back = .06, brd = .07;
    const carc = shade(s.c, .8), zb = -s.d / 2;
    bx(g, s.w, s.h, back, 0, 0, zb + back / 2, shade(s.c, .68));     // back panel
    bx(g, side, s.h, s.d, -(s.w - side) / 2, 0, 0, carc);            // sides
    bx(g, side, s.h, s.d, (s.w - side) / 2, 0, 0, carc);
    bx(g, s.w, brd, s.d, 0, 0, 0, carc);                             // floor of the case
    bx(g, s.w, brd, s.d, 0, s.h - brd, 0, carc);                     // top

    const inner = s.w - side * 2, half = inner / 2;
    const ih = s.h - brd * 2, n = Math.max(2, Math.round(ih / 1.25)), gap = ih / n;
    const bd = s.d * .62;
    for (let i = 0; i < n; i++) {
      const base = brd + gap * i + (i ? brd : 0);     // on a board, or on the case floor
      const head = brd + gap * (i + 1) - .04;         // clearance under the board above
      if (i) bx(g, inner, brd, s.d - back, 0, brd + gap * i, back / 2, shade(s.c, 1.06));
      let x = -half + .02;
      while (half - x > .1) {
        const room = half - x;
        const z = s.d / 2 - (.05 + Math.random() * .1) - bd / 2;   // near the front, not flush
        if (room > .62 && Math.random() < .16) {      // a flat stack, spines facing out
          const sw = Math.min(room - .04, .45 + Math.random() * .25);
          const c = 2 + ((Math.random() * 3) | 0);
          for (let j = 0; j < c; j++)
            book(g, sw - j * .02, .11, bd - j * .02, x + sw / 2, base + j * .115, z);
          x += sw + .04;
          continue;
        }
        const bw = Math.min(room, .09 + Math.random() * .13);
        const bh = Math.min(head - base, .52 + Math.random() * .42);
        if (room - bw > .34 && Math.random() < .18) { // last of a run, leaning into the gap
          const a = (Math.random() < .5 ? -1 : 1) * (.18 + Math.random() * .16);
          const sink = (bh * Math.cos(a) + bw * Math.abs(Math.sin(a)) - bh) / 2;
          book(g, bw, bh, bd, x + bw / 2 + bh * Math.abs(Math.sin(a)) / 2, base + sink, z).rotation.z = a;
          x += bw + bh * Math.abs(Math.sin(a)) + .02;
          continue;
        }
        book(g, bw, bh, bd, x + bw / 2, base, z);
        x += bw + (Math.random() < .12 ? .05 : .004); // the odd breathing gap
      }
    }
  }
  function wardrobe(g, s) {
    bx(g, s.w, s.h, s.d, 0, 0, 0, s.c);
    bx(g, .05, s.h - .3, .04, 0, .15, s.d / 2 + .01, '#3A3A3A');
    bx(g, .12, .5, .06, -.22, s.h * .45, s.d / 2 + .02, '#C6C0B4');
    bx(g, .12, .5, .06, .22, s.h * .45, s.d / 2 + .02, '#C6C0B4');
  }
  function rug(g, s) {
    const m = bx(g, s.w, .05, s.d, 0, 0, 0, s.c);
    m.castShadow = false;
    bx(g, s.w - .5, .052, s.d - .5, 0, 0, 0, shade(s.c, 1.12)).castShadow = false;
  }
  function tv(g, s) {
    bx(g, s.w, s.h, .12, 0, 0, 0, '#141618');
    bx(g, s.w - .12, s.h - .12, .02, 0, .06, .08, '#2B3E52');
  }
  function floorLamp(g, s) {
    cy(g, .55, .06, 0, 0, 0, '#3A3A3A');
    cy(g, .06, s.h - .9, 0, 0, 0, s.c);
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(.55, .75, .9, 16, 1, true),
      mat('#F0E6CE', { side: THREE.DoubleSide, emissive: new THREE.Color('#3A3020') }));
    sh.position.y = s.h - .45; g.add(sh);
  }
  function plant(g, s) {
    cy(g, s.w / 3.4, s.h * .22, 0, 0, 0, '#9A6B4F');
    cy(g, .08, s.h * .45, 0, s.h * .2, 0, '#5A4A32');
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2, r = s.w / 3.4 + Math.random() * .5;
      const b = bx(g, .9, .08, .35, Math.sin(a) * r * .7, s.h * (.55 + Math.random() * .35), Math.cos(a) * r * .7, s.c, a);
      b.rotation.z = (Math.random() - .5) * .8;
    }
  }
  function fireplace(g, s) {
    bx(g, s.w, s.h, s.d, 0, 0, 0, s.c);
    bx(g, s.w * .5, s.h * .42, .3, 0, .5, s.d / 2 + .02, '#22201F');
    bx(g, s.w * .78, .22, s.d + .3, 0, s.h * .62, 0, shade(s.c, .92));
  }
  function counter(g, s) {
    bx(g, s.w, s.h - .15, s.d - .2, 0, 0, -.1, s.c2 || '#5A5145');
    const n = Math.max(1, Math.round(s.w / 2));
    for (let i = 0; i < n; i++)
      bx(g, s.w / n - .1, s.h - .6, .04, -s.w / 2 + s.w / n * (i + .5), .3, s.d / 2 - .1, shade(s.c, 1.06));
    bx(g, s.w, .15, s.d, 0, s.h - .15, 0, '#3E4145');           // countertop
    bx(g, s.w, .35, .12, 0, s.h, -s.d / 2 + .06, '#3E4145');    // backsplash
  }
  function upper(g, s) {
    bx(g, s.w, s.h, s.d, 0, 0, 0, s.c);
    const n = Math.max(1, Math.round(s.w / 2));
    for (let i = 0; i < n; i++)
      bx(g, s.w / n - .1, s.h - .1, .04, -s.w / 2 + s.w / n * (i + .5), .05, s.d / 2 + .01, shade(s.c, 1.06));
  }
  function island(g, s) {
    bx(g, s.w, s.h - .15, s.d - .1, 0, 0, 0, s.c);
    bx(g, s.w + .5, .18, s.d + .5, 0, s.h - .18, 0, s.c2 || '#D8D5CE');
    const n = Math.max(1, Math.round(s.w / 2));
    for (let i = 0; i < n; i++)
      bx(g, s.w / n - .12, s.h - .8, .04, -s.w / 2 + s.w / n * (i + .5), .35, -s.d / 2 + .06, shade(s.c, 1.15));
  }
  function sinkBase(g, s) {
    counter(g, s);
    bx(g, s.w * .62, .1, s.d * .55, 0, s.h - .22, .05, '#8E9498');
    cy(g, .05, .9, 0, s.h, -s.d * .28, '#9AA0A4');
    bx(g, .06, .06, .5, 0, s.h + .85, -s.d * .28 + .22, '#9AA0A4');
  }
  function range(g, s) {
    bx(g, s.w, s.h - .1, s.d, 0, 0, 0, s.c);
    bx(g, s.w - .1, .1, s.d - .1, 0, s.h - .1, 0, '#2B2E30');
    for (let i = 0; i < 4; i++)
      cy(g, .28, .03, (i % 2 ? .55 : -.55), s.h, (i < 2 ? -.5 : .5), '#3A3D3F');
    bx(g, s.w - .2, .5, .06, 0, s.h * .58, s.d / 2 + .01, '#1E2022');
    bx(g, s.w - .2, .12, .1, 0, s.h * .78, s.d / 2 + .03, '#8E9498');
  }
  function fridge(g, s) {
    bx(g, s.w, s.h, s.d, 0, 0, 0, s.c);
    bx(g, s.w - .1, s.h * .62 - .05, .05, 0, s.h * .38, s.d / 2 + .01, shade(s.c, .94));
    bx(g, s.w - .1, s.h * .38 - .05, .05, 0, .02, s.d / 2 + .01, shade(s.c, .94));
    bx(g, .1, s.h * .5, .12, s.w / 2 - .35, s.h * .44, s.d / 2 + .06, '#8A9094');
    bx(g, .1, s.h * .28, .12, s.w / 2 - .35, s.h * .06, s.d / 2 + .06, '#8A9094');
  }
  function appliance(g, s) {
    bx(g, s.w, s.h, s.d, 0, 0, 0, s.c);
    bx(g, s.w - .1, .12, .1, 0, s.h - .3, s.d / 2 + .03, '#8A9094');
  }
  function bed(g, s) {
    bx(g, s.w, .9, s.d, 0, .35, 0, '#6B5B4A');                                   // frame
    bx(g, s.w - .2, .8, s.d - .3, 0, 1.05, .1, s.c2 || '#E8E5DE');               // mattress
    bx(g, s.w - .2, .12, s.d * .58, 0, 1.85, s.d * .2, s.c);                     // duvet
    bx(g, s.w, s.h - .1, .3, 0, 0, -s.d / 2 + .12, '#6B5B4A');                   // headboard
    const pw = (s.w - .6) / 2;
    [-1, 1].forEach(k => bx(g, pw, .32, 1.1, k * pw / 2 * 1.06, 1.85, -s.d / 2 + .95, '#F4F2ED'));
  }
  /* ── office ── */
  function deskL(g, s) {
    const t = .14, run = Math.min(2.2, s.d - .5);
    bx(g, s.w, t, run, 0, s.h - t, -(s.d - run) / 2, s.c);          // main run at the back
    bx(g, run, t, s.d - run, (s.w - run) / 2, s.h - t, run / 2, s.c); // return down one side
    const lg = shade(s.c, .72), L = s.h - t;
    bx(g, .14, L, .14, -s.w / 2 + .2, 0, -s.d / 2 + .2, lg);
    bx(g, .14, L, .14, s.w / 2 - .2, 0, -s.d / 2 + .2, lg);
    bx(g, .14, L, .14, s.w / 2 - .2, 0, s.d / 2 - .2, lg);
    bx(g, .14, L, .14, s.w / 2 - run + .2, 0, s.d / 2 - .2, lg);
    bx(g, .14, L, .14, -s.w / 2 + .2, 0, -s.d / 2 + run - .2, lg);
  }

  function deskExec(g, s) {
    bx(g, s.w, .16, s.d, 0, s.h - .16, 0, s.c);
    const ped = Math.min(1.5, s.w / 4);
    [-1, 1].forEach(k => {
      const x = k * (s.w / 2 - ped / 2 - .1);
      bx(g, ped, s.h - .16, s.d - .3, x, 0, 0, shade(s.c, .93));
      for (let i = 0; i < 3; i++) {
        bx(g, ped - .16, (s.h - .5) / 3 - .06, .04, x, .15 + i * (s.h - .5) / 3, (s.d - .3) / 2 + .01, shade(s.c, 1.1));
        bx(g, ped * .45, .06, .06, x, .15 + i * (s.h - .5) / 3 + .18, (s.d - .3) / 2 + .04, '#9AA0A4');
      }
    });
    bx(g, s.w - ped * 2 - .4, s.h - .9, .08, 0, .35, -s.d / 2 + .12, shade(s.c, .93));   // modesty panel
  }

  function deskStand(g, s) {
    bx(g, s.w, .14, s.d, 0, s.h - .14, 0, s.c);
    [-1, 1].forEach(k => {
      const x = k * (s.w / 2 - .6);
      bx(g, .22, s.h - .14, .22, x, .1, 0, '#4A4E52');               // lifting column
      bx(g, .3, .1, s.d * .8, x, 0, 0, '#3A3D40');                   // foot
    });
    bx(g, .55, .07, .3, -s.w / 2 + 1.1, s.h - .21, s.d / 2 - .25, '#2B2E30');  // height control
  }

  function drawers(g, s, n) {
    bx(g, s.w, s.h, s.d, 0, 0, 0, s.c);
    const t = (s.h - .12) / n;
    for (let i = 0; i < n; i++) {
      const y = .06 + i * t;
      bx(g, s.w - .14, t - .07, .04, 0, y, s.d / 2 + .01, shade(s.c, 1.12));
      bx(g, Math.min(1, s.w * .45), .07, .07, 0, y + (t - .07) / 2, s.d / 2 + .04, '#9AA0A4');
      bx(g, .28, .12, .02, -s.w / 2 + .3, y + (t - .07) / 2 - .3, s.d / 2 + .03, '#C6C0B4');  // label holder
    }
  }

  function monitor(g, s) {
    const ph = s.h * .74;
    bx(g, s.w * .45, .07, s.d * .8, 0, 0, 0, '#3A3D40');             // stand
    bx(g, .2, s.h * .26, .2, 0, .07, 0, '#3A3D40');
    bx(g, s.w, ph, .1, 0, s.h * .26, 0, s.c);                        // bezel
    bx(g, s.w - .14, ph - .16, .02, 0, s.h * .26 + .08, .06, '#2B3E52');  // screen
  }
  function dualMonitor(g, s) {
    const one = { w: s.w / 2 - .12, d: s.d, h: s.h, c: s.c };
    [-1, 1].forEach(k => {
      const m = new THREE.Group();
      monitor(m, one);
      m.position.set(k * (s.w / 4 + .06), 0, k === -1 ? .12 : .12);
      m.rotation.y = -k * .22;                                        // angled in toward the chair
      g.add(m);
    });
  }

  function deskLamp(g, s) {
    cy(g, s.w / 2.4, .07, 0, 0, 0, s.c);
    cy(g, .05, s.h * .62, 0, .07, 0, s.c);
    const arm = bx(g, .05, .05, s.h * .45, 0, s.h * .66, s.h * .12, s.c);
    arm.rotation.x = .5;
    const sh = new THREE.Mesh(new THREE.ConeGeometry(.3, .38, 16, 1, true), mat(s.c, { side: THREE.DoubleSide }));
    sh.position.set(0, s.h * .78, s.h * .28); sh.rotation.x = 2.5;
    g.add(sh);
    const b = new THREE.Mesh(new THREE.SphereGeometry(.09, 10, 8), mat('#FFF3D6', { emissive: new THREE.Color('#6A5A30') }));
    b.position.set(0, s.h * .72, s.h * .3); g.add(b);
  }

  function printer(g, s) {
    bx(g, s.w, s.h * .78, s.d, 0, 0, 0, s.c);
    bx(g, s.w * .92, .07, s.d * .7, 0, s.h * .78, -.06, shade(s.c, .86));   // output tray
    bx(g, s.w * .8, .05, s.d * .5, 0, s.h * .78 + .07, .12, shade(s.c, .94));
    bx(g, s.w * .4, .22, .04, -s.w * .18, s.h * .5, s.d / 2 + .01, '#2B2E30');  // panel
    bx(g, s.w * .12, .1, .03, s.w * .3, s.h * .5, s.d / 2 + .01, '#6BA96B');
  }

  function whiteboard(g, s) {
    bx(g, s.w, s.h, .05, 0, 0, .06, '#F4F4F0');
    const f = '#B8BCC0';
    bx(g, s.w, .09, .09, 0, s.h - .09, .04, f);
    bx(g, s.w, .09, .09, 0, 0, .04, f);
    bx(g, .09, s.h, .09, -s.w / 2 + .045, 0, .04, f);
    bx(g, .09, s.h, .09, s.w / 2 - .045, 0, .04, f);
    bx(g, s.w * .5, .06, .22, 0, -.06, .16, f);                       // marker tray
  }

  function confTable(g, s) {
    bx(g, s.w, .18, s.d, 0, s.h - .18, 0, s.c);
    bx(g, s.w - .6, .12, s.d - .5, 0, s.h - .3, 0, shade(s.c, .9));
    [-1, 1].forEach(k => {
      const x = k * s.w * .27;
      bx(g, .6, s.h - .3, s.d * .45, x, 0, 0, shade(s.c, .8));
      bx(g, 1.3, .14, s.d * .68, x, 0, 0, shade(s.c, .7));
    });
  }

  function rack(g, s) {
    bx(g, s.w, s.h, s.d, 0, 0, -.05, '#26292B');
    for (let i = 0; i < Math.floor(s.h / .62); i++) {
      const y = .3 + i * .62;
      if (y + .5 > s.h) break;
      bx(g, s.w - .18, .46, .06, 0, y, s.d / 2 + .01, i % 3 ? '#3A3D40' : '#4A4E52');
      for (let k = 0; k < 3; k++)
        bx(g, .07, .07, .02, -s.w / 2 + .35 + k * .18, y + .3, s.d / 2 + .05,
          k === 0 ? '#6BC17A' : k === 1 ? '#D9A441' : '#5AA9E6');     // status lights
    }
  }

  function toilet(g, s) {
    cy(g, s.w / 2.1, .16, 0, 0, s.d * .16, s.c);
    bx(g, s.w * .62, 1.2, s.d * .52, 0, .16, s.d * .14, s.c);
    cy(g, s.w / 2.2, .3, 0, 1.28, s.d * .14, s.c);
    bx(g, s.w * .92, 1.9, .7, 0, 0, -s.d / 2 + .35, s.c);
  }
  function vanity(g, s) {
    bx(g, s.w, s.h - .12, s.d, 0, 0, 0, s.c);
    bx(g, s.w + .1, .12, s.d + .06, 0, s.h - .12, 0, s.c2 || '#E9E7E2');
    cy(g, s.d * .28, .1, 0, s.h - .2, .05, '#FFFFFF');
    cy(g, .04, .7, 0, s.h, -s.d * .26, '#9AA0A4');
    const n = Math.max(2, Math.round(s.w / 2));
    for (let i = 0; i < n; i++)
      bx(g, s.w / n - .12, s.h - .7, .04, -s.w / 2 + s.w / n * (i + .5), .25, s.d / 2 + .01, shade(s.c, 1.08));
    bx(g, s.w * .7, 2.6, .06, 0, s.h + .5, -s.d / 2 - .02, '#DDE6E8');  // mirror
  }
  function bathtub(g, s) {
    bx(g, s.w, s.h, s.d, 0, 0, 0, s.c);
    bx(g, s.w - .5, s.h - .35, s.d - .5, 0, .35, 0, '#DCE6E8');
    cy(g, .05, .8, -s.w / 2 + .35, s.h, 0, '#9AA0A4');
  }
  function shower(g, s) {
    bx(g, s.w, .35, s.d, 0, 0, 0, '#E4E2DC');
    const glass = mat('#BFD8DE', { transparent: true, opacity: .28, roughness: .05, metalness: .1 });
    const a = new THREE.Mesh(BOX, glass); a.scale.set(s.w, s.h - .35, .06);
    a.position.set(0, (s.h - .35) / 2 + .35, s.d / 2); g.add(a);
    const b = new THREE.Mesh(BOX, glass); b.scale.set(.06, s.h - .35, s.d);
    b.position.set(s.w / 2, (s.h - .35) / 2 + .35, 0); g.add(b);
    cy(g, .05, .9, 0, s.h - 1.5, -s.d / 2 + .2, '#9AA0A4', Math.PI / 2.6);
  }
  function stairs(g, s) {
    const n = Math.max(3, Math.round(s.h / .63)), rise = s.h / n, run = s.d / n;
    for (let i = 0; i < n; i++) {
      bx(g, s.w, .2, run + .1, 0, rise * (i + 1) - .2, s.d / 2 - run * (i + .5), s.c);
      bx(g, s.w, rise - .2, .12, 0, rise * i, s.d / 2 - run * (i + 1) + .06, shade(s.c, .88));
    }
  }
  function column(g, s) { cy(g, s.w / 2, s.h, 0, 0, 0, s.c); }
  function plainBox(g, s) { bx(g, s.w, s.h, s.d, 0, 0, 0, s.c); }

  /* ── gym ──
     Bench and lat tower: uprights at the head carry the barbell and the high
     pulley, butterfly arms swing off them, leg developer at the foot. */
  function homeGym(g, s) {
    const fr = s.c, pad = s.c2 || '#25282B', steel = '#9EA4A9', blk = '#2A2D30';
    const zb = -s.d / 2, zf = s.d / 2, ux = s.w * .17;
    const tz = zb + s.d * .08;                       // the tower's plane
    const seat = 1.5, deck = seat - .22;             // top of the pads, and the frame under them

    /* base: a rail down each side, a foot across each end */
    [-1, 1].forEach(k => bx(g, .16, .2, s.d * .92, k * ux, 0, 0, fr));
    bx(g, s.w * .78, .2, .18, 0, 0, tz, fr);
    bx(g, s.w * .5, .2, .18, 0, 0, zf - s.d * .06, fr);

    /* tower: uprights, yoke, pulley, and the lat bar on its cable */
    const top = s.h - .18;
    [-1, 1].forEach(k => bx(g, .17, s.h - .2, .17, k * ux, .2, tz, fr));
    bx(g, ux * 2 + .17, .18, .2, 0, top, tz, fr);
    bar(g, .16, .1, 0, top - .22, tz + .16, steel, 'x');
    const bary = s.h - 1.75;
    cy(g, .015, top - .22 - bary, 0, bary, tz + .16, blk);
    bar(g, .035, s.w * .58, 0, bary, tz + .16, steel, 'x');
    [-1, 1].forEach(k => bx(g, .1, .3, .1, k * s.w * .27, bary - .3, tz + .16, steel, k * .5));

    /* barbell resting in the hooks */
    [-1, 1].forEach(k => bx(g, .1, .1, .4, k * ux, 3.5, tz + .3, steel));
    bar(g, .04, s.w * 1.02, 0, 3.62, tz + .42, steel, 'x');
    [-1.4, -1.15, 1.15, 1.4].forEach(k =>
      bar(g, .5, .12, k * s.w * .29, 3.62, tz + .42, blk, 'x'));

    /* bench: pedestal, back pad on a slight incline, seat pad */
    bx(g, .5, deck - .2, .5, 0, .2, zb + s.d * .3, fr);
    bx(g, .5, deck - .2, .5, 0, .2, zb + s.d * .66, fr);
    bx(g, .2, .16, s.d * .74, 0, deck - .16, zb + s.d * .5, fr);   // runs on to carry the leg developer
    const back = bx(g, 1.15, .24, s.d * .25, 0, deck + .04, zb + s.d * .28, pad);
    back.rotation.x = .11;
    bx(g, 1.05, .22, s.d * .22, 0, deck, zb + s.d * .56, pad);

    /* butterfly arms, swung forward off the uprights */
    [-1, 1].forEach(k => {
      const a = k * .38, len = 1.8;
      bx(g, .18, .18, .3, k * (ux + .16), 3.1, tz + .16, steel);                 // pivot
      bx(g, .17, .17, len, k * (ux + .16) + Math.sin(a) * len / 2, 3.14,
        tz + .16 + Math.cos(a) * len / 2, fr, a);
      bar(g, .21, .62, k * (ux + .16) + Math.sin(a) * len, 3.35,
        tz + .16 + Math.cos(a) * len, pad, 'x');                                 // forearm pad
    });

    /* leg developer at the foot: two roller shafts, a pad each side */
    const lz = zb + s.d * .82;
    bx(g, .22, 1.5, .22, 0, deck - .3, lz, fr);
    [1.05, 2.25].forEach(y => {
      bar(g, .05, 1.5, 0, y, lz, steel, 'x');
      [-1, 1].forEach(k => bar(g, .17, .5, k * .55, y, lz, pad, 'x'));
    });

    /* spare plates on the storage peg */
    [-1, 1].forEach(k => {
      bar(g, .06, .5, k * (ux + .34), .95, tz + .1, steel, 'x');
      [0, 1].forEach(i => bar(g, .58, .13, k * (ux + .22 + i * .15), .95, tz + .1, blk, 'x'));
    });
  }
  function halfWall(g, s) {
    bx(g, s.w, s.h - .12, s.d, 0, 0, 0, s.c);
    bx(g, s.w + .2, .12, s.d + .2, 0, s.h - .12, 0, shade(s.c, .8));
  }
  function fan(g, s) {
    cy(g, .12, .9, 0, s.h - .9, 0, s.c);
    cy(g, .5, .35, 0, s.h - 1.25, 0, s.c);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      bx(g, s.w / 2, .05, .55, Math.sin(a) * s.w / 4, s.h - 1.05, Math.cos(a) * s.w / 4, '#7A6A55', a);
    }
    const globe = new THREE.Mesh(new THREE.SphereGeometry(.42, 16, 12), mat('#F2E9D5', { emissive: new THREE.Color('#403824') }));
    globe.position.y = s.h - 1.5; g.add(globe);
  }
  function pendant(g, s) {
    cy(g, .03, s.h - .8, 0, .8, 0, '#3A3A3A');
    const sh = new THREE.Mesh(new THREE.ConeGeometry(s.w / 2, .8, 20, 1, true),
      mat(s.c, { side: THREE.DoubleSide }));
    sh.position.y = .45; g.add(sh);
    const b = new THREE.Mesh(new THREE.SphereGeometry(.16, 12, 8), mat('#FFF3D6', { emissive: new THREE.Color('#6a5a30') }));
    b.position.y = .18; g.add(b);
  }
  function chandelier(g, s) {
    cy(g, .03, s.h - 1, 0, 1, 0, '#3A3A3A');
    cy(g, s.w / 2, .06, 0, .9, 0, s.c);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2, r = s.w / 2 - .15;
      cy(g, .09, .5, Math.sin(a) * r, .95, Math.cos(a) * r, '#F4EBD2');
      const b = new THREE.Mesh(new THREE.SphereGeometry(.1, 10, 8), mat('#FFF3D6', { emissive: new THREE.Color('#6a5a30') }));
      b.position.set(Math.sin(a) * r, 1.5, Math.cos(a) * r); g.add(b);
    }
  }

  function shade(hex, f) {
    const c = new THREE.Color(hex);
    c.r = Math.min(1, c.r * f); c.g = Math.min(1, c.g * f); c.b = Math.min(1, c.b * f);
    return '#' + c.getHexString();
  }
  F.shade = shade;
})();
