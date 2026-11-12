/* ==========================================================================
   DCIM Sunum — Alarmlar sayfa verisi (DCIM.data.alarmsPage)
   Ortak DCIM.data.activeAlarms / historicalAlarms (kat 1 senaryosu) sayfanın biçimine çevrilir ve
   tohumlu ek kayıtlarla genişletilir:
     - 2. ve 3. kat alarmları (kilit sayfasındaki açık kapaklar, sıcaklık, klima, UPS, PDU kesici ACİL)
     - Sistem grubu (GRP_SYSTEM, varsayılan gizli) motor sağlık alarmları (xdbsta_ / consta_ / thrsta_)
     - Normale dönmüş, "Gördüm" bekleyen bir alarm (seviye Normal)
   Gruplar orijinal db_CMA.xml ALM_Groups listesinin karşılığıdır (kod, ad, renk, sıra, hide).
   Seviye: Acil / Alarm / Uyarı / Veri Alınamıyor / Normal (alarm-severity.util; Acil mor).
   Bağımlılık: js/mock-data.js (DCIM.data.activeAlarms, historicalAlarms, floors, findCabinet, getLockFloor, rng, hash)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D) return;

  const NOW = Date.now();
  const ago = m => new Date(NOW - m * 60000);

  // db_CMA.xml ALM_Groups karşılığı (orijinal ürün grupları)
  const GROUPS = [
    { code: 'whitespace', name: 'Beyaz Alan', color: '#0ea5e9', order: 1, hidden: false },
    { code: 'power', name: 'Enerji Grubu', color: '#10b981', order: 2, hidden: false },
    { code: 'cooling', name: 'Soğutma', color: '#ef4444', order: 3, hidden: false },
    { code: 'environment', name: 'Çevre', color: '#8b5cf6', order: 4, hidden: false },
    { code: 'system', name: 'Sistem', color: '#64748b', order: 5, hidden: true },
    { code: 'other', name: 'Diğer', color: '#f59e0b', order: 9, hidden: false }
  ];
  const LEGACY = { 'Beyaz Alan': 'whitespace', 'Enerji Grubu': 'power', 'Soğutma': 'cooling', 'Sogutma': 'cooling', 'Diğer': 'other', 'Çevre': 'environment' };
  const grpCode = g => LEGACY[g] || g || 'other';

  // Ortak mock seviyesi → orijinal seviye (Acil yalnız seçilmiş kritik noktalarda; burada sev 'critical')
  function levelOf(a) {
    if (a.level === 'normal') return 'normal';
    if (a.level === 'lost') return 'kayip';
    if (a.level === 'warning') return 'uyari';
    return a.severity === 'critical' ? 'acil' : 'alarm';
  }

  const floorByDigit = d => (D.floors || []).find(f => f.digit === d) || null;

  // Kabin kodundan kat + POD; ekipmanda konumun son parçası
  function place(target, location) {
    const cab = target && /^\d[A-Z]{2}\d{2}$/.test(target) ? (target.charAt(0) === '1' ? D.findCabinet(target) : lockCab(target)) : null;
    if (cab) return { flr: floorByDigit(cab.floor).id, cab: cab.code, pod: cab.pod };
    const parts = String(location || '').split('/').map(s => s.trim()).filter(Boolean);
    return { flr: 'T00', cab: '', pod: '', loc: parts.length > 2 ? parts[parts.length - 1] : '' };
  }
  function lockCab(code) {
    const f = floorByDigit(Number(code.charAt(0)));
    if (!f || !D.getLockFloor) return null;
    const card = D.getLockFloor(f.id).find(c => c.cabinetCode === code);
    return card ? card.cabinet : null;
  }

  function fromShared(a, extra) {
    const p = place(a.target, a.location);
    return Object.assign({
      id: a.id, tim: a.tim, rid: a.rid, desc: a.desc, txt: a.txt, fnc: a.fnc,
      grp: grpCode(a.grp), level: levelOf(a), flr: p.flr, cab: p.cab, pod: p.pod, loc: p.loc || '',
      target: a.target || '', deviceType: a.deviceType,
      ack: a.ack ? { user: a.ack.user, tim: a.ack.tim, note: '' } : null
    }, extra || {});
  }

  // ---------------------------------------------------------------------------
  // 2. / 3. kat ve sistem kayıtları (tohumlu)
  // ---------------------------------------------------------------------------
  // PDU Detay sayfasındaki ACİL kesici senaryosuyla aynı kabin (pdu-detail.data.js pickCab kuralı)
  function pickPduCab(floorId, key) {
    if (!D.getLockFloor) return '';
    const list = D.getLockFloor(floorId).map(c => c.cabinet)
      .filter(c => c.pduA > 1 && c.pduB > 1 && !/^NW-/.test(c.pod)).map(c => c.code).sort();
    if (!list.length) return '';
    const rnd = D.rng(D.hash(key));
    return list[Math.floor(rnd() * list.length) % list.length];
  }

  function extraActive() {
    const out = [];
    let n = 0;
    const add = (o, m) => out.push(Object.assign({ id: 'AX-' + String(++n).padStart(3, '0'), tim: ago(m), ack: null, loc: '', cab: '', pod: '' }, o));
    ['T02', 'T03'].forEach(fid => {
      const cards = D.getLockFloor ? D.getLockFloor(fid) : [];
      const rnd = D.rng(D.hash('alarms-page-' + fid));
      // Kilit sayfasındaki açık kapaklar
      cards.forEach(c => {
        ['front', 'rear'].forEach(side => {
          if (!c[side] || c[side].state !== 'open') return;
          add({
            rid: c[side].sourceId, desc: c.cabinetCode + (side === 'front' ? ' Ön Kapak' : ' Arka Kapak'), fnc: 'door', grp: 'whitespace',
            level: 'uyari', txt: (side === 'front' ? 'Ön' : 'Arka') + ' kapak açık — kart okutuldu', flr: fid, cab: c.cabinetCode, pod: c.pod,
            target: c.cabinetCode, deviceType: 'lock'
          }, Math.round(20 + rnd() * 160));
        });
      });
      const pool = cards.filter(c => !/^NW-/.test(c.pod));
      const pickC = () => pool[Math.floor(rnd() * pool.length) % pool.length];
      const t1 = pickC(), t2 = pickC();
      add({
        rid: 'DCA_' + t1.cabinetCode + '_TEMP_MID', desc: 'Kabin ' + t1.cabinetCode + ' Orta Sıcaklık', fnc: 'onlhi', grp: 'cooling', level: 'alarm',
        txt: 'Kabin ' + t1.cabinetCode + ' Yüksek Sıcaklık: ' + (30 + rnd() * 1.5).toFixed(1) + ' °C (Üst Limit 27.0 °C)', flr: fid, cab: t1.cabinetCode, pod: t1.pod,
        target: t1.cabinetCode, deviceType: 'cabinet'
      }, Math.round(10 + rnd() * 50));
      add({
        rid: 'DCA_' + t2.cabinetCode + '_HUM_MID', desc: 'Kabin ' + t2.cabinetCode + ' Nem', fnc: 'onlhi', grp: 'environment', level: 'uyari',
        txt: 'Yüksek Nem: %' + Math.round(61 + rnd() * 3) + ' (Uyarı Limiti %60)', flr: fid, cab: t2.cabinetCode, pod: t2.pod, target: t2.cabinetCode, deviceType: 'cabinet'
      }, Math.round(60 + rnd() * 120));
    });
    // 2. kat: PDU kesici ACİL (PDU Detay senaryosu), klima filtresi, UPS yükü
    const acil = pickPduCab('T02', 'pdu-page-acil');
    const acilCab = acil ? lockCab(acil) : null;
    if (acilCab) {
      add({
        rid: 'DCA_' + acil + '_PDU_A_OCP_C2', desc: 'Kabin ' + acil + ' PDU-A', fnc: 'onlhi', grp: 'whitespace', level: 'acil',
        txt: 'PDU-A C2 kesici akımı anma değerinde: 15.52 A (Anma 16 A)', flr: 'T02', cab: acil, pod: acilCab.pod, target: acil, deviceType: 'cabinet'
      }, 6);
    }
    add({ rid: 'DCA_KLM205_FLT', desc: 'KLIMA 205', fnc: 'onequ', grp: 'cooling', level: 'uyari', txt: 'Filtre kirli — bakım gerekli (Δp 176 Pa)', flr: 'T02', loc: '2. Salon', target: 'KLIMA 205', deviceType: 'climate' }, 95);
    add({ rid: 'KAT2_SAL1_C3_UPS_LOAD', desc: 'UPS C3', fnc: 'onlhi', grp: 'power', level: 'uyari', txt: 'Yük oranı %83 (Uyarı Limiti %80)', flr: 'T02', loc: 'UPS Hattı C', target: 'UPS C3', deviceType: 'ups' }, 132);
    // 3. kat: sıra içi klimada su kaçağı (ACİL), UPS haberleşme kaybı
    add({ rid: 'DCA_KLM304_LEAK', desc: 'KLIMA 304', fnc: 'onequ', grp: 'cooling', level: 'acil', txt: 'Su kaçağı algılandı (alt tava sensörü)', flr: 'T03', loc: 'POD-22', target: 'KLIMA 304', deviceType: 'climate' }, 13);
    add({ rid: 'KAT3_SAL1_F2_UPS_SNMP', desc: 'UPS F2', fnc: 'devsta_nbi', grp: 'power', level: 'kayip', txt: 'SNMP haberleşme kaybı (3 ardışık sorgu yanıtsız)', flr: 'T03', loc: 'UPS Hattı F', target: 'UPS F2', deviceType: 'ups' }, 38);
    // 1. kat: normale dönmüş, "Gördüm" bekleyen
    add({ rid: 'DCA_KLM106_FAN', desc: 'KLIMA 106', fnc: 'onlvl', grp: 'cooling', level: 'normal', txt: 'Alarm durumu kalktı — fan hızı %64', flr: 'T00', loc: 'Güney Duvar', target: 'KLIMA 106', deviceType: 'climate' }, 19);
    // Sistem (GRP_SYSTEM, hide="1"): motor sağlık kayıtları, katsız
    add({ rid: 'xdbsta_CMR_T02', desc: 'CMR/T02 Dokümanı', fnc: 'xdbsta_CMR_T02', grp: 'system', level: 'uyari', txt: 'Doküman güncelleme gecikmesi 45 sn (Limit 30 sn)', flr: '', deviceType: 'system' }, 27);
    add({ rid: 'consta_MQTT_BRK1', desc: 'MQTT Aracısı', fnc: 'consta_MQTT_BRK1', grp: 'system', level: 'uyari', txt: 'Bağlantı yeniden kuruldu (2 kopma / 10 dk)', flr: '', deviceType: 'system' }, 48);
    add({ rid: 'thrsta_CN_SQL', desc: 'CN_SQL İş Parçacığı', fnc: 'thrsta_CN_SQL', grp: 'system', level: 'alarm', txt: 'Kuyrukta 120 iş bekliyor (Limit 100)', flr: '', deviceType: 'system' }, 9);
    return out;
  }

  let cache = null;
  function build() {
    if (cache) return cache;
    const active = (D.activeAlarms || []).map(a => fromShared(a)).concat(extraActive())
      .sort((a, b) => b.tim - a.tim);

    // Tarihsel: alarm (raise) / normale dönüş (rtn) / görüldü (ack) olayları
    const hist = [];
    let seq = 4102500;
    const push = (r, event, tim, extra) => hist.push(Object.assign({}, r, { id: 'H' + (++seq), cmaId: String(seq), event, tim }, extra || {}));
    (D.historicalAlarms || []).forEach(h => {
      const r = fromShared(h);
      if (h.cleared || h.fnc === 'onlvl') { push(r, 'rtn', h.tim, { level: 'normal', ack: null }); return; }
      push(r, 'raise', h.tim, { ack: null });
      if (h.ack) push(r, 'ack', h.ack.tim, { ack: { user: h.ack.user, tim: h.ack.tim, note: '' }, txt: 'Görüldü' });
    });
    // Ek aktif kayıtların oluşma satırları + 2./3. kat eski olaylar
    extraActive().forEach(a => { if (a.level !== 'normal') push(a, 'raise', a.tim, { ack: null }); });
    const rnd = D.rng(D.hash('alarms-page-history'));
    ['T02', 'T03'].forEach(fid => {
      const cards = (D.getLockFloor ? D.getLockFloor(fid) : []).filter(c => !/^NW-/.test(c.pod));
      for (let i = 0; i < 14; i++) {
        const c = cards[Math.floor(rnd() * cards.length) % cards.length];
        const m = Math.round(300 + rnd() * 9500);
        const kind = rnd();
        const r = kind < 0.45
          ? { rid: 'DCA_' + c.cabinetCode + '_TEMP_MID', desc: 'Kabin ' + c.cabinetCode + ' Orta Sıcaklık', fnc: 'onlhi', grp: 'cooling', level: 'uyari', txt: 'Sıcaklık Uyarısı: ' + (27 + rnd()).toFixed(1) + ' °C' }
          : kind < 0.75
            ? { rid: 'DCA_' + c.cabinetCode + '_OCP_CURR', desc: 'Kabin ' + c.cabinetCode + ' Toplam Akım', fnc: 'onlhi', grp: 'whitespace', level: 'alarm', txt: 'Yüksek Akım: ' + (32 + rnd() * 3).toFixed(1) + ' A' }
            : { rid: c.pod.replace('-', '') + '_' + c.cabinetCode + '_FDOOR', desc: c.cabinetCode + ' Ön Kapak', fnc: 'door', grp: 'whitespace', level: 'uyari', txt: 'Ön kapak açıldı — yetkili kart ile' };
        Object.assign(r, { flr: fid, cab: c.cabinetCode, pod: c.pod, loc: '', target: c.cabinetCode, deviceType: 'cabinet' });
        push(r, 'raise', ago(m), { ack: null });
        const user = ['Mehmet Kaya', 'Ayşe Demir', 'Burak Şahin', 'Zeynep Arslan'][Math.floor(rnd() * 4)];
        push(r, 'ack', ago(m - 6), { ack: { user, tim: ago(m - 6), note: '' }, txt: 'Görüldü' });
        push(r, 'rtn', ago(m - Math.round(8 + rnd() * 80)), { level: 'normal', fnc: 'onlvl', txt: 'Değer normale döndü', ack: null });
      }
    });
    hist.sort((a, b) => b.tim - a.tim);
    cache = { active, history: hist };
    return cache;
  }

  D.alarmsPage = {
    groups: GROUPS,
    get active() { return build().active; },
    get history() { return build().history; }
  };
})();
