/* ==========================================================================
   DCIM Sunum — Bakım Modülü sayfası mock verisi (DCIM.data.mntPage) — maintenance.html
   Kaynak bileşenler: pages/engineering/maintenance-module (Bakım Tablosu + sihirbaz),
   maintenance-plans (Periyodik Bakım Takvimi), maintenance-alarm (Alarm Bakımları).
   Kaynak sorguların karşılığı:
     api.HIS_mnt_asm_list / HIS_mnt_asm_counts → records (mnt_state OPEN|DONE|UNKNOWN|CANCELLED, mnt_phase, prio, src)
     api.MNT_detail (yaşam döngüsü)             → records[].history (CREATE/ASSIGN/START/COMPLETE/CANCEL/CLASSIFY)
     api.MNT_calendar_list                      → plans (period_n + period_unit D|W|M|Y, next_due, last_done)
     api.MNT_alarm_list                         → alarm (Tarihsel Alarmlar → "Bakım Aç" kayıtları; phase PLANNED|STARTED|DONE)
   Tüm cihazlar kurgusaldır: DCIM.data.cabinets / ups / climates / panels (kat 1) + iki jeneratör.
   Marka/model/seri/garanti/not alanları tohumlu üretilir (DCIM.data.rng). Tarihler çalışma anına göre gün ofsetiyle
   ('YYYY-MM-DD', yerel saat). Sunum senaryosu (ortak brief) ile tutarlı açık kayıtlar: KLIMA 109 yüksek basınç,
   KLIMA 104 filtre, KLIMA 112 dönüş havası, UPS A5 akü modu, UPS B7 SNMP kaybı, A1 KLIMA PANOSU faz dengesizliği,
   1DU06 yüksek sıcaklık, 1DP06 kilit motoru, 1DC06 yetkili bakım (tamamlandı).
   Bağımlılık: js/mock-data.js (DCIM.data)
   ========================================================================== */
