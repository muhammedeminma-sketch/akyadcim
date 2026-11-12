/* ==========================================================================
   DCIM Sunum — BMS · Bina Yönetimi mock verisi (DCIM.data.bms)
   Kaynak: new-ui/pages/showcase/bms-showcase (SHOWCASE_SITE, DATA_SOURCES, ALARM_CATS / ALARM_CAT_GROUPS,
   WIND_DIRS) ve bms-showcase.layout.ts (parseSchMap, showDoor).
   Kurgusal tesis — tüm katlar "canlı" (sunumun ortak mock verisi):
   - DCA Ana Bina KAT-1 / KAT-2 / KAT-3: window.DCIM_FLOOR_LAYOUTS (js/layout-data.js); ekipman, iç duvar ve kapılar
     katın kendi yerleşiminden (bgPath: duvar çizgileri + kapı kanadı → döner kapı sembolü). KAT-1 alarmları
     DCIM.data.activeAlarms (sunum senaryosu); KAT-2/KAT-3 kabin durum ve sıcaklıkları DCIM.data.getLockFloor.
   - DCB Ek Bina (tek kat): bu dosyada üretilen küçük yerleşim (UPS/elektrik odası, salon, 40 kabin).
   - KAT-2, KAT-3, DCB alarmları tohumlu üretilir (kat başına 2-3 kayıt, dakikada bir hafif değişir).
   - Çatı meteoroloji istasyonu (dev_type='weather'): rüzgâr hızı/yönü D.site.outdoor tabanından, 30 sn'de bir.
   Bağımlılık: js/layout-data.js, js/mock-data.js
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  const LAYOUTS = window.DCIM_FLOOR_LAYOUTS || (window.DCIM_LAYOUT ? [window.DCIM_LAYOUT] : []);

  /** SchemaItem piksel/hücre oranı (orijinal CELL_PX). Kat yerleşimleri 40 px'lik ızgaradadır. */
  const CELL_PX = 40;
  const rngOf = key => D.rng(D.hash(String(key)));

  // ---------------------------------------------------------------------------
  // Saha yapılandırması (SHOWCASE_SITE karşılığı; kurgusal bina)
  // ---------------------------------------------------------------------------
  const SITE = {
    title: 'BMS · Bina Operatör Paneli',
    subtitle: 'Veri Merkezi · 3D bina ikizi',
    buildings: [
      {
        id: 'DCA', name: 'DCA Ana Bina',
        floors: [
          { id: 'KAT-1', name: 'KAT-1', level: 0, layout: 0, digit: 1, lockFloor: 'T00', live: true },
          { id: 'KAT-2', name: 'KAT-2', level: 1, layout: 1, digit: 2, lockFloor: 'T02', live: true },
          { id: 'KAT-3', name: 'KAT-3', level: 2, layout: 2, digit: 3, lockFloor: 'T03', live: true }
        ]
      },
      {
        id: 'DCB', name: 'DCB Ek Bina',
        floors: [
          { id: 'DCB', name: 'DCB', level: 0, layout: 'dcb', digit: 4, lockFloor: '', live: true }
        ]
      }
    ]
  };

  // ---------------------------------------------------------------------------
  // Alarm kategorileri (sağ panel çipleri). "Yangın & Güvenlik" çipi kaldırıldı (orijinal 2026-10-21):
  // alarmlar kendi grubunun çipinde görünür.
  // ---------------------------------------------------------------------------
  const ALARM_CATS = [
    { id: 'hvac', label: 'HVAC & Soğutma', icon: 'pi pi-asterisk' },
    { id: 'power', label: 'Güç & Enerji (PMS)', icon: 'pi pi-bolt' },
    { id: 'env', label: 'Çevre & Ortam', icon: 'pi pi-cloud' },
    { id: 'it', label: 'BT / Kabinler', icon: 'pi pi-server' }
  ];
  /** Grup kodu → vitrin kategorisi; eşleşmeyen grup yalnız "Tümü"de görünür. */
  const ALARM_CAT_GROUPS = { cooling: 'hvac', power: 'power', environment: 'env', whitespace: 'it' };

  /** Sunum alarm grupları (mock-data.js grp adı) → AlarmGroupService kodu (ADR-0009 legacy eşlemesi). */
  const GROUP_CODE = { 'Soğutma': 'cooling', 'Enerji Grubu': 'power', 'Beyaz Alan': 'whitespace', 'Çevre': 'environment', 'Diğer': '' };

  /** L_WIND_DIR sırası: 1 KUZEY … 8 KUZEYBATI. Değer rüzgârın estiği yöndür (meteoroloji). */
  const WIND_DIRS = ['Kuzey', 'Kuzeydoğu', 'Doğu', 'Güneydoğu', 'Güney', 'Güneybatı', 'Batı', 'Kuzeybatı'];

  // ---------------------------------------------------------------------------
  // Veri kaynakları penceresi (orijinal DATA_SOURCES: ürünün gerçek veri yolu anlatılır)
  // ---------------------------------------------------------------------------
  const DATA_SOURCES = [
    { what: 'KAT-1 yerleşimi (kabin, klima, UPS, pano, duvar, kapı)', kind: 'Canlı', src: 'SchemaService / SCH (katın kaydı: db_ASM SITE_Floors) — 2D/3D ikizle aynı yol' },
    { what: 'KAT-1 ekipman durum renkleri', kind: 'Canlı', src: 'SchemaService periyodik XDB sorgusu (buildFloorPollingConfig, durum: statusText/fill)' },
    { what: 'Aktif alarmlar ve sayaçlar (tüm katlar)', kind: 'Canlı', src: "XDB doc('CMA/S00') CMA_List, 10 sn; kat: alarm @flr, yoksa dokümanı" },
    { what: 'Alarm → kabin/klima eşleşmesi', kind: 'Canlı', src: 'io @cab özniteliği (kabin); klima: nokta kimliği ↔ cihaz kimliği (_DV atılarak)' },
    { what: 'Alarm kategorileri', kind: 'Temsili', src: 'alm_grp (grup kodu AlarmGroupService, eşleme ALARM_CAT_GROUPS)' },
    { what: 'PMS ↔ BMS geçişi', kind: 'Canlı', src: 'URL parametreleri (BMS: floor, dev, cab, alarm, from; PMS: alarm, dev, from); konum eşlemesi SCH devId/cab' },
    { what: '"Gördüm" (canlı alarm)', kind: 'Canlı', src: 'CMA_List öğesine ack yazımı — Alarmlar sayfasıyla aynı yöntem' },
    { what: 'PUE', kind: 'Canlı', src: 'das.fetchInstantPUE(facDocs) / io_role=pue (tüm katlar, saha düzeyi)' },
    { what: 'BT ve soğutma gücü', kind: 'Canlı', src: "io_role=pow_tot (dev @load='it' / 'cooling'), 30 sn" },
    { what: 'Kabin sıcaklık / nem dağılımı (tüm açık katlar)', kind: 'Canlı', src: 'io_role=cabin_temp / cabin_hum (her açık katın tesis dokümanı, SITE_Floors), 30 sn; kat ortalamaları kart ipucunda' },
    { what: 'Haberleşme kaybı (tüm katlar)', kind: 'Canlı', src: 'Yoklanan katta SCH durumu (Veri yok); diğer katlarda ekipmana eşleşen "Veri yok" alarmı (CMA_List)' },
    { what: 'Rüzgâr (sağ üst pusula, çatıdaki rüzgâr çizgileri, anemometre)', kind: 'Canlı', src: "Meteoroloji cihazı (dev_type='weather') io_role=wind_speed / wind_dir, 30 sn; yön esilen yöndür. Ölçüm geçersizse \"—\", çizgiler gizli. Sahnede kuzey: giriş cephesinin tersi (temsili)" },
    { what: 'KAT-2, KAT-3, DCB yerleşimi', kind: 'Canlı', src: 'SCH sch_map (SQL; ekipman, duvar, kapı); kayıt yoksa kat boş gösterilir (kaynak bu pencerenin altında yazar). Ekipman durumu yoklanmaz' },
    { what: 'Kat ölçeği', kind: 'Canlı', src: 'SCH çizimi kabin genişliğine göre eşitlenir (kabin kısa kenarı = 600 mm döşeme karosu); 2D şema değişmez' },
    { what: 'Bina kabuğu (dış duvar, cephe camı, çatı, giriş, DCB bağlantısı)', kind: 'Temsili', src: 'Kat sınırları SCH ölçülerinden; mimari çizim değildir' }
  ];

  // ---------------------------------------------------------------------------
  // Yerleşimler (bms-showcase.layout.ts)
  // ---------------------------------------------------------------------------
  /** Kabin kodu eşleştirmesi için normal biçim: büyük harf, '_' sonrası ekler ve baştaki 'K' (rakamdan önce) atılır. */
  function normCab(v) {
    let s = String(v == null ? '' : v).trim().toUpperCase();
    if (!s) return '';
    const us = s.indexOf('_');
    if (us > 0) s = s.substring(0, us);
    if (/^K\d/.test(s)) s = s.substring(1);
    return s;
  }

  /** showDoor karşılığı: açıklık (x1,y1)→(x2,y2), kanat tarafı swing (1 sol / -1 sağ), döner kanat(lar). */
  function showDoor(x1, y1, x2, y2, style, swing, leaves) {
    return { x1, y1, x2, y2, style: style || 'swing', swing: swing === -1 ? -1 : 1, leaves: leaves || [{ at: 'start', ratio: 1 }] };
  }

  /**
   * Kat yerleşiminin bgPath'i (M/L duvar çizgileri; js/layout-data.js) → iç duvarlar + kapılar (hücre birimi).
   * Kapı, üreticide boşluğun başına çizilen dik "kanat" çizgisidir (uzunluk = 0,8 × açıklık): kanadın bir ucu bir
   * duvarın ucuna değer, öbür ucu boştadır ve duvar doğrultusunda açıklık kadar ilerde bir sonraki duvar başlar.
   */
  function wallsAndDoors(bgPath) {
    const segs = [];
    const tok = String(bgPath || '').match(/[MLZ]|-?\d*\.?\d+/g) || [];
    let cmd = 'M', cx = 0, cy = 0, sx = 0, sy = 0, poly = 0;
    for (let i = 0; i < tok.length;) {
      const t = tok[i];
      if (t === 'M' || t === 'L' || t === 'Z') {
        i++;
        if (t === 'Z') { segs.push({ x1: cx, y1: cy, x2: sx, y2: sy, poly }); cx = sx; cy = sy; }
        else cmd = t;
        continue;
      }
      const x = +tok[i], y = +tok[i + 1];
      i += 2;
      if (cmd === 'M') { cx = sx = x; cy = sy = y; poly++; cmd = 'L'; }
      else { segs.push({ x1: cx, y1: cy, x2: x, y2: y, poly }); cx = x; cy = y; }
    }
    const same = (ax, ay, bx, by) => Math.abs(ax - bx) < 1.5 && Math.abs(ay - by) < 1.5;
    const len = s => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    const ends = s => [[s.x1, s.y1], [s.x2, s.y2]];
    const touches = (px, py, self) => segs.filter(o => o !== self && ends(o).some(e => same(e[0], e[1], px, py)));
    const doors = [], leafSet = new Set();
    segs.forEach(s => {
      const L = len(s);
      if (L < 20 || L > 110) return;
      // Kapalı çokgen (kolon) parçası kapı değildir
      if (segs.filter(o => o.poly === s.poly).length > 1) return;
      ends(s).forEach((h, k) => {
        if (leafSet.has(s)) return;
        const free = ends(s)[1 - k];
        if (touches(free[0], free[1], s).length) return;
        const lx = (free[0] - h[0]) / L, ly = (free[1] - h[1]) / L;
        touches(h[0], h[1], s).forEach(w => {
          if (leafSet.has(s)) return;
          const far = same(w.x1, w.y1, h[0], h[1]) ? [w.x2, w.y2] : [w.x1, w.y1];
          const wl = Math.hypot(h[0] - far[0], h[1] - far[1]);
          if (!wl) return;
          const ux = (h[0] - far[0]) / wl, uy = (h[1] - far[1]) / wl;
          if (Math.abs(ux * lx + uy * ly) > 0.05) return; // kanat duvara dik olmalı
          const wOpen = L / 0.8;
          const ex = h[0] + ux * wOpen, ey = h[1] + uy * wOpen;
          const hit = segs.some(o => o !== s && o !== w && ends(o).some(e => same(e[0], e[1], ex, ey)));
          if (!hit) return;
          leafSet.add(s);
          const swing = (-uy * lx + ux * ly) >= 0 ? 1 : -1;
          doors.push(showDoor(h[0] / CELL_PX, h[1] / CELL_PX, ex / CELL_PX, ey / CELL_PX, 'swing', swing));
        });
      });
    });
    const walls = segs.filter(s => !leafSet.has(s) && len(s) > 1)
      .map(s => ({ x1: s.x1 / CELL_PX, y1: s.y1 / CELL_PX, x2: s.x2 / CELL_PX, y2: s.y2 / CELL_PX }));
    return { walls, doors };
  }

  const kindOf = t => (t === 'cabinet' || t === 'cabinet-bcm' ? 'cabinet' : t === 'climate' ? 'climate' : t === 'climate-panel' ? 'panel' : t === 'ups' ? 'ups' : null);

  /** Kat yerleşimi (SCH, px) → sahne modeli (hücre). Orijinaldeki parseSchMap / layoutFrom karşılığı. */
  function floorLayout(L) {
    if (!L) return { items: [], walls: [], doors: [], bounds: { x0: 0, y0: 0, x1: 45, y1: 30 }, source: 'none' };
    const items = [];
    L.items.forEach(it => {
      const kind = kindOf(it.type);
      if (!kind) return;
      const w = Math.max(0.3, (it.w || CELL_PX) / CELL_PX), d = Math.max(0.3, (it.h || CELL_PX) / CELL_PX);
      items.push({ kind, key: String(it.id), label: String(it.label || ''), devId: String(it.devId || ''), cx: it.x / CELL_PX + w / 2, cy: it.y / CELL_PX + d / 2, w, d, rot: Number(it.rotation) || 0 });
    });
    const wd = wallsAndDoors(L.bgPath);
    return { items, walls: wd.walls, doors: wd.doors, bounds: boundsOf(items, wd.walls), source: 'sql' };
  }

  /** Sınır: duvarlardan (yeterliyse) ve öğelerden; 1 hücre pay. */
  function boundsOf(items, walls) {
    const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    const grow = (x, y) => { b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y); };
    if (walls.length >= 3) walls.forEach(w => { grow(w.x1, w.y1); grow(w.x2, w.y2); });
    items.forEach(i => { grow(i.cx - i.w / 2, i.cy - i.d / 2); grow(i.cx + i.w / 2, i.cy + i.d / 2); });
    return { x0: b.x0 - 1, y0: b.y0 - 1, x1: b.x1 + 1, y1: b.y1 + 1 };
  }

  /**
   * DCB ek bina (tek kat, kurgusal): batıda UPS/elektrik odası (UPS C1/C2, D1/D2, iki klima panosu), salonda
   * kuzey duvarı boyunca 6 klima ve sıcak/soğuk koridorlu 4 sıra × 10 kabin (4GA01…4GD10). Hücre birimi.
   */
  function dcbLayout() {
    const items = [];
    const W = 30, H = 22, PX = 7;
    const walls = [
      { x1: 0, y1: 0, x2: W, y2: 0 }, { x1: W, y1: 0, x2: W, y2: H },
      { x1: 0, y1: H, x2: 13, y2: H }, { x1: 15, y1: H, x2: W, y2: H },
      { x1: 0, y1: 0, x2: 0, y2: H },
      // UPS/elektrik odası bölmesi (iki kapı boşluğu)
      { x1: PX, y1: 0, x2: PX, y2: 8 }, { x1: PX, y1: 9.8, x2: PX, y2: 15 }, { x1: PX, y1: 17.4, x2: PX, y2: H }
    ];
    const doors = [
      showDoor(13, H, 15, H, 'swing', -1, [{ at: 'start', ratio: 0.5 }, { at: 'end', ratio: 0.5 }]),
      showDoor(PX, 8, PX, 9.8, 'swing', 1),
      showDoor(PX, 15, PX, 17.4, 'sliding', 1)
    ];
    [['UPS C1', 'DCB_SAL1_C1_UPS', 2.2, 2.6], ['UPS C2', 'DCB_SAL1_C2_UPS', 4.8, 2.6], ['UPS D1', 'DCB_SAL1_D1_UPS', 2.2, 5.6], ['UPS D2', 'DCB_SAL1_D2_UPS', 4.8, 5.6]]
      .forEach((u, i) => items.push({ kind: 'ups', key: 'dcb_ups_' + i, label: u[0], devId: u[1], cx: u[2], cy: u[3], w: 1.9, d: 1.6, rot: 0 }));
    [['C KLİMA PANOSU', 'DCB_SAL1_C_KLM_PANO', 2.2, 19.6], ['D KLİMA PANOSU', 'DCB_SAL1_D_KLM_PANO', 4.8, 19.6]]
      .forEach((p, i) => items.push({ kind: 'panel', key: 'dcb_panel_' + i, label: p[0], devId: p[1], cx: p[2], cy: p[3], w: 1.4, d: 0.8, rot: 0 }));
    for (let i = 0; i < 6; i++) {
      const no = 401 + i;
      items.push({ kind: 'climate', key: 'dcb_klm_' + no, label: 'KLIMA ' + no, devId: 'DCB_SAL1_KLM' + no + '_DV', cx: PX + 3 + i * 3.7, cy: 1.1, w: 2.4, d: 1.3, rot: 0 });
    }
    const rows = [{ l: 'GA', cy: 5.6, f: 'S' }, { l: 'GB', cy: 9.2, f: 'N' }, { l: 'GC', cy: 13.6, f: 'S' }, { l: 'GD', cy: 17.2, f: 'N' }];
    rows.forEach(r => {
      for (let i = 0; i < 10; i++) {
        const code = '4' + r.l + String(i + 1).padStart(2, '0');
        items.push({ kind: 'cabinet', key: 'dcb_cab_' + code, label: code, devId: code, cx: PX + 3.4 + i * 1.2 + (i >= 5 ? 1.2 : 0), cy: r.cy, w: 1.1, d: 1.75, rot: 0 });
      }
    });
    return { items, walls, doors, bounds: boundsOf(items, walls), source: 'sql' };
  }

  function layoutFor(fc) {
    return fc.layout === 'dcb' ? dcbLayout() : floorLayout(LAYOUTS[fc.layout] || null);
  }

  // ---------------------------------------------------------------------------
  // Kat verisi: kabinler (durum, sıcaklık, nem) ve ekipman durumu
  // ---------------------------------------------------------------------------
  const cabCache = {};
  /** Katın kabin kayıtları: KAT-1 DCIM.data.cabinets; KAT-2/3 getLockFloor; DCB tohumlu. */
  function cabinetsOf(fc, layout) {
    if (cabCache[fc.id]) return cabCache[fc.id];
    let list = [];
    if (fc.digit === 1) list = D.cabinets || [];
    else if (fc.lockFloor && D.getLockFloor) list = D.getLockFloor(fc.lockFloor).map(c => c.cabinet);
    else {
      list = layout.items.filter(i => i.kind === 'cabinet').map(i => {
        const r = rngOf('dcb-cab-' + i.label);
        const mid = Math.round((21.4 + r() * 3.6) * 10) / 10;
        return { id: i.key, code: i.label, status: 'normal', tempMid: mid, tempTop: Math.round((mid + 0.6 + r() * 1.4) * 10) / 10, tempLow: Math.round((mid - 0.8 - r() * 1.5) * 10) / 10, humidity: Math.round(39 + r() * 12), powerKw: Math.round((2.2 + r() * 3.8) * 10) / 10 };
      });
    }
    cabCache[fc.id] = list;
    return list;
  }

  /** Katın SCH durum renkleri (alarm değil): kabin/ekipman durumu → önem. Anahtar: yerleşim öğe kimliği. */
  function floorStatus(fc, layout) {
    const map = new Map();
    const sev = s => (s === 'alarm' ? 'alarm' : s === 'warning' ? 'uyari' : s === 'lost' ? 'kayip' : 'normal');
    const byCode = new Map(layout.items.filter(i => i.kind === 'cabinet').map(i => [normCab(i.label), i.key]));
    cabinetsOf(fc, layout).forEach(c => {
      const s = sev(c.status);
      const key = byCode.get(normCab(c.code));
      if (s !== 'normal' && key) map.set(key, s);
    });
    if (fc.digit === 1) {
      (D.climates || []).concat(D.ups || [], D.panels || []).forEach(x => {
        const s = sev(x.status);
        if (s !== 'normal') map.set(String(x.id), s);
      });
    }
    return map;
  }

  /** Bir katın kabin kaydı (seçim kartı ölçümleri için). */
  function findCabinet(fc, code) {
    const n = normCab(code);
    return (cabCache[fc.id] || []).find(c => normCab(c.code) === n) || null;
  }

  /**
   * Kabin sıcaklık / nem noktaları kat kat (her kabinde üst-orta-alt sıcaklık + nem; haberleşmesi kopuk kabin hariç).
   * tick ile ±0,15 °C tohumlu gürültü eklenir (canlı görünüm). Dönüş: [{ id, name, t:[], h:[] }]
   */
  function envByFloor(floorCfgs, tick) {
    const jit = (key, amp) => (rngOf(key + '#' + (tick || 0))() - 0.5) * 2 * amp;
    return floorCfgs.map(fc => {
      const t = [], h = [];
      (cabCache[fc.id] || []).forEach(c => {
        if (c.status === 'lost') return;
        [['T', c.tempTop], ['M', c.tempMid], ['L', c.tempLow]].forEach(p => {
          if (Number.isFinite(p[1])) t.push(Math.round((p[1] + jit(c.code + p[0], 0.15)) * 10) / 10);
        });
        if (Number.isFinite(c.humidity)) h.push(c.humidity + jit(c.code + 'H', 0.6));
      });
      return { id: fc.id, name: fc.name, t, h };
    });
  }

  // ---------------------------------------------------------------------------
  // Alarmlar
  // ---------------------------------------------------------------------------
  /**
   * KAT-1 aktif alarmları (DCIM.data.activeAlarms; Alarmlar sayfasıyla aynı kayıtlar).
   * Önem (alarm-severity.util): level lost → Veri yok, warning → Uyarı, severity critical → Acil, diğer → Alarm.
   */
  function kat1Alarms() {
    return (D.activeAlarms || []).map(a => ({
      alarmId: a.id,
      rid: a.rid,
      sev: a.level === 'lost' ? 'kayip' : a.level === 'warning' ? 'uyari' : a.severity === 'critical' ? 'acil' : a.level === 'alarm' ? 'alarm' : 'normal',
      desc: a.desc,
      txt: a.txt,
      grp: GROUP_CODE[a.grp] != null ? GROUP_CODE[a.grp] : String(a.grp || ''),
      deviceType: a.deviceType,
      target: a.target || '',
      location: a.location,
      ts: a.tim instanceof Date ? a.tim.getTime() : new Date(a.tim).getTime(),
      acked: !!a.ack
    }));
  }

  /** Diğer katların alarm şablonları (kat başına tohumlu seçilir; grup kodu → kategori). */
  const FLOOR_ALARM_TEXTS = [
    { kind: 'cabinet', txt: 'Kabin sıcaklığı yüksek', sev: 'alarm', grp: 'cooling', io: 'TEMP_TOP' },
    { kind: 'cabinet', txt: 'Kabin sıcaklığı yüksek', sev: 'uyari', grp: 'cooling', io: 'TEMP_MID' },
    { kind: 'climate', txt: 'Klima dönüş sıcaklığı yüksek', sev: 'alarm', grp: 'cooling', io: 'RET_TEMP' },
    { kind: 'climate', txt: 'Haberleşme kaybı', sev: 'kayip', grp: 'cooling', io: 'SNS' },
    { kind: 'ups', txt: 'UPS çıkış yükü yüksek', sev: 'uyari', grp: 'power', io: 'LOAD' },
    { kind: 'ups', txt: 'UPS akü sıcaklığı yüksek', sev: 'uyari', grp: 'power', io: 'BTEMP' },
    { kind: 'climate', txt: 'Ortam nemi yüksek', sev: 'uyari', grp: 'environment', io: 'HUM' },
    { kind: 'cabinet', txt: 'Kabin kapısı açık', sev: 'uyari', grp: 'whitespace', io: 'FDOOR' },
    { kind: 'cabinet', txt: 'PDU faz yükü yüksek', sev: 'uyari', grp: 'whitespace', io: 'PDU_A_LOAD' },
    { kind: 'cabinet', txt: 'PDU sigorta akımı yüksek', sev: 'alarm', grp: 'whitespace', io: 'OCP_CURR' },
    { kind: 'cabinet', txt: 'Haberleşme kaybı', sev: 'kayip', grp: 'whitespace', io: 'SNS' }
  ];
  /** Açılıştaki alarmlar (her açılışta aynı): şablon sırası + öğe sırası (tür içinde) + yaş. */
  const FLOOR_ALARMS_INITIAL = {
    'KAT-2': [{ tpl: 0, idx: 57, ageMin: 3 }, { tpl: 6, idx: 4, ageMin: 11 }, { tpl: 8, idx: 33, ageMin: 26, acked: true }],
    'KAT-3': [{ tpl: 2, idx: 3, ageMin: 6 }, { tpl: 4, idx: 1, ageMin: 18 }],
    'DCB': [{ tpl: 4, idx: 2, ageMin: 9 }, { tpl: 7, idx: 23, ageMin: 2 }]
  };
  const FLOOR_ALARM_SEED = 20261111;

  /** Alarm kaynağı (rid) — kabin: K<kabin>_<io>; diğer: cihaz kimliği (_DV atılmış)_<io>. */
  function alarmRid(item, tpl) {
    if (item.kind === 'cabinet') return 'K' + item.label + '_' + tpl.io;
    return String(item.devId || item.label).toUpperCase().replace(/\s+/g, '_').replace(/_DV$/, '') + '_' + tpl.io;
  }

  // ---------------------------------------------------------------------------
  // Enerji ve meteoroloji
  // ---------------------------------------------------------------------------
  /** Enerji KPI'ları (PMS ile aynı kaynak: DCIM.data.energy.overview, 3 sn tik). */
  function energy(tick) {
    try {
      const o = D.energy && D.energy.overview ? D.energy.overview(tick || 0) : null;
      if (o) return { pue: o.pue, itKw: o.itKw, coolKw: o.coolKw };
    } catch (e) { /* yok say */ }
    return { pue: (D.site && D.site.pue) || 1.42, itKw: 606, coolKw: 241 };
  }

  /** Çatı meteoroloji istasyonu: cihaz/noktalar (PMS çipiyle aynı kimlik, js/mock/pms.data.js). */
  const METEO = {
    devId: 'DCA_CATI_METEO_DV', label: 'Meteoroloji İstasyonu', doc: 'CMR/T00',
    ioIds: ['DCA_CATI_METEO_TEMP', 'DCA_CATI_METEO_WSPD', 'DCA_CATI_METEO_WDIR']
  };
  /** Rüzgâr (30 sn tik): hız m/s (D.site.outdoor km/s tabanı ± tohumlu esinti), yön L_WIND_DIR metni. */
  function wind(tick) {
    const out = (D.site && D.site.outdoor) || [];
    const sp = out.find(o => o.id === 'wind');
    const dr = out.find(o => o.id === 'windDir');
    const r = rngOf('bms-wind#' + (tick || 0));
    const base = sp && Number.isFinite(sp.val) ? sp.val / 3.6 : null;
    const speed = base == null ? null : Math.max(0, Math.round((base + (r() - 0.5) * 0.8) * 10) / 10);
    const abbr = { K: 0, KD: 1, D: 2, GD: 3, G: 4, GB: 5, B: 6, KB: 7 };
    let idx = dr && abbr[String(dr.val).toUpperCase()] != null ? abbr[String(dr.val).toUpperCase()] : -1;
    if (idx >= 0 && r() < 0.18) idx = (idx + (r() < 0.5 ? 7 : 1)) % 8; // ara sıra komşu yöne döner
    return { speed, dir: idx >= 0 ? WIND_DIRS[idx] : '' };
  }

  D.bms = {
    CELL_PX,
    SITE,
    ALARM_CATS,
    ALARM_CAT_GROUPS,
    WIND_DIRS,
    DATA_SOURCES,
    FLOOR_ALARM_TEXTS,
    FLOOR_ALARMS_INITIAL,
    FLOOR_ALARM_SEED,
    METEO,
    normCab,
    layoutFor,
    wallsAndDoors,
    cabinetsOf,
    floorStatus,
    findCabinet,
    envByFloor,
    kat1Alarms,
    alarmRid,
    energy,
    wind
  };
})();
