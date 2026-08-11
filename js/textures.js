/* textures.js — procedural floor materials, drawn to a canvas at load time.
   No image files: every pattern is generated and tinted from the room's floor color.

   One texture tile covers PATCH feet. ShapeGeometry hands us UVs in world feet, so
   repeat = 1/PATCH lines the pattern up with real-world dimensions automatically. */
(function () {
  const HA = window.HA;
  const T = HA.tex = {};
  const PATCH = 8;               // feet per texture tile
  const S = 512;                 // pixels per tile
  const PF = S / PATCH;          // pixels per foot
  const cache = new Map();

  /* deterministic PRNG so patterns are identical either side of a tile seam */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a += 0x6D2B79F5;
      let t = a;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /** multiply a hex color, optionally shifting toward gray */
  function tone(hex, mul, gray) {
    const c = new THREE.Color(hex);
    let r = c.r * mul, g = c.g * mul, b = c.b * mul;
    if (gray) {
      const l = (r + g + b) / 3;
      r += (l - r) * gray; g += (l - g) * gray; b += (l - b) * gray;
    }
    const h = v => Math.round(Math.min(1, Math.max(0, v)) * 255);
    return 'rgb(' + h(r) + ',' + h(g) + ',' + h(b) + ')';
  }

  /* ─────────────── patterns ─────────────── */

  /** tongue-and-groove strips. wFt = plank width, lFt = plank length (both must divide PATCH) */
  function planks(ctx, color, wFt, lFt, grainCount) {
    const pw = wFt * PF, pl = lFt * PF, perRow = PATCH / lFt;
    ctx.fillStyle = tone(color, .62);
    ctx.fillRect(0, 0, S, S);
    for (let row = 0; row * pw < S; row++) {
      const y = row * pw;
      const off = ((row * 1.7) % lFt) * PF;
      for (let k = -1; k < perRow + 1; k++) {
        const x = off + k * pl;
        const km = ((k % perRow) + perRow) % perRow;      // wraps, so seams match
        const r = rng(row * 73856093 ^ km * 19349663);
        const v = .82 + r() * .34;
        ctx.fillStyle = tone(color, v);
        ctx.fillRect(x + 1, y + 1, pl - 2, pw - 2);
        ctx.save();
        ctx.beginPath(); ctx.rect(x + 1, y + 1, pl - 2, pw - 2); ctx.clip();
        ctx.lineWidth = 1;
        for (let g = 0; g < grainCount; g++) {
          const gy = y + 2 + r() * (pw - 4);
          ctx.strokeStyle = tone(color, v * (.78 + r() * .16));
          ctx.beginPath();
          ctx.moveTo(x, gy);
          ctx.bezierCurveTo(x + pl * .3, gy + (r() - .5) * 5, x + pl * .7, gy + (r() - .5) * 5, x + pl, gy);
          ctx.stroke();
        }
        /* bevel: light along the top edge, shadow along the bottom */
        ctx.strokeStyle = tone(color, v * 1.22); ctx.beginPath();
        ctx.moveTo(x + 1, y + 1.5); ctx.lineTo(x + pl - 1, y + 1.5); ctx.stroke();
        ctx.strokeStyle = tone(color, v * .55); ctx.beginPath();
        ctx.moveTo(x + 1, y + pw - 1.5); ctx.lineTo(x + pl - 1, y + pw - 1.5); ctx.stroke();
        ctx.restore();
      }
    }
  }

  /** square blocks of alternating grain direction */
  function parquet(ctx, color) {
    const b = 1 * PF, n = PATCH;                 // 1 ft blocks
    ctx.fillStyle = tone(color, .6);
    ctx.fillRect(0, 0, S, S);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const r = rng(i * 73856093 ^ j * 19349663);
        const v = .85 + r() * .28;
        const x = i * b, y = j * b, horiz = (i + j) % 2 === 0;
        ctx.fillStyle = tone(color, v);
        ctx.fillRect(x + 1, y + 1, b - 2, b - 2);
        ctx.strokeStyle = tone(color, v * .72); ctx.lineWidth = 1;
        for (let k = 1; k < 4; k++) {
          ctx.beginPath();
          if (horiz) { ctx.moveTo(x + 1, y + k * b / 4); ctx.lineTo(x + b - 1, y + k * b / 4); }
          else { ctx.moveTo(x + k * b / 4, y + 1); ctx.lineTo(x + k * b / 4, y + b - 1); }
          ctx.stroke();
        }
      }
    }
  }

  /** grouted tile. sizeFt must divide PATCH */
  function tiles(ctx, color, sizeFt, groutMul, speckle) {
    const t = sizeFt * PF, n = PATCH / sizeFt;
    ctx.fillStyle = tone(color, groutMul, .5);
    ctx.fillRect(0, 0, S, S);
    const g = Math.max(1.5, .035 * PF);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const r = rng(i * 73856093 ^ j * 19349663);
        const v = .93 + r() * .14;
        ctx.fillStyle = tone(color, v);
        ctx.fillRect(i * t + g, j * t + g, t - g * 2, t - g * 2);
        if (speckle) {
          ctx.save();
          ctx.beginPath(); ctx.rect(i * t + g, j * t + g, t - g * 2, t - g * 2); ctx.clip();
          for (let k = 0; k < sizeFt * 90; k++) {
            ctx.fillStyle = tone(color, v * (.8 + r() * .45), .35);
            const w = 1 + r() * 2.5;
            ctx.fillRect(i * t + r() * t, j * t + r() * t, w, w * (.4 + r()));
          }
          ctx.restore();
        }
        ctx.strokeStyle = tone(color, v * 1.12);          // slight sheen off the top edge
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(i * t + g, j * t + g + .5); ctx.lineTo((i + 1) * t - g, j * t + g + .5); ctx.stroke();
      }
    }
  }

  function carpet(ctx, color) {
    ctx.fillStyle = tone(color, 1);
    ctx.fillRect(0, 0, S, S);
    const r = rng(1234);
    for (let i = 0; i < 90000; i++) {                     // cut pile
      ctx.fillStyle = tone(color, .74 + r() * .5);
      ctx.fillRect(r() * S, r() * S, 1.6, 1.6);
    }
    ctx.globalAlpha = .05;                                 // faint vacuum rows
    for (let y = 0; y < S; y += PF) {
      ctx.fillStyle = tone(color, 1.3); ctx.fillRect(0, y, S, PF / 2);
      ctx.fillStyle = tone(color, .75); ctx.fillRect(0, y + PF / 2, S, PF / 2);
    }
    ctx.globalAlpha = 1;
  }

  function concrete(ctx, color) {
    ctx.fillStyle = tone(color, 1, .4);
    ctx.fillRect(0, 0, S, S);
    const r = rng(99);
    for (let i = 0; i < 60000; i++) {
      ctx.fillStyle = tone(color, .8 + r() * .4, .6);
      ctx.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2);
    }
    ctx.strokeStyle = tone(color, .88, .5); ctx.lineWidth = 1.5;   // saw-cut control joints
    ctx.beginPath();
    ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2);
    ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S);
    ctx.stroke();
  }

  const PATTERNS = {
    plank: c => planks(c.ctx, c.color, .5, 4, 7),
    wideplank: c => planks(c.ctx, c.color, .8, 8, 9),
    strip: c => planks(c.ctx, c.color, .25, 2, 4),
    parquet: c => parquet(c.ctx, c.color),
    tile12: c => tiles(c.ctx, c.color, 1, .7, false),
    tile24: c => tiles(c.ctx, c.color, 2, .72, true),
    mosaic: c => tiles(c.ctx, c.color, .25, .6, false),
    carpet: c => carpet(c.ctx, c.color),
    concrete: c => concrete(c.ctx, c.color)
  };

  /** what each material looks like to the light */
  T.finish = {
    plank: { roughness: .58, metalness: .02 },
    wideplank: { roughness: .62, metalness: .02 },
    strip: { roughness: .55, metalness: .02 },
    parquet: { roughness: .5, metalness: .03 },
    tile12: { roughness: .3, metalness: .04 },
    tile24: { roughness: .26, metalness: .05 },
    mosaic: { roughness: .34, metalness: .04 },
    carpet: { roughness: .99, metalness: 0 },
    concrete: { roughness: .82, metalness: .02 },
    solid: { roughness: .82, metalness: .02 }
  };

  T.list = [
    ['plank', 'Hardwood — 6″ plank'],
    ['wideplank', 'Hardwood — wide plank'],
    ['strip', 'Hardwood — narrow strip'],
    ['parquet', 'Parquet block'],
    ['tile12', 'Tile — 12″'],
    ['tile24', 'Tile — 24″ stone'],
    ['mosaic', 'Mosaic — 3″'],
    ['carpet', 'Carpet'],
    ['concrete', 'Polished concrete'],
    ['solid', 'Flat color']
  ];
  T.directional = { plank: 1, wideplank: 1, strip: 1, parquet: 0, tile12: 0, tile24: 0, mosaic: 0, carpet: 1, concrete: 0 };

  /** cached, tinted, world-scaled texture — null for a plain painted floor */
  T.floor = function (kind, color, angleDeg) {
    if (!kind || kind === 'solid' || !PATTERNS[kind]) return null;
    const key = kind + '|' + color + '|' + (angleDeg || 0);
    let tex = cache.get(key);
    if (tex) return tex;

    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d');
    PATTERNS[kind]({ ctx: ctx, color: color });

    tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1 / PATCH, 1 / PATCH);
    tex.center.set(.5, .5);
    tex.rotation = (angleDeg || 0) * Math.PI / 180;
    tex.anisotropy = 8;
    tex.encoding = THREE.sRGBEncoding;
    tex.needsUpdate = true;
    cache.set(key, tex);
    return tex;
  };

  /** small swatch for the properties panel */
  T.preview = function (kind, color, px) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d');
    if (!PATTERNS[kind]) { ctx.fillStyle = color; ctx.fillRect(0, 0, S, S); }
    else PATTERNS[kind]({ ctx: ctx, color: color });
    const out = document.createElement('canvas');
    out.width = out.height = px || 64;
    out.getContext('2d').drawImage(cv, 0, 0, S / 2, S / 2, 0, 0, out.width, out.height);
    return out.toDataURL();
  };
})();
