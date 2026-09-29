/* ==========================================================================
   DCIM Sunum — Email Konfigürasyonu / Aylık Otomatik Raporlama (NewUICMPSendemailReportComponent)
   Kaynak: new-ui/pages/engineering/sendemail-report/sendemail-report.component.{html,ts}
   - Özet modu: sonraki gönderime kalan gün sayacı (her ayın 1'i), alıcı e-posta, periyot,
     gönderilecek rapor etiketleri; "Test Maili Gönder" (PAPI REPORT_RUN, önceki ay dönemi) ve "Düzenle"
   - Düzenleme modu: bilgi notu, alıcı e-posta, çoklu seçimli rapor listesi (14 aylık rapor),
     seçili rapor çipleri (× ile kaldırma), İptal / Kaydet (EMAIL_REPORT_CFG @jsn + #save)
   - Kayıt yoksa boş durum ("Henüz bir gönderim programı yapılandırılmadı")
   Sunum ekleri (kaynakta yok, aynı görsel dille): salt okunur "SMTP Sunucu Bilgisi" kartı
   (port 587 + STARTTLS kaynaktaki lib_PAPI email_send ile aynı; sunucu/gönderen örnek değer) ve
   "Gönderim Geçmişi" (otomatik aylık gönderimler + bu oturumdaki test gönderimleri).
   Veri: DCIM.data.emailReport (js/mock/eng-sendemail-report.data.js). XDB/PAPI çağrıları simülasyondur;
   kaydedilen konfigürasyon oturum boyunca (sessionStorage) korunur.
   Derin bağlantılar (engineering.html#sendemail-report?...):
     ?edit=1                 Düzenleme modunda aç
     ?edit=1&dropdown=1      Düzenleme + rapor listesi açık
     ?empty=1                Kayıtlı konfigürasyon yok (boş durum)
     ?fail=1                 Test maili tetiklenemedi (RES=0) senaryosu
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  DCIM.engRegistry = DCIM.engRegistry || {};

  const { esc, toast, buttonClasses, storage } = DCIM.ui;
  const kit = DCIM.kit;

  // messages.tr.json → sendemailReport.* (+ common.*, menu.engineering)
  const T = {
    loadingText: 'Ayarlar yükleniyor...',
    title: 'Aylık Otomatik Raporlama',
    engineering: 'Mühendislik',
    dropdown: { select: 'Listeden seçiniz...', allSelected: 'Tüm Raporlar Seçildi', multipleSelected: '{count} Rapor Seçildi' },
    buttons: { testMailTitle: 'Kayıtlı konfigürasyonla hemen rapor gönder', testMail: 'Test Maili Gönder', sending: 'Gönderiliyor...', saving: 'Kaydediliyor...' },
    common: { edit: 'Düzenle', cancel: 'İptal', save: 'Kaydet' },
    section: { editSettings: 'E-Posta ve Gönderim Ayarları', activeSchedule: 'Aktif Gönderim Programı' },
    countdown: { days: 'gün', nextSend: 'Sonraki Gönderim', periodInfo: 'Her Ayın 1\'i · Aylık Periyot' },
    details: {
      receiverEmail: 'Alıcı E-Posta',
      sendPeriod: 'Gönderim Periyodu',
      periodValue: 'Her Ayın 1\'i (Aylık)',
      reportsToSend: 'Gönderilecek Raporlar ({count})',
      noReportsSelected: 'Rapor seçilmedi'
    },
    emptyState: {
      title: 'Henüz bir gönderim programı yapılandırılmadı',
      description: 'Sağ üstteki Düzenle butonuna basarak e-posta adresinizi ve gönderilecek raporları seçebilirsiniz.'
    },
    editMode: {
      notice: 'Seçili raporlar her ayın 1\'inde hesaplanıp belirtilen e-posta adresine Excel ve PDF olarak otomatik gönderilecektir.',
      emailLabel: 'Alıcı E-Posta Adresi',
      emailPlaceholder: 'Örn: ornek@firma.com',
      reportsLabel: 'Gönderilecek Raporlar',
      selectedReportsLabel: 'Seçili Raporlar:'
    },
    notifications: {
      enterEmail: 'Lütfen bir email adresi girin!',
      selectAtLeastOne: 'Lütfen en az bir rapor seçin!',
      configSaved: 'Email konfigürasyonu kaydedildi.',
      saveValidConfig: 'Lütfen geçerli bir konfigürasyon kaydedin.',
      selectReportToSend: 'Lütfen gönderilecek en az bir rapor seçin.',
      sendSuccess: 'Python Rapor Gönderimi Tetiklendi! E-posta hedeflendi.',
      sendFailed: 'Rapor gönderimi tetiklenemedi!'
    }
  };
  // Sunum eki metinleri (kaynakta yok)
  const X = {
    smtpTitle: 'SMTP Sunucu Bilgisi',
    smtpSub: 'Rapor servisi (PAPI) üzerinden',
    smtpServer: 'SMTP Sunucusu',
    smtpPort: 'Port',
    smtpSecurity: 'Güvenlik',
    smtpSender: 'Gönderen Adres',
    smtpAuth: 'Kimlik Doğrulama',
    smtpNote: 'SMTP ayarları sunucu tarafındaki rapor servisinde tanımlıdır; bu ekrandan değiştirilemez. Gösterilen sunucu ve gönderen adresi örnek değerdir.',
    exampleTag: 'örnek',
    historyTitle: 'Gönderim Geçmişi',
    historySub: 'Son otomatik ve test gönderimleri',
    hTime: 'Gönderim Zamanı',
    hKind: 'Tür',
    hPeriod: 'Dönem',
    hEmail: 'Alıcı',
    hCount: 'Rapor',
    hStatus: 'Durum',
    auto: 'Otomatik',
    test: 'Test',
    sent: 'Gönderildi',
    triggered: 'Tetiklendi',
    failed: 'Başarısız',
    historyEmpty: 'Henüz gönderim yapılmadı'
  };

  // sendemail-report.component.ts → reportOptions
  const REPORT_OPTIONS = [
    { value: 'pue', label: 'Aylık PUE Raporu' },
    { value: 'cue', label: 'Aylık CUE Raporu' },
    { value: 'energy', label: 'Aylık Enerji Tüketim Raporu' },
    { value: 'trafo', label: 'Aylık Trafo Raporu' },
    { value: 'ups', label: 'Aylık UPS Raporu' },
    { value: 'upsModule', label: 'Aylık UPS Modül Raporu' },
    { value: 'cabin', label: 'Aylık Kabin Güç Raporu' },
    { value: 'maxpow', label: 'Aylık Max Power Raporu' },
    { value: 'pduInventory', label: 'Aylık PDU Envanter Raporu' },
    { value: 'climate', label: 'Aylık Klima Raporu' },
    { value: 'temperature', label: 'Aylık Sıcaklık Raporu' },
    { value: 'sensor', label: 'Aylık Sensör Raporu' },
    { value: 'failover', label: 'Aylık Failover Raporu' },
    { value: 'switchRedundancy', label: 'Aylık Switch Redundancy Raporu' }
  ];
  const reportLabel = v => { const o = REPORT_OPTIONS.find(x => x.value === v); return o ? o.label : 'sendemailReport.reports.' + v; };

  const LOAD_MS = 400;
  const SAVE_MS = 700;
  const SEND_MS = 1300;
  const STORE_KEY = 'dcim_eng_email_report_cfg';
  const HISTORY_KEY = 'dcim_eng_email_report_hist';

  // Kaynak şablondaki sınıf dizeleri
  const INPUT_CLS = 'scada-input w-full py-1.5 px-3 bg-white dark:bg-surface-panel border border-slate-200 dark:border-border-subtle rounded-[2px] text-xs text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-border-muted focus:border-sky-500 focus:outline-none transition-colors';
  const BOX = 'bg-slate-50 dark:bg-surface-panel border border-slate-200/60 dark:border-border-subtle p-4 rounded-[2px]';

  // app-button (loading destekli)
  function btn(o) {
    const dis = o.disabled || o.loading;
    return '<button type="button" data-act="' + o.act + '" class="' + buttonClasses(o.variant || 'primary', o.size || 'md', false) + (o.cls ? ' ' + o.cls : '') + '"' +
      (dis ? ' disabled aria-disabled="true"' : '') + (o.loading ? ' aria-busy="true"' : '') +
      ' aria-label="' + esc(o.aria || o.label) + '"' + (o.aria ? ' title="' + esc(o.aria) + '"' : '') + '>' +
      (o.loading ? '<i class="pi pi-spin pi-spinner text-current"></i>' : o.icon ? '<i class="' + o.icon + ' text-current shrink-0"></i>' : '') +
      '<span class="truncate">' + esc(o.label) + '</span></button>';
  }

  const pad = n => String(n).padStart(2, '0');
  const fmtDT = ms => { const d = new Date(ms); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const fmtPeriod = p => {
    const m = /^(\d{4})-(\d{2})$/.exec(p || '');
    return m ? new Date(+m[1], +m[2] - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }) : p;
  };

  DCIM.engRegistry['sendemail-report'] = {
    mount(el, params) {
      const M = DCIM.data.emailReport || { savedConfig: null, smtp: {}, history: [] };
      const forceEmpty = params.get('empty') === '1';
      const forceFail = params.get('fail') === '1';

      const st = {
        emailAddress: '',
        selectedReports: [],
        isSaving: false,
        isLoading: true,
        isSending: false,
        isEditMode: false,
        savedConfig: null,
        isDropdownOpen: false,
        history: []
      };
      const timers = [];
      const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; };

      // --- XDB_GetValue(doc('ASM/S00')/id('EMAIL_REPORT_CFG')/@jsn) ---
      function readConfig() {
        if (forceEmpty) return null;
        const raw = storage.sessionGet(STORE_KEY) || (M.savedConfig ? JSON.stringify(M.savedConfig) : '');
        if (raw && raw.length > 2) {
          try {
            const cfg = JSON.parse(raw);
            return { email: cfg.email || '', reports: cfg.reports || [] };
          } catch (e) { return null; }
        }
        return null;
      }
      function readHistory() {
        let extra = [];
        try { extra = JSON.parse(storage.sessionGet(HISTORY_KEY) || '[]'); } catch (e) { extra = []; }
        return extra.concat(forceEmpty ? [] : (M.history || [])).sort((a, b) => b.time - a.time);
      }

      // --- Tarih hesapları (kaynakla aynı) ---
      function daysUntilNextSend() {
        const now = new Date();
        let y = now.getFullYear();
        let m = now.getMonth();
        if (now.getDate() === 1) return 0;
        if (m === 11) { y++; m = 0; } else { m++; }
        const next = new Date(y, m, 1);
        return Math.ceil((next.getTime() - now.getTime()) / (1000 * 3600 * 24));
      }
      function nextSendDateStr() {
        const now = new Date();
        let y = now.getFullYear();
        let m = now.getMonth();
        if (now.getDate() !== 1) { if (m === 11) { y++; m = 0; } else { m++; } }
        return new Date(y, m, 1).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
      }
      function dropdownLabel() {
        const n = st.selectedReports.length;
        if (n === 0) return T.dropdown.select;
        if (n === 1) return reportLabel(st.selectedReports[0]);
        if (n === REPORT_OPTIONS.length) return T.dropdown.allSelected;
        return T.dropdown.multipleSelected.replace('{count}', n);
      }

      // =====================================================================
      // Görünüm
      // =====================================================================
      function headerActions() {
        if (!st.isEditMode) {
          return btn({ act: 'send', variant: 'primary', icon: 'pi pi-send', disabled: st.isSending || !st.savedConfig, loading: st.isSending,
              label: st.isSending ? T.buttons.sending : T.buttons.testMail, aria: T.buttons.testMailTitle }) +
            btn({ act: 'edit', variant: 'secondary', icon: 'pi pi-pencil', label: T.common.edit });
        }
        return btn({ act: 'cancel', variant: 'secondary', icon: 'pi pi-times', disabled: st.isSaving, label: T.common.cancel }) +
          btn({ act: 'save', variant: 'primary', icon: 'pi pi-check', disabled: st.isSaving, loading: st.isSaving, label: st.isSaving ? T.buttons.saving : T.common.save });
      }

      function summaryBody() {
        const cfg = st.savedConfig;
        if (!cfg) {
          return '<div class="flex flex-col items-center justify-center p-8 text-center select-none">' +
            '<div class="w-12 h-12 rounded-full bg-slate-100 dark:bg-surface-panel flex items-center justify-center mb-3"><i class="pi pi-envelope text-slate-400 text-lg"></i></div>' +
            '<h3 class="text-xs font-black text-slate-800 dark:text-slate-200">' + esc(T.emptyState.title) + '</h3>' +
            '<p class="text-[10px] text-slate-500 dark:text-slate-400 max-w-sm mt-1">' + esc(T.emptyState.description) + '</p>' +
            btn({ act: 'edit', variant: 'primary', size: 'sm', icon: 'pi pi-pencil', label: T.common.edit, cls: 'mt-4' }) +
          '</div>';
        }
        return '<div class="flex flex-col gap-4">' +
          '<div class="grid grid-cols-1 lg:grid-cols-3 gap-4 select-none">' +
            // Geri sayım kutusu
            '<div class="flex items-center gap-4 ' + BOX + ' lg:col-span-1">' +
              '<div class="relative flex items-center justify-center shrink-0 w-16 h-16 rounded-full border-4 border-sky-500/20 dark:border-sky-500/10 bg-sky-500/5">' +
                '<div class="flex flex-col items-center justify-center">' +
                  '<span class="text-lg font-black text-sky-600 dark:text-sky-400 leading-none">' + daysUntilNextSend() + '</span>' +
                  '<span class="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-0.5">' + esc(T.countdown.days) + '</span>' +
                '</div>' +
              '</div>' +
              '<div class="flex flex-col justify-center">' +
                '<span class="text-[10px] font-semibold text-slate-500 dark:text-slate-400">' + esc(T.countdown.nextSend) + '</span>' +
                '<span class="text-xs font-black text-slate-800 dark:text-slate-200 mt-0.5">' + esc(nextSendDateStr()) + '</span>' +
                '<span class="text-[10px] text-slate-400 dark:text-slate-500 mt-1 flex items-center gap-1"><i class="pi pi-calendar-plus text-[10px]"></i>' + esc(T.countdown.periodInfo) + '</span>' +
              '</div>' +
            '</div>' +
            // Ayrıntı kutusu
            '<div class="flex flex-col gap-3 ' + BOX + ' lg:col-span-2 justify-center">' +
              '<div class="flex items-start gap-2.5"><i class="pi pi-envelope text-slate-400 text-sm mt-0.5"></i>' +
                '<div class="flex flex-col"><span class="text-[10px] font-semibold text-slate-500 dark:text-slate-400">' + esc(T.details.receiverEmail) + '</span>' +
                '<span class="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5 break-all">' + esc(cfg.email) + '</span></div></div>' +
              '<div class="flex items-start gap-2.5"><i class="pi pi-calendar text-slate-400 text-sm mt-0.5"></i>' +
                '<div class="flex flex-col"><span class="text-[10px] font-semibold text-slate-500 dark:text-slate-400">' + esc(T.details.sendPeriod) + '</span>' +
                '<span class="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5">' + esc(T.details.periodValue) + '</span></div></div>' +
            '</div>' +
          '</div>' +
          // Rapor etiketleri
          '<div class="flex flex-col gap-2 border-t border-slate-100 dark:border-slate-800/80 pt-3">' +
            '<div class="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">' +
              '<i class="pi pi-file text-[10px]"></i><span>' + esc(T.details.reportsToSend.replace('{count}', cfg.reports.length)) + '</span></div>' +
            '<div class="flex flex-wrap gap-1.5 mt-1 select-none">' +
              cfg.reports.map(r => '<span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-[2px] text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">' +
                '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>' + esc(reportLabel(r)) + '</span>').join('') +
              (cfg.reports.length === 0 ? '<div class="text-xs text-slate-400 dark:text-slate-500 italic py-1">' + esc(T.details.noReportsSelected) + '</div>' : '') +
            '</div>' +
          '</div>' +
        '</div>';
      }

      function reportsFieldHtml() {
        return '<div class="relative w-full" data-dd-wrap>' +
          '<button type="button" data-act="dd-toggle"' + (st.isSaving ? ' disabled' : '') + ' class="scada-input w-full flex items-center justify-between py-1.5 px-3 bg-white dark:bg-surface-panel border border-slate-200 dark:border-border-subtle rounded-[2px] text-xs text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-border-muted focus:border-sky-500 focus:outline-none transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-left font-medium">' +
            '<span class="truncate">' + esc(dropdownLabel()) + '</span>' +
            '<i class="pi pi-chevron-down text-[9px] text-slate-400 shrink-0 ml-1"></i>' +
          '</button>' +
          (st.isDropdownOpen
            ? '<div class="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white dark:bg-surface-card border border-slate-200 dark:border-border-muted rounded-[2px] shadow-lg py-1 select-none">' +
                REPORT_OPTIONS.map(o =>
                  '<div data-act="dd-opt" data-val="' + esc(o.value) + '" class="flex items-center gap-2.5 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-surface-hover hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors">' +
                    '<input type="checkbox" tabindex="-1"' + (st.selectedReports.indexOf(o.value) >= 0 ? ' checked' : '') + ' class="rounded-[2px] border-slate-300 text-sky-600 focus:ring-sky-500 w-3.5 h-3.5" style="pointer-events: none;" />' +
                    '<span class="truncate">' + esc(reportLabel(o.value)) + '</span>' +
                  '</div>').join('') +
              '</div>'
            : '') +
        '</div>';
      }
      function chipsHtml() {
        if (!st.selectedReports.length) return '';
        return '<div class="flex flex-col gap-2 border-t border-slate-100 dark:border-slate-800/80 pt-3">' +
          '<span class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">' + esc(T.editMode.selectedReportsLabel) + '</span>' +
          '<div class="flex flex-wrap gap-1.5 mt-1 select-none">' +
            st.selectedReports.map(r =>
              '<span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-[2px] text-[10px] font-semibold bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20 animate-fade-in">' +
                esc(reportLabel(r)) +
                '<i data-act="chip-remove" data-val="' + esc(r) + '" class="pi pi-times-circle text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer shrink-0 transition-colors"></i>' +
              '</span>').join('') +
          '</div>' +
        '</div>';
      }
      function editBody() {
        return '<div class="flex flex-col gap-4">' +
          '<div class="flex items-start gap-2 bg-sky-500/5 border border-sky-500/20 text-sky-800 dark:text-sky-400 p-3 rounded-[2px]">' +
            '<i class="pi pi-info-circle text-xs shrink-0 mt-0.5"></i>' +
            '<span class="text-[10px] leading-tight font-medium">' + esc(T.editMode.notice) + '</span>' +
          '</div>' +
          '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' +
            kit.formField({ label: T.editMode.emailLabel, required: true, icon: 'pi pi-envelope',
              control: '<input type="email" data-email class="' + INPUT_CLS + '" placeholder="' + esc(T.editMode.emailPlaceholder) + '" value="' + esc(st.emailAddress) + '"' + (st.isSaving ? ' disabled' : '') + ' />' }) +
            kit.formField({ label: T.editMode.reportsLabel, required: true, icon: 'pi pi-file', control: '<div data-reports-field>' + reportsFieldHtml() + '</div>' }) +
          '</div>' +
          '<div data-chips>' + chipsHtml() + '</div>' +
        '</div>';
      }

      // --- Sunum eki kartları ---
      function smtpCard() {
        const s = M.smtp || {};
        const row = (icon, label, value, tag) =>
          '<div class="flex items-start gap-2.5"><i class="' + icon + ' text-slate-400 text-sm mt-0.5"></i>' +
            '<div class="flex flex-col min-w-0"><span class="text-[10px] font-semibold text-slate-500 dark:text-slate-400">' + esc(label) + '</span>' +
            '<span class="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5 break-all">' + value +
              (tag ? ' <span class="ml-1 px-1.5 py-0.5 rounded-[2px] text-[9px] font-bold bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/20 align-middle">' + esc(tag) + '</span>' : '') +
            '</span></div></div>';
        return kit.card({
          title: X.smtpTitle, subtitle: X.smtpSub, icon: 'pi pi-server', cls: 'lg:col-span-1',
          body: '<div class="flex flex-col gap-3 select-none">' +
              row('pi pi-globe', X.smtpServer, '<span class="font-mono">' + esc(s.server) + '</span>', X.exampleTag) +
              '<div class="grid grid-cols-2 gap-3">' +
                row('pi pi-sitemap', X.smtpPort, '<span class="font-mono">' + esc(s.port) + '</span>') +
                row('pi pi-shield', X.smtpSecurity, esc(s.security)) +
              '</div>' +
              row('pi pi-at', X.smtpSender, '<span class="font-mono">' + esc(s.sender) + '</span>', X.exampleTag) +
              row('pi pi-key', X.smtpAuth, esc(s.auth) + ' <span class="font-mono text-slate-400">••••••••</span>') +
              '<div class="flex items-start gap-2 bg-slate-50 dark:bg-surface-panel border border-slate-200/60 dark:border-border-subtle p-2.5 rounded-[2px]">' +
                '<i class="pi pi-lock text-[10px] text-slate-400 shrink-0 mt-0.5"></i>' +
                '<span class="text-[10px] leading-tight text-slate-500 dark:text-slate-400">' + esc(X.smtpNote) + '</span>' +
              '</div>' +
            '</div>'
        });
      }
      function historyCard() {
        const rows = st.history;
        const statusOf = h => !h.ok ? badgeHtml('alarm', X.failed) : h.kind === 'test' ? badgeHtml('info', X.triggered) : badgeHtml('normal', X.sent);
        const body = rows.length
          ? '<div class="overflow-x-auto border border-slate-200 dark:border-border-subtle rounded-[2px]">' +
              '<table class="scada-table w-full text-left border-collapse text-xs">' +
                '<thead><tr class="bg-slate-50 dark:bg-surface-base border-b border-slate-200 dark:border-border-subtle font-bold text-slate-800 dark:text-slate-200 select-none">' +
                  [X.hTime, X.hKind, X.hPeriod, X.hEmail].map(h => '<th class="py-2 px-3">' + esc(h) + '</th>').join('') +
                  '<th class="py-2 px-3 text-center">' + esc(X.hCount) + '</th><th class="py-2 px-3 text-center">' + esc(X.hStatus) + '</th>' +
                '</tr></thead>' +
                '<tbody class="divide-y divide-slate-100 dark:divide-border-subtle text-slate-800 dark:text-slate-200">' +
                  rows.map(h =>
                    '<tr class="hover:bg-slate-50 dark:hover:bg-surface-base transition-colors">' +
                      '<td class="py-2 px-3 font-mono whitespace-nowrap">' + esc(fmtDT(h.time)) + '</td>' +
                      '<td class="py-2 px-3">' + (h.kind === 'test'
                        ? '<span class="px-1.5 py-0.5 rounded-[2px] text-[9px] font-bold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">' + esc(X.test) + '</span>'
                        : '<span class="px-1.5 py-0.5 rounded-[2px] text-[9px] font-bold bg-slate-500/10 text-slate-600 dark:text-slate-300 border border-slate-500/20">' + esc(X.auto) + '</span>') + '</td>' +
                      '<td class="py-2 px-3 whitespace-nowrap">' + esc(fmtPeriod(h.period)) + '</td>' +
                      '<td class="py-2 px-3 break-all">' + esc(h.email) + '</td>' +
                      '<td class="py-2 px-3 text-center font-mono font-bold">' + esc(h.count) + '</td>' +
                      '<td class="py-2 px-3 text-center">' + statusOf(h) + '</td>' +
                    '</tr>').join('') +
                '</tbody>' +
              '</table>' +
            '</div>'
          : kit.emptyState({ message: X.historyEmpty, icon: 'pi pi-inbox', compact: true });
        return kit.card({ title: X.historyTitle, subtitle: X.historySub, icon: 'pi pi-history', cls: 'lg:col-span-2', body });
      }
      const badgeHtml = (s, label) => DCIM.ui.statusBadge(s, label);

      function render() {
        if (st.isLoading) {
          el.innerHTML = '<div class="p-4"><div class="flex flex-col items-center justify-center min-h-[300px] gap-3 select-none">' +
            '<i class="pi pi-spin pi-spinner text-3xl text-sky-500"></i>' +
            '<p class="text-xs font-semibold text-slate-500 dark:text-slate-400">' + esc(T.loadingText) + '</p></div></div>';
          return;
        }
        el.innerHTML =
          '<div class="p-4" data-root>' +
            '<div class="flex flex-col gap-4">' +
              kit.pageHeader({
                title: T.title,
                breadcrumbs: [{ label: T.engineering, href: 'engineering.html' }, { label: T.title }],
                actions: '<div class="contents" data-actions>' + headerActions() + '</div>'
              }) +
              kit.card({
                title: st.isEditMode ? T.section.editSettings : T.section.activeSchedule,
                icon: 'pi pi-envelope',
                body: st.isEditMode ? editBody() : summaryBody()
              }) +
              '<div class="grid grid-cols-1 lg:grid-cols-3 gap-4">' + smtpCard() + historyCard() + '</div>' +
            '</div>' +
          '</div>';
      }
      function refreshActions() {
        const a = el.querySelector('[data-actions]');
        if (a) a.innerHTML = headerActions();
      }
      function refreshReports() {
        const f = el.querySelector('[data-reports-field]');
        if (f) {
          const list = f.querySelector('.max-h-56');
          const scroll = list ? list.scrollTop : 0;
          f.innerHTML = reportsFieldHtml();
          const nl = f.querySelector('.max-h-56');
          if (nl) nl.scrollTop = scroll;
        }
        const c = el.querySelector('[data-chips]');
        if (c) c.innerHTML = chipsHtml();
      }

      // =====================================================================
      // İşlemler
      // =====================================================================
      function loadConfiguration() {
        st.isLoading = true;
        render();
        later(() => {
          st.savedConfig = readConfig();
          st.history = readHistory();
          st.isLoading = false;
          render();
          if (params.get('edit') === '1') {
            enterEditMode();
            if (params.get('dropdown') === '1') { st.isDropdownOpen = true; refreshReports(); }
          }
        }, LOAD_MS);
      }

      function enterEditMode() {
        st.isEditMode = true;
        if (st.savedConfig) {
          st.emailAddress = st.savedConfig.email;
          st.selectedReports = st.savedConfig.reports.slice();
        } else {
          st.emailAddress = '';
          st.selectedReports = [];
        }
        st.isDropdownOpen = false;
        render();
      }
      function cancelEdit() {
        st.isEditMode = false;
        st.emailAddress = '';
        st.selectedReports = [];
        st.isDropdownOpen = false;
        render();
      }
      function saveConfig() {
        if (!st.emailAddress) { toast(T.notifications.enterEmail, 'warning'); return; }
        if (st.selectedReports.length === 0) { toast(T.notifications.selectAtLeastOne, 'warning'); return; }
        st.isSaving = true;
        st.isDropdownOpen = false;
        render();
        // XDB_SetValue(EMAIL_REPORT_CFG/@jsn, cfg) → XDB_SetValue(doc('ASM/S00')/#save, 1)
        const cfg = JSON.stringify({ email: st.emailAddress, reports: st.selectedReports });
        later(() => {
          storage.sessionSet(STORE_KEY, cfg);
          st.savedConfig = { email: st.emailAddress, reports: st.selectedReports.slice() };
          st.isSaving = false;
          st.isEditMode = false;
          toast(T.notifications.configSaved, 'success');
          render();
        }, SAVE_MS);
      }
      function sendNow() {
        const cfg = st.savedConfig;
        if (!cfg || !cfg.email) { toast(T.notifications.saveValidConfig, 'warning'); return; }
        if (cfg.reports.length === 0) { toast(T.notifications.selectReportToSend, 'warning'); return; }
        st.isSending = true;
        refreshActions();
        // Önceki dönem (1 aylık rapor) — kaynaktaki hesapla aynı
        const now = new Date();
        let reportYear = now.getFullYear();
        let reportMonth = now.getMonth();
        if (reportMonth === 0) { reportYear--; reportMonth = 12; }
        const period = reportYear + '-' + String(reportMonth).padStart(2, '0');
        // PAPI: doc('EXT/S00')/id('CN_PAPI')/@opr ← { id:'TEST_UI_REQ', cmd:'REPORT_RUN', email, reports, period, is_test:true }
        later(() => {
          const res = forceFail ? 0 : 1;
          st.isSending = false;
          const entry = { time: Date.now(), kind: 'test', period, email: cfg.email, count: cfg.reports.length, ok: !!res };
          let extra = [];
          try { extra = JSON.parse(storage.sessionGet(HISTORY_KEY) || '[]'); } catch (e) { extra = []; }
          extra.push(entry);
          storage.sessionSet(HISTORY_KEY, JSON.stringify(extra));
          st.history = readHistory();
          if (res) toast(T.notifications.sendSuccess, 'success');
          else toast(T.notifications.sendFailed, 'error');
          if (!st.isEditMode) render();
        }, SEND_MS);
      }
      function toggleReport(v) {
        const i = st.selectedReports.indexOf(v);
        if (i > -1) st.selectedReports.splice(i, 1);
        else st.selectedReports.push(v);
        refreshReports();
      }

      // --- Olaylar ---
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-act]');
        const inDropdown = e.target.closest('[data-dd-wrap]');
        // Kök (click)="closeDropdown()" — açılır listenin içi stopPropagation
        if (!inDropdown && st.isDropdownOpen) { st.isDropdownOpen = false; refreshReports(); }
        if (!b || b.disabled) return;
        switch (b.getAttribute('data-act')) {
          case 'send': sendNow(); break;
          case 'edit': enterEditMode(); break;
          case 'cancel': cancelEdit(); break;
          case 'save': saveConfig(); break;
          case 'dd-toggle': if (!st.isSaving) { st.isDropdownOpen = !st.isDropdownOpen; refreshReports(); } break;
          case 'dd-opt': toggleReport(b.getAttribute('data-val')); break;
          case 'chip-remove': toggleReport(b.getAttribute('data-val')); break;
        }
      });
      el.addEventListener('input', e => {
        if (e.target.hasAttribute('data-email')) st.emailAddress = e.target.value;
      });
      const onKey = e => {
        if (e.key === 'Escape' && st.isDropdownOpen) { st.isDropdownOpen = false; refreshReports(); }
      };
      document.addEventListener('keydown', onKey);

      loadConfiguration();

      return {
        destroy() {
          timers.forEach(clearTimeout);
          document.removeEventListener('keydown', onKey);
        }
      };
    }
  };
})();
