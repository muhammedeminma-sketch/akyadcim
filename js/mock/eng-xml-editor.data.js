/* ==========================================================================
   DCIM Sunum — Konfigürasyon Editörü mock verisi (DCIM.data.configScan)
   ConfigStatsService + config-scan.ts (db41 XML dosyalarının taranması) yerine geçer.
   TÜM VERİ KURGUSALDIR ve ortak mock'larla tutarlıdır:
     - dokümanlar ve bağlantılar (con) = DCIM.data.engSystem (docs + snapshot(0).runtimeNodes, aynı cihaz dağılımı)
     - cihazlar, blok sayıları, evt_per, nokta sınıfları (tio/his_per) = DCIM.data.bulkConfig
   Tutarlılık kontrolleri senaryoyla uyumlu kurgusal bulgulardır:
     CMR/T01 SNMP_PDU_3 bütün bloklarda evt_dly = 0 (ana sayfadaki %80+ worker yükünün nedeni),
     CMR/T02 K2EB01_PDU_A_DV con_host sonunda CR (ana sayfada "haberleşme yok"), CMR/T03 aynı hedefi sorgulayan iki PDU,
     CMR/T00 PMM_7 devre dışı (sta = 0x0000), CMR/T09 tanımsız sınıf.
   API: docs() → [DocStats], doc(id) → DocStats, device(docId, devId) → ayrıntı (öznitelik + blok + nokta)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D || !D.engSystem || !D.bulkConfig) return;

  const rngOf = key => D.rng(D.hash(String(key)));
  const IO_PER = { pdu: 48, pmm: 30, ups: 64, crac: 72, crac_panel: 26, sensor: 8, meter: 72, panel: 40, generator: 90 };
  const UNIT_OF = { pdu: ['A', 'V', 'kW', 'kWh', '°C'], pmm: ['kW', 'A', 'kWh'], ups: ['V', 'A', '%', 'dk', '°C'], crac: ['°C', '%', 'bar', 'rpm'],
    crac_panel: ['V', 'A', 'W'], sensor: ['°C', '%'], meter: ['V', 'A', 'kW', 'kWh', '%'], panel: ['V', 'A', 'kW', 'kWh'], generator: ['V', 'A', 'kW', 'rpm', 'bar'] };
  const SHORT = { 'CMR/T00': 'CMR_T00', 'CMR/T01': 'CMR_T01', 'CMR/T02': 'CMR_T02', 'CMR/T03': 'CMR_T03', 'CMR/T09': 'CMR_T09' };
  const TYPE_LABEL = { pdu: 'pdu', pmm: 'pmm', ups: 'ups', crac: 'crac', crac_panel: 'crac_panel', sensor: 'sensor', meter: 'meter', panel: 'panel' };
  const ioKind = d => d.meterOf === 'generator' ? 'generator' : d.deviceType;

  // engSystem.buildNodes ile aynı bağlantı dağıtımı
  function assignCons(doc, devs) {
    const out = new Map();
    const add = (name, list) => out.set(name, list);
    const snmp = devs.filter(d => d.proto === 'SNMP');
    const mb = devs.filter(d => d.proto !== 'SNMP');
    if (doc === 'CMR/T01' || doc === 'CMR/T02' || doc === 'CMR/T03') {
      const parts = doc === 'CMR/T01' ? 6 : 4;
      for (let i = 0; i < parts; i++) add('SNMP_PDU_' + (i + 1), snmp.filter((_, j) => j % parts === i));
      if (mb.length) add('MB_TESIS', mb);
    } else {
      if (snmp.length) add('SNMP_UPS', snmp);
      const sens = mb.filter(d => d.kind === 'Sensör');
      const rest = mb.filter(d => d.kind !== 'Sensör');
      if (sens.length) { add('MB_SENSOR_1', sens.filter((_, j) => j % 2 === 0)); add('MB_SENSOR_2', sens.filter((_, j) => j % 2 === 1)); }
      if (rest.length) add(doc === 'CMR/T09' ? 'MB_ENERJI' : 'MB_KLIMA', rest);
    }
    return out;
  }

  const inc = (m, k, n) => { m[k] = (m[k] || 0) + (n === undefined ? 1 : n); };
  const SAVE_KEY = { pdu: 'pdu', pmm: 'pdu', ups: 'ups', crac: 'climate', crac_panel: 'climatePanel', sensor: 'sensor', meter: 'analyzer', panel: 'sdp' };

  let CACHE = null;
  function build() {
    const snap = D.engSystem.snapshot(0);
    const inv = new Map(D.bulkConfig.devices().map(d => [d.key, d]));
    const now = Date.now();
    const docs = D.engSystem.docs.map((def, di) => {
      const r = rngOf('cfg-' + def.doc);
      const raw = snap.devices.filter(d => d.document === def.doc);
      const nodes = snap.runtimeNodes.filter(n => n.document === def.doc);
      const consMap = assignCons(def.doc, raw);
      const devices = [];
      const devTypes = {}, devProtocols = {}, blockPeriods = {}, hisPeriods = {}, ioClasses = {}, units = {}, devSta = {};
      let bi = 0, io = 0, ioHistory = 0, ioAlarm = 0, req = 0, devDisabled = 0;
      const cons = [];
      consMap.forEach((list, name) => {
        const node = nodes.find(n => n.name === name) || {};
        let blocks = 0, blocksActive = 0, ios = 0, rps = 0;
        list.forEach(d => {
          const x = inv.get(d.key) || {};
          const evt = D.bulkConfig.evt(d.key);
          const disabled = d.status === 'disabled';
          const sta = disabled ? '0x0000' : d.status === 'offline' ? '0x0301' : d.status === 'online' ? '0x0303' : d.status === 'warning' ? '0x0307' : '0x030B';
          const k = ioKind(x);
          const nio = IO_PER[k] || 20;
          devices.push({ id: d.id, desc: d.description, con: name, host: d.host, proto: d.proto, type: x.deviceType, kind: k, meterOf: x.meterOf, cls: x.className,
            sta, status: d.status, loc: [x.floorName, x.area, x.locationName].filter(Boolean).join(' / '), evt, ios: nio, key: d.key });
          inc(devTypes, TYPE_LABEL[x.deviceType] || x.deviceType);
          inc(devProtocols, d.proto === 'SNMP' ? 'SNMP' : 'MODBUS');
          inc(devSta, sta);
          if (disabled) devDisabled++;
          blocks += evt.length; ios += nio;
          if (!disabled) {
            blocksActive += evt.length;
            evt.forEach(v => { rps += 1 / v; inc(blockPeriods, DCIM.engBulk ? DCIM.engBulk.formatPeriod(v) : v + ' sn'); });
          }
          (UNIT_OF[k] || ['']).forEach((u, i) => inc(units, u, Math.round(nio / (i + 2))));
        });
        bi += blocks; io += ios; req += rps;
        const ses = name.startsWith('MB_') && list.length > (node.sessionCapacity || 0) ? 0 : (node.sessionCapacity || 0);
        const isSnmp = name.startsWith('SNMP');
        cons.push({
          id: name, protocol: isSnmp ? 'SNMP' : 'MODBUS', transport: isSnmp ? 'UDP' : 'TCP',
          devices: list.length, blocks, blocksActive, ios, ses, freeSes: ses ? ses - list.length : null,
          thrWrk: node.workerCount || 0, reqPerSec: rps, worstReqSec: isSnmp ? 1 : 0.5,
          dlyZero: def.doc === 'CMR/T01' && name === 'SNMP_PDU_3' ? blocksActive : Math.round(blocksActive * 0.1),
          dlyDistinct: def.doc === 'CMR/T01' && name === 'SNMP_PDU_3' ? 1 : 3 + Math.floor(r() * 5)
        });
      });
      // sınıflar (kayıt grupları) ve geçmiş/alarm sayıları
      const groups = Array.from(new Set(devices.map(d => SAVE_KEY[d.type]).filter(Boolean)));
      let tio = 0;
      groups.forEach(g => {
        const n = devices.filter(d => SAVE_KEY[d.type] === g).length;
        D.bulkConfig.classes(def.doc, g, n).forEach(c => {
          tio++;
          inc(ioClasses, c.id, c.points);
          inc(hisPeriods, DCIM.engBulk ? DCIM.engBulk.formatPeriod(c.his) : c.his + ' sn', c.points);
          ioHistory += c.points;
        });
      });
      ioAlarm = Math.round(io * (0.28 + r() * 0.1));
      const tioUnused = 2 + Math.floor(r() * 6);
      tio += tioUnused + 6;
      const thrEvt = nodes.find(n => n.kind === 'thread');
      const threads = [
        { kind: 'root', id: SHORT[def.doc], desc: def.doc + ' kök', thrWrk: 4, thrPer: 100, timers: 12, queMax: 5000 },
        { kind: 'thr', id: 'thr_evt', desc: 'Hesaplanan noktalar', thrWrk: thrEvt ? thrEvt.workerCount : 2, thrPer: 250, timers: Math.round(io * 0.06), queMax: 2000 },
        { kind: 'thr', id: 'thr_his', desc: 'Geçmiş yazımı', thrWrk: 2, thrPer: 1000, timers: groups.length * 4, queMax: 10000 }
      ].concat(cons.map(c => ({ kind: 'con', id: c.id, desc: c.protocol + ' bağlantısı', thrWrk: c.thrWrk, thrPer: 50, timers: c.blocksActive, queMax: null })));

      // tutarlılık kontrolleri
      const issues = [];
      const add = (code, level, title, hint, samples, count) => issues.push({ doc: def.doc, code, level, title, hint, samples, count: count || samples.length });
      if (def.doc === 'CMR/T01') add('dly_zero', 'warning', 'Bütün bloklar aynı anda tetikleniyor', 'Bağlantının tüm etkin bloklarında evt_dly = 0; aynı periyottaki bloklar aynı anda ateşlenir ve worker havuzunu birlikte doldurur.', [{ id: 'SNMP_PDU_3', detail: cons.find(c => c.id === 'SNMP_PDU_3').blocksActive + ' blok' }]);
      if (def.doc === 'CMR/T02') add('host_ws', 'error', 'IP adresinde boşluk / satır sonu', 'con_host içinde boşluk, CR/LF ya da sekme var; bağlantı kurulamaz.', [{ id: 'K2EB01_PDU_A_DV', dev: 'K2EB01_PDU_A_DV', detail: '"' + ((devices.find(d => d.id === 'K2EB01_PDU_A_DV') || {}).host || '') + '\\r"' }]);
      if (def.doc === 'CMR/T03') {
        const p = devices.filter(d => d.type === 'pdu');
        if (p.length > 9) add('dup_target', 'warning', 'Aynı hedefi sorgulayan cihazlar', 'Aynı protokol + IP + port + adres iki cihazda; cihaz iki kez sorgulanır.', [{ id: p[8].id, dev: p[8].id, detail: p[8].host + ' = ' + p[9].id }]);
      }
      if (def.doc === 'CMR/T09') add('cls_missing', 'warning', 'Dokümanda tanımlı olmayan sınıf', 'xdb_cls bu dokümandaki <tio> listesinde yok; sınıftan gelmesi gereken öznitelikler uygulanmaz.', [{ id: 'DCB_JEN2_DV', dev: 'DCB_JEN2_DV', detail: 'JEN_MODBUS_V2' }]);
      if (def.doc === 'CMR/T00') add('bi_no_io', 'warning', 'Noktası olmayan sorgu bloğu', 'Blok sorgulanır ama altında <io> yok; boşa istek.', [{ id: 'bi_ALARM_GECMIS', dev: 'KAT1_SAL1_KLM104_DV' }, { id: 'bi_ALARM_GECMIS', dev: 'KAT1_SAL1_KLM109_DV' }, { id: 'bi_ALARM_GECMIS', dev: 'KAT1_SAL1_KLM112_DV' }]);
      const dis = devices.filter(d => d.sta === '0x0000');
      if (dis.length) add('dev_disabled', 'info', 'Devre dışı cihaz (sta = 0x0000)', 'Cihaz sorgulanmaz; yük hesabına katılmaz.', dis.map(d => ({ id: d.id, dev: d.id })));
      add('tio_unused', 'info', 'Kullanılmayan sınıf (tio)', 'Hiçbir eleman bu sınıfı kullanmıyor; temizlenebilir.', Array.from({ length: tioUnused }, (_, i) => ({ id: 'ESKI_SINIF_' + (i + 1) })));
      add('con_unused', 'info', 'Cihazı olmayan bağlantı', 'Tanımlı ama hiçbir cihaz kullanmıyor (DAS/SQL gibi servis bağlantılarıysa normaldir).', [{ id: 'DAS' }, { id: 'SQL' }]);

      const bytes = io * 210 + devices.length * 1400 + tio * 900;
      return {
        id: def.doc, floors: def.floors, kind: def.kind, bytes,
        modified: new Date(now - (di === 1 ? 50 * 60000 : (2 + Math.floor(r() * 40)) * 3600000)).toISOString(),
        counts: { dev: devices.length, devDisabled, bi, biDisabled: dis.reduce((a, d) => a + d.evt.length, 0), io, con: cons.length + 2, tio, list: 6 + Math.floor(r() * 6), item: 40 + Math.floor(r() * 80), thr: 2 },
        cons, threads, workers: threads.reduce((a, t) => a + t.thrWrk, 0), reqPerSec: req,
        root: { log: di === 1 ? 'warning' : 'error' }, issues, devices,
        maps: { devTypes, devProtocols, blockPeriods, hisPeriods, ioClasses, units, devSta },
        ioHistory, ioAlarm, tioUnused, hosts: new Set(devices.map(d => d.host)).size
      };
    });
    return docs;
  }

  // Cihaz ayrıntısı (salt okunur doküman görünümü)
  const IO_TPL = {
    pdu: [['Faz 1 Akım', 'A', 'PDU_FAZ_AKIM'], ['Faz 2 Akım', 'A', 'PDU_FAZ_AKIM'], ['Faz 3 Akım', 'A', 'PDU_FAZ_AKIM'], ['Faz 1 Gerilim', 'V', 'PDU_FAZ_GERILIM'], ['Aktif Güç', 'kW', 'PDU_AKTIF_GUC'], ['Enerji', 'kWh', 'PDU_ENERJI'], ['Sigorta 1 Akım', 'A', 'PDU_SIGORTA_AKIM'], ['Sigorta 2 Akım', 'A', 'PDU_SIGORTA_AKIM'], ['Frekans', 'Hz', 'PDU_FREKANS']],
    sensor: [['Üst Sıcaklık', '°C', 'KABIN_SIC_UST'], ['Orta Sıcaklık', '°C', 'KABIN_SIC_ORTA'], ['Alt Sıcaklık', '°C', 'KABIN_SIC_ALT'], ['Nem', '%', 'KABIN_NEM'], ['Ön Kapak', '', 'KAPAK_DURUM'], ['Arka Kapak', '', 'KAPAK_DURUM']],
    ups: [['Giriş Gerilimi L1', 'V', 'UPS_GIRIS'], ['Çıkış Gerilimi L1', 'V', 'UPS_CIKIS'], ['Yük Oranı', '%', 'UPS_YUK'], ['Akü Kapasitesi', '%', 'UPS_AKU'], ['Kalan Akü Süresi', 'dk', 'UPS_AKU']],
    crac: [['Üfleme Sıcaklığı', '°C', 'KLM_UFLEME_SIC'], ['Dönüş Sıcaklığı', '°C', 'KLM_DONUS_SIC'], ['Oda Nemi', '%', 'KLM_NEM'], ['Fan Hızı', '%', 'KLM_FAN_HIZI'], ['Kompresör 1 Basınç', 'bar', 'KLM_KOMP_BASINC']],
    crac_panel: [['L1 Gerilim', 'V', 'KPANO_GERILIM'], ['L1 Akım', 'A', 'KPANO_AKIM'], ['Toplam Güç', 'W', 'KPANO_GUC']],
    meter: [['L1 Gerilim', 'V', 'ANL_GERILIM'], ['L1 Akım', 'A', 'ANL_AKIM'], ['Toplam Aktif Güç', 'kW', 'ANL_GUC'], ['Aktif Enerji', 'kWh', 'ANL_ENERJI'], ['THD-I', '%', 'ANL_THD']],
    panel: [['L1 Gerilim', 'V', 'SDP_GERILIM'], ['L1 Akım', 'A', 'SDP_AKIM'], ['Toplam Güç', 'kW', 'SDP_GUC'], ['Enerji', 'kWh', 'SDP_ENERJI']],
    pmm: [['Devre Gücü', 'kW', 'PMM_DEVRE_GUC']]
  };
  const BLOCK_NAMES = { pdu: ['bi_FAZ', 'bi_SIGORTA', 'bi_GUC', 'bi_ORTAM', 'bi_ENVANTER'], ups: ['bi_GIRIS', 'bi_CIKIS', 'bi_AKU', 'bi_DURUM'], crac: ['bi_SICAKLIK', 'bi_FAN', 'bi_ALARM_GECMIS'],
    crac_panel: ['bi_OLCUM', 'bi_ENERJI'], sensor: ['bi_SENSOR'], meter: ['bi_OLCUM', 'bi_ENERJI', 'bi_HARMONIK'], panel: ['bi_OLCUM', 'bi_ENERJI'], pmm: ['bi_DEVRE', 'bi_ENERJI', 'bi_DURUM'] };

  function device(docId, devId) {
    const d = doc(docId);
    if (!d) return null;
    const x = d.devices.find(v => v.id === devId);
    if (!x) return null;
    const isSnmp = x.proto === 'SNMP';
    const r = rngOf('dev-' + devId);
    const attrs = [
      ['id', x.id], ['desc', x.desc], ['dev_type', x.type], x.meterOf ? ['meter_of', x.meterOf] : null, ['xdb_cls', x.cls],
      ['pro_con', x.con], ['con_host', x.host + (devId === 'K2EB01_PDU_A_DV' ? '\\r' : '')], ['con_port', isSnmp ? '161' : '502'],
      isSnmp ? ['pro_ver', 'v2c'] : ['pro_adr', String(1 + Math.floor(r() * 20))],
      ['pro_tmo', isSnmp ? '1000' : '500'], ['pro_try', '1'], ['sta', x.sta], ['dev_loc', x.loc]
    ].filter(Boolean);
    const names = BLOCK_NAMES[x.type] || ['bi_OLCUM'];
    const blocks = x.evt.map((v, i) => ({ id: names[i] || ('bi_' + (i + 1)), evt_per: v, evt_dly: d.id === 'CMR/T01' && x.con === 'SNMP_PDU_3' ? 0 : (i * 3 + Math.floor(r() * 5)), ios: Math.round(x.ios / x.evt.length) }));
    const tpl = IO_TPL[x.kind === 'generator' ? 'meter' : x.type] || [];
    const st = DCIM.data.bulkConfig;
    const ios = tpl.map((t, i) => {
      const cls = st.classes(docId, SAVE_KEY[x.type] || 'pdu', 1).find(c => c.id === t[2]);
      return { id: x.id.replace(/_DV$/, '') + '_' + t[2].replace(/^[A-Z]+_/, '') + (i + 1), desc: t[0], unit: t[1], cls: t[2], his: cls ? cls.his : null, alm: /SIC|AKIM|GERILIM|NEM|YUK|BASINC/.test(t[2]) };
    });
    return Object.assign({}, x, { attrs, blocks, iosList: ios });
  }

  function docs() { if (!CACHE) CACHE = build(); return CACHE; }
  function doc(id) { return docs().find(d => d.id === id) || null; }

  D.configScan = { docs, doc, device, reset() { CACHE = null; } };
})();
