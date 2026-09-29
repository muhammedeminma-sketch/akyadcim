/* ==========================================================================
   DCIM Sunum — Mühendislik / Bakım Modülü (NewUICMPMaintenanceModuleComponent)
   Kaynak: front_end/projects/user-app/src/app/new-ui/pages/engineering/maintenance-module/
           + common/pop-ups/report-pop-up/maintenance-report-popup (MaintenanceReportPopupComponent)
   Görünümler (viewMode):
     cards   — "Bakım Tablosu" / "Garanti ve Bakım Tarihi Belirleme" seçim kartları
     table   — Bekleyen / Tamamlanan bakımlar tablosu, gelişmiş filtre, sayfalama,
               satır tıklanınca app-drawer (Garanti ve Bakım Düzenleme), Tamamla, rapor, manuel e-posta
     stepper — 3 adımlı toplu tarih sihirbazı (Varlık Seçimi → Tarih Bilgileri → Tamamlandı)
   Backend (api.HIS_mnt_asm_list / HIS_asm_list_full / OPR_mnt_save / OPR_mnt_complete / MNT_check_and_email)
   → DCIM.data.maintenance üzerinde aynı filtre/sıralama/upsert mantığı (js/mock/eng-maintenance-module.data.js).

   Derin bağlantılar (engineering.html#maintenance-module?...):
     view=table | stepper          doğrudan tablo / sihirbaz görünümü
     tab=completed                 Tamamlanan Bakımlar sekmesi (view=table ima eder)
     filter=1                      gelişmiş filtre panelini açık getirir
     notes=<metin> usr=<metin> kind=<Periyodik Bakim|Ariza Onarim|...> cabin=<metin> mfr=<metin> model=<metin>
                                   filtre alanlarını doldurup uygular (filtre panelini açar)
     open=<asm_id | ekipman adı>   ilgili kaydın sayfasına gider ve düzenleme panelini açar (ör. open=KLIMA%20109)
     report=1 [&fetch=1]           bakım raporu penceresini açar (fetch=1: veriyi hemen getirir)
     step=2&sel=1001,1015          sihirbazı seçili varlıklarla 2. adımda açar
     page=<n>                      tablo sayfası (1'den başlar)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  DCIM.engRegistry = DCIM.engRegistry || {};

  // messages.tr.json → maintenance.* / maintenanceReportPopup.* / common.*
  // maintenance.alerts.* Türkçe dosyada yok (Angular anahtarı gösterirdi); messages.en.json'dan çevrildi.
  const T = {
    title: 'BAKIM MODÜLÜ İŞLEMLERİ',
    engineering: 'Mühendislik',
    cardTableTitle: 'Bakım Tablosu',
    cardTableDesc: 'Sisteme kayıtlı varlıkların garanti ve bakım planlarını listeleyin, güncelleyin veya filtreleyin.',
    cardStepperTitle: 'Garanti ve Bakım Tarihi Belirleme',
    cardStepperDesc: 'Toplu garanti ve bakım tarihi güncellemeleri veya ileri düzey ayarlar için kullanılan yöneltim ekranı.',
    view: 'Görüntüle',
    st: {
      title: 'Garanti ve Bakım Tarihi Belirleme', step1: 'Varlık Seçimi', step2: 'Tarih Bilgileri', step3: 'Tamamlandı',
      selectHeader: 'İşlem Yapılacak Varlıkları Seçiniz', noRecords: 'Kayıt bulunamadı.', selected: 'Seçili: {count}',
      datesHeader: 'Bakım ve Garanti Tarihlerini Belirleyin', datesDesc: 'Seçilen {count} adet varlık için yeni tarihleri giriniz.',
      warranty: 'Garanti Bitiş Tarihi', plan: 'Planlanan Bakım Tarihi', type: 'Bakım Türü', responsible: 'Bakım Yapan Firma/Personel',
      responsiblePh: 'Ad Soyad/Firma', desc: 'Bakım Açıklaması', descPh: 'Notlarınızı buraya yazınız...',
      successTitle: 'İşlem Tamamlandı', successDesc: 'Varlıklar için bakım ve garanti tarihleri başarıyla güncellendi.',
      redirecting: 'Ana ekrana yönlendiriliyorsunuz...', cancel: 'Vazgeç', back: 'Geri', next: 'İleri', complete: 'Kaydetmeyi Tamamla',
      deviceName: 'Cihaz Adı', cabin: 'Kabin'
    },
    tb: {
      title: 'BAKIM MODÜLÜ', completedReport: 'Tamamlanan Bakım Raporu', report: 'Bakım Raporu', completed: 'Tamamlanan Bakımlar', pending: 'Bekleyen Bakımlar',
      assetId: 'Asset ID', serialNo: 'Seri Numarası', manufacturer: 'Marka', model: 'Model', cabinName: 'Kabin Adı', warrantyEnd: 'Garanti Bitiş',
      mntPlan: 'Bakım Planı', recordType: 'Kayıt Türü', description: 'Bakım Açıklaması', responsible: 'Bakım Yapan Firma/Personel', action: 'İşlem',
      doComplete: 'Tamamla', isCompleted: 'Tamamlandı',
      ph: { search: 'Ara...', assetId: 'Asset ID', serialNo: 'Seri No', brand: 'Marka', model: 'Model', cabin: 'Kabin Adı', description: 'Açıklama', responsible: 'Bakım Yapan', select: 'Tümü / Seçiniz' },
      expired: 'Süresi Doldu', today: 'Bugün', uY: 'y', uM: 'ay', uD: 'g',
      loading: 'Veriler Yükleniyor...', connectionError: 'Bağlantı hatası! Veri alınamıyor.', noData: 'Gösterilecek veri bulunamadı.',
      total: 'Toplam Kayıt: {count}', filterTitle: 'Filtreyi Aç/Kapat', refresh: 'Yenile', getReport: 'Rapor Al', manualMail: 'Manuel E-posta Gönder',
      clear: 'Temizle', apply: 'Uygula', wBgn: 'Garanti Başlangıç', wEnd: 'Garanti Bitiş', mBgn: 'Planlanan Başlangıç', mEnd: 'Planlanan Bitiş'
    },
    panel: {
      title: 'Garanti ve Bakım Düzenleme', subtitle: 'Seçili varlık için bakım ve garanti kayıtlarını güncelleyin.', assetInfo: 'Varlık Bilgileri',
      assetId: 'Asset ID:', serialNo: 'Seri No:', device: 'Cihaz:', cabin: 'Kabin:', cancel: 'Vazgeç', save: 'Kaydet', notesPh: 'İşlem detaylarını buraya yazınız...'
    },
    common: { back: 'Geri', first: 'İlk Sayfa', last: 'Son Sayfa', previous: 'Önceki', next: 'İleri', perPage: 'Sayfa Başına', filter: 'Filtre', select: 'Seçiniz',
      success: 'BAŞARILI', error: 'HATA', warning: 'UYARI', info: 'BİLGİ' },
    conn: { active: 'Bağlı', processing: 'Bağlanıyor', lost: 'Bağlantı Yok' },
    alerts: {
      selectAsset: 'Lütfen en az bir varlık seçiniz.',
      confirmComplete: 'Bu bakım kaydını tamamlamak istediğinize emin misiniz?',
      confirmMail: 'Tarihi yaklaşan varlıklar için e-posta taraması başlatılsın mı?',
      mailSent: 'E-posta tarama komutu gönderildi. Lütfen logları kontrol edin.',
      saveSuccess: 'Başarıyla kaydedildi',
      completeSuccess: 'Bakım başarıyla tamamlandı.',
      saveError: 'Kaydetme işlemi sırasında bir hata oluştu',
      bulkSaveSuccess: '{count} kayıt başarıyla güncellendi.'
    },
    rp: {
      titleCompleted: 'Tamamlanan Bakım Raporu', titleIncomplete: 'Bekleyen Bakım Raporu',
      subCompleted: 'Tamamlanmış periyodik ve arıza bakım kayıtları', subIncomplete: 'İşlem bekleyen bakım ve servis kayıtları',
      info: 'Raporu oluşturmak için verileri getirin veya filtreleyin.', fetch: 'Tüm Veriyi Getir', fetching: 'Veri Çekiliyor...',
      pdf: 'PDF İndir', pdfGen: 'PDF Oluşturuluyor...', excel: 'Excel İndir', excelGen: 'Excel Oluşturuluyor...',
      total: 'Toplam {count} kayıt bulundu.', loading: 'Veriler yükleniyor...', noData: 'Veri bulunamadı.',
      initial: 'Rapor verilerini getirmek için yukarıdaki butona tıklayın.',
      pdfSuccess: 'PDF raporu oluşturuldu! ({count} kayıt)', reportDate: 'Rapor Tarihi: {date}', totalCount: 'Toplam Kayıt: {count}',
      h: { assetId: 'Asset ID', serialNo: 'Seri No', brandModel: 'Marka/Model', cabinet: 'Kabin', warrantyEnd: 'Garanti Bitiş', plan: 'Bakım Planı', recordType: 'Kayıt Türü', personnel: 'Personel', description: 'Açıklama' },
      x: { assetId: 'Asset ID', serialNo: 'Seri No', brandModel: 'Marka/Model', cabinet: 'Kabin Adı', warrantyEnd: 'Garanti Bitiş Tarihi', plan: 'Bakım Planı Tarihi', recordType: 'Kayıt Türü', personnel: 'Bakım Yapan Firma/Personel', description: 'Bakım Açıklaması' },
      fileCompleted: 'Tamamlanan_Bakim_Raporu', fileIncomplete: 'Bekleyen_Bakim_Raporu'
    }
  };

  // Kayıt türleri (option value'lar veritabanındaki normalize edilmiş değerlerdir)
  const KINDS = [
    { value: 'Periyodik Bakim', label: 'Periyodik Bakım' },
    { value: 'Ariza Onarim', label: 'Arıza Onarım' },
    { value: 'Donanim Degisimi', label: 'Donanım Değişimi' },
    { value: 'Yazilim Guncelleme', label: 'Yazılım Güncelleme' },
    { value: 'Kalibrasyon', label: 'Kalibrasyon' },
    { value: 'Diger', label: 'Diğer' }
  ];
  const TEXT_FILTERS = ['asm_id', 'asset_serial_no', 'manufacturer', 'model', 'cabin_name', 'mnt_kind', 'mnt_notes', 'mnt_usr'];
  const DATE_FILTERS = ['w_bgn', 'w_end', 'm_bgn', 'm_end'];
  const ASM_FILTERS = [
    { id: 'stepper_asm_id_filter', key: 'asset_id' },
    { id: 'stepper_serial_filter', key: 'asset_serial_no' },
    { id: 'stepper_model_filter', key: 'model' },
    { id: 'stepper_name_filter', key: 'name' },
    { id: 'stepper_cabin_filter', key: 'cabin_name' }
  ];

  function mount(el, params) {
    const { esc, statusBadge, buttonClasses, dialog, toast } = DCIM.ui;
    const kit = DCIM.kit;
    const M = DCIM.data.maintenance;
    const ASSET = new Map(M.assets.map(a => [a.asm_id, a]));

    let destroyed = false;
    const timers = new Set();
    const later = (fn, ms) => {
      const id = setTimeout(() => { timers.delete(id); if (!destroyed) fn(); }, ms);
      timers.add(id);
    };

    // -------------------------------------------------------------------------
    // Durum (bileşen alanlarıyla aynı adlar)
    // -------------------------------------------------------------------------
    const emptyFilters = () => ({ asm_id: '', asset_serial_no: '', manufacturer: '', model: '', cabin_name: '', mnt_kind: '', mnt_notes: '', mnt_usr: '', w_bgn: '', w_end: '', m_bgn: '', m_end: '' });
    const S = {
      viewMode: 'cards', stepperStep: 1, currentTab: 'incomplete',
      filter_switch: 0, filters: emptyFilters(), where: { view_type: 'incomplete' },
      page_ofs: 0, page_cur: 0, page_rng: 10, page_total: 0, total_records: 0,
      ELEMENT_DATA: [], isLoading: false, isSaving: false, cnt1: 0,
      showEditPopup: false, editingElement: null, temp: { warr: '', plan: '', kind: '', usr: '', notes: '' },
      ASM_DATA: [], asm_isLoading: false, asm_page_ofs: 0, asm_page_cur: 0, asm_page_rng: 10, asm_total_records: 0, asm_page_total: 0,
      asm_filters: {}, asm_where: {}, selectedAsmIds: new Set(),
      bulk: { warr: '', plan: '', kind: '', usr: '', notes: '' },
      showReportPopup: false, rp: { type: 'incomplete', data: [], loading: false, searched: false, pdf: false, excel: false }
    };

    // -------------------------------------------------------------------------
    // Tarih yardımcıları (getDateClass / getRemainingTimeText birebir)
    // -------------------------------------------------------------------------
    function parseDay(v) {
      if (!v) return null;
      const s = String(v).trim().split('T')[0].split(' ')[0];
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
      if (isNaN(d.getTime())) return null;
      d.setHours(0, 0, 0, 0);
      return d;
    }
    const diffDays = d => { const now = new Date(); now.setHours(0, 0, 0, 0); return Math.ceil((d.getTime() - now.getTime()) / 86400000); };
    function getDateClass(v) {
      const d = parseDay(v);
      if (!d) return 'text-slate-400';
      const n = diffDays(d);
      if (n < 0) return 'text-[#a855f7] font-bold dark:text-[#c084fc]';     // Süresi geçmiş — mor
      if (n <= 14) return 'text-rose-500 font-bold dark:text-rose-400';     // 0-14 gün — kırmızı
      if (n <= 30) return 'text-amber-500 font-bold dark:text-amber-400';   // 14-30 gün — turuncu
      if (n <= 90) return 'text-yellow-500 font-bold dark:text-yellow-400'; // 1-3 ay — sarı
      if (n <= 180) return 'text-sky-500 font-bold dark:text-sky-400';      // 3-6 ay
      if (n <= 365) return 'text-emerald-500 font-bold dark:text-emerald-400';
      return 'text-emerald-600 font-bold dark:text-emerald-400';
    }
    function getRemainingTimeText(v) {
      const d = parseDay(v);
      if (!d) return '';
      const total = diffDays(d);
      if (total < 0) return '(' + T.tb.expired + ')';
      if (total === 0) return '(' + T.tb.today + ')';
      const years = Math.floor(total / 365);
      const rem = total % 365;
      const months = Math.floor(rem / 30);
      const days = rem % 30;
      const parts = [];
      if (years > 0) parts.push(years + T.tb.uY);
      if (months > 0) parts.push(months + T.tb.uM);
      if (days > 0) parts.push(days + T.tb.uD);
      return '(' + parts.join(' ') + ')';
    }
    const fmtDay = v => { const d = parseDay(v); return d ? String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear() : ''; };
    const formatMntKind = k => { if (!k) return '-'; const f = KINDS.find(x => x.value === k); return f ? f.label : k; };

    // -------------------------------------------------------------------------
    // "Sunucu" sorguları (HIS_mnt_asm_list / HIS_asm_list_full karşılığı)
    // -------------------------------------------------------------------------
    const like = (v, q) => String(v == null ? '' : v).toLocaleLowerCase('tr-TR').indexOf(String(q).toLocaleLowerCase('tr-TR')) >= 0;
    function mapRow(r) {
      const a = ASSET.get(r.asm_id) || {};
      return {
        asm_id: r.asm_id, asset_serial_no: a.asset_serial_no || '', manufacturer: a.manufacturer || '', model: a.model || '', cabin_name: a.cabin_name || '',
        tim_warr: r.tim_warr || '', tim_mnt_plan: r.tim_mnt_plan || '', sta: r.sta, notify_sent: r.notify_sent, mnt_name: r.mnt_name || '',
        mnt_typ: r.mnt_typ || '', mnt_kind: r.mnt_kind || '', mnt_notes: r.mnt_notes || '', mnt_usr: r.mnt_usr || '', mnt_id: r.mnt_id, is_completed: r.is_completed || 0
      };
    }
    function queryMnt(w) {
      return M.records.map(mapRow).filter(r => {
        if (w.view_type === 'completed' ? r.is_completed !== 1 : r.is_completed === 1) return false;
        for (const k of TEXT_FILTERS) if (w[k] && !like(r[k], w[k])) return false;
        if (w.w_bgn && !(r.tim_warr && r.tim_warr >= w.w_bgn)) return false;
        if (w.w_end && !(r.tim_warr && r.tim_warr <= w.w_end)) return false;
        if (w.m_bgn && !(r.tim_mnt_plan && r.tim_mnt_plan >= w.m_bgn)) return false;
        if (w.m_end && !(r.tim_mnt_plan && r.tim_mnt_plan <= w.m_end)) return false;
        return true;
      }).sort((a, b) => Number(b.mnt_id) - Number(a.mnt_id));
    }
    function queryAsm(w) {
      return M.assets.filter(a => Object.keys(w).every(k => like(a[k], w[k])));
    }

    // -------------------------------------------------------------------------
    // Veri yenileme (refresh1 / refreshAsmList)
    // -------------------------------------------------------------------------
    function calculateTotalPages() {
      S.page_total = S.page_rng > 0 && S.total_records > 0 ? Math.ceil(S.total_records / S.page_rng) : 0;
    }
    function refresh1(cb) {
      if (S.isLoading) return;
      S.isLoading = true;
      S.cnt1 = 2;
      S.ELEMENT_DATA = [];
      render();
      later(() => {
        const list = queryMnt(S.where);
        S.total_records = list.length;
        calculateTotalPages();
        if (S.page_total > 0 && S.page_ofs > S.page_total - 1) S.page_ofs = S.page_total - 1;
        S.page_cur = S.page_ofs;
        S.ELEMENT_DATA = list.slice(S.page_ofs * S.page_rng, S.page_ofs * S.page_rng + S.page_rng);
        if (S.editingElement) {
          const fresh = S.ELEMENT_DATA.find(x => x.asm_id === S.editingElement.asm_id);
          if (fresh) S.editingElement = Object.assign({}, fresh);
        }
        S.cnt1 = 0;
        S.isLoading = false;
        render();
        if (cb) cb();
      }, 220);
    }
    function refreshAsmList() {
      if (S.asm_isLoading) return;
      S.asm_isLoading = true;
      S.ASM_DATA = [];
      render();
      later(() => {
        const list = queryAsm(S.asm_where);
        S.asm_total_records = list.length;
        S.asm_page_total = Math.ceil(list.length / S.asm_page_rng);
        S.asm_page_cur = S.asm_page_ofs;
        S.ASM_DATA = list.slice(S.asm_page_ofs * S.asm_page_rng, S.asm_page_ofs * S.asm_page_rng + S.asm_page_rng);
        S.asm_isLoading = false;
        render();
      }, 200);
    }

    function inputFilter() {
      S.page_ofs = 0;
      const w = {};
      TEXT_FILTERS.concat(DATE_FILTERS).forEach(k => { const v = String(S.filters[k] || '').trim(); if (v) w[k] = v; });
      w.view_type = S.currentTab;
      S.where = w;
      refresh1();
    }
    function setViewMode(mode) {
      S.viewMode = mode;
      if (mode === 'stepper') {
        S.stepperStep = 1;
        S.selectedAsmIds.clear();
        S.bulk.warr = '';
        S.bulk.plan = '';
        S.asm_where = {};
        S.asm_filters = {};
        refreshAsmList();
      } else if (mode === 'table') {
        inputFilter();
      } else {
        render();
      }
    }
    function setTab(tab) {
      S.currentTab = tab;
      S.page_ofs = 0;
      closeEditPopup();
      inputFilter();
    }
    function openFilter() {
      S.filter_switch = S.filter_switch === 1 ? 0 : 1;
      if (S.filter_switch === 0) {
        // *ngIf paneli kaldırdığında tüm filtre girdileri de silinir
        S.filters = emptyFilters();
        const prev = JSON.stringify(S.where);
        S.where = { view_type: S.currentTab };
        if (S.page_ofs !== 0 || prev !== JSON.stringify(S.where)) {
          S.page_ofs = 0;
          refresh1();
          return;
        }
      }
      render();
    }

    // -------------------------------------------------------------------------
    // Düzenleme paneli (app-drawer) / kaydet / tamamla
    // -------------------------------------------------------------------------
    function openEditPopup(row) {
      S.editingElement = Object.assign({}, row);
      S.temp = { warr: row.tim_warr || '', plan: row.tim_mnt_plan || '', kind: row.mnt_kind || '', usr: row.mnt_usr || '', notes: row.mnt_notes || '' };
      S.showEditPopup = true;
      render();
    }
    function closeEditPopup() {
      S.showEditPopup = false;
      S.editingElement = null;
      render();
    }
    // OPR_mnt_save: asm_id için açık kayıt varsa günceller, yoksa yeni kayıt ekler
    function saveMntRecord(o) {
      const a = ASSET.get(o.asm_id) || {};
      let r = M.records.find(x => x.asm_id === o.asm_id && !x.is_completed);
      if (!r) {
        r = { mnt_id: M.nextMntId(), asm_id: o.asm_id, is_completed: 0 };
        M.records.push(r);
      }
      Object.assign(r, {
        tim_warr: o.tim_warr || '', tim_mnt_plan: o.tim_mnt_plan || '', mnt_name: (a.manufacturer || '') + ', ' + (a.model || ''),
        mnt_typ: o.mnt_typ || 'Donanim', mnt_kind: o.mnt_kind || '', mnt_notes: o.mnt_notes || '', mnt_usr: o.mnt_usr || '', notify_sent: 0, sta: 0
      });
    }
    function saveDates() {
      if (S.isSaving || !S.editingElement) return;
      S.isSaving = true;
      render();
      const el = S.editingElement;
      later(() => {
        saveMntRecord({ asm_id: el.asm_id, tim_warr: S.temp.warr, tim_mnt_plan: S.temp.plan, mnt_kind: S.temp.kind, mnt_notes: S.temp.notes, mnt_usr: S.temp.usr });
        const target = S.ELEMENT_DATA.find(x => x.asm_id === el.asm_id);
        if (target) { target.tim_warr = S.temp.warr || ''; target.tim_mnt_plan = S.temp.plan || ''; }
        toast(T.alerts.saveSuccess, 'success', T.common.success);
        S.isSaving = false;
        render();
        later(() => refresh1(), 500);
      }, 350);
    }
    function completeRecord(mntId) {
      if (!mntId) return;
      dialog({
        title: T.tb.doComplete, variant: 'confirm', body: '<p>' + esc(T.alerts.confirmComplete) + '</p>',
        confirmLabel: T.tb.doComplete, confirmIcon: 'pi pi-check', cancelLabel: 'İptal',
        onConfirm: () => {
          const r = M.records.find(x => x.mnt_id === mntId);
          if (r) r.is_completed = 1;
          toast(T.alerts.completeSuccess, 'success', T.common.success);
          refresh1();
        }
      });
    }
    // MNT_check_and_email: garanti / plan tarihine 0-7 gün kalan kayıtlar için hatırlatma e-postası
    function triggerManualMailCheck() {
      dialog({
        title: T.tb.manualMail, variant: 'info', body: '<p>' + esc(T.alerts.confirmMail) + '</p>',
        confirmLabel: 'Tamam', confirmIcon: 'pi pi-envelope', cancelLabel: 'İptal',
        onConfirm: () => {
          S.isLoading = true;
          render();
          later(() => {
            const near = v => { const d = parseDay(v); if (!d) return false; const n = diffDays(d); return n >= 0 && n <= 7; };
            const count = new Set(M.records.filter(r => near(r.tim_warr) || near(r.tim_mnt_plan)).map(r => r.asm_id)).size;
            toast(T.alerts.mailSent + ' (' + count + ' varlık için hatırlatma kuyruğa alındı)', 'info', T.common.info);
            S.isLoading = false;
            render();
          }, 600);
        }
      });
    }

    // -------------------------------------------------------------------------
    // Sihirbaz (stepper)
    // -------------------------------------------------------------------------
    function asmFilter() {
      S.asm_page_ofs = 0;
      const w = {};
      ASM_FILTERS.forEach(f => { const v = String(S.asm_filters[f.key] || '').trim(); if (v) w[f.key] = v; });
      S.asm_where = w;
      refreshAsmList();
    }
    function nextStep() {
      if (S.stepperStep === 1) {
        if (S.selectedAsmIds.size === 0) { toast(T.alerts.selectAsset, 'warning', T.common.warning); return; }
        S.stepperStep = 2;
        render();
      } else if (S.stepperStep === 2) {
        bulkSave();
      }
    }
    function prevStep() {
      if (S.stepperStep > 1) { S.stepperStep--; render(); } else setViewMode('cards');
    }
    function bulkSave() {
      if (S.isSaving) return;
      S.isSaving = true;
      render();
      later(() => {
        const ids = Array.from(S.selectedAsmIds);
        ids.forEach(id => saveMntRecord({ asm_id: id, tim_warr: S.bulk.warr, tim_mnt_plan: S.bulk.plan, mnt_kind: S.bulk.kind, mnt_notes: S.bulk.notes, mnt_usr: S.bulk.usr, mnt_typ: 'Toplu Kayıt' }));
        S.isSaving = false;
        if (ids.length > 0) {
          toast(T.alerts.bulkSaveSuccess.replace('{count}', ids.length), 'success', T.common.success);
          S.stepperStep = 3;
          render();
          later(() => { setViewMode('cards'); refresh1(); }, 2000);
        } else {
          toast(T.alerts.saveError, 'error', T.common.error);
          render();
        }
      }, 150 + S.selectedAsmIds.size * 25);
    }

    // -------------------------------------------------------------------------
    // Rapor penceresi (MaintenanceReportPopupComponent)
    // -------------------------------------------------------------------------
    function openReportPopup() {
      S.showReportPopup = true;
      S.rp = { type: S.currentTab, data: [], loading: false, searched: false, pdf: false, excel: false };
      render();
    }
    function searchReport() {
      S.rp.loading = true;
      S.rp.searched = true;
      S.rp.data = [];
      render();
      later(() => {
        S.rp.data = queryMnt({ view_type: S.rp.type });
        S.rp.loading = false;
        render();
      }, 450);
    }
    const reportTitle = () => S.rp.type === 'completed' ? T.rp.titleCompleted : T.rp.titleIncomplete;
    const reportCols = h => [
      { header: h.assetId, value: r => r.asm_id || 'N/A' },
      { header: h.serialNo, value: r => r.asset_serial_no || 'N/A' },
      { header: h.brandModel, value: r => ((r.manufacturer || '') + ' ' + (r.model || '')).trim() || 'N/A' },
      { header: h.cabinet, value: r => r.cabin_name || 'N/A' },
      { header: h.warrantyEnd, value: r => fmtDay(r.tim_warr) || 'N/A' },
      { header: h.plan, value: r => fmtDay(r.tim_mnt_plan) || 'N/A' },
      { header: h.recordType, value: r => formatMntKind(r.mnt_kind) },
      { header: h.personnel, value: r => r.mnt_usr || 'N/A' },
      { header: h.description, value: r => r.mnt_notes || 'N/A' }
    ];
    // jsPDF + autoTable yerine: A4 yatay, gizli iframe'de yazdırılabilir tablo
    function generatePdf() {
      const rows = S.rp.data;
      if (!rows.length) return;
      S.rp.pdf = true;
      render();
      const cols = reportCols(T.rp.h);
      const now = new Date();
      const logo = new URL('assets/img/akya.png', window.location.href).href;
      const widths = [20, 30, 35, 30, 25, 25, 25, 30, 40];
      const html = '<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>' + esc(S.rp.type === 'completed' ? T.rp.fileCompleted : T.rp.fileIncomplete) + '</title><style>' +
        '@page{size:A4 landscape;margin:10mm 15mm}*{box-sizing:border-box}body{font-family:Helvetica,Arial,sans-serif;color:#0f172a;margin:0;font-size:8pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
        '.top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6mm}.top h1{font-size:16pt;margin:0 0 4mm}.top p{margin:1mm 0;font-size:10pt}.top img{height:15mm}' +
        'table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#34495e;color:#fff;font-weight:bold;text-align:left;padding:2mm;border:1px solid #cbd5e1}' +
        'td{padding:2mm;border:1px solid #cbd5e1;vertical-align:top;word-wrap:break-word}</style></head><body>' +
        '<div class="top"><div><h1>' + esc(reportTitle()) + '</h1><p>' + esc(T.rp.reportDate.replace('{date}', now.toLocaleString('tr-TR'))) + '</p><p>' +
        esc(T.rp.totalCount.replace('{count}', rows.length)) + '</p></div><img src="' + esc(logo) + '" onerror="this.remove()"></div>' +
        '<table><colgroup>' + widths.map(w => '<col style="width:' + w + 'mm">').join('') + '</colgroup><thead><tr>' + cols.map(c => '<th>' + esc(c.header) + '</th>').join('') + '</tr></thead><tbody>' +
        rows.map(r => '<tr>' + cols.map(c => '<td>' + esc(c.value(r)) + '</td>').join('') + '</tr>').join('') + '</tbody></table></body></html>';
      const frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
      document.body.appendChild(frame);
      const doc = frame.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();
      toast(T.rp.pdfSuccess.replace('{count}', rows.length) + ' Yazdırma penceresinde "PDF olarak kaydet" seçin.', 'success', 'PDF');
      later(() => {
        try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (err) { toast('Yazdırma başlatılamadı.', 'error', 'PDF'); }
        S.rp.pdf = false;
        render();
        setTimeout(() => frame.remove(), 1500);
      }, 300);
    }
    function generateExcel() {
      if (!S.rp.data.length) return;
      kit.exportExcel(S.rp.type === 'completed' ? T.rp.fileCompleted : T.rp.fileIncomplete, reportCols(T.rp.x), S.rp.data);
    }

    // -------------------------------------------------------------------------
    // HTML yardımcıları
    // -------------------------------------------------------------------------
    // app-button: loading → spinner, disabled → disabled özniteliği
    function btn(o) {
      const icon = o.loading ? 'pi pi-spin pi-spinner' : o.icon;
      return '<button type="button" class="' + buttonClasses(o.variant || 'primary', o.size || 'md', false) + '"' +
        (o.act ? ' data-act="' + o.act + '"' : '') + (o.attrs ? ' ' + o.attrs : '') + (o.title ? ' title="' + esc(o.title) + '"' : '') +
        (o.disabled || o.loading ? ' disabled' : '') + '>' +
        (icon ? '<i class="' + icon + ' text-current shrink-0"></i>' : '') +
        (o.label ? '<span class="inline-flex items-center gap-1.5 truncate">' + esc(o.label) + '</span>' : '') + '</button>';
    }
    const getConClass = () => S.cnt1 >= 2 ? 'processing' : 'active';
    const connBadge = () => '<div class="flex items-center gap-2">' + statusBadge(getConClass(), T.conn[getConClass()]) + '</div>';
    const crumbs = extra => [{ label: T.engineering }, { label: T.title }].concat(extra ? [{ label: extra }] : []);
    const kindOptions = (value, placeholder, disabledPh) =>
      '<option value=""' + (disabledPh ? ' disabled' : '') + (!value ? ' selected' : '') + '>' + esc(placeholder) + '</option>' +
      KINDS.map(k => '<option value="' + esc(k.value) + '"' + (k.value === value ? ' selected' : '') + '>' + esc(k.label) + '</option>').join('');
    const count = (text, n, cls) => esc(text).replace('{count}', '<span class="' + cls + '">' + n + '</span>');

    // -------------------------------------------------------------------------
    // Görünüm: kartlar
    // -------------------------------------------------------------------------
    function optionCard(act, title, desc, icon, tone) {
      return '<div data-act="' + act + '" class="group relative flex flex-col justify-between h-64 p-8 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle hover:bg-slate-50 dark:hover:bg-surface-hover hover:border-sky-500 dark:hover:border-sky-500 transition-all duration-200 cursor-pointer rounded-[2px] shadow-2xs">' +
        '<div class="flex items-start justify-between">' +
          '<div class="space-y-4">' +
            '<h3 class="text-xl font-bold text-slate-900 dark:text-slate-100 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">' + esc(title) + '</h3>' +
            '<p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm">' + esc(desc) + '</p>' +
          '</div>' +
          (tone === 'sky'
            ? '<div class="w-16 h-16 rounded-[2px] bg-sky-50 dark:bg-sky-500/10 flex items-center justify-center text-sky-600 dark:text-sky-400 group-hover:scale-105 transition-transform shrink-0">'
            : '<div class="w-16 h-16 rounded-[2px] bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center text-purple-600 dark:text-purple-400 group-hover:scale-105 transition-transform shrink-0">') +
            '<i class="' + icon + ' text-3xl"></i></div>' +
        '</div>' +
        (tone === 'sky'
          ? '<div class="flex items-center text-sm font-semibold text-sky-600 dark:text-sky-400 gap-1.5 select-none">'
          : '<div class="flex items-center text-sm font-semibold text-purple-600 dark:text-purple-400 gap-1.5 select-none">') +
          '<span>' + esc(T.view) + '</span><i class="pi pi-arrow-right text-xs"></i></div>' +
      '</div>';
    }
    function renderCards() {
      return '<div class="space-y-6">' +
        kit.pageHeader({ title: T.title, breadcrumbs: crumbs() }) +
        '<div class="flex justify-center items-center py-16">' +
          '<div class="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl w-full px-4">' +
            optionCard('view-table', T.cardTableTitle, T.cardTableDesc, 'pi pi-table', 'sky') +
            optionCard('view-stepper', T.cardStepperTitle, T.cardStepperDesc, 'pi pi-calendar-plus', 'purple') +
          '</div>' +
        '</div>' +
      '</div>';
    }

    // -------------------------------------------------------------------------
    // Görünüm: sihirbaz
    // -------------------------------------------------------------------------
    function stepIndicator(n, label) {
      const s = S.stepperStep;
      let box, txt;
      if (n === 3) {
        box = s === 3 ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400';
        txt = s === 3 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400';
      } else {
        box = s === n ? 'bg-sky-600 text-white' : (s > n ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400');
        txt = s === n ? 'text-sky-600 dark:text-sky-400' : 'text-slate-500 dark:text-slate-400';
      }
      return '<div class="flex items-center gap-2">' +
        '<div class="w-6 h-6 rounded-[2px] flex items-center justify-center text-xs font-bold transition-colors ' + box + '">' +
          (n < 3 && s > n ? '<i class="pi pi-check text-[10px]"></i>' : '<span>' + n + '</span>') + '</div>' +
        '<span class="text-xs font-bold ' + txt + '">' + esc(label) + '</span></div>';
    }
    function pager(prefix, cur, total, input, loading) {
      const atStart = cur === 0;
      const atEnd = total > 0 && cur + 1 >= total;
      return btn({ act: prefix + 'first', variant: 'secondary', size: 'sm', icon: 'pi pi-angle-double-left', title: T.common.first, disabled: loading || atStart }) +
        btn({ act: prefix + 'prev', variant: 'secondary', size: 'sm', icon: 'pi pi-angle-left', title: T.common.previous, disabled: loading || atStart }) +
        input +
        btn({ act: prefix + 'next', variant: 'secondary', size: 'sm', icon: 'pi pi-angle-right', title: T.common.next, disabled: loading || atEnd }) +
        btn({ act: prefix + 'last', variant: 'secondary', size: 'sm', icon: 'pi pi-angle-double-right', title: T.common.last, disabled: loading || atEnd });
    }
    function renderStep1() {
      const allOn = S.ASM_DATA.length > 0 && S.ASM_DATA.every(a => S.selectedAsmIds.has(a.asm_id));
      const filterCell = f => '<th class="p-1"><input type="text" id="' + f.id + '" data-af="' + f.key + '" value="' + esc(S.asm_filters[f.key] || '') + '" placeholder="' + esc(T.tb.ph.search) + '" class="scada-input py-0.5 text-[11px]" /></th>';
      let body;
      if (S.asm_isLoading) {
        body = '<tr><td colspan="6" class="p-8 text-center text-slate-400 dark:text-slate-500"><i class="pi pi-spin pi-spinner text-lg text-sky-600 dark:text-sky-400 mb-1"></i><p>' + esc(T.tb.loading) + '</p></td></tr>';
      } else if (!S.ASM_DATA.length) {
        body = '<tr><td colspan="6" class="p-8 text-center text-slate-400 dark:text-slate-500 italic">' + esc(T.st.noRecords) + '</td></tr>';
      } else {
        body = S.ASM_DATA.map(a => {
          const on = S.selectedAsmIds.has(a.asm_id);
          return '<tr data-asm-row="' + esc(a.asm_id) + '" class="hover:bg-slate-50 dark:hover:bg-surface-base transition-colors cursor-pointer' + (on ? ' bg-sky-500/5' : '') + '">' +
            '<td class="py-2 px-3 text-center" data-stop><input type="checkbox" data-asm-chk="' + esc(a.asm_id) + '"' + (on ? ' checked' : '') + ' class="rounded-[2px] border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-sky-500" /></td>' +
            '<td class="py-2 px-3">' + esc(a.asset_id) + '</td>' +
            '<td class="py-2 px-3">' + esc(a.asset_serial_no) + '</td>' +
            '<td class="py-2 px-3 font-medium">' + esc(a.model) + '</td>' +
            '<td class="py-2 px-3">' + esc(a.name) + '</td>' +
            '<td class="py-2 px-3">' + esc(a.cabin_name) + '</td>' +
          '</tr>';
        }).join('');
      }
      return '<div class="space-y-4">' +
        '<div class="flex items-center justify-between border-b border-slate-100 dark:border-border-subtle pb-3">' +
          '<h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">' + esc(T.st.selectHeader) + '</h3>' +
          '<div class="flex items-center gap-1">' +
            pager('asm-', S.asm_page_cur, S.asm_page_total,
              '<div class="flex items-center gap-1 mx-2"><input type="number" data-asm-page-input class="scada-input w-12 text-center text-xs py-1" value="' + (S.asm_page_cur + 1) + '" min="1" max="' + S.asm_page_total + '" />' +
              (S.asm_page_total > 0 ? '<span class="text-xs text-slate-500 dark:text-slate-400">/ ' + S.asm_page_total + '</span>' : '') + '</div>', false) +
          '</div>' +
        '</div>' +
        '<div class="overflow-x-auto"><table class="scada-table w-full text-left border-collapse text-xs">' +
          '<thead>' +
            '<tr class="bg-slate-50 dark:bg-surface-base border-b border-slate-200 dark:border-border-subtle font-bold text-slate-800 dark:text-slate-200">' +
              '<th class="py-2 px-3 w-8 text-center"><input type="checkbox" data-asm-all' + (allOn ? ' checked' : '') + ' class="rounded-[2px] border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-sky-500" /></th>' +
              '<th>' + esc(T.tb.assetId) + '</th><th>' + esc(T.tb.ph.serialNo) + '</th><th>' + esc(T.tb.model) + '</th><th>' + esc(T.st.deviceName) + '</th><th>' + esc(T.st.cabin) + '</th>' +
            '</tr>' +
            '<tr class="bg-slate-100 dark:bg-surface-panel border-b border-slate-200 dark:border-border-subtle"><th></th>' + ASM_FILTERS.map(filterCell).join('') + '</tr>' +
          '</thead>' +
          '<tbody class="divide-y divide-slate-100 dark:divide-border-subtle text-slate-800 dark:text-slate-200">' + body + '</tbody>' +
        '</table></div>' +
        '<div class="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-border-subtle text-xs text-slate-500 dark:text-slate-400 font-semibold">' +
          '<div>' + count(T.st.selected, S.selectedAsmIds.size, 'font-bold text-sky-600 dark:text-sky-400') + '</div>' +
          '<div class="flex items-center gap-1.5 font-semibold"><span>' + esc(T.common.perPage) + ':</span>' +
            '<input type="number" data-asm-page-rng class="scada-input w-14 py-0.5 text-center bg-white dark:bg-surface-card" value="' + S.asm_page_rng + '" min="1" max="999" /></div>' +
        '</div>' +
      '</div>';
    }
    function notesCounter(key, text) {
      const n = (text || '').length;
      return '<span data-count="' + key + '" class="text-rose-500 font-bold' + (n >= 200 ? '' : ' hidden') + '">' + n + '/200</span>';
    }
    function renderStep2() {
      const B = S.bulk;
      return '<div class="space-y-6">' +
        '<div class="border-b border-slate-100 dark:border-border-subtle pb-3">' +
          '<h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">' + esc(T.st.datesHeader) + '</h3>' +
          '<p class="text-xs text-slate-500 dark:text-slate-400 mt-1">' + count(T.st.datesDesc, S.selectedAsmIds.size, 'font-bold text-sky-600 dark:text-sky-400') + '</p>' +
        '</div>' +
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' +
          kit.formField({ label: T.st.warranty, icon: 'pi pi-calendar', control: '<input type="date" data-bulk="warr" value="' + esc(B.warr) + '" class="scada-input" />' }) +
          kit.formField({ label: T.st.plan, icon: 'pi pi-calendar', control: '<input type="date" data-bulk="plan" value="' + esc(B.plan) + '" class="scada-input" />' }) +
          kit.formField({ label: T.st.type, icon: 'pi pi-cog', control: '<select data-bulk="kind" class="scada-select">' + kindOptions(B.kind, T.common.select, true) + '</select>' }) +
          kit.formField({ label: T.st.responsible, icon: 'pi pi-user', control: '<input type="text" data-bulk="usr" value="' + esc(B.usr) + '" placeholder="' + esc(T.st.responsiblePh) + '" class="scada-input" list="mm-personnel" />' }) +
          '<div class="md:col-span-2">' +
            kit.formField({ label: T.st.desc, icon: 'pi pi-file-edit', control:
              '<div class="flex justify-between items-center mb-1 text-[10px] text-slate-400"><span>' + esc(T.st.descPh) + '</span>' + notesCounter('bulk', B.notes) + '</div>' +
              '<textarea data-bulk="notes" rows="3" class="scada-textarea" placeholder="' + esc(T.st.descPh) + '" maxlength="200">' + esc(B.notes) + '</textarea>' }) +
          '</div>' +
        '</div>' +
      '</div>';
    }
    function renderStep3() {
      return '<div class="py-8 flex flex-col items-center justify-center text-center space-y-4 max-w-sm mx-auto">' +
        '<div class="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 text-2xl font-bold animate-bounce"><i class="pi pi-check text-2xl"></i></div>' +
        '<div class="space-y-1.5">' +
          '<h3 class="text-base font-bold text-slate-900 dark:text-slate-100">' + esc(T.st.successTitle) + '</h3>' +
          '<p class="text-xs text-slate-500 dark:text-slate-400">' + esc(T.st.successDesc) + '</p>' +
          '<p class="text-[11px] text-sky-600 dark:text-sky-400 font-semibold animate-pulse pt-2">' + esc(T.st.redirecting) + '</p>' +
        '</div>' +
      '</div>';
    }
    function renderStepper() {
      const s = S.stepperStep;
      return '<div class="space-y-6">' +
        kit.pageHeader({ title: T.st.title, breadcrumbs: crumbs(T.st.title), actions: connBadge() }) +
        '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle p-4 rounded-[2px]">' +
          '<div class="flex items-center justify-between max-w-2xl mx-auto">' +
            stepIndicator(1, T.st.step1) + '<div class="flex-1 h-px bg-slate-200 dark:bg-border-subtle mx-4"></div>' +
            stepIndicator(2, T.st.step2) + '<div class="flex-1 h-px bg-slate-200 dark:bg-border-subtle mx-4"></div>' +
            stepIndicator(3, T.st.step3) +
          '</div>' +
        '</div>' +
        '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle p-6 rounded-[2px]">' +
          (s === 1 ? renderStep1() : s === 2 ? renderStep2() : renderStep3()) +
        '</div>' +
        (s < 3
          ? '<div class="flex items-center justify-between border-t border-slate-200 dark:border-border-subtle pt-4">' +
              btn({ act: 'step-prev', variant: 'secondary', size: 'md', label: s === 1 ? T.st.cancel : T.st.back, disabled: S.isSaving }) +
              btn({ act: 'step-next', variant: 'primary', size: 'md', label: s === 1 ? T.st.next : T.st.complete, disabled: S.isSaving, loading: S.isSaving }) +
            '</div>'
          : '') +
      '</div>';
    }

    // -------------------------------------------------------------------------
    // Görünüm: tablo
    // -------------------------------------------------------------------------
    function filterPanel() {
      const F = S.filters;
      const txt = (key, id, label, ph) => kit.formField({ label, control: '<input class="scada-input" id="' + id + '" data-f="' + key + '" type="text" value="' + esc(F[key]) + '" placeholder="' + esc(ph) + '">' });
      const dt = (key, label) => kit.formField({ label, control: '<input class="scada-input" data-f="' + key + '" data-f-change type="date" value="' + esc(F[key]) + '">' });
      return '<div class="p-3 bg-slate-50 dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] space-y-3">' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2 text-xs">' +
          txt('asm_id', 'asm_id_filter', T.tb.assetId, T.tb.ph.assetId) +
          txt('asset_serial_no', 'serial_no_filter', T.tb.ph.serialNo, T.tb.ph.serialNo) +
          txt('manufacturer', 'mfr_filter', T.tb.ph.brand, T.tb.ph.brand) +
          txt('model', 'model_filter', T.tb.ph.model, T.tb.ph.model) +
          txt('cabin_name', 'cabin_filter', T.tb.ph.cabin, T.tb.ph.cabin) +
          dt('w_bgn', T.tb.wBgn) + dt('w_end', T.tb.wEnd) + dt('m_bgn', T.tb.mBgn) + dt('m_end', T.tb.mEnd) +
          kit.formField({ label: T.tb.recordType, control: '<select class="scada-select" id="mnt_kind_filter" data-f="mnt_kind" data-f-change>' + kindOptions(F.mnt_kind, T.tb.ph.select, false) + '</select>' }) +
          txt('mnt_notes', 'mnt_notes_filter', T.tb.ph.description, T.tb.ph.description) +
          txt('mnt_usr', 'mnt_usr_filter', T.tb.ph.responsible, T.tb.ph.responsible) +
        '</div>' +
        '<div class="flex items-center justify-end gap-2 border-t border-slate-200/50 dark:border-border-subtle pt-2">' +
          btn({ act: 'filter-clear', variant: 'secondary', size: 'sm', label: T.tb.clear }) +
          btn({ act: 'filter-apply', variant: 'primary', size: 'sm', label: T.tb.apply }) +
        '</div>' +
      '</div>';
    }
    function dateCell(v) {
      return '<td class="py-2.5 px-3"><div class="' + getDateClass(v) + '">' + esc(fmtDay(v) || '-') + '</div>' +
        '<div class="text-[10px] text-slate-400 mt-0.5">' + esc(getRemainingTimeText(v)) + '</div></td>';
    }
    function tableBody() {
      if (S.ELEMENT_DATA.length) {
        return S.ELEMENT_DATA.map(r => {
          const sel = S.editingElement && S.editingElement.asm_id === r.asm_id;
          return '<tr data-row="' + esc(r.asm_id) + '" class="hover:bg-slate-50 dark:hover:bg-surface-base transition-colors cursor-pointer' + (sel ? ' bg-sky-500/5 border-l-2 border-sky-500' : '') + '">' +
            '<td class="py-2.5 px-3 font-mono font-bold">' + esc(r.asm_id) + '</td>' +
            '<td class="py-2.5 px-3">' + esc(r.asset_serial_no || '-') + '</td>' +
            '<td class="py-2.5 px-3">' + esc(r.manufacturer || '-') + '</td>' +
            '<td class="py-2.5 px-3 font-semibold">' + esc(r.model || '-') + '</td>' +
            '<td class="py-2.5 px-3">' + esc(r.cabin_name || '-') + '</td>' +
            dateCell(r.tim_warr) + dateCell(r.tim_mnt_plan) +
            '<td class="py-2.5 px-3"><span class="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-semibold rounded-[2px]">' + esc(formatMntKind(r.mnt_kind)) + '</span></td>' +
            '<td class="py-2.5 px-3 max-w-xs truncate" title="' + esc(r.mnt_notes || '') + '">' + esc(r.mnt_notes || '-') + '</td>' +
            '<td class="py-2.5 px-3 font-medium">' + esc(r.mnt_usr || '-') + '</td>' +
            '<td class="py-2.5 px-3 text-center" data-stop>' +
              (S.currentTab !== 'completed'
                ? btn({ act: 'complete', attrs: 'data-mnt="' + esc(r.mnt_id) + '"', variant: 'primary', size: 'sm', label: T.tb.doComplete })
                : '<span class="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold"><i class="pi pi-check-circle text-xs"></i><span>' + esc(T.tb.isCompleted) + '</span></span>') +
            '</td>' +
          '</tr>';
        }).join('');
      }
      return '<tr><td colspan="11" class="p-8 text-center text-slate-400 dark:text-slate-500">' +
        (S.isLoading
          ? '<div class="flex items-center justify-center gap-2 text-sky-600 dark:text-sky-400 font-bold"><i class="pi pi-spin pi-spinner text-lg"></i><span>' + esc(T.tb.loading) + '</span></div>'
          : '<div class="flex flex-col items-center justify-center py-4"><i class="pi pi-inbox text-2xl text-slate-300 dark:text-slate-700 mb-1"></i><span>' + esc(T.tb.noData) + '</span></div>') +
      '</td></tr>';
    }
    function renderTable() {
      const L = S.isLoading;
      const tabBtn = (tab, label) => '<button type="button" data-act="tab-' + tab + '" class="' +
        (S.currentTab === tab ? 'bg-sky-600 text-white font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800') +
        ' px-3 py-1 text-xs rounded-[2px] transition-all cursor-pointer">' + esc(label) + '</button>';
      const heads = [T.tb.assetId, T.tb.serialNo, T.tb.manufacturer, T.tb.model, T.tb.cabinName, T.tb.warrantyEnd, T.tb.mntPlan, T.tb.recordType, T.tb.description, T.tb.responsible];
      return '<div class="space-y-4">' +
        kit.pageHeader({ title: T.tb.title, breadcrumbs: crumbs(T.tb.title), actions: connBadge() }) +
        '<div class="p-2.5 px-3 border border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-surface-base rounded-[2px] flex flex-wrap items-center justify-between gap-3">' +
          '<div class="flex flex-wrap items-center gap-1.5">' +
            btn({ act: 'view-cards', variant: 'secondary', size: 'sm', icon: 'pi pi-chevron-left', title: T.common.back }) +
            '<div class="flex items-center gap-0.5">' +
              pager('', S.page_cur, S.page_total,
                '<div class="flex items-center gap-1 mx-2 text-xs"><input type="number" data-page-input class="scada-input w-12 text-center py-0.5" value="' + (S.page_cur + 1) + '" min="1" max="' + S.page_total + '"' + (L ? ' disabled' : '') + ' />' +
                (S.page_total > 0 ? '<span class="text-slate-500 dark:text-slate-400">/ ' + S.page_total + '</span>' : '') + '</div>', L) +
            '</div>' +
          '</div>' +
          '<div class="flex items-center border border-slate-200 dark:border-border-subtle rounded-[2px] overflow-hidden bg-slate-100 dark:bg-surface-panel p-0.5 select-none">' +
            tabBtn('incomplete', T.tb.pending) + tabBtn('completed', T.tb.completed) +
          '</div>' +
          '<div class="flex items-center gap-1.5">' +
            btn({ act: 'filter-toggle', variant: S.filter_switch === 1 ? 'primary' : 'secondary', size: 'sm', icon: 'pi pi-filter', title: T.tb.filterTitle, label: T.common.filter, disabled: L }) +
            btn({ act: 'refresh', variant: 'secondary', size: 'sm', icon: 'pi pi-refresh', title: T.tb.refresh, label: T.tb.refresh, disabled: L }) +
            btn({ act: 'report', variant: 'secondary', size: 'sm', icon: 'pi pi-file-pdf', title: T.tb.getReport, label: S.currentTab === 'completed' ? T.tb.completedReport : T.tb.report, disabled: L }) +
            btn({ act: 'mail', variant: 'secondary', size: 'sm', icon: 'pi pi-envelope', title: T.tb.manualMail, label: T.tb.manualMail, disabled: L }) +
          '</div>' +
        '</div>' +
        (S.filter_switch === 1 ? filterPanel() : '') +
        '<div class="overflow-x-auto bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xs">' +
          '<table class="scada-table w-full text-left border-collapse text-xs">' +
            '<thead><tr class="bg-slate-50 dark:bg-surface-base border-b border-slate-200 dark:border-border-subtle font-bold text-slate-800 dark:text-slate-200 select-none">' +
              heads.map(h => '<th class="py-2 px-3">' + esc(h) + '</th>').join('') + '<th class="py-2 px-3 text-center">' + esc(T.tb.action) + '</th>' +
            '</tr></thead>' +
            '<tbody class="divide-y divide-slate-100 dark:divide-border-subtle text-slate-800 dark:text-slate-200">' + tableBody() + '</tbody>' +
            '<tfoot><tr class="bg-slate-50 dark:bg-surface-base border-t border-slate-200 dark:border-border-subtle font-semibold text-slate-500 dark:text-slate-400"><td colspan="11" class="py-2 px-3">' +
              '<div class="flex items-center justify-between text-xs">' +
                '<span>' + count(T.tb.total, S.total_records, 'text-slate-900 dark:text-slate-100 font-bold') + '</span>' +
                '<div class="flex items-center gap-1.5 font-semibold"><span>' + esc(T.common.perPage) + ':</span>' +
                  '<input type="number" data-page-rng class="scada-input w-14 py-0.5 text-center bg-white dark:bg-surface-card" value="' + S.page_rng + '" min="1" max="999" /></div>' +
              '</div>' +
            '</td></tr></tfoot>' +
          '</table>' +
        '</div>' +
      '</div>';
    }

    // app-drawer — Garanti ve Bakım Düzenleme
    function renderDrawer() {
      const E = S.editingElement;
      if (!S.showEditPopup || !E) return '';
      const ro = S.currentTab === 'completed' ? ' disabled' : '';
      const t = S.temp;
      return '<div data-drawer-backdrop class="fixed inset-0 z-50 overflow-hidden bg-slate-950/75 transition-opacity animate-fade-in">' +
        '<div class="fixed inset-y-0 right-0 max-w-full flex pl-8">' +
          '<div data-drawer-panel class="w-screen max-w-xl bg-white dark:bg-surface-card border-l border-slate-200 dark:border-border-subtle shadow-xl flex flex-col justify-between">' +
            '<div class="p-3 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-surface-base">' +
              '<div><h2 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2"><i class="pi pi-cog text-sky-600 dark:text-sky-400 text-sm"></i>' + esc(T.panel.title) + '</h2>' +
                '<p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">' + esc(T.panel.subtitle) + '</p></div>' +
              '<button type="button" data-act="drawer-close" class="w-7 h-7 rounded-[2px] flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><i class="pi pi-times text-xs"></i></button>' +
            '</div>' +
            '<div class="p-4 overflow-y-auto flex-1 text-xs text-slate-800 dark:text-slate-200">' +
              '<div class="space-y-4 text-xs">' +
                '<div class="p-3 bg-slate-50 dark:bg-surface-panel border border-slate-200 dark:border-border-subtle rounded-[2px] space-y-1.5">' +
                  '<p class="font-bold text-sky-600 dark:text-sky-400 text-xs">' + esc(T.panel.assetInfo) + '</p>' +
                  '<div class="grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-300">' +
                    '<p><span class="text-slate-400">' + esc(T.panel.assetId) + '</span> ' + esc(E.asm_id) + '</p>' +
                    '<p><span class="text-slate-400">' + esc(T.panel.serialNo) + '</span> ' + esc(E.asset_serial_no || '-') + '</p>' +
                    '<p class="col-span-2"><span class="text-slate-400">' + esc(T.panel.device) + '</span> ' + esc(E.manufacturer + ' ' + E.model) + '</p>' +
                    (E.cabin_name ? '<p class="col-span-2"><span class="text-slate-400">' + esc(T.panel.cabin) + '</span> ' + esc(E.cabin_name) + '</p>' : '') +
                  '</div>' +
                '</div>' +
                '<hr class="border-slate-100 dark:border-border-subtle my-2" />' +
                kit.formField({ label: T.st.warranty, icon: 'pi pi-calendar', control: '<input type="date" data-tmp="warr" value="' + esc(t.warr) + '"' + ro + ' class="scada-input ' + getDateClass(t.warr) + '" />' }) +
                kit.formField({ label: T.st.plan, icon: 'pi pi-calendar', control: '<input type="date" data-tmp="plan" value="' + esc(t.plan) + '"' + ro + ' class="scada-input ' + getDateClass(t.plan) + '" />' }) +
                kit.formField({ label: T.tb.recordType, icon: 'pi pi-cog', control: '<select data-tmp="kind"' + ro + ' class="scada-select">' + kindOptions(t.kind, T.common.select, true) + '</select>' }) +
                kit.formField({ label: T.st.responsible, icon: 'pi pi-user', control: '<input type="text" data-tmp="usr" value="' + esc(t.usr) + '"' + ro + ' placeholder="' + esc(T.st.responsiblePh) + '" class="scada-input" list="mm-personnel" />' }) +
                kit.formField({ label: T.st.desc, icon: 'pi pi-file-edit', control:
                  '<div class="flex justify-between items-center mb-1 text-[10px] text-slate-400"><span>Açıklama / Notlar</span>' + notesCounter('tmp', t.notes) + '</div>' +
                  '<textarea data-tmp="notes"' + ro + ' rows="4" class="scada-textarea" placeholder="' + esc(T.panel.notesPh) + '" maxlength="200">' + esc(t.notes) + '</textarea>' }) +
              '</div>' +
            '</div>' +
            '<div class="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-surface-base flex justify-end gap-2">' +
              '<div class="flex items-center gap-2">' +
                btn({ act: 'drawer-close', variant: 'secondary', size: 'sm', label: T.panel.cancel }) +
                (S.currentTab !== 'completed' ? btn({ act: 'drawer-save', variant: 'primary', size: 'sm', label: T.panel.save, disabled: S.isSaving, loading: S.isSaving }) : '') +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }

    // app-maintenance-report-popup
    function renderReport() {
      if (!S.showReportPopup) return '';
      const R = S.rp;
      const done = R.type === 'completed';
      const th = h => '<th class="px-3 py-3 font-bold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 uppercase tracking-wider text-[10px]">' + esc(h) + '</th>';
      let content = '';
      if (R.loading) {
        content = '<div class="absolute inset-0 flex flex-col items-center justify-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm z-20">' +
          '<div class="w-12 h-12 rounded-full border-4 border-slate-200 dark:border-slate-700 border-t-sky-500 animate-spin mb-4"></div>' +
          '<p class="text-sm font-medium text-slate-600 dark:text-slate-400">' + esc(T.rp.loading) + '</p></div>';
      } else if (!R.searched) {
        content = '<div class="absolute inset-0 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 p-8 text-center">' +
          '<div class="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4"><i class="pi pi-wrench text-2xl text-slate-400 dark:text-slate-500"></i></div>' +
          '<p class="text-sm font-medium">' + esc(T.rp.initial) + '</p></div>';
      } else if (!R.data.length) {
        content = '<div class="absolute inset-0 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 p-8 text-center">' +
          '<i class="pi pi-inbox text-5xl mb-4 text-slate-300 dark:text-slate-600"></i><p class="text-sm font-medium">' + esc(T.rp.noData) + '</p></div>';
      } else {
        content = '<table class="w-full text-left border-collapse text-xs whitespace-nowrap">' +
          '<thead class="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800/80 backdrop-blur-md shadow-sm"><tr>' +
            th('#') + th(T.rp.h.assetId) + th(T.rp.h.serialNo) + th(T.rp.h.brandModel) + th(T.rp.h.cabinet) + th(T.rp.h.warrantyEnd) + th(T.rp.h.plan) + th(T.rp.h.recordType) + th(T.rp.h.personnel) + th(T.rp.h.description) +
          '</tr></thead><tbody>' +
          R.data.map((r, i) => '<tr class="border-b border-slate-100 dark:border-slate-800/50 hover:bg-sky-50/50 dark:hover:bg-sky-900/10 transition-colors">' +
            '<td class="px-3 py-2 font-mono text-slate-500 dark:text-slate-400">' + (i + 1) + '</td>' +
            '<td class="px-3 py-2 font-mono font-medium text-slate-800 dark:text-slate-200">' + esc(r.asm_id || 'N/A') + '</td>' +
            '<td class="px-3 py-2 font-mono text-slate-700 dark:text-slate-300">' + esc(r.asset_serial_no || 'N/A') + '</td>' +
            '<td class="px-3 py-2 text-slate-700 dark:text-slate-300">' + esc(((r.manufacturer || '') + ' ' + (r.model || '')).slice(0, 30)) + '</td>' +
            '<td class="px-3 py-2 text-slate-600 dark:text-slate-400">' + esc(r.cabin_name || 'N/A') + '</td>' +
            '<td class="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">' + esc(fmtDay(r.tim_warr) || 'N/A') + '</td>' +
            '<td class="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">' + esc(fmtDay(r.tim_mnt_plan) || 'N/A') + '</td>' +
            '<td class="px-3 py-2"><span class="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">' + esc(formatMntKind(r.mnt_kind)) + '</span></td>' +
            '<td class="px-3 py-2 text-slate-700 dark:text-slate-300">' + esc(r.mnt_usr || 'N/A') + '</td>' +
            '<td class="px-3 py-2 text-slate-600 dark:text-slate-400 max-w-[250px] truncate" title="' + esc(r.mnt_notes || '') + '">' + esc(r.mnt_notes || '-') + '</td>' +
          '</tr>').join('') +
          '</tbody></table>';
      }
      const busy = R.pdf || R.excel;
      return '<div data-rp-backdrop class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-hidden animate-fade-in">' +
        '<div data-rp-panel class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800 dark:text-slate-100">' +
          '<div class="px-6 py-4 bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between select-none">' +
            '<div class="flex items-center gap-3">' +
              '<div class="w-9 h-9 rounded-lg flex items-center justify-center ' + (done ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400' : 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400') + '">' +
                '<i class="pi ' + (done ? 'pi-check-circle' : 'pi-wrench') + ' text-lg"></i></div>' +
              '<div><h3 class="text-base font-semibold text-slate-800 dark:text-slate-100">' + esc(reportTitle()) + '</h3>' +
                '<p class="text-xs text-slate-500 dark:text-slate-400">' + esc(done ? T.rp.subCompleted : T.rp.subIncomplete) + '</p></div>' +
            '</div>' +
            '<button type="button" data-act="rp-close" class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><i class="pi pi-times text-sm"></i></button>' +
          '</div>' +
          '<div class="p-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">' +
            '<div class="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-100 dark:border-slate-800">' +
              '<div class="flex items-center gap-3">' +
                '<div class="w-8 h-8 rounded-full bg-sky-100/50 dark:bg-sky-900/30 flex items-center justify-center text-sky-600 dark:text-sky-400 flex-shrink-0"><i class="pi pi-info-circle text-sm"></i></div>' +
                '<span class="text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium leading-relaxed">' + esc(T.rp.info) + '</span>' +
              '</div>' +
              '<button type="button" data-act="rp-fetch" class="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all duration-200 flex items-center justify-center gap-2 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"' + (R.loading ? ' disabled' : '') + '>' +
                '<i class="pi ' + (R.loading ? 'pi-spin pi-spinner' : 'pi-search') + '"></i><span>' + esc(R.loading ? T.rp.fetching : T.rp.fetch) + '</span></button>' +
            '</div>' +
          '</div>' +
          (R.data.length && !R.loading
            ? '<div class="px-6 py-2.5 bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3">' +
                '<div class="flex items-center gap-2">' +
                  '<button type="button" data-act="rp-pdf" class="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-900/40 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"' + (busy ? ' disabled' : '') + '>' +
                    '<i class="pi ' + (R.pdf ? 'pi-spin pi-spinner' : 'pi-file-pdf') + '"></i><span>' + esc(R.pdf ? T.rp.pdfGen : T.rp.pdf) + '</span></button>' +
                  '<button type="button" data-act="rp-excel" class="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-900/40 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"' + (busy ? ' disabled' : '') + '>' +
                    '<i class="pi ' + (R.excel ? 'pi-spin pi-spinner' : 'pi-file-excel') + '"></i><span>' + esc(R.excel ? T.rp.excelGen : T.rp.excel) + '</span></button>' +
                '</div>' +
                '<div class="flex items-center gap-2"><span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">' + esc(T.rp.total.replace('{count}', R.data.length)) + '</span></div>' +
              '</div>'
            : '') +
          '<div class="flex-1 overflow-auto relative min-h-[320px] max-h-[60vh] bg-white dark:bg-slate-900">' + content + '</div>' +
        '</div>' +
      '</div>';
    }

    // -------------------------------------------------------------------------
    // Çizim
    // -------------------------------------------------------------------------
    const root = document.createElement('div');
    root.className = 'eng-mm p-4';
    el.appendChild(root);
    // Sorumlu alanı için personel önerileri (DCIM.data.personnel — sunum eklemesi)
    const personnel = (DCIM.data.personnel || []).filter(p => p.dept.indexOf('Müşteri Temsilcisi') < 0).map(p => p.name)
      .concat(['Vertiv Türkiye (Yetkili Servis)', 'Dell Technologies Servis', 'HPE Pointnext Servis', 'Cisco TAC']);
    root.innerHTML = '<div data-mm-view></div><div data-mm-overlay></div><div data-mm-report></div>' +
      '<datalist id="mm-personnel">' + personnel.map(n => '<option value="' + esc(n) + '"></option>').join('') + '</datalist>';
    const viewEl = root.querySelector('[data-mm-view]');
    const overlayEl = root.querySelector('[data-mm-overlay]');
    const reportEl = root.querySelector('[data-mm-report]');
    let lastDrawer = '';
    let lastReport = '';

    function focusKey(node) {
      if (!node || !root.contains(node)) return null;
      for (const a of ['id', 'data-f', 'data-af', 'data-bulk', 'data-tmp']) if (node.hasAttribute(a)) return '[' + a + '="' + node.getAttribute(a) + '"]';
      for (const a of ['data-page-input', 'data-page-rng', 'data-asm-page-input', 'data-asm-page-rng']) if (node.hasAttribute(a)) return '[' + a + ']';
      return null;
    }
    function render() {
      if (destroyed) return;
      const fk = focusKey(document.activeElement);
      const scrollBody = overlayEl.querySelector('.overflow-y-auto');
      const drawerScroll = scrollBody ? scrollBody.scrollTop : 0;
      viewEl.innerHTML = S.viewMode === 'cards' ? renderCards() : S.viewMode === 'stepper' ? renderStepper() : renderTable();
      const d = S.viewMode === 'table' ? renderDrawer() : '';
      if (d !== lastDrawer) {
        overlayEl.innerHTML = d;
        lastDrawer = d;
        const b = overlayEl.querySelector('.overflow-y-auto');
        if (b) b.scrollTop = drawerScroll;
      }
      const r = renderReport();
      if (r !== lastReport) {
        const sc = reportEl.querySelector('.overflow-auto');
        const top = sc ? sc.scrollTop : 0;
        reportEl.innerHTML = r;
        lastReport = r;
        const sc2 = reportEl.querySelector('.overflow-auto');
        if (sc2) sc2.scrollTop = top;
      }
      if (fk) {
        const n = root.querySelector(fk);
        if (n && !n.disabled) {
          n.focus();
          if (n.type === 'text' && n.setSelectionRange) { const l = n.value.length; n.setSelectionRange(l, l); }
        }
      }
    }

    // -------------------------------------------------------------------------
    // Olaylar (delegasyon)
    // -------------------------------------------------------------------------
    function onClick(e) {
      if (e.target.closest('[data-drawer-backdrop]') && !e.target.closest('[data-drawer-panel]')) { closeEditPopup(); return; }
      if (e.target.closest('[data-rp-backdrop]') && !e.target.closest('[data-rp-panel]')) { S.showReportPopup = false; render(); return; }
      const a = e.target.closest('[data-act]');
      if (a && !a.disabled) {
        const act = a.getAttribute('data-act');
        switch (act) {
          case 'view-cards': setViewMode('cards'); return;
          case 'view-table': setViewMode('table'); return;
          case 'view-stepper': setViewMode('stepper'); return;
          case 'first': if (S.page_cur > 0) { S.page_ofs = 0; refresh1(); } return;
          case 'prev': if (S.page_cur > 0) { S.page_ofs--; refresh1(); } return;
          case 'next': if (S.page_total > 0 && S.page_cur < S.page_total - 1) { S.page_ofs++; refresh1(); } return;
          case 'last': if (S.page_total > 0 && S.page_cur < S.page_total - 1) { S.page_ofs = S.page_total - 1; refresh1(); } return;
          case 'asm-first': if (S.asm_page_cur > 0) { S.asm_page_ofs = 0; refreshAsmList(); } return;
          case 'asm-prev': if (S.asm_page_cur > 0) { S.asm_page_ofs--; refreshAsmList(); } return;
          case 'asm-next': if (S.asm_page_total > 0 && S.asm_page_cur < S.asm_page_total - 1) { S.asm_page_ofs++; refreshAsmList(); } return;
          case 'asm-last': if (S.asm_page_total > 0 && S.asm_page_cur < S.asm_page_total - 1) { S.asm_page_ofs = S.asm_page_total - 1; refreshAsmList(); } return;
          case 'tab-incomplete': setTab('incomplete'); return;
          case 'tab-completed': setTab('completed'); return;
          case 'filter-toggle': openFilter(); return;
          case 'filter-clear': S.filters.w_bgn = S.filters.w_end = S.filters.m_bgn = S.filters.m_end = ''; openFilter(); return;
          case 'filter-apply': inputFilter(); return;
          case 'refresh': refresh1(); return;
          case 'report': openReportPopup(); return;
          case 'mail': triggerManualMailCheck(); return;
          case 'complete': completeRecord(a.getAttribute('data-mnt')); return;
          case 'drawer-close': closeEditPopup(); return;
          case 'drawer-save': saveDates(); return;
          case 'step-prev': prevStep(); return;
          case 'step-next': nextStep(); return;
          case 'rp-close': S.showReportPopup = false; render(); return;
          case 'rp-fetch': searchReport(); return;
          case 'rp-pdf': generatePdf(); return;
          case 'rp-excel': generateExcel(); return;
        }
      }
      if (e.target.closest('[data-stop]')) return;
      const row = e.target.closest('[data-row]');
      if (row) {
        const r = S.ELEMENT_DATA.find(x => x.asm_id === row.getAttribute('data-row'));
        if (r) openEditPopup(r);
        return;
      }
      const ar = e.target.closest('[data-asm-row]');
      if (ar) toggleAsm(ar.getAttribute('data-asm-row'));
    }
    function toggleAsm(id) {
      if (S.selectedAsmIds.has(id)) S.selectedAsmIds.delete(id); else S.selectedAsmIds.add(id);
      render();
    }
    const clampInt = (v, min, max) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));
    function onChange(e) {
      const t = e.target;
      if (t.hasAttribute('data-asm-chk')) { toggleAsm(t.getAttribute('data-asm-chk')); return; }
      if (t.hasAttribute('data-asm-all')) {
        S.ASM_DATA.forEach(a => { if (t.checked) S.selectedAsmIds.add(a.asm_id); else S.selectedAsmIds.delete(a.asm_id); });
        render();
        return;
      }
      if (t.hasAttribute('data-f-change')) { S.filters[t.getAttribute('data-f')] = t.value; inputFilter(); return; }
      if (t.hasAttribute('data-page-input')) { pageInputSubmit(t.value); return; }
      if (t.hasAttribute('data-asm-page-input')) { asmPageInputSubmit(t.value); return; }
      if (t.hasAttribute('data-page-rng')) { S.page_rng = clampInt(t.value, 1, 999); S.page_ofs = 0; calculateTotalPages(); refresh1(); return; }
      if (t.hasAttribute('data-asm-page-rng')) { S.asm_page_rng = clampInt(t.value, 1, 999); S.asm_page_ofs = 0; refreshAsmList(); return; }
      if (t.hasAttribute('data-bulk')) S.bulk[t.getAttribute('data-bulk')] = t.value;
      if (t.hasAttribute('data-tmp')) onTmpInput(t);
    }
    function onTmpInput(t) {
      const k = t.getAttribute('data-tmp');
      S.temp[k] = t.value;
      if (k === 'warr' || k === 'plan') t.className = 'scada-input ' + getDateClass(t.value);
      if (k === 'notes') updateCounter('tmp', t.value);
      // Drawer HTML'i önbelleği: sonraki render'da girilen değer korunmalı
      lastDrawer = renderDrawer();
    }
    function updateCounter(key, text) {
      const c = root.querySelector('[data-count="' + key + '"]');
      if (!c) return;
      c.textContent = (text || '').length + '/200';
      c.classList.toggle('hidden', (text || '').length < 200);
    }
    function onInput(e) {
      const t = e.target;
      if (t.hasAttribute('data-f') && !t.hasAttribute('data-f-change')) S.filters[t.getAttribute('data-f')] = t.value;
      else if (t.hasAttribute('data-af')) S.asm_filters[t.getAttribute('data-af')] = t.value;
      else if (t.hasAttribute('data-bulk')) { S.bulk[t.getAttribute('data-bulk')] = t.value; if (t.getAttribute('data-bulk') === 'notes') updateCounter('bulk', t.value); }
      else if (t.hasAttribute('data-tmp')) onTmpInput(t);
    }
    function onKeyup(e) {
      if (e.key !== 'Enter') return;
      const t = e.target;
      if (t.hasAttribute('data-f') && !t.hasAttribute('data-f-change')) inputFilter();
      else if (t.hasAttribute('data-af')) asmFilter();
      else if (t.hasAttribute('data-page-input')) pageInputSubmit(t.value);
      else if (t.hasAttribute('data-asm-page-input')) asmPageInputSubmit(t.value);
    }
    function pageInputSubmit(v) {
      if (!v) { render(); return; }
      let p = Math.round(Number(v));
      if (p < 1) p = 1; else if (S.page_total > 0 && p > S.page_total) p = S.page_total;
      if (S.page_ofs !== p - 1) { S.page_ofs = p - 1; refresh1(); } else render();
    }
    function asmPageInputSubmit(v) {
      if (!v) { render(); return; }
      let p = Math.round(Number(v));
      if (p < 1) p = 1; else if (S.asm_page_total > 0 && p > S.asm_page_total) p = S.asm_page_total;
      if (S.asm_page_ofs !== p - 1) { S.asm_page_ofs = p - 1; refreshAsmList(); } else render();
    }
    function onKeydown(e) {
      if (e.key !== 'Escape') return;
      if (S.showReportPopup) { S.showReportPopup = false; render(); } else if (S.showEditPopup) closeEditPopup();
    }
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);
    root.addEventListener('keyup', onKeyup);
    document.addEventListener('keydown', onKeydown);

    // -------------------------------------------------------------------------
    // Derin bağlantılar
    // -------------------------------------------------------------------------
    const p = params || new URLSearchParams('');
    const view = p.get('view');
    const FILTER_PARAMS = { notes: 'mnt_notes', usr: 'mnt_usr', kind: 'mnt_kind', cabin: 'cabin_name', mfr: 'manufacturer', model: 'model' };
    const hasFilter = Object.keys(FILTER_PARAMS).some(k => p.get(k));
    if (view === 'stepper' || p.get('step')) {
      setViewMode('stepper');
      const sel = (p.get('sel') || '').split(',').map(s => s.trim()).filter(id => ASSET.has(id));
      sel.forEach(id => S.selectedAsmIds.add(id));
      if (p.get('step') === '2' && sel.length) { S.stepperStep = 2; render(); }
    } else if (view === 'table' || p.get('tab') || p.get('open') || hasFilter || p.get('filter') || p.get('report') || p.get('page')) {
      S.viewMode = 'table';
      if (p.get('tab') === 'completed') S.currentTab = 'completed';
      if (p.get('filter') === '1' || hasFilter) S.filter_switch = 1;
      Object.keys(FILTER_PARAMS).forEach(k => { if (p.get(k)) S.filters[FILTER_PARAMS[k]] = p.get(k); });
      const pg = parseInt(p.get('page') || '1', 10);
      const openKey = (p.get('open') || '').trim();
      let target = null;
      if (openKey) {
        const w = { view_type: S.currentTab };
        TEXT_FILTERS.forEach(k => { if (S.filters[k]) w[k] = S.filters[k]; });
        const list = queryMnt(w);
        const up = openKey.toLocaleUpperCase('tr-TR');
        const idx = list.findIndex(r => r.asm_id === openKey || ((ASSET.get(r.asm_id) || {}).name || '').toLocaleUpperCase('tr-TR').indexOf(up) === 0);
        if (idx >= 0) target = list[idx];
        S.page_ofs = idx >= 0 ? Math.floor(idx / S.page_rng) : 0;
      }
      const w = {};
      TEXT_FILTERS.concat(DATE_FILTERS).forEach(k => { if (S.filters[k]) w[k] = S.filters[k]; });
      w.view_type = S.currentTab;
      S.where = w;
      if (!openKey && pg > 1) S.page_ofs = pg - 1;
      refresh1(() => {
        if (target) { const r = S.ELEMENT_DATA.find(x => x.asm_id === target.asm_id); if (r) openEditPopup(r); }
        if (p.get('report') === '1') { openReportPopup(); if (p.get('fetch') === '1') searchReport(); }
      });
    } else {
      render();
    }

    return {
      destroy() {
        destroyed = true;
        timers.forEach(id => clearTimeout(id));
        timers.clear();
        root.removeEventListener('click', onClick);
        root.removeEventListener('change', onChange);
        root.removeEventListener('input', onInput);
        root.removeEventListener('keyup', onKeyup);
        document.removeEventListener('keydown', onKeydown);
        root.remove();
      }
    };
  }

  DCIM.engRegistry['maintenance-module'] = { mount };
})();
