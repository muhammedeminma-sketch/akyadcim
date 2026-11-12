/* ==========================================================================
   DCIM Sunum — 3D Dijital İkiz (NewUICMPDigitalTwin3DComponent + CabinetInspectorComponent)
   Three.js + OrbitControls (vendor/three.bundle.min.js → window.THREE)
   Sahne kurgusu digital-twin-3d.component.ts ile aynı: WORLD_SCALE, 42U açık çerçeve raf, kabin yönü (facing),
   klima/pano/UPS modelleri, billboard etiketler, şema ağ katmanından fiber runner/tel tava, yükseltilmiş duvarlar,
   zemin ısı haritası, çift tık odağı, sol kabin detay paneli (2D/3D raf, CAT SVG yüzler), kablo izleme (LNK).
   Veri: js/mock-data.js (DCIM.data) + js/mock/twin3d.data.js (DCIM.twin3d: katlar, ekipman, ASM, LNK, ağ).

   Derin bağlantılar:
     ?cabinet=1DU06            kabin seçilir ve kameraya alınır (kat, kabin kodunun ilk hanesinden)
     ?focus=UPS%20A5           ekipman seçilir ve kameraya alınır (tüm katlarda aranır)
     ?floor=1|2|3              kat seçici
     ?heatmap=1                zemin ısı haritası açık
     ?status=1                 "Durum rengi" açık
     ?trace=1NA06[&asset=1NA06-A2][&port=U2]   kabin + cihaz seçilir, bağlı portun kablosu izlenir
     ?view=focus               (?cabinet ile) çift tık odağı: kabinin önüne iner, diğerleri gizlenir
     ?neighbors=0..3           odakta komşu sayısı      ?walls=0..100   duvar opaklığı (%)
     ?inspector=3d             sol panelde 3D raf görünümü      ?tab=cables|sensors|power   sağ panel sekmesi
     ?layers=1                 katman menüsü açık
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const THREE = window.THREE;
  const D = DCIM.data;
  const T = DCIM.twin3d;
  const esc = DCIM.ui.esc;
  DCIM.shell.init({ active: '3d' });

  // ---------------------------------------------------------------------------
  // Sabitler (digital-twin-3d.component.ts)
  // ---------------------------------------------------------------------------
  const RACK_U = 42;
  const RACK_H = 7.6;
  const PANEL_H = RACK_H * 0.5;
  const S = 0.065; // WORLD_SCALE: 1px = 0.065m
  const ZOOM_MIN_DISTANCE = 12;
  const ZOOM_MAX_FACTOR = 1.0;
  const LABEL_HOVER_SCALE = 1.3;
  const CLICK_MAX_MOVE_PX = 6;
  const CLICK_MAX_HOLD_MS = 450;
  const FOCUS_ELEVATION_DEG = [15, 40];
  const FOCUS_CABINET_VIEW_DEG = { azimuth: 0, elevation: 3 };
  const FOCUS_NEIGHBOR_MAX = 3;
  const FOCUS_NEIGHBOR_ALPHA = 0.5;
  const WALL_HEIGHT = RACK_H * 1.35;
  const WALL_THICK_PX = 4;
  const WALL_MIN_LEN_PX = 24;
  const CAMERA_MIN_TARGET_Y = 0;
  const CABLE_RADIUS = 0.065;
  const CABLE_CORNER_RADIUS = 0.3;
  const RACK_REAL_HEIGHT_M = 42 * 0.04445;
  const PX_TO_M = 0.6 / 40; // 40 px = 60 cm şema ölçüsü
  const TRACE_CABLE_COLOR = 0x00e1ff;
  const TRACE_CABLE_EDGE_COLOR = 0x083344;
  const TRACE_SRC_COLOR = 0x10b981;
  const TRACE_DST_COLOR = 0xf472b6;
  const TRACE_FLOOR_FADE = 28.8;
  const TRACE_PULSE_TAIL = 6;
  const TRACE_LABEL_RATIO = 1.2;
  const PORT_FREE_COLOR = 0x64748b;
  const PORT_LINKED_COLOR = 0x22d3ee;
  const PORT_SELECTED_COLOR = 0xfacc15;
  const HEATMAP_CELL_PX = 10;
  const HEATMAP_RADIUS_PX = 240;
  const HEATMAP_SOLID_PX = 120;
  const HEATMAP_SMOOTH_PX2 = 1600;
  const HEATMAP_OPACITY = 0.85;
  const HEATMAP_STOPS = [
    [18, [37, 99, 235]],
    [21, [6, 182, 212]],
    [24, [34, 197, 94]],
    [27, [234, 179, 8]],
    [30, [249, 115, 22]],
    [32, [220, 38, 38]]
  ];
  const NETWORK_LEVEL = { 'cable-tray': { above: 0.35, thickness: 0.1, width: 1.3, color: 0x64748b }, 'fiber-runner': { above: 1.2, thickness: 0.22, width: 0.52, color: 0xf59e0b } };
  const VISIBILITY_LABELS_TR = ['Çok düşük', 'Düşük', 'Orta', 'Yüksek', 'Tam'];
  const DCIM_PALETTE = { rackBody: 0x475569, rackInner: 0x1e293b, rackRail: 0x94a3b8, asset1U: 0x94a3b8, asset2U: 0x3b82f6, asset4U: 0xec4899 };
  const STATUS_MAP = { normal: 'ok', warning: 'warning', alarm: 'critical', lost: 'offline' };
  // Acil: 3D ikizde kırmızı çizilir, etiketi "ACİL" kalır (mock telemetri: 1DA07 üst sıcaklık acil eşiğinde)
  const ACIL_CODES = { '1DA07': true };
  // "Durum rengi": 2D krokideki durum dolguları (--schema-status-*)
  const STATUS_FILL = { ok: 0x61bb61, warning: 0xf8df00, critical: 0xe90a0a, emergency: 0xe90a0a, offline: 0xff8e0a };

  const statusColor = s => ({ critical: '#ef4444', emergency: '#ef4444', warning: '#f59e0b', offline: '#64748b' }[s] || '#10b981');
  const statusColorHex = s => ({ critical: 0xef4444, emergency: 0xef4444, warning: 0xf59e0b, offline: 0x64748b }[s] || 0x10b981);
  const statusLabel = s => ({ critical: 'ALARM', emergency: 'ACİL', warning: 'UYARI', offline: 'DEVREDIŞI' }[s] || 'NORMAL');
  const statusClass = s => (s === 'critical' || s === 'emergency' ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20'
    : s === 'warning' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20'
      : s === 'offline' ? 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-500/20'
        : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20');
  const isDark = () => DCIM.theme.mode() === 'dark';
  const params = new URLSearchParams(window.location.search);

  // ---------------------------------------------------------------------------
  // Durum
  // ---------------------------------------------------------------------------
  const state = {
    floor: 1,
    quality: 'high',
    autoRotate: false,
    isolation: false,
    layers: { racks: true, fiber: true, tray: true, trace: true, health: true },
    statusColoring: false,
    heatmap: false,
    heatStats: null,
    wallOpacity: 0,
    focusNeighborCount: 2,
    focusNeighborAssets: false,
    selectedOpacityLevel: 5,
    layersOpen: false,
    selectedCabinet: null,
    selectedEquipment: null,
    selectedAsset: null,
    assetsVisible: true,
    tab: 'cables',
    leftCollapsed: false,
    rightCollapsed: false,
    inspectorView: '2d',
    inspectorFace: 'front',
    ports: [],
    portsAssetId: '',
    portSide: 'all',
    portStatus: 'all',
    portSearch: '',
    selectedPortKey: '',
    trace: null,
    traceMessage: '',
    following: false
  };

  let L = null; // etkin katın yerleşimi
  let halfW = 1000, halfH = 820, roomWidth = 130, roomDepth = 106.6;
  let cabinets = [];
  let equipment = [];
  const byId = new Map();

  // ---------------------------------------------------------------------------
  // Sahne kurulumu
  // ---------------------------------------------------------------------------
  const canvas = document.getElementById('renderCanvas');
  const wrap = document.getElementById('dt3d-wrap');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(isDark() ? 0x070d18 : 0xf8fafc);
  const camera = new THREE.PerspectiveCamera(45, wrap.clientWidth / Math.max(1, wrap.clientHeight), 0.5, 900);
  camera.position.set(0, 60, 80);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(wrap.clientWidth, wrap.clientHeight, false);

  const controls = new THREE.OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.16;
  controls.rotateSpeed = 0.9;
  controls.zoomSpeed = 1.4;
  controls.panSpeed = 1.1;
  controls.screenSpacePanning = true;
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.minDistance = ZOOM_MIN_DISTANCE;
  controls.maxDistance = 140;
  controls.target.set(0, RACK_H * 0.35, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 1.25));
  const mainLight = new THREE.DirectionalLight(0xffffff, 1.45);
  mainLight.position.set(45, 90, 55);
  scene.add(mainLight);
  const fillLight = new THREE.DirectionalLight(0x90cdf4, 0.75);
  fillLight.position.set(-55, 45, -45);
  scene.add(fillLight);

  const floorGroup = new THREE.Group();
  const racksGroup = new THREE.Group();
  const assetGroup = new THREE.Group();
  const neighborAssetGroup = new THREE.Group();
  const equipmentGroup = new THREE.Group();
  const labelsGroup = new THREE.Group();
  const fiberRunnerGroup = new THREE.Group();
  const cableTrayGroup = new THREE.Group();
  const traceGroup = new THREE.Group();
  const portMarkerGroup = new THREE.Group();
  [floorGroup, racksGroup, assetGroup, neighborAssetGroup, equipmentGroup, labelsGroup, fiberRunnerGroup, cableTrayGroup, traceGroup, portMarkerGroup].forEach(g => scene.add(g));

  let interactive = [];
  const dataMap = new Map();
  function register(mesh, data) { interactive.push(mesh); dataMap.set(mesh, data); }
  function unregister(mesh) {
    const i = interactive.indexOf(mesh);
    if (i >= 0) interactive.splice(i, 1);
    dataMap.delete(mesh);
  }

  function disposeObject(o) {
    o.traverse(n => {
      if (n.geometry && !(n.geometry.userData && n.geometry.userData.shared)) n.geometry.dispose();
      const mats = n.material ? (Array.isArray(n.material) ? n.material : [n.material]) : [];
      mats.forEach(m => {
        if (m.userData && m.userData.shared) return;
        if (m.map && !(m.map.userData && m.map.userData.keep)) m.map.dispose();
        m.dispose();
      });
    });
  }
  function clearGroup(g) {
    while (g.children.length) {
      const c = g.children[0];
      g.remove(c);
      disposeObject(c);
    }
  }

  // --- Paylaşılan malzemeler --------------------------------------------------
  const shared = m => { m.userData.shared = true; return m; };
  const sharedRackBodyMat = shared(new THREE.MeshStandardMaterial({ color: DCIM_PALETTE.rackBody, roughness: 0.38, metalness: 0.65 }));
  const sharedRackRailMat = shared(new THREE.MeshStandardMaterial({ color: DCIM_PALETTE.rackRail, roughness: 0.25, metalness: 0.85 }));
  const sharedOutlineMat = shared(new THREE.LineBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.55 }));

  // ---------------------------------------------------------------------------
  // Veri modeli (processSchemaItems + assignCabinetFronts karşılığı)
  // ---------------------------------------------------------------------------
  const planToWorld = p => ({ x: (p.x - halfW) * S, z: (p.y - halfH) * S });
  const worldToPlan = v => ({ x: v.x / S + halfW, y: v.z / S + halfH });

  function makeCabinet(c) {
    const lost = c.status === 'lost';
    const frontZ = c.facing === 'N' || c.facing === 'S';
    return {
      type: 'cabinet', id: c.id, name: c.code, devId: c.devId, row: c.col, pod: c.pod, ref: c,
      x: (c.x + c.w / 2 - halfW) * S, z: (c.y + c.h / 2 - halfH) * S,
      width: Math.max(0.6, c.w * S), depth: Math.max(0.6, c.h * S), height: RACK_H,
      plan: { x: c.x + c.w / 2, y: c.y + c.h / 2 },
      frontZ, front: c.facing === 'S' || c.facing === 'E' ? 1 : -1,
      status: ACIL_CODES[c.code] ? 'emergency' : STATUS_MAP[c.status] || 'ok',
      powerKw: c.powerKw.toFixed(1), temperature: lost ? '-' : c.tempMid.toFixed(1), humidity: lost ? '-' : '%' + c.humidity,
      usedU: c.usedU,
      assets: T.assetsOf(c)
    };
  }

  function makeEquipment(e, type, kind, height) {
    // Ön yön: etiket kayması (lo) ya da sıra içi klimada en yakın kabinin yönü
    let dx = 0, dy = 1;
    if (e.lo && (e.lo[0] || e.lo[1])) {
      dx = Math.sign(e.lo[0]); dy = Math.sign(e.lo[1]);
      if (Math.abs(e.lo[0]) >= Math.abs(e.lo[1])) dy = 0; else dx = 0;
    } else {
      let best = null, bd = Infinity;
      (L.items || []).forEach(it => {
        if (it.type !== 'cabinet') return;
        const d = Math.hypot(it.x - e.x, it.y - e.y);
        if (d < bd) { bd = d; best = it; }
      });
      const f = best ? best.facing : 'S';
      dx = f === 'E' ? 1 : f === 'W' ? -1 : 0;
      dy = f === 'S' ? 1 : f === 'N' ? -1 : 0;
    }
    const alongX = dx !== 0;
    return {
      type, kind, id: e.id, label: e.label, devId: e.devId, ref: e,
      x: (e.x + e.w / 2 - halfW) * S, z: (e.y + e.h / 2 - halfH) * S,
      width: Math.max(0.6, (alongX ? e.h : e.w) * S), depth: Math.max(0.6, (alongX ? e.w : e.h) * S),
      rotation: Math.atan2(dx, dy), height,
      plan: { x: e.x + e.w / 2, y: e.y + e.h / 2 },
      status: STATUS_MAP[e.status] || 'ok'
    };
  }

  const cabLen = c => (c.frontZ ? c.depth : c.width);
  const cabSpan = c => (c.frontZ ? c.width : c.depth);
  function cabPos(c, dx, y, dz) {
    return c.frontZ ? new THREE.Vector3(c.x - dz, y, c.z + dx) : new THREE.Vector3(c.x + dx, y, c.z + dz);
  }
  function placeInCab(obj, c, dx, y, dz) {
    obj.position.copy(cabPos(c, dx, y, dz));
    obj.rotation.y = c.frontZ ? -Math.PI / 2 : 0;
  }

  // ---------------------------------------------------------------------------
  // Zemin dokusu, CAD çizgileri, yükseltilmiş duvarlar
  // ---------------------------------------------------------------------------
  const floorCanvas = document.createElement('canvas');
  floorCanvas.width = 2048;
  floorCanvas.height = Math.round(2048 * (1640 / 2000));
  const floorTexture = new THREE.CanvasTexture(floorCanvas);
  floorTexture.userData.keep = true;
  floorTexture.generateMipmaps = true;
  floorTexture.minFilter = THREE.LinearMipmapLinearFilter;
  floorTexture.magFilter = THREE.LinearFilter;
  floorTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  let floorMesh = null, cadLines = null, wallMesh = null, heatMesh = null, heatTexture = null;

  function pathSegments(path, minLen) {
    const segs = [];
    const tok = String(path || '').match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
    const isCmd = t => /^[A-Za-z]$/.test(t);
    const add = (x1, y1, x2, y2) => { if (Math.hypot(x2 - x1, y2 - y1) >= (minLen || 0.001)) segs.push({ x1, y1, x2, y2 }); };
    let cx = 0, cy = 0, sx = 0, sy = 0, cmd = 'M';
    for (let i = 0; i < tok.length;) {
      if (isCmd(tok[i])) {
        cmd = tok[i++].toUpperCase();
        if (cmd === 'Z') { add(cx, cy, sx, sy); cx = sx; cy = sy; }
        continue;
      }
      const n = cmd === 'A' ? 7 : cmd === 'H' || cmd === 'V' ? 1 : 2;
      const v = tok.slice(i, i + n);
      if (v.length < n || v.some(isCmd)) { i++; continue; }
      i += n;
      const nums = v.map(parseFloat);
      if (cmd === 'H') { add(cx, cy, nums[0], cy); cx = nums[0]; continue; }
      if (cmd === 'V') { add(cx, cy, cx, nums[0]); cy = nums[0]; continue; }
      const x = nums[n - 2], y = nums[n - 1];
      if (cmd === 'M') { cx = sx = x; cy = sy = y; cmd = 'L'; } else if (cmd === 'L') { add(cx, cy, x, y); cx = x; cy = y; } else { cx = x; cy = y; }
    }
    return segs;
  }

  function drawFloorTexture(dark) {
    const ctx = floorCanvas.getContext('2d');
    const w = floorCanvas.width, h = floorCanvas.height;
    const sx = w / L.mapW, sy = h / L.mapH;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = dark ? '#080e1a' : '#f8fafc';
    ctx.fillRect(0, 0, w, h);
    const cols = Math.round(L.mapW / 40), rows = Math.round(L.mapH / 40);
    const cw = w / cols, ch = h / rows;
    ctx.strokeStyle = dark ? 'rgba(51, 65, 85, 0.55)' : 'rgba(203, 213, 225, 0.85)';
    ctx.lineWidth = 1.2;
    for (let c = 0; c <= cols; c++) { ctx.beginPath(); ctx.moveTo(c * cw, 0); ctx.lineTo(c * cw, h); ctx.stroke(); }
    for (let r = 0; r <= rows; r++) { ctx.beginPath(); ctx.moveTo(0, r * ch); ctx.lineTo(w, r * ch); ctx.stroke(); }
    ctx.save();
    ctx.scale(sx, sy);
    // Sıcak koridor kapamaları (layer1)
    (L.layer1Rects || []).forEach(r => {
      ctx.fillStyle = dark ? 'rgba(244, 63, 94, 0.08)' : 'rgba(244, 63, 94, 0.07)';
      ctx.strokeStyle = dark ? 'rgba(244, 63, 94, 0.35)' : 'rgba(225, 29, 72, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    });
    // Kabin ve ekipman tabanları
    (L.items || []).forEach(o => {
      ctx.fillStyle = dark ? 'rgba(30, 41, 59, 0.85)' : 'rgba(226, 232, 240, 0.9)';
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeStyle = dark ? '#64748b' : '#94a3b8';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(o.x, o.y, o.w, o.h);
    });
    // Kat planı (duvar yolu)
    try {
      ctx.strokeStyle = dark ? 'rgba(56, 189, 248, 0.45)' : 'rgba(30, 41, 59, 0.55)';
      ctx.lineWidth = 2.2;
      ctx.stroke(new Path2D(L.bgPath));
    } catch (e) { /* yok say */ }
    // Salon ve POD yazıları
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    (L.texts || []).forEach(t => {
      ctx.fillStyle = dark ? 'rgba(148, 163, 184, 0.75)' : 'rgba(71, 85, 105, 0.8)';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText(t.text, t.x, t.y);
    });
    (L.salons || []).forEach(sl => {
      ctx.fillStyle = dark ? 'rgba(56, 189, 248, 0.6)' : 'rgba(2, 132, 199, 0.75)';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(sl.name, sl.x + 12, sl.y + 22);
      ctx.textAlign = 'center';
    });
    ctx.restore();
    floorTexture.needsUpdate = true;
  }

  function buildFloor() {
    clearGroup(floorGroup);
    floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(roomWidth, roomDepth), new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.75, metalness: 0.15 }));
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -0.02;
    floorGroup.add(floorMesh);
    drawFloorTexture(isDark());

    const pts = [];
    pathSegments(L.bgPath, 0.001).forEach(s => {
      pts.push(new THREE.Vector3((s.x1 - halfW) * S, 0.005, (s.y1 - halfH) * S), new THREE.Vector3((s.x2 - halfW) * S, 0.005, (s.y2 - halfH) * S));
    });
    cadLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: isDark() ? 0x38bdf8 : 0x0284c7, transparent: true, opacity: 0.8 }));
    floorGroup.add(cadLines);

    buildWalls();
    heatMesh = null;
    heatTexture = null;
  }

  /** Kapı/duvar katmanı (kat planı çizgileri) WALL_HEIGHT boyunda yükseltilir; tıklanmaz. */
  function buildWalls() {
    const segs = pathSegments(L.bgPath, WALL_MIN_LEN_PX);
    if (!segs.length) { wallMesh = null; return; }
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05, transparent: true, depthWrite: false });
    wallMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, segs.length);
    wallMesh.raycast = () => {};
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), sc = new THREE.Vector3();
    segs.forEach((g, i) => {
      const dx = (g.x2 - g.x1) * S, dz = (g.y2 - g.y1) * S;
      p.set(((g.x1 + g.x2) / 2 - halfW) * S, WALL_HEIGHT / 2, ((g.y1 + g.y2) / 2 - halfH) * S);
      q.setFromAxisAngle(up, -Math.atan2(dz, dx));
      sc.set(Math.hypot(dx, dz), WALL_HEIGHT, Math.max(0.12, WALL_THICK_PX * S));
      wallMesh.setMatrixAt(i, m.compose(p, q, sc));
    });
    wallMesh.instanceMatrix.needsUpdate = true;
    wallMesh.computeBoundingSphere();
    floorGroup.add(wallMesh);
    applyWallStyle();
  }

  function applyWallStyle() {
    if (!wallMesh) return;
    const a = Math.max(0, Math.min(100, Number(state.wallOpacity) || 0)) / 100;
    const mat = wallMesh.material;
    mat.color.setHex(isDark() ? 0x64748b : 0x94a3b8);
    mat.opacity = a;
    mat.transparent = a < 1;
    mat.depthWrite = a >= 1;
    mat.needsUpdate = true;
    wallMesh.visible = a > 0.01;
  }

  // ---------------------------------------------------------------------------
  // Zemin ısı haritası (kabin orta sıcaklıkları, ters uzaklık ağırlıklı)
  // ---------------------------------------------------------------------------
  function heatColor(t) {
    const s = HEATMAP_STOPS;
    if (t <= s[0][0]) return s[0][1];
    for (let i = 1; i < s.length; i++) {
      if (t <= s[i][0]) {
        const t0 = s[i - 1][0], c0 = s[i - 1][1], t1 = s[i][0], c1 = s[i][1];
        const k = (t - t0) / (t1 - t0);
        return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k];
      }
    }
    return s[s.length - 1][1];
  }

  function refreshHeatmap() {
    const points = state.heatmap ? cabinets.map(c => ({ x: c.plan.x, y: c.plan.y, t: parseFloat(c.temperature) })).filter(p => isFinite(p.t) && p.t > 0 && p.t < 80) : [];
    state.heatStats = points.length ? {
      count: points.length,
      min: Math.min.apply(null, points.map(p => p.t)),
      max: Math.max.apply(null, points.map(p => p.t)),
      avg: points.reduce((a, p) => a + p.t, 0) / points.length
    } : null;
    renderHeatLegend();
    if (!points.length) { if (heatMesh) heatMesh.visible = false; return; }
    const nx = Math.max(2, Math.min(512, Math.ceil(L.mapW / HEATMAP_CELL_PX)));
    const ny = Math.max(2, Math.min(512, Math.ceil(L.mapH / HEATMAP_CELL_PX)));
    if (!heatMesh) {
      const c = document.createElement('canvas');
      c.width = nx; c.height = ny;
      heatTexture = new THREE.CanvasTexture(c);
      heatTexture.generateMipmaps = false;
      heatTexture.minFilter = THREE.LinearFilter;
      heatTexture.magFilter = THREE.LinearFilter;
      heatMesh = new THREE.Mesh(new THREE.PlaneGeometry(roomWidth, roomDepth), new THREE.MeshBasicMaterial({ map: heatTexture, transparent: true, opacity: HEATMAP_OPACITY, depthWrite: false }));
      heatMesh.rotation.x = -Math.PI / 2;
      heatMesh.position.y = -0.006;
      heatMesh.renderOrder = 1;
      floorGroup.add(heatMesh);
    }
    const R = HEATMAP_RADIUS_PX, R2 = R * R;
    const buckets = new Map();
    points.forEach(p => {
      const k = Math.floor(p.x / R) + ',' + Math.floor(p.y / R);
      if (buckets.has(k)) buckets.get(k).push(p); else buckets.set(k, [p]);
    });
    const ctx = heatTexture.image.getContext('2d');
    const img = ctx.createImageData(nx, ny);
    const cw = L.mapW / nx, chh = L.mapH / ny;
    for (let j = 0; j < ny; j++) {
      const py = (j + 0.5) * chh, by = Math.floor(py / R);
      for (let i = 0; i < nx; i++) {
        const px = (i + 0.5) * cw, bx = Math.floor(px / R);
        let wSum = 0, tSum = 0, dMin2 = Infinity;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const b = buckets.get((bx + ox) + ',' + (by + oy));
          if (!b) continue;
          for (let n = 0; n < b.length; n++) {
            const p = b[n], ddx = p.x - px, ddy = p.y - py, d2 = ddx * ddx + ddy * ddy;
            if (d2 > R2) continue;
            const w = 1 / (d2 + HEATMAP_SMOOTH_PX2);
            wSum += w; tSum += w * p.t;
            if (d2 < dMin2) dMin2 = d2;
          }
        }
        if (!wSum) continue;
        const dMin = Math.sqrt(dMin2);
        const a = dMin <= HEATMAP_SOLID_PX ? 1 : Math.max(0, 1 - (dMin - HEATMAP_SOLID_PX) / (R - HEATMAP_SOLID_PX));
        const col = heatColor(tSum / wSum), o = (j * nx + i) * 4;
        img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    heatTexture.needsUpdate = true;
    heatMesh.visible = true;
  }

  const heatLegendEl = document.getElementById('heat-legend');
  function renderHeatLegend() {
    heatLegendEl.classList.toggle('hidden', !state.heatmap);
    if (!state.heatmap) return;
    const s = HEATMAP_STOPS, t0 = s[0][0], t1 = s[s.length - 1][0];
    const grad = 'linear-gradient(to right, ' + s.map(st => 'rgb(' + st[1].join(',') + ') ' + (((st[0] - t0) / (t1 - t0)) * 100).toFixed(1) + '%').join(', ') + ')';
    const st = state.heatStats;
    const f1 = v => v.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    heatLegendEl.innerHTML =
      '<div class="flex items-center justify-between gap-2 mb-1"><span class="font-bold text-slate-800 dark:text-slate-200">Zemin sıcaklığı (°C)</span>' + (st ? '<span class="font-mono">' + st.count + ' kabin</span>' : '') + '</div>' +
      '<div class="h-2.5 rounded-[2px]" style="background:' + grad + '"></div>' +
      '<div class="flex justify-between font-mono mt-0.5">' + s.map(x => '<span>' + x[0] + '</span>').join('') + '</div>' +
      '<div class="mt-1 font-mono text-slate-700 dark:text-slate-300">' + (st ? 'min ' + f1(st.min) + ' · ort ' + f1(st.avg) + ' · maks ' + f1(st.max) : 'Bu katta kabin sıcaklık verisi yok') + '</div>';
  }

  // ---------------------------------------------------------------------------
  // 42U açık çerçeve raf (createDetailedRackMesh) — model önü +X, kabinin ön yüzüne döndürülür
  // ---------------------------------------------------------------------------
  function registerBodyMat(o, mat, base, metal, rough) { (o.bodyMats = o.bodyMats || []).push({ mat, base, metal, rough }); }
  function paintBody(o) {
    const color = state.statusColoring ? STATUS_FILL[o.status] : null;
    if (o.bodyOutline) o.bodyOutline.visible = state.statusColoring;
    (o.bodyMats || []).forEach(b => {
      b.mat.color.setHex(color != null ? 0x000000 : b.base);
      b.mat.emissive.setHex(color != null ? color : 0x000000);
      b.mat.emissiveIntensity = 1;
      b.mat.metalness = color != null ? 0 : b.metal;
      b.mat.roughness = color != null ? 1 : b.rough;
      b.mat.needsUpdate = true;
    });
  }
  function bodyOutline(o, w, h, d) {
    const line = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), sharedOutlineMat);
    line.position.set(0, h / 2, 0);
    line.raycast = () => {};
    line.visible = state.statusColoring;
    o.bodyOutline = line;
    return line;
  }

  function createRack(cab, reg) {
    const group = new THREE.Group();
    const w = cabLen(cab), h = cab.height, d = cabSpan(cab);
    const shell = 0.07, back = 0.035, rail = 0.04;
    const panelMat = new THREE.MeshStandardMaterial({ color: DCIM_PALETTE.rackBody, roughness: 0.38, metalness: 0.65 });
    const backMat = new THREE.MeshStandardMaterial({ color: DCIM_PALETTE.rackInner, roughness: 0.5, metalness: 0.5 });
    const left = new THREE.Mesh(new THREE.BoxGeometry(w, h, shell), panelMat); left.position.set(0, h / 2, -d / 2 + shell / 2); group.add(left);
    const right = new THREE.Mesh(new THREE.BoxGeometry(w, h, shell), panelMat); right.position.set(0, h / 2, d / 2 - shell / 2); group.add(right);
    const top = new THREE.Mesh(new THREE.BoxGeometry(w - 0.004, shell, d - shell * 2), panelMat); top.position.set(0, h - shell / 2, 0); group.add(top);
    const bot = new THREE.Mesh(new THREE.BoxGeometry(w - 0.004, shell, d - shell * 2), sharedRackBodyMat); bot.position.set(0, shell / 2, 0); group.add(bot);
    const backMesh = new THREE.Mesh(new THREE.BoxGeometry(back, h - shell * 2, d - shell * 2), backMat); backMesh.position.set(-w / 2 + back / 2, h / 2, 0); group.add(backMesh);
    cab.meshPanels = [left, right, top, backMesh];
    cab.bodyMats = [];
    registerBodyMat(cab, panelMat, DCIM_PALETTE.rackBody, 0.65, 0.38);
    registerBodyMat(cab, backMat, DCIM_PALETTE.rackInner, 0.5, 0.5);
    paintBody(cab);
    group.add(bodyOutline(cab, w, h, d));
    const railGeo = new THREE.BoxGeometry(rail, h * 0.88, rail);
    const rl = new THREE.Mesh(railGeo, sharedRackRailMat); rl.position.set(w / 2 - 0.05, h / 2, -d * 0.38); group.add(rl);
    const rr = new THREE.Mesh(railGeo, sharedRackRailMat); rr.position.set(w / 2 - 0.05, h / 2, d * 0.38); group.add(rr);
    const ribGeo = new THREE.BoxGeometry(0.04, 0.03, d * 0.72);
    const tr = new THREE.Mesh(ribGeo, sharedRackBodyMat); tr.position.set(w / 2 - 0.03, h * 0.89, 0); group.add(tr);
    const br = new THREE.Mesh(ribGeo, sharedRackBodyMat); br.position.set(w / 2 - 0.03, h * 0.11, 0); group.add(br);
    const sc = statusColorHex(cab.status);
    const statusBar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, d * 0.36), new THREE.MeshStandardMaterial({ color: sc, emissive: sc, emissiveIntensity: 0.95, roughness: 0.2 }));
    statusBar.position.set(w / 2 + 0.02, h - 0.08, 0);
    statusBar.visible = state.layers.health;
    group.add(statusBar);
    cab.statusMesh = statusBar;
    const hit = new THREE.Mesh(new THREE.BoxGeometry(w * 1.06, h, d * 1.06), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.position.set(0, h / 2, 0);
    group.add(hit);
    if (reg) [hit, left, right, top, bot, backMesh, statusBar].forEach(m => reg(m, cab));
    return group;
  }

  /** Kabin yan/üst/arka panellerinin saydamlığı; null: tam opak. */
  function setPanelAlpha(cab, alpha) {
    (cab.meshPanels || []).forEach(m => {
      const mat = m.material;
      mat.transparent = alpha !== null;
      mat.opacity = alpha === null ? 1 : alpha;
      mat.depthWrite = alpha === null;
      mat.needsUpdate = true;
    });
  }

  // ---------------------------------------------------------------------------
  // Klima / Pano / UPS (yerel ön +Z; grup rotation ile yönlenir)
  // ---------------------------------------------------------------------------
  function createAirConditioner(eq) {
    const g = new THREE.Group();
    const w = eq.width, h = eq.height, d = eq.depth;
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.7 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
    body.position.y = h / 2; g.add(body); register(body, eq);
    eq.bodyMats = []; registerBodyMat(eq, bodyMat, 0x1e293b, 0.7, 0.4);
    g.add(bodyOutline(eq, w, h, d));
    const fz = d / 2 + 0.015;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.15, 0.03), new THREE.MeshStandardMaterial({ color: eq.status === 'critical' ? 0xef4444 : 0x10b981, roughness: 0.3, metalness: 0.8 }));
    strip.position.set(0, h - 0.25, fz); g.add(strip);
    const plenum = new THREE.Mesh(new THREE.BoxGeometry(w * 0.88, h * 0.22, 0.025), new THREE.MeshStandardMaterial({ color: 0x0b1320, roughness: 0.6 }));
    plenum.position.set(0, h * 0.84, fz); g.add(plenum);
    const louverMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.65, metalness: 0.6 });
    const n = state.quality === 'performance' ? 4 : 10, lh = (h * 0.55) / n;
    for (let i = 0; i < n; i++) {
      const lv = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, lh * 0.7, 0.02), louverMat);
      lv.position.set(0, 0.35 + (i + 0.5) * lh, fz); g.add(lv);
    }
    const lcd = new THREE.Mesh(new THREE.BoxGeometry(w * 0.36, 0.36, 0.01), new THREE.MeshStandardMaterial({ color: 0x06b6d4, emissive: 0x06b6d4, emissiveIntensity: 0.8, roughness: 0.2 }));
    lcd.position.set(0, h * 0.62, fz + 0.02); g.add(lcd);
    return g;
  }
  function createPanel(eq) {
    const g = new THREE.Group();
    const w = eq.width, h = eq.height, d = eq.depth;
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x242d3d, roughness: 0.4, metalness: 0.75 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
    body.position.y = h / 2; g.add(body); register(body, eq);
    eq.bodyMats = []; registerBodyMat(eq, bodyMat, 0x242d3d, 0.75, 0.4);
    g.add(bodyOutline(eq, w, h, d));
    const fz = d / 2 + 0.015;
    const header = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.12, 0.025), new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3, metalness: 0.8 }));
    header.position.set(0, h - 0.18, fz); g.add(header);
    const lampGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.02, 16); lampGeo.rotateX(Math.PI / 2);
    [[0xef4444, -0.28], [0xfacc15, 0], [0x3b82f6, 0.28]].forEach(l => {
      const m = new THREE.Mesh(lampGeo, new THREE.MeshStandardMaterial({ color: l[0], emissive: l[0], emissiveIntensity: 0.9 }));
      m.position.set(w * l[1], h - 0.42, fz + 0.015); g.add(m);
    });
    const kb = new THREE.Mesh(new THREE.BoxGeometry(w * 0.22, w * 0.22, 0.02), new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 }));
    kb.position.set(0, h * 0.48, fz + 0.015); g.add(kb);
    const kh = new THREE.Mesh(new THREE.BoxGeometry(w * 0.14, 0.06, 0.06), new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.3, metalness: 0.5 }));
    kh.position.set(0, h * 0.48, fz + 0.045); g.add(kh);
    return g;
  }
  function createUps(eq) {
    const g = new THREE.Group();
    const w = eq.width, h = eq.height, d = eq.depth;
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.75 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
    body.position.y = h / 2; g.add(body); register(body, eq);
    eq.bodyMats = []; registerBodyMat(eq, bodyMat, 0x1e293b, 0.75, 0.4);
    g.add(bodyOutline(eq, w, h, d));
    const fz = d / 2 + 0.015;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.15, 0.025), new THREE.MeshStandardMaterial({ color: eq.status === 'critical' ? 0xef4444 : 0x0ea5e9, roughness: 0.3, metalness: 0.8 }));
    strip.position.set(0, h - 0.25, fz); g.add(strip);
    const trayMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5, metalness: 0.7 });
    const th = (h * 0.6) / 6;
    for (let t = 0; t < 6; t++) {
      const tray = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, th * 0.88, 0.025), trayMat);
      tray.position.set(0, 0.4 + (t + 0.5) * th, fz); g.add(tray);
    }
    const disp = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 0.55, 0.03), new THREE.MeshStandardMaterial({ color: 0x0284c7, emissive: 0x0284c7, emissiveIntensity: 0.7, roughness: 0.3 }));
    disp.position.set(0, h * 0.78, fz + 0.015); g.add(disp);
    return g;
  }

  // --- Billboard etiket -------------------------------------------------------
  function createLabel(text, status) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 160;
    const ctx = c.getContext('2d');
    const x = 24, y = 28, bw = 464, bh = 104;
    ctx.fillStyle = 'rgba(11, 19, 32, 0.94)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, bw, bh, 24); else ctx.rect(x, y, bw, bh);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = statusColor(status);
    ctx.beginPath(); ctx.arc(x + 42, y + bh / 2, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.length > 14 ? text.substring(0, 13) + '…' : text, x + 74, y + bh / 2 + 2);
    const tex = new THREE.CanvasTexture(c);
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(3.0, (3.0 * 160) / 512, 1);
    sprite.userData.baseW = 3.0;
    return sprite;
  }

  // ---------------------------------------------------------------------------
  // Üst altyapı: şema ağ katmanı (fiber runner / tel tava) + kat geçişi
  // ---------------------------------------------------------------------------
  function setVertexFade(geo, fade) {
    const n = geo.getAttribute('position').count;
    const rgba = new Float32Array(n * 4).fill(1);
    for (let i = 0; i < n; i++) {
      const a = 1 - THREE.MathUtils.clamp(fade(i), 0, 1);
      rgba[i * 4 + 3] = a * a;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(rgba, 4));
  }
  function riserPiece(x, y, z, width, dir, material) {
    const sign = dir === 'up' ? 1 : -1;
    const len = dir === 'up' ? TRACE_FLOOR_FADE : y;
    const geo = new THREE.BoxGeometry(width, len, width, 1, 12, 1);
    const pos = geo.getAttribute('position');
    setVertexFade(geo, i => (dir === 'up' ? pos.getY(i) / len + 0.5 : 0));
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y + (sign * len) / 2, z);
    return mesh;
  }

  function buildOverhead() {
    clearGroup(fiberRunnerGroup);
    clearGroup(cableTrayGroup);
    const net = T.networkOf(state.floor);
    if (!net || !net.segs.length) return;
    const digits = T.floors().map(f => f.digit);
    const hasUp = digits.some(d => d > state.floor), hasDown = digits.some(d => d < state.floor);
    ['cable-tray', 'fiber-runner'].forEach(kind => {
      const lv = NETWORK_LEVEL[kind];
      const isTray = kind === 'cable-tray';
      const group = isTray ? cableTrayGroup : fiberRunnerGroup;
      const y = RACK_H + lv.above;
      const material = state.quality === 'performance'
        ? new THREE.MeshBasicMaterial({ color: lv.color })
        : new THREE.MeshStandardMaterial({ color: lv.color, roughness: 0.45, metalness: isTray ? 0.6 : 0.4, transparent: isTray, opacity: isTray ? 0.8 : 1 });
      const nodes = {};
      net.segs.forEach(s => {
        const a = planToWorld(s.a), b = planToWorld(s.b);
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        if (len < 1e-3) return;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, lv.thickness, lv.width), material);
        mesh.position.set((a.x + b.x) / 2, y, (a.z + b.z) / 2);
        mesh.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
        group.add(mesh);
        [s.a, s.b].forEach(p => { nodes[p.x + ',' + p.y] = p; });
      });
      Object.keys(nodes).forEach(k => {
        const p = planToWorld(nodes[k]);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(lv.width, lv.thickness, lv.width), material);
        cap.position.set(p.x, y, p.z);
        group.add(cap);
      });
      // Kat geçişi (şaft): üst kata sönerek yükselir, alt kata zemine kadar iner
      if (net.riser) {
        const r = planToWorld(net.riser);
        const fadeMat = material.clone();
        fadeMat.vertexColors = true;
        fadeMat.transparent = true;
        fadeMat.depthWrite = false;
        if (hasUp) group.add(riserPiece(r.x, y, r.z, lv.width, 'up', fadeMat));
        if (hasDown) group.add(riserPiece(r.x, y, r.z, lv.width, 'down', material));
      }
    });
    fiberRunnerGroup.visible = state.layers.fiber;
    cableTrayGroup.visible = state.layers.tray;
    if (traceCurve) dimNetworkLayers();
  }

  // ---------------------------------------------------------------------------
  // Kat kurulumu (selectFloor → rebuildScene)
  // ---------------------------------------------------------------------------
  const floorSelect = document.getElementById('floor-select');
  floorSelect.innerHTML = T.floors().map(f => '<option value="' + f.digit + '" class="bg-white text-slate-800 dark:bg-[#0b121e] dark:text-slate-200">' + esc(f.label) + '</option>').join('');

  function buildFloorScene(digit) {
    state.floor = digit;
    const f = T.floorOf(digit);
    L = f.layout;
    halfW = L.mapW / 2; halfH = L.mapH / 2;
    roomWidth = L.mapW * S; roomDepth = L.mapH * S;
    controls.maxDistance = Math.max(roomWidth, roomDepth) * ZOOM_MAX_FACTOR;

    [racksGroup, assetGroup, neighborAssetGroup, equipmentGroup, labelsGroup, traceGroup, portMarkerGroup].forEach(clearGroup);
    interactive = [];
    dataMap.clear();
    byId.clear();
    highlight(null);

    cabinets = T.cabinetsOf(digit).map(makeCabinet);
    const eq = T.equipmentOf(digit);
    equipment = []
      .concat(eq.climates.map(e => makeEquipment(e, 'airConditioner', 'Hassas Klima', RACK_H)))
      .concat(eq.panels.map(e => makeEquipment(e, 'airConditionerPanel', 'Klima Panosu', PANEL_H)))
      .concat(eq.ups.map(e => makeEquipment(e, 'upsUnit', 'UPS Sistemi', RACK_H)));

    buildFloor();
    cabinets.forEach(cab => {
      byId.set(cab.id, cab);
      const g = createRack(cab, register);
      g.position.set(cab.x, 0.01, cab.z);
      g.rotation.y = (cab.front < 0 ? Math.PI : 0) - (cab.frontZ ? Math.PI / 2 : 0);
      racksGroup.add(g);
      cab.meshGroup = g;
      const s = createLabel(cab.name, cab.status);
      s.position.set(cab.x, cab.height + 0.72, cab.z);
      labelsGroup.add(s);
      cab.labelSprite = s;
      register(s, cab);
    });
    equipment.forEach(e => {
      const g = e.type === 'airConditioner' ? createAirConditioner(e) : e.type === 'upsUnit' ? createUps(e) : createPanel(e);
      g.position.set(e.x, 0, e.z);
      g.rotation.y = e.rotation;
      equipmentGroup.add(g);
      e.meshGroup = g;
      paintBody(e);
      const s = createLabel(e.label, e.status);
      s.position.set(e.x, e.height + 0.72, e.z);
      labelsGroup.add(s);
      e.labelSprite = s;
      register(s, e);
    });
    buildOverhead();
    refreshHeatmap();

    racksGroup.visible = state.layers.racks;
    traceGroup.visible = state.layers.trace;
    document.getElementById('kpi-cabinets').textContent = cabinets.length.toLocaleString('tr-TR');
    document.getElementById('kpi-assets').textContent = '0';
    document.getElementById('page-title').textContent = f.title;
    document.getElementById('search').placeholder = 'Kabin ara: ' + (cabinets[Math.min(5, cabinets.length - 1)] || { name: '' }).name + ' veya RACK...';
    floorSelect.value = String(digit);
  }

  const floorLoadingEl = document.getElementById('floor-loading');
  function selectFloor(digit, then) {
    digit = +digit;
    if (!T.floors().some(f => f.digit === digit)) return;
    if (digit === state.floor && cabinets.length) { if (then) then(); return; }
    clearTrace(true);
    clearSelection();
    state.tab = 'cables';
    floorLoadingEl.classList.remove('hidden');
    setTimeout(() => {
      buildFloorScene(digit);
      fitAll(true);
      renderLayersMenu();
      renderDetail();
      floorLoadingEl.classList.add('hidden');
      if (then) then();
    }, 30);
  }
  floorSelect.addEventListener('change', () => selectFloor(floorSelect.value));

  // ---------------------------------------------------------------------------
  // Seçim, odak, yalıtım, iç cihazlar
  // ---------------------------------------------------------------------------
  let highlightMesh = null;
  let internalMeshes = [];
  let focusedCabId = '';
  let focusVisibleIds = null;
  const focusGhostIds = new Set();
  let traceTargetCabId = '';

  function highlight(obj) {
    if (highlightMesh) { scene.remove(highlightMesh); highlightMesh.geometry.dispose(); highlightMesh = null; }
    if (!obj) return;
    highlightMesh = new THREE.BoxHelper(obj, 0xfacc15);
    highlightMesh.material.depthTest = false;
    highlightMesh.material.transparent = true;
    highlightMesh.material.opacity = 0.95;
    highlightMesh.renderOrder = 999;
    scene.add(highlightMesh);
  }

  /** Odak (çift tık): odak kabini + iki yanındaki komşular görünür, diğer kabinler ve ekipman gizlenir. */
  function setCabinetFocus(id) {
    if (!id && !focusedCabId) { applyVisibility(); return; }
    const prevId = focusedCabId;
    focusedCabId = id;
    const cab = id ? byId.get(id) : null;
    const neighbors = cab ? focusRowNeighbors(cab) : [];
    focusVisibleIds = cab ? new Set([cab.id].concat(neighbors.map(c => c.id), [state.selectedCabinet ? state.selectedCabinet.id : '', traceTargetCabId])) : null;
    applyFocusLook(prevId, cab, neighbors);
    applyVisibility();
  }

  function applyVisibility() {
    const vis = focusVisibleIds;
    const isolated = !vis && state.isolation && !!state.selectedCabinet;
    cabinets.forEach(c => {
      const shown = vis ? vis.has(c.id) : !isolated || c === state.selectedCabinet;
      if (c.meshGroup) c.meshGroup.visible = shown;
      if (c.labelSprite) c.labelSprite.visible = shown;
    });
    equipmentGroup.visible = !vis;
    equipment.forEach(e => { if (e.labelSprite) e.labelSprite.visible = !vis; });
  }

  function applyFocusLook(prevId, cab, neighbors) {
    focusGhostIds.forEach(gid => {
      const g = byId.get(gid);
      if (g && g !== state.selectedCabinet && gid !== traceTargetCabId) setPanelAlpha(g, null);
    });
    focusGhostIds.clear();
    clearGroup(neighborAssetGroup);
    if (!cab) {
      const prev = prevId ? byId.get(prevId) : null;
      if (prev && prev === state.selectedCabinet && prevId !== traceTargetCabId) setPanelAlpha(prev, 0.22);
      return;
    }
    setPanelAlpha(cab, null);
    neighbors.forEach(n => {
      if (n === state.selectedCabinet || n.id === traceTargetCabId) return;
      setPanelAlpha(n, FOCUS_NEIGHBOR_ALPHA);
      focusGhostIds.add(n.id);
      if (state.focusNeighborAssets) addCabinetAssetMeshes(n, neighborAssetGroup, null);
    });
    neighborAssetGroup.visible = state.assetsVisible;
  }

  function focusRowNeighbors(cab) {
    const n = Math.min(FOCUS_NEIGHBOR_MAX, Math.max(0, Math.floor(Number(state.focusNeighborCount) || 0)));
    if (!n) return [];
    const tol = Math.min(cab.width, cab.depth) / 2;
    const row = cabinets
      .filter(o => o.front === cab.front && !!o.frontZ === !!cab.frontZ && (cab.frontZ ? Math.abs(o.z - cab.z) : Math.abs(o.x - cab.x)) < tol && (!cab.pod || !o.pod || o.pod === cab.pod))
      .sort((a, b) => (cab.frontZ ? a.x - b.x : a.z - b.z));
    const i = row.indexOf(cab);
    return i < 0 ? [] : row.slice(Math.max(0, i - n), i + n + 1).filter(o => o !== cab);
  }

  // --- CAT SVG yüz dokuları ----------------------------------------------------
  const faceTextures = new Map();
  const faceWaiters = new Map();
  function rasterizeFace(src) {
    if (!src) return Promise.resolve(null);
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const w = 1024;
        const ratio = img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalHeight / img.naturalWidth : 0.09;
        const h = Math.max(32, Math.min(2048, Math.round(w * ratio)));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        tex.userData.keep = true;
        resolve(tex);
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
  /** Kutunun bir yüzüne CAT yüz çizimi; çizimi olmayan model düz malzemeyle kalır. */
  function applyFaceTexture(mesh, faceIndex, asset, side) {
    const f = T.faceOf(asset, side);
    if (!f || !f.img) return;
    const key = (asset.modelId || asset.type) + '|' + asset.uSize + '|' + (asset.raw ? asset.raw.model : asset.feed) + '|' + side;
    const swap = tex => {
      const mats = mesh.material;
      if (!mesh.parent || !Array.isArray(mats)) return;
      const old = mats[faceIndex];
      mats[faceIndex] = new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      if (mats.indexOf(old) < 0) old.dispose();
    };
    if (faceTextures.has(key)) { swap(faceTextures.get(key)); return; }
    if (faceWaiters.has(key)) { faceWaiters.get(key).push(swap); return; }
    faceWaiters.set(key, [swap]);
    rasterizeFace(f.img).then(tex => {
      const waiters = faceWaiters.get(key) || [];
      faceWaiters.delete(key);
      if (!tex) return;
      faceTextures.set(key, tex);
      waiters.forEach(fn => fn(tex));
    });
  }

  /** Kabinin iç cihazları (raf cihazları + dikey PDU). reg: tıklanır bağlama (seçili kabin); null: yalnız görüntü. */
  function addCabinetAssetMeshes(cab, target, reg, onMesh) {
    const unitH = cab.height / RACK_U;
    const serverW = cabLen(cab) * 0.85, serverD = cabSpan(cab) * 0.82;
    const track = (mesh, data) => {
      target.add(mesh);
      if (reg && data) reg(mesh, data);
      if (onMesh) onMesh(mesh);
    };
    (cab.assets || []).forEach(asset => {
      if (asset.zeroU) { renderVerticalPdu(cab, asset, track); return; }
      const uStart = Math.min(42, Math.max(1, asset.uStart));
      const uSize = Math.min(42 - uStart + 1, Math.max(1, asset.uSize));
      const ah = uSize * unitH - 0.006;
      const ay = (uStart - 1) * unitH + ah / 2 + 0.013;
      const color = uSize >= 4 ? DCIM_PALETTE.asset4U : uSize >= 2 ? DCIM_PALETTE.asset2U : DCIM_PALETTE.asset1U;
      const serverMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.75, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      const frontFace = cab.front >= 0 ? 0 : 1, backFace = 1 - frontFace;
      const serverMesh = new THREE.Mesh(new THREE.BoxGeometry(serverW, ah, serverD), [serverMat, serverMat, serverMat, serverMat, serverMat, serverMat]);
      placeInCab(serverMesh, cab, -0.01 * cab.front, ay, 0);
      track(serverMesh, asset);
      applyFaceTexture(serverMesh, backFace, asset, 'back');
      const bezelMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.5, metalness: 0.5 });
      const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.015, ah, serverD * 0.96), [bezelMat, bezelMat, bezelMat, bezelMat, bezelMat, bezelMat]);
      placeInCab(bezel, cab, cab.front * (serverW / 2 + 0.005), ay, 0);
      track(bezel, reg ? asset : null);
      applyFaceTexture(bezel, frontFace, asset, 'front');
      const isSel = state.selectedAsset && state.selectedAsset.id === asset.id;
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.03), new THREE.MeshBasicMaterial({ color: isSel ? 0xfacc15 : asset.status === 'critical' ? 0xef4444 : asset.status === 'warning' ? 0xf59e0b : 0x22c55e }));
      placeInCab(led, cab, cab.front * (serverW / 2 + 0.015), ay, cab.front * serverD * 0.38);
      track(led, null);
    });
  }

  /** Dikey (0U) PDU şeridi: kabinin arka tarafında rafın yanında boydan boya; sırayla sağ/sol kenar. */
  function vpduGeom(cab, asset) {
    const serverW = cabLen(cab) * 0.85, serverD = cabSpan(cab) * 0.82;
    const idx = asset.vpduIndex || 0;
    const side = idx % 2 === 0 ? 1 : -1, row = Math.floor(idx / 2);
    const gap = Math.max(0.03, (cabSpan(cab) - serverD) / 2);
    const h = cab.height * 0.9;
    return { dx: -cab.front * (serverW / 2 - 0.04 - row * 0.07), y: 0.013 + h / 2, dz: side * (serverD / 2 + gap / 2), h, d: gap * 0.7 };
  }
  function renderVerticalPdu(cab, asset, track) {
    const g = vpduGeom(cab, asset);
    const pdu = new THREE.Mesh(new THREE.BoxGeometry(0.05, g.h, g.d), new THREE.MeshStandardMaterial({ color: asset.status === 'critical' ? 0x7f1d1d : 0x1f2937, roughness: 0.45, metalness: 0.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    placeInCab(pdu, cab, g.dx, g.y, g.dz);
    track(pdu, asset);
    const ledColor = asset.status === 'critical' ? 0xef4444 : asset.status === 'warning' ? 0xf59e0b : 0x22c55e;
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.02), new THREE.MeshBasicMaterial({ color: ledColor }));
    placeInCab(led, cab, g.dx - cab.front * 0.031, g.y + g.h / 2 - 0.05, g.dz);
    track(led, null);
  }

  function clearInternals() {
    internalMeshes.forEach(unregister);
    internalMeshes = [];
    clearGroup(assetGroup);
  }
  function renderInternals() {
    clearInternals();
    const cab = state.selectedCabinet;
    if (cab) addCabinetAssetMeshes(cab, assetGroup, register, m => internalMeshes.push(m));
    assetGroup.visible = state.assetsVisible && state.layers.racks;
    document.getElementById('kpi-assets').textContent = cab ? String(cab.assets.length) : '0';
  }

  function selectCabinet(cab) {
    if (!cab) return;
    if (cab.id !== focusedCabId) setCabinetFocus('');
    if (state.selectedCabinet && state.selectedCabinet !== cab && state.selectedCabinet.id !== traceTargetCabId) setPanelAlpha(state.selectedCabinet, null);
    const changed = state.selectedCabinet !== cab;
    state.selectedCabinet = cab;
    state.selectedEquipment = null;
    if (changed) { state.selectedAsset = null; state.inspectorFace = 'front'; }
    state.leftCollapsed = false;
    cancelPanelClose();
    highlight(cab.meshGroup);
    if (cab.id !== focusedCabId) setPanelAlpha(cab, 0.22);
    applyVisibility();
    renderInternals();
    syncPorts();
    renderAll();
  }
  function selectEquipment(eq) {
    setCabinetFocus('');
    if (state.selectedCabinet) setPanelAlpha(state.selectedCabinet, null);
    state.selectedEquipment = eq;
    state.selectedCabinet = null;
    state.selectedAsset = null;
    clearInternals();
    document.getElementById('kpi-assets').textContent = '0';
    highlight(eq.meshGroup);
    applyVisibility();
    syncPorts();
    renderAll();
  }
  function selectAsset(a) {
    state.selectedAsset = a;
    renderInternals();
    syncPorts();
    renderAll();
  }
  function clearSelection() {
    cancelPanelClose();
    setCabinetFocus('');
    if (state.selectedCabinet) setPanelAlpha(state.selectedCabinet, null);
    state.selectedCabinet = null;
    state.selectedEquipment = null;
    state.selectedAsset = null;
    clearInternals();
    syncPorts();
    highlight(null);
    applyVisibility();
    document.getElementById('kpi-assets').textContent = '0';
    renderAll();
  }

  let panelCloseTimer = null, leftClosing = false;
  function closeCabinetPanel() {
    if (leftClosing) return;
    if (!state.selectedCabinet) { clearSelection(); return; }
    leftClosing = true;
    leftDrawer.classList.add('closing');
    panelCloseTimer = setTimeout(() => {
      panelCloseTimer = null;
      if (!leftClosing) return;
      leftClosing = false;
      leftDrawer.classList.remove('closing');
      clearSelection();
    }, 300);
  }
  function cancelPanelClose() {
    if (panelCloseTimer) { clearTimeout(panelCloseTimer); panelCloseTimer = null; }
    leftClosing = false;
    if (leftDrawer) leftDrawer.classList.remove('closing');
  }

  // ---------------------------------------------------------------------------
  // Kamera
  // ---------------------------------------------------------------------------
  let camAnim = 0;
  function animateCameraTo(tx, ty, tz, lx, ly, lz, instant) {
    const sp = camera.position.clone(), tp = new THREE.Vector3(tx, ty, tz);
    const st = controls.target.clone(), et = new THREE.Vector3(lx, ly, lz);
    const id = ++camAnim;
    if (instant) { camera.position.copy(tp); controls.target.copy(et); controls.update(); return; }
    let p = 0;
    const step = () => {
      if (id !== camAnim) return;
      p += 0.055;
      if (p >= 1) { camera.position.copy(tp); controls.target.copy(et); controls.update(); return; }
      camera.position.lerpVectors(sp, tp, p);
      controls.target.lerpVectors(st, et, p);
      controls.update();
      requestAnimationFrame(step);
    };
    step();
  }
  function fitAll(instant) {
    setCabinetFocus('');
    if (!cabinets.length) { animateCameraTo(0, 32, 42, 0, 0, 0, instant); return; }
    const xs = cabinets.map(c => c.x), zs = cabinets.map(c => c.z);
    const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs), minZ = Math.min.apply(null, zs), maxZ = Math.max.apply(null, zs);
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const span = Math.max(maxX - minX, maxZ - minZ, 14);
    animateCameraTo(cx, Math.max(22, span * 0.85), cz + Math.max(24, span * 0.95), cx, RACK_H * 0.35, cz, instant);
  }
  function zoomBy(f) {
    const off = camera.position.clone().sub(controls.target).multiplyScalar(f);
    camera.position.copy(controls.target).add(off);
    controls.update();
  }
  /** Arama / derin bağlantı: kabine ön yüzü tarafından çapraz yukarıdan yaklaşır (sıra bağlamı görünür). */
  function focusCabinetView(cab) {
    const eye = cabPos(cab, cab.front * 15, RACK_H + 9, 9);
    animateCameraTo(eye.x, eye.y, eye.z, cab.x, RACK_H / 2, cab.z);
  }
  /** Kabin odağı: ön kapağın tam karşısından, tüm boy ekrana sığar; komşular yarı saydam, diğerleri gizli. */
  function focusOnCabinet(cab) {
    if (!state.selectedCabinet || state.selectedCabinet.id !== cab.id) selectCabinet(cab);
    setCabinetFocus(cab.id);
    const halfV = THREE.MathUtils.degToRad(camera.fov) / 2;
    const halfHz = Math.atan(Math.tan(halfV) * camera.aspect);
    const az = THREE.MathUtils.degToRad(FOCUS_CABINET_VIEW_DEG.azimuth);
    const el = THREE.MathUtils.degToRad(FOCUS_CABINET_VIEW_DEG.elevation);
    const faceW = cabSpan(cab) * Math.cos(az) + cabLen(cab) * Math.sin(az);
    const fit = Math.max((cab.height * 0.575) / Math.tan(halfV), (faceW * 0.575) / Math.tan(halfHz));
    const dist = Math.max(controls.minDistance * 1.02, fit);
    const cy = cab.height / 2;
    const eye = cabPos(cab, cab.front * dist * Math.cos(el) * Math.cos(az), cy + dist * Math.sin(el), dist * Math.cos(el) * Math.sin(az));
    animateCameraTo(eye.x, eye.y, eye.z, cab.x, cy, cab.z);
    renderLayersMenu();
  }
  function focusOnObject(obj) {
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const fit = (Math.max(size.x, size.y, size.z) * 0.8) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const dist = Math.max(controls.minDistance * 1.05, fit);
    const offset = camera.position.clone().sub(controls.target);
    const minEl = THREE.MathUtils.degToRad(FOCUS_ELEVATION_DEG[0]), maxEl = THREE.MathUtils.degToRad(FOCUS_ELEVATION_DEG[1]);
    const elev = THREE.MathUtils.clamp(Math.asin(offset.y / Math.max(offset.length(), 1e-6)), minEl, maxEl);
    const dir = offset.setY(0).lengthSq() > 1e-6 ? offset.normalize() : new THREE.Vector3(0, 0, 1);
    const pos = center.clone().addScaledVector(dir, dist * Math.cos(elev)).setY(center.y + dist * Math.sin(elev));
    animateCameraTo(pos.x, pos.y, pos.z, center.x, center.y, center.z);
  }
  /** Sağ tıkla kaydırırken bakış noktası zeminin altına inmez (kamera da inemez). */
  function clampCameraAboveFloor() {
    const dy = CAMERA_MIN_TARGET_Y - controls.target.y;
    if (dy <= 0) return;
    controls.target.y += dy;
    camera.position.y += dy;
  }

  function findOnFloors(q) {
    q = String(q || '').trim().toUpperCase();
    if (!q) return null;
    const floors = [state.floor].concat(T.floors().map(f => f.digit).filter(d => d !== state.floor));
    for (let i = 0; i < floors.length; i++) {
      const d = floors[i];
      const cab = T.cabinetsOf(d).find(c => c.code.toUpperCase() === q) || T.cabinetsOf(d).find(c => c.code.toUpperCase().indexOf(q) >= 0);
      if (cab) return { floor: d, kind: 'cabinet', key: cab.code };
      const eq = T.equipmentOf(d);
      const all = eq.climates.concat(eq.panels, eq.ups);
      const e = all.find(x => x.label.toUpperCase() === q) || all.find(x => x.label.toUpperCase().indexOf(q) >= 0 || x.devId.toUpperCase().indexOf(q) >= 0);
      if (e) return { floor: d, kind: 'equipment', key: e.label };
    }
    return null;
  }
  function goTo(hit, cb) {
    selectFloor(hit.floor, () => {
      if (hit.kind === 'cabinet') {
        const cab = cabinets.find(c => c.name === hit.key);
        if (cab) { selectCabinet(cab); focusCabinetView(cab); if (cb) cb(cab); }
      } else {
        const eq = equipment.find(e => e.label === hit.key);
        if (eq) { selectEquipment(eq); focusOnObject(eq.meshGroup); if (cb) cb(eq); }
      }
    });
  }
  function searchAndFocus(q) {
    const hit = findOnFloors(q);
    if (!hit) { DCIM.ui.toast('"' + String(q).trim() + '" ile eşleşen kabin veya ekipman bulunamadı.', 'warning'); return; }
    goTo(hit);
  }

  // ---------------------------------------------------------------------------
  // Pointer olayları
  // ---------------------------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const tip = document.getElementById('hover-tip');
  let hoverPending = false, lastHit = null, press = null, hoveredLabel = null, hoverButtons = 0;
  const isVisible = o => { let p = o; while (p) { if (!p.visible) return false; p = p.parent; } return true; };

  function pickHit(ev) {
    const r = canvas.getBoundingClientRect();
    mouse.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(interactive.filter(isVisible), false);
    const selId = state.selectedCabinet ? state.selectedCabinet.id : '';
    let shellHit = null;
    for (let i = 0; i < hits.length; i++) {
      const d = dataMap.get(hits[i].object);
      if (!d) continue;
      if (d.portKey || d.cabinetId) return d;
      if (d.type === 'cabinet' && d.id === selId) { if (!shellHit) shellHit = d; continue; }
      if (focusVisibleIds && (d.type !== 'cabinet' || !focusVisibleIds.has(d.id))) continue;
      return shellHit || d;
    }
    return shellHit;
  }

  canvas.addEventListener('pointermove', ev => {
    hoverButtons = ev.buttons;
    if (press) press.moved = Math.max(press.moved, Math.abs(ev.clientX - press.x) + Math.abs(ev.clientY - press.y));
    if (hoverPending) return;
    hoverPending = true;
    requestAnimationFrame(() => {
      hoverPending = false;
      const d = hoverButtons ? null : pickHit(ev);
      if (!d) { tip.classList.add('hidden'); lastHit = null; hoveredLabel = null; canvas.style.cursor = ''; return; }
      canvas.style.cursor = 'pointer';
      if (d !== lastHit) {
        lastHit = d;
        hoveredLabel = !d.portKey && !d.cabinetId ? d.labelSprite || null : null;
        let title, sub;
        if (d.portKey) {
          title = (state.selectedAsset ? state.selectedAsset.name : '') + ' · ' + d.name + ' (' + (d.side === 'back' ? 'Arka' : 'Ön') + ')';
          sub = d.remote ? '→ ' + d.remote.cabinet + ' · U' + d.remote.uplace + ' · ' + d.remote.portLabel + ' · tıkla: kabloyu izle' : 'Boş port (LNK kaydı yok)';
        } else if (d.cabinetId) {
          const cab = state.selectedCabinet;
          title = d.cabinetName + ' · ' + d.name;
          sub = 'Boyut: ' + (d.zeroU ? '0U (dikey PDU)' : d.uSize + 'U (' + d.uStart + 'U-' + d.uEnd + 'U)') + ' · Güç: ' + d.powerKw + ' kW · ' + (cab ? cab.temperature : '-') + ' °C';
        } else if (d.type === 'cabinet') {
          title = d.name;
          sub = 'Durum: ' + statusLabel(d.status) + ' · Sıcaklık: ' + d.temperature + ' °C';
        } else {
          title = d.label;
          sub = d.kind + ' · Durum: ' + statusLabel(d.status) + (d.ref.note ? ' · ' + d.ref.note : '');
        }
        tip.querySelector('[data-title]').textContent = title;
        tip.querySelector('[data-sub]').textContent = sub;
      }
      tip.style.left = ev.clientX + 12 + 'px';
      tip.style.top = ev.clientY + 12 + 'px';
      tip.classList.remove('hidden');
    });
  }, { passive: true });
  canvas.addEventListener('pointerleave', () => { tip.classList.add('hidden'); hoveredLabel = null; });
  canvas.addEventListener('pointerdown', ev => {
    press = { x: ev.clientX, y: ev.clientY, t: performance.now(), moved: 0, button: ev.button };
    if (state.following) stopFollowTrace();
  });
  canvas.addEventListener('pointerup', ev => {
    const p = press;
    press = null;
    if (!p || p.button !== 0 || p.moved > CLICK_MAX_MOVE_PX || performance.now() - p.t > CLICK_MAX_HOLD_MS) return;
    const d = pickHit(ev);
    if (!d) return;
    if (d.portKey) selectPort(d);
    else if (d.cabinetId) { selectAsset(d); state.rightCollapsed = false; renderDrawers(); }
    else if (d.type === 'cabinet') selectCabinet(d);
    else selectEquipment(d);
  });
  canvas.addEventListener('dblclick', ev => {
    const d = pickHit(ev);
    if (!d || d.portKey) return;
    if (state.following) stopFollowTrace();
    if (d.cabinetId) {
      const cab = cabinets.find(c => c.name === d.cabinetName) || state.selectedCabinet;
      if (cab && cab.id !== focusedCabId) focusOnCabinet(cab);
      selectAsset(d);
      state.rightCollapsed = false;
      renderDrawers();
    } else if (d.type === 'cabinet') focusOnCabinet(d);
    else if (d.meshGroup) focusOnObject(d.meshGroup);
  });

  // ---------------------------------------------------------------------------
  // Kablo izleme: portlar (CAT + LNK) ve 3D port işaretleri
  // ---------------------------------------------------------------------------
  let portMarkers = [];
  function syncPorts() {
    const asset = state.selectedCabinet && state.tab === 'cables' ? state.selectedAsset : null;
    const id = asset ? asset.id : '';
    if (id !== state.portsAssetId) {
      state.portsAssetId = id;
      state.ports = asset ? T.portsOf(asset) : [];
      state.selectedPortKey = '';
    }
    renderPortMarkers();
  }
  function visiblePorts() {
    const q = state.portSearch.trim().toLocaleLowerCase('tr');
    return state.ports.filter(p =>
      (state.portSide === 'all' || p.side === state.portSide) &&
      (state.portStatus === 'all' || (state.portStatus === 'connected') === p.connected) &&
      (!q || [p.name, p.id, p.media, p.remote && p.remote.cabinet, p.remote && p.remote.portLabel, p.remote && p.remote.assetId, p.remote && p.remote.deviceType]
        .some(v => String(v == null ? '' : v).toLocaleLowerCase('tr').indexOf(q) >= 0)));
  }

  function portAnchor(cab, uStart, uSize, side, fx, fy) {
    const unitH = cab.height / RACK_U;
    const u0 = Math.min(RACK_U, Math.max(1, uStart || 1));
    const size = Math.min(RACK_U - u0 + 1, Math.max(1, uSize || 1));
    const ah = size * unitH - 0.006, yBottom = (u0 - 1) * unitH + 0.013;
    const faceW = cabSpan(cab) * 0.82 * 0.96;
    const dir = (side === 'back' ? -1 : 1) * cab.front;
    const x = Math.min(1, Math.max(0, fx == null ? 0.5 : fx)), y = Math.min(1, Math.max(0, fy == null ? 0.5 : fy));
    return {
      pos: cabPos(cab, -0.01 * cab.front + dir * ((cabLen(cab) * 0.85) / 2 + 0.02), yBottom + ah * (1 - y), dir * (faceW / 2 - x * faceW)),
      dir,
      n: cabPos(cab, dir, 0, 0).sub(cabPos(cab, 0, 0, 0))
    };
  }
  function assetAnchor(cab, asset, side, fx, fy) {
    if (!asset.zeroU) return portAnchor(cab, asset.uStart, asset.uSize, side, fx, fy);
    const g = vpduGeom(cab, asset);
    const dir = (side === 'back' ? 1 : -1) * cab.front;
    const x = Math.min(1, Math.max(0, fx == null ? 0.5 : fx)), y = Math.min(1, Math.max(0, fy == null ? 0.5 : fy));
    return {
      pos: cabPos(cab, g.dx + dir * 0.03, g.y + g.h / 2 - x * g.h, g.dz + (y - 0.5) * g.d),
      dir,
      n: cabPos(cab, dir, 0, 0).sub(cabPos(cab, 0, 0, 0))
    };
  }

  function renderPortMarkers() {
    portMarkers.forEach(unregister);
    portMarkers = [];
    clearGroup(portMarkerGroup);
    const cab = state.selectedCabinet, asset = state.selectedAsset;
    if (!cab || !asset || !state.ports.length || state.portsAssetId !== asset.id) return;
    const size = asset.zeroU ? 0.04 : Math.min(0.07, Math.max(0.03, asset.uSize * (cab.height / RACK_U) * 0.2));
    const geo = new THREE.BoxGeometry(0.014, size, size);
    const free = new THREE.MeshBasicMaterial({ color: PORT_FREE_COLOR });
    const linked = new THREE.MeshBasicMaterial({ color: PORT_LINKED_COLOR });
    const selected = new THREE.MeshBasicMaterial({ color: PORT_SELECTED_COLOR });
    state.ports.forEach(port => {
      if (!port.hasPosition) return;
      const isSel = port.portKey === state.selectedPortKey;
      const mesh = new THREE.Mesh(geo, isSel ? selected : port.connected ? linked : free);
      mesh.position.copy(assetAnchor(cab, asset, port.side, port.x, port.y).pos);
      mesh.rotation.y = cab.frontZ ? -Math.PI / 2 : 0;
      if (isSel) mesh.scale.setScalar(1.8);
      portMarkerGroup.add(mesh);
      portMarkers.push(mesh);
      register(mesh, port);
    });
  }

  function selectPort(port) {
    state.selectedPortKey = port.portKey;
    renderPortMarkers();
    if (port.connected && port.remote) traceFromPort(port);
    else {
      clearTraceScene();
      state.trace = null;
      state.traceMessage = port.name + ': bu port için LNK bağlantı kaydı yok.';
    }
    renderDetail();
    renderDrawers();
  }

  // ---------------------------------------------------------------------------
  // Kablo güzergâhı: kaynak port → fiber runner / tel tava → hedef port (ya da kat geçişi)
  // ---------------------------------------------------------------------------
  let traceCurve = null, traceCurveLength = 0, tracePulses = [], traceEndMarkers = [], traceFadeFrom = 1;
  let traceFollow = null, preTraceView = null, tracedRemote = null, pendingPort = null;
  const clock = new THREE.Clock();

  function roundedPolylinePath(points, radius) {
    const pts = points.filter((p, i) => i === 0 || p.distanceTo(points[i - 1]) > 1e-4);
    const path = new THREE.CurvePath();
    if (pts.length < 2) return path;
    let cursor = pts[0].clone();
    for (let i = 1; i < pts.length - 1; i++) {
      const cur = pts[i];
      const dIn = cur.clone().sub(pts[i - 1]), dOut = pts[i + 1].clone().sub(cur);
      const r = Math.min(radius, dIn.length() / 2, dOut.length() / 2);
      dIn.normalize(); dOut.normalize();
      if (dIn.dot(dOut) > 0.9999) continue;
      if (r < 1e-3) {
        if (cursor.distanceTo(cur) > 1e-4) path.add(new THREE.LineCurve3(cursor, cur.clone()));
        cursor = cur.clone();
        continue;
      }
      const a = cur.clone().addScaledVector(dIn, -r), b = cur.clone().addScaledVector(dOut, r);
      if (cursor.distanceTo(a) > 1e-4) path.add(new THREE.LineCurve3(cursor, a));
      path.add(new THREE.QuadraticBezierCurve3(a, cur.clone(), b));
      cursor = b;
    }
    const last = pts[pts.length - 1];
    if (cursor.distanceTo(last) > 1e-4) path.add(new THREE.LineCurve3(cursor, last.clone()));
    return path;
  }

  const realLengthM = (a, b) => Math.hypot(b.x - a.x, b.z - a.z) / S * PX_TO_M + Math.abs(b.y - a.y) / RACK_H * RACK_REAL_HEIGHT_M;

  function traceFromPort(port) {
    const cab = state.selectedCabinet, asset = state.selectedAsset, remote = port.remote;
    if (!cab || !asset || !remote) return;
    stopFollowTrace();
    state.traceMessage = '';
    const found = T.findAsset(remote.assetId);
    const tAsset = found ? found.asset : null;
    const sameFloor = remote.floor === state.floor;
    const targetCab = sameFloor ? cabinets.find(c => c.name === remote.cabinet) : null;
    const tFace = tAsset ? T.faceOf(tAsset, remote.side) : null;
    const tPort = tFace ? tFace.ports.find(p => p.name === remote.portLabel) : null;
    const targetFloor = sameFloor ? null : { digit: remote.floor, name: T.floorOf(remote.floor).label, dir: remote.floor > state.floor ? 'up' : 'down' };
    drawCableTrace(port, cab, asset, targetCab, tAsset, { side: remote.side, fx: tPort ? tPort.x : 0.5, fy: tPort ? tPort.y : 0.5 }, targetFloor);
  }

  function drawCableTrace(port, cab, asset, targetCab, tAsset, target, targetFloor) {
    const remote = port.remote;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const stubOf = c => Math.max(0.1, Math.min(0.3, cabLen(c) * 0.04));
    const topOf = c => c.height + 0.3;
    const src = assetAnchor(cab, asset, port.side, port.x, port.y);
    const s1 = src.pos.clone().addScaledVector(src.n, stubOf(cab));
    const dst = targetCab && tAsset ? assetAnchor(targetCab, tAsset, target.side, target.fx, target.fy) : null;
    const t1 = dst ? dst.pos.clone().addScaledVector(dst.n, stubOf(targetCab)) : null;
    const kind = /OM\d|OS\d|LC/.test(port.linkType || '') ? 'fiber-runner' : 'cable-tray';
    const netY = RACK_H + NETWORK_LEVEL[kind].above;
    const pts = [src.pos, s1];
    let riserEnd = 0, dropStart = 0, route;
    if (targetCab === cab && dst && t1) {
      route = 'same-cabinet';
      if (src.dir === dst.dir) {
        const zM = (cabSpan(cab) * 0.82 * 0.96) / 2 + 0.12;
        const ch = cabPos(cab, 0, 0, zM);
        if (cab.frontZ) pts.push(V(ch.x, s1.y, s1.z), V(ch.x, t1.y, t1.z));
        else pts.push(V(s1.x, s1.y, ch.z), V(t1.x, t1.y, ch.z));
      } else {
        pts.push(V(s1.x, topOf(cab), s1.z), V(t1.x, topOf(cab), t1.z));
      }
      pts.push(t1, dst.pos);
      riserEnd = pts.length - 1;
      dropStart = riserEnd;
    } else {
      const from = worldToPlan(s1);
      const plan = T.route(state.floor, from, targetCab && t1 ? worldToPlan(t1) : null) || [];
      pts.push(V(s1.x, topOf(cab), s1.z));
      if (plan.length) {
        const entry = planToWorld(plan[0]);
        pts.push(V(entry.x, topOf(cab), entry.z));
        plan.forEach(p => { const w = planToWorld(p); pts.push(V(w.x, netY, w.z)); });
        riserEnd = pts.length - plan.length;
        dropStart = pts.length - 1;
        route = targetCab ? kind : 'off-floor';
        if (targetCab) {
          const exit = planToWorld(plan[plan.length - 1]);
          pts.push(V(exit.x, topOf(targetCab), exit.z));
        }
      } else {
        const yOver = RACK_H + NETWORK_LEVEL['fiber-runner'].above;
        pts.push(V(s1.x, yOver, s1.z));
        riserEnd = pts.length - 1;
        if (t1) pts.push(V(t1.x, yOver, s1.z), V(t1.x, yOver, t1.z));
        dropStart = pts.length - 1;
        route = targetCab ? 'direct' : 'off-floor';
      }
      if (targetCab && dst && t1) pts.push(V(t1.x, topOf(targetCab), t1.z), t1, dst.pos);
    }
    let riserM = 0, networkM = 0, dropM = 0;
    for (let i = 1; i < pts.length; i++) {
      const m = realLengthM(pts[i - 1], pts[i]);
      if (i <= riserEnd) riserM += m; else if (i <= dropStart) networkM += m; else dropM += m;
    }
    const uText = a => (a.zeroU ? '0U' : 'U' + a.uStart);
    const srcEnd = { cabinet: cab.name, device: asset.name, devId: asset.devId, u: uText(asset), port: port.name, side: port.side };
    const dstEnd = { cabinet: remote.cabinet || '?', device: tAsset ? tAsset.name : remote.device || remote.assetId, devId: remote.assetId, u: tAsset ? uText(tAsset) : 'U' + remote.uplace, port: remote.portLabel, side: target.side };
    const exitPos = pts[pts.length - 1];
    let fadeLen = 0;
    if (!targetCab && targetFloor) {
      // Kat geçişinde dikey kablo: üst kata sönerek yükselir, alt kata zemine kadar iner (yükseltici / riser)
      fadeLen = targetFloor.dir === 'up' ? TRACE_FLOOR_FADE : Math.min(TRACE_FLOOR_FADE, exitPos.y);
      pts.push(V(exitPos.x, exitPos.y + (targetFloor.dir === 'up' ? fadeLen : -fadeLen), exitPos.z));
    }
    const floorText = targetFloor ? (targetFloor.dir === 'up' ? '↑ ÜST' : '↓ ALT') + ' KAT · ' + targetFloor.name.toLocaleUpperCase('tr') : '';
    const dstTitle = targetCab ? 'HEDEF' : targetFloor ? 'HEDEF ' + floorText : 'HEDEF BU KATTA DEĞİL';
    renderTraceScene(pts, src.pos, dst ? dst.pos : exitPos, srcEnd, dstEnd, dstTitle, fadeLen);

    traceGroup.add(deviceOutline(cab, asset, TRACE_SRC_COLOR, false));
    if (targetCab) {
      traceGroup.add(deviceOutline(targetCab, tAsset, TRACE_DST_COLOR, targetCab !== cab));
      if (targetCab !== cab && targetCab.meshGroup) {
        const box = new THREE.BoxHelper(targetCab.meshGroup, TRACE_DST_COLOR);
        box.material.transparent = true;
        box.material.opacity = 0.55;
        traceGroup.add(box);
        if (targetCab !== state.selectedCabinet) setPanelAlpha(targetCab, 0.25);
        traceTargetCabId = targetCab.id;
        if (targetCab.meshGroup && !targetCab.meshGroup.visible && focusVisibleIds) { focusVisibleIds.add(targetCab.id); applyVisibility(); }
      }
    }
    tracedRemote = remote;
    state.trace = {
      lnkId: port.lnkId, linkType: port.linkType, status: port.linkStatus, description: port.description,
      source: srcEnd, target: dstEnd, route, riserM, networkM, dropM, totalM: riserM + networkM + dropM, targetFloor
    };
    state.traceMessage = targetCab ? '' : targetFloor
      ? 'Hedef kabin ' + (remote.cabinet || '?') + ' ' + (targetFloor.dir === 'up' ? 'üst' : 'alt') + ' katta (' + targetFloor.name + '); kablo ağ üzerinden kat geçişine (yükseltici şaft) kadar çizildi.'
      : 'Hedef kabin ' + (remote.cabinet || '?') + ' bu kat planında yok; kablo ağa girişe kadar çizildi.';
    if (!state.layers.trace) { state.layers.trace = true; traceGroup.visible = true; }
    focusTrace();
  }

  function deviceOutline(cab, asset, color, fill) {
    const group = new THREE.Group();
    if (!asset) return group;
    const unitH = cab.height / RACK_U;
    let box;
    if (asset.zeroU) {
      const g = vpduGeom(cab, asset);
      placeInCab(group, cab, g.dx, g.y, g.dz);
      box = new THREE.BoxGeometry(0.1, g.h + 0.04, g.d + 0.05);
    } else {
      const u0 = Math.min(RACK_U, Math.max(1, asset.uStart || 1));
      const ah = Math.min(RACK_U - u0 + 1, Math.max(1, asset.uSize || 1)) * unitH;
      placeInCab(group, cab, -0.01 * cab.front, (u0 - 1) * unitH + ah / 2 + 0.013, 0);
      box = new THREE.BoxGeometry(cabLen(cab) * 0.85 + 0.05, ah + 0.03, cabSpan(cab) * 0.82 + 0.05);
    }
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false }));
    edges.renderOrder = 998;
    group.add(edges);
    if (fill) group.add(new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false })));
    return group;
  }

  function createTraceLabel(title, detail, accent) {
    const c = document.createElement('canvas');
    c.width = 640; c.height = 200;
    const ctx = c.getContext('2d');
    const x = 16, y = 30, w = 608, h = 140;
    ctx.fillStyle = 'rgba(8, 15, 28, 0.94)';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 18); else ctx.rect(x, y, w, h);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = accent;
    ctx.fillRect(x + 4, y + 18, 8, h - 36);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(title, x + 34, y + 42);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText(detail.length > 26 ? detail.substring(0, 25) + '…' : detail, x + 34, y + 96);
    const tex = new THREE.CanvasTexture(c);
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  }

  function renderTraceScene(points, srcPos, dstPos, srcEnd, dstEnd, dstTitle, fadeLen) {
    clearTraceScene();
    const curve = roundedPolylinePath(points, CABLE_CORNER_RADIUS);
    if (!curve.curves.length) return;
    const length = curve.getLength();
    const segments = Math.min(1600, Math.max(64, Math.round(length / 0.05)));
    const fadeFrom = fadeLen > 0 ? Math.max(0.05, 1 - fadeLen / length) : 1;
    const fading = fadeFrom < 1;
    const tube = radius => {
      const geo = new THREE.TubeGeometry(curve, segments, radius, 12, false);
      const uv = geo.getAttribute('uv');
      if (fading) setVertexFade(geo, i => (uv.getX(i) - fadeFrom) / (1 - fadeFrom));
      return geo;
    };
    const fadeOpts = fading ? { vertexColors: true, transparent: true, alphaTest: 0.01 } : {};
    const cable = new THREE.Mesh(tube(CABLE_RADIUS), new THREE.MeshBasicMaterial(Object.assign({ color: TRACE_CABLE_COLOR }, fadeOpts)));
    const edge = new THREE.Mesh(tube(CABLE_RADIUS * 1.6), new THREE.MeshBasicMaterial(Object.assign({ color: TRACE_CABLE_EDGE_COLOR, side: THREE.BackSide }, fadeOpts)));
    const halo = new THREE.Mesh(tube(CABLE_RADIUS * 4.2), new THREE.MeshBasicMaterial({ color: TRACE_CABLE_COLOR, transparent: true, opacity: 0.26, depthWrite: false, vertexColors: fading }));
    if (fading) halo.renderOrder = 1;
    traceGroup.add(halo, edge, cable);
    // Uzaktan bakışta tüp incelse de kablo seçilsin: ekran pikseli çizgi (Line2 yerine; vendor paketinde yok)
    const linePts = curve.getSpacedPoints(segments).slice(0, Math.max(2, Math.floor(segments * fadeFrom) + 1));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePts), new THREE.LineBasicMaterial({ color: TRACE_CABLE_COLOR }));
    line.renderOrder = 2;
    traceGroup.add(line);

    // Çift yönlü akış: kaynaktan giden darbeler parlak, hedeften gelenler pembe; her darbe sönen kuyruklu
    const pulseCount = Math.min(12, Math.max(4, Math.round(length / 9)));
    const tailGap = (CABLE_RADIUS * 3.5) / length;
    [{ out: true, radius: 3.0, color: 0xffffff, opacity: 1 }, { out: false, radius: 2.6, color: TRACE_DST_COLOR, opacity: 0.85 }].forEach(flow => {
      const geo = new THREE.SphereGeometry(CABLE_RADIUS * flow.radius, 12, 8);
      for (let j = 0; j < TRACE_PULSE_TAIL; j++) {
        const fade = 1 - j / TRACE_PULSE_TAIL;
        const solid = j === 0 && flow.opacity >= 1;
        const mat = new THREE.MeshBasicMaterial({ color: flow.color, transparent: !solid, opacity: flow.opacity * fade * fade, depthWrite: solid });
        for (let i = 0; i < pulseCount; i++) {
          const mesh = new THREE.Mesh(geo, mat);
          const size = 1 - 0.18 * j;
          mesh.scale.setScalar(size);
          traceGroup.add(mesh);
          tracePulses.push({ mesh, out: flow.out, offset: (i + (flow.out ? 0 : 0.5)) / pulseCount, lag: j * tailGap, size });
        }
      }
    });
    const endGeo = new THREE.SphereGeometry(0.09, 16, 12);
    [[srcPos, TRACE_SRC_COLOR], [dstPos, TRACE_DST_COLOR]].forEach(e => {
      const marker = new THREE.Mesh(endGeo, new THREE.MeshBasicMaterial({ color: e[1] }));
      marker.position.copy(e[0]);
      traceGroup.add(marker);
      traceEndMarkers.push(marker);
    });
    const srcLabel = createTraceLabel('KAYNAK', srcEnd.cabinet + ' · ' + srcEnd.u + ' · ' + srcEnd.port, '#10b981');
    srcLabel.position.set(srcPos.x, srcPos.y + 0.9, srcPos.z);
    const dstLabel = createTraceLabel(dstTitle, dstEnd.cabinet + ' · ' + dstEnd.u + ' · ' + dstEnd.port, '#f472b6');
    dstLabel.position.set(dstPos.x, dstPos.y + 0.9, dstPos.z);
    const labelW = 3.0 * TRACE_LABEL_RATIO;
    [srcLabel, dstLabel].forEach(s => { s.scale.set(labelW, (labelW * 200) / 640, 1); s.renderOrder = 1000; traceGroup.add(s); });
    traceCurve = curve;
    traceCurveLength = length;
    traceFadeFrom = fadeFrom;
    dimNetworkLayers();
  }

  function dimNetworkLayers() {
    const done = new Set();
    [fiberRunnerGroup, cableTrayGroup].forEach(g => g.children.forEach(o => {
      const mat = o.material;
      if (!mat || done.has(mat)) return;
      done.add(mat);
      mat.transparent = true;
      mat.opacity = Math.min(mat.opacity, 1) * 0.35;
      mat.depthWrite = false;
      mat.needsUpdate = true;
    }));
  }

  function clearTraceScene() {
    stopFollowTrace();
    const had = !!traceCurve;
    clearGroup(traceGroup);
    traceCurve = null;
    traceCurveLength = 0;
    tracePulses = [];
    traceEndMarkers = [];
    traceFadeFrom = 1;
    if (focusedCabId && focusedCabId === traceTargetCabId) {
      setCabinetFocus('');
      if (state.selectedCabinet) setPanelAlpha(state.selectedCabinet, 0.22);
    }
    const target = traceTargetCabId ? byId.get(traceTargetCabId) : null;
    if (target && target !== state.selectedCabinet) setPanelAlpha(target, null);
    traceTargetCabId = '';
    if (focusedCabId) setCabinetFocus(focusedCabId);
    if (had) buildOverhead();
  }

  function clearTrace(silent) {
    clearTraceScene();
    state.trace = null;
    tracedRemote = null;
    state.traceMessage = '';
    state.selectedPortKey = '';
    renderPortMarkers();
    const view = preTraceView;
    preTraceView = null;
    if (view && !silent) animateCameraTo(view.pos.x, view.pos.y, view.pos.z, view.target.x, view.target.y, view.target.z);
    if (!silent) { renderDetail(); renderDrawers(); }
  }

  function focusTrace() {
    if (!traceCurve) return;
    if (!preTraceView) preTraceView = { pos: camera.position.clone(), target: controls.target.clone() };
    const box = new THREE.Box3().setFromPoints(traceCurve.getSpacedPoints(64).filter((_, i) => i / 64 <= traceFadeFrom));
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    const span = Math.max(s.x, s.z, 12);
    animateCameraTo(c.x + span * 0.3, c.y + span * 0.7, c.z + span * 0.85, c.x, RACK_H * 0.5, c.z);
  }
  function followTrace() {
    if (!traceCurve) return;
    state.autoRotate = false;
    renderRotateBtn();
    traceFollow = { start: clock.getElapsedTime(), duration: Math.min(18, Math.max(6, traceCurveLength / 5)) };
    controls.enabled = false;
    state.following = true;
  }
  function stopFollowTrace() {
    if (!traceFollow) return;
    traceFollow = null;
    controls.enabled = true;
    state.following = false;
    renderDetail();
  }
  /** Karşı uç: hedef kabin ve cihaz seçilir, aynı kablo oradan izlenir (başka kattaysa o kata geçilir). */
  function goToTraceTarget() {
    const remote = tracedRemote;
    if (!remote) return;
    const back = { assetId: remote.assetId, portLabel: remote.portLabel, side: remote.side };
    const apply = () => {
      const cab = cabinets.find(c => c.name === remote.cabinet);
      if (!cab) return;
      state.tab = 'cables';
      selectCabinet(cab);
      const asset = cab.assets.find(a => a.id === back.assetId);
      if (asset) selectAsset(asset);
      state.rightCollapsed = false;
      const port = state.ports.find(p => p.side === back.side && p.name === back.portLabel) || state.ports.find(p => p.name === back.portLabel);
      if (port) selectPort(port); else renderAll();
    };
    if (remote.floor !== state.floor) { preTraceView = null; selectFloor(remote.floor, apply); } else apply();
  }

  const followDir = new THREE.Vector3(1, 0, 0);
  function updateTraceAnimation(time) {
    const curve = traceCurve;
    if (!curve) return;
    const period = Math.max(2.5, traceCurveLength / 10);
    const phaseOut = (time / period) % 1, phaseIn = (time / (period * 1.2)) % 1;
    tracePulses.forEach(p => {
      const u = (((p.out ? phaseOut : phaseIn) + p.offset) % 1) - p.lag;
      const t = p.out ? u : 1 - u;
      const k = t > traceFadeFrom ? 1 - (t - traceFadeFrom) / (1 - traceFadeFrom) : 1;
      p.mesh.visible = u >= 0 && k > 0.05;
      if (!p.mesh.visible) return;
      p.mesh.position.copy(curve.getPoint(Math.min(1, Math.max(0, t))));
      p.mesh.scale.setScalar(p.size * k);
    });
    const pulse = 1 + 0.3 * Math.sin(time * 5);
    traceEndMarkers.forEach(m => m.scale.setScalar(pulse));
    const f = traceFollow;
    if (!f) return;
    const tt = Math.min(1, (time - f.start) / f.duration);
    const e = (tt < 0.5 ? 2 * tt * tt : 1 - Math.pow(-2 * tt + 2, 2) / 2) * traceFadeFrom;
    const p = curve.getPoint(e), ahead = curve.getPoint(Math.min(traceFadeFrom, e + 0.03));
    const dir = ahead.clone().sub(p).setY(0);
    if (dir.lengthSq() > 1e-6) followDir.lerp(dir.normalize(), 0.08).normalize();
    camera.position.lerp(p.clone().addScaledVector(followDir, -5).add(new THREE.Vector3(0, 3, 0)), 0.12);
    controls.target.lerp(ahead, 0.2);
    if (tt >= 1) {
      const end = curve.getPoint(traceFadeFrom);
      stopFollowTrace();
      if (traceTargetCabId && byId.has(traceTargetCabId)) {
        setCabinetFocus(traceTargetCabId);
        setPanelAlpha(byId.get(traceTargetCabId), null);
        if (state.selectedCabinet) setPanelAlpha(state.selectedCabinet, null);
      }
      animateCameraTo(end.x + 6, end.y + 3, end.z + 6, end.x, end.y, end.z);
    }
  }

  function routeLabel(tr) {
    switch (tr.route) {
      case 'fiber-runner': return 'Fiber runner üzerinden en kısa yol';
      case 'cable-tray': return 'Tel tava üzerinden en kısa yol';
      case 'same-cabinet': return 'Aynı kabin içi';
      case 'off-floor': return tr.targetFloor ? 'Hedef ' + (tr.targetFloor.dir === 'up' ? 'üst' : 'alt') + ' katta: ' + tr.targetFloor.name + ' (' + (tr.targetFloor.dir === 'up' ? '↑' : '↓') + ' kat geçişi)' : 'Hedef başka katta';
      default: return 'Doğrudan (katta fiber runner ağı yok)';
    }
  }

  // ---------------------------------------------------------------------------
  // Başlık: katman yöneticisi menüsü
  // ---------------------------------------------------------------------------
  const layersBtn = document.getElementById('layers-btn');
  const layersMenu = document.getElementById('layers-menu');
  const layersBackdrop = document.getElementById('layers-backdrop');
  const swRow = (key, label, color, checked) =>
    '<div class="flex items-center justify-between gap-2 p-2 rounded-[2px] bg-slate-100/60 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-xs">' +
      '<span class="flex items-center gap-2"><i class="w-2 h-2 rounded-[1px] ' + color + ' inline-block"></i><span>' + label + '</span></span>' +
      '<label class="relative inline-flex items-center cursor-pointer"><input type="checkbox" data-layer="' + key + '"' + (checked ? ' checked' : '') + ' class="sr-only peer" />' +
      '<div class="dt3d-switch peer-checked:bg-blue-600"></div></label></div>';

  function renderLayersMenu() {
    layersMenu.classList.toggle('hidden', !state.layersOpen);
    layersBackdrop.classList.toggle('hidden', !state.layersOpen);
    layersBtn.setAttribute('aria-expanded', String(state.layersOpen));
    layersBtn.querySelector('[data-chevron]').className = 'pi text-[10px] ' + (state.layersOpen ? 'pi-chevron-up' : 'pi-chevron-down');
    if (!state.layersOpen) return;
    const sel = state.selectedAsset || state.selectedCabinet || state.selectedEquipment;
    const selName = state.selectedAsset ? state.selectedAsset.name : state.selectedCabinet ? state.selectedCabinet.name : state.selectedEquipment ? state.selectedEquipment.label : '';
    const lvl = state.selectedOpacityLevel;
    layersMenu.innerHTML =
      (sel ? '<div class="flex items-center gap-1.5 pb-2 mb-0.5 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white"><i class="pi text-[11px] text-sky-500 ' + (state.selectedAsset || state.selectedEquipment ? 'pi-box' : 'pi-server') + '"></i><span class="truncate">' + esc(selName) + '</span></div>' : '') +
      '<div class="space-y-1.5' + (sel ? ' mt-2' : '') + '">' +
        swRow('isolation', 'İzole görünüm', 'bg-blue-500', state.isolation) +
        swRow('racks', 'Rack / Assetler', 'bg-slate-500', state.layers.racks) +
        swRow('fiber', 'Fiber Runner', 'bg-amber-500', state.layers.fiber) +
        swRow('tray', 'Kablo Kanalı', 'bg-slate-500', state.layers.tray) +
        swRow('trace', 'Aktif Trace', 'bg-pink-500', state.layers.trace) +
        swRow('health', 'Sağlık / Alarmlar', 'bg-rose-500', state.layers.health) +
        '<div class="flex items-center justify-between gap-2 p-2 rounded-[2px] bg-slate-100/60 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-xs" title="Kabine çift tıklayınca o kabin opak, iki yanındaki bu sayıda komşu yarı saydam görünür; diğerleri gizlenir">' +
          '<span class="flex items-center gap-2"><i class="w-2 h-2 rounded-[1px] bg-indigo-500 inline-block"></i><span>Komşu göster</span></span>' +
          '<select data-neighbors aria-label="Odakta gösterilecek komşu kabin sayısı" class="h-6 px-1 text-xs rounded-[2px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 cursor-pointer">' +
            Array.from({ length: FOCUS_NEIGHBOR_MAX + 1 }, (_, n) => '<option value="' + n + '"' + (n === state.focusNeighborCount ? ' selected' : '') + '>' + (n === 0 ? 'Yok' : n + ' (' + (2 * n + 1) + ' kabin)') + '</option>').join('') +
          '</select></div>' +
        (state.focusNeighborCount > 0 ? swRow('nbAssets', 'Komşu cihazları', 'bg-indigo-300', state.focusNeighborAssets) : '') +
        '<div class="p-2 rounded-[2px] bg-slate-100/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 text-xs space-y-1">' +
          '<div class="flex justify-between items-center text-[10px] text-slate-600 dark:text-slate-400"><span>Duvar Opaklığı</span><b class="font-mono text-slate-700 dark:text-slate-300" data-wall-val>' + state.wallOpacity + '%</b></div>' +
          '<input type="range" min="0" max="100" step="5" value="' + state.wallOpacity + '" data-wall aria-label="Duvar opaklığı" class="w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-slate-500" />' +
        '</div>' +
        (state.selectedCabinet ? '<div class="p-2 rounded-[2px] bg-slate-100/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 text-xs space-y-1">' +
          '<div class="flex justify-between items-center text-[10px] text-slate-600 dark:text-slate-400"><span>Seçili Varlık Opaklığı</span><b class="font-mono text-blue-600 dark:text-blue-400" data-op-val>' + lvl + '/5 · ' + VISIBILITY_LABELS_TR[lvl - 1] + '</b></div>' +
          '<input type="range" min="1" max="5" step="1" value="' + lvl + '" data-sel-op class="w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600" /></div>' : '') +
      '</div>' +
      '<div class="mt-3 p-2.5 rounded-[2px] bg-slate-100/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 text-xs">' +
        '<div class="flex justify-between items-center text-[11px]"><span class="text-slate-500 dark:text-slate-400 font-medium">Fiber runner kapasitesi</span><b class="text-amber-500 font-mono">68%</b></div>' +
        '<div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div class="h-full bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500" style="width: 68%"></div></div>' +
        '<p class="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed mt-2">Circuit kabloları on-demand çizilir. İzolasyon açıkken yalnızca çalışma bağlamındaki rack\'ler vurgulanır.</p>' +
      '</div>';

    layersMenu.querySelectorAll('[data-layer]').forEach(inp => inp.addEventListener('change', () => {
      const k = inp.getAttribute('data-layer');
      if (k === 'isolation') { state.isolation = inp.checked; if (!focusVisibleIds) applyVisibility(); return; }
      if (k === 'nbAssets') { state.focusNeighborAssets = inp.checked; if (focusedCabId) setCabinetFocus(focusedCabId); return; }
      state.layers[k] = inp.checked;
      racksGroup.visible = state.layers.racks;
      assetGroup.visible = state.layers.racks && state.assetsVisible;
      fiberRunnerGroup.visible = state.layers.fiber;
      cableTrayGroup.visible = state.layers.tray;
      traceGroup.visible = state.layers.trace;
      cabinets.forEach(c => { if (c.statusMesh) c.statusMesh.visible = state.layers.health; });
    }));
    layersMenu.querySelector('[data-neighbors]').addEventListener('change', e => {
      state.focusNeighborCount = +e.target.value;
      if (focusedCabId) setCabinetFocus(focusedCabId);
      renderLayersMenu();
    });
    layersMenu.querySelector('[data-wall]').addEventListener('input', e => {
      state.wallOpacity = +e.target.value;
      layersMenu.querySelector('[data-wall-val]').textContent = state.wallOpacity + '%';
      applyWallStyle();
    });
    const op = layersMenu.querySelector('[data-sel-op]');
    if (op) op.addEventListener('input', e => {
      state.selectedOpacityLevel = +e.target.value;
      const l = state.selectedOpacityLevel;
      layersMenu.querySelector('[data-op-val]').textContent = l + '/5 · ' + VISIBILITY_LABELS_TR[l - 1];
      if (state.selectedCabinet) setPanelAlpha(state.selectedCabinet, [0.10, 0.20, 0.35, 0.50, 0.70][l - 1] || 0.22);
    });
  }
  layersBtn.addEventListener('click', () => { state.layersOpen = !state.layersOpen; renderLayersMenu(); });
  layersBackdrop.addEventListener('click', () => { state.layersOpen = false; renderLayersMenu(); });

  // ---------------------------------------------------------------------------
  // Sol panel: kabin detayı (CabinetInspectorComponent)
  // ---------------------------------------------------------------------------
  const leftDrawer = document.getElementById('left-drawer');
  const inspector = document.getElementById('inspector');
  let stageObs = null;
  const uLabels = Array.from({ length: 42 }, (_, i) => 42 - i);
  const btnSeg = active => 'h-6 px-2 text-[10px] font-bold rounded-[2px] transition-colors cursor-pointer ' + (active ? 'bg-sky-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:text-sky-600');
  const btnFace = active => 'h-6 px-2 text-[10px] font-bold rounded-[2px] transition-colors cursor-pointer ' + (active ? 'bg-slate-700 text-white dark:bg-slate-600' : 'text-slate-600 dark:text-slate-300 hover:text-sky-600');
  const isHot = v => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) && n >= 30; };

  function renderInspector() {
    const cab = state.selectedCabinet;
    leftDrawer.classList.toggle('hidden', !cab);
    leftDrawer.classList.toggle('collapsed', !!cab && state.leftCollapsed);
    if (!cab) { disposeMini(); inspector.innerHTML = ''; return; }
    leftDrawer.querySelector('[data-left-name]').textContent = cab.name;
    const c = cab.ref, lost = c.status === 'lost';
    const tv = v => (lost ? '-' : v.toFixed(1) + ' °C');
    const chips = [
      { label: 'Üst', value: tv(c.tempTop), warn: !lost && c.tempTop >= 30 },
      { label: 'Orta', value: tv(c.tempMid), warn: !lost && c.tempMid >= 30 },
      { label: 'Alt', value: tv(c.tempLow), warn: !lost && c.tempLow >= 30 },
      { label: 'Nem', value: lost ? '-' : '%' + c.humidity, warn: false }
    ];
    const rack = cab.assets.filter(a => !a.zeroU), vpdu = cab.assets.filter(a => a.zeroU);
    const selId = state.selectedAsset ? state.selectedAsset.id : '';
    const view = state.inspectorView;
    inspector.innerHTML =
      '<div class="flex items-stretch gap-1 pb-2 border-b border-slate-200 dark:border-slate-800 shrink-0">' +
        chips.map(ch => '<div class="flex-1 min-w-0 px-1.5 py-1 rounded-[2px] bg-slate-100/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 text-center" title="Kabin içi ' + ch.label.toLocaleLowerCase('tr') + ' değeri">' +
          '<span class="text-[8px] uppercase tracking-wider text-slate-500 dark:text-slate-400 block leading-none">' + ch.label + '</span>' +
          '<b class="text-[10px] font-mono block leading-tight mt-0.5 truncate ' + (ch.warn ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white') + '">' + ch.value + '</b></div>').join('') +
      '</div>' +
      '<div class="flex items-center justify-between gap-2 pt-2 pb-2 shrink-0">' +
        '<div class="min-w-0"><div class="text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-none">Kabin Detayı</div>' +
          '<div class="flex items-center gap-1.5 mt-0.5 min-w-0"><h3 class="text-xs font-bold text-slate-900 dark:text-white truncate">' + esc(cab.name) + '</h3>' +
          '<span class="w-2 h-2 rounded-full shrink-0" style="background:' + statusColor(cab.status) + '" title="' + statusLabel(cab.status) + '"></span></div></div>' +
        '<div class="flex items-center gap-1 shrink-0">' +
          '<div class="inline-flex p-0.5 rounded-[2px] bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700" role="group" aria-label="Kabin görünümü">' +
            '<button type="button" data-view="2d" aria-pressed="' + (view === '2d') + '" class="' + btnSeg(view === '2d') + '">2D</button>' +
            '<button type="button" data-view="3d" aria-pressed="' + (view === '3d') + '" class="' + btnSeg(view === '3d') + '">3D</button>' +
          '</div>' +
          '<button type="button" data-collapse title="Paneli daralt" class="h-6 w-6 flex items-center justify-center rounded-[2px] text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer"><i class="pi pi-chevron-left text-[10px]"></i></button>' +
          '<button type="button" data-close title="Seçimi temizle ve kapat" class="h-6 w-6 flex items-center justify-center rounded-[2px] text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-rose-500 transition-colors cursor-pointer"><i class="pi pi-times text-[10px]"></i></button>' +
        '</div>' +
      '</div>' +
      '<div class="flex items-center justify-between gap-2 pb-2 shrink-0">' +
        (view === '2d' ? '<div class="inline-flex p-0.5 rounded-[2px] bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700" role="group" aria-label="Kabin yüzü">' +
          '<button type="button" data-face="front" class="' + btnFace(state.inspectorFace === 'front') + '">Ön</button>' +
          '<button type="button" data-face="back" class="' + btnFace(state.inspectorFace === 'back') + '">Arka</button></div>' : '<span class="text-[10px] text-slate-500 dark:text-slate-400">Sürükle: döndür · tekerlek: yakınlaştır</span>') +
        (rack.length ? '<span class="text-[10px] font-mono text-slate-500 dark:text-slate-400">' + cab.usedU + ' / 42U</span>' : '') +
      '</div>' +
      '<div class="rack-stage" data-stage></div>' +
      (!rack.length && !vpdu.length ? '<div class="shrink-0 mt-2 p-3 rounded-[2px] bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center"><i class="pi pi-inbox text-slate-400 dark:text-slate-500 text-xl block mb-1"></i><p class="text-[11px] text-slate-600 dark:text-slate-300 font-semibold">Bu kabinde kayıtlı cihaz bulunamadı</p></div>' : '') +
      '<div class="shrink-0 flex gap-1.5 mt-2.5">' +
        '<a href="cabinet-detail.html?cabinet=' + encodeURIComponent(cab.name) + '" class="flex-1 py-1.5 text-xs rounded-[2px] bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors cursor-pointer text-center" title="Kabin Detay Sayfasına Git">Kabin Detayı</a>' +
        '<button type="button" data-to2d class="flex-1 py-1.5 text-xs rounded-[2px] bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors cursor-pointer text-center" title="Kabini 2D krokide seçili aç">2D Krokide Göster</button>' +
        '<button type="button" data-close class="py-1.5 px-3 text-xs rounded-[2px] bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-medium transition-colors cursor-pointer">Temizle</button>' +
      '</div>';

    const stage = inspector.querySelector('[data-stage]');
    if (view === '2d') {
      disposeMini();
      const face = state.inspectorFace;
      const devHtml = rack.map(a => {
        const f = T.faceOf(a, face);
        const img = f && f.img ? T.stretch(f.img) : '';
        const top = 100 - ((a.uStart - 1) / RACK_U) * 100 - (a.uSize / RACK_U) * 100;
        return '<button type="button" data-asset="' + esc(a.id) + '" class="mini-device' + (a.id === selId ? ' selected' : '') + (img ? ' has-img' : '') + '" style="top:' + top + '%;height:calc(' + (a.uSize / RACK_U) * 100 + '% - 1px)" title="' + esc(a.name + ' · U' + a.uStart + (a.uStart !== a.uEnd ? '–U' + a.uEnd : '') + ' · ' + a.uSize + 'U') + '">' +
          (img ? '<img src="' + img + '" alt="" draggable="false" />' : '<span class="mini-name">' + esc(a.name) + '</span>') +
          '<span class="mini-led" style="background:' + statusColor(a.status) + ';color:' + statusColor(a.status) + '"></span></button>';
      }).join('') + vpdu.map(a => {
        const idx = a.vpduIndex || 0;
        const edge = idx % 2 === 0 ? 'left' : 'right';
        return '<button type="button" data-asset="' + esc(a.id) + '" class="mini-vpdu' + (a.id === selId ? ' selected' : '') + (a.status === 'critical' ? ' fault' : '') + '" style="' + edge + ':' + (3 + Math.floor(idx / 2) * 9) + 'px" title="' + esc(a.name) + ' · 0U PDU"></button>';
      }).join('');
      stage.innerHTML = '<div class="mini-rack-wrap" data-wrap><div class="mini-u-labels">' + uLabels.map(u => '<div>' + u + '</div>').join('') + '</div><div class="mini-rack" data-rack>' + devHtml + '</div></div>';
      stage.querySelectorAll('[data-asset]').forEach(b => b.addEventListener('click', () => {
        const a = cab.assets.find(x => x.id === b.getAttribute('data-asset'));
        if (a) { selectAsset(a); state.rightCollapsed = false; renderDrawers(); }
      }));
    } else {
      mountMini(stage, cab);
    }
    fitStage();
    if (stageObs) stageObs.disconnect();
    if (window.ResizeObserver) { stageObs = new ResizeObserver(fitStage); stageObs.observe(stage); }

    inspector.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { state.inspectorView = b.getAttribute('data-view'); renderInspector(); }));
    inspector.querySelectorAll('[data-face]').forEach(b => b.addEventListener('click', () => { state.inspectorFace = b.getAttribute('data-face'); renderInspector(); }));
    inspector.querySelector('[data-collapse]').addEventListener('click', () => { state.leftCollapsed = true; renderDrawers(); });
    inspector.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeCabinetPanel));
    inspector.querySelector('[data-to2d]').addEventListener('click', () => navigateTo2D(cab.name));
  }

  /** Raf sahnesi panelin kalan yüksekliğini kaplar; 2D raf yüksekliğe göre ölçeklenir. */
  function fitStage() {
    const stage = inspector.querySelector('[data-stage]');
    if (!stage) return;
    const h = Math.max(300, Math.floor(stage.clientHeight)), w = Math.floor(stage.clientWidth);
    if (!w) return;
    const wrapEl = stage.querySelector('[data-wrap]');
    if (wrapEl) {
      const rackH = h - 14;
      const rackW = Math.max(200, Math.min(w, Math.round(rackH * 0.31 + 90)));
      wrapEl.style.maxWidth = rackW + 'px';
      wrapEl.style.setProperty('--u-px', (rackH / 42) + 'px');
      stage.querySelector('[data-rack]').style.height = rackH + 'px';
    }
    if (mini) mini.resize();
  }

  // --- 3D kabin görünümü: 360° döndürülebilir raf (CAT SVG yüz dokuları) -------
  let mini = null;
  function disposeMini() {
    if (!mini) return;
    mini.alive = false;
    cancelAnimationFrame(mini.raf);
    mini.controls.dispose();
    clearGroup(mini.scene);
    mini.renderer.dispose();
    mini = null;
  }
  function mountMini(host, cab) {
    disposeMini();
    host.innerHTML = '<div class="mini-3d" data-mini>' +
      '<div class="absolute top-2 left-2 z-10 flex items-center gap-1 bg-white/95 dark:bg-slate-950/90 p-0.5 rounded-[3px] border border-slate-200 dark:border-slate-700/60 shadow-md">' +
        '<button type="button" data-mini-view="front" class="' + btnSeg(false) + '">Ön <span class="inline-block w-1.5 h-1.5 rounded-full ' + (cab.ref.frontDoor === 'open' ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500') + '"></span></button>' +
        '<button type="button" data-mini-view="back" class="' + btnSeg(false) + '">Arka <span class="inline-block w-1.5 h-1.5 rounded-full ' + (cab.ref.rearDoor === 'open' ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500') + '"></span></button>' +
        '<button type="button" data-mini-auto title="360° sürekli döndür" class="' + btnSeg(false) + '"><i class="pi pi-sync text-[9px]"></i> 360°</button>' +
      '</div><canvas></canvas></div>';
    const box = host.querySelector('[data-mini]');
    const cv = box.querySelector('canvas');
    const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const sc = new THREE.Scene();
    sc.add(new THREE.AmbientLight(0xffffff, 1.3));
    const l1 = new THREE.DirectionalLight(0xffffff, 1.5); l1.position.set(12, 18, 10); sc.add(l1);
    const l2 = new THREE.DirectionalLight(0x90cdf4, 0.7); l2.position.set(-10, 8, -12); sc.add(l2);
    // Kabin yerel çerçevede: ön +X (yön bağımsız aynı görünüm)
    const pseudo = Object.assign({}, cab, { x: 0, z: 0, front: 1, frontZ: false, width: cabLen(cab), depth: cabSpan(cab) });
    const meshes = [], data = new Map();
    const reg = (m, d) => { meshes.push(m); data.set(m, d); };
    const rackG = createRack(pseudo, null);
    sc.add(rackG);
    setPanelAlphaList(pseudo.meshPanels, 0.35);
    const inner = new THREE.Group();
    sc.add(inner);
    addCabinetAssetMeshes(pseudo, inner, reg);
    const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
    const ctl = new THREE.OrbitControls(cam, cv);
    ctl.enableDamping = true;
    ctl.dampingFactor = 0.15;
    ctl.enablePan = false;
    ctl.minDistance = 6;
    ctl.maxDistance = 30;
    ctl.target.set(0, RACK_H / 2, 0);
    const dist = 17;
    const setView = deg => {
      const a = THREE.MathUtils.degToRad(deg);
      cam.position.set(Math.cos(a) * dist, RACK_H / 2 + 2.2, Math.sin(a) * dist);
      ctl.update();
    };
    setView(-27);
    mini = {
      alive: true, renderer: r, scene: sc, camera: cam, controls: ctl, raf: 0,
      resize() {
        const w = Math.max(1, box.clientWidth), h = Math.max(1, box.clientHeight);
        r.setSize(w, h, false);
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
      }
    };
    const m = mini;
    m.resize();
    const loop = () => {
      if (!m.alive) return;
      m.raf = requestAnimationFrame(loop);
      ctl.update();
      r.render(sc, cam);
    };
    loop();
    box.querySelectorAll('[data-mini-view]').forEach(b => b.addEventListener('click', () => { ctl.autoRotate = false; setView(b.getAttribute('data-mini-view') === 'front' ? 0 : 180); }));
    box.querySelector('[data-mini-auto]').addEventListener('click', () => { ctl.autoRotate = !ctl.autoRotate; ctl.autoRotateSpeed = 2; });
    let down = null;
    cv.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
    cv.addEventListener('pointerup', e => {
      if (!down || Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 5) { down = null; return; }
      down = null;
      const rc = cv.getBoundingClientRect();
      const v = new THREE.Vector2(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(v, cam);
      const hit = ray.intersectObjects(meshes, false)[0];
      const a = hit ? data.get(hit.object) : null;
      if (a) { selectAsset(cab.assets.find(x => x.id === a.id) || a); state.rightCollapsed = false; renderDrawers(); }
    });
  }
  function setPanelAlphaList(list, alpha) {
    (list || []).forEach(mm => { mm.material.transparent = true; mm.material.opacity = alpha; mm.material.depthWrite = false; });
  }

  // ---------------------------------------------------------------------------
  // Sağ panel — Kablolar / Sensörler / Güç & PDU
  // ---------------------------------------------------------------------------
  const rightDrawer = document.getElementById('right-drawer');
  const detailPanel = document.getElementById('detail-panel');
  const tabBtn = (t, label) => '<button type="button" data-tab="' + t + '" class="flex-1 py-1.5 text-xs font-semibold rounded-[2px] transition-colors cursor-pointer ' +
    (state.tab === t ? 'bg-white dark:bg-blue-600 text-blue-600 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white') + '">' + label + '</button>';
  const segBtn = (attr, val, label, on) => '<button type="button" ' + attr + '="' + val + '" aria-pressed="' + on + '" class="h-6 px-2 text-[10px] font-bold rounded-[2px] transition-colors cursor-pointer ' + (on ? 'bg-sky-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:text-sky-600') + '">' + label + '</button>';
  const f1 = v => v.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const sideLabel = s => (s === 'back' ? 'Arka' : 'Ön');
  const portTitle = p => p.remote ? p.name + ' (' + sideLabel(p.side) + ') → ' + p.remote.cabinet + ' · U' + p.remote.uplace + ' · ' + p.remote.portLabel : p.name + ' (' + sideLabel(p.side) + ') · boş';

  function renderDetail() {
    const cab = state.selectedCabinet, eq = state.selectedEquipment;
    let html = '<div class="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-200 dark:border-slate-800"><h2 class="text-xs font-bold text-slate-900 dark:text-white">Detay Paneli</h2>' +
      '<button type="button" data-collapse-right title="Paneli daralt" class="h-6 w-6 flex items-center justify-center rounded-[2px] text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer"><i class="pi pi-chevron-right text-[10px]"></i></button></div>';
    if (!cab && !eq) {
      html += '<div class="grid place-items-center min-h-[220px] text-center p-6 text-slate-500 dark:text-slate-400 text-xs leading-relaxed"><div class="space-y-2"><i class="pi pi-server text-3xl text-slate-400 dark:text-slate-600 block"></i>' +
        '<div class="whitespace-pre-line">Bir rack seçin.\nTek tık yalnızca seçim yapar. Çift tık rack\'e odaklanır.\nİzolasyon varsayılan olarak açıktır.</div></div></div>';
    } else if (eq) {
      html += '<div class="space-y-3">' +
        '<div class="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800"><div>' +
          '<div class="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">' + esc(T.floorOf(state.floor).title) + '</div>' +
          '<h3 class="text-sm font-bold text-slate-900 dark:text-white mt-0.5">' + esc(eq.label) + '</h3>' +
          '<div class="text-[11px] text-slate-500 dark:text-slate-400">' + esc(eq.devId) + ' · ' + esc(eq.kind) + '</div></div>' +
          '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ' + statusClass(eq.status) + '">' + statusLabel(eq.status) + '</span>' +
        '</div>' +
        (eq.ref.note ? '<div class="p-2 rounded-[2px] text-[11px] font-bold border ' + (eq.status === 'critical' ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300') + '"><i class="pi pi-exclamation-triangle mr-1"></i>' + esc(eq.ref.note) + '</div>' : '') +
        '<div class="space-y-1 p-2 rounded-[2px] bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs">' +
          '<div class="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase pb-1 border-b border-slate-200 dark:border-slate-800">Canlı Telemetri</div>' +
          (eq.ref.points || []).map(p => '<div class="flex justify-between items-center py-1 border-b border-slate-200/50 dark:border-slate-800/50 text-[11px]"><span class="text-slate-600 dark:text-slate-400">' + esc(p.label) + '</span><b class="font-mono ' + (p.status === 'alarm' ? 'text-rose-500' : p.status === 'warning' ? 'text-amber-500' : 'text-slate-900 dark:text-white') + '">' + esc(p.value) + (p.unit ? ' ' + esc(p.unit) : '') + '</b></div>').join('') +
        '</div>' +
        '<div class="flex gap-2"><button type="button" data-eq-2d class="flex-1 py-1.5 text-xs rounded-[2px] bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors cursor-pointer text-center">2D Krokide Göster</button>' +
        '<button type="button" data-clear class="py-1.5 px-3 text-xs rounded-[2px] bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-medium transition-colors cursor-pointer">Seçimi temizle</button></div>' +
      '</div>';
    } else {
      const a = state.selectedAsset;
      html += '<div class="flex gap-1 p-1 bg-slate-100 dark:bg-slate-900/80 rounded-[2px] sticky top-0 z-10 border border-slate-200 dark:border-slate-800">' + tabBtn('cables', 'Kablolar') + tabBtn('sensors', 'Sensörler') + tabBtn('power', 'Güç &amp; PDU') + '</div>' +
        '<div class="flex items-center flex-wrap gap-1 text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider my-2"><span>DCIM</span><i class="pi pi-chevron-right text-[8px]"></i><span>ROW ' + esc(cab.row || '-') + '</span><i class="pi pi-chevron-right text-[8px]"></i><b class="text-slate-900 dark:text-white font-bold">' + esc(cab.name) + '</b>' +
        (a ? '<i class="pi pi-chevron-right text-[8px]"></i><b class="text-sky-500 font-bold">' + esc(a.devId) + '</b>' : '') + '</div>';
      if (state.tab === 'power') html += powerTab(cab);
      else if (state.tab === 'sensors') html += sensorsTab(cab);
      else html += cablesTab(cab, a);
    }
    html += traceSection();
    detailPanel.innerHTML = html;
    bindDetail(cab, eq);
  }

  function powerTab(cab) {
    const c = cab.ref;
    const pdus = cab.assets.filter(a => a.zeroU).map(p => {
      const cur = p.feed === 'A' ? c.pduA : c.pduB;
      const fault = p.feed === 'B' && c.pduFault;
      return { name: 'PDU-' + p.feed + ' (Besleme ' + p.feed + ')', ip: p.ip, current: cur.toFixed(1), voltage: fault ? 0 : 229 + (p.feed === 'A' ? 1 : 0), power: (cur * 0.23).toFixed(2), status: fault ? 'fault' : cur > 16 ? 'warning' : 'ok' };
    });
    const badge = s => s === 'fault' ? 'bg-rose-500/15 text-rose-600 border border-rose-500/30' : s === 'warning' ? 'bg-amber-500/15 text-amber-600 border border-amber-500/30' : 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/30';
    return '<div class="space-y-3">' +
      '<div class="p-3 rounded-[2px] bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">' +
        '<div class="flex items-start justify-between gap-2"><div><div class="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">KABİN GÜÇ TÜKETİMİ</div><h4 class="text-xs sm:text-sm font-bold text-slate-900 dark:text-white mt-0.5">' + esc(cab.name) + ' · Güç Özeti</h4></div>' +
        '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20"><i class="pi pi-bolt mr-1 text-[9px]"></i> PDU Telemetrisi</span></div>' +
        '<div class="grid grid-cols-2 gap-2 mt-2.5">' +
          '<div class="p-2 rounded-[2px] bg-white dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 text-center"><small class="text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-400 block">Toplam Anlık Güç</small><strong class="text-xs sm:text-sm font-mono text-sky-600 dark:text-sky-400 block mt-0.5">' + cab.powerKw + ' kW</strong></div>' +
          '<div class="p-2 rounded-[2px] bg-white dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 text-center"><small class="text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-400 block">Aktif PDU Sayısı</small><strong class="text-xs sm:text-sm font-mono text-slate-900 dark:text-white block mt-0.5">' + pdus.length + ' Ünite</strong></div>' +
        '</div></div>' +
      '<div class="space-y-2">' + pdus.map(p =>
        '<div class="p-3 rounded-[2px] bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">' +
          '<div class="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800"><div class="flex items-center gap-2">' +
            '<div class="w-6 h-6 rounded-[2px] bg-sky-500/15 text-sky-600 dark:text-sky-400 font-bold flex items-center justify-center text-xs"><i class="pi pi-bolt text-xs"></i></div>' +
            '<div><h5 class="text-xs font-bold text-slate-900 dark:text-white leading-none">' + esc(p.name) + '</h5><small class="text-[10px] text-slate-500 dark:text-slate-400 font-mono">' + esc(p.ip) + '</small></div></div>' +
            '<span class="px-1.5 py-0.5 rounded-[2px] text-[9px] font-bold ' + badge(p.status) + '">' + (p.status === 'fault' ? 'FAZ KAYBI' : p.status === 'warning' ? 'YÜKSEK AKIM' : 'NORMAL') + '</span></div>' +
          '<div class="grid grid-cols-3 gap-1.5 mt-2 text-center text-xs">' +
            '<div class="p-1.5 bg-white dark:bg-slate-950/70 rounded-[2px] border border-slate-200 dark:border-slate-800"><span class="text-[9px] text-slate-500 dark:text-slate-400 block">Akım</span><b class="font-mono text-amber-600 dark:text-amber-400">' + p.current + ' A</b></div>' +
            '<div class="p-1.5 bg-white dark:bg-slate-950/70 rounded-[2px] border border-slate-200 dark:border-slate-800"><span class="text-[9px] text-slate-500 dark:text-slate-400 block">Gerilim</span><b class="font-mono text-slate-900 dark:text-slate-100">' + p.voltage + ' V</b></div>' +
            '<div class="p-1.5 bg-white dark:bg-slate-950/70 rounded-[2px] border border-slate-200 dark:border-slate-800"><span class="text-[9px] text-slate-500 dark:text-slate-400 block">Güç</span><b class="font-mono text-sky-600 dark:text-sky-400">' + p.power + ' kW</b></div>' +
          '</div></div>').join('') + '</div></div>';
  }

  function sensorsTab(cab) {
    const c = cab.ref, lost = c.status === 'lost';
    const t = v => (lost ? '-' : v.toFixed(1) + ' °C');
    const fid = T.floorOf(state.floor).id;
    const box = (label, v, cls) => '<div class="p-2 rounded-[2px] bg-white dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800"><small class="text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-400 block">' + label + '</small><strong class="' + cls + ' block mt-0.5">' + v + '</strong></div>';
    const pod = c.pod.replace('-', '');
    const details = [
      ['DCA_' + c.code + '_TEMP_TOP', t(c.tempTop)], ['DCA_' + c.code + '_TEMP_MID', t(c.tempMid)], ['DCA_' + c.code + '_TEMP_LOW', t(c.tempLow)],
      ['DCA_' + c.code + '_HUM_MID', lost ? '-' : '%' + c.humidity], [pod + '_' + c.code + '_FDOOR', c.frontDoor === 'open' ? 'Açık' : 'Kapalı'],
      [pod + '_' + c.code + '_RDOOR', c.rearDoor === 'open' ? 'Açık' : 'Kapalı'], ['DCA_' + c.code + '_OCP_CURR', c.currentA.toFixed(1) + ' A']
    ];
    return '<div class="space-y-3">' +
      '<div class="p-3 rounded-[2px] bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">' +
        '<div class="flex items-start justify-between gap-2"><div><div class="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">ÇEVRESEL SENSÖRLER</div><h4 class="text-xs sm:text-sm font-bold text-slate-900 dark:text-white mt-0.5">' + esc(cab.name) + ' · Sıcaklık &amp; Nem</h4></div>' +
        '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/20"><i class="pi pi-chart-line mr-1 text-[9px]"></i> CMR/' + fid + '</span></div>' +
        '<div class="grid grid-cols-3 gap-1.5 mt-2.5 text-center text-xs">' +
          box('Üst Sıcaklık', t(c.tempTop), 'text-xs sm:text-sm font-mono text-slate-900 dark:text-white') + box('Orta Sıcaklık', t(c.tempMid), 'text-xs sm:text-sm font-mono text-slate-900 dark:text-white') + box('Alt Sıcaklık', t(c.tempLow), 'text-xs sm:text-sm font-mono text-slate-900 dark:text-white') +
        '</div>' +
        '<div class="grid grid-cols-3 gap-1.5 mt-1.5 text-center text-xs">' +
          box('Nem', lost ? '-' : '%' + c.humidity, 'text-xs sm:text-sm font-mono text-sky-600 dark:text-sky-400') +
          box('Ön Kapak', c.frontDoor === 'open' ? 'Açık' : 'Kapalı', 'text-xs font-bold ' + (c.frontDoor === 'open' ? 'text-rose-500' : 'text-emerald-500')) +
          box('Arka Kapak', c.rearDoor === 'open' ? 'Açık' : 'Kapalı', 'text-xs font-bold ' + (c.rearDoor === 'open' ? 'text-rose-500' : 'text-emerald-500')) +
        '</div></div>' +
      '<div class="p-3 rounded-[2px] bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">' +
        '<div class="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold mb-2">Detaylı Sensör Noktaları (' + details.length + ')</div>' +
        '<div class="max-h-56 overflow-y-auto pr-1 space-y-1">' + details.map(d => '<div class="flex justify-between items-center text-[10px] p-1.5 bg-white dark:bg-slate-950/70 rounded-[2px] border border-slate-200 dark:border-slate-800"><span class="text-slate-600 dark:text-slate-400 font-medium truncate max-w-[180px]">' + d[0] + '</span><span class="font-mono font-bold text-slate-900 dark:text-white shrink-0">' + d[1] + '</span></div>').join('') + '</div>' +
      '</div></div>';
  }

  function cablesTab(cab, a) {
    const ports = state.ports;
    const linked = ports.filter(p => p.connected).length;
    const vis = visiblePorts();
    const visKeys = new Set(vis.map(p => p.portKey));
    let html = '<div class="space-y-3">' +
      '<div class="p-3 rounded-[2px] bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2.5">' +
        '<div class="flex items-center justify-between gap-2"><div class="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Kablo izleme · seçim filtresi</div>' +
        (ports.length ? '<span class="text-[10px] font-mono text-slate-500 dark:text-slate-400"><b class="text-cyan-600 dark:text-cyan-400">' + linked + '</b> / ' + ports.length + ' bağlı</span>' : '') + '</div>' +
        '<div class="grid grid-cols-[3.25rem_1fr] items-center gap-x-2 gap-y-1.5 text-xs">' +
          '<span class="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Kabin</span><b class="font-mono text-slate-900 dark:text-white truncate">' + esc(cab.name) + '</b>' +
          '<label for="cableDeviceSelect" class="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Cihaz</label>' +
          '<select id="cableDeviceSelect" data-device class="h-8 w-full min-w-0 px-2 text-xs rounded-[2px] bg-white dark:bg-slate-950/70 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:border-sky-500 cursor-pointer">' +
            (a ? '' : '<option value="" selected>Cihaz seçin…</option>') +
            cab.assets.map(x => '<option value="' + esc(x.id) + '"' + (a && a.id === x.id ? ' selected' : '') + '>' + (x.zeroU ? '0U' : 'U' + x.uStart) + ' · ' + esc(x.name) + (x.devId && x.devId !== x.name ? ' · ' + esc(x.devId) : '') + '</option>').join('') +
          '</select>' +
        '</div>' +
        '<div class="flex flex-wrap items-center gap-1.5">' +
          '<div class="inline-flex p-0.5 rounded-[2px] bg-white dark:bg-slate-950/70 border border-slate-200 dark:border-slate-700" role="group" aria-label="Port yüzü">' +
            segBtn('data-pside', 'all', 'Tümü', state.portSide === 'all') + segBtn('data-pside', 'front', 'Ön', state.portSide === 'front') + segBtn('data-pside', 'back', 'Arka', state.portSide === 'back') + '</div>' +
          '<div class="inline-flex p-0.5 rounded-[2px] bg-white dark:bg-slate-950/70 border border-slate-200 dark:border-slate-700" role="group" aria-label="Bağlantı durumu">' +
            segBtn('data-pstat', 'all', 'Tümü', state.portStatus === 'all') + segBtn('data-pstat', 'connected', 'Bağlı', state.portStatus === 'connected') + segBtn('data-pstat', 'free', 'Boş', state.portStatus === 'free') + '</div>' +
        '</div>' +
        '<div class="relative"><i class="pi pi-search absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400"></i>' +
          '<input type="text" data-psearch value="' + esc(state.portSearch) + '" placeholder="Port, hedef kabin ya da cihaz ara…" aria-label="Port ara" class="h-8 w-full pl-6 pr-2 text-xs rounded-[2px] bg-white dark:bg-slate-950/70 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-sky-500" /></div>' +
      '</div>';
    if (!a) {
      return html + '<div class="p-4 rounded-[2px] bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center text-[11px] text-slate-500 dark:text-slate-400">Kabloyu izlemek için kabinden bir cihaz seçin.</div></div>';
    }
    const faces = ['front', 'back'].filter(s => state.portSide === 'all' || state.portSide === s).map(side => {
      const f = T.faceOf(a, side);
      return { side, label: side === 'front' ? 'Ön panel' : 'Arka panel', img: f ? f.img : '', ports: ports.filter(p => p.hasPosition && p.side === side) };
    }).filter(f => f.ports.length);
    html += '<div class="p-3 rounded-[2px] bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2.5">' +
      '<div class="flex items-start justify-between gap-2"><div class="min-w-0"><div class="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Port paneli</div>' +
        '<div class="text-xs font-bold text-slate-900 dark:text-white truncate">' + esc(a.name) + ' · ' + (a.zeroU ? '0U' : 'U' + a.uStart) + '</div></div>' +
        '<div class="flex items-center gap-2 text-[9px] text-slate-500 dark:text-slate-400 shrink-0 pt-0.5"><span class="flex items-center gap-1"><i class="w-2 h-2 rounded-[2px] bg-cyan-400 inline-block"></i>Bağlı</span><span class="flex items-center gap-1"><i class="w-2 h-2 rounded-[2px] bg-slate-500 inline-block"></i>Boş</span><span class="flex items-center gap-1"><i class="w-2 h-2 rounded-[2px] bg-amber-400 inline-block"></i>Seçili</span></div>' +
      '</div>' +
      faces.map(f => '<div><div class="text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">' + f.label + ' · ' + f.ports.length + ' port</div>' +
        '<div class="faceplate">' + (f.img ? '<img src="' + f.img + '" alt="" draggable="false" />' : '') +
        f.ports.map(p => '<button type="button" data-port="' + esc(p.portKey) + '" class="port-dot' + (p.connected ? ' linked' : '') + (p.portKey === state.selectedPortKey ? ' selected' : '') + (visKeys.has(p.portKey) ? '' : ' dimmed') + '" style="left:' + (p.x * 100) + '%;top:' + (p.y * 100) + '%" title="' + esc(portTitle(p)) + '" aria-label="' + esc(portTitle(p)) + '"></button>').join('') +
        '</div></div>').join('') +
      (ports.length ? '<div class="rounded-[2px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/60 max-h-72 overflow-y-auto custom-scrollbar">' +
        vis.map(p => '<button type="button" data-port="' + esc(p.portKey) + '" class="w-full grid grid-cols-[auto_1fr_auto] items-center gap-2 px-2 py-1.5 text-left border-b border-l-2 border-b-slate-100 dark:border-b-slate-800/70 last:border-b-0 transition-colors cursor-pointer ' + (p.portKey === state.selectedPortKey ? 'bg-amber-500/10 border-l-amber-400' : 'border-l-transparent hover:bg-slate-100 dark:hover:bg-slate-800/60') + '">' +
          '<span class="w-2 h-2 rounded-[2px] ' + (p.connected ? 'bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]' : 'bg-slate-400 dark:bg-slate-600') + '"></span>' +
          '<span class="min-w-0"><span class="text-[11px] font-semibold text-slate-900 dark:text-white">' + esc(p.name) + '</span><span class="ml-1 text-[9px] uppercase text-slate-500 dark:text-slate-400">' + sideLabel(p.side) + (p.media ? ' · ' + esc(p.media) : '') + '</span>' +
          (p.remote ? '<span class="block truncate text-[10px] font-mono text-slate-500 dark:text-slate-400">→ ' + esc(p.remote.cabinet) + ' · U' + esc(p.remote.uplace) + ' · ' + esc(p.remote.portLabel) + (p.remote.floor !== state.floor ? ' · ' + esc(T.floorOf(p.remote.floor).label) : '') + '</span>' : '') + '</span>' +
          '<i class="pi text-[10px] ' + (p.connected ? 'pi-share-alt text-cyan-500' : 'pi-minus text-slate-400') + '"></i></button>').join('') +
        (vis.length ? '' : '<div class="p-3 text-center text-[11px] text-slate-500 dark:text-slate-400">Filtreye uyan port yok.</div>') + '</div>'
        : '<div class="p-3 text-center text-[11px] text-slate-500 dark:text-slate-400"><i class="pi pi-inbox text-lg block mb-1 text-slate-400 dark:text-slate-500"></i>Bu cihaz için CAT port şablonu ya da LNK bağlantı kaydı bulunamadı.</div>') +
      '</div>';
    return html + '</div>';
  }

  function traceSection() {
    const tr = state.trace;
    if (!tr && !state.traceMessage) return '';
    let html = '<section class="sticky bottom-0 z-20 -mx-3 -mb-3 mt-3 px-3 pt-2.5 pb-3 border-t border-cyan-500/40 bg-white dark:bg-[#0b1320] shadow-[0_-8px_16px_-8px_rgba(0,0,0,0.35)]" role="status" aria-live="polite">';
    if (tr) {
      const end = (e, cls, lbl) => '<div class="p-1.5 rounded-[2px] border ' + cls + ' min-w-0">' +
        '<div class="text-[9px] font-extrabold uppercase tracking-wider ' + lbl + '">' + (cls.indexOf('emerald') >= 0 ? 'Kaynak' : 'Hedef') + '</div>' +
        '<div class="text-[11px] font-bold truncate">' + esc(e.cabinet) + ' · ' + esc(e.u) + '</div>' +
        '<div class="text-[10px] text-slate-500 dark:text-slate-400 truncate" title="' + esc(e.device) + '">' + esc(e.device) + '</div>' +
        '<div class="text-[11px] font-mono font-semibold truncate">' + esc(e.port) + ' <span class="text-[9px] uppercase text-slate-500 dark:text-slate-400">' + sideLabel(e.side) + '</span></div></div>';
      html += '<div class="flex items-center justify-between gap-2"><div class="min-w-0">' +
          '<div class="text-[10px] font-extrabold uppercase tracking-wider text-cyan-700 dark:text-cyan-400"><i class="pi pi-share-alt text-[9px]"></i> Kablo izi' + (tr.lnkId ? ' · LNK #' + esc(tr.lnkId) : '') + '</div>' +
          '<div class="text-[11px] text-slate-600 dark:text-slate-300 truncate">' + esc(routeLabel(tr)) + '</div></div>' +
          '<button type="button" data-trace-clear title="Kablo izini temizle" class="h-6 w-6 shrink-0 flex items-center justify-center rounded-[2px] text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-rose-500 transition-colors cursor-pointer"><i class="pi pi-times text-[10px]"></i></button></div>' +
        '<div class="grid grid-cols-[1fr_auto_1fr] items-stretch gap-1.5 mt-2">' +
          end(tr.source, 'border-emerald-500/30 bg-emerald-500/10', 'text-emerald-600 dark:text-emerald-400') +
          '<div class="flex flex-col items-center justify-center gap-1 w-[4.5rem]"><div class="trace-flow w-full" title="Kaynaktan giden akış"></div><div class="trace-flow trace-flow-in w-full" title="Hedeften gelen akış"></div>' +
            '<span class="font-mono font-bold text-xs text-cyan-600 dark:text-cyan-400 whitespace-nowrap">≈ ' + f1(tr.totalM) + ' m</span>' +
            '<span class="text-[9px] uppercase text-slate-500 dark:text-slate-400 text-center leading-tight">' + esc(tr.linkType || '-') + ' · ' + esc(tr.status || '-') + '</span></div>' +
          end(tr.target, 'border-pink-500/30 bg-pink-500/10', 'text-pink-600 dark:text-pink-400') +
        '</div>' +
        (tr.route !== 'same-cabinet' ? '<div class="grid grid-cols-3 gap-1.5 mt-1.5 text-center">' +
          '<div class="p-1 rounded-[2px] bg-white dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800"><small class="text-[9px] uppercase text-slate-500 dark:text-slate-400 block">Çıkış</small><b class="text-[11px] font-mono">' + f1(tr.riserM) + ' m</b></div>' +
          '<div class="p-1 rounded-[2px] bg-white dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800"><small class="text-[9px] uppercase text-slate-500 dark:text-slate-400 block">' + (tr.route === 'cable-tray' ? 'Tel tava' : tr.route === 'direct' ? 'Raf üstü' : 'Fiber runner') + '</small><b class="text-[11px] font-mono text-amber-600 dark:text-amber-400">' + f1(tr.networkM) + ' m</b></div>' +
          '<div class="p-1 rounded-[2px] bg-white dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800"><small class="text-[9px] uppercase text-slate-500 dark:text-slate-400 block">' + (tr.route === 'off-floor' ? 'Kat geçişi' : 'İniş') + '</small><b class="text-[11px] font-mono">' + (tr.route === 'off-floor' ? (tr.targetFloor ? (tr.targetFloor.dir === 'up' ? '↑ ' : '↓ ') + esc(tr.targetFloor.name) : '-') : f1(tr.dropM) + ' m') + '</b></div>' +
        '</div>' : '') +
        (tr.description ? '<p class="mt-1.5 text-[10px] text-slate-500 dark:text-slate-400 truncate" title="' + esc(tr.description) + '">' + esc(tr.description) + '</p>' : '') +
        '<div class="grid grid-cols-3 gap-1.5 mt-2">' +
          '<button type="button" data-trace-focus title="Kamerayı bütün güzergâha sığdır" class="h-7 px-1.5 text-[11px] rounded-[2px] bg-sky-600 hover:bg-sky-500 text-white font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1"><i class="pi pi-search-plus text-[10px]"></i>Güzergâh</button>' +
          '<button type="button" data-trace-follow title="Kamera kablonun üzerinden kaynaktan hedefe ilerler" class="h-7 px-1.5 text-[11px] rounded-[2px] bg-cyan-600 hover:bg-cyan-500 text-white font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1"><i class="pi text-[10px] ' + (state.following ? 'pi-stop' : 'pi-play') + '"></i>' + (state.following ? 'Durdur' : 'Takip et') + '</button>' +
          '<button type="button" data-trace-target title="' + (tr.route === 'off-floor' ? 'Hedef kata geç ve aynı kabloyu oradan izle' : 'Hedef cihazı seç ve aynı kabloyu oradan izle (patch panel zincirleri)') + '" class="h-7 px-1.5 text-[11px] rounded-[2px] bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1"><i class="pi pi-directions text-[10px]"></i>Karşı uç</button>' +
        '</div>';
    }
    if (state.traceMessage) {
      html += '<div class="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400' + (tr ? ' mt-2' : '') + '"><i class="pi pi-info-circle text-[11px] mt-px"></i><span class="flex-1">' + esc(state.traceMessage) + '</span>' +
        (!tr ? '<button type="button" data-trace-clear title="Kapat" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"><i class="pi pi-times text-[10px]"></i></button>' : '') + '</div>';
    }
    return html + '</section>';
  }

  function bindDetail(cab, eq) {
    const q = s => detailPanel.querySelector(s);
    q('[data-collapse-right]').addEventListener('click', () => { state.rightCollapsed = true; renderDrawers(); });
    if (eq) {
      q('[data-eq-2d]').addEventListener('click', () => navigateTo2D(eq.label));
      q('[data-clear]').addEventListener('click', clearSelection);
    }
    detailPanel.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { state.tab = b.getAttribute('data-tab'); syncPorts(); renderDetail(); }));
    const dev = q('[data-device]');
    if (dev) dev.addEventListener('change', () => { const a = cab.assets.find(x => x.id === dev.value); if (a) selectAsset(a); });
    detailPanel.querySelectorAll('[data-pside]').forEach(b => b.addEventListener('click', () => { state.portSide = b.getAttribute('data-pside'); renderDetail(); }));
    detailPanel.querySelectorAll('[data-pstat]').forEach(b => b.addEventListener('click', () => { state.portStatus = b.getAttribute('data-pstat'); renderDetail(); }));
    const ps = q('[data-psearch]');
    if (ps) ps.addEventListener('input', () => {
      state.portSearch = ps.value;
      const pos = ps.selectionStart;
      renderDetail();
      const n = detailPanel.querySelector('[data-psearch]');
      if (n) { n.focus(); n.setSelectionRange(pos, pos); }
    });
    detailPanel.querySelectorAll('[data-port]').forEach(b => b.addEventListener('click', () => {
      const p = state.ports.find(x => x.portKey === b.getAttribute('data-port'));
      if (p) selectPort(p);
    }));
    detailPanel.querySelectorAll('[data-trace-clear]').forEach(b => b.addEventListener('click', () => clearTrace()));
    if (q('[data-trace-focus]')) q('[data-trace-focus]').addEventListener('click', focusTrace);
    if (q('[data-trace-follow]')) q('[data-trace-follow]').addEventListener('click', () => { if (state.following) stopFollowTrace(); else { followTrace(); renderDetail(); } });
    if (q('[data-trace-target]')) q('[data-trace-target]').addEventListener('click', goToTraceTarget);
  }

  function renderDrawers() {
    rightDrawer.classList.toggle('collapsed', state.rightCollapsed);
    const extra = rightDrawer.querySelector('[data-right-handle-extra]');
    const selName = state.selectedCabinet ? state.selectedCabinet.name : state.selectedEquipment ? state.selectedEquipment.label : '';
    extra.innerHTML = (selName ? '<span class="max-w-[140px] truncate px-1.5 py-0.5 rounded-[2px] text-[10px] font-mono bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/20">' + esc(selName) + '</span>' : '') +
      (state.trace ? '<span class="px-1.5 py-0.5 rounded-[2px] text-[10px] font-bold bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 whitespace-nowrap"><i class="pi pi-share-alt text-[9px]"></i> Kablo izi</span>' : '');
    leftDrawer.classList.toggle('collapsed', !!state.selectedCabinet && state.leftCollapsed);
    if (state.selectedCabinet && !state.leftCollapsed && mini) setTimeout(() => mini && mini.resize(), 320);
  }

  let inspectorKey = '';
  function renderAll() {
    // Sol panel yalnız kabin/cihaz/görünüm değişince yeniden çizilir (3D raf görünümü korunur)
    const key = [state.selectedCabinet ? state.selectedCabinet.id : '', state.inspectorView === '2d' && state.selectedAsset ? state.selectedAsset.id : '', state.inspectorView, state.inspectorFace].join('|');
    if (key !== inspectorKey || !state.selectedCabinet) { inspectorKey = key; renderInspector(); }
    renderDetail();
    renderDrawers();
    renderLayersMenu();
  }

  leftDrawer.querySelector('[data-left-open]').addEventListener('click', () => { state.leftCollapsed = false; renderDrawers(); });
  rightDrawer.querySelector('[data-right-open]').addEventListener('click', () => { state.rightCollapsed = false; renderDrawers(); });

  // ---------------------------------------------------------------------------
  // Başlık aksiyonları
  // ---------------------------------------------------------------------------
  /** 2D'ye geçiş: seçili kabin/ekipman 2D krokide seçili gelsin (2D okuyup siler). */
  function navigateTo2D(code) {
    const target = code || (state.selectedCabinet ? state.selectedCabinet.name : state.selectedEquipment ? state.selectedEquipment.label : '');
    // 2D, ?cabinet= (kat koddan) ve ?focus= (tüm katlarda arar) ile aynı odaklı açılışı yapar
    const isCab = !!target && /^\d[A-Z]{2}\d{2}$/.test(target);
    window.location.href = '2d.html' + (target ? (isCab ? '?cabinet=' : '?focus=') + encodeURIComponent(target) : '');
  }
  const act = (name, fn) => { const el = document.querySelector('[data-act="' + name + '"]'); if (el) el.addEventListener('click', fn); };
  act('zoom-in', () => zoomBy(0.85));
  act('zoom-out', () => zoomBy(1.18));
  act('fit', () => fitAll());
  act('find', () => searchAndFocus(document.getElementById('search').value));
  act('to-2d', () => navigateTo2D());
  document.getElementById('search').addEventListener('keydown', e => { if (e.key === 'Enter') searchAndFocus(e.target.value); });
  function renderRotateBtn() {
    const b = document.getElementById('rotate-btn');
    b.className = 'h-8 min-w-8 px-2 text-xs rounded-[2px] font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer ' + (state.autoRotate ? 'bg-sky-600 text-white font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:text-sky-600');
    b.title = state.autoRotate ? 'Döndürmeyi durdur' : 'Otomatik döndür';
    b.innerHTML = '<i class="pi pi-sync text-xs' + (state.autoRotate ? ' animate-spin' : '') + '"></i><span class="dt3d-wide-inline">' + (state.autoRotate ? 'Döndürmeyi durdur' : 'Otomatik döndür') + '</span>';
  }
  act('rotate', () => { state.autoRotate = !state.autoRotate; renderRotateBtn(); });
  document.getElementById('quality').addEventListener('change', e => {
    state.quality = e.target.value;
    renderer.setPixelRatio(state.quality === 'performance' ? 1 : Math.min(window.devicePixelRatio || 1, state.quality === 'high' ? 2 : 1.25));
    buildOverhead();
    resize();
  });
  const statusToggle = document.getElementById('status-coloring');
  statusToggle.addEventListener('change', () => { state.statusColoring = statusToggle.checked; cabinets.concat(equipment).forEach(paintBody); });
  const heatToggle = document.getElementById('heatmap-toggle');
  heatToggle.addEventListener('change', () => { state.heatmap = heatToggle.checked; refreshHeatmap(); });
  document.addEventListener('dcim:theme', ev => {
    const dark = ev.detail === 'dark';
    scene.background = new THREE.Color(dark ? 0x070d18 : 0xf8fafc);
    drawFloorTexture(dark);
    if (cadLines) cadLines.material.color.setHex(dark ? 0x38bdf8 : 0x0284c7);
    applyWallStyle();
  });

  // ---------------------------------------------------------------------------
  // Başlıktaki "PDF Raporu" (page-report.service): KPI şeridi + ekrandaki kamera açısı
  // ---------------------------------------------------------------------------
  DCIM.shell.setPageReport({
    formats: ['pdf'],
    scopes: [{ id: 'page', label: 'Bu sayfa', hint: 'KPI şeridi ve 3D salon görünümü' }],
    export(req) {
      const f = T.floorOf(state.floor);
      const all = cabinets.concat(equipment);
      const count = s => all.filter(x => (Array.isArray(s) ? s.indexOf(x.status) >= 0 : x.status === s)).length;
      const crit = count(['critical', 'emergency']), warn = count('warning'), off = count('offline');
      // WebGL tamponu her karede silinir: görüntü render ile aynı anda alınır
      renderer.render(scene, camera);
      const img = DCIM.report.captureCanvas(canvas);
      DCIM.report.generate({
        title: '3D Dijital İkiz',
        subtitle: f.title,
        filename: '3D_Dijital_Ikiz_' + f.id,
        kpis: [
          { label: 'Kabin', value: cabinets.length, tone: 'info' },
          { label: 'Ekipman', value: equipment.length, hint: 'klima, klima panosu, UPS', tone: 'info' },
          { label: 'Kritik', value: crit, tone: crit ? 'alarm' : 'normal' },
          { label: 'Uyarı', value: warn, tone: warn ? 'warning' : 'normal' },
          { label: 'İletişim yok', value: off, tone: off ? 'lost' : 'normal' }
        ],
        images: img ? [{ src: img, caption: '3D Salon Görünümü · ' + f.title + ' — ekrandaki kamera açısı; renkler canlı durumdur.' }] : [],
        sections: [],
        notes: img ? [] : ['3D görünüm görüntüsü alınamadı.']
      }, req && req.format ? req.format : 'pdf');
    }
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
  // Otomasyon (headless doğrulama, navigator.webdriver) altında yazılım WebGL'i boğulmasın: ~5 kare/sn
  const throttled = !!navigator.webdriver;
  let lastFrame = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    if (throttled && ts - lastFrame < 200) return;
    lastFrame = ts || 0;
    const t = clock.getElapsedTime();
    controls.autoRotate = state.autoRotate;
    controls.autoRotateSpeed = 1.2;
    updateTraceAnimation(t);
    controls.update();
    clampCameraAboveFloor();
    // Üzerine gelinen etiket yumuşakça büyür
    labelsGroup.children.forEach(s => {
      const base = s.userData.baseW;
      if (!base) return;
      const target = s === hoveredLabel ? base * LABEL_HOVER_SCALE : base;
      if (Math.abs(s.scale.x - target) < 1e-3) return;
      const w = s.scale.x + (target - s.scale.x) * 0.25;
      s.scale.set(w, (w * 160) / 512, 1);
      s.renderOrder = s === hoveredLabel ? 1 : 0;
    });
    cabinets.forEach(c => { if ((c.status === 'critical' || c.status === 'emergency') && c.statusMesh) c.statusMesh.material.emissiveIntensity = 0.5 + Math.abs(Math.sin(t * 3)) * 0.9; });
    if (highlightMesh) { highlightMesh.update(); const s = 1.025 + Math.sin(t * 4) * 0.008; highlightMesh.scale.set(s, s, s); }
    renderer.render(scene, camera);
    frames++;
    const now = performance.now();
    if (now - lastFps >= 1000) {
      fpsEl.textContent = String(Math.round((frames * 1000) / (now - lastFps)));
      drawEl.textContent = String(renderer.info.render.calls);
      frames = 0;
      lastFps = now;
    }
  }

  // ---------------------------------------------------------------------------
  // Başlat + derin bağlantılar
  // ---------------------------------------------------------------------------
  try {
    if (params.get('status') === '1') { state.statusColoring = true; statusToggle.checked = true; }
    if (params.get('heatmap') === '1') { state.heatmap = true; heatToggle.checked = true; }
    if (params.has('walls')) state.wallOpacity = Math.max(0, Math.min(100, +params.get('walls') || 0));
    if (params.has('neighbors')) state.focusNeighborCount = Math.max(0, Math.min(FOCUS_NEIGHBOR_MAX, +params.get('neighbors') || 0));
    if (params.get('inspector') === '3d') state.inspectorView = '3d';
    if (['cables', 'sensors', 'power'].indexOf(params.get('tab')) >= 0) state.tab = params.get('tab');
    if (params.get('layers') === '1') state.layersOpen = true;

    const cabParam = params.get('cabinet') || params.get('trace');
    const focusParam = params.get('focus');
    let startFloor = +params.get('floor') || 1;
    if (cabParam && /^\d/.test(cabParam)) startFloor = +cabParam[0];
    if (!T.floors().some(f => f.digit === startFloor)) startFloor = 1;

    buildFloorScene(startFloor);
    resize();
    fitAll(true);
    renderAll();
    renderRotateBtn();
    loop();
    document.getElementById('loading').remove();

    const tabParam = state.tab;
    if (params.get('trace')) {
      const code = params.get('trace').toUpperCase();
      setTimeout(() => goTo({ floor: startFloor, kind: 'cabinet', key: code }, cab => {
        state.tab = 'cables';
        // Cihaz: ?asset= ya da başka kabine giden bağlı portu olan ilk cihaz
        const wantAsset = params.get('asset'), wantPort = params.get('port');
        let asset = wantAsset ? cab.assets.find(a => a.id === wantAsset || a.devId === wantAsset) : null;
        let port = null;
        // Varsayılan: aynı kattaki en uzak kabine giden bağlı port (salonu boydan geçen güzergâh)
        const farness = p => {
          if (p.remote.cabinet === cab.name) return -1;
          if (p.remote.floor !== state.floor) return 0;
          const o = cabinets.find(c => c.name === p.remote.cabinet);
          return o ? 1 + Math.hypot(o.x - cab.x, o.z - cab.z) : 0;
        };
        const pickPort = a => {
          const ps = T.portsOf(a).filter(p => p.connected && p.remote);
          if (wantPort) return ps.find(p => p.name === wantPort) || null;
          return ps.filter(p => farness(p) >= 0).sort((x, y) => farness(y) - farness(x))[0] || null;
        };
        if (asset) port = pickPort(asset);
        else {
          let best = -1;
          cab.assets.forEach(a => { const p = pickPort(a); if (p && farness(p) > best) { best = farness(p); asset = a; port = p; } });
        }
        if (!asset) return;
        selectAsset(asset);
        const live = port ? state.ports.find(p => p.portKey === port.portKey) : null;
        if (live) selectPort(live);
      }), 400);
    } else if (cabParam) {
      setTimeout(() => goTo({ floor: startFloor, kind: 'cabinet', key: cabParam.toUpperCase() }, cab => {
        if (params.get('tab')) { state.tab = tabParam; syncPorts(); renderDetail(); }
        if (params.get('asset')) { const a = cab.assets.find(x => x.id === params.get('asset')); if (a) selectAsset(a); }
        if (params.get('view') === 'focus') setTimeout(() => focusOnCabinet(cab), 450);
      }), 400);
    } else if (focusParam) {
      const hit = findOnFloors(focusParam);
      if (hit) setTimeout(() => goTo(hit), 400);
    }
  } catch (err) {
    const box = document.createElement('div');
    box.className = 'fixed inset-4 z-50 p-6 rounded-[4px] bg-rose-950/95 border border-rose-500 text-rose-100 overflow-auto whitespace-pre-wrap font-mono text-xs';
    box.innerHTML = '<div class="font-bold text-sm text-rose-300 mb-2">3D Digital Twin Error</div><div>' + esc(err && err.stack ? err.stack : err) + '</div>';
    document.body.appendChild(box);
  }
})();
