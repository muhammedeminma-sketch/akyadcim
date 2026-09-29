/* ==========================================================================
   DCIM Sunum — Ortak Mock Veri Havuzu
   DASService / MQTT / XDB çağrılarının yerine geçen, tohumlu (deterministik)
   sektörel DCIM verisi. Her yenilemede aynı senaryo üretilir.
   Bağımlılık (opsiyonel): js/layout-data.js  → window.DCIM_LAYOUT
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const LAYOUT = window.DCIM_LAYOUT || null;

  // ---------------------------------------------------------------------------
  // Tohumlu rastgele sayı üreticisi (mulberry32)
  // ---------------------------------------------------------------------------
  function createRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  const between = (rnd, min, max) => min + (max - min) * rnd();
  const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length) % arr.length];
  const round1 = n => Math.round(n * 10) / 10;

  const NOW = new Date();
  const minutesAgo = m => new Date(NOW.getTime() - m * 60000);

  // ---------------------------------------------------------------------------
  // Saha / Lokasyon
  // ---------------------------------------------------------------------------
  const SITE = {
    company: 'Türk Telekom',
    city: 'Ankara',
    dc: 'Veri Merkezi',
    floor: '1. Kat',
    hall: 'Salon 1',
    title: (LAYOUT && LAYOUT.title) || '1. Kat 1. Salon Sistem Odası',
    badge: 'Veri Merkezi / Salon 1',
    outdoor: [
      { id: 'temp', desc: 'Sıcaklık', val: 18.4, unit: '°C' },
      { id: 'hum', desc: 'Nem', val: 46, unit: '%' },
      { id: 'press', desc: 'Basınç', val: 1014, unit: 'hPa' },
      { id: 'wind', desc: 'Rüzgar Hızı', val: 11.2, unit: 'km/s' },
      { id: 'windDir', desc: 'Rüzgar Yönü', val: 'KB', unit: '' },
      { id: 'rain', desc: 'Yağış Miktarı', val: 0, unit: 'mm' }
    ],
    pue: 1.42,
    cue: 0.38,
    tickets: { newTickets: 2, newMessages: 1 }
  };

  // ---------------------------------------------------------------------------
  // Senaryo: sunum sırasında anlatılacak olaylar (tüm sayfalarda tutarlı)
  // ---------------------------------------------------------------------------
  const CABINET_SCENARIO = {
    '1BJ53': { status: 'alarm', tempMid: 32.4, tempTop: 34.1, tempLow: 29.8, note: 'Yüksek sıcaklık' },
    '1BC37': { status: 'alarm', tempMid: 31.2, tempTop: 33.0, tempLow: 28.4, note: 'Kritik sıcaklık' },
    '1AV42': { status: 'alarm', pduFault: true, note: 'PDU-B faz kaybı' },
    '1BQ55': { status: 'warning', tempMid: 27.9, tempTop: 28.8, tempLow: 25.6, note: 'Sıcaklık uyarısı' },
    '1CB52': { status: 'warning', powerKw: 7.9, note: 'Yüksek akım' },
    '1BU54': { status: 'warning', humidity: 62, note: 'Yüksek nem' },
    '1BX50': { status: 'warning', tempMid: 17.2, tempTop: 18.0, tempLow: 16.5, note: 'Düşük sıcaklık' },
    '1CE56': { status: 'warning', tempMid: 28.3, tempTop: 29.6, tempLow: 26.1, note: 'Sıcaklık uyarısı' },
    '1CE51': { status: 'lost', note: 'Sensör haberleşme kaybı' },
    '1AZ39': { frontDoor: 'open', lockAlarm: 'Yetkisiz kapak açılması', note: 'Yetkisiz kapak açıldı' },
    '1BN52': { rearDoor: 'open', lockAlarm: 'Kapak 5 dakikadan uzun açık', note: 'Arka kapak açık kaldı' },
    '1BG41': { frontDoor: 'open', note: 'Yetkili bakım çalışması' },
    '1BU50': { lockAlarm: 'Yetkisiz kart denemesi (3x)', note: 'Yetkisiz kart denemesi' },
    '1BX54': { lockAlarm: 'Kilit motoru arızası', lockState: 'fault', note: 'Kilit motoru arızası' }
  };

  const EQUIPMENT_SCENARIO = {
    'KLIMA 109': { status: 'alarm', note: 'Kompresör yüksek basınç' },
    'KLIMA 104': { status: 'warning', note: 'Filtre kirli' },
    'KLIMA 112': { status: 'warning', note: 'Dönüş havası yüksek' },
    'UPS A5': { status: 'alarm', note: 'Akü modunda çalışıyor', battery: true },
    'UPS A3': { status: 'warning', note: 'Akü sıcaklığı yüksek' },
    'UPS B4': { status: 'warning', note: 'Yük %82' },
    'UPS B7': { status: 'lost', note: 'SNMP haberleşme kaybı' },
    'A1 KLIMA PANOSU': { status: 'warning', note: 'Faz dengesizliği' }
  };

  // ---------------------------------------------------------------------------
  // Varlık kataloğu (kabin içi cihazlar)
  // ---------------------------------------------------------------------------
  const SERVER_MODELS = [
    { m: 'HPE', n: 'ProLiant DL380 Gen10', u: 2, type: 'Sunucu', w: 21, p: 0.55 },
    { m: 'HPE', n: 'ProLiant DL360 Gen10', u: 1, type: 'Sunucu', w: 16, p: 0.42 },
    { m: 'Dell', n: 'PowerEdge R750', u: 2, type: 'Sunucu', w: 22, p: 0.62 },
    { m: 'Dell', n: 'PowerEdge R650', u: 1, type: 'Sunucu', w: 17, p: 0.45 },
    { m: 'Lenovo', n: 'ThinkSystem SR650 V2', u: 2, type: 'Sunucu', w: 23, p: 0.58 },
    { m: 'Huawei', n: 'OceanStor 5310', u: 4, type: 'Depolama', w: 48, p: 0.95 },
    { m: 'NetApp', n: 'AFF A400', u: 4, type: 'Depolama', w: 52, p: 1.05 },
    { m: 'Cisco', n: 'UCS C240 M6', u: 2, type: 'Sunucu', w: 24, p: 0.6 },
    { m: 'Supermicro', n: 'SYS-2029U', u: 2, type: 'Sunucu', w: 20, p: 0.5 }
  ];
  const NETWORK_MODELS = [
    { m: 'Cisco', n: 'Nexus 93180YC-FX', u: 1, type: 'Switch', w: 9, p: 0.35 },
    { m: 'Cisco', n: 'Catalyst 9300-48P', u: 1, type: 'Switch', w: 8, p: 0.3 },
    { m: 'Juniper', n: 'MX204', u: 1, type: 'Router', w: 10, p: 0.4 },
    { m: 'Juniper', n: 'QFX5120-48Y', u: 1, type: 'Switch', w: 9, p: 0.33 },
    { m: 'Fortinet', n: 'FortiGate 1800F', u: 2, type: 'Firewall', w: 18, p: 0.5 },
    { m: 'Huawei', n: 'CE6881-48S6CQ', u: 1, type: 'Switch', w: 9, p: 0.32 },
    { m: 'Arista', n: '7280R3', u: 2, type: 'Switch', w: 14, p: 0.45 }
  ];
  const CUSTOMERS = ['Türk Telekom (Dahili)', 'Anadolu Finans A.Ş.', 'Ege Lojistik', 'Kuzey Enerji', 'Marmara Sigorta', 'Başkent Belediyesi', 'Delta Yazılım'];

  function buildAssets(code, rnd, isNetworkRow) {
    const assets = [];
    const targetFill = between(rnd, 0.35, 0.86);
    let u = 1;
    let idx = 0;
    // Tepe: patch panel
    const topPatch = { u: 1, name: 'Patch Panel 24F', type: 'Patch Panel', m: 'Panduit', n: 'FLEX 24F', w: 2, p: 0 };
    while (u <= 40 && (u - 1) / 42 < targetFill) {
      if (rnd() < 0.18) { u += 1; continue; } // boş U
      const model = isNetworkRow ? pick(rnd, NETWORK_MODELS) : (rnd() < 0.2 ? pick(rnd, NETWORK_MODELS) : pick(rnd, SERVER_MODELS));
      if (u + model.u - 1 > 40) break;
      idx++;
      const internal = rnd() < 0.55;
      const customer = internal ? CUSTOMERS[0] : pick(rnd, CUSTOMERS.slice(1));
      const host = (model.type === 'Sunucu' ? 'srv' : model.type === 'Depolama' ? 'stg' : 'net') + '-' + code.toLowerCase() + '-' + String(idx).padStart(2, '0');
      assets.push({
        id: code + '-A' + idx,
        startU: u,
        uSize: model.u,
        manufacturer: model.m,
        model: model.n,
        displayName: model.m + ' ' + model.n,
        hostname: host,
        assetType: model.type,
        customerType: internal ? 'internal' : 'external',
        customer,
        primaryIP: '10.' + (20 + Math.floor(rnd() * 20)) + '.' + Math.floor(rnd() * 250) + '.' + (10 + Math.floor(rnd() * 240)),
        serial: (model.m.slice(0, 2).toUpperCase()) + Math.floor(between(rnd, 100000000, 999999999)),
        weight: model.w,
        powerKw: round1(model.p * between(rnd, 0.75, 1.15) * 10) / 10,
        status: 'normal'
      });
      u += model.u;
    }
    assets.push({
      id: code + '-PP',
      startU: 42,
      uSize: 1,
      manufacturer: topPatch.m,
      model: topPatch.n,
      displayName: 'Panduit FLEX Patch Panel 24F',
      hostname: 'pp-' + code.toLowerCase(),
      assetType: topPatch.type,
      customerType: 'internal',
      customer: CUSTOMERS[0],
      primaryIP: '',
      serial: 'PN' + Math.floor(between(rnd, 10000000, 99999999)),
      weight: 2,
      powerKw: 0,
      status: 'normal'
    });
    return assets;
  }

  // ---------------------------------------------------------------------------
  // Kabinler (gerçek Kat-1 yerleşiminden türetilir)
  // ---------------------------------------------------------------------------
  function buildCabinets(floorDigit, seedBase) {
    if (!LAYOUT) return [];
    const scenarioOn = floorDigit === 1;
    return LAYOUT.items
      .filter(it => it.type === 'cabinet')
      .map(it => {
        const code = floorDigit + it.label.slice(1);
        const rnd = createRng(hashStr(code) ^ seedBase);
        const sc = scenarioOn ? CABINET_SCENARIO[code] || {} : {};
        const isNetworkRow = it.col === '1AS' || it.col === '1AV';
        const assets = buildAssets(code, rnd, isNetworkRow);
        const usedU = assets.reduce((s, a) => s + a.uSize, 0);
        const itPower = assets.reduce((s, a) => s + a.powerKw, 0);
        const powerKw = sc.powerKw != null ? sc.powerKw : round1(Math.max(0.8, itPower * between(rnd, 0.92, 1.08)));
        const tempMid = sc.tempMid != null ? sc.tempMid : round1(between(rnd, 21.2, 25.4));
        const tempTop = sc.tempTop != null ? sc.tempTop : round1(tempMid + between(rnd, 0.6, 2.1));
        const tempLow = sc.tempLow != null ? sc.tempLow : round1(tempMid - between(rnd, 0.8, 2.4));
        const humidity = sc.humidity != null ? sc.humidity : Math.round(between(rnd, 38, 52));
        const currentA = round1((powerKw * 1000) / 230 / 1.0);
        const frontDoor = sc.frontDoor || 'closed';
        const rearDoor = sc.rearDoor || 'closed';
        return {
          id: it.id,
          code,
          label: code,
          devId: code,
          col: floorDigit + it.col.slice(1),
          pod: it.pod,
          x: it.x, y: it.y, w: it.w, h: it.h,
          status: sc.status || 'normal',
          note: sc.note || '',
          tempTop, tempMid, tempLow, humidity,
          powerKw,
          currentA,
          pduA: round1(currentA * between(rnd, 0.45, 0.55)),
          pduB: sc.pduFault ? 0 : round1(currentA * between(rnd, 0.45, 0.55)),
          pduFault: !!sc.pduFault,
          frontDoor,
          rearDoor,
          lockAlarm: sc.lockAlarm || '',
          lockState: sc.lockState || (frontDoor === 'open' || rearDoor === 'open' ? 'unlocked' : 'locked'),
          usedU,
          assets,
          customer: pick(rnd, CUSTOMERS),
          lastUpdate: minutesAgo(between(rnd, 0, 0.15))
        };
      });
  }

  // ---------------------------------------------------------------------------
  // Klima / UPS / Pano ekipmanları
  // ---------------------------------------------------------------------------
  function buildEquipment() {
    if (!LAYOUT) return { climates: [], ups: [], panels: [] };
    const res = { climates: [], ups: [], panels: [] };
    LAYOUT.items.forEach(it => {
      if (it.type === 'cabinet') return;
      const rnd = createRng(hashStr(it.label + it.devId));
      const sc = EQUIPMENT_SCENARIO[it.label] || {};
      const base = {
        id: it.id, label: it.label, devId: it.devId, x: it.x, y: it.y, w: it.w, h: it.h, lo: it.lo,
        status: sc.status || 'normal', note: sc.note || ''
      };
      if (it.type === 'climate') {
        const supply = round1(between(rnd, 15.5, 17.8));
        const ret = sc.note === 'Dönüş havası yüksek' ? 29.4 : round1(between(rnd, 23.5, 26.8));
        res.climates.push(Object.assign(base, {
          kind: 'climate',
          points: [
            { label: 'Çalışma Modu', value: sc.status === 'alarm' ? 'ARIZA' : 'SOĞUTMA', unit: '', status: sc.status === 'alarm' ? 'alarm' : 'normal' },
            { label: 'Üfleme Sıcaklığı', value: supply, unit: '°C', status: 'normal' },
            { label: 'Dönüş Sıcaklığı', value: ret, unit: '°C', status: ret > 28 ? 'warning' : 'normal' },
            { label: 'Oda Nemi', value: Math.round(between(rnd, 40, 50)), unit: '%', status: 'normal' },
            { label: 'Fan Hızı', value: Math.round(between(rnd, 62, 88)), unit: '%', status: 'normal' },
            { label: 'Kompresör 1 Basınç', value: sc.status === 'alarm' ? 27.8 : round1(between(rnd, 17, 22)), unit: 'bar', status: sc.status === 'alarm' ? 'alarm' : 'normal' },
            { label: 'Filtre Durumu', value: sc.note === 'Filtre kirli' ? 'KİRLİ' : 'TEMİZ', unit: '', status: sc.note === 'Filtre kirli' ? 'warning' : 'normal' }
          ],
          supplyTemp: supply,
          returnTemp: ret
        }));
      } else if (it.type === 'ups') {
        const load = sc.note === 'Yük %82' ? 82 : Math.round(between(rnd, 38, 71));
        res.ups.push(Object.assign(base, {
          kind: 'ups',
          points: [
            { label: 'Çalışma Modu', value: sc.battery ? 'AKÜ' : (sc.status === 'lost' ? '—' : 'ONLINE (ŞEBEKE)'), unit: '', status: sc.battery ? 'alarm' : (sc.status === 'lost' ? 'lost' : 'normal') },
            { label: 'Giriş Gerilimi (L1)', value: sc.battery ? 0 : Math.round(between(rnd, 226, 232)), unit: 'V', status: sc.battery ? 'alarm' : 'normal' },
            { label: 'Çıkış Gerilimi (L1)', value: Math.round(between(rnd, 229, 231)), unit: 'V', status: 'normal' },
            { label: 'Yük Oranı', value: load, unit: '%', status: load > 80 ? 'warning' : 'normal' },
            { label: 'Akü Kapasitesi', value: sc.battery ? 64 : 100, unit: '%', status: sc.battery ? 'warning' : 'normal' },
            { label: 'Kalan Akü Süresi', value: sc.battery ? 18 : Math.round(between(rnd, 34, 48)), unit: 'dk', status: sc.battery ? 'alarm' : 'normal' },
            { label: 'Akü Sıcaklığı', value: sc.note === 'Akü sıcaklığı yüksek' ? 31.2 : round1(between(rnd, 22, 25)), unit: '°C', status: sc.note === 'Akü sıcaklığı yüksek' ? 'warning' : 'normal' }
          ],
          load
        }));
      } else {
        res.panels.push(Object.assign(base, {
          kind: 'panel',
          points: [
            { label: 'L1 Akım', value: round1(between(rnd, 42, 61)), unit: 'A', status: 'normal' },
            { label: 'L2 Akım', value: round1(between(rnd, 40, 60)), unit: 'A', status: 'normal' },
            { label: 'L3 Akım', value: sc.note === 'Faz dengesizliği' ? 78.6 : round1(between(rnd, 41, 59)), unit: 'A', status: sc.note === 'Faz dengesizliği' ? 'warning' : 'normal' },
            { label: 'Toplam Aktif Güç', value: round1(between(rnd, 28, 41)), unit: 'kW', status: 'normal' },
            { label: 'Güç Faktörü', value: (between(rnd, 0.95, 0.99)).toFixed(2), unit: '', status: 'normal' },
            { label: 'THD-I', value: round1(between(rnd, 3.1, 5.8)), unit: '%', status: 'normal' }
          ]
        }));
      }
    });
    return res;
  }

  // ---------------------------------------------------------------------------
  // Alarmlar (Aktif + Tarihsel)
  // ---------------------------------------------------------------------------
  // severity: critical | major | minor | warning ; level: alarm | warning | lost
  const ACTIVE_ALARMS_SRC = [
    { m: 4, sev: 'critical', lvl: 'alarm', rid: 'IDC1_1BJ53_TEMP_MID', desc: 'Kabin 1BJ53 Orta Sıcaklık', loc: 'Kat 1 / Salon 1 / POD-8', fnc: 'onlhi', grp: 'Soğutma', txt: 'Kabin 1BJ53 Yüksek Sıcaklık: 32.4 °C (Üst Limit 27.0 °C)', dev: 'cabinet', target: '1BJ53' },
    { m: 7, sev: 'critical', lvl: 'alarm', rid: 'KAT1_SAL1_A5_UPS_MODE', desc: 'UPS A5', loc: 'Kat 1 / Salon 1 / UPS Hattı A', fnc: 'onequ', grp: 'Enerji Grubu', txt: 'UPS A5 Akü Modunda Çalışıyor — Kalan süre 18 dk', dev: 'ups', target: 'UPS A5' },
    { m: 11, sev: 'critical', lvl: 'alarm', rid: 'NS2_1AZ39_FDOOR', desc: '1AZ39 Ön Kapak', loc: 'Kat 1 / Salon 1 / POD-10', fnc: 'door', grp: 'Beyaz Alan', txt: 'Yetkisiz Kapak Açıldı — kart okutulmadan açılma', dev: 'lock', target: '1AZ39' },
    { m: 16, sev: 'major', lvl: 'alarm', rid: 'IDC1_KLM109_HP', desc: 'KLIMA 109', loc: 'Kat 1 / Salon 1 / Kuzey Duvar', fnc: 'onlhi', grp: 'Soğutma', txt: 'Kompresör 1 Yüksek Basınç: 27.8 bar (Limit 26.0 bar)', dev: 'climate', target: 'KLIMA 109' },
    { m: 23, sev: 'major', lvl: 'alarm', rid: 'NS1_1AV42_PDU_B_L2', desc: 'Kabin 1AV42 PDU-B', loc: 'Kat 1 / Salon 1 / NS1', fnc: 'onllo', grp: 'Beyaz Alan', txt: 'PDU-B L2 Faz Kaybı: 0 V (Alt Limit 207 V)', dev: 'cabinet', target: '1AV42' },
    { m: 29, sev: 'major', lvl: 'alarm', rid: 'IDC1_1BC37_TEMP_MID', desc: 'Kabin 1BC37 Orta Sıcaklık', loc: 'Kat 1 / Salon 1 / POD-1', fnc: 'onlhi', grp: 'Soğutma', txt: 'Kabin 1BC37 Yüksek Sıcaklık: 31.2 °C (Üst Limit 27.0 °C)', dev: 'cabinet', target: '1BC37' },
    { m: 34, sev: 'major', lvl: 'lost', rid: 'IDC1_1CE51_SNS', desc: 'Kabin 1CE51 Sensör Modülü', loc: 'Kat 1 / Salon 1 / POD-5', fnc: 'devsta', grp: 'Beyaz Alan', txt: 'Cihaz haberleşmesi koptu (Modbus TCP zaman aşımı)', dev: 'cabinet', target: '1CE51' },
    { m: 41, sev: 'major', lvl: 'lost', rid: 'KAT1_SAL1_B7_UPS_SNMP', desc: 'UPS B7', loc: 'Kat 1 / Salon 1 / UPS Hattı B', fnc: 'devsta', grp: 'Enerji Grubu', txt: 'SNMP haberleşme kaybı (3 ardışık sorgu yanıtsız)', dev: 'ups', target: 'UPS B7' },
    { m: 47, sev: 'major', lvl: 'alarm', rid: 'FIRE_PNL_Z3_SMK', desc: 'Yangın Paneli Zon-3', loc: 'Kat 1 / Salon 1 / POD-4 Tavan', fnc: 'onlhi', grp: 'Diğer', txt: 'Duman dedektörü Z3-07 ön alarm (VESDA seviye 1)', dev: 'other', target: '' },
    { m: 52, sev: 'minor', lvl: 'warning', rid: 'IDC1_1BQ55_TEMP_MID', desc: 'Kabin 1BQ55 Orta Sıcaklık', loc: 'Kat 1 / Salon 1 / POD-7', fnc: 'onlhi', grp: 'Soğutma', txt: 'Sıcaklık Uyarısı: 27.9 °C (Uyarı Limiti 27.0 °C)', dev: 'cabinet', target: '1BQ55' },
    { m: 58, sev: 'minor', lvl: 'warning', rid: 'IDC1_1CB52_OCP_CURR', desc: 'Kabin 1CB52 Toplam Akım', loc: 'Kat 1 / Salon 1 / POD-6', fnc: 'onlhi', grp: 'Beyaz Alan', txt: 'Yüksek Akım: 34.3 A (Uyarı Limiti 32.0 A)', dev: 'cabinet', target: '1CB52' },
    { m: 64, sev: 'minor', lvl: 'warning', rid: 'IDC1_1BU54_HUM_MID', desc: 'Kabin 1BU54 Nem', loc: 'Kat 1 / Salon 1 / POD-4', fnc: 'onlhi', grp: 'Soğutma', txt: 'Yüksek Nem: %62 (Uyarı Limiti %60)', dev: 'cabinet', target: '1BU54' },
    { m: 73, sev: 'minor', lvl: 'warning', rid: 'IDC1_KLM104_FLT', desc: 'KLIMA 104', loc: 'Kat 1 / Salon 1 / Güney Duvar', fnc: 'onequ', grp: 'Soğutma', txt: 'Filtre kirli — bakım gerekli (Δp 182 Pa)', dev: 'climate', target: 'KLIMA 104' },
    { m: 81, sev: 'minor', lvl: 'warning', rid: 'IDC1_1BX50_TEMP_MID', desc: 'Kabin 1BX50 Orta Sıcaklık', loc: 'Kat 1 / Salon 1 / POD-4', fnc: 'onllo', grp: 'Soğutma', txt: 'Düşük Sıcaklık: 17.2 °C (Alt Limit 18.0 °C)', dev: 'cabinet', target: '1BX50' },
    { m: 88, sev: 'minor', lvl: 'warning', rid: 'IDC1_KLM112_RET', desc: 'KLIMA 112', loc: 'Kat 1 / Salon 1 / Kuzey Duvar', fnc: 'onlhi', grp: 'Soğutma', txt: 'Dönüş havası yüksek: 29.4 °C (Limit 28.0 °C)', dev: 'climate', target: 'KLIMA 112' },
    { m: 96, sev: 'minor', lvl: 'warning', rid: 'IDC1_1CE56_TEMP_MID', desc: 'Kabin 1CE56 Orta Sıcaklık', loc: 'Kat 1 / Salon 1 / POD-6', fnc: 'onlhi', grp: 'Soğutma', txt: 'Sıcaklık Uyarısı: 28.3 °C (Uyarı Limiti 27.0 °C)', dev: 'cabinet', target: '1CE56' },
    { m: 104, sev: 'warning', lvl: 'warning', rid: 'POD9_1BN52_RDOOR', desc: '1BN52 Arka Kapak', loc: 'Kat 1 / Salon 1 / POD-8', fnc: 'door', grp: 'Beyaz Alan', txt: 'Kapak 5 dakikadan uzun süredir açık', dev: 'lock', target: '1BN52' },
    { m: 112, sev: 'warning', lvl: 'warning', rid: 'POD8_1BG41_FDOOR', desc: '1BG41 Ön Kapak', loc: 'Kat 1 / Salon 1 / POD-2', fnc: 'door', grp: 'Beyaz Alan', txt: 'Ön kapak açık — yetkili bakım (İE-2026-0931)', dev: 'lock', target: '1BG41' },
    { m: 125, sev: 'warning', lvl: 'warning', rid: 'KAT1_SAL1_A1_KLM_PANO_L3', desc: 'A1 KLIMA PANOSU', loc: 'Kat 1 / Salon 1 / Doğu Duvar', fnc: 'onlhi', grp: 'Enerji Grubu', txt: 'Faz dengesizliği: L3 78.6 A (%34 sapma)', dev: 'panel', target: 'A1 KLIMA PANOSU' },
    { m: 139, sev: 'warning', lvl: 'warning', rid: 'KAT1_SAL1_A3_UPS_BTEMP', desc: 'UPS A3', loc: 'Kat 1 / Salon 1 / UPS Hattı A', fnc: 'onlhi', grp: 'Enerji Grubu', txt: 'Akü sıcaklığı yüksek: 31.2 °C (Limit 30.0 °C)', dev: 'ups', target: 'UPS A3' },
    { m: 151, sev: 'warning', lvl: 'warning', rid: 'KAT1_SAL1_B4_UPS_LOAD', desc: 'UPS B4', loc: 'Kat 1 / Salon 1 / UPS Hattı B', fnc: 'onlhi', grp: 'Enerji Grubu', txt: 'Yük oranı %82 (Uyarı Limiti %80)', dev: 'ups', target: 'UPS B4' },
    { m: 167, sev: 'warning', lvl: 'warning', rid: 'POD4_1BU50_FDOOR_AUTH', desc: '1BU50 Kart Okuyucu', loc: 'Kat 1 / Salon 1 / POD-4', fnc: 'onequ', grp: 'Beyaz Alan', txt: 'Yetkisiz kart denemesi (3x) — Kart 04:9C:11:7E', dev: 'lock', target: '1BU50' },
    { m: 184, sev: 'warning', lvl: 'warning', rid: 'IDC1_MASTER_PANO_THD', desc: 'Master Pano', loc: 'Kat 1 / Salon 1 / Doğu Duvar', fnc: 'onlhi', grp: 'Enerji Grubu', txt: 'Akım harmoniği THD-I %8.9 (Limit %8.0)', dev: 'panel', target: '' },
    { m: 203, sev: 'warning', lvl: 'lost', rid: 'POD5_1BX54_LOCK', desc: '1BX54 Kilit Motoru', loc: 'Kat 1 / Salon 1 / POD-5', fnc: 'bista', grp: 'Beyaz Alan', txt: 'Kilit motoru geri bildirimi okunamıyor', dev: 'lock', target: '1BX54' }
  ];

  const ACKED = {
    'KAT1_SAL1_B7_UPS_SNMP': { user: 'Mehmet Kaya', min: 30 },
    'IDC1_KLM104_FLT': { user: 'Ayşe Demir', min: 60 },
    'POD8_1BG41_FDOOR': { user: 'Mehmet Kaya', min: 105 },
    'KAT1_SAL1_B4_UPS_LOAD': { user: 'Burak Şahin', min: 140 },
    'IDC1_MASTER_PANO_THD': { user: 'Ayşe Demir', min: 170 }
  };

  function buildActiveAlarms() {
    return ACTIVE_ALARMS_SRC.map((a, i) => {
      const ack = ACKED[a.rid];
      // Kabin/kilit alarmlarında lokasyon gerçek POD eşlemesinden gelir
      const cab = (a.dev === 'cabinet' || a.dev === 'lock') && a.target ? CABINETS.find(c => c.code === a.target) : null;
      const rid = cab ? a.rid.replace(/^(NS\d|POD\d+)_/, cab.pod.replace('-', '') + '_') : a.rid;
      return {
        id: 'AA-' + String(i + 1).padStart(4, '0'),
        tim: minutesAgo(a.m),
        severity: a.sev,
        level: a.lvl,
        rid,
        desc: a.desc,
        location: cab ? 'Kat 1 / Salon 1 / ' + cab.pod : a.loc,
        fnc: a.fnc,
        grp: a.grp,
        txt: a.txt,
        deviceType: a.dev,
        target: a.target,
        ack: ack ? { user: ack.user, tim: minutesAgo(ack.min) } : null
      };
    });
  }

  const HISTORY_TEMPLATES = [
    { sev: 'minor', lvl: 'warning', fnc: 'onlhi', grp: 'Soğutma', dev: 'cabinet', mk: (c, r) => ({ rid: 'IDC1_' + c + '_TEMP_MID', desc: 'Kabin ' + c + ' Orta Sıcaklık', txt: 'Sıcaklık Uyarısı: ' + (27 + r()).toFixed(1) + ' °C' }) },
    { sev: 'major', lvl: 'alarm', fnc: 'onlhi', grp: 'Soğutma', dev: 'cabinet', mk: (c, r) => ({ rid: 'IDC1_' + c + '_TEMP_TOP', desc: 'Kabin ' + c + ' Üst Sıcaklık', txt: 'Yüksek Sıcaklık: ' + (30 + r() * 2).toFixed(1) + ' °C' }) },
    { sev: 'warning', lvl: 'warning', fnc: 'door', grp: 'Beyaz Alan', dev: 'lock', mk: (c, r) => ({ rid: 'POD_' + c + '_FDOOR', desc: c + ' Ön Kapak', txt: 'Ön kapak açıldı — yetkili kart ile' }) },
    { sev: 'critical', lvl: 'alarm', fnc: 'door', grp: 'Beyaz Alan', dev: 'lock', mk: (c, r) => ({ rid: 'POD_' + c + '_RDOOR', desc: c + ' Arka Kapak', txt: 'Yetkisiz Kapak Açıldı' }) },
    { sev: 'minor', lvl: 'warning', fnc: 'onlhi', grp: 'Beyaz Alan', dev: 'cabinet', mk: (c, r) => ({ rid: 'IDC1_' + c + '_OCP_CURR', desc: 'Kabin ' + c + ' Toplam Akım', txt: 'Yüksek Akım: ' + (32 + r() * 3).toFixed(1) + ' A' }) },
    { sev: 'major', lvl: 'lost', fnc: 'devsta', grp: 'Beyaz Alan', dev: 'cabinet', mk: (c, r) => ({ rid: 'IDC1_' + c + '_SNS', desc: 'Kabin ' + c + ' Sensör Modülü', txt: 'Cihaz haberleşmesi koptu' }) }
  ];
  const HISTORY_EQUIP = [
    { sev: 'critical', lvl: 'alarm', fnc: 'onequ', grp: 'Enerji Grubu', dev: 'ups', rid: 'KAT1_SAL1_B2_UPS_MODE', desc: 'UPS B2', txt: 'UPS B2 Akü Modu — şebeke kesintisi (42 sn)' },
    { sev: 'major', lvl: 'alarm', fnc: 'onlhi', grp: 'Soğutma', dev: 'climate', rid: 'IDC1_KLM101_HP', desc: 'KLIMA 101', txt: 'Kompresör yüksek basınç' },
    { sev: 'minor', lvl: 'warning', fnc: 'onequ', grp: 'Soğutma', dev: 'climate', rid: 'IDC1_KLM106_FAN', desc: 'KLIMA 106', txt: 'Fan hızı düşük (%38)' },
    { sev: 'warning', lvl: 'warning', fnc: 'onlhi', grp: 'Enerji Grubu', dev: 'ups', rid: 'KAT1_SAL1_A2_UPS_LOAD', desc: 'UPS A2', txt: 'Yük oranı %81' },
    { sev: 'major', lvl: 'lost', fnc: 'devsta', grp: 'Enerji Grubu', dev: 'ups', rid: 'KAT1_SAL1_A6_UPS_SNMP', desc: 'UPS A6', txt: 'SNMP haberleşme kaybı' },
    { sev: 'warning', lvl: 'warning', fnc: 'onlhi', grp: 'Diğer', dev: 'other', rid: 'LEAK_POD4_01', desc: 'Su Kaçak Sensörü POD-4', txt: 'Kablo sensörü arızası' }
  ];

  function buildHistory() {
    const rnd = createRng(20260928);
    const cabs = LAYOUT ? LAYOUT.items.filter(i => i.type === 'cabinet') : [];
    const list = [];
    // Aktif alarmların oluşma kayıtları da tarihsel listede yer alır
    buildActiveAlarms().forEach(a => list.push(Object.assign({}, a, { id: 'H-' + a.id, cleared: false })));
    for (let i = 0; i < 88; i++) {
      const ageMin = Math.round(between(rnd, 240, 7 * 24 * 60));
      let rec;
      if (rnd() < 0.28) {
        const e = pick(rnd, HISTORY_EQUIP);
        rec = { sev: e.sev, lvl: e.lvl, fnc: e.fnc, grp: e.grp, dev: e.dev, rid: e.rid, desc: e.desc, txt: e.txt, loc: 'Kat 1 / Salon 1' };
      } else {
        const t = pick(rnd, HISTORY_TEMPLATES);
        const cab = cabs.length ? pick(rnd, cabs) : { label: '1AS49', pod: 'NS2' };
        const r = t.mk(cab.label, rnd);
        rec = { sev: t.sev, lvl: t.lvl, fnc: t.fnc, grp: t.grp, dev: t.dev, rid: r.rid, desc: r.desc, txt: r.txt, loc: 'Kat 1 / Salon 1 / ' + cab.pod };
      }
      const created = minutesAgo(ageMin);
      list.push({
        id: 'H-' + String(i + 1).padStart(4, '0'),
        tim: created, severity: rec.sev, level: rec.lvl, rid: rec.rid, desc: rec.desc, location: rec.loc,
        fnc: rec.fnc, grp: rec.grp, txt: rec.txt, deviceType: rec.dev, cleared: false,
        ack: { user: pick(rnd, ['Mehmet Kaya', 'Ayşe Demir', 'Burak Şahin', 'Zeynep Arslan']), tim: new Date(created.getTime() + 6 * 60000) }
      });
      // Temizlenme (Alarm Durumu Kalktı) kaydı
      const clearAfter = Math.round(between(rnd, 3, 95));
      if (ageMin - clearAfter > 0) {
        list.push({
          id: 'H-' + String(i + 1).padStart(4, '0') + 'C',
          tim: minutesAgo(ageMin - clearAfter), severity: rec.sev, level: 'normal', rid: rec.rid, desc: rec.desc, location: rec.loc,
          fnc: 'onlvl', grp: rec.grp, txt: 'Değer normale döndü', deviceType: rec.dev, cleared: true, ack: null
        });
      }
    }
    return list.sort((a, b) => b.tim - a.tim);
  }

  // ---------------------------------------------------------------------------
  // Kilit — personel, kart okuma logları
  // ---------------------------------------------------------------------------
  const PERSONNEL = [
    { name: 'Mehmet Kaya', card: '04:A3:7F:2B', dept: 'Veri Merkezi Operasyon' },
    { name: 'Ayşe Demir', card: '04:5D:E1:90', dept: 'Veri Merkezi Operasyon' },
    { name: 'Burak Şahin', card: '04:1F:88:C4', dept: 'Ağ Mühendisliği' },
    { name: 'Zeynep Arslan', card: '04:B7:02:6A', dept: 'Sistem Yönetimi' },
    { name: 'Emre Çelik', card: '04:C2:9A:13', dept: 'Enerji & Mekanik Bakım' },
    { name: 'Selin Aydın', card: '04:77:3E:D5', dept: 'Müşteri Temsilcisi (Ege Lojistik)' },
    { name: 'Can Öztürk', card: '04:0E:B4:59', dept: 'Bakım Firması (Yüklenici)' },
    { name: 'Deniz Koç', card: '04:6A:CF:21', dept: 'Güvenlik' }
  ];

  function buildAccessLog(cab, rnd) {
    const logs = [];
    let t = between(rnd, 20, 90);
    const count = 8 + Math.floor(rnd() * 7);
    for (let i = 0; i < count; i++) {
      const p = pick(rnd, PERSONNEL);
      const side = rnd() < 0.6 ? 'front' : 'rear';
      const denied = rnd() < 0.07;
      const openAt = minutesAgo(t);
      if (denied) {
        logs.push({ tim: openAt, user: 'Tanımsız Kart', card: '04:9C:' + Math.floor(rnd() * 90 + 10) + ':7E', dept: '—', side, event: 'Yetkisiz kart denemesi', result: 'denied' });
      } else {
        const dur = Math.round(between(rnd, 2, 26));
        logs.push({ tim: new Date(openAt.getTime() + dur * 60000), user: p.name, card: p.card, dept: p.dept, side, event: 'Kapak kapatıldı / otomatik kilit', result: 'system' });
        logs.push({ tim: openAt, user: p.name, card: p.card, dept: p.dept, side, event: 'Kart okutuldu — kilit açıldı', result: 'granted' });
      }
      t += between(rnd, 40, 420);
    }
    // Senaryo olayları en üste
    if (cab.lockAlarm === 'Yetkisiz kapak açılması') {
      logs.unshift({ tim: minutesAgo(11), user: '—', card: '—', dept: '—', side: 'front', event: 'Kart okutulmadan kapak açıldı (zorlama şüphesi)', result: 'denied' });
    } else if (cab.lockAlarm === 'Kapak 5 dakikadan uzun açık') {
      logs.unshift({ tim: minutesAgo(109), user: 'Can Öztürk', card: '04:0E:B4:59', dept: 'Bakım Firması (Yüklenici)', side: 'rear', event: 'Kart okutuldu — kilit açıldı', result: 'granted' });
    } else if (cab.lockAlarm === 'Yetkisiz kart denemesi (3x)') {
      [167, 168, 169].forEach(m => logs.unshift({ tim: minutesAgo(m), user: 'Tanımsız Kart', card: '04:9C:11:7E', dept: '—', side: 'front', event: 'Yetkisiz kart denemesi', result: 'denied' }));
    } else if (cab.frontDoor === 'open') {
      logs.unshift({ tim: minutesAgo(118), user: 'Emre Çelik', card: '04:C2:9A:13', dept: 'Enerji & Mekanik Bakım', side: 'front', event: 'Kart okutuldu — kilit açıldı (İE-2026-0931)', result: 'granted' });
    }
    return logs.sort((a, b) => b.tim - a.tim);
  }

  const FLOORS = [
    { id: 'T00', digit: 1, label: '1. Kat', seed: 1 },
    { id: 'T02', digit: 2, label: '2. Kat', seed: 7331 },
    { id: 'T03', digit: 3, label: '3. Kat', seed: 90211 },
    { id: 'T04', digit: 4, label: '4. Kat', seed: 424242 }
  ];

  const lockCache = {};
  function getLockFloor(floorId) {
    if (lockCache[floorId]) return lockCache[floorId];
    const floor = FLOORS.find(f => f.id === floorId) || FLOORS[0];
    const cabinets = floor.digit === 1 ? CABINETS : buildCabinets(floor.digit, floor.seed);
    // Diğer katlar için birkaç açık kapak
    if (floor.digit !== 1) {
      const rnd = createRng(floor.seed);
      for (let i = 0; i < 3; i++) {
        const c = cabinets[Math.floor(rnd() * cabinets.length)];
        if (rnd() < 0.5) c.frontDoor = 'open'; else c.rearDoor = 'open';
        c.lockState = 'unlocked';
      }
    }
    const cards = cabinets.map(c => {
      const rnd = createRng(hashStr(c.code + '-lock'));
      const lost = c.status === 'lost';
      const point = side => ({
        state: lost ? 'unknown' : (side === 'front' ? c.frontDoor : c.rearDoor),
        sourceId: c.pod.replace('-', '') + '_' + c.code + (side === 'front' ? '_FDOOR' : '_RDOOR'),
        description: c.code + (side === 'front' ? ' Ön Kapak Sensörü' : ' Arka Kapak Sensörü'),
        lockState: lost ? 'unknown' : (c.lockState === 'fault' ? 'fault' : ((side === 'front' ? c.frontDoor : c.rearDoor) === 'open' ? 'unlocked' : 'locked'))
      });
      const front = point('front');
      const rear = point('rear');
      let overall = 'normal';
      if (front.state === 'open' || rear.state === 'open') overall = 'open';
      else if (c.lockAlarm) overall = 'alarm';
      else if (front.state === 'unknown') overall = 'unknown';
      return {
        id: c.pod.replace('-', '') + '_' + c.code,
        cabinetCode: c.code,
        description: c.code + ' — ' + c.customer,
        floor: floor.label,
        room: 'Salon 1',
        pod: c.pod,
        x: c.x, y: c.y, w: c.w, h: c.h,
        front, rear,
        overallState: overall,
        alarmText: c.lockAlarm,
        communicationState: lost ? 'offline' : 'online',
        lastValueUpdate: new Date(),
        assets: c.assets,
        usedU: c.usedU,
        accessLog: buildAccessLog(c, rnd),
        cabinet: c
      };
    });
    lockCache[floorId] = cards;
    return cards;
  }

  // ---------------------------------------------------------------------------
  // Dışa aktarım
  // ---------------------------------------------------------------------------
  const CABINETS = buildCabinets(1, 1);
  const EQUIPMENT = buildEquipment();

  DCIM.data = {
    site: SITE,
    layout: LAYOUT,
    floors: FLOORS,
    cabinets: CABINETS,
    climates: EQUIPMENT.climates,
    ups: EQUIPMENT.ups,
    panels: EQUIPMENT.panels,
    personnel: PERSONNEL,
    activeAlarms: buildActiveAlarms(),
    historicalAlarms: buildHistory(),
    getLockFloor,
    findCabinet: code => CABINETS.find(c => c.code === code) || null,
    findEquipment: label => [...EQUIPMENT.climates, ...EQUIPMENT.ups, ...EQUIPMENT.panels].find(e => e.label.toUpperCase() === String(label).toUpperCase()) || null,
    rng: createRng,
    hash: hashStr,
    // Ağır veri kümeleri için: D[name] ilk okunduğunda build() bir kez çalışır ve D[name]'i atar.
    // Böylece yalnızca o veriyi kullanan sayfa üretim maliyetini öder.
    lazy(name, build) {
      const D = DCIM.data;
      Object.defineProperty(D, name, {
        configurable: true,
        enumerable: true,
        get() {
          Object.defineProperty(D, name, { value: undefined, writable: true, configurable: true, enumerable: true });
          build();
          return D[name];
        }
      });
    }
  };
})();

/* ==========================================================================
   PDU Detay (DCIM.data.pdu)
   ========================================================================== */
/* ==========================================================================
   DCIM Sunum — PDU mock verisi (pdu-detail.html)
   XDB_GetValue sorgularının yerine geçer:
     doc("CMR/T01")/json(//dev[contains(@id, "PDU") and @dev_loc], 'id,dev_loc')  → devLocs()
     doc("CMR/T01")/json(//dev[contains(@id, "<kabin>") and contains(@id, "PDU")]) → query(kabinId, canli)
   IO adlandırması gerçek db_CMR_T01.xml şablonlarıyla aynıdır:
     monofaz  : K<kabin>_PDU_A_IN_CURR / _IN_VOLT / _IN_POW / _IN_APPOW / _IN_PF / _IN_AENRG, OCP C1..C2
     trifaz   : _IN1.._IN3_CURR / _VOLT_FN / _VOLT_FF, _IN_TOT_POW / _APPOW / _PF / _AENRG, _IN_FREQ, OCP C1..C6
     ortak    : _NFO_PDU*, _RTD_VOLT / _RTD_CURR / _RTD_VA / _RTD_OCPn_CURR, _OUTnn_*, _OCP_Cn_CURR / _STATUS / _ONLVLHI*
   Senaryo: 1AV42 PDU-B L2 faz kaybı (0 V, alarm) · 1CB52 PDU-B C1 kesici yüksek akım (uyarı).
   Kabin toplamları DCIM.data.cabinets[].pduA / pduB ile birebir aynıdır (2D/3D sayfalarıyla tutarlı).
   Bağımlılık: js/mock-data.js (DCIM.data)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D) return;

  const between = (rnd, min, max) => min + (max - min) * rnd();
  const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length) % arr.length];

  // STA değerleri (running=0x3 | değer maskesi): normal / uyarı / alarm
  const STA = { normal: '0x0003', warning: '0x0007', alarm: '0x000B' };

  // Sahadaki Raritan PDU tipleri (faz / outlet / kesici sayıları gerçek şablonlardan)
  const PDU_MODELS = [
    { model: 'PX3-5528V-V2', phases: 3, outlets: 24, ocp: 6, rtdVolt: '400', rtdCurr: '32', rtdVA: '22170', ocpRtd: 16 },
    { model: 'PX4-4917-E7V2K2', phases: 3, outlets: 24, ocp: 6, rtdVolt: '400', rtdCurr: '32', rtdVA: '22170', ocpRtd: 16 },
    { model: 'PX3-5530V', phases: 3, outlets: 24, ocp: 6, rtdVolt: '400', rtdCurr: '32', rtdVA: '22170', ocpRtd: 16 },
    { model: 'PX3-4104R-V2', phases: 3, outlets: 6, ocp: 6, rtdVolt: '400', rtdCurr: '16', rtdVA: '11085', ocpRtd: 16 },
    { model: 'PX2-5292R', phases: 1, outlets: 12, ocp: 2, rtdVolt: '230', rtdCurr: '32', rtdVA: '7360', ocpRtd: 16 },
    { model: 'PX3-5493V', phases: 1, outlets: 24, ocp: 2, rtdVolt: '230', rtdCurr: '32', rtdVA: '7360', ocpRtd: 16 },
    { model: 'PX2-5844R', phases: 1, outlets: 20, ocp: 2, rtdVolt: '230', rtdCurr: '32', rtdVA: '7360', ocpRtd: 16 }
  ];
  // Senaryo kabinleri trifaz PDU kullanır
  const FORCE_MODEL = { '1AV42': 'PX3-5528V-V2', '1CB52': 'PX3-5528V-V2' };

  // Senaryo: PDU bazlı olaylar
  const PDU_SCENARIO = {
    '1AV42_B': { sta: 'alarm', lostPhase: 2, note: 'PDU-B L2 faz kaybı' },
    '1CB52_B': { sta: 'warning', hotBreaker: 1, hotCurrent: 13.4, note: 'C1 kesici yüksek akım' }
  };

  // mock-data.js POD adları → XDB dev_loc grup adları (POD-1 → "POD 1", NS1 → "NON-S1")
  const groupName = pod => /^NS(\d+)$/i.test(pod) ? 'NON-S' + pod.replace(/\D/g, '') : String(pod).replace('-', ' ');
  const devLoc = c => '1.KAT/1.SALON/' + groupName(c.pod) + '/' + c.col.slice(1) + ' SIRASI';
  const devBase = (code, side) => 'K' + code + '_PDU_' + side;

  const round = (n, d) => { const p = Math.pow(10, d); return Math.round(n * p) / p; };

  // Kesici başına outlet dağılımı: C1..Cn sırayla eşit bloklar; trifazda Cn → faz ceil(n/2)
  function breakerOfOutlet(m, o) {
    const per = Math.max(1, Math.floor(m.outlets / m.ocp));
    return Math.min(m.ocp, Math.floor((o - 1) / per) + 1);
  }
  function phaseOfBreaker(m, b) {
    if (m.phases === 1) return 1;
    return Math.ceil(b / (m.ocp / 3));
  }

  // ---------------------------------------------------------------------------
  // Statik (tohumlu) PDU tanımları — kabin başına A/B
  // ---------------------------------------------------------------------------
  const cache = {};
  function buildStatic(cab) {
    if (cache[cab.code]) return cache[cab.code];
    const rnd = D.rng(D.hash(cab.code + '-pdu'));
    const model = PDU_MODELS.find(x => x.model === FORCE_MODEL[cab.code]) || pick(rnd, PDU_MODELS);
    const loaded = cab.assets.filter(a => a.powerKw > 0);

    // Faz dengesi için outlet atama sırası: her kesicinin 1. slotu, sonra 2. slotu ...
    const per = Math.max(1, Math.floor(model.outlets / model.ocp));
    const order = [];
    const bOrder = model.phases === 3 && model.ocp === 6 ? [1, 3, 5, 2, 4, 6] : Array.from({ length: model.ocp }, (_, i) => i + 1);
    for (let s = 0; s < per; s++) bOrder.forEach(b => { const o = (b - 1) * per + s + 1; if (o <= model.outlets) order.push(o); });
    for (let o = 1; o <= model.outlets; o++) if (order.indexOf(o) < 0) order.push(o);

    const outletAssets = {};
    loaded.forEach((a, i) => {
      const o = order[i % order.length];
      (outletAssets[o] = outletAssets[o] || []).push(a);
    });

    const sides = ['A', 'B'].map(side => {
      const sc = PDU_SCENARIO[cab.code + '_' + side] || null;
      const target = side === 'A' ? cab.pduA : cab.pduB;
      const outlets = [];
      let sumW = 0;
      for (let o = 1; o <= model.outlets; o++) {
        const w = (outletAssets[o] || []).reduce((s, a) => s + a.powerKw, 0);
        sumW += w;
        const b = breakerOfOutlet(model, o);
        outlets.push({
          no: o,
          breaker: b,
          phase: phaseOfBreaker(model, b),
          weight: w,
          assets: (outletAssets[o] || []).map(a => a.hostname),
          pf: round(between(rnd, 0.93, 0.99), 2),
          hours: between(rnd, 9000, 17000),
          on: w > 0 || rnd() > 0.3,
          curr: 0
        });
      }
      outlets.forEach(ot => { ot.curr = sumW > 0 ? target * ot.weight / sumW : 0; });
      // Kümülatif enerji için olay öncesi yük (kabin ortalaması)
      const baseTarget = target > 0 ? target : (cab.currentA || 0) / 2;
      outlets.forEach(ot => { ot.baseCurr = sumW > 0 ? baseTarget * ot.weight / sumW : 0; });

      // 1CB52 PDU-B: C1 kesicisinde yük yoğunlaşması (toplam korunur)
      if (sc && sc.hotBreaker) {
        const hot = outlets.filter(ot => ot.breaker === sc.hotBreaker && ot.weight > 0);
        const rest = outlets.filter(ot => ot.breaker !== sc.hotBreaker && ot.weight > 0);
        const hotSum = hot.reduce((s, ot) => s + ot.curr, 0);
        const restSum = rest.reduce((s, ot) => s + ot.curr, 0);
        const hotTarget = Math.min(sc.hotCurrent, target * 0.95);
        if (hotSum > 0 && restSum > 0) {
          hot.forEach(ot => { ot.curr = ot.curr * hotTarget / hotSum; });
          rest.forEach(ot => { ot.curr = ot.curr * (target - hotTarget) / restSum; });
        }
      }
      // 1AV42 PDU-B: kayıp fazdaki outlet'ler kapalı; yük A beslemesine aktarıldı (pduB = 0)
      if (sc && sc.lostPhase) {
        outlets.forEach(ot => { ot.curr = 0; if (ot.phase === sc.lostPhase) ot.on = false; });
      }

      const volt = [0, between(rnd, 229.2, 231.8), between(rnd, 228.8, 231.4), between(rnd, 229.0, 232.0)];
      const netOct = 40 + cab.code.charCodeAt(2) % 20;
      return {
        side,
        sc,
        model,
        outlets,
        volt,
        freq: between(rnd, 49.97, 50.03),
        serial: 'QH' + pick(rnd, ['A', 'B', 'C', 'D']) + String(Math.floor(between(rnd, 1000000, 9999999))),
        ip: '10.10.' + netOct + '.' + (side === 'A' ? '11' : '12'),
        mac: '00:0D:5D:' + [0, 0, 0].map(() => Math.floor(rnd() * 256).toString(16).padStart(2, '0').toUpperCase()).join(':'),
        fw: pick(rnd, ['4.0.20.5-49038', '3.6.10.5-47925', '4.1.0.5-49521']),
        snmp: rnd() < 0.8 ? 'V2C' : 'V3',
        energyBase: between(rnd, 0.8, 1.2)
      };
    });
    cache[cab.code] = { cab, model, sides };
    return cache[cab.code];
  }

  // ---------------------------------------------------------------------------
  // Canlı IO listesi üretimi (XDB dev JSON biçiminde)
  // ---------------------------------------------------------------------------
  const T0 = Date.now();
  function buildDev(cab, p, live) {
    const m = p.model;
    const base = devBase(cab.code, p.side);
    const j = amp => live ? 1 + (Math.random() - 0.5) * amp : 1;
    const hoursNow = (Date.now() - T0) / 3600000;
    const ios = [];
    const io = (suffix, val, unit, desc, sta) => ios.push({ id: base + '_' + suffix, val: String(val), unit: unit || '-', desc: cab.code + '-PDU-' + p.side + ' ' + desc, sta: sta || STA.normal });
    const lost = p.sc && p.sc.lostPhase;
    const phaseV = ph => (lost === ph ? 0 : p.volt[m.phases === 1 ? 1 : ph] * j(0.004));

    // NFO / RTD
    io('NFO_PDUMANUF', 'Raritan', '-', 'PDU MARKASI');
    io('NFO_PDUMODEL', m.model, '-', 'PDU MODELI');
    io('NFO_PDUSERNO', p.serial, '-', 'PDU SERİ NO');
    io('NFO_PDUIPADDR', p.ip, '-', 'PDU IP ADRESİ');
    io('NFO_PDUNAME', '-', '-', 'PDU ADI');
    io('NFO_PDUINCNT', '-', '-', 'PDU INLET SAYISI');
    io('NFO_PDUOUTCNT', m.outlets, '-', 'PDU OUTLET SAYISI');
    io('NFO_PDUMACADD', p.mac, '-', 'PDU MAC ADRESİ');
    io('NFO_PDUFWVER', p.fw, '-', 'PDU YAZILIM VERSİYONU');
    io('RTD_VOLT', m.rtdVolt, 'V', 'PDU ANMA GERİLİMİ');
    io('RTD_CURR', m.rtdCurr, 'A', 'PDU ANMA AKIMI');
    io('RTD_VA', m.rtdVA, 'VA', 'PDU ANMA VA DEGERI');
    for (let b = 1; b <= m.ocp; b++) io('RTD_OCP' + b + '_CURR', m.ocpRtd, 'A', 'PDU OCP' + b + ' ANMA AKIMI');

    // Outlet'ler
    const outs = p.outlets.map(ot => {
      const v = ot.on ? phaseV(ot.phase) : 0;
      const c = ot.on ? ot.curr * j(0.03) : 0;
      const pow = v * c * ot.pf;
      const ap = v * c;
      const enrg = ot.baseCurr * 230 * ot.pf * ot.hours * p.energyBase + ot.curr * 230 * ot.pf * hoursNow;
      return { ot, v, c, pow, ap, enrg };
    });

    // Inlet
    const phaseSum = (ph, key) => outs.filter(x => m.phases === 1 || x.ot.phase === ph).reduce((s, x) => s + x[key], 0);
    const totPow = outs.reduce((s, x) => s + x.pow, 0);
    const totAp = outs.reduce((s, x) => s + x.ap, 0);
    const totEn = outs.reduce((s, x) => s + x.enrg, 0);
    const totPf = totAp > 0 ? totPow / totAp : 0;
    if (m.phases === 1) {
      io('IN_CURR', round(phaseSum(1, 'c'), 2), 'A', '-INLET AKIM');
      io('IN_VOLT', round(phaseV(1), 1), 'V', '-INLET VOLTAJ');
      io('IN_POW', Math.round(totPow), 'W', '-INLET AKTİF GÜÇ');
      io('IN_APPOW', Math.round(totAp), 'VA', '-INLET GÖRÜNÜR GÜÇ');
      io('IN_PF', totPf.toFixed(2), '-', '-INLET GÜÇ FAKTÖRÜ');
      io('IN_AENRG', Math.round(totEn), 'Wh', '-INLET AKTİF ENERJİ');
    } else {
      for (let ph = 1; ph <= 3; ph++) {
        const sta = lost === ph ? STA.alarm : STA.normal;
        io('IN' + ph + '_CURR', round(phaseSum(ph, 'c'), 2), 'A', 'INLET L' + ph + ' AKIM', sta);
        // Fazlar arası: iki faz varsa √3·V, biri kayıpsa kalan fazın faz-nötr değeri
        const nx = (ph % 3) + 1;
        const vff = lost === ph ? phaseV(nx) : lost === nx ? phaseV(ph) : (phaseV(ph) + phaseV(nx)) / 2 * Math.sqrt(3);
        io('IN' + ph + '_VOLT_FF', round(vff, 1), 'V', 'INLET L' + ph + '-L' + nx + ' VOLTAJ', sta);
        io('IN' + ph + '_VOLT_FN', round(phaseV(ph), 1), 'V', 'INLET L' + ph + '-N VOLTAJ', sta);
      }
      io('IN_TOT_POW', Math.round(totPow), 'W', 'INLET TOPLAM AKTİF GÜÇ');
      io('IN_TOT_APPOW', Math.round(totAp), 'VA', 'INLET TOPLAM GÖRÜNÜR GÜÇ');
      io('IN_TOT_PF', totAp > 0 ? totPf.toFixed(2) : '-', '-', 'INLET TOPLAM GÜÇ FAKTÖRÜ');
      io('IN_TOT_AENRG', Math.round(totEn), 'Wh', 'INLET TOPLAM AKTİF ENERJİ');
      io('IN_FREQ', (p.freq + (live ? (Math.random() - 0.5) * 0.02 : 0)).toFixed(2), 'Hz', 'INLET FREKANS');
    }

    // Outlet IO'ları
    outs.forEach(x => {
      const n = String(x.ot.no).padStart(2, '0');
      const sta = lost && x.ot.phase === lost ? STA.alarm : STA.normal;
      io('OUT' + n + '_CURR', round(x.c, 2), 'A', '-OUTLET ' + n + ' AKIM', sta);
      io('OUT' + n + '_VOLT', round(x.v, 1), 'V', '-OUTLET ' + n + ' VOLTAJ', sta);
      io('OUT' + n + '_POW', Math.round(x.pow), 'W', '-OUTLET ' + n + ' AKTİF GÜÇ');
      io('OUT' + n + '_APPOW', Math.round(x.ap), 'VA', '-OUTLET ' + n + ' GÖRÜNÜR GÜÇ');
      io('OUT' + n + '_PF', x.c > 0 ? x.ot.pf.toFixed(2) : '0', '-', '-OUTLET ' + n + ' GÜÇ FAKTÖRÜ');
      io('OUT' + n + '_AENRG', Math.round(x.enrg), 'Wh', '-OUTLET ' + n + ' AKTİF ENERJİ');
      io('OUT' + n + '_STATUS', x.ot.on ? '1' : '0', '-', '-OUTLET ' + n + ' DURUM');
    });

    // OCP (devre kesici) — limitler: uyarı %80, alarm %90
    for (let b = 1; b <= m.ocp; b++) {
      io('OCP_C' + b + '_ONLVLHIALM', round(m.ocpRtd * 0.9, 1), 'A', 'OCP C' + b + ' AKIM ÜST ALARM LİMİTİ');
      io('OCP_C' + b + '_ONLVLHIWRN', round(m.ocpRtd * 0.8, 1), 'A', 'OCP C' + b + ' AKIM ÜST UYARI LİMİTİ');
    }
    for (let b = 1; b <= m.ocp; b++) {
      const c = outs.filter(x => x.ot.breaker === b).reduce((s, x) => s + x.c, 0);
      const lostB = lost && phaseOfBreaker(m, b) === lost;
      const sta = lostB ? STA.alarm : c >= m.ocpRtd * 0.9 ? STA.alarm : c >= m.ocpRtd * 0.8 ? STA.warning : STA.normal;
      io('OCP_C' + b + '_CURR', round(c, 2), 'A', 'OCP C' + b + ' AKIMI', sta);
    }
    for (let b = 1; b <= m.ocp; b++) {
      const cIo = ios.find(x => x.id === base + '_OCP_C' + b + '_CURR');
      // Alarm/uyarıdaki kesicide cihaz durum kodu yerine STA değerlendirmesi gösterilir
      io('OCP_C' + b + '_STATUS', cIo.sta === STA.normal ? '1' : '-', '-', 'OCP C' + b + ' DURUMU');
    }

    return {
      id: base + '_DV',
      desc: cab.code + '-PDU-' + p.side,
      con_host: p.ip,
      dev_loc: devLoc(cab),
      pro_ver: p.snmp,
      sta: p.sc ? STA[p.sc.sta] : STA.normal,
      io: ios
    };
  }

  // Kabin ID eşleme (K önekli / öneksiz)
  function findCab(id) {
    const clean = String(id || '').replace(/_DV$/, '').replace(/^K/i, '').toUpperCase();
    return D.findCabinet(clean);
  }

  D.pdu = {
    // Sorgu 1: sidebar hiyerarşisi (id, dev_loc)
    devLocs() {
      const out = [];
      D.cabinets.forEach(c => {
        out.push({ id: devBase(c.code, 'A') + '_DV', dev_loc: devLoc(c) });
        out.push({ id: devBase(c.code, 'B') + '_DV', dev_loc: devLoc(c) });
      });
      return out;
    },
    // Sorgu 2: seçili kabinin PDU dev blokları (live=true → 5 sn polling titreşimi)
    query(cabinetId, live) {
      const cab = findCab(cabinetId);
      if (!cab) return [];
      const st = buildStatic(cab);
      return st.sides.map(p => buildDev(cab, p, !!live));
    },
    // Outlet → bağlı cihaz (hostname) eşlemesi
    outletAssets(cabinetId, side) {
      const cab = findCab(cabinetId);
      if (!cab) return {};
      const p = buildStatic(cab).sides.find(s => s.side === side);
      const map = {};
      if (p) p.outlets.forEach(ot => { map[ot.no] = ot.assets; });
      return map;
    },
    // Senaryodaki PDU olayları (ağaç durum göstergesi için)
    scenario: PDU_SCENARIO
  };
})();

/* ==========================================================================
   Kabin Yönetimi (DCIM.data.cabinetMgr)
   ========================================================================== */
/* ==========================================================================
   DCIM Sunum — Kabin Yönetimi mock verisi (cabinet-detail.html)
   NewUICMPCabinetManagerComponent'in XDB / ASM / CAT / LNK kaynaklarının yerine geçer:
     doc("CMR/T00")/json(//io[contains(@id, "<kabin>")], "id,rid,val,desc,unit,sta,xdb_cls") → sensorIos()
     doc("CMR/T01")/json(//dev[contains(@id, "PDU")])                                      → pduDevs()
     ASM (cihaz detay), CAT (model kataloğu, ön/arka görsel + port şablonu), LNK (port bağlantıları)
   Cihaz görselleri SVG olarak üretilir; port koordinatları (0..1 oranı) görselle birebir eşleşir.
   Bağlantılar tüm kabinler için tohumlu ve iki yönlü üretilir (NIC → patch panel / ToR / omurga switch,
   PSU → PDU-A/B outlet). Senaryo değerleri DCIM.data.cabinets'tan gelir (1BJ53 sıcaklık alarmı vb.).
   Bağımlılık: DCIM.data (yukarıdaki bölümler), opsiyonel DCIM.data.pdu
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D) return;

  const between = (rnd, min, max) => min + (max - min) * rnd();
  const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length) % arr.length];
  const pad = n => String(n).padStart(2, '0');
  const dateKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const dateTime = d => dateKey(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  const daysFromNow = n => new Date(Date.now() + n * 86400000);
  const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // AyXDB STA değerleri (running | değer maskesi) — ayxdb-sta.ts ile uyumlu
  const STA = { normal: '0x0003', warning: '0x0007', alarm: '0x000B', waiting: '0x0002', inhibited: '0x03C3' };

  // ---------------------------------------------------------------------------
  // Lokasyonlar (ASM location_id / full_name)
  // ---------------------------------------------------------------------------
  const PODS = [];
  D.cabinets.forEach(c => { if (PODS.indexOf(c.pod) < 0) PODS.push(c.pod); });
  const locFullName = pod => D.site.company + ' / ' + D.site.dc + ' / ' + D.site.floor + ' / ' + D.site.hall + ' / ' + pod;
  const LOCATIONS = PODS.map(p => ({ location_id: 'LOC-' + p, full_name: locFullName(p), pod: p }));
  const STOCK_LOCATIONS = ['Veri Merkezi / Zemin Kat Depo-1', 'Veri Merkezi / Yükleme Alanı Depo-2', 'Ankara Merkez Lojistik Deposu'];

  // ---------------------------------------------------------------------------
  // CAT — cihaz model kataloğu (mock-data.js SERVER/NETWORK modelleri + patch panel)
  // jsn: ucapacity, power (W), weight (kg), nominal_power, power_connection_numbers
  // ---------------------------------------------------------------------------
  const CATALOG_SRC = [
    ['HPE', 'ProLiant DL380 Gen10', 'Sunucu', 2, 550, 21],
    ['HPE', 'ProLiant DL360 Gen10', 'Sunucu', 1, 420, 16],
    ['Dell', 'PowerEdge R750', 'Sunucu', 2, 620, 22],
    ['Dell', 'PowerEdge R650', 'Sunucu', 1, 450, 17],
    ['Lenovo', 'ThinkSystem SR650 V2', 'Sunucu', 2, 580, 23],
    ['Huawei', 'OceanStor 5310', 'Depolama', 4, 950, 48],
    ['NetApp', 'AFF A400', 'Depolama', 4, 1050, 52],
    ['Cisco', 'UCS C240 M6', 'Sunucu', 2, 600, 24],
    ['Supermicro', 'SYS-2029U', 'Sunucu', 2, 500, 20],
    ['Cisco', 'Nexus 93180YC-FX', 'Switch', 1, 350, 9],
    ['Cisco', 'Catalyst 9300-48P', 'Switch', 1, 300, 8],
    ['Juniper', 'MX204', 'Router', 1, 400, 10],
    ['Juniper', 'QFX5120-48Y', 'Switch', 1, 330, 9],
    ['Fortinet', 'FortiGate 1800F', 'Firewall', 2, 500, 18],
    ['Huawei', 'CE6881-48S6CQ', 'Switch', 1, 320, 9],
    ['Arista', '7280R3', 'Switch', 2, 450, 14],
    ['Panduit', 'FLEX 24F', 'Patch Panel', 1, 0, 2]
  ];
  const CATALOG = CATALOG_SRC.map((r, i) => ({
    model_id: 'CAT' + String(1001 + i),
    brand: r[0],
    name: r[1],
    nature: r[2],
    full_name: r[0] + ' ' + r[1],
    jsn: { ucapacity: r[3], power: r[4], weight: r[5], nominal_power: Math.round(r[4] * 0.72), power_connection_numbers: r[2] === 'Patch Panel' ? 0 : 2 }
  }));
  const findCatalog = (brand, model) => CATALOG.find(c => c.brand === brand && (c.name === model || model.indexOf(c.name) >= 0)) || null;

  // ---------------------------------------------------------------------------
  // Cihaz görselleri (CAT.jsn.front_img / back_img) — SVG, port şablonu ile birlikte
  // ---------------------------------------------------------------------------
  const W = 800;
  const UH = 72;
  const BRAND_COLOR = { HPE: '#01a982', Dell: '#2a8fe0', Lenovo: '#e2231a', Cisco: '#049fd9', Huawei: '#e0324c', NetApp: '#3b82f6', Supermicro: '#43a047', Juniper: '#84b135', Fortinet: '#ef4444', Arista: '#60a5fa', Panduit: '#f2a900' };

  const svgEl = {
    rj45: (cx, cy) =>
      '<rect x="' + (cx - 11) + '" y="' + (cy - 13) + '" width="4" height="2.5" fill="#22c55e"/><rect x="' + (cx + 7) + '" y="' + (cy - 13) + '" width="4" height="2.5" fill="#f59e0b"/>' +
      '<rect x="' + (cx - 11) + '" y="' + (cy - 9) + '" width="22" height="18" rx="1.5" fill="#07090c" stroke="#8b949e" stroke-width="1.2"/>' +
      '<rect x="' + (cx - 5) + '" y="' + (cy + 5) + '" width="10" height="4" fill="#8b949e"/>',
    sfp: (cx, cy) =>
      '<rect x="' + (cx - 13) + '" y="' + (cy - 7) + '" width="26" height="14" rx="1" fill="#0b0e12" stroke="#c0c7cf" stroke-width="1.2"/>' +
      '<rect x="' + (cx - 9) + '" y="' + (cy - 3) + '" width="18" height="6" fill="#1f2937"/>',
    usb: (cx, cy) =>
      '<rect x="' + (cx - 9) + '" y="' + (cy - 4) + '" width="18" height="8" fill="#0b0e12" stroke="#c0c7cf" stroke-width="1"/>' +
      '<rect x="' + (cx - 6) + '" y="' + (cy - 1.5) + '" width="12" height="3" fill="#2563eb"/>',
    vga: (cx, cy) =>
      '<rect x="' + (cx - 17) + '" y="' + (cy - 7) + '" width="34" height="14" rx="4" fill="#1d4ed8" stroke="#93c5fd" stroke-width="1"/>' +
      '<circle cx="' + (cx - 8) + '" cy="' + cy + '" r="1.3" fill="#dbeafe"/><circle cx="' + cx + '" cy="' + cy + '" r="1.3" fill="#dbeafe"/><circle cx="' + (cx + 8) + '" cy="' + cy + '" r="1.3" fill="#dbeafe"/>',
    fan: (cx, cy, r) =>
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#101418" stroke="#6b7280" stroke-width="1.2"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * 0.28) + '" fill="#374151"/>' +
      [0, 60, 120].map(a => '<line x1="' + (cx - r * 0.85 * Math.cos(a * Math.PI / 180)).toFixed(1) + '" y1="' + (cy - r * 0.85 * Math.sin(a * Math.PI / 180)).toFixed(1) +
        '" x2="' + (cx + r * 0.85 * Math.cos(a * Math.PI / 180)).toFixed(1) + '" y2="' + (cy + r * 0.85 * Math.sin(a * Math.PI / 180)).toFixed(1) + '" stroke="#4b5563" stroke-width="1"/>').join(''),
    caddy: (x, y, w, h) =>
      '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="1.5" fill="#3b4350" stroke="#0b0e12" stroke-width="1"/>' +
      '<rect x="' + (x + 4) + '" y="' + (y + 3) + '" width="' + (w - 16) + '" height="' + Math.max(2, h - 6) + '" fill="#2a303a"/>' +
      '<circle cx="' + (x + w - 6) + '" cy="' + (y + 5) + '" r="1.8" fill="#22c55e"/>',
    psu: (x, y, w, h) =>
      '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="2" fill="#1f252d" stroke="#0b0e12" stroke-width="1"/>' +
      svgEl.fan(x + Math.min(h, w) * 0.42, y + h / 2, Math.min(h, w) * 0.32) +
      '<rect x="' + (x + w - 34) + '" y="' + (y + h / 2 - 10) + '" width="26" height="20" rx="2" fill="#0b0e12" stroke="#c0c7cf" stroke-width="1"/>' +
      '<rect x="' + (x + w - 27) + '" y="' + (y + h / 2 - 3) + '" width="3" height="6" fill="#c0c7cf"/><rect x="' + (x + w - 22.5) + '" y="' + (y + h / 2 - 3) + '" width="3" height="6" fill="#c0c7cf"/><rect x="' + (x + w - 18) + '" y="' + (y + h / 2 - 3) + '" width="3" height="6" fill="#c0c7cf"/>' +
      '<circle cx="' + (x + w - 40) + '" cy="' + (y + 7) + '" r="2" fill="#22c55e"/>',
    vents: (x, y, w, h) => {
      let s = '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="#161b21" stroke="#0b0e12"/>';
      for (let vx = x + 6; vx < x + w - 4; vx += 9) s += '<rect x="' + vx + '" y="' + (y + 4) + '" width="4" height="' + (h - 8) + '" rx="2" fill="#0a0d11"/>';
      return s;
    },
    text: (x, y, size, color, str, weight) =>
      '<text x="' + x + '" y="' + y + '" font-family="Arial, Helvetica, sans-serif" font-size="' + size + '" font-weight="' + (weight || 700) + '" fill="' + color + '">' + xmlEsc(str) + '</text>'
  };

  function chassis(h, inner) {
    let ears = '';
    const units = Math.round(h / UH);
    for (let u = 0; u < units; u++) {
      [15, W - 15].forEach(sx => {
        ears += '<circle cx="' + sx + '" cy="' + (u * UH + 17) + '" r="5" fill="#2b3038" stroke="#cfd6de" stroke-width="1"/>' +
          '<circle cx="' + sx + '" cy="' + (u * UH + UH - 17) + '" r="5" fill="#2b3038" stroke="#cfd6de" stroke-width="1"/>';
      });
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + h + '" viewBox="0 0 ' + W + ' ' + h + '">' +
      '<defs><linearGradient id="bz" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a5563"/><stop offset="0.45" stop-color="#2b323c"/><stop offset="1" stop-color="#1b2028"/></linearGradient>' +
      '<linearGradient id="ear" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a3acb6"/><stop offset="1" stop-color="#5f6873"/></linearGradient></defs>' +
      '<rect x="0" y="0" width="' + W + '" height="' + h + '" rx="3" fill="#15191f"/>' +
      '<rect x="0" y="0" width="30" height="' + h + '" fill="url(#ear)"/><rect x="' + (W - 30) + '" y="0" width="30" height="' + h + '" fill="url(#ear)"/>' +
      '<rect x="32" y="2" width="' + (W - 64) + '" height="' + (h - 4) + '" rx="2" fill="url(#bz)" stroke="#0b0e12" stroke-width="1.5"/>' +
      ears + inner + '</svg>';
  }

  // Cihaz tipine göre ön/arka görsel + port şablonu
  function buildFace(a, side) {
    const u = Math.max(1, a.uSize || 1);
    const h = u * UH;
    const type = a.assetType;
    const brand = a.manufacturer || '';
    const color = BRAND_COLOR[brand] || '#94a3b8';
    const ports = [];
    const add = (name, type2, cx, cy) => ports.push({ name, type: type2, x: +(cx / W).toFixed(4), y: +(cy / h).toFixed(4) });
    let s = '';
    const label = () => svgEl.text(44, Math.min(h / 2, 34) + 4, 14, color, brand) + svgEl.text(44, Math.min(h / 2, 34) + 18, 8.5, '#9aa3ad', a.model || '', 600);

    if (type === 'Patch Panel') {
      if (side === 'back') return null;
      s += svgEl.text(40, 16, 8, '#f2a900', 'PANDUIT');
      for (let i = 0; i < 24; i++) {
        const cx = 110 + i * 26;
        s += svgEl.text(cx - (i + 1 >= 10 ? 5 : 3), 22, 8, '#cbd5e1', String(i + 1), 600) + '<rect x="' + (cx - 9) + '" y="' + (h / 2 - 7) + '" width="18" height="22" rx="2" fill="#0b0e12" stroke="#9ca3af" stroke-width="1"/>' +
          '<rect x="' + (cx - 5) + '" y="' + (h / 2 + 9) + '" width="10" height="3" fill="#6b7280"/>';
        add(String(i + 1), 'ethernet', cx, h / 2 + 4);
      }
      return { svg: chassis(h, s), ports };
    }

    if (type === 'Sunucu') {
      if (side === 'front') {
        s += label();
        if (u === 1) {
          for (let i = 0; i < 8; i++) s += svgEl.caddy(150 + i * 60, 10, 56, h - 20);
        } else {
          const rows = 3;
          const bh = (h - 20) / rows - 4;
          for (let r = 0; r < rows; r++) for (let c = 0; c < 4; c++) s += svgEl.caddy(150 + c * 116, 10 + r * (bh + 4), 112, bh);
        }
        s += '<circle cx="740" cy="20" r="7" fill="#0b0e12" stroke="#22c55e" stroke-width="1.5"/>';
        s += svgEl.usb(672, h - 20) + svgEl.vga(718, h - 20);
        add('USB', 'usb', 672, h - 20);
        add('VGA', 'vga', 718, h - 20);
      } else {
        const py = u === 1 ? h / 2 : h - 36;
        if (u > 1) s += svgEl.vents(160, 8, 480, h / 2 - 14);
        s += svgEl.psu(38, u === 1 ? 6 : h / 2 + 2, 110, u === 1 ? h - 12 : h / 2 - 8) + svgEl.psu(652, u === 1 ? 6 : h / 2 + 2, 110, u === 1 ? h - 12 : h / 2 - 8);
        add('PSU1', 'power', 38 + 110 - 21, u === 1 ? h / 2 : h / 2 + 2 + (h / 2 - 8) / 2);
        add('PSU2', 'power', 652 + 110 - 21, u === 1 ? h / 2 : h / 2 + 2 + (h / 2 - 8) / 2);
        s += svgEl.usb(190, py) + svgEl.text(172, py + 20, 7, '#9aa3ad', 'USB', 600);
        ['NIC1', 'NIC2', 'NIC3', 'NIC4'].forEach((n, i) => { s += svgEl.rj45(250 + i * 56, py); add(n, 'ethernet', 250 + i * 56, py); });
        ['SFP1', 'SFP2'].forEach((n, i) => { s += svgEl.sfp(490 + i * 56, py); add(n, 'fiber', 490 + i * 56, py); });
        s += svgEl.rj45(612, py);
        add('MGMT', 'ethernet', 612, py);
      }
      return { svg: chassis(h, s), ports };
    }

    if (type === 'Depolama') {
      if (side === 'front') {
        s += label();
        const rows = 4;
        const bh = (h - 24) / rows - 4;
        for (let r = 0; r < rows; r++) for (let c = 0; c < 6; c++) s += svgEl.caddy(160 + c * 98, 12 + r * (bh + 4), 94, bh);
        s += '<circle cx="740" cy="20" r="7" fill="#0b0e12" stroke="#38bdf8" stroke-width="1.5"/>';
      } else {
        ['A', 'B'].forEach((ctl, k) => {
          const y0 = k === 0 ? 6 : h / 2 + 3;
          const ch = h / 2 - 9;
          const cy = y0 + ch / 2;
          s += '<rect x="38" y="' + y0 + '" width="600" height="' + ch + '" rx="2" fill="#1c2129" stroke="#0b0e12"/>' + svgEl.text(50, y0 + 18, 11, '#cbd5e1', 'CTRL-' + ctl);
          s += svgEl.sfp(300, cy) + svgEl.sfp(356, cy) + svgEl.rj45(430, cy) + svgEl.vents(480, y0 + 10, 140, ch - 20);
          add(ctl + '-FC1', 'fiber', 300, cy);
          add(ctl + '-FC2', 'fiber', 356, cy);
          add(ctl + '-MG', 'ethernet', 430, cy);
          s += svgEl.psu(646, y0, 116, ch);
          add('PSU' + (k + 1), 'power', 646 + 116 - 21, cy);
        });
      }
      return { svg: chassis(h, s), ports };
    }

    // Switch / Router / Firewall
    const isSwitch = type === 'Switch';
    if (side === 'front') {
      s += label();
      if (isSwitch) {
        const rows = u > 1 ? 2 : 1;
        const cyRows = rows === 1 ? [h / 2 + 2] : [h / 2 - 22, h / 2 + 22];
        let n = 0;
        for (let c = 0; c < 12; c++) {
          for (let r = 0; r < rows; r++) {
            n++;
            const cx = 170 + c * 40;
            s += svgEl.rj45(cx, cyRows[r]);
            add(String(rows === 1 ? c + 1 : n), 'ethernet', cx, cyRows[r]);
          }
        }
        s += svgEl.sfp(670, h / 2) + svgEl.sfp(716, h / 2);
        add('U1', 'fiber', 670, h / 2);
        add('U2', 'fiber', 716, h / 2);
      } else {
        const cy = h / 2 + (u > 1 ? 8 : 2);
        for (let i = 0; i < 8; i++) { s += svgEl.rj45(190 + i * 44, cy); add(String(i + 1), 'ethernet', 190 + i * 44, cy); }
        s += svgEl.sfp(564, cy) + svgEl.sfp(612, cy) + svgEl.rj45(684, cy);
        add('X1', 'fiber', 564, cy);
        add('X2', 'fiber', 612, cy);
        add('MGMT', 'ethernet', 684, cy);
        if (u > 1) s += '<rect x="560" y="12" width="150" height="26" rx="2" fill="#0b1b2b" stroke="#1e3a5f"/>' + svgEl.text(570, 30, 11, '#38bdf8', 'SYS  HA  STATUS', 700);
      }
    } else {
      for (let i = 0; i < 4; i++) s += svgEl.fan(250 + i * 64, h / 2, Math.min(24, h / 2 - 8));
      s += svgEl.psu(610, 6, 76, h - 12) + svgEl.psu(688, 6, 76, h - 12);
      add('PSU1', 'power', 610 + 76 - 21, h / 2);
      add('PSU2', 'power', 688 + 76 - 21, h / 2);
      s += svgEl.rj45(110, h / 2) + svgEl.rj45(160, h / 2);
      add('CON', 'serial', 110, h / 2);
      add(isSwitch ? 'MGMT' : 'AUX', 'ethernet', 160, h / 2);
    }
    return { svg: chassis(h, s), ports };
  }

  const faceCache = {};
  function face(a, side) {
    const key = (a.assetType || '') + '|' + (a.manufacturer || '') + '|' + (a.model || '') + '|' + (a.uSize || 1) + '|' + side;
    if (!(key in faceCache)) {
      const f = buildFace(a, side);
      faceCache[key] = f ? { img: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(f.svg), ports: f.ports } : null;
    }
    return faceCache[key];
  }

  // ---------------------------------------------------------------------------
  // LNK — iki yönlü port bağlantıları (tohumlu, tüm kat için bir kez)
  // ---------------------------------------------------------------------------
  const cabOfAsset = {};
  D.cabinets.forEach(c => c.assets.forEach(a => { cabOfAsset[a.id] = c; }));
  const uRange = a => String(a.startU) + (a.uSize > 1 ? '-' + (a.startU + a.uSize - 1) : '');
  const isNetCab = c => c.col === '1AS' || c.col === '1AV';
  const WORK_NOTES = ['Kablo etiketlendi, bağlantı Fluke DSX ile test edildi.', 'Yeni devreye alma — İE-2026-0744 kapsamında çekildi.', 'Port yeniden eşleştirildi, eski bağlantı sökülüp raporlandı.', 'Yedekli bağlantı; LACP grubu Po1 üyesi.', 'Müşteri talebi ile aktif edildi.'];
  let LINKS = null;

  function buildLinks() {
    LINKS = {};
    let seq = 0;
    const setEnd = (a, port, side, b, bPort, bSide, linkType, label, work) => {
      (LINKS[a.id] = LINKS[a.id] || {})[port] = { peer: b, peerPort: bPort, peerSide: bSide, linkType, label, work };
    };
    const link = (a, aPort, aSide, b, bPort, bSide, linkType) => {
      if (!a || !b || a.id === b.id) return;
      seq++;
      const rnd = D.rng(D.hash(a.id + aPort));
      const work = { by: pick(rnd, D.personnel).name, date: dateKey(daysFromNow(-Math.round(between(rnd, 12, 640)))), notes: pick(rnd, WORK_NOTES) };
      const label = 'KBL-' + cabOfAsset[a.id].code + '-' + String(seq).padStart(4, '0');
      setEnd(a, aPort, aSide, b, bPort, bSide, linkType, label, work);
      setEnd(b, bPort, bSide, a, aPort, aSide, linkType, label, work);
    };

    // Omurga (network sırası 1AS/1AV) switch portları — sırayla dağıtılır
    const net = [];
    D.cabinets.filter(isNetCab).forEach(c => c.assets.forEach(a => { if (a.assetType === 'Switch') net.push(a); }));
    const used = {};
    let ptr = 0;
    const capOf = a => (a.uSize > 1 ? 24 : 12);
    const allocNet = (exclude) => {
      for (let t = 0; t < net.length; t++) {
        const sw = net[ptr % net.length];
        ptr++;
        if (exclude && sw.id === exclude.id) continue;
        const n = (used[sw.id] || 0) + 1;
        if (n <= capOf(sw)) { used[sw.id] = n; return { sw, port: String(n) }; }
      }
      return null;
    };

    D.cabinets.forEach(c => {
      const pp = c.assets.find(a => a.assetType === 'Patch Panel');
      const tor = isNetCab(c) ? null : c.assets.find(a => a.assetType === 'Switch');
      let ppN = 0;
      let torN = 0;
      const toPP = (a, port) => { if (pp && ppN < 24) { ppN++; link(a, port, 'back', pp, String(ppN), 'front', 'Cat6A U/FTP'); } };
      const toTor = (a, port, side) => {
        if (tor && tor.id !== a.id && torN < capOf(tor)) { torN++; link(a, port, side, tor, String(torN), 'front', 'Cat6A U/FTP'); return; }
        const n = allocNet(a); if (n) link(a, port, side, n.sw, n.port, 'front', 'Cat6A U/FTP');
      };
      const toNet = (a, port, side, type) => { const n = allocNet(a); if (n) link(a, port, side, n.sw, n.port, 'front', type || 'OM4 LC-LC'); };
      c.assets.forEach(a => {
        if (a.assetType === 'Sunucu') {
          toPP(a, 'NIC1');
          toTor(a, 'NIC2', 'back');
          toNet(a, 'MGMT', 'back', 'Cat6 (OOB Yönetim)');
        } else if (a.assetType === 'Depolama') {
          toPP(a, 'A-MG');
          toNet(a, 'A-FC1', 'back', 'OM4 LC-LC (SAN-A)');
          toNet(a, 'B-FC1', 'back', 'OM4 LC-LC (SAN-B)');
        } else if (a.assetType === 'Switch' && !isNetCab(c)) {
          toNet(a, 'U1', 'front', 'OS2 LC-LC (Uplink)');
          toNet(a, 'U2', 'front', 'OS2 LC-LC (Uplink)');
          toPP(a, 'MGMT');
        } else if (a.assetType === 'Router' || a.assetType === 'Firewall') {
          toNet(a, 'X1', 'front', 'OM4 LC-LC');
          toNet(a, 'X2', 'front', 'OM4 LC-LC');
        }
      });
    });
  }

  // PSU → PDU outlet (pdu-detail.html ile aynı outlet eşlemesi, varsa)
  function powerTarget(a, cab, feed) {
    let outlet = 0;
    if (D.pdu && D.pdu.outletAssets) {
      const map = D.pdu.outletAssets(cab.code, feed);
      Object.keys(map).some(k => { if ((map[k] || []).indexOf(a.hostname) >= 0) { outlet = +k; return true; } return false; });
    }
    if (!outlet) outlet = (cab.assets.filter(x => x.powerKw > 0).indexOf(a) % 24) + 1;
    return { cab: cab.code, port: cab.code + '_PDU_' + feed + ' / OUT' + String(outlet).padStart(2, '0') };
  }

  // Cihazın port listesi (CAT şablonu + LNK birleşimi) — cabinet-manager buildPortsFromCatAndLnk karşılığı
  function ports(a, cab) {
    if (!LINKS) buildLinks();
    const out = [];
    ['front', 'back'].forEach(side => {
      const f = face(a, side);
      if (!f) return;
      f.ports.forEach((t, i) => {
        const l = (LINKS[a.id] || {})[t.name];
        const p = {
          id: a.id + '_' + side + '_' + i,
          name: t.name,
          type: t.type,
          side,
          x: t.x,
          y: t.y,
          color: '#4CAF50',
          shape: 'circle',
          connected: false,
          source_asset_id: a.id,
          sourceCabinet: cab ? cab.code : '',
          sourceUPosition: uRange(a),
          target_asset_id: '',
          targetCabinet: '',
          targetUPosition: '',
          targetPortInfo: '',
          targetSide: '',
          targetEndLabel: '',
          switchLabel: '',
          link_type: '',
          workBy: '',
          workDate: '',
          workNotes: ''
        };
        if (l) {
          const pc = cabOfAsset[l.peer.id];
          Object.assign(p, {
            connected: true,
            target_asset_id: l.peer.id,
            target_device_type: l.peer.assetType,
            targetCabinet: pc ? pc.code : '',
            targetUPosition: uRange(l.peer),
            targetPortInfo: l.peerPort,
            targetSide: l.peerSide,
            target_side: l.peerSide,
            targetEndLabel: l.label + '-B',
            switchLabel: l.peer.assetType === 'Switch' ? l.peer.hostname : (a.assetType === 'Switch' ? a.hostname : ''),
            link_type: l.linkType,
            workBy: l.work.by,
            workDate: l.work.date,
            workNotes: l.work.notes
          });
        } else if (t.type === 'power' && cab && a.powerKw > 0) {
          const pt = powerTarget(a, cab, t.name === 'PSU1' ? 'A' : 'B');
          Object.assign(p, {
            connected: true,
            targetCabinet: pt.cab,
            targetUPosition: '-',
            targetPortInfo: pt.port,
            targetEndLabel: 'PWR-' + cab.code + '-' + t.name,
            link_type: 'C13-C14 Güç Kablosu',
            workBy: 'Emre Çelik',
            workDate: dateKey(daysFromNow(-Math.round(between(D.rng(D.hash(a.id + 'pw')), 30, 700)))),
            workNotes: 'Enerji beslemesi ' + (t.name === 'PSU1' ? 'A' : 'B') + ' hattından verildi.'
          });
        }
        out.push(p);
      });
    });
    return out;
  }

  // ---------------------------------------------------------------------------
  // ASM — cihaz detay alanları (populateDeviceDetail karşılığı)
  // ---------------------------------------------------------------------------
  const DEPTS = ['Bilgi Teknolojileri Altyapı Müdürlüğü', 'Ağ Operasyon Müdürlüğü', 'Veri Merkezi Hizmetleri Müdürlüğü', 'Siber Güvenlik Müdürlüğü'];
  const SICIL = ['104582', '118230', '097715', '121904', '110063'];
  const NOTES = ['Yıllık bakım sözleşmesi kapsamında.', 'Firmware güncellemesi planlandı (Q4).', 'Yedek parça stokta mevcut.', '', 'Müşteri erişimi refakatçi ile yapılır.'];
  const asmId = n => 'ASM' + n.toString(16).toUpperCase().padStart(16, '0');

  function details(a, cab) {
    const rnd = D.rng(D.hash(a.id + '-asm'));
    const internal = a.customerType === 'internal';
    const cat = findCatalog(a.manufacturer, a.model);
    const start = daysFromNow(-Math.round(between(rnd, 240, 1500)));
    const years = rnd() < 0.5 ? 3 : 5;
    let end = new Date(start.getTime() + years * 365 * 86400000);
    const r = rnd();
    if (r < 0.14) end = daysFromNow(Math.round(between(rnd, 5, 26)));       // yakında bitecek
    else if (r < 0.24) end = daysFromNow(-Math.round(between(rnd, 20, 200))); // süresi dolmuş
    const service = new Date(end.getTime() + Math.round(between(rnd, 90, 400)) * 86400000);
    const vendor = new Date(end.getTime() - Math.round(between(rnd, 0, 60)) * 86400000);
    const seqNo = 0x10000 + (D.hash(a.id) % 0xfffff);
    return {
      deviceId: asmId(seqNo),
      frontAssetId: internal ? '' : 'MST-' + (cab ? cab.code : 'X') + '-' + String(seqNo % 10000).padStart(4, '0'),
      owning_directorate: internal ? 1 : 0,
      supervisor: internal ? pick(rnd, D.personnel.slice(0, 5)).name : '',
      label: internal ? pick(rnd, DEPTS) : '',
      owner: internal ? '' : a.customer,
      serialNumber: a.serial,
      assetTag: 'TT-RFID-' + (D.hash(a.id + 'rf') >>> 0).toString(16).toUpperCase().padStart(8, '0'),
      hostname: a.hostname,
      primaryIP: a.primaryIP,
      notes: pick(rnd, NOTES),
      assignment: '0',
      stock: '',
      model_id: cat ? cat.model_id : '',
      deviceClass: ((a.manufacturer || '') + ' ' + (a.model || '')).trim(),
      deviceType: a.assetType,
      power: Math.round((a.powerKw || 0) * 1000),
      weight: a.weight || 0,
      powerConnections: a.assetType === 'Patch Panel' ? 0 : 2,
      warranty_start_date: dateKey(start),
      warranty_end_date: dateKey(end),
      service_end_date: dateKey(service),
      vendor_warranty_date: dateKey(vendor),
      lastUpdateDate: dateTime(daysFromNow(-between(rnd, 1, 90))),
      whoUpdate: pick(rnd, SICIL)
    };
  }

  // ---------------------------------------------------------------------------
  // Kabin kapasite limitleri (CAT nature = "Cabinet" jsn.weight / jsn.power)
  // ---------------------------------------------------------------------------
  function capacity(cab) {
    return { weightLimit: isNetCab(cab) ? 900 : 1000, powerLimit: isNetCab(cab) ? 12000 : 8000 };
  }

  // ---------------------------------------------------------------------------
  // CMR/T00 kabin sensör IO'ları (sıcaklık / nem / kapak)
  // ---------------------------------------------------------------------------
  function tempSta(v) { return v >= 30 ? STA.alarm : v >= 27 ? STA.warning : v < 18 ? STA.warning : STA.normal; }

  function sensorIos(code, opts) {
    const o = opts || {};
    const c = D.findCabinet(code);
    if (!c) return [];
    const pfx = c.pod.replace('-', '') + '_K' + c.code;
    const lost = c.status === 'lost';
    const tempScenario = /sıcaklık/i.test(c.note);
    const humScenario = /nem/i.test(c.note);
    const j = amp => (o.live ? (Math.random() - 0.5) * amp : 0);
    const st = s => (o.inhibited ? STA.inhibited : s);
    const row = (suffix, val, unit, desc, sta, cls) => ({ id: pfx + '_' + suffix, rid: pfx + '_' + suffix, val: lost ? '-' : String(val), desc: 'KABİN ' + c.code + ' ' + desc, unit, sta: st(lost ? STA.waiting : sta), xdb_cls: cls });
    const temp = (v, suffix, desc) => row(suffix, (v + j(0.2)).toFixed(1), '°C', desc, tempScenario ? tempSta(v) : STA.normal, 'TEMP');
    const doorSta = side => {
      if (c.lockState === 'fault') return STA.waiting;
      if (side === 'front' && c.lockAlarm && c.frontDoor !== 'open' && c.rearDoor !== 'open') return STA.warning;
      return (side === 'front' ? c.frontDoor : c.rearDoor) === 'open' ? STA.alarm : STA.normal;
    };
    return [
      temp(c.tempTop, 'TEMP_TOP', 'ÜST SICAKLIK'),
      temp(c.tempMid, 'TEMP_MID', 'ORTA SICAKLIK'),
      temp(c.tempLow, 'TEMP_BOT', 'ALT SICAKLIK'),
      row('HUM_MID', (c.humidity + j(0.6)).toFixed(1), '%RH', 'ORTA NEM', humScenario && c.humidity >= 60 ? STA.warning : STA.normal, 'HUM'),
      row('FDOOR', c.frontDoor === 'open' ? 1 : 0, '-', 'ÖN KAPAK', doorSta('front'), 'DOOR'),
      row('RDOOR', c.rearDoor === 'open' ? 1 : 0, '-', 'ARKA KAPAK', doorSta('rear'), 'DOOR')
    ];
  }

  // ---------------------------------------------------------------------------
  // CMR/T01 PDU dev blokları — DCIM.data.pdu varsa onu kullanır (pdu-detail.html ile tutarlı)
  // ---------------------------------------------------------------------------
  function pduDevs(code, opts) {
    const o = opts || {};
    const c = D.findCabinet(code);
    if (!c) return [];
    let devs;
    if (D.pdu && D.pdu.query) {
      devs = D.pdu.query(c.code, !!o.live);
    } else {
      devs = ['A', 'B'].map(side => {
        const rnd = D.rng(D.hash(c.code + '-pdu-' + side));
        const curr = side === 'A' ? c.pduA : c.pduB;
        const volt = between(rnd, 229, 231.5);
        const base = 'K' + c.code + '_PDU_' + side;
        const alarm = side === 'B' && c.pduFault;
        return {
          id: base + '_DV',
          con_host: '10.10.' + (40 + c.code.charCodeAt(2) % 20) + '.' + (side === 'A' ? '11' : '12'),
          sta: alarm ? '0x000B' : '0x0003',
          io: [
            { id: base + '_IN_CURR', val: String(curr), unit: 'A', sta: '0x0003' },
            { id: base + '_IN_VOLT', val: volt.toFixed(1), unit: 'V', sta: '0x0003' },
            { id: base + '_IN_POW', val: String(Math.round(curr * volt * 0.96)), unit: 'W', sta: '0x0003' }
          ]
        };
      });
    }
    if (o.inhibited) devs.forEach(d => { d.sta = STA.inhibited; });
    return devs;
  }

  D.cabinetMgr = {
    STA,
    locations: LOCATIONS,
    stockLocations: STOCK_LOCATIONS,
    catalog: CATALOG,
    findCatalog,
    locationOf: cab => LOCATIONS.find(l => l.pod === cab.pod) || null,
    cabinetOfAsset: id => cabOfAsset[id] || null,
    findAsset: id => { const c = cabOfAsset[id]; return c ? c.assets.find(a => a.id === id) || null : null; },
    registerAsset: (a, cab) => { cabOfAsset[a.id] = cab; },
    face,
    ports,
    details,
    capacity,
    sensorIos,
    pduDevs,
    uRange
  };
})();

/* ==========================================================================
   Müşteri Eşleştirme
   ========================================================================== */
/* ==========================================================================
   DCIM Sunum — Müşteri Eşleştirme mock verisi (parça dosya)
   WOR/S00 WOR_List (tamamlanmış enerji siparişleri), CDB/S00 CDB_List
   (PDU-outlet eşleşmiş müşteriler) ve CMR/* PDU/PMM cihaz listesinin karşılığı.
   Bağımlılık: js/mock-data.js → DCIM.data (cabinets, rng, hash)
   Sonradan mock-data.js içine birleştirilmek üzere kendi başına çalışır.
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D) return;

  const rnd = D.rng(D.hash('customers-cdb-2026'));
  const between = (min, max) => min + (max - min) * rnd();
  const int = (min, max) => Math.floor(between(min, max + 1));
  const pick = arr => arr[Math.floor(rnd() * arr.length) % arr.length];
  const pad = n => String(n).padStart(2, '0');
  const NOW = Date.now();
  const fmt = t => {
    const d = new Date(t);
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  };
  const daysAgo = (d, h) => NOW - d * 86400000 - (h || 0) * 3600000;

  // ---------------------------------------------------------------------------
  // CMR/* — PDU ve PMM cihazları (customer-change PDU seçimi)
  // Cihaz kimliği AyXDB biçimindedir: 'K' + kabin + '_PDU_A' (ekranda 'K' atılır)
  // ---------------------------------------------------------------------------
  const COL_INDEX = {};
  let colSeq = 0;
  function pduIp(cab, side) {
    const col = cab.col;
    if (COL_INDEX[col] == null) COL_INDEX[col] = colSeq++;
    const num = parseInt(cab.code.slice(3), 10) || 0;
    return '10.10.' + (40 + COL_INDEX[col]) + '.' + (num * 2 + (side === 'A' ? 1 : 2));
  }
  function outletIo(count) {
    const io = [{ id: 'IO_IN01_KWH', mtr_pow: '1' }];
    for (let i = 1; i <= count; i++) io.push({ id: 'IO_OUT' + pad(i) + '_KWH', mtr_pow: String(-i) });
    return io;
  }

  const PDUS = [];
  D.cabinets.forEach(cab => {
    const outlets = cab.col === '1AS' || cab.col === '1AV' ? 16 : 24;
    ['A', 'B'].forEach(side => {
      PDUS.push({
        id: 'K' + cab.code + '_PDU_' + side,
        con_host: pduIp(cab, side),
        doc: 'CMR/T01',
        cabinet: cab.code,
        side,
        io: outletIo(outlets)
      });
    });
  });
  // Pano güç analizörleri (PMM) — kanal bazlı (pozitif) ölçüm
  [
    { id: 'KMASTER_PANO_PMM1', ip: '10.10.90.11' },
    { id: 'KA1_KLIMA_PANOSU_PMM', ip: '10.10.90.21' },
    { id: 'KB1_KLIMA_PANOSU_PMM', ip: '10.10.90.22' },
    { id: 'KUPS_CIKIS_PANO_A_PMM', ip: '10.10.90.31' },
    { id: 'KUPS_CIKIS_PANO_B_PMM', ip: '10.10.90.32' }
  ].forEach(p => PDUS.push({ id: p.id, con_host: p.ip, doc: 'CMR/T02', cabinet: '', side: '', io: [1, 2, 3, 4, 5, 6].map(n => ({ id: 'IO_IN0' + n + '_KWH', mtr_pow: String(n) })) }));

  PDUS.sort((a, b) => {
    const ia = a.id.charAt(0) === 'K' ? a.id.slice(1) : a.id;
    const ib = b.id.charAt(0) === 'K' ? b.id.slice(1) : b.id;
    return ia < ib ? -1 : ia > ib ? 1 : 0;
  });
  const PDU_BY_ID = {};
  PDUS.forEach(p => { PDU_BY_ID[p.id] = p; });

  // ---------------------------------------------------------------------------
  // Müşteriler — mock-data.js kabin müşterileriyle aynı adlar (tutarlılık)
  // ---------------------------------------------------------------------------
  const PACKAGES = [
    { name: 'Sunucu Barındırma - Tam Kabin (42U) 5 kW', mode: 'inlet' },
    { name: 'Kabin Kiralama - Yüksek Yoğunluk 8 kW', mode: 'inlet' },
    { name: 'Sunucu Barındırma - Yarım Kabin (21U) 2,5 kW', mode: 'outlet', n: [6, 10] },
    { name: 'Sunucu Barındırma - 4U Paylaşımlı Kabin', mode: 'outlet', n: [2, 4] },
    { name: 'Colocation - 1U Sunucu Barındırma', mode: 'outlet', n: [1, 2] },
    { name: 'Ek Enerji Paketi - 2 kW', mode: 'outlet', n: [3, 5] },
    { name: 'Kesintisiz Enerji Hattı - 16A Çift Besleme', mode: 'outlet', n: [2, 3] }
  ];

  const EXISTING = [
    { name: 'Anadolu Finans A.Ş.', cdb: '1013312753', erp: '8100427715', products: 6 },
    { name: 'Delta Yazılım', full: 'Delta Yazılım Teknolojileri A.Ş.', cdb: '1013318420', erp: '8100433902', products: 7 },
    { name: 'Başkent Belediyesi', full: 'Başkent Belediyesi Bilgi İşlem Daire Başkanlığı', cdb: '1013290017', erp: '8100398841', products: 5 },
    { name: 'Marmara Sigorta', full: 'Marmara Sigorta A.Ş.', cdb: '1013325566', erp: '8100441278', products: 5 },
    { name: 'Ege Lojistik', full: 'Ege Lojistik ve Taşımacılık A.Ş.', cdb: '1013301984', erp: '8100412036', products: 5 },
    { name: 'Kuzey Enerji', full: 'Kuzey Enerji Dağıtım A.Ş.', cdb: '1013334409', erp: '8100450193', products: 5 }
  ];

  const used = {}; // pduId -> Set(outlet numarası)
  const markUsed = (dev, nums) => {
    if (!used[dev]) used[dev] = new Set();
    nums.forEach(n => { if (n < 0) used[dev].add(n); });
  };
  const freeOutlets = (dev, count) => {
    const p = PDU_BY_ID[dev];
    const u = used[dev] || new Set();
    const free = p.io.map(o => Number(o.mtr_pow)).filter(n => n < 0 && !u.has(n)).sort((a, b) => b - a);
    return free.slice(0, count);
  };

  let epSeq = 5013400120;
  let svcSeq = 4102380;
  const CDB = [];
  const fullCabs = new Set(); // girişten (inlet) ölçülen tam kabinler
  EXISTING.forEach(cu => {
    const cabs = D.cabinets.filter(c => c.customer === cu.name);
    const inletCabs = cabs.slice();
    for (let i = 0; i < cu.products; i++) {
      const pkg = i < 2 ? PACKAGES[i % 2] : pick(PACKAGES);
      const meter = [];
      if (pkg.mode === 'inlet') {
        // Tam kabin: iki PDU'nun girişi (inlet) ölçülür
        const cab = inletCabs.splice(Math.floor(rnd() * inletCabs.length), 1)[0] || pick(cabs);
        fullCabs.add(cab.code);
        ['A', 'B'].forEach(side => {
          const dev = 'K' + cab.code + '_PDU_' + side;
          meter.push({ doc: 'CMR/T01', dev, meter: [1] });
        });
      } else {
        // Paylaşımlı: A/B beslemede aynı outletler (çift besleme)
        const shared = cabs.filter(c => !fullCabs.has(c.code));
        const cab = pick(shared.length ? shared : cabs);
        const n = int(pkg.n[0], pkg.n[1]);
        const outs = freeOutlets('K' + cab.code + '_PDU_A', n);
        ['A', 'B'].forEach(side => {
          const dev = 'K' + cab.code + '_PDU_' + side;
          markUsed(dev, outs);
          meter.push({ doc: 'CMR/T01', dev, meter: outs.slice() });
        });
        // Bazı büyük müşterilerde ikinci kabinden ek hat
        if (rnd() < 0.25) {
          const cab2 = pick(shared.length ? shared : cabs);
          const dev2 = 'K' + cab2.code + '_PDU_A';
          if (dev2 !== meter[0].dev) {
            const outs2 = freeOutlets(dev2, int(1, 3));
            markUsed(dev2, outs2);
            meter.push({ doc: 'CMR/T01', dev: dev2, meter: outs2 });
          }
        }
      }
      const start = daysAgo(int(20, 640), int(0, 20));
      CDB.push({
        rid: 'CD00000000' + Number(cu.cdb).toString(16).toUpperCase().padStart(8, '0') + '_' + (epSeq + 1),
        cdb_id: cu.cdb,
        erp_id: cu.erp,
        customer_name: cu.full || cu.name,
        energy_product_id: String(++epSeq),
        svc_desc: pkg.name,
        svc_id: String(svcSeq += int(7, 41)),
        tim_bgn: fmt(start),
        tim_end: '',
        meter: JSON.stringify(meter)
      });
    }
  });

  // ---------------------------------------------------------------------------
  // WOR/S00 — tamamlanmış (0x0304) enerji siparişleri, henüz PDU'ya eşleşmemiş
  // ---------------------------------------------------------------------------
  const NEW_CUSTOMERS = [
    { name: 'Toros Gıda Sanayi ve Ticaret A.Ş.', cdb: '1013342871', erp: '8100462310' },
    { name: 'Karadeniz Holding A.Ş.', cdb: '1013344102', erp: '8100463377' },
    { name: 'Boğaziçi Medya Grubu A.Ş.', cdb: '1013345930', erp: '8100464025' },
    { name: 'Kapadokya Turizm İşletmeleri A.Ş.', cdb: '1013346618', erp: '8100465190' },
    { name: 'Trakya Tekstil San. A.Ş.', cdb: '1013347207', erp: '8100466842' },
    { name: 'Pamukkale Sağlık Hizmetleri A.Ş.', cdb: '1013348453', erp: '8100467009' },
    { name: 'Atlas Bulut Bilişim A.Ş.', cdb: '1013349788', erp: '8100468551' },
    { name: 'Hitit Bankacılık Teknolojileri A.Ş.', cdb: '1013350126', erp: '8100469734' },
    { name: 'Uludağ Otomotiv Yan Sanayi A.Ş.', cdb: '1013351674', erp: '8100470288' },
    { name: 'Akdeniz E-Ticaret Hizmetleri A.Ş.', cdb: '1013352019', erp: '8100471463' },
    { name: 'Göktürk Savunma Sistemleri A.Ş.', cdb: '1013353340', erp: '8100472118' },
    { name: 'Yıldız Portföy Yönetimi A.Ş.', cdb: '1013354592', erp: '8100473806' }
  ];
  const ORDER_PACKAGES = [
    'Sunucu Barındırma - Tam Kabin (42U) 5 kW',
    'Sunucu Barındırma - Yarım Kabin (21U) 2,5 kW',
    'Sunucu Barındırma - 4U Paylaşımlı Kabin',
    'Colocation - 1U Sunucu Barındırma',
    'Ek Enerji Paketi - 2 kW',
    'Kabin Kiralama - Yüksek Yoğunluk 8 kW',
    'Kesintisiz Enerji Hattı - 16A Çift Besleme'
  ];

  const WOR = [];
  let worSeq = 26090410;
  function addOrder(cu, opts) {
    const o = opts || {};
    const end = daysAgo(o.day != null ? o.day : between(0.2, 21), 0);
    const begin = end - between(2, 9) * 86400000;
    WOR.push({
      id: 'WR' + String(worSeq++).padStart(12, '0'),
      sta: '0x0304',
      cdb_id: cu.cdb,
      erp_id: cu.erp,
      customer_name: cu.name,
      energy_product_id: o.ep || String(5013500000 + int(100, 9999)),
      svc_desc: o.pkg || pick(ORDER_PACKAGES),
      svc_id: String(4103000 + int(10, 999)),
      tim_bgn: fmt(begin),
      tim_end: fmt(end),
      tim_end_ms: end,
      is_matched: !!o.matched,
      meter: '',
      pdu_ip: '',
      outlet_no: ''
    });
  }
  NEW_CUSTOMERS.forEach((cu, i) => addOrder(cu, { day: 0.3 + i * 1.4 }));
  // Mevcut müşterilerin ek enerji siparişleri
  addOrder({ name: 'Anadolu Finans A.Ş.', cdb: EXISTING[0].cdb, erp: EXISTING[0].erp }, { pkg: 'Ek Enerji Paketi - 2 kW', day: 0.9 });
  addOrder({ name: 'Ege Lojistik ve Taşımacılık A.Ş.', cdb: EXISTING[4].cdb, erp: EXISTING[4].erp }, { pkg: 'Sunucu Barındırma - 4U Paylaşımlı Kabin', day: 2.6 });
  addOrder({ name: 'Delta Yazılım Teknolojileri A.Ş.', cdb: EXISTING[1].cdb, erp: EXISTING[1].erp }, { pkg: 'Kesintisiz Enerji Hattı - 16A Çift Besleme', day: 4.2 });
  addOrder({ name: 'Marmara Sigorta A.Ş.', cdb: EXISTING[3].cdb, erp: EXISTING[3].erp }, { pkg: 'Colocation - 1U Sunucu Barındırma', day: 6.8 });
  // Aynı enerji ürününe ait yinelenen (sonradan tamamlanan) iş emirleri → ekranda gizlenir
  [0, 2, 5].forEach(i => {
    const src = WOR[i];
    addOrder(NEW_CUSTOMERS[i], { ep: src.energy_product_id, pkg: src.svc_desc, day: Math.max(0.05, (NOW - src.tim_end_ms) / 86400000 - 0.4) });
  });
  // CDB'de zaten eşleşmiş ürün için tekrar gelen iş emri → ekranda gizlenir
  addOrder({ name: CDB[0].customer_name, cdb: CDB[0].cdb_id, erp: CDB[0].erp_id }, { ep: CDB[0].energy_product_id, pkg: CDB[0].svc_desc, day: 1.1 });
  // Bugün eşleştirilmiş kayıtlar ("Eşleşme Yapılanlar" penceresi)
  [
    { name: 'Kuzey Enerji Dağıtım A.Ş.', cdb: EXISTING[5].cdb, erp: EXISTING[5].erp, pkg: 'Ek Enerji Paketi - 2 kW' },
    { name: 'Başkent Belediyesi Bilgi İşlem Daire Başkanlığı', cdb: EXISTING[2].cdb, erp: EXISTING[2].erp, pkg: 'Sunucu Barındırma - Yarım Kabin (21U) 2,5 kW' },
    { name: 'Anadolu Finans A.Ş.', cdb: EXISTING[0].cdb, erp: EXISTING[0].erp, pkg: 'Colocation - 1U Sunucu Barındırma' }
  ].forEach((m, i) => addOrder(m, { pkg: m.pkg, day: 0.1 + i * 0.12, matched: true }));

  D.customers = {
    pdus: PDUS,
    findPdu: id => PDU_BY_ID[id] || null,
    cdbList: CDB,
    worList: WOR
  };
})();

/* ==========================================================================
   Sistem Sağlığı
   ========================================================================== */
/* ==========================================================================
   DCIM Sunum — Sistem Sağlığı mock verisi (parça dosya)
   AyxdbHealthService sorgularının (DAS/S00 XDBT) ham satır karşılıkları:
     roots       doc('DAS/*,CMR/*,CME/*,CMA/*,WOR/*,EXT/*')/xdb
     threads     .../xdb/data//thr
     connections .../xdb/data//con
     devices     doc('CMR/*')/xdb/data//dev
   sta bitleri: 0x0003 motor durumu (0 devre dışı, 1-2 çalışmıyor, 3 çalışıyor),
                0x000C değer durumu (0x4 uyarı, 0x8 alarm).
   Bağımlılık: js/mock-data.js → DCIM.data (cabinets, ups, climates, panels, rng, hash)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D) return;

  const RUN = 0x0003;
  const WARN = 0x0004;
  const ALARM = 0x0008;
  const OFFLINE = 0x0001;

  // ---------------------------------------------------------------------------
  // Çalışma bileşenleri (runtime) — sabit tanım + tick'e göre dalgalanan ölçümler
  // ---------------------------------------------------------------------------
  // p: profil → healthy | busy | overrun | drop | nometrics | session
  const ROOTS = [
    { rid: 'DAS_S00', doc: 'DAS/S00', desc: 'Veri Erişim Servisi (MQTT köprüsü)', load: 34 },
    { rid: 'CMR_T01', doc: 'CMR/T01', desc: 'Modbus TCP saha toplayıcı (PDU / kabin sensörleri)', load: 58 },
    { rid: 'CMR_T02', doc: 'CMR/T02', desc: 'SNMP toplayıcı (UPS / pano analizörleri)', load: 47 },
    { rid: 'CMR_T03', doc: 'CMR/T03', desc: 'BACnet / Modbus RTU toplayıcı (klima / pano)', load: 29 },
    { rid: 'CMR_T04', doc: 'CMR/T04', desc: 'Kilit ağ geçitleri', load: 18 },
    { rid: 'CME_S00', doc: 'CME/S00', desc: 'Enerji hesaplama motoru (PUE / CDR)', load: 61 },
    { rid: 'CMA_S00', doc: 'CMA/S00', desc: 'Alarm yönetimi', load: 42 },
    { rid: 'WOR_S00', doc: 'WOR/S00', desc: 'İş emirleri', load: 9 },
    { rid: 'EXT_S00', doc: 'EXT/S00', desc: 'ERP / CRM entegrasyonu', load: 12 },
    { rid: 'EXT_S01', doc: 'EXT/S01', desc: 'Harici kilit ajanı (eski motor)', p: 'nometrics' }
  ];
  const THREADS = [
    { rid: 'thr_mqtt_io', doc: 'DAS/S00', desc: 'MQTT yayın / abonelik', load: 38, wrk: 2 },
    { rid: 'thr_qry', doc: 'DAS/S00', desc: 'XDBT sorgu işleyici', load: 31, wrk: 4 },
    { rid: 'thr_mb_ns', doc: 'CMR/T01', desc: 'Modbus TCP yoklama NS1-NS2', load: 44, wrk: 2 },
    { rid: 'thr_mb_pod1_4', doc: 'CMR/T01', desc: 'Modbus TCP yoklama POD-1..4', load: 52, wrk: 3 },
    { rid: 'thr_mb_pod5_7', doc: 'CMR/T01', desc: 'Modbus TCP yoklama POD-5..7', load: 71, wrk: 3, p: 'drop' },
    { rid: 'thr_mb_pod8_10', doc: 'CMR/T01', desc: 'Modbus TCP yoklama POD-8..10', load: 49, wrk: 3 },
    { rid: 'thr_snmp_ups', doc: 'CMR/T02', desc: 'SNMP yoklama UPS A/B', load: 76, wrk: 2, p: 'overrun' },
    { rid: 'thr_snmp_pmm', doc: 'CMR/T02', desc: 'SNMP yoklama PMM', load: 22, wrk: 1 },
    { rid: 'thr_bac_klima', doc: 'CMR/T03', desc: 'BACnet klima yoklama', load: 33, wrk: 2 },
    { rid: 'thr_rtu_pano', doc: 'CMR/T03', desc: 'Modbus RTU pano yoklama', load: 27, wrk: 1 },
    { rid: 'thr_sns_gw', doc: 'CMR/T04', desc: 'Kilit olay dinleyici', load: 16, wrk: 1 },
    { rid: 'thr_pue', doc: 'CME/S00', desc: 'PUE / enerji hesaplama', load: 86, wrk: 4, p: 'busy' },
    { rid: 'thr_cdr', doc: 'CME/S00', desc: 'Müşteri CDR üretimi', load: 41, wrk: 2 },
    { rid: 'thr_alarm_eval', doc: 'CMA/S00', desc: 'Alarm kural değerlendirme', load: 57, wrk: 2 },
    { rid: 'thr_notify', doc: 'CMA/S00', desc: 'Bildirim (e-posta / SMS)', load: 8, wrk: 1 },
    { rid: 'thr_wor', doc: 'WOR/S00', desc: 'İş emri durum makinesi', load: 6, wrk: 1 },
    { rid: 'thr_erp_sync', doc: 'EXT/S00', desc: 'ERP sipariş senkronizasyonu', load: 14, wrk: 1 },
    { rid: 'thr_lock_agent', doc: 'EXT/S01', desc: 'Kilit ajanı olay kuyruğu', p: 'nometrics' }
  ];
  const CONNECTIONS = [
    { rid: 'con_mqtt', doc: 'DAS/S00', desc: 'MQTT broker (tcp://127.0.0.1:1883)', load: 21, ses: [214, 512] },
    { rid: 'con_odbc', doc: 'DAS/S00', desc: 'PostgreSQL veri yazıcı (AyCONodbc)', load: 46, ses: [29, 32], p: 'session' },
    { rid: 'con_mb_gw', doc: 'CMR/T01', desc: 'Modbus TCP ağ geçitleri', load: 39, ses: [36, 64] },
    { rid: 'con_snmp', doc: 'CMR/T02', desc: 'SNMP v2c ajanları', load: 28, ses: [19, 32] },
    { rid: 'con_bacnet', doc: 'CMR/T03', desc: 'BACnet/IP', load: 17, ses: [14, 32] },
    { rid: 'con_rest_erp', doc: 'EXT/S00', desc: 'ERP REST API', load: 7, ses: [2, 8] }
  ];

  function metricRow(def, tick, kind) {
    const rnd = D.rng(D.hash(def.rid + ':' + tick));
    const j = (base, spread) => Math.max(0, base + (rnd() - 0.5) * 2 * spread);
    const row = { rid: def.rid, qry_doc: def.doc, desc: def.desc, sta: RUN, eng_mode: 1, tmr_cnt: kind === 'xdb' ? 12 : 3 };
    if (def.p === 'nometrics') return row; // yük alanları yok (AY_LOAD_STATS derlenmemiş)
    const load = j(def.load || 20, def.p === 'busy' ? 2 : 4);
    row.thr_wrk = def.wrk || 1;
    row.thr_win_ms = Math.round(j(1000, 18));
    row.thr_tot_lps = Math.round(load * 10) / 10;
    // Dolu bileşende worker havuzu dengeli (ortalama ve tepe birlikte yüksek → "Dolu, yetişiyor")
    row.wrk_tot_lps = Math.round((def.p === 'busy' ? j(load - 1, 1) : j(load * 0.92, 3)) * 10) / 10;
    row.wrk_tot_lps_max = Math.round(Math.min(99, def.p === 'busy' ? j(load + 2, 1) : Math.min(78, j(load * 1.04, 3))) * 10) / 10;
    row.thr_que_cnt = 0;
    row.wrk_que_cnt = 0;
    row.thr_que_aps = Math.round(j(load * 3.1, 6));
    row.thr_que_rps = row.thr_que_aps;
    row.thr_lat_us = Math.round(j(1800 + load * 60, 400));
    row.thr_lat_max_us = Math.round(row.thr_lat_us * j(3.2, 0.6));
    row.wrk_lat_us = Math.round(row.thr_lat_us * 0.8);
    row.wrk_lat_max_us = Math.round(row.thr_lat_max_us * 0.9);
    row.thr_cyc_ovr = 0;
    row.wrk_cyc_ovr = 0;
    row.tmr_skp = 0;
    if (def.ses) {
      row.ses_cnt = def.p === 'session' ? def.ses[0] + (tick % 3 === 0 ? 1 : 0) : Math.round(j(def.ses[0], def.ses[0] * 0.08));
      row.con_ses = def.ses[1];
    }
    if (def.p === 'overrun') {
      // UPS B7 SNMP zaman aşımları çevrim bütçesini dolduruyor
      row.thr_cyc_ovr = 3 + (tick % 4);
      row.thr_lat_us = Math.round(j(182000, 20000));
      row.thr_lat_max_us = Math.round(j(640000, 60000));
    }
    if (def.p === 'drop') {
      // 1CE51 sensör modülü Modbus zaman aşımı → tetiklemeler düşüyor
      row.tmr_skp = 1840 + tick * 3 + (tick % 2);
      row.thr_lat_us = Math.round(j(96000, 12000));
      row.thr_lat_max_us = Math.round(j(430000, 40000));
    }
    return row;
  }

  // ---------------------------------------------------------------------------
  // Saha cihazları (CMR/*) — senaryo ile tutarlı durumlar
  // ---------------------------------------------------------------------------
  const SENSOR_STATE = { '1BJ53': ALARM, '1BC37': ALARM, '1BQ55': WARN, '1CE56': WARN, '1BX50': WARN, '1BU54': WARN };
  const PDU_STATE = { '1AV42_B': ALARM, '1CB52_A': WARN };
  const EQUIP_STATE = { alarm: ALARM, warning: WARN };

  function buildDevices() {
    const list = [];
    const push = (rid, doc, desc, cls, sta, con) => list.push({ rid, qry_doc: doc, desc, dev_nfo: desc, sta, xdb_cls: cls, pro_con: con });
    D.cabinets.forEach(c => {
      const lost = c.status === 'lost';
      push('IDC1_' + c.code + '_SNS', 'CMR/T01', 'Kabin ' + c.code + ' Sensör Modülü', 'SNS', lost ? OFFLINE : RUN | (SENSOR_STATE[c.code] || 0), 'con_mb_gw');
      ['A', 'B'].forEach(side => {
        push('K' + c.code + '_PDU_' + side, 'CMR/T01', 'Kabin ' + c.code + ' PDU-' + side, 'PDU', RUN | (PDU_STATE[c.code + '_' + side] || 0), 'con_mb_gw');
      });
    });
    D.ups.forEach(u => push('KAT1_SAL1_' + u.label.replace(/\s+/g, '').replace('UPS', '') + '_UPS', 'CMR/T02', u.label, 'UPS', u.status === 'lost' ? OFFLINE : RUN | (EQUIP_STATE[u.status] || 0), 'con_snmp'));
    ['Master Pano PMM-1', 'A1 Klima Panosu PMM', 'B1 Klima Panosu PMM', 'UPS Çıkış Panosu A PMM', 'UPS Çıkış Panosu B PMM'].forEach((d, i) =>
      push('PMM_' + (i + 1), 'CMR/T02', d, 'PMM', RUN, 'con_snmp'));
    push('PMM_7', 'CMR/T02', 'Yedek Pano Analizörü PMM-7', 'PMM', 0, 'con_snmp'); // devre dışı (planlı)
    D.climates.forEach(k => push('IDC1_' + k.label.replace(/\s+/g, ''), 'CMR/T03', k.label, 'KLM', RUN | (EQUIP_STATE[k.status] || 0), 'con_bacnet'));
    D.panels.forEach((p, i) => push('PANO_' + (i + 1), 'CMR/T03', p.label, 'PNL', RUN | (EQUIP_STATE[p.status] || 0), 'con_bacnet'));
    const pods = Array.from(new Set(D.cabinets.map(c => c.pod)));
    pods.forEach(pod => push('SNS_GW_' + pod.replace('-', ''), 'CMR/T04', 'Kilit Ağ Geçidi ' + pod, 'GW', RUN, 'con_mb_gw'));
    return list;
  }
  const DEVICES = buildDevices();

  D.health = {
    // tick: 5 sn'lik yoklama sırası; aynı tick her zaman aynı değerleri üretir
    sample(tick) {
      return {
        roots: ROOTS.map(d => metricRow(d, tick, 'xdb')),
        threads: THREADS.map(d => metricRow(d, tick, 'thread')),
        connections: CONNECTIONS.map(d => metricRow(d, tick, 'connection')),
        devices: DEVICES.map(d => Object.assign({}, d))
      };
    },
    pollIntervalMs: 5000
  };
})();

/* ==========================================================================
   Raporlar: PUE / CUE / UPS
   ========================================================================== */
/* ==========================================================================
   DCIM Sunum — Rapor mock verileri (R1: PUE, CUE, UPS Modül raporları)
   XDB_GetValue / api.HIS_Pue / api.HIS_Cue / queryHisUpsandTrafo çağrılarının yerine
   geçen tohumlu (deterministik) üreticiler. Aynı filtre → aynı veri.
   Bağımlılık: js/mock-data.js (DCIM.data.ups, DCIM.data.panels, rng, hash)
   Not: Yükleme anında DOM'a erişilmez; ileride mock-data.js ile birleştirilecek.
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  const R = (D.reports = D.reports || {});

  const rngOf = key => D.rng(D.hash(String(key)));
  const between = (rnd, min, max) => min + (max - min) * rnd();
  const pad = n => String(n).padStart(2, '0');
  const dateKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseDay = s => { const p = String(s).split('-').map(Number); return new Date(p[0], (p[1] || 1) - 1, p[2] || 1); };
  const dayOfYear = d => Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  const pointVal = (eq, label) => { const p = (eq.points || []).find(x => x.label === label); return p ? Number(p.value) : NaN; };
  const upsCode = label => String(label).replace(/^UPS\s*/i, '');
  const byUpsLabel = (a, b) => a.label.localeCompare(b.label, 'tr', { numeric: true });

  // Tarih aralığındaki günler (bugünden sonrası veri içermez); en fazla 400 gün
  function daysBetween(start, end) {
    const out = [];
    if (!start || !end) return out;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let d = parseDay(start);
    const last = parseDay(end);
    while (d <= last && d <= today && out.length < 400) {
      out.push(new Date(d));
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    }
    return out;
  }
  // Saatlik mod: filterDate günündeki startTime..endTime saat dilimleri (gelecek saatler hariç)
  function hoursBetween(date, startTime, endTime) {
    const out = [];
    if (!date) return out;
    const base = parseDay(date);
    const h0 = parseInt(String(startTime || '00').split(':')[0], 10) || 0;
    const h1 = parseInt(String(endTime || '23').split(':')[0], 10);
    const now = Date.now();
    for (let h = h0; h <= (isNaN(h1) ? 23 : h1); h++) {
      const t = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, 0, 0);
      if (t.getTime() > now) break;
      out.push(t);
    }
    return out;
  }

  // ===========================================================================
  // PUE / CUE — Kat bazlı anlık güç kaynakları
  // ===========================================================================
  // floorOptions ile aynı doküman kimlikleri (CMR/T00 = 1. Kat Salon 1 — gerçek yerleşim)
  const ENERGY_FLOORS = {
    'CMR/T00': { prefix: '1.Kat Sistem Salonu', pue: D.site && D.site.pue ? D.site.pue : 1.42 },
    'CMR/T02': { prefix: '2.Kat Sistem Salonu', pue: 1.48, panels: ['A1 Klima Panosu', 'A2 Klima Panosu', 'B1 Klima Panosu', 'B2 Klima Panosu', 'Klimalar Kontrol Panosu'], sdp: ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4', 'B5'] },
    'CMR/T03': { prefix: '3.Kat Sistem Salonu', pue: 1.53, panels: ['A1 Klima Panosu', 'A2 Klima Panosu', 'B1 Klima Panosu', 'B2 Klima Panosu'], sdp: ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4'] },
    'CMR/T04': { prefix: 'IDC4 Salon-1', pue: 1.36, panels: ['C1 Klima Panosu', 'C2 Klima Panosu', 'D1 Klima Panosu', 'D2 Klima Panosu', 'Klimalar Kontrol Panosu', 'CRAH Klima Panosu'], sdp: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2'] }
  };

  // 1. Kat: gerçek pano (Toplam Aktif Güç) ve UPS (yük oranı) değerleri.
  // UPS A5 akü modunda → giriş gücü 0 W; UPS B7 SNMP kaybı → son okunan (bayat) değer.
  function floor1Sources(tick) {
    const jit = rngOf('pue-live-T00-' + tick);
    const facility = D.panels.map(p => {
      const kw = pointVal(p, 'Toplam Aktif Güç');
      return {
        id: 'T00_' + p.devId + '_KLM_PANO_TOT_POW',
        desc: '1.Kat Sistem Salonu ' + p.label + ' Toplam Gücü',
        val: Math.round((isNaN(kw) ? 32 : kw) * 1000 * between(jit, 0.985, 1.015))
      };
    });
    const it = D.ups.slice().sort(byUpsLabel).map(u => {
      const code = upsCode(u.label);
      const battery = u.status === 'alarm' && /Akü/i.test(u.note || '');
      const stale = u.status === 'lost';
      // 80 kVA modül, %yük × 0,8 kW ≈ çıkış gücü; giriş = çıkış / verim (0,955)
      const kw = battery ? 0 : (u.load || 50) * 0.8 / 0.955 * (stale ? 1 : between(jit, 0.985, 1.015));
      return {
        id: 'T00_' + code + '_UPS_GIR_TOT_POW',
        desc: '1.Kat Sistem Salonu UPS ' + code + ' Girişi Toplam Gücü',
        val: Math.round(kw * 1000)
      };
    });
    return { facility, it };
  }

  // Diğer katlar: tohumlu sentetik kaynaklar; soğutma toplamı hedef PUE'ye göre ölçeklenir
  function syntheticSources(docId, tick) {
    const f = ENERGY_FLOORS[docId];
    const rnd = rngOf('pue-live-' + docId);
    const jit = rngOf('pue-live-' + docId + '-' + tick);
    const it = f.sdp.map(code => ({
      id: docId.replace('CMR/', '') + '_' + code + '_UPS_GIR_TOT_POW',
      desc: f.prefix + ' UPS ' + code + ' Girişi Toplam Gücü',
      val: Math.round(between(rnd, 28, 52) * 1000 * between(jit, 0.985, 1.015))
    }));
    const itTotal = it.reduce((s, x) => s + x.val, 0);
    const weights = f.panels.map(() => between(rnd, 0.7, 1.3));
    const wSum = weights.reduce((s, w) => s + w, 0);
    const coolTotal = itTotal * (f.pue - 1) * between(jit, 0.98, 1.02);
    const facility = f.panels.map((label, i) => ({
      id: docId.replace('CMR/', '') + '_P' + (i + 1) + '_KLM_PANO_TOT_POW',
      desc: f.prefix + ' ' + label + ' Toplam Gücü',
      val: Math.round(coolTotal * weights[i] / wSum)
    }));
    return { facility, it };
  }

  // Seçili katlar için anlık güç listeleri (W). tick: Yenile / 60 sn periyodu sayacı
  function liveSources(docIds, tick) {
    const out = { facility: [], it: [] };
    (docIds || []).forEach(id => {
      if (!ENERGY_FLOORS[id]) return;
      const src = id === 'CMR/T00' ? floor1Sources(tick || 0) : syntheticSources(id, tick || 0);
      out.facility = out.facility.concat(src.facility);
      out.it = out.it.concat(src.it);
    });
    return out;
  }

  // Tarihsel PUE: mevsimsel (yaz ↑) + günlük (öğleden sonra ↑) bileşen + gürültü.
  // agg: average | minimum | maximum
  function puePoint(docId, t, hourly, agg) {
    const f = ENERGY_FLOORS[docId];
    const key = docId + (hourly ? t.toISOString().slice(0, 13) : dateKey(t));
    const rnd = rngOf('pue-his-' + key);
    const season = 0.045 * Math.sin(2 * Math.PI * (dayOfYear(t) - 110) / 365);
    const diurnal = hourly ? 0.025 * Math.sin(2 * Math.PI * (t.getHours() - 9) / 24) : 0;
    const base = f.pue + season + diurnal + between(rnd, -0.018, 0.018);
    if (agg === 'minimum') return base - between(rnd, 0.025, hourly ? 0.035 : 0.06);
    if (agg === 'maximum') return base + between(rnd, 0.03, hourly ? 0.045 : 0.085);
    return base;
  }

  // filter: { floors, mode, agg, startDate, endDate, filterDate, startTime, endTime, labels: {docId: etiket}, factor }
  function history(filter) {
    const hourly = filter.mode === 'hourly';
    const times = hourly ? hoursBetween(filter.filterDate, filter.startTime, filter.endTime) : daysBetween(filter.startDate, filter.endDate);
    const factor = filter.factor || 1;
    const rows = [];
    (filter.floors || []).forEach(docId => {
      if (!ENERGY_FLOORS[docId]) return;
      times.forEach(t => rows.push({
        tim: t,
        floorValue: docId,
        floorLabel: (filter.labels && filter.labels[docId]) || docId,
        value: Math.round(puePoint(docId, t, hourly, filter.agg) * factor * 1000) / 1000,
        timestamp: t.getTime()
      }));
    });
    rows.sort((a, b) => b.timestamp - a.timestamp);
    return rows;
  }

  R.pue = { floors: Object.keys(ENERGY_FLOORS), live: liveSources, history };
  // CUE = PUE × şebeke emisyon faktörü (Türkiye elektrik şebekesi, 0,484 kgCO2/kWh — bileşendeki CUE_MULTIPLIER)
  R.cue = {
    MULTIPLIER: 0.484,
    live: liveSources,
    history: filter => history(Object.assign({}, filter, { factor: 0.484 }))
  };

  // ===========================================================================
  // UPS Modül Raporu — bölüm (INP/BYP/OUT/BAT) × veri türü × faz geçmişi
  // ===========================================================================
  // CMR/T00 (IDC1): gerçek UPS etiketleri (DCIM.data.ups). CMR/T04 (IDC4): bileşendeki liste.
  const UPS_BY_FLOOR = {
    'CMR/T00': D.ups.slice().sort(byUpsLabel).map(u => ({
      id: 'KAT1_SAL1_' + upsCode(u.label) + '_UPS', label: u.label, floor: 'CMR/T00',
      load: u.load || 50, battery: u.status === 'alarm' && /Akü/i.test(u.note || ''), lost: u.status === 'lost'
    })),
    'CMR/T04': [
      { id: 'H_U_IDC4_RA_M1', label: 'IDC4 A UPS-1' },
      { id: 'H_U_IDC4_RA_M2', label: 'IDC4 A UPS-2' },
      { id: 'H_U_IDC4_RB_M1', label: 'IDC4 B UPS-1' },
      { id: 'H_U_IDC4_RB_M2', label: 'IDC4 B UPS-2' },
      { id: 'IDC4_UPSC1C2', label: 'IDC4 UPS C1/C2' },
      { id: 'IDC4_UPSD1D2', label: 'IDC4 UPS D1/D2' }
    ].map(u => Object.assign(u, { floor: 'CMR/T04', load: Math.round(between(rngOf('ups-idc4-' + u.id), 36, 68)), battery: false, lost: false }))
  };
  const ALL_UPS = UPS_BY_FLOOR['CMR/T00'].concat(UPS_BY_FLOOR['CMR/T04']);

  // Tek ölçüm noktası değeri. sec: INP|BYP_INP|OUT|BAT, type: VLT|CURR|FREQ|LNVLT|LOAD|ACTPWR|APPPWR|PWRF|CAPLEFT
  function upsValue(ups, sec, type, phase, t, hourly, calc, isNow) {
    const key = ups.id + sec + type + phase + (hourly ? t.toISOString().slice(0, 13) : dateKey(t));
    const rnd = rngOf('ups-his-' + key);
    // Günlük yük salınımı (±%3) + saatlik profil (gündüz ↑)
    const dayLoad = ups.load * (1 + between(rngOf('ups-day-' + ups.id + dateKey(t)), -0.03, 0.03)) *
      (hourly ? 1 + 0.04 * Math.sin(2 * Math.PI * (t.getHours() - 8) / 24) : 1);
    const phaseSkew = phase === 'A' || phase === 'AB' ? 1.02 : phase === 'B' || phase === 'BC' ? 0.99 : 0.985;
    const outKw = dayLoad * 0.8;                 // 80 kVA modül
    const pf = 0.93 + (ups.load % 5) * 0.006;    // 0,93–0,95
    const inKw = outKw / 0.955;

    // Senaryo: UPS A5 şu an akü modunda (giriş yok, akü deşarjda)
    const onBattery = ups.battery && isNow;
    let avg; let spread;
    switch (type) {
      case 'VLT':
        if (sec === 'BAT') { avg = onBattery ? 512.4 : between(rnd, 541.5, 545.5); spread = onBattery ? 24 : 1.2; }
        else if (sec === 'OUT') { avg = between(rnd, 229.6, 230.4); spread = 0.8; }
        else { avg = onBattery && sec === 'INP' ? 0 : between(rnd, 227.5, 232.5); spread = 3.2; }
        break;
      case 'LNVLT':
        avg = onBattery && sec === 'INP' ? 0 : between(rnd, 395, 402); spread = 5.5;
        break;
      case 'CURR':
        if (sec === 'BAT') { avg = onBattery ? -between(rnd, 88, 96) : between(rnd, 0.4, 1.6); spread = onBattery ? 6 : 0.6; }
        else if (sec === 'BYP_INP') { avg = between(rnd, 0.1, 0.5); spread = 0.3; }
        else if (sec === 'OUT') { avg = outKw * 1000 / (3 * 230 * pf) * phaseSkew; spread = avg * 0.12; }
        else { avg = onBattery ? 0 : inKw * 1000 / (3 * 230 * 0.99) * phaseSkew; spread = avg * 0.12; }
        break;
      case 'FREQ':
        avg = onBattery && sec === 'INP' ? 0 : between(rnd, 49.97, 50.03); spread = sec === 'OUT' ? 0.01 : 0.07;
        break;
      case 'LOAD':
        avg = dayLoad * phaseSkew; spread = 6.5;
        break;
      case 'ACTPWR':
        avg = outKw * 1000 / 3 * phaseSkew; spread = avg * 0.1;
        break;
      case 'APPPWR':
        avg = outKw * 1000 / 3 / pf * phaseSkew; spread = avg * 0.1;
        break;
      case 'PWRF':
        avg = pf + between(rnd, -0.006, 0.006); spread = 0.02;
        break;
      case 'CAPLEFT':
        avg = onBattery ? 64 : 100; spread = onBattery ? 36 : 0;
        break;
      default:
        avg = 0; spread = 0;
    }
    if (avg === 0 && type !== 'CURR') return 0;
    let v = avg;
    if (calc === 'Minimum') v = avg - spread * between(rnd, 0.6, 1);
    else if (calc === 'Maximum') v = avg + spread * between(rnd, 0.6, 1);
    if (type === 'CAPLEFT') v = Math.min(100, Math.max(0, v));
    if (type === 'PWRF') v = Math.min(0.99, v);
    if (type === 'LOAD') v = Math.max(0, v);
    return v;
  }

  // Bileşendeki generateRIDs() ile aynı kural
  const SECTION_CAPS = {
    INP: ['VLT', 'CURR', 'FREQ', 'LNVLT'],
    BYP: ['VLT', 'CURR', 'FREQ', 'LNVLT'],
    OUT: ['VLT', 'CURR', 'FREQ', 'LOAD', 'ACTPWR', 'APPPWR', 'PWRF'],
    BAT: ['VLT', 'CURR', 'CAPLEFT']
  };
  function generateRids(upsIds, sections, dataTypes) {
    const rids = [];
    upsIds.forEach(upsId => sections.forEach(sec => dataTypes.forEach(type => {
      if (!(SECTION_CAPS[sec] || []).includes(type)) return;
      const xmlSection = sec === 'BYP' ? 'BYP_INP' : sec;
      if (sec === 'BAT' || type === 'FREQ' || type === 'CAPLEFT') rids.push(upsId + '_' + xmlSection + '_' + type);
      else if (type === 'LNVLT') ['AB', 'BC', 'CA'].forEach(ph => rids.push(upsId + '_' + xmlSection + '_' + type + '_' + ph));
      else ['A', 'B', 'C'].forEach(ph => rids.push(upsId + '_' + xmlSection + '_' + type + '_' + ph));
    })));
    return rids;
  }

  // API yanıtı biçiminde (rid, tim|period, result) kayıtlar üretir.
  // filter: { rids, mode, calc, filterDate, startTime, endTime, startDate, endDate }
  function upsHistory(filter) {
    const hourly = filter.mode === 'hourly';
    const times = hourly ? hoursBetween(filter.filterDate, filter.startTime, filter.endTime) : daysBetween(filter.startDate, filter.endDate);
    const nowRef = new Date();
    const out = [];
    (filter.rids || []).forEach(rid => {
      const ups = ALL_UPS.find(u => rid.indexOf(u.id + '_') === 0);
      if (!ups) return;
      const rest = rid.slice(ups.id.length + 1);
      const sec = rest.indexOf('BYP_INP_') === 0 ? 'BYP_INP' : rest.split('_')[0];
      const tail = rest.slice(sec.length + 1).split('_');
      const type = tail[0];
      const phase = tail[1] || '';
      times.forEach(t => {
        // "Şimdi"yi kapsayan dönem: bugün (günlük) veya içinde bulunulan saat (saatlik)
        const isNow = hourly ? (nowRef - t) < 3600000 : dateKey(t) === dateKey(nowRef);
        const rec = { rid, result: ups.lost && isNow ? null : upsValue(ups, sec, type, phase, t, hourly, filter.calc, isNow) };
        const iso = dateKey(t) + 'T' + pad(t.getHours()) + ':00:00';
        if (hourly) rec.period = iso; else rec.tim = iso;
        out.push(rec);
      });
    });
    return out;
  }

  R.upsModule = { UPS_BY_FLOOR, SECTION_CAPS, generateRids, history: upsHistory };
})();

/* ==========================================================================
   Raporlar: SDP / Trafo / Şalter Yedeklilik / Kapasite
   ========================================================================== */
/* ==========================================================================
   DCIM Sunum — Rapor mock verileri (R2: SDP, Trafo, Şalter Yük Yedeklilik, Kapasite)
   XDB_GetValue / api.HIS_* / HIS_BreakerRedundancy / queryCapacity* çağrılarının yerine
   geçen tohumlu (deterministik) üreticiler. Aynı filtre → aynı veri.
   Bağımlılık: js/mock-data.js (DCIM.data.ups, panels, cabinets, floors, getLockFloor, rng, hash)
   Not: Yükleme anında DOM'a erişilmez; ileride mock-data.js ile birleştirilecek.

   Fiziksel varsayımlar
   - SDP girişleri: 400 V 3 faz, 160 A şalter (db_CMR_T00.xml dev_cap="160"). Giriş gücü
     = UPS yük oranı × 0,8 kW × giriş payı (Giriş 1 %52 / Giriş 2 %48) → tipik 25–40 A/faz.
     N+N: her taraf şalter anma akımının ≤ %50'si. UPS B4 (%82 yük) → SDP B4 ≈ %32 (kırmızı).
   - Trafolar: 1600 kVA, 400 V AG → anma akımı ≈ 2309 A; yük ≈ %36–40 (≤ %50 N+N).
     Kompanzasyon çıkışları: 150–190 A, güç faktörü ≈ 0,04 (kapasitif, aktif güç birkaç kW).
   - Senaryo: 1AV42 PDU-B faz kaybı → SDP B2 Giriş 2 L2 ↓, SDP A2 Giriş 2 L2 ↑ (yük A'ya aktarıldı;
     besleme CTD'ye göre 1B2G2 / 1A2G2 — connectivity.html ile aynı).
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  const R = (D.reports = D.reports || {});

  const rngOf = key => D.rng(D.hash(String(key)));
  const between = (rnd, min, max) => min + (max - min) * rnd();
  const pad = n => String(n).padStart(2, '0');
  const dateKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const hourKey = d => dateKey(d) + 'T' + pad(d.getHours());
  const parseDay = s => { const p = String(s).slice(0, 10).split('-').map(Number); return new Date(p[0], (p[1] || 1) - 1, p[2] || 1); };
  const SQRT3 = Math.sqrt(3);
  const DAY = 86400000;

  // ---------------------------------------------------------------------------
  // Örnekleme zaman noktaları
  // ---------------------------------------------------------------------------
  // Günlük: başlangıç..bitiş arasındaki günler (bugünden sonrası yok), en fazla 400 gün
  function days(start, end) {
    const out = [];
    if (!start || !end) return out;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let d = parseDay(start);
    const last = parseDay(end);
    while (d <= last && d <= today && out.length < 400) {
      out.push(new Date(d));
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    }
    return out;
  }
  // Saatlik: filterDate günündeki startTime..endTime saat dilimleri (gelecek saatler hariç)
  function hours(date, startTime, endTime) {
    const out = [];
    if (!date) return out;
    const base = parseDay(date);
    const h0 = parseInt(String(startTime || '00').slice(0, 2), 10) || 0;
    const h1 = Math.min(23, parseInt(String(endTime || '23').slice(0, 2), 10));
    const now = Date.now();
    for (let h = h0; h <= h1; h++) {
      const t = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h);
      if (t.getTime() <= now) out.push(t);
    }
    return out;
  }
  // Filtre nesnesinden örnek noktaları: { mode:'daily'|'hourly', startDate, endDate, filterDate, startTime, endTime }
  function samples(f) {
    return f.mode === 'hourly' ? hours(f.filterDate, f.startTime, f.endTime) : days(f.startDate, f.endDate);
  }

  // Yük profili: haftalık salınım + yıllık büyüme (+%9/yıl) + günlük/saatlik gürültü
  function loadFactor(key, t, hourly) {
    const daysAgo = Math.max(0, Math.floor((Date.now() - t.getTime()) / DAY));
    const growth = 1 - 0.00025 * daysAgo;
    const dow = t.getDay();
    const weekly = dow === 0 || dow === 6 ? 0.975 : 1.005;
    const noise = between(rngOf(key + '|' + (hourly ? hourKey(t) : dateKey(t))), -0.02, 0.02);
    const diurnal = hourly ? 1 + 0.035 * Math.sin(2 * Math.PI * (t.getHours() - 9) / 24) : 1;
    return growth * weekly * diurnal * (1 + noise);
  }

  // Tek ölçüm: base = cihazın nominal değerleri; sensor = PA_CURR|PB_CURR|PC_CURR|P1VLT|P2VLT|P3VLT|TOT_POW|TOT_PF|TOT_APW
  // calc: Average | Minimum | Maximum → ham sayı (W, VA, A, V)
  function measure(unit, sensor, t, hourly, calc) {
    const k = loadFactor(unit.id, t, hourly);
    const rnd = rngOf(unit.id + sensor + (hourly ? hourKey(t) : dateKey(t)) + calc);
    const spreadScale = hourly ? 0.35 : 1;
    let v, spread;
    const ph = { PA_CURR: 0, PB_CURR: 1, PC_CURR: 2, P1VLT: 0, P2VLT: 1, P3VLT: 2 }[sensor];
    if (/CURR$/.test(sensor)) {
      v = unit.I[ph] * k; spread = between(rnd, 0.06, 0.11);
    } else if (/VLT$/.test(sensor)) {
      v = unit.V[ph] * (1 - 0.006 * (k - 1)) * (1 + between(rnd, -0.002, 0.002)); spread = between(rnd, 0.005, 0.011);
    } else if (sensor === 'TOT_PF') {
      v = unit.pf + between(rnd, -0.004, 0.004); spread = unit.pf < 0.2 ? between(rnd, 0.15, 0.3) : between(rnd, 0.006, 0.014);
    } else if (sensor === 'TOT_POW') {
      v = unit.P * k; spread = between(rnd, 0.06, 0.11);
    } else if (sensor === 'TOT_APW') {
      v = unit.S * k; spread = between(rnd, 0.06, 0.11);
    } else {
      v = 0; spread = 0;
    }
    spread *= spreadScale;
    if (calc === 'Minimum') v *= 1 - spread;
    else if (calc === 'Maximum') v *= 1 + spread;
    if (sensor === 'TOT_PF') v = Math.min(0.999, v);
    return v;
  }

  // Faz akımları + gerilimler + güç faktöründen P/S türet
  function finishUnit(u) {
    const vAvg = (u.V[0] + u.V[1] + u.V[2]) / 3;
    u.S = vAvg * (u.I[0] + u.I[1] + u.I[2]);
    u.P = u.S * u.pf;
    return u;
  }

  // ---------------------------------------------------------------------------
  // SDP (UPS dağıtım panosu girişleri) — db_CMR_T00.xml yapısı: KAT1_SAL1_A5_UPS_GIR1_DV
  // ---------------------------------------------------------------------------
  const SDP_FLOORS = {
    'CMR/T00': { region: 'KAT1_SAL1', lokasyon: 'IDC1', salon: '1.KAT SİSTEM SALONU', ipBase: 20, codes: null },
    'CMR/T02': { region: 'KAT2_SAL1', lokasyon: 'IDC1', salon: '2.KAT SİSTEM SALONU', ipBase: 90, codes: ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4', 'B5'] },
    'CMR/T03': { region: 'KAT3_SAL1', lokasyon: 'IDC1', salon: '3.KAT SİSTEM SALONU', ipBase: 130, codes: ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4'] },
    'CMR/T04': { region: 'IDC4_SAL1', lokasyon: 'IDC4', salon: 'IDC4 SİSTEM SALONU', ipBase: 170, codes: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2'] }
  };

  const sdpCache = {};
  function sdpUnits(floorId) {
    if (sdpCache[floorId]) return sdpCache[floorId];
    const f = SDP_FLOORS[floorId];
    if (!f) return [];
    // 1. Kat: gerçek UPS etiketleri ve yük oranları (DCIM.data.ups)
    const sources = f.codes
      ? f.codes.map(code => ({ code, load: Math.round(between(rngOf('sdp-load-' + floorId + code), 34, 64)) }))
      : D.ups.map(u => ({ code: u.label.replace(/^UPS\s*/i, ''), load: u.load || 50 }))
        .sort((a, b) => a.code.localeCompare(b.code, 'tr', { numeric: true }));
    const out = [];
    sources.forEach((s, idx) => {
      const side = s.code.charAt(0);
      const no = parseInt(s.code.slice(1), 10);
      [1, 2].forEach(gir => {
        const id = s.code + '_UPS_GIR' + gir;
        const rnd = rngOf('sdp-unit-' + floorId + id);
        const kw = s.load * 0.8 * (gir === 1 ? 0.52 : 0.48);
        const pf = between(rnd, 0.952, 0.984);
        const iAvg = kw * 1000 / (SQRT3 * 400 * pf);
        const a = between(rnd, -0.05, 0.05);
        const b = between(rnd, -0.05, 0.05);
        const I = [iAvg * (1 + a), iAvg * (1 + b), iAvg * (1 - a - b)];
        // Senaryo: 1AV42 PDU-B faz kaybı (CTD: 1B2G2 / 1A2G2 beslemesi) → L2 yükü A tarafına geçti
        if (floorId === 'CMR/T00' && gir === 2 && s.code === 'B2') I[1] -= 5.2;
        if (floorId === 'CMR/T00' && gir === 2 && s.code === 'A2') I[1] += 5.2;
        const ipIdx = f.ipBase + idx * 2 + gir;
        out.push(finishUnit({
          id, region: f.region, floor: floorId, code: s.code, side, no, gir, upsLoad: s.load,
          cap: 160,
          ip: '10.20.60.' + ipIdx,
          bcu: side + pad3((no - 1) * 2 + gir),
          devId: f.region + '_' + id + '_DV',
          dev_nfo: f.lokasyon + '/SDP/' + f.salon + '/UPS ' + side + '-' + no + ' PANOSU/GİRİŞ ' + gir,
          I, V: [between(rnd, 229.2, 231.2), between(rnd, 229.2, 231.2), between(rnd, 229.2, 231.2)], pf
        }));
      });
    });
    sdpCache[floorId] = out;
    return out;
  }
  function pad3(n) { return String(n).padStart(3, '0'); }

  function findSdp(id, region) {
    for (const fid of Object.keys(SDP_FLOORS)) {
      if (region && SDP_FLOORS[fid].region !== region) continue;
      const u = sdpUnits(fid).find(x => x.id === id);
      if (u) return u;
    }
    return null;
  }

  // Ortak geçmiş sorgusu: units = [{id, region}], sensors = ['PA_CURR', ...]
  // → [{ rid, region, unit, sensor, tim: Date, result: number }]
  function historyRows(find, units, sensors, filter) {
    const pts = samples(filter);
    const hourly = filter.mode === 'hourly';
    const rows = [];
    units.forEach(ref => {
      const u = find(ref.id, ref.region);
      if (!u) return;
      sensors.forEach(sensor => {
        pts.forEach(t => {
          rows.push({
            rid: u.region + '_' + u.id + '_' + sensor,
            region: u.region, unit: u.id, sensor, tim: t,
            result: measure(u, sensor, t, hourly, filter.calc || 'Average')
          });
        });
      });
    });
    return rows;
  }

  R.sdp = {
    floors: SDP_FLOORS,
    units: sdpUnits,
    samples,
    // filter: { mode, startDate, endDate, filterDate, startTime, endTime, calc }
    query(units, sensors, filter) { return historyRows(findSdp, units, sensors, filter); }
  };

  // ---------------------------------------------------------------------------
  // Trafo analizörleri — db_CMR_T00.xml: IDC1_A_TRAFO3_Q1_DV ... (7 cihaz)
  // ---------------------------------------------------------------------------
  const TRAFO_DEFS = [
    { id: 'A_TRAFO3_Q1', amps: 905, komp: false },
    { id: 'A_TRAFO4_Q2', amps: 862, komp: false },
    { id: 'A_TRAFO1KOMP_Q146', amps: 176, komp: true },
    { id: 'B_TRAFO1_Q3', amps: 884, komp: false },
    { id: 'B_TRAFO2_Q4', amps: 846, komp: false },
    { id: 'B_TRAFO1KOMP_Q16', amps: 158, komp: true },
    { id: 'B_TRAFO2KOMP_Q145', amps: 191, komp: true }
  ];
  const TRAFOS = TRAFO_DEFS.map(d => {
    const rnd = rngOf('trafo-' + d.id);
    const a = between(rnd, -0.025, 0.025);
    const b = between(rnd, -0.025, 0.025);
    const busV = d.id.charAt(0) === 'A' ? 233.6 : 234.2;
    return finishUnit({
      id: d.id, region: 'IDC1', komp: d.komp, ratedKva: d.komp ? 0 : 1600,
      I: [d.amps * (1 + a), d.amps * (1 + b), d.amps * (1 - a - b)],
      V: [busV + between(rnd, -1.1, 1.1), busV + between(rnd, -1.1, 1.1), busV + between(rnd, -1.1, 1.1)],
      pf: d.komp ? between(rnd, 0.03, 0.06) : between(rnd, 0.958, 0.976)
    });
  });

  R.trafo = {
    units: TRAFOS,
    regions: ['IDC1'],
    query(units, sensors, filter) {
      return historyRows((id, region) => TRAFOS.find(t => t.id === id && (!region || t.region === region)) || null, units, sensors, filter);
    }
  };

  // ---------------------------------------------------------------------------
  // Şalter Yük Yedeklilik — SDP girişlerinin (Giriş 1/2) dönem içi faz akımları
  // ---------------------------------------------------------------------------
  // Katlar: CMR/T00, T02, T03, T04 (IDC4: yalnızca A/B tarafları eşlenir)
  function switchDevices(floorIds) {
    const out = [];
    floorIds.forEach(fid => {
      sdpUnits(fid).forEach(u => {
        if (u.side !== 'A' && u.side !== 'B') return;
        out.push({
          id: u.devId, floor: fid, unit: u,
          dev_nfo: u.dev_nfo, dev_cap: u.cap, dev_bcu: u.bcu, ip: u.ip,
          pa_rid: u.region + '_' + u.id + '_PA_CURR',
          pb_rid: u.region + '_' + u.id + '_PB_CURR',
          pc_rid: u.region + '_' + u.id + '_PC_CURR'
        });
      });
    });
    return out;
  }
  // Dönem noktaları: günlük modda datetime-local aralığındaki günler (en fazla 60 örnek), saatlik modda saatler
  function switchSamples(f) {
    if (f.mode === 'hourly') return { pts: hours(f.filterDate, f.startTime, f.endTime), hourly: true };
    const all = days(f.startDate, f.endDate);
    const step = Math.max(1, Math.ceil(all.length / 60));
    return { pts: all.filter((_, i) => i % step === 0 || i === all.length - 1), hourly: false };
  }
  // → Map(rid → akım A); calc: Maximum | Average
  function switchCurrents(devices, filter) {
    const map = new Map();
    const s = switchSamples(filter);
    if (!s.pts.length) return map;
    devices.forEach(dev => {
      [['PA_CURR', dev.pa_rid], ['PB_CURR', dev.pb_rid], ['PC_CURR', dev.pc_rid]].forEach(pair => {
        const vals = s.pts.map(t => measure(dev.unit, pair[0], t, s.hourly, filter.calc === 'Maximum' ? 'Maximum' : 'Average'));
        const v = filter.calc === 'Maximum' ? Math.max.apply(null, vals) : vals.reduce((a, b) => a + b, 0) / vals.length;
        map.set(pair[1], Math.round(v * 100) / 100);
      });
    });
    return map;
  }

  R.switchRedundancy = { devices: switchDevices, currents: switchCurrents };

  // ---------------------------------------------------------------------------
  // Kapasite — anlık toplamlar + kabin U doluluğu (queryCapacityCabins / queryCapacityUsed)
  // ---------------------------------------------------------------------------
  // doc('ASM/S00')/id('CAPACITY_CFG')/@jsn karşılığı (Eşikler penceresinden değiştirilebilir)
  const CAPACITY_CFG = {
    ups: { threshold: 80, maxCapacity: 2200 },
    trafo: { threshold: 80, maxCapacity: 6400 },
    klima: { threshold: 75, maxCapacity: 900 },
    kabin: { threshold: 70, maxCapacity: 100 }
  };
  // Klima panoları (KLM_PANO_TOT_POW): 1. Kat gerçek pano değerleri, diğer katlar sentetik
  const KLIMA_PANELS = {
    'CMR/T02': ['A1 Klima Panosu', 'A2 Klima Panosu', 'B1 Klima Panosu', 'B2 Klima Panosu', 'Klimalar Kontrol Panosu'],
    'CMR/T03': ['A1 Klima Panosu', 'A2 Klima Panosu', 'B1 Klima Panosu', 'B2 Klima Panosu'],
    'CMR/T04': ['C1 Klima Panosu', 'C2 Klima Panosu', 'D1 Klima Panosu', 'D2 Klima Panosu', 'Klimalar Kontrol Panosu', 'CRAH Klima Panosu']
  };
  const pointVal = (eq, label) => { const p = (eq.points || []).find(x => x.label === label); return p ? Number(p.value) : NaN; };

  // tick: 30 sn yoklama sayacı → küçük (±%1,5) oynama
  function capacityInstant(tick) {
    const now = new Date();
    const jit = key => 1 + between(rngOf('cap-' + key + '-' + tick), -0.015, 0.015);
    let upsKw = 0;
    Object.keys(SDP_FLOORS).forEach(fid => sdpUnits(fid).forEach(u => { upsKw += measure(u, 'TOT_POW', now, true, 'Average') / 1000; }));
    let trafoKva = 0;
    TRAFOS.forEach(t => { trafoKva += measure(t, 'TOT_APW', now, true, 'Average') / 1000; });
    let klimaKw = 0;
    D.panels.forEach(p => { const kw = pointVal(p, 'Toplam Aktif Güç'); klimaKw += isNaN(kw) ? 30 : kw; });
    Object.keys(KLIMA_PANELS).forEach(fid => KLIMA_PANELS[fid].forEach(name => { klimaKw += between(rngOf('cap-klm-' + fid + name), 24, 36); }));
    return { ups: upsKw * jit('ups'), trafo: trafoKva * jit('trafo'), klima: klimaKw * jit('klima') };
  }

  // Kabin kayıtları: { cabin_name, total_u, used_u, salon, pod } — 4 katın tamamı
  let cabCache = null;
  function capacityCabinets() {
    if (cabCache) return cabCache;
    const site = D.site.dc;
    const rows = [];
    (D.floors || []).forEach(f => {
      const list = f.digit === 1 ? D.cabinets : D.getLockFloor(f.id).map(c => c.cabinet);
      list.forEach(c => rows.push({ cabin_name: c.code, total_u: 42, used_u: c.usedU || 0, salon: site + ' / ' + f.label + ' / ' + D.site.hall, pod: c.pod || null }));
    });
    cabCache = rows;
    return rows;
  }

  R.capacity = { config: CAPACITY_CFG, instant: capacityInstant, cabinets: capacityCabinets };
})();

/* ==========================================================================
   Raporlar: PDU Envanter / PDU Güç
   ========================================================================== */
/* ==========================================================================
   DCIM Sunum — Rapor mock verileri (R3 parçası)
   PDU Envanter Raporu (HIS_PDU_Inventory) ve PDU Güç Raporu (HIS_Energy_HSD/HSH)
   çağrılarının yerine geçen tohumlu üreticiler. Sonra mock-data.js ile birleştirilecek.
   Bağımlılık: js/mock-data.js (DCIM.data)
   Senaryo: 1AV42 PDU-B faz kaybı, 1CB52 yüksek akım, 1CE51 haberleşme kaybı.
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  const R = (D.reports = D.reports || {});

  const rngFor = key => D.rng(D.hash(String(key)));
  const between = (rnd, min, max) => min + (max - min) * rnd();
  const pad = n => String(n).padStart(2, '0');
  const HOUR = 3600000;
  const DAY = 24 * HOUR;

  // ---------------------------------------------------------------------------
  // Kat → kabin listesi (T01 = sunum sahası; diğer katlar getLockFloor ile türetilir)
  // ---------------------------------------------------------------------------
  const FLOOR_SRC = { T01: null, T02: 'T02', T03: 'T03', T04: 'T04' };
  const cabCache = {};
  function floorCabinets(floorId) {
    if (cabCache[floorId]) return cabCache[floorId];
    let list = [];
    if (floorId === 'T01') list = D.cabinets || [];
    else if (FLOOR_SRC[floorId] && D.getLockFloor) list = D.getLockFloor(FLOOR_SRC[floorId]).map(c => c.cabinet);
    cabCache[floorId] = list;
    return list;
  }
  function findCabinetAnyFloor(code) {
    const floors = Object.keys(FLOOR_SRC);
    for (let i = 0; i < floors.length; i++) {
      const hit = floorCabinets(floors[i]).find(c => c.code === code);
      if (hit) return { floorId: floors[i], cabinet: hit };
    }
    return null;
  }

  // CMR dokümanındaki dev_loc biçimi: "<Kat> / <Salon> / <POD>" (T04 / IDC4: "<IDC4> / <POD>")
  function devLoc(floorId, pod) {
    const podNum = parseInt((String(pod).match(/\d+/) || ['0'])[0], 10);
    switch (floorId) {
      case 'T01': return '1. KAT / 1. SALON / ' + pod;
      case 'T02': return '2. KAT / ' + (podNum <= 5 && pod !== 'NS2' ? '1. SALON' : '2. SALON') + ' / ' + pod;
      case 'T03': return '3. KAT / 1. SALON / ' + pod;
      case 'T04': return 'IDC4 / ' + pod;
      default: return '';
    }
  }

  // doc('CMR/<kat>')/json(//dev[contains(@id,'PDU') and @dev_loc], 'id,dev_loc') karşılığı
  const cmrCache = {};
  function cmr(floorId) {
    if (cmrCache[floorId]) return cmrCache[floorId];
    const out = [];
    floorCabinets(floorId).forEach(c => {
      ['A', 'B'].forEach(side => out.push({ id: 'K' + c.code + '_PDU_' + side + '_DV', dev_loc: devLoc(floorId, c.pod), cabinet: c.code, side }));
    });
    cmrCache[floorId] = out;
    return out;
  }

  // ---------------------------------------------------------------------------
  // PDU Envanteri (api.HIS_PDU_Inventory satırları)
  // ---------------------------------------------------------------------------
  const PDU_MODELS = [
    { m: 'Raritan', n: 'PX3-5902V', volt: '220-240V', curr: '32A', va: '7.4', out: '24', fw: '4.2.0.5-50274', sn: 'PKE', three: false },
    { m: 'Schneider Electric', n: 'APC AP8959EU3', volt: '220-240V', curr: '16A', va: '3.7', out: '24', fw: 'v7.1.4', sn: 'ZA', three: false },
    { m: 'Eaton', n: 'ePDU G3 EMAB23', volt: '220-240V', curr: '32A', va: '7.4', out: '20', fw: '2.9.0', sn: 'G3', three: false },
    { m: 'Vertiv', n: 'Geist GU2E1R8K', volt: '380-415V', curr: '16A', va: '11', out: '36', fw: '6.2.1', sn: 'GV', three: true },
    { m: 'Raritan', n: 'PX3-5496V', volt: '380-415V', curr: '32A', va: '22', out: '42', fw: '4.2.0.5-50274', sn: 'PKE', three: true }
  ];

  function fmtTim(d) {
    // "2026-09-28 14:32:10.123 +0300" (backend biçimi)
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? '+' : '-';
    const abs = Math.abs(off);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '.' + String(d.getMilliseconds()).padStart(3, '0') + ' ' +
      sign + pad(Math.floor(abs / 60)) + pad(abs % 60);
  }

  const invCache = {};
  function inventory(floorId) {
    if (invCache[floorId]) return invCache[floorId];
    const digit = { T01: 1, T02: 2, T03: 3, T04: 4 }[floorId] || 1;
    const now = Date.now();
    const rows = cmr(floorId).map((dev, idx) => {
      const cab = floorCabinets(floorId).find(c => c.code === dev.cabinet) || {};
      const rnd = rngFor(dev.id + '-inv');
      const cabRnd = rngFor(dev.cabinet + '-pdumodel');
      // Yüksek yüklü kabinlerde 3 fazlı PDU; aynı kabindeki A/B beslemeleri aynı model
      const pool = (cab.powerKw || 0) > 6.5 ? PDU_MODELS.filter(p => p.three) : PDU_MODELS.filter(p => !p.three);
      const model = pool[Math.floor(cabRnd() * pool.length) % pool.length];
      const podNum = parseInt((String(cab.pod || '').match(/\d+/) || ['0'])[0], 10) + (String(cab.pod || '').startsWith('NS') ? 20 : 0);
      const lastSeen = dev.cabinet === '1CE51'
        ? new Date(now - (3 * 60 + 12) * 60000 - Math.floor(rnd() * 40) * 1000)   // haberleşme kaybı: son veri ~3 saat önce
        : new Date(now - Math.floor(between(rnd, 5, 280)) * 1000);
      return {
        id: dev.id,
        host: '10.' + (60 + digit) + '.' + (podNum + 10) + '.' + (20 + (idx % 200)),
        tim: fmtTim(lastSeen),
        PDUMANUF: model.m,
        PDUMODEL: model.n,
        PDUSERNO: model.sn + Math.floor(between(rnd, 1000000000, 9999999999)),
        PDUNAME: dev.cabinet + '-PDU-' + dev.side,
        PDUINCNT: '1',
        PDUOUTCNT: model.out,
        PDUFWVER: model.fw,
        RTD_VOLT: model.volt,
        RTD_CURR: model.curr,
        RTD_VA: model.va
      };
    });
    invCache[floorId] = rows;
    return rows;
  }

  R.pduInventory = { cmr, inventory, floorCabinets };

  // ---------------------------------------------------------------------------
  // PDU Güç (HSD günlük / HSH saatlik özetleri) — kW
  // ---------------------------------------------------------------------------
  const startOfDay = ms => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  // Senaryo zamanları (her açılışta "şimdi"ye göre)
  const NOW = Date.now();
  const SCN = {
    '1AV42': { bLossFrom: NOW - 38 * HOUR },                 // PDU-B faz kaybı ~38 saattir
    '1CB52': { boostFrom: NOW - 3 * DAY, boost: 1.18 },       // son günlerde yüksek akım
    '1CE51': { lostFrom: startOfDay(NOW) - DAY }              // dünden beri veri yok
  };

  function cabinetBase(code) {
    const hit = findCabinetAnyFloor(code);
    const cab = hit ? hit.cabinet : null;
    const powerKw = cab && cab.powerKw ? cab.powerKw : 4.5;
    const a = cab ? cab.pduA : 1, b = cab ? cab.pduB : 1;
    const shareA = cab && cab.pduFault ? 0.5 : (a + b > 0 ? a / (a + b) : 0.5);
    return { powerKw, shareA };
  }

  // Bir kabin + PDU + periyot için { Average, Minimum, Maximum } (kW) — veri yoksa null
  // granularity: 'day' | 'hour'
  function point(code, side, ts, granularity) {
    const sc = SCN[code] || {};
    const end = ts + (granularity === 'day' ? DAY : HOUR);
    if (sc.lostFrom && ts >= sc.lostFrom) return null;
    if (ts > NOW) return null;
    const base = cabinetBase(code);
    const rnd = rngFor(code + '|' + side + '|' + granularity + '|' + ts);
    const d = new Date(ts);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    let total = base.powerKw * (weekend ? between(rnd, 0.9, 0.97) : between(rnd, 0.96, 1.05));
    if (granularity === 'hour') {
      const h = d.getHours();
      total *= 1 + 0.07 * Math.sin(((h - 9) / 24) * Math.PI * 2) + between(rnd, -0.015, 0.015);
    }
    if (sc.boostFrom && ts >= sc.boostFrom) total *= sc.boost;
    let share = side === 'A' ? base.shareA : 1 - base.shareA;
    // 1AV42: faz kaybı sonrası tüm yük PDU-A'ya biner
    if (sc.bLossFrom && end > sc.bLossFrom) {
      const lossRatio = Math.min(1, (end - sc.bLossFrom) / (end - ts));
      share = side === 'A' ? share + (1 - share) * lossRatio : share * (1 - lossRatio);
    }
    const avg = total * share;
    if (avg <= 0.0001) return { Average: 0, Minimum: 0, Maximum: 0 };
    const spread = granularity === 'day' ? 1 : 0.45;
    let max = avg * (1 + between(rnd, 0.07, 0.18) * spread);
    if (code === '1CB52' && sc.boostFrom && ts >= sc.boostFrom) max = avg * (1 + between(rnd, 0.16, 0.24) * spread);
    const min = avg * (1 - between(rnd, 0.08, 0.16) * spread);
    return { Average: avg, Minimum: sc.bLossFrom && end > sc.bLossFrom && ts < sc.bLossFrom && side === 'B' ? 0 : min, Maximum: max };
  }

  // Müşteri listeleri (queryLoadReportCustomerApi karşılığı)
  // type '1' = İç Müşteriler (sorumlu müdürlük), '0' = Dış Müşteriler (owner)
  const INTERNAL_UNITS = ['Bilgi Teknolojileri Direktörlüğü', 'Şebeke Operasyon Direktörlüğü', 'Veri Merkezi Hizmetleri Müdürlüğü', 'Kurumsal Uygulamalar Müdürlüğü'];
  const custCache = {};
  function customers(type) {
    if (custCache[type]) return custCache[type];
    const map = {};
    (D.cabinets || []).forEach(c => {
      const internal = c.customer === 'Türk Telekom (Dahili)';
      if ((type === '1') !== internal) return;
      const name = internal ? INTERNAL_UNITS[D.hash(c.code) % INTERNAL_UNITS.length] : c.customer;
      (map[name] = map[name] || []).push(c.code);
    });
    const list = Object.keys(map).sort((a, b) => a.localeCompare(b, 'tr')).map(name => ({ name, cabinets: map[name].sort() }));
    custCache[type] = list;
    return list;
  }

  R.pduEnergy = { cmr, floorCabinets, findCabinetAnyFloor, point, customers, HOUR, DAY };
})();

/* ==========================================================================
   Raporlar: PDU Yük / Maksimum Güç
   ========================================================================== */
/* ==========================================================================
   DCIM Sunum — Rapor mock verileri (R4): PDU Yük (failover) + Maksimum Güç (maxpow)
   DCIM.data.reports.failover / DCIM.data.reports.maxpow
   Tüm değerler filtre anahtarına göre tohumlanır (aynı filtre → aynı sonuç).
   Senaryo: 1AV42 PDU-B L2 faz kaybı (L2 yükü PDU-A'ya biner → failover riski),
            1CB52 yüksek akım (L1 fazı ağır yüklü).
   Bağımlılık: js/mock-data.js (DCIM.data)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  const R = (D.reports = D.reports || {});

  const rng = D.rng;
  const hash = D.hash;
  const r2 = n => Math.round(n * 100) / 100;
  const between = (rnd, a, b) => a + (b - a) * rnd();

  // ---------------------------------------------------------------------------
  // Kat → kabin listesi (Kat 1 gerçek yerleşim, diğer katlar getLockFloor ile türetilir)
  // ---------------------------------------------------------------------------
  // failover floorOptions (T01..T04) → mock-data FLOORS kimlikleri
  const FAILOVER_FLOOR_DOC = { T01: 'T00', T02: 'T02', T03: 'T03', T04: 'T04' };
  const floorCache = {};
  function floorCabinets(mockFloorId) {
    if (floorCache[mockFloorId]) return floorCache[mockFloorId];
    const list = mockFloorId === 'T00' ? D.cabinets : D.getLockFloor(mockFloorId).map(c => c.cabinet);
    floorCache[mockFloorId] = list;
    return list;
  }
  let cabIndex = null;
  function findCab(code) {
    if (!cabIndex) {
      cabIndex = {};
      ['T00', 'T02', 'T03', 'T04'].forEach(f => floorCabinets(f).forEach(c => { cabIndex[c.code] = c; }));
    }
    return cabIndex[code] || null;
  }
  const allCabinets = () => { findCab(''); return Object.keys(cabIndex).map(k => cabIndex[k]); };

  // ---------------------------------------------------------------------------
  // Tarih aralığından tohum anahtarı + zirve anı üretimi
  // ---------------------------------------------------------------------------
  function rangeOf(q) {
    if (q.mode === 'hourly') {
      if (!q.filterDate) return null;
      const s = new Date(q.filterDate + 'T' + (q.startTime || '00:00:00'));
      const e = new Date(q.filterDate + 'T' + (q.endTime || '23:59:59'));
      return isNaN(s) || isNaN(e) ? null : { s, e };
    }
    if (!q.startDate || !q.endDate) return null;
    const s = new Date(q.startDate.length <= 10 ? q.startDate + 'T00:00:00' : q.startDate);
    const e = new Date(q.endDate.length <= 10 ? q.endDate + 'T23:59:59' : q.endDate);
    return isNaN(s) || isNaN(e) ? null : { s, e };
  }
  // Zirve anı: iş saatlerine (09-18) ağırlıklı, aralık içinde
  function peakTime(rnd, range) {
    const span = Math.max(0, range.e - range.s);
    if (span <= 36 * 3600000) return new Date(range.s.getTime() + Math.floor(rnd() * span / 60000) * 60000);
    const days = Math.floor(span / 86400000);
    const d = new Date(range.s.getTime() + Math.floor(rnd() * Math.max(1, days)) * 86400000);
    d.setHours(9 + Math.floor(rnd() * 10), Math.floor(rnd() * 60), 0, 0);
    return d > range.e ? new Date(range.e.getTime() - 3600000) : d;
  }

  // ===========================================================================
  // PDU Yük Raporu (failover) — HIS_FAILOVER API karşılığı
  // RID: K<kabin>_PDU_<A|B>_IN_CURR<faz> / _OCP_C<n>_CURR ; kapasite: _RTD_CURR / _RTD_OCP<n>_CURR
  // 3 fazlı 16 A Rack PDU, 6 adet 16 A OCP (C1-C2 → L1, C3-C4 → L2, C5-C6 → L3)
  // ===========================================================================
  const INLET_CAP = 16;
  const OCP_CAP = 16;
  const OCP_COUNT = 6;

  // İç müşteri = Türk Telekom (Dahili); dış müşteriler = diğer kabin sahipleri
  function isInternal(c) { return /\(Dahili\)/.test(c.customer); }

  function foCustomers(type) {
    const set = new Set(allCabinets().filter(c => (type === '1') === isInternal(c)).map(c => c.customer));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'));
  }
  function foCabinetsForCustomers(names) {
    const s = new Set(names);
    return allCabinets().filter(c => s.has(c.customer)).map(c => c.code).sort();
  }
  function foCabinetsOnFloors(floorIds) {
    const set = new Set();
    (floorIds || []).forEach(f => { const doc = FAILOVER_FLOOR_DOC[f]; if (doc) floorCabinets(doc).forEach(c => set.add(c.code)); });
    return Array.from(set).sort();
  }

  // Bir kabin için faz bazında (L1..L3) A/B besleme ortalama akımları
  function basePhases(c) {
    const rnd = rng(hash(c.code + '-phase'));
    let sh = [between(rnd, 0.3, 0.37), between(rnd, 0.3, 0.37), between(rnd, 0.3, 0.37)];
    if (c.code === '1CB52') sh = [0.38, 0.32, 0.30]; // yüksek akım: L1 ağır
    const tot = sh[0] + sh[1] + sh[2];
    sh = sh.map(x => x / tot);
    const half = c.currentA / 2;
    const feedA = c.pduFault ? half : c.pduA;
    const feedB = c.pduFault ? half : c.pduB;
    const a = sh.map(x => feedA * x);
    const b = sh.map(x => feedB * x);
    if (c.pduFault) { a[1] += b[1] * 1.12; b[1] = 0; } // 1AV42: PDU-B L2 faz kaybı → yük PDU-A'ya biner
    return { a, b };
  }

  // q: { cabinets, mode, valueType, startDate, endDate, filterDate, startTime, endTime }
  function foQuery(q) {
    const range = rangeOf(q);
    const key = [q.mode, q.valueType, q.startDate, q.endDate, q.filterDate, q.startTime, q.endTime].join('|');
    const rows = [];
    const capacityMap = {};
    (q.cabinets || []).forEach(code => {
      const c = findCab(code);
      if (!c) return;
      const pfx = 'K' + c.code + '_PDU_';
      const rnd = rng(hash(c.code + '|' + key));
      const zaman = range ? peakTime(rnd, range).toISOString() : '';
      const drift = range ? between(rnd, 0.95, 1.05) : 0; // aralığa göre küçük sapma
      const hourF = q.mode === 'hourly' && range ? between(rnd, 0.9, 1.04) : 1;
      const ph = basePhases(c);
      const typeF = () => q.valueType === 'Minimum' ? between(rnd, 0.58, 0.72) : q.valueType === 'Average' ? between(rnd, 0.97, 1.03) : between(rnd, 1.06, 1.18);
      const ocpSplit = [between(rnd, 0.38, 0.62), between(rnd, 0.38, 0.62), between(rnd, 0.38, 0.62)];
      ['A', 'B'].forEach(side => {
        const phases = side === 'A' ? ph.a : ph.b;
        capacityMap[pfx + side + '_RTD_CURR'] = INLET_CAP;
        const val = phases.map(v => v * drift * hourF * typeF());
        val.forEach((v, i) => rows.push({ rid: pfx + side + '_IN_CURR' + (i + 1), kabin_ismi: c.code, zaman, result: r2(v) }));
        for (let n = 1; n <= OCP_COUNT; n++) {
          const p = Math.floor((n - 1) / 2);
          const part = (n % 2 === 1 ? ocpSplit[p] : 1 - ocpSplit[p]);
          capacityMap[pfx + side + '_RTD_OCP' + n + '_CURR'] = OCP_CAP;
          rows.push({ rid: pfx + side + '_OCP_C' + n + '_CURR', kabin_ismi: c.code, zaman, result: r2(val[p] * part) });
        }
      });
    });
    return { rows, capacityMap };
  }

  R.failover = {
    floorsDoc: FAILOVER_FLOOR_DOC,
    cabinetsOnFloors: foCabinetsOnFloors,
    customers: foCustomers,
    cabinetsForCustomers: foCabinetsForCustomers,
    query: foQuery
  };

  // ===========================================================================
  // Maksimum Güç Raporu (maxpow) — HIS_MAXPOW API karşılığı ({ rid, max, tim })
  // ===========================================================================
  // Kat → salonlar (floorRegionMap) ve kat kodu
  const MP_FLOORS = {
    F1: { digit: 1, mock: 'T00', halls: ['KAT1_SAL1'] },
    F2: { digit: 2, mock: 'T02', halls: ['KAT2_SAL1', 'KAT2_SAL2', 'KAT2_SAL3', 'KAT2_SAL4', 'KAT2_SAL5'] },
    F3: { digit: 3, mock: 'T03', halls: ['KAT3_SAL1', 'KAT3_SAL2', 'KAT3_SAL3', 'KAT3_SAL5', 'KAT3_SAL6'] },
    IDC4: { digit: 4, mock: 'T04', halls: ['IDC4'] }
  };

  // Kategori → güç ölçümlü nokta RID listesi (seçili kat için)
  function mpDevices(floor, category) {
    const f = MP_FLOORS[floor];
    if (!f) return [];
    const out = [];
    if (category === 'PDU') {
      floorCabinets(f.mock).forEach(c => {
        out.push('K' + c.code + '_PDU_A_TOT_POW');
        out.push('K' + c.code + '_PDU_B_TOT_POW');
      });
    } else if (category === 'SDP') {
      if (f.digit === 1) D.ups.forEach(u => out.push('KAT1_SAL1_' + u.label.replace(/^UPS\s*/, '') + '_UPS_TOT_POW'));
      else f.halls.forEach(h => ['A1', 'B1', 'A2', 'B2'].forEach(n => out.push(h + '_UPS_' + n + '_TOT_POW')));
    } else if (category === 'TRAFO') {
      if (f.digit === 1) [1, 2, 3, 4].forEach(n => out.push('KAT1_SAL1_TRAFO_' + n + '_TOT_POW'));
      else f.halls.forEach((h, i) => out.push(h + '_TRAFO_' + (i + 1) + '_TOT_POW'));
    } else if (category === 'KLİMA') {
      if (f.digit === 1) D.climates.forEach(k => out.push('KAT1_SAL1_KLM_' + k.label.replace(/^KLIMA\s*/, '') + '_UNITPOW'));
      else f.halls.forEach((h, i) => [1, 2, 3].forEach(n => out.push(h + '_KLM_' + (f.digit * 100 + i * 10 + n) + '_UNITPOW')));
    }
    return out;
  }

  // Bir RID'in dönem içindeki en yüksek gücü (W)
  function mpPeakW(rid, rnd) {
    let m;
    if ((m = rid.match(/^K(\w+?)_PDU_([AB])_TOT_POW$/))) {
      const c = findCab(m[1]);
      if (!c) return between(rnd, 1500, 4000);
      let amps = m[2] === 'A' ? c.pduA : c.pduB;
      if (c.pduFault) amps = m[2] === 'A' ? c.currentA * 0.66 : c.currentA * 0.34; // 1AV42: L2 yükü PDU-A'da
      if (c.code === '1CB52') amps *= 1.12;
      return amps * 230 * between(rnd, 1.05, 1.22);
    }
    if ((m = rid.match(/^KAT1_SAL1_(\w+)_UPS_TOT_POW$/))) {
      const u = D.ups.find(x => x.label === 'UPS ' + m[1]);
      const load = u && u.load ? u.load : 55;
      return 160000 * load / 100 * between(rnd, 1.04, 1.14); // 160 kW modüler UPS
    }
    if (/_UPS_/.test(rid)) return 160000 * between(rnd, 0.42, 0.78);
    if (/_TRAFO_/.test(rid)) return between(rnd, 610000, 980000); // 2000 kVA trafo
    if ((m = rid.match(/_KLM_(\d+)_UNITPOW$/))) {
      const k = D.climates.find(x => x.label === 'KLIMA ' + m[1]);
      if (k && k.status === 'alarm') return between(rnd, 36500, 39800); // KLIMA 109 yüksek basınç
      return between(rnd, 17800, 31500);
    }
    return between(rnd, 1000, 5000);
  }

  // q: { mode, startDate, endDate, filterDate, startTime, endTime }
  function mpQuery(rids, q) {
    const range = rangeOf(q);
    if (!range) return [];
    const key = [q.mode, q.startDate, q.endDate, q.filterDate, q.startTime, q.endTime].join('|');
    // Uzun dönemlerde zirve daha yüksek olur
    const days = Math.max(1, (range.e - range.s) / 86400000);
    const spanF = 1 + Math.min(0.06, Math.log10(days) * 0.025);
    const hourF = q.mode === 'hourly' ? 0.93 : 1;
    return rids.map(rid => {
      const rnd = rng(hash(rid + '|' + key));
      const w = mpPeakW(rid, rnd) * spanF * hourF;
      return { rid, max: r2(w), tim: peakTime(rnd, range).toISOString() };
    });
  }

  R.maxpow = {
    floors: MP_FLOORS,
    devices: mpDevices,
    query: mpQuery
  };
})();

/* ==========================================================================
   Raporlar: Klima / Sensör / IT Güç
   ========================================================================== */
/* ==========================================================================
   DCIM Sunum — Rapor mock verileri (R5): Klima, Sensör (Kabin), IT Güç Tüketim
   HIS_Climate / HIS_Cabin_Sensor / HIS_Maxpow API çağrılarının yerine geçen,
   filtreye göre deterministik (tohumlu) üreticiler. Sonradan mock-data.js'e birleştirilir.
   Bağımlılık: js/mock-data.js (DCIM.data)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  const R = (D.reports = D.reports || {});

  const rngOf = key => D.rng(D.hash(String(key)));
  const between = (rnd, a, b) => a + (b - a) * rnd();
  const r2 = n => Math.round(n * 100) / 100;
  const pad = n => String(n).padStart(2, '0');
  const dateKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const DAY = 86400000;

  // 'YYYY-MM-DD' → yerel gece yarısı
  function parseDay(s) {
    const p = String(s || '').split('-').map(Number);
    return p.length === 3 && !p.some(isNaN) ? new Date(p[0], p[1] - 1, p[2]) : null;
  }
  // Başlangıç–bitiş arasındaki günler (bugünden sonrası veri içermez)
  function dayList(startDate, endDate) {
    const s = parseDay(startDate);
    const e = parseDay(endDate);
    if (!s || !e || e < s) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const out = [];
    for (let d = new Date(s); d <= e && d <= today && out.length < 400; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) out.push(new Date(d));
    return out;
  }
  // Tek gün içinde saatlik periyotlar (startTime–endTime, şu andan sonrası yok)
  function hourList(date, startTime, endTime) {
    const d = parseDay(date);
    if (!d) return [];
    const [sh] = String(startTime || '00:00').split(':').map(Number);
    const [eh] = String(endTime || '23:59').split(':').map(Number);
    const now = Date.now();
    const out = [];
    for (let h = sh || 0; h <= (isNaN(eh) ? 23 : eh); h++) {
      const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, 0, 0);
      if (t.getTime() > now) break;
      out.push(t);
    }
    return out;
  }
  const daysAgo = d => Math.max(0, Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / DAY));

  // ---------------------------------------------------------------------------
  // KLİMA RAPORU — HIS_Climate
  // ---------------------------------------------------------------------------
  const CLIMATE_FLOORS = {
    'CMR/T00': { prefix: 'IDC1', no: 1, units: null },
    'CMR/T02': { prefix: 'IDC1', no: 2, units: 10 },
    'CMR/T03': { prefix: 'IDC1', no: 3, units: 8 },
    'CMR/T04': { prefix: 'IDC4', no: 4, units: 6 }
  };

  // Kattaki klima üniteleri (KLM101 ...). 1. kat gerçek yerleşimden gelir.
  function climateUnits(floorValue) {
    const f = CLIMATE_FLOORS[floorValue];
    if (!f) return [];
    if (!f.units) {
      return D.climates.map(c => (String(c.devId).match(/KLM[A-Z]?\d+/i) || [''])[0].toUpperCase()).filter(Boolean).sort();
    }
    const out = [];
    for (let i = 1; i <= f.units; i++) out.push('KLM' + f.no + pad(i));
    return out;
  }

  // Klima başına temel profil (1. katta DCIM.data.climates değerleri)
  const climateProfileCache = {};
  function climateProfile(unit) {
    if (climateProfileCache[unit]) return climateProfileCache[unit];
    const rnd = rngOf('clm-profile-' + unit);
    const num = unit.replace(/\D/g, '');
    const eq = D.climates.find(c => c.label === 'KLIMA ' + num && /^1/.test(num));
    const hum = eq ? Number((eq.points.find(p => p.label === 'Oda Nemi') || {}).value) : Math.round(between(rnd, 40, 50));
    const p = {
      ret: eq ? eq.returnTemp : r2(between(rnd, 23.5, 26.6)),
      sup: eq ? eq.supplyTemp : r2(between(rnd, 15.6, 17.6)),
      setT: rnd() < 0.7 ? 24 : 23,
      hum: hum || 45,
      setH: 50,
      alarm: eq && eq.status === 'alarm',      // KLIMA 109 — kompresör yüksek basınç
      retHigh: eq && eq.note === 'Dönüş havası yüksek' // KLIMA 112
    };
    climateProfileCache[unit] = p;
    return p;
  }

  // Tek bir (rid, zaman) için değer. kind: günlük/saatlik; calc: Average|Minimum|Maximum
  function climateValue(unit, type, t, calc, hourly) {
    const p = climateProfile(unit);
    const rnd = rngOf(unit + '|' + type + '|' + t.getTime() + '|' + (hourly ? 'h' : 'd'));
    const ago = daysAgo(t);
    const diurnal = Math.sin(((t.getHours() - 9) / 24) * Math.PI * 2);
    const seasonal = Math.sin((t.getTime() / DAY / 365) * Math.PI * 2) * 0.35;
    let v;
    let spread;
    switch (type) {
      case 'ROOM_AIR_RET_TEMP':
        v = p.ret + seasonal + (hourly ? diurnal * 0.7 : 0) + between(rnd, -0.45, 0.45);
        if (p.retHigh && ago <= 2) v += (3 - ago) * 1.1;
        if (p.alarm && ago <= 2) v += (3 - ago) * 0.9;
        spread = between(rnd, 0.9, 1.6);
        break;
      case 'SUP_AIR_TEMP':
        v = p.sup + seasonal * 0.5 + (hourly ? diurnal * 0.35 : 0) + between(rnd, -0.3, 0.3);
        if (p.alarm && ago <= 2) v += (3 - ago) * 1.3; // kompresör arızası → üfleme sıcaklığı yükseliyor
        spread = between(rnd, 0.5, 1.1);
        break;
      case 'TEMP_SETTING_POINT':
        return p.setT;
      case 'ROOM_AIR_RET_HUMD':
        v = p.hum + (hourly ? -diurnal * 1.8 : 0) + between(rnd, -2.2, 2.2);
        spread = between(rnd, 2.5, 4.5);
        break;
      case 'SUP_HUMD':
        v = p.hum + 4.5 + (hourly ? -diurnal * 1.2 : 0) + between(rnd, -1.8, 1.8);
        spread = between(rnd, 2, 4);
        break;
      case 'HUMD_SETTING_POINT':
        return p.setH;
      default:
        return 0;
    }
    if (calc === 'Minimum') v -= spread;
    else if (calc === 'Maximum') v += spread;
    return r2(v);
  }

  // opts: { floors: [floorValue], units: ['KLM101'], dataTypes: [], calc, mode: 'daily'|'hourly',
  //         filterDate, startTime, endTime, startDate, endDate }
  // Dönüş: [{ rid, tim|period, result }]
  function climateQuery(opts) {
    const out = [];
    const seen = new Set();
    const times = opts.mode === 'hourly' ? hourList(opts.filterDate, opts.startTime, opts.endTime) : dayList(opts.startDate, opts.endDate);
    (opts.floors || []).forEach(fv => {
      const f = CLIMATE_FLOORS[fv];
      if (!f) return;
      const valid = new Set(climateUnits(fv));
      (opts.units || []).forEach(unit => {
        if (!valid.has(unit)) return; // bu katta olmayan klima → veri yok
        (opts.dataTypes || []).forEach(type => {
          const rid = f.prefix + '_' + unit + '_' + type;
          if (seen.has(rid)) return;
          seen.add(rid);
          times.forEach(t => {
            const rec = { rid, result: climateValue(unit, type, t, opts.calc, opts.mode === 'hourly') };
            if (opts.mode === 'hourly') rec.period = t.toISOString(); else rec.tim = t.toISOString();
            out.push(rec);
          });
        });
      });
    });
    return out;
  }

  R.climate = { units: climateUnits, query: climateQuery };

  // ---------------------------------------------------------------------------
  // SENSÖR (KABİN) RAPORU — HIS_Cabin_Sensor
  // ---------------------------------------------------------------------------
  const CABIN_FLOORS = {
    'CMR/T00': { prefix: 'K1S1', digit: '1' },
    'CMR/T02': { prefix: 'K2S1', digit: '2' },
    'CMR/T03': { prefix: 'K3S1', digit: '3' },
    'CMR/T04': { prefix: 'IDC4', digit: '4' }
  };
  const CABIN_SENSORS = ['TEMP_BOT', 'TEMP_MID', 'TEMP_TOP', 'HUM_MID', 'FDOOR', 'RDOOR'];

  // Kattaki kabinler: [{ module, pod }]
  const cabinModuleCache = {};
  function cabinModules(floorValue) {
    const f = CABIN_FLOORS[floorValue];
    if (!f) return [];
    if (!cabinModuleCache[floorValue]) {
      cabinModuleCache[floorValue] = D.cabinets.map(c => ({ module: f.digit + c.code.slice(1), pod: c.pod }));
    }
    return cabinModuleCache[floorValue];
  }

  // Kattaki tüm kabin sensör io id'leri (//io[@xdb_cls='CABIN_TEMP' ...]/@id karşılığı)
  function cabinSensorIds(floorValue) {
    const f = CABIN_FLOORS[floorValue];
    if (!f) return [];
    const ids = [];
    cabinModules(floorValue).forEach(m => {
      CABIN_SENSORS.forEach(s => ids.push(f.prefix + '_' + m.pod.replace('-', '') + '_' + m.module + '_' + s));
    });
    return ids;
  }

  // Kabin başına güncel ve temel (senaryo öncesi) profil
  const cabinProfileCache = {};
  function cabinProfile(module) {
    if (cabinProfileCache[module]) return cabinProfileCache[module];
    const rnd = rngOf('cab-profile-' + module);
    const cab = module.charAt(0) === '1' ? D.findCabinet(module) : null;
    const baseMid = r2(between(rnd, 21.4, 24.6));
    const base = { TEMP_MID: baseMid, TEMP_TOP: r2(baseMid + between(rnd, 0.7, 1.9)), TEMP_BOT: r2(baseMid - between(rnd, 0.9, 2.2)), HUM_MID: Math.round(between(rnd, 40, 51)) };
    const cur = cab ? { TEMP_MID: cab.tempMid, TEMP_TOP: cab.tempTop, TEMP_BOT: cab.tempLow, HUM_MID: cab.humidity } : base;
    const scenario = !!(cab && cab.note && /sıcaklık|nem/i.test(cab.note));
    const p = {
      cur,
      base: scenario ? base : cur,
      frontOpen: !!(cab && cab.frontDoor === 'open'),
      rearOpen: !!(cab && cab.rearDoor === 'open'),
      lost: !!(cab && cab.status === 'lost')
    };
    cabinProfileCache[module] = p;
    return p;
  }

  function cabinValue(module, sensor, t, calc, hourly) {
    const p = cabinProfile(module);
    const rnd = rngOf(module + '|' + sensor + '|' + t.getTime() + '|' + (hourly ? 'h' : 'd'));
    const ago = daysAgo(t);
    if (sensor === 'FDOOR' || sensor === 'RDOOR') {
      const openNow = sensor === 'FDOOR' ? p.frontOpen : p.rearOpen;
      const hoursAgo = (Date.now() - t.getTime()) / 3600000;
      // 1 = kapalı, 0 = açık
      if (openNow && (hourly ? hoursAgo < 2 : ago === 0)) return calc === 'Maximum' ? 1 : 0;
      const openedThatPeriod = rnd() < (hourly ? 0.05 : 0.22);
      if (calc === 'Minimum') return openedThatPeriod ? 0 : 1;
      if (calc === 'Maximum') return 1;
      return openedThatPeriod ? r2(between(rnd, 0.93, 0.99)) : 1;
    }
    // Senaryo kabinleri: son 3 günde temel değerden güncel değere doğru kayma
    const w = Math.max(0, 1 - ago / 3);
    const target = p.base[sensor] + (p.cur[sensor] - p.base[sensor]) * w;
    const isHum = sensor === 'HUM_MID';
    const diurnal = hourly ? Math.sin(((t.getHours() - 10) / 24) * Math.PI * 2) * (isHum ? -1.5 : 0.45) : 0;
    let v = target + diurnal + between(rnd, isHum ? -1.6 : -0.35, isHum ? 1.6 : 0.35);
    const spread = isHum ? between(rnd, 2, 4) : between(rnd, 0.5, 1.2);
    if (calc === 'Minimum') v -= spread;
    else if (calc === 'Maximum') v += spread;
    return r2(v);
  }

  // opts: { rids: [], calc, mode, filterDate, startTime, endTime, startDate, endDate }
  // Dönüş: [{ rid, tim, result_value }] — günlükte tim 'YYYY-MM-DD', saatlikte ISO
  function cabinQuery(opts) {
    const hourly = opts.mode === 'hourly';
    const times = hourly ? hourList(opts.filterDate, opts.startTime, opts.endTime) : dayList(opts.startDate, opts.endDate);
    const out = [];
    (opts.rids || []).forEach(rid => {
      const parts = rid.split('_');
      const module = parts[2];
      const sensor = parts.slice(3).join('_');
      const p = cabinProfile(module);
      times.forEach(t => {
        // 1CE51: sensör modülü haberleşmesi koptu → son saatte veri yok
        if (p.lost && Date.now() - t.getTime() < (hourly ? 3600000 : 0)) return;
        out.push({ rid, tim: hourly ? t.toISOString() : dateKey(t), result_value: cabinValue(module, sensor, t, opts.calc, hourly) });
      });
    });
    return out;
  }

  // Kabin grafik popup'ı (cabin-chart-popup) için son 24 saatin ham noktaları
  const SENSOR_DESC = { TEMP_BOT: 'Sıcaklık Alt', TEMP_MID: 'Sıcaklık Orta', TEMP_TOP: 'Sıcaklık Üst', HUM_MID: 'Nem Orta' };
  function cabinHistory(rids) {
    const out = [];
    const now = new Date();
    now.setMinutes(0, 0, 0);
    (rids || []).forEach(rid => {
      const parts = rid.split('_');
      const sensor = parts.slice(3).join('_');
      if (!SENSOR_DESC[sensor]) return;
      const p = cabinProfile(parts[2]);
      for (let i = 23; i >= 0; i--) {
        const t = new Date(now.getTime() - i * 3600000);
        if (p.lost && i === 0) continue;
        out.push({ rid, desc: SENSOR_DESC[sensor], val: cabinValue(parts[2], sensor, t, 'Average', true), qry_doc: t.toISOString(), date: t.toISOString() });
      }
    });
    return out;
  }

  R.cabin = { modules: cabinModules, sensorIds: cabinSensorIds, query: cabinQuery, history: cabinHistory };

  // ---------------------------------------------------------------------------
  // IT GÜÇ TÜKETİM RAPORU — HIS_Maxpow (rid, max, tim)
  // ---------------------------------------------------------------------------
  const IT_FLOORS = {
    'CMR/T01': { prefix: 'K1S1', digit: '1' },
    'CMR/T02': { prefix: 'K2S1', digit: '2' },
    'CMR/T03': { prefix: 'K3S1', digit: '3' },
    'CMR/T04': { prefix: 'IDC4', digit: '4' }
  };

  // opts: { kats: ['CMR/T01'], period, filterDate, startDate, endDate }
  function itPowerQuery(opts) {
    const now = new Date();
    let from;
    let to;
    if (opts.period === 'instant') {
      to = now;
      from = new Date(now.getTime() - 15 * 60000);
    } else if (opts.period === 'daily') {
      const d = parseDay(opts.filterDate) || new Date(now.getFullYear(), now.getMonth(), now.getDate());
      from = d;
      to = new Date(Math.min(now.getTime(), d.getTime() + DAY - 1000));
    } else {
      from = parseDay(opts.startDate);
      const e = parseDay(opts.endDate);
      to = e ? new Date(Math.min(now.getTime(), e.getTime() + DAY - 1000)) : null;
    }
    if (!from || !to || to < from) return [];
    const spanDays = Math.max(1, (to - from) / DAY);
    // Uzun periyotta tepe değeri daha yüksek çıkar
    const peakBoost = opts.period === 'instant' ? 1 : 1 + Math.min(0.22, 0.06 + Math.log10(spanDays + 1) * 0.12);
    const periodKey = opts.period + '|' + dateKey(from) + '|' + dateKey(to);
    const out = [];
    (opts.kats || []).forEach(kv => {
      const f = IT_FLOORS[kv];
      if (!f) return;
      D.cabinets.forEach(c => {
        const code = f.digit + c.code.slice(1);
        const baseRnd = rngOf('itp-base-' + code);
        const kw = f.digit === '1' ? c.powerKw : r2(between(baseRnd, 1.4, 6.2));
        ['A', 'B'].forEach(feed => {
          const rid = f.prefix + '_' + c.pod.replace('-', '') + '_' + code + '_PDU_' + feed + '_TOT_POW';
          const rnd = rngOf(rid + '|' + periodKey);
          // 1AV42 PDU-B faz kaybı → B beslemesi 0 W
          if (f.digit === '1' && c.pduFault && feed === 'B') { out.push({ rid, max: 0, tim: to.toISOString() }); return; }
          const share = f.digit === '1' && c.pduFault ? 1 : between(rnd, 0.44, 0.56);
          const max = kw * 1000 * share * peakBoost * between(rnd, 0.97, 1.06);
          const tim = new Date(from.getTime() + (to - from) * rnd());
          out.push({ rid, max: r2(max), tim: tim.toISOString() });
        });
      });
    });
    return out;
  }

  R.itPower = { query: itPowerQuery };
})();

/* ==========================================================================
   Etap 3 — work-orders.html verisi (eski js/mock/work-orders.data.js)
   ========================================================================== */
/* ==========================================================================
   DCIM Sunum — İş Emirleri mock verisi (parça dosya)
   doc('WOR/S00')/id('WOR_List')/item satırlarının ham karşılığı (DASService XDBT sorgusu).
   Alanlar orijinal kayıtla aynı: rid, ord_id, erp_id, sta ('0x030N'), tim_open/plan/begn/end,
   cat_main, cat_sub1, asn_grp, svc_id, svc_name, svc_desc, loc_main, loc_sub1, wor_name,
   usr / note (durum metni → değer JSON dizgisi), jsn { prm1, prm2 }.
   Sunum eki (orijinal WOR_List'te yok): prio, asn_usr (atanan teknisyen), tim_due (termin).
   Senaryo: 1AV42 PDU-B faz kaybı, KLIMA 109 yüksek basınç, UPS A5 akü modu, UPS B7 SNMP kaybı,
   1BJ53/1BC37 sıcaklık, 1AZ39 yetkisiz kapak, 1BX54 kilit motoru… (README "Sunum senaryosu").
   Tamamlanmış enerji siparişleri DCIM.data.customers.worList'ten alınır (Müşteri Eşleştirme ile aynı kayıtlar).
   Bağımlılık: js/mock-data.js → DCIM.data (rng, hash, cabinets, personnel, customers)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D) return;

  const rnd = D.rng(D.hash('work-orders-2026'));
  const NOW = Date.now();
  const H = 3600000;
  // Saat cinsinden ofset → Date (dakika hassasiyetinde, tohumlu 0-50 dk geriye sapma; bildirim asla gelecekte olmaz)
  const at = h => new Date(Math.floor((NOW + h * H - Math.floor(rnd() * 50) * 60000) / 60000) * 60000);

  // Durum metinleri (messages.tr.json → workOrderPages.statusList; NewUICMPWorkOrdersComponent.getStaText sırası)
  const STA_TEXT = { 0: 'İPTAL', 1: 'YENİ', 2: 'PLANLANIYOR', 3: 'İŞLİYOR-NORMAL', 4: 'TAMAMLANDI', 5: 'DURDU-İK', 6: 'BEKLİYOR-UYARI' };
  // Bir durumdaki kaydın geçtiği adımlar (usr / note JSON anahtarları bu sırayla yazılır)
  const PATH = { 0: [0], 1: [], 2: [2], 3: [2, 3], 4: [2, 3, 4], 5: [2, 5], 6: [2, 3, 6] };
  const DEFAULT_NOTE = {
    0: 'Mükerrer kayıt, iptal edildi.',
    2: 'Ekip ve malzeme planlandı.',
    3: 'Sahada çalışma başladı.',
    4: 'Çalışma tamamlandı, değerler normale döndü.',
    5: 'Bakım penceresi onayı bekleniyor.',
    6: 'Yedek parça tedariki bekleniyor.'
  };

  const PERSONNEL = D.personnel || [];
  const deptOf = name => (PERSONNEL.find(p => p.name === name) || {}).dept || 'Veri Merkezi Operasyon';
  const TECHNICIANS = PERSONNEL.filter(p => p.dept.indexOf('Müşteri Temsilcisi') < 0).map(p => ({ name: p.name, team: p.dept }));

  const FULL_CUSTOMER = {
    'Marmara Sigorta': 'Marmara Sigorta A.Ş.',
    'Delta Yazılım': 'Delta Yazılım Teknolojileri A.Ş.',
    'Başkent Belediyesi': 'Başkent Belediyesi Bilgi İşlem Daire Başkanlığı',
    'Ege Lojistik': 'Ege Lojistik ve Taşımacılık A.Ş.',
    'Kuzey Enerji': 'Kuzey Enerji Dağıtım A.Ş.'
  };
  const ROOM = '1. Kat 1. Salon Sistem Odası';
  const LOC_MAIN = 'Veri Merkezi / Kat 1 / Salon 1';

  // Kabin veya altyapı ekipmanı → lokasyon + müşteri bilgisi
  function locate(target) {
    const cab = (D.cabinets || []).find(c => c.code === target);
    if (cab) {
      return { kind: 'cabinet', target, loc_sub1: cab.pod + ' / ' + cab.col + ' Sırası / ' + cab.code, cabinet: cab.code, customer: FULL_CUSTOMER[cab.customer] || cab.customer };
    }
    const EQUIP = {
      'UPS A5': 'UPS Hattı A / UPS A5',
      'UPS B7': 'UPS Hattı B / UPS B7',
      'KLIMA 109': 'Kuzey Duvar / KLIMA 109',
      'KLIMA 104': 'Kuzey Duvar / KLIMA 104',
      'KLIMA 112': 'Güney Duvar / KLIMA 112',
      'Master Pano': 'Enerji Odası / Master Pano',
      'Jeneratör G1': 'Bina Dışı / Jeneratör Sahası',
      'FM-200': 'Salon 1 / Söndürme Tüpleri',
      'POD-8': 'POD-8 / Yapısal Kablolama',
      'POD-6': 'POD-6 / 1CB Sırası PDU Hattı',
      'Kilit GW': 'Salon 1 / Kilit Ağ Geçitleri'
    };
    return { kind: 'equipment', target, loc_sub1: EQUIP[target] || target, cabinet: '', customer: 'Türk Telekom (Dahili)' };
  }

  const SERVICE = {
    fault: { cat: 'Arıza Onarım', svc: '7x24 Kritik Altyapı Arıza Müdahalesi', id: '4102110' },
    maint: { cat: 'Periyodik Bakım', svc: 'Kritik Altyapı Bakım Sözleşmesi', id: '4102120' },
    check: { cat: 'Kontrol / Test', svc: 'Kritik Altyapı Bakım Sözleşmesi', id: '4102120' },
    mount: { cat: 'Kurulum / Montaj', svc: 'Sunucu Barındırma - Tam Kabin (42U) 5 kW', id: '4103410' },
    security: { cat: 'Güvenlik İncelemesi', svc: 'Fiziksel Güvenlik Hizmeti', id: '4102150' },
    network: { cat: 'Kablolama', svc: 'Yapısal Kablolama Hizmeti', id: '4102170' }
  };

  let ordSeq = 48120;
  let worSeq = 26090440;
  const LIST = [];

  // o: { t: başlık, sta, prio, tech, target, type, open (saat, negatif=geçmiş), due (saat), notes: {adım: metin}, planner }
  function add(o) {
    const loc = locate(o.target);
    const svc = SERVICE[o.type] || SERVICE.maint;
    const sta = o.sta;
    const tOpen = at(o.open);
    const span = Math.max(1, -o.open);
    const tPlan = PATH[sta].indexOf(2) >= 0 || sta === 0 ? new Date(tOpen.getTime() + Math.min(span * 0.15, 3) * H) : null;
    const tBegn = [3, 4, 6].indexOf(sta) >= 0 ? new Date(tOpen.getTime() + Math.min(span * 0.35, 20) * H) : null;
    const tEnd = sta === 4 ? new Date(tOpen.getTime() + span * 0.85 * H) : null;
    const planner = o.planner || 'Ayşe Demir';
    const usr = {};
    const note = {};
    PATH[sta].forEach(step => {
      usr[STA_TEXT[step]] = step === 2 || step === 0 ? planner : o.tech;
      note[STA_TEXT[step]] = (o.notes && o.notes[step]) || DEFAULT_NOTE[step];
    });
    const customer = o.customer || loc.customer;
    LIST.push({
      rid: 'WR' + String(worSeq++).padStart(12, '0'),
      ord_id: 'SIP-26-' + String(ordSeq++).padStart(6, '0'),
      erp_id: o.erp || '-',
      sta: '0x030' + sta.toString(16).toUpperCase(),
      tim_open: tOpen,
      tim_plan: tPlan,
      tim_begn: tBegn,
      tim_end: tEnd,
      cat_main: 'DCIM Operasyon',
      cat_sub1: svc.cat,
      asn_grp: deptOf(o.tech),
      svc_id: svc.id,
      svc_name: svc.cat + ' — ' + o.target,
      svc_desc: o.pkg || svc.svc,
      loc_area: 'Ankara',
      loc_main: LOC_MAIN,
      loc_sub1: loc.loc_sub1,
      wor_name: o.t,
      usr: Object.keys(usr).length ? JSON.stringify(usr) : '',
      note: Object.keys(note).length ? JSON.stringify(note) : '',
      jsn: {
        prm1: { customer_name: customer, cabinet_info: loc.cabinet || loc.target, room_info: ROOM },
        prm2: { energy_limit: o.kw ? o.kw + ' kW' : '', energy_product_id: '', service_number: o.svcNo || '' }
      },
      prio: o.prio,
      asn_usr: o.tech,
      tim_due: at(o.due),
      target: loc.target,
      target_kind: loc.kind
    });
  }

  // --- Senaryo ile uyumlu operasyon iş emirleri ------------------------------------------
  add({ t: '1AV42 PDU-B Faz Kaybı Onarımı', sta: 3, prio: 'critical', tech: 'Emre Çelik', target: '1AV42', type: 'fault', open: -5, due: 3,
    notes: { 2: 'PDU-B L2 fazında gerilim yok; yedek sigorta ve ölçüm ekipmanı hazırlandı.', 3: 'PDU-B besleme sigortası değiştiriliyor, yük PDU-A üzerinde.' } });
  add({ t: 'KLIMA 109 Kompresör Yüksek Basınç Bakımı', sta: 3, prio: 'critical', tech: 'Can Öztürk', target: 'KLIMA 109', type: 'fault', open: -4, due: 6,
    notes: { 2: 'Yüklenici firma çağrıldı; kondenser temizliği ve gaz kontrolü planlandı.', 3: 'Kompresör 1 basıncı 27,8 bar; kondenser fan motoru kontrol ediliyor.' } });
  add({ t: 'UPS A5 Akü Grubu Kontrolü ve Yük Testi', sta: 3, prio: 'critical', tech: 'Emre Çelik', target: 'UPS A5', type: 'check', open: -2, due: 2,
    notes: { 2: 'UPS A5 akü modunda; şebeke girişi ve akü blokları kontrol edilecek.', 3: 'Giriş rölesi kontrol ediliyor, akü blok gerilimleri ölçülüyor.' } });
  add({ t: '1BJ53 Yüksek Sıcaklık — Hava Akışı İncelemesi', sta: 6, prio: 'high', tech: 'Mehmet Kaya', target: '1BJ53', type: 'fault', open: -20, due: -2,
    notes: { 2: 'Orta sensör 32,4 °C; sıcak koridor sızıntısı şüphesi.', 3: 'Kabin önü delikli karo yerleşimi kontrol edildi.', 6: 'Kör panel (blanking panel) tedariki bekleniyor.' } });
  add({ t: '1BC37 Kör Panel ve Hava Akışı Düzenlemesi', sta: 2, prio: 'high', tech: 'Mehmet Kaya', target: '1BC37', type: 'maint', open: -9, due: 15,
    notes: { 2: '6 adet 1U kör panel ve kablo fırçası montajı planlandı.' } });
  add({ t: 'UPS B7 SNMP Kartı Değişimi', sta: 6, prio: 'high', tech: 'Burak Şahin', target: 'UPS B7', type: 'fault', open: -30, due: -6,
    notes: { 2: 'UPS B7 SNMP yanıt vermiyor; kart resetlendi, sorun devam ediyor.', 3: 'Ağ kablosu ve switch portu değiştirildi.', 6: 'Yedek SNMP kartı üreticiden bekleniyor.' } });
  add({ t: '1CB52 Yüksek Akım — PDU Yük Dengeleme', sta: 2, prio: 'high', tech: 'Emre Çelik', target: '1CB52', type: 'check', open: -7, due: 20,
    notes: { 2: 'Kabin 7,9 kW; iki sunucunun PDU-B çıkışlarına taşınması planlandı.' } });
  add({ t: '1BU54 Yüksek Nem — Sensör Kalibrasyonu', sta: 1, prio: 'medium', tech: 'Zeynep Arslan', target: '1BU54', type: 'check', open: -1.5, due: 46 });
  add({ t: '1CE51 Sensör Haberleşme Arızası Giderme', sta: 3, prio: 'high', tech: 'Burak Şahin', target: '1CE51', type: 'fault', open: -6, due: 4,
    notes: { 2: 'Modbus TCP yoklaması yanıtsız; ağ geçidi ve RJ45 bağlantısı kontrol edilecek.', 3: 'Sensör ağ geçidi yeniden başlatıldı, kablo testi yapılıyor.' } });
  add({ t: '1AZ39 Yetkisiz Kapak Açılması İncelemesi', sta: 3, prio: 'high', tech: 'Deniz Koç', target: '1AZ39', type: 'security', open: -3, due: 5,
    notes: { 2: 'Kart okuma ve kamera kayıtları talep edildi.', 3: 'Kamera kayıtları inceleniyor, müşteri temsilcisi ile görüşülüyor.' } });
  add({ t: '1BX54 Kilit Motoru Değişimi', sta: 6, prio: 'medium', tech: 'Can Öztürk', target: '1BX54', type: 'fault', open: -40, due: 12,
    notes: { 2: 'Ön kapak kilit motoru tepki vermiyor.', 3: 'Motor sökülerek test edildi, arızalı.', 6: 'Yedek kilit motoru siparişi verildi.' } });
  add({ t: '1BN52 Arka Kapak Sensörü ve Menteşe Kontrolü', sta: 1, prio: 'low', tech: 'Mehmet Kaya', target: '1BN52', type: 'check', open: -0.8, due: 70 });
  add({ t: '1BG41 Periyodik Kabin Bakımı', sta: 4, prio: 'low', tech: 'Mehmet Kaya', target: '1BG41', type: 'maint', open: -26, due: -4,
    notes: { 2: 'Yetkili bakım penceresi 09:00–11:00 olarak onaylandı.', 3: 'Filtre, kablo düzeni ve PDU bağlantıları kontrol ediliyor.', 4: 'Bakım tamamlandı, kapak kilitlendi.' } });
  add({ t: '1BU50 Kart Okuyucu Yetki Denetimi', sta: 2, prio: 'medium', tech: 'Deniz Koç', target: '1BU50', type: 'security', open: -11, due: 26,
    notes: { 2: 'Yetkisiz kart denemesi sonrası erişim listesi gözden geçirilecek.' } });
  add({ t: 'Kabin 1BQ56 Server Montajı (2×2U)', sta: 2, prio: 'medium', tech: 'Zeynep Arslan', target: '1BQ56', type: 'mount', open: -16, due: 30, pkg: 'Sunucu Barındırma - 4U Paylaşımlı Kabin', erp: '8100427715', kw: 2.5,
    notes: { 2: 'Müşteri cihazları depoya teslim alındı; U19–U22 arası ayrıldı.' } });
  add({ t: 'Kabin 1AV43 Server Montajı (4U)', sta: 1, prio: 'medium', tech: 'Zeynep Arslan', target: '1AV43', type: 'mount', open: -2.5, due: 52, pkg: 'Sunucu Barındırma - Yarım Kabin (21U) 2,5 kW', erp: '8100433902', kw: 2.5 });
  add({ t: 'POD-6 PDU-B Faz Dengeleme', sta: 3, prio: 'high', tech: 'Emre Çelik', target: 'POD-6', type: 'check', open: -10, due: 8,
    notes: { 2: 'L1/L2/L3 faz dengesizliği %18; çıkış bazlı yük dağılımı çıkarıldı.', 3: 'Bakım penceresinde kabin bazlı yük aktarımı yapılıyor.' } });
  add({ t: 'KLIMA 104 Filtre Değişimi', sta: 2, prio: 'medium', tech: 'Can Öztürk', target: 'KLIMA 104', type: 'maint', open: -14, due: 10,
    notes: { 2: 'Fark basınç anahtarı filtre kirli uyarısı verdi; G4 filtre seti hazırlandı.' } });
  add({ t: 'KLIMA 112 Dönüş Havası Sensör Kontrolü', sta: 1, prio: 'medium', tech: 'Can Öztürk', target: 'KLIMA 112', type: 'check', open: -1, due: 40 });
  add({ t: 'Master Pano THD Ölçümü ve Harmonik Analizi', sta: 5, prio: 'medium', tech: 'Emre Çelik', target: 'Master Pano', type: 'check', open: -50, due: 22,
    notes: { 2: 'Güç kalitesi analizörü ile 24 saatlik kayıt planlandı.', 5: 'Analizör kalibrasyonu nedeniyle iş durduruldu.' } });
  add({ t: 'Jeneratör G1 Aylık Yük Testi', sta: 4, prio: 'medium', tech: 'Emre Çelik', target: 'Jeneratör G1', type: 'check', open: -74, due: -50,
    notes: { 2: 'Yük bankası ile 30 dakikalık test planlandı.', 3: 'Test başladı, %75 yükte çalışıyor.', 4: 'Test başarılı; yakıt seviyesi %92.' } });
  add({ t: 'FM-200 Söndürme Sistemi Periyodik Kontrolü', sta: 2, prio: 'low', tech: 'Deniz Koç', target: 'FM-200', type: 'maint', open: -22, due: 96,
    notes: { 2: 'Tüp basınçları ve dedektör testi için yetkili firma ile randevu alındı.' } });
  add({ t: 'POD-8 Yapısal Kablolama — Patch Panel Düzenleme', sta: 5, prio: 'low', tech: 'Burak Şahin', target: 'POD-8', type: 'network', open: -60, due: 60,
    notes: { 2: '1BQ sırası patch panelleri etiketlenecek.', 5: 'Müşteri bakım penceresi onayı bekleniyor.' } });
  add({ t: '1CE56 Sıcaklık Uyarısı — Delikli Karo Yerleşimi', sta: 3, prio: 'medium', tech: 'Mehmet Kaya', target: '1CE56', type: 'maint', open: -8, due: 16,
    notes: { 2: 'Soğuk koridor karo yerleşimi ve kabin önü akış ölçümü planlandı.', 3: 'İki adet %56 delikli karo yerleştirildi, sıcaklık izleniyor.' } });
  add({ t: '1BX50 Düşük Sıcaklık — Klima Set Değeri Ayarı', sta: 4, prio: 'low', tech: 'Can Öztürk', target: '1BX50', type: 'check', open: -34, due: -10,
    notes: { 2: 'KLIMA 113 set değeri kontrol edilecek.', 3: 'Set değeri 20 °C → 22 °C güncellendi.', 4: 'Kabin sıcaklığı 21,4 °C, uyarı kalktı.' } });
  add({ t: 'UPS A Hattı Yıllık Üretici Bakımı', sta: 0, prio: 'medium', tech: 'Emre Çelik', target: 'UPS A5', type: 'maint', open: -90, due: -30,
    notes: { 0: 'Mükerrer kayıt; bakım yeni tarihle yeniden açılacak.' } });
  add({ t: 'Kilit Ağ Geçidi Firmware Güncellemesi', sta: 1, prio: 'low', tech: 'Burak Şahin', target: 'Kilit GW', type: 'network', open: -0.4, due: 120 });

  // --- Tamamlanmış enerji siparişleri (Müşteri Eşleştirme ekranındaki WOR kayıtları) ------------
  const CU = D.customers && D.customers.worList ? D.customers.worList.filter(w => !w.is_matched).slice(0, 6) : [];
  CU.forEach((w, i) => {
    const end = new Date(w.tim_end_ms);
    const open = new Date(end.getTime() - (70 + i * 9) * H);
    const plan = new Date(open.getTime() + 2 * H);
    const begn = new Date(open.getTime() + 20 * H);
    const tech = i % 2 ? 'Zeynep Arslan' : 'Emre Çelik';
    LIST.push({
      rid: w.id,
      ord_id: 'SIP-26-' + String(ordSeq++).padStart(6, '0'),
      erp_id: w.erp_id,
      sta: '0x0304',
      tim_open: open,
      tim_plan: plan,
      tim_begn: begn,
      tim_end: end,
      cat_main: 'Enerji Siparişi',
      cat_sub1: 'Enerji Siparişi',
      asn_grp: deptOf(tech),
      svc_id: w.svc_id,
      svc_name: 'Enerji Siparişi — ' + w.customer_name,
      svc_desc: w.svc_desc,
      loc_area: 'Ankara',
      loc_main: LOC_MAIN,
      loc_sub1: 'Kabin / PDU ataması bekleniyor',
      wor_name: 'Enerji Siparişi — ' + w.svc_desc,
      usr: JSON.stringify({ 'PLANLANIYOR': 'Zeynep Arslan', 'İŞLİYOR-NORMAL': tech, 'TAMAMLANDI': tech }),
      note: JSON.stringify({
        'PLANLANIYOR': 'ERP siparişi alındı, kabin ve PDU çıkışı planlandı.',
        'İŞLİYOR-NORMAL': 'Enerji hattı çekimi ve etiketleme yapılıyor.',
        'TAMAMLANDI': 'Enerji hattı devreye alındı, müşteri eşleştirmesi bekleniyor.'
      }),
      jsn: {
        prm1: { customer_name: w.customer_name, cabinet_info: '', room_info: ROOM },
        prm2: { energy_limit: (w.svc_desc.match(/(\d+(?:,\d+)?) kW/) || [])[0] || '', energy_product_id: w.energy_product_id, service_number: w.svc_id }
      },
      prio: 'medium',
      asn_usr: tech,
      tim_due: new Date(end.getTime() + (6 + i) * H),
      target: '',
      target_kind: 'energy'
    });
  });

  // Hedef seçenekleri (Yeni İş Emri formu)
  const TARGETS = [
    '1AV42', '1AV43', '1BJ53', '1BC37', '1CB52', '1BU54', '1CE51', '1AZ39', '1BX54', '1BN52', '1BQ55', '1BQ56', '1CE56', '1BG41',
    'UPS A5', 'UPS B7', 'KLIMA 109', 'KLIMA 104', 'KLIMA 112', 'Master Pano', 'Jeneratör G1', 'POD-6', 'POD-8'
  ].map(t => { const l = locate(t); return { value: t, label: t + (l.kind === 'cabinet' ? ' — ' + l.loc_sub1.split(' / ')[0] + ' · ' + l.customer : ' — ' + l.loc_sub1.split(' / ')[0]) }; });

  D.workOrders = {
    list: LIST,
    technicians: TECHNICIANS,
    targets: TARGETS,
    services: Object.keys(SERVICE).map(k => ({ value: k, label: SERVICE[k].cat, pkg: SERVICE[k].svc, id: SERVICE[k].id })),
    locate,
    locMain: LOC_MAIN,
    room: ROOM,
    nextSeq: () => worSeq++,
    nextOrd: () => 'SIP-26-' + String(ordSeq++).padStart(6, '0')
  };
})();

/* ==========================================================================
   Etap 3 — location-list.html verisi (eski js/mock/location-list.data.js)
   ========================================================================== */
/* ==========================================================================
   DCIM Sunum — Lokasyon Listesi mock verisi (DCIM.data.locations) — location-list.html
   Kaynak sorgu: doc('ASM/S00')/id('LOC_List')/item  (XDBT yedek yolu, queryAssetLocHistoryApi)
   Lokasyon ID / ad / tam ad değerleri P24A01_S01/db41/db_ASM.xml → LOC_List kayıtlarından alındı
   (test amaçlı bozuk kopyalar — "rus TELEKOM", "ALMANYA TELEKOM", "?" vb. — alınmadı).
   Şema kimlikleri LOC_List_static biçimindedir (LC0102010101000000 = ÜMİTKÖY/KAT-1/SALON-1).

   Sunum için türetilenler (gerçek kayıtta yok):
     - Alan (m²), kabin kapasitesi, sensör sayıları, açıklamalar (tohumlu)
     - 2. ve 3. Kat SALOON-1 pod kayıtları (L0159xx): kilit izleme sayfasının T02/T03 katlarıyla aynı
       yerleşim kullanıldığı için podlar/kabinler DCIM.data.getLockFloor('T02' | 'T03')'ten türetilir.
   Kat 1 / SALOON-1 podları ve kabinleri doğrudan DCIM.data.cabinets (window.DCIM_LAYOUT) ile birebir aynıdır.
   Alan ölçeği: yerleşim ızgarası 40 birim = 60 cm yükseltilmiş döşeme karosu → 1 birim = 0,015 m.
   ========================================================================== */
(function () {
  'use strict';

  const D = window.DCIM.data;

  // İlk DCIM.data.locations erişiminde üretilir (diğer sayfalar maliyeti ödemez)
  D.lazy('locations', function () {
  const LAYOUT = D.layout;
  const UNIT_M = 0.015;
  const ROOT = '/TÜRK TELEKOM/TTVM/ANKARA/DC/';

  // Atanabilir 2D/3D şemalar (Lokasyon Şeması). href yalnızca sunumda açılabilen şema için doludur.
  const SCHEMAS = [
    { id: 'LC0102010101000000', name: '1. Kat 1. Salon Sistem Odası', kinds: ['2D', '3D'], href2d: '2d.html', href3d: '3d.html' },
    { id: 'LC0102010201000000', name: '2. Kat 1. Salon Sistem Odası', kinds: ['2D'], href2d: '', href3d: '' },
    { id: 'LC0102010301000000', name: '3. Kat 1. Salon Sistem Odası', kinds: ['2D'], href2d: '', href3d: '' },
    { id: 'LC0102040101000000', name: 'IDC4 1. Kat Salon Yerleşimi', kinds: ['2D'], href2d: '', href3d: '' }
  ];

  const TYPES = [
    { value: 'building', label: 'Bina', icon: 'pi pi-building' },
    { value: 'floor', label: 'Kat', icon: 'pi pi-clone' },
    { value: 'hall', label: 'DC Salonu', icon: 'pi pi-th-large' },
    { value: 'pod', label: 'Koridor / Pod', icon: 'pi pi-table' },
    { value: 'energy', label: 'Enerji Odası', icon: 'pi pi-bolt' },
    { value: 'network', label: 'Switch Odası', icon: 'pi pi-share-alt' },
    { value: 'storage', label: 'Depo', icon: 'pi pi-box' },
    { value: 'room', label: 'Oda', icon: 'pi pi-home' },
    { value: 'outdoor', label: 'Açık Alan', icon: 'pi pi-sun' },
    { value: 'virtual', label: 'Sanal Platform', icon: 'pi pi-cloud' },
    { value: 'cabinet', label: 'Kabin', icon: 'pi pi-server' }
  ];

  const nodes = [];
  const r5 = n => Math.round(n / 5) * 5;
  const rndFor = key => D.rng(D.hash('loc-' + key));
  const between = (rnd, a, b) => a + (b - a) * rnd();

  // node: { rid, name, full_name, parent, type, desc, area, extraArea, capacity, installed,
  //         sensors: {active,total} (kendi sensörleri), status, schemaId, schemaFocus, cabinet }
  function add(parent, rid, name, type, extra) {
    const p = parent ? nodes.find(n => n.rid === parent) : null;
    const node = Object.assign({
      rid, name, type, parent: parent || null,
      full_name: (p ? p.full_name : '/TÜRK TELEKOM/TTVM/ANKARA/') + name + '/',
      desc: '', area: null, extraArea: 0, capacity: null, installed: null,
      sensors: { active: 0, total: 0 }, status: 'normal', schemaId: '', schemaFocus: '', cabinet: null
    }, extra || {});
    nodes.push(node);
    return node;
  }

  // Oda / salon için tohumlu değerler
  function seeded(rid, type) {
    const rnd = rndFor(rid);
    switch (type) {
      case 'hall': {
        const capacity = 2 * Math.round(between(rnd, 30, 70));
        const installed = Math.round(capacity * between(rnd, 0.42, 0.88));
        const total = installed * 6 + Math.round(between(rnd, 40, 90));
        return { area: r5(between(rnd, 260, 640)), capacity, installed, sensors: { active: total - Math.floor(between(rnd, 0, 4)), total } };
      }
      case 'network': {
        const capacity = Math.round(between(rnd, 4, 10));
        const installed = Math.max(1, Math.round(capacity * between(rnd, 0.5, 1)));
        return { area: Math.round(between(rnd, 16, 42)), capacity, installed, sensors: { active: installed * 4 + 2, total: installed * 4 + 2 } };
      }
      case 'energy': {
        const total = Math.round(between(rnd, 36, 128));
        return { area: r5(between(rnd, 60, 220)), capacity: 0, installed: 0, sensors: { active: total, total } };
      }
      case 'storage': {
        const total = Math.round(between(rnd, 2, 4));
        return { area: Math.round(between(rnd, 18, 85)), capacity: 0, installed: 0, sensors: { active: total, total } };
      }
      case 'room': {
        const total = Math.round(between(rnd, 3, 8));
        return { area: Math.round(between(rnd, 20, 60)), capacity: 0, installed: 0, sensors: { active: total, total } };
      }
      default:
        return {};
    }
  }
  const room = (parent, rid, name, type, desc) => add(parent, rid, name, type, Object.assign(seeded(rid, type), { desc: desc || '' }));

  // Kabin başına sensör: üst/orta/alt sıcaklık + nem + ön/arka kapak = 6 (haberleşme kaybında 0 aktif)
  const CAB_SENSORS = 6;
  const podName = p => (p === 'NS1' ? 'NON-STANDART 1' : p === 'NS2' ? 'NON-STANDART 2' : p.replace('POD-', '') + '.POD');
  const POD_ORDER = ['POD-1', 'POD-2', 'POD-3', 'POD-4', 'POD-5', 'POD-6', 'POD-7', 'POD-8', 'POD-9', 'POD-10', 'NS1', 'NS2'];

  // Yerleşimden pod + kabin düğümleri (floorDigit: 1 → kabin/3D derin bağlantısı var)
  function addLayoutPods(hallRid, cabinets, podIds, schemaId, floorDigit) {
    POD_ORDER.forEach((pod, i) => {
      const list = cabinets.filter(c => c.pod === pod).sort((a, b) => a.code.localeCompare(b.code, 'tr'));
      if (!list.length) return;
      const x0 = Math.min(...list.map(c => c.x)), x1 = Math.max(...list.map(c => c.x + c.w));
      const y0 = Math.min(...list.map(c => c.y)), y1 = Math.max(...list.map(c => c.y + c.h));
      const isNs = pod.indexOf('NS') === 0;
      const podNode = add(hallRid, podIds[i], podName(pod), 'pod', {
        desc: (isNs ? 'Standart dışı kabin sırası' : 'Soğuk koridor muhafazalı pod') + ' · ' + pod,
        area: Math.round((x1 - x0) * (y1 - y0) * UNIT_M * UNIT_M * 10) / 10,
        capacity: isNs ? 18 : 16,
        schemaId, schemaFocus: floorDigit === 1 ? list[0].code : ''
      });
      list.forEach(c => {
        const lost = c.status === 'lost';
        add(podNode.rid, c.code, c.code, 'cabinet', {
          desc: c.customer,
          area: Math.round(c.w * c.h * UNIT_M * UNIT_M * 100) / 100,
          sensors: { active: lost ? 0 : CAB_SENSORS, total: CAB_SENSORS },
          status: c.status || 'normal',
          schemaId, schemaFocus: floorDigit === 1 ? c.code : '',
          cabinet: { code: c.code, usedU: c.usedU, totalU: 42, powerKw: c.powerKw, note: c.note || '', floorDigit }
        });
      });
    });
  }

  // Salon ekipmanlarının telemetri noktaları (klima / UPS / pano) — yalnızca Kat 1 Salon 1 modellenmiştir
  function equipmentSensors() {
    const eq = [].concat(D.climates || [], D.ups || [], D.panels || []);
    const total = eq.reduce((s, e) => s + (e.points ? e.points.length : 0), 0);
    const active = eq.reduce((s, e) => s + (e.status === 'lost' ? 0 : (e.points ? e.points.length : 0)), 0);
    const rank = { alarm: 3, lost: 2, warning: 1, normal: 0 };
    const worst = eq.reduce((w, e) => (rank[e.status] || 0) > (rank[w] || 0) ? e.status : w, 'normal');
    return { sensors: { active, total }, status: worst };
  }

  const hallArea = LAYOUT ? Math.round(LAYOUT.gridCols * 0.6 * LAYOUT.gridRows * 0.6) : 738;

  // ---------------------------------------------------------------------------
  // ÜMİTKÖY (Ana bina)
  // ---------------------------------------------------------------------------
  add(null, 'L015605', 'VERI MERKEZI', 'building', { desc: 'DC — Ankara (Ana Bina)', extraArea: 640 });

  // FLOOR-1
  add('L015605', 'L015675', 'FLOOR-1', 'floor', { desc: '1. Kat', extraArea: 385 });
  const eq1 = equipmentSensors();
  add('L015675', 'L015799', 'SALOON-1', 'hall', {
    desc: '1. Kat 1. Salon Sistem Odası', area: hallArea, schemaId: 'LC0102010101000000',
    sensors: eq1.sensors, status: eq1.status
  });
  addLayoutPods('L015799', D.cabinets,
    ['L015834', 'L015836', 'L015837', 'L015838', 'L015839', 'L015840', 'L015841', 'L015842', 'L015843', 'L015835', 'L015844', 'L015845'],
    'LC0102010101000000', 1);
  room('L015675', 'L015800', 'SWITCH ODASI 103', 'network');
  room('L015675', 'L015801', 'SWITCH ODASI 113', 'network');
  room('L015675', 'L015796', 'KAMERA IZLEME ODASI', 'room', 'Güvenlik izleme');
  room('L015675', 'L015797', 'NETWORK DEPO 119', 'storage');
  room('L015675', 'L015798', 'ODA 106', 'room');
  room('L015675', 'L015795', 'GECICI DEPO 101', 'storage');
  room('L015675', 'L015793', 'GECICI DEPO 120', 'storage');
  room('L015675', 'L015794', 'GECICI DEPO 121', 'storage');

  // FLOOR-2 / FLOOR-3 — SALOON-1 kilit izleme katlarıyla (T02/T03) aynı yerleşimde
  function layoutHall(floorRid, hallRid, floorId, schemaId, podBase, label) {
    const cabs = typeof D.getLockFloor === 'function' ? D.getLockFloor(floorId).map(c => c.cabinet) : [];
    const rnd = rndFor(hallRid);
    const total = Math.round(between(rnd, 205, 240));
    add(floorRid, hallRid, 'SALOON-1', 'hall', {
      desc: label, area: hallArea, schemaId,
      sensors: { active: total - Math.floor(between(rnd, 0, 3)), total }
    });
    addLayoutPods(hallRid, cabs, POD_ORDER.map((p, i) => 'L0159' + String(podBase + i).padStart(2, '0')), schemaId, 0);
  }

  add('L015605', 'L015676', 'FLOOR-2', 'floor', { desc: '2. Kat', extraArea: 410 });
  layoutHall('L015676', 'L015804', 'T02', 'LC0102010201000000', 1, '2. Kat 1. Salon Sistem Odası');
  room('L015676', 'L015805', 'SALOON-2', 'hall', '2. Kat 2. Salon');
  room('L015676', 'L015806', 'SALOON-3', 'hall', '2. Kat 3. Salon');
  room('L015676', 'L015807', 'SALOON-4', 'hall', '2. Kat 4. Salon');
  room('L015676', 'L015808', 'SALOON-5', 'hall', '2. Kat 5. Salon');
  room('L015676', 'L015809', 'SWITCH ODASI 204', 'network');
  room('L015676', 'L015810', 'SWITCH ODASI 212', 'network');
  room('L015676', 'L015802', 'GECICI DEPO 210', 'storage');
  room('L015676', 'L015803', 'GECICI DEPO 214', 'storage');

  add('L015605', 'L015677', 'FLOOR-3', 'floor', { desc: '3. Kat', extraArea: 430 });
  layoutHall('L015677', 'L015812', 'T03', 'LC0102010301000000', 21, '3. Kat 1. Salon Sistem Odası');
  room('L015677', 'L015813', 'SALOON-2', 'hall', '3. Kat 2. Salon');
  room('L015677', 'L015814', 'SALOON-3', 'hall', '3. Kat 3. Salon');
  room('L015677', 'L015815', 'SALOON-4', 'hall', '3. Kat 4. Salon');
  room('L015677', 'L015816', 'SALOON-5', 'hall', '3. Kat 5. Salon');
  room('L015677', 'L015817', 'SALOON-6', 'hall', '3. Kat 6. Salon');
  room('L015677', 'L015818', 'SWITCH ODASI 306', 'network');
  room('L015677', 'L015819', 'SWITCH ODASI 321', 'network');
  room('L015677', 'L015811', 'KABLO DEPO 311', 'storage');
  room('L015677', 'L077207', 'GECICI DEPO 312', 'storage');

  add('L015605', 'L015678', 'FLOOR-Z', 'floor', { desc: 'Zemin Kat — enerji altyapısı', extraArea: 260 });
  room('L015678', 'L015820', 'B ENERJI ADP SALONU', 'energy', 'Ana dağıtım panoları (B hattı)');
  room('L015678', 'L015821', 'B ENERJI KESICI-AYIRICI SALONU', 'energy', 'OG kesici / ayırıcı hücreleri');
  room('L015678', 'L015822', 'B ENERJI KGK SALONU', 'energy', 'Kesintisiz güç kaynakları (B hattı)');
  room('L015678', 'L015823', 'C KGK SALONU', 'energy', 'Kesintisiz güç kaynakları (C hattı)');
  room('L015678', 'L015824', 'KAZAN DAIRESI', 'room', 'Mekanik tesisat');

  // IDC4 (kampüs içi ek bina)
  add('L015605', 'L015682', 'IDC4', 'building', { desc: 'IDC4 Ek Bina', extraArea: 320 });
  add('L015682', 'L015831', 'FLOOR-1', 'floor', { desc: 'IDC4 1. Kat', extraArea: 150 });
  (function () {
    const rnd = rndFor('L015846');
    const total = Math.round(between(rnd, 80, 110));
    add('L015831', 'L015846', 'SALOON-1', 'hall', { desc: 'IDC4 1. Kat Salon', area: 520, schemaId: 'LC0102040101000000', sensors: { active: total, total } });
    [['L015849', '1.POD'], ['L015850', '2.POD'], ['L015851', '3.POD'], ['L015852', '4.POD'], ['L015853', '5.POD'], ['L015854', '6.POD'],
      ['L015855', 'NON STANDART 1'], ['L015856', 'NON STANDART 2']].forEach(([rid, name]) => {
      const pr = rndFor(rid);
      const ns = name.indexOf('NON') === 0;
      const capacity = ns ? 10 : 14;
      const installed = Math.round(capacity * between(pr, 0.5, 1));
      const t = installed * CAB_SENSORS;
      add('L015846', rid, name, 'pod', {
        desc: ns ? 'Standart dışı kabin sırası' : 'Soğuk koridor muhafazalı pod',
        area: Math.round(between(pr, 17, 22) * 10) / 10, capacity, installed,
        sensors: { active: t, total: t }, schemaId: 'LC0102040101000000'
      });
    });
  })();
  add('L015682', 'L015832', 'FLOOR-Z', 'floor', { desc: 'IDC4 Zemin Kat', extraArea: 90 });
  room('L015832', 'L015847', 'AKÜ ODASI', 'energy', 'Akü grupları');
  room('L015832', 'L015848', 'ENERJI DAGITIM ODASI', 'energy', 'Dağıtım panoları');

  // Açık alan / depo / sanal
  add('L015605', 'L015679', 'GARDEN', 'outdoor', { desc: 'Bahçe — dış saha ekipmanları' });
  room('L015679', 'L015825', 'A ENERJI', 'energy', 'Trafo / jeneratör sahası (A)');
  room('L015679', 'L015826', 'B ENERJI', 'energy', 'Trafo / jeneratör sahası (B)');
  ['L015827:BATI SWITCH DOLABI', 'L015828:DOGU SWITCH DOLABI', 'L015830:KUZEY SWITCH DOLABI'].forEach(s => {
    const [rid, name] = s.split(':');
    add('L015679', rid, name, 'network', { desc: 'Dış ortam switch dolabı', area: 1.2, capacity: 1, installed: 1, sensors: { active: 3, total: 3 } });
  });
  room('L015605', 'L015681', 'HURDA-DEPO', 'storage');
  room('L015605', 'L015680', 'HURDA-DEPO-KONTEYNIR', 'storage');
  add('L015605', 'L015683', 'VIRTUAL PLATFORM', 'virtual', { desc: 'Sanal kaynak lokasyonu', area: 0, capacity: 0, installed: 0 });
  add('L015683', 'L015833', 'ANKARA (3)', 'virtual', { desc: 'Sanal platform', area: 0, capacity: 0, installed: 0 });

  D.locations = {
    root: ROOT,
    schemas: SCHEMAS,
    types: TYPES,
    nodes,
    // Varsayılan açık düğümler: ÜMİTKÖY > FLOOR-1 > SALOON-1 (mevcut 2D/3D yerleşimi)
    defaultExpanded: ['L015605', 'L015675', 'L015799']
  };
  });
})();

/* ==========================================================================
   Etap 3 — category-list.html verisi (eski js/mock/category-list.data.js)
   ========================================================================== */
/* ==========================================================================
   DCIM Sunum — Model Kütüphanesi mock verisi (category-list.html)
   CAT tablosunun (cat_id, model_id, name, brand, nature, full_name, jsn) karşılığı:
     SELECT cat_id, model_id, name, brand, nature, full_name FROM CAT      → list()
     assetService.getCatById(cat_id)                                     → get(model_id)
     catService.updateCatalogItem(model_id, catData, jsn)                → update(model_id, catData, jsn)
   jsn: ucapacity, weight (kg), nominal_power (W), power (W), power_connection_numbers,
        front_img / back_img (SVG data URI), ports[] (manager port şeması), naming_logics
   İlk 17 kayıt (CAT1001..CAT1017) cabinet-detail.html'in kullandığı DCIM.data.cabinetMgr.catalog ile
   birebir aynıdır (aynı model_id, aynı görsel ve port şablonu). CAT1018+ : PDU / UPS / Sensör / Kabin.
   Bağımlılık: js/mock-data.js → DCIM.data (rng, hash, cabinets, cabinetMgr)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D) return;
  const M = D.cabinetMgr || null;

  const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svgUri = svg => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

  // ---------------------------------------------------------------------------
  // Temel katalog (cabinetMgr.catalog yoksa aynı kaynak satırlarından üret)
  // [marka, model, nitelik, U, güç W, ağırlık kg]
  // ---------------------------------------------------------------------------
  const BASE_SRC = [
    ['HPE', 'ProLiant DL380 Gen10', 'Sunucu', 2, 550, 21],
    ['HPE', 'ProLiant DL360 Gen10', 'Sunucu', 1, 420, 16],
    ['Dell', 'PowerEdge R750', 'Sunucu', 2, 620, 22],
    ['Dell', 'PowerEdge R650', 'Sunucu', 1, 450, 17],
    ['Lenovo', 'ThinkSystem SR650 V2', 'Sunucu', 2, 580, 23],
    ['Huawei', 'OceanStor 5310', 'Depolama', 4, 950, 48],
    ['NetApp', 'AFF A400', 'Depolama', 4, 1050, 52],
    ['Cisco', 'UCS C240 M6', 'Sunucu', 2, 600, 24],
    ['Supermicro', 'SYS-2029U', 'Sunucu', 2, 500, 20],
    ['Cisco', 'Nexus 93180YC-FX', 'Switch', 1, 350, 9],
    ['Cisco', 'Catalyst 9300-48P', 'Switch', 1, 300, 8],
    ['Juniper', 'MX204', 'Router', 1, 400, 10],
    ['Juniper', 'QFX5120-48Y', 'Switch', 1, 330, 9],
    ['Fortinet', 'FortiGate 1800F', 'Firewall', 2, 500, 18],
    ['Huawei', 'CE6881-48S6CQ', 'Switch', 1, 320, 9],
    ['Arista', '7280R3', 'Switch', 2, 450, 14],
    ['Panduit', 'FLEX 24F', 'Patch Panel', 1, 0, 2]
  ];
  const base = M && M.catalog && M.catalog.length
    ? M.catalog
    : BASE_SRC.map((r, i) => ({
      model_id: 'CAT' + String(1001 + i), brand: r[0], name: r[1], nature: r[2], full_name: r[0] + ' ' + r[1],
      jsn: { ucapacity: r[3], power: r[4], weight: r[5], nominal_power: Math.round(r[4] * 0.72), power_connection_numbers: r[2] === 'Patch Panel' ? 0 : 2 }
    }));

  // ---------------------------------------------------------------------------
  // Ek modeller — PDU / UPS / Sensör / Kabin
  // [marka, model, nitelik, U, güç W, ağırlık kg, nominal W, güç bağlantı sayısı, görsel şablonu]
  // ---------------------------------------------------------------------------
  const EXTRA_SRC = [
    ['Raritan', 'PX3-5528V-V2', 'PDU', 0, 25, 7.4, 18, 1, { kind: 'pdu0u', outlets: 24, c19: 6, phases: 3 }],
    ['Raritan', 'PX2-5292R', 'PDU', 0, 18, 5.2, 12, 1, { kind: 'pdu0u', outlets: 12, c19: 0, phases: 1 }],
    ['Raritan', 'PX3-4104R-V2', 'PDU', 1, 20, 4.1, 14, 1, { kind: 'pdu1u', outlets: 6, phases: 3 }],
    ['Schneider Electric', 'APC AP8959EU3', 'PDU', 0, 15, 6.6, 11, 1, { kind: 'pdu0u', outlets: 24, c19: 3, phases: 1 }],
    ['Vertiv', 'Geist GU2E1R8K', 'PDU', 0, 22, 9.8, 16, 1, { kind: 'pdu0u', outlets: 36, c19: 6, phases: 3 }],
    ['Vertiv', 'Liebert GXT5-3000IRT2UXL', 'UPS', 2, 3000, 28.6, 2700, 1, { kind: 'upsRack', outC13: 8, outC19: 0, input: true }],
    ['Schneider Electric', 'APC Smart-UPS SRT 6000 SRT6KRMXLI', 'UPS', 4, 6000, 58, 6000, 1, { kind: 'upsRack', outC13: 6, outC19: 4, input: false }],
    ['Vertiv', 'Liebert EXM2 80kVA', 'UPS', 0, 80000, 620, 72000, 2, null],
    ['Schneider Electric', 'Galaxy VS 40kW', 'UPS', 0, 40000, 305, 40000, 2, null],
    ['Raritan', 'DX2-T1H1', 'Sensör', 0, 1, 0.1, 1, 0, { kind: 'sensor', probes: 1 }],
    ['Raritan', 'DPX3-T3H1', 'Sensör', 0, 1, 0.2, 1, 0, { kind: 'sensor', probes: 3 }],
    ['Schneider Electric', 'APC NetBotz Rack Monitor 250', 'Sensör', 1, 20, 1.8, 14, 1, { kind: 'netbotz' }],
    ['Vertiv', 'Geist Watchdog 100', 'Sensör', 0, 5, 0.4, 4, 1, { kind: 'sensor', probes: 2, watchdog: true }],
    ['Rittal', 'VX IT 42U 800x1200', 'Kabin', 42, 8000, 1000, 8000, 2, null],
    ['Schneider Electric', 'APC NetShelter SX 42U AR3350', 'Kabin', 42, 12000, 900, 12000, 2, null]
  ];

  // ---------------------------------------------------------------------------
  // SVG çizim yardımcıları (mock-data.js cihaz görselleriyle aynı görsel dil)
  // ---------------------------------------------------------------------------
  const W = 800;
  const UH = 72;
  const BRAND_COLOR = { Raritan: '#e11d48', 'Schneider Electric': '#3dcd58', Vertiv: '#f97316', Rittal: '#94a3b8' };
  const t = (x, y, size, color, str, weight) =>
    '<text x="' + x + '" y="' + y + '" font-family="Arial, Helvetica, sans-serif" font-size="' + size + '" font-weight="' + (weight || 700) + '" fill="' + color + '">' + xmlEsc(str) + '</text>';
  const rj45 = (cx, cy) =>
    '<rect x="' + (cx - 11) + '" y="' + (cy - 9) + '" width="22" height="18" rx="1.5" fill="#07090c" stroke="#8b949e" stroke-width="1.2"/>' +
    '<rect x="' + (cx - 5) + '" y="' + (cy + 5) + '" width="10" height="4" fill="#8b949e"/>';
  const usb = (cx, cy) =>
    '<rect x="' + (cx - 9) + '" y="' + (cy - 4) + '" width="18" height="8" fill="#0b0e12" stroke="#c0c7cf" stroke-width="1"/>' +
    '<rect x="' + (cx - 6) + '" y="' + (cy - 1.5) + '" width="12" height="3" fill="#2563eb"/>';
  const db9 = (cx, cy) =>
    '<rect x="' + (cx - 17) + '" y="' + (cy - 7) + '" width="34" height="14" rx="4" fill="#334155" stroke="#94a3b8" stroke-width="1"/>' +
    [-8, -3, 2, 7].map(dx => '<circle cx="' + (cx + dx) + '" cy="' + cy + '" r="1.2" fill="#e2e8f0"/>').join('');
  const c13 = (cx, cy, s) => {
    const k = s || 1;
    return '<path d="M' + (cx - 10 * k) + ' ' + (cy - 8 * k) + ' h' + (20 * k) + ' v' + (11 * k) + ' l' + (-4 * k) + ' ' + (5 * k) + ' h' + (-12 * k) + ' l' + (-4 * k) + ' ' + (-5 * k) + ' z" fill="#0b0e12" stroke="#cbd5e1" stroke-width="1"/>' +
      '<rect x="' + (cx - 6 * k) + '" y="' + (cy - 3 * k) + '" width="' + (2 * k) + '" height="' + (5 * k) + '" fill="#64748b"/><rect x="' + (cx - 1 * k) + '" y="' + (cy - 3 * k) + '" width="' + (2 * k) + '" height="' + (5 * k) + '" fill="#64748b"/><rect x="' + (cx + 4 * k) + '" y="' + (cy - 3 * k) + '" width="' + (2 * k) + '" height="' + (5 * k) + '" fill="#64748b"/>';
  };
  const c19 = (cx, cy) =>
    '<rect x="' + (cx - 13) + '" y="' + (cy - 9) + '" width="26" height="18" rx="2" fill="#0b0e12" stroke="#f59e0b" stroke-width="1.2"/>' +
    '<rect x="' + (cx - 8) + '" y="' + (cy - 5) + '" width="5" height="2" fill="#64748b"/><rect x="' + (cx + 3) + '" y="' + (cy - 5) + '" width="5" height="2" fill="#64748b"/><rect x="' + (cx - 2.5) + '" y="' + (cy + 2) + '" width="5" height="2" fill="#64748b"/>';
  const vents = (x, y, w, h) => {
    let s = '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="#161b21" stroke="#0b0e12"/>';
    for (let vx = x + 6; vx < x + w - 4; vx += 9) s += '<rect x="' + vx + '" y="' + (y + 4) + '" width="4" height="' + (h - 8) + '" rx="2" fill="#0a0d11"/>';
    return s;
  };
  const lcd = (x, y, w, h, lines) =>
    '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="2" fill="#052e2b" stroke="#0f766e" stroke-width="1.2"/>' +
    lines.map((l, i) => t(x + 8, y + 16 + i * 14, 10, '#5eead4', l, 600)).join('');

  function rackChassis(h, inner) {
    let ears = '';
    const units = Math.max(1, Math.round(h / UH));
    for (let u = 0; u < units; u++) {
      [15, W - 15].forEach(sx => {
        ears += '<circle cx="' + sx + '" cy="' + (u * UH + 17) + '" r="5" fill="#2b3038" stroke="#cfd6de" stroke-width="1"/>' +
          '<circle cx="' + sx + '" cy="' + (u * UH + UH - 17) + '" r="5" fill="#2b3038" stroke="#cfd6de" stroke-width="1"/>';
      });
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + h + '" viewBox="0 0 ' + W + ' ' + h + '">' +
      '<defs><linearGradient id="bz" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a5563"/><stop offset="0.45" stop-color="#2b323c"/><stop offset="1" stop-color="#1b2028"/></linearGradient>' +
      '<linearGradient id="ear" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a3acb6"/><stop offset="1" stop-color="#5f6873"/></linearGradient></defs>' +
      '<rect x="0" y="0" width="' + W + '" height="' + h + '" rx="3" fill="#15191f"/>' +
      '<rect x="0" y="0" width="30" height="' + h + '" fill="url(#ear)"/><rect x="' + (W - 30) + '" y="0" width="30" height="' + h + '" fill="url(#ear)"/>' +
      '<rect x="32" y="2" width="' + (W - 64) + '" height="' + (h - 4) + '" rx="2" fill="url(#bz)" stroke="#0b0e12" stroke-width="1.5"/>' +
      ears + inner + '</svg>';
  }
  function plainBody(w, h, inner) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<defs><linearGradient id="bd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b4452"/><stop offset="1" stop-color="#1b2028"/></linearGradient></defs>' +
      '<rect x="1" y="1" width="' + (w - 2) + '" height="' + (h - 2) + '" rx="6" fill="url(#bd)" stroke="#0b0e12" stroke-width="2"/>' + inner + '</svg>';
  }

  // Port şablonu kaydı (manager port şeması ile aynı alanlar)
  const DATA_COLOR = '#2196F3';
  const OTHER_COLOR = '#F44336';
  function mkPort(modelId, side, idx, o, w, h) {
    const role = o.role || 'Network';
    const isData = ['Network', 'Management', 'Stack', 'Fiber-Patch'].indexOf(role) >= 0;
    const isPower = role.indexOf('Power') === 0 || role === 'Ground';
    return {
      id: 'port_' + modelId + '_' + side + '_' + idx,
      name: o.name,
      side,
      x: +(o.cx / w).toFixed(4),
      y: +(o.cy / h).toFixed(4),
      color: isData ? DATA_COLOR : OTHER_COLOR,
      shape: o.shape || (isPower ? 'square' : 'circle'),
      type: o.type || (isPower ? 'power' : isData ? 'eth' : 'other'),
      admin_role: role,
      connector_type: o.conn || 'RJ45',
      supported_media: isData ? (o.media || ['Copper']) : [],
      supported_protocols: isData ? ['Ethernet'] : [],
      speed_capability: isData ? (o.speed || ['1G']) : [],
      poe_capability: isData ? (o.poe || 'None') : 'None',
      max_mtu: isData ? (o.mtu || 1500) : null,
      power_io_type: isPower ? (o.io || 'Input') : undefined,
      max_watt: isPower ? (o.watt != null ? o.watt : null) : null,
      max_amp: isPower ? (o.amp != null ? o.amp : null) : null,
      admin_status_default: 'Enabled',
      hardware_label: o.label || o.name,
      description: o.desc || '',
      is_included_in_sequence: isData,
      isAutoNumbered: isData
    };
  }

  // ---------------------------------------------------------------------------
  // Ek modellerin ön / arka görselleri + port şablonları
  // ---------------------------------------------------------------------------
  function buildExtraFace(row, modelId, side) {
    const brand = row[0];
    const model = row[1];
    const tpl = row[8];
    if (!tpl) return null;
    const color = BRAND_COLOR[brand] || '#94a3b8';
    const specs = [];
    const add = o => specs.push(o);
    let svg = '';
    let w = W;
    let h = UH;

    if (tpl.kind === 'pdu0u') {
      // 0U dikey PDU — yatay şerit olarak çizilir
      if (side === 'back') return null;
      h = 110;
      const n = tpl.outlets;
      const c19n = tpl.c19;
      let s = '<rect x="0" y="0" width="' + W + '" height="' + h + '" rx="4" fill="#15191f"/>' +
        '<rect x="4" y="6" width="' + (W - 8) + '" height="' + (h - 12) + '" rx="3" fill="#1f252d" stroke="#0b0e12" stroke-width="1.5"/>' +
        t(14, 26, 12, color, brand.toUpperCase()) + t(14, 40, 8.5, '#9aa3ad', model, 600) +
        lcd(14, 50, 86, 40, [tpl.phases === 3 ? '3~ 32A' : '1~ 32A', 'L1 11.4A']);
      s += rj45(122, 62) + t(113, 84, 7, '#9aa3ad', 'NET', 600);
      add({ name: 'NET', role: 'Management', cx: 122, cy: 62, speed: ['100M', '1G'] });
      s += rj45(152, 62) + t(140, 84, 7, '#9aa3ad', 'SENSOR', 600);
      add({ name: 'SENSOR', role: 'Management', cx: 152, cy: 62, speed: ['10M'], desc: 'Çevresel sensör (DX2) bağlantısı' });
      s += usb(182, 62) + t(173, 84, 7, '#9aa3ad', 'USB', 600);
      add({ name: 'USB', role: 'USB', conn: 'USB-A', cx: 182, cy: 62 });
      const x0 = 214;
      const span = W - 20 - x0;
      const step = span / n;
      const c19Every = c19n ? Math.floor(n / c19n) : 0;
      for (let i = 0; i < n; i++) {
        const cx = Math.round(x0 + step * (i + 0.5));
        const isC19 = c19Every && (i + 1) % c19Every === 0;
        const cy = 60;
        s += (isC19 ? c19(cx, cy) : c13(cx, cy, Math.min(1, step / 24))) + t(cx - 5, 92, 7, '#cbd5e1', String(i + 1), 600);
        add({ name: 'OUT' + (i + 1), role: 'Power-Output', conn: isC19 ? 'C19' : 'C13', io: 'Output', cx, cy, amp: isC19 ? 16 : 10, watt: isC19 ? 3680 : 2300, label: String(i + 1) });
      }
      svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + h + '" viewBox="0 0 ' + W + ' ' + h + '">' + s + '</svg>';
    } else if (tpl.kind === 'pdu1u') {
      h = UH;
      let s = '';
      if (side === 'front') {
        s += t(44, 30, 13, color, brand.toUpperCase()) + t(44, 44, 8.5, '#9aa3ad', model, 600) + lcd(190, 14, 90, 44, ['3~ 16A', 'Σ 2.4kW']);
        s += rj45(320, 36) + t(311, 60, 7, '#9aa3ad', 'NET', 600);
        add({ name: 'NET', role: 'Management', cx: 320, cy: 36, speed: ['100M', '1G'] });
        s += usb(356, 36);
        add({ name: 'USB', role: 'USB', conn: 'USB-A', cx: 356, cy: 36 });
        for (let i = 0; i < tpl.outlets; i++) {
          const cx = 420 + i * 55;
          s += c13(cx, 34) + t(cx - 3, 60, 7, '#cbd5e1', String(i + 1), 600);
          add({ name: 'OUT' + (i + 1), role: 'Power-Output', conn: 'C13', io: 'Output', cx, cy: 34, amp: 10, watt: 2300, label: String(i + 1) });
        }
      } else {
        s += vents(60, 10, 520, 52) + '<rect x="640" y="16" width="100" height="40" rx="4" fill="#0b0e12" stroke="#cbd5e1"/>' + t(652, 40, 9, '#cbd5e1', 'IEC 60309', 600);
        add({ name: 'INLET', role: 'Power-Input', conn: 'C19', io: 'Input', cx: 690, cy: 36, amp: 16, watt: 11085, desc: 'IEC 60309 16A 5P kablo girişi' });
      }
      svg = rackChassis(h, s);
    } else if (tpl.kind === 'upsRack') {
      const u = row[3];
      h = u * UH;
      let s = '';
      if (side === 'front') {
        s += t(44, 34, 15, color, brand.toUpperCase()) + t(44, 50, 9, '#9aa3ad', model, 600);
        s += lcd(300, h / 2 - 28, 150, 56, ['ONLINE  %46', 'BAT 100%  34dk', 'OUT 230V']);
        ['#22c55e', '#f59e0b', '#ef4444'].forEach((c, i) => { s += '<circle cx="' + (480 + i * 22) + '" cy="' + (h / 2 - 12) + '" r="5" fill="' + c + '"/>'; });
        s += '<circle cx="' + 502 + '" cy="' + (h / 2 + 16) + '" r="11" fill="#0b0e12" stroke="#cbd5e1" stroke-width="1.5"/>';
        s += vents(560, 10, 200, h - 20);
      } else {
        let x = 70;
        if (tpl.input) {
          s += '<rect x="40" y="' + (h / 2 - 16) + '" width="44" height="32" rx="3" fill="#0b0e12" stroke="#cbd5e1"/>' + t(48, h / 2 + 28, 7, '#9aa3ad', 'INPUT', 600);
          add({ name: 'IN', role: 'Power-Input', conn: 'C14', io: 'Input', cx: 62, cy: h / 2, amp: 16, watt: row[4] });
          x = 120;
        } else {
          s += '<rect x="40" y="' + (h / 2 - 20) + '" width="60" height="40" rx="3" fill="#1f2937" stroke="#64748b"/>' + t(44, h / 2 + 34, 7, '#9aa3ad', 'HARDWIRE IN', 600);
          x = 130;
        }
        for (let i = 0; i < tpl.outC13; i++) {
          const cx = x + i * 38;
          const cy = h / 2 - (u > 2 ? 16 : 0);
          s += c13(cx, cy);
          add({ name: 'OUT' + (i + 1), role: 'Power-Output', conn: 'C13', io: 'Output', cx, cy, amp: 10, watt: 2300 });
        }
        for (let i = 0; i < tpl.outC19; i++) {
          const cx = x + i * 44;
          const cy = h / 2 + 22;
          s += c19(cx, cy);
          add({ name: 'OUT' + (tpl.outC13 + i + 1), role: 'Power-Output', conn: 'C19', io: 'Output', cx, cy, amp: 16, watt: 3680 });
        }
        const px = 480;
        s += rj45(px, h / 2) + t(px - 10, h / 2 + 22, 7, '#9aa3ad', 'NET', 600);
        add({ name: 'NET', role: 'Management', cx: px, cy: h / 2, speed: ['100M', '1G'], desc: 'SNMP / Web kartı' });
        s += usb(px + 44, h / 2);
        add({ name: 'USB', role: 'USB', conn: 'USB-B', cx: px + 44, cy: h / 2 });
        s += db9(px + 96, h / 2);
        add({ name: 'RS232', role: 'Serial/Console', conn: 'DB9', cx: px + 96, cy: h / 2 });
        s += vents(640, 10, 120, h - 20);
      }
      svg = rackChassis(h, s);
    } else if (tpl.kind === 'netbotz') {
      if (side === 'back') return null;
      h = UH;
      let s = t(44, 30, 12, color, 'APC NetBotz') + t(44, 44, 8.5, '#9aa3ad', 'Rack Monitor 250', 600);
      for (let i = 0; i < 6; i++) {
        const cx = 230 + i * 44;
        s += rj45(cx, 36) + t(cx - 4, 60, 7, '#cbd5e1', 'S' + (i + 1), 600);
        add({ name: 'S' + (i + 1), role: 'Management', cx, cy: 36, speed: ['10M'], desc: 'Evrensel sensör portu' });
      }
      s += rj45(540, 36) + t(530, 60, 7, '#9aa3ad', 'NET', 600);
      add({ name: 'NET', role: 'Management', cx: 540, cy: 36, speed: ['100M', '1G'] });
      s += usb(590, 30) + usb(590, 44);
      add({ name: 'USB1', role: 'USB', conn: 'USB-A', cx: 590, cy: 30 });
      add({ name: 'USB2', role: 'USB', conn: 'USB-A', cx: 590, cy: 44 });
      s += '<circle cx="740" cy="36" r="6" fill="#0b0e12" stroke="#22c55e" stroke-width="1.5"/>';
      svg = rackChassis(h, s);
    } else if (tpl.kind === 'sensor') {
      if (side === 'back') return null;
      w = 420;
      h = 180;
      let s = t(22, 36, 14, color, brand.toUpperCase()) + t(22, 54, 10, '#9aa3ad', model, 600) +
        '<circle cx="390" cy="28" r="6" fill="#22c55e"/>';
      if (tpl.watchdog) {
        s += lcd(22, 70, 150, 58, ['T 23.4°C', 'RH %44', 'DEW 10.6°C']);
        s += rj45(240, 120) + t(230, 146, 8, '#9aa3ad', 'NET', 600);
        add({ name: 'NET', role: 'Management', cx: 240, cy: 120, speed: ['100M'] });
        for (let i = 0; i < tpl.probes; i++) {
          const cx = 300 + i * 50;
          s += rj45(cx, 120) + t(cx - 12, 146, 8, '#9aa3ad', 'SENS' + (i + 1), 600);
          add({ name: 'SENS' + (i + 1), role: 'Management', cx, cy: 120, speed: ['10M'] });
        }
      } else {
        s += '<rect x="22" y="72" width="170" height="46" rx="4" fill="#0f172a" stroke="#334155"/>' + t(34, 100, 11, '#e2e8f0', tpl.probes === 1 ? 'T + RH' : '3×T + RH', 600);
        s += rj45(250, 110) + t(234, 136, 8, '#9aa3ad', 'RJ12 IN', 600);
        add({ name: 'IN', role: 'Management', cx: 250, cy: 110, speed: ['10M'], desc: 'PDU SENSOR portuna bağlanır (RJ12)' });
        s += rj45(320, 110) + t(302, 136, 8, '#9aa3ad', 'RJ12 OUT', 600);
        add({ name: 'OUT', role: 'Management', cx: 320, cy: 110, speed: ['10M'], desc: 'Zincirleme (daisy-chain) çıkış' });
        for (let i = 1; i < tpl.probes; i++) s += '<path d="M' + (60 + i * 40) + ' 178 v-50" stroke="#94a3b8" stroke-width="3"/><circle cx="' + (60 + i * 40) + '" cy="126" r="5" fill="#cbd5e1"/>';
      }
      svg = plainBody(w, h, s);
    }
    return { img: svgUri(svg), ports: specs.map((o, i) => mkPort(modelId, side, i, o, w, h)) };
  }

  // Temel modellerin face() port şablonunu manager port şemasına çevir
  function convertFacePorts(modelId, side, ports, powerW, nature, modelName) {
    return (ports || []).map((p, i) => {
      const nm = String(p.name);
      const o = { name: nm, cx: p.x, cy: p.y };
      if (p.type === 'power') Object.assign(o, { role: 'Power-Input', conn: 'C14', io: 'Input', watt: Math.max(500, Math.ceil(powerW * 1.4 / 50) * 50), amp: 10 });
      else if (p.type === 'usb') Object.assign(o, { role: 'USB', conn: 'USB-A' });
      else if (p.type === 'vga') Object.assign(o, { role: 'Console', conn: 'DB9', desc: 'VGA (DE-15) konsol çıkışı' });
      else if (p.type === 'serial') Object.assign(o, { role: 'Console', conn: 'RJ45' });
      else if (p.type === 'fiber') Object.assign(o, { role: /MG$/.test(nm) ? 'Management' : 'Network', conn: 'SFP+Slot', media: ['Fiber-MM OM3/4'], speed: ['10G', '25G'], mtu: 9216 });
      else if (nature === 'Patch Panel') Object.assign(o, { role: 'Fiber-Patch', conn: 'RJ45', media: ['Copper'], speed: ['1G', '10G'], desc: 'Cat6A U/FTP' });
      else if (/MGMT|MG$/.test(nm)) Object.assign(o, { role: 'Management', conn: 'RJ45', speed: ['100M', '1G'] });
      else if (nature === 'Switch') Object.assign(o, { role: 'Network', conn: 'RJ45', speed: ['1G', '10G'], poe: /9300-48P/.test(modelName || '') ? 'at' : 'None', mtu: 9216 });
      else Object.assign(o, { role: 'Network', conn: 'RJ45', speed: ['1G', '10G'] });
      // face() x/y oranları 0-1 aralığında: mkPort'a w=h=1 ile ver
      return mkPort(modelId, side, i, o, 1, 1);
    });
  }

  // Sahadaki kurulu adet (DCIM.data.cabinets[].assets)
  const usage = {};
  (D.cabinets || []).forEach(c => (c.assets || []).forEach(a => {
    const k = (a.manufacturer || '') + '|' + (a.model || '');
    usage[k] = (usage[k] || 0) + 1;
  }));

  // ---------------------------------------------------------------------------
  // CAT kayıtları
  // ---------------------------------------------------------------------------
  const CATS = [];
  base.forEach(c => {
    const j = c.jsn || {};
    const asset = { assetType: c.nature, manufacturer: c.brand, model: c.name, uSize: j.ucapacity || 1 };
    const fr = M && M.face ? M.face(asset, 'front') : null;
    const bk = M && M.face ? M.face(asset, 'back') : null;
    const ports = []
      .concat(fr ? convertFacePorts(c.model_id, 'front', fr.ports, j.power || 0, c.nature, c.name) : [])
      .concat(bk ? convertFacePorts(c.model_id, 'back', bk.ports, j.power || 0, c.nature, c.name) : []);
    CATS.push({
      cat_id: c.model_id, model_id: c.model_id, name: c.name, brand: c.brand, nature: c.nature, full_name: c.full_name,
      installed: usage[c.brand + '|' + c.name] || 0,
      jsn: {
        ucapacity: j.ucapacity, weight: j.weight, nominal_power: j.nominal_power, power: j.power,
        power_connection_numbers: j.power_connection_numbers,
        front_img: fr ? fr.img : '', back_img: bk ? bk.img : '',
        ports, naming_logics: { front: 'linear', back: 'linear' }
      }
    });
  });
  EXTRA_SRC.forEach((r, i) => {
    const id = 'CAT' + String(1001 + base.length + i);
    const fr = buildExtraFace(r, id, 'front');
    const bk = buildExtraFace(r, id, 'back');
    CATS.push({
      cat_id: id, model_id: id, name: r[1], brand: r[0], nature: r[2], full_name: r[0] + ' ' + r[1],
      installed: 0,
      jsn: {
        ucapacity: r[3], weight: r[5], nominal_power: r[6], power: r[4], power_connection_numbers: r[7],
        front_img: fr ? fr.img : '', back_img: bk ? bk.img : '',
        ports: [].concat(fr ? fr.ports : [], bk ? bk.ports : []),
        naming_logics: { front: 'linear', back: 'linear' }
      }
    });
  });

  // Saha kurulum adetleri (kabin varlıklarında olmayan tipler — sunum senaryosu)
  const cabCount = (D.cabinets || []).length;
  const setInstalled = (brand, name, n) => { const c = CATS.find(x => x.brand === brand && x.name === name); if (c && n) c.installed = n; };
  setInstalled('Raritan', 'PX3-5528V-V2', Math.round(cabCount * 0.6));
  setInstalled('Raritan', 'PX2-5292R', Math.round(cabCount * 0.5));
  setInstalled('Raritan', 'PX3-4104R-V2', Math.round(cabCount * 0.25));
  setInstalled('Raritan', 'DX2-T1H1', cabCount * 3);
  setInstalled('Vertiv', 'Liebert EXM2 80kVA', (D.ups || []).length);
  setInstalled('Rittal', 'VX IT 42U 800x1200', (D.cabinets || []).filter(c => c.col !== '1AS' && c.col !== '1AV').length);
  setInstalled('Schneider Electric', 'APC NetShelter SX 42U AR3350', (D.cabinets || []).filter(c => c.col === '1AS' || c.col === '1AV').length);

  // Nitelik (kategori) sözlüğü — ikon + sıra
  const NATURES = [
    { key: 'Sunucu', icon: 'pi pi-server' },
    { key: 'Depolama', icon: 'pi pi-database' },
    { key: 'Switch', icon: 'pi pi-sitemap' },
    { key: 'Router', icon: 'pi pi-share-alt' },
    { key: 'Firewall', icon: 'pi pi-shield' },
    { key: 'Patch Panel', icon: 'pi pi-th-large' },
    { key: 'PDU', icon: 'pi pi-bolt' },
    { key: 'UPS', icon: 'pi pi-power-off' },
    { key: 'Sensör', icon: 'pi pi-gauge' },
    { key: 'Kabin', icon: 'pi pi-objects-column' }
  ];

  const clone = o => JSON.parse(JSON.stringify(o));
  let seq = 1001 + CATS.length;

  D.catList = {
    natures: NATURES,
    // SELECT cat_id, model_id, name, brand, nature, full_name FROM CAT ORDER BY cat_id ASC
    list: () => CATS,
    // assetService.getCatById → { model_id, name, brand, nature, full_name, jsn: string }
    get(id) {
      const c = CATS.find(x => x.model_id === id || x.cat_id === id);
      return c ? Object.assign({}, c, { jsn: JSON.stringify(c.jsn) }) : null;
    },
    // catService.updateCatalogItem(model_id, catData, jsn)
    update(id, catData, jsn) {
      const c = CATS.find(x => x.model_id === id);
      if (!c) return false;
      Object.assign(c, catData);
      c.jsn = clone(jsn);
      return true;
    },
    // Yeni CAT kaydı (sunum: yalnızca bellek)
    create(catData, jsn) {
      const id = 'CAT' + String(seq++);
      const c = Object.assign({ cat_id: id, model_id: id, installed: 0 }, catData, { jsn: Object.assign({ front_img: '', back_img: '', ports: [], naming_logics: { front: 'linear', back: 'linear' } }, jsn) });
      CATS.push(c);
      return c;
    },
    // YZ port tespiti (localhost:8000/api/detect yerine): görselin port şablonu
    detectTemplate(id, side) {
      const c = CATS.find(x => x.model_id === id);
      const orig = c && c._tpl ? c._tpl : null;
      return orig ? orig.filter(p => p.side === side) : [];
    }
  };
  // Orijinal port şablonlarını YZ tespiti için sakla
  CATS.forEach(c => { Object.defineProperty(c, '_tpl', { value: clone(c.jsn.ports), enumerable: false, writable: true }); });
})();

/* ==========================================================================
   Etap 3 — connectivity.html verisi (eski js/mock/connectivity.data.js)
   ========================================================================== */
/* ==========================================================================
   DCIM Sunum — SDP Kablolama Topolojisi mock verisi (connectivity.html)
   api.CTD_Data(0,'…') (queryCableTopologyDiagramApi, where={src_pan}) çağrısının yerine geçer.
   Satırlar gerçek CTD tablosundan alınmıştır: P24A01_S01/sql/CTD_sql.txt (848 kayıt,
   id sırası korunur). flr/hal/wrk_dat/wrk_per tüm satırlarda aynı olduğu için bir kez tutulur.

   Canlı ölçüm modeli (tohumlu, tick başına ±%1,5 dalgalanma):
   - Sigorta devresi (CTD satırı): kabinin ilgili PDU tarafı akımı (DCIM.data.cabinets[].pduA/pduB)
     o PDU'yu besleyen devrelere paylaştırılır. 3 devreli PDU → L1/L2/L3 (faz payları
     failover rapor mock'undaki basePhases ile aynı tohumdan). Anma: tek devre 32 A, çok devre 16 A.
   - RPP / Giriş barası (…G1 / …G2) ve SDP: DCIM.data.reports.sdp (SDP raporu, 160 A giriş şalteri)
     değerleriyle aynı; rapor verisi yoksa devrelerin toplamı kullanılır.
   - UPS: DCIM.data.ups (yük oranı, çalışma modu). Çıkış gücü = yük % × 80 kW (SDP rapor varsayımı).
   - ADP ve Trafo: DCIM.data.reports.trafo (1600 kVA). ADP ↔ Trafo ↔ UPS eşlemesi sunum varsayımıdır
     (A1–A4 → ADP-A1 / A TRAFO 3, A5–A7 → ADP-A2 / A TRAFO 4; B tarafı B TRAFO 1 / 2).
   Senaryo: UPS A5 akü modunda (ADP → UPS A5 girişi yok) · 1AV42 PDU_B L2 faz kaybı (B2 SDP,
   1B2G2 - 2F32 = 0 A / 0 V) ve L2 yükü PDU_A'ya aktarıldı (A2 SDP, yüksek yük) · 1CB52 yüksek akım
   (C20 sigorta, A6/B6 SDP) · UPS B4 yük %82 · UPS B7 SNMP kaybı.
   Bağımlılık: js/mock-data.js (DCIM.data: cabinets, ups, findCabinet, findEquipment, pdu, reports, rng, hash)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D) return;

  const SQRT3 = Math.sqrt(3);
  const between = (rnd, min, max) => min + (max - min) * rnd();
  const rngOf = key => D.rng(D.hash(String(key)));

  // Yük eşikleri (%): ≥ WARN yüksek yük (turuncu), ≥ CRIT aşırı yük (kırmızı)
  const LOAD_WARN = 80;
  const LOAD_CRIT = 95;
  const UPS_RATED_KW = 80;     // SDP raporundaki "yük % × 0,8 kW" varsayımı
  const RPP_RATED_A = 160;     // SDP giriş şalteri (db_CMR_T00.xml dev_cap="160")
  const SDP_RATED_A = 250;     // SDP ana bara (sunum varsayımı)
  const ADP_RATED_A = 2500;    // ADP ana şalter (sunum varsayımı)
  const TRAFO_RATED_KVA = 1600;

  // ---------------------------------------------------------------------------
  // CTD tablosu — [src_pan kodu, src_fus, tgt_cab, tgt_pdu]
  // ---------------------------------------------------------------------------
  const CTD_META = { flr: '1. KAT', hal: '1. SALON', wrk_dat: '2025-04-25', wrk_per: 'Gökhan DEMİREL' };
  const CTD_ROWS = [
    ['A1', '1A1G1 - 1F1', '1BG43 PMC', 'PDU_A'], ['A1', '1A1G1 - 1F2', '1BG43 PMC', 'PDU_A'], ['A1', '1A1G1 - 1F3', '1BG43 PMC', 'PDU_A'], ['A1', '1A1G1 - 1F28', '1AZ41', 'PDU_A'],
    ['A1', '1A1G1 - 1F29', '1BC41', 'PDU_A'], ['A1', '1A1G1 - 1F30', '1BC37', 'PDU_A'], ['A1', '1A1G1 - 1F31', '1BG41', 'PDU_A'], ['A1', '1A1G1 - 1F32', '1BG40', 'PDU_A'],
    ['A1', '1A1G1 - 1F33', '1BG39', 'PDU_A'], ['A1', '1A1G1 - 1F34', '1BG38', 'PDU_A'], ['A1', '1A1G1 - 1F35', '1BG37', 'PDU_A'], ['A1', '1A1G1 - 1F36', '1BG36', 'PDU_A'],
    ['A1', '1A1G1 - 1F37', '1BJ41', 'PDU_A'], ['A1', '1A1G1 - 1F38', '1BJ40', 'PDU_A'], ['A1', '1A1G1 - 1F39', '1BJ39', 'PDU_A'], ['A1', '1A1G1 - 1F40', '1BJ38', 'PDU_A'],
    ['A1', '1A1G1 - 1F41', '1BN41', 'PDU_A'], ['A1', '1A1G1 - 1F42', '1BN40', 'PDU_A'], ['A1', '1A1G1 - 1F43', '1BN39', 'PDU_A'], ['A1', '1A1G1 - 1F44', '1BN38', 'PDU_A'],
    ['A1', '1A1G1 - 1F45', '1BN37', 'PDU_A'], ['A1', '1A1G1 - 1F46', '1BN36', 'PDU_A'], ['A1', '1A1G1 - 1F47', '1BC43', 'PDU_A'], ['A1', '1A1G2 - 2F27', '1BQ36', 'PDU_A'],
    ['A1', '1A1G2 - 2F28', '1AV38', 'PDU_A'], ['A1', '1A1G2 - 2F29', '1AV37', 'PDU_A'], ['A1', '1A1G2 - 2F30', '1AZ37', 'PDU_A'], ['A1', '1A1G2 - 2F31', '1AV39', 'PDU_A'],
    ['A1', '1A1G2 - 2F32', '1BG36', 'PDU_A'], ['A1', '1A1G2 - 2F33', '1BG37', 'PDU_A'], ['A1', '1A1G2 - 2F34', '1BG37', 'PDU_A'], ['A1', '1A1G2 - 2F35', '1BN42', 'PDU_A'],
    ['A1', '1A1G2 - 2F36', '1BN41', 'PDU_A'], ['A1', '1A1G2 - 2F37', '1BN40', 'PDU_A'], ['A1', '1A1G2 - 2F38', '1BN39', 'PDU_A'], ['A1', '1A1G2 - 2F39', '1BN38', 'PDU_A'],
    ['A1', '1A1G2 - 2F40', '1BN37', 'PDU_A'], ['A1', '1A1G2 - 2F41', '1BN36', 'PDU_A'], ['A1', '1A1G2 - 2F42', '1BQ42', 'PDU_A'], ['A1', '1A1G2 - 2F43', '1BQ41', 'PDU_A'],
    ['A1', '1A1G2 - 2F44', '1BQ40', 'PDU_A'], ['A1', '1A1G2 - 2F45', '1BQ39', 'PDU_A'], ['A1', '1A1G2 - 2F46', '1BQ38', 'PDU_A'], ['A1', '1A1G2 - 2F47', '1BQ37', 'PDU_A'],
    ['A1', '1A1G2 - 2F55', '1BJ41', 'PDU_A'], ['A1', '1A1G2 - 2F56', '1BJ41', 'PDU_A'], ['A1', '1A1G2 - 2F57', '1BJ41', 'PDU_A'], ['A1', '1A1G2 - 2F58', '1BC38', 'PDU_A1'],
    ['A1', '1A1G2 - 2F59', '1BC38', 'PDU_A1'], ['A1', '1A1G2 - 2F60', '1BC38', 'PDU_A1'], ['A2', '1A2G1 - 1F19', '1AS39 - G', 'PDU_A'], ['A2', '1A2G1 - 1F20', '1AS39 - G', 'PDU_A'],
    ['A2', '1A2G1 - 1F21', '1AS39 - G', 'PDU_A'], ['A2', '1A2G1 - 1F22', '1AS39 - G', 'PDU_A'], ['A2', '1A2G1 - 1F23', '1AS39 - G', 'PDU_A'], ['A2', '1A2G1 - 1F24', '1AS39 - G', 'PDU_A'],
    ['A2', '1A2G1 - 1F28', '1AS37', 'PDU_A'], ['A2', '1A2G1 - 1F29', '1AV37 - G', 'PDU_A'], ['A2', '1A2G1 - 1F30', '1AV37 - G', 'PDU_A'], ['A2', '1A2G1 - 1F31', '1AV37 - G', 'PDU_A'],
    ['A2', '1A2G1 - 1F32', '1AV38 - G', 'PDU_A'], ['A2', '1A2G1 - 1F33', '1AV38 - G', 'PDU_A'], ['A2', '1A2G1 - 1F34', '1AV38 - G', 'PDU_A'], ['A2', '1A2G1 - 1F35', '1AS37', 'PDU_A'],
    ['A2', '1A2G1 - 1F36', '1AS37', 'PDU_A'], ['A2', '1A2G1 - 1F37', '1AS37', 'PDU_A'], ['A2', '1A2G1 - 1F38', '1AS38', 'PDU_A'], ['A2', '1A2G1 - 1F39', '1AS38', 'PDU_A'],
    ['A2', '1A2G1 - 1F40', '1AS38', 'PDU_A'], ['A2', '1A2G1 - 1F49', '1AV35 - G', 'PDU_A'], ['A2', '1A2G1 - 1F50', '1AV35 - G', 'PDU_A'], ['A2', '1A2G1 - 1F51', '1AV35 - G', 'PDU_A'],
    ['A2', '1A2G1 - 1F52', '1AV35 - G', 'PDU_A'], ['A2', '1A2G1 - 1F53', '1AV35 - G', 'PDU_A'], ['A2', '1A2G1 - 1F54', '1AV35 - G', 'PDU_A'], ['A2', '1A2G1 - 1F55', '1AS39 - G', 'PDU_A'],
    ['A2', '1A2G1 - 1F56', '1AS39 - G', 'PDU_A'], ['A2', '1A2G1 - 1F57', '1AS39 - G', 'PDU_A'], ['A2', '1A2G1 - 1F58', '1AS41 - G', 'PDU_A'], ['A2', '1A2G1 - 1F59', '1AS41 - G', 'PDU_A'],
    ['A2', '1A2G1 - 1F60', '1AS41 - G', 'PDU_A'], ['A2', '1A2G1 - 1F61', '1AS42 - G', 'PDU_A'], ['A2', '1A2G1 - 1F62', '1AS42 - G', 'PDU_A'], ['A2', '1A2G1 - 1F63', '1AS42 - G', 'PDU_A'],
    ['A2', '1A2G1 - 1F67', '1AR42 - G', 'PDU_A'], ['A2', '1A2G1 - 1F68', '1AR42 - G', 'PDU_A'], ['A2', '1A2G1 - 1F69', '1AR42 - G', 'PDU_A'], ['A2', '1A2G1 - 1F70', '1AT42 - G', 'PDU_A'],
    ['A2', '1A2G1 - 1F71', '1AT42 - G', 'PDU_A'], ['A2', '1A2G1 - 1F72', '1AT42 - G', 'PDU_A'], ['A2', '1A2G2 - 2F1', '1AZ39', 'PDU_A'], ['A2', '1A2G2 - 2F2', '1AS40', 'PDU_A'],
    ['A2', '1A2G2 - 2F28', '1AV43', 'PDU_A'], ['A2', '1A2G2 - 2F29', '1AV43', 'PDU_A'], ['A2', '1A2G2 - 2F30', '1AV43', 'PDU_A'], ['A2', '1A2G2 - 2F31', '1AV42', 'PDU_A'],
    ['A2', '1A2G2 - 2F32', '1AV42', 'PDU_A'], ['A2', '1A2G2 - 2F33', '1AV42', 'PDU_A'], ['A2', '1A2G2 - 2F34', '1AV41', 'PDU_A'], ['A2', '1A2G2 - 2F35', '1AV41', 'PDU_A'],
    ['A2', '1A2G2 - 2F49', '1AV36 - G', 'PDU_A'], ['A2', '1A2G2 - 2F50', '1AV36 - G', 'PDU_A'], ['A2', '1A2G2 - 2F51', '1AV36 - G', 'PDU_A'], ['A2', '1A2G2 - 2F52', '1AV36 - G', 'PDU_A'],
    ['A2', '1A2G2 - 2F53', '1AV36 - G', 'PDU_A'], ['A2', '1A2G2 - 2F54', '1AV36 - G', 'PDU_A'], ['A2', '1A2G2 - 2F55', '1AS35 - G', 'PDU_A'], ['A2', '1A2G2 - 2F56', '1AS35 - G', 'PDU_A'],
    ['A2', '1A2G2 - 2F57', '1AS35 - G', 'PDU_A'], ['A2', '1A2G2 - 2F58', '1AS36 - G', 'PDU_A'], ['A2', '1A2G2 - 2F59', '1AS36 - G', 'PDU_A'], ['A2', '1A2G2 - 2F60', '1AS36 - G', 'PDU_A'],
    ['A2', '1A2G2 - 2F61', '1AS36 - G', 'PDU_A'], ['A2', '1A2G2 - 2F62', '1AS36 - G', 'PDU_A'], ['A2', '1A2G2 - 2F63', '1AS36 - G', 'PDU_A'], ['A2', '1A2G2 - 2F64', '1AV40 - G', 'PDU_A'],
    ['A2', '1A2G2 - 2F65', '1AV40 - G', 'PDU_A'], ['A2', '1A2G2 - 2F66', '1AV40 - G', 'PDU_A'], ['A2', '1A2G2 - 2F67', '1AU42 - G', 'PDU_A'], ['A2', '1A2G2 - 2F68', '1AU42 - G', 'PDU_A'],
    ['A2', '1A2G2 - 2F69', '1AU42 - G', 'PDU_A'], ['A2', '1A2G2 - 2F70', '1AW42 - G', 'PDU_A'], ['A2', '1A2G2 - 2F71', '1AW42 - G', 'PDU_A'], ['A2', '1A2G2 - 2F72', '1AW42 - G', 'PDU_A'],
    ['A3', '1A3G1 - 1F28', '1AZ57', 'PDU_A'], ['A3', '1A3G1 - 1F29', '1AZ56', 'PDU_A'], ['A3', '1A3G1 - 1F30', '1AZ55', 'PDU_A'], ['A3', '1A3G1 - 1F31', '1AZ54', 'PDU_A'],
    ['A3', '1A3G1 - 1F32', '1AZ53', 'PDU_A'], ['A3', '1A3G1 - 1F33', '1AZ52', 'PDU_A'], ['A3', '1A3G1 - 1F34', '1AZ51', 'PDU_A'], ['A3', '1A3G1 - 1F35', '1AZ50 - G', 'PDU_A'],
    ['A3', '1A3G1 - 1F36', '1AZ50 - G', 'PDU_A'], ['A3', '1A3G1 - 1F37', '1AZ50 - G', 'PDU_A'], ['A3', '1A3G1 - 1F38', '1BC50 - G', 'PDU_A'], ['A3', '1A3G1 - 1F39', '1BC50 - G', 'PDU_A'],
    ['A3', '1A3G1 - 1F40', '1BC50 - G', 'PDU_A'], ['A3', '1A3G1 - 1F41', '1AS50 - G', 'PDU_A'], ['A3', '1A3G1 - 1F42', '1AS50 - G', 'PDU_A'], ['A3', '1A3G1 - 1F43', '1AS50 - G', 'PDU_A'],
    ['A3', '1A3G1 - 1F44', '1AS51 - G', 'PDU_A'], ['A3', '1A3G1 - 1F45', '1AS51 - G', 'PDU_A'], ['A3', '1A3G1 - 1F46', '1AS51 - G', 'PDU_A'], ['A3', '1A3G1 - 1F55', '1AZ54 - G', 'PDU_A1'],
    ['A3', '1A3G1 - 1F56', '1AZ54 - G', 'PDU_A1'], ['A3', '1A3G1 - 1F57', '1AZ54 - G', 'PDU_A1'], ['A3', '1A3G1 - 1F58', '1AZ55 - G', 'PDU_A1'], ['A3', '1A3G1 - 1F59', '1AZ55 - G', 'PDU_A1'],
    ['A3', '1A3G1 - 1F60', '1AZ55 - G', 'PDU_A1'], ['A3', '1A3G1 - 1F61', '1AZ56 - G', 'PDU_A1'], ['A3', '1A3G1 - 1F62', '1AZ56 - G', 'PDU_A1'], ['A3', '1A3G1 - 1F63', '1AZ56 - G', 'PDU_A1'],
    ['A3', '1A3G1 - 1F64', '1AV54 - G', 'PDU_A'], ['A3', '1A3G1 - 1F65', '1AV54 - G', 'PDU_A'], ['A3', '1A3G1 - 1F66', '1AV54 - G', 'PDU_A'], ['A3', '1A3G2 - 2F28', '1AS49', 'PDU_A'],
    ['A3', '1A3G2 - 2F29', '1AS49', 'PDU_A'], ['A3', '1A3G2 - 2F30', '1AS49', 'PDU_A'], ['A3', '1A3G2 - 2F31', '1AV51', 'PDU_A'], ['A3', '1A3G2 - 2F32', '1AV51', 'PDU_A'],
    ['A3', '1A3G2 - 2F33', '1AV51', 'PDU_A'], ['A3', '1A3G2 - 2F34', '1AV49', 'PDU_A'], ['A3', '1A3G2 - 2F35', '1AV49', 'PDU_A'], ['A3', '1A3G2 - 2F36', '1AV50', 'PDU_A'],
    ['A3', '1A3G2 - 2F37', '1AV50', 'PDU_A'], ['A3', '1A3G2 - 2F38', '1AS54', 'PDU_A'], ['A3', '1A3G2 - 2F39', '1AS54', 'PDU_A'], ['A3', '1A3G2 - 2F40', '1AS54', 'PDU_A'],
    ['A3', '1A3G2 - 2F41', '1AS55', 'PDU_A'], ['A3', '1A3G2 - 2F42', '1AS55', 'PDU_A'], ['A3', '1A3G2 - 2F43', '1AS55', 'PDU_A'], ['A3', '1A3G2 - 2F44', '1AV53', 'PDU_A'],
    ['A3', '1A3G2 - 2F45', '1AV53', 'PDU_A'], ['A3', '1A3G2 - 2F46', '1AS57', 'PDU_A'], ['A3', '1A3G2 - 2F47', '1AV56', 'PDU_A'], ['A3', '1A3G2 - 2F48', '1AV56', 'PDU_A'],
    ['A3', '1A3G2 - 2F55', '1AS56 - G', 'PDU_A'], ['A3', '1A3G2 - 2F56', '1AS56 - G', 'PDU_A'], ['A3', '1A3G2 - 2F57', '1AS56 - G', 'PDU_A'], ['A3', '1A3G2 - 2F58', '1AS57 - G', 'PDU_A'],
    ['A3', '1A3G2 - 2F59', '1AS57 - G', 'PDU_A'], ['A3', '1A3G2 - 2F60', '1AS57 - G', 'PDU_A'], ['A3', '1A3G2 - 2F61', '1AS52 - G', 'PDU_A'], ['A3', '1A3G2 - 2F62', '1AS52 - G', 'PDU_A'],
    ['A3', '1A3G2 - 2F63', '1AS52 - G', 'PDU_A'], ['A3', '1A3G2 - 2F64', '1AS53 - G', 'PDU_A'], ['A3', '1A3G2 - 2F65', '1AS53 - G', 'PDU_A'], ['A3', '1A3G2 - 2F66', '1AS53 - G', 'PDU_A'],
    ['A4', '1A4G1 - 1F28', '1BN51', 'PDU_A'], ['A4', '1A4G1 - 1F29', '1BN52', 'PDU_A'], ['A4', '1A4G1 - 1F30', '1BN53', 'PDU_A'], ['A4', '1A4G1 - 1F31', '1BN54', 'PDU_A'],
    ['A4', '1A4G1 - 1F32', '1BN55', 'PDU_A'], ['A4', '1A4G1 - 1F33', '1BN56', 'PDU_A'], ['A4', '1A4G1 - 1F34', '1BN57', 'PDU_A'], ['A4', '1A4G1 - 1F35', '1BJ51', 'PDU_A'],
    ['A4', '1A4G1 - 1F36', '1BJ52', 'PDU_A'], ['A4', '1A4G1 - 1F37', '1BJ53', 'PDU_A'], ['A4', '1A4G1 - 1F38', '1BJ54', 'PDU_A'], ['A4', '1A4G1 - 1F39', '1BJ55', 'PDU_A'],
    ['A4', '1A4G1 - 1F40', '1BJ56', 'PDU_A'], ['A4', '1A4G1 - 1F41', '1BJ57', 'PDU_A'], ['A4', '1A4G1 - 1F42', '1BG51', 'PDU_A'], ['A4', '1A4G1 - 1F43', '1BG52', 'PDU_A'],
    ['A4', '1A4G1 - 1F44', '1BG53', 'PDU_A'], ['A4', '1A4G1 - 1F45', '1BG54', 'PDU_A'], ['A4', '1A4G1 - 1F46', '1BG55', 'PDU_A'], ['A4', '1A4G1 - 1F47', '1BG56', 'PDU_A'],
    ['A4', '1A4G1 - 1F48', '2BG57', 'PDU_A'], ['A4', '1A4G1 - 1F55', '1AV57', 'PDU_A'], ['A4', '1A4G1 - 1F56', '1AV57', 'PDU_A'], ['A4', '1A4G1 - 1F57', '1AV57', 'PDU_A'],
    ['A4', '1A4G1 - 1F58', '1AV58', 'PDU_A'], ['A4', '1A4G1 - 1F59', '1AV58', 'PDU_A'], ['A4', '1A4G1 - 1F60', '1AV58', 'PDU_A'], ['A4', '1A4G2 - 2F28', '1BC51', 'PDU_A'],
    ['A4', '1A4G2 - 2F29', '1BC52', 'PDU_A'], ['A4', '1A4G2 - 2F30', '1BC53', 'PDU_A'], ['A4', '1A4G2 - 2F31', '1BC54', 'PDU_A'], ['A4', '1A4G2 - 2F32', '1BC55', 'PDU_A'],
    ['A4', '1A4G2 - 2F33', '1BC56', 'PDU_A'], ['A4', '1A4G2 - 2F34', '1BC57', 'PDU_A'], ['A4', '1A4G2 - 2F35', '1AV55', 'PDU_A'], ['A4', '1A4G2 - 2F36', '1BC54', 'PDU_A'],
    ['A4', '1A4G2 - 2F37', '1AV55', 'PDU_A'], ['A4', '1A4G2 - 2F38', '1BG53', 'PDU_A'], ['A4', '1A4G2 - 2F39', '1BG54', 'PDU_A'], ['A4', '1A4G2 - 2F40', '1BG55', 'PDU_A'],
    ['A4', '1A4G2 - 2F41', '1BG56', 'PDU_A'], ['A4', '1A4G2 - 2F42', '1BG57', 'PDU_A'], ['A4', '1A4G2 - 2F43', '1BJ43', 'PDU_A'], ['A4', '1A4G2 - 2F44', '1BC54', 'PDU_A1'],
    ['A4', '1A4G2 - 2F45', '1BC54', 'PDU_A1'], ['A4', '1A4G2 - 2F46', '1BC54', 'PDU_A1'], ['A4', '1A4G2 - 2F55', '1BJ51 - G', 'PDU_A'], ['A4', '1A4G2 - 2F56', '1BJ51 - G', 'PDU_A'],
    ['A4', '1A4G2 - 2F57', '1BJ51 - G', 'PDU_A'], ['A4', '1A4G2 - 2F58', '1BJ52 - G', 'PDU_A'], ['A4', '1A4G2 - 2F59', '1BJ52 - G', 'PDU_A'], ['A4', '1A4G2 - 2F60', '1BJ52 - G', 'PDU_A'],
    ['A4', '1A4G2 - 2F61', '1BC52 - G', 'PDU_A1'], ['A4', '1A4G2 - 2F62', '1BC52 - G', 'PDU_A1'], ['A4', '1A4G2 - 2F63', '1BC52 - G', 'PDU_A1'], ['A4', '1A4G2 - 2F64', '1BC53 - G', 'PDU_A1'],
    ['A4', '1A4G2 - 2F65', '1BC53 - G', 'PDU_A1'], ['A4', '1A4G2 - 2F66', '1BC53 - G', 'PDU_A1'], ['A5', '1A5G1 - 1F28', '1BQ51', 'PDU_A'], ['A5', '1A5G1 - 1F29', '1BQ51', 'PDU_A'],
    ['A5', '1A5G1 - 1F30', '1BQ53', 'PDU_A'], ['A5', '1A5G1 - 1F31', '1BQ55', 'PDU_A'], ['A5', '1A5G1 - 1F32', '1BQ55', 'PDU_A'], ['A5', '1A5G1 - 1F33', '1BQ56', 'PDU_A'],
    ['A5', '1A5G1 - 1F34', '1BQ57', 'PDU_A'], ['A5', '1A5G1 - 1F35', '1BQ57', 'PDU_A'], ['A5', '1A5G1 - 1F38', '1BX40 - G', 'PDU_A'], ['A5', '1A5G1 - 1F39', '1BX40 - G', 'PDU_A'],
    ['A5', '1A5G1 - 1F40', '1BX40 - G', 'PDU_A'], ['A5', '1A5G1 - 1F41', '1BG43', 'PDU_A'], ['A5', '1A5G1 - 1F42', '1BG50', 'PDU_A'], ['A5', '1A5G1 - 1F55', '1BQ52 - G', 'PDU_A'],
    ['A5', '1A5G1 - 1F56', '1BQ52 - G', 'PDU_A'], ['A5', '1A5G1 - 1F57', '1BQ52 - G', 'PDU_A'], ['A5', '1A5G2 - 2F28', '1BX50', 'PDU_A'], ['A5', '1A5G2 - 2F29', '1BX51', 'PDU_A'],
    ['A5', '1A5G2 - 2F30', '1BX52', 'PDU_A'], ['A5', '1A5G2 - 2F31', '1BX53', 'PDU_A'], ['A5', '1A5G2 - 2F32', '1BX54', 'PDU_A'], ['A5', '1A5G2 - 2F33', '1BQ50', 'PDU_A'],
    ['A5', '1A5G2 - 2F34', '1BN50', 'PDU_A'], ['A5', '1A5G2 - 2F35', '1BJ50', 'PDU_A'], ['A5', '1A5G2 - 2F36', '1BG50', 'PDU_A'], ['A5', '1A5G2 - 2F37', '1BX41 - G', 'PDU_A1'],
    ['A5', '1A5G2 - 2F38', '1BX41 - G', 'PDU_A1'], ['A5', '1A5G2 - 2F39', '1BX41 - G', 'PDU_A1'], ['A5', '1A5G2 - 2F40', '1BX42 - G', 'PDU_A1'], ['A5', '1A5G2 - 2F41', '1BX42 - G', 'PDU_A1'],
    ['A5', '1A5G2 - 2F42', '1BX42 - G', 'PDU_A1'], ['A5', '1A5G2 - 2F43', '1AZ43', 'PDU_A'], ['A5', '1A5G2 - 2F55', '1BQ54 - G', 'PDU_A'], ['A5', '1A5G2 - 2F56', '1BQ54 - G', 'PDU_A'],
    ['A5', '1A5G2 - 2F57', '1BQ54 - G', 'PDU_A'], ['A5', '1A5G2 - 2F58', '1BN54 - G', 'PDU_A'], ['A5', '1A5G2 - 2F59', '1BN54 - G', 'PDU_A'], ['A5', '1A5G2 - 2F60', '1BN54 - G', 'PDU_A'],
    ['A6', '1A6G1 - 1F25', '1CE50', 'PDU_A'], ['A6', '1A6G1 - 1F26', '1CB50', 'PDU_A'], ['A6', '1A6G1 - 1F27', '1BQ43', 'PDU_A'], ['A6', '1A6G1 - 1F28', '1CB57', 'PDU_A'],
    ['A6', '1A6G1 - 1F29', '1CB56', 'PDU_A'], ['A6', '1A6G1 - 1F30', '1CB55', 'PDU_A'], ['A6', '1A6G1 - 1F31', '1CB54', 'PDU_A'], ['A6', '1A6G1 - 1F32', '1CB53', 'PDU_A'],
    ['A6', '1A6G1 - 1F33', '1CB52', 'PDU_A'], ['A6', '1A6G1 - 1F34', '1CB51', 'PDU_A'], ['A6', '1A6G1 - 1F35', '1CE51', 'PDU_A'], ['A6', '1A6G1 - 1F36', '1CE52', 'PDU_A'],
    ['A6', '1A6G1 - 1F37', '1CE53', 'PDU_A'], ['A6', '1A6G1 - 1F38', '1CE54', 'PDU_A'], ['A6', '1A6G1 - 1F39', '1CE55', 'PDU_A'], ['A6', '1A6G1 - 1F40', '1CE56', 'PDU_A'],
    ['A6', '1A6G1 - 1F41', '1CE57', 'PDU_A'], ['A6', '1A6G1 - 1F42', '1CB50', 'PDU_A'], ['A6', '1A6G1 - 1F43', '1CE51', 'PDU_A'], ['A6', '1A6G1 - 1F44', '1CB43 - G', 'PDU_A1'],
    ['A6', '1A6G1 - 1F45', '1CB43 - G', 'PDU_A1'], ['A6', '1A6G1 - 1F46', '1CB43 - G', 'PDU_A1'], ['A6', '1A6G1 - 1F47', '1BU43', 'PDU_A'], ['A6', '1A6G1 - 1F48', '1BX43', 'PDU_A'],
    ['A6', '1A6G2 - 2F1', '1CE50', 'PDU_A'], ['A6', '1A6G2 - 2F2', '1BU50', 'PDU_A'], ['A6', '1A6G2 - 2F3', '1BQ50', 'PDU_A'], ['A6', '1A6G2 - 2F4', '1BN50', 'PDU_A'],
    ['A6', '1A6G2 - 2F5', '1BJ50', 'PDU_A'], ['A6', '1A6G2 - 2F6', '1BG50', 'PDU_A'], ['A6', '1A6G2 - 2F7', '1BC50', 'PDU_A'], ['A6', '1A6G2 - 2F8', '1AZ50', 'PDU_A'],
    ['A6', '1A6G2 - 2F28', '1BX51', 'PDU_A'], ['A6', '1A6G2 - 2F29', '1BX52', 'PDU_A'], ['A6', '1A6G2 - 2F30', '1BX53', 'PDU_A'], ['A6', '1A6G2 - 2F31', '1BX54', 'PDU_A'],
    ['A6', '1A6G2 - 2F32', '1BX55', 'PDU_A'], ['A6', '1A6G2 - 2F33', '1BX56', 'PDU_A'], ['A6', '1A6G2 - 2F34', '1BX57', 'PDU_A'], ['A6', '1A6G2 - 2F35', '1BU51', 'PDU_A'],
    ['A6', '1A6G2 - 2F36', '1BU52', 'PDU_A'], ['A6', '1A6G2 - 2F37', '1BU53', 'PDU_A'], ['A6', '1A6G2 - 2F38', '1BU54', 'PDU_A'], ['A6', '1A6G2 - 2F39', '1BU55', 'PDU_A'],
    ['A6', '1A6G2 - 2F40', '1BU56', 'PDU_A'], ['A6', '1A6G2 - 2F41', '1BU57', 'PDU_A'], ['A6', '1A6G2 - 2F42', '1BJ50', 'PDU_A'], ['A6', '1A6G2 - 2F43', '1AZ50', 'PDU_A1'],
    ['A6', '1A6G2 - 2F55', '1BN51 - G', 'PDU_A1'], ['A6', '1A6G2 - 2F56', '1BN51 - G', 'PDU_A1'], ['A6', '1A6G2 - 2F57', '1BN51 - G', 'PDU_A1'], ['A6', '1A6G2 - 2F58', '1BN52 - G', 'PDU_A1'],
    ['A6', '1A6G2 - 2F59', '1BN52 - G', 'PDU_A1'], ['A6', '1A6G2 - 2F60', '1BN52 - G', 'PDU_A1'], ['A6', '1A6G2 - 2F61', '1BN53 - G', 'PDU_A'], ['A6', '1A6G2 - 2F62', '1BN53 - G', 'PDU_A'],
    ['A6', '1A6G2 - 2F63', '1BN53 - G', 'PDU_A'], ['A7', '1A7G1 - 1F22', '1CE37 - G', 'PDU_A'], ['A7', '1A7G1 - 1F23', '1CE37 - G', 'PDU_A'], ['A7', '1A7G1 - 1F24', '1CE37 - G', 'PDU_A'],
    ['A7', '1A7G1 - 1F25', '1CE36 - G', 'PDU_A'], ['A7', '1A7G1 - 1F26', '1CE36 - G', 'PDU_A'], ['A7', '1A7G1 - 1F27', '1CE36 - G', 'PDU_A'], ['A7', '1A7G1 - 1F28', '1BJ37', 'PDU_A'],
    ['A7', '1A7G1 - 1F29', '1BJ36', 'PDU_A'], ['A7', '1A7G1 - 1F30', '1BJ42', 'PDU_A'], ['A7', '1A7G1 - 1F31', '1AZ38', 'PDU_A'], ['A7', '1A7G1 - 1F32', '1BC39', 'PDU_A'],
    ['A7', '1A7G1 - 1F33', '1BC38', 'PDU_A'], ['A7', '1A7G1 - 1F34', '1BG42', 'PDU_A'], ['A7', '1A7G1 - 1F35', '1BN42', 'PDU_A'], ['A7', '1A7G1 - 1F36', '1BQ42', 'PDU_A'],
    ['A7', '1A7G1 - 1F37', '1BU42', 'PDU_A'], ['A7', '1A7G1 - 1F38', '1BX42', 'PDU_A'], ['A7', '1A7G1 - 1F39', '1BQ41', 'PDU_A'], ['A7', '1A7G1 - 1F40', '1BQ40', 'PDU_A'],
    ['A7', '1A7G1 - 1F41', '1BQ39', 'PDU_A'], ['A7', '1A7G1 - 1F42', '1BQ38', 'PDU_A'], ['A7', '1A7G1 - 1F43', '1BQ37', 'PDU_A'], ['A7', '1A7G1 - 1F44', '1BQ36', 'PDU_A'],
    ['A7', '1A7G1 - 1F45', '1BU41', 'PDU_A'], ['A7', '1A7G1 - 1F46', '1BU40', 'PDU_A'], ['A7', '1A7G1 - 1F47', '1BU39', 'PDU_A'], ['A7', '1A7G1 - 1F48', '1BU38', 'PDU_A'],
    ['A7', '1A7G1 - 1F55', '1CE41 - G', 'PDU_A'], ['A7', '1A7G1 - 1F56', '1CE41 - G', 'PDU_A'], ['A7', '1A7G1 - 1F57', '1CE41 - G', 'PDU_A'], ['A7', '1A7G1 - 1F58', '1BN43 - G', 'PDU_A'],
    ['A7', '1A7G1 - 1F59', '1BN43 - G', 'PDU_A'], ['A7', '1A7G1 - 1F60', '1BN43 - G', 'PDU_A'], ['A7', '1A7G1 - 1F61', '1CE40 - G', 'PDU_A'], ['A7', '1A7G1 - 1F62', '1CE40 - G', 'PDU_A'],
    ['A7', '1A7G1 - 1F63', '1CE40 - G', 'PDU_A'], ['A7', '1A7G1 - 1F64', '1CE40 - G', 'PDU_A'], ['A7', '1A7G1 - 1F65', '1CE40 - G', 'PDU_A'], ['A7', '1A7G1 - 1F66', '1CE40 - G', 'PDU_A'],
    ['A7', '1A7G2 - 2F1', '1CB43', 'PDU_A'], ['A7', '1A7G2 - 2F2', '1BX43', 'PDU_A'], ['A7', '1A7G2 - 2F3', '1CE43', 'PDU_A'], ['A7', '1A7G2 - 2F5', '1BQ43', 'PDU_A'],
    ['A7', '1A7G2 - 2F6', '1BU43', 'PDU_A'], ['A7', '1A7G2 - 2F7', '1BJ43', 'PDU_A'], ['A7', '1A7G2 - 2F8', '1BG43', 'PDU_A'], ['A7', '1A7G2 - 2F9', '1BC43', 'PDU_A'],
    ['A7', '1A7G2 - 2F10', '1AZ43', 'PDU_A'], ['A7', '1A7G2 - 2F21', '1CB36', 'PDU_A'], ['A7', '1A7G2 - 2F22', '1BU42 - G', 'PDU_A1'], ['A7', '1A7G2 - 2F23', '1BU42 - G', 'PDU_A1'],
    ['A7', '1A7G2 - 2F24', '1BU42 - G', 'PDU_A1'], ['A7', '1A7G2 - 2F27', '1BU37', 'PDU_A'], ['A7', '1A7G2 - 2F28', '1BU36', 'PDU_A'], ['A7', '1A7G2 - 2F29', '1BX41', 'PDU_A'],
    ['A7', '1A7G2 - 2F30', '1CB42', 'PDU_A'], ['A7', '1A7G2 - 2F31', '1BX39', 'PDU_A'], ['A7', '1A7G2 - 2F32', '1BX38', 'PDU_A'], ['A7', '1A7G2 - 2F33', '1BX37', 'PDU_A'],
    ['A7', '1A7G2 - 2F34', '1BX36', 'PDU_A'], ['A7', '1A7G2 - 2F35', '1CB42', 'PDU_A1'], ['A7', '1A7G2 - 2F36', '1CB41', 'PDU_A'], ['A7', '1A7G2 - 2F37', '1CB40', 'PDU_A'],
    ['A7', '1A7G2 - 2F38', '1CB39', 'PDU_A'], ['A7', '1A7G2 - 2F39', '1CB38', 'PDU_A'], ['A7', '1A7G2 - 2F40', '1CB37', 'PDU_A'], ['A7', '1A7G2 - 2F41', '1CB36', 'PDU_A'],
    ['A7', '1A7G2 - 2F42', '1CE42', 'PDU_A'], ['A7', '1A7G2 - 2F43', '1CE43', 'PDU_A'], ['A7', '1A7G2 - 2F44', '1CE43', 'PDU_A'], ['A7', '1A7G2 - 2F45', '1CB43', 'PDU_A'],
    ['A7', '1A7G2 - 2F46', '1CB41', 'PDU_A'], ['A7', '1A7G2 - 2F47', '1CB40', 'PDU_A'], ['A7', '1A7G2 - 2F48', '1CB39', 'PDU_A'], ['A7', '1A7G2 - 2F55', '1CE39 - G', 'PDU_A'],
    ['A7', '1A7G2 - 2F56', '1CE39 - G', 'PDU_A'], ['A7', '1A7G2 - 2F57', '1CE39 - G', 'PDU_A'], ['A7', '1A7G2 - 2F58', '1CE39 - G1', 'PDU_A'], ['A7', '1A7G2 - 2F59', '1CE39 - G1', 'PDU_A'],
    ['A7', '1A7G2 - 2F60', '1CE39 - G1', 'PDU_A'], ['A7', '1A7G2 - 2F61', '1CE38 - G', 'PDU_A'], ['A7', '1A7G2 - 2F62', '1CE38 - G', 'PDU_A'], ['A7', '1A7G2 - 2F63', '1CE38 - G', 'PDU_A'],
    ['A7', '1A7G2 - 2F64', '1BU43 - G', 'PDU_A1'], ['A7', '1A7G2 - 2F65', '1BU43 - G', 'PDU_A1'], ['A7', '1A7G2 - 2F66', '1BU43 - G', 'PDU_A1'], ['B1', '1B1G1 - 1F28', '1AZ41', 'PDU_B'],
    ['B1', '1B1G1 - 1F29', '1BC41', 'PDU_B'], ['B1', '1B1G1 - 1F30', '1BC37', 'PDU_B'], ['B1', '1B1G1 - 1F31', '1BG41', 'PDU_B'], ['B1', '1B1G1 - 1F32', '1BG40', 'PDU_B'],
    ['B1', '1B1G1 - 1F33', '1BG39', 'PDU_B'], ['B1', '1B1G1 - 1F34', '1BG38', 'PDU_B'], ['B1', '1B1G1 - 1F35', '1BG37', 'PDU_B'], ['B1', '1B1G1 - 1F36', '1BG36', 'PDU_B'],
    ['B1', '1B1G1 - 1F37', '1BJ41', 'PDU_B'], ['B1', '1B1G1 - 1F38', '1BJ40', 'PDU_B'], ['B1', '1B1G1 - 1F39', '1BJ39', 'PDU_B'], ['B1', '1B1G1 - 1F40', '1BJ38', 'PDU_B'],
    ['B1', '1B1G1 - 1F41', '1BN41', 'PDU_B'], ['B1', '1B1G1 - 1F42', '1BN40', 'PDU_B'], ['B1', '1B1G1 - 1F43', '1BN39', 'PDU_B'], ['B1', '1B1G1 - 1F44', '1BN38', 'PDU_B'],
    ['B1', '1B1G1 - 1F45', '1BN37', 'PDU_B'], ['B1', '1B1G1 - 1F46', '1BN36', 'PDU_B'], ['B1', '1B1G1 - 1F47', '1BC43', 'PDU_B'], ['B1', '1B1G2 - 2F27', '1BQ36', 'PDU_B'],
    ['B1', '1B1G2 - 2F28', '1AV38', 'PDU_B'], ['B1', '1B1G2 - 2F29', '1AV37', 'PDU_B'], ['B1', '1B1G2 - 2F30', '1AZ37', 'PDU_B'], ['B1', '1B1G2 - 2F31', '1AV39', 'PDU_B'],
    ['B1', '1B1G2 - 2F32', '1BG36', 'PDU_B'], ['B1', '1B1G2 - 2F33', '1BG37', 'PDU_B'], ['B1', '1B1G2 - 2F34', '1BG37', 'PDU_B'], ['B1', '1B1G2 - 2F35', '1BN42', 'PDU_B'],
    ['B1', '1B1G2 - 2F36', '1BN41', 'PDU_B'], ['B1', '1B1G2 - 2F37', '1BN40', 'PDU_B'], ['B1', '1B1G2 - 2F38', '1BN39', 'PDU_B'], ['B1', '1B1G2 - 2F39', '1BN38', 'PDU_B'],
    ['B1', '1B1G2 - 2F40', '1BN37', 'PDU_B'], ['B1', '1B1G2 - 2F41', '1BN36', 'PDU_B'], ['B1', '1B1G2 - 2F42', '1BQ42', 'PDU_B'], ['B1', '1B1G2 - 2F43', '1BQ41', 'PDU_B'],
    ['B1', '1B1G2 - 2F44', '1BQ40', 'PDU_B'], ['B1', '1B1G2 - 2F45', '1BQ39', 'PDU_B'], ['B1', '1B1G2 - 2F46', '1BQ38', 'PDU_B'], ['B1', '1B1G2 - 2F47', '1BQ37', 'PDU_B'],
    ['B1', '1B1G2 - 2F55', '1BJ41', 'PDU_B'], ['B1', '1B1G2 - 2F56', '1BJ41', 'PDU_B'], ['B1', '1B1G2 - 2F57', '1BJ41', 'PDU_B'], ['B1', '1B1G2 - 2F58', '1BC38', 'PDU_B1'],
    ['B1', '1B1G2 - 2F59', '1BC38', 'PDU_B1'], ['B1', '1B1G2 - 2F60', '1BC38', 'PDU_B1'], ['B2', '1B2G1 - 1F19', '1AS39 - G', 'PDU_B'], ['B2', '1B2G1 - 1F20', '1AS39 - G', 'PDU_B'],
    ['B2', '1B2G1 - 1F21', '1AS39 - G', 'PDU_B'], ['B2', '1B2G1 - 1F22', '1AS39 - G', 'PDU_B'], ['B2', '1B2G1 - 1F23', '1AS39 - G', 'PDU_B'], ['B2', '1B2G1 - 1F24', '1AS39 - G', 'PDU_B'],
    ['B2', '1B2G1 - 1F28', '1AS37', 'PDU_B'], ['B2', '1B2G1 - 1F29', '1AV37 - G', 'PDU_B'], ['B2', '1B2G1 - 1F30', '1AV37 - G', 'PDU_B'], ['B2', '1B2G1 - 1F31', '1AV37 - G', 'PDU_B'],
    ['B2', '1B2G1 - 1F32', '1AV38 - G', 'PDU_B'], ['B2', '1B2G1 - 1F33', '1AV38 - G', 'PDU_B'], ['B2', '1B2G1 - 1F34', '1AV38 - G', 'PDU_B'], ['B2', '1B2G1 - 1F35', '1AS37', 'PDU_B'],
    ['B2', '1B2G1 - 1F36', '1AS37', 'PDU_B'], ['B2', '1B2G1 - 1F37', '1AS37', 'PDU_B'], ['B2', '1B2G1 - 1F38', '1AS38', 'PDU_B'], ['B2', '1B2G1 - 1F39', '1AS38', 'PDU_B'],
    ['B2', '1B2G1 - 1F40', '1AS38', 'PDU_B'], ['B2', '1B2G1 - 1F49', '1AV35 - G', 'PDU_B'], ['B2', '1B2G1 - 1F50', '1AV35 - G', 'PDU_B'], ['B2', '1B2G1 - 1F51', '1AV35 - G', 'PDU_B'],
    ['B2', '1B2G1 - 1F52', '1AV35 - G', 'PDU_B'], ['B2', '1B2G1 - 1F53', '1AV35 - G', 'PDU_B'], ['B2', '1B2G1 - 1F54', '1AV35 - G', 'PDU_B'], ['B2', '1B2G1 - 1F55', '1AS39 - G', 'PDU_B'],
    ['B2', '1B2G1 - 1F56', '1AS39 - G', 'PDU_B'], ['B2', '1B2G1 - 1F57', '1AS39 - G', 'PDU_B'], ['B2', '1B2G1 - 1F58', '1AS41 - G', 'PDU_B'], ['B2', '1B2G1 - 1F59', '1AS41 - G', 'PDU_B'],
    ['B2', '1B2G1 - 1F60', '1AS41 - G', 'PDU_B'], ['B2', '1B2G1 - 1F61', '1AS42 - G', 'PDU_B'], ['B2', '1B2G1 - 1F62', '1AS42 - G', 'PDU_B'], ['B2', '1B2G1 - 1F63', '1AS42 - G', 'PDU_B'],
    ['B2', '1B2G1 - 1F70', '1AT42 - G', 'PDU_B'], ['B2', '1B2G1 - 1F71', '1AT42 - G', 'PDU_B'], ['B2', '1B2G1 - 1F72', '1AT42 - G', 'PDU_B'], ['B2', '1B2G2 - 2F1', '1AZ39', 'PDU_B'],
    ['B2', '1B2G2 - 2F2', '1AS40', 'PDU_B'], ['B2', '1B2G2 - 2F28', '1AV43', 'PDU_B'], ['B2', '1B2G2 - 2F29', '1AV43', 'PDU_B'], ['B2', '1B2G2 - 2F30', '1AV43', 'PDU_B'],
    ['B2', '1B2G2 - 2F31', '1AV42', 'PDU_B'], ['B2', '1B2G2 - 2F32', '1AV42', 'PDU_B'], ['B2', '1B2G2 - 2F33', '1AV42', 'PDU_B'], ['B2', '1B2G2 - 2F34', '1AV41', 'PDU_B'],
    ['B2', '1B2G2 - 2F35', '1AV41', 'PDU_B'], ['B2', '1B2G2 - 2F49', '1AV36 - G', 'PDU_B'], ['B2', '1B2G2 - 2F50', '1AV36 - G', 'PDU_B'], ['B2', '1B2G2 - 2F51', '1AV36 - G', 'PDU_B'],
    ['B2', '1B2G2 - 2F52', '1AV36 - G2', 'PDU_B'], ['B2', '1B2G2 - 2F53', '1AV36 - G3', 'PDU_B'], ['B2', '1B2G2 - 2F54', '1AV36 - G4', 'PDU_B'], ['B2', '1B2G2 - 2F55', '1AS35 - G', 'PDU_B'],
    ['B2', '1B2G2 - 2F56', '1AS35 - G', 'PDU_B'], ['B2', '1B2G2 - 2F57', '1AS35 - G', 'PDU_B'], ['B2', '1B2G2 - 2F58', '1AS36 - G', 'PDU_B'], ['B2', '1B2G2 - 2F59', '1AS36 - G', 'PDU_B'],
    ['B2', '1B2G2 - 2F60', '1AS36 - G', 'PDU_B'], ['B2', '1B2G2 - 2F61', '1AS36 - G2', 'PDU_B'], ['B2', '1B2G2 - 2F62', '1AS36 - G3', 'PDU_B'], ['B2', '1B2G2 - 2F63', '1AS36 - G4', 'PDU_B'],
    ['B2', '1B2G2 - 2F64', '1AV40 - G', 'PDU_B'], ['B2', '1B2G2 - 2F65', '1AV40 - G', 'PDU_B'], ['B2', '1B2G2 - 2F66', '1AV40 - G', 'PDU_B'], ['B2', '1B2G2 - 2F67', '1AU42 - G', 'PDU_B'],
    ['B2', '1B2G2 - 2F68', '1AU42 - G', 'PDU_B'], ['B2', '1B2G2 - 2F69', '1AU42 - G', 'PDU_B'], ['B2', '1B2G2 - 2F70', '1AW42 - G', 'PDU_B'], ['B2', '1B2G2 - 2F71', '1AW42 - G', 'PDU_B'],
    ['B2', '1B2G2 - 2F72', '1AW42 - G', 'PDU_B'], ['B3', '1B3G1 - 1F28', '1AZ57', 'PDU_B'], ['B3', '1B3G1 - 1F29', '1AZ56', 'PDU_B'], ['B3', '1B3G1 - 1F30', '1AZ55', 'PDU_B'],
    ['B3', '1B3G1 - 1F31', '1AZ54', 'PDU_B'], ['B3', '1B3G1 - 1F32', '1AZ53', 'PDU_B'], ['B3', '1B3G1 - 1F33', '1AZ52', 'PDU_B'], ['B3', '1B3G1 - 1F34', '1AZ51', 'PDU_B'],
    ['B3', '1B3G1 - 1F35', '1AZ50 - G', 'PDU_B'], ['B3', '1B3G1 - 1F36', '1AZ50 - G', 'PDU_B'], ['B3', '1B3G1 - 1F37', '1AZ50 - G', 'PDU_B'], ['B3', '1B3G1 - 1F38', '1BC50 - G', 'PDU_B'],
    ['B3', '1B3G1 - 1F39', '1BC50 - G', 'PDU_B'], ['B3', '1B3G1 - 1F40', '1BC50 - G', 'PDU_B'], ['B3', '1B3G1 - 1F41', '1AS50 - G', 'PDU_B'], ['B3', '1B3G1 - 1F42', '1AS50 - G', 'PDU_B'],
    ['B3', '1B3G1 - 1F43', '1AS50 - G', 'PDU_B'], ['B3', '1B3G1 - 1F44', '1AS51 - G', 'PDU_B'], ['B3', '1B3G1 - 1F45', '1AS51 - G', 'PDU_B'], ['B3', '1B3G1 - 1F46', '1AS51 - G', 'PDU_B'],
    ['B3', '1B3G1 - 1F55', '1AZ54 - G', 'PDU_B1'], ['B3', '1B3G1 - 1F56', '1AZ54 - G', 'PDU_B1'], ['B3', '1B3G1 - 1F57', '1AZ54 - G', 'PDU_B1'], ['B3', '1B3G1 - 1F58', '1AZ55 - G', 'PDU_B1'],
    ['B3', '1B3G1 - 1F59', '1AZ55 - G', 'PDU_B1'], ['B3', '1B3G1 - 1F60', '1AZ55 - G', 'PDU_B1'], ['B3', '1B3G1 - 1F61', '1AZ56 - G', 'PDU_B1'], ['B3', '1B3G1 - 1F62', '1AZ56 - G', 'PDU_B1'],
    ['B3', '1B3G1 - 1F63', '1AZ56 - G', 'PDU_B1'], ['B3', '1B3G1 - 1F64', '1AV54 - G', 'PDU_B'], ['B3', '1B3G1 - 1F65', '1AV54 - G', 'PDU_B'], ['B3', '1B3G1 - 1F66', '1AV54 - G', 'PDU_B'],
    ['B3', '1B3G2 - 2F28', '1AS49', 'PDU_B'], ['B3', '1B3G2 - 2F29', '1AS49', 'PDU_B'], ['B3', '1B3G2 - 2F30', '1AS49', 'PDU_B'], ['B3', '1B3G2 - 2F31', '1AV51', 'PDU_B'],
    ['B3', '1B3G2 - 2F32', '1AV51', 'PDU_B'], ['B3', '1B3G2 - 2F33', '1AV51', 'PDU_B'], ['B3', '1B3G2 - 2F34', '1AV49', 'PDU_B'], ['B3', '1B3G2 - 2F35', '1AV49', 'PDU_B'],
    ['B3', '1B3G2 - 2F36', '1AV50', 'PDU_B'], ['B3', '1B3G2 - 2F37', '1AV50', 'PDU_B'], ['B3', '1B3G2 - 2F38', '1AS54', 'PDU_B'], ['B3', '1B3G2 - 2F39', '1AS54', 'PDU_B'],
    ['B3', '1B3G2 - 2F40', '1AS54', 'PDU_B'], ['B3', '1B3G2 - 2F41', '1AS55', 'PDU_B'], ['B3', '1B3G2 - 2F42', '1AS55', 'PDU_B'], ['B3', '1B3G2 - 2F43', '1AS55', 'PDU_B'],
    ['B3', '1B3G2 - 2F44', '1AV53', 'PDU_B'], ['B3', '1B3G2 - 2F45', '1AV53', 'PDU_B'], ['B3', '1B3G2 - 2F46', '1AS57', 'PDU_B'], ['B3', '1B3G2 - 2F47', '1AV56', 'PDU_B'],
    ['B3', '1B3G2 - 2F48', '1AV56', 'PDU_B'], ['B3', '1B3G2 - 2F55', '1AS56 - G', 'PDU_B'], ['B3', '1B3G2 - 2F56', '1AS56 - G', 'PDU_B'], ['B3', '1B3G2 - 2F57', '1AS56 - G', 'PDU_B'],
    ['B3', '1B3G2 - 2F58', '1AS57 - G', 'PDU_B'], ['B3', '1B3G2 - 2F59', '1AS57 - G', 'PDU_B'], ['B3', '1B3G2 - 2F60', '1AS57 - G', 'PDU_B'], ['B3', '1B3G2 - 2F61', '1AS52 - G', 'PDU_B'],
    ['B3', '1B3G2 - 2F62', '1AS52 - G', 'PDU_B'], ['B3', '1B3G2 - 2F63', '1AS52 - G', 'PDU_B'], ['B3', '1B3G2 - 2F64', '1AS53 - G', 'PDU_B'], ['B3', '1B3G2 - 2F65', '1AS53 - G', 'PDU_B'],
    ['B3', '1B3G2 - 2F66', '1AS53 - G', 'PDU_B'], ['B4', '1B4G1 - 1F28', '1BN51', 'PDU_B'], ['B4', '1B4G1 - 1F29', '1BN52', 'PDU_B'], ['B4', '1B4G1 - 1F30', '1BN53', 'PDU_B'],
    ['B4', '1B4G1 - 1F31', '1BN54', 'PDU_B'], ['B4', '1B4G1 - 1F32', '1BN55', 'PDU_B'], ['B4', '1B4G1 - 1F33', '1BN56', 'PDU_B'], ['B4', '1B4G1 - 1F34', '1BN57', 'PDU_B'],
    ['B4', '1B4G1 - 1F35', '1BJ51', 'PDU_B'], ['B4', '1B4G1 - 1F36', '1BJ52', 'PDU_B'], ['B4', '1B4G1 - 1F37', '1BJ53', 'PDU_B'], ['B4', '1B4G1 - 1F38', '1BJ54', 'PDU_B'],
    ['B4', '1B4G1 - 1F39', '1BJ55', 'PDU_B'], ['B4', '1B4G1 - 1F40', '1BJ56', 'PDU_B'], ['B4', '1B4G1 - 1F41', '1BJ57', 'PDU_B'], ['B4', '1B4G1 - 1F42', '1BG51', 'PDU_B'],
    ['B4', '1B4G1 - 1F43', '1BG52', 'PDU_B'], ['B4', '1B4G1 - 1F44', '1BG53', 'PDU_B'], ['B4', '1B4G1 - 1F45', '1BG54', 'PDU_B'], ['B4', '1B4G1 - 1F46', '1BG55', 'PDU_B'],
    ['B4', '1B4G1 - 1F47', '1BG56', 'PDU_B'], ['B4', '1B4G1 - 1F48', '1BG57', 'PDU_B'], ['B4', '1B4G1 - 1F55', '1AV57', 'PDU_B'], ['B4', '1B4G1 - 1F56', '1AV57', 'PDU_B'],
    ['B4', '1B4G1 - 1F57', '1AV57', 'PDU_B'], ['B4', '1B4G1 - 1F58', '1AV58', 'PDU_B'], ['B4', '1B4G1 - 1F59', '1AV58', 'PDU_B'], ['B4', '1B4G1 - 1F60', '1AV58', 'PDU_B'],
    ['B4', '1B4G2 - 2F28', '1BC51', 'PDU_B'], ['B4', '1B4G2 - 2F29', '1BC52', 'PDU_B'], ['B4', '1B4G2 - 2F30', '1BC53', 'PDU_B'], ['B4', '1B4G2 - 2F31', '1BC54', 'PDU_B'],
    ['B4', '1B4G2 - 2F32', '1BC55', 'PDU_B'], ['B4', '1B4G2 - 2F33', '1BC56', 'PDU_B'], ['B4', '1B4G2 - 2F34', '1BC57', 'PDU_B'], ['B4', '1B4G2 - 2F35', '1AV55', 'PDU_B'],
    ['B4', '1B4G2 - 2F36', '1BC54', 'PDU_B'], ['B4', '1B4G2 - 2F37', '1AV55', 'PDU_B'], ['B4', '1B4G2 - 2F38', '1BG53', 'PDU_B'], ['B4', '1B4G2 - 2F39', '1BG54', 'PDU_B'],
    ['B4', '1B4G2 - 2F40', '1BG55', 'PDU_B'], ['B4', '1B4G2 - 2F41', '1BG56', 'PDU_B'], ['B4', '1B4G2 - 2F42', '1BG57', 'PDU_B'], ['B4', '1B4G2 - 2F43', '1BJ43', 'PDU_B'],
    ['B4', '1B4G2 - 2F44', '1BC54', 'PDU_B1'], ['B4', '1B4G2 - 2F45', '1BC54', 'PDU_B1'], ['B4', '1B4G2 - 2F46', '1BC54', 'PDU_B1'], ['B4', '1B4G2 - 2F55', '1BJ51 - G', 'PDU_B'],
    ['B4', '1B4G2 - 2F56', '1BJ51 - G', 'PDU_B'], ['B4', '1B4G2 - 2F57', '1BJ51 - G', 'PDU_B'], ['B4', '1B4G2 - 2F58', '1BJ52 - G', 'PDU_B'], ['B4', '1B4G2 - 2F59', '1BJ52 - G', 'PDU_B'],
    ['B4', '1B4G2 - 2F60', '1BJ52 - G', 'PDU_B'], ['B4', '1B4G2 - 2F61', '1BC52 - G', 'PDU_B1'], ['B4', '1B4G2 - 2F62', '1BC52 - G', 'PDU_B1'], ['B4', '1B4G2 - 2F63', '1BC52 - G', 'PDU_B1'],
    ['B4', '1B4G2 - 2F64', '1BC53 - G', 'PDU_B1'], ['B4', '1B4G2 - 2F65', '1BC53 - G', 'PDU_B1'], ['B4', '1B4G2 - 2F66', '1BC53 - G', 'PDU_B1'], ['B5', '1B5G1 - 1F28', '1BQ51', 'PDU_B'],
    ['B5', '1B5G1 - 1F29', '1BQ51', 'PDU_B'], ['B5', '1B5G1 - 1F30', '1BQ53', 'PDU_B'], ['B5', '1B5G1 - 1F31', '1BQ55', 'PDU_B'], ['B5', '1B5G1 - 1F32', '1BQ55', 'PDU_B'],
    ['B5', '1B5G1 - 1F33', '1BQ56', 'PDU_B'], ['B5', '1B5G1 - 1F34', '1BQ57', 'PDU_B'], ['B5', '1B5G1 - 1F35', '1BQ57', 'PDU_B'], ['B5', '1B5G1 - 1F38', '1BX40 - G', 'PDU_B'],
    ['B5', '1B5G1 - 1F39', '1BX40 - G', 'PDU_B'], ['B5', '1B5G1 - 1F40', '1BX40 - G', 'PDU_B'], ['B5', '1B5G1 - 1F41', '1BG43', 'PDU_B'], ['B5', '1B5G1 - 1F42', '1BG50', 'PDU_B'],
    ['B5', '1B5G1 - 1F55', '1BQ52 - G', 'PDU_B'], ['B5', '1B5G1 - 1F56', '1BQ52 - G', 'PDU_B'], ['B5', '1B5G1 - 1F57', '1BQ52 - G', 'PDU_B'], ['B5', '1B5G2 - 2F28', '1BX50', 'PDU_B'],
    ['B5', '1B5G2 - 2F29', '1BX51', 'PDU_B'], ['B5', '1B5G2 - 2F30', '1BX52', 'PDU_B'], ['B5', '1B5G2 - 2F31', '1BX53', 'PDU_B'], ['B5', '1B5G2 - 2F32', '1BX54', 'PDU_B'],
    ['B5', '1B5G2 - 2F33', '1BQ50', 'PDU_B'], ['B5', '1B5G2 - 2F34', '1BN50', 'PDU_B'], ['B5', '1B5G2 - 2F35', '1BJ50', 'PDU_B'], ['B5', '1B5G2 - 2F36', '1BG50', 'PDU_B'],
    ['B5', '1B5G2 - 2F37', '1BX41 - G', 'PDU_B1'], ['B5', '1B5G2 - 2F38', '1BX41 - G', 'PDU_B1'], ['B5', '1B5G2 - 2F39', '1BX41 - G', 'PDU_B1'], ['B5', '1B5G2 - 2F40', '1BX42 - G', 'PDU_B1'],
    ['B5', '1B5G2 - 2F41', '1BX42 - G', 'PDU_B1'], ['B5', '1B5G2 - 2F42', '1BX42 - G', 'PDU_B1'], ['B5', '1B5G2 - 2F43', '1AZ43', 'PDU_B'], ['B5', '1B5G2 - 2F55', '1BQ54 - G', 'PDU_B'],
    ['B5', '1B5G2 - 2F56', '1BQ54 - G', 'PDU_B'], ['B5', '1B5G2 - 2F57', '1BQ54 - G', 'PDU_B'], ['B5', '1B5G2 - 2F58', '1BN54 - G', 'PDU_B'], ['B5', '1B5G2 - 2F59', '1BN54 - G', 'PDU_B'],
    ['B5', '1B5G2 - 2F60', '1BN54 - G', 'PDU_B'], ['B6', '1B6G1 - 1F25', '1CE50', 'PDU_B'], ['B6', '1B6G1 - 1F26', '1CB50', 'PDU_B'], ['B6', '1B6G1 - 1F27', '1BQ43', 'PDU_B'],
    ['B6', '1B6G1 - 1F28', '1CB57', 'PDU_B'], ['B6', '1B6G1 - 1F29', '1CB56', 'PDU_B'], ['B6', '1B6G1 - 1F30', '1CB55', 'PDU_B'], ['B6', '1B6G1 - 1F31', '1CB54', 'PDU_B'],
    ['B6', '1B6G1 - 1F32', '1CB53', 'PDU_B'], ['B6', '1B6G1 - 1F33', '1CB52', 'PDU_B'], ['B6', '1B6G1 - 1F34', '1CB51', 'PDU_B'], ['B6', '1B6G1 - 1F35', '1CE51', 'PDU_B'],
    ['B6', '1B6G1 - 1F36', '1CE52', 'PDU_B'], ['B6', '1B6G1 - 1F37', '1CE53', 'PDU_B'], ['B6', '1B6G1 - 1F38', '1CE54', 'PDU_B'], ['B6', '1B6G1 - 1F39', '1CE55', 'PDU_B'],
    ['B6', '1B6G1 - 1F40', '1CE56', 'PDU_B'], ['B6', '1B6G1 - 1F41', '1CE57', 'PDU_B'], ['B6', '1B6G1 - 1F42', '1CE51', 'PDU_B'], ['B6', '1B6G1 - 1F43', '1CB50', 'PDU_B'],
    ['B6', '1B6G1 - 1F44', '1CB43-G', 'PDU_B1'], ['B6', '1B6G1 - 1F45', '1CB43-G', 'PDU_B1'], ['B6', '1B6G1 - 1F46', '1CB43-G', 'PDU_B1'], ['B6', '1B6G1 - 1F47', '1BU43', 'PDU_B'],
    ['B6', '1B6G1 - 1F48', '1BX43', 'PDU_B'], ['B6', '1B6G2 - 2F1', '1CE50', 'PDU_B'], ['B6', '1B6G2 - 2F2', '1BU50', 'PDU_B'], ['B6', '1B6G2 - 2F3', '1BQ50', 'PDU_B'],
    ['B6', '1B6G2 - 2F4', '1BN50', 'PDU_B'], ['B6', '1B6G2 - 2F5', '1BJ50', 'PDU_B'], ['B6', '1B6G2 - 2F6', '1BG50', 'PDU_B'], ['B6', '1B6G2 - 2F7', '1BC50', 'PDU_B'],
    ['B6', '1B6G2 - 2F8', '1AZ50', 'PDU_B'], ['B6', '1B6G2 - 2F28', '1BX51', 'PDU_B'], ['B6', '1B6G2 - 2F29', '1BX52', 'PDU_B'], ['B6', '1B6G2 - 2F30', '1BX53', 'PDU_B'],
    ['B6', '1B6G2 - 2F31', '1BX54', 'PDU_B'], ['B6', '1B6G2 - 2F32', '1BX55', 'PDU_B'], ['B6', '1B6G2 - 2F33', '1BX56', 'PDU_B'], ['B6', '1B6G2 - 2F34', '1BX57', 'PDU_B'],
    ['B6', '1B6G2 - 2F35', '1BU51', 'PDU_B'], ['B6', '1B6G2 - 2F36', '1BU52', 'PDU_B'], ['B6', '1B6G2 - 2F37', '1BU53', 'PDU_B'], ['B6', '1B6G2 - 2F38', '1BU54', 'PDU_B'],
    ['B6', '1B6G2 - 2F39', '1BU55', 'PDU_B'], ['B6', '1B6G2 - 2F40', '1BU56', 'PDU_B'], ['B6', '1B6G2 - 2F41', '1BU57', 'PDU_B'], ['B6', '1B6G2 - 2F42', '1BJ50', 'PDU_B'],
    ['B6', '1B6G2 - 2F43', '1AZ50', 'PDU_B1'], ['B6', '1B6G2 - 2F55', '1BN51 - G', 'PDU_B1'], ['B6', '1B6G2 - 2F56', '1BN51 - G', 'PDU_B1'], ['B6', '1B6G2 - 2F57', '1BN51 - G', 'PDU_B1'],
    ['B6', '1B6G2 - 2F58', '1BN52 - G', 'PDU_B1'], ['B6', '1B6G2 - 2F59', '1BN52 - G', 'PDU_B1'], ['B6', '1B6G2 - 2F60', '1BN52 - G', 'PDU_B1'], ['B6', '1B6G2 - 2F61', '1BN53 - G', 'PDU_B'],
    ['B6', '1B6G2 - 2F62', '1BN53 - G', 'PDU_B'], ['B6', '1B6G2 - 2F63', '1BN53 - G', 'PDU_B'], ['B7', '1B7G1 - 1F22', '1CE37 - G', 'PDU_B'], ['B7', '1B7G1 - 1F23', '1CE37 - G', 'PDU_B'],
    ['B7', '1B7G1 - 1F24', '1CE37 - G', 'PDU_B'], ['B7', '1B7G1 - 1F25', '1CE36 - G', 'PDU_B'], ['B7', '1B7G1 - 1F26', '1CE36 - G', 'PDU_B'], ['B7', '1B7G1 - 1F27', '1CE36 - G', 'PDU_B'],
    ['B7', '1B7G1 - 1F28', '1BJ37', 'PDU_B'], ['B7', '1B7G1 - 1F29', '1BJ36', 'PDU_B'], ['B7', '1B7G1 - 1F30', '1BJ42', 'PDU_B'], ['B7', '1B7G1 - 1F31', '1AZ38', 'PDU_B'],
    ['B7', '1B7G1 - 1F32', '1BC39', 'PDU_B'], ['B7', '1B7G1 - 1F33', '1BC38', 'PDU_B'], ['B7', '1B7G1 - 1F34', '1BG42', 'PDU_B'], ['B7', '1B7G1 - 1F35', '1BN42', 'PDU_B'],
    ['B7', '1B7G1 - 1F36', '1BQ42', 'PDU_B'], ['B7', '1B7G1 - 1F37', '1BU42', 'PDU_B'], ['B7', '1B7G1 - 1F38', '1BX42', 'PDU_B'], ['B7', '1B7G1 - 1F39', '1BQ41', 'PDU_B'],
    ['B7', '1B7G1 - 1F40', '1BQ40', 'PDU_B'], ['B7', '1B7G1 - 1F41', '1BQ39', 'PDU_B'], ['B7', '1B7G1 - 1F42', '1BQ38', 'PDU_B'], ['B7', '1B7G1 - 1F43', '1BQ37', 'PDU_B'],
    ['B7', '1B7G1 - 1F44', '1BQ36', 'PDU_B'], ['B7', '1B7G1 - 1F45', '1BU41', 'PDU_B'], ['B7', '1B7G1 - 1F46', '1BU40', 'PDU_B'], ['B7', '1B7G1 - 1F47', '1BU39', 'PDU_B'],
    ['B7', '1B7G1 - 1F48', '1BU38', 'PDU_B'], ['B7', '1B7G1 - 1F55', '1CE41 - G', 'PDU_B'], ['B7', '1B7G1 - 1F56', '1CE41 - G', 'PDU_B'], ['B7', '1B7G1 - 1F57', '1CE41 - G', 'PDU_B'],
    ['B7', '1B7G1 - 1F58', '1BN43 - G', 'PDU_B'], ['B7', '1B7G1 - 1F59', '1BN43 - G', 'PDU_B'], ['B7', '1B7G1 - 1F60', '1BN43 - G', 'PDU_B'], ['B7', '1B7G1 - 1F61', '1CE40 - G', 'PDU_B'],
    ['B7', '1B7G1 - 1F62', '1CE40 - G', 'PDU_B'], ['B7', '1B7G1 - 1F63', '1CE40 - G', 'PDU_B'], ['B7', '1B7G1 - 1F64', '1CE40 - G1', 'PDU_B'], ['B7', '1B7G1 - 1F65', '1CE40 - G1', 'PDU_B'],
    ['B7', '1B7G1 - 1F66', '1CE40 - G1', 'PDU_B'], ['B7', '1B7G2 - 2F1', '1CB43', 'PDU_B'], ['B7', '1B7G2 - 2F2', '1BX43', 'PDU_B'], ['B7', '1B7G2 - 2F3', '1CE43', 'PDU_B'],
    ['B7', '1B7G2 - 2F5', '1BQ43', 'PDU_B'], ['B7', '1B7G2 - 2F6', '1BU43', 'PDU_B'], ['B7', '1B7G2 - 2F7', '1BJ43', 'PDU_B'], ['B7', '1B7G2 - 2F8', '1BG43', 'PDU_B'],
    ['B7', '1B7G2 - 2F9', '1BC43', 'PDU_B'], ['B7', '1B7G2 - 2F10', '1AZ43', 'PDU_B'], ['B7', '1B7G2 - 2F21', '1CB36', 'PDU_B'], ['B7', '1B7G2 - 2F22', '1BU42 - G', 'PDU_B1'],
    ['B7', '1B7G2 - 2F23', '1BU42 - G', 'PDU_B1'], ['B7', '1B7G2 - 2F24', '1BU42 - G', 'PDU_B1'], ['B7', '1B7G2 - 2F27', '1BU37', 'PDU_B'], ['B7', '1B7G2 - 2F28', '1BU36', 'PDU_B'],
    ['B7', '1B7G2 - 2F29', '1BX41', 'PDU_B'], ['B7', '1B7G2 - 2F30', '1CB42', 'PDU_B'], ['B7', '1B7G2 - 2F31', '1BX39', 'PDU_B'], ['B7', '1B7G2 - 2F32', '1BX38', 'PDU_B'],
    ['B7', '1B7G2 - 2F33', '1BX37', 'PDU_B'], ['B7', '1B7G2 - 2F34', '1BX36', 'PDU_B'], ['B7', '1B7G2 - 2F35', '1CB42', 'PDU_B1'], ['B7', '1B7G2 - 2F36', '1CB41', 'PDU_B'],
    ['B7', '1B7G2 - 2F37', '1CB40', 'PDU_B'], ['B7', '1B7G2 - 2F38', '1CB39', 'PDU_B'], ['B7', '1B7G2 - 2F39', '1CB38', 'PDU_B'], ['B7', '1B7G2 - 2F40', '1CB37', 'PDU_B'],
    ['B7', '1B7G2 - 2F41', '1CB36', 'PDU_B'], ['B7', '1B7G2 - 2F42', '1CE42', 'PDU_B'], ['B7', '1B7G2 - 2F43', '1CE43', 'PDU_B'], ['B7', '1B7G2 - 2F44', '1CE43', 'PDU_B'],
    ['B7', '1B7G2 - 2F45', '1CB43', 'PDU_B'], ['B7', '1B7G2 - 2F46', '1CB41', 'PDU_B'], ['B7', '1B7G2 - 2F47', '1CB40', 'PDU_B'], ['B7', '1B7G2 - 2F48', '1CB39', 'PDU_B'],
    ['B7', '1B7G2 - 2F55', '1CE39 - G', 'PDU_B'], ['B7', '1B7G2 - 2F56', '1CE39 - G', 'PDU_B'], ['B7', '1B7G2 - 2F57', '1CE39 - G', 'PDU_B'], ['B7', '1B7G2 - 2F58', '1CE39 - G1', 'PDU_B'],
    ['B7', '1B7G2 - 2F59', '1CE39 - G1', 'PDU_B'], ['B7', '1B7G2 - 2F60', '1CE39 - G', 'PDU_B'], ['B7', '1B7G2 - 2F61', '1CE38 - G', 'PDU_B'], ['B7', '1B7G2 - 2F62', '1CE38 - G', 'PDU_B'],
    ['B7', '1B7G2 - 2F63', '1CE38 - G', 'PDU_B'], ['B7', '1B7G2 - 2F64', '1BU43 - G', 'PDU_B1'], ['B7', '1B7G2 - 2F65', '1BU43 - G', 'PDU_B1'], ['B7', '1B7G2 - 2F66', '1BU43 - G', 'PDU_B1']
  ];

  const ROWS = CTD_ROWS.map((r, i) => ({
    id: i + 1, flr: CTD_META.flr, hal: CTD_META.hal,
    src_pan: r[0] + ' SDP PANOSU', src_fus: r[1], tgt_cab: r[2], tgt_pdu: r[3],
    wrk_dat: CTD_META.wrk_dat, wrk_per: CTD_META.wrk_per
  }));
  const cabCode = tgt => String(tgt || '').split(' ')[0];
  const sdpCode = pan => String(pan || '').split(' ')[0];
  const sideOfPdu = pdu => String(pdu || '').replace(/^PDU_?/i, '').charAt(0).toUpperCase() || 'A';

  // Kabin|PDU → besleyen devreler (tüm SDP'ler)
  const byPdu = {};
  ROWS.forEach(r => { const k = cabCode(r.tgt_cab) + '|' + r.tgt_pdu; (byPdu[k] = byPdu[k] || []).push(r); });
  const pdusOf = (code, side) => Object.keys(byPdu).filter(k => k.split('|')[0] === code && sideOfPdu(k.split('|')[1]) === side).map(k => k.split('|')[1]).sort();

  // Tohumlu dalgalanma çarpanı
  function jit(key, tick, amp) {
    return 1 + (rngOf(key + '#' + tick)() - 0.5) * 2 * (amp == null ? 0.015 : amp);
  }
  function loadStatus(load, lost) {
    if (lost) return { status: 'alarm', reason: 'Faz kaybı' };
    if (load >= LOAD_CRIT) return { status: 'alarm', reason: 'Aşırı yük' };
    if (load >= LOAD_WARN) return { status: 'warning', reason: 'Yüksek yük' };
    return { status: 'normal', reason: 'Normal' };
  }
  const RANK = { normal: 0, unknown: 1, lost: 1, warning: 2, alarm: 3 };
  const worst = list => list.reduce((w, s) => (RANK[s] > RANK[w] ? s : w), 'normal');

  // ---------------------------------------------------------------------------
  // Sigorta devresi (CTD satırı) — statik taban değerler
  // ---------------------------------------------------------------------------
  const circuitCache = {};
  function circuitBase(row) {
    if (circuitCache[row.id]) return circuitCache[row.id];
    const code = cabCode(row.tgt_cab);
    const side = sideOfPdu(row.tgt_pdu);
    const list = byPdu[code + '|' + row.tgt_pdu] || [row];
    const idx = list.indexOf(row);
    const n = list.length;
    const cab = D.findCabinet(code);
    const pduCount = Math.max(1, pdusOf(code, side).length);
    const rnd = rngOf('ctd-' + row.id);

    // PDU tarafı toplam akımı (A). Yerleşimde olmayan kabinler (1AR42 vb.) için tohumlu değer.
    let S = cab ? (side === 'A' ? cab.pduA : cab.pduB) : between(rngOf('ctd-cab-' + code + side), 7.5, 15.5);
    if (cab && cab.pduFault) S = cab.currentA / 2; // failover mock: faz kaybında taban her iki taraf yarı yük
    S /= pduCount;

    // Devre payları: 3 devre → faz payları (failover basePhases ile aynı tohum)
    let sh;
    if (n === 3) {
      const pr = rngOf(code + '-phase');
      sh = [between(pr, 0.3, 0.37), between(pr, 0.3, 0.37), between(pr, 0.3, 0.37)];
      if (code === '1CB52') sh = [0.38, 0.32, 0.30];
    } else {
      const pr = rngOf(code + '|' + row.tgt_pdu + '-share');
      sh = list.map(() => between(pr, 0.85, 1.15));
    }
    const tot = sh.reduce((a, b) => a + b, 0);
    sh = sh.map(x => x / tot);

    let I = S * sh[idx];
    let lost = false;
    let note = '';
    if (cab && cab.pduFault && n === 3 && idx === 1) {
      // Senaryo 1AV42: PDU-B L2 faz kaybı → L2 yükü PDU-A'ya biner
      if (side === 'B') { I = 0; lost = true; note = 'PDU-B L2 faz kaybı (0 V)'; }
      else { I += S * sh[1] * 1.12; note = 'L2 yükü B yolundan aktarıldı'; }
    }
    const fno = parseInt((String(row.src_fus).match(/F(\d+)$/) || [])[1] || '1', 10);
    const phase = n === 3 ? idx + 1 : ((fno - 1) % 3) + 1;
    let rating = n === 1 ? 32 : 16;
    if (code === '1CB52') { rating = 20; note = 'Yüksek akım (C20 sigorta)'; }

    const base = {
      row, code, side, pdu: row.tgt_pdu, idx, n, phase, rating, lost, note,
      I, V: between(rnd, 228.6, 231.4), pf: between(rnd, 0.95, 0.985),
      gir: parseInt((String(row.src_fus).match(/G(\d)/) || [])[1] || '1', 10)
    };
    circuitCache[row.id] = base;
    return base;
  }

  function circuit(row, tick) {
    const b = circuitBase(row);
    const I = b.lost ? 0 : b.I * jit('c' + row.id, tick);
    const V = b.lost ? 0 : b.V * jit('v' + row.id, tick, 0.002);
    const load = (I / b.rating) * 100;
    const st = loadStatus(load, b.lost);
    return {
      kind: 'circuit', phases: 1, phase: 'L' + b.phase, I: [I], V: [V], Iavg: I, Imax: I, Vavg: V,
      P: (V * I * b.pf) / 1000, pf: b.pf, rating: b.rating, load, status: st.status, reason: b.lost ? 'Faz kaybı' : st.reason,
      lost: b.lost, note: b.note, code: b.code, side: b.side, pdu: b.pdu, gir: b.gir, row
    };
  }

  // PDU (kabin + tgt_pdu) — besleyen tüm devrelerin toplamı
  function pdu(code, pduName, tick) {
    const list = byPdu[code + '|' + pduName] || [];
    const cs = list.map(r => circuit(r, tick));
    const I = cs.reduce((s, c) => s + c.Iavg, 0);
    const live = cs.filter(c => !c.lost);
    const V = live.length ? live.reduce((s, c) => s + c.Vavg, 0) / live.length : 0;
    const P = cs.reduce((s, c) => s + c.P, 0);
    const load = cs.reduce((m, c) => Math.max(m, c.load), 0);
    const side = sideOfPdu(pduName);
    const sc = D.pdu && D.pdu.scenario ? D.pdu.scenario[code + '_' + side] : null;
    const lost = cs.some(c => c.lost);
    const status = worst(cs.map(c => c.status));
    return {
      kind: 'pdu', phases: cs.length, circuits: cs, I: cs.map(c => c.Iavg), V: cs.map(c => c.Vavg),
      Iavg: I, Imax: cs.reduce((m, c) => Math.max(m, c.Iavg), 0), Vavg: V, P, pf: cs.length ? cs[0].pf : 0.97,
      rating: cs.length ? cs[0].rating : 32, load, status, lost,
      reason: lost ? 'Faz kaybı' : loadStatus(load, false).reason,
      note: (sc && sc.note) || (cs.find(c => c.note) || {}).note || '', code, side, pdu: pduName
    };
  }

  // ---------------------------------------------------------------------------
  // Üç fazlı toplayıcılar (RPP / SDP / UPS / ADP / Trafo)
  // ---------------------------------------------------------------------------
  function threePhase(kind, I, V, pf, rating, extra) {
    const Iavg = (I[0] + I[1] + I[2]) / 3;
    const Imax = Math.max(I[0], I[1], I[2]);
    const Vavg = (V[0] + V[1] + V[2]) / 3;
    const load = rating ? (Imax / rating) * 100 : 0;
    const st = loadStatus(load, false);
    return Object.assign({ kind, phases: 3, I, V, Iavg, Imax, Vavg, pf, P: (Vavg * (I[0] + I[1] + I[2]) * pf) / 1000, rating, load, status: st.status, reason: st.reason, lost: false, note: '' }, extra || {});
  }

  function sdpReportUnit(code, gir) {
    const R = D.reports && D.reports.sdp;
    if (!R || !R.units) return null;
    return R.units('CMR/T00').find(u => u.id === code + '_UPS_GIR' + gir) || null;
  }
  const rowsOfSdp = code => ROWS.filter(r => sdpCode(r.src_pan) === code);

  // RPP / Giriş barası: sdp = 'A1', gir = 1|2
  function rpp(code, gir, tick) {
    const u = sdpReportUnit(code, gir);
    let I, V, pf;
    if (u) {
      I = u.I.map((x, i) => x * jit('rpp' + code + gir + i, tick));
      V = u.V.map((x, i) => x * jit('rppv' + code + gir + i, tick, 0.002));
      pf = u.pf;
    } else {
      // Yedek: devrelerin faz toplamları
      I = [0, 0, 0]; V = [230, 230, 230]; pf = 0.97;
      rowsOfSdp(code).forEach(r => { const c = circuit(r, tick); if (c.gir === gir) I[parseInt(c.phase.slice(1), 10) - 1] += c.Iavg; });
    }
    return threePhase('rpp', I, V, pf, RPP_RATED_A, { code, gir });
  }

  function sdp(code, tick) {
    const a = rpp(code, 1, tick);
    const b = rpp(code, 2, tick);
    const I = [0, 1, 2].map(i => a.I[i] + b.I[i]);
    const V = [0, 1, 2].map(i => (a.V[i] + b.V[i]) / 2);
    return threePhase('sdp', I, V, (a.pf + b.pf) / 2, SDP_RATED_A, { code });
  }

  const pointVal = (eq, label) => { const p = eq && eq.points ? eq.points.find(x => x.label === label) : null; return p ? p.value : null; };

  function ups(code, tick) {
    const eq = D.findEquipment('UPS ' + code);
    const lostCom = !!eq && eq.status === 'lost';
    const battery = pointVal(eq, 'Çalışma Modu') === 'AKÜ';
    const baseLoad = eq && eq.load != null ? eq.load : 50;
    const load = baseLoad * jit('ups' + code, tick, 0.01);
    const outKw = (load / 100) * UPS_RATED_KW;
    const pf = 0.96;
    const Iout = (outKw * 1000) / (SQRT3 * 400 * pf);
    const shares = [0, 1, 2].map(i => between(rngOf('ups-ph-' + code + i), 0.97, 1.03));
    const I = shares.map((s, i) => Iout * s * jit('upsI' + code + i, tick, 0.006));
    const vOut = pointVal(eq, 'Çıkış Gerilimi (L1)') || 230;
    const V = [0, 1, 2].map(i => vOut * jit('upsV' + code + i, tick, 0.002));
    const vIn = battery ? 0 : (pointVal(eq, 'Giriş Gerilimi (L1)') || 229);
    const Iin = battery ? [0, 0, 0] : I.map(x => x * 1.045); // verim ≈ %95,7
    // Kapasite oranı UPS yük oranıdır (anma çıkış akımına göre)
    const res = threePhase('ups', I, V, pf, 0, { code });
    res.load = load;
    const st = loadStatus(load, false);
    res.status = lostCom ? 'lost' : eq ? (eq.status === 'normal' ? st.status : eq.status) : st.status;
    res.reason = lostCom ? 'Haberleşme kaybı' : battery ? 'Akü modunda' : eq && eq.note ? eq.note : st.reason;
    res.note = eq ? eq.note : '';
    res.lostCom = lostCom;
    res.battery = battery;
    res.mode = lostCom ? '—' : battery ? 'AKÜ' : 'ONLINE (ŞEBEKE)';
    res.inputV = vIn * (battery ? 0 : jit('upsVin' + code, tick, 0.002));
    res.inputI = Iin;
    res.batteryPct = pointVal(eq, 'Akü Kapasitesi');
    res.batteryMin = pointVal(eq, 'Kalan Akü Süresi');
    res.batteryTemp = pointVal(eq, 'Akü Sıcaklığı');
    res.ratedKw = UPS_RATED_KW;
    // ADP → UPS giriş hattının durumu
    res.input = battery ? { status: 'alarm', reason: 'Giriş yok — akü modu', lost: true }
      : lostCom ? { status: 'unknown', reason: 'Veri alınamıyor', lost: false }
        : { status: st.status, reason: st.reason, lost: false };
    if (lostCom) { res.I = [0, 0, 0]; res.Iavg = res.Imax = 0; res.P = 0; }
    return res;
  }

  // ADP / Trafo eşlemesi (sunum varsayımı)
  const UPSTREAM = [
    { side: 'A', adp: 'ADP-A1', trafo: 'A_TRAFO3_Q1', ups: ['A1', 'A2', 'A3', 'A4'] },
    { side: 'A', adp: 'ADP-A2', trafo: 'A_TRAFO4_Q2', ups: ['A5', 'A6', 'A7'] },
    { side: 'B', adp: 'ADP-B1', trafo: 'B_TRAFO1_Q3', ups: ['B1', 'B2', 'B3', 'B4'] },
    { side: 'B', adp: 'ADP-B2', trafo: 'B_TRAFO2_Q4', ups: ['B5', 'B6', 'B7'] }
  ];
  const upstreamOf = code => UPSTREAM.find(u => u.ups.indexOf(code) >= 0) || UPSTREAM[0];
  function trafoUnit(id) {
    const R = D.reports && D.reports.trafo;
    const u = R && R.units ? R.units.find(t => t.id === id) : null;
    if (u) return u;
    const rnd = rngOf('cv-trafo-' + id);
    const a = between(rnd, 820, 910);
    return { id, I: [a, a * 0.99, a * 1.01], V: [233.6, 233.9, 234.1], pf: 0.965 };
  }
  function trafo(id, tick) {
    const u = trafoUnit(id);
    const I = u.I.map((x, i) => x * jit('tr' + id + i, tick, 0.008));
    const V = u.V.map((x, i) => x * jit('trv' + id + i, tick, 0.002));
    const res = threePhase('trafo', I, V, u.pf, (TRAFO_RATED_KVA * 1000) / (SQRT3 * 400), { id });
    res.S = ((V[0] + V[1] + V[2]) / 3) * (I[0] + I[1] + I[2]) / 1000;
    res.ratedKva = TRAFO_RATED_KVA;
    return res;
  }
  function adp(id, tick) {
    const up = UPSTREAM.find(u => u.adp === id) || UPSTREAM[0];
    const t = trafo(up.trafo, tick); // ADP ana barası trafo Q çıkışıyla aynı akımı taşır
    return threePhase('adp', t.I, t.V, t.pf, ADP_RATED_A, { id, trafo: up.trafo });
  }

  // ---------------------------------------------------------------------------
  // Sorgular
  // ---------------------------------------------------------------------------
  // api.CTD_Data karşılığı: where = { src_pan }
  function query(where) {
    const w = where || {};
    if (w.src_pan) return ROWS.filter(r => r.src_pan === w.src_pan);
    if (w.id) return ROWS.filter(r => r.id === Number(w.id));
    return ROWS.slice();
  }
  // Bir kabinin A/B beslemeleri (çift besleme)
  function feedsOf(code) {
    const out = { A: [], B: [] };
    ROWS.forEach(r => { if (cabCode(r.tgt_cab) === code) out[sideOfPdu(r.tgt_pdu)].push(r); });
    return out;
  }
  // Normal dışı hatlar (tüm SDP'ler) + UPS olayları
  function abnormal(tick) {
    const out = [];
    const seen = {};
    ROWS.forEach(r => {
      const c = circuit(r, tick);
      if (c.status === 'normal') return;
      const key = c.code + '|' + c.pdu + '|' + sdpCode(r.src_pan);
      if (seen[key] && RANK[seen[key].status] >= RANK[c.status]) return;
      const item = { kind: 'circuit', status: c.status, code: c.code, pdu: c.pdu, side: c.side, sdp: sdpCode(r.src_pan), row: r, phase: c.phase, load: c.load, reason: c.lost ? 'Faz kaybı' : c.reason, note: c.note };
      if (seen[key]) out.splice(out.indexOf(seen[key]), 1, item); else out.push(item);
      seen[key] = item;
    });
    UPSTREAM.forEach(g => g.ups.forEach(code => {
      const u = ups(code, tick);
      if (u.status !== 'normal') out.push({ kind: 'ups', status: u.status, code, sdp: code, load: u.load, reason: u.reason, battery: u.battery });
    }));
    return out.sort((a, b) => RANK[b.status] - RANK[a.status] || (a.kind === 'ups' ? -1 : 1) - (b.kind === 'ups' ? -1 : 1));
  }

  D.connectivity = {
    meta: CTD_META,
    thresholds: { warn: LOAD_WARN, crit: LOAD_CRIT },
    rated: { ups: UPS_RATED_KW, rpp: RPP_RATED_A, sdp: SDP_RATED_A, adp: ADP_RATED_A, trafo: TRAFO_RATED_KVA },
    query, feedsOf, pdusOf, cabCode, sdpCode, sideOfPdu, upstreamOf, upstream: UPSTREAM,
    circuit, pdu, rpp, sdp, ups, adp, trafo, abnormal, worst, rank: RANK
  };
})();

/* ==========================================================================
   Etap 3 — events.html verisi (eski js/mock/events.data.js)
   ========================================================================== */
/* ==========================================================================
   DCIM Sunum — Otonom Olaylar mock verisi (parça dosya)
   doc('CME/S00')/id('CME_List')/item sorgusunun (rid, tim, doc, rid_, atr, txt, sta, cat)
   karşılığı. Son 7 günün olay akışı tohumlu üretilir; son ~3 saat sunum senaryosuyla
   (README "Sunum senaryosu", aktif alarm zamanları) birebir örtüşür.
   Canlı akış için next(seq) aynı seq'e her zaman aynı olayı döndürür.
   Bağımlılık: js/mock-data.js → DCIM.data (cabinets, findCabinet, personnel, rng, hash)
   Sonradan mock-data.js içine birleştirilmek üzere kendi başına çalışır.
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D) return;

  const NOW = Date.now();
  const minAgo = m => new Date(NOW - m * 60000);

  // CME durum kodu: 0x0300 | sınıf (0 İPTAL, 1 YENİ, 2 BEKLİYOR, 3 İŞLİYOR, 4 TAMAMLANDI,
  // 5 DURDU-UYARI, 6 BEKLİYOR-UYARI, 7 İŞLİYOR-UYARI, 8 BAŞARISIZ-ALARM, 9 DURDU-ALARM,
  // A BEKLİYOR-ALARM, B İŞLİYOR-ALARM, C BAŞARISIZ-KRİZ, D DURDU-KRİZ, E BEKLİYOR-KRİZ, F İŞLİYOR-KRİZ)
  const STA = c => 0x0300 | c;

  // Kaynak grupları (kaynak filtresi) — doc: olayı üreten AyXDB dokümanı
  const SOURCES = {
    locks: { label: 'Kapak Kilitleri', doc: 'CMR/T04' },
    ups: { label: 'UPS', doc: 'CMR/T02' },
    climate: { label: 'Klima', doc: 'CMR/T03' },
    pdu: { label: 'PDU', doc: 'CMR/T01' },
    sensor: { label: 'Kabin Sensörü', doc: 'CMR/T01' },
    user: { label: 'Kullanıcı', doc: 'USR/S00' },
    system: { label: 'Sistem', doc: 'CME/S00' }
  };

  // telemetry-points.html ile aynı etiket biçimi (cabinetMgr.sensorIos / pduDevs)
  const podPfx = code => {
    const c = D.findCabinet ? D.findCabinet(code) : null;
    return (c ? c.pod.replace('-', '') : 'POD1') + '_K' + code;
  };
  const upsTag = (label, sfx) => 'KAT1_SAL1_' + label.replace(/^UPS\s*/i, '') + '_UPS_' + sfx;

  let seqNo = 18200;
  const list = [];
  function add(m, grp, src, ref, cat, txt, sev, cls) {
    const s = SOURCES[grp];
    list.push({
      id: 'CME_' + String(++seqNo).padStart(6, '0'),
      tim: minAgo(m),
      grp,
      src: src || s.label,
      doc: s.doc,
      ref: ref || '',
      cat,
      txt,
      sev,
      sta: STA(cls)
    });
  }

  // ---------------------------------------------------------------------------
  // Senaryo olayları (aktif alarmlarla aynı dakikalar)
  // ---------------------------------------------------------------------------
  const SCENARIO = [
    [0.4, 'user', 'Kullanıcı', 'admin', 'Oturum', 'admin giriş yaptı (10.10.1.24 · Chrome)', 'info', 4],
    [2.1, 'system', 'Sistem', 'thr_notify', 'Sistem', 'Alarm bildirimi gönderildi: Kabin 1BJ53 yüksek sıcaklık → NOC e-posta / SMS', 'info', 4],
    [4, 'sensor', 'Kabin 1BJ53', podPfx('1BJ53') + '_TEMP_MID', 'Soğutma', 'Kabin 1BJ53 Orta Sıcaklık Üst Limiti Aştı: 32.4 °C (Limit 27.0 °C)', 'critical', 0xB],
    [6.5, 'system', 'Sistem', 'thr_pue', 'Enerji', 'Otonom senaryo başlatıldı: UPS A5 akü modu → yük devri ön kontrolü', 'warning', 3],
    [7, 'ups', 'UPS A5', upsTag('UPS A5', 'MODE'), 'Enerji', 'Şebekeden Aküye Geçildi — Kalan süre 18 dk', 'critical', 0xB],
    [7.1, 'ups', 'UPS A5', upsTag('UPS A5', 'IN_VOLT_L1'), 'Enerji', 'UPS A5 giriş gerilimi kayboldu: 0 V (L1)', 'critical', 4],
    [11, 'locks', 'Kapak Kilitleri', podPfx('1AZ39') + '_FDOOR', 'Güvenlik', 'Kabin 1AZ39 Ön Kapak Açıldı — kart okutulmadan (yetkisiz)', 'critical', 1],
    [11.2, 'system', 'Sistem', 'thr_alarm_eval', 'Güvenlik', 'Kamera kaydı işaretlendi: POD-1 / Kabin 1AZ39 (±5 dk)', 'info', 4],
    [16, 'climate', 'KLIMA 109', 'IDC1_KLIMA109_HP', 'Soğutma', 'KLIMA 109 Kompresör 1 Yüksek Basınç: 27.8 bar (Limit 26.0 bar)', 'critical', 0xA],
    [18.4, 'user', 'Kullanıcı', 'ayse.demir', 'Operatör', 'ayse.demir KLIMA 109 için iş emri oluşturdu (İE-2026-0947)', 'info', 4],
    [23, 'pdu', 'Kabin 1AV42 PDU-B', 'K1AV42_PDU_B_IN2_VOLT_FN', 'Enerji', 'Kabin 1AV42 PDU-B L2 Faz Kaybı: 0 V (Alt Limit 207 V)', 'critical', 0xB],
    [29, 'sensor', 'Kabin 1BC37', podPfx('1BC37') + '_TEMP_TOP', 'Soğutma', 'Kabin 1BC37 Üst Sıcaklık Kritik: 33.0 °C — otonom soğutma artırımı', 'critical', 0xF],
    [34, 'sensor', 'Kabin 1CE51', podPfx('1CE51') + '_TEMP_MID', 'Haberleşme', 'Kabin 1CE51 sensör modülü haberleşme kaybı (Modbus TCP zaman aşımı)', 'warning', 5],
    [41, 'ups', 'UPS B7', upsTag('UPS B7', 'MODE'), 'Haberleşme', 'UPS B7 SNMP haberleşme kaybı (3 ardışık sorgu yanıtsız)', 'warning', 5],
    [44.5, 'user', 'Kullanıcı', 'operator', 'Oturum', 'operator oturumu kapattı', 'info', 4],
    [52, 'sensor', 'Kabin 1BQ55', podPfx('1BQ55') + '_TEMP_MID', 'Soğutma', 'Kabin 1BQ55 Sıcaklık Uyarısı: 27.9 °C (Uyarı Limiti 27.0 °C)', 'warning', 7],
    [58, 'pdu', 'Kabin 1CB52 PDU-A', 'K1CB52_PDU_A_IN1_CURR', 'Enerji', 'Kabin 1CB52 Yüksek Akım: 34.3 A (Uyarı Limiti 32.0 A)', 'warning', 7],
    [64, 'sensor', 'Kabin 1BU54', podPfx('1BU54') + '_HUM_MID', 'Soğutma', 'Kabin 1BU54 Yüksek Nem: %62 (Uyarı Limiti %60)', 'warning', 6],
    [73, 'climate', 'KLIMA 104', 'IDC1_KLIMA104_FLT', 'Soğutma', 'KLIMA 104 filtre kirli — bakım gerekli (Δp 182 Pa)', 'warning', 6],
    [81, 'sensor', 'Kabin 1BX50', podPfx('1BX50') + '_TEMP_MID', 'Soğutma', 'Kabin 1BX50 Düşük Sıcaklık: 17.2 °C (Alt Limit 18.0 °C)', 'warning', 7],
    [88, 'climate', 'KLIMA 112', 'IDC1_KLIMA112_RET', 'Soğutma', 'KLIMA 112 dönüş havası yüksek: 29.4 °C (Limit 28.0 °C)', 'warning', 7],
    [96, 'sensor', 'Kabin 1CE56', podPfx('1CE56') + '_TEMP_MID', 'Soğutma', 'Kabin 1CE56 Sıcaklık Uyarısı: 28.3 °C (Uyarı Limiti 27.0 °C)', 'warning', 7],
    [104, 'locks', 'Kapak Kilitleri', podPfx('1BN52') + '_RDOOR', 'Güvenlik', 'Kabin 1BN52 Arka Kapak 5 dakikadan uzun süredir açık', 'warning', 6],
    [109, 'locks', 'Kapak Kilitleri', podPfx('1BN52') + '_RDOOR', 'Güvenlik', 'Kabin 1BN52 Arka Kapak Açıldı (Kart: Burak Şahin)', 'info', 4],
    [112, 'locks', 'Kapak Kilitleri', podPfx('1BG41') + '_FDOOR', 'Güvenlik', 'Kabin 1BG41 Ön Kapak Açıldı — yetkili bakım (Kart: Mehmet Kaya · İE-2026-0931)', 'info', 4],
    [118, 'user', 'Kullanıcı', 'mehmet.kaya', 'Operatör', 'mehmet.kaya İE-2026-0931 iş emrini "İşlemde" durumuna aldı', 'info', 4],
    [131, 'locks', 'Kapak Kilitleri', podPfx('1BX54') + '_FDOOR', 'Güvenlik', 'Kabin 1BX54 kilit motoru arızası — kilit yanıt vermiyor', 'warning', 9],
    [167, 'locks', 'Kapak Kilitleri', podPfx('1BU50') + '_FDOOR', 'Güvenlik', 'Kabin 1BU50 yetkisiz kart denemesi (3x) — Kart 04:9C:11:7E', 'warning', 4],
    [178, 'user', 'Kullanıcı', 'noc.vardiya', 'Oturum', 'noc.vardiya giriş yaptı (vardiya devri 08:00)', 'info', 4]
  ];
  SCENARIO.forEach(s => add.apply(null, s));

  // ---------------------------------------------------------------------------
  // Arka plan olayları (son 7 gün, 3 saatten eski) — tohumlu
  // ---------------------------------------------------------------------------
  const rnd = D.rng(D.hash('cme-events-2026'));
  const pick = arr => arr[Math.floor(rnd() * arr.length) % arr.length];
  const USERS = ['admin', 'operator', 'ayse.demir', 'mehmet.kaya', 'burak.sahin', 'zeynep.arslan', 'noc.vardiya', 'emre.celik'];
  const PEOPLE = (D.personnel || []).map(p => p.name);
  const CODES = (D.cabinets || []).map(c => c.code);
  const UPS = ['UPS A1', 'UPS A2', 'UPS A3', 'UPS A4', 'UPS A6', 'UPS A7', 'UPS B1', 'UPS B2', 'UPS B3', 'UPS B4', 'UPS B5', 'UPS B6'];
  const KLIMA = ['KLIMA 101', 'KLIMA 102', 'KLIMA 103', 'KLIMA 105', 'KLIMA 106', 'KLIMA 107', 'KLIMA 108', 'KLIMA 110', 'KLIMA 111', 'KLIMA 113', 'KLIMA 114'];
  const HIST_CLS = () => (rnd() < 0.06 ? 0 : 4); // eski olaylar büyük çoğunlukla TAMAMLANDI, arada İPTAL

  const BACKGROUND = [
    { w: 18, f: () => { const c = pick(CODES); return ['locks', 'Kapak Kilitleri', podPfx(c) + '_FDOOR', 'Güvenlik', 'Kabin ' + c + ' Ön Kapak Açıldı (Kart: ' + pick(PEOPLE) + ')', 'info', 4]; } },
    { w: 12, f: () => { const c = pick(CODES); return ['locks', 'Kapak Kilitleri', podPfx(c) + '_FDOOR', 'Güvenlik', 'Kabin ' + c + ' Ön Kapak Kapandı', 'info', 4]; } },
    { w: 4, f: () => { const c = pick(CODES); return ['locks', 'Kapak Kilitleri', podPfx(c) + '_RDOOR', 'Güvenlik', 'Kabin ' + c + ' Arka Kapak Açıldı (Kart: ' + pick(PEOPLE) + ')', 'info', 4]; } },
    { w: 12, f: () => { const u = pick(USERS); return ['user', 'Kullanıcı', u, 'Oturum', u + ' giriş yaptı', 'info', 4]; } },
    { w: 8, f: () => { const u = pick(USERS); return ['user', 'Kullanıcı', u, 'Oturum', u + ' oturumu kapattı', 'info', 4]; } },
    { w: 2, f: () => ['user', 'Kullanıcı', 'bilinmiyor', 'Oturum', 'Hatalı giriş denemesi: kullanıcı "root" (10.10.9.87)', 'warning', 4] },
    { w: 5, f: () => { const u = pick(USERS); return ['user', 'Kullanıcı', u, 'Operatör', u + ' ' + pick(['aktif alarmı "Gördüm" olarak işaretledi', 'Tarihsel Alarm raporunu PDF olarak indirdi', 'Kabin ' + pick(CODES) + ' için iş emri oluşturdu', 'Otonom Olay Raporunu Oluşturdu.']), 'info', 4]; } },
    { w: 6, f: () => ['system', 'Sistem', 'thr_pue', 'Enerji', 'PUE hesaplandı: ' + (1.38 + rnd() * 0.08).toFixed(2) + ' (saatlik)', 'info', 4] },
    { w: 3, f: () => ['system', 'Sistem', 'thr_cdr', 'Enerji', 'Günlük müşteri CDR raporu üretildi (' + (40 + Math.floor(rnd() * 20)) + ' müşteri)', 'info', 4] },
    { w: 3, f: () => ['system', 'Sistem', 'con_odbc', 'Sistem', 'PostgreSQL tarihsel veri yedeği tamamlandı (' + (2 + rnd() * 2).toFixed(1) + ' GB)', 'info', 4] },
    { w: 1, f: () => ['system', 'Sistem', 'con_odbc', 'Sistem', 'Tarihsel veri yedeği başarısız: disk kotası %92 — yeniden denenecek', 'warning', 8] },
    { w: 4, f: () => ['system', 'Sistem', 'thr_qry', 'Sistem', 'XDB senkronizasyonu tamamlandı (' + pick(['CMR/T01', 'CMR/T02', 'CMR/T03', 'CMR/T04']) + ', ' + (0.6 + rnd() * 1.4).toFixed(1) + ' sn)', 'info', 4] },
    { w: 4, f: () => { const u = pick(UPS); return ['ups', u, upsTag(u, 'BAT_CAP'), 'Enerji', u + ' periyodik akü testi tamamlandı — kapasite %' + (96 + Math.floor(rnd() * 5)), 'info', 4]; } },
    { w: 1, f: () => ['ups', 'UPS A5', upsTag('UPS A5', 'MODE'), 'Enerji', 'UPS A5 şebekeye geri döndü (akü modu ' + (2 + Math.floor(rnd() * 6)) + ' dk sürdü)', 'warning', 4] },
    { w: 4, f: () => { const k = pick(KLIMA); return ['climate', k, 'IDC1_' + k.replace(/\s+/g, '') + '_MODE', 'Soğutma', k + ' ' + pick(['çalışma moduna geçti (SOĞUTMA)', 'fan hızı %' + (60 + Math.floor(rnd() * 25)) + ' olarak ayarlandı', 'bekleme moduna alındı (yedeklilik rotasyonu)']), 'info', 4]; } },
    { w: 3, f: () => { const c = pick(CODES); return ['sensor', 'Kabin ' + c, podPfx(c) + '_TEMP_MID', 'Soğutma', 'Kabin ' + c + ' Orta Sıcaklık normale döndü: ' + (22 + rnd() * 3).toFixed(1) + ' °C', 'info', 4]; } },
    { w: 2, f: () => { const c = pick(CODES); return ['sensor', 'Kabin ' + c, podPfx(c) + '_TEMP_MID', 'Soğutma', 'Kabin ' + c + ' Sıcaklık Uyarısı: ' + (27 + rnd()).toFixed(1) + ' °C (Uyarı Limiti 27.0 °C)', 'warning', 4]; } },
    { w: 2, f: () => { const c = pick(CODES); const s = rnd() < 0.5 ? 'A' : 'B'; return ['pdu', 'Kabin ' + c + ' PDU-' + s, 'K' + c + '_PDU_' + s + '_IN1_CURR', 'Enerji', 'Kabin ' + c + ' PDU-' + s + ' akım uyarısı: ' + (12.9 + rnd()).toFixed(1) + ' A (Uyarı 12.8 A)', 'warning', 4]; } },
    { w: 1, f: () => { const c = pick(CODES); return ['locks', 'Kapak Kilitleri', podPfx(c) + '_FDOOR', 'Güvenlik', 'Kabin ' + c + ' Ön Kapak Açıldı — kart okutulmadan (yetkisiz)', 'critical', 4]; } },
    { w: 1, f: () => { const k = pick(KLIMA); return ['climate', k, 'IDC1_' + k.replace(/\s+/g, '') + '_HP', 'Soğutma', k + ' Kompresör Yüksek Basınç: ' + (26.2 + rnd()).toFixed(1) + ' bar', 'critical', 4]; } }
  ];
  const TOTAL_W = BACKGROUND.reduce((s, b) => s + b.w, 0);
  const pickTemplate = r => {
    let x = r * TOTAL_W;
    for (let i = 0; i < BACKGROUND.length; i++) { x -= BACKGROUND[i].w; if (x <= 0) return BACKGROUND[i]; }
    return BACKGROUND[0];
  };

  let m = 190;
  while (m < 7 * 1440) {
    const args = pickTemplate(rnd()).f();
    if (args[6] === 4) args[6] = HIST_CLS();
    add.apply(null, [m].concat(args));
    // gece saatlerinde olay seyrek, gündüz yoğun
    const hour = new Date(NOW - m * 60000).getHours();
    m += (hour >= 8 && hour < 19 ? 9 : 26) + rnd() * 30;
  }
  list.sort((a, b) => b.tim - a.tim);

  // ---------------------------------------------------------------------------
  // Canlı akış: next(seq) → yeni olay (tarih: çağrıldığı an)
  // ---------------------------------------------------------------------------
  const LIVE = [
    { w: 14, f: (r, n) => { const c = CODES[Math.floor(r() * CODES.length)]; return ['locks', 'Kapak Kilitleri', podPfx(c) + '_FDOOR', 'Güvenlik', 'Kabin ' + c + ' Ön Kapak Açıldı (Kart: ' + PEOPLE[Math.floor(r() * PEOPLE.length)] + ')', 'info', 4]; } },
    { w: 10, f: (r, n) => { const c = CODES[Math.floor(r() * CODES.length)]; return ['locks', 'Kapak Kilitleri', podPfx(c) + '_FDOOR', 'Güvenlik', 'Kabin ' + c + ' Ön Kapak Kapandı', 'info', 4]; } },
    { w: 8, f: (r, n) => { const u = USERS[Math.floor(r() * USERS.length)]; return ['user', 'Kullanıcı', u, 'Oturum', u + (r() < 0.6 ? ' giriş yaptı' : ' oturumu kapattı'), 'info', 4]; } },
    { w: 6, f: (r, n) => ['system', 'Sistem', 'thr_qry', 'Sistem', 'XDB senkronizasyonu tamamlandı (CMR/T0' + (1 + Math.floor(r() * 4)) + ', ' + (0.6 + r() * 1.4).toFixed(1) + ' sn)', 'info', 4] },
    { w: 4, f: (r, n) => ['system', 'Sistem', 'thr_pue', 'Enerji', 'PUE hesaplandı: ' + (1.40 + r() * 0.05).toFixed(2) + ' (anlık)', 'info', 4] },
    { w: 5, f: (r, n) => ['ups', 'UPS A5', upsTag('UPS A5', 'BAT_TIME'), 'Enerji', 'UPS A5 akü modunda — kalan süre ' + Math.max(6, 18 - Math.floor(n / 3)) + ' dk, akü %' + Math.max(40, 64 - Math.floor(n / 2)), 'critical', 0xB] },
    { w: 4, f: (r, n) => ['sensor', 'Kabin 1BJ53', podPfx('1BJ53') + '_TEMP_MID', 'Soğutma', 'Kabin 1BJ53 Orta Sıcaklık hâlâ limit üstünde: ' + (32.2 + r() * 0.5).toFixed(1) + ' °C', 'critical', 1] },
    { w: 3, f: (r, n) => ['climate', 'KLIMA 109', 'IDC1_KLIMA109_HP', 'Soğutma', 'KLIMA 109 kompresör basıncı ' + (27.6 + r() * 0.5).toFixed(1) + ' bar — otonom yük azaltma bekliyor', 'critical', 0xA] },
    { w: 4, f: (r, n) => ['ups', 'UPS B7', upsTag('UPS B7', 'MODE'), 'Haberleşme', 'UPS B7 SNMP yeniden bağlanma denemesi başarısız (deneme #' + (4 + n) + ')', 'warning', 5] },
    { w: 3, f: (r, n) => ['sensor', 'Kabin 1CE51', podPfx('1CE51') + '_TEMP_MID', 'Haberleşme', 'Kabin 1CE51 sensör modülü yanıt vermiyor (Modbus TCP zaman aşımı, 3000 ms)', 'warning', 5] },
    { w: 3, f: (r, n) => { const c = CODES[Math.floor(r() * CODES.length)]; return ['sensor', 'Kabin ' + c, podPfx(c) + '_TEMP_MID', 'Soğutma', 'Kabin ' + c + ' Orta Sıcaklık normal: ' + (22 + r() * 2.5).toFixed(1) + ' °C', 'info', 4]; } }
  ];
  const LIVE_W = LIVE.reduce((s, b) => s + b.w, 0);

  function next(n) {
    const r = D.rng(D.hash('cme-live:' + n));
    let x = r() * LIVE_W, tpl = LIVE[0];
    for (let i = 0; i < LIVE.length; i++) { x -= LIVE[i].w; if (x <= 0) { tpl = LIVE[i]; break; } }
    const a = tpl.f(r, n);
    const s = SOURCES[a[0]];
    return {
      id: 'CME_' + String(++seqNo).padStart(6, '0'),
      tim: new Date(),
      grp: a[0],
      src: a[1] || s.label,
      doc: s.doc,
      ref: a[2],
      cat: a[3],
      txt: a[4],
      sev: a[5],
      sta: STA(a[6]),
      live: true
    };
  }

  D.events = { list, next, SOURCES, STA };
})();

/* ==========================================================================
   Etap 3 — telemetry-points.html verisi (eski js/mock/telemetry-points.data.js)
   ========================================================================== */
/* ==========================================================================
   DCIM Sunum — Telemetri Noktaları mock verisi (parça dosya)
   doc('CMR/*')/descendant::io sorgusunun (rid, pro, val, unit, desc, sta, qry_doc) karşılığı.
   Ekler (sunum): pid (Nokta ID), dev (bağlı cihaz), proto (protokol), tim (son güncelleme).
   Kabin sensör / PDU değerleri cabinetMgr.sensorIos / pduDevs'ten alınır (cabinet-detail.html ile
   aynı değerler); UPS / klima / pano değerleri DCIM.data.ups / climates / panels noktalarıdır.
   Senaryo: 1CE51 sensör modülü ve UPS B7 haberleşme kaybı (VERİ ALINAMIYOR, Offline),
   PMM-7 planlı devre dışı, UPS A5 akü modu, KLIMA 109 yüksek basınç, 1AV42 PDU-B L2 faz kaybı.
   STA bitleri: 0x0003 motor (0 devre dışı, 1 durmuş, 2 bekliyor, 3 çalışıyor),
                0x000C değer (4 uyarı, 8 alarm, C acil), 0x0030 çıkış noktası (yazılabilir).
   Bağımlılık: js/mock-data.js → DCIM.data (cabinets, ups, climates, panels, cabinetMgr, rng, hash)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D) return;

  // İlk DCIM.data.telemetry erişiminde üretilir (~3400 nokta; diğer sayfalar maliyeti ödemez)
  D.lazy('telemetry', function () {

  const RUN = 0x0003, DATAERR = 0x0002, DISABLED = 0x0000;
  const WARN = 0x0004, ALARM = 0x0008, EMERG = 0x000C, OUT = 0x0010;
  const STATUS_BITS = { normal: 0, warning: WARN, alarm: ALARM };

  const PROTO = {
    modbus: 'Modbus TCP',
    rtu: 'Modbus RTU',
    snmp3: 'SNMP v3',
    snmp2: 'SNMP v2c',
    mqtt: 'MQTT',
    bacnet: 'BACnet/IP'
  };

  const NOW = Date.now();
  const rnd = D.rng(D.hash('telemetry-points-2026'));
  const secAgo = s => new Date(NOW - s * 1000);
  const fresh = () => secAgo(1 + rnd() * 14);

  // Canlı güncelleme genliği (birime göre) — 0: canlı güncellenmez
  function noiseOf(unit, val) {
    switch (unit) {
      case '°C': return 0.1;
      case '%RH': return 0.4;
      case 'V': return val > 0 ? 0.4 : 0;
      case 'A': return val > 0 ? Math.max(0.02, val * 0.02) : 0;
      case 'W': return val > 0 ? val * 0.015 : 0;
      case 'kW': return val * 0.01;
      case 'Hz': return 0.01;
      case 'bar': return 0.1;
      default: return 0;
    }
  }
  const decimalsOf = v => { const s = String(v); const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };

  const points = [];
  let pid = 10001;
  // o: { doc, rid, dev, desc, unit, val, proto, sta, tim?, scale?, noise?, cls? }
  function add(o) {
    const num = typeof o.val === 'number' ? o.val : parseFloat(o.val);
    const isNum = typeof o.val === 'number' || (/^-?\d+(\.\d+)?$/.test(String(o.val)));
    const dec = isNum ? Math.max(decimalsOf(o.val), o.dec || 0) : 0;
    const scale = o.scale != null ? o.scale : (o.proto === 'modbus' || o.proto === 'snmp3' || o.proto === 'snmp2' ? (dec >= 2 ? 100 : dec === 1 ? 10 : 1) : 1);
    const p = {
      pid: pid++,
      qry_doc: o.doc,
      rid: o.rid,
      dev: o.dev,
      desc: o.desc,
      unit: o.unit || '',
      proto: PROTO[o.proto],
      sta: o.sta,
      tim: o.tim || ((o.sta & 0x3) === RUN ? fresh() : secAgo(1200 + rnd() * 2400)),
      cls: o.cls || '',
      isNum,
      dec,
      scale,
      base: isNum ? num : null,
      noise: o.noise != null ? o.noise : (isNum && (o.sta & 0x3) === RUN ? noiseOf(o.unit, num) : 0),
      lo: o.lo, hi: o.hi, hiA: o.hiA,
      conHost: o.conHost || '',
      pro: '', val: ''
    };
    setValue(p, isNum ? num : o.val, o.pro);
    points.push(p);
    return p;
  }
  // Değer ↔ ham değer (pro = val / ölçek)
  function setValue(p, v, rawOverride) {
    if (p.isNum && typeof v === 'number') {
      p.num = v;
      p.val = v.toFixed(p.dec);
      p.pro = rawOverride != null ? String(rawOverride) : p.proto === PROTO.mqtt || p.proto === PROTO.bacnet ? v.toFixed(p.dec) : String(Math.round(v * p.scale));
    } else {
      p.val = String(v);
      p.pro = rawOverride != null ? String(rawOverride) : String(v);
    }
  }

  // ---------------------------------------------------------------------------
  // 1) Salon ortam sensörleri (kablolu Modbus TCP + kablosuz MQTT)
  // ---------------------------------------------------------------------------
  const ROOM = [
    { n: '01', t: 23.4, h: 48, proto: 'modbus', doc: 'CMR/T01', dev: 'Salon 1 Ortam Sensörü-01 (Kuzey)' },
    { n: '02', t: 22.9, h: 46, proto: 'modbus', doc: 'CMR/T01', dev: 'Salon 1 Ortam Sensörü-02 (Güney)' },
    { n: '03', t: 24.1, h: 51, proto: 'mqtt', doc: 'CMR/T04', dev: 'Kablosuz Ortam Sensörü-03 (Sıcak Koridor A)' },
    { n: '04', t: 23.7, h: 49, proto: 'mqtt', doc: 'CMR/T04', dev: 'Kablosuz Ortam Sensörü-04 (Soğuk Koridor B)' }
  ];
  ROOM.forEach(r => {
    add({ doc: r.doc, rid: 'DC1_ROOM_TEMP_' + r.n, dev: r.dev, desc: 'SALON 1 ORTAM SICAKLIĞI ' + r.n, unit: '°C', val: r.t, dec: 1, proto: r.proto, sta: RUN, cls: 'TEMP', lo: 18, hi: 27, hiA: 30 });
    add({ doc: r.doc, rid: 'DC1_ROOM_HUM_' + r.n, dev: r.dev, desc: 'SALON 1 ORTAM NEMİ ' + r.n, unit: '%RH', val: r.h, proto: r.proto, sta: RUN, cls: 'HUM', lo: 30, hi: 60, hiA: 70 });
  });

  // ---------------------------------------------------------------------------
  // 2) Pano analizörleri (PMM, SNMP v2c — CMR/T02)
  // ---------------------------------------------------------------------------
  const PMM = ['Master Pano PMM-1', 'A1 Klima Panosu PMM', 'B1 Klima Panosu PMM', 'UPS Çıkış Panosu A PMM', 'UPS Çıkış Panosu B PMM'];
  PMM.forEach((dev, i) => {
    const id = 'PMM_' + (i + 1);
    const r = D.rng(D.hash(id));
    const v = (base, spread) => Math.round((base + (r() - 0.5) * spread) * 10) / 10;
    const host = '10.10.30.' + (21 + i);
    const volts = i === 0 ? [228.5, 229.1, 227.8] : [v(229, 3), v(229, 3), v(229, 3)];
    ['L1', 'L2', 'L3'].forEach((ph, k) => add({ doc: 'CMR/T02', rid: id + '_' + ph + '_VOLT', dev, desc: dev.toLocaleUpperCase('tr-TR') + ' ' + ph + '-N GERİLİM', unit: 'V', val: volts[k], dec: 1, proto: 'snmp2', sta: RUN, cls: 'VOLT', lo: 207, hi: 244, hiA: 253, conHost: host }));
    add({ doc: 'CMR/T02', rid: id + '_TOT_POW', dev, desc: dev.toLocaleUpperCase('tr-TR') + ' TOPLAM AKTİF GÜÇ', unit: 'kW', val: i === 0 ? 312.4 : v(i < 3 ? 86 : 118, 20), dec: 1, proto: 'snmp2', sta: RUN, cls: 'POW', conHost: host });
    add({ doc: 'CMR/T02', rid: id + '_FREQ', dev, desc: dev.toLocaleUpperCase('tr-TR') + ' FREKANS', unit: 'Hz', val: i === 0 ? 50.01 : Math.round((49.98 + r() * 0.05) * 100) / 100, dec: 2, proto: 'snmp2', sta: RUN, cls: 'FREQ', conHost: host });
    add({ doc: 'CMR/T02', rid: id + '_PF', dev, desc: dev.toLocaleUpperCase('tr-TR') + ' GÜÇ FAKTÖRÜ', unit: '', val: (0.95 + r() * 0.04).toFixed(2), proto: 'snmp2', sta: RUN, cls: 'PF', noise: 0, conHost: host });
  });
  // PMM-7: planlı devre dışı (system-health.html ile aynı)
  ['L1_VOLT', 'TOT_POW'].forEach(s => add({ doc: 'CMR/T02', rid: 'PMM_7_' + s, dev: 'Yedek Pano Analizörü PMM-7', desc: 'YEDEK PANO ANALİZÖRÜ PMM-7 ' + (s === 'TOT_POW' ? 'TOPLAM AKTİF GÜÇ' : 'L1-N GERİLİM'), unit: s === 'TOT_POW' ? 'kW' : 'V', val: '-', proto: 'snmp2', sta: DISABLED, tim: new Date(NOW - 3 * 86400000 - 4 * 3600000), cls: s === 'TOT_POW' ? 'POW' : 'VOLT', conHost: '10.10.30.27' }));

  // ---------------------------------------------------------------------------
  // 3) UPS (SNMP v3 — CMR/T02)
  // ---------------------------------------------------------------------------
  const UPS_SFX = {
    'Çalışma Modu': ['MODE', 'ÇALIŞMA MODU'], 'Giriş Gerilimi (L1)': ['IN_VOLT_L1', 'GİRİŞ GERİLİMİ L1'], 'Çıkış Gerilimi (L1)': ['OUT_VOLT_L1', 'ÇIKIŞ GERİLİMİ L1'],
    'Yük Oranı': ['LOAD', 'YÜK ORANI'], 'Akü Kapasitesi': ['BAT_CAP', 'AKÜ KAPASİTESİ'], 'Kalan Akü Süresi': ['BAT_TIME', 'KALAN AKÜ SÜRESİ'], 'Akü Sıcaklığı': ['BAT_TEMP', 'AKÜ SICAKLIĞI']
  };
  const byLabel = (a, b) => a.label.localeCompare(b.label, 'tr', { numeric: true });
  (D.ups || []).slice().sort(byLabel).forEach((u, i) => {
    const code = u.label.replace(/^UPS\s*/i, '');
    const lost = u.status === 'lost';
    const lastSeen = new Date(NOW - 41 * 60000 - 12000); // alarm: SNMP kaybı 41 dk önce
    (u.points || []).forEach(pt => {
      const m = UPS_SFX[pt.label];
      if (!m) return;
      const isMode = m[0] === 'MODE';
      const unit = pt.unit === '%' ? '%' : pt.unit;
      add({
        doc: 'CMR/T02', rid: 'KAT1_SAL1_' + code + '_UPS_' + m[0], dev: u.label, desc: u.label + ' ' + m[1], unit,
        val: isMode ? (lost ? 'ONLINE (ŞEBEKE)' : pt.value) : pt.value, pro: isMode ? (pt.value === 'AKÜ' ? 2 : 1) : null,
        proto: 'snmp3', sta: lost ? DATAERR : RUN | (STATUS_BITS[pt.status] || 0), tim: lost ? lastSeen : null,
        noise: isMode || lost ? 0 : (m[0] === 'LOAD' ? 0.6 : null), dec: /VOLT/.test(m[0]) ? 1 : 0,
        cls: 'UPS', conHost: '10.10.20.' + (11 + i)
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 4) Klimalar (BACnet/IP — CMR/T03) + set değeri (çıkış noktası, yazılabilir)
  // ---------------------------------------------------------------------------
  const KLM_SFX = {
    'Çalışma Modu': ['MODE', 'ÇALIŞMA MODU'], 'Üfleme Sıcaklığı': ['SUP_TEMP', 'ÜFLEME SICAKLIĞI'], 'Dönüş Sıcaklığı': ['RET', 'DÖNÜŞ SICAKLIĞI'],
    'Oda Nemi': ['HUM', 'ODA NEMİ'], 'Fan Hızı': ['FAN', 'FAN HIZI'], 'Kompresör 1 Basınç': ['HP', 'KOMPRESÖR 1 BASINÇ'], 'Filtre Durumu': ['FLT', 'FİLTRE DURUMU']
  };
  (D.climates || []).slice().sort(byLabel).forEach((k, i) => {
    const id = 'IDC1_' + k.label.replace(/\s+/g, '');
    const host = '10.10.25.' + (31 + i);
    (k.points || []).forEach(pt => {
      const m = KLM_SFX[pt.label];
      if (!m) return;
      const unit = pt.unit === '%' ? (m[0] === 'HUM' ? '%RH' : '%') : pt.unit;
      add({ doc: 'CMR/T03', rid: id + '_' + m[0], dev: k.label, desc: k.label + ' ' + m[1], unit, val: pt.value, pro: typeof pt.value === 'string' ? (/ARIZA|KİRLİ/.test(pt.value) ? 1 : 0) : null,
        proto: 'bacnet', sta: RUN | (STATUS_BITS[pt.status] || 0), noise: m[0] === 'FAN' ? 0.6 : null, dec: unit === '°C' || unit === 'bar' ? 1 : 0, cls: 'KLM', conHost: host,
        hi: m[0] === 'HP' ? 24 : m[0] === 'RET' ? 28 : undefined, hiA: m[0] === 'HP' ? 26 : m[0] === 'RET' ? 30 : undefined });
    });
    add({ doc: 'CMR/T03', rid: id + '_SET', dev: k.label, desc: k.label + ' SET SICAKLIĞI', unit: '°C', val: 22.0, dec: 1, proto: 'bacnet', sta: RUN | OUT, noise: 0, cls: 'SET', conHost: host });
  });

  // ---------------------------------------------------------------------------
  // 5) Klima panoları (Modbus RTU — CMR/T03)
  // ---------------------------------------------------------------------------
  const PNL_SFX = { 'L1 Akım': 'L1_CURR', 'L2 Akım': 'L2_CURR', 'L3 Akım': 'L3_CURR', 'Toplam Aktif Güç': 'TOT_POW', 'Güç Faktörü': 'PF' };
  (D.panels || []).forEach((p, i) => {
    (p.points || []).forEach(pt => {
      const s = PNL_SFX[pt.label];
      if (!s) return;
      add({ doc: 'CMR/T03', rid: 'PANO_' + (i + 1) + '_' + s, dev: p.label, desc: p.label.toLocaleUpperCase('tr-TR') + ' ' + pt.label.toLocaleUpperCase('tr-TR'), unit: pt.unit, val: pt.value,
        proto: 'rtu', sta: RUN | (STATUS_BITS[pt.status] || 0), noise: s === 'PF' ? 0 : null, dec: s === 'PF' ? 2 : 1, cls: 'PNL', conHost: 'RS485 / COM' + (3 + (i % 2)) + ' · ID ' + (i + 1) });
    });
  });

  // ---------------------------------------------------------------------------
  // 6) Kabinler: Kabin sensör modülü (Modbus TCP), kapak (MQTT), PDU A/B (Modbus TCP)
  // ---------------------------------------------------------------------------
  const M = D.cabinetMgr;
  const PDU_IO = /_IN\d?_CURR$|_IN\d?_VOLT_FN$|_IN_VOLT$|_IN_TOT_POW$|_IN_POW$/;
  const lostSeen = new Date(NOW - 34 * 60000 - 27000); // alarm: 1CE51 haberleşme kaybı 34 dk önce
  (D.cabinets || []).forEach(c => {
    if (!M) return;
    const lost = c.status === 'lost';
    M.sensorIos(c.code).forEach(io => {
      const door = io.xdb_cls === 'DOOR';
      let sta = parseInt(io.sta, 16);
      if (c.code === '1BC37' && /_TEMP_TOP$/.test(io.rid)) sta = RUN | EMERG; // 33.0 °C — acil eşiği
      add({
        doc: door ? 'CMR/T04' : 'CMR/T01', rid: io.rid,
        dev: door ? 'Kilit ' + c.code + (/_FDOOR$/.test(io.rid) ? ' (Ön)' : ' (Arka)') : 'Kabin ' + c.code + ' Sensör Modülü',
        desc: io.desc, unit: door ? '-' : io.unit,
        val: lost ? '-' : door ? (io.val === '1' ? 'AÇIK' : 'KAPALI') : parseFloat(io.val), pro: door ? io.val : null,
        proto: door ? 'mqtt' : 'modbus', sta, tim: lost ? lostSeen : null, dec: io.unit === '°C' || io.unit === '%RH' ? 1 : 0,
        cls: io.xdb_cls, lo: io.xdb_cls === 'TEMP' ? 18 : io.xdb_cls === 'HUM' ? 30 : undefined, hi: io.xdb_cls === 'TEMP' ? 27 : io.xdb_cls === 'HUM' ? 60 : undefined, hiA: io.xdb_cls === 'TEMP' ? 30 : io.xdb_cls === 'HUM' ? 70 : undefined,
        conHost: door ? 'mqtt://sns-gw-' + c.pod.toLowerCase() + ':1883' : '10.10.' + (60 + (c.code.charCodeAt(2) % 20)) + '.' + (10 + (parseInt(c.code.slice(3), 10) || 0))
      });
    });
    M.pduDevs(c.code).forEach(dv => {
      const side = /_PDU_B_/.test(dv.id) ? 'B' : 'A';
      dv.io.filter(io => PDU_IO.test(io.id)).forEach(io => {
        const v = parseFloat(io.val);
        add({ doc: 'CMR/T01', rid: io.id, dev: 'Kabin ' + c.code + ' PDU-' + side, desc: 'KABİN ' + c.code + ' PDU-' + side + ' ' + io.id.replace(/^.*_PDU_[AB]_/, '').replace(/_/g, ' '),
          unit: io.unit, val: isNaN(v) ? io.val : v, proto: 'modbus', sta: parseInt(io.sta, 16), dec: io.unit === 'V' ? 1 : io.unit === 'A' ? 2 : 0, cls: 'PDU', conHost: dv.con_host });
      });
    });
  });

  D.telemetry = { points, setValue, PROTO, STA: { RUN, DATAERR, DISABLED, WARN, ALARM, EMERG, OUT } };
  });
})();

/* ==========================================================================
   Etap 3 — account-settings.html verisi (eski js/mock/account-settings.data.js)
   ========================================================================== */
/* ==========================================================================
   DCIM Sunum — Kullanıcı Ayarları mock verisi (parça dosya)
   queryUsersApi() → "User" tablosu satırları (user_id, name, surname, das_uid, das_pwd,
   das_grp, das_acl, das_cfg, mobile, email, customer_name, cdb_id) +
   api.HIS_CDB_Customer_List (cdb_id, customer_name) karşılığı.
   Sunum için eklenen alanlar (kaynak tabloda yok): department, status ('active'|'passive'), last_login.
   Kurumsal hesaplar LDAP'tır (das_pwd boş → tabloda "LDAP" rozeti); müşteri hesapları SQL şifrelidir.
   Kişi adları geneldir, e-postalar kurgusal (@example.com).
   Bağımlılık: js/mock-data.js (DCIM.data.rng / hash / customers)
   ========================================================================== */
(function () {
  'use strict';

  const D = window.DCIM.data;
  const rnd = D.rng(D.hash('account-settings-users-2026'));
  const NOW = Date.now();
  const minutesAgo = m => (m == null ? null : new Date(NOW - m * 60000));

  // Türkçe karakterleri e-posta için ASCII'ye katla
  const fold = s => s.toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, '');
  const digits = n => { let s = ''; for (let i = 0; i < n; i++) s += Math.floor(rnd() * 10); return s; };
  const PREFIX = ['532', '533', '535', '536', '542', '544', '505', '506', '552', '553'];
  const phone = () => '+90' + PREFIX[Math.floor(rnd() * PREFIX.length)] + digits(7);
  const CHARSET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const pwd = () => { let s = ''; for (let i = 0; i < 10; i++) s += CHARSET.charAt(Math.floor(rnd() * CHARSET.length)); return s; };

  // Pozisyona göre varsayılan ACL (account-settings.component.ts eski INSERT sorgusundaki CASE)
  const ACL_BY_GRP = {
    admin: '*',
    'mühendis': '*',
    'operatör': '*,-RPS,-RTS_ENG',
    misafir: '*,-RTS_ENG,-AS,-WOR',
    'müşteri': 'CAB*,ASM*,PDU*,REP(pdu, sen),CDB*,'
  };

  // ---------------------------------------------------------------------------
  // Müşteri listesi (HIS_CDB_Customer_List) — Müşteri Eşleştirme CDB kayıtlarıyla aynı
  // ---------------------------------------------------------------------------
  const FALLBACK_CUSTOMERS = [
    { cdb_id: '1013312753', customer_name: 'Anadolu Finans A.Ş.' },
    { cdb_id: '1013318420', customer_name: 'Delta Yazılım Teknolojileri A.Ş.' },
    { cdb_id: '1013290017', customer_name: 'Başkent Belediyesi Bilgi İşlem Daire Başkanlığı' },
    { cdb_id: '1013325566', customer_name: 'Marmara Sigorta A.Ş.' },
    { cdb_id: '1013301984', customer_name: 'Ege Lojistik ve Taşımacılık A.Ş.' },
    { cdb_id: '1013334409', customer_name: 'Kuzey Enerji Dağıtım A.Ş.' }
  ];
  const customers = [];
  const seen = {};
  ((D.customers && D.customers.cdbList) || FALLBACK_CUSTOMERS).forEach(r => {
    if (seen[r.cdb_id]) return;
    seen[r.cdb_id] = true;
    customers.push({ cdb_id: r.cdb_id, customer_name: r.customer_name });
  });
  const cust = key => customers.find(c => c.customer_name.indexOf(key) === 0) || { cdb_id: '', customer_name: key };

  // ---------------------------------------------------------------------------
  // Kurumsal kullanıcılar (LDAP) — [ad, soyad, sicil/uid, das_grp, departman, durum, son giriş (dk önce)]
  // ---------------------------------------------------------------------------
  const CORPORATE = [
    ['DCIM', 'Operatör', 'operator', 'operatör', 'DC Operasyon Merkezi (NOC)', 'active', 4],
    ['Zeynep', 'Arslan', '100412', 'admin', 'Sistem Yönetimi', 'active', 42],
    ['Murat', 'Özdemir', '100587', 'admin', 'Bilgi Güvenliği', 'active', 1310],
    ['Burak', 'Şahin', '101233', 'mühendis', 'Ağ Mühendisliği', 'active', 140],
    ['Emre', 'Çelik', '101469', 'mühendis', 'Enerji & Mekanik Bakım', 'active', 118],
    ['Hakan', 'Yıldız', '101702', 'mühendis', 'Enerji & Mekanik Bakım', 'active', 2890],
    ['Gökhan', 'Polat', '101958', 'mühendis', 'İklimlendirme Bakım', 'active', 460],
    ['Tolga', 'Erdem', '102144', 'mühendis', 'Kapasite Planlama', 'passive', 64800],
    ['Mehmet', 'Kaya', '102380', 'operatör', 'Veri Merkezi Operasyon', 'active', 30],
    ['Ayşe', 'Demir', '102415', 'operatör', 'Veri Merkezi Operasyon', 'active', 60],
    ['Elif', 'Aksoy', '102671', 'operatör', 'Veri Merkezi Operasyon', 'active', 725],
    ['Seda', 'Kurt', '102893', 'operatör', 'Veri Merkezi Operasyon', 'passive', 91000],
    ['Deniz', 'Koç', '103057', 'misafir', 'Güvenlik', 'active', 1880],
    ['Can', 'Öztürk', '103312', 'misafir', 'Bakım Firması (Yüklenici)', 'active', 109],
    ['Merve', 'Şen', '103548', 'misafir', 'Kalite & Süreç Yönetimi', 'passive', null]
  ];

  // ---------------------------------------------------------------------------
  // Müşteri kullanıcıları (SQL şifreli) — [ad, soyad, kullanıcı adı, müşteri anahtarları, departman, durum, son giriş, das_acl, das_cfg]
  // ---------------------------------------------------------------------------
  const CUSTOMER_USERS = [
    ['Selin', 'Aydın', 'egelojistik.selin', ['Ege Lojistik'], 'BT Operasyon', 'active', 250, null, '0x0100'],
    ['Esra', 'Kılıç', 'egelojistik.esra', ['Ege Lojistik'], 'Altyapı Yönetimi', 'passive', 50400, null, '0x0000'],
    ['Kerem', 'Yalçın', 'anadolufinans.noc', ['Anadolu Finans'], 'NOC', 'active', 15, 'CAB*,ASM*,PDU*,REP*,CDB*,CMA*,', '0x0100'],
    ['Barış', 'Güneş', 'delta.altyapi', ['Delta Yazılım', 'Anadolu Finans'], 'Sistem & Altyapı', 'active', 1460, 'CAB*,ASM*,PDU*,REP(pdu, sen, cma),CDB*,CMA*,', '0x0200'],
    ['Ceren', 'Bulut', 'delta.ceren', ['Delta Yazılım'], 'Sistem & Altyapı', 'active', 3200, 'CAB(pdu, asm),PDU*,REP(pdu),', '0x0000'],
    ['Serkan', 'Acar', 'baskent.bim', ['Başkent Belediyesi'], 'Bilgi İşlem', 'active', 1500, null, '0x0100'],
    ['Nihan', 'Çetin', 'marmara.sigorta', ['Marmara Sigorta'], 'BT Altyapı', 'active', 980, 'CAB*,ASM*,PDU*,REP(pdu, sen),CDB*,CMA*,', '0x0100'],
    ['Ozan', 'Tekin', 'kuzeyenerji.ops', ['Kuzey Enerji'], 'Enerji Operasyon', 'active', null, null, '0x0000']
  ];

  const users = [];
  let uid = 1001;
  CORPORATE.forEach(r => {
    users.push({
      user_id: String(uid),
      name: r[0], surname: r[1], das_uid: r[2], das_pwd: '',
      das_kid: '0', das_grp: r[3], das_acl: ACL_BY_GRP[r[3]], das_cfg: '0x0000',
      mobile: phone(),
      email: r[2] === 'operator' ? 'dcim.noc@example.com' : fold(r[0]) + '.' + fold(r[1]) + '@example.com',
      customer_name: '', cdb_id: '',
      department: r[4], status: r[5], last_login: minutesAgo(r[6])
    });
    uid += 1 + Math.floor(rnd() * 3);
  });
  uid = 2001;
  CUSTOMER_USERS.forEach(r => {
    const cs = r[3].map(cust);
    users.push({
      user_id: String(uid),
      name: r[0], surname: r[1], das_uid: r[2], das_pwd: pwd(),
      das_kid: '0', das_grp: 'müşteri', das_acl: r[7] || ACL_BY_GRP['müşteri'], das_cfg: r[8],
      mobile: phone(),
      email: fold(r[0]) + '.' + fold(r[1]) + '@example.com',
      customer_name: cs.map(c => c.customer_name).join(','),
      cdb_id: cs.map(c => c.cdb_id).filter(Boolean).join(','),
      department: r[4], status: r[5], last_login: minutesAgo(r[6])
    });
    uid += 1 + Math.floor(rnd() * 4);
  });

  D.accounts = {
    users,
    customers,
    aclByGroup: ACL_BY_GRP,
    // account-settings.component.ts → positionList
    positions: ['Admin', 'Mühendis', 'Operatör', 'Müşteri', 'Misafir']
  };
})();

/* ==========================================================================
   Etap 3 — permission-settings.html verisi (eski js/mock/permission-settings.data.js)
   ========================================================================== */
/* ==========================================================================
   DCIM Sunum — Yetkilendirme Ayarları mock verisi (DCIM.data.permissions)
   - roles: rol şablonları (das_grp) ve varsayılan ACL (Employee Type) dizeleri
   - ldapUsers: das.search_user_ldap(uid) yanıtlarının karşılığı
   ACL biçimi permission-settings.component.ts ile aynıdır: "*" | "+MOD" | "+MODop" (op: C/R/U/D)
   Modül kodları: permission-settings.component.ts → modulesList (+ navigation.config.ts rolleri)
   ========================================================================== */
(function () {
  'use strict';

  const D = window.DCIM.data;

  // Rol şablonları — das_grp değerleri account-settings.component.ts → positionList ile aynı
  // (Admin, Mühendis, Operatör, Müşteri, Misafir); görünen adlar sunum senaryosundaki rol adlarıdır.
  const ROLES = [
    {
      id: 'super-admin', label: 'Süper Admin', grp: 'Admin', icon: 'pi pi-star', tone: 'rose', locked: true,
      desc: 'Tüm modüllerde tam yetki (*). Şablon düzenlenemez.',
      acl: '*'
    },
    {
      id: 'maintenance', label: 'Bakım Mühendisi', grp: 'Mühendis', icon: 'pi pi-wrench', tone: 'amber',
      desc: 'Kabin/cihaz yönetimi, bakım modülü, kapak kilidi ve enerji kontrolü.',
      acl: '+RTS,+RTSN,+RTSA,+RTSE,+RTS_ENGR,+RTS_ENG2D,+RTS_ENGCR,+RTS_ENGCU,+RTS_ENG3D,+RPS,+RPSE,+RPSBA,+RPSSO,+RPSHA,+RPSDL,' +
        '+ASMR,+ASMCATR,+ASMLOCR,+ASMCAB,+ASMD,+ASMDE,+ASMNR,+ASMNU,+MNT,+LCK,+TCK,+WORR,+WORU,+ENRR,+ENROR,+ENRPDUR,+ENRPDUU,+ENRK'
    },
    {
      id: 'operator', label: 'Operatör', grp: 'Operatör', icon: 'pi pi-desktop', tone: 'sky',
      desc: '7/24 NOC izleme: 2D/3D, alarmlar, iş emri güncelleme, rapor indirme.',
      acl: '+RTS,+RTSN,+RTSA,+RTSE,+RTS_ENGR,+RTS_ENG2D,+RTS_ENGCR,+RTS_ENG3D,+RPS,+RPSE,+RPSBA,+RPSSO,+RPSHA,+RPSDL,' +
        '+ASMR,+ASMCABR,+ASMDR,+MNTR,+LCKR,+TCKR,+WORR,+WORU,+ENRR,+ENRPDUR'
    },
    {
      id: 'customer', label: 'Müşteri', grp: 'Müşteri', icon: 'pi pi-briefcase', tone: 'emerald',
      desc: 'Yalnızca kendi kabinleri: müşteri sayfaları, ticket, enerji raporu.',
      acl: '+RTS_ENGR,+RTS_ENG2D,+RPS,+RPSE,+RPSDL,+CDBR,+TCK,+ENRPDUR'
    },
    {
      id: 'guest', label: 'Misafir', grp: 'Misafir', icon: 'pi pi-eye', tone: 'slate',
      desc: 'Salt okunur 2D/3D genel görünüm (denetim / ziyaretçi).',
      acl: '+RTS_ENGR,+RTS_ENG2D,+RTS_ENG3D'
    }
  ];

  // LDAP dizini (search_user_ldap yanıtı: { id, nam, acl, inSql }) — kurgusal personel
  // acl boşsa rol şablonu kullanılır; dolu ise kullanıcıya özel Employee Type dizesidir.
  const LDAP_USERS = [
    { id: '00547731', nam: 'Zeynep Arslan', usr: 'zeynep.arslan', role: 'super-admin', dept: 'Sistem Yönetimi', inSql: 1, acl: '*' },
    { id: '00546120', nam: 'Murat Aksoy', usr: 'murat.aksoy', role: 'super-admin', dept: 'DCIM Platform Ekibi', inSql: 1, acl: '*' },
    { id: '00553318', nam: 'Emre Çelik', usr: 'emre.celik', role: 'maintenance', dept: 'Enerji & Mekanik Bakım', inSql: 1, acl: '' },
    { id: '00548816', nam: 'Burak Şahin', usr: 'burak.sahin', role: 'maintenance', dept: 'Ağ Mühendisliği', inSql: 1, acl: '' },
    { id: '00550437', nam: 'Hakan Yıldız', usr: 'hakan.yildiz', role: 'maintenance', dept: 'Enerji & Mekanik Bakım', inSql: 1, acl: '' },
    { id: '00549854', nam: 'Mehmet Kaya', usr: 'mehmet.kaya', role: 'operator', dept: 'Veri Merkezi Operasyon', inSql: 1, acl: '' },
    { id: '00551207', nam: 'Ayşe Demir', usr: 'ayse.demir', role: 'operator', dept: 'Veri Merkezi Operasyon', inSql: 1, acl: '' },
    // Güvenlik: operatör şablonu + kapak kilidi tam yetki + kullanıcı logları (özel ACL)
    {
      id: '00552604', nam: 'Deniz Koç', usr: 'deniz.koc', role: 'operator', dept: 'Güvenlik', inSql: 1,
      acl: '+RTS,+RTSN,+RTSA,+RTSE,+RTS_ENGR,+RTS_ENG2D,+RTS_ENGCR,+RTS_ENG3D,+RPS,+RPSE,+RPSBA,+RPSSO,+RPSHA,+RPSDL,+RPSUL,+ASMR,+ASMCABR,+ASMDR,+MNTR,+LCK,+TCKR,+WORR,+WORU,+ENRR,+ENRPDUR'
    },
    { id: '00560042', nam: 'Selin Aydın', usr: 'selin.aydin', role: 'customer', dept: 'Müşteri Temsilcisi (Ege Lojistik)', inSql: 1, acl: '' },
    { id: '00562275', nam: 'Elif Kaplan', usr: 'elif.kaplan', role: 'customer', dept: 'Müşteri Temsilcisi (Anadolu Finans A.Ş.)', inSql: 1, acl: '' },
    // SQL'de kaydı yok → sihirbaz "Kullanıcı Ekle" onay penceresini açar
    { id: '00561190', nam: 'Can Öztürk', usr: 'can.ozturk', role: 'guest', dept: 'Bakım Firması (Yüklenici)', inSql: 0, acl: '' }
  ];

  // Özel sonuç üreten UID'ler (hata akışlarını göstermek için)
  const LDAP_ERRORS = {
    '99999999': { error: true, code: 'ERR_BIND_FAIL' }
  };

  function searchUser(uid) {
    const key = String(uid || '').trim();
    if (LDAP_ERRORS[key]) return Object.assign({}, LDAP_ERRORS[key]);
    const u = LDAP_USERS.find(x => x.id === key || x.usr === key.toLocaleLowerCase('tr-TR'));
    if (!u) return { error: true, code: 'ERR_SUB_INVUSER' };
    const role = ROLES.find(r => r.id === u.role);
    return { id: u.id, nam: u.nam, usr: u.usr, dept: u.dept, role: u.role, inSql: u.inSql, acl: u.acl || (role ? role.acl : '') };
  }

  // Son değişiklik bilgisi (rol kartlarında gösterilir) — tohumlu
  const rnd = D.rng(D.hash('permission-roles'));
  const EDITORS = ['Zeynep Arslan', 'Murat Aksoy'];
  const now = Date.now();
  ROLES.forEach((r, i) => {
    r.updatedAt = new Date(now - Math.round((2 + i * 5 + rnd() * 4) * 86400000 + rnd() * 36e5));
    r.updatedBy = EDITORS[Math.floor(rnd() * EDITORS.length)];
  });

  D.permissions = {
    roles: ROLES,
    ldapUsers: LDAP_USERS,
    searchUser,
    usersOfRole: id => LDAP_USERS.filter(u => u.role === id)
  };
})();

/* ==========================================================================
   Etap 3 — audit-logs.html verisi (eski js/mock/audit-logs.data.js)
   ========================================================================== */
/* ==========================================================================
   DCIM Sunum — Audit / Kullanıcı Logları mock verisi (DCIM.data.auditLogs)
   api.HIS_user_log_list → CME tablosu (evt_api='syslog') satırlarının karşılığı:
     { tim, cid, cat, doc, rid, atr, txt, sta, evt_prm: '{"user","ip","url",...}' }
   sta = 0x0101 | (lvl << 2) — db41 SYSLOG_event(): syslog seviyesi 6→BİLGİ(0x101), 4→UYARI(0x105),
   3→ALARM(0x109), 0-1→KRİZ(0x10D). Kategoriler kaynak koddaki SysLog çağrılarından
   (OTURUM, ALARM_ACK, İŞ EMRİ, RAPOR, MÜŞTERİ, USER, YETKİ, AYAR, INFO, PDU LAUNCH).
   SUNUM EKLENTİSİ: evt_prm içinde "asset" (etkilenen varlık) ve "res" (success|denied|failed);
   "KAPAK KİLİDİ" ve "ENERJİ KONTROL" kategorileri senaryo için eklenmiştir.
   Kullanıcı adları kurgusaldır; IP'ler özel ağ aralıklarındandır (10.130.x / 172.16.x).
   ========================================================================== */
(function () {
  'use strict';

  const D = window.DCIM.data;
  const rnd = D.rng(D.hash('audit-logs-v1'));
  const pick = arr => arr[Math.floor(rnd() * arr.length) % arr.length];
  const NOW = Date.now();
  const ago = m => new Date(NOW - m * 60000);
  const STA = { 6: 0x0101, 5: 0x0101, 4: 0x0105, 3: 0x0109, 2: 0x0109, 1: 0x010d, 0: 0x010d };

  // Kullanıcılar (usr = oturum kullanıcı adı, nam = das.usr_fullname) — permission-settings.data.js ile aynı kişiler
  const U = {
    zeynep: { usr: 'zeynep.arslan', nam: 'Zeynep Arslan', ip: '10.130.1.45' },
    murat: { usr: 'murat.aksoy', nam: 'Murat Aksoy', ip: '10.130.1.52' },
    emre: { usr: 'emre.celik', nam: 'Emre Çelik', ip: '10.130.7.33' },
    burak: { usr: 'burak.sahin', nam: 'Burak Şahin', ip: '10.130.6.14' },
    hakan: { usr: 'hakan.yildiz', nam: 'Hakan Yıldız', ip: '10.130.7.41' },
    mehmet: { usr: 'mehmet.kaya', nam: 'Mehmet Kaya', ip: '10.130.4.21' },
    ayse: { usr: 'ayse.demir', nam: 'Ayşe Demir', ip: '10.130.4.22' },
    deniz: { usr: 'deniz.koc', nam: 'Deniz Koç', ip: '10.130.9.5' },
    selin: { usr: 'selin.aydin', nam: 'Selin Aydın', ip: '172.16.20.14' },
    elif: { usr: 'elif.kaplan', nam: 'Elif Kaplan', ip: '172.16.20.37' },
    can: { usr: 'can.ozturk', nam: 'Can Öztürk', ip: '172.16.40.9' },
    system: { usr: 'system', nam: 'Sistem', ip: '10.130.1.111' }
  };
  const BY_NAME = {};
  Object.keys(U).forEach(k => { BY_NAME[U[k].nam] = U[k]; });
  const OPERATORS = [U.mehmet, U.ayse, U.deniz];
  const ENGINEERS = [U.emre, U.burak, U.hakan];
  const ADMINS = [U.zeynep, U.murat];
  const CUSTOMERS = [U.selin, U.elif];
  const STAFF = OPERATORS.concat(ENGINEERS, ADMINS);

  const HOST = 'http://10.130.1.111';
  const R = {
    login: HOST + '/',
    d2: HOST + '/k/dcim/operations/digital-twin-2d',
    d3: HOST + '/k/dcim/operations/digital-twin-3d',
    alarms: HOST + '/k/dcim/active-alarms',
    wo: HOST + '/k/dcim/work-orders',
    cust: HOST + '/k/dcim/newuicmp-customer-pages',
    locks: HOST + '/k/dcim/monitoring/locks',
    pdu: HOST + '/k/dcim/assets/pdu-detail',
    cab: HOST + '/k/dcim/assets/cabinet-manager',
    reports: HOST + '/k/dcim/reports',
    accounts: HOST + '/k/dcim/account-settings',
    perms: HOST + '/k/dcim/permission-settings',
    energy: HOST + '/k/dcim/energy/scada-energy',
    customerApp: HOST + '/m/'
  };

  const CABS = (D.cabinets || []).map(c => c.code).filter(Boolean);
  const cab = () => (CABS.length ? pick(CABS) : '1AS49');
  const WORK_ORDERS = [
    { id: 'İE-2026-0931', name: '1BG41 PDU-A modül değişimi' },
    { id: 'İE-2026-0928', name: 'KLIMA 109 kompresör basınç kontrolü' },
    { id: 'İE-2026-0925', name: 'UPS A5 akü grubu kapasite testi' },
    { id: 'İE-2026-0919', name: '1AV42 PDU-B faz onarımı' },
    { id: 'İE-2026-0914', name: '1BX54 kilit motoru değişimi' },
    { id: 'İE-2026-0907', name: 'KLIMA 104 filtre değişimi' },
    { id: 'İE-2026-0902', name: 'POD-6 kablo tavası düzenlemesi' }
  ];
  const DEVICES = [
    { label: 'Cisco Nexus 93180YC-FX', id: 'ASM-000412' },
    { label: 'HPE ProLiant DL380 Gen10', id: 'ASM-001187' },
    { label: 'Dell PowerEdge R750', id: 'ASM-000958' },
    { label: 'Fortinet FortiGate 1800F', id: 'ASM-000233' },
    { label: 'NetApp AFF A400', id: 'ASM-001402' }
  ];
  const CUSTOMER_NAMES = ['Ege Lojistik', 'Anadolu Finans A.Ş.', 'Kuzey Enerji', 'Marmara Sigorta', 'Delta Yazılım'];
  const dstr = d => String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();

  let seq = 0x5a1c00;
  const rows = [];
  function add(tim, u, lvl, cat, txt, o) {
    o = o || {};
    seq += 1 + Math.floor(rnd() * 7);
    const prm = { user: u.usr, ip: o.ip || u.ip, url: o.url === undefined ? '' : o.url, asset: o.asset || '', res: o.res || 'success' };
    if (u.usr === 'system') prm.url = '';
    rows.push({
      tim,
      cid: 'CE' + seq.toString(16).toUpperCase().padStart(16, '0'),
      cat,
      doc: o.doc || 'DAS',
      rid: o.rid || '',
      atr: o.atr || '',
      txt,
      sta: STA[lvl],
      evt_prm: JSON.stringify(prm)
    });
  }

  // ---------------------------------------------------------------------------
  // Senaryo olayları (diğer sayfalarla tutarlı; dakika cinsinden "önce")
  // ---------------------------------------------------------------------------
  add(ago(6), U.deniz, 4, 'KAPAK KİLİDİ', 'Kabin 1AZ39 kilidi açıldı (ön kapak) — güvenlik yerinde kontrol', { asset: 'Kabin 1AZ39', url: R.locks, doc: 'CMR', rid: 'NS2_1AZ39_FDOOR' });
  add(ago(9), U.selin, 4, 'KAPAK KİLİDİ', 'Kabin 1AZ39 kilit açma talebi reddedildi — LCK yetkisi yok', { asset: 'Kabin 1AZ39', url: R.customerApp, res: 'denied', doc: 'CMR', rid: 'NS2_1AZ39_FDOOR' });
  add(ago(11), U.system, 1, 'KAPAK KİLİDİ', 'Kabin 1AZ39 ön kapak kart okutulmadan açıldı (zorlama şüphesi)', { asset: 'Kabin 1AZ39', res: 'denied', doc: 'CMR', rid: 'NS2_1AZ39_FDOOR' });
  add(ago(18), U.hakan, 6, 'İŞ EMRİ', 'İş Emri Planlanıyora Alındı: İE-2026-0947 - UPS A5 akü modu incelemesi', { asset: 'İE-2026-0947', url: R.wo, doc: 'WOR' });
  add(ago(25), U.zeynep, 4, 'YETKİ', 'Yetki Değişimi: 00552604 ACL: +RTS,+RTSN,+RTSA,+RTSE,+RTS_ENGR,+RTS_ENG2D,+RTS_ENGCR,+RTS_ENG3D,+RPS,+RPSE,+RPSBA,+RPSSO,+RPSHA,+RPSDL,+RPSUL,+ASMR,+ASMCABR,+ASMDR,+MNTR,+LCK,+TCKR,+WORR,+WORU,+ENRR,+ENRPDUR', { asset: 'Kullanıcı Deniz Koç (00552604)', url: R.perms });
  add(ago(33), U.selin, 6, 'OTURUM', 'selin.aydin login oldu', { asset: 'Müşteri Portalı', url: R.customerApp });
  add(ago(38), U.mehmet, 4, 'YETKİ', 'Yetkisiz sayfa erişim denemesi: /dcim/permission-settings (ASP yetkisi yok)', { asset: 'İzin Ayarları', url: R.perms, res: 'denied' });
  add(ago(45), U.emre, 3, 'KAPAK KİLİDİ', 'Kabin 1BX54 kilit açma komutu uygulanamadı (kilit motoru geri bildirimi yok)', { asset: 'Kabin 1BX54', url: R.locks, res: 'failed', doc: 'CMR', rid: 'POD5_1BX54_LOCK' });
  add(ago(47), U.emre, 6, 'İŞ EMRİ', 'İş Emri Planlanıyora Alındı: İE-2026-0914 - 1BX54 kilit motoru değişimi', { asset: 'İE-2026-0914', url: R.wo, doc: 'WOR' });
  add(ago(71), U.burak, 6, 'ENERJİ KONTROL', '1CB52 PDU-A Outlet 14 kapatıldı (yük dengeleme)', { asset: 'PDU 1CB52-A / Outlet 14', url: R.pdu, doc: 'ASM' });
  add(ago(74), U.ayse, 4, 'ENERJİ KONTROL', '1CB52 PDU-A Outlet 14 kontrol talebi reddedildi — ENRK yetkisi yok', { asset: 'PDU 1CB52-A / Outlet 14', url: R.pdu, res: 'denied', doc: 'ASM' });
  add(ago(118), U.emre, 6, 'KAPAK KİLİDİ', 'Kabin 1BG41 kilidi açıldı (ön kapak) — İE-2026-0931', { asset: 'Kabin 1BG41', url: R.locks, doc: 'CMR', rid: 'POD8_1BG41_FDOOR' });
  add(ago(121), U.emre, 6, 'İŞ EMRİ', 'İş Emri İşleye Alındı: İE-2026-0931 - 1BG41 PDU-A modül değişimi', { asset: 'İE-2026-0931', url: R.wo, doc: 'WOR' });
  add(ago(109), U.system, 6, 'KAPAK KİLİDİ', 'Kabin 1BN52 arka kapak kart ile açıldı (Can Öztürk · 04:0E:B4:59)', { asset: 'Kabin 1BN52', doc: 'CMR', rid: 'POD9_1BN52_RDOOR' });
  [167, 168, 169].forEach(m => add(ago(m), U.system, 3, 'KAPAK KİLİDİ', 'Kabin 1BU50 yetkisiz kart denemesi (Kart 04:9C:11:7E)', { asset: 'Kabin 1BU50', res: 'denied', doc: 'CMR', rid: 'POD4_1BU50_FDOOR_AUTH' }));
  // Kaba kuvvet giriş denemesi (misafir Wi-Fi segmenti)
  [200, 201, 201.5, 202].forEach(m => add(ago(m), { usr: 'admin', nam: 'admin', ip: '172.16.99.23' }, 4, 'OTURUM', "'admin' şifre hatalı IP:'172.16.99.23'", { asset: 'Oturum', url: R.login, res: 'denied' }));
  add(ago(203), { usr: 'administrator', nam: 'administrator', ip: '172.16.99.23' }, 4, 'OTURUM', "'administrator' kullanıcı adı hatalı IP:'172.16.99.23'", { asset: 'Oturum', url: R.login, res: 'denied' });
  add(ago(204), U.system, 1, 'OTURUM', "172.16.99.23 adresinden 5 başarısız giriş — IP 15 dk engellendi", { asset: 'Oturum', res: 'denied', doc: 'DAS' });
  add(ago(26 * 60 + 12), U.murat, 6, 'USER', 'Kullanıcı Güncellendi: Elif Kaplan', { asset: 'Kullanıcı Elif Kaplan', url: R.accounts });
  add(ago(26 * 60 + 18), U.murat, 6, 'MÜŞTERİ', 'Anadolu Finans A.Ş. Müşterisinin Eşleştirmesi Güncellendi', { asset: 'Müşteri Anadolu Finans A.Ş.', url: R.cust, doc: 'CDB' });
  add(ago(3 * 1440 + 95), U.zeynep, 4, 'YETKİ', 'Yetki Sıfırlama: 00561190', { asset: 'Kullanıcı Can Öztürk (00561190)', url: R.perms });

  // Aktif/Tarihsel alarm onayları → ALARM_ACK ("Alarm görüldü: <rid>")
  const ackSeen = new Set();
  (D.activeAlarms || []).concat(D.historicalAlarms || []).forEach(a => {
    if (!a.ack || !a.ack.tim || !BY_NAME[a.ack.user]) return;
    const key = a.rid + '|' + new Date(a.ack.tim).getTime();
    if (ackSeen.has(key)) return;   // tarihsel liste aktif alarmların kopyasını da içerir
    ackSeen.add(key);
    add(new Date(a.ack.tim), BY_NAME[a.ack.user], 6, 'ALARM_ACK', 'Alarm görüldü: ' + a.rid, { asset: a.desc, url: R.alarms, doc: 'CMA/S00', rid: a.rid });
  });

  // ---------------------------------------------------------------------------
  // Rutin olaylar (son 14 gün, mesai saatleri ağırlıklı)
  // ---------------------------------------------------------------------------
  const TEMPLATES = [
    { w: 16, f: t => { const u = pick(STAFF); add(t, u, 6, 'OTURUM', u.usr + ' login oldu', { asset: 'Oturum', url: R.login }); } },
    { w: 6, f: t => { const u = pick(STAFF); add(t, u, 6, 'OTURUM', 'OTP Kodu Eşleştirildi, ' + u.usr + ' login oldu', { asset: 'Oturum', url: R.login }); } },
    { w: 3, f: t => { const u = pick(CUSTOMERS); add(t, u, 6, 'OTURUM', u.usr + ' login oldu', { asset: 'Müşteri Portalı', url: R.customerApp }); } },
    { w: 4, f: t => { const u = pick(STAFF.concat(CUSTOMERS)); add(t, u, 4, 'OTURUM', "'" + u.usr + "' şifre hatalı IP:'" + u.ip + "'", { asset: 'Oturum', url: R.login, res: 'denied' }); } },
    { w: 2, f: t => { const u = pick(STAFF); add(t, u, 4, 'OTURUM', 'OTP Kodu Eşleşmedi', { asset: 'Oturum', url: R.login, res: 'denied' }); } },
    { w: 6, f: t => { const u = pick(STAFF); add(t, u, 6, 'OTURUM', 'Oturum kapatıldı (' + u.usr + ')', { asset: 'Oturum', url: R.d2 }); } },
    {
      w: 9, f: t => {
        const u = pick(ENGINEERS.concat([U.mehmet, U.ayse]));
        const wo = pick(WORK_ORDERS);
        const st = pick(['İş Emri İşleye Alındı', 'İş Emri Devam Ediyor', 'İş Emri Tamamlandı', 'İş Emri Beklemeye Alındı', 'İş Emri Planlanıyora Alındı']);
        add(t, u, 6, 'İŞ EMRİ', st + ': ' + wo.id + ' - ' + wo.name, { asset: wo.id, url: R.wo, doc: 'WOR' });
      }
    },
    { w: 1, f: t => { const u = pick(ENGINEERS); const wo = pick(WORK_ORDERS); add(t, u, 3, 'İŞ EMRİ', 'Yeni iş emri kaydedilemedi: ' + wo.id, { asset: wo.id, url: R.wo, res: 'failed', doc: 'WOR' }); } },
    {
      w: 7, f: t => {
        const u = pick(STAFF.concat(CUSTOMERS));
        const d2 = new Date(t.getTime() - 86400000), d1 = new Date(d2.getTime() - 6 * 86400000);
        const kind = pick([['UPS Raporu', "PDF'ini"], ['Trafo Raporu', "Excel'ini"], ['PUE Raporu', "PDF'ini"], ['UPS Raporu', "Excel'ini"]]);
        add(t, u, 6, 'RAPOR', u.nam + ' Kişisi ' + dstr(d1) + ' - ' + dstr(d2) + ' Tarihlerinin ' + kind[0] + ' ' + kind[1] + ' Oluşturdu.', { asset: kind[0], url: R.reports });
      }
    },
    { w: 3, f: t => { const u = pick(STAFF); const c = cab(); add(t, u, 6, 'RAPOR', u.nam + ' Kişisi ' + c + '-PDU-A PDU Detay Raporunu PDF olarak indirdi.', { asset: 'PDU ' + c + '-A', url: R.pdu }); } },
    { w: 1, f: t => { const u = pick(STAFF); add(t, u, 4, 'RAPOR', u.nam + ' Kişisi Trafo Raporunu Oluşturamadı (Eksik Filtre).', { asset: 'Trafo Raporu', url: R.reports, res: 'failed' }); } },
    { w: 2, f: t => { const u = pick(CUSTOMERS.concat([U.can])); add(t, u, 4, 'RAPOR', u.nam + ' Kişisi Enerji Raporu indirme talebi reddedildi — RPSDL yetkisi yok', { asset: 'Enerji Raporu', url: u === U.can ? R.reports : R.customerApp, res: 'denied' }); } },
    { w: 3, f: t => { const u = pick(ENGINEERS); const c = cab(); add(t, u, 6, 'PDU LAUNCH', u.nam + ' tarafından ' + c + '-PDU-B PDU\'su açıldı - Adres: http://10.130.12.' + (20 + Math.floor(rnd() * 200)), { asset: 'PDU ' + c + '-B', url: R.pdu }); } },
    { w: 3, f: t => { const u = pick(ENGINEERS); const c = cab(); add(t, u, 6, 'AYAR', u.nam + ' tarafindan ' + c + ' kabini icin sıcaklık üst eşiği güncellendi (27 °C)', { asset: 'Kabin ' + c, url: R.cab }); } },
    { w: 4, f: t => { const u = pick(ENGINEERS); const d = pick(DEVICES); add(t, u, 6, 'INFO', u.nam + ' kullanıcısı "' + d.label + '" (' + d.id + ') cihazını düzenlemeye başladı.', { asset: d.label + ' (' + d.id + ')', url: R.cab, doc: 'ASM' }); } },
    { w: 2, f: t => { const u = pick(ENGINEERS); const d = pick(DEVICES); add(t, u, 6, 'INFO', u.nam + ' Kişisi tarafından ' + d.label + ' Cihazının port bilgisini güncelledi.', { asset: d.label + ' (' + d.id + ')', url: R.cab, doc: 'ASM' }); } },
    { w: 2, f: t => { const u = pick(ADMINS.concat([U.mehmet])); add(t, u, 6, 'MÜŞTERİ', pick(CUSTOMER_NAMES) + ' Müşterisinin Eşleştirmesi Güncellendi', { asset: 'Müşteri Eşleştirme', url: R.cust, doc: 'CDB' }); } },
    { w: 6, f: t => { const u = pick(ENGINEERS.concat([U.deniz])); const c = cab(); add(t, u, 6, 'KAPAK KİLİDİ', 'Kabin ' + c + ' kilidi açıldı (' + pick(['ön', 'arka']) + ' kapak)', { asset: 'Kabin ' + c, url: R.locks, doc: 'CMR' }); } },
    { w: 2, f: t => { const u = pick(CUSTOMERS.concat([U.can, U.ayse])); const c = cab(); add(t, u, 4, 'KAPAK KİLİDİ', 'Kabin ' + c + ' kilit açma talebi reddedildi — LCK yetkisi yok', { asset: 'Kabin ' + c, url: u.ip.indexOf('172.16.20.') === 0 ? R.customerApp : R.locks, res: 'denied', doc: 'CMR' }); } },
    { w: 2, f: t => { const u = pick(ENGINEERS); const c = cab(); add(t, u, 6, 'ENERJİ KONTROL', c + ' PDU-' + pick(['A', 'B']) + ' Outlet ' + (1 + Math.floor(rnd() * 24)) + ' ' + pick(['kapatıldı (planlı bakım)', 'açıldı (bakım sonrası)', 'yeniden başlatıldı']), { asset: 'PDU ' + c, url: R.pdu, doc: 'ASM' }); } },
    { w: 1, f: t => { const u = pick([U.mehmet, U.ayse, U.selin]); const c = cab(); add(t, u, 4, 'ENERJİ KONTROL', c + ' PDU-A Outlet kontrol talebi reddedildi — ENRK yetkisi yok', { asset: 'PDU ' + c, url: R.pdu, res: 'denied', doc: 'ASM' }); } },
    { w: 2, f: t => { const u = pick([U.mehmet, U.ayse, U.selin, U.elif, U.can]); const pg = pick([['/dcim/permission-settings', 'ASP', 'İzin Ayarları'], ['/dcim/account-settings', 'ASU', 'Kullanıcı Ayarları'], ['/report-user-logs', 'RPSUL', 'Kullanıcı Logları'], ['/dcim/engineering', 'Mühendislik', 'Mühendislik']]); add(t, u, 4, 'YETKİ', 'Yetkisiz sayfa erişim denemesi: ' + pg[0] + ' (' + pg[1] + ' yetkisi yok)', { asset: pg[2], url: HOST + '/k' + pg[0], res: 'denied' }); } },
    { w: 1, f: t => { const u = pick(ADMINS); const who = pick([['00549854', 'Mehmet Kaya'], ['00553318', 'Emre Çelik'], ['00560042', 'Selin Aydın']]); add(t, u, 4, 'YETKİ', 'Yetki Değişimi: ' + who[0] + ' ACL: güncellendi (rol şablonu)', { asset: 'Kullanıcı ' + who[1] + ' (' + who[0] + ')', url: R.perms }); } },
    { w: 1, f: t => { const u = pick(ADMINS); add(t, u, 6, 'USER', 'Kullanıcı Güncellendi: ' + pick(['Hakan Yıldız', 'Ayşe Demir', 'Burak Şahin', 'Selin Aydın']), { asset: 'Kullanıcı Hesabı', url: R.accounts }); } }
  ];
  const TOTAL_W = TEMPLATES.reduce((n, t) => n + t.w, 0);
  function pickTemplate() {
    let x = rnd() * TOTAL_W;
    for (const t of TEMPLATES) { x -= t.w; if (x < 0) return t; }
    return TEMPLATES[0];
  }

  for (let i = 0; i < 300; i++) {
    // 4 saatten eski, 14 günden yeni; gece saatleri seyrek
    let m = 240 + Math.floor(rnd() * (14 * 1440 - 240));
    const hour = new Date(NOW - m * 60000).getHours();
    if ((hour < 7 || hour > 20) && rnd() < 0.7) m += hour < 7 ? -(hour + 3) * 60 : (hour - 17) * 60;
    pickTemplate().f(ago(Math.max(240, m) + rnd()));
  }

  rows.sort((a, b) => b.tim - a.tim);

  D.auditLogs = {
    rows,
    users: U,
    // Oturumda (permission-settings.html) eklenen YETKİ kayıtları
    sessionRows() {
      let list = [];
      try { list = JSON.parse(window.sessionStorage.getItem('dcim_audit_session') || '[]'); } catch (e) { list = []; }
      return list.map((r, i) => ({
        tim: new Date(r.tim),
        cid: 'CE' + (0x5f0000 + i).toString(16).toUpperCase().padStart(16, '0'),
        cat: r.cat, doc: 'DAS', rid: '', atr: '', txt: r.txt, sta: r.sta,
        evt_prm: JSON.stringify({ user: r.user, ip: r.ip, url: r.url, asset: r.asset, res: r.res })
      }));
    }
  };
})();

/* ==========================================================================
   Etap 3 — energy.html verisi (eski js/mock/energy.data.js)
   ========================================================================== */
/* ==========================================================================
   DCIM Sunum — Enerji Genel Görünüm mock verileri (energy.html)
   SchemaService.componentData$ / tableData$ ve XDB telemetrisinin yerine geçer.
   DCIM.data.energy:
     tree                → Lokasyon Ağacı (getDefaultSidebarList + enrichTreeWithSubItems)
     ups(tick)           → UpsData[] (ups-dashboard devIds/values yapısı), UPS A1–B7
     rectifiers(tick)    → RectifierData[] (+ doğrultucu modülleri)
     generators(tick)    → GeneratorData[] (generator-gauges GaugeData yapısı)
     meterTables(tick)   → TableData[] (energy-table-dashboard başlık/satır/hücre yapısı)
     overview(tick)      → PUE, tesis gücü kırılımı, şebeke/jeneratör durumları
   tick: sayfanın 3 sn'lik canlı yenileme sayacı. Aynı tick → aynı değer (tohumlu gürültü).
   Senaryo (js/mock-data.js ile tutarlı): UPS A5 akü modunda (alarm), UPS A3 akü sıcaklığı
   yüksek, UPS B4 yük %82, UPS B7 SNMP kaybı, A1 KLIMA PANOSU faz dengesizliği; PUE ≈ site.pue.
   Bağımlılık: js/layout-data.js + js/mock-data.js (DCIM.data.ups, panels, site, activeAlarms, rng, hash)
   ========================================================================== */
(function () {
  'use strict';

  const D = window.DCIM.data;
  const TICK_SEC = 3;

  const rngOf = key => D.rng(D.hash(String(key)));
  const between = (rnd, a, b) => a + (b - a) * rnd();
  // Tohumlu gürültü: [-amp, +amp]
  const jit = (key, tick, amp) => (rngOf(key + '#' + tick)() - 0.5) * 2 * amp;
  const r1 = n => Math.round(n * 10) / 10;
  const r2 = n => Math.round(n * 100) / 100;
  const pointVal = (eq, label) => { const p = (eq.points || []).find(x => x.label === label); return p ? Number(p.value) : NaN; };
  const upsCode = label => String(label).replace(/^UPS\s*/i, '');
  const byLabel = (a, b) => a.label.localeCompare(b.label, 'tr', { numeric: true });
  const elapsedMin = tick => (tick * TICK_SEC) / 60;

  const UPS_LIST = D.ups.slice().sort(byLabel);
  const upsByCode = code => UPS_LIST.find(u => upsCode(u.label).toUpperCase() === String(code).toUpperCase()) || null;
  const isBatteryMode = u => u.status === 'alarm' && /Akü/i.test(u.note || '');
  const isLost = u => u.status === 'lost';

  // SNMP kaybının başladığı an (aktif alarm kaydı; yoksa 41 dk önce)
  const lostSince = u => {
    const a = (D.activeAlarms || []).find(x => x.desc === u.label && x.level === 'lost');
    return a ? new Date(a.tim) : new Date(Date.now() - 41 * 60000);
  };

  // ---------------------------------------------------------------------------
  // UPS (ups-dashboard: UpsData { name, devIds, values })
  // 80 kVA modül: çıkış kW ≈ %yük × 0,8; faz akımı = kW / (3 × 230 V); giriş = çıkış / 0,955
  // ---------------------------------------------------------------------------
  const PHASES = ['a', 'b', 'c'];
  function upsDevIds(u) {
    const p = u.devId; // KAT1_SAL1_A5_UPS
    const ids = {};
    ['bypass', 'main', 'out'].forEach(sec => PHASES.forEach(ph => {
      ids[sec + '_v_' + ph] = p + '_' + sec.toUpperCase() + '_V_' + ph.toUpperCase();
      ids[sec + '_a_' + ph] = p + '_' + sec.toUpperCase() + '_A_' + ph.toUpperCase();
    }));
    PHASES.forEach(ph => { ids['out_load_' + ph] = p + '_OUT_LOAD_' + ph.toUpperCase(); });
    ['bypass_freq', 'main_freq', 'out_freq', 'batt_cap', 'batt_runtime', 'batt_v_dc', 'batt_temp', 'batt_curr', 'batt_status'].forEach(k => { ids[k] = p + '_' + k.toUpperCase(); });
    return ids;
  }

  function upsSnapshot(u, tick) {
    const devIds = upsDevIds(u);
    const values = {};
    const V = (value, status) => ({ value, status: status || 'NORMAL' });
    const key = u.label;
    const battery = isBatteryMode(u);
    const lost = isLost(u);
    const em = elapsedMin(tick);

    if (lost) {
      Object.keys(devIds).forEach(k => { values[k] = V('-', 'BAĞLANAMADI'); });
      return {
        name: u.label, code: upsCode(u.label), devId: u.devId, devIds, values,
        mode: 'lost', modeLabel: 'SNMP KAYBI', status: 'lost', note: u.note,
        lostSince: lostSince(u), load: null, runtime: null, bypassState: 'BİLİNMİYOR'
      };
    }

    const seed = rngOf('ups-phase-' + key);
    const phaseOffs = PHASES.map(() => between(seed, -2.5, 2.5));
    const inV = pointVal(u, 'Giriş Gerilimi (L1)') || 230;
    const outV = pointVal(u, 'Çıkış Gerilimi (L1)') || 230;
    let loadSum = 0;
    PHASES.forEach((ph, i) => {
      const load = Math.max(0, u.load + phaseOffs[i] + jit(key + 'ld' + ph, tick, 0.6));
      loadSum += load;
      const loadSt = load > 90 ? 'ALARM' : load > 80 ? 'UYARI' : 'NORMAL';
      const outA = (load / 100) * 80000 / (3 * 230);
      values['out_load_' + ph] = V(Math.round(load), loadSt);
      values['out_a_' + ph] = V(r1(outA), loadSt === 'NORMAL' ? 'NORMAL' : loadSt);
      values['out_v_' + ph] = V(r1(outV + jit(key + 'ov' + ph, tick, 0.5)));
      values['bypass_v_' + ph] = V(r1(inV + 0.8 + phaseOffs[i] * 0.4 + jit(key + 'bv' + ph, tick, 0.6)));
      values['bypass_a_' + ph] = V(0);
      if (battery) {
        values['main_v_' + ph] = V(0, 'ALARM');
        values['main_a_' + ph] = V(0, 'ALARM');
      } else {
        values['main_v_' + ph] = V(r1(inV + phaseOffs[i] * 0.5 + jit(key + 'mv' + ph, tick, 0.7)));
        values['main_a_' + ph] = V(r1(outA / 0.955 + 1.2 + jit(key + 'ma' + ph, tick, 0.4)));
      }
    });
    const load = loadSum / 3;
    values.bypass_freq = V(r2(50 + jit(key + 'bf', tick, 0.03)));
    values.main_freq = battery ? V(0, 'ALARM') : V(r2(50 + jit(key + 'mf', tick, 0.03)));
    values.out_freq = V(r2(50 + jit(key + 'of', tick, 0.01)));

    const bTemp = pointVal(u, 'Akü Sıcaklığı');
    values.batt_temp = V(r1(bTemp + jit(key + 'bt', tick, 0.1)), bTemp > 30 ? 'UYARI' : 'NORMAL');
    if (battery) {
      const cap = Math.max(8, 64 - em * 1.6);
      const run = Math.max(3, 18 - em);
      values.batt_cap = V(Math.round(cap), cap < 30 ? 'ALARM' : 'UYARI');
      values.batt_runtime = V(Math.round(run), 'ALARM');
      values.batt_v_dc = V(r1(Math.max(470, 518 - em * 0.9) + jit(key + 'bv', tick, 0.4)), 'UYARI');
      values.batt_curr = V(r1(96 + (load - 52) * 1.6 + jit(key + 'bc', tick, 1.5)), 'UYARI');
      values.batt_status = V('DEŞARJ', 'ALARM');
    } else {
      values.batt_cap = V(100);
      values.batt_runtime = V(Math.round(pointVal(u, 'Kalan Akü Süresi')));
      values.batt_v_dc = V(r1(545.6 + jit(key + 'bv', tick, 0.4)));
      values.batt_curr = V(r1(0.6 + jit(key + 'bc', tick, 0.15)));
      values.batt_status = V('FLOAT');
    }

    const warn = u.status === 'warning';
    return {
      name: u.label, code: upsCode(u.label), devId: u.devId, devIds, values,
      mode: battery ? 'battery' : 'online',
      modeLabel: battery ? 'AKÜ MODU' : 'ONLINE (ŞEBEKE)',
      status: battery ? 'alarm' : warn ? 'warning' : 'normal',
      note: u.note,
      load: Math.round(load),
      runtime: values.batt_runtime.value,
      bypassState: 'HAZIR (BEKLEMEDE)'
    };
  }

  function upsList(tick) { return UPS_LIST.map(u => upsSnapshot(u, tick || 0)); }

  // UPS giriş gücü (kW) — enerji analizörleri ve PUE için (akü modunda 0; SNMP kaybı analizörü etkilemez)
  function upsInputKw(u, tick) {
    if (isBatteryMode(u)) return 0;
    return (u.load || 50) * 0.8 / 0.955 * (1 + jit('upsin' + u.label, tick, 0.008));
  }
  function upsOutputKw(u, tick) { return (u.load || 50) * 0.8 * (1 + jit('upsout' + u.label, tick, 0.006)); }

  // ---------------------------------------------------------------------------
  // Redresör (rectifier-dashboard: RectifierData) — 48 V DC telekom besleme
  // ---------------------------------------------------------------------------
  const RECT_DEFS = [
    { name: 'Redresör Paneli 1', id: 'RECT1', place: 'A Blok DC Enerji Odası', loadA: 182, modules: 6, standby: [6], temp: 23.8, runtime: 6.4, acBase: 230.4 },
    { name: 'Redresör Paneli 2', id: 'RECT2', place: 'B Blok DC Enerji Odası', loadA: 146, modules: 6, standby: [5, 6], temp: 24.3, runtime: 7.9, acBase: 229.6 }
  ];
  function rectifiers(tick) {
    return RECT_DEFS.map(r => {
      const k = r.id;
      const ph = ['R', 'S', 'T'].map((p, i) => ({ phase: p, voltage: { value: r1(r.acBase + [0.6, -0.8, 0.3][i] + jit(k + p, tick, 0.5)), status: 'NORMAL' } }));
      const avg = ph.reduce((s, x) => s + x.voltage.value, 0) / 3;
      const loadA = r.loadA + jit(k + 'la', tick, 1.8);
      const charge = 3.6 + jit(k + 'ch', tick, 0.3);
      const outA = loadA + charge;
      const active = r.modules - r.standby.length;
      const mods = [];
      for (let i = 1; i <= r.modules; i++) {
        const standby = r.standby.indexOf(i) >= 0;
        mods.push({
          id: 'RM-' + i,
          status: standby ? 'BEKLEMEDE' : 'NORMAL',
          current: standby ? 0 : r1(outA / active + jit(k + 'm' + i, tick, 0.6)),
          temp: r1((standby ? 27 : 36) + between(rngOf(k + 'mt' + i), -1.5, 2.5) + jit(k + 'mtj' + i, tick, 0.2))
        });
      }
      const devIds = {
        alarm: k + '_ALARM', avgAcVoltage: k + '_AC_VOLT_AVG', R: k + '_R_VOLT', S: k + '_S_VOLT', T: k + '_T_VOLT',
        outputCurrent: k + '_RECT_CURR_OUT', loadVoltage: k + '_LOAD_VOLT', loadCurrent: k + '_LOAD_CURR',
        batteryVoltage: k + '_BATT_VOLT', batteryTemp: k + '_BATT_TEMP', batteryRuntime: k + '_BATT_RUNTIME',
        capacity: k + '_BATT_CAP_AVAIL', usedCapacity: k + '_BATT_CAP_USED', batteryAlarm: k + '_BATT_ALARM_TXT'
      };
      return {
        name: r.name,
        place: r.place,
        alarm: false,
        devIds,
        acInput: ph,
        averageAcVoltage: { value: avg, status: 'NORMAL' },
        outputCurrent: { value: outA, status: 'NORMAL' },
        loadVoltage: { value: 53.52 + jit(k + 'lv', tick, 0.02), status: 'NORMAL' },
        loadCurrent: { value: loadA, status: 'NORMAL' },
        batteryVoltage: { value: 53.48 + jit(k + 'bv', tick, 0.02), status: 'NORMAL' },
        batteryTemp: { value: r.temp + jit(k + 'bt', tick, 0.1), status: 'NORMAL' },
        batteryRuntime: { value: r.runtime + jit(k + 'br', tick, 0.05), status: 'NORMAL' },
        capacity: { value: 100, status: 'NORMAL' },
        usedCapacity: { value: 0, status: 'NORMAL' },
        batteryAlarm: 'OK',
        modules: mods,
        activeModules: active
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Jeneratör (generator-gauges: GeneratorData { name, gauges: GaugeData[] })
  // A kolu: haftalık yüksüz test çalışması (ATS şebekede) · B kolu: otomatikte hazır
  // ---------------------------------------------------------------------------
  const GAUGE_DEFS = [
    { key: 'VOLT', ioDescription: 'Voltaj (V)', unit: 'V', scaleTicks: [0, 100, 200, 300, 400, 500], colorRanges: [{ from: 0, to: 350, color: '#f59e0b' }, { from: 350, to: 440, color: '#10b981' }, { from: 440, to: 500, color: '#ef4444' }] },
    { key: 'FREQ', ioDescription: 'Frekans (Hz)', unit: 'Hz', scaleTicks: [0, 20, 40, 50, 60, 80], colorRanges: [{ from: 0, to: 45, color: '#f59e0b' }, { from: 45, to: 55, color: '#10b981' }, { from: 55, to: 80, color: '#ef4444' }] },
    { key: 'RPM', ioDescription: 'Motor Devri (RPM)', unit: 'RPM', scaleTicks: [0, 500, 1000, 1500, 2000], colorRanges: [{ from: 0, to: 1400, color: '#f59e0b' }, { from: 1400, to: 1600, color: '#10b981' }, { from: 1600, to: 2000, color: '#ef4444' }] },
    { key: 'FUEL', ioDescription: 'Yakıt Seviyesi (%)', unit: '%', scaleTicks: [0, 20, 40, 60, 80, 100], colorRanges: [{ from: 0, to: 20, color: '#ef4444' }, { from: 20, to: 40, color: '#f59e0b' }, { from: 40, to: 100, color: '#10b981' }] },
    { key: 'OILP', ioDescription: 'Yağ Basıncı (bar)', unit: 'bar', scaleTicks: [0, 2, 4, 6, 8, 10], colorRanges: [{ from: 0, to: 2, color: '#ef4444' }, { from: 2, to: 3, color: '#f59e0b' }, { from: 3, to: 6, color: '#10b981' }, { from: 6, to: 10, color: '#f59e0b' }] },
    { key: 'WTEMP', ioDescription: 'Su Sıcaklığı (°C)', unit: '°C', scaleTicks: [0, 30, 60, 90, 120], colorRanges: [{ from: 0, to: 40, color: '#f59e0b' }, { from: 40, to: 95, color: '#10b981' }, { from: 95, to: 105, color: '#f59e0b' }, { from: 105, to: 120, color: '#ef4444' }] }
  ];
  const GEN_DEFS = [
    { id: 'GENA', name: 'Jeneratör A Kolu', side: 'A', running: true, mode: 'TEST ÇALIŞMASI', modeNote: 'Haftalık yüksüz test · ATS şebekede', fuel: 87.4, water: 74.5, oil: 4.3, hours: 1284.6 },
    { id: 'GENB', name: 'Jeneratör B Kolu', side: 'B', running: false, mode: 'OTOMATİK · HAZIR', modeNote: 'Blok ısıtıcı aktif · ATS şebekede', fuel: 94.2, water: 41.5, oil: 0, hours: 1197.2 }
  ];
  function generators(tick) {
    const now = new Date();
    const em = elapsedMin(tick);
    return GEN_DEFS.map(g => {
      const k = g.id;
      const val = key => {
        if (!g.running) {
          if (key === 'FUEL') return g.fuel + jit(k + key, tick, 0.02);
          if (key === 'WTEMP') return g.water + jit(k + key, tick, 0.2);
          return 0;
        }
        switch (key) {
          case 'VOLT': return 400 + jit(k + key, tick, 1.6);
          case 'FREQ': return 50 + jit(k + key, tick, 0.06);
          case 'RPM': return 1500 + jit(k + key, tick, 5);
          case 'FUEL': return Math.max(0, g.fuel - em * 0.04) + jit(k + key, tick, 0.03);
          case 'OILP': return g.oil + jit(k + key, tick, 0.06);
          case 'WTEMP': return Math.min(84, g.water + em * 0.45) + jit(k + key, tick, 0.2);
          default: return 0;
        }
      };
      return {
        name: g.name, id: g.id, side: g.side, running: g.running, mode: g.mode, modeNote: g.modeNote,
        runHours: r1(g.hours + (g.running ? em / 60 : 0)),
        gauges: GAUGE_DEFS.map(d => ({
          devIds: [k + '_' + d.key],
          aggregation: 'sum',
          ioDescription: d.ioDescription,
          value: val(d.key),
          unit: d.unit,
          scaleTicks: d.scaleTicks.slice(),
          colorRanges: d.colorRanges.map(c => Object.assign({}, c)),
          connectionStatus: 'var',
          unknownRowData: '',
          lastUpdateTime: now
        }))
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Enerji analizörleri (energy-table-dashboard: TableData { title, headers, rows[{cells}] })
  // ---------------------------------------------------------------------------
  const PANEL_BY_LABEL = label => D.panels.find(p => p.label === label) || null;
  const UPS_GROUP = codes => codes.map(upsByCode).filter(Boolean);
  // Aydınlatma / yardımcı servisler: PUE hedefini (site.pue) sağlayan temel yük
  const BASE_IT = UPS_LIST.reduce((s, u) => s + (isBatteryMode(u) ? 0 : (u.load || 50) * 0.8 / 0.955), 0);
  const BASE_COOL = D.panels.reduce((s, p) => s + (pointVal(p, 'Toplam Aktif Güç') || 0), 0);
  const TARGET_PUE = (D.site && D.site.pue) || 1.42;
  const BASE_AUX = Math.max(6, BASE_IT * (TARGET_PUE - 1) - BASE_COOL);

  // Analizör tanımları: kind: ups | panel | aux | sum | comp; aggregate: üst seviye (KPI toplamına katılmaz)
  const METER_TABLES = [
    {
      title: 'Genel — Trafo ve Ana Dağıtım (Kat 1 Enerji Tek Hat)', meters: [
        { id: 'T00_MASTER_PMM1', name: 'Master Pano PMM-1', kind: 'sum', of: ['A', 'B'], aggregate: true },
        { id: 'T00_TR1_OUT', name: 'TR-1 Trafo Çıkışı (A Kolu)', kind: 'sum', of: ['A'], aggregate: true },
        { id: 'T00_TR2_OUT', name: 'TR-2 Trafo Çıkışı (B Kolu)', kind: 'sum', of: ['B'], aggregate: true },
        { id: 'T00_KOMP1', name: 'Kompanzasyon-1', kind: 'comp' }
      ]
    },
    {
      title: 'A Blok — Analizörler', meters: [
        { id: 'T00_A_SYNC', name: 'SYNC. Analizor', kind: 'sum', of: ['A'], aggregate: true },
        { id: 'T00_AD_AN1', name: 'AD. Analizor-1 (UPS A1–A4 Giriş)', kind: 'ups', ups: ['A1', 'A2', 'A3', 'A4'], side: 'A' },
        { id: 'T00_AD_AN2', name: 'AD. Analizor-2 (UPS A5–A7 Giriş)', kind: 'ups', ups: ['A5', 'A6', 'A7'], side: 'A' },
        { id: 'T00_AD_AN3', name: 'AD. Analizor-3 (A1 KLIMA PANOSU)', kind: 'panel', panel: 'A1 KLIMA PANOSU', side: 'A' },
        { id: 'T00_A1_KLM', name: 'A1 Klima Panosu PMM', kind: 'panel', panel: 'A1 Klima Panosu', side: 'A' },
        { id: 'T00_A2_KLM', name: 'A2 Klima Panosu PMM', kind: 'panel', panel: 'A2 Klima Panosu', side: 'A' },
        { id: 'T00_A3_KLM', name: 'A3 Klima Panosu (113 114) PMM', kind: 'panel', panel: 'A3 Klima Panosu (113 114)', side: 'A' }
      ]
    },
    {
      title: 'B Blok — Analizörler', meters: [
        { id: 'T00_BD_AN', name: 'BD. Analizor', kind: 'sum', of: ['B'], aggregate: true },
        { id: 'T00_B_AN2', name: 'Analizor-2 (UPS B1–B4 Giriş)', kind: 'ups', ups: ['B1', 'B2', 'B3', 'B4'], side: 'B' },
        { id: 'T00_B_AN3', name: 'Analizor-3 (UPS B5–B7 Giriş)', kind: 'ups', ups: ['B5', 'B6', 'B7'], side: 'B' },
        { id: 'T00_B_AN4', name: 'Analizor-4 (Aydınlatma / Yardımcı)', kind: 'aux', side: 'B' },
        { id: 'T00_B1_KLM', name: 'B1 Klima Panosu PMM', kind: 'panel', panel: 'B1 Klima Panosu', side: 'B' },
        { id: 'T00_B2_KLM', name: 'B2 Klima Panosu PMM', kind: 'panel', panel: 'B2 Klima Panosu', side: 'B' },
        { id: 'T00_KLM_KONTROL', name: 'Klimalar Kontrol Panosu PMM', kind: 'panel', panel: 'Klimalar Kontrol Panosu', side: 'B' }
      ]
    }
  ];
  const ALL_METERS = METER_TABLES.reduce((a, t) => a.concat(t.meters), []);

  // Başlıklar: devId/başlık eşleşmeleri energy-table-dashboard KPI mantığıyla uyumlu (başlıkta "GÜÇ" geçen sütun güç
  // sayılır → reaktif sütun "Reaktif (kvar)"; F-N gerilimi ortalamayı bozacağı için eklenmedi). hidden → yalnızca "Detayları Göster"
  const HEADERS = [
    { title: 'Ekipman', devId: 'NAME' },
    { title: 'Akım Faz A', devId: '_PA_CURR' },
    { title: 'Akım Faz B', devId: '_PB_CURR' },
    { title: 'Akım Faz C', devId: '_PC_CURR' },
    { title: 'Ort. Hat V', devId: '_AVG_LV' },
    { title: 'Frekans', devId: '_FREQ' },
    { title: 'Aktif Güç', devId: '_TOT_POW' },
    { title: 'Reaktif (kvar)', devId: '_TOT_KVAR', hidden: true },
    { title: 'PF (cos φ)', devId: '_TOT_PF' },
    { title: 'Aktif Enerji', devId: '_IMP_KWH' },
    { title: 'Reaktif Enerji', devId: '_IMP_KVARH' },
    { title: 'THD-I', devId: '_THD_I', hidden: true }
  ];

  const STA = { NORMAL: '0x0303', UYARI: '0x0307', ALARM: '0x030B', LOST: '0x0301' };

  // Bir analizörün anlık elektriksel değerleri
  function meterRaw(m, tick) {
    const k = m.id;
    let kw = 0;
    let pf = 0.97;
    let phaseI = null;
    let thd = 4;
    let warnPhase = -1;
    if (m.kind === 'ups') {
      kw = UPS_GROUP(m.ups).reduce((s, u) => s + upsInputKw(u, tick), 0);
      pf = 0.99 + jit(k + 'pf', tick, 0.003);
      thd = 3.2 + between(rngOf(k + 'thd'), 0, 1.4);
    } else if (m.kind === 'panel') {
      const p = PANEL_BY_LABEL(m.panel);
      kw = (pointVal(p, 'Toplam Aktif Güç') || 30) * (1 + jit(k + 'kw', tick, 0.012));
      pf = (pointVal(p, 'Güç Faktörü') || 0.96) + jit(k + 'pf', tick, 0.004);
      thd = pointVal(p, 'THD-I') || 4;
      const bases = [pointVal(p, 'L1 Akım'), pointVal(p, 'L2 Akım'), pointVal(p, 'L3 Akım')];
      phaseI = bases.map((b, i) => b * (1 + jit(k + 'i' + i, tick, 0.012)));
      const pSt = (p.points || []).find(x => x.label === 'L3 Akım');
      if (pSt && pSt.status === 'warning') warnPhase = 2;
    } else if (m.kind === 'aux') {
      kw = BASE_AUX * (1 + jit(k + 'kw', tick, 0.03));
      pf = 0.93 + jit(k + 'pf', tick, 0.005);
      thd = 8.4;
    } else if (m.kind === 'comp') {
      kw = 0.42 + jit(k + 'kw', tick, 0.03);
      pf = null; // kondansatör bankası: cos φ anlamsız
      thd = 2.1;
    } else if (m.kind === 'sum') {
      const parts = ALL_METERS.filter(x => !x.aggregate && x.side && m.of.indexOf(x.side) >= 0).map(x => meterRaw(x, tick));
      kw = parts.reduce((s, x) => s + x.kw, 0);
      const kvar = parts.reduce((s, x) => s + x.kvar, 0);
      pf = kw > 0 ? Math.cos(Math.atan(kvar / kw)) : 0.97;
      phaseI = [0, 1, 2].map(i => parts.reduce((s, x) => s + x.phaseI[i], 0));
      thd = 3.9;
    }
    const vLN = 230.2 + between(rngOf(k + 'v'), -1.4, 1.4) + jit(k + 'v', tick, 0.4);
    const vLL = vLN * Math.sqrt(3);
    if (!phaseI) {
      const perPhase = m.kind === 'comp' ? 61.5 : (kw * 1000) / (3 * vLN * (pf || 1));
      const offs = [0, 1, 2].map(i => between(rngOf(k + 'po' + i), -0.025, 0.025));
      phaseI = offs.map((o, i) => Math.max(0, perPhase * (1 + o + jit(k + 'pi' + i, tick, 0.008))));
    }
    const kvar = m.kind === 'comp' ? -(118 + jit(k + 'kvar', tick, 1.2)) : kw * Math.tan(Math.acos(Math.min(0.9999, pf || 0.97)));
    return { kw, kvar, pf, phaseI, vLN, vLL, thd, warnPhase, freq: 50 + jit('grid-freq', tick, 0.02) };
  }

  // Sayaç (kWh / kvarh) — ortak sayaç sıfırlama anından bu yana (üst/alt analizör toplamları tutarlı) + canlı artış
  const COUNTER_HOURS = 14236.5;
  function counters(m, raw, tick) {
    const hours = COUNTER_HOURS;
    const baseKw = m.kind === 'comp' ? 0.4 : Math.max(1, raw.kw);
    const kwh0 = baseKw * hours;
    const kvarh0 = Math.abs(raw.kvar) * hours * 0.96;
    const dtH = (tick * TICK_SEC) / 3600;
    return { kwh: kwh0 + raw.kw * dtH, kvarh: kvarh0 + Math.abs(raw.kvar) * dtH };
  }

  function meterRow(m, tick) {
    const raw = meterRaw(m, tick);
    const cnt = counters(m, raw, tick);
    const C = (value, unit, sta) => ({ value, unit: unit || '', sta: sta || STA.NORMAL });
    const cells = [
      { value: m.name, unit: '' },
      C(r1(raw.phaseI[0]), 'A', raw.warnPhase === 0 ? STA.UYARI : STA.NORMAL),
      C(r1(raw.phaseI[1]), 'A', raw.warnPhase === 1 ? STA.UYARI : STA.NORMAL),
      C(r1(raw.phaseI[2]), 'A', raw.warnPhase === 2 ? STA.UYARI : STA.NORMAL),
      C(r1(raw.vLL), 'V'),
      C(r2(raw.freq), 'Hz'),
      C(r1(raw.kw), 'kW'),
      C(r1(raw.kvar), 'kvar'),
      raw.pf == null ? { value: '-', unit: '' } : C(r2(raw.pf), ''),
      C(Math.round(cnt.kwh), 'kWh'),
      C(Math.round(cnt.kvarh), 'kvarh'),
      C(r1(raw.thd), '%')
    ];
    return { id: m.id, aggregate: !!m.aggregate, hidden: false, cells, kw: raw.kw };
  }

  function meterTables(tick) {
    return METER_TABLES.map(t => ({
      title: t.title,
      headers: HEADERS.map(h => Object.assign({}, h)),
      rows: t.meters.map(m => meterRow(m, tick || 0))
    }));
  }

  // ---------------------------------------------------------------------------
  // Genel Bakış — PUE = Tesis / BT (BT = UPS giriş güçleri; reports PUE kaynaklarıyla aynı tanım)
  // ---------------------------------------------------------------------------
  function overview(tick) {
    tick = tick || 0;
    const itKw = UPS_LIST.reduce((s, u) => s + upsInputKw(u, tick), 0);
    const upsOutKw = UPS_LIST.reduce((s, u) => s + upsOutputKw(u, tick), 0);
    const coolKw = D.panels.reduce((s, p) => s + (pointVal(p, 'Toplam Aktif Güç') || 0) * (1 + jit('cool' + p.label, tick, 0.012)), 0);
    const auxKw = BASE_AUX * (1 + jit('aux', tick, 0.03));
    const facilityKw = itKw + coolKw + auxKw;
    const sideKw = side => ALL_METERS.filter(m => !m.aggregate && m.side === side).reduce((s, m) => s + meterRaw(m, tick).kw, 0);
    const aKw = sideKw('A');
    const bKw = sideKw('B');
    const gens = generators(tick);
    const genVal = (g, key) => { const x = g.gauges.find(q => q.devIds[0].indexOf('_' + key) > 0); return x ? x.value : 0; };
    const upsA = UPS_LIST.filter(u => /^UPS A/i.test(u.label));
    const upsB = UPS_LIST.filter(u => /^UPS B/i.test(u.label));
    const groupState = list => ({
      count: list.length,
      alarm: list.filter(u => u.status === 'alarm').length,
      warning: list.filter(u => u.status === 'warning').length,
      lost: list.filter(u => u.status === 'lost').length,
      battery: list.filter(isBatteryMode).map(u => u.label),
      outKw: list.reduce((s, u) => s + upsOutputKw(u, tick), 0)
    });
    const grid = (side, kw, tr) => ({
      side, name: 'Şebeke Besleme ' + side + ' (' + tr + ')', status: 'normal', stateLabel: 'ŞEBEKEDE',
      voltage: 400.6 + jit('gridv' + side, tick, 1.1), freq: 50 + jit('grid-freq', tick, 0.02), kw
    });
    return {
      pue: facilityKw / itKw,
      cue: D.site && D.site.cue != null ? D.site.cue : null,
      facilityKw, itKw, upsOutKw, coolKw, auxKw,
      upsLossKw: itKw - UPS_LIST.filter(u => !isBatteryMode(u)).reduce((s, u) => s + upsOutputKw(u, tick), 0),
      grids: [grid('A', aKw, 'TR-1'), grid('B', bKw, 'TR-2')],
      gens: gens.map(g => ({
        name: g.name, side: g.side, running: g.running, mode: g.mode, modeNote: g.modeNote, runHours: g.runHours,
        voltage: genVal(g, 'VOLT'), freq: genVal(g, 'FREQ'), rpm: genVal(g, 'RPM'), fuel: genVal(g, 'FUEL'), water: genVal(g, 'WTEMP')
      })),
      upsA: groupState(upsA),
      upsB: groupState(upsB),
      coolA: D.panels.filter(p => /^A/i.test(p.label)).reduce((s, p) => s + (pointVal(p, 'Toplam Aktif Güç') || 0), 0),
      coolB: D.panels.filter(p => !/^A/i.test(p.label)).reduce((s, p) => s + (pointVal(p, 'Toplam Aktif Güç') || 0), 0),
      coolWarn: D.panels.filter(p => p.status === 'warning').map(p => p.label)
    };
  }

  // ---------------------------------------------------------------------------
  // Lokasyon Ağacı (getDefaultSidebarList + enrichTreeWithSubItems)
  // Yaprakların "go" alanı sunumdaki sekme/seçim eşlemesidir.
  // ---------------------------------------------------------------------------
  const tree = [
    {
      id: 'EN01000000000000', title: 'TÜRK TELEKOM', children: [
        {
          id: 'EN01010000000000', title: 'ANKARA', children: [
            {
              id: 'EN01010100000000', title: 'ÜMİTKÖY', children: [
                { id: 'EN01010101000000', title: 'IDC4', go: { unavailable: true } },
                {
                  id: 'EN01010102000000', title: 'IDC1', children: [
                    { id: 'EN01010102010000', title: 'Genel', go: { tab: 'overview' } },
                    {
                      id: 'EN01010102020000', title: 'A Blok', go: { tab: 'meters', q: 'A Blok' }, children: [
                        { id: 'EN0101010202000000', title: 'Tek Hat', go: { tab: 'overview' } },
                        { id: 'EN0101010202000000b', title: 'Sync Analizör', go: { tab: 'meters', q: 'SYNC' } },
                        { id: 'EN0101010202000000c', title: 'AD. Analizör-1', go: { tab: 'meters', q: 'AD. Analizor-1' } },
                        { id: 'EN0101010202000000d', title: 'AD. Analizör-2', go: { tab: 'meters', q: 'AD. Analizor-2' } },
                        { id: 'EN0101010202000000e', title: 'AD. Analizör-3', go: { tab: 'meters', q: 'AD. Analizor-3' } }
                      ]
                    },
                    {
                      id: 'EN01010102030000', title: 'B Blok', go: { tab: 'meters', q: 'B Blok' }, children: [
                        { id: 'EN0101010203000000', title: 'Tek Hat', go: { tab: 'overview' } },
                        { id: 'EN0101010203000000b', title: 'BD. Analizör', go: { tab: 'meters', q: 'BD. Analizor' } },
                        { id: 'EN0101010203000000c', title: 'Analizör 2', go: { tab: 'meters', q: 'Analizor-2 (UPS B' } },
                        { id: 'EN0101010203000000d', title: 'Analizör 3', go: { tab: 'meters', q: 'Analizor-3 (UPS B' } },
                        { id: 'EN0101010203000000e', title: 'Analizör 4', go: { tab: 'meters', q: 'Analizor-4' } }
                      ]
                    },
                    { id: 'EN01010103000000', title: 'Kompanzasyon', go: { tab: 'meters', q: 'Kompanzasyon' } },
                    {
                      id: 'EN01010104000000', title: 'Jeneratör', go: { tab: 'generator' }, children: [
                        { id: 'EN0101010400000000', title: 'Jeneratör A Kolu', go: { tab: 'generator', gen: 'A' } },
                        { id: 'EN0101010400000000b', title: 'Jeneratör B Kolu', go: { tab: 'generator', gen: 'B' } }
                      ]
                    },
                    { id: 'EN01010105000000', title: 'Redresör', go: { tab: 'rectifier' } },
                    {
                      id: 'EN01010106000000', title: 'UPS', go: { tab: 'ups' },
                      children: UPS_LIST.map(u => ({ id: 'UPS-' + upsCode(u.label), title: u.label, go: { tab: 'ups', ups: upsCode(u.label) }, status: u.status }))
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ];

  D.energy = {
    TICK_SEC,
    tree,
    upsCodes: UPS_LIST.map(u => upsCode(u.label)),
    ups: upsList,
    rectifiers,
    generators,
    meterTables,
    overview,
    energyAlarms: () => (D.activeAlarms || []).filter(a => a.grp === 'Enerji Grubu')
  };
})();
