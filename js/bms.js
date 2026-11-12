/* ==========================================================================
   DCIM Sunum — BMS · Bina Yönetimi (BmsShowcaseComponent, route /dcim/showcase/bms)
   Kompozisyon (bms-showcase.component.html ile aynı):
     app-page-header : başlık + breadcrumb "Tesis › BMS" · sağda PMS'e geç · Veri kaynakları · Görünüm ayarları (dişli)
                       (Başlıktaki "PDF Raporu" = DCIM.shell.setPageReport: KPI + 3D bina görüntüsü + katlar + aktif alarmlar)
     .stage      : Babylon.js 3D bina ikizi (DCA Ana Bina: KAT-1/KAT-2/KAT-3 + DCB Ek Bina) · bina etiketleri · kat rozetleri ·
                   alarm etiketleri (tag3d) · kat seçici (KAT-1…DCB, Bina) · rüzgâr çipi (çatı meteoroloji istasyonu; pusula
                   kamerayla döner) · lejant · kat görünümü çipi · seçili ekipman kartı (Tek hatta göster (PMS)) ·
                   PMS'ten geliş bandı · ayarlar / veri kaynakları pencereleri
     .alarms     : Aktif alarmlar (Tümü / kat süzgeci, kategori çipleri, Gördüm, Tek hatta göster (PMS))
     .bottom     : Standart uyumu (5 kart) / Katlar sekmeleri + sağda canlı özet çipleri (Acil/Alarm/Uyarı/Veri yok,
                   Görülmemiş, PUE, BT / Soğ., KAT-1 ekipman)
   Veri (js/mock/bms.data.js, kurgusal tesis — tüm katlar canlı): her katın yerleşimi, iç duvarları ve kapıları
   js/layout-data.js'ten (DCB kendi yerleşimi); KAT-1 alarmları DCIM.data.activeAlarms (sunumun diğer sayfalarıyla
   aynı senaryo), KAT-2/KAT-3/DCB alarmları tohumlu üretilir (dakikada bir hafif değişir). Kabin sıcaklık/nem noktaları
   kat kat (5 sn), PUE/BT/soğutma 3 sn, rüzgâr 30 sn'de bir güncellenir. "Gördüm" yalnız bellekte işaretler.
   Çatıda meteoroloji istasyonu (direk, anemometre canlı hızla döner; alarmında gövde önem renginde yanıp söner),
   çatı üstünde rüzgâr izleri (estiği yöne akar; kat görünümünde ve < 0,3 m/s'de gizli).
   WebGL yoksa sahne yerine bilgi mesajı gösterilir; panel ve kartlar çalışır.
   Etkileşim: kat rozeti/seçici → kat görünümü (üst katlar gizlenir), alarm → ekipmana uçuş + odak halkası,
   ekipmana / istasyona çift tık → uçuş + seçim kartı, Esc → binaya dön.
   Giden bağlantılar:
     PMS'e geç                    → pms.html?from=bms
     Tek hatta göster (PMS)       → pms.html?view=single-line&alarm=<rid>&dev=<devId>&from=bms
     Seçim kartı (DCA katları)    → 2d.html?cabinet=X | 3d.html?cabinet=X | cabinet-detail.html?cabinet=X
                                    (klima/UPS/pano: 2d.html?focus=<etiket>, 3d.html?focus=<etiket>)
     Alarm paneli başlığı         → alarms.html
   Derin bağlantılar (orijinal URL sözleşmesi: BMS ?floor&dev&cab&alarm&from):
     ?floor=KAT-1|KAT-2|KAT-3|DCB            (kat görünümü)
     ?cab=1DU06 | ?cab=2EA05 | ?cab=4GB03    (kabine uçuş; floor ile birlikte de verilebilir)
     ?alarm=<rid|AA-xxxx>                    (ör. alarm=KAT1_SAL1_A5_UPS_MODE → UPS A5'e uçuş)
     ?dev=<devId|etiket>                     (ör. dev=KAT1_SAL1_A5_UPS, dev=KAT1_SAL1_KLM109_DV, dev=UPS%20B7,
                                              dev=DCA_CATI_METEO_DV → çatıdaki meteoroloji istasyonu)
     ?from=pms                               ("PMS'ten geldiniz" bandı)
     ?theme=light|dark                       (sunum yardımcısı: temayı kaydetmeden uygular)
   Öncelik (orijinal tryNav): alarm → meteoroloji → cab → dev → floor; bulunamazsa "fiziksel konumu tanımlı değil" bandı.
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, storage } = DCIM.ui;
  const D = DCIM.data;
  const B = D.bms;
  DCIM.shell.init({ active: 'bms' });

  const params = new URLSearchParams(window.location.search);
  const themeParam = params.get('theme');
  if (themeParam === 'light' || themeParam === 'dark') DCIM.theme.apply(themeParam);

  const BJ = window.BABYLON || {};
  const {
    Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight, Vector3, Matrix, Quaternion, Color3, Color4,
    CreateBox, CreateCylinder, CreateTorus, CreateGround, CreateLineSystem, Mesh, TransformNode, StandardMaterial, GlowLayer
  } = BJ;

  // ---------------------------------------------------------------------------
  // Önem (alarm-severity.util.ts) ve görünüm sabitleri
  // ---------------------------------------------------------------------------
  const SEVERITY_COLOR = { acil: '#7E22CE', alarm: '#DC2626', uyari: '#D97706', kayip: '#EA580C', normal: '#16A34A' };
  const SEV_LABEL = { acil: 'Acil', alarm: 'Alarm', uyari: 'Uyarı', kayip: 'Veri yok', normal: 'Normal' };
  /** Şekil kodlaması: Acil sekizgen, Alarm üçgen, Uyarı eşkenar dörtgen. */
  const SEV_SHAPE = { acil: 'oct', alarm: 'tri', uyari: 'dia', kayip: 'dot', normal: 'dot' };
  const LEGEND_SEVS = ['acil', 'alarm', 'uyari', 'kayip', 'normal'];
  const severityRank = s => (s === 'acil' ? 4 : s === 'alarm' ? 3 : s === 'kayip' ? 2 : s === 'uyari' ? 1 : 0);

  const SITE = B.SITE;
  const ALARM_CATS = B.ALARM_CATS;
  const METEO = B.METEO;
  const KIND_LABEL = { cabinet: 'Kabin', climate: 'Klima', ups: 'UPS', panel: 'Pano' };
  /** SCH ekipman durumu (alarm değil) hangi çipte görünür: klima panosu soğutmadır. */
  const KIND_CAT = { cabinet: 'it', climate: 'hvac', ups: 'power', panel: 'hvac' };
  const CAT_STORE_KEY = 'bms_showcase_alarm_cats';
  const BAND_MS = 6000;

  // Sahne sabitleri (1 birim = 1 SCH grid hücresi)
  const FH = 6;            // kat yüksekliği
  const SLAB = 0.5;        // döşeme kalınlığı
  const WALL_T = 0.7;      // dış duvar kalınlığı
  const PARAPET = 1.3;     // pencere altı
  const GLASS_H = 2.6;     // pencere bandı
  const EXPLODE = 9;       // katları ayır: kat başına ek yükseklik
  const MARGIN = 3;        // kat salonu ile dış duvar arası
  const BLDG_GAP = 10;     // ana bina ile DCB arası
  const BLDG_LIFT = 0.8;   // bina kaide üstünde başlar: zemin katın içi dış zeminle karışmasın
  const PAVE_TOP = 0.06;   // kaldırım üst kotu: kaide ve bina bunun üstünden başlar
  const WIND_VIS = 4;      // rüzgâr çizgisi hızı: m/s başına birim/sn (görünsün diye abartılı)
  const WIND_N = 110;      // rüzgâr izi sayısı
  const WIND_PTS = 18;     // iz başına nokta: kameraya dönük, kuyruğa doğru incelip solan şerit
  const WIND_FADE_OUT = 140;   // ms: katlar ayrılırken/birleşirken izler söner…
  const WIND_HOLD = 520;       // ms: …katlar yerine oturana kadar gizli kalır…
  const WIND_FADE_IN = 380;    // ms: …ve yeni çatı yüksekliğinde yeniden belirir
  const ITEM_H = { cabinet: 3.3, climate: 3.1, ups: 2.6, panel: 3 };
  const DOOR_H = 3.4;      // kapı kanadı yüksekliği (~2 m)
  const DOOR_LINE = 0.09;  // zemindeki kapı sembolü çizgi kalınlığı
  const KINDS = ['cabinet', 'climate', 'ups', 'panel'];
  /** Normal durumda nötr tonlar (ISA-101: yalnız anormal durum renklidir). */
  const NEUTRAL = { cabinet: [0.30, 0.34, 0.42], climate: [0.42, 0.50, 0.58], ups: [0.44, 0.44, 0.52], panel: [0.50, 0.52, 0.58] };

  // ---------------------------------------------------------------------------
  // Alarm kategorisi (showAlarmCategory: grup kodu → çip; eşleşmeyen yalnız "Tümü"de)
  // ---------------------------------------------------------------------------
  function foldTr(s) {
    return String(s == null ? '' : s).toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
  }
  const showAlarmCategory = grp => B.ALARM_CAT_GROUPS[foldTr(grp).trim()] || null;

  const pad = n => String(n).padStart(2, '0');
  const hhmm = ts => { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const hhmmss = ts => { const d = new Date(ts); return hhmm(ts) + ':' + pad(d.getSeconds()); };
  const fmt = (v, digits) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(digits == null ? 1 : digits));

  // ---------------------------------------------------------------------------
  // Durum
  // ---------------------------------------------------------------------------
  function loadCats() {
    try {
      const v = JSON.parse(storage.get(CAT_STORE_KEY) || '[]');
      const ids = ALARM_CATS.map(c => c.id);
      return Array.isArray(v) ? v.filter(x => ids.indexOf(x) >= 0) : [];
    } catch (e) {
      return [];
    }
  }

  const S = {
    isLight: !document.documentElement.classList.contains('dark'),
    webglError: '',
    connected: true,
    showSettings: false,
    showSources: false,
    facadeOpacity: 45,
    exploded: false,
    autoRotate: true,
    showLabels: true,
    isolatedFloorId: null,
    focusedAlarmId: null,
    alarmFilter: 'all',
    catSel: new Set(loadCats()),
    catChips: ALARM_CATS.map(c => Object.assign({}, c, { n: 0 })),
    catAllCount: 0,
    selItem: null,
    navBand: null,
    stdTab: 'std',
    floorsView: [],
    alarmsView: [],
    kpi: { live: zeroKpi() },
    pue: null, itKw: null, coolKw: null,
    kat1Counts: { cabinet: 0, climate: 0, ups: 0, panel: 0 },
    kat1State: 'Canlı',
    lastUpdate: '',
    stdCards: [],
    /** Çatı meteoroloji rüzgârı (canlı): on = şerit açık; to = estiği yön (derece, kuzeyden saat yönü). */
    wind: { on: false, speed: null, dir: '', to: null }
  };
  function zeroKpi() { return { acil: 0, alarm: 0, uyari: 0, kayip: 0, total: 0, unack: 0 }; }

  // Sahne
  let engine = null, scene = null, camera = null, glow = null, hemi = null, sun = null, groundMat = null, gridLines = null;
  const sunDarkIntensity = 0.6;
  const mats = {};
  const sevMats = new Map();
  let ring = null, beam = null, focusTarget = null, camTween = null, homePose = null, lastInteract = 0;
  let cssW = 1, cssH = 1;
  const badgeEls = new Map(), labelEls = new Map(), tagEls = new Map();
  let tagList = [];
  let bandTimer = null;
  /** Çatı meteoroloji istasyonu: gövde malzemesi, parçalar, en yüksek aktif alarm önemi, yanıp sönme. */
  const meteo = { mat: null, meshes: [], ids: new Set([METEO.devId].concat(METEO.ioIds || [])), sev: 'normal', lit: false };
  /** Rüzgâr animasyonu: izler (tek şerit mesh), anemometre rotoru, pusula açısı, görünürlük, kat geçişi beklemesi. */
  const windFx = { mesh: null, pos: null, col: null, rotor: null, pts: [], R: 100, cx: 0, cz: 0, ang: null, roseDeg: 999, vis: 0, holdUntil: 0, tops: null };
  const windPath = new Float32Array(WIND_PTS * 3);
  const windAlpha = new Float32Array(WIND_PTS);

  // Veri
  let realAlarms = [];
  const floorAlarms = new Map();
  const ackedIds = new Set();
  let envByFloor = [];
  let envTemps = [], envHums = [];
  let energyTick = 0;
  const KAT1_SRC = B.kat1Alarms();

  // ---------------------------------------------------------------------------
  // Bina / kat modeli (sahneden bağımsız: WebGL yoksa da alarm eşleşmesi ve gezinme çalışır)
  // ---------------------------------------------------------------------------
  const buildings = [];
  const floors = [];
  (function buildModel() {
    let cursorX = 0;
    SITE.buildings.forEach((bc, bi) => {
      const layouts = bc.floors.map(fc => B.layoutFor(fc));
      let W = 0, Dp = 0;
      layouts.forEach(l => { W = Math.max(W, l.bounds.x1 - l.bounds.x0); Dp = Math.max(Dp, l.bounds.y1 - l.bounds.y0); });
      W += MARGIN * 2; Dp += MARGIN * 2;
      const ox = bi === 0 ? 0 : cursorX + BLDG_GAP + W / 2;
      if (bi === 0) cursorX = W / 2;
      const oz = bi === 0 ? 0 : -(buildings[0].D - Dp) / 2; // ön cepheler hizalı
      const b = { cfg: bc, W, D: Dp, ox, oz, node: null, roof: null, roofY: (Math.max.apply(null, bc.floors.map(f => f.level)) + 1) * FH };
      buildings.push(b);
      bc.floors.forEach((fc, i) => {
        const f = {
          cfg: fc, b, layout: layouts[i], node: null, content: null, hidden: false,
          curY: fc.level * FH, targetY: fc.level * FH,
          kinds: {}, kindItems: {}, itemIndex: new Map(), cabIndex: new Map(), labelIndex: new Map(), devStems: [],
          statusSev: new Map(), overlay: null, shellMeshes: []
        };
        f.statusSev = B.floorStatus(fc, f.layout);
        indexFloor(f);
        floors.push(f);
      });
      cursorX = Math.max(cursorX, ox + W / 2);
    });
  })();

  function indexFloor(f) {
    f.itemIndex.clear(); f.cabIndex.clear(); f.labelIndex.clear(); f.devStems = []; f.kindItems = {};
    KINDS.forEach(kind => {
      const items = f.layout.items.filter(i => i.kind === kind);
      f.kindItems[kind] = items;
      items.forEach((it, idx) => {
        f.itemIndex.set(it.key, { kind, idx, item: it });
        if (it.label) f.labelIndex.set(it.label.toUpperCase(), it.key);
        if (kind === 'cabinet') {
          [it.label, it.devId].forEach(v => { const n = B.normCab(v); if (n && !f.cabIndex.has(n)) f.cabIndex.set(n, it.key); });
        } else {
          const stem = String(it.devId || '').toUpperCase().replace(/_DV$/, '');
          if (stem.length >= 3) f.devStems.push({ stem, key: it.key });
        }
      });
    });
    f.devStems.sort((a, b) => b.stem.length - a.stem.length);
  }

  const floorById = id => floors.find(f => f.cfg.id === id) || null;
  const floorName = id => { const f = floorById(id); return f ? f.cfg.name : ''; };
  const kat1 = floors[0];
  S.kat1Counts = {
    cabinet: kat1.kindItems.cabinet.length, climate: kat1.kindItems.climate.length,
    ups: kat1.kindItems.ups.length, panel: kat1.kindItems.panel.length
  };
  S.floorsView = floors.map(f => ({ id: f.cfg.id, name: f.cfg.name, building: f.b.cfg.name, sev: 'normal', live: 0, source: 'SCH yerleşimi' }));

  // ---------------------------------------------------------------------------
  // DOM iskeleti (app-page-header + .bms)
  // ---------------------------------------------------------------------------
  const root = document.getElementById('bms-root');
  const host = root.parentElement;
  const GEAR = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.9a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5A3.5 3.5 0 1 1 13 8.5a3.5 3.5 0 0 1 0 7z"/></svg>';
  // Sayfa başlığı: 2D/3D ikizle aynı bileşen (breadcrumb Tesis › BMS); sağda sayfa düğmeleri
  root.insertAdjacentHTML('beforebegin', '<div class="bms-page-header shrink-0">' + DCIM.kit.pageHeader({
    title: SITE.title, compact: true, breadcrumbs: [{ label: 'Tesis' }, { label: 'BMS' }],
    actions: '<div class="head-actions">' +
      '<button type="button" class="btn" data-act="pms" title="Güç yönetimi (PMS) tek hat görünümü"><i class="pi pi-bolt" aria-hidden="true"></i>PMS\'e geç</button>' +
      '<button type="button" class="btn" data-act="sources">Veri kaynakları</button>' +
      '<button type="button" class="btn icon" data-act="settings" title="Görünüm ayarları">' + GEAR + '</button>' +
    '</div>'
  }) + '</div>');
  root.innerHTML =
    '<div class="bms-body">' +
      '<div class="stage" data-r="stage">' +
        '<canvas class="scene-canvas" data-r="canvas" aria-label="Bina 3D görünümü"></canvas>' +
        '<div data-r="webgl"></div>' +
        '<div class="overlay" data-r="overlay">' +
          SITE.buildings.map(b => '<div class="b-label" data-blabel="' + esc(b.id) + '"><span>' + esc(b.name) + '</span></div>').join('') +
          S.floorsView.map(f => '<button type="button" class="f-badge" data-badge="' + esc(f.id) + '" data-act="floor" data-id="' + esc(f.id) + '"></button>').join('') +
          '<div class="tag-layer" data-r="tags"></div>' +
        '</div>' +
        '<div data-r="band"></div>' +
        '<div data-r="sel"></div>' +
        '<div data-r="iso"></div>' +
        '<div class="floor-nav" data-r="fnav"></div>' +
        '<div data-r="wind"></div>' +
        '<div class="legend">' +
          LEGEND_SEVS.map(s => '<span class="lg" style="--c:' + SEVERITY_COLOR[s] + '"><i class="shape ' + SEV_SHAPE[s] + '"></i>' + esc(SEV_LABEL[s]) + '</span>').join('') +
          '<span class="lg-note">Normal ekipman nötr gri (ISA-101); parlama yalnız Acil/Alarm</span>' +
        '</div>' +
        '<div data-r="pop"></div>' +
      '</div>' +
      '<aside class="alarms">' +
        '<div class="al-head" data-r="alhead"></div>' +
        '<div class="al-filter" data-r="alfilter"></div>' +
        '<div class="al-cats" data-r="alcats" role="group" aria-label="Alarm kategorileri"></div>' +
        '<div class="al-list" data-r="allist"></div>' +
      '</aside>' +
    '</div>' +
    '<section class="bottom" data-r="bottom"></section>';

  const R = {};
  root.querySelectorAll('[data-r]').forEach(el => { R[el.getAttribute('data-r')] = el; });
  root.querySelectorAll('[data-badge]').forEach(el => badgeEls.set(el.getAttribute('data-badge'), el));
  root.querySelectorAll('[data-blabel]').forEach(el => labelEls.set(el.getAttribute('data-blabel'), el));

  // ---------------------------------------------------------------------------
  // Sahne kurulumu
  // ---------------------------------------------------------------------------
  function initScene() {
    if (!Engine) throw new Error('Babylon.js paketi yüklenemedi');
    const canvas = R.canvas;
    const eng = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false, antialias: true, powerPreference: 'high-performance' }, false);
    eng.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.5));
    engine = eng;

    const sc = new Scene(eng);
    scene = sc;
    sc.clearColor = new Color4(0, 0, 0, 0);
    sc.skipPointerMovePicking = true;
    // Ekipman seçimi yalnız çift tıkta elle yapılır (scene.pick); sahnenin otomatik pick'i kapalı
    sc.skipPointerDownPicking = true;
    sc.skipPointerUpPicking = true;
    sc.fogMode = Scene.FOGMODE_EXP2;
    sc.fogDensity = 0.0028;

    buildBuildings();

    const ext = siteExtent();
    buildWind(ext);
    homePose = {
      alpha: -Math.PI / 2 - 0.62, beta: 1.05, radius: Math.max(100, ext.span * 1.05),
      target: new Vector3(ext.cx, FH * 1.1, ext.cz)
    };
    const cam = new ArcRotateCamera('cam', homePose.alpha, homePose.beta, homePose.radius, homePose.target.clone(), sc);
    // 3D ikizle aynı zoom aralığı: en yakın 12 m, en uzak açılış (bütün site) görünümü
    cam.lowerRadiusLimit = 12;
    cam.upperRadiusLimit = homePose.radius;
    cam.lowerBetaLimit = 0.12;
    cam.upperBetaLimit = Math.PI / 2 - 0.05;
    cam.wheelDeltaPercentage = 0.01;
    cam.panningSensibility = 60;
    cam.inertia = 0.88;
    cam.minZ = 0.5;
    cam.maxZ = 2000;
    cam.useInputToRestoreState = false; // çift tık ekipmana uçuş içindir, kamerayı sıfırlamaz
    cam.attachControl(canvas, true);
    camera = cam;

    hemi = new HemisphericLight('hemi', new Vector3(0.2, 1, -0.3), sc);
    hemi.intensity = 0.85;
    sun = new DirectionalLight('sun', new Vector3(-0.45, -1, 0.4), sc);
    sun.intensity = sunDarkIntensity;

    // Zemin, ince ızgara
    const ground = CreateGround('ground', { width: 1200, height: 1200 }, sc);
    ground.position.y = -0.05;
    const gm = new StandardMaterial('groundMat', sc);
    gm.specularColor = Color3.Black();
    ground.material = gm;
    ground.isPickable = false;
    ground.freezeWorldMatrix();
    groundMat = gm;

    const lines = [];
    const Rg = 160, step = 4;
    for (let v = -Rg; v <= Rg; v += step) {
      lines.push([new Vector3(ext.cx - Rg, 0.01, ext.cz + v), new Vector3(ext.cx + Rg, 0.01, ext.cz + v)]);
      lines.push([new Vector3(ext.cx + v, 0.01, ext.cz - Rg), new Vector3(ext.cx + v, 0.01, ext.cz + Rg)]);
    }
    const grid = CreateLineSystem('grid', { lines }, sc);
    grid.isPickable = false;
    grid.alpha = 0.18;
    grid.freezeWorldMatrix();
    gridLines = grid;

    // Odak halkası ve ışık sütunu (yalnız seçili öğede)
    ring = CreateTorus('focusRing', { diameter: 1, thickness: 0.08, tessellation: 48 }, sc);
    const rm = new StandardMaterial('ringMat', sc);
    rm.disableLighting = true;
    rm.emissiveColor = Color3.FromHexString('#38bdf8');
    ring.material = rm;
    ring.isPickable = false;
    ring.setEnabled(false);
    beam = CreateCylinder('beam', { height: 1, diameterTop: 0.5, diameterBottom: 1.4, tessellation: 24, cap: Mesh.NO_CAP }, sc);
    const bm = new StandardMaterial('beamMat', sc);
    bm.disableLighting = true;
    bm.emissiveColor = Color3.FromHexString('#38bdf8');
    bm.alpha = 0.22;
    bm.backFaceCulling = false;
    beam.material = bm;
    beam.isPickable = false;
    beam.setEnabled(false);

    glow = new GlowLayer('glow', sc, { mainTextureSamples: 2, blurKernelSize: 32 });
    glow.intensity = 0.85;
    glow.addIncludedOnlyMesh(ring);
    glow.addIncludedOnlyMesh(beam);

    floors.forEach(f => buildFloorContent(f));

    applyTheme();
    applyFacade();

    // Kullanıcı etkileşimi otomatik dönüşü ve uçuşu durdurur
    const onInteract = () => { lastInteract = performance.now(); camTween = null; };
    ['pointerdown', 'wheel'].forEach(n => canvas.addEventListener(n, onInteract, { passive: true }));
    canvas.addEventListener('dblclick', onCanvasDblClick);

    const ro = new ResizeObserver(() => {
      cssW = canvas.clientWidth || 1;
      cssH = canvas.clientHeight || 1;
      eng.resize();
    });
    ro.observe(R.stage);
    cssW = canvas.clientWidth || 1;
    cssH = canvas.clientHeight || 1;

    let last = performance.now();
    eng.runRenderLoop(() => {
      const now = performance.now();
      const dt = Math.min(64, now - last);
      last = now;
      tick(now, dt);
      sc.render();
      positionOverlays();
    });
  }

  function mat(name, hex, opts) {
    opts = opts || {};
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    const sp = opts.spec == null ? 0.05 : opts.spec;
    m.specularColor = new Color3(sp, sp, sp);
    if (opts.emissive) m.emissiveColor = Color3.FromHexString(opts.emissive);
    if (opts.alpha !== undefined) m.alpha = opts.alpha;
    mats[name] = m;
    return m;
  }

  /** Bina zarfları: kat boyutlarının en büyüğü + pay. Ana bina solda, DCB sağda (doğu). */
  function buildBuildings() {
    mat('slab', '#9aa3ad');
    mat('raised', '#2a3340');
    mat('facade', '#c9ced6', { alpha: 1 });
    mat('spandrel', '#8d96a3', { alpha: 1 });
    mat('glass', '#5aa9e6', { alpha: 0.4, spec: 0.6, emissive: '#0b2a44' });
    mat('mullion', '#4b5563', { alpha: 1 });
    mat('roof', '#6b7280', { alpha: 1 });
    mat('rooftop', '#9ca3af');
    mat('pave', '#3a4350');
    mat('shadow', '#000000', { alpha: 0.35 });
    mat('door', '#1f2937', { emissive: '#0ea5e9' });
    mat('canopy', '#e5e7eb');
    mat('iwall', '#64748b');
    mat('dleaf', '#94a3b8', { alpha: 0.9 });
    mat('dline', '#e2e8f0');
    mats.dline.disableLighting = true;
    mats.shadow.disableLighting = true;
    mats.door.emissiveColor = Color3.FromHexString('#0c4a6e');
    KINDS.forEach(k => {
      const m = mat('eq_' + k, '#ffffff', { spec: 0.12 });
      m.emissiveColor = new Color3(0.06, 0.07, 0.09);
    });
    ['acil', 'alarm', 'uyari', 'kayip'].forEach(s => {
      const m = new StandardMaterial('sev_' + s, scene);
      m.disableLighting = true;
      m.emissiveColor = Color3.FromHexString(SEVERITY_COLOR[s]);
      m.alpha = 0.55;
      sevMats.set(s, m);
    });

    buildings.forEach(b => {
      const node = new TransformNode('b_' + b.cfg.id, scene);
      node.position.set(b.ox, PAVE_TOP + BLDG_LIFT, b.oz);
      const roof = new TransformNode('roof_' + b.cfg.id, scene);
      roof.parent = node;
      b.node = node;
      b.roof = roof;
      buildSite(b);
      floors.filter(f => f.b === b).forEach(f => {
        const fnode = new TransformNode('f_' + f.cfg.id, scene);
        fnode.parent = node;
        fnode.position.y = f.cfg.level * FH;
        const content = new TransformNode('fc_' + f.cfg.id, scene);
        content.parent = fnode;
        f.node = fnode;
        f.content = content;
        buildShell(f);
      });
      buildRoof(b);
    });

    // Ana bina ile DCB arası kapalı bağlantı koridoru
    if (buildings.length > 1) {
      const a = buildings[0], c = buildings[1];
      const x0 = a.ox + a.W / 2, x1 = c.ox - c.W / 2;
      const link = CreateBox('link', { width: x1 - x0, height: 3.4, depth: 5 }, scene);
      link.position.set((x0 + x1) / 2, PAVE_TOP + BLDG_LIFT + SLAB + 1.7, c.oz + c.D / 2 - 8);
      link.material = mats.spandrel;
      link.isPickable = false;
      link.freezeWorldMatrix();
      const lg = CreateBox('linkGlass', { width: x1 - x0, height: 1.4, depth: 5.1 }, scene);
      lg.position.copyFrom(link.position);
      lg.position.y += 0.3;
      lg.material = mats.glass;
      lg.isPickable = false;
      lg.freezeWorldMatrix();
    }
  }

  /** Bina altı: kaldırım, temas gölgesi, giriş yolu, kaide. */
  function buildSite(b) {
    const sh = CreateBox('shadow_' + b.cfg.id, { width: b.W + 5, height: 0.02, depth: b.D + 5 }, scene);
    sh.position.set(b.ox + 1.2, 0.12, b.oz + 1.2);
    sh.material = mats.shadow;
    const pave = CreateBox('pave_' + b.cfg.id, { width: b.W + 10, height: 0.06, depth: b.D + 10 }, scene);
    pave.position.set(b.ox, PAVE_TOP / 2, b.oz);
    pave.material = mats.pave;
    const path = CreateBox('path_' + b.cfg.id, { width: 6, height: 0.08, depth: 26 }, scene);
    path.position.set(b.ox, 0.05, b.oz - b.D / 2 - 13);
    path.material = mats.pave;
    // Kaide: kaldırım üstüne oturur, bina PAVE_TOP + BLDG_LIFT kotundan başlar
    const plinth = CreateBox('plinth_' + b.cfg.id, { width: b.W + 0.8, height: BLDG_LIFT, depth: b.D + 0.8 }, scene);
    plinth.position.set(b.ox, PAVE_TOP + BLDG_LIFT / 2, b.oz);
    plinth.material = mats.slab;
    [sh, pave, path, plinth].forEach(m => { m.isPickable = false; m.freezeWorldMatrix(); });
  }

  /** Bir katın kabuğu: döşeme, yükseltilmiş taban, dış duvar (parapet + cam bandı + kuşak), dikmeler, giriş. */
  function buildShell(f) {
    const W = f.b.W, Dp = f.b.D;
    const unit = (name, matName, list) => {
      const m = CreateBox(name, { size: 1 }, scene);
      m.parent = f.node;
      m.material = mats[matName];
      m.isPickable = false;
      const buf = new Float32Array(list.length * 16);
      list.forEach((mx, i) => mx.copyToArray(buf, i * 16));
      m.thinInstanceSetBuffer('matrix', buf, 16, true);
      f.shellMeshes.push(m);
      return m;
    };
    const box = (w, h, d, x, y, z) => Matrix.Compose(new Vector3(w, h, d), Quaternion.Identity(), new Vector3(x, y, z));

    // Döşeme (katlar arası) ve yükseltilmiş taban
    unit('slab_' + f.cfg.id, 'slab', [box(W + 0.6, SLAB, Dp + 0.6, 0, SLAB / 2, 0)]);
    unit('raised_' + f.cfg.id, 'raised', [box(W - WALL_T * 2, 0.08, Dp - WALL_T * 2, 0, SLAB + 0.04, 0)]);

    const wallH = FH - SLAB;
    const spandH = wallH - PARAPET - GLASS_H;
    const y0 = SLAB;
    const sides = [
      { len: W, x: 0, z: -Dp / 2 + WALL_T / 2, alongX: true },
      { len: W, x: 0, z: Dp / 2 - WALL_T / 2, alongX: true },
      { len: Dp - WALL_T * 2, x: -W / 2 + WALL_T / 2, z: 0, alongX: false },
      { len: Dp - WALL_T * 2, x: W / 2 - WALL_T / 2, z: 0, alongX: false }
    ];
    const solid = [], span = [], glass = [], mull = [];
    sides.forEach((s, si) => {
      const sx = s.alongX ? s.len : WALL_T, sz = s.alongX ? WALL_T : s.len;
      solid.push(box(sx, PARAPET, sz, s.x, y0 + PARAPET / 2, s.z));
      span.push(box(s.alongX ? s.len : WALL_T * 1.05, spandH, s.alongX ? WALL_T * 1.05 : s.len, s.x, y0 + PARAPET + GLASS_H + spandH / 2, s.z));
      glass.push(box(s.alongX ? s.len : WALL_T * 0.4, GLASS_H, s.alongX ? WALL_T * 0.4 : s.len, s.x, y0 + PARAPET + GLASS_H / 2, s.z));
      const n = Math.floor(s.len / 3.2);
      for (let i = 1; i < n; i++) {
        const t = -s.len / 2 + (i * s.len) / n;
        mull.push(box(s.alongX ? 0.18 : WALL_T * 0.9, GLASS_H, s.alongX ? WALL_T * 0.9 : 0.18,
          s.alongX ? s.x + t : s.x, y0 + PARAPET + GLASS_H / 2, s.alongX ? s.z : s.z + t));
      }
      // Köşe kolonları
      if (si < 2) [-1, 1].forEach(k => solid.push(box(1.1, wallH, 1.1, k * (W / 2 - 0.55), y0 + wallH / 2, s.z)));
    });
    unit('wall_' + f.cfg.id, 'facade', solid);
    unit('spand_' + f.cfg.id, 'spandrel', span);
    unit('glass_' + f.cfg.id, 'glass', glass);
    unit('mull_' + f.cfg.id, 'mullion', mull);

    if (f.cfg.level === 0) {
      // Bina girişi (güney cephe): saçak, iki taşıyıcı, cam kapı
      const zf = -Dp / 2;
      unit('canopy_' + f.cfg.id, 'canopy', [
        box(10, 0.35, 4.5, 0, 3.9, zf - 2.1),
        box(0.35, 3.8, 0.35, -4.6, 1.9, zf - 4),
        box(0.35, 3.8, 0.35, 4.6, 1.9, zf - 4)
      ]);
      unit('door_' + f.cfg.id, 'door', [box(5, 3.2, WALL_T * 1.2, 0, SLAB + 1.6, zf + WALL_T / 2)]);
    }
  }

  function buildRoof(b) {
    b.roof.position.y = b.roofY;
    const mk = (name, matName, w, h, d, x, y, z) => {
      const m = CreateBox(name, { width: w, height: h, depth: d }, scene);
      m.parent = b.roof;
      m.position.set(x, y, z);
      m.material = mats[matName];
      m.isPickable = false;
      return m;
    };
    mk('roofSlab_' + b.cfg.id, 'roof', b.W + 0.8, 0.5, b.D + 0.8, 0, 0.25, 0);
    mk('par1_' + b.cfg.id, 'facade', b.W + 0.8, 0.9, 0.4, 0, 0.9, -b.D / 2 - 0.2);
    mk('par2_' + b.cfg.id, 'facade', b.W + 0.8, 0.9, 0.4, 0, 0.9, b.D / 2 + 0.2);
    mk('par3_' + b.cfg.id, 'facade', 0.4, 0.9, b.D + 0.8, -b.W / 2 - 0.2, 0.9, 0);
    mk('par4_' + b.cfg.id, 'facade', 0.4, 0.9, b.D + 0.8, b.W / 2 + 0.2, 0.9, 0);
    if (b === buildings[0]) buildMeteo(b);
    // Çatı üstü soğutma grupları (temsili)
    const n = Math.max(2, Math.floor(b.W / 12));
    for (let i = 0; i < n; i++) {
      const x = -b.W / 2 + 6 + (i * (b.W - 12)) / Math.max(1, n - 1);
      mk('chiller_' + b.cfg.id + '_' + i, 'rooftop', 5, 1.6, 2.6, x, 1.3, b.D / 2 - 6);
      const fan = CreateCylinder('fan_' + b.cfg.id + '_' + i, { height: 0.25, diameter: 1.6, tessellation: 16 }, scene);
      fan.parent = b.roof;
      fan.position.set(x, 2.2, b.D / 2 - 6);
      fan.material = mats.mullion;
      fan.isPickable = false;
    }
  }

  /**
   * Çatı meteoroloji istasyonu (ana bina, ön sol köşe): direk, kol, rüzgâr kepçeleri, gövde. Gövde, cihazın ya da
   * noktalarının alarmında önem renginde yanıp söner (tick). Kol ve kepçeler (anemometre) canlı rüzgâr hızıyla döner.
   */
  function buildMeteo(b) {
    meteo.mat = mat('meteo', '#cbd5e1', { spec: 0.3 });
    const x = -b.W / 2 + 4, z = -b.D / 2 + 4;
    const rotor = new TransformNode('meteoRotor', scene);
    rotor.parent = b.roof;
    rotor.position.set(x, 0, z);
    windFx.rotor = rotor;
    const part = (m, matName, px, py, pz, rot) => {
      m.parent = rot ? rotor : b.roof;
      m.position.set(rot ? px : x + px, py, rot ? pz : z + pz);
      m.material = mats[matName];
      meteo.meshes.push(m);
      return m;
    };
    part(CreateCylinder('meteoMast', { height: 4, diameter: 0.18, tessellation: 12 }, scene), 'mullion', 0, 2.5, 0);
    part(CreateBox('meteoArm', { width: 2, height: 0.1, depth: 0.1 }, scene), 'mullion', 0, 4.1, 0, true);
    [-1, 1].forEach(s => part(CreateCylinder('meteoCup' + s, { height: 0.25, diameter: 0.4, tessellation: 12 }, scene), 'meteo', s, 4.3, 0, true));
    part(CreateBox('meteoHead', { width: 0.9, height: 0.6, depth: 0.9 }, scene), 'meteo', 0, 4.8, 0);
  }

  /**
   * Rüzgâr izleri: tek mesh, WIND_N şerit × WIND_PTS nokta (konum ve saydamlık her karede yazılır, tickWind). Her iz
   * kameraya dönük, başı parlak, kuyruğa doğru incelip solan bir şerittir. Sahne yönü: +X doğu (DCB), -Z güney (giriş), +Z kuzey.
   */
  function buildWind(ext) {
    const m = mat('wind', '#000000', { alpha: 0.65 });
    m.disableLighting = true;
    m.backFaceCulling = false;
    m.emissiveColor = Color3.FromHexString('#d6ecff');
    const R0 = Math.max(60, ext.span * 0.75);
    Object.assign(windFx, { R: R0, cx: ext.cx, cz: ext.cz });
    windFx.pts = Array.from({ length: WIND_N }, () => windSeed((Math.random() * 2 - 1) * R0));
    const nv = WIND_N * WIND_PTS * 2;
    const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 4), nrm = new Float32Array(nv * 3);
    for (let i = 0; i < nv; i++) { nrm[i * 3 + 1] = 1; col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = 1; }
    const idx = [];
    for (let k = 0; k < WIND_N; k++) {
      for (let j = 0; j < WIND_PTS - 1; j++) {
        const v = (k * WIND_PTS + j) * 2;
        idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
    const mesh = new Mesh('windStreaks', scene);
    mesh.setVerticesData('position', pos, true);
    mesh.setVerticesData('normal', nrm, false);
    mesh.setVerticesData('color', col, true, 4);
    mesh.setIndices(idx);
    mesh.hasVertexAlpha = true;
    mesh.material = m;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true; // konumlar her karede değişir: ilk sınır kutusuyla kırpılmasın
    mesh.setEnabled(false);
    Object.assign(windFx, { mesh, pos, col });
  }

  /** Yeni rüzgâr izi (baş konumu a): enine konum, yükseklik (en yüksek çatının üstünde, 0–6), boy, hız payı. */
  function windSeed(a) {
    const Rr = windFx.R;
    return { a, c: (Math.random() * 2 - 1) * Rr, h: Math.random() * 6, len: 14 + Math.random() * 16, ph: Math.random() * Math.PI * 2, sp: 0.75 + Math.random() * 0.5 };
  }

  // ---------------------------------------------------------------------------
  // Kat içeriği (thin instances)
  // ---------------------------------------------------------------------------
  function buildFloorContent(f) {
    if (!scene || !f.content) return;
    f.content.getChildMeshes().forEach(m => m.dispose());
    f.kinds = {};
    f.overlay = null;

    const lb = f.layout.bounds;
    const cx = (lb.x0 + lb.x1) / 2, cy = (lb.y0 + lb.y1) / 2;
    // SCH y aşağı doğru; sahnede z kuzey (yukarı). Kat merkezi bina merkezine oturur.
    f.content.position.set(-cx, SLAB + 0.08, cy);
    f.content.scaling.set(1, 1, -1);

    KINDS.forEach(kind => {
      const items = f.kindItems[kind];
      if (!items || !items.length) return;
      const mesh = CreateBox('eq_' + f.cfg.id + '_' + kind, { size: 1 }, scene);
      mesh.parent = f.content;
      mesh.material = mats['eq_' + kind];
      mesh.isPickable = true;
      mesh.thinInstanceEnablePicking = true;
      const mbuf = new Float32Array(items.length * 16);
      const colors = new Float32Array(items.length * 4);
      items.forEach((it, idx) => {
        itemMatrix(it, 1).copyToArray(mbuf, idx * 16);
        const c = NEUTRAL[kind];
        colors.set([c[0], c[1], c[2], 1], idx * 4);
      });
      mesh.thinInstanceSetBuffer('matrix', mbuf, 16, true);
      mesh.thinInstanceSetBuffer('color', colors, 4, false);
      f.kinds[kind] = { mesh, colors, items };
    });

    const thin = (name, matName, list) => {
      if (!list.length) return;
      const m = CreateBox(name, { size: 1 }, scene);
      m.parent = f.content;
      m.material = mats[matName];
      m.isPickable = false;
      const buf = new Float32Array(list.length * 16);
      list.forEach((mx, i) => mx.copyToArray(buf, i * 16));
      m.thinInstanceSetBuffer('matrix', buf, 16, true);
    };
    // İç duvarlar
    thin('iw_' + f.cfg.id, 'iwall', f.layout.walls.filter(w => Math.hypot(w.x2 - w.x1, w.y2 - w.y1) > 0.2).map(wallMatrix));
    // Kapılar: zeminde 2D şemadaki teknik çizim sembolü + ayakta kanat(lar)
    const dl = [], dk = [];
    (f.layout.doors || []).forEach(d => doorParts(d, dl, dk));
    thin('dl_' + f.cfg.id, 'dline', dl);
    thin('dk_' + f.cfg.id, 'dleaf', dk);

    const ov = CreateBox('ov_' + f.cfg.id, { size: 1 }, scene);
    ov.parent = f.content;
    ov.isPickable = false;
    ov.material = sevMats.get('alarm');
    ov.thinInstanceSetBuffer('matrix', new Float32Array(16), 16, false);
    ov.thinInstanceCount = 0;
    ov.thinInstanceSetBuffer('color', new Float32Array(4), 4, false);
    ov.isVisible = false;
    if (glow) glow.addIncludedOnlyMesh(ov);
    f.overlay = ov;
  }

  function itemMatrix(it, grow) {
    const h = ITEM_H[it.kind] * (grow > 1 ? 1.06 : 1);
    return Matrix.Compose(
      new Vector3(it.w * grow, h, it.d * grow),
      Quaternion.RotationYawPitchRoll((-it.rot * Math.PI) / 180, 0, 0),
      new Vector3(it.cx, h / 2, it.cy)
    );
  }

  function wallMatrix(w) {
    const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
    const len = Math.hypot(dx, dy);
    const h = FH - SLAB - 1.2;
    return Matrix.Compose(
      new Vector3(len, h, 0.25),
      Quaternion.RotationYawPitchRoll(-Math.atan2(dy, dx), 0, 0),
      new Vector3((w.x1 + w.x2) / 2, h / 2, (w.y1 + w.y2) / 2)
    );
  }

  /** (x1,y1)-(x2,y2) doğrultusunda kutu (hücre; y SCH yönünde): zemin çizgisi ya da ayakta kanat. */
  function segMatrix(x1, y1, x2, y2, thick, h, y0) {
    return Matrix.Compose(
      new Vector3(Math.max(0.01, Math.hypot(x2 - x1, y2 - y1)), h, thick),
      Quaternion.RotationYawPitchRoll(-Math.atan2(y2 - y1, x2 - x1), 0, 0),
      new Vector3((x1 + x2) / 2, (y0 || 0) + h / 2, (y1 + y2) / 2)
    );
  }

  /**
   * Kapı sembolü (schematic-viewer getDoorSymbolPath ile aynı geometri, hücre biriminde).
   * Döner: menteşeden açıklığa dik kanat + kanadın süpürdüğü çeyrek yay; kanat 90° açık ayakta durur.
   * Sürgülü: açıklığın iki yanına kaymış, ortada bindirmeli iki kanat (ayakta) + kayma yönü okları.
   */
  function doorParts(d, lines, leaves) {
    const dx = d.x2 - d.x1, dy = d.y2 - d.y1;
    const len = Math.hypot(dx, dy);
    if (len < 0.05) return;
    const ux = dx / len, uy = dy / len;
    const nx = -uy * d.swing, ny = ux * d.swing; // kanatların açıldığı taraf
    const px = (along, off) => d.x1 + ux * along + nx * off;
    const py = (along, off) => d.y1 + uy * along + ny * off;
    const line = (a0, o0, a1, o1) => lines.push(segMatrix(px(a0, o0), py(a0, o0), px(a1, o1), py(a1, o1), DOOR_LINE, 0.04));

    if (d.style === 'sliding') {
      const t = Math.max(0.06, len * 0.05), lap = len * 0.06, half = len / 2, head = t * 1.6;
      const leaf = (a, b, o0, o1) => {
        const o = (o0 + o1) / 2;
        leaves.push(segMatrix(px(a, o), py(a, o), px(b, o), py(b, o), Math.abs(o1 - o0), DOOR_H));
        line(a, o0, b, o0); line(b, o0, b, o1); line(b, o1, a, o1); line(a, o1, a, o0);
      };
      const arrow = (from, to, off) => {
        const back = to > from ? -head : head;
        line(from, off, to, off);
        line(to + back, off + head / 2, to, off);
        line(to + back, off - head / 2, to, off);
      };
      leaf(0, half + lap, 0, t);
      leaf(half - lap, len, -t, 0);
      arrow(half * 0.75, half * 0.2, 3 * t);
      arrow(len - half * 0.75, len - half * 0.2, -3 * t);
      return;
    }
    if (d.style !== 'swing') { line(0, 0, len, 0); return; }
    const list = d.leaves && d.leaves.length ? d.leaves : [{ at: 'start', ratio: 1 }];
    list.forEach(lf => {
      const r = len * Math.min(1, Math.max(0.05, lf.ratio || 1));
      const atEnd = lf.at === 'end';
      const h = atEnd ? len : 0;               // menteşe
      const closed = atEnd ? len - r : r;      // kapalı kanadın ucu (açıklık üzerinde)
      line(h, 0, h, r);
      leaves.push(segMatrix(px(h, 0), py(h, 0), px(h, r), py(h, r), 0.1, DOOR_H));
      const steps = 12;
      let pa = h, po = r;
      for (let i = 1; i <= steps; i++) {
        const t = (i / steps) * (Math.PI / 2);
        const a = h + (closed - h) * Math.sin(t), o = r * Math.cos(t);
        line(pa, po, a, o);
        pa = a; po = o;
      }
    });
  }

  /** Öğenin dünya konumu (kat düğümü dahil). */
  function itemWorld(f, it) {
    f.content.computeWorldMatrix(true);
    return Vector3.TransformCoordinates(new Vector3(it.cx, ITEM_H[it.kind] / 2, it.cy), f.content.getWorldMatrix());
  }

  function siteExtent() {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    buildings.forEach(b => {
      x0 = Math.min(x0, b.ox - b.W / 2); x1 = Math.max(x1, b.ox + b.W / 2);
      z0 = Math.min(z0, b.oz - b.D / 2); z1 = Math.max(z1, b.oz + b.D / 2);
    });
    if (!Number.isFinite(x0)) return { cx: 0, cz: 0, span: 100 };
    return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, span: Math.max(x1 - x0, z1 - z0) };
  }

  // ---------------------------------------------------------------------------
  // Durum → renk
  // ---------------------------------------------------------------------------
  /** Katın öğe önemleri: SCH durumu + alarm eşleşmeleri (en yükseği). */
  function floorItemSev(f) {
    const out = new Map();
    f.statusSev.forEach((s, key) => { if (statusCatOk(f, key)) out.set(key, s); });
    visibleAlarms().forEach(a => {
      if (a.floorId !== f.cfg.id || !a.itemKey) return;
      const cur = out.get(a.itemKey) || 'normal';
      if (severityRank(a.sev) > severityRank(cur)) out.set(a.itemKey, a.sev);
    });
    return out;
  }

  function applyFloorColors(f) {
    if (!scene) return;
    const sevs = floorItemSev(f);
    KINDS.forEach(kind => {
      const km = f.kinds[kind];
      if (!km) return;
      const n = NEUTRAL[kind];
      km.items.forEach((it, idx) => {
        const s = sevs.get(it.key) || 'normal';
        if (s === 'normal') {
          km.colors[idx * 4] = n[0]; km.colors[idx * 4 + 1] = n[1]; km.colors[idx * 4 + 2] = n[2];
        } else {
          const c = Color3.FromHexString(SEVERITY_COLOR[s]);
          km.colors[idx * 4] = c.r; km.colors[idx * 4 + 1] = c.g; km.colors[idx * 4 + 2] = c.b;
        }
      });
      km.mesh.thinInstanceBufferUpdated('color');
    });
    // Parlayan kabuk: yalnız acil/alarm öğeleri
    const ov = f.overlay;
    if (ov) {
      const keys = Array.from(sevs.entries()).filter(e => (e[1] === 'acil' || e[1] === 'alarm') && f.itemIndex.has(e[0]));
      if (!keys.length) {
        ov.thinInstanceCount = 0;
        ov.isVisible = false;
      } else {
        const mb = new Float32Array(keys.length * 16);
        const cols = new Float32Array(keys.length * 4);
        keys.forEach((e, i) => {
          const ref = f.itemIndex.get(e[0]);
          itemMatrix(ref.item, 1.14).copyToArray(mb, i * 16);
          const c = Color3.FromHexString(SEVERITY_COLOR[e[1]]);
          cols.set([c.r, c.g, c.b, 1], i * 4);
        });
        ov.thinInstanceSetBuffer('matrix', mb, 16, false);
        ov.thinInstanceSetBuffer('color', cols, 4, false);
        ov.isVisible = true;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Tema, cephe
  // ---------------------------------------------------------------------------
  function applyTheme() {
    if (!scene) return;
    const light = S.isLight;
    scene.fogColor = Color3.FromHexString(light ? '#b9c5d3' : '#090d13');
    if (groundMat) groundMat.diffuseColor = light ? new Color3(0.58, 0.63, 0.69) : new Color3(0.06, 0.08, 0.11);
    if (gridLines) gridLines.color = light ? new Color3(0.36, 0.44, 0.54) : new Color3(0.25, 0.4, 0.55);
    if (hemi) {
      hemi.intensity = light ? 0.66 : 0.85;
      hemi.groundColor = light ? new Color3(0.5, 0.53, 0.58) : new Color3(0.08, 0.1, 0.14);
    }
    if (mats.pave) mats.pave.diffuseColor = Color3.FromHexString(light ? '#9aa8b8' : '#1e2631');
    if (mats.raised) mats.raised.diffuseColor = Color3.FromHexString(light ? '#a7b1be' : '#243041');
    // Bina kabuğu tonları (açık / koyu). Yalnız malzeme rengi değişir, sahne yeniden kurulmaz.
    const tone = {
      slab: ['#cfd6de', '#9aa3ad'],
      facade: ['#eef2f6', '#c9ced6'],
      spandrel: ['#b9c3cf', '#8d96a3'],
      mullion: ['#7b8796', '#4b5563'],
      roof: ['#a3afbd', '#6b7280'],
      rooftop: ['#d3dae2', '#9ca3af'],
      canopy: ['#f8fafc', '#e5e7eb'],
      iwall: ['#94a3b8', '#64748b'],
      dleaf: ['#475569', '#94a3b8'],
      door: ['#334155', '#1f2937']
    };
    Object.keys(tone).forEach(k => { if (mats[k]) mats[k].diffuseColor = Color3.FromHexString(tone[k][light ? 0 : 1]); });
    if (mats.glass) {
      mats.glass.diffuseColor = Color3.FromHexString(light ? '#7cc0ef' : '#5aa9e6');
      mats.glass.emissiveColor = Color3.FromHexString(light ? '#163a57' : '#0b2a44');
    }
    // Kapı sembolü: teknik çizim gibi zeminle zıt, ışıktan bağımsız çizgi
    if (mats.dline) mats.dline.emissiveColor = Color3.FromHexString(light ? '#1e293b' : '#e2e8f0');
    if (mats.wind) {
      // Saydamlık izin içinde (vertex alpha: baş parlak, kuyruk söner); malzeme alfası temaya göre genel yoğunluk
      mats.wind.emissiveColor = Color3.FromHexString(light ? '#2f5f8a' : '#d6ecff');
      mats.wind.alpha = light ? 0.75 : 0.65;
    }
    if (mats.shadow) mats.shadow.alpha = light ? 0.16 : 0.35;
    if (sun) sun.intensity = light ? 0.42 : sunDarkIntensity;
    // Parlama katmanı toplamsal: açık zeminde alarm renklerini soluklaştırmasın
    if (glow) glow.intensity = light ? 0.4 : 0.85;
  }

  function applyFacade() {
    if (!scene) return;
    const v = Math.max(0, Math.min(1, S.facadeOpacity / 100));
    const eff = S.isolatedFloorId ? Math.min(v, 0.12) : v;
    ['facade', 'spandrel', 'mullion', 'roof', 'canopy'].forEach(k => { if (mats[k]) mats[k].alpha = eff; });
    if (mats.glass) mats.glass.alpha = 0.08 + 0.5 * eff;
    const hide = eff < 0.02;
    floors.forEach(f => f.shellMeshes.forEach(m => {
      if (m.material === mats.slab || m.material === mats.raised) return;
      m.isVisible = !hide;
    }));
    buildings.forEach(b => {
      if (b.roof) b.roof.getChildMeshes().forEach(m => { if (meteo.meshes.indexOf(m) < 0) m.isVisible = !hide; });
    });
  }

  function updateFloorTargets() {
    const iso = S.isolatedFloorId ? floorById(S.isolatedFloorId) : null;
    floors.forEach(f => {
      f.targetY = f.cfg.level * (FH + (S.exploded ? EXPLODE : 0));
      f.hidden = !!iso && iso.b === f.b && f.cfg.level > iso.cfg.level;
      if (f.node) f.node.setEnabled(!f.hidden);
    });
    buildings.forEach(b => {
      const anyHidden = !!iso && iso.b === b && iso.cfg.level < Math.max.apply(null, b.cfg.floors.map(x => x.level));
      if (b.roof) b.roof.setEnabled(!anyHidden);
    });
    applyFacade();
  }

  function toggleExploded() {
    S.exploded = !S.exploded;
    // Rüzgâr izleri kısa bir an söner, katlar yerine oturunca yeni çatı kotunda yeniden belirir (tickWind)
    windFx.holdUntil = performance.now() + WIND_HOLD;
    updateFloorTargets();
  }

  // ---------------------------------------------------------------------------
  // Kare döngüsü ve HTML katmanları
  // ---------------------------------------------------------------------------
  function tick(now, dt) {
    const cam = camera;
    if (!cam) return;
    // Kat yükseklikleri (patlatma animasyonu)
    floors.forEach(f => {
      if (Math.abs(f.curY - f.targetY) > 0.01) {
        f.curY += (f.targetY - f.curY) * Math.min(1, dt * 0.008);
        f.node.position.y = f.curY;
      }
    });
    buildings.forEach(b => {
      const top = floors.filter(f => f.b === b).reduce((m, f) => Math.max(m, f.curY + FH), 0);
      b.roof.position.y = top;
    });

    // Meteoroloji alarmı: gövde önem renginde yanıp söner
    const mm = meteo.mat;
    if (mm) {
      if (meteo.sev !== 'normal') {
        mm.emissiveColor = Color3.FromHexString(SEVERITY_COLOR[meteo.sev]).scale(0.25 + 0.75 * (0.5 + 0.5 * Math.sin(now / 160)));
        meteo.lit = true;
      } else if (meteo.lit) {
        mm.emissiveColor = Color3.Black();
        meteo.lit = false;
      }
    }
    tickWind(now, dt);

    if (camTween) {
      const tw = camTween;
      const t = Math.min(1, (now - tw.t0) / tw.dur);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      cam.alpha = tw.from.alpha + (tw.to.alpha - tw.from.alpha) * e;
      cam.beta = tw.from.beta + (tw.to.beta - tw.from.beta) * e;
      cam.radius = tw.from.radius + (tw.to.radius - tw.from.radius) * e;
      cam.target = Vector3.Lerp(tw.from.target, tw.to.target, e);
      if (t >= 1) camTween = null;
    } else if (S.autoRotate && !focusTarget && now - lastInteract > 5000) {
      cam.alpha += dt * 0.00005;
    }

    // Nabız: alarm kabukları ve odak halkası
    const p = 0.5 + 0.5 * Math.sin(now * 0.006);
    sevMats.forEach(m => { m.alpha = 0.25 + 0.45 * p; });
    if (focusTarget && ring && beam) {
      let w = null, base = 0, s = 2;
      if (focusTarget.meteo) {
        const head = meteo.meshes[meteo.meshes.length - 1];
        if (head) { w = head.getAbsolutePosition(); base = w.y - 4.7; s = 3 + p; }
      } else {
        const ref = focusTarget.f.itemIndex.get(focusTarget.key);
        if (ref) {
          w = itemWorld(focusTarget.f, ref.item);
          base = w.y - ITEM_H[ref.item.kind] / 2 + 0.1;
          s = Math.max(ref.item.w, ref.item.d) * 1.8 + 1.2 + p * 1.2;
        }
      }
      if (w) {
        ring.position.set(w.x, base, w.z);
        ring.scaling.set(s, 1, s);
        beam.position.set(w.x, base + 14, w.z);
        beam.scaling.set(1, 28, 1);
        beam.material.alpha = 0.14 + 0.16 * p;
      }
    }
  }

  /**
   * Rüzgâr: anemometre hızla döner; izler estiği yöne, en yüksek çatının üstündeki sabit bir katmanda düz akar,
   * bölgenin kenarında söner ve karşı kenardan yeniden doğar. Ölçüm/yön yoksa, durgunken (< 0,3 m/s) ya da kat
   * görünümünde izler söner. Katlar ayrılıp birleşirken izler kısa bir an söner (toggleExploded → holdUntil).
   */
  function tickWind(now, dt) {
    const fx = windFx, v = S.wind.speed, to = S.wind.to;
    // Esinti: hız iki yavaş dalgayla ±%25 salınır (anemometre ve izler birlikte)
    const gust = 1 + 0.25 * Math.sin(now * 0.0011) * Math.sin(now * 0.00043 + 1);
    if (fx.rotor && v !== null) fx.rotor.rotation.y += Math.min(12, v * 1.2 * gust) * dt / 1000;
    const mesh = fx.mesh, pos = fx.pos, col = fx.col, cam = camera;
    if (!mesh || !pos || !col || !cam) return;
    const show = v !== null && v >= 0.3 && to !== null && !S.isolatedFloorId;
    const want = show && now >= fx.holdUntil;
    fx.vis = want ? Math.min(1, fx.vis + dt / WIND_FADE_IN) : Math.max(0, fx.vis - dt / WIND_FADE_OUT);
    if (fx.vis <= 0) {
      if (mesh.isEnabled()) mesh.setEnabled(false);
      fx.tops = null; // görünmezken çatı kotu yeniden alınır (katlar ayrıldıysa yeni kot)
      return;
    }
    if (v === null || to === null) return;
    if (!mesh.isEnabled()) mesh.setEnabled(true);
    if (!fx.tops) fx.tops = buildings.map(b => floors.filter(f => f.b === b).reduce((m, f) => Math.max(m, f.targetY + FH), 0));
    // Yön 30 sn'lik okumalar arasında sıçramasın: kısa yoldan yumuşak döner
    if (fx.ang === null) fx.ang = to;
    fx.ang += ((((to - fx.ang) % 360) + 540) % 360 - 180) * Math.min(1, dt * 0.002);
    const r = fx.ang * Math.PI / 180, ux = Math.sin(r), uz = Math.cos(r); // kuzey +Z, doğu +X
    const step = Math.max(v, 1) * WIND_VIS * gust * dt / 1000;
    const lenK = 0.7 + Math.min(0.8, v / 10);
    const amp = 0.5 + Math.min(1.1, v / 9);
    const k1 = 2 * Math.PI / 70;
    const drift = now * 0.0004;
    const W0 = 0.14 + Math.min(0.12, v * 0.012);
    const A0 = fx.vis;
    const Rr = fx.R, R0 = Rr * 0.62;
    const floorY = PAVE_TOP + BLDG_LIFT + fx.tops.reduce((m, t) => Math.max(m, t), 0) + 2.5;
    const cp = cam.globalPosition, cx = cp.x, cy = cp.y, cz = cp.z;
    const P = windPath, AL = windAlpha;
    let o = 0, oc = 0;
    for (let si = 0; si < fx.pts.length; si++) {
      let pt = fx.pts[si];
      pt.a += step * pt.sp;
      const L = pt.len * lenK;
      if (pt.a - L > Rr) fx.pts[si] = pt = windSeed(-Rr - Math.random() * 10);
      const y = floorY + pt.h;
      for (let j = 0; j < WIND_PTS; j++) {
        const t = j / (WIND_PTS - 1), sA = pt.a - L * t;
        const c = pt.c + amp * Math.sin(k1 * sA + pt.ph + drift);
        P[j * 3] = fx.cx + ux * sA - uz * c;
        P[j * 3 + 1] = y;
        P[j * 3 + 2] = fx.cz + uz * sA + ux * c;
        const rr = Math.hypot(sA, pt.c), e = rr <= R0 ? 1 : rr >= Rr ? 0 : 1 - (rr - R0) / (Rr - R0);
        AL[j] = A0 * Math.min(1, 0.3 + t * 10) * Math.pow(1 - t, 1.5) * e * e;
      }
      for (let j = 0; j < WIND_PTS; j++) {
        const a = Math.max(0, j - 1) * 3, b = Math.min(WIND_PTS - 1, j + 1) * 3, q = j * 3;
        const tx = P[a] - P[b], ty = P[a + 1] - P[b + 1], tz = P[a + 2] - P[b + 2];
        const vx = P[q] - cx, vy = P[q + 1] - cy, vz = P[q + 2] - cz;
        let sx = ty * vz - tz * vy, sy = tz * vx - tx * vz, sz = tx * vy - ty * vx;
        const w = W0 * (1 - 0.8 * j / (WIND_PTS - 1)) / (Math.hypot(sx, sy, sz) || 1);
        sx *= w; sy *= w; sz *= w;
        pos[o] = P[q] - sx; pos[o + 1] = P[q + 1] - sy; pos[o + 2] = P[q + 2] - sz;
        pos[o + 3] = P[q] + sx; pos[o + 4] = P[q + 1] + sy; pos[o + 5] = P[q + 2] + sz;
        o += 6;
        col[oc + 3] = AL[j]; col[oc + 7] = AL[j];
        oc += 8;
      }
    }
    mesh.updateVerticesData('position', pos);
    mesh.updateVerticesData('color', col);
  }

  function positionOverlays() {
    if (!scene || !camera || !engine) return;
    const rw = engine.getRenderWidth(), rh = engine.getRenderHeight();
    const sx = cssW / rw, sy = cssH / rh;
    const vp = camera.viewport.toGlobal(rw, rh);
    const tm = scene.getTransformMatrix();
    const id = Matrix.IdentityReadOnly;
    const place = (el, p, hidden) => {
      if (!el) return;
      const s = Vector3.Project(p, id, tm, vp);
      if (hidden || s.z < 0 || s.z > 1) { el.style.opacity = '0'; el.style.pointerEvents = 'none'; return; }
      el.style.opacity = '';
      el.style.pointerEvents = '';
      el.style.transform = 'translate3d(' + (s.x * sx).toFixed(1) + 'px, ' + (s.y * sy).toFixed(1) + 'px, 0)';
    };
    floors.forEach(f => {
      const b = f.b;
      place(badgeEls.get(f.cfg.id), new Vector3(b.ox + b.W / 2 + 1, BLDG_LIFT + f.curY + FH * 0.55, b.oz - b.D / 2), f.hidden);
    });
    buildings.forEach(b => {
      place(labelEls.get(b.cfg.id), new Vector3(b.ox, BLDG_LIFT + b.roof.position.y + 5, b.oz), !S.showLabels);
    });
    tagList.forEach(t => {
      const ref = t.f.itemIndex.get(t.key);
      if (!ref) return;
      const w = itemWorld(t.f, ref.item);
      w.y += ITEM_H[ref.item.kind] / 2 + 0.6;
      place(tagEls.get(t.key + '@' + t.f.cfg.id), w, t.f.hidden);
    });
    // Rüzgâr pusulası: sahnenin kuzeyi (+Z) ekranda kameranın açısına göre döner
    const rose = R.wind.querySelector('[data-rose]');
    if (rose) {
      const deg = Math.atan2(Math.cos(camera.alpha), -Math.sin(camera.alpha)) * 180 / Math.PI;
      if (Math.abs(deg - windFx.roseDeg) > 0.3 || !rose.style.transform) {
        windFx.roseDeg = deg;
        rose.style.transform = 'rotate(' + deg.toFixed(1) + 'deg)';
      }
    }
  }

  /** 3D etiketler: önem sırasına göre ilk 14 anormal öğe (DOM elle yönetilir). */
  function rebuildTags() {
    const layer = R.tags;
    if (!layer || !scene) return;
    const list = [];
    if (S.showLabels) {
      floors.forEach(f => {
        floorItemSev(f).forEach((sev, key) => {
          if (sev === 'normal' || sev === 'kayip') return;
          const ref = f.itemIndex.get(key);
          if (ref) list.push({ key, f, item: ref.item, sev });
        });
      });
      list.sort((a, b) => severityRank(b.sev) - severityRank(a.sev));
    }
    const top = list.slice(0, 14);
    const want = new Set(top.map(t => t.key + '@' + t.f.cfg.id));
    tagEls.forEach((el, k) => { if (!want.has(k)) { el.remove(); tagEls.delete(k); } });
    top.forEach(t => {
      const k = t.key + '@' + t.f.cfg.id;
      let el = tagEls.get(k);
      if (!el) {
        el = document.createElement('div');
        el.className = 'tag3d';
        el.style.opacity = '0';
        layer.appendChild(el);
        tagEls.set(k, el);
      }
      el.style.setProperty('--c', SEVERITY_COLOR[t.sev]);
      el.textContent = t.item.label || t.key;
    });
    tagList = top;
  }

  // ---------------------------------------------------------------------------
  // Seçim ve kamera
  // ---------------------------------------------------------------------------
  function selectFloor(id) {
    const f = floorById(id);
    if (!f) return;
    S.isolatedFloorId = id;
    S.focusedAlarmId = null;
    setFocus(null);
    S.selItem = null;
    updateFloorTargets();
    if (camera) {
      const w = new Vector3(f.b.ox, BLDG_LIFT + f.targetY + FH * 0.4, f.b.oz);
      flyTo({ alpha: -Math.PI / 2 - 0.35, beta: 0.82, radius: Math.max(60, Math.max(f.b.W, f.b.D) * 1.25), target: w });
    }
    rebuildTags();
    refreshViews();
  }

  function backToBuilding() {
    S.isolatedFloorId = null;
    S.focusedAlarmId = null;
    setFocus(null);
    S.selItem = null;
    updateFloorTargets();
    if (homePose) flyTo(Object.assign({}, homePose, { target: homePose.target.clone() }));
    refreshViews();
  }

  function focusAlarm(a) {
    S.focusedAlarmId = a.id;
    if (meteo.ids.has(a.dev) && selectMeteo()) { refreshViews(); return; }
    const f = a.floorId ? floorById(a.floorId) : null;
    if (!f) { refreshViews(); return; }
    if (a.itemKey && flyToItem(f, a.itemKey, SEVERITY_COLOR[a.sev])) { refreshViews(); return; }
    S.isolatedFloorId = f.cfg.id;
    updateFloorTargets();
    setFocus(null);
    S.selItem = null;
    if (camera) flyTo({ alpha: -Math.PI / 2 - 0.35, beta: 0.82, radius: Math.max(60, Math.max(f.b.W, f.b.D) * 1.2), target: new Vector3(f.b.ox, BLDG_LIFT + f.targetY + FH * 0.4, f.b.oz) });
    refreshViews();
  }

  /** Öğeye yumuşak uçuş + odak halkası + seçim kartı (alarm odağı, çift tık ve URL ortak yolu). */
  function flyToItem(f, key, color) {
    const ref = f.itemIndex.get(key);
    if (!ref) return false;
    S.isolatedFloorId = f.cfg.id;
    updateFloorTargets();
    setFocus({ f, key: ref.item.key }, color);
    if (camera && f.node) {
      // Hedef: katın son (hedef) yüksekliğiyle öğe konumu
      const saveY = f.node.position.y;
      f.node.position.y = f.targetY;
      f.node.computeWorldMatrix(true);
      const w = itemWorld(f, ref.item);
      f.node.position.y = saveY;
      f.node.computeWorldMatrix(true);
      flyTo({ alpha: camera.alpha, beta: 0.9, radius: 12, target: w });
    }
    S.selItem = selView(f, ref.item);
    return true;
  }

  /** Meteoroloji istasyonunu seçer: kamera çatıya, seçim kartı (çift tık, alarm ve URL ortak yolu). */
  function selectMeteo() {
    const head = meteo.meshes[meteo.meshes.length - 1];
    S.isolatedFloorId = null; // çatı görünsün: katlar binaya döner
    updateFloorTargets();
    setFocus(head && camera ? { meteo: true } : null, meteo.sev !== 'normal' ? SEVERITY_COLOR[meteo.sev] : undefined);
    if (head && camera) {
      buildings[0].roof.computeWorldMatrix(true);
      head.computeWorldMatrix(true);
      flyTo({ alpha: camera.alpha, beta: 0.9, radius: 16, target: head.getAbsolutePosition().clone() });
    }
    S.selItem = meteoView();
    return true;
  }

  function meteoView() {
    const n = visibleAlarms().filter(a => meteo.ids.has(a.dev)).length;
    return {
      floorId: '', key: 'meteo', label: METEO.label, kind: 'panel', kindLabel: 'Meteoroloji', devId: METEO.devId,
      floorName: 'Çatı', sev: meteo.sev, alarms: n, live: true, pmsAlarm: '', meteo: true
    };
  }

  /** Çift tık: önce meteoroloji istasyonu, sonra thin instance pick (pickedMesh + thinInstanceIndex) → öğeye uçuş. */
  function onCanvasDblClick(ev) {
    if (!scene) return;
    const r = R.canvas.getBoundingClientRect();
    const mp = scene.pick(ev.clientX - r.left, ev.clientY - r.top, m => meteo.meshes.indexOf(m) >= 0 && m.isEnabled());
    if (mp && mp.hit) { S.focusedAlarmId = null; selectMeteo(); refreshViews(); return; }
    const owner = new Map();
    floors.forEach(f => KINDS.forEach(k => { const km = f.kinds[k]; if (km) owner.set(km.mesh, { f, km }); }));
    const pi = scene.pick(ev.clientX - r.left, ev.clientY - r.top, m => owner.has(m) && m.isEnabled() && m.isVisible);
    const o = pi && pi.hit && pi.pickedMesh ? owner.get(pi.pickedMesh) : undefined;
    const it = o && pi.thinInstanceIndex >= 0 ? o.km.items[pi.thinInstanceIndex] : undefined;
    if (!o || !it) return;
    S.focusedAlarmId = null;
    const sev = floorItemSev(o.f).get(it.key);
    flyToItem(o.f, it.key, sev && sev !== 'normal' ? SEVERITY_COLOR[sev] : undefined);
    refreshViews();
  }

  function selView(f, it) {
    const al = visibleAlarms().filter(a => a.floorId === f.cfg.id && a.itemKey === it.key)
      .sort((a, b) => severityRank(b.sev) - severityRank(a.sev));
    return {
      floorId: f.cfg.id, key: it.key, label: it.label || it.key, kind: it.kind, kindLabel: KIND_LABEL[it.kind], devId: it.devId,
      floorName: f.cfg.name, sev: floorItemSev(f).get(it.key) || 'normal', alarms: al.length, live: true,
      dca: f.b === buildings[0], pmsAlarm: al[0] ? al[0].rid : '', topText: al[0] ? (al[0].detail || al[0].txt) : ''
    };
  }

  function closeSel() {
    S.selItem = null;
    setFocus(null);
    refreshViews();
  }

  function setFocus(t, color) {
    focusTarget = t;
    if (ring) ring.setEnabled(!!t);
    if (beam) beam.setEnabled(!!t);
    if (t && ring && beam) {
      const a = S.alarmsView.find(x => x.id === S.focusedAlarmId);
      const c = Color3.FromHexString(color || (a ? SEVERITY_COLOR[a.sev] : '#38bdf8'));
      ring.material.emissiveColor = c;
      beam.material.emissiveColor = c;
    }
  }

  function flyTo(to) {
    const cam = camera;
    if (!cam) return;
    let da = (to.alpha - cam.alpha) % (Math.PI * 2);
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    camTween = {
      from: { alpha: cam.alpha, beta: cam.beta, radius: cam.radius, target: cam.target.clone() },
      to: Object.assign({}, to, { alpha: cam.alpha + da }),
      t0: performance.now(), dur: 1300
    };
  }

  // ---------------------------------------------------------------------------
  // BMS ↔ PMS geçişi (ortak URL sözleşmesi)
  // ---------------------------------------------------------------------------
  /** PMS: alarm (CMA rid), dev (cihaz kimliği), from=bms; alarm/dev varsa tek hat görünümü açılır. */
  function openPms(p) {
    p = p || {};
    const q = new URLSearchParams();
    if (p.alarm || p.dev) q.set('view', 'single-line');
    if (p.alarm) q.set('alarm', p.alarm);
    if (p.dev) q.set('dev', p.dev);
    q.set('from', 'bms');
    window.location.href = 'pms.html?' + q.toString();
  }

  function pmsFromAlarm(a) {
    const f = a.floorId ? floorById(a.floorId) : null;
    const ref = f && a.itemKey ? f.itemIndex.get(a.itemKey) : null;
    openPms({ alarm: a.rid || undefined, dev: (ref && ref.item.devId) || a.dev || undefined });
  }

  function pmsFromSel(s) {
    openPms({ alarm: s.pmsAlarm || undefined, dev: s.devId || undefined });
  }

  function closeBand() {
    S.navBand = null;
    clearTimeout(bandTimer);
    renderBand();
  }

  function showBand(msg) {
    S.navBand = msg;
    clearTimeout(bandTimer);
    bandTimer = setTimeout(closeBand, BAND_MS);
    renderBand();
  }

  /**
   * Sıra: alarm → o alarmın öğesi; meteoroloji (dev/alarm); cab → kabin; dev → SCH devId (_DV'siz) ya da etiket;
   * floor → kat; hiçbiri yoksa konumun tanımlı olmadığı söylenir (tahmin yok).
   */
  function tryNav() {
    const g = k => String(params.get(k) || '').trim();
    const req = { floor: g('floor'), dev: g('dev'), cab: g('cab') || g('cabinet'), alarm: g('alarm'), from: g('from') };
    if (!req.floor && !req.dev && !req.cab && !req.alarm) {
      if (req.from === 'pms') showBand("PMS'ten geldiniz");
      return;
    }
    const from = req.from === 'pms' ? "PMS'ten geldiniz" : 'Bağlantıdan geldiniz';

    if (req.alarm) {
      const want = req.alarm.toUpperCase();
      const a = allAlarms().find(x => String(x.rid).toUpperCase() === want || String(x.alarmId || '').toUpperCase() === want || x.id.toUpperCase() === want);
      const f = a && a.floorId ? floorById(a.floorId) : null;
      if (a && f && a.itemKey && f.itemIndex.has(a.itemKey)) {
        focusAlarm(a);
        showBand(from + ' · ' + (a.where || a.txt));
        return;
      }
    }
    // Meteoroloji (PMS'ten ya da bağlantıdan dev/alarm ile): çatıdaki istasyon
    const meteoReq = (req.dev && meteo.ids.has(req.dev)) || allAlarms().some(x => (x.rid === req.alarm || x.id === req.alarm) && meteo.ids.has(x.dev));
    if (meteoReq && selectMeteo()) {
      refreshViews();
      showBand(from + ' · ' + METEO.label);
      return;
    }
    const hit = (req.cab ? findCab(req.cab) : null) || (req.dev ? findDev(req.dev) : null);
    if (hit) {
      S.focusedAlarmId = null;
      const sev = floorItemSev(hit.f).get(hit.key);
      flyToItem(hit.f, hit.key, sev && sev !== 'normal' ? SEVERITY_COLOR[sev] : undefined);
      // Öğenin en önemli alarmı listede vurgulanır (PMS'ten gelişte operatör alarmı hemen görsün)
      const al = allAlarms().filter(x => x.floorId === hit.f.cfg.id && x.itemKey === hit.key)
        .sort((x, y) => severityRank(y.sev) - severityRank(x.sev))[0];
      if (al) S.focusedAlarmId = al.id;
      refreshViews();
      const ref = hit.f.itemIndex.get(hit.key);
      showBand(from + ' · ' + hit.f.cfg.name + ' · ' + ((ref && ref.item.label) || hit.key));
      return;
    }
    const fid = req.floor ? resolveFloorId(req.floor) : null;
    if (fid) {
      selectFloor(fid);
      showBand(from + ' · ' + floorName(fid));
      return;
    }
    showBand('Bu güç cihazının fiziksel konumu tanımlı değil (Enerji merkezi)');
  }

  /** Yerleşimi gelmiş katlar (istenen kat önce). */
  function navFloors() {
    const want = resolveFloorId(params.get('floor') || '');
    return floors.filter(f => f.layout.items.length)
      .sort((a, b) => Number(b.cfg.id === want) - Number(a.cfg.id === want));
  }

  function findCab(cab) {
    const n = B.normCab(cab);
    if (!n) return null;
    for (const f of navFloors()) {
      const key = f.cabIndex.get(n);
      if (key) return { f, key };
    }
    return null;
  }

  /** SCH öğesi devId ile eşleşme (sondaki _DV olsa da olmasa da); yoksa kök kuralı; sunumda etiket de kabul edilir. */
  function findDev(dev) {
    const stem = v => String(v || '').trim().toUpperCase().replace(/_DV$/, '');
    const want = stem(dev);
    if (!want) return null;
    const list = navFloors();
    for (const f of list) {
      const it = f.layout.items.find(i => i.devId && stem(i.devId) === want);
      if (it) return { f, key: it.key };
    }
    for (const f of list) {
      const s = f.devStems.find(x => want.indexOf(x.stem) >= 0);
      if (s) return { f, key: s.key };
    }
    const norm = v => String(v || '').toUpperCase().replace(/[^A-Z0-9ÇĞİÖŞÜ]/g, '');
    const wn = norm(dev);
    for (const f of list) {
      const it = f.layout.items.find(i => norm(i.label) === wn || (i.kind === 'ups' && norm(i.label) === 'UPS' + wn));
      if (it) return { f, key: it.key };
    }
    return null;
  }

  function resolveFloorId(v) {
    const n = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const u = n(v);
    if (!u) return null;
    const f = floors.find(x => n(x.cfg.id) === u || n(x.cfg.name) === u || (u === 'FLK1' && x === kat1));
    return f ? f.cfg.id : null;
  }

  // ---------------------------------------------------------------------------
  // Alarmlar (KAT-1 = DCIM.data.activeAlarms; KAT-2/KAT-3/DCB tohumlu kat alarmları — hepsi canlı)
  // ---------------------------------------------------------------------------
  function relinkRealAlarms() {
    const f = kat1;
    const list = [];
    KAT1_SRC.forEach(r => {
      if (r.sev === 'normal') return;
      let itemKey = null;
      if ((r.deviceType === 'cabinet' || r.deviceType === 'lock') && r.target) itemKey = f.cabIndex.get(B.normCab(r.target)) || null;
      else if (r.target) itemKey = f.labelIndex.get(r.target.toUpperCase()) || null;
      if (!itemKey && r.rid) {
        const up = r.rid.toUpperCase();
        const s = f.devStems.find(x => up.indexOf(x.stem) >= 0);
        itemKey = s ? s.key : null;
      }
      const ref = itemKey ? f.itemIndex.get(itemKey) : null;
      const label = ref ? (ref.item.label || r.target) : r.target;
      const id = 'R' + r.alarmId;
      const prev = realAlarms.find(x => x.id === id);
      list.push({
        id, rid: r.rid, alarmId: r.alarmId,
        floorId: f.cfg.id, itemKey, sev: r.sev,
        txt: String(r.desc || r.txt || r.rid || 'Alarm'),
        detail: r.txt,
        where: [f.cfg.name, label || ''].filter(Boolean).join(' · '),
        time: hhmm(r.ts), ts: r.ts,
        acked: r.acked || ackedIds.has(id),
        acking: prev ? prev.acking : false,
        cat: showAlarmCategory(r.grp),
        dev: ref && ref.item.devId ? ref.item.devId : r.rid
      });
    });
    realAlarms = list;
  }

  /** "Gördüm": sunumda yalnız bellekte işaretlenir (orijinal: CMA_List öğesine ack yazımı). */
  function ack(a) {
    if (!a || a.acked || a.acking) return;
    a.acking = true;
    renderAlarmPanel();
    setTimeout(() => {
      a.acking = false;
      a.acked = true;
      ackedIds.add(a.id);
      onAlarmsChanged();
    }, 650);
  }

  let floorAlarmSeq = 0;
  function makeFloorAlarm(f, tpl, it, ts, acked) {
    const rid = B.alarmRid(it, tpl);
    const id = 'F' + f.cfg.id + '-' + (++floorAlarmSeq);
    return {
      id, rid, alarmId: '', floorId: f.cfg.id, itemKey: it.key, sev: tpl.sev, txt: (it.label || it.key) + ' — ' + tpl.txt, detail: tpl.txt,
      where: f.cfg.name + ' · ' + (it.label || it.key), time: hhmm(ts), ts, acked: !!acked, acking: false,
      cat: showAlarmCategory(tpl.grp), dev: it.devId || rid
    };
  }

  /** Açılış: kat başına sabit alarmlar; sonra 50-70 sn'de bir tohumlu hafif değişim (yeni alarm / temizlenen alarm). */
  function startFloorAlarms() {
    const now = Date.now();
    floors.filter(f => f !== kat1).forEach(f => {
      const cur = [];
      (B.FLOOR_ALARMS_INITIAL[f.cfg.id] || []).forEach(d => {
        const tpl = B.FLOOR_ALARM_TEXTS[d.tpl];
        const items = f.kindItems[tpl.kind] || [];
        if (!items.length) return;
        cur.push(makeFloorAlarm(f, tpl, items[d.idx % items.length], now - d.ageMin * 60000, d.acked));
      });
      floorAlarms.set(f.cfg.id, cur);
    });
    const rnd = D.rng(B.FLOOR_ALARM_SEED);
    const step = () => {
      const list = floors.filter(f => f !== kat1);
      const f = list[Math.floor(rnd() * list.length)];
      const cur = floorAlarms.get(f.cfg.id) || [];
      if (cur.length >= 3 || (cur.length > 1 && rnd() < 0.45)) cur.splice(Math.floor(rnd() * cur.length), 1);
      else {
        const tpl = B.FLOOR_ALARM_TEXTS[Math.floor(rnd() * B.FLOOR_ALARM_TEXTS.length)];
        const items = f.kindItems[tpl.kind] || [];
        const it = items.length ? items[Math.floor(rnd() * items.length)] : null;
        if (it && !cur.some(c => c.itemKey === it.key)) cur.push(makeFloorAlarm(f, tpl, it, Date.now(), false));
      }
      floorAlarms.set(f.cfg.id, cur);
      onAlarmsChanged();
      setTimeout(step, 50000 + rnd() * 20000);
    };
    setTimeout(step, 50000 + rnd() * 20000);
  }

  function allAlarms() {
    const out = realAlarms.slice();
    floorAlarms.forEach(l => out.push.apply(out, l));
    return out;
  }

  function onAlarmsChanged() {
    meteo.sev = visibleAlarms().filter(a => meteo.ids.has(a.dev)).reduce((m, a) => (severityRank(a.sev) > severityRank(m) ? a.sev : m), 'normal');
    floors.forEach(f => applyFloorColors(f));
    rebuildTags();
    // Odaktaki alarm kaybolduysa odağı bırak
    if (S.focusedAlarmId && !visibleAlarms().some(a => a.id === S.focusedAlarmId)) {
      S.focusedAlarmId = null;
      if (!S.selItem) setFocus(null);
    }
    refreshViews();
  }

  function setFilter(v) {
    S.alarmFilter = v;
    refreshViews();
  }

  /** Kategori çipi: çoklu seçim; null = Tümü. Liste, 3D vurgu, kat rozetleri ve KPI birlikte süzülür. */
  function toggleCat(id) {
    if (!id) S.catSel.clear();
    else if (S.catSel.has(id)) S.catSel.delete(id);
    else S.catSel.add(id);
    if (S.catSel.size === ALARM_CATS.length) S.catSel.clear();
    storage.set(CAT_STORE_KEY, JSON.stringify(Array.from(S.catSel)));
    onAlarmsChanged();
  }

  const catOk = c => !S.catSel.size || (c !== null && S.catSel.has(c));

  /** SCH durum rengi (alarm değil): ekipman türünün kategorisi seçiliyse görünür. */
  function statusCatOk(f, key) {
    if (!S.catSel.size) return true;
    const ref = f.itemIndex.get(key);
    return !!ref && S.catSel.has(KIND_CAT[ref.kind]);
  }

  /** Kategori süzgecinden geçen alarmlar (3D, KPI, kat rozetleri ve liste bunu kullanır). */
  function visibleAlarms() {
    const all = allAlarms();
    return S.catSel.size ? all.filter(a => catOk(a.cat)) : all;
  }

  function refreshViews() {
    const everything = allAlarms();
    const all = everything.filter(a => catOk(a.cat));
    const live = zeroKpi();
    all.forEach(a => {
      if (a.sev !== 'normal') live[a.sev]++;
      live.total++;
      if (!a.acked) live.unack++;
    });
    S.kpi = { live };
    S.floorsView = S.floorsView.map(fv => {
      const fa = all.filter(a => a.floorId === fv.id);
      const f = floorById(fv.id);
      const st = f ? Array.from(f.statusSev.entries()).filter(e => statusCatOk(f, e[0])).map(e => e[1]) : [];
      const sev = fa.map(a => a.sev).concat(st.filter(s => s !== 'kayip')).reduce((m, s) => (severityRank(s) > severityRank(m) ? s : m), 'normal');
      return Object.assign({}, fv, { sev, live: fa.length });
    });
    const scope = l => (S.alarmFilter === 'all' ? l : l.filter(a => a.floorId === S.alarmFilter));
    // Çip sayıları: tümü/kat seçimi içindeki aktif alarmlar (kategori seçiminden bağımsız)
    const scoped = scope(everything);
    S.catAllCount = scoped.length;
    S.catChips = ALARM_CATS.map(c => Object.assign({}, c, { n: scoped.filter(a => a.cat === c.id).length }));
    S.alarmsView = scope(all)
      .sort((a, b) => (Number(a.acked) - Number(b.acked)) || (severityRank(b.sev) - severityRank(a.sev)) || (b.ts - a.ts))
      .slice(0, 200);
    if (S.selItem) {
      if (S.selItem.meteo) S.selItem = meteoView();
      else {
        const sf = floorById(S.selItem.floorId);
        const ref = sf ? sf.itemIndex.get(S.selItem.key) : null;
        S.selItem = sf && ref ? selView(sf, ref.item) : null;
      }
    }
    refreshStd();
    renderAll();
  }

  // ---------------------------------------------------------------------------
  // Standart uyumu kartları
  // ---------------------------------------------------------------------------
  function refreshStd() {
    const now = Date.now();
    const real = allAlarms();
    const last10 = l => l.filter(a => a.ts && now - a.ts <= 10 * 60000).length;
    const t = envTemps, h = envHums;
    const avg = v => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);
    const tAvg = avg(t), hAvg = avg(h);
    let bars = [];
    let tMin = 0, tMax = 0;
    if (t.length) {
      tMin = Math.min.apply(null, t); tMax = Math.max.apply(null, t);
      const lo = Math.floor(tMin), hi = Math.ceil(tMax);
      const step = Math.max(1, Math.ceil((hi - lo) / 8));
      const bins = [];
      for (let x = lo; x < hi || bins.length === 0; x += step) bins.push(x);
      const counts = bins.map(b => t.filter(v => (v >= b && v < b + step) || (b + step >= hi && v === hi)).length);
      const max = Math.max.apply(null, [1].concat(counts));
      bars = bins.map((b, i) => ({ label: b + '–' + (b + step), n: counts[i], pct: Math.round((counts[i] / max) * 100) }));
    }
    const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');
    const perFloor = rows => (rows.length ? '\nKat kat:\n' + rows.join('\n') : '');

    // Haberleşme kaybı, yerleşimi gelmiş tüm katlarda: SCH durumu ya da "Veri yok" alarmı olan ekipman
    const comm = floors.filter(f => f.layout.items.length).map(f => {
      const lost = new Set(Array.from(f.statusSev.entries()).filter(e => e[1] === 'kayip').map(e => e[0]));
      real.forEach(a => { if (a.floorId === f.cfg.id && a.sev === 'kayip' && a.itemKey) lost.add(a.itemKey); });
      return { name: f.cfg.name, total: f.layout.items.length, lost: lost.size };
    });
    const cTotal = comm.reduce((n, c) => n + c.total, 0), cLost = comm.reduce((n, c) => n + c.lost, 0);

    // Kabin sıcaklığı: tüm katlar; kat başına ortalama ipucunda
    const tFloors = envByFloor.filter(e => e.t.length);
    const tSub = t.length ? t.length + ' nokta · ' + tFloors.length + ' kat · ' + tMin.toFixed(1) + '–' + tMax.toFixed(1) + ' °C' : 'Nokta okunamadı';
    const tLong = (t.length ? t.length + ' nokta · en düşük ' + tMin.toFixed(1) + ' · en yüksek ' + tMax.toFixed(1) + ' °C' + (hAvg !== null ? ' · nem ort. %' + hAvg.toFixed(0) : '') : 'Kabin sıcaklık noktası okunamadı') +
      perFloor(envByFloor.map(e => {
        const ft = avg(e.t), fh = avg(e.h);
        return e.name + ': ' + (ft === null ? '—' : ft.toFixed(1) + ' °C') + ' (' + e.t.length + ' nokta)' + (fh !== null ? ' · nem %' + fh.toFixed(0) : '');
      }));
    // Alarm sayıları kat kat (katı çözülemeyen alarm "Tesis")
    const floorRows = fn => {
      const ids = S.floorsView.map(f => f.id).concat([null]);
      return ids.map(id => ({ id, l: real.filter(a => (a.floorId || null) === id) }))
        .filter(x => x.id !== null || x.l.length)
        .map(x => (x.id === null ? 'Tesis' : floorName(x.id) || x.id) + ': ' + fn(x.l));
    };
    const realUn = real.filter(a => !a.acked).length;
    const card = (c, long) => Object.assign({}, c, { tip: [c.std + (c.live ? ' · canlı' : ''), long, 'Kaynak: ' + c.note].join('\n') });

    S.stdCards = [
      card({
        id: 'temp', title: 'Kabin sıcaklığı', std: 'ASHRAE TC 9.9 zarfı', live: true,
        value: tAvg === null ? '—' : tAvg.toFixed(1), unit: '°C ort.', sub: tSub, bars,
        note: 'Önerilen/izin verilen aralık araştırma dosyalarında yer almıyor; bu yüzden eşik ve "aralıkta oranı" gösterilmiyor (literatur-raporu.md, 02-kavram-standart.md).'
      }, tLong),
      card({
        id: 'isa182', title: 'Alarm yükü (10 dk)', std: 'ISA-18.2 / EEMUA 191 / IEC 62682', live: true,
        value: String(last10(real)), unit: 'yeni', sub: 'aktif ' + real.length,
        note: 'Birim zamanda alarm sınırı standartlarda tanımlı; "10 dk\'da 10 alarm" taşkın eşiği araştırmada bulunamadı, eşik gösterilmiyor (06-ux-kapsam.md L110; literatur-taramasi.md L89-90).'
      }, 'Son 10 dk: ' + last10(real) + ' yeni · aktif ' + real.length + perFloor(floorRows(l => last10(l) + ' yeni · ' + l.length + ' aktif'))),
      card({
        id: 'pue', title: 'PUE', std: 'ISO/IEC 30134-2 / EN 50600-4-2', live: true,
        value: S.pue === null ? '—' : S.pue.toFixed(2), unit: '', sub: 'BT ' + fmt(S.itKw, 0) + ' · soğ. ' + fmt(S.coolKw, 0) + ' kW',
        note: 'Ölçüm kategorisi (PUE1 UPS çıkışı / PUE2 PDU / PUE3 sunucu girişi) bugünkü hesap için belirlenmedi (02-kavram-standart.md L32, L107).'
      }, 'Güç kullanım etkinliği · BT ' + fmt(S.itKw) + ' kW · soğutma ' + fmt(S.coolKw) + ' kW'),
      card({
        id: 'unack', title: 'Görülmemiş alarm', std: 'ISA-18.2 durumları (Unack / Ack)', live: true,
        value: pct(realUn, real.length), unit: '', sub: realUn + ' / ' + real.length + ' aktif',
        note: 'Görülmemiş alarm yanıp söner, görülmüş alarm sabit renkte kalır (06-ux-kapsam.md L107).'
      }, realUn + ' / ' + real.length + ' aktif alarm görülmedi' + perFloor(floorRows(l => l.filter(a => !a.acked).length + ' / ' + l.length))),
      card({
        id: 'comm', title: 'Haberleşme kaybı', std: 'ISA-101 durumsal farkındalık', live: true,
        value: pct(cLost, cTotal), unit: '', sub: cLost + ' / ' + cTotal + ' ekipman · ' + comm.length + ' kat',
        note: 'ISA-101: nötr arka plan, yalnız anormal durum vurgusu; "Veri yok" alarm renginden ayrı gösterilir (06-ux-kapsam.md L34, L108).'
      }, cLost + ' / ' + cTotal + ' ekipman "Veri yok"' + perFloor(comm.map(c => c.name + ': ' + c.lost + ' / ' + c.total)))
    ];
  }

  // ---------------------------------------------------------------------------
  // Çizim
  // ---------------------------------------------------------------------------
  const shapeI = s => '<i class="shape ' + SEV_SHAPE[s] + '"></i>';

  function renderAll() {
    renderBadges();
    renderFloorNav();
    renderIso();
    renderSel();
    renderWind();
    renderAlarmPanel();
    renderBottom();
  }

  /** Canlı özet çipleri (alt bölümün sekme satırında, sağda). */
  function kpisHtml() {
    const k = S.kpi.live;
    return '<div class="kpis" role="group" aria-label="Canlı özet">' +
      ['acil', 'alarm', 'uyari', 'kayip'].map(s =>
        '<span class="kpi sev" style="--c:' + SEVERITY_COLOR[s] + '" title="' + esc(SEV_LABEL[s] + ': ' + k[s] + ' (canlı)') + '">' +
          shapeI(s) + '<span class="k-label">' + esc(SEV_LABEL[s]) + '</span><b class="k-val">' + k[s] + '</b></span>').join('') +
      '<span class="kpi" title="' + esc('Görülmemiş: ' + k.unack + ' / ' + k.total + ' aktif') + '"><span class="k-label">Görülmemiş</span><b class="k-val">' + k.unack + '<small>/' + k.total + '</small></b></span>' +
      '<span class="kpi" title="PUE (canlı)"><span class="k-label">PUE</span><b class="k-val">' + fmt(S.pue, 2) + '</b></span>' +
      '<span class="kpi" title="BT / Soğutma gücü (canlı)"><span class="k-label">BT / Soğ.</span><b class="k-val">' + fmt(S.itKw, 0) + '<small> / ' + fmt(S.coolKw, 0) + ' kW</small></b></span>' +
      '<span class="kpi" title="' + esc('KAT-1 ekipman: ' + S.kat1State + (S.lastUpdate ? ' · son güncelleme ' + S.lastUpdate : '')) + '"><span class="k-label">KAT-1</span><b class="k-val">' + S.kat1Counts.cabinet + '<small> kabin · ' + S.kat1Counts.climate + ' klima</small></b></span>' +
    '</div>';
  }

  function renderBadges() {
    S.floorsView.forEach(f => {
      const el = badgeEls.get(f.id);
      if (!el) return;
      el.classList.toggle('active', S.isolatedFloorId === f.id);
      el.style.setProperty('--c', SEVERITY_COLOR[f.sev]);
      el.innerHTML = '<span class="dot' + (f.sev !== 'normal' ? ' pulse' : '') + '"></span>' +
        '<span class="f-name">' + esc(f.name) + '</span>' +
        (f.live ? '<span class="f-count">' + f.live + '</span>' : '');
    });
  }

  function renderFloorNav() {
    R.fnav.innerHTML = S.floorsView.map(f =>
      '<button type="button" data-act="floor" data-id="' + esc(f.id) + '" class="' + (S.isolatedFloorId === f.id ? 'active' : '') + '" style="--c:' + SEVERITY_COLOR[f.sev] + '">' +
        '<span class="dot"></span>' + esc(f.name) + '</button>').join('') +
      '<button type="button" data-act="building" class="' + (!S.isolatedFloorId ? 'active' : '') + '">Bina</button>';
  }

  function renderIso() {
    R.iso.innerHTML = S.isolatedFloorId
      ? '<div class="iso-chip"><span>' + esc(floorName(S.isolatedFloorId)) + ' görünümü</span><button type="button" data-act="building">Binaya dön (Esc)</button></div>'
      : '';
  }

  function renderBand() {
    R.band.innerHTML = S.navBand
      ? '<div class="nav-band" role="status"><i class="pi pi-directions" aria-hidden="true"></i><span>' + esc(S.navBand) + '</span><button type="button" aria-label="Kapat" data-act="close-band">×</button></div>'
      : '';
  }

  /** Rüzgâr çipi (çatı meteoroloji istasyonu, canlı): pusula kamerayla döner, ok estiği yönü gösterir. */
  function renderWind() {
    const w = S.wind;
    if (!w.on) { R.wind.innerHTML = ''; return; }
    const prev = R.wind.querySelector('[data-rose]');
    const rot = prev ? prev.style.transform : '';
    R.wind.innerHTML =
      '<div class="wind-chip" title="Çatı meteoroloji istasyonu, 30 sn. Ok rüzgârın estiği yönü gösterir; çatıdaki çizgiler aynı yöne akar.">' +
        '<span class="w-rose" data-rose' + (rot ? ' style="transform:' + rot + '"' : '') + '><b class="w-n">K</b>' +
          (w.to !== null ? '<i class="pi pi-arrow-up w-arrow" style="transform:rotate(' + w.to + 'deg)" aria-hidden="true"></i>' : '') +
        '</span>' +
        '<span class="w-txt"><span class="k-label">Rüzgâr</span><b>' + fmt(w.speed, 1) + ' <small>m/s</small></b><small>' + esc(w.dir || '—') + '</small></span>' +
      '</div>';
  }

  /** Seçili ekipmanın kısa ölçüm satırı (sunum için DCIM.data'dan). */
  function selValues(s) {
    const pt = (e, label) => { const p = e && e.points ? e.points.find(x => x.label === label) : null; return p ? p.value + (p.unit ? (p.unit === '%' ? '' : ' ') + p.unit : '') : null; };
    if (s.meteo) {
      const out = [['Rüzgâr', fmt(S.wind.speed, 1) + ' m/s'], ['Yön', S.wind.dir || '—']];
      const tmp = ((D.site && D.site.outdoor) || []).find(o => o.id === 'temp');
      if (tmp) out.unshift(['Sıcaklık', tmp.val.toFixed(1) + ' °C']);
      return out;
    }
    const f = floorById(s.floorId);
    if (s.kind === 'cabinet') {
      const c = f ? B.findCabinet(f.cfg, s.label) : null;
      if (!c) return [];
      if (c.status === 'lost') return [['Sensör', 'Veri yok']];
      return [['Orta', c.tempMid.toFixed(1) + ' °C'], ['Üst', c.tempTop.toFixed(1) + ' °C'], ['Nem', '%' + c.humidity], ['Güç', c.powerKw.toFixed(1) + ' kW']];
    }
    if (f !== kat1) return [];
    const e = D.findEquipment(s.label);
    if (!e) return [];
    if (e.status === 'lost') return [['Haberleşme', 'Veri yok']];
    const keys = s.kind === 'climate' ? [['Dönüş', 'Dönüş Sıcaklığı'], ['Üfleme', 'Üfleme Sıcaklığı'], ['Fan', 'Fan Hızı']]
      : s.kind === 'ups' ? [['Mod', 'Çalışma Modu'], ['Yük', 'Yük Oranı'], ['Akü', 'Kalan Akü Süresi']]
        : [['Güç', 'Toplam Aktif Güç'], ['L3', 'L3 Akım']];
    return keys.map(k => [k[0], pt(e, k[1])]).filter(x => x[1] != null);
  }

  function renderSel() {
    const s = S.selItem;
    if (!s) { R.sel.innerHTML = ''; return; }
    const vals = selValues(s);
    let links = '';
    if (s.dca) {
      const q = s.kind === 'cabinet' ? 'cabinet=' + encodeURIComponent(s.label) : 'focus=' + encodeURIComponent(s.label);
      links = '<div class="sel-links">' +
        '<a href="2d.html?' + q + '" title="Dijital İkiz (2D)"><i class="pi pi-map" aria-hidden="true"></i>2D</a>' +
        '<a href="3d.html?' + q + '" title="Dijital İkiz (3D)"><i class="pi pi-box" aria-hidden="true"></i>3D</a>' +
        (s.kind === 'cabinet' ? '<a href="cabinet-detail.html?cabinet=' + encodeURIComponent(s.label) + '" title="Kabin Yönetimi"><i class="pi pi-server" aria-hidden="true"></i>Kabin</a>' : '') +
      '</div>';
    }
    R.sel.innerHTML =
      '<div class="sel-card" style="--c:' + SEVERITY_COLOR[s.sev] + '">' +
        '<div class="sel-head">' + shapeI(s.sev) + '<b>' + esc(s.label) + '</b><span class="muted">' + esc(s.kindLabel) + ' · ' + esc(s.floorName) + '</span>' +
          '<button type="button" aria-label="Kapat" data-act="close-sel">×</button></div>' +
        '<div class="sel-meta">' + esc(SEV_LABEL[s.sev]) + ' · ' + s.alarms + ' aktif alarm</div>' +
        (s.topText ? '<div class="sel-alarm">' + esc(s.topText) + '</div>' : '') +
        (vals.length ? '<div class="sel-vals">' + vals.map(v => '<span>' + esc(v[0]) + ' <b>' + esc(v[1]) + '</b></span>').join('') + '</div>' : '') +
        (s.kind === 'ups' ? '<button type="button" class="pms-btn" data-act="pms-sel"><i class="pi pi-sitemap" aria-hidden="true"></i>Tek hatta göster (PMS)</button>' : '') +
        links +
        '<div class="sel-hint">Esc / Binaya dön ile geri</div>' +
      '</div>';
  }

  function renderAlarmPanel() {
    const k = S.kpi.live;
    R.alhead.innerHTML = '<b>Aktif alarmlar</b><a class="al-link" href="alarms.html" title="Aktif Alarmlar sayfası">Tümünü aç <i class="pi pi-external-link" style="font-size:9px"></i></a>' +
      '<span class="muted al-sum">' + k.total + ' canlı</span>';
    R.alfilter.innerHTML =
      '<button type="button" data-act="filter" data-v="all" class="' + (S.alarmFilter === 'all' ? 'active' : '') + '">Tümü</button>' +
      S.floorsView.map(f => '<button type="button" data-act="filter" data-v="' + esc(f.id) + '" class="' + (S.alarmFilter === f.id ? 'active' : '') + '">' + esc(f.name) + '</button>').join('');
    R.alcats.innerHTML =
      '<button type="button" data-act="cat" data-v="" class="' + (S.catSel.size === 0 ? 'active' : '') + '" aria-pressed="' + (S.catSel.size === 0) + '">' +
        '<i class="pi pi-th-large" aria-hidden="true"></i>Tümü<span class="n">' + S.catAllCount + '</span></button>' +
      S.catChips.map(c =>
        '<button type="button" data-act="cat" data-v="' + c.id + '" class="' + [S.catSel.has(c.id) ? 'active' : '', !c.n ? 'zero' : ''].join(' ').trim() + '"' +
          ' aria-pressed="' + S.catSel.has(c.id) + '" title="' + esc(c.label + ': ' + c.n + ' aktif alarm') + '">' +
          '<i class="' + c.icon + '" aria-hidden="true"></i>' + esc(c.label) + '<span class="n">' + c.n + '</span></button>').join('');
    const list = S.alarmsView;
    R.allist.innerHTML = list.length ? list.map(a =>
      '<div class="al-item' + (S.focusedAlarmId === a.id ? ' focused' : '') + (!a.acked ? ' unack' : '') + '" role="button" tabindex="0" data-act="alarm" data-id="' + esc(a.id) + '"' +
        ' style="--c:' + SEVERITY_COLOR[a.sev] + '"' + (a.detail ? ' title="' + esc(a.detail) + '"' : '') + '>' +
        shapeI(a.sev) +
        '<div class="al-main">' +
          '<div class="al-txt">' + esc(a.txt) + '</div>' +
          '<div class="al-meta">' +
            '<span>' + esc(a.where) + '</span><span>' + esc(a.time) + '</span>' +
            (!a.itemKey && a.floorId ? '<span class="muted">kat düzeyi</span>' : '') +
            (a.cat === 'power' ? '<button type="button" class="pms-link" title="Tek hatta göster (PMS)" data-act="pms-alarm" data-id="' + esc(a.id) + '"><i class="pi pi-sitemap" aria-hidden="true"></i>Tek hatta göster (PMS)</button>' : '') +
          '</div>' +
        '</div>' +
        (!a.acked
          ? '<button type="button" class="ack" data-act="ack" data-id="' + esc(a.id) + '"' + (a.acking ? ' disabled' : '') + '>' + (a.acking ? '…' : 'Gördüm') + '</button>'
          : '<span class="acked">görüldü</span>') +
      '</div>').join('') : '<div class="al-empty">Aktif alarm yok</div>';
  }

  function renderBottom() {
    let body;
    if (S.stdTab === 'std') {
      body = '<div class="std-cards">' + S.stdCards.map(c =>
        '<div class="std" title="' + esc(c.tip) + '">' +
          '<div class="std-top"><span class="std-title">' + esc(c.title) + '</span><i class="pi pi-info-circle std-i" title="' + esc(c.tip) + '" aria-label="Ayrıntı ve kaynak"></i></div>' +
          '<div class="std-row">' +
            '<span class="std-val">' + esc(c.value) + (c.unit ? '<small> ' + esc(c.unit) + '</small>' : '') + '</span>' +
            (c.bars && c.bars.length ? '<span class="hist" aria-hidden="true">' + c.bars.map(b => '<span class="bar" style="height:' + b.pct + '%" title="' + esc(b.label + ' °C: ' + b.n) + '"></span>').join('') + '</span>' : '') +
          '</div>' +
          '<div class="std-sub">' + esc(c.sub) + '</div>' +
        '</div>').join('') + '</div>';
    } else {
      body = '<div class="floor-cards">' + S.floorsView.map(f =>
        '<button type="button" class="fc" data-act="floor" data-id="' + esc(f.id) + '" style="--c:' + SEVERITY_COLOR[f.sev] + '" title="' + esc(f.building) + '">' +
          '<div class="fc-top"><b>' + esc(f.name) + '</b></div>' +
          '<div class="fc-sev"><i class="dot"></i>' + esc(SEV_LABEL[f.sev]) + ' · ' + f.live + ' alarm</div>' +
        '</button>').join('') + '</div>';
    }
    R.bottom.innerHTML =
      '<div class="bottom-head">' +
        '<div class="tabs">' +
          '<button type="button" data-act="std-tab" data-v="std" class="' + (S.stdTab === 'std' ? 'active' : '') + '">Standart uyumu</button>' +
          '<button type="button" data-act="std-tab" data-v="floors" class="' + (S.stdTab === 'floors' ? 'active' : '') + '">Katlar</button>' +
        '</div>' + kpisHtml() +
      '</div>' + body;
  }

  function renderPopups() {
    if (S.showSettings) {
      R.pop.innerHTML =
        '<div class="popup settings" role="dialog" aria-label="Görünüm ayarları">' +
          '<div class="pop-head"><b>Görünüm ayarları</b><button type="button" data-act="close-pop">×</button></div>' +
          '<label class="row"><span>Dış cephe opaklığı <b data-r-op>' + S.facadeOpacity + '</b></span>' +
            '<input type="range" min="0" max="100" step="1" value="' + S.facadeOpacity + '" data-in="opacity"></label>' +
          '<label class="row toggle"><input type="checkbox" data-in="exploded"' + (S.exploded ? ' checked' : '') + '><span>Katları ayır</span></label>' +
          '<label class="row toggle"><input type="checkbox" data-in="autorotate"' + (S.autoRotate ? ' checked' : '') + '><span>Otomatik dönüş</span></label>' +
          '<label class="row toggle"><input type="checkbox" data-in="labels"' + (S.showLabels ? ' checked' : '') + '><span>Etiketler</span></label>' +
        '</div>';
    } else if (S.showSources) {
      R.pop.innerHTML =
        '<div class="popup sources" role="dialog" aria-label="Veri kaynakları">' +
          '<div class="pop-head"><b>Veri kaynakları</b><button type="button" data-act="close-pop">×</button></div>' +
          '<table><thead><tr><th>Bileşen</th><th>Tür</th><th>Kaynak</th></tr></thead><tbody>' +
            B.DATA_SOURCES.map(r => '<tr><td>' + esc(r.what) + '</td><td><span class="chip ' + (r.kind === 'Canlı' ? 'live' : 'rep') + '">' + esc(r.kind) + '</span></td><td class="src">' + esc(r.src) + '</td></tr>').join('') +
          '</tbody></table>' +
          '<p class="pop-note">Kat yerleşim kaynağı: ' + S.floorsView.map(f => '<b>' + esc(f.name) + '</b> ' + esc(f.source)).join(', ') + '</p>' +
          '<p class="pop-note">Sunum kopyası: "Canlı" satırlar sunumun ortak mock verisinden (DCIM.data) tohumlu olarak üretilir; ağ bağlantısı yoktur.</p>' +
        '</div>';
    } else {
      R.pop.innerHTML = '';
    }
  }

  // ---------------------------------------------------------------------------
  // Rapor (başlıktaki "PDF Raporu": KPI + 3D bina görünümü + katlar + standart uyumu + aktif alarmlar)
  // ---------------------------------------------------------------------------
  /** Rapor görüntüsü: yuvarlak köşeli kutu yolu (etiket ve rozetler için). */
  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /**
   * 3D görünüm ekrandaki kamera açısıyla: sahne render edilip aynı çağrıda 2D tuvale kopyalanır. Tuval saydam olduğu
   * için altına sahnenin CSS zemini, üstüne ekrandaki HTML etiketleri (bina adı, kat rozeti, alarm etiketi) çizilir.
   */
  function snapshot3d() {
    const canvas = R.canvas;
    if (!scene || S.webglError || !canvas.width || !canvas.height) return null;
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    const css = getComputedStyle(host);
    const sky = ctx.createLinearGradient(0, 0, 0, out.height);
    sky.addColorStop(0, css.getPropertyValue('--bg2').trim() || '#0e1d36');
    sky.addColorStop(0.85, css.getPropertyValue('--sky-hz').trim() || '#090d13');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, out.width, out.height);
    try {
      scene.render();
      ctx.drawImage(canvas, 0, 0);
    } catch (e) {
      console.warn('[BMS rapor] 3D görünüm alınamadı', e);
      return null;
    }
    drawOverlayLabels(ctx, canvas);
    return DCIM.report.captureCanvas(out);
  }

  /** Ekrandaki etiket katmanını (HTML) tuvale çizer: kutu zemini, çerçeve ve metin hesaplanmış stillerden. */
  function drawOverlayLabels(ctx, canvas) {
    const base = canvas.getBoundingClientRect();
    if (!base.width || !base.height) return;
    const sx = canvas.width / base.width, sy = canvas.height / base.height;
    const clear = c => !c || c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c);
    const setColor = (prop, color, fallback) => { ctx[prop] = fallback; ctx[prop] = color; };
    const range = document.createRange();
    const paint = el => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const r = el.getBoundingClientRect();
      const x = (r.left - base.left) * sx, y = (r.top - base.top) * sy, w = r.width * sx, h = r.height * sy;
      const border = parseFloat(cs.borderTopWidth) || 0;
      if (w > 0 && h > 0 && (!clear(cs.backgroundColor) || border)) {
        roundRectPath(ctx, x, y, w, h, Math.min((parseFloat(cs.borderTopLeftRadius) || 0) * sx, w / 2, h / 2));
        if (!clear(cs.backgroundColor)) { setColor('fillStyle', cs.backgroundColor, 'rgba(15,23,42,0.85)'); ctx.fill(); }
        if (border) { ctx.lineWidth = border * sx; setColor('strokeStyle', cs.borderTopColor, 'rgba(148,163,184,0.6)'); ctx.stroke(); }
      }
      el.childNodes.forEach(node => {
        const text = node.nodeType === Node.TEXT_NODE ? (node.textContent || '').trim() : '';
        if (!text) return;
        range.selectNodeContents(node);
        const t = range.getBoundingClientRect();
        if (!t.width || !t.height) return;
        ctx.font = cs.fontWeight + ' ' + ((parseFloat(cs.fontSize) || 11) * sy) + 'px ' + cs.fontFamily;
        setColor('fillStyle', cs.color, '#ffffff');
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText(text, (t.left - base.left) * sx, (t.top - base.top + t.height / 2) * sy);
      });
      Array.from(el.children).forEach(paint);
    };
    root.querySelectorAll('.overlay .b-label, .overlay .f-badge, .overlay .tag3d').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.right < base.left || r.left > base.right || r.bottom < base.top || r.top > base.bottom) return;
      if (getComputedStyle(el).opacity !== '0') paint(el);
    });
  }

  function buildReport() {
    const view = S.isolatedFloorId ? floorName(S.isolatedFloorId) + ' görünümü' : 'Bina görünümü';
    const image = snapshot3d();
    const k = S.kpi.live;
    const tone = s => (s === 'acil' ? 'acil' : s === 'alarm' ? 'alarm' : s === 'uyari' ? 'warning' : s === 'kayip' ? 'lost' : 'normal');
    const catLabel = c => (ALARM_CATS.find(x => x.id === c) || {}).label || '—';
    const filter = [
      S.alarmFilter === 'all' ? 'tüm katlar' : (floorName(S.alarmFilter) || S.alarmFilter),
      S.catSel.size ? Array.from(S.catSel).map(catLabel).join(', ') : 'tüm kategoriler'
    ].join(' · ');
    return {
      title: SITE.title,
      subtitle: SITE.subtitle + ' · ' + view,
      filename: 'BMS_Bina_Operator_Paneli',
      kpis: [
        { label: SEV_LABEL.acil, value: k.acil, tone: k.acil ? 'acil' : 'normal' },
        { label: SEV_LABEL.alarm, value: k.alarm, tone: k.alarm ? 'alarm' : 'normal' },
        { label: SEV_LABEL.uyari, value: k.uyari, tone: k.uyari ? 'warning' : 'normal' },
        { label: SEV_LABEL.kayip, value: k.kayip, tone: k.kayip ? 'lost' : 'normal' },
        { label: 'Görülmemiş', value: k.unack, hint: k.total + ' aktif alarmdan', tone: k.unack ? 'warning' : 'normal' },
        { label: 'PUE', value: fmt(S.pue, 2), tone: 'info' },
        { label: 'BT yükü (kW)', value: fmt(S.itKw, 0) },
        { label: 'Soğutma (kW)', value: fmt(S.coolKw, 0), hint: 'KAT-1: ' + S.kat1Counts.cabinet + ' kabin · ' + S.kat1Counts.climate + ' klima' }
      ],
      images: image ? [{ src: image, caption: '3D Bina Görünümü · ' + view + ' — ekrandaki kamera açısı; renkler ve sayaçlar raporun alındığı andaki canlı değerlerdir.' }] : [],
      sections: [
        {
          title: 'Katlar',
          columns: [{ key: 'name', label: 'Kat' }, { key: 'building', label: 'Bina' }, { key: 'sevLabel', label: 'Durum' }, { key: 'live', label: 'Aktif alarm', align: 'right' }, { key: 'source', label: 'Yerleşim kaynağı' }],
          rows: S.floorsView.map(f => ({ name: f.name, building: f.building, sevLabel: SEV_LABEL[f.sev], live: f.live, source: f.source, tone: tone(f.sev) })),
          toneKey: 'tone'
        },
        {
          title: 'Standart uyumu',
          columns: [{ key: 'title', label: 'Gösterge' }, { key: 'std', label: 'Standart' }, { key: 'value', label: 'Değer', align: 'right' }, { key: 'sub', label: 'Ayrıntı' }],
          rows: S.stdCards.map(c => ({ title: c.title, std: c.std, value: c.unit ? c.value + ' ' + c.unit : c.value, sub: c.sub }))
        },
        {
          title: 'Aktif Alarmlar (' + filter + ')',
          columns: [{ key: 'sevLabel', label: 'Şiddet' }, { key: 'txt', label: 'Alarm' }, { key: 'where', label: 'Konum' }, { key: 'time', label: 'Zaman' }, { key: 'cat', label: 'Kategori' }, { key: 'ack', label: 'Görüldü', align: 'center' }],
          rows: S.alarmsView.map(a => ({ sevLabel: SEV_LABEL[a.sev], txt: a.txt, where: a.where, time: a.time, cat: catLabel(a.cat), ack: a.acked ? 'Evet' : 'Hayır', tone: tone(a.sev) })),
          toneKey: 'tone'
        }
      ],
      notes: ['Sağ paneldeki liste; görülmemişler önce, şiddete ve zamana göre sıralı.', image ? '' : '3D görünüm görüntüsü alınamadı.'].filter(Boolean)
    };
  }

  DCIM.shell.setPageReport({
    scopes: [{ id: 'page', label: 'BMS paneli' }],
    formats: ['pdf'],
    export() { DCIM.report.generate(buildReport(), 'pdf'); }
  });

  // ---------------------------------------------------------------------------
  // Olaylar
  // ---------------------------------------------------------------------------
  host.addEventListener('click', e => {
    const t = e.target.closest('[data-act]');
    if (!t || !host.contains(t)) return;
    const act = t.getAttribute('data-act');
    const id = t.getAttribute('data-id');
    const v = t.getAttribute('data-v');
    const alarmById = x => S.alarmsView.find(a => a.id === x) || allAlarms().find(a => a.id === x);
    switch (act) {
      case 'floor': selectFloor(id); break;
      case 'building': backToBuilding(); break;
      case 'pms': openPms({}); break;
      case 'sources': S.showSources = !S.showSources; S.showSettings = false; renderPopups(); break;
      case 'settings': S.showSettings = !S.showSettings; S.showSources = false; renderPopups(); break;
      case 'close-pop': S.showSettings = false; S.showSources = false; renderPopups(); break;
      case 'filter': setFilter(v); break;
      case 'cat': toggleCat(v || null); break;
      case 'alarm': { const a = alarmById(id); if (a) focusAlarm(a); break; }
      case 'ack': ack(alarmById(id)); break;
      case 'pms-alarm': { const a = alarmById(id); if (a) pmsFromAlarm(a); break; }
      case 'pms-sel': if (S.selItem) pmsFromSel(S.selItem); break;
      case 'close-sel': closeSel(); break;
      case 'close-band': closeBand(); break;
      case 'std-tab': S.stdTab = v === 'floors' ? 'floors' : 'std'; renderBottom(); break;
      default: break;
    }
  });

  root.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const t = e.target.closest('[data-act="alarm"]');
    if (t && e.target === t) { const a = S.alarmsView.find(x => x.id === t.getAttribute('data-id')); if (a) focusAlarm(a); }
  });

  root.addEventListener('input', e => {
    if (e.target.getAttribute('data-in') !== 'opacity') return;
    S.facadeOpacity = Number(e.target.value) || 0;
    const lbl = root.querySelector('[data-r-op]');
    if (lbl) lbl.textContent = String(S.facadeOpacity);
    applyFacade();
  });

  root.addEventListener('change', e => {
    const k = e.target.getAttribute('data-in');
    if (k === 'exploded') toggleExploded();
    else if (k === 'autorotate') { S.autoRotate = !S.autoRotate; lastInteract = 0; }
    else if (k === 'labels') { S.showLabels = !S.showLabels; rebuildTags(); }
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (S.showSettings || S.showSources) { S.showSettings = false; S.showSources = false; renderPopups(); return; }
    backToBuilding();
  });

  document.addEventListener('dcim:theme', () => {
    S.isLight = !document.documentElement.classList.contains('dark');
    applyTheme();
  });

  // ---------------------------------------------------------------------------
  // "Canlı" veri (sunum: tohumlu mock)
  // ---------------------------------------------------------------------------
  function refreshEnergy() {
    const e = B.energy(energyTick);
    S.pue = e.pue; S.itKw = e.itKw; S.coolKw = e.coolKw;
  }
  function refreshEnv(tickNo) {
    envByFloor = B.envByFloor(floors.map(f => f.cfg), tickNo);
    envTemps = [].concat.apply([], envByFloor.map(e => e.t));
    envHums = [].concat.apply([], envByFloor.map(e => e.h));
    S.lastUpdate = hhmmss(Date.now());
  }
  /** Meteoroloji rüzgâr hızı (m/s) ve yönü, yalnız canlı; ölçüm geçersizse "—", çizgiler gizli. */
  function refreshWind(tickNo) {
    const w = B.wind(tickNo);
    const dirI = B.WIND_DIRS.indexOf(w.dir);
    S.wind = { on: true, speed: w.speed, dir: dirI >= 0 ? w.dir : '', to: dirI >= 0 ? (dirI * 45 + 180) % 360 : null };
  }

  // ---------------------------------------------------------------------------
  // Başlatma
  // ---------------------------------------------------------------------------
  floors.forEach(f => B.cabinetsOf(f.cfg, f.layout));
  try {
    initScene();
  } catch (err) {
    console.warn('[BMS] 3D görünüm başlatılamadı (WebGL):', err && err.message ? err.message : err);
    S.webglError = 'Bu tarayıcıda 3D görünüm başlatılamadı (WebGL).';
    try { if (engine) engine.dispose(); } catch (e2) { /* yok say */ }
    engine = null; scene = null; camera = null;
    R.canvas.style.display = 'none';
    R.overlay.style.display = 'none';
    R.webgl.innerHTML = '<div class="webgl-error"><div><b>' + esc(S.webglError) + '</b>Kat seçici, alarm paneli ve kartlar çalışmaya devam eder. Donanım hızlandırmayı açıp sayfayı yenileyin.</div></div>';
  }

  let envTick = 0, windTick = 0;
  refreshEnergy();
  refreshEnv(envTick);
  refreshWind(windTick);
  relinkRealAlarms();
  startFloorAlarms();
  onAlarmsChanged();
  renderBand();

  setInterval(() => { energyTick++; refreshEnergy(); refreshStd(); if (S.stdTab === 'std') renderBottom(); }, (D.energy && D.energy.TICK_SEC ? D.energy.TICK_SEC : 3) * 1000);
  setInterval(() => { envTick++; refreshEnv(envTick); refreshStd(); if (S.stdTab === 'std') renderBottom(); }, 5000);
  setInterval(() => { windTick++; refreshWind(windTick); renderWind(); if (S.selItem && S.selItem.meteo) renderSel(); }, 30000);
  // Alarm yükü (10 dk) penceresi zamanla kayar
  setInterval(() => { refreshStd(); if (S.stdTab === 'std') renderBottom(); }, 15000);

  // URL (PMS'ten geliş / derin bağlantı): sahne ilk kareyi çizdikten sonra
  setTimeout(tryNav, 350);
})();
