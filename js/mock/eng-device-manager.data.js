/* ==========================================================================
   DCIM Sunum — Cihaz Ekle (Model Kütüphanesi) mock verisi (DCIM.data.deviceManager)
   NewUICMPDeviceManagerComponent + DeviceManagerService yerine geçer:
     doc('CMR/TMP')/descendant::mdl json()                → models
     SiteModelService.floors() + LOC salonları             → floors (1. / 2. / 3. Kat + DCB)
     doc('CMR/Txx')/descendant::con (con_ses, cihaz sayısı) → connections(floorKey)
     ENERGY_List_static                                    → energyLocs(floorKey)
     {"cmd":"dev_add","dry_run":true|false,...} (db_CMR.js kapısı) → gate(rows, dryRun, floorKey, hallId)
   TÜM VERİ KURGUSALDIR. Model kimlikleri/kütüphane sahadaki CMR/TMP kaydından alınmadı; IP'ler 10.201.x.y.
   Bağlantılar ve mevcut cihazlar DCIM.data.engSystem (js/mock/eng-home.data.js) ile aynıdır.
   Sunum oturumunda eklenen cihazlar sessionStorage 'dcim_eng_devadd_v1' kuyruğunda tutulur (sekme kapanınca sıfırlanır).
   Bağımlılık: js/mock-data.js, js/mock/eng-home.data.js
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D) return;

  const rngOf = key => D.rng(D.hash(String(key)));

  // ---- Model kütüphanesi -------------------------------------------------------------
  // [id, marka, model, tip, protokol, açıklama, varsayılan bağlantı, port, katlar, snmp varsayılanları]
  const ALL = 'T00 T01 T02 T03 T09';
  const PDU_K = 'T01 T02 T03';
  const RAW = [
    ['MDL_RARITAN_PX3_5145R', 'Raritan', 'PX3-5145R', 'pdu', 'snmp', 'Kabin PDU 1F 32A, 24 çıkış', 'SNMP_PDU_1', '161', PDU_K, { ver: 'V2C', com: true }],
    ['MDL_RARITAN_PX3_5530V', 'Raritan', 'PX3-5530V', 'pdu', 'snmp', 'Kabin PDU 3F 16A, 36 çıkış', 'SNMP_PDU_2', '161', PDU_K, { ver: 'V2C', com: true }],
    ['MDL_RARITAN_PX4_5260', 'Raritan', 'PX4-5260', 'pdu', 'snmp', 'Kabin PDU 3F 32A, 42 çıkış (SNMPv3)', 'SNMP_PDU_3', '161', 'T02 T03', { ver: 'V3', auth: 'SHA', priv: 'AES' }],
    ['MDL_APC_AP8959EU3', 'APC', 'AP8959EU3', 'pdu', 'snmp', 'Rack PDU 9000 Switched 1F 16A', 'SNMP_PDU_1', '161', PDU_K, { ver: 'V1', com: true }],
    ['MDL_APC_AP8853', 'APC', 'AP8853', 'pdu', 'snmp', 'Rack PDU 2G Switched 3F 16A', 'SNMP_PDU_4', '161', PDU_K, { ver: 'V2C', com: true }],
    ['MDL_APC_AP8641', 'APC', 'AP8641', 'pdu', 'snmp', 'Rack PDU 2G Metered-by-Outlet', 'SNMP_PDU_4', '161', 'T01', { ver: 'V2C' }],
    ['MDL_VERTIV_GEIST_MN03', 'Vertiv', 'Geist rPDU MN03', 'pdu', 'snmp', 'Geist rPDU 3F 32A, 30 çıkış', 'SNMP_PDU_5', '161', 'T01 T02', { ver: 'V2C', com: true }],
    ['MDL_EATON_EMA107', 'Eaton', 'ePDU G3 EMA107', 'pdu', 'snmp', 'ePDU G3 Managed 1F 32A', 'SNMP_PDU_6', '161', 'T01', { ver: 'V2C', com: true }],
    ['MDL_LEGRAND_PX2', 'Legrand', 'PX2-1190CR', 'pdu', 'snmp', 'Kabin PDU 1F 16A, 20 çıkış', 'SNMP_PDU_2', '161', 'T03', { ver: 'V2C' }],
    ['MDL_SCHNEIDER_EPDU_M3', 'Schneider Electric', 'EPDU M3 3F', 'pdu', 'snmp', 'Metered ePDU 3F 32A', 'SNMP_PDU_3', '161', 'T01 T02', { ver: 'V2C', com: true }],
    ['MDL_JANITZA_UMG604', 'Janitza', 'UMG 604-PRO', 'pmm', 'modbus', 'Güç kalitesi analizörü (PMM)', 'MB_SENSOR_1', '502', 'T00', null],
    ['MDL_JANITZA_UMG96PA', 'Janitza', 'UMG 96-PA', 'pmm', 'modbus', 'Panel tipi enerji ölçer (PMM)', 'MB_SENSOR_2', '502', 'T00 T09', null],
    ['MDL_SCHNEIDER_PM5560', 'Schneider Electric', 'PowerLogic PM5560', 'pmm', 'modbus', 'Güç ölçer, Ethernet (PMM)', 'MB_ENERJI', '502', 'T09', null],
    ['MDL_VERTIV_EXM2_80', 'Vertiv', 'Liebert EXM2 80kVA', 'ups', 'snmp', 'Modüler UPS 80 kVA', 'SNMP_UPS', '161', 'T00 T09', { ver: 'V2C', com: true }],
    ['MDL_VERTIV_EXL_S1_200', 'Vertiv', 'Liebert EXL S1 200kVA', 'ups', 'snmp', 'UPS 200 kVA', 'SNMP_UPS', '161', 'T00', { ver: 'V2C', com: true }],
    ['MDL_HUAWEI_UPS5000E', 'Huawei', 'UPS5000-E 120kVA', 'ups', 'snmp', 'Modüler UPS 120 kVA', 'SNMP_UPS', '161', 'T00 T09', { ver: 'V3', auth: 'SHA256', priv: 'AES' }],
    ['MDL_APC_SRT3000', 'APC', 'Smart-UPS SRT 3000', 'ups', 'snmp', 'Rack UPS 3 kVA (NMC)', 'SNMP_UPS', '161', 'T00', { ver: 'V1', com: true }],
    ['MDL_EATON_93PM_100', 'Eaton', '93PM 100kW', 'ups', 'snmp', 'UPS 100 kW', 'SNMP_UPS', '161', 'T09', { ver: 'V2C' }],
    ['MDL_RIELLO_MPW_60', 'Riello', 'Multi Power MPW 60', 'ups', 'snmp', 'Modüler UPS 60 kW', 'SNMP_UPS', '161', '', { ver: 'V2C' }],
    ['MDL_ELTEK_FP2_48', 'Eltek', 'Flatpack2 48V', 'rectifier', 'snmp', 'DC güç sistemi 48 V (Smartpack2)', 'SNMP_UPS', '161', 'T00', { ver: 'V2C', com: true }],
    ['MDL_HUAWEI_ETP48400', 'Huawei', 'ETP48400-C4A1', 'rectifier', 'snmp', 'Redresör sistemi 48 V 400 A', 'SNMP_UPS', '161', 'T00 T09', { ver: 'V2C' }],
    ['MDL_SOCOMEC_DIRIS_A40', 'Socomec', 'DIRIS A-40', 'dist_panel', 'modbus', 'Dağıtım panosu çok fonksiyonlu ölçer', 'MB_ENERJI', '502', 'T09', null],
    ['MDL_ABB_M4M30', 'ABB', 'M4M 30', 'dist_panel', 'modbus', 'Dağıtım panosu ağ analizörü', 'MB_TESIS', '502', 'T02 T03', null],
    ['MDL_GENEL_KLM_PANO', 'Genel', 'Klima panosu G/Ç modülü', 'crac_panel', 'modbus', 'Klima panosu ölçüm ve durum G/Ç', 'MB_KLIMA', '502', 'T00', null],
    ['MDL_ENTES_MPR63', 'Entes', 'MPR-63', 'crac_panel', 'modbus', 'Klima panosu enerji analizörü', 'MB_TESIS', '502', 'T02 T03', null],
    ['MDL_VERTIV_PDX', 'Vertiv', 'Liebert PDX PX040', 'crac', 'modbus', 'Hassas klima 40 kW (DX)', 'MB_KLIMA', '502', 'T00', null],
    ['MDL_VERTIV_CRV', 'Vertiv', 'Liebert CRV CR035', 'crac', 'modbus', 'Sıra içi klima 35 kW', 'MB_TESIS', '502', 'T03', null],
    ['MDL_STULZ_CYBERAIR3', 'Stulz', 'CyberAir 3 ASD', 'crac', 'modbus', 'Hassas klima, çift devre', 'MB_TESIS', '502', 'T02', null],
    ['MDL_SCHNEIDER_UNIFLAIR', 'Schneider Electric', 'Uniflair LE TDAV', 'crac', 'modbus', 'Hassas klima 50 kW', 'MB_KLIMA', '502', 'T00 T09', null],
    ['MDL_DAIKIN_EWAD', 'Daikin', 'EWAD-TZ Chiller', 'crac', 'modbus', 'Hava soğutmalı chiller', 'MB_ENERJI', '502', 'T09', null],
    ['MDL_JANITZA_UMG96RM', 'Janitza', 'UMG 96RM-E', 'meter', 'modbus', 'Enerji sayacı, Ethernet', 'MB_ENERJI', '502', 'T00 T09', null],
    ['MDL_SIEMENS_PAC3200', 'Siemens', 'SENTRON PAC3200', 'meter', 'modbus', 'Çok fonksiyonlu ölçer', 'MB_ENERJI', '502', 'T09', null],
    ['MDL_ENTES_MPR46', 'Entes', 'MPR-46S', 'meter', 'modbus', 'Enerji analizörü', 'MB_TESIS', '502', 'T02 T03', null],
    ['MDL_GENEL_SNS_MOD4', 'Genel', 'Kabin sensör modülü SM-4', 'sensor', 'modbus', 'Kabin sıcaklık/nem + kapak kontağı (Modbus ID 01)', 'MB_SENSOR_1', '502', 'T00', null],
    ['MDL_GENEL_SNS_MOD8', 'Genel', 'Kabin sensör modülü SM-8', 'sensor', 'modbus', 'Kabin 3 seviye sıcaklık + nem + 2 kapak', 'MB_SENSOR_2', '502', 'T00', null],
    ['MDL_APC_NETBOTZ_250', 'APC', 'NetBotz Rack Monitor 250', 'sensor', 'snmp', 'Kabin izleme ünitesi', 'SNMP_UPS', '161', 'T00', { ver: 'V2C', com: true }],
    ['MDL_KENTIX_MS_LAN', 'Kentix', 'MultiSensor-LAN', 'sensor', 'snmp', 'Ortam sensörü (sıcaklık/nem/duman)', '', '161', '', { ver: 'V2C' }],
    ['MDL_SU_KACAK_SENSOR', 'Genel', 'Su kaçak dedektörü WL-2', 'sensor', 'modbus', 'Yükseltilmiş döşeme su kaçağı', 'MB_SENSOR_1', '502', 'T00', null],
    ['MDL_LUFFT_WS600', 'Lufft', 'WS600-UMB', 'weather', 'modbus', 'Hava istasyonu (çatı)', 'MB_ENERJI', '502', 'T09', null],
    ['MDL_SIEMENS_S7_1200', 'Siemens', 'S7-1200 CPU 1215C', 'plc', 'modbus', 'Mekanik otomasyon PLC', 'MB_ENERJI', '502', 'T09', null],
    ['MDL_DSE_8610', 'Deep Sea', 'DSE8610 MKII', 'plc', 'modbus', 'Jeneratör senkron kontrol', 'MB_ENERJI', '502', 'T09', null],
    ['MDL_GENEL_TR_SICAKLIK', '', 'Trafo sargı sıcaklık rölesi', 'meter', 'modbus', 'Trafo sıcaklık izleme', 'MB_ENERJI', '502', 'T09', null]
  ];

  const models = RAW.map(r => {
    const rnd = rngOf('mdl-' + r[0]);
    const n_bi = r[3] === 'pdu' ? 5 + Math.floor(rnd() * 4) : 2 + Math.floor(rnd() * 8);
    const n_io = r[3] === 'pdu' ? 120 + Math.floor(rnd() * 180) : r[3] === 'sensor' ? 6 + Math.floor(rnd() * 14) : 24 + Math.floor(rnd() * 90);
    const s = r[9] || {};
    return {
      id: r[0], ver: String(1 + Math.floor(rnd() * 3)), dev_mfr: r[1], dev_mdl: r[2], dev_type: r[3], proto: r[4], desc: r[5],
      def_pro_con: r[6], def_con_port: r[7], katlar: r[8], n_bi, n_io, kaynak: 'model_cikar',
      def_pro_ver: s.ver || '', def_pro_auth: s.auth || '', def_pro_priv: s.priv || '',
      hasDefCommunity: !!s.com, hasDefSecret: { pro_usr: false, pro_pwd: false, pro_priv_key: false }
    };
  });

  // ---- Katlar ve salonlar --------------------------------------------------------------
  const FLOORS = [
    { key: '1', id: 'T00', name: '1. Kat', docs: ['CMR/T00', 'CMR/T01'], digit: 1 },
    { key: '2', id: 'T02', name: '2. Kat', docs: ['CMR/T02'], digit: 2 },
    { key: '3', id: 'T03', name: '3. Kat', docs: ['CMR/T03'], digit: 3 },
    { key: 'DCB', id: 'T09', name: 'DCB', docs: ['CMR/T09'], digit: 9 }
  ];
  FLOORS.forEach(f => {
    const L = f.digit <= 3 && D.layoutOf ? D.layoutOf(f.digit) : null;
    f.halls = L ? L.salons.map(s => ({ id: s.id, name: s.name })) : [];
  });

  const ENERGY_LOCS = {
    '1': [['ENR_K1_UPS_A', '1. Kat / UPS Hattı A'], ['ENR_K1_UPS_B', '1. Kat / UPS Hattı B'], ['ENR_K1_KLM_PANO', '1. Kat / Klima Panoları'], ['ENR_K1_DC', '1. Kat / DC Güç Sistemi']],
    '2': [['ENR_K2_UPS', '2. Kat / UPS Odası'], ['ENR_K2_KDP', '2. Kat / Kat Dağıtım Panosu']],
    '3': [['ENR_K3_UPS', '3. Kat / UPS Odası'], ['ENR_K3_KDP', '3. Kat / Kat Dağıtım Panosu']],
    'DCB': [['ENR_DCB_AG', 'DCB / AG Ana Dağıtım'], ['ENR_DCB_TR', 'DCB / Trafo Merkezi'], ['ENR_DCB_JEN', 'DCB / Jeneratör Binası'], ['ENR_DCB_MEK', 'DCB / Mekanik Oda']]
  };

  // ---- Sunum oturumunda eklenenler ---------------------------------------------------
  const KEY = 'dcim_eng_devadd_v1';
  function sessionAdded() {
    try { return JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
  }
  function saveAdded(list) {
    try { sessionStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* yok say */ }
  }

  // Mevcut cihazlar (engSystem) + oturumda eklenenler
  function devices() {
    const base = D.engSystem ? D.engSystem.snapshot(0).devices : [];
    return base.map(d => ({ id: d.id, document: d.document, host: d.host, proto: d.proto === 'SNMP' ? 'snmp' : 'modbus', port: '', adr: '', kind: d.kind }))
      .concat(sessionAdded());
  }

  function floorOfDoc(doc) { return FLOORS.find(f => f.docs.indexOf(doc) >= 0) || null; }

  // Bağlantılar: engSystem runtime düğümlerinden. SNMP: con_ses = oturum kapasitesi; Modbus: 0 (sınırsız)
  function connections() {
    const nodes = D.engSystem ? D.engSystem.snapshot(0).runtimeNodes.filter(n => n.kind === 'connection') : [];
    const added = sessionAdded();
    return nodes.map(n => {
      const f = floorOfDoc(n.document);
      const proto = n.proto === 'SNMP' ? 'snmp' : 'modbus';
      const extra = added.filter(a => a.document === n.document && a.pro_con === n.name).length;
      const devCount = n.deviceCount + extra;
      const byLoc = {};
      if (f && f.halls.length) {
        if (f.halls.length === 1) byLoc[f.halls[0].id] = devCount;
        else { const a = Math.round(devCount * 0.58); byLoc[f.halls[0].id] = a; byLoc[f.halls[1].id] = devCount - a; }
      } else if (f) {
        byLoc[(ENERGY_LOCS[f.key] || [['', '']])[0][0]] = devCount;
      }
      return {
        id: n.name, document: n.document, floorKey: f ? f.key : '', proto,
        xdb_fnc: proto === 'snmp' ? '[CON.udp,PRO.snmp]' : '[CON.tcp,PRO.modbus]',
        con_ses: proto === 'snmp' ? n.sessionCapacity : 0,
        snmpVer: proto === 'snmp' ? 'V2C' : '',
        devCount, byLoc
      };
    });
  }

  const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

  /** db_CMR.js kapısının sunum karşılığı: satır başına kimlik, protokol, kabin, yuva ve lisans denetimi. */
  function gate(rows, dryRun, floorKey, hallId) {
    const f = FLOORS.find(x => x.key === floorKey);
    const conns = connections().filter(c => c.floorKey === floorKey);
    const devs = devices();
    const ids = new Set(devs.map(d => d.id));
    const mmap = new Map(models.map(m => [m.id, m]));
    const used = new Map();
    const LIC_MAX = 2500;
    const res = rows.map((r, i) => {
      const m = mmap.get(r.mdl);
      const id = (r.prefix || '') + '_DV';
      const pc = r.pro_con || (m ? m.def_pro_con : '');
      const c = conns.find(x => x.id === pc);
      let err = '';
      if (!m) err = 'model kütüphanede yok: ' + r.mdl;
      else if (ids.has(id)) err = 'cihaz id zaten var: ' + id;
      else if (!c) err = 'bağlantı bu katın dokümanında yok: ' + (pc || '(boş)');
      else if (c.proto !== m.proto) err = 'bağlantının protokolü (' + c.proto + ') modelinkiyle (' + m.proto + ') aynı olmalı';
      else if ((m.dev_type === 'pdu' || m.dev_type === 'pmm') && !r.cab) err = 'PDU/PMM için kabin (cab) zorunlu';
      else if (!IPV4.test(r.con_host || '')) err = 'con_host geçersiz';
      else if (c.con_ses > 0 && c.devCount + (used.get(c.id) || 0) + 1 > c.con_ses) err = 'bağlantı yuvası dolu: ' + c.id + ' (con_ses ' + c.con_ses + ')';
      if (!err) { used.set(c.id, (used.get(c.id) || 0) + 1); ids.add(id); }
      return { i, id, ok: !err, err, document: c ? c.document : '', pro_con: pc };
    });
    const ok = res.every(r => r.ok);
    const lic = 'dev ' + (devs.length + (ok && !dryRun ? res.length : 0)) + '/' + LIC_MAX;
    let added = 0;
    if (ok && !dryRun) {
      const list = sessionAdded();
      rows.forEach((r, i) => {
        list.push({ id: res[i].id, document: res[i].document, pro_con: res[i].pro_con, host: r.con_host, proto: mmap.get(r.mdl).proto,
          port: r.con_port || '', adr: r.pro_adr || '', floorKey, hallId: hallId || '', cab: r.cab || '' });
        added++;
      });
      saveAdded(list);
    }
    return { rid: 'ui' + Date.now().toString(36), cmd: 'dev_add', ok, dry_run: !!dryRun, added, saved: !dryRun && ok, rows: res.map(r => ({ i: r.i, id: r.id, ok: r.ok, err: r.err })), lic, floor: f ? f.name : '' };
  }

  // Kat kabinleri (PDU yardımcısı): kat 1 DCIM.data.cabinets, diğerleri kurgusal yerleşim
  function cabinets(floorKey) {
    if (floorKey === '1') return (D.cabinets || []).map(c => ({ code: c.code, pod: c.pod, salon: c.salonId || 'S1', col: c.col }));
    const f = FLOORS.find(x => x.key === floorKey);
    const L = f && f.digit <= 3 && D.layoutOf ? D.layoutOf(f.digit) : null;
    return L ? L.items.filter(i => i.type === 'cabinet').map(i => ({ code: i.label, pod: i.pod, salon: i.salon, col: i.col })) : [];
  }

  /**
   * Örnek Excel satırları — seçili katın kabinlerine göre 12 PDU (yeni C kolu), bağlantılara dağıtılmış;
   * son satır SNMPv3 (kimlik sayfadan girilir). withErrors: boşluklu IP, yinelenen önek, kabinsiz PDU satırları da eklenir.
   */
  function sampleRows(floorKey, withErrors) {
    const cabs = cabinets(floorKey);
    if (!cabs.length) return { name: 'cihaz_ekleme_ornek.xlsx', rows: [], ignored: [] };
    const n = Math.min(12, cabs.length);
    const pick = [];
    for (let i = 0; i < n; i++) pick.push(cabs[(i * 5 + 2) % cabs.length]);
    const d = Number(floorKey) || 1;
    const conns = floorKey === '1' ? ['SNMP_PDU_1', 'SNMP_PDU_2', 'SNMP_PDU_4', 'SNMP_PDU_5'] : ['SNMP_PDU_1', 'SNMP_PDU_2', 'SNMP_PDU_3', 'SNMP_PDU_4'];
    const rows = pick.map((c, i) => ({
      model: i % 3 === 2 ? 'MDL_RARITAN_PX3_5145R' : 'MDL_RARITAN_PX3_5530V',
      prefix: 'K' + c.code + '_PDU_C', desc: c.code + '-PDU-C',
      con_host: '10.201.' + (d * 10 + 7) + '.' + (20 + i), con_port: '', pro_con: conns[i % conns.length], cab: c.code, row: c.col || '', pod: c.pod || ''
    }));
    if (floorKey !== '1' && rows.length > 2) {
      rows[rows.length - 1].model = 'MDL_RARITAN_PX4_5260';
      rows[rows.length - 1].pro_ver = 'V3';
    }
    if (withErrors && rows.length > 4) {
      rows.push(Object.assign({}, rows[0], { con_host: '10.201.' + (d * 10 + 7) + '.2 3', prefix: 'K' + pick[0].code + '_PDU_D', desc: pick[0].code + '-PDU-D' }));
      rows.push(Object.assign({}, rows[1]));
      rows.push(Object.assign({}, rows[2], { cab: '', prefix: 'KYENI_PDU_A', desc: 'YENI-PDU-A', con_host: '10.201.' + (d * 10 + 7) + '.99' }));
    }
    return { name: withErrors ? 'cihaz_ekleme_hatali.xlsx' : 'cihaz_ekleme_ornek.xlsx', rows, ignored: ['pro_pwd', 'pro_priv_key'] };
  }

  D.deviceManager = {
    models,
    floors: FLOORS,
    energyLocs: key => (ENERGY_LOCS[key] || []).map(e => ({ id: e[0], fullName: e[1] })),
    connections,
    devices,
    cabinets,
    sampleRows,
    gate,
    resetSession: () => saveAdded([])
  };
})();
