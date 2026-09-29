/* ==========================================================================
   DCIM Sunum — Cihaz Listesi mock verisi (engineering.html#device-list)
   NewUICMPDeviceListComponent + NewUICMPEditDevicePopupComponent XDB sorgularının yerine geçer:
     doc('CMR/T01')/descendant::dev[...][position() > ofs and position() <= ofs+rng]  → devices()
     doc('CMR/T01')/count(descendant::dev[...])                                        → devices().length
     doc('CMR/T01')/descendant::dev[@id='<id>']  (con_host, con_port, pro_ver, ...)     → details(id)
     XDB_SetValue(.../@con_host ...) / {"cmd":2,"id":"<id>"} (silme)                    → update(id) / remove(id)
   Cihaz kimlikleri mapToDevice() ayrıştırmasının beklediği biçimdedir:
     K<kabin>_PDU_<A|B>_DV          PDU (gerçek db_CMR_T01.xml ile aynı; dev_loc = "1.KAT/1.SALON/POD 9/BJ SIRASI")
     <POD>_<kabin>_ID01_DV          Kabin sensör modülü (Modbus ID 01)
     KAT1_SAL1_<A5>_UPS             UPS (DCIM.data.ups[].devId — system-health / telemetri ile aynı)
     IDC1_KLM109_DV, KAT1_SAL1_*_KLM_PANO_DV, PMM_n, SNS_GW_<POD>  klima / pano / analizör / ağ geçidi
   STA (AyXDB, 0x03 önekli cihaz durumu): 0x0303 normal, 0x0307 uyarı, 0x030B alarm, 0x030F acil,
     0x0300 devre dışı, 0x0301 bağlanamadı, 0x0302 eski. Senaryo: DCIM.data.pdu.scenario (1AV42 PDU-B alarm,
     1CB52 PDU-B uyarı), system-health sensör durumları (1BJ53/1BC37 alarm, 1BQ55/1CE56/1BX50/1BU54 uyarı),
     1CE51 sensör modülü + UPS B7 haberleşme kaybı (bağlanamadı), PMM-7 planlı devre dışı,
     UPS A5 / KLIMA 109 alarm, UPS A3 / UPS B4 / KLIMA 104 / KLIMA 112 / A1 KLIMA PANOSU uyarı.
   Sunum varsayımı: gerçek sahada CMR/T01 yalnızca PDU'ları içerir (UPS/klima/pano CMR/T00'dadır);
     sunumda Salon 1 listesi tüm saha cihazlarını gösterir.
   Bağımlılık: js/mock-data.js (DCIM.data: cabinets, ups, climates, panels, pdu, cabinetMgr, rng, hash)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D) return;

  const STA = { normal: '0x0303', warning: '0x0307', alarm: '0x030B', critical: '0x030F', disabled: '0x0300', lost: '0x0301', stale: '0x0302' };

  // system-health.html (D.health) ile aynı sensör modülü durumları
  const SENSOR_STATE = { '1BJ53': 'alarm', '1BC37': 'alarm', '1BQ55': 'warning', '1CE56': 'warning', '1BX50': 'warning', '1BU54': 'warning' };
  // Salt okunur SNMP kimlik bilgileri (sunum değerleri — gerçek saha bilgisi değildir)
  const COMMUNITY = { read: 'dcim-ro', v3User: 'dcim_snmp' };

  D.lazy('engDeviceList', function () {
    const byLabel = (a, b) => a.label.localeCompare(b.label, 'tr', { numeric: true });
    const pduSc = (D.pdu && D.pdu.scenario) || {};
    const list = [];
    // attrs: dev öznitelikleri (liste + detay). _kind/_ref: sunum içi (detay üretimi için)
    const push = o => list.push(o);

    // ---- Kabinler: PDU A/B + sensör modülü (kabin koduna göre, XML belge sırası gibi)
    const locs = {};
    (D.pdu ? D.pdu.devLocs() : []).forEach(x => { locs[x.id] = x.dev_loc; });
    D.cabinets.slice().sort((a, b) => a.code.localeCompare(b.code)).forEach(c => {
      ['A', 'B'].forEach(side => {
        const id = 'K' + c.code + '_PDU_' + side + '_DV';
        const sc = pduSc[c.code + '_' + side];
        push({ id, desc: c.code + '-PDU-' + side, dev_loc: locs[id] || '', sta: sc ? STA[sc.sta] : STA.normal, _kind: 'pdu', _ref: c.code, _side: side });
      });
      const lost = c.status === 'lost';
      push({
        id: c.pod.replace('-', '') + '_' + c.code + '_ID01_DV', desc: 'Kabin ' + c.code + ' Sensör Modülü',
        dev_loc: locs['K' + c.code + '_PDU_A_DV'] || '', sta: lost ? STA.lost : STA[SENSOR_STATE[c.code] || 'normal'], _kind: 'sns', _ref: c.code
      });
    });

    // ---- UPS (SNMP v3), klimalar (BACnet/IP), klima panoları (Modbus RTU)
    D.ups.slice().sort(byLabel).forEach((u, i) => push({
      id: u.devId, desc: u.label, dev_loc: '1.KAT/1.SALON/UPS HATTI ' + u.label.replace(/^UPS\s*/, '').charAt(0), sta: STA[u.status] || STA.normal, _kind: 'ups', _idx: i
    }));
    D.climates.slice().sort(byLabel).forEach((k, i) => push({
      id: k.devId, desc: k.label, dev_loc: '1.KAT/1.SALON/KLİMA', sta: STA[k.status] || STA.normal, _kind: 'klm', _idx: i
    }));
    const seen = {};
    D.panels.forEach((p, i) => {
      let id = p.devId;
      if (seen[id]) id = id.replace(/_DV$/, '') + (++seen[id]) + '_DV'; // yerleşimde aynı devId'li iki pano
      else seen[id] = 1;
      push({ id, desc: p.label, dev_loc: '1.KAT/1.SALON/PANO', sta: STA[p.status] || STA.normal, _kind: 'pnl', _idx: i });
    });

    // ---- Pano analizörleri (PMM, SNMP v2c) + Kilit ağ geçitleri (MQTT) — system-health ile aynı
    ['Master Pano PMM-1', 'A1 Klima Panosu PMM', 'B1 Klima Panosu PMM', 'UPS Çıkış Panosu A PMM', 'UPS Çıkış Panosu B PMM'].forEach((d, i) =>
      push({ id: 'PMM_' + (i + 1), desc: d, dev_loc: '1.KAT/1.SALON/PANO', sta: STA.normal, _kind: 'pmm', _idx: i }));
    push({ id: 'PMM_7', desc: 'Yedek Pano Analizörü PMM-7', dev_loc: '1.KAT/1.SALON/PANO', sta: STA.disabled, _kind: 'pmm', _idx: 6 });
    Array.from(new Set(D.cabinets.map(c => c.pod))).forEach(pod =>
      push({ id: 'SNS_GW_' + pod.replace('-', ''), desc: 'Kilit Ağ Geçidi ' + pod, dev_loc: '1.KAT/1.SALON/' + pod.replace('-', ' '), sta: STA.normal, _kind: 'gw', _ref: pod }));

    // ---------------------------------------------------------------------
    // Detay öznitelikleri (edit-device-popup → setDeviceDetails)
    // ---------------------------------------------------------------------
    const edits = {};
    function baseDetails(dv) {
      const rnd = D.rng(D.hash(dv.id + '-dev'));
      const snmp = (ver, host) => ({ con_host: host, con_port: '161', plg: 'snmp', pro_adr: '1', pro_ver: ver, pro_getc: ver === 'V3' ? '' : COMMUNITY.read,
        pro_usr: ver === 'V3' ? COMMUNITY.v3User : '', pro_v3_auth_level: ver === 'V3' ? 'authPriv' : '', pro_v3_auth: ver === 'V3' ? 'sha' : '', pro_v3_auth_proto: ver === 'V3' ? 'aes' : '' });
      switch (dv._kind) {
        case 'pdu': {
          // cabinet-detail / pdu-detail ile aynı IP ve SNMP sürümü (DCIM.data.pdu)
          const devs = D.cabinetMgr && D.cabinetMgr.pduDevs ? D.cabinetMgr.pduDevs(dv._ref) : [];
          const d = devs.find(x => x.id === dv.id) || {};
          return Object.assign(snmp(d.pro_ver || 'V2C', d.con_host || '-'), { ext_key: 'TTVM-' + dv._ref + '-' + dv._side });
        }
        case 'sns': {
          const c = D.findCabinet(dv._ref);
          // telemetry-points.html ile aynı Modbus TCP adresi
          return { con_host: '10.10.' + (60 + (c.code.charCodeAt(2) % 20)) + '.' + (10 + (parseInt(c.code.slice(3), 10) || 0)), con_port: '502', plg: 'modbus', pro_adr: '1' };
        }
        case 'ups': return snmp('V3', '10.10.20.' + (11 + dv._idx));
        case 'klm': return { con_host: '10.10.25.' + (31 + dv._idx), con_port: '47808', plg: 'bacnet', pro_adr: String(1100 + dv._idx + 1) };
        case 'pnl': return { con_host: 'COM' + (3 + (dv._idx % 2)), con_port: '-', plg: 'modbus_rtu', pro_adr: String(dv._idx + 1) };
        case 'pmm': return snmp('V2C', '10.10.30.' + (21 + dv._idx));
        case 'gw': return { con_host: 'sns-gw-' + dv._ref.toLowerCase(), con_port: '1883', plg: 'mqtt', pro_adr: String(Math.floor(rnd() * 8) + 1) };
        default: return {};
      }
    }

    D.engDeviceList = {
      STA,
      // doc('CMR/T01')/descendant::dev — belge sırasında (silinenler hariç)
      devices: () => list,
      // doc('CMR/T01')/descendant::dev[@id='<id>'] — liste öznitelikleri + bağlantı/SNMP öznitelikleri
      details(id) {
        const dv = list.find(x => x.id === id);
        if (!dv) return null;
        return Object.assign({ id: dv.id, desc: dv.desc, dev_loc: dv.dev_loc, sta: dv.sta }, baseDetails(dv), edits[id] || {});
      },
      // updateDeviceDetails: @con_host, @con_port, @pro_adr, @pro_ver, @pro_getc ... (bellekte)
      update(id, attrs) {
        if (!list.some(x => x.id === id)) return false;
        edits[id] = Object.assign(edits[id] || {}, attrs);
        return true;
      },
      // {"cmd":2, "id":"<id>", "xml":"<_/>"} — cihaz silme (bellekte)
      remove(id) {
        const i = list.findIndex(x => x.id === id);
        if (i < 0) return false;
        list.splice(i, 1);
        delete edits[id];
        return true;
      }
    };
  });
})();
