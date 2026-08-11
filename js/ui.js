/* ui.js — panels, properties, keyboard, file I/O, boot. */
(function () {
  const HA = window.HA, U = HA.util, S = HA.state;

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  /* ─────────────── boot ─────────────── */
  window.addEventListener('DOMContentLoaded', () => {
    S.project = HA.load() || HA.sample();
    HA.plan.init();
    HA.view.init();
    buildCatalog();
    buildSwatches();
    wireChrome();
    wireKeys();
    HA.on('change', s => { if (s !== false) roomList(); refreshValues(); });
    HA.on('select', () => { props(); roomList(); });
    HA.on('props', refreshValues);
    HA.on('tool', setTool);
    HA.on('placedone', () => { S.placing = null; $$('#catalog .catItem').forEach(b => b.classList.remove('on')); });
    roomList(); props();
    HA.plan.fit();
    setView('split');
    HA.status(HA.rooms().length + ' rooms · ' + HA.furn().length + ' items · autosaved in this browser');
  });

  /* ─────────────── left panel ─────────────── */
  function buildCatalog() {
    const box = $('#catalog'), groups = {};
    HA.furniture.catalog.forEach(d => (groups[d.g] || (groups[d.g] = [])).push(d));
    box.innerHTML = '';
    Object.keys(groups).forEach(g => {
      const sec = document.createElement('div');
      sec.className = 'catGroup';
      sec.innerHTML = '<h4>' + g + '</h4><div class="catItems"></div>';
      const wrap = sec.querySelector('.catItems');
      groups[g].forEach(d => {
        const b = document.createElement('button');
        b.className = 'catItem'; b.textContent = d.n; b.dataset.t = d.t;
        b.title = d.n + ' — ' + U.ft(d.w) + ' × ' + U.ft(d.d) + '. Click, then click in the plan.';
        b.onclick = () => {
          const on = S.placing === d.t;
          $$('#catalog .catItem').forEach(x => x.classList.remove('on'));
          S.placing = on ? null : d.t;
          if (!on) { b.classList.add('on'); setTool('select'); HA.status('Click in the floor plan to place the ' + d.n.toLowerCase() + ' (hold Shift to place several).'); }
        };
        wrap.appendChild(b);
      });
      box.appendChild(sec);
    });
    $('#furnSearch').oninput = e => {
      const q = e.target.value.toLowerCase();
      $$('#catalog .catGroup').forEach(sec => {
        let n = 0;
        sec.querySelectorAll('.catItem').forEach(b => {
          const ok = !q || b.textContent.toLowerCase().includes(q);
          b.style.display = ok ? '' : 'none'; if (ok) n++;
        });
        sec.style.display = n ? '' : 'none';
      });
    };
  }

  function buildSwatches() {
    const box = $('#swatches');
    HA.palette.forEach(([name, hex]) => {
      const d = document.createElement('div');
      d.className = 'sw'; d.style.background = hex; d.title = name + '  ' + hex;
      d.onclick = () => {
        S.paintColor = hex; S.paintName = name;
        $('#paintCustom').value = hex; $('#paintName').textContent = name;
        $$('#swatches .sw').forEach(x => x.classList.remove('on'));
        d.classList.add('on');
        setTool('paint');
      };
      box.appendChild(d);
    });
    $('#paintCustom').oninput = e => {
      S.paintColor = e.target.value; S.paintName = e.target.value;
      $('#paintName').textContent = e.target.value;
      $$('#swatches .sw').forEach(x => x.classList.remove('on'));
    };
  }

  function roomList() {
    const box = $('#roomList');
    box.innerHTML = '';
    HA.rooms().forEach(r => {
      const div = document.createElement('div');
      div.className = 'roomRow' + (S.sel && S.sel.id === r.id ? ' on' : '');
      const a = Math.round(Math.abs(U.area(r.points)));
      div.innerHTML = '<span class="nm">' + esc(r.name) + '</span><span class="sz">' + a + ' sf</span>';
      div.onclick = () => HA.select({ kind: 'room', id: r.id });
      box.appendChild(div);
    });
    if (!HA.rooms().length) box.innerHTML = '<p class="hint">No rooms yet — use the Room tool to drag one out.</p>';
  }

  /* ─────────────── properties ─────────────── */
  let propFields = [];

  function props() {
    const box = $('#props'), title = $('#propTitle');
    propFields = [];
    box.innerHTML = '';
    const sel = S.sel;
    if (!sel) {
      title.textContent = 'Nothing selected';
      box.innerHTML = '<p class="hint">Click a room, wall, door, window or piece of furniture in either view to edit it.</p>' +
        '<h3>Project</h3>';
      add(box, [
        { label: 'Name', type: 'text', get: () => S.project.name, set: v => { S.project.name = v; HA.changed(false); } }
      ]);
      const st = document.createElement('p');
      st.className = 'hint';
      st.style.marginTop = '12px';
      st.textContent = HA.rooms().length + ' rooms, ' +
        Math.round(HA.rooms().reduce((s, r) => s + Math.abs(U.area(r.points)), 0)) + ' sq ft total, ' +
        HA.furn().length + ' furnishings.';
      box.appendChild(st);
      return;
    }

    if (sel.kind === 'furniture') return furnProps(box, title, HA.item(sel.id));
    if (sel.kind === 'opening') {
      const r = HA.room(sel.roomId);
      const o = r && r.openings.find(k => k.id === sel.id);
      if (o) return openProps(box, title, r, o);
    }
    const room = HA.room(sel.id);
    if (!room) { HA.select(null); return; }
    roomProps(box, title, room, sel);
  }

  function roomProps(box, title, r, sel) {
    title.textContent = sel.kind === 'wall' ? 'Wall ' + (sel.index + 1) + ' — ' + r.name
      : sel.kind === 'vertex' ? 'Corner ' + (sel.index + 1) + ' — ' + r.name : r.name;

    if (sel.kind === 'wall') {
      h3(box, 'This wall');
      add(box, [
        {
          label: 'Paint', type: 'color',
          get: () => r.wallColors[sel.index] || r.wallColor,
          set: v => { r.wallColors[sel.index] = v; HA.changed(true); }
        },
        {
          label: 'Length', type: 'static',
          get: () => U.ft(HA.edgeRef(r, sel.index).len) + (HA.insideMode() ? ' clear' : ' outside')
        }
      ]);
      btns(box, [
        ['Same as room', () => { delete r.wallColors[sel.index]; HA.changed(true); }],
        ['Add door', () => addOpening(r, sel.index, 'door')],
        ['Add window', () => addOpening(r, sel.index, 'window')],
        ['Cased opening', () => addOpening(r, sel.index, 'opening')]
      ]);
    }
    if (sel.kind === 'vertex') {
      const p = r.points[sel.index];
      h3(box, 'Corner position');
      add(box, [
        { label: 'X', type: 'ft', get: () => p.x, set: v => { p.x = v; HA.changed(true); } },
        { label: 'Y', type: 'ft', get: () => p.z, set: v => { p.z = v; HA.changed(true); } }
      ]);
    }

    h3(box, 'Room');
    const rect = r.points.length === 4;
    add(box, [
      { label: 'Name', type: 'text', get: () => r.name, set: v => { r.name = v; HA.changed(false); roomList(); } },
      {
        label: 'Measured', type: 'select', get: () => S.project.dimMode || 'outside',
        options: [['outside', 'Outside of walls'], ['inside', 'Inside (clear)']],
        set: v => setDimMode(v)
      },
      rect ? { label: 'Width', type: 'ft', get: () => HA.dims(r).w, set: v => scaleRoom(r, v, null) } : null,
      rect ? { label: 'Depth', type: 'ft', get: () => HA.dims(r).d, set: v => scaleRoom(r, null, v) } : null,
      { label: 'Wall height', type: 'ft', get: () => r.wallHeight, set: v => { r.wallHeight = U.clamp(v, 5, 30); HA.changed(true); } },
      { label: 'Wall thick.', type: 'ft', get: () => r.wallThickness, set: v => { r.wallThickness = U.clamp(v, .17, 2); HA.changed(true); } },
      {
        label: 'Area', type: 'static',
        get: () => Math.round(HA.dims(r).area) + ' sq ft' + (HA.insideMode() ? ' clear' : ' to outside')
      }
    ]);

    h3(box, 'Ceiling');
    add(box, [
      {
        label: 'Shape', type: 'select', get: () => r.ceiling.type,
        options: [['flat', 'Flat'], ['gable', 'Vaulted gable'], ['flattop', 'Vaulted — flat top'],
        ['shed', 'Shed / slanted'], ['barrel', 'Cathedral barrel'], ['tray', 'Tray']],
        set: v => { r.ceiling.type = v; if (!r.ceiling.rise) r.ceiling.rise = 4; HA.changed(true); props(); }
      }
    ]);
    if (r.ceiling.type !== 'flat') {
      const span = HA.build.ceilInfo(r).span;
      add(box, [
        {
          label: 'Rise', type: 'range', min: .5, max: 14, step: .25, unit: 'ft',
          get: () => r.ceiling.rise, fmt: v => U.ft(v),
          set: v => { r.ceiling.rise = v; HA.changed(true); }
        },
        r.ceiling.type === 'flattop' ? {
          label: 'Flat top', type: 'range', min: 0, max: Math.round(span * 4) / 4, step: .25, unit: 'ft',
          get: () => Math.min(r.ceiling.flat, span), fmt: v => U.ft(v),
          set: v => { r.ceiling.flat = v; HA.changed(true); }
        } : null,
        {
          label: 'Direction', type: 'range', min: 0, max: 180, step: 5, unit: 'deg',
          get: () => r.ceiling.angle, fmt: v => v + '°',
          set: v => { r.ceiling.angle = v; HA.changed(true); }
        },
        { label: 'Peak', type: 'static', get: () => U.ft(r.wallHeight + r.ceiling.rise) },
        r.ceiling.type === 'flattop' ? {
          label: 'Slope', type: 'static',
          get: () => {
            const run = (span - Math.min(r.ceiling.flat, span)) / 2;
            return run > .05 ? (r.ceiling.rise / run * 12).toFixed(1) + ' in 12' : 'flat';
          }
        } : null
      ]);
    }

    h3(box, 'Finishes');
    add(box, [
      { label: 'Walls', type: 'color', get: () => r.wallColor, set: v => { r.wallColor = v; r.wallColors = {}; HA.changed(true); } },
      {
        label: 'Flooring', type: 'select', get: () => r.floorMat || 'plank',
        options: HA.tex.list,
        set: v => { r.floorMat = v; HA.changed(true); props(); }
      },
      HA.tex.directional[r.floorMat] ? {
        label: 'Direction', type: 'select', get: () => String(r.floorAngle || 0),
        options: [['0', 'Runs left–right'], ['90', 'Runs up–down'], ['45', 'Diagonal 45°'], ['135', 'Diagonal 135°']],
        set: v => { r.floorAngle = +v; HA.changed(true); }
      } : null,
      { label: 'Floor tint', type: 'color', get: () => r.floorColor, set: v => { r.floorColor = v; HA.changed(true); } },
      { label: 'Ceiling', type: 'color', get: () => r.ceilColor, set: v => { r.ceilColor = v; HA.changed(true); } },
      { label: 'Trim', type: 'color', get: () => r.trimColor, set: v => { r.trimColor = v; HA.changed(true); } },
      { label: 'Baseboard', type: 'check', get: () => r.baseboard, set: v => { r.baseboard = v; HA.changed(true); } },
      { label: 'Crown', type: 'check', get: () => r.crown, set: v => { r.crown = v; HA.changed(true); } }
    ]);
    floorSwatch(box, r);

    btns(box, [
      ['Duplicate', () => {
        HA.snapshot();
        const c = U.clone(r); c.id = U.uid('r'); c.name = r.name + ' copy';
        c.points.forEach(p => { p.x += 3; p.z += 3; });
        c.openings.forEach(o => o.id = U.uid('o'));
        HA.rooms().push(c); HA.select({ kind: 'room', id: c.id }); HA.changed(true);
      }],
      ['Apply paint', () => { HA.snapshot(); r.wallColor = S.paintColor; r.wallColors = {}; HA.changed(true); }],
      ['Delete room', () => {
        if (!confirm('Delete ' + r.name + '?')) return;
        HA.snapshot();
        S.project.rooms = HA.rooms().filter(x => x.id !== r.id);
        HA.select(null); HA.changed(true);
      }, 'danger']
    ]);
  }

  function openProps(box, title, r, o) {
    title.textContent = (o.kind === 'door' ? 'Door' : o.kind === 'window' ? 'Window' : 'Cased opening') + ' — ' + r.name;
    const L = U.edgeLen(r.points, o.edge);
    const ref = HA.edgeRef(r, o.edge);        // 'along wall' is measured on the face you chose
    const twin = HA.twinOf(o);
    const sync = () => { HA.syncTwin(r, o); HA.changed(true); };   // keep the far side matching
    add(box, [
      {
        label: 'Type', type: 'select', get: () => o.kind,
        options: [['door', 'Door'], ['window', 'Window'], ['opening', 'Cased opening']],
        set: v => { o.kind = v; sync(); props(); }
      },
      { label: 'Width (R.O.)', type: 'ft', get: () => o.width, set: v => { o.width = U.clamp(v, .8, L - .4); sync(); } },
      {
        label: 'Trim to trim', type: 'ft',
        get: () => o.width + 2 * HA.casingOf(o),
        set: v => { o.width = U.clamp(v - 2 * HA.casingOf(o), .8, L - .4); sync(); }
      },
      { label: 'Height (R.O.)', type: 'ft', get: () => o.height, set: v => { o.height = U.clamp(v, .8, 14); sync(); } },
      {
        label: 'Trim height', type: 'ft',
        get: () => o.height + HA.casingOf(o),
        set: v => { o.height = U.clamp(v - HA.casingOf(o), .8, 14); sync(); }
      },
      { label: 'Sill height', type: 'ft', get: () => o.sill, set: v => { o.sill = U.clamp(v, 0, 12); sync(); } },
      {
        label: 'Casing width', type: 'ft', get: () => HA.casingOf(o),
        set: v => { o.casing = U.clamp(v, 0, 1); sync(); }
      },
      {
        label: 'Along wall', type: 'range', min: 0, max: Math.max(1, ref.len), step: .25, unit: 'ft',
        get: () => o.offset - ref.s0, fmt: v => U.ft(v),
        set: v => { o.offset = U.clamp(v + ref.s0, o.width / 2, L - o.width / 2); sync(); }
      },
      twin ? { label: 'Shared with', type: 'static', get: () => twin.room.name + ' — both sides cut' } : null,
      {
        label: 'Trim edges', type: 'static',
        get: () => {
          const c = HA.casingOf(o);
          return U.ft(o.offset - o.width / 2 - c - ref.s0) + ' and ' +
            U.ft(o.offset + o.width / 2 + c - ref.s0) + ' from the corner';
        }
      },
      o.kind === 'window' ? {
        label: 'Glass', type: 'static',
        get: () => U.ft(Math.max(0, o.width - .2)) + ' × ' + U.ft(Math.max(0, o.height - .2))
      } : null,
      {
        label: 'Wall', type: 'static',
        get: () => 'edge ' + (o.edge + 1) + ' of ' + r.points.length + ', ' + U.ft(ref.len) + ' long'
          + (HA.insideMode() ? ' (clear)' : '')
      },
      { label: 'Color', type: 'color', get: () => o.color, set: v => { o.color = v; HA.changed(true); } }
    ]);
    const list = [
      ['Delete', () => {
        HA.snapshot();
        HA.dropOpening(r, o);
        HA.select({ kind: 'room', id: r.id }); HA.changed(true);
      }, 'danger', twin ? 'Removes it from both sides of the wall' : null]
    ];
    if (o.kind === 'door') list.unshift(['Flip swing', () => { o.swing = o.swing === -1 ? 1 : -1; sync(); }]);
    if (o.kind === 'window') list.unshift(['Floor to ceiling', () => { o.sill = 0; o.height = r.wallHeight - 0.6; sync(); props(); }]);
    list.unshift(['Full height', () => {
      o.sill = 0; o.height = Math.max(6.8, r.wallHeight - 0.9); o.kind = 'opening'; sync(); props();
    }, null, 'Turn it into a full-height cased opening']);
    /* room on the far side arrived later — offer to break through its wall too */
    if (!twin && HA.twinFor(r, o.edge)) {
      list.unshift(['Cut far side too', () => {
        HA.snapshot(); HA.syncTwin(r, o); HA.changed(true); props();
        HA.status('Now cut through both sides of the wall.');
      }, null, 'Another room backs onto this wall — cut its side as well']);
    }
    btns(box, list);
  }

  function furnProps(box, title, f) {
    if (!f) { HA.select(null); return; }
    const def = HA.furniture.def(f.type);
    title.textContent = def ? def.n : f.type;
    add(box, [
      { label: 'Width', type: 'ft', get: () => f.w, set: v => { f.w = U.clamp(v, .3, 40); HA.changed(true); } },
      { label: 'Depth', type: 'ft', get: () => f.d, set: v => { f.d = U.clamp(v, .3, 40); HA.changed(true); } },
      { label: 'Height', type: 'ft', get: () => f.h, set: v => { f.h = U.clamp(v, .1, 20); HA.changed(true); } },
      { label: 'Off floor', type: 'ft', get: () => f.elev, set: v => { f.elev = U.clamp(v, 0, 20); HA.changed(true); } },
      {
        label: 'Rotation', type: 'range', min: 0, max: 359, step: 5, unit: 'deg', get: () => f.rot,
        fmt: v => v + '°', set: v => { f.rot = v; HA.changed(true); }
      },
      { label: 'X', type: 'ft', get: () => f.x, set: v => { f.x = v; HA.changed(true); } },
      { label: 'Y', type: 'ft', get: () => f.z, set: v => { f.z = v; HA.changed(true); } },
      { label: 'Color', type: 'color', get: () => f.color, set: v => { f.color = v; HA.changed(true); } },
      def && def.c2 ? { label: 'Accent', type: 'color', get: () => f.color2 || def.c2, set: v => { f.color2 = v; HA.changed(true); } } : null
    ]);
    btns(box, [
      ['Duplicate', () => {
        HA.snapshot();
        const c = U.clone(f); c.id = U.uid('f'); c.x += 2; c.z += 2;
        HA.furn().push(c); HA.select({ kind: 'furniture', id: c.id }); HA.changed(true);
      }],
      ['Rotate 90°', () => { HA.snapshot(); f.rot = (f.rot + 90) % 360; HA.changed(true); }],
      ['Reset size', () => {
        HA.snapshot(); f.w = def.w; f.d = def.d; f.h = def.h; f.elev = def.elev || 0; HA.changed(true); props();
      }],
      ['Delete', () => {
        HA.snapshot();
        S.project.furniture = HA.furn().filter(x => x.id !== f.id);
        HA.select(null); HA.changed(true);
      }, 'danger']
    ]);

    h3(box, 'Position in room');
    btns(box, [
      ['Against wall', () => snapToWall(f), null, 'Back the piece up to the nearest wall'],
      ['Into corner', () => snapToCorner(f), null, 'Tuck it into the nearest corner, back and side to the walls'],
      ['Center', () => centerIn(f, 'both'), null, 'Center it in the room both ways'],
      ['Center ↔', () => centerIn(f, 'x'), null, 'Center left to right only — keeps its distance from the top and bottom walls'],
      ['Center ↕', () => centerIn(f, 'z'), null, 'Center top to bottom only — keeps its distance from the side walls']
    ]);
  }

  /** the room a piece belongs to — the one it sits in, else the nearest */
  function roomFor(f) {
    const r = HA.roomAt(f.x, f.z);
    if (r) return r;
    let best = null;
    HA.rooms().forEach(x => {
      const c = U.centroid(x.points), d = Math.hypot(c.x - f.x, c.z - f.z);
      if (!best || d < best.d) best = { d: d, r: x };
    });
    return best ? best.r : null;
  }

  /** center a piece in its room — both ways, or along one axis only */
  function centerIn(f, axis) {
    const r = roomFor(f);
    if (!r) return HA.status('Draw a room first.');
    const b = U.bbox(U.inset(r.points, r.wallThickness || 0));   // the clear space
    HA.snapshot();
    if (axis !== 'z') f.x = (b.x0 + b.x1) / 2;
    if (axis !== 'x') f.z = (b.z0 + b.z1) / 2;
    HA.changed(true); props();
    HA.status('Centered ' + (axis === 'x' ? 'left to right' : axis === 'z' ? 'top to bottom' : '')
      + ' in ' + r.name + '.');
  }

  /** push a piece of furniture back against the nearest wall of the room it sits in */
  function snapToWall(f) {
    const r = roomFor(f);
    if (!r) return HA.status('Draw a room first.');
    let best = null;
    r.points.forEach((a, i) => {
      const b = r.points[(i + 1) % r.points.length];
      const g = U.seg(f.x, f.z, a, b);
      if (!best || g.d < best.d) best = { d: g.d, i, a, b, g };
    });
    HA.snapshot();
    const a = best.a, b = best.b, L = Math.hypot(b.x - a.x, b.z - a.z);
    const ex = { x: (b.x - a.x) / L, z: (b.z - a.z) / L };
    const inw = { x: -ex.z, z: ex.x };
    const off = r.wallThickness + f.d / 2 + .02;
    f.x = best.g.x + inw.x * off; f.z = best.g.z + inw.z * off;
    f.rot = ((Math.atan2(-inw.x, inw.z) * 180 / Math.PI) % 360 + 360) % 360;
    HA.changed(true); props();
  }

  /** tuck a piece into the nearest corner: back to one wall, side to the other */
  function snapToCorner(f) {
    const r = roomFor(f);
    if (!r) return HA.status('Draw a room first.');
    const ins = U.inset(r.points, r.wallThickness || 0);   // the inside faces of the walls
    const n = ins.length;
    if (n < 3) return;
    let best = null;
    ins.forEach((p, i) => {
      const d = Math.hypot(f.x - p.x, f.z - p.z);
      if (!best || d < best.d) best = { d: d, i: i, p: p };
    });
    const i = best.i, C = best.p;
    const prev = ins[(i - 1 + n) % n], next = ins[(i + 1) % n];
    /* inward normal of a wall running a → b */
    const inwOf = (a, b) => {
      const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      return { x: -(b.z - a.z) / L, z: (b.x - a.x) / L };
    };
    const A = inwOf(prev, C), B = inwOf(C, next);          // the two walls meeting here
    const rotFor = m => ((Math.atan2(-m.x, m.z) * 180 / Math.PI) % 360 + 360) % 360;
    /* back against either wall — keep whichever is closer to how it is already turned */
    const opts = [{ rot: rotFor(A), back: A, side: B }, { rot: rotFor(B), back: B, side: A }];
    const off = a => { const x = Math.abs(((a - f.rot) % 360 + 360) % 360); return Math.min(x, 360 - x); };
    const c = off(opts[0].rot) <= off(opts[1].rot) ? opts[0] : opts[1];

    HA.snapshot();
    const gap = .02;
    const dd = f.d / 2 + gap, ww = f.w / 2 + gap;
    f.rot = c.rot;
    f.x = C.x + c.back.x * dd + c.side.x * ww;
    f.z = C.z + c.back.z * dd + c.side.z * ww;
    HA.changed(true); props();
    HA.status('Tucked into corner ' + (i + 1) + ' of ' + r.name + '.');
  }

  function addOpening(r, edge, kind) {
    HA.snapshot();
    const L = U.edgeLen(r.points, edge);
    const o = HA.newOpening(kind, edge, L / 2);
    o.width = Math.min(o.width, L - .6);
    r.openings.push(o);
    HA.syncTwin(r, o);
    HA.select({ kind: 'opening', id: o.id, roomId: r.id });
    HA.changed(true);
  }

  /** w/d arrive in whichever mode is active; the polygon is always the outside face */
  function scaleRoom(r, w, d) {
    const b = U.bbox(r.points);
    const pad = HA.insideMode() ? 2 * (r.wallThickness || 0) : 0;
    const tw = w != null ? Math.max(.5, w + pad) : null;
    const td = d != null ? Math.max(.5, d + pad) : null;
    const sx = tw ? tw / Math.max(.1, b.w) : 1, sz = td ? td / Math.max(.1, b.d) : 1;
    HA.snapshot();
    r.points.forEach(p => {
      p.x = b.x0 + (p.x - b.x0) * sx;
      p.z = b.z0 + (p.z - b.z0) * sz;
    });
    HA.changed(true); props();
  }

  /** actual-size preview of the room's flooring, clickable to cycle through materials */
  function floorSwatch(box, r) {
    const kind = r.floorMat || 'plank';
    const row = document.createElement('div');
    row.className = 'row';
    const img = document.createElement('img');
    img.className = 'floorPrev';
    img.src = HA.tex.preview(kind, r.floorColor, 96);
    img.title = 'Click to try the next flooring';
    img.onclick = () => {
      const ks = HA.tex.list.map(x => x[0]);
      r.floorMat = ks[(ks.indexOf(kind) + 1) % ks.length];
      HA.changed(true); props();
    };
    const cap = document.createElement('div');
    cap.className = 'hint';
    cap.style.margin = '0';
    const nm = (HA.tex.list.find(x => x[0] === kind) || ['', 'Flat color'])[1];
    cap.innerHTML = '<b>' + esc(nm) + '</b><br>about 4 ft of floor';
    row.appendChild(img); row.appendChild(cap);
    box.appendChild(row);
  }

  /* ── field factory ── */
  function h3(box, t) { const h = document.createElement('h3'); h.textContent = t; box.appendChild(h); }

  function add(box, defs) {
    defs.filter(Boolean).forEach(d => {
      const row = document.createElement('div'); row.className = 'row';
      const lab = document.createElement('label'); lab.textContent = d.label;
      const val = document.createElement('div'); val.className = 'val';
      row.appendChild(lab); row.appendChild(val);
      let input;
      if (d.type === 'static') {
        input = document.createElement('span');
        input.className = 'readout'; input.style.textAlign = 'left';
        input.textContent = d.get();
        propFields.push({ el: input, txt: true, get: d.get });
      } else if (d.type === 'select') {
        input = document.createElement('select');
        d.options.forEach(([v, t]) => {
          const o = document.createElement('option'); o.value = v; o.textContent = t;
          input.appendChild(o);
        });
        input.value = d.get();
        input.onchange = () => d.set(input.value);
        propFields.push({ el: input, get: d.get });
      } else if (d.type === 'color') {
        input = document.createElement('input'); input.type = 'color'; input.value = d.get();
        input.oninput = () => d.set(input.value);
        const use = document.createElement('button');
        use.textContent = 'Use paint'; use.style.flex = '1';
        use.onclick = () => { input.value = S.paintColor; d.set(S.paintColor); };
        val.appendChild(input); val.appendChild(use);
        propFields.push({ el: input, get: d.get });
        box.appendChild(row); return;
      } else if (d.type === 'check') {
        input = document.createElement('input'); input.type = 'checkbox'; input.checked = !!d.get();
        input.onchange = () => d.set(input.checked);
        propFields.push({ el: input, check: true, get: d.get });
      } else if (d.type === 'range') {
        input = document.createElement('input'); input.type = 'range';
        input.min = d.min; input.max = d.max; input.step = d.step; input.value = d.get();
        const fmt = d.fmt || (v => String(v));
        /* the readout is typeable: drag the slider or key an exact value */
        const ro = document.createElement('input');
        ro.type = 'text'; ro.className = 'readout';
        ro.title = 'Type an exact value';
        ro.value = fmt(+input.value);
        input.oninput = () => { ro.value = fmt(+input.value); d.set(+input.value); };
        const commit = () => {
          let v = d.unit === 'deg' ? parseFloat(ro.value) : U.parseFt(ro.value, d.get());
          if (!isFinite(v)) v = d.get();
          v = U.clamp(v, +d.min, +d.max);
          input.value = v; ro.value = fmt(v); d.set(v);
        };
        ro.onchange = commit;
        ro.onkeydown = e => { if (e.key === 'Enter') { commit(); ro.blur(); } };
        val.appendChild(input); val.appendChild(ro);
        propFields.push({ el: input, get: d.get, ro: ro, fmt: fmt });
        box.appendChild(row); return;
      } else {
        input = document.createElement('input');
        input.type = 'text';
        input.value = d.type === 'ft' ? U.ft(d.get()) : d.get();
        const commit = () => {
          if (d.type === 'ft') {
            const v = U.parseFt(input.value, d.get());
            d.set(v); input.value = U.ft(d.get());
          } else d.set(input.value);
        };
        input.onchange = commit;
        input.onkeydown = e => { if (e.key === 'Enter') { commit(); input.blur(); } };
        propFields.push({ el: input, get: d.get, ftv: d.type === 'ft' });
      }
      val.appendChild(input);
      box.appendChild(row);
    });
  }

  function btns(box, list) {
    const row = document.createElement('div'); row.className = 'btnRow';
    list.forEach(([t, fn, cls, tip]) => {
      const b = document.createElement('button');
      b.textContent = t; if (cls) b.className = cls; if (tip) b.title = tip;
      b.onclick = fn;
      row.appendChild(b);
    });
    box.appendChild(row);
  }

  function refreshValues() {
    propFields.forEach(f => {
      if (f.el === document.activeElement || f.ro === document.activeElement) return;
      const v = f.get();
      if (f.txt) f.el.textContent = v;
      else if (f.check) f.el.checked = !!v;
      else if (f.ro) { f.el.value = v; f.ro.value = f.fmt ? f.fmt(+v) : v; }
      else f.el.value = f.ftv ? U.ft(v) : v;
    });
  }

  /* ─────────────── chrome ─────────────── */
  function setTool(t) {
    S.tool = t;
    if (t !== 'select') { S.placing = null; $$('#catalog .catItem').forEach(b => b.classList.remove('on')); }
    $$('.tool').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
    if (t === 'paint') showTab('paintTab');
    const tips = {
      select: 'Select — drag rooms, corners and furniture. Click furniture in 3D to move it.',
      rect: 'Room — drag out a rectangle in the floor plan.',
      poly: 'Shape — click each corner, then click the first corner (or press Enter) to close.',
      door: 'Door — click a wall in the floor plan.',
      window: 'Window — click a wall in the floor plan.',
      opening: 'Opening — click a wall to cut an open pass-through. On a shared wall both sides are cut.',
      paint: 'Paint — pick a color, then click a wall, floor or ceiling in the 3D view.'
    };
    HA.status(tips[t] || '');
    HA.plan.draw();
  }
  HA.setTool = setTool;

  /** outside-of-walls vs wall-to-wall; one setting drives every dimension in the app */
  function setDimMode(v) {
    S.project.dimMode = v === 'inside' ? 'inside' : 'outside';
    const sel = $('#dimMode');
    if (sel) sel.value = S.project.dimMode;
    HA.changed(false);
    props(); roomList();
    HA.status(S.project.dimMode === 'inside'
      ? 'Dimensions are wall-to-wall inside the room. Type the size you measured and the walls are added outside it.'
      : 'Dimensions are to the outside face of the walls.');
  }

  function showTab(name) {
    $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
    $$('.panel').forEach(p => p.classList.toggle('on', p.dataset.panel === name));
  }

  function setView(v) {
    document.body.dataset.view = v;
    $$('#viewSeg button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    requestAnimationFrame(() => { HA.plan.resize(); HA.view.resize(); });
  }

  function wireChrome() {
    $$('.tool').forEach(b => b.onclick = () => setTool(b.dataset.tool));
    $$('.tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
    $$('#viewSeg button').forEach(b => b.onclick = () => setView(b.dataset.view));
    $('#dimMode').value = S.project.dimMode || 'outside';
    $('#dimMode').onchange = e => setDimMode(e.target.value);
    $('#btnUndo').onclick = HA.undo;
    $('#btnRedo').onclick = HA.redo;
    $('#btnFit').onclick = () => { HA.plan.fit(); HA.view.fit(); };
    $('#btnWalk').onclick = () => HA.view.setWalk(!$('#btnWalk').classList.contains('on'));
    $('#btnHelp').onclick = () => $('#helpModal').hidden = false;
    $('#helpClose').onclick = () => $('#helpModal').hidden = true;
    $('#btnAddRoom').onclick = () => {
      HA.snapshot();
      const b = HA.rooms().length ? U.bbox([].concat.apply([], HA.rooms().map(r => r.points))) : { x0: 0, z0: 0, x1: 0, z1: 0 };
      const x = HA.rooms().length ? b.x1 + 2 : 0, z = HA.rooms().length ? b.z0 : 0;
      const r = HA.newRoom('Room ' + (HA.rooms().length + 1),
        [{ x: x, z: z }, { x: x + 14, z: z }, { x: x + 14, z: z + 12 }, { x: x, z: z + 12 }]);
      HA.rooms().push(r);
      HA.select({ kind: 'room', id: r.id });
      HA.changed(true); HA.plan.fit();
    };

    $('#btnNew').onclick = () => {
      if (!confirm('Start a new, empty plan? Your current work will be replaced (use Save file first).')) return;
      HA.snapshot();
      S.project = HA.blank();
      S.project.rooms.push(HA.newRoom('Room 1', [{ x: 0, z: 0 }, { x: 16, z: 0 }, { x: 16, z: 14 }, { x: 0, z: 14 }]));
      HA.select(null); HA.changed(true); HA.plan.fit(); HA.view.fit(); roomList();
    };

    $('#btnSave').onclick = () => {
      const blob = new Blob([JSON.stringify(S.project, null, 1)], { type: 'application/json' });
      dl(blob, (S.project.name || 'home').replace(/\W+/g, '-').toLowerCase() + '.json');
      HA.status('Saved a copy to your Downloads folder.');
    };
    $('#btnOpen').onclick = () => $('#fileInput').click();
    $('#fileInput').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const p = HA.migrate(JSON.parse(rd.result));
          if (!p) throw new Error('bad file');
          HA.snapshot();
          S.project = p;
          HA.select(null); HA.changed(true); roomList(); HA.plan.fit(); HA.view.fit();
          HA.status('Opened ' + f.name);
        } catch (err) { alert('That file could not be read as a plan.'); }
      };
      rd.readAsText(f);
      e.target.value = '';
    };
    $('#btnShot').onclick = () => {
      const url = HA.view.snapshot();
      const bin = atob(url.split(',')[1]);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      dl(new Blob([buf], { type: 'image/png' }),
        (S.project.name || 'home').replace(/\W+/g, '-').toLowerCase() + '-view.png');
      HA.status('Saved a PNG of the 3D view to Downloads.');
    };
  }

  function dl(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function wireKeys() {
    window.addEventListener('keydown', e => {
      const t = e.target.tagName;
      if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') {
        if (e.key === 'Escape') e.target.blur();
        return;
      }
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? HA.redo() : HA.undo(); return; }
      if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); HA.redo(); return; }
      if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); $('#btnSave').click(); return; }
      if (ctrl && e.key.toLowerCase() === 'd') { e.preventDefault(); dupSel(); return; }

      switch (e.key) {
        case 'Delete': case 'Backspace': e.preventDefault(); delSel(); break;
        case 'Escape':
          HA.plan.cancelDraft();
          if ($('#btnWalk').classList.contains('on')) HA.view.setWalk(false);
          S.placing = null; $$('#catalog .catItem').forEach(b => b.classList.remove('on'));
          HA.select(null);
          break;
        case 'Enter': HA.plan.closePoly(); break;
        case 'v': case 'V': setTool('select'); break;
        case '1': setTool('rect'); break;
        case '2': setTool('poly'); break;
        case '3': setTool('door'); break;
        case '4': setTool('window'); break;
        case '5': setTool('opening'); break;
        case '6': setTool('paint'); break;
        case 'b': case 'B': setTool('paint'); break;
        case 'f': case 'F': HA.view.setWalk(!$('#btnWalk').classList.contains('on')); break;
        case '0': HA.plan.fit(); HA.view.fit(); break;
        case 'r': case 'R': rotSel(e.shiftKey ? -15 : 15); break;
        case '[': rotSel(-15); break;
        case ']': rotSel(15); break;
      }
    });
  }

  function delSel() {
    const s = S.sel; if (!s) return;
    HA.snapshot();
    if (s.kind === 'furniture') S.project.furniture = HA.furn().filter(x => x.id !== s.id);
    else if (s.kind === 'opening') {
      const r = HA.room(s.roomId);
      const o = r && r.openings.find(x => x.id === s.id);
      if (o) HA.dropOpening(r, o);
    } else if (s.kind === 'vertex') {
      const r = HA.room(s.id);
      if (r.points.length > 3) {
        r.points.splice(s.index, 1);
        r.openings = r.openings.filter(o => o.edge < r.points.length);
      }
    } else S.project.rooms = HA.rooms().filter(x => x.id !== s.id);
    HA.select(null); HA.changed(true);
  }

  function dupSel() {
    const s = S.sel; if (!s || s.kind !== 'furniture') return;
    HA.snapshot();
    const f = HA.item(s.id), c = U.clone(f);
    c.id = U.uid('f'); c.x += 2; c.z += 2;
    HA.furn().push(c); HA.select({ kind: 'furniture', id: c.id }); HA.changed(true);
  }

  function rotSel(d) {
    const s = S.sel; if (!s || s.kind !== 'furniture') return;
    const f = HA.item(s.id);
    HA.snapshot();
    f.rot = ((f.rot + d) % 360 + 360) % 360;
    HA.changed(true); HA.emit('props');
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
})();
