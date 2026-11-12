/* ==========================================================================
   DCIM Sunum — Toplu yapılandırma mock verisi (DCIM.data.bulkConfig)
   Veri Sorgulama Periyodu / Veri Kayıt Periyodu / Alarm Eşikleri sayfalarının (bulk-config akışı)
   DeviceInventoryService + BulkApplyService (XDB okuma/yazma, attr_save, geri okuma) yerine geçer.

   TÜM VERİ KURGUSALDIR. Cihaz envanteri DCIM.data.engSystem.snapshot(0).devices'tan türetilir
   (Mühendislik ana sayfası ve Konfigürasyon Editörü ile aynı cihazlar, aynı durumlar, aynı 10.201.x.x IP'leri).
   Sınıf (tio) adları, blok sayıları, periyot ve eşik değerleri sunuma özgüdür.

   Durum eşlemesi (engSystem → DeviceState): online→online, warning→warning, critical→alarm,
   offline→nocomm, disabled→disabled.
   dev_type eşlemesi: PDU→pdu, PMM_n→pmm, UPS→ups, Klima→crac, Klima Panosu→crac_panel, Sensör→sensor,
   Analizör→meter (DCB dağıtım panoları DP-nn → panel/SDP), Jeneratör→meter + meter_of=generator.
   Kat: CMR/T00 + CMR/T01 → 1. Kat (T00), CMR/T02 → 2. Kat, CMR/T03 → 3. Kat, CMR/T09 → DCB.

   Yazmalar bellekte tutulur (sayfa yenilenince sıfırlanır); her uygulama konsola "[bulk]" önekiyle yazılır.
   API: devices(), evt(key) / setEvt(keys, v), classes(doc, group) / setClassHis(doc, group, v) / setPointHis(keys, group, v),
        thr(key, param) / setThr(keys, param, values), policy / setPolicy(p), mismatch(), sampleSeries(dev, period, n)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D || !D.engSystem) return;

  const rngOf = key => D.rng(D.hash(String(key)));

  const FLOOR_OF_DOC = {
    'CMR/T00': { id: 'T00', name: '1. Kat', digit: 1 },
    'CMR/T01': { id: 'T00', name: '1. Kat', digit: 1 },
    'CMR/T02': { id: 'T02', name: '2. Kat', digit: 2 },
    'CMR/T03': { id: 'T03', name: '3. Kat', digit: 3 },
    'CMR/T09': { id: 'DCB', name: 'DCB', digit: 9 }
  };
  const STATE = { online: 'online', warning: 'warning', critical: 'alarm', offline: 'nocomm', disabled: 'disabled' };

  function devType(d) {
    if (d.kind === 'PDU') return { deviceType: 'pdu', meterOf: '' };
    if (/^PMM_/.test(d.id)) return { deviceType: 'pmm', meterOf: '' };
    if (d.kind === 'UPS') return { deviceType: 'ups', meterOf: '' };
    if (d.kind === 'Klima') return { deviceType: 'crac', meterOf: '' };
    if (d.kind === 'Klima Panosu') return { deviceType: 'crac_panel', meterOf: '' };
    if (d.kind === 'Sensör') return { deviceType: 'sensor', meterOf: '' };
    if (d.kind === 'Jeneratör') return { deviceType: 'meter', meterOf: 'generator' };
    if (/^DCB_DP\d+/.test(d.id)) return { deviceType: 'panel', meterOf: '' };
    return { deviceType: 'meter', meterOf: '' };
  }

  const CLASS_OF = { pdu: 'PDU_SNMP_GENEL', pmm: 'PMM_MODBUS', ups: 'UPS_SNMP_GENEL', crac: 'KLIMA_MODBUS', crac_panel: 'KPANO_MODBUS', sensor: 'KABIN_SENSOR_MODULU', meter: 'ANALIZOR_MODBUS', panel: 'SDP_ANALIZOR' };

  // Kabin kodu → konum (kat 1: DCIM.data.cabinets; kat 2-3: kurgusal yerleşim)
  function cabinetLoc(code, digit) {
    if (digit === 1) {
      const c = (D.cabinets || []).find(x => x.code === code);
      if (c) return { area: c.salon || '1. Salon', loc: (c.pod || '') + ' / ' + code };
    }
    const L = D.layoutOf ? D.layoutOf(digit) : null;
    if (L) {
      const it = L.items.find(x => x.type === 'cabinet' && x.label === code);
      if (it) {
        const s = (L.salons || []).find(x => x.id === it.salon);
        return { area: s ? s.name : '', loc: (it.pod || '') + ' / ' + code };
      }
    }
    return { area: '', loc: code };
  }

  let DEVICES = null;
  function devices() {
    if (DEVICES) return DEVICES;
    const snap = D.engSystem.snapshot(0);
    DEVICES = snap.devices.map(d => {
      const f = FLOOR_OF_DOC[d.document] || { id: 'DCB', name: 'DCB', digit: 9 };
      const t = devType(d);
      let area = '', locationName = '';
      const m = /^K(\w+?)_PDU_[AB]_DV$/.exec(d.id) || /^(?:POD|NW)\d+_(\w+?)_ID01_DV$/.exec(d.id);
      if (m) { const l = cabinetLoc(m[1], f.digit); area = l.area; locationName = l.loc; }
      else if (f.digit === 9) { area = 'Ek bina'; locationName = d.description; }
      else { area = f.digit === 1 ? '1. Salon' : ''; locationName = d.kind === 'UPS' ? 'UPS odası' : d.kind === 'Analizör' ? 'Master pano' : 'Salon çevresi'; }
      return {
        key: d.key, id: d.id, document: d.document, floorId: f.id, floorName: f.name, area,
        description: d.description, deviceType: t.deviceType, meterOf: t.meterOf, host: d.host,
        locationName, state: STATE[d.status] || 'unknown', className: CLASS_OF[t.deviceType] || ''
      };
    });
    return DEVICES;
  }

  // ---------------------------------------------------------------------------------------------
  // Sorgu blokları (bi/@evt_per)
  const BLOCKS = { pdu: 5, pmm: 3, ups: 4, crac: 3, crac_panel: 2, sensor: 1, meter: 3, panel: 2 };
  const EVT = { pdu: 300, pmm: 60, ups: 10, crac: 30, crac_panel: 30, sensor: 30, meter: 10, panel: 10 };
  const evtStore = new Map();
  function evt(key) {
    if (!evtStore.has(key)) {
      const d = devices().find(x => x.key === key);
      if (!d) return [];
      const n = BLOCKS[d.deviceType] || 1;
      const base = d.meterOf === 'generator' ? 5 : (EVT[d.deviceType] || 30);
      // PDU envanter bloğu (model, seri no) saatte bir okunur
      const arr = Array.from({ length: n }, (_, i) => d.deviceType === 'pdu' && i === n - 1 ? 3600 : base);
      evtStore.set(key, arr);
    }
    return evtStore.get(key);
  }
  function setEvt(keys, v) {
    keys.forEach(k => { const a = evt(k); evtStore.set(k, a.map(() => v)); });
    console.info('[bulk] evt_per =', v, '→', keys.length, 'cihaz');
  }

  // ---------------------------------------------------------------------------------------------
  // Nokta sınıfları (tio/@his_per) — doküman + kayıt grubu başına
  const CLASS_TPL = {
    pdu: [['PDU_FAZ_AKIM', 300, 3], ['PDU_FAZ_GERILIM', 900, 3], ['PDU_AKTIF_GUC', 300, 1], ['PDU_GUC_FAKTORU', 300, 1], ['PDU_ENERJI', 3600, 1], ['PDU_SIGORTA_AKIM', 300, 6], ['PDU_FREKANS', 3600, 1], ['PMM_DEVRE_GUC', 300, 0]],
    climate: [['KLM_UFLEME_SIC', 60, 1], ['KLM_DONUS_SIC', 60, 1], ['KLM_NEM', 60, 1], ['KLM_FAN_HIZI', 300, 1], ['KLM_KOMP_BASINC', 60, 2]],
    climatePanel: [['KPANO_GERILIM', 300, 3], ['KPANO_AKIM', 300, 3], ['KPANO_GUC', 300, 1]],
    sdp: [['SDP_GERILIM', 300, 3], ['SDP_AKIM', 300, 3], ['SDP_GUC', 300, 1], ['SDP_ENERJI', 900, 1]],
    sensor: [['KABIN_SIC_UST', 60, 1], ['KABIN_SIC_ORTA', 60, 1], ['KABIN_SIC_ALT', 60, 1], ['KABIN_NEM', 60, 1], ['KAPAK_DURUM', 300, 2]],
    analyzer: [['ANL_GERILIM', 300, 3], ['ANL_AKIM', 300, 3], ['ANL_GUC', 300, 1], ['ANL_ENERJI', 900, 1], ['ANL_THD', 900, 3]],
    rectifier: [['RED_CIKIS', 300, 2], ['RED_AKU', 300, 2]],
    ups: [['UPS_GIRIS', 60, 3], ['UPS_CIKIS', 60, 3], ['UPS_AKU', 300, 3], ['UPS_YUK', 60, 1]]
  };
  const clsStore = new Map();
  function classes(doc, group, deviceCount) {
    const k = doc + '|' + group;
    if (!clsStore.has(k)) {
      const tpl = CLASS_TPL[group] || [];
      const r = rngOf('his-' + k);
      // kat 3 ve DCB'de bazı sınıflar farklı değerde kalmış (dağılım gösterimi için)
      clsStore.set(k, tpl.filter(t => t[2] > 0 || group !== 'pdu' || doc === 'CMR/T00')
        .map(t => ({ id: t[0], his: (doc === 'CMR/T03' && t[1] === 300 && r() < 0.5) ? 900 : t[1], per: t[2] || 1 })));
    }
    const list = clsStore.get(k);
    return list.map(c => Object.assign({}, c, { points: (deviceCount || 0) * c.per }));
  }
  function setClassHis(doc, group, v) {
    const k = doc + '|' + group;
    classes(doc, group, 0);
    clsStore.set(k, clsStore.get(k).map(c => Object.assign({}, c, { his: v })));
    console.info('[bulk] tio his_per =', v, '→', k);
  }
  const pointHis = new Map();
  function setPointHis(keys, group, v) {
    keys.forEach(key => pointHis.set(key + '|' + group, v));
    console.info('[bulk] io his_per =', v, '→', keys.length, 'cihaz (nokta bazında)');
  }
  const pointHisOf = (key, group) => pointHis.get(key + '|' + group);

  // ---------------------------------------------------------------------------------------------
  // Alarm eşikleri (cihaz + parametre başına; nokta sayısı)
  const POINTS = { TEMP_TOP: 1, TEMP_MID: 1, TEMP_BOT: 1, HUM_MID: 1, VOLT: 3, CURR: 3, POW: 1, OCP: 6 };
  let policy = { wrn: 80, alm: 90, emr: 100 };
  const thrStore = new Map();
  function baseThr(d, param) {
    const r = rngOf('thr-' + d.key + param);
    switch (param) {
      case 'TEMP_TOP': case 'TEMP_MID': case 'TEMP_BOT': {
        const old = r() < 0.18; // eski proje değerinde kalan kabinler
        return { alm_hi: old ? 32 : 35, wrn_hi: old ? 28 : 30, wrn_lo: 15, alm_lo: 10, alm_dly_set: 40, alm_dly_rst: 40 };
      }
      case 'HUM_MID': return { alm_hi: 80, wrn_hi: 70, wrn_lo: 20, alm_lo: 10, alm_dly_set: 40, alm_dly_rst: 40 };
      case 'VOLT': return { alm_hi: 253, wrn_hi: 245, wrn_lo: 200, alm_lo: 190 };
      case 'CURR': return d.deviceType === 'panel' ? { alm_hi: 250, wrn_hi: 200 } : { alm_hi: 63, wrn_hi: 50 };
      case 'POW': return d.deviceType === 'panel' ? { alm_hi: 150000, wrn_hi: 120000 } : { alm_hi: 40000, wrn_hi: 32000 };
      case 'OCP': {
        const rated = r() < 0.7 ? 16 : 32;
        return { emr_hi: +(rated * policy.emr / 100).toFixed(1), alm_hi: +(rated * policy.alm / 100).toFixed(1), wrn_hi: +(rated * policy.wrn / 100).toFixed(1), alm_dly_set: 10, alm_dly_rst: 10 };
      }
      default: return {};
    }
  }
  function thr(key, param) {
    const k = key + '|' + param;
    if (!thrStore.has(k)) {
      const d = devices().find(x => x.key === key);
      thrStore.set(k, d ? baseThr(d, param) : {});
    }
    return thrStore.get(k);
  }
  function setThr(keys, param, values) {
    keys.forEach(key => thrStore.set(key + '|' + param, Object.assign({}, thr(key, param), values)));
    console.info('[bulk] eşik', param, values, '→', keys.length, 'cihaz');
  }

  // Sigorta eşik politikası: cihazdaki eşikten farklı sigortalar (kurgusal örnek)
  function mismatch() {
    const pdus = devices().filter(d => d.deviceType === 'pdu');
    const r = rngOf('ocp-mismatch');
    const out = [];
    const picks = ['K1NA06_PDU_B_DV', 'K1DL03_PDU_B_DV'];
    while (picks.length < 9 && pdus.length) picks.push(pdus[Math.floor(r() * pdus.length)].id);
    picks.forEach((id, i) => {
      const d = pdus.find(x => x.id === id);
      if (!d) return;
      const n = 1 + Math.floor(r() * 6);
      const rated = i % 3 === 2 ? 32 : 16;
      const act = (rated * policy.alm / 100).toFixed(1) + ' / ' + (rated * policy.wrn / 100).toFixed(1);
      const dev = (rated * 0.8).toFixed(1) + ' / ' + (rated * 0.7).toFixed(1);
      out.push({ id: id.replace(/_DV$/, '') + '_OCP' + n, desc: d.description + ' · Sigorta ' + n + ' (' + rated + ' A)', act: act.replace(/\./g, ','), dev: dev.replace(/\./g, ',') });
    });
    return out;
  }

  // Periyot örnekleyici: önceki okumalar (sunum için geriye dönük tohumlu dizi)
  function sampleSeries(dev, period, n) {
    const r = rngOf('sample-' + dev + period);
    const now = Date.now();
    const out = [];
    let t = now - period * 1000 * n;
    let val = 20 + r() * 8;
    for (let i = 0; i < n; i++) {
      const gap = period + (r() - 0.5) * Math.min(1.2, period * 0.04);
      t += gap * 1000;
      val += (r() - 0.5) * 0.4;
      out.push({ t: new Date(t).toISOString(), val: val.toFixed(1), gapSec: i ? gap : null });
    }
    return out;
  }

  D.bulkConfig = {
    devices, evt, setEvt, classes, setClassHis, setPointHis, pointHisOf, thr, setThr, mismatch, sampleSeries, POINTS,
    get policy() { return Object.assign({}, policy); },
    setPolicy(p) {
      policy = { wrn: p.wrn, alm: p.alm, emr: p.emr };
      // politika yeniden uygulanınca bütün sigorta üst eşikleri anma akımından türetilir
      Array.from(thrStore.keys()).filter(k => k.endsWith('|OCP')).forEach(k => thrStore.delete(k));
      console.info('[bulk] THR_Policy =', policy);
    }
  };
})();
