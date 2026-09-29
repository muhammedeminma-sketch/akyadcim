/* ==========================================================================
   DCIM Sunum — Bakım Modülü mock verisi (DCIM.data.maintenance) — engineering.html#maintenance-module
   Kaynak sorgular (P24A01_S01/db41/db_DAS_api.js):
     api.HIS_mnt_asm_list  → MNT m LEFT JOIN ASM a (mnt_id, asm_id, asset_serial_no, manufacturer, model,
                             cabin_name, tim_warr, tim_mnt_plan, sta, notify_sent, mnt_name, mnt_typ,
                             mnt_kind, mnt_notes, mnt_usr, is_completed) — ORDER BY mnt_id DESC
     api.HIS_asm_list_full → ASM (asm_id, asset_id, asset_serial_no, model, name, cabin_name, manufacturer…)
     api.OPR_mnt_save      → asm_id başına tek açık (is_completed=0) kayıt: varsa günceller, yoksa ekler
     api.OPR_mnt_complete  → is_completed = 1
   Tablo şeması: P24A01_S01/sql/MNT_sql.txt, ASM_sql.txt (asm_id sayısal IDENTITY).

   Sunum senaryosu ile tutarlılık:
     - KLIMA 109 kompresör yüksek basınç, KLIMA 104 filtre kirli, KLIMA 112 dönüş havası, UPS A5 akü modu,
       UPS A3 akü sıcaklığı, UPS B7 SNMP kaybı, A1 KLIMA PANOSU faz dengesizliği
     - Tarih / sorumlu / sipariş no, DCIM.data.workOrders (İş Emirleri) kayıtlarından türetilir
       (KLIMA 109 → Can Öztürk, UPS A5 → Emre Çelik, Jeneratör G1 yük testi tamamlandı vb.)
     - UPS modeli Model Kütüphanesi ile aynı (Vertiv Liebert EXM2 80kVA, tüm UPS'ler)
   Sunum için türetilenler (gerçek kayıtta yok): klima / pano / jeneratör marka-modelleri, seri numaraları,
   asset_id biçimi, garanti tarihleri, BT varlıklarının bakım notları (tohumlu).
   Tarihler çalışma anına göre gün ofsetiyle üretilir ('YYYY-MM-DD', yerel saat).
   ========================================================================== */
