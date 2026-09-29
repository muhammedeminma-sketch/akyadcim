/* ==========================================================================
   DCIM Sunum — Ticket Yönetimi (NewUICMPTicketManagementComponent)
   Kaynak: new-ui/pages/engineering/ticket-management/ticket-management.component.{html,ts}
   - Açık / Kapalı talepler sekmeleri, filtre paneli (ID, müşteri, email, konu, öncelik, tarih),
     sayfalama (sayfa başına 5-50), bağlantı durum rozeti, YENİ TICKET / YENİ MESAJ işaretleri
   - Detay / Yanıtla: müşteri açıklaması + sohbet geçmişi, 200 karakterlik yanıt kutusu
     (Enter gönderir, Shift+Enter yeni satır), talebi kapatma onayı (app-dialog danger)
   - 10 sn'lik sessiz yoklama (silentLoadTickets): demo için yöneticinin yanıtından sonra
     DCIM.data.tickets.followUps'taki müşteri dönüşü gelir (YENİ MESAJ rozeti görünür)
   Veri: DCIM.data.tickets (js/mock/eng-ticket-management.data.js). TicketService çağrıları
   (HIS_GetTickets / HIS_AddTicketReply / HIS_UpdateTicketStatus) bellek içi simülasyondur.
   Derin bağlantılar (engineering.html#ticket-management?...):
     ?tab=closed             Kapalı talepler sekmesi
     ?open=1047              Talep detayını aç (1047: 1AZ39 yetkisiz kapak, 1044: 1AV42 yeni mesaj)
     ?close=1047             Kapatma onay penceresini aç
     ?filter=1               Filtre panelini aç; ?customer=Kuzey ?subject=1AZ39 ?email= ?id= ?priority=High ?date=YYYY-MM-DD
     ?conn=lost              Bağlantı hatası durumu (Bağlantı kurulamadı)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  DCIM.engRegistry = DCIM.engRegistry || {};

  const { esc, toast, dialog } = DCIM.ui;
  const kit = DCIM.kit;

  // messages.tr.json → ticketManagementComponent.*
  const T = {
    title: 'YÖNETİCİ DESTEK PANELİ',
    engineering: 'Mühendislik',
    tabs: { open: 'AÇIK TALEPLER', closed: 'KAPALI TALEPLER' },
    filter: 'Filtre',
    refresh: 'Yenile',
    toggleFilter: 'Filtre Aç/Kapat',
    tooltips: { firstPage: 'İlk Sayfa', previous: 'Önceki', next: 'Sonraki', lastPage: 'Son Sayfa' },
    placeholders: { id: 'ID...', customer: 'Müşteri...', email: 'Email...', subject: 'Konu...', priority: 'Tümü' },
    priority: { low: 'Düşük', medium: 'Orta', high: 'Yüksek' },
    headers: { id: 'ID', customer: 'Müşteri', email: 'Email', subject: 'Konu', status: 'Durum', priority: 'Öncelik', date: 'Oluşturulma', actions: 'İşlem' },
    status: { open: 'AÇIK', closed: 'KAPALI', newTicket: 'YENİ TICKET', newMessage: 'YENİ MESAJ' },
    actions: { detail: 'Detay / Yanıtla', close: 'Kapat', closeTicket: 'Talebi Kapat', back: 'Geri Dön' },
    noData: {
      noConnection: 'Bağlantı kurulamadı.',
      loading: 'Veriler yükleniyor, lütfen bekleyiniz...',
      empty: 'Sistemde henüz oluşturulmuş bir destek talebi bulunmamaktadır.'
    },
    totalRecords: 'Toplam Kayıt',
    perPage: 'Sayfa Başına',
    detail: {
      customer: 'Müşteri',
      sendReply: 'Yanıt Gönder',
      placeholder: 'Müşteriye iletilecek yanıtınızı buraya yazın...',
      sending: 'Gönderiliyor...',
      send: 'Yanıtı İlet',
      closedNotice: 'Bu talep kapatıldığı için yeni yanıt eklenemez.'
    },
    closeModal: {
      title: 'Destek Talebi Kapatma Onayı',
      confirmText: 'Bu destek talebini kapatmak istediğinize emin misiniz?',
      warningText: 'Kapatılan taleplere tekrar yanıt verilemez.',
      cancel: 'İptal',
      confirm: 'Kapat'
    },
    alerts: {
      loadError: 'Talepler yüklenemedi.',
      replySuccess: 'Yanıt başarıyla gönderildi.',
      replyError: 'Yanıt gönderilemedi.',
      closeSuccess: 'Talep kapatıldı.',
      closeError: 'Talep kapatılamadı.'
    },
    connection: { connected: 'Bağlı', connecting: 'Bağlanıyor', disconnected: 'Bağlantı Yok' }
  };

  const POLL_MS = 10000;        // 10 saniyede bir arka planda sessizce yenile
  const LOAD_MS = 450;          // HIS_GetTickets gecikmesi (simülasyon)
  const SEND_MS = 600;          // HIS_AddTicketReply gecikmesi
  const FOLLOW_UP_MS = 7000;    // yanıt → müşteri dönüşü (sonraki yoklamada teslim)
  const PAGE_SIZES = [5, 10, 15, 20, 50];

  // Sunucu tarafı (TicketService) — sayfa yüklendiği sürece bellekte tutulur; modüller arası geçişte korunur
  let SERVER = null;
  function server() {
    if (!SERVER) {
      const src = (DCIM.data.tickets && DCIM.data.tickets.list) || [];
      SERVER = { rows: src.map(r => Object.assign({}, r)), pending: [] };
    }
    return SERVER;
  }
  // HIS_GetTickets çıktısı: chat_history JSON metni olarak döner
  function fetchRows() {
    const S = server();
    const now = Date.now();
    // Zamanı gelen müşteri dönüşlerini (demo) kayda işle
    S.pending = S.pending.filter(p => {
      if (p.due > now) return true;
      const row = S.rows.find(r => r.tck_id === p.tck_id);
      if (row && row.status === 'OPEN') {
        const h = safeParse(row.chat_history);
        h.push({ sender_type: 'customer', sender_name: p.sender_name, message: p.message, timestamp: new Date(now).toISOString() });
        row.chat_history = JSON.stringify(h);
      }
      return false;
    });
    return S.rows.map(r => Object.assign({}, r));
  }
  function safeParse(v) {
    if (Array.isArray(v)) return v.slice();
    try { return typeof v === 'string' && v.trim() !== '' ? JSON.parse(v) : []; } catch (e) { return []; }
  }

  // Durum rozeti (AppStatusBadgeComponent) — shell.js statusBadge 'stopped'/'processing' eşlemesini içermediği için yerel
  const BADGE = {
    active: ['bg-emerald-500/10 text-emerald-700 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/50', 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]'],
    processing: ['bg-purple-500/10 text-purple-700 border-purple-300 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/50', 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]'],
    lost: ['bg-orange-500/10 text-orange-700 border-orange-300 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-500/50', 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]'],
    stopped: ['bg-slate-500/10 text-slate-700 border-slate-300 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/40', 'bg-slate-400']
  };
  const badge = (status, label) => {
    const b = BADGE[status] || BADGE.stopped;
    return '<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] text-[11px] font-bold tracking-wide border transition-all ' + b[0] + '">' +
      '<span class="w-1.5 h-1.5 rounded-full animate-pulse ' + b[1] + '"></span>' + esc(label) + '</span>';
  };

  // Angular date:'dd.MM.yyyy HH:mm' — 'YYYY-MM-DD HH:mm:ss' (yerel) ve ISO metinlerini kabul eder
  const pad = n => String(n).padStart(2, '0');
  function parseTime(v) {
    if (!v) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(v));
    const d = m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  function fmtDate(v) {
    const d = parseTime(v);
    return d ? pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) : '';
  }

  // Sınıf dizeleri (şablondan birebir)
  const TAB_ON = 'bg-sky-600 text-white font-bold shadow-xs';
  const TAB_OFF = 'bg-white dark:bg-surface-card text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-border-subtle font-medium';
  const FILTER_ON = 'bg-sky-600 text-white border-sky-600 font-bold';
  const FILTER_OFF = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 font-medium';
  const F_LABEL = 'block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-0.5';
  const F_INPUT = 'scada-input w-full px-2 py-1 text-xs bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500';
  const F_SELECT = 'scada-select w-full px-2 py-1 text-xs bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500';
  const PG_BTN = 'w-7 h-7 rounded-[2px] border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300';
  const EMPTY_FILTER = () => ({ tck_id: '', customer_name: '', email: '', subject: '', status: '', priority: '', created_at: '' });

  DCIM.engRegistry['ticket-management'] = {
    mount(el, params) {
      // das.isAuthorized('TCK,TCKU') — sunumda oturum her zaman yetkili
      const authorized = true;
      const user = DCIM.session.user();
      const adminName = (user && user.fullname) || DCIM.data.tickets.defaultAdmin;

      const st = {
        tickets: [],
        selected: null,
        isLoading: true,
        dataLoaded: false,
        queryError: false,
        isSending: false,
        activeTab: params.get('tab') === 'closed' ? 'CLOSED' : 'OPEN',
        page_ofs: 0,
        page_rng: 15,
        page_input: 1,
        filter_switch: 0,
        filterModel: EMPTY_FILTER(),
        localFilters: {},
        replyMessage: ''
      };
      const forceLost = params.get('conn') === 'lost';
      const timers = [];
      const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; };

      // --- Filtre derin bağlantıları ---
      const FILTER_PARAMS = { id: 'tck_id', customer: 'customer_name', email: 'email', subject: 'subject', priority: 'priority', date: 'created_at' };
      Object.keys(FILTER_PARAMS).forEach(p => { if (params.get(p)) st.filterModel[FILTER_PARAMS[p]] = params.get(p); });
      if (params.get('filter') === '1' || Object.keys(FILTER_PARAMS).some(p => params.get(p))) { st.filter_switch = 1; applyFilter(false); }

      el.innerHTML =
                // Kaynakta kök yalnızca "space-y-4" (dolgusuz); diğer mühendislik sayfalarıyla aynı p-4 eklendi
        '<div class="p-4">' +
          '<div class="space-y-4">' +
            '<div data-header></div>' +
            '<div data-view></div>' +
          '</div>' +
        '</div>';
      const headerEl = el.querySelector('[data-header]');
      const viewEl = el.querySelector('[data-view]');

      // --- Bağlantı durumu ---
      function conClass() {
        if (st.queryError) return 'conE';
        if (st.isLoading) return 'con0';
        if (st.dataLoaded) return 'con1';
        return 'con0';
      }
      function renderHeader() {
        const c = conClass();
        const status = c === 'con1' ? 'active' : c === 'con0' ? 'processing' : 'lost';
        const label = c === 'con1' ? T.connection.connected : c === 'con0' ? T.connection.connecting : T.connection.disconnected;
        headerEl.innerHTML = kit.pageHeader({
          title: T.title,
          breadcrumbs: [{ label: T.engineering }, { label: T.title }],
          actions: '<div class="flex items-center gap-2">' + badge(status, label) + '</div>'
        });
      }

      // --- Filtre / sayfalama (bileşen getter'ları) ---
      function applyFilter(reset) {
        if (reset !== false) { st.page_ofs = 0; st.page_input = 1; }
        const nf = {};
        Object.keys(st.filterModel).forEach(k => {
          const v = String(st.filterModel[k] || '').trim();
          if (v !== '') nf[k] = v.toLowerCase();
        });
        st.localFilters = nf;
      }
      function filteredTickets() {
        let data = st.tickets.filter(t => String(t.status || '').trim() === st.activeTab);
        const keys = Object.keys(st.localFilters);
        if (keys.length) data = data.filter(t => keys.every(k => String(t[k] || '').toLowerCase().includes(st.localFilters[k])));
        return data;
      }
      const totalPages = total => Math.ceil(total / st.page_rng);

      function isNewTicket(t) {
        if (t.status !== 'OPEN') return false;
        if (!t.chat_history || t.chat_history.length === 0) return true;
        return !t.chat_history.some(h => h.sender_type === 'admin');
      }
      function hasNewMessage(t) {
        if (t.status !== 'OPEN') return false;
        if (!t.chat_history || t.chat_history.length === 0) return false;
        if (!t.chat_history.some(h => h.sender_type === 'admin')) return false;
        return t.chat_history[t.chat_history.length - 1].sender_type === 'customer';
      }
      function priorityLabel(p) {
        if (!p) return '';
        const k = p.toLowerCase();
        return T.priority[k] || p;
      }
      const priorityCls = p => {
        const k = String(p || '').toLowerCase();
        return k === 'medium' ? 'text-amber-500 font-bold' : k === 'high' ? 'text-rose-500 font-bold' : k === 'low' ? 'text-slate-400' : '';
      };
      const statusBadgeOf = t => badge(t.status === 'OPEN' ? 'active' : 'stopped', t.status === 'OPEN' ? T.status.open : T.status.closed);

      // =====================================================================
      // Liste görünümü
      // =====================================================================
      function renderList() {
        viewEl.innerHTML =
          '<div class="space-y-4">' +
            // Sekmeler + filtre/yenile
            '<div class="flex items-center justify-between border-b border-slate-200 dark:border-border-subtle pb-2">' +
              '<div class="flex items-center gap-2">' +
                '<button type="button" data-act="tab" data-tab="OPEN" class="' + (st.activeTab === 'OPEN' ? TAB_ON : TAB_OFF) + ' px-3 py-1.5 rounded-[2px] text-xs transition-all flex items-center gap-1.5 cursor-pointer">' +
                  '<i class="pi pi-envelope text-xs"></i><span>' + esc(T.tabs.open) + '</span></button>' +
                '<button type="button" data-act="tab" data-tab="CLOSED" class="' + (st.activeTab === 'CLOSED' ? TAB_ON : TAB_OFF) + ' px-3 py-1.5 rounded-[2px] text-xs transition-all flex items-center gap-1.5 cursor-pointer">' +
                  '<i class="pi pi-folder text-xs"></i><span>' + esc(T.tabs.closed) + '</span></button>' +
              '</div>' +
              '<div class="flex items-center gap-2">' +
                '<button type="button" data-act="filter" title="' + esc(T.toggleFilter) + '" class="' + (st.filter_switch === 1 ? FILTER_ON : FILTER_OFF) + ' px-2.5 py-1.5 text-xs rounded-[2px] border flex items-center gap-1 cursor-pointer transition-colors">' +
                  '<i class="pi pi-filter text-xs"></i><span>' + esc(T.filter) + '</span></button>' +
                '<button type="button" data-act="refresh" title="' + esc(T.refresh) + '" class="px-2.5 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-[2px] hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer">' +
                  '<i class="pi pi-refresh text-xs' + (st.isLoading ? ' pi-spin' : '') + '"></i></button>' +
              '</div>' +
            '</div>' +
            (st.filter_switch === 1 ? filterPanel() : '') +
            '<div data-table class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xs overflow-hidden"></div>' +
          '</div>';
        renderTable();
      }

      function filterPanel() {
        const f = st.filterModel;
        const input = (key, label, ph, type) =>
          '<div><label class="' + F_LABEL + '">' + esc(label) + '</label>' +
          '<input type="' + (type || 'text') + '" data-filter="' + key + '" value="' + esc(f[key]) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + ' class="' + F_INPUT + '" /></div>';
        const pri = [['', T.placeholders.priority], ['Low', T.priority.low], ['Medium', T.priority.medium], ['High', T.priority.high]];
        return '<div class="p-3 bg-slate-50 dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] space-y-2">' +
          '<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">' +
            input('tck_id', T.headers.id, T.placeholders.id) +
            input('customer_name', T.headers.customer, T.placeholders.customer) +
            input('email', T.headers.email, T.placeholders.email) +
            input('subject', T.headers.subject, T.placeholders.subject) +
            '<div><label class="' + F_LABEL + '">' + esc(T.headers.priority) + '</label>' +
              '<select data-filter="priority" class="' + F_SELECT + '">' +
                pri.map(p => '<option value="' + p[0] + '"' + (f.priority === p[0] ? ' selected' : '') + '>' + esc(p[1]) + '</option>').join('') +
              '</select></div>' +
            input('created_at', T.headers.date, '', 'date') +
          '</div>' +
        '</div>';
      }

      function renderTable() {
        const box = viewEl.querySelector('[data-table]');
        if (!box) return;
        const data = filteredTickets();
        const total = data.length;
        const pages = totalPages(total);
        const rows = data.slice(st.page_ofs * st.page_rng, st.page_ofs * st.page_rng + st.page_rng);
        const c = conClass();

        const body = rows.map(t =>
          '<tr class="hover:bg-slate-50 dark:hover:bg-surface-base transition-colors">' +
            '<td class="py-2 px-3 font-mono font-bold text-slate-600 dark:text-slate-400 whitespace-nowrap">#' + esc(t.tck_id) +
              (isNewTicket(t) ? '<span class="inline-block ml-1 px-1.5 py-0.5 text-[9px] font-bold rounded-[2px] bg-rose-500/10 text-rose-500 border border-rose-500/20 animate-pulse">' + esc(T.status.newTicket) + '</span>' : '') +
              (hasNewMessage(t) ? '<span class="inline-block ml-1 px-1.5 py-0.5 text-[9px] font-bold rounded-[2px] bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-pulse">' + esc(T.status.newMessage) + '</span>' : '') +
            '</td>' +
            '<td class="py-2 px-3">' + esc(t.customer_name || t.customer_id) + '</td>' +
            '<td class="py-2 px-3">' + esc(t.email) + '</td>' +
            '<td class="py-2 px-3 font-medium">' + esc(t.subject) + '</td>' +
            '<td class="py-2 px-3"><span class="' + priorityCls(t.priority) + '">' + esc(priorityLabel(t.priority)) + '</span></td>' +
            '<td class="py-2 px-3 whitespace-nowrap">' + esc(fmtDate(t.created_at)) + '</td>' +
            '<td class="py-2 px-3 text-center">' + statusBadgeOf(t) + '</td>' +
            '<td class="py-2 px-3 text-center">' +
              '<div class="flex items-center justify-center gap-1.5">' +
                '<button type="button" data-act="open" data-id="' + esc(t.tck_id) + '"' + (authorized ? '' : ' disabled') + ' class="px-2.5 py-1 text-[11px] font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-[2px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap">' + esc(T.actions.detail) + '</button>' +
                (t.status === 'OPEN' ? '<button type="button" data-act="close-row" data-id="' + esc(t.tck_id) + '"' + (authorized ? '' : ' disabled') + ' class="px-2.5 py-1 text-[11px] font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-[2px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">' + esc(T.actions.close) + '</button>' : '') +
              '</div>' +
            '</td>' +
          '</tr>'
        ).join('');

        const noData = rows.length === 0
          ? '<tr><td colspan="8" class="p-8 text-center text-slate-400 dark:text-slate-500">' +
              '<i class="pi pi-inbox text-2xl mb-1 block opacity-40"></i>' +
              (c === 'conE' ? esc(T.noData.noConnection) : '') +
              (c === 'con0' ? esc(T.noData.loading) : '') +
              (c === 'con1' && total === 0 ? esc(T.noData.empty) : '') +
            '</td></tr>'
          : '';

        const lastPage = pages > 0 && st.page_ofs + 1 >= pages;
        const pager = pages > 0
          ? '<div class="flex items-center gap-3 self-end sm:self-auto">' +
              '<div class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">' +
                '<span>' + esc(T.perPage) + ':</span>' +
                '<select data-page-size class="bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] px-2 py-0.5 text-slate-800 dark:text-slate-200 text-xs font-bold focus:outline-none">' +
                  PAGE_SIZES.map(n => '<option value="' + n + '"' + (n === st.page_rng ? ' selected' : '') + '>' + n + '</option>').join('') +
                '</select>' +
              '</div>' +
              '<div class="flex items-center gap-1">' +
                '<button type="button" data-act="first" title="' + esc(T.tooltips.firstPage) + '"' + (st.page_ofs === 0 ? ' disabled' : '') + ' class="' + PG_BTN + '"><i class="pi pi-angle-double-left text-[10px]"></i></button>' +
                '<button type="button" data-act="prev" title="' + esc(T.tooltips.previous) + '"' + (st.page_ofs === 0 ? ' disabled' : '') + ' class="' + PG_BTN + '"><i class="pi pi-chevron-left text-[10px]"></i></button>' +
                '<div class="flex items-center gap-1 text-slate-800 dark:text-slate-200 font-bold px-1">' +
                  '<input type="number" data-page-input min="1" max="' + pages + '" value="' + st.page_input + '" class="w-10 py-0.5 border border-slate-200 dark:border-slate-700 text-center bg-white dark:bg-surface-base text-xs rounded-[2px] focus:outline-none" />' +
                  '<span class="text-slate-400 font-normal">/ ' + pages + '</span>' +
                '</div>' +
                '<button type="button" data-act="next" title="' + esc(T.tooltips.next) + '"' + (lastPage ? ' disabled' : '') + ' class="' + PG_BTN + '"><i class="pi pi-chevron-right text-[10px]"></i></button>' +
                '<button type="button" data-act="last" title="' + esc(T.tooltips.lastPage) + '"' + (lastPage ? ' disabled' : '') + ' class="' + PG_BTN + '"><i class="pi pi-angle-double-right text-[10px]"></i></button>' +
              '</div>' +
            '</div>'
          : '';

        box.innerHTML =
          '<div class="overflow-x-auto">' +
            '<table class="scada-table w-full text-left border-collapse text-xs">' +
              '<thead><tr class="bg-slate-50 dark:bg-surface-base border-b border-slate-200 dark:border-border-subtle font-bold text-slate-800 dark:text-slate-200 select-none">' +
                ['id', 'customer', 'email', 'subject', 'priority', 'date'].map(k => '<th class="py-2 px-3">' + esc(T.headers[k]) + '</th>').join('') +
                '<th class="py-2 px-3 text-center">' + esc(T.headers.status) + '</th>' +
                '<th class="py-2 px-3 text-center">' + esc(T.headers.actions) + '</th>' +
              '</tr></thead>' +
              '<tbody class="divide-y divide-slate-100 dark:divide-border-subtle text-slate-800 dark:text-slate-200">' + body + noData + '</tbody>' +
            '</table>' +
          '</div>' +
          '<div class="py-2 px-3 border-t border-slate-200 dark:border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs bg-slate-50 dark:bg-[#0b121e]">' +
            '<div class="text-slate-500 dark:text-slate-400 font-medium">' + esc(T.totalRecords) + ': <span class="font-bold text-slate-900 dark:text-slate-100">' + total + '</span></div>' +
            pager +
          '</div>';
      }

      // =====================================================================
      // Detay görünümü (sohbet)
      // =====================================================================
      function bubble(who, whoCls, time, text, boxCls) {
        return '<div class="' + boxCls + ' flex flex-col max-w-[80%] border p-3 rounded-[2px] gap-1.5 shadow-2xs">' +
          '<div class="flex justify-between items-center text-[10px] border-b border-slate-200/60 dark:border-slate-800/60 pb-1 gap-4">' +
            '<span class="font-bold ' + whoCls + '">' + esc(who) + '</span>' +
            '<span class="text-slate-400">' + esc(fmtDate(time)) + '</span>' +
          '</div>' +
          '<p class="text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">' + esc(text) + '</p>' +
        '</div>';
      }
      function chatHtml(t) {
        const cust = t.customer_name || t.customer_id;
        return bubble(cust + ' (' + T.detail.customer + ')', 'text-sky-600 dark:text-sky-400', t.created_at, t.description,
            'self-start bg-slate-100 dark:bg-surface-base border-slate-200 dark:border-slate-800') +
          (t.chat_history || []).map(m => m.sender_type === 'admin'
            ? bubble(m.sender_name, 'text-emerald-600 dark:text-emerald-400', m.timestamp, m.message, 'self-end bg-sky-500/10 dark:bg-sky-500/5 border-sky-500/20 dark:border-sky-500/10')
            : bubble(m.sender_name, 'text-sky-600 dark:text-sky-400', m.timestamp, m.message, 'self-start bg-slate-100 dark:bg-surface-base border-slate-200 dark:border-slate-800')
          ).join('');
      }
      function sendBtnHtml() {
        const dis = st.isSending || !st.replyMessage.trim();
        return '<button type="button" data-act="send"' + (dis ? ' disabled' : '') + ' class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white font-bold rounded-[2px] text-xs flex items-center gap-1.5 transition-all disabled:text-slate-500 disabled:cursor-not-allowed cursor-pointer">' +
          (st.isSending ? '<i class="pi pi-spin pi-spinner text-xs"></i>' : '<i class="pi pi-send text-xs"></i>') +
          '<span>' + esc(st.isSending ? T.detail.sending : T.detail.send) + '</span></button>';
      }
      function renderDetail() {
        const t = st.selected;
        const open = t.status === 'OPEN';
        viewEl.innerHTML =
          '<div class="space-y-4">' +
            '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xs overflow-hidden">' +
              '<div class="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-900/60">' +
                '<div class="flex items-center gap-2.5">' +
                  '<span class="w-7 h-7 rounded-[2px] flex items-center justify-center text-xs bg-sky-500/10 text-sky-500 border border-sky-500/20"><i class="pi pi-ticket"></i></span>' +
                  '<div>' +
                    '<h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">#' + esc(t.tck_id) + ' - ' + esc(t.subject) + '</h3>' +
                    '<p class="text-[11px] text-slate-500 dark:text-slate-400">' + esc(T.detail.customer) + ': ' + esc(t.customer_name || t.customer_id) + '</p>' +
                  '</div>' +
                  statusBadgeOf(t) +
                '</div>' +
                '<div class="flex items-center gap-2">' +
                  (open ? '<button type="button" data-act="close-detail"' + (authorized ? '' : ' disabled') + ' class="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-[2px] text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">' +
                    '<i class="pi pi-lock text-xs"></i><span>' + esc(T.actions.closeTicket) + '</span></button>' : '') +
                  '<button type="button" data-act="back" class="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-[2px] text-xs flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer">' +
                    '<i class="pi pi-arrow-left text-xs"></i><span>' + esc(T.actions.back) + '</span></button>' +
                '</div>' +
              '</div>' +
              '<div class="p-5 flex flex-col gap-4 bg-slate-50 dark:bg-surface-base min-h-[400px]">' +
                '<div data-chat class="flex flex-col gap-4 overflow-y-auto max-h-[50vh] p-4 bg-white dark:bg-surface-panel border border-slate-200 dark:border-border-subtle rounded-[2px]">' + chatHtml(t) + '</div>' +
                (open
                  ? '<div class="flex flex-col gap-2.5">' +
                      '<div class="flex justify-between items-center text-xs">' +
                        '<label class="font-semibold text-slate-700 dark:text-slate-300">' + esc(T.detail.sendReply) + '</label>' +
                        '<span data-counter class="text-[10px] text-rose-500 font-bold' + (st.replyMessage.length >= 200 ? '' : ' hidden') + '">200/200</span>' +
                      '</div>' +
                      '<textarea data-reply rows="3" maxlength="200" placeholder="' + esc(T.detail.placeholder) + '" class="scada-textarea w-full p-2.5 text-xs bg-white dark:bg-surface-panel border border-slate-200 dark:border-border-subtle rounded-[2px] text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500">' + esc(st.replyMessage) + '</textarea>' +
                      '<div class="flex justify-end" data-send-wrap>' + sendBtnHtml() + '</div>' +
                    '</div>'
                  : '<div class="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold rounded-[2px] flex items-center justify-center gap-2">' +
                      '<i class="pi pi-lock text-sm"></i><span>' + esc(T.detail.closedNotice) + '</span></div>') +
              '</div>' +
            '</div>' +
          '</div>';
        scrollToBottom();
      }
      function refreshChat() {
        const box = viewEl.querySelector('[data-chat]');
        if (box && st.selected) box.innerHTML = chatHtml(st.selected);
      }
      function refreshSendBtn() {
        const w = viewEl.querySelector('[data-send-wrap]');
        if (w) w.innerHTML = sendBtnHtml();
        const c = viewEl.querySelector('[data-counter]');
        if (c) c.classList.toggle('hidden', st.replyMessage.length < 200);
      }
      function scrollToBottom() {
        later(() => {
          const box = viewEl.querySelector('[data-chat]');
          if (box) box.scrollTop = box.scrollHeight;
        }, 100);
      }

      function render() {
        renderHeader();
        if (st.selected) renderDetail();
        else renderList();
      }

      // =====================================================================
      // Veri yükleme (TicketService simülasyonu)
      // =====================================================================
      const normalize = rows => rows.map(r => Object.assign(r, { chat_history: safeParse(r.chat_history) }));

      function loadTickets() {
        st.isLoading = true;
        st.dataLoaded = false;
        st.queryError = false;
        render();
        later(() => {
          if (forceLost) {
            toast(T.alerts.loadError, 'error');
            st.queryError = true;
            st.isLoading = false;
          } else {
            st.tickets = normalize(fetchRows());
            if (st.selected) st.selected = st.tickets.find(x => x.tck_id === st.selected.tck_id) || null;
            st.dataLoaded = true;
            st.isLoading = false;
          }
          render();
          afterFirstLoad();
        }, LOAD_MS);
      }

      function silentLoadTickets() {
        if (forceLost) return;
        const fresh = normalize(fetchRows());
        let changed = fresh.length !== st.tickets.length;
        fresh.forEach(n => {
          const o = st.tickets.find(x => x.tck_id === n.tck_id);
          if (!o || o.chat_history.length !== n.chat_history.length || o.status !== n.status) changed = true;
        });
        const sel = st.selected;
        st.tickets = fresh;
        if (sel) {
          const upd = st.tickets.find(x => x.tck_id === sel.tck_id);
          if (upd) {
            const oldLen = (sel.chat_history || []).length;
            const newLen = (upd.chat_history || []).length;
            sel.chat_history = upd.chat_history;
            sel.status = upd.status;
            // Ekrandaki nesneyi listedeki güncel kayıtla eşle
            st.tickets[st.tickets.indexOf(upd)] = sel;
            if (newLen > oldLen) { refreshChat(); scrollToBottom(); }
          }
          return;
        }
        if (changed) renderTable();
      }

      let firstLoadDone = false;
      function afterFirstLoad() {
        if (firstLoadDone) return;
        firstLoadDone = true;
        const openId = parseInt(params.get('open'), 10);
        const closeId = parseInt(params.get('close'), 10);
        if (openId) {
          const t = st.tickets.find(x => x.tck_id === openId);
          if (t) openTicket(t);
        }
        if (closeId) {
          const t = st.tickets.find(x => x.tck_id === closeId);
          if (t && t.status === 'OPEN') askClose(t);
        }
      }

      // =====================================================================
      // İşlemler
      // =====================================================================
      function openTicket(t) {
        st.selected = t;
        st.replyMessage = '';
        render();
      }
      function backToList() {
        st.selected = null;
        render();
      }

      function sendReply() {
        const t = st.selected;
        if (!st.replyMessage.trim() || !t || st.isSending) return;
        const history = Array.isArray(t.chat_history) ? t.chat_history.slice() : [];
        const newMsg = { sender_type: 'admin', sender_name: adminName, message: st.replyMessage, timestamp: new Date().toISOString() };
        history.push(newMsg);
        st.isSending = true;
        refreshSendBtn();
        const ta = viewEl.querySelector('[data-reply]');
        if (ta) ta.disabled = true;
        later(() => {
          // HIS_AddTicketReply(tck_id, JSON.stringify(newMsg))
          const row = server().rows.find(r => r.tck_id === t.tck_id);
          if (row) {
            const h = safeParse(row.chat_history);
            h.push(newMsg);
            row.chat_history = JSON.stringify(h);
            row.updated_at = newMsg.timestamp;
            // Demo: müşteri dönüşü bir sonraki yoklamalarda gelir (her talep için bir kez)
            const fu = DCIM.data.tickets.followUps && DCIM.data.tickets.followUps[t.tck_id];
            if (fu && !row._followUpQueued) {
              row._followUpQueued = true;
              server().pending.push({ tck_id: t.tck_id, due: Date.now() + FOLLOW_UP_MS, sender_name: fu.sender_name, message: fu.message });
            }
          }
          t.chat_history = history;
          st.replyMessage = '';
          st.isSending = false;
          toast(T.alerts.replySuccess, 'success');
          if (st.selected === t) {
            refreshChat();
            const area = viewEl.querySelector('[data-reply]');
            if (area) { area.disabled = false; area.value = ''; }
            refreshSendBtn();
            scrollToBottom();
          }
        }, SEND_MS);
      }

      let closeDlg = null;
      function askClose(t) {
        if (closeDlg) closeDlg.close();
        closeDlg = dialog({
          onClose() { closeDlg = null; },
          title: T.closeModal.title,
          variant: 'danger',
          confirmLabel: T.closeModal.confirm,
          cancelLabel: T.closeModal.cancel,
          body:
            '<div class="space-y-2">' +
              '<p class="font-bold text-slate-800 dark:text-slate-200">' + esc(T.closeModal.confirmText) + '</p>' +
              '<p class="text-slate-500 dark:text-slate-400">' + esc(T.closeModal.warningText) + '</p>' +
            '</div>',
          onConfirm() {
            // HIS_UpdateTicketStatus(tck_id, 'CLOSED')
            const row = server().rows.find(r => r.tck_id === t.tck_id);
            if (row) { row.status = 'CLOSED'; row.updated_at = new Date().toISOString(); }
            t.status = 'CLOSED';
            toast(T.alerts.closeSuccess, 'success');
            render();
          }
        });
      }

      // --- Olay delegasyonu ---
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-act]');
        if (!b || b.disabled || !el.contains(b)) return;
        const act = b.getAttribute('data-act');
        const id = parseInt(b.getAttribute('data-id'), 10);
        const find = () => st.tickets.find(x => x.tck_id === id);
        const pages = totalPages(filteredTickets().length);
        switch (act) {
          case 'tab':
            st.activeTab = b.getAttribute('data-tab');
            st.page_ofs = 0; st.page_input = 1;
            renderList();
            break;
          case 'filter':
            st.filter_switch = st.filter_switch === 1 ? 0 : 1;
            if (st.filter_switch === 0) {
              st.filterModel = EMPTY_FILTER();
              st.localFilters = {};
              st.page_ofs = 0; st.page_input = 1;
            }
            renderList();
            break;
          case 'refresh': loadTickets(); break;
          case 'open': { const t = find(); if (t) openTicket(t); break; }
          case 'close-row': { const t = find(); if (t) askClose(t); break; }
          case 'close-detail': if (st.selected) askClose(st.selected); break;
          case 'back': backToList(); break;
          case 'send': sendReply(); break;
          case 'first': st.page_ofs = 0; st.page_input = 1; renderTable(); break;
          case 'prev': if (st.page_ofs > 0) { st.page_ofs--; st.page_input = st.page_ofs + 1; } renderTable(); break;
          case 'next': if (st.page_ofs + 1 < pages) { st.page_ofs++; st.page_input = st.page_ofs + 1; } renderTable(); break;
          case 'last': if (pages > 0) { st.page_ofs = pages - 1; st.page_input = pages; } renderTable(); break;
        }
      });

      el.addEventListener('input', e => {
        const f = e.target.getAttribute('data-filter');
        if (f) {
          st.filterModel[f] = e.target.value;
          applyFilter();
          renderTable();
          return;
        }
        if (e.target.hasAttribute('data-reply')) {
          st.replyMessage = e.target.value;
          refreshSendBtn();
        }
      });

      el.addEventListener('change', e => {
        const t = e.target;
        if (t.hasAttribute('data-page-size')) {
          let n = parseInt(t.value, 10) || 15;
          if (n > 999) n = 999;
          if (n < 1) n = 1;
          st.page_rng = n;
          st.page_ofs = 0; st.page_input = 1;
          renderTable();
        } else if (t.hasAttribute('data-page-input')) {
          pageInputSubmit(t);
        } else if (t.getAttribute('data-filter') === 'priority' || t.getAttribute('data-filter') === 'created_at') {
          st.filterModel[t.getAttribute('data-filter')] = t.value;
          applyFilter();
          renderTable();
        }
      });

      function pageInputSubmit(input) {
        const pages = totalPages(filteredTickets().length);
        let target = parseInt(input.value, 10) || 1;
        if (target < 1) target = 1;
        if (target > pages) target = pages;
        st.page_ofs = Math.max(0, target - 1);
        st.page_input = target;
        renderTable();
      }

      el.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        if (e.target.hasAttribute('data-reply')) {
          if (!e.shiftKey) { e.preventDefault(); sendReply(); }
        } else if (e.target.hasAttribute('data-page-input')) {
          pageInputSubmit(e.target);
        }
      });

      // --- Başlat ---
      loadTickets();
      const poll = setInterval(silentLoadTickets, POLL_MS);

      return {
        destroy() {
          clearInterval(poll);
          timers.forEach(clearTimeout);
          // Açık kalan kapatma penceresi varsa kapat
          if (closeDlg) closeDlg.close();
        }
      };
    }
  };
})();
