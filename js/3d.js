/* ==========================================================================
   DCIM Sunum — 3D Dijital İkiz (NewUICMPDigitalTwin3DComponent)
   Three.js + OrbitControls (vendor/three.bundle.min.js → window.THREE)
   Sahne kurgusu digital-twin-3d.component.ts ile birebir: WORLD_SCALE, 42U rack
   geometrisi, klima/pano/UPS modelleri, billboard etiketler, fiber runner/tray.
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const THREE = window.THREE;
  const { esc, fmtNum } = DCIM.ui;
  const D = DCIM.data;
  const L = D.layout;
  DCIM.shell.init({ active: '3d' });

  const RACK_U = 42;
  const RACK_42U_HEIGHT = 7.6;
  const PANEL_HEIGHT = RACK_42U_HEIGHT * 0.5;
  const WORLD_SCALE = 0.065; // 1px = 0.065m (40px = 2.6m)
  const VISIBILITY_LABELS_TR = ['Çok düşük', 'Düşük', 'Orta', 'Yüksek', 'Tam'];
  const OPACITY_LEVELS = [0.05, 0.12, 0.22, 0.45, 1.0];
  const DCIM_PALETTE = {
    rackBody: 0x475569, rackInner: 0x1e293b, rackRail: 0x94a3b8,
    asset1U: 0x94a3b8, asset2U: 0x8b5cf6, asset4U: 0xec4899
  };

  const mapW = L.mapW, mapH = L.mapH;
  const halfW = mapW / 2, halfH = mapH / 2;
  const roomWidth = mapW * WORLD_SCALE, roomDepth = mapH * WORLD_SCALE;
  const STATUS_MAP = { normal: 'ok', warning: 'warning', alarm: 'critical', lost: 'offline' };

  // ---------------------------------------------------------------------------
  // Veri modeli (processSchemaItems karşılığı)
  // ---------------------------------------------------------------------------
  const toWorld = it => ({
    x: (it.x + it.w / 2 - halfW) * WORLD_SCALE,
    z: (it.y + it.h / 2 - halfH) * WORLD_SCALE,
    width: Math.max(0.6, it.w * WORLD_SCALE),
    depth: Math.max(0.6, it.h * WORLD_SCALE)
  });

  const cabinets = D.cabinets.map(c => {
    const w = toWorld(c);
    return Object.assign(w, {
      type: 'cabinet', id: c.id, name: c.code, devId: c.devId, row: c.col, pod: c.pod, ref: c,
      height: RACK_42U_HEIGHT, status: STATUS_MAP[c.status],
      powerKw: c.powerKw.toFixed(1), temperature: c.tempMid.toFixed(1), usedU: c.usedU,
      assets: c.assets.map(a => ({
        id: a.id, cabinetId: c.id, cabinetName: c.code, name: a.displayName, devId: a.hostname, label: a.assetType,
        uStart: a.startU, uSize: a.uSize, uEnd: a.startU + a.uSize - 1, status: 'ok', ip: a.primaryIP || '—', serial: a.serial,
        powerKw: a.powerKw.toFixed(2), temperature: c.tempMid.toFixed(1), raw: a
      }))
    });
  });
  const equipment = []
    .concat(D.climates.map(e => Object.assign(toWorld(e), { type: 'airConditioner', kind: 'Hassas Klima', ref: e, id: e.id, label: e.label, devId: e.devId, height: RACK_42U_HEIGHT, status: STATUS_MAP[e.status], temperature: e.returnTemp })))
    .concat(D.panels.map(e => Object.assign(toWorld(e), { type: 'airConditionerPanel', kind: 'Klima Panosu', ref: e, id: e.id, label: e.label, devId: e.devId, height: PANEL_HEIGHT, status: STATUS_MAP[e.status] })))
    .concat(D.ups.map(e => Object.assign(toWorld(e), { type: 'upsUnit', kind: 'UPS Sistemi', ref: e, id: e.id, label: e.label, devId: e.devId, height: RACK_42U_HEIGHT, status: STATUS_MAP[e.status] })));

  // ---------------------------------------------------------------------------
  // Durum
  // ---------------------------------------------------------------------------
  const state = {
    quality: 'balanced',
    autoRotate: false,
    isolation: true,
    layers: { racks: true, fiber: true, tray: true, trace: true, health: true },
    neighborAssets: false,
    neighborOpacity: 3,
    selectedOpacity: 3,
    selectedCabinet: null,
    selectedEquipment: null,
    selectedAsset: null,
    tab: 'rack',
    visibleAssets: 0
  };

  const getStatusColor = s => ({ critical: '#ef4444', warning: '#f59e0b', offline: '#64748b' }[s] || '#10b981');
  const getStatusColorHex = s => ({ critical: 0xef4444, warning: 0xf59e0b, offline: 0x64748b }[s] || 0x10b981);
  const getStatusLabel = s => ({ critical: 'ALARM', warning: 'UYARI', offline: 'DEVREDIŞI' }[s] || 'NORMAL');
  const getStatusClass = s => ({
    critical: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20',
    warning: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20',
    offline: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-500/20'
  }[s] || 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20');
  const isDark = () => DCIM.theme.mode() === 'dark';

  // ---------------------------------------------------------------------------
  // Sahne kurulumu
  // ---------------------------------------------------------------------------
  const canvas = document.getElementById('renderCanvas');
  const wrap = canvas.parentElement;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(isDark() ? 0x070d18 : 0xf8fafc);
  const camera = new THREE.PerspectiveCamera(45, wrap.clientWidth / Math.max(1, wrap.clientHeight), 0.5, 600);
  camera.position.set(0, 38, 48);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(wrap.clientWidth, wrap.clientHeight, false);
  renderer.shadowMap.enabled = false;

  const controls = new THREE.OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.16;
  controls.rotateSpeed = 0.9;
  controls.zoomSpeed = 1.4;
  controls.panSpeed = 1.1;
  controls.screenSpacePanning = true;
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.minDistance = 2;
  controls.maxDistance = 350;
  controls.target.set(0, RACK_42U_HEIGHT * 0.35, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 1.25));
  const mainLight = new THREE.DirectionalLight(0xffffff, 1.45);
  mainLight.position.set(45, 90, 55);
  scene.add(mainLight);
  const fillLight = new THREE.DirectionalLight(0x90cdf4, 0.75);
  fillLight.position.set(-55, 45, -45);
  scene.add(fillLight);

  const racksGroup = new THREE.Group();
  const assetGroup = new THREE.Group();
  const equipmentGroup = new THREE.Group();
  const labelsGroup = new THREE.Group();
  const fiberRunnerGroup = new THREE.Group();
  const cableTrayGroup = new THREE.Group();
  [racksGroup, assetGroup, equipmentGroup, labelsGroup, fiberRunnerGroup, cableTrayGroup].forEach(g => scene.add(g));

  const interactive = [];
  const dataMap = new Map();

  // --- Zemin dokusu & CAD çizgileri -------------------------------------------
  const floorCanvas = document.createElement('canvas');
  floorCanvas.width = 2048;
  floorCanvas.height = Math.round(2048 * (mapH / mapW));
  const floorTexture = new THREE.CanvasTexture(floorCanvas);
  floorTexture.generateMipmaps = true;
  floorTexture.minFilter = THREE.LinearMipmapLinearFilter;
  floorTexture.magFilter = THREE.LinearFilter;
  floorTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  function drawFloorTexture(dark) {
    const ctx = floorCanvas.getContext('2d');
    const w = floorCanvas.width, h = floorCanvas.height;
    const sx = w / mapW, sy = h / mapH;
    ctx.fillStyle = dark ? '#080e1a' : '#f8fafc';
    ctx.fillRect(0, 0, w, h);
    const cols = L.gridCols, rows = L.gridRows;
    const cw = w / cols, ch = h / rows;
    ctx.strokeStyle = dark ? 'rgba(51, 65, 85, 0.55)' : 'rgba(203, 213, 225, 0.85)';
    ctx.lineWidth = 1.2;
    for (let c = 0; c <= cols; c++) { ctx.beginPath(); ctx.moveTo(c * cw, 0); ctx.lineTo(c * cw, h); ctx.stroke(); }
    for (let r = 0; r <= rows; r++) { ctx.beginPath(); ctx.moveTo(0, r * ch); ctx.lineTo(w, r * ch); ctx.stroke(); }
    ctx.strokeStyle = dark ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.7)';
    ctx.lineWidth = 1.5;
    for (let c = 1; c < cols; c++) for (let r = 1; r < rows; r++) {
      const px = c * cw, py = r * ch;
      ctx.beginPath(); ctx.moveTo(px - 4, py); ctx.lineTo(px + 4, py); ctx.moveTo(px, py - 4); ctx.lineTo(px, py + 4); ctx.stroke();
    }
    D.cabinets.forEach(o => {
      ctx.fillStyle = dark ? 'rgba(30, 41, 59, 0.85)' : 'rgba(226, 232, 240, 0.9)';
      ctx.fillRect(o.x * sx, o.y * sy, o.w * sx, o.h * sy);
      ctx.strokeStyle = dark ? '#64748b' : '#94a3b8';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(o.x * sx, o.y * sy, o.w * sx, o.h * sy);
    });
    try {
      ctx.save();
      ctx.scale(sx, sy);
      ctx.strokeStyle = dark ? 'rgba(56, 189, 248, 0.45)' : 'rgba(30, 41, 59, 0.55)';
      ctx.lineWidth = 1.8 / Math.min(sx, sy);
      ctx.stroke(new Path2D(L.bgPath));
      ctx.restore();
    } catch (e) { /* yok say */ }
    ctx.strokeStyle = dark ? '#1e293b' : '#cbd5e1';
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    floorTexture.needsUpdate = true;
  }
  drawFloorTexture(isDark());
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(roomWidth, roomDepth), new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.75, metalness: 0.15 }));
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = -0.02;
  scene.add(floorMesh);

  function buildVectorCadLines() {
    const points = [];
    const addLine = (x1, y1, x2, y2) => {
      if (Math.abs(x1 - x2) < 0.001 && Math.abs(y1 - y2) < 0.001) return;
      points.push(new THREE.Vector3((x1 - halfW) * WORLD_SCALE, 0.005, (y1 - halfH) * WORLD_SCALE));
      points.push(new THREE.Vector3((x2 - halfW) * WORLD_SCALE, 0.005, (y2 - halfH) * WORLD_SCALE));
    };
    const tokens = L.bgPath.match(/[A-Za-z]|-?[\d.]+(?:e-?\d+)?/g) || [];
    let cx = 0, cy = 0, sx = 0, sy = 0, cmd = 'M', i = 0;
    while (i < tokens.length) {
      if (/^[A-Za-z]$/.test(tokens[i])) { cmd = tokens[i]; i++; }
      switch (cmd) {
        case 'M': cx = parseFloat(tokens[i++]); cy = parseFloat(tokens[i++]); sx = cx; sy = cy; cmd = 'L'; break;
        case 'L': { const x = parseFloat(tokens[i++]); const y = parseFloat(tokens[i++]); if (!isNaN(x) && !isNaN(y)) { addLine(cx, cy, x, y); cx = x; cy = y; } break; }
        case 'H': { const x = parseFloat(tokens[i++]); if (!isNaN(x)) { addLine(cx, cy, x, cy); cx = x; } break; }
        case 'V': { const y = parseFloat(tokens[i++]); if (!isNaN(y)) { addLine(cx, cy, cx, y); cy = y; } break; }
        case 'A': { // yay: uç noktaya düz çizgi ile yaklaşık
          i += 5; const x = parseFloat(tokens[i++]); const y = parseFloat(tokens[i++]);
          if (!isNaN(x) && !isNaN(y)) { addLine(cx, cy, x, y); cx = x; cy = y; } break;
        }
        case 'Z': case 'z': addLine(cx, cy, sx, sy); cx = sx; cy = sy; break;
        default: i++;
      }
    }
    const mat = new THREE.LineBasicMaterial({ color: isDark() ? 0x38bdf8 : 0x0284c7, transparent: true, opacity: 0.8 });
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), mat);
    scene.add(lines);
    return lines;
  }
  const vectorFloorLines = buildVectorCadLines();

  // --- Paylaşılan malzemeler --------------------------------------------------
  const sharedRackBodyMat = new THREE.MeshStandardMaterial({ color: DCIM_PALETTE.rackBody, roughness: 0.38, metalness: 0.65 });
  const sharedRackRailMat = new THREE.MeshStandardMaterial({ color: DCIM_PALETTE.rackRail, roughness: 0.25, metalness: 0.85 });

  function register(mesh, data) { interactive.push(mesh); dataMap.set(mesh, data); }

  // --- 42U açık çerçeve rack (createDetailedRackMesh) ------------------------
  function createRack(cab) {
    const group = new THREE.Group();
    const w = cab.width, h = cab.height, d = cab.depth;
    const shell = 0.07, back = 0.035, rail = 0.04;
    const panelMat = new THREE.MeshStandardMaterial({ color: DCIM_PALETTE.rackBody, roughness: 0.38, metalness: 0.65 });
    const backMat = new THREE.MeshStandardMaterial({ color: DCIM_PALETTE.rackInner, roughness: 0.5, metalness: 0.5 });
    const left = new THREE.Mesh(new THREE.BoxGeometry(w, h, shell), panelMat); left.position.set(0, h / 2, -d / 2 + shell / 2); group.add(left);
    const right = new THREE.Mesh(new THREE.BoxGeometry(w, h, shell), panelMat); right.position.set(0, h / 2, d / 2 - shell / 2); group.add(right);
    const top = new THREE.Mesh(new THREE.BoxGeometry(w - 0.004, shell, d - shell * 2), panelMat); top.position.set(0, h - shell / 2, 0); group.add(top);
    const bot = new THREE.Mesh(new THREE.BoxGeometry(w - 0.004, shell, d - shell * 2), sharedRackBodyMat); bot.position.set(0, shell / 2, 0); group.add(bot);
    const backMesh = new THREE.Mesh(new THREE.BoxGeometry(back, h - shell * 2, d - shell * 2), backMat); backMesh.position.set(-w / 2 + back / 2, h / 2, 0); group.add(backMesh);
    cab.panelMats = [panelMat, backMat];
    const railGeo = new THREE.BoxGeometry(rail, h * 0.88, rail);
    const rl = new THREE.Mesh(railGeo, sharedRackRailMat); rl.position.set(w / 2 - 0.05, h / 2, -d * 0.38); group.add(rl);
    const rr = new THREE.Mesh(railGeo, sharedRackRailMat); rr.position.set(w / 2 - 0.05, h / 2, d * 0.38); group.add(rr);
    const ribGeo = new THREE.BoxGeometry(0.04, 0.03, d * 0.72);
    const tr = new THREE.Mesh(ribGeo, sharedRackBodyMat); tr.position.set(w / 2 - 0.03, h * 0.89, 0); group.add(tr);
    const br = new THREE.Mesh(ribGeo, sharedRackBodyMat); br.position.set(w / 2 - 0.03, h * 0.11, 0); group.add(br);
    const sc = getStatusColorHex(cab.status);
    const statusBar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, d * 0.36), new THREE.MeshStandardMaterial({ color: sc, emissive: sc, emissiveIntensity: 0.95, roughness: 0.2 }));
    statusBar.position.set(w / 2 + 0.02, h - 0.08, 0);
    group.add(statusBar);
    cab.statusMesh = statusBar;
    const hit = new THREE.Mesh(new THREE.BoxGeometry(w * 1.06, h, d * 1.06), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.position.set(0, h / 2, 0);
    group.add(hit);
    [hit, left, right, top, bot, backMesh, statusBar].forEach(m => register(m, cab));
    return group;
  }

  // --- Klima / Pano / UPS -----------------------------------------------------
  function createAirConditioner(eq) {
    const group = new THREE.Group();
    const w = eq.width, h = eq.height, d = eq.depth;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.7 }));
    body.position.y = h / 2; group.add(body); register(body, eq);
    const fz = d / 2 + 0.015;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.15, 0.03), new THREE.MeshStandardMaterial({ color: eq.status === 'critical' ? 0xef4444 : 0x10b981, roughness: 0.3, metalness: 0.8 }));
    strip.position.set(0, h - 0.25, fz); group.add(strip);
    const plenum = new THREE.Mesh(new THREE.BoxGeometry(w * 0.88, h * 0.22, 0.025), new THREE.MeshStandardMaterial({ color: 0x0b1320, roughness: 0.6 }));
    plenum.position.set(0, h * 0.84, fz); group.add(plenum);
    const louverMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.65, metalness: 0.6 });
    const n = state.quality === 'performance' ? 4 : 10;
    const lh = (h * 0.55) / n;
    for (let i = 0; i < n; i++) {
      const lv = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, lh * 0.7, 0.02), louverMat);
      lv.position.set(0, 0.35 + (i + 0.5) * lh, fz); group.add(lv);
    }
    const lcd = new THREE.Mesh(new THREE.BoxGeometry(w * 0.36, 0.36, 0.01), new THREE.MeshStandardMaterial({ color: 0x06b6d4, emissive: 0x06b6d4, emissiveIntensity: 0.8, roughness: 0.2 }));
    lcd.position.set(0, h * 0.62, fz + 0.02); group.add(lcd);
    return group;
  }
  function createPanel(eq) {
    const group = new THREE.Group();
    const w = eq.width, h = eq.height, d = eq.depth;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: 0x242d3d, roughness: 0.4, metalness: 0.75 }));
    body.position.y = h / 2; group.add(body); register(body, eq);
    const fz = d / 2 + 0.015;
    const header = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.12, 0.025), new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3, metalness: 0.8 }));
    header.position.set(0, h - 0.18, fz); group.add(header);
    const lampGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.02, 16); lampGeo.rotateX(Math.PI / 2);
    [[0xef4444, -0.28], [0xfacc15, 0], [0x3b82f6, 0.28]].forEach(l => {
      const m = new THREE.Mesh(lampGeo, new THREE.MeshStandardMaterial({ color: l[0], emissive: l[0], emissiveIntensity: 0.9 }));
      m.position.set(w * l[1], h - 0.42, fz + 0.015); group.add(m);
    });
    const kb = new THREE.Mesh(new THREE.BoxGeometry(w * 0.22, w * 0.22, 0.02), new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 }));
    kb.position.set(0, h * 0.48, fz + 0.015); group.add(kb);
    const kh = new THREE.Mesh(new THREE.BoxGeometry(w * 0.14, 0.06, 0.06), new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.3, metalness: 0.5 }));
    kh.position.set(0, h * 0.48, fz + 0.045); group.add(kh);
    return group;
  }
  function createUps(eq) {
    const group = new THREE.Group();
    const w = eq.width, h = eq.height, d = eq.depth;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.75 }));
    body.position.y = h / 2; group.add(body); register(body, eq);
    const fz = d / 2 + 0.015;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.15, 0.025), new THREE.MeshStandardMaterial({ color: eq.status === 'critical' ? 0xef4444 : 0x0ea5e9, roughness: 0.3, metalness: 0.8 }));
    strip.position.set(0, h - 0.25, fz); group.add(strip);
    const trayMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5, metalness: 0.7 });
    const th = (h * 0.6) / 6;
    for (let t = 0; t < 6; t++) {
      const tray = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, th * 0.88, 0.025), trayMat);
      tray.position.set(0, 0.4 + (t + 0.5) * th, fz); group.add(tray);
    }
    const disp = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 0.55, 0.03), new THREE.MeshStandardMaterial({ color: 0x0284c7, emissive: 0x0284c7, emissiveIntensity: 0.7, roughness: 0.3 }));
    disp.position.set(0, h * 0.78, fz + 0.015); group.add(disp);
    return group;
  }

  // --- Billboard etiket -------------------------------------------------------
  function createLabel(text, status) {
    const c = document.createElement('canvas');
    c.width = 384; c.height = 120;
    const ctx = c.getContext('2d');
    ctx.scale(0.75, 0.75);
    const bw = 440, bh = 100, x = 36, y = 30;
    ctx.fillStyle = 'rgba(11, 19, 32, 0.94)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, bw, bh, 24); else ctx.rect(x, y, bw, bh);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = getStatusColor(status);
    ctx.beginPath(); ctx.arc(x + 40, y + bh / 2, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.length > 14 ? text.substring(0, 13) + '…' : text, x + 70, y + bh / 2 + 2);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(3.0, 0.94, 1.0);
    return sprite;
  }

  // --- Üst altyapı ------------------------------------------------------------
  function buildOverhead() {
    [fiberRunnerGroup, cableTrayGroup].forEach(g => { while (g.children.length) g.remove(g.children[0]); });
    const runnerY = RACK_42U_HEIGHT + 1.2, trayY = RACK_42U_HEIGHT + 0.35;
    if (state.quality === 'performance') {
      const r = new THREE.Mesh(new THREE.BoxGeometry(roomWidth * 0.88, 0.15, 0.15), new THREE.MeshBasicMaterial({ color: 0xeab308 }));
      r.position.set(0, runnerY, 0); fiberRunnerGroup.add(r);
      return;
    }
    const runnerMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.4, metalness: 0.5 });
    const trayMat = new THREE.MeshStandardMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.6 });
    const zLines = state.quality === 'high' ? [-25, -8, 10, 28] : [-8, 10];
    zLines.forEach(z => {
      const r = new THREE.Mesh(new THREE.BoxGeometry(roomWidth * 0.88, 0.22, 0.25), runnerMat); r.position.set(0, runnerY, z); fiberRunnerGroup.add(r);
      const t = new THREE.Mesh(new THREE.BoxGeometry(roomWidth * 0.85, 0.1, 0.45), trayMat); t.position.set(0, trayY, z); cableTrayGroup.add(t);
    });
    if (state.quality === 'high') {
      [-30, 0, 30].forEach(x => { const cr = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.22, 60), runnerMat); cr.position.set(x, runnerY, 1); fiberRunnerGroup.add(cr); });
    }
  }

  // --- Sahneyi oluştur --------------------------------------------------------
  function buildScene() {
    cabinets.forEach(cab => {
      const g = createRack(cab);
      g.position.set(cab.x, 0.01, cab.z);
      racksGroup.add(g);
      cab.meshGroup = g;
      const s = createLabel(cab.name, cab.status);
      s.position.set(cab.x, cab.height + 0.65, cab.z);
      labelsGroup.add(s);
      cab.labelSprite = s;
    });
    equipment.forEach(eq => {
      const g = eq.type === 'airConditioner' ? createAirConditioner(eq) : eq.type === 'upsUnit' ? createUps(eq) : createPanel(eq);
      g.position.set(eq.x, 0, eq.z);
      equipmentGroup.add(g);
      eq.meshGroup = g;
      const s = createLabel(eq.label, eq.status);
      s.position.set(eq.x, eq.height + 0.65, eq.z);
      labelsGroup.add(s);
      eq.labelSprite = s;
    });
    buildOverhead();
    document.getElementById('kpi-cabinets').textContent = cabinets.length.toLocaleString('tr-TR');
  }

  // ---------------------------------------------------------------------------
  // Seçim / izolasyon / iç cihazlar
  // ---------------------------------------------------------------------------
  let highlightMesh = null;
  let internalMeshes = [];

  function setCabinetOpacity(cab, opacity) {
    (cab.panelMats || []).forEach(m => {
      m.transparent = opacity < 1;
      m.opacity = opacity;
      m.depthWrite = opacity >= 1;
      m.needsUpdate = true;
    });
  }

  function applyIsolation() {
    cabinets.forEach(c => {
      if (state.selectedCabinet === c) setCabinetOpacity(c, OPACITY_LEVELS[state.selectedOpacity - 1]);
      else if (state.isolation && (state.selectedCabinet || state.selectedEquipment)) setCabinetOpacity(c, neighborsOf(state.selectedCabinet).indexOf(c) >= 0 ? 0.55 : 0.28);
      else setCabinetOpacity(c, 1);
    });
  }

  function neighborsOf(cab) {
    if (!cab) return [];
    return cabinets.filter(o => o !== cab && o.row === cab.row && Math.abs(o.z - cab.z) < 5.5);
  }

  function clearInternals() {
    internalMeshes.forEach(m => {
      const i = interactive.indexOf(m);
      if (i >= 0) interactive.splice(i, 1);
      dataMap.delete(m);
      m.geometry.dispose();
      m.material.dispose();
    });
    internalMeshes = [];
    while (assetGroup.children.length) assetGroup.remove(assetGroup.children[0]);
  }

  function renderInternals(cab, opacity, interactiveOn) {
    const unitH = cab.height / 42, sw = cab.width * 0.85, sd = cab.depth * 0.82;
    cab.assets.forEach(a => {
      const uStart = Math.min(42, Math.max(1, a.uStart));
      const uSize = Math.min(42 - uStart + 1, Math.max(1, a.uSize));
      const ah = uSize * unitH - 0.006;
      const ay = (uStart - 1) * unitH + ah / 2 + 0.013;
      const color = uSize >= 4 ? DCIM_PALETTE.asset4U : uSize >= 2 ? DCIM_PALETTE.asset2U : DCIM_PALETTE.asset1U;
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.75, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, transparent: opacity < 1, opacity });
      const m = new THREE.Mesh(new THREE.BoxGeometry(sw, ah, sd), mat);
      m.position.set(cab.x - 0.01, ay, cab.z);
      assetGroup.add(m); internalMeshes.push(m);
      if (interactiveOn) { interactive.push(m); dataMap.set(m, a); }
      const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.015, ah, sd * 0.96), new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.5, metalness: 0.5, transparent: opacity < 1, opacity }));
      bezel.position.set(cab.x + sw / 2 + 0.005, ay, cab.z);
      assetGroup.add(bezel); internalMeshes.push(bezel);
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.03), new THREE.MeshBasicMaterial({ color: state.selectedAsset && state.selectedAsset.id === a.id ? 0xfacc15 : 0x22c55e }));
      led.position.set(cab.x + sw / 2 + 0.015, ay, cab.z + sd * 0.38);
      assetGroup.add(led); internalMeshes.push(led);
    });
  }

  function refreshInternals() {
    clearInternals();
    let count = 0;
    if (state.selectedCabinet && state.selectedCabinet.showInternals !== false) {
      renderInternals(state.selectedCabinet, 1, true);
      count += state.selectedCabinet.assets.length;
      if (state.neighborAssets) {
        neighborsOf(state.selectedCabinet).forEach(n => { renderInternals(n, OPACITY_LEVELS[state.neighborOpacity - 1], false); count += n.assets.length; });
      }
    }
    state.visibleAssets = count;
    document.getElementById('kpi-assets').textContent = String(count);
  }

  function highlight(obj) {
    if (highlightMesh) { scene.remove(highlightMesh); highlightMesh = null; }
    if (!obj) return;
    highlightMesh = new THREE.BoxHelper(obj, 0xfacc15);
    highlightMesh.material.depthTest = false;
    highlightMesh.material.transparent = true;
    highlightMesh.material.opacity = 0.95;
    highlightMesh.renderOrder = 999;
    scene.add(highlightMesh);
  }

  function selectCabinet(cab) {
    state.selectedCabinet = cab;
    state.selectedEquipment = null;
    state.selectedAsset = null;
    highlight(cab.meshGroup);
    applyIsolation();
    refreshInternals();
    renderDetail();
    renderLayers();
  }
  function selectEquipment(eq) {
    state.selectedEquipment = eq;
    state.selectedCabinet = null;
    state.selectedAsset = null;
    highlight(eq.meshGroup);
    applyIsolation();
    refreshInternals();
    renderDetail();
    renderLayers();
  }
  function selectAsset(a) {
    state.selectedAsset = a;
    refreshInternals();
    renderDetail();
  }
  function clearSelection() {
    state.selectedCabinet = null;
    state.selectedEquipment = null;
    state.selectedAsset = null;
    highlight(null);
    applyIsolation();
    refreshInternals();
    renderDetail();
    renderLayers();
  }

  // ---------------------------------------------------------------------------
  // Kamera
  // ---------------------------------------------------------------------------
  function animateCameraTo(tx, ty, tz, lx, ly, lz) {
    const sp = camera.position.clone(), tp = new THREE.Vector3(tx, ty, tz);
    const st = controls.target.clone(), et = new THREE.Vector3(lx, ly, lz);
    let p = 0;
    const step = () => {
      p += 0.055;
      if (p >= 1) { camera.position.copy(tp); controls.target.copy(et); controls.update(); return; }
      const e = 1 - Math.pow(1 - p, 3);
      camera.position.lerpVectors(sp, tp, e);
      controls.target.lerpVectors(st, et, e);
      controls.update();
      requestAnimationFrame(step);
    };
    step();
  }
  function fitAll() {
    const xs = cabinets.map(c => c.x), zs = cabinets.map(c => c.z);
    const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs), minZ = Math.min.apply(null, zs), maxZ = Math.max.apply(null, zs);
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const span = Math.max(maxX - minX, maxZ - minZ, 14);
    animateCameraTo(cx, Math.max(22, span * 0.85), cz + Math.max(24, span * 0.95), cx, RACK_42U_HEIGHT * 0.35, cz);
  }
  const topView = () => animateCameraTo(0, 150, 0.01, 0, 0, 0);
  const focusCabinet = c => animateCameraTo(c.x + 12, RACK_42U_HEIGHT + 3, c.z + 6, c.x, RACK_42U_HEIGHT / 2, c.z);
  const focusEquipment = e => animateCameraTo(e.x, e.height + 3, e.z + 12, e.x, e.height / 2, e.z);
  function zoomBy(f) {
    const off = camera.position.clone().sub(controls.target).multiplyScalar(f);
    camera.position.copy(controls.target).add(off);
    controls.update();
  }

  function searchAndFocus(q) {
    q = (q || '').trim().toUpperCase();
    if (!q) return;
    const cab = cabinets.find(c => c.name.toUpperCase().includes(q) || c.devId.toUpperCase().includes(q));
    if (cab) { selectCabinet(cab); focusCabinet(cab); return; }
    const eq = equipment.find(e => e.label.toUpperCase().includes(q) || e.devId.toUpperCase().includes(q));
    if (eq) { selectEquipment(eq); focusEquipment(eq); return; }
    DCIM.ui.toast('"' + q + '" ile eşleşen kabin veya ekipman bulunamadı.', 'warning');
  }

  // ---------------------------------------------------------------------------
  // Pointer olayları
  // ---------------------------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const tip = document.getElementById('hover-tip');
  let hoverPending = false, lastHit = null, down = null;

  function pick(ev) {
    const r = canvas.getBoundingClientRect();
    mouse.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(interactive.filter(o => isVisible(o)), false);
    return hits.length ? dataMap.get(hits[0].object) : null;
  }
  function isVisible(o) { let p = o; while (p) { if (!p.visible) return false; p = p.parent; } return true; }

  canvas.addEventListener('pointermove', ev => {
    if (hoverPending) return;
    hoverPending = true;
    requestAnimationFrame(() => {
      hoverPending = false;
      const d = pick(ev);
      if (!d) { tip.classList.add('hidden'); lastHit = null; canvas.style.cursor = ''; return; }
      canvas.style.cursor = 'pointer';
      if (d !== lastHit) {
        lastHit = d;
        if (d.cabinetId) {
          tip.querySelector('[data-title]').textContent = d.cabinetName + ' · ' + d.name;
          tip.querySelector('[data-sub]').textContent = 'Boyut: ' + d.uSize + 'U (' + d.uStart + 'U-' + d.uEnd + 'U) · Güç: ' + d.powerKw + ' kW · ' + d.temperature + ' °C';
        } else if (d.type === 'cabinet') {
          tip.querySelector('[data-title]').textContent = d.name + ' · ' + d.pod;
          tip.querySelector('[data-sub]').textContent = 'Durum: ' + getStatusLabel(d.status) + ' · Sıcaklık: ' + d.temperature + ' °C · Güç: ' + d.powerKw + ' kW';
        } else {
          tip.querySelector('[data-title]').textContent = d.label;
          tip.querySelector('[data-sub]').textContent = d.kind + ' · Durum: ' + getStatusLabel(d.status) + (d.ref.note ? ' · ' + d.ref.note : '');
        }
      }
      tip.style.left = ev.clientX + 12 + 'px';
      tip.style.top = ev.clientY + 12 + 'px';
      tip.classList.remove('hidden');
    });
  }, { passive: true });
  canvas.addEventListener('pointerleave', () => tip.classList.add('hidden'));
  canvas.addEventListener('pointerdown', ev => { down = { x: ev.clientX, y: ev.clientY }; });
  canvas.addEventListener('pointerup', ev => {
    if (!down || Math.abs(ev.clientX - down.x) + Math.abs(ev.clientY - down.y) > 5 || ev.button !== 0) { down = null; return; }
    down = null;
    const d = pick(ev);
    if (!d) return;
    if (d.cabinetId) selectAsset(d);
    else if (d.type === 'cabinet') selectCabinet(d);
    else selectEquipment(d);
  });
  canvas.addEventListener('dblclick', ev => {
    const d = pick(ev);
    if (!d) return;
    if (d.type === 'cabinet') focusCabinet(d);
    else if (!d.cabinetId) focusEquipment(d);
  });

  // ---------------------------------------------------------------------------
  // Sol panel — Katman Yöneticisi
  // ---------------------------------------------------------------------------
  const layerPanel = document.getElementById('layer-panel');
  function toggle(key, label, color, checked) {
    return '<div class="flex items-center justify-between gap-2 p-2 rounded-[2px] bg-slate-100/60 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-xs">' +
      '<span class="flex items-center gap-2"><i class="w-2 h-2 rounded-[1px] ' + color + ' inline-block"></i><span>' + label + '</span></span>' +
      '<label class="relative inline-flex items-center cursor-pointer"><input type="checkbox" data-layer="' + key + '"' + (checked ? ' checked' : '') + ' class="sr-only peer" />' +
      '<div class="w-7 h-4 bg-slate-300 peer-focus:outline-none dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div></label></div>';
  }
  function renderLayers() {
    const sel = state.selectedCabinet ? state.selectedCabinet.name : state.selectedEquipment ? state.selectedEquipment.label : '-';
    const meshes = cabinets.length + equipment.length;
    const occ = 64;
    layerPanel.innerHTML =
      '<div class="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">' +
        '<div><div class="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate max-w-[170px]">' + esc(D.site.title) + '</div><h2 class="text-xs font-bold text-slate-900 dark:text-white mt-0.5">Katman Yöneticisi</h2></div>' +
        '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">CANLI</span>' +
      '</div>' +
      '<div class="grid grid-cols-2 gap-2 mt-2.5">' +
        '<div class="p-2 rounded-[2px] bg-slate-100/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800"><span class="text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-400 block">Aktif Mesh</span><strong class="text-xs sm:text-sm font-mono text-slate-900 dark:text-white block mt-0.5">' + meshes + '</strong></div>' +
        '<div class="p-2 rounded-[2px] bg-slate-100/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800"><span class="text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-400 block">Seçili</span><strong class="text-xs sm:text-sm font-mono text-slate-900 dark:text-white block mt-0.5 truncate">' + esc(sel) + '</strong></div>' +
      '</div>' +
      '<div class="space-y-1.5 mt-3">' +
        toggle('isolation', 'İzole görünüm', 'bg-blue-500', state.isolation) +
        toggle('racks', 'Rack / Assetler', 'bg-slate-500', state.layers.racks) +
        toggle('fiber', 'Fiber Runner', 'bg-amber-500', state.layers.fiber) +
        toggle('tray', 'Kablo Kanalı', 'bg-cyan-500', state.layers.tray) +
        toggle('health', 'Sağlık / Alarmlar', 'bg-rose-500', state.layers.health) +
        toggle('labels', 'Etiketler', 'bg-sky-500', labelsGroup.visible) +
      '</div>' +
      '<div class="mt-3 p-2.5 rounded-[2px] bg-slate-100/60 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 space-y-1.5">' +
        '<div class="flex items-center justify-between text-xs"><span class="font-semibold">Fiber runner kapasitesi</span><b class="font-mono text-amber-600 dark:text-amber-400">%' + occ + '</b></div>' +
        '<div class="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden"><div class="h-full bg-amber-500 rounded-full" style="width:' + occ + '%"></div></div>' +
        '<p class="text-[9px] text-slate-500 dark:text-slate-400 leading-tight">Circuit kabloları on-demand çizilir. İzolasyon açıkken yalnızca çalışma bağlamındaki rack\'ler vurgulanır.</p>' +
      '</div>';
    layerPanel.querySelectorAll('[data-layer]').forEach(inp => inp.addEventListener('change', () => {
      const k = inp.getAttribute('data-layer');
      if (k === 'isolation') { state.isolation = inp.checked; applyIsolation(); return; }
      if (k === 'labels') { labelsGroup.visible = inp.checked; return; }
      state.layers[k] = inp.checked;
      racksGroup.visible = state.layers.racks;
      assetGroup.visible = state.layers.racks;
      fiberRunnerGroup.visible = state.layers.fiber;
      cableTrayGroup.visible = state.layers.tray;
      cabinets.forEach(c => { if (c.statusMesh) c.statusMesh.visible = state.layers.health; });
    }));
  }

  // ---------------------------------------------------------------------------
  // Sağ panel — Rack / Güç / Sensör
  // ---------------------------------------------------------------------------
  const detailPanel = document.getElementById('detail-panel');
  const deviceBg = a => (a.uSize >= 4 ? 'linear-gradient(180deg, #ec4899, #be185d)' : a.uSize >= 2 ? 'linear-gradient(180deg, #8b5cf6, #6d28d9)' : 'linear-gradient(180deg, #94a3b8, #64748b)');
  const kpi = (label, value) => '<div class="p-2 rounded-[2px] bg-white dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 text-center"><small class="text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-400 block">' + label + '</small><strong class="text-xs sm:text-sm font-mono text-slate-900 dark:text-white block mt-0.5">' + value + '</strong></div>';
  const cell = (label, value, style) => '<div class="p-1.5 rounded-[2px] bg-white dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800"><small class="text-[9px] text-slate-500 dark:text-slate-400 block">' + label + '</small><strong class="font-mono text-slate-900 dark:text-white block mt-0.5 truncate"' + (style ? ' style="' + style + '"' : '') + '>' + esc(value) + '</strong></div>';
  const btnPrimary = 'flex-1 py-1.5 px-2 text-xs rounded-[2px] bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors cursor-pointer text-center';
  const btnGhost = 'py-1.5 px-2 text-xs rounded-[2px] bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 font-medium transition-colors cursor-pointer text-center';

  function renderDetail() {
    const cab = state.selectedCabinet, eq = state.selectedEquipment;
    if (!cab && !eq) {
      detailPanel.innerHTML = '<div class="grid place-items-center min-h-[220px] text-center p-6 text-slate-500 dark:text-slate-400 text-xs leading-relaxed"><div class="space-y-2">' +
        '<i class="pi pi-server text-3xl text-slate-400 dark:text-slate-600 block"></i>' +
        '<div class="whitespace-pre-line">Bir rack seçin.\nTek tık yalnızca seçim yapar. Çift tık rack\'e odaklanır.\nİzolasyon varsayılan olarak açıktır.</div></div></div>';
      return;
    }
    if (eq) {
      detailPanel.innerHTML = '<div class="space-y-3">' +
        '<div class="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800"><div>' +
          '<div class="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">' + esc(D.site.title) + '</div>' +
          '<h3 class="text-sm font-bold text-slate-900 dark:text-white mt-0.5">' + esc(eq.label) + '</h3>' +
          '<div class="text-[11px] text-slate-500 dark:text-slate-400">' + esc(eq.devId) + ' · ' + esc(eq.kind) + '</div></div>' +
          '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ' + getStatusClass(eq.status) + '">' + getStatusLabel(eq.status) + '</span>' +
        '</div>' +
        (eq.ref.note ? '<div class="p-2 rounded-[2px] text-[11px] font-bold border ' + (eq.status === 'critical' ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300') + '"><i class="pi pi-exclamation-triangle mr-1"></i>' + esc(eq.ref.note) + '</div>' : '') +
        '<div class="space-y-1 p-2 rounded-[2px] bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs">' +
          eq.ref.points.map(p => '<div class="flex justify-between items-center text-[11px]"><span class="text-slate-500 dark:text-slate-400">' + esc(p.label) + ':</span><span class="font-mono font-semibold ' + (p.status === 'alarm' ? 'text-rose-500' : p.status === 'warning' ? 'text-amber-500' : 'text-slate-800 dark:text-slate-200') + '">' + esc(p.value) + ' ' + esc(p.unit) + '</span></div>').join('') +
        '</div>' +
        '<div class="flex gap-2"><a href="2d.html?focus=' + encodeURIComponent(eq.label) + '" class="' + btnPrimary + '">2D Krokide Göster</a><button type="button" data-clear class="' + btnGhost + ' px-3">Seçimi temizle</button></div>' +
      '</div>';
      detailPanel.querySelector('[data-clear]').addEventListener('click', clearSelection);
      return;
    }
    const tabBtn = (t, label) => '<button type="button" data-tab="' + t + '" class="flex-1 py-1.5 text-xs font-semibold rounded-[2px] transition-colors cursor-pointer ' +
      (state.tab === t ? 'bg-white dark:bg-blue-600 text-blue-600 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white') + '">' + label + '</button>';
    const a = state.selectedAsset;
    const c = cab.ref;
    let body = '';
    if (state.tab === 'rack') {
      body = '<div class="space-y-3">' +
        '<div class="p-3 rounded-[2px] bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">' +
          '<div class="flex items-start justify-between gap-2"><div><div class="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Seçili kabin</div>' +
            '<h3 class="text-sm sm:text-base font-bold text-slate-900 dark:text-white mt-0.5">' + esc(cab.name) + ' · ' + esc(c.customer) + '</h3>' +
            '<div class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">' + esc(cab.pod) + ' · Row ' + esc(cab.row) + ' · Ön Kapı: ' + (c.frontDoor === 'open' ? 'Açık' : 'Kapalı') + '</div></div>' +
            '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ' + getStatusClass(cab.status) + '">' + getStatusLabel(cab.status) + '</span></div>' +
          '<div class="grid grid-cols-3 gap-2 mt-2.5">' + kpi('U Dolu', cab.usedU + ' / 42') + kpi('Güç', cab.powerKw + ' kW') + kpi('Sıcaklık', cab.temperature + ' °C') + '</div>' +
          (c.note ? '<div class="mt-2 text-[10px] font-bold ' + (cab.status === 'critical' ? 'text-rose-500' : 'text-amber-500') + '"><i class="pi pi-exclamation-triangle mr-1 text-[9px]"></i>' + esc(c.note) + '</div>' : '') +
          '<div class="flex flex-wrap gap-1.5 mt-3">' +
            '<button type="button" data-focus class="' + btnPrimary + '">Kabine odaklan</button>' +
            '<a href="2d.html?cabinet=' + encodeURIComponent(cab.name) + '" class="flex-1 py-1.5 px-2 text-xs rounded-[2px] bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors cursor-pointer text-center" title="2D kabin çekmecesini aç">Kabin Detayı</a>' +
            '<button type="button" data-internals class="' + btnGhost + '">' + (cab.showInternals === false ? 'İç cihazları göster' : 'İç cihazları gizle') + '</button>' +
            '<button type="button" data-clear class="' + btnGhost + '">Seçimi temizle</button>' +
          '</div>' +
          '<div class="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs">' +
            '<div class="flex items-center justify-between"><span class="text-slate-600 dark:text-slate-400">Seçili rack görünürlüğü:</span><b class="text-slate-900 dark:text-white font-mono">' + state.selectedOpacity + '/5 · ' + VISIBILITY_LABELS_TR[state.selectedOpacity - 1] + '</b></div>' +
            '<input type="range" min="1" max="5" step="1" value="' + state.selectedOpacity + '" data-sel-op class="w-full h-1.5 bg-slate-300 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />' +
            '<div class="flex items-center justify-between pt-1"><label for="nb" class="text-slate-600 dark:text-slate-400 cursor-pointer text-xs">Komşu rack assetlerini göster</label><input id="nb" type="checkbox" data-nb' + (state.neighborAssets ? ' checked' : '') + ' class="rounded-[2px] border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 cursor-pointer" /></div>' +
            (state.neighborAssets ? '<div class="space-y-1 pt-1"><div class="flex items-center justify-between"><span class="text-slate-600 dark:text-slate-400">Komşu görünürlüğü:</span><b class="text-slate-900 dark:text-white font-mono">' + state.neighborOpacity + '/5 · ' + VISIBILITY_LABELS_TR[state.neighborOpacity - 1] + '</b></div>' +
              '<input type="range" min="1" max="5" step="1" value="' + state.neighborOpacity + '" data-nb-op class="w-full h-1.5 bg-slate-300 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />' +
              '<p class="text-[9px] text-slate-500 dark:text-slate-400 leading-tight">Komşular yalnızca bağlam için gösterilir; asset seçimi yine aktif rack ile sınırlıdır.</p></div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="rack-view-wrap relative"><div class="rack-view"><div class="patch-strip"></div>' +
          cab.assets.filter(x => x.uStart < 42).map(x => {
            const top = 100 - ((x.uStart - 1) / RACK_U) * 100 - (x.uSize / RACK_U) * 100;
            return '<button type="button" data-asset="' + esc(x.id) + '" class="rack-device' + (a && a.id === x.id ? ' selected' : '') + '" style="top:' + top + '%;height:calc(' + (x.uSize / RACK_U) * 100 + '% - 2px);background:' + deviceBg(x) + '">' +
              '<div class="u-tag">' + x.uSize + 'U · U' + x.uStart + (x.uStart !== x.uEnd ? '–U' + x.uEnd : '') + '</div>' +
              '<div class="font-semibold text-[10px] text-white truncate leading-tight' + (x.uSize > 1 ? ' mt-3.5' : ' pl-14 pr-12') + '">' + esc(x.name) + '</div>' +
              (x.uSize > 1 ? '<div class="text-[9px] text-slate-200/80 truncate leading-none mt-0.5">' + esc(x.devId) + '</div>' : '') +
              '<div class="leds"><span class="led" style="color:#10b981;background:#10b981"></span><span class="led" style="color:#22d3ee;background:#22d3ee"></span></div></button>';
          }).join('') +
        '</div><div class="rack-unit-labels">' + Array.from({ length: 42 }, (_, i) => '<div class="text-slate-500 dark:text-slate-500">U' + String(42 - i).padStart(2, '0') + '</div>').join('') + '</div></div>' +
        '<div class="p-3 rounded-[2px] bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">' +
          '<div class="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Seçili asset</div>' +
          '<h4 class="text-xs sm:text-sm font-bold text-slate-900 dark:text-white mt-0.5">' + (a ? esc(a.name) : 'Henüz seçilmedi') + '</h4>' +
          (a ? '<div class="grid grid-cols-2 gap-2 mt-2 text-xs">' + cell('devId', a.devId) + cell('Konum', 'U' + a.uStart + (a.uStart !== a.uEnd ? '–U' + a.uEnd : '') + ' · ' + a.cabinetName) + cell('Tip', a.label) + cell('Durum', 'NORMAL', 'color:#10b981') + cell('IP', a.ip) + cell('Seri No', a.serial) + '</div>' +
            '<button type="button" data-asset-detail class="mt-2 w-full ' + btnGhost + '">Cihaz Detay Kartı</button>'
            : '<div class="mt-2 text-[11px] text-slate-500 dark:text-slate-400">Detayları görüntülemek için yukarıdaki kabin içinden bir varlık seçin.</div>') +
        '</div>' +
      '</div>';
    } else if (state.tab === 'power') {
      const pdus = [
        { name: 'PDU-A (Besleme A)', ip: '10.10.' + (40 + cab.name.charCodeAt(2) % 20) + '.11', current: c.pduA, voltage: 230, power: (c.pduA * 0.23).toFixed(2), status: c.pduA > 16 ? 'warning' : 'ok' },
        { name: 'PDU-B (Besleme B)', ip: '10.10.' + (40 + cab.name.charCodeAt(2) % 20) + '.12', current: c.pduB, voltage: c.pduFault ? 0 : 229, power: (c.pduB * 0.23).toFixed(2), status: c.pduFault ? 'fault' : c.pduB > 16 ? 'warning' : 'ok' }
      ];
      body = '<div class="space-y-3">' +
        '<div class="p-3 rounded-[2px] bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">' +
          '<div class="flex items-start justify-between gap-2"><div><div class="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">KABİN GÜÇ TÜKETİMİ</div><h4 class="text-xs sm:text-sm font-bold text-slate-900 dark:text-white mt-0.5">' + esc(cab.name) + ' · Güç Özeti</h4></div>' +
          '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20"><i class="pi pi-bolt mr-1 text-[9px]"></i> PDU Telemetrisi</span></div>' +
          '<div class="grid grid-cols-2 gap-2 mt-2.5">' +
            '<div class="p-2 rounded-[2px] bg-white dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 text-center"><small class="text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-400 block">Toplam Anlık Güç</small><strong class="text-xs sm:text-sm font-mono text-sky-600 dark:text-sky-400 block mt-0.5">' + cab.powerKw + ' kW</strong></div>' +
            '<div class="p-2 rounded-[2px] bg-white dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 text-center"><small class="text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-400 block">Aktif PDU Sayısı</small><strong class="text-xs sm:text-sm font-mono text-slate-900 dark:text-white block mt-0.5">2 Ünite</strong></div>' +
          '</div>' +
        '</div>' +
        '<div class="space-y-2">' + pdus.map(p =>
          '<div class="p-3 rounded-[2px] bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">' +
            '<div class="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800"><div class="flex items-center gap-2">' +
              '<div class="w-6 h-6 rounded-[2px] bg-sky-500/15 text-sky-600 dark:text-sky-400 font-bold flex items-center justify-center text-xs"><i class="pi pi-bolt text-xs"></i></div>' +
              '<div><h5 class="text-xs font-bold text-slate-900 dark:text-white leading-none">' + p.name + '</h5><small class="text-[10px] text-slate-500 dark:text-slate-400 font-mono">' + p.ip + '</small></div></div>' +
              '<span class="px-1.5 py-0.5 rounded-[2px] text-[9px] font-bold ' + (p.status === 'fault' ? 'bg-rose-500/15 text-rose-600 border border-rose-500/30' : p.status === 'warning' ? 'bg-amber-500/15 text-amber-600 border border-amber-500/30' : 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/30') + '">' + (p.status === 'fault' ? 'FAZ KAYBI' : p.status === 'warning' ? 'YÜKSEK AKIM' : 'NORMAL') + '</span>' +
            '</div>' +
            '<div class="grid grid-cols-3 gap-1.5 mt-2 text-center text-xs">' +
              '<div class="p-1.5 bg-white dark:bg-slate-950/70 rounded-[2px] border border-slate-200 dark:border-slate-800"><span class="text-[9px] text-slate-500 dark:text-slate-400 block">Akım</span><b class="font-mono text-amber-600 dark:text-amber-400">' + p.current.toFixed(1) + ' A</b></div>' +
              '<div class="p-1.5 bg-white dark:bg-slate-950/70 rounded-[2px] border border-slate-200 dark:border-slate-800"><span class="text-[9px] text-slate-500 dark:text-slate-400 block">Gerilim</span><b class="font-mono text-slate-900 dark:text-slate-100">' + p.voltage + ' V</b></div>' +
              '<div class="p-1.5 bg-white dark:bg-slate-950/70 rounded-[2px] border border-slate-200 dark:border-slate-800"><span class="text-[9px] text-slate-500 dark:text-slate-400 block">Güç</span><b class="font-mono text-sky-600 dark:text-sky-400">' + p.power + ' kW</b></div>' +
            '</div>' +
          '</div>').join('') + '</div>' +
      '</div>';
    } else {
      const lost = c.status === 'lost';
      const t = v => (lost ? '-' : v.toFixed(1) + ' °C');
      const box = (label, v, cls) => '<div class="p-2 rounded-[2px] bg-white dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800"><small class="text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-400 block">' + label + '</small><strong class="' + cls + ' block mt-0.5">' + v + '</strong></div>';
      const details = [
        ['IDC1_' + c.code + '_TEMP_TOP', t(c.tempTop)], ['IDC1_' + c.code + '_TEMP_MID', t(c.tempMid)], ['IDC1_' + c.code + '_TEMP_LOW', t(c.tempLow)],
        ['IDC1_' + c.code + '_HUM_MID', lost ? '-' : '%' + c.humidity], [c.pod.replace('-', '') + '_' + c.code + '_FDOOR', c.frontDoor === 'open' ? 'Açık' : 'Kapalı'],
        [c.pod.replace('-', '') + '_' + c.code + '_RDOOR', c.rearDoor === 'open' ? 'Açık' : 'Kapalı'], ['IDC1_' + c.code + '_OCP_CURR', c.currentA.toFixed(1) + ' A']
      ];
      body = '<div class="space-y-3">' +
        '<div class="p-3 rounded-[2px] bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">' +
          '<div class="flex items-start justify-between gap-2"><div><div class="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">ÇEVRESEL SENSÖRLER</div><h4 class="text-xs sm:text-sm font-bold text-slate-900 dark:text-white mt-0.5">' + esc(cab.name) + ' · Sıcaklık &amp; Nem</h4></div>' +
          '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/20"><i class="pi pi-chart-line mr-1 text-[9px]"></i> CMR/T00</span></div>' +
          '<div class="grid grid-cols-3 gap-1.5 mt-2.5 text-center text-xs">' +
            box('Üst Sıcaklık', t(c.tempTop), 'text-xs sm:text-sm font-mono text-slate-900 dark:text-white') + box('Orta Sıcaklık', t(c.tempMid), 'text-xs sm:text-sm font-mono text-slate-900 dark:text-white') + box('Alt Sıcaklık', t(c.tempLow), 'text-xs sm:text-sm font-mono text-slate-900 dark:text-white') +
          '</div>' +
          '<div class="grid grid-cols-3 gap-1.5 mt-1.5 text-center text-xs">' +
            box('Nem', lost ? '-' : '%' + c.humidity, 'text-xs sm:text-sm font-mono text-sky-600 dark:text-sky-400') +
            box('Ön Kapak', c.frontDoor === 'open' ? 'Açık' : 'Kapalı', 'text-xs font-bold ' + (c.frontDoor === 'open' ? 'text-rose-500' : 'text-emerald-500')) +
            box('Arka Kapak', c.rearDoor === 'open' ? 'Açık' : 'Kapalı', 'text-xs font-bold ' + (c.rearDoor === 'open' ? 'text-rose-500' : 'text-emerald-500')) +
          '</div>' +
        '</div>' +
        '<div class="p-3 rounded-[2px] bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">' +
          '<div class="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold mb-2">Detaylı Sensör Noktaları (' + details.length + ')</div>' +
          '<div class="max-h-56 overflow-y-auto pr-1 space-y-1">' + details.map(d => '<div class="flex justify-between items-center text-[10px] p-1.5 bg-white dark:bg-slate-950/70 rounded-[2px] border border-slate-200 dark:border-slate-800"><span class="text-slate-600 dark:text-slate-400 font-medium truncate max-w-[180px]">' + d[0] + '</span><span class="font-mono font-bold text-slate-900 dark:text-white shrink-0">' + d[1] + '</span></div>').join('') + '</div>' +
        '</div>' +
      '</div>';
    }
    detailPanel.innerHTML =
      '<div class="flex gap-1 p-1 bg-slate-100 dark:bg-slate-900/80 rounded-[2px] sticky top-0 z-10 border border-slate-200 dark:border-slate-800">' + tabBtn('rack', '42U Donanım') + tabBtn('power', 'Güç &amp; PDU') + tabBtn('sensors', 'Sensörler') + '</div>' +
      '<div class="flex items-center flex-wrap gap-1 text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider my-2">' +
        '<span>DCIM</span><i class="pi pi-chevron-right text-[8px]"></i><span>' + esc(cab.pod) + '</span><i class="pi pi-chevron-right text-[8px]"></i><b class="text-slate-900 dark:text-white font-bold">' + esc(cab.name) + '</b>' +
        (a ? '<i class="pi pi-chevron-right text-[8px]"></i><b class="text-sky-500 font-bold">' + esc(a.devId) + '</b>' : '') +
      '</div>' + body;

    detailPanel.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { state.tab = b.getAttribute('data-tab'); renderDetail(); }));
    const q = s => detailPanel.querySelector(s);
    if (q('[data-focus]')) q('[data-focus]').addEventListener('click', () => focusCabinet(cab));
    if (q('[data-clear]')) q('[data-clear]').addEventListener('click', clearSelection);
    if (q('[data-internals]')) q('[data-internals]').addEventListener('click', () => { cab.showInternals = cab.showInternals === false; refreshInternals(); renderDetail(); });
    if (q('[data-sel-op]')) q('[data-sel-op]').addEventListener('input', e => { state.selectedOpacity = +e.target.value; applyIsolation(); renderDetail(); });
    if (q('[data-nb]')) q('[data-nb]').addEventListener('change', e => { state.neighborAssets = e.target.checked; refreshInternals(); renderDetail(); });
    if (q('[data-nb-op]')) q('[data-nb-op]').addEventListener('input', e => { state.neighborOpacity = +e.target.value; refreshInternals(); renderDetail(); });
    if (q('[data-asset-detail]')) q('[data-asset-detail]').addEventListener('click', () => DCIM.components.assetDetail(a.raw, cab.name));
    detailPanel.querySelectorAll('[data-asset]').forEach(b => b.addEventListener('click', () => selectAsset(cab.assets.find(x => x.id === b.getAttribute('data-asset')))));
  }

  // ---------------------------------------------------------------------------
  // Başlık aksiyonları
  // ---------------------------------------------------------------------------
  const act = (name, fn) => { const el = document.querySelector('[data-act="' + name + '"]'); if (el) el.addEventListener('click', fn); };
  act('zoom-in', () => zoomBy(0.85));
  act('zoom-out', () => zoomBy(1.18));
  act('cam-top', topView);
  act('cam-iso', fitAll);
  act('cam-reset', () => { clearSelection(); fitAll(); });
  act('find', () => searchAndFocus(document.getElementById('search').value));
  document.getElementById('search').addEventListener('keydown', e => { if (e.key === 'Enter') searchAndFocus(e.target.value); });
  act('rotate', () => {
    state.autoRotate = !state.autoRotate;
    const b = document.getElementById('rotate-btn');
    b.className = 'h-8 px-3 text-xs rounded-[2px] font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ' + (state.autoRotate ? 'bg-sky-600 text-white font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:text-sky-600');
    b.innerHTML = '<i class="pi pi-sync text-xs' + (state.autoRotate ? ' animate-spin' : '') + '"></i><span>' + (state.autoRotate ? 'Döndürmeyi durdur' : 'Otomatik döndür') + '</span>';
  });
  document.getElementById('quality').addEventListener('change', e => {
    state.quality = e.target.value;
    renderer.setPixelRatio(state.quality === 'performance' ? 1 : Math.min(window.devicePixelRatio || 1, state.quality === 'high' ? 2 : 1.5));
    buildOverhead();
    resize();
  });
  document.addEventListener('dcim:theme', ev => {
    const dark = ev.detail === 'dark';
    scene.background = new THREE.Color(dark ? 0x070d18 : 0xf8fafc);
    drawFloorTexture(dark);
    vectorFloorLines.material.color.setHex(dark ? 0x38bdf8 : 0x0284c7);
  });

  // ---------------------------------------------------------------------------
  // Render döngüsü
  // ---------------------------------------------------------------------------
  function resize() {
    const w = wrap.clientWidth, h = Math.max(1, wrap.clientHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(wrap);

  let frames = 0, lastFps = performance.now();
  const fpsEl = document.getElementById('kpi-fps'), drawEl = document.getElementById('kpi-draw');
  const clock = new THREE.Clock();
  function loop() {
    requestAnimationFrame(loop);
    controls.autoRotate = state.autoRotate;
    controls.autoRotateSpeed = 1.2;
    controls.update();
    // Alarm durum çubukları nabız efekti
    const t = clock.getElapsedTime();
    cabinets.forEach(c => { if (c.status === 'critical' && c.statusMesh) c.statusMesh.material.emissiveIntensity = 0.5 + Math.abs(Math.sin(t * 3)) * 0.9; });
    if (highlightMesh) highlightMesh.update();
    renderer.render(scene, camera);
    frames++;
    const now = performance.now();
    if (now - lastFps >= 1000) {
      fpsEl.textContent = String(Math.round((frames * 1000) / (now - lastFps)));
      drawEl.textContent = fmtNum(renderer.info.render.calls, 0);
      frames = 0;
      lastFps = now;
    }
  }

  // ---------------------------------------------------------------------------
  // Başlat
  // ---------------------------------------------------------------------------
  try {
    buildScene();
    renderLayers();
    renderDetail();
    resize();
    loop();
    fitAll();
    document.getElementById('loading').remove();
    const params = new URLSearchParams(window.location.search);
    const cabParam = params.get('cabinet'), focusParam = params.get('focus');
    if (cabParam) {
      const cab = cabinets.find(c => c.name === cabParam);
      if (cab) setTimeout(() => { selectCabinet(cab); focusCabinet(cab); }, 600);
    } else if (focusParam) {
      const eq = equipment.find(e => e.label.toUpperCase() === focusParam.toUpperCase());
      if (eq) setTimeout(() => { selectEquipment(eq); focusEquipment(eq); }, 600);
    }
  } catch (err) {
    const box = document.createElement('div');
    box.className = 'fixed inset-4 z-50 p-6 rounded-[4px] bg-rose-950/95 border border-rose-500 text-rose-100 overflow-auto whitespace-pre-wrap font-mono text-xs';
    box.innerHTML = '<div class="font-bold text-sm text-rose-300 mb-2">3D Digital Twin Error</div><div>' + esc(err && err.message ? err.message : err) + '</div>';
    document.body.appendChild(box);
  }
})();