(function () {
  'use strict';

  const D = window.DCIM && window.DCIM.data;
  if (!D) return;

  D.lazy('mntPage', function () {
    const rnd = D.rng(D.hash('maintenance-page-2026'));
    const pick = arr => arr[Math.floor(rnd() * arr.length) % arr.length];
    const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const pad = n => String(n).padStart(2, '0');
    const keyOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const day = n => { const d = new Date(today.getTime()); d.setDate(d.getDate() + n); return keyOf(d); };
    // 'YYYY-MM-DD HH:mm:ss' (sunucu saati biçimi)
    const stamp = (dayOfs, h, m) => day(dayOfs) + ' ' + pad(h == null ? between(8, 17) : h) + ':' + pad(m == null ? between(0, 59) : m) + ':' + pad(between(0, 59));

    // -------------------------------------------------------------------------
    // ASM — varlık envanteri (altyapı + kabin içi BT varlıkları)
    // -------------------------------------------------------------------------
    const ASSETS = [];
    let asmSeq = 3001;
    const serial = (prefix, digits) => prefix + String(between(Math.pow(10, digits - 1), Math.pow(10, digits) - 1));
    function addAsset(o) {
      const a = Object.assign({ asm_id: String(asmSeq), asset_id: 'DCA-AST-' + String(50000 + asmSeq) }, o);
      asmSeq++;
      ASSETS.push(a);
      return a;
    }
    const byLabel = (a, b) => a.label.localeCompare(b.label, 'tr', { numeric: true });
    const INFRA = {};
    (D.ups || []).slice().sort(byLabel).forEach(u => {
      const line = u.label.replace('UPS ', '').charAt(0);
      INFRA[u.label] = addAsset({ name: u.label, manufacturer: 'Voltaris', model: 'VX-Modular 80 kVA', asset_serial_no: serial('VXM' + line, 7), cabin_name: 'UPS Hattı ' + line, device_type: 'UPS' });
    });
    (D.climates || []).slice().sort(byLabel).forEach(c => {
      INFRA[c.label] = addAsset({ name: c.label, manufacturer: 'Serin İklim', model: 'PA-CRAC 45', asset_serial_no: serial('PAC', 8), cabin_name: 'Kat 1 / Salon 1', device_type: 'Klima' });
    });
    (D.panels || []).forEach(p => {
      INFRA[p.label] = addAsset({ name: p.label, manufacturer: 'Kuzey Pano', model: 'EK-Pano 630A', asset_serial_no: serial('EKP', 8), cabin_name: 'Kat 1 / Salon 1', device_type: 'Pano' });
    });
    INFRA['Jeneratör G1'] = addAsset({ name: 'Jeneratör G1 (A Kolu)', manufacturer: 'Anatolia Power', model: 'AP-1100 kVA', asset_serial_no: serial('APG', 9), cabin_name: 'Jeneratör Sahası', device_type: 'Jeneratör' });
    INFRA['Jeneratör G2'] = addAsset({ name: 'Jeneratör G2 (B Kolu)', manufacturer: 'Anatolia Power', model: 'AP-1100 kVA', asset_serial_no: serial('APG', 9), cabin_name: 'Jeneratör Sahası', device_type: 'Jeneratör' });

    asmSeq = 3200;
    const IT = [];
    (D.cabinets || []).forEach(c => {
      (c.assets || []).forEach(a => {
        const row = addAsset({ name: a.hostname, manufacturer: a.manufacturer, model: a.model, asset_serial_no: a.serial, cabin_name: c.code, device_type: a.assetType });
        if (a.assetType !== 'Patch Panel') IT.push(row);
      });
    });

    // -------------------------------------------------------------------------
    // MNT — bakım kayıtları (yaşam döngüsü + genişletme alanları: öncelik, kaynak)
    // -------------------------------------------------------------------------
    const RECORDS = [];
    let mntSeq = 7400;
    function rec(asset, o) {
      if (!asset) return null;
      const r = Object.assign({
        mnt_id: String(mntSeq++), asm_id: asset.asm_id, asset_serial_no: asset.asset_serial_no, manufacturer: asset.manufacturer,
        model: asset.model, cabin_name: asset.cabin_name, name: asset.name,
        tim_warr: '', tim_mnt_plan: '', mnt_kind: '', mnt_notes: '', mnt_usr: '', prio: '', src: 'MANUAL', src_ref: '', plan_id: '',
        mnt_state: 'OPEN', mnt_phase: 'PLANNED', started_at: '', done_at: '', cancel_at: '', work_note: '', result_note: '', cancel_note: '', history: []
      }, o);
      // İşlem geçmişi (mnt_event): oluşturma → (atama) → (başlatma) → (tamamlama / iptal / sınıflandırma)
      const createdOfs = r.created != null ? r.created : -between(20, 90);
      const actor = r.src === 'PLAN' ? 'system (plan)' : r.src === 'FAULT' ? 'system (arıza kuralı)' : pick(['Mehmet Kaya', 'Ayşe Demir', 'Zeynep Arslan']);
      const h = [{ evt_typ: 'CREATE', evt_at: stamp(createdOfs), actor, from_state: '', to_state: r.mnt_state === 'UNKNOWN' ? 'UNKNOWN' : 'PLANNED', note: r.src_ref ? 'Kaynak: ' + r.src_ref : '' }];
      if (r.mnt_usr && r.mnt_state !== 'UNKNOWN') h.push({ evt_typ: 'ASSIGN', evt_at: stamp(createdOfs + 1), actor: 'Ayşe Demir', from_state: 'PLANNED', to_state: 'PLANNED', old_val: '', new_val: r.mnt_usr });
      if (r.started_at) h.push({ evt_typ: 'START', evt_at: r.started_at, actor: r.mnt_usr, from_state: 'PLANNED', to_state: 'STARTED' });
      if (r.done_at) h.push({ evt_typ: 'COMPLETE', evt_at: r.done_at, actor: r.mnt_usr, from_state: r.started_at ? 'STARTED' : 'PLANNED', to_state: 'DONE', note: r.work_note, note2: r.result_note });
      if (r.cancel_at) h.push({ evt_typ: 'CANCEL', evt_at: r.cancel_at, actor: 'Ayşe Demir', from_state: 'PLANNED', to_state: 'CANCELLED', note: r.cancel_note });
      r.history = h.reverse();
      delete r.created;
      RECORDS.push(r);
      return r;
    }

    const warrUpsA = day(52), warrUpsB = day(418), warrKlima = day(236), warrPano = day(640), warrGen = day(-35);
    const SERVICE = {
      Dell: 'Dell Servis Ortağı', HPE: 'HPE Servis Ortağı', Lenovo: 'Lenovo Servis Ortağı', Cisco: 'Cisco Destek Ortağı', Huawei: 'Huawei Servis Ortağı',
      NetApp: 'NetApp Destek Ortağı', Juniper: 'Juniper Destek Ortağı', Fortinet: 'Fortinet Destek Ortağı', Arista: 'Arista Destek Ortağı', Supermicro: 'Supermicro Servis Ortağı'
    };
    const HW_NOTES = {
      Sunucu: ['Arızalı disk (1.92 TB SSD) değişimi, RAID yeniden oluşturma', 'PSU-2 arızası — yedek güç kaynağı değişimi', 'Fan modülü değişimi (FAN3 uyarısı)', 'DIMM hatası — bellek modülü değişimi'],
      Depolama: ['Disk rafı arızalı sürücü değişimi', 'Denetleyici önbellek aküsü değişimi'],
      Switch: ['Arızalı SFP+ modül değişimi', 'Yedek fan tepsisi değişimi'],
      Router: ['Arızalı QSFP28 modül değişimi'],
      Firewall: ['Güç kaynağı değişimi (PSU-1)']
    };
    const INTERNAL = { Sunucu: 'Zeynep Arslan', Depolama: 'Zeynep Arslan', Switch: 'Burak Şahin', Router: 'Burak Şahin', Firewall: 'Burak Şahin' };
    const WARR_POOL = [-40, -12, 6, 11, 19, 27, 45, 63, 88, 104, 131, 166, 212, 259, 301, 344, 402, 488, 575, 690, 812, 0];
    const PLAN_POOL = [-9, -3, 2, 5, 9, 13, 17, 22, 29, 38, 47, 61, 76, 95, 120, 150, 185, 240, 0];
    const PRIO = ['', 'LOW', 'NORMAL', 'NORMAL', 'HIGH'];

    // 1DC06 yetkili periyodik kabin bakımı — tamamlandı (senaryo)
    IT.filter(a => a.cabin_name === '1DC06').slice(0, 2).forEach(a => rec(a, {
      tim_warr: day(between(200, 500)), tim_mnt_plan: day(-1), mnt_kind: 'Periyodik Bakim', prio: 'NORMAL',
      mnt_notes: '1DC06 periyodik kabin bakımı — filtre, kablo düzeni ve PDU bağlantıları kontrol edildi', mnt_usr: 'Emre Çelik',
      mnt_state: 'DONE', mnt_phase: 'DONE', started_at: stamp(-1, 9, 10), done_at: stamp(-1, 11, 40), created: -9,
      work_note: 'Kabin içi toz temizliği, PDU bağlantı torku ve kablo bağları kontrol edildi.', result_note: 'Bulgu yok; kabin normal çalışmada.'
    }));

    const pool = IT.filter(a => a.cabin_name !== '1DC06');
    const chosen = [];
    const used = new Set();
    while (chosen.length < 58 && chosen.length < pool.length) {
      const a = pool[Math.floor(rnd() * pool.length)];
      if (used.has(a.asm_id)) continue;
      used.add(a.asm_id);
      chosen.push(a);
    }
    const srv1DU06 = IT.find(a => a.cabin_name === '1DU06' && a.device_type === 'Sunucu');
    if (srv1DU06 && !used.has(srv1DU06.asm_id)) chosen[chosen.length - 1] = srv1DU06;

    function itRecord(a, state) {
      const roll = rnd();
      const hw = HW_NOTES[a.device_type] || HW_NOTES.Sunucu;
      let kind, notes, usr;
      if (roll < 0.34) { kind = 'Yazilim Guncelleme'; notes = 'Firmware / BMC güncellemesi'; usr = rnd() < 0.5 ? INTERNAL[a.device_type] || 'Zeynep Arslan' : SERVICE[a.manufacturer] || 'Üretici Servisi'; }
      else if (roll < 0.62) { kind = 'Donanim Degisimi'; notes = pick(hw); usr = SERVICE[a.manufacturer] || 'Üretici Servisi'; }
      else if (roll < 0.9) { kind = 'Periyodik Bakim'; notes = 'Yıllık önleyici bakım — toz temizliği, donanım günlüğü ve fan kontrolü'; usr = INTERNAL[a.device_type] || 'Zeynep Arslan'; }
      else { kind = 'Diger'; notes = 'Garanti / destek sözleşmesi yenileme teklifi bekleniyor'; usr = 'Ayşe Demir'; }
      const w = pick(WARR_POOL), p = pick(PLAN_POOL);
      const o = {
        tim_warr: w === 0 ? '' : day(w), mnt_kind: kind, mnt_notes: a.name + ' — ' + notes, mnt_usr: usr, prio: pick(PRIO),
        src: kind === 'Periyodik Bakim' && rnd() < 0.6 ? 'PLAN' : (kind === 'Donanim Degisimi' && rnd() < 0.3 ? 'PREDICT' : 'MANUAL')
      };
      if (state === 'DONE') {
        const d = -between(15, 320);
        Object.assign(o, { tim_mnt_plan: day(d), mnt_state: 'DONE', mnt_phase: 'DONE', done_at: stamp(d), created: d - between(5, 30),
          work_note: notes + ' yapıldı.', result_note: 'Cihaz sağlıklı; kayıt kapatıldı.' });
      } else if (state === 'UNKNOWN') {
        Object.assign(o, { tim_mnt_plan: day(-between(200, 600)), mnt_state: 'UNKNOWN', mnt_phase: 'UNKNOWN', src: '', prio: '', created: -between(620, 900) });
      } else if (state === 'CANCELLED') {
        const d = -between(10, 120);
        Object.assign(o, { tim_mnt_plan: day(d + 7), mnt_state: 'CANCELLED', mnt_phase: 'CANCELLED', cancel_at: stamp(d), created: d - 15,
          cancel_note: pick(['Cihaz devreden çıkarıldı (müşteri sözleşmesi sona erdi).', 'Üretici, garanti kapsamında uzaktan çözüm sağladı.', 'Aynı iş başka bakım kaydıyla yapıldı.']) });
      } else {
        Object.assign(o, { tim_mnt_plan: p === 0 ? '' : day(p) });
        if (p <= 2 && p !== 0 && rnd() < 0.5) Object.assign(o, { mnt_phase: 'STARTED', started_at: stamp(Math.min(0, p), 9) });
      }
      return rec(a, o);
    }
    chosen.slice(0, 16).forEach(a => itRecord(a, 'DONE'));
    chosen.slice(16, 21).forEach(a => itRecord(a, 'UNKNOWN'));
    chosen.slice(21, 24).forEach(a => itRecord(a, 'CANCELLED'));
    chosen.slice(24).forEach(a => {
      const r = itRecord(a, 'OPEN');
      if (a === srv1DU06) {
        Object.assign(r, { mnt_kind: 'Donanim Degisimi', tim_mnt_plan: day(1), mnt_usr: SERVICE[a.manufacturer] || 'Üretici Servisi', prio: 'HIGH', src: 'FAULT',
          src_ref: 'DCA_1DU06_TEMP_MID', mnt_notes: a.name + ' — 1DU06 yüksek sıcaklık sonrası fan modülü ve termal macun kontrolü' });
      }
    });

    // --- Altyapı: geçmiş (tamamlanan) kayıtlar -----------------------------------------
    const done = (asset, d, o) => rec(asset, Object.assign({ tim_mnt_plan: day(d), mnt_state: 'DONE', mnt_phase: 'DONE', done_at: stamp(d), started_at: stamp(d, 8), created: d - 20,
      work_note: 'Planlanan bakım adımları uygulandı.', result_note: 'Ölçümler sınırlar içinde; cihaz devrede.' }, o));
    done(INFRA['UPS A5'], -344, { tim_warr: warrUpsA, mnt_kind: 'Periyodik Bakim', mnt_usr: 'Voltaris Yetkili Servis', prio: 'NORMAL', src: 'PLAN', plan_id: '91',
      mnt_notes: 'UPS A5 — yıllık üretici bakımı: akü empedans testi, kapasitör ve fan kontrolü' });
    done(INFRA['UPS A3'], -196, { tim_warr: warrUpsA, mnt_kind: 'Donanim Degisimi', mnt_usr: 'Voltaris Yetkili Servis', prio: 'HIGH',
      mnt_notes: 'UPS A3 — akü grubu 2. dizide 4 adet blok değişimi' });
    done(INFRA['UPS B4'], -121, { tim_warr: warrUpsB, mnt_kind: 'Yazilim Guncelleme', mnt_usr: 'Burak Şahin', prio: 'LOW',
      mnt_notes: 'UPS B4 — izleme kartı firmware güncellemesi' });
    done(INFRA['KLIMA 109'], -63, { tim_warr: warrKlima, mnt_kind: 'Periyodik Bakim', mnt_usr: 'Can Öztürk', prio: 'NORMAL', src: 'PLAN', plan_id: '94',
      mnt_notes: 'KLIMA 109 — 3 aylık bakım: kondenser temizliği, gaz basıncı ve kayış kontrolü' });
    done(INFRA['KLIMA 104'], -92, { tim_warr: warrKlima, mnt_kind: 'Periyodik Bakim', mnt_usr: 'Can Öztürk', prio: 'NORMAL', src: 'PLAN', plan_id: '95',
      mnt_notes: 'KLIMA 104 — 3 aylık bakım: G4 filtre değişimi, drenaj ve fan kontrolü' });
    done(INFRA['Jeneratör G1'], -30, { tim_warr: warrGen, mnt_kind: 'Periyodik Bakim', mnt_usr: 'Emre Çelik', prio: 'NORMAL', src: 'PLAN', plan_id: '92',
      mnt_notes: 'Jeneratör G1 — aylık yük testi: %75 yükte 30 dk başarılı, yakıt seviyesi %92' });
    done(INFRA['B1 Klima Panosu'], -150, { tim_warr: warrPano, mnt_kind: 'Periyodik Bakim', mnt_usr: 'Emre Çelik', prio: 'LOW',
      mnt_notes: 'B1 Klima Panosu — termal kamera ölçümü ve klemens sıkılığı kontrolü' });
    rec(INFRA['UPS B2'], { tim_warr: warrUpsB, tim_mnt_plan: day(-410), mnt_kind: 'Periyodik Bakim', mnt_usr: 'Voltaris Yetkili Servis', mnt_state: 'UNKNOWN', mnt_phase: 'UNKNOWN', src: '', created: -430,
      mnt_notes: 'UPS B2 — devreye alma sonrası ilk bakım (eski kayıt)' });

    // --- Altyapı: açık periyodik planlar (plan kaynaklı) --------------------------------
    ['UPS A1', 'UPS A2', 'UPS A4', 'UPS A6', 'UPS A7'].forEach(l => rec(INFRA[l], {
      tim_warr: warrUpsA, tim_mnt_plan: day(21), mnt_kind: 'Periyodik Bakim', mnt_usr: 'Voltaris Yetkili Servis', prio: 'NORMAL', src: 'PLAN', plan_id: '91', created: -9,
      mnt_notes: l + ' — UPS A hattı yıllık üretici bakımı'
    }));
    ['UPS B1', 'UPS B3', 'UPS B5', 'UPS B6'].forEach(l => rec(INFRA[l], {
      tim_warr: warrUpsB, tim_mnt_plan: day(143), mnt_kind: 'Periyodik Bakim', mnt_usr: 'Voltaris Yetkili Servis', prio: 'LOW', src: 'PLAN', plan_id: '93', created: -4,
      mnt_notes: l + ' — UPS B hattı yıllık üretici bakımı (akü empedans testi dahil)'
    }));
    const KLIMA_PLAN = { 'KLIMA 101': 12, 'KLIMA 102': 12, 'KLIMA 103': 33, 'KLIMA 105': 33, 'KLIMA 106': -4, 'KLIMA 107': 54, 'KLIMA 108': 75, 'KLIMA 110': 26, 'KLIMA 111': 26 };
    Object.keys(KLIMA_PLAN).forEach(l => rec(INFRA[l], {
      tim_warr: warrKlima, tim_mnt_plan: day(KLIMA_PLAN[l]), mnt_kind: 'Periyodik Bakim', mnt_usr: 'Can Öztürk', prio: 'NORMAL', src: 'PLAN', plan_id: '94', created: -6,
      mnt_notes: l + ' — 3 aylık periyodik bakım: filtre, kayış, drenaj ve gaz basıncı kontrolü'
    }));
    ['Klimalar Kontrol Panosu', 'A2 Klima Panosu', 'A3 Klima Panosu', 'B2 Klima Panosu'].forEach((l, i) => rec(INFRA[l], {
      tim_warr: warrPano, tim_mnt_plan: day(96 + i * 14), mnt_kind: 'Periyodik Bakim', mnt_usr: 'Emre Çelik', prio: 'LOW', src: 'PLAN', plan_id: '96', created: -3,
      mnt_notes: l + ' — yıllık termografi ve klemens sıkılığı kontrolü'
    }));
    rec(INFRA['Jeneratör G2'], { tim_warr: warrGen, tim_mnt_plan: day(1), mnt_kind: 'Periyodik Bakim', mnt_usr: 'Emre Çelik', prio: 'NORMAL', src: 'PLAN', plan_id: '92', created: -6,
      mnt_notes: 'Jeneratör G2 — aylık yük testi (yük bankası, 30 dk)' });

    // --- Altyapı: sunum senaryosu (en yeni kayıtlar → tablonun ilk sayfası) --------------
    rec(INFRA['A1 KLIMA PANOSU'], { tim_warr: warrPano, tim_mnt_plan: day(3), mnt_kind: 'Periyodik Bakim', mnt_usr: 'Emre Çelik', prio: 'HIGH', src: 'FAULT', src_ref: 'KAT1_A1_KLIMA_PANOSU_PHASE', created: -1,
      mnt_notes: 'A1 KLIMA PANOSU — faz dengesizliği: termal kamera ölçümü ve yük dengeleme' });
    rec(INFRA['KLIMA 112'], { tim_warr: warrKlima, tim_mnt_plan: day(2), mnt_kind: 'Kalibrasyon', mnt_usr: 'Can Öztürk', prio: 'NORMAL', src: 'PREDICT', created: -2,
      mnt_notes: 'KLIMA 112 — dönüş havası yüksek: sıcaklık sensörü kalibrasyonu' });
    rec(INFRA['UPS B7'], { tim_warr: warrUpsB, tim_mnt_plan: day(0), mnt_kind: 'Donanim Degisimi', mnt_usr: 'Burak Şahin', prio: 'HIGH', src: 'FAULT', src_ref: 'KAT1_SAL1_B7_UPS_SNMP', created: -1,
      mnt_phase: 'STARTED', started_at: stamp(0, 9, 20), mnt_notes: 'UPS B7 — SNMP haberleşme kaybı: yedek izleme kartı değişimi' });
    rec(INFRA['KLIMA 104'], { tim_warr: warrKlima, tim_mnt_plan: day(0), mnt_kind: 'Periyodik Bakim', mnt_usr: 'Can Öztürk', prio: 'NORMAL', src: 'FAULT', src_ref: 'KAT1_SAL1_KLIMA104_FILTER', created: -1,
      mnt_notes: 'KLIMA 104 — filtre kirli (Δp yüksek): G4 filtre seti değişimi' });
    rec(INFRA['UPS A5'], { tim_warr: warrUpsA, tim_mnt_plan: day(0), mnt_kind: 'Ariza Onarim', mnt_usr: 'Emre Çelik', prio: 'URGENT', src: 'FAULT', src_ref: 'KAT1_SAL1_A5_UPS_MODE', created: 0,
      mnt_phase: 'STARTED', started_at: stamp(0, 8, 5), mnt_notes: 'UPS A5 — akü modunda çalışıyor: giriş rölesi ve akü blok gerilimleri kontrolü, yük testi' });
    rec(INFRA['KLIMA 109'], { tim_warr: warrKlima, tim_mnt_plan: day(0), mnt_kind: 'Ariza Onarim', mnt_usr: 'Can Öztürk', prio: 'URGENT', src: 'FAULT', src_ref: 'KAT1_SAL1_KLIMA109_HP', created: 0,
      mnt_notes: 'KLIMA 109 — kompresör 1 yüksek basınç: kondenser fan motoru ve gaz kontrolü' });

    RECORDS.sort((a, b) => Number(b.mnt_id) - Number(a.mnt_id));

    // -------------------------------------------------------------------------
    // Periyodik bakım takvimi (MNT_calendar)
    // -------------------------------------------------------------------------
    let planSeq = 91;
    const PLANS = [];
    function plan(asset, name, n, unit, nextOfs, lastOfs) {
      if (!asset) return;
      PLANS.push({
        plan_id: String(planSeq++), ver: '1', asm_id: asset.asm_id, source_doc: '', source_dev: '',
        device: '[' + asset.asm_id + '] ' + asset.name + ' ' + asset.manufacturer + ' ' + asset.model,
        plan_name: name, period_n: n, period_unit: unit, next_due: day(nextOfs), last_done: lastOfs == null ? '' : day(lastOfs), state: 'A'
      });
    }
    plan(INFRA['UPS A1'], 'UPS A hattı yıllık üretici bakımı', 1, 'Y', 21, -344);
    plan(INFRA['Jeneratör G1'], 'Jeneratör aylık yük testi (yük bankası, 30 dk)', 1, 'M', 0, -30);
    plan(INFRA['UPS B1'], 'UPS B hattı yıllık bakım (akü empedans testi)', 1, 'Y', 143, -222);
    plan(INFRA['KLIMA 101'], 'Hassas klima 3 aylık bakım: filtre, kayış, drenaj', 3, 'M', 12, -78);
    plan(INFRA['KLIMA 104'], 'Hassas klima G4 filtre değişimi', 6, 'W', -2, -44);
    plan(INFRA['Klimalar Kontrol Panosu'], 'Yıllık termografi ve klemens sıkılığı', 1, 'Y', 96, -269);
    plan(INFRA['Jeneratör G2'], 'Jeneratör aylık yük testi (yük bankası, 30 dk)', 1, 'M', -1, -31);
    plan(INFRA['KLIMA 106'], 'Hassas klima 3 aylık bakım: filtre, kayış, drenaj', 3, 'M', -4, -96);
    plan(INFRA['UPS A5'], 'Akü blok gerilim ve iç direnç ölçümü', 6, 'M', 38, -145);
    plan(INFRA['A1 KLIMA PANOSU'], 'Pano termal kamera taraması', 3, 'M', 0, -91);
    const fireSys = IT.find(a => a.cabin_name === '1DA07');
    plan(fireSys, 'Sunucu donanım günlüğü ve fan kontrolü', 6, 'M', 61, -122);
    plan(INFRA['KLIMA 110'], 'Kondenser serpantin yıkama', 1, 'Y', 186, -179);
    plan(INFRA['UPS B7'], 'İzleme kartı (SNMP) firmware kontrolü', 90, 'D', 9, -81);
    plan(INFRA['B2 Klima Panosu'], 'Kaçak akım rölesi test butonu kontrolü', 2, 'W', 5, -9);

    // -------------------------------------------------------------------------
    // Alarm bakımları (Tarihsel Alarmlar → "Bakım Aç")
    // -------------------------------------------------------------------------
    const ALARM = [];
    let amSeq = 5101;
    const histAll = D.historicalAlarms || [];
    const NOW = Date.now();
    const raising = histAll.filter(h => h.level === 'alarm' || h.level === 'warning' || h.level === 'lost');
    const pickUnique = (list, n) => {
      const seen = new Set(), out = [];
      list.forEach(h => { if (out.length < n && !seen.has(h.rid)) { seen.add(h.rid); out.push(h); } });
      return out;
    };
    // Açık: en yeni alarmlardan 9; tamamlanan: 20 saatten eski alarmlardan 7 (farklı nesneler)
    const openSet = pickUnique(raising, 9);
    const openRids = new Set(openSet.map(h => h.rid));
    const doneSet = pickUnique(raising.filter(h => NOW - new Date(h.tim).getTime() > 20 * 3600000 && !openRids.has(h.rid)), 7);
    const OPENERS = ['Mehmet Kaya', 'Ayşe Demir', 'DCIM Operatör'];
    const fmt = d => keyOf(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    function alarmRec(h, isDone, i) {
      const almT = new Date(h.tim).getTime();
      const opn = new Date(Math.min(NOW - 120000, almT + between(4, 45) * 60000));
      const doneT = isDone ? new Date(Math.min(NOW - 600000, opn.getTime() + between(60, 900) * 60000)) : null;
      return {
        mnt_id: '', doc: /^KAT|^DCA|^POD/.test(h.rid) ? 'CMR/T01' : 'CMR/T00', rid: h.rid, atr: h.fnc || '', dev: h.desc || h.target, target: h.target,
        txt: h.txt || h.desc, alm_tim: h.tim, opn_at: fmt(opn), opn_usr: pick(OPENERS),
        done_at: doneT ? fmt(doneT) : '', done_usr: isDone ? pick(['Emre Çelik', 'Can Öztürk', 'Burak Şahin']) : '',
        phase: isDone ? 'DONE' : (i % 3 === 1 ? 'STARTED' : 'PLANNED'), src: 'seed', _t: opn.getTime()
      };
    }
    doneSet.map((h, i) => alarmRec(h, true, i)).concat(openSet.map((h, i) => alarmRec(h, false, i)))
      .sort((x, y) => x._t - y._t)
      .forEach(r => { r.mnt_id = String(amSeq++); delete r._t; ALARM.push(r); });
    ALARM.sort((a, b) => Number(b.mnt_id) - Number(a.mnt_id));

    D.mntPage = {
      assets: ASSETS,
      records: RECORDS,
      plans: PLANS,
      alarm: ALARM,
      findAsset: id => ASSETS.find(a => a.asm_id === String(id)) || null,
      nextMntId: () => String(mntSeq++),
      nextPlanId: () => String(planSeq++),
      today: () => day(0),
      day
    };
  });
})();