(function () {
  'use strict';

  const D = window.DCIM.data;

  D.lazy('maintenance', function () {
    const rnd = D.rng(D.hash('maintenance-module'));
    const pick = arr => arr[Math.floor(rnd() * arr.length) % arr.length];
    const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const pad = n => String(n).padStart(2, '0');
    const keyOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const day = n => { const d = new Date(today.getTime()); d.setDate(d.getDate() + n); return keyOf(d); };
    const dateOf = t => (t instanceof Date && !isNaN(t.getTime())) ? keyOf(t) : '';

    // İş Emirleri ile bağ (D.workOrders mock-data.js'te üretilir)
    const WO = (D.workOrders && D.workOrders.list) || [];
    const wo = (target, text) => WO.find(w => w.target === target && (!text || w.wor_name.indexOf(text) >= 0)) || null;
    const woPlan = (w, fallback) => (w ? dateOf(w.tim_due) : '') || day(fallback);
    const woEnd = (w, fallback) => (w ? dateOf(w.tim_end || w.tim_due) : '') || day(fallback);
    const woUsr = (w, fallback) => (w && w.asn_usr) || fallback;
    const woRef = w => w ? ' (' + w.ord_id + ')' : '';

    // -------------------------------------------------------------------------
    // ASM — varlık envanteri (altyapı + kabin içi BT varlıkları)
    // -------------------------------------------------------------------------
    const ASSETS = [];
    let asmSeq = 1001;
    const serial = (prefix, digits) => prefix + String(between(Math.pow(10, digits - 1), Math.pow(10, digits) - 1));
    function addAsset(o) {
      const a = Object.assign({ asm_id: String(asmSeq), asset_id: 'AST' + String(400000 + asmSeq) }, o);
      asmSeq++;
      ASSETS.push(a);
      return a;
    }

    const INFRA = {};
    (D.ups || []).slice().sort((a, b) => a.label.localeCompare(b.label, 'tr', { numeric: true })).forEach(u => {
      const line = u.label.replace('UPS ', '').charAt(0);
      INFRA[u.label] = addAsset({ name: u.label, manufacturer: 'Vertiv', model: 'Liebert EXM2 80kVA', asset_serial_no: serial('EXM2' + line, 7), cabin_name: 'UPS Hattı ' + line, device_type: 'UPS' });
    });
    (D.climates || []).slice().sort((a, b) => a.label.localeCompare(b.label, 'tr', { numeric: true })).forEach(c => {
      INFRA[c.label] = addAsset({ name: c.label, manufacturer: 'Vertiv', model: 'Liebert PDX PX040', asset_serial_no: serial('PX04', 8), cabin_name: 'Salon 1', device_type: 'Klima' });
    });
    (D.panels || []).forEach(p => {
      INFRA[p.label] = addAsset({ name: p.label, manufacturer: 'Schneider Electric', model: 'Prisma G', asset_serial_no: serial('PRG', 8), cabin_name: 'Salon 1', device_type: 'Pano' });
    });
    INFRA['Master Pano'] = addAsset({ name: 'Master Pano', manufacturer: 'Schneider Electric', model: 'Okken', asset_serial_no: serial('OKN', 8), cabin_name: 'Enerji Odası', device_type: 'Pano' });
    INFRA['Jeneratör G1'] = addAsset({ name: 'Jeneratör G1 (A Kolu)', manufacturer: 'Aksa', model: 'AC 1100', asset_serial_no: serial('AKS', 9), cabin_name: 'Jeneratör Sahası', device_type: 'Jeneratör' });
    INFRA['Jeneratör G2'] = addAsset({ name: 'Jeneratör G2 (B Kolu)', manufacturer: 'Aksa', model: 'AC 1100', asset_serial_no: serial('AKS', 9), cabin_name: 'Jeneratör Sahası', device_type: 'Jeneratör' });

    asmSeq = 1100;
    const IT = [];
    (D.cabinets || []).forEach(c => {
      (c.assets || []).forEach(a => {
        const row = addAsset({ name: a.hostname, manufacturer: a.manufacturer, model: a.model, asset_serial_no: a.serial, cabin_name: c.code, device_type: a.assetType });
        if (a.assetType !== 'Patch Panel' && a.manufacturer !== 'Panduit') IT.push(row);
      });
    });

    // -------------------------------------------------------------------------
    // MNT — bakım kayıtları (mnt_id büyük olan en üstte listelenir)
    // -------------------------------------------------------------------------
    const RECORDS = [];
    let mntSeq = 2400;
    function rec(asset, o) {
      if (!asset) return null;
      const r = Object.assign({
        mnt_id: String(mntSeq++),
        asm_id: asset.asm_id,
        tim_warr: '', tim_mnt_plan: '', sta: 0, notify_sent: 0,
        mnt_name: asset.manufacturer + ', ' + asset.model,
        mnt_typ: 'Donanim', mnt_kind: '', mnt_notes: '', mnt_usr: '', is_completed: 0
      }, o);
      RECORDS.push(r);
      return r;
    }

    // Garanti bitişleri: UPS A hattı 2023 devreye alındı (garanti ~50 gün kaldı), B hattı 2024
    const warrUpsA = day(52), warrUpsB = day(418), warrKlima = day(236), warrPano = day(640), warrGen = day(-35);

    // --- BT varlıkları: geçmiş (tamamlanan) ve açık kayıtlar ---------------------------
    const VENDOR = {
      Dell: 'Dell Technologies Servis', HPE: 'HPE Pointnext Servis', Lenovo: 'Lenovo DCG Servis', Cisco: 'Cisco TAC',
      Huawei: 'Huawei Enterprise Servis', NetApp: 'NetApp Destek', Juniper: 'Juniper JTAC', Fortinet: 'Fortinet Destek',
      Arista: 'Arista TAC', Supermicro: 'Supermicro Servis'
    };
    const FW = {
      Dell: 'iDRAC9 / BIOS firmware güncellemesi', HPE: 'iLO 5 ve SPP firmware güncellemesi', Lenovo: 'XClarity Controller firmware güncellemesi',
      Cisco: 'NX-OS / IOS-XE yazılım yükseltmesi', Huawei: 'Denetleyici firmware güncellemesi', NetApp: 'ONTAP 9.14.1 yükseltmesi',
      Juniper: 'Junos OS 22.4R3 yükseltmesi', Fortinet: 'FortiOS 7.2.8 güncellemesi', Arista: 'EOS 4.30 yükseltmesi', Supermicro: 'BMC / BIOS güncellemesi'
    };
    const HW_NOTES = {
      Sunucu: ['Arızalı disk (1.92 TB SSD) değişimi, RAID yeniden oluşturma', 'PSU-2 arızası — yedek güç kaynağı değişimi', 'Fan modülü değişimi (FAN3 uyarısı)', 'DIMM hatası — bellek modülü değişimi'],
      Depolama: ['Disk rafı arızalı sürücü değişimi', 'Denetleyici önbellek aküsü değişimi'],
      Switch: ['Arızalı SFP+ modül değişimi', 'Yedek fan tepsisi değişimi'],
      Router: ['Arızalı QSFP28 modül değişimi'],
      Firewall: ['Güç kaynağı değişimi (PSU-1)']
    };
    const INTERNAL = { Sunucu: 'Zeynep Arslan', Depolama: 'Zeynep Arslan', Switch: 'Burak Şahin', Router: 'Burak Şahin', Firewall: 'Burak Şahin' };
    // Garanti / plan ofset havuzları (renk sınıflarının hepsi görünsün: geçmiş, 0-14, 14-30, 30-90, 90-180, 180-365, 365+)
    const WARR_POOL = [-40, -12, 6, 11, 19, 27, 45, 63, 88, 104, 131, 166, 212, 259, 301, 344, 402, 488, 575, 690, 812, 0];
    const PLAN_POOL = [-9, -3, 2, 5, 9, 13, 17, 22, 29, 38, 47, 61, 76, 95, 120, 150, 185, 240, 0];

    // Senaryo: 1BG41 yetkili periyodik kabin bakımı (İş Emirleri — tamamlandı)
    const w1BG41 = wo('1BG41');
    const bg41 = IT.filter(a => a.cabin_name === '1BG41');
    bg41.slice(0, 2).forEach(a => rec(a, {
      tim_warr: day(between(200, 500)), tim_mnt_plan: woEnd(w1BG41, -1), mnt_kind: 'Periyodik Bakim',
      mnt_notes: '1BG41 periyodik kabin bakımı — filtre, kablo düzeni ve PDU bağlantıları kontrol edildi' + woRef(w1BG41),
      mnt_usr: woUsr(w1BG41, 'Mehmet Kaya'), is_completed: 1
    }));

    // Rastgele BT alt kümesi (tohumlu): 16 tamamlanan + 34 açık kayıt
    const pool = IT.filter(a => a.cabin_name !== '1BG41');
    const chosen = [];
    const used = new Set();
    while (chosen.length < 50 && chosen.length < pool.length) {
      const a = pool[Math.floor(rnd() * pool.length)];
      if (used.has(a.asm_id)) continue;
      used.add(a.asm_id);
      chosen.push(a);
    }
    // 1BJ53 (yüksek sıcaklık alarmı) kabinindeki ilk sunucu da açık kayıtlar arasında olsun
    const bj53 = IT.find(a => a.cabin_name === '1BJ53' && a.device_type === 'Sunucu');
    if (bj53 && !used.has(bj53.asm_id)) chosen[chosen.length - 1] = bj53;

    function itRecord(a, completed) {
      const kindRoll = rnd();
      const hw = HW_NOTES[a.device_type] || HW_NOTES.Sunucu;
      let kind, notes, usr;
      if (kindRoll < 0.34) { kind = 'Yazilim Guncelleme'; notes = FW[a.manufacturer] || 'Firmware güncellemesi'; usr = rnd() < 0.5 ? INTERNAL[a.device_type] || 'Zeynep Arslan' : VENDOR[a.manufacturer] || 'Üretici Servisi'; }
      else if (kindRoll < 0.62) { kind = 'Donanim Degisimi'; notes = pick(hw); usr = VENDOR[a.manufacturer] || 'Üretici Servisi'; }
      else if (kindRoll < 0.9) { kind = 'Periyodik Bakim'; notes = 'Yıllık önleyici bakım — toz temizliği, donanım log ve fan kontrolü'; usr = INTERNAL[a.device_type] || 'Zeynep Arslan'; }
      else { kind = 'Diger'; notes = 'Garanti / destek sözleşmesi yenileme teklifi bekleniyor'; usr = 'Ayşe Demir'; }
      const w = WARR_POOL[Math.floor(rnd() * WARR_POOL.length)];
      const p = PLAN_POOL[Math.floor(rnd() * PLAN_POOL.length)];
      return rec(a, {
        tim_warr: w === 0 ? '' : day(w),
        tim_mnt_plan: completed ? day(-between(15, 320)) : (p === 0 ? '' : day(p)),
        mnt_kind: kind,
        mnt_notes: a.name + ' — ' + notes,
        mnt_usr: usr,
        mnt_typ: kind === 'Yazilim Guncelleme' ? 'Yazilim' : 'Donanim',
        is_completed: completed ? 1 : 0
      });
    }
    chosen.slice(0, 16).forEach(a => itRecord(a, true));
    chosen.slice(16).forEach(a => {
      const r = itRecord(a, false);
      if (a === bj53) {
        Object.assign(r, { mnt_kind: 'Donanim Degisimi', tim_mnt_plan: day(1), mnt_usr: VENDOR[a.manufacturer] || 'Üretici Servisi',
          mnt_notes: a.name + ' — 1BJ53 yüksek sıcaklık sonrası fan modülü ve termal macun kontrolü' });
      }
    });

    // --- Altyapı: geçmiş (tamamlanan) kayıtlar -----------------------------------------
    rec(INFRA['UPS A5'], { tim_warr: warrUpsA, tim_mnt_plan: day(-344), mnt_kind: 'Periyodik Bakim', mnt_usr: 'Vertiv Türkiye (Yetkili Servis)', mnt_typ: 'Toplu Kayıt',
      mnt_notes: 'UPS A5 — yıllık üretici bakımı: akü empedans testi, kapasitör ve fan kontrolü', is_completed: 1 });
    rec(INFRA['UPS A3'], { tim_warr: warrUpsA, tim_mnt_plan: day(-196), mnt_kind: 'Donanim Degisimi', mnt_usr: 'Vertiv Türkiye (Yetkili Servis)',
      mnt_notes: 'UPS A3 — akü grubu 2. dizide 4 adet blok değişimi', is_completed: 1 });
    rec(INFRA['UPS B4'], { tim_warr: warrUpsB, tim_mnt_plan: day(-121), mnt_kind: 'Yazilim Guncelleme', mnt_usr: 'Burak Şahin',
      mnt_notes: 'UPS B4 — Unity kartı firmware güncellemesi', is_completed: 1 });
    rec(INFRA['KLIMA 109'], { tim_warr: warrKlima, tim_mnt_plan: day(-63), mnt_kind: 'Periyodik Bakim', mnt_usr: 'Can Öztürk',
      mnt_notes: 'KLIMA 109 — 3 aylık bakım: kondenser temizliği, gaz basıncı ve kayış kontrolü', is_completed: 1 });
    rec(INFRA['KLIMA 104'], { tim_warr: warrKlima, tim_mnt_plan: day(-92), mnt_kind: 'Periyodik Bakim', mnt_usr: 'Can Öztürk',
      mnt_notes: 'KLIMA 104 — 3 aylık bakım: G4 filtre değişimi, drenaj ve fan kontrolü', is_completed: 1 });
    const w1BX50 = wo('1BX50');
    rec(INFRA['KLIMA 113'], { tim_warr: warrKlima, tim_mnt_plan: woEnd(w1BX50, -2), mnt_kind: 'Kalibrasyon', mnt_usr: woUsr(w1BX50, 'Can Öztürk'),
      mnt_notes: 'KLIMA 113 — 1BX50 düşük sıcaklık: set değeri 20 °C → 22 °C güncellendi' + woRef(w1BX50), is_completed: 1 });
    const wGen = wo('Jeneratör G1');
    rec(INFRA['Jeneratör G1'], { tim_warr: warrGen, tim_mnt_plan: woEnd(wGen, -1), mnt_kind: 'Periyodik Bakim', mnt_usr: woUsr(wGen, 'Emre Çelik'),
      mnt_notes: 'Jeneratör G1 — aylık yük testi: %75 yükte 30 dk başarılı, yakıt seviyesi %92' + woRef(wGen), is_completed: 1 });
    rec(INFRA['Jeneratör G2'], { tim_warr: warrGen, tim_mnt_plan: day(-29), mnt_kind: 'Periyodik Bakim', mnt_usr: 'Emre Çelik',
      mnt_notes: 'Jeneratör G2 — aylık yük testi: %70 yükte 30 dk başarılı', is_completed: 1 });
    rec(INFRA['B1 Klima Panosu'], { tim_warr: warrPano, tim_mnt_plan: day(-150), mnt_kind: 'Periyodik Bakim', mnt_usr: 'Emre Çelik',
      mnt_notes: 'B1 Klima Panosu — termal kamera ölçümü ve klemens sıkılığı kontrolü', is_completed: 1 });

    // --- Altyapı: açık periyodik planlar (Toplu Kayıt) ---------------------------------
    const wUpsYear = wo('UPS A5', 'Yıllık');
    ['UPS A1', 'UPS A2', 'UPS A4', 'UPS A6', 'UPS A7'].forEach(l => rec(INFRA[l], {
      tim_warr: warrUpsA, tim_mnt_plan: day(21), mnt_kind: 'Periyodik Bakim', mnt_usr: 'Vertiv Türkiye (Yetkili Servis)', mnt_typ: 'Toplu Kayıt',
      mnt_notes: l + ' — UPS A hattı yıllık üretici bakımı' + (wUpsYear ? ' (iptal edilen ' + wUpsYear.ord_id + ' yerine yeniden planlandı)' : '')
    }));
    ['UPS B1', 'UPS B2', 'UPS B3', 'UPS B4', 'UPS B5', 'UPS B6'].forEach(l => rec(INFRA[l], {
      tim_warr: warrUpsB, tim_mnt_plan: day(143), mnt_kind: 'Periyodik Bakim', mnt_usr: 'Vertiv Türkiye (Yetkili Servis)', mnt_typ: 'Toplu Kayıt',
      mnt_notes: l + ' — UPS B hattı yıllık üretici bakımı (akü empedans testi dahil)'
    }));
    const KLIMA_PLAN = { 'KLIMA 101': 12, 'KLIMA 102': 12, 'KLIMA 103': 33, 'KLIMA 105': 33, 'KLIMA 106': 54, 'KLIMA 107': 54, 'KLIMA 108': 75, 'KLIMA 110': 26, 'KLIMA 111': 26, 'KLIMA 113': 88, 'KLIMA 114': 88 };
    Object.keys(KLIMA_PLAN).forEach(l => rec(INFRA[l], {
      tim_warr: warrKlima, tim_mnt_plan: day(KLIMA_PLAN[l]), mnt_kind: 'Periyodik Bakim', mnt_usr: 'Can Öztürk', mnt_typ: 'Toplu Kayıt',
      mnt_notes: l + ' — 3 aylık periyodik bakım: filtre, kayış, drenaj ve gaz basıncı kontrolü'
    }));
    ['Klimalar Kontrol Panosu', 'A2 Klima Panosu', 'A3 Klima Panosu (113 114)', 'B1 Klima Panosu', 'B2 Klima Panosu', 'A1 Klima Panosu'].forEach((l, i) => rec(INFRA[l], {
      tim_warr: warrPano, tim_mnt_plan: day(96 + i * 14), mnt_kind: 'Periyodik Bakim', mnt_usr: 'Emre Çelik', mnt_typ: 'Toplu Kayıt',
      mnt_notes: l + ' — yıllık termografi ve klemens sıkılığı kontrolü'
    }));
    rec(INFRA['Jeneratör G2'], { tim_warr: warrGen, tim_mnt_plan: day(1), mnt_kind: 'Periyodik Bakim', mnt_usr: 'Emre Çelik',
      mnt_notes: 'Jeneratör G2 — aylık yük testi (yük bankası, 30 dk)' });
    rec(INFRA['Jeneratör G1'], { tim_warr: warrGen, tim_mnt_plan: day(27), mnt_kind: 'Periyodik Bakim', mnt_usr: 'Emre Çelik',
      mnt_notes: 'Jeneratör G1 — aylık yük testi (yük bankası, 30 dk)' });

    // --- Altyapı: sunum senaryosu (en yeni kayıtlar → tablonun ilk sayfası) --------------
    const wMaster = wo('Master Pano');
    rec(INFRA['Master Pano'], { tim_warr: warrPano, tim_mnt_plan: woPlan(wMaster, 1), mnt_kind: 'Kalibrasyon', mnt_usr: woUsr(wMaster, 'Emre Çelik'),
      mnt_notes: 'Master Pano — THD ölçümü; güç kalitesi analizörü kalibrasyonu bekleniyor' + woRef(wMaster) });
    rec(INFRA['A1 KLIMA PANOSU'], { tim_warr: warrPano, tim_mnt_plan: day(3), mnt_kind: 'Periyodik Bakim', mnt_usr: 'Emre Çelik',
      mnt_notes: 'A1 KLIMA PANOSU — faz dengesizliği (L3 78,6 A): termal kamera ölçümü ve yük dengeleme' });
    const wK112 = wo('KLIMA 112');
    rec(INFRA['KLIMA 112'], { tim_warr: warrKlima, tim_mnt_plan: woPlan(wK112, 2), mnt_kind: 'Kalibrasyon', mnt_usr: woUsr(wK112, 'Can Öztürk'),
      mnt_notes: 'KLIMA 112 — dönüş havası 29,4 °C: sıcaklık sensörü kalibrasyonu' + woRef(wK112) });
    const wB7 = wo('UPS B7');
    rec(INFRA['UPS B7'], { tim_warr: warrUpsB, tim_mnt_plan: woPlan(wB7, 0), mnt_kind: 'Donanim Degisimi', mnt_usr: woUsr(wB7, 'Burak Şahin'),
      mnt_notes: 'UPS B7 — SNMP haberleşme kaybı: yedek SNMP kartı değişimi' + woRef(wB7) });
    rec(INFRA['UPS A3'], { tim_warr: warrUpsA, tim_mnt_plan: day(4), mnt_kind: 'Periyodik Bakim', mnt_usr: 'Emre Çelik',
      mnt_notes: 'UPS A3 — akü sıcaklığı 31,2 °C: akü odası havalandırması ve blok sıcaklık ölçümü' });
    const wK104 = wo('KLIMA 104');
    rec(INFRA['KLIMA 104'], { tim_warr: warrKlima, tim_mnt_plan: woPlan(wK104, 0), mnt_kind: 'Periyodik Bakim', mnt_usr: woUsr(wK104, 'Can Öztürk'),
      mnt_notes: 'KLIMA 104 — filtre kirli (Δp 182 Pa): G4 filtre seti değişimi' + woRef(wK104) });
    const wA5 = wo('UPS A5', 'Akü');
    rec(INFRA['UPS A5'], { tim_warr: warrUpsA, tim_mnt_plan: woPlan(wA5, 0), mnt_kind: 'Ariza Onarim', mnt_usr: woUsr(wA5, 'Emre Çelik'),
      mnt_notes: 'UPS A5 — akü modunda çalışıyor: giriş rölesi ve akü blok gerilimleri kontrolü, yük testi' + woRef(wA5) });
    const wK109 = wo('KLIMA 109');
    rec(INFRA['KLIMA 109'], { tim_warr: warrKlima, tim_mnt_plan: woPlan(wK109, 0), mnt_kind: 'Ariza Onarim', mnt_usr: woUsr(wK109, 'Can Öztürk'),
      mnt_notes: 'KLIMA 109 — kompresör 1 yüksek basınç (27,8 bar): kondenser fan motoru ve gaz kontrolü' + woRef(wK109) });

    D.maintenance = {
      assets: ASSETS,
      records: RECORDS,
      findAsset: id => ASSETS.find(a => a.asm_id === String(id)) || null,
      nextMntId: () => String(mntSeq++)
    };
  });
})();
