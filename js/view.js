/* view.js — the 3D viewport: orbit + walkthrough camera, picking, painting, drag-to-move. */
(function () {
  const HA = window.HA, U = HA.util, S = HA.state;
  const V = HA.view = {};

  let cv, renderer, scene, camera, root, sun, hemi, ground;
  let built = { pick: [], walls: [], items: [] };
  const itemGroups = new Map();
  let W = 1, H = 1, dirty = true;

  const orbit = { target: new THREE.Vector3(18, 4, 15), dist: 46, theta: -0.9, phi: 1.05 };
  const walk = { on: false, pos: new THREE.Vector3(11, 5.4, 8), yaw: 0, pitch: 0, keys: {} };
  let drag = null;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  V.init = function () {
    cv = document.getElementById('view3d');
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    scene.background = new THREE.Color('#7d8f9c');      // sky — what you see out the windows
    scene.fog = new THREE.Fog('#7d8f9c', 200, 460);

    camera = new THREE.PerspectiveCamera(52, 1, .08, 900);

    hemi = new THREE.HemisphereLight(0xdfe8f2, 0x40382e, .95);
    scene.add(hemi);
    sun = new THREE.DirectionalLight(0xfff2df, 1.55);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -60; c.right = 60; c.top = 60; c.bottom = -60; c.near = 1; c.far = 220;
    sun.shadow.bias = -0.0008;
    scene.add(sun, sun.target);
    scene.add(new THREE.AmbientLight(0xffffff, .22));

    ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600),
      new THREE.MeshStandardMaterial({ color: new THREE.Color('#2c3128'), roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -.04;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(400, 400, 0x2a3138, 0x232a30);
    grid.position.y = -.03;
    grid.material.opacity = .35; grid.material.transparent = true;
    scene.add(grid);

    root = new THREE.Group();
    scene.add(root);

    resize();
    new ResizeObserver(resize).observe(cv.parentElement);
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    cv.addEventListener('wheel', wheel, { passive: false });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => { walk.keys[e.code] = true; });
    window.addEventListener('keyup', e => { walk.keys[e.code] = false; });

    ['ceilChk', 'cutChk', 'shadowChk'].forEach(id =>
      document.getElementById(id).addEventListener('change', () => { V.rebuild(); }));
    document.getElementById('sunRange').addEventListener('input', () => { placeSun(); dirty = true; });

    HA.on('change', s => { if (s !== false) V.rebuild(); else dirty = true; });
    HA.on('select', () => { dirty = true; });

    V.rebuild();
    V.fit();
    requestAnimationFrame(loop);
  };

  function resize() {
    if (!cv || !cv.parentElement) return;
    W = Math.max(1, cv.parentElement.clientWidth);
    H = Math.max(1, cv.parentElement.clientHeight);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    dirty = true;
  }
  V.resize = resize;

  function placeSun() {
    const a = (+document.getElementById('sunRange').value) * Math.PI / 180;
    const c = U.centroid(allPts().length ? allPts() : [{ x: 0, z: 0 }]);
    sun.position.set(c.x + Math.sin(a) * 70, 62, c.z + Math.cos(a) * 70);
    sun.target.position.set(c.x, 0, c.z);
    sun.target.updateMatrixWorld();
  }

  function allPts() {
    const p = [];
    HA.rooms().forEach(r => p.push.apply(p, r.points));
    HA.walls().forEach(w => p.push(w.a, w.b));
    return p;
  }

  /* ─────────── (re)build the scene from the model ─────────── */
  V.rebuild = function () {
    while (root.children.length) {
      const g = root.children.pop();
      dispose(g);
    }
    itemGroups.clear();
    built = HA.build.house(root, { ceiling: document.getElementById('ceilChk').checked });
    built.items.forEach(g => itemGroups.set(g.userData.id, g));
    renderer.shadowMap.enabled = document.getElementById('shadowChk').checked;
    placeSun();
    dirty = true;
  };

  function dispose(o) {
    o.traverse(n => {
      if (!n.isMesh) return;
      if (n.geometry && !n.geometry.userData.shared) n.geometry.dispose();
      const m = n.material;
      (Array.isArray(m) ? m : [m]).forEach(x => { if (x && !x.userData.cached) x.dispose(); });
    });
  }

  V.fit = function () {
    const pts = allPts();
    if (!pts.length) return;
    const b = U.bbox(pts);
    orbit.target.set((b.x0 + b.x1) / 2, 4, (b.z0 + b.z1) / 2);
    orbit.dist = U.clamp(Math.max(b.w, b.d) * 1.5, 14, 300);
    orbit.theta = -0.9; orbit.phi = 1.03;
    dirty = true;
  };

  /* ─────────── camera ─────────── */
  function applyCam() {
    if (walk.on) {
      camera.position.copy(walk.pos);
      const dir = new THREE.Vector3(
        Math.sin(walk.yaw) * Math.cos(walk.pitch),
        Math.sin(walk.pitch),
        Math.cos(walk.yaw) * Math.cos(walk.pitch));
      camera.lookAt(walk.pos.clone().add(dir));
    } else {
      orbit.phi = U.clamp(orbit.phi, .05, Math.PI / 2 - .02);
      orbit.dist = U.clamp(orbit.dist, 2, 400);
      camera.position.set(
        orbit.target.x + orbit.dist * Math.sin(orbit.phi) * Math.sin(orbit.theta),
        orbit.target.y + orbit.dist * Math.cos(orbit.phi),
        orbit.target.z + orbit.dist * Math.sin(orbit.phi) * Math.cos(orbit.theta));
      camera.lookAt(orbit.target);
    }
  }

  V.setWalk = function (on) {
    walk.on = on;
    document.getElementById('walkHud').hidden = !on;
    document.getElementById('btnWalk').classList.toggle('on', on);
    const cc = document.getElementById('ceilChk');
    if (on) {
      V._ceilWas = cc.checked;
      if (!cc.checked) { cc.checked = true; V.rebuild(); }
      /* start in whatever room is selected, otherwise the first one */
      const sel = S.sel && S.sel.kind !== 'furniture' ? HA.room(S.sel.id) : null;
      const r = sel || HA.rooms()[0];
      if (r) {
        const c = U.centroid(r.points);
        walk.pos.set(c.x, 5.4, c.z);
      }
      walk.yaw = Math.PI; walk.pitch = 0;
    } else if (V._ceilWas === false) {
      cc.checked = false; V.rebuild();
    }
    dirty = true;
  };

  /* ─────────── interaction ─────────── */
  function setNdc(e) {
    const r = cv.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }
  function hit() {
    ray.setFromCamera(ndc, camera);
    const list = built.pick.filter(o => o.visible && (!o.parent || o.parent.visible));
    const h = ray.intersectObjects(list, false);
    return h.length ? h[0] : null;
  }

  function down(e) {
    cv.setPointerCapture(e.pointerId);
    setNdc(e);
    if (walk.on) { drag = { kind: 'look', x: e.clientX, y: e.clientY }; return; }

    if (e.button === 0 && (S.tool === 'paint')) {
      const h = hit();
      if (h) paint(h.object);
      return;
    }
    let pend;
    if (e.button === 0 && S.tool === 'select') {
      const h = hit();
      if (h) {
        const ud = h.object.userData;
        if (ud.itemId) {                          // grab furniture straight away
          const it = HA.item(ud.itemId);
          HA.select({ kind: 'furniture', id: ud.itemId });
          HA.snapshot();
          const p = groundPoint(it ? (it.elev || 0) : 0);
          drag = { kind: 'item', id: ud.itemId, y: it ? (it.elev || 0) : 0, dx: p ? p.x - it.x : 0, dz: p ? p.z - it.z : 0, moved: false };
          return;
        }
        if (ud.kind === 'wall') pend = { kind: 'wall', id: ud.roomId, index: ud.edge };
        else if (ud.kind === 'swall') pend = { kind: 'swall', id: ud.wallId };
        else if (ud.kind === 'floor' || ud.kind === 'ceiling') pend = { kind: 'room', id: ud.roomId };
      } else pend = null;                          // click on the sky clears the selection
    }
    /* a click selects, a drag orbits — decided on pointerup */
    if (e.button === 2 || e.shiftKey) drag = { kind: 'pan', x: e.clientX, y: e.clientY };
    else if (e.button === 0) drag = { kind: 'orbit', x: e.clientX, y: e.clientY, travel: 0, pend: pend, hasPend: pend !== undefined };
  }

  function groundPoint(y) {
    ray.setFromCamera(ndc, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(y || 0));
    const p = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, p) ? p : null;
  }

  function move(e) {
    if (!drag) return;
    setNdc(e);
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    switch (drag.kind) {
      case 'look':
        walk.yaw -= dx * .005; walk.pitch = U.clamp(walk.pitch - dy * .004, -1.3, 1.3);
        break;
      case 'orbit':
        drag.travel += Math.abs(dx) + Math.abs(dy);
        orbit.theta -= dx * .007; orbit.phi -= dy * .007;
        break;
      case 'pan': {
        const k = orbit.dist * .0016;
        const right = new THREE.Vector3(Math.cos(orbit.theta), 0, -Math.sin(orbit.theta));
        const fwd = new THREE.Vector3(Math.sin(orbit.theta), 0, Math.cos(orbit.theta));
        orbit.target.addScaledVector(right, -dx * k).addScaledVector(fwd, -dy * k);
        break;
      }
      case 'item': {
        const p = groundPoint(drag.y);
        if (!p) break;
        const it = HA.item(drag.id); if (!it) break;
        const snap = document.getElementById('snapChk').checked;
        it.x = snap ? U.round(p.x - drag.dx, .25) : p.x - drag.dx;
        it.z = snap ? U.round(p.z - drag.dz, .25) : p.z - drag.dz;
        const g = itemGroups.get(it.id);
        if (g) g.position.set(it.x, g.position.y, it.z);
        drag.moved = true;
        HA.plan.draw();
        break;
      }
    }
    dirty = true;
  }

  function up() {
    if (drag) {
      if (drag.kind === 'item' && drag.moved) { HA.changed(true); HA.emit('props'); }
      if (drag.kind === 'orbit' && drag.hasPend && drag.travel < 5) HA.select(drag.pend);
    }
    drag = null;
  }

  function wheel(e) {
    e.preventDefault();
    if (walk.on) {
      const d = new THREE.Vector3(Math.sin(walk.yaw), 0, Math.cos(walk.yaw));
      walk.pos.addScaledVector(d, e.deltaY < 0 ? 1 : -1);
    } else {
      orbit.dist *= e.deltaY < 0 ? 1 / 1.12 : 1.12;
    }
    dirty = true;
  }

  function paint(obj) {
    const ud = obj.userData;
    if (ud.kind === 'swall') {                    // free-standing partition
      const w = HA.wall(ud.wallId);
      if (!w) return;
      HA.snapshot();
      w.color = S.paintColor;
      HA.status('Painted the partition wall — ' + S.paintName);
      return HA.changed(true);
    }
    const r = HA.room(ud.roomId);
    if (!r) return;
    HA.snapshot();
    const whole = document.getElementById('paintWholeRoom').checked;
    if (ud.kind === 'wall') {
      if (whole) { r.wallColor = S.paintColor; r.wallColors = {}; }
      else r.wallColors[ud.edge] = S.paintColor;
      HA.status('Painted ' + r.name + (whole ? ' — all walls' : ' wall ' + (ud.edge + 1)) + ' — ' + S.paintName);
    } else if (ud.kind === 'floor') {
      r.floorColor = S.paintColor;
      HA.status('New floor in ' + r.name + ' — ' + S.paintName);
    } else if (ud.kind === 'ceiling') {
      r.ceilColor = S.paintColor;
      HA.status('Painted ceiling in ' + r.name + ' — ' + S.paintName);
    } else return;
    HA.changed(true);
  }

  /* ─────────── loop ─────────── */
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (walk.on) {
      const sp = (walk.keys.ShiftLeft ? 14 : 6) * dt;
      const f = new THREE.Vector3(Math.sin(walk.yaw), 0, Math.cos(walk.yaw));
      const r = new THREE.Vector3(Math.cos(walk.yaw), 0, -Math.sin(walk.yaw));
      let m = false;
      if (walk.keys.KeyW || walk.keys.ArrowUp) { walk.pos.addScaledVector(f, sp); m = true; }
      if (walk.keys.KeyS || walk.keys.ArrowDown) { walk.pos.addScaledVector(f, -sp); m = true; }
      if (walk.keys.KeyA || walk.keys.ArrowLeft) { walk.pos.addScaledVector(r, -sp); m = true; }
      if (walk.keys.KeyD || walk.keys.ArrowRight) { walk.pos.addScaledVector(r, sp); m = true; }
      if (walk.keys.KeyQ) { walk.pos.y -= sp; m = true; }
      if (walk.keys.KeyE) { walk.pos.y += sp; m = true; }
      if (m) dirty = true;
    }
    applyCam();
    cutaway();
    if (dirty || walk.on) { renderer.render(scene, camera); dirty = false; }
    requestAnimationFrame(loop);
  }

  /** hide the walls between the camera and the rooms it is looking into */
  function cutaway() {
    const on = document.getElementById('cutChk').checked && !walk.on;
    const cp = camera.position;
    built.walls.forEach(g => {
      if (!on) { g.visible = true; return; }
      const d = g.userData.outward;
      const m = g.userData.mid;
      g.visible = !((cp.x - m.x) * d.x + (cp.z - m.z) * d.z > 0);
    });
  }

  V.snapshot = function () {
    applyCam(); cutaway();
    renderer.render(scene, camera);
    return cv.toDataURL('image/png');
  };
  V.dirty = function () { dirty = true; };
  V.scene = () => scene;          // handy from the console
  V.built = () => built;
})();
