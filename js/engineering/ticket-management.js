/* ==========================================================================
   DCIM Sunum — Ticket Yönetimi (NewUICMPTicketManagementComponent, Kas 2026 şablonu)
   Kaynak: new-ui/pages/engineering/ticket-management/ticket-management.component.{html,ts}
   Sayfa ana alanı tam doldurur ve kendisi kaymaz; liste görünümünde yalnız kart ızgarası,
   sohbet görünümünde yalnız mesaj akışı kayar.
   - Başlık: İzleme › YÖNETİCİ DESTEK PANELİ + bağlantı rozeti (Bağlı / Bağlanıyor / Bağlantı Yok)
   - Araç çubuğu: AÇIK / KAPALI TALEPLER segmenti (sayı rozetli), arama (no, konu, müşteri, e-posta),
     Filtre (etkin alan sayısı), "Rapor al" (Açık / Kapalı talepler × PDF/Excel/CSV + oluşturulma tarih
     aralığı, varsayılan son 30 gün), Yenile
   - Filtre paneli (ID, Öncelik, Müşteri, Konu, Email, Oluşturulma) + Temizle
   - Hızlı öncelik çipleri (Tümü / Yüksek / Orta / Düşük, aktif sekmedeki sayılarla)
   - Kart ızgarası: öncelik renkli üst şerit, #no + öncelik rozeti, durum, YENİ TICKET / YENİ MESAJ,
     konu + açıklama, müşteri · e-posta, oluşturulma / son aktivite / mesaj sayısı, Detay / Kapat | Yeniden Aç
   - Sayfalama (5-50, varsayılan 50) + Toplam Kayıt
   - Sohbet görünümü: geri, #no · konu, durum/öncelik/müşteri, Talebi Kapat | Talebi Yeniden Aç; gün ayraçları,
     müşteri açıklaması, yanıt balonları (destek sağda mavi), durum olayları (Talep kapatıldı / yeniden açıldı),
     yazma alanı (200 karakter; Enter gönderir, Shift+Enter yeni satır); sağda "Talep Bilgileri" paneli (xl+)
   - Kapatma / yeniden açma onayları (app-dialog) — durum olayı chat_history'ye 'system' kaydı olarak eklenir
   - 10 sn'lik sessiz yoklama; yöneticinin yanıtından sonra DCIM.data.tickets.followUps'taki müşteri dönüşü gelir
   Veri: DCIM.data.tickets (js/mock/eng-ticket-management.data.js). TicketService çağrıları bellek içi simülasyondur.
   Derin bağlantılar (engineering.html#ticket-management?...):
     ?tab=closed             Kapalı talepler sekmesi
     ?open=1047              Talep sohbetini aç (1047: 1DA03 yetkisiz kapak, 1044: 1NA06 yeni mesaj, 1036: yeniden açılmış)
     ?close=1047             Kapatma onay penceresini aç      ?reopen=1035  Yeniden açma onayı (kapalı talep)
     ?q=1NA06                Arama
     ?priority=High          Hızlı öncelik süzgeci (High | Medium | Low)
     ?filter=1               Filtre panelini aç; ?customer= ?subject= ?email= ?id= ?date=YYYY-MM-DD
     ?report=1               Rapor menüsünü açık getir
     ?conn=lost              Bağlantı hatası durumu (Bağlantı kurulamadı.)
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
    monitoring: 'İzleme',
    tabs: { open: 'AÇIK TALEPLER', closed: 'KAPALI TALEPLER' },
    filter: 'Filtre',
    refresh: 'Yenile',
    search: 'Ara',
    clear: 'Temizle',
    perPage: 'Sayfa Başına',
    toggleFilter: 'Filtre Aç/Kapat',
    tooltips: { firstPage: 'İlk Sayfa', previous: 'Önceki', next: 'Sonraki', lastPage: 'Son Sayfa' },
    placeholders: { id: 'ID...', customer: 'Müşteri...', email: 'Email...', subject: 'Konu...', priority: 'Tümü', date: 'Oluşturulma Tarihi...' },
    priority: { low: 'Düşük', medium: 'Orta', high: 'Yüksek' },
    headers: { id: 'ID', customer: 'Müşteri', email: 'Email', subject: 'Konu', status: 'Durum', priority: 'Öncelik', date: 'Oluşturulma' },
    status: { open: 'AÇIK', closed: 'KAPALI', newTicket: 'YENİ TICKET', newMessage: 'YENİ MESAJ' },
    actions: { detail: 'Detay / Yanıtla', close: 'Kapat', closeTicket: 'Talebi Kapat', reopen: 'Yeniden Aç', reopenTicket: 'Talebi Yeniden Aç', back: 'Geri Dön' },
    noData: {
      noConnection: 'Bağlantı kurulamadı.',
      loading: 'Veriler yükleniyor, lütfen bekleyiniz...',
      empty: 'Sistemde henüz oluşturulmuş bir destek talebi bulunmamaktadır.'
    },
    totalRecords: 'Toplam Kayıt',
    detail: {
      customer: 'Müşteri',
      sendReply: 'Yanıt Gönder',
      placeholder: 'Müşteriye iletilecek yanıtınızı buraya yazın...',
      sending: 'Gönderiliyor...',
      send: 'Yanıtı İlet',
      closedNotice: 'Bu talep kapatıldığı için yeni yanıt eklenemez.',
      eventClosed: 'Talep kapatıldı',
      eventReopened: 'Talep yeniden açıldı',
      info: 'Talep Bilgileri',
      description: 'Açıklama',
      messages: 'Mesaj',
      lastActivity: 'Son Aktivite',
      noReply: 'Bu talebe henüz yanıt verilmedi.'
    },
    closeModal: {
      title: 'Destek Talebi Kapatma Onayı',
      confirmText: 'Bu destek talebini kapatmak istediğinize emin misiniz?',
      warningText: 'Kapatılan taleplere tekrar yanıt verilemez.',
      cancel: 'İptal', confirm: 'Kapat'
    },
    reopenModal: {
      title: 'Destek Talebini Yeniden Açma Onayı',
      confirmText: 'Bu destek talebini yeniden açmak istediğinize emin misiniz?',
      warningText: 'Yeniden açılan taleplere tekrar yanıt verilebilir.',
      cancel: 'İptal', confirm: 'Yeniden Aç'
    },
    alerts: {
      loadError: 'Talepler yüklenemedi.',
      replySuccess: 'Yanıt başarıyla gönderildi.',
      closeSuccess: 'Talep kapatıldı.',
      reopenSuccess: 'Talep yeniden açıldı.',
      success: 'Başarılı', error: 'Hata'
    },
    connection: { connected: 'Bağlı', connecting: 'Bağlanıyor', disconnected: 'Bağlantı Yok' }
  };

  const POLL_MS = 10000;        // 10 saniyede bir arka planda sessizce yenile
  const LOAD_MS = 450;          // HIS_GetTickets gecikmesi (simülasyon)
  const SEND_MS = 600;          // HIS_AddTicketReply gecikmesi
  const FOLLOW_UP_MS = 7000;    // yanıt → müşteri dönüşü (sonraki yoklamada teslim)
  const PAGE_SIZES = [5, 10, 15, 20, 50];

  // Öncelik renkleri (PRIORITY_THEME): Yüksek = kırmızı, Orta = amber, Düşük = mavi, tanımsız = gri
  const THEME = {
    high: {
      card: 'border-rose-200 dark:border-rose-500/35 hover:border-rose-300 dark:hover:border-rose-500/60',
      bar: 'bg-rose-500',
      pill: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30',
      icon: 'pi-angle-double-up', dot: 'bg-rose-500'
    },
    medium: {
      card: 'border-amber-200 dark:border-amber-500/35 hover:border-amber-300 dark:hover:border-amber-500/60',
      bar: 'bg-amber-500',
      pill: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
      icon: 'pi-angle-up', dot: 'bg-amber-500'
    },
    low: {
      card: 'border-sky-200 dark:border-sky-500/30 hover:border-sky-300 dark:hover:border-sky-500/55',
      bar: 'bg-sky-500',
      pill: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30',
      icon: 'pi-angle-down', dot: 'bg-sky-500'
    },
    none: {
      card: 'border-slate-200 dark:border-border-subtle hover:border-slate-300 dark:hover:border-slate-600',
      bar: 'bg-slate-400',
      pill: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:border-slate-500/30',
      icon: 'pi-minus', dot: 'bg-slate-400'
    }
  };
  const LEVELS = [{ key: 'high', value: 'High' }, { key: 'medium', value: 'Medium' }, { key: 'low', value: 'Low' }];
  const priorityKey = p => { const k = String(p || '').trim().toLowerCase(); return k === 'high' || k === 'medium' || k === 'low' ? k : 'none'; };
  const themeOf = t => THEME[priorityKey(t && t.priority)];
  const priorityLabel = p => p ? (T.priority[String(p).toLowerCase()] || p) : '';

  // Sunucu tarafı (TicketService) — sayfa yüklendiği sürece bellekte tutulur; modüller arası geçişte korunur
  let SERVER = null;
  function server() {
    if (!SERVER) {
      const src = (DCIM.data.tickets && DCIM.data.tickets.list) || [];
      SERVER = { rows: src.map(r => Object.assign({}, r)), pending: [] };
    }
    return SERVER;
  }
  function safeParse(v) {
    if (Array.isArray(v)) return v.slice();
    try { return typeof v === 'string' && v.trim() !== '' ? JSON.parse(v) : []; } catch (e) { return []; }
  }
  function appendServer(id, msg) {
    const row = server().rows.find(r => r.tck_id === id);
    if (!row) return null;
    const h = safeParse(row.chat_history);
    h.push(msg);
    row.chat_history = JSON.stringify(h);
    row.updated_at = msg.timestamp;
    return row;
  }
  // HIS_GetTickets çıktısı: chat_history JSON metni olarak döner
  function fetchRows() {
    const S = server();
    const now = Date.now();
    S.pending = S.pending.filter(p => {
      if (p.due > now) return true;
      const row = S.rows.find(r => r.tck_id === p.tck_id);
      if (row && row.status === 'OPEN') appendServer(p.tck_id, { sender_type: 'customer', sender_name: p.sender_name, message: p.message, timestamp: new Date(now).toISOString() });
      return false;
    });
    return S.rows.map(r => Object.assign({}, r));
  }

  // AppStatusBadgeComponent (active / processing / lost)
  const BADGE = {
    active: ['bg-emerald-500/10 text-emerald-700 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/50', 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]'],
    processing: ['bg-purple-500/10 text-purple-700 border-purple-300 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/50', 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]'],
    lost: ['bg-orange-500/10 text-orange-700 border-orange-300 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-500/50', 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]']
  };
  const badge = (status, label) => {
    const b = BADGE[status] || BADGE.lost;
    return '<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] text-[11px] font-bold tracking-wide border transition-all ' + b[0] + '">' +
      '<span class="w-1.5 h-1.5 rounded-full! animate-pulse ' + b[1] + '"></span>' + esc(label) + '</span>';
  };

  // Tarih: 'YYYY-MM-DD HH:mm:ss' (yerel) ve ISO metinlerini kabul eder
  const pad = n => String(n).padStart(2, '0');
  function parseTime(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(v));
    const d = m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  const fmt = (v, f) => {
    const d = parseTime(v);
    if (!d) return '';
    const D = pad(d.getDate()), M = pad(d.getMonth() + 1), Y = d.getFullYear(), h = pad(d.getHours()), mi = pad(d.getMinutes());
    if (f === 'date') return D + '.' + M + '.' + Y;
    if (f === 'time') return h + ':' + mi;
    if (f === 'short') return D + '.' + M + ' ' + h + ':' + mi;
    return D + '.' + M + '.' + Y + ' ' + h + ':' + mi;
  };
  const dayKey = v => { const d = parseTime(v); return d ? d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate() : ''; };
  const initials = name => {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toLocaleUpperCase('tr');
  };
  const messageCount = t => (t.chat_history || []).filter(m => m && m.sender_type !== 'system').length;
  const lastActivity = t => { const h = t.chat_history || []; return h.length ? (h[h.length - 1].timestamp || t.created_at) : t.created_at; };
  function isNewTicket(t) {
    if (t.status !== 'OPEN') return false;
    const h = t.chat_history || [];
    return !h.some(x => x.sender_type === 'admin');
  }
  function hasNewMessage(t) {
    if (t.status !== 'OPEN') return false;
    const h = t.chat_history || [];
    if (!h.some(x => x.sender_type === 'admin')) return false;
    const real = h.filter(x => x.sender_type !== 'system');
    return real.length > 0 && real[real.length - 1].sender_type === 'customer';
  }

  // Sınıf dizeleri (şablondan birebir)
  const SEG_ON = 'bg-white dark:bg-surface-card text-sky-700 dark:text-sky-300 shadow-xs';
  const SEG_OFF = 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200';
  const F_LABEL = 'block mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate';
  const F_INPUT = 'w-full h-8 px-2.5 text-xs font-medium rounded-[4px]! border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-surface-base text-slate-900 dark:text-slate-50 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500';
  const PG_BTN = 'w-7 h-7 border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer';
  const DAY_SEP = d => '<div class="self-center flex items-center gap-2 w-full text-[10.5px] font-semibold text-slate-400 dark:text-slate-500">' +
    '<span class="flex-1 h-px bg-slate-200 dark:bg-border-subtle"></span>' +
    '<span class="px-2.5 py-0.5 rounded-full! bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle tabular-nums">' + esc(fmt(d, 'date')) + '</span>' +
    '<span class="flex-1 h-px bg-slate-200 dark:bg-border-subtle"></span></div>';
  const EMPTY_FILTER = () => ({ tck_id: '', priority: '', customer_name: '', subject: '', email: '', created_at: '' });

  DCIM.engRegistry['ticket-management'] = {
    mount(el, params) {
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
        page_rng: 50,
        page_input: 1,
        filter_switch: 0,
        filterModel: EMPTY_FILTER(),
        searchQuery: params.get('q') || '',
        replyMessage: ''
      };
      const forceLost = params.get('conn') === 'lost';
      const timers = [];
      const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; };

      const FILTER_PARAMS = { id: 'tck_id', customer: 'customer_name', email: 'email', subject: 'subject', priority: 'priority', date: 'created_at' };
      Object.keys(FILTER_PARAMS).forEach(p => { if (params.get(p)) st.filterModel[FILTER_PARAMS[p]] = params.get(p); });
      if (params.get('filter') === '1' || ['id', 'customer', 'email', 'subject', 'date'].some(p => params.get(p))) st.filter_switch = 1;

      el.innerHTML =
        '<div class="flex flex-col flex-1 min-h-0 gap-3 overflow-hidden p-3 md:p-4">' +
          '<div data-header class="shrink-0"></div>' +
          // ---------------- LİSTE ----------------
          '<section data-list class="flex flex-col flex-1 min-h-0 gap-2.5">' +
            '<div class="shrink-0 flex flex-wrap items-center gap-2 p-2 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[6px] shadow-2xs">' +
              '<div data-tabs class="flex items-center p-0.5 bg-slate-100 dark:bg-surface-base rounded-[5px]! border border-slate-200 dark:border-border-subtle" role="tablist"></div>' +
              '<div class="relative flex-1 min-w-[160px] lg:max-w-xs">' +
                '<i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>' +
                '<input type="text" data-search autocomplete="off" value="' + esc(st.searchQuery) + '" placeholder="' + esc(T.search) + '" class="w-full h-9 pl-8 pr-8 text-xs font-medium bg-slate-50 dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[5px]! text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500">' +
                '<button type="button" data-act="search-clear" class="absolute right-0 top-0 h-9 w-8 flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-rose-500 cursor-pointer' + (st.searchQuery ? '' : ' hidden') + '" aria-label="' + esc(T.clear) + '"><i class="pi pi-times-circle text-xs"></i></button>' +
              '</div>' +
              '<div class="flex items-center gap-2 ml-auto">' +
                '<button type="button" data-act="filter" title="' + esc(T.toggleFilter) + '"></button>' +
                '<div data-report></div>' +
                '<button type="button" data-act="refresh" title="' + esc(T.refresh) + '" class="h-9 w-9 inline-flex items-center justify-center bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-[5px]! hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"><i data-refresh-icon class="pi pi-refresh text-xs"></i></button>' +
              '</div>' +
            '</div>' +
            '<div data-filter-panel class="shrink-0"></div>' +
            '<div data-chips class="shrink-0 flex items-center gap-1.5 overflow-x-auto pb-0.5" role="group"></div>' +
            '<div data-grid class="flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-1 px-1 pt-0.5 pb-1"></div>' +
            '<div data-pager class="shrink-0 py-1.5 px-3 border border-slate-200 dark:border-border-subtle rounded-[6px] flex flex-wrap items-center justify-between gap-2 text-xs bg-white dark:bg-surface-card shadow-2xs"></div>' +
          '</section>' +
          // ---------------- SOHBET / DETAY ----------------
          '<section data-detail class="hidden flex-col flex-1 min-h-0 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[8px] shadow-sm overflow-hidden"></section>' +
        '</div>';
      const $ = s => el.querySelector(s);
      const headerEl = $('[data-header]'), listEl = $('[data-list]'), detailEl = $('[data-detail]');

      // --- Rapor menüsü (app-report-export-menu: scopes OPEN/CLOSED, options dateRange, defaultPreset 30d) ---
      const reportMenu = DCIM.report.menu($('[data-report]'), {
        label: 'Rapor al',
        scopes: [
          { id: 'OPEN', label: 'Açık talepler', hint: 'Ekrandaki arama ve filtrelerle' },
          { id: 'CLOSED', label: 'Kapalı talepler', hint: 'Ekrandaki arama ve filtrelerle' }
        ],
        options: 'dateRange',
        defaultPreset: '30d',
        unit: 'talep',
        disabled: true,
        onExport: exportReport
      });

      function conClass() {
        if (st.queryError) return 'conE';
        if (st.isLoading) return 'con0';
        if (st.dataLoaded) return 'con1';
        return 'con0';
      }
      function renderHeader() {
        const c = conClass();
        headerEl.innerHTML = kit.pageHeader({
          title: T.title,
          compact: true,
          breadcrumbs: [{ label: T.monitoring }, { label: T.title }],
          actions: badge(c === 'con1' ? 'active' : c === 'con0' ? 'processing' : 'lost',
            c === 'con1' ? T.connection.connected : c === 'con0' ? T.connection.connecting : T.connection.disconnected)
        });
        const ico = $('[data-refresh-icon]');
        if (ico) ico.classList.toggle('pi-spin', st.isLoading);
      }

      // --- Süzgeçler ---
      function activeFilterCount() {
        return Object.keys(st.filterModel).filter(k => String(st.filterModel[k] || '').trim()).length;
      }
      function filterTickets(status) {
        let data = st.tickets.filter(t => String(t.status || '').trim() === status);
        const fm = st.filterModel;
        Object.keys(fm).forEach(k => {
          const v = String(fm[k] || '').trim().toLowerCase();
          if (!v) return;
          data = data.filter(t => String(t[k] || '').toLowerCase().includes(v));
        });
        const q = st.searchQuery.trim().toLocaleLowerCase('tr');
        if (q) data = data.filter(t => [t.tck_id, t.subject, t.customer_name, t.email].some(v => String(v == null ? '' : v).toLocaleLowerCase('tr').includes(q)));
        return data;
      }
      const filtered = () => filterTickets(st.activeTab);
      const tabCount = s => st.tickets.filter(t => String(t.status || '').trim() === s).length;
      const priorityCount = k => st.tickets.filter(t => String(t.status || '').trim() === st.activeTab && priorityKey(t.priority) === k).length;
      const totalPages = n => Math.ceil(n / st.page_rng);
      const resetPage = () => { st.page_ofs = 0; st.page_input = 1; };

      // --- Liste parçaları ---
      function renderTabs() {
        const tab = (id, icon, label) => {
          const on = st.activeTab === id;
          return '<button type="button" role="tab" data-act="tab" data-tab="' + id + '" aria-selected="' + on + '" class="h-8 px-3 flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold rounded-[4px]! transition-colors cursor-pointer whitespace-nowrap ' + (on ? SEG_ON : SEG_OFF) + '">' +
            '<i class="pi ' + icon + ' text-[11px]"></i><span>' + esc(label) + '</span>' +
            '<span class="min-w-[20px] h-[18px] px-1.5 inline-flex items-center justify-center rounded-full! text-[10px] font-bold tabular-nums ' + (on ? 'bg-sky-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300') + '">' + tabCount(id) + '</span></button>';
        };
        $('[data-tabs]').innerHTML = tab('OPEN', 'pi-inbox', T.tabs.open) + tab('CLOSED', 'pi-folder', T.tabs.closed);
        const fb = $('[data-act="filter"]');
        const on = st.filter_switch === 1;
        const n = activeFilterCount();
        fb.setAttribute('aria-expanded', String(on));
        fb.className = 'h-9 px-3 inline-flex items-center gap-1.5 text-xs font-semibold border rounded-[5px]! transition-colors cursor-pointer whitespace-nowrap ' +
          (on ? 'bg-sky-600 text-white border-sky-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700');
        fb.innerHTML = '<i class="pi pi-filter text-[11px]"></i><span>' + esc(T.filter) + '</span>' +
          (n ? '<span class="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full! text-[10px] font-bold tabular-nums ' + (on ? 'bg-white text-sky-700' : 'bg-sky-600 text-white') + '">' + n + '</span>' : '');
      }

      function renderFilterPanel() {
        const host = $('[data-filter-panel]');
        if (st.filter_switch !== 1) { host.innerHTML = ''; return; }
        const fm = st.filterModel;
        const n = activeFilterCount();
        const field = (label, ctl, span) => '<div class="min-w-0' + (span ? ' col-span-2 lg:col-span-1' : '') + '"><label class="' + F_LABEL + '">' + esc(label) + '</label>' + ctl + '</div>';
        const inp = (key, ph, type) => '<input type="' + (type || 'text') + '" autocomplete="off" data-filter="' + key + '" value="' + esc(fm[key]) + '"' + (type === 'date' ? ' title="' + esc(ph) + '"' : ' placeholder="' + esc(ph) + '"') + ' class="' + F_INPUT + '">';
        host.innerHTML =
          '<div class="rounded-[6px] border border-sky-200 dark:border-sky-500/30 bg-white dark:bg-surface-card shadow-xs animate-fade-in">' +
            '<div class="h-10 pl-3 pr-1.5 flex items-center gap-2.5 border-b border-slate-100 dark:border-border-subtle">' +
              '<span class="w-6 h-6 shrink-0 rounded-[4px] flex items-center justify-center bg-sky-50 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400"><i class="pi pi-filter text-[10px]"></i></span>' +
              '<span class="flex-1 min-w-0 flex items-center gap-2 text-[13px] font-bold text-slate-900 dark:text-slate-100">' + esc(T.filter) +
                (n ? '<span class="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full! bg-sky-600 text-white text-[10px] font-bold tabular-nums">' + n + '</span>' : '') + '</span>' +
              '<button type="button" data-act="filter-clear" class="h-8 px-2.5 flex items-center gap-1.5 text-xs font-semibold text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-500/10 rounded-[4px]! cursor-pointer"><i class="pi pi-filter-slash text-[11px]"></i><span>' + esc(T.clear) + '</span></button>' +
            '</div>' +
            '<div class="grid grid-cols-2 lg:grid-cols-6 gap-x-2.5 gap-y-2.5 p-3">' +
              field(T.headers.id, inp('tck_id', T.placeholders.id)) +
              field(T.headers.priority, '<select data-filter="priority" class="' + F_INPUT.replace('px-2.5', 'px-2') + '">' +
                '<option value="">' + esc(T.placeholders.priority) + '</option>' +
                LEVELS.map(l => '<option value="' + l.value + '"' + (fm.priority === l.value ? ' selected' : '') + '>' + esc(priorityLabel(l.value)) + '</option>').join('') + '</select>') +
              field(T.headers.customer, inp('customer_name', T.placeholders.customer), true) +
              field(T.headers.subject, inp('subject', T.placeholders.subject), true) +
              field(T.headers.email, inp('email', T.placeholders.email)) +
              field(T.headers.date, inp('created_at', T.placeholders.date, 'date')) +
            '</div>' +
          '</div>';
      }

      function renderChips() {
        const fm = st.filterModel;
        const all = !fm.priority;
        $('[data-chips]').innerHTML =
          '<span class="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 shrink-0 mr-1">' + esc(T.headers.priority) + '</span>' +
          '<button type="button" data-act="chip" data-val="" aria-pressed="' + all + '" class="shrink-0 h-7 pl-2.5 pr-2 inline-flex items-center gap-1.5 rounded-full! border text-xs font-semibold transition-colors cursor-pointer ' +
            (all ? 'bg-slate-800 text-white border-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100' : 'bg-white dark:bg-surface-card text-slate-600 dark:text-slate-300 border-slate-200 dark:border-border-subtle hover:border-slate-300 dark:hover:border-slate-600') + '">' +
            esc(T.placeholders.priority) + '<span class="min-w-[18px] px-1 rounded-full! text-[10px] font-bold tabular-nums bg-black/10 dark:bg-white/10">' + tabCount(st.activeTab) + '</span></button>' +
          LEVELS.map(lv => {
            const on = fm.priority === lv.value;
            const th = THEME[lv.key];
            return '<button type="button" data-act="chip" data-val="' + lv.value + '" aria-pressed="' + on + '" class="shrink-0 h-7 pl-2.5 pr-2 inline-flex items-center gap-1.5 rounded-full! border text-xs font-semibold transition-colors cursor-pointer ' +
              (on ? th.dot + ' text-white border-transparent' : th.pill + ' hover:brightness-95') + '">' +
              '<i class="pi ' + th.icon + ' text-[10px]"></i>' + esc(priorityLabel(lv.value)) +
              '<span class="min-w-[18px] px-1 rounded-full! text-[10px] font-bold tabular-nums ' + (on ? 'bg-white/25' : 'bg-white/70 dark:bg-black/20') + '">' + priorityCount(lv.key) + '</span></button>';
          }).join('');
      }

      function card(t) {
        const th = themeOf(t);
        const nt = isNewTicket(t), nm = hasNewMessage(t);
        const open = t.status === 'OPEN';
        return '<article class="relative flex flex-col min-w-0 rounded-[8px]! border bg-white dark:bg-surface-card shadow-xs hover:shadow-md transition-[box-shadow,border-color] duration-150 ' + th.card + ((nt || nm) ? ' ring-2 ring-sky-400/60 dark:ring-sky-400/40' : '') + '">' +
          '<span aria-hidden="true" class="absolute inset-x-0 top-0 h-1 rounded-t-[7px]! ' + th.bar + '"></span>' +
          '<header class="px-3 pt-3 pb-1.5 flex items-center justify-between gap-2">' +
            '<div class="flex items-center gap-1.5 min-w-0">' +
              '<span class="font-mono text-[12px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">#' + t.tck_id + '</span>' +
              '<span class="inline-flex items-center gap-1 h-5 px-1.5 text-[10px] font-bold uppercase tracking-wide rounded-[4px]! border ' + th.pill + '" title="' + esc(T.headers.priority) + '"><i class="pi ' + th.icon + ' text-[9px]"></i>' + esc(priorityLabel(t.priority) || '-') + '</span>' +
            '</div>' +
            '<span class="inline-flex items-center gap-1.5 shrink-0 h-5 px-2 rounded-full! text-[10px] font-bold uppercase tracking-wide ' + (open ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-700/50 dark:text-slate-400') + '">' +
              '<span class="w-1.5 h-1.5 rounded-full! ' + (open ? 'bg-emerald-500' : 'bg-slate-400') + '"></span>' + esc(open ? T.status.open : T.status.closed) + '</span>' +
          '</header>' +
          '<div class="px-3 flex-1 flex flex-col min-w-0">' +
            ((nt || nm) ? '<div class="mb-1.5 flex flex-wrap items-center gap-1">' +
              (nt ? '<span class="inline-flex items-center gap-1 h-5 px-1.5 text-[10px] font-bold rounded-[4px]! border bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25"><span class="w-1.5 h-1.5 rounded-full! bg-rose-500 animate-pulse"></span>' + esc(T.status.newTicket) + '</span>' : '') +
              (nm ? '<span class="inline-flex items-center gap-1 h-5 px-1.5 text-[10px] font-bold rounded-[4px]! border bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25"><span class="w-1.5 h-1.5 rounded-full! bg-amber-500 animate-pulse"></span>' + esc(T.status.newMessage) + '</span>' : '') +
            '</div>' : '') +
            '<h3 class="m-0 text-[13px] font-bold leading-snug text-slate-900 dark:text-slate-100 [overflow-wrap:anywhere]">' + esc(t.subject) + '</h3>' +
            '<p class="mt-1 mb-0 text-[11.5px] leading-[1.4] text-slate-600 dark:text-slate-400 [overflow-wrap:anywhere]">' + esc(t.description) + '</p>' +
            '<div class="mt-1.5 mb-2 flex items-center gap-1.5 min-w-0 text-[11px]" title="' + esc((t.customer_name || t.customer_id || '') + (t.email ? ' · ' + t.email : '')) + '">' +
              '<i class="pi pi-building text-[10px] shrink-0 text-sky-600 dark:text-sky-400"></i>' +
              '<span class="font-semibold text-sky-700 dark:text-sky-300 truncate shrink-0 max-w-[55%]">' + esc(t.customer_name || t.customer_id) + '</span>' +
              (t.email ? '<span class="text-slate-400 dark:text-slate-500 truncate">· ' + esc(t.email) + '</span>' : '') +
            '</div>' +
            '<div class="mt-auto pt-2 border-t border-dashed border-slate-200 dark:border-border-subtle flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">' +
              '<span class="inline-flex items-center gap-1 min-w-0" title="' + esc(T.headers.date) + '"><i class="pi pi-calendar text-[10px]"></i><span class="truncate">' + esc(fmt(t.created_at) || '-') + '</span></span>' +
              '<span class="inline-flex items-center gap-1 shrink-0" title="' + esc(T.detail.lastActivity) + '"><i class="pi pi-clock text-[10px]"></i>' + esc(fmt(lastActivity(t), 'short')) + '</span>' +
              '<span class="inline-flex items-center gap-1 shrink-0 font-semibold text-slate-600 dark:text-slate-300" title="' + esc(T.detail.messages) + '"><i class="pi pi-comments text-[10px]"></i>' + messageCount(t) + '</span>' +
            '</div>' +
          '</div>' +
          '<footer class="px-3 pt-2 pb-3 grid grid-cols-2 gap-2">' +
            '<button type="button" data-act="open" data-id="' + t.tck_id + '" class="h-8 min-w-0 inline-flex items-center justify-center gap-1.5 text-[12px] font-bold rounded-[5px]! transition-colors cursor-pointer bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white border-0"><i class="pi pi-comments text-[11px]"></i><span class="truncate">' + esc(T.actions.detail) + '</span></button>' +
            (open
              ? '<button type="button" data-act="close-row" data-id="' + t.tck_id + '" class="h-8 min-w-0 inline-flex items-center justify-center gap-1.5 text-[12px] font-bold rounded-[5px]! transition-colors cursor-pointer bg-white dark:bg-transparent text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/40 hover:bg-rose-600 hover:text-white hover:border-rose-600 dark:hover:bg-rose-600 dark:hover:text-white"><i class="pi pi-lock text-[11px]"></i><span class="truncate">' + esc(T.actions.close) + '</span></button>'
              : '<button type="button" data-act="reopen-row" data-id="' + t.tck_id + '" class="h-8 min-w-0 inline-flex items-center justify-center gap-1.5 text-[12px] font-bold rounded-[5px]! transition-colors cursor-pointer bg-white dark:bg-transparent text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/40 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 dark:hover:bg-emerald-600 dark:hover:text-white"><i class="pi pi-lock-open text-[11px]"></i><span class="truncate">' + esc(T.actions.reopen) + '</span></button>') +
          '</footer>' +
        '</article>';
      }

      function renderGrid() {
        const data = filtered();
        const pages = totalPages(data.length);
        if (st.page_ofs > 0 && st.page_ofs >= pages) { st.page_ofs = Math.max(0, pages - 1); st.page_input = st.page_ofs + 1; }
        const rows = data.slice(st.page_ofs * st.page_rng, st.page_ofs * st.page_rng + st.page_rng);
        const c = conClass();
        $('[data-grid]').innerHTML = rows.length
          ? '<div class="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] items-stretch gap-2.5 content-start">' + rows.map(card).join('') + '</div>'
          : '<div class="h-full min-h-40 px-6 flex flex-col items-center justify-center text-center text-[13px] text-slate-400 dark:text-slate-500 bg-white dark:bg-surface-card border border-dashed border-slate-300 dark:border-border-subtle rounded-[8px]!">' +
              '<span class="w-12 h-12 mb-3 rounded-full! flex items-center justify-center bg-slate-100 dark:bg-white/5"><i class="pi text-xl ' +
                (c === 'con0' ? 'pi-spin pi-spinner text-sky-600 dark:text-sky-400' : c === 'conE' ? 'pi-wifi text-rose-500' : 'pi-inbox') + '"></i></span>' +
              esc(c === 'conE' ? T.noData.noConnection : c === 'con0' ? T.noData.loading : T.noData.empty) +
            '</div>';
        // Sayfalama
        $('[data-pager]').innerHTML =
          '<div class="text-slate-500 dark:text-slate-400 font-medium">' + esc(T.totalRecords) + ': <span class="font-bold text-slate-900 dark:text-slate-100 tabular-nums">' + data.length + '</span></div>' +
          (pages > 0 ?
            '<div class="flex items-center gap-3">' +
              '<div class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><span>' + esc(T.perPage) + ':</span>' +
                '<select data-page-size class="h-7 bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 px-2 text-slate-800 dark:text-slate-200 text-xs font-bold focus:outline-none">' +
                  PAGE_SIZES.map(n => '<option value="' + n + '"' + (n === st.page_rng ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>' +
              '<div class="flex items-center gap-1">' +
                '<button type="button" data-act="first" title="' + esc(T.tooltips.firstPage) + '" class="' + PG_BTN + '"' + (st.page_ofs === 0 ? ' disabled' : '') + '><i class="pi pi-angle-double-left text-[10px]"></i></button>' +
                '<button type="button" data-act="prev" title="' + esc(T.tooltips.previous) + '" class="' + PG_BTN + '"' + (st.page_ofs === 0 ? ' disabled' : '') + '><i class="pi pi-chevron-left text-[10px]"></i></button>' +
                '<div class="flex items-center gap-1 text-slate-800 dark:text-slate-200 font-bold px-1">' +
                  '<input type="number" data-page-input min="1" max="' + pages + '" value="' + st.page_input + '" class="w-10 h-7 border border-slate-200 dark:border-slate-700 text-center bg-white dark:bg-surface-base text-xs focus:outline-none">' +
                  '<span class="text-slate-400 font-normal">/ ' + pages + '</span></div>' +
                '<button type="button" data-act="next" title="' + esc(T.tooltips.next) + '" class="' + PG_BTN + '"' + (st.page_ofs + 1 >= pages ? ' disabled' : '') + '><i class="pi pi-chevron-right text-[10px]"></i></button>' +
                '<button type="button" data-act="last" title="' + esc(T.tooltips.lastPage) + '" class="' + PG_BTN + '"' + (st.page_ofs + 1 >= pages ? ' disabled' : '') + '><i class="pi pi-angle-double-right text-[10px]"></i></button>' +
              '</div>' +
            '</div>' : '');
      }

      function renderList() {
        renderTabs();
        renderFilterPanel();
        renderChips();
        renderGrid();
      }

      // --- Sohbet / detay ---
      function bubbleHtml(m) {
        if (m.sender_type === 'system') {
          const closedEv = m.event === 'closed';
          return '<div class="self-center"><span class="inline-flex flex-wrap items-center justify-center gap-x-1.5 px-3 py-1 rounded-full! border text-[11px] font-semibold ' +
            (closedEv ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/25' : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/25') + '">' +
            '<i class="pi ' + (closedEv ? 'pi-lock' : 'pi-lock-open') + ' text-[10px]"></i>' + esc(closedEv ? T.detail.eventClosed : T.detail.eventReopened) +
            (m.sender_name ? '<span class="font-normal">· ' + esc(m.sender_name) + '</span>' : '') +
            '<span class="font-normal opacity-70 tabular-nums">· ' + esc(fmt(m.timestamp)) + '</span></span></div>';
        }
        const admin = m.sender_type === 'admin';
        return '<div class="flex items-end gap-2 max-w-[78%] ' + (admin ? 'self-end flex-row-reverse' : 'self-start') + '">' +
          '<span class="w-8 h-8 shrink-0 rounded-full! flex items-center justify-center text-[11px] font-bold ' + (admin ? 'bg-sky-600 text-white' : 'bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-200') + '">' + esc(initials(m.sender_name)) + '</span>' +
          '<div class="min-w-0 flex flex-col ' + (admin ? 'items-end' : 'items-start') + '">' +
            '<div class="mb-1 px-1 flex items-center gap-2 text-[10.5px] text-slate-500 dark:text-slate-400">' +
              '<span class="font-semibold truncate ' + (admin ? 'text-sky-700 dark:text-sky-300' : 'text-slate-700 dark:text-slate-300') + '">' + esc(m.sender_name) + '</span>' +
              '<span class="tabular-nums shrink-0">' + esc(fmt(m.timestamp, 'time')) + '</span></div>' +
            '<div class="px-3.5 py-2.5 shadow-xs ' + (admin ? 'rounded-[14px] rounded-br-[4px] bg-sky-600 text-white' : 'rounded-[14px] rounded-bl-[4px] bg-white dark:bg-surface-card text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-border-subtle') + '">' +
              '<p class="m-0 text-[13px] leading-relaxed whitespace-pre-wrap break-words">' + esc(m.message) + '</p></div>' +
          '</div></div>';
      }

      function chatHtml(t) {
        const th = themeOf(t);
        const who = t.customer_name || t.customer_id;
        const hist = t.chat_history || [];
        let prev = t.created_at;
        return DAY_SEP(t.created_at) +
          '<div class="self-start flex items-end gap-2 max-w-[78%]">' +
            '<span class="w-8 h-8 shrink-0 rounded-full! flex items-center justify-center text-[11px] font-bold bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-200">' + esc(initials(who)) + '</span>' +
            '<div class="min-w-0 flex flex-col items-start">' +
              '<div class="mb-1 px-1 flex items-center gap-2 text-[10.5px] text-slate-500 dark:text-slate-400"><span class="font-semibold text-slate-700 dark:text-slate-300 truncate">' + esc(who) + '</span>' +
                '<span class="shrink-0">· ' + esc(T.detail.customer) + '</span><span class="tabular-nums shrink-0">' + esc(fmt(t.created_at, 'time')) + '</span></div>' +
              '<div class="px-3.5 py-2.5 rounded-[14px] rounded-bl-[4px] bg-white dark:bg-surface-card text-slate-800 dark:text-slate-100 border shadow-xs ' + th.card + '">' +
                '<div class="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">' + esc(T.detail.description) + '</div>' +
                '<p class="m-0 text-[13px] leading-relaxed whitespace-pre-wrap break-words">' + esc(t.description) + '</p></div>' +
            '</div></div>' +
          hist.map(m => {
            const sep = dayKey(prev) !== dayKey(m.timestamp) ? DAY_SEP(m.timestamp) : '';
            prev = m.timestamp;
            return sep + bubbleHtml(m);
          }).join('') +
          (!hist.length ? '<div class="self-center mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full! bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle text-[11px] font-semibold text-slate-400 dark:text-slate-500"><i class="pi pi-hourglass text-[10px]"></i>' + esc(T.detail.noReply) + '</div>' : '');
      }

      function infoHtml(t) {
        const th = themeOf(t);
        const open = t.status === 'OPEN';
        const who = t.customer_name || t.customer_id;
        const row = (k, v, cls) => '<dt class="text-slate-500 dark:text-slate-400">' + esc(k) + '</dt><dd class="m-0 text-right ' + (cls || 'tabular-nums text-slate-800 dark:text-slate-200') + '">' + v + '</dd>';
        return '<div class="flex items-center gap-2.5 min-w-0">' +
            '<span class="w-10 h-10 shrink-0 rounded-full! flex items-center justify-center text-[12px] font-bold bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200">' + esc(initials(who)) + '</span>' +
            '<div class="min-w-0 leading-tight"><div class="text-[13px] font-bold text-slate-900 dark:text-slate-100 truncate" title="' + esc(who) + '">' + esc(who) + '</div>' +
            '<div class="text-[11.5px] text-slate-500 dark:text-slate-400 truncate" title="' + esc(t.email || '') + '">' + esc(t.email || '-') + '</div></div></div>' +
          '<dl class="m-0 pt-3 border-t border-slate-100 dark:border-border-subtle grid grid-cols-[auto_1fr] gap-x-3 gap-y-2.5 text-xs">' +
            row(T.headers.id, '#' + t.tck_id, 'font-mono font-bold text-slate-900 dark:text-slate-100') +
            row(T.headers.status, esc(open ? T.status.open : T.status.closed), 'font-semibold ' + (open ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500')) +
            row(T.headers.priority, '<span class="inline-flex items-center gap-1 h-5 px-1.5 rounded-[4px] border text-[10px] font-bold uppercase ' + th.pill + '"><i class="pi ' + th.icon + ' text-[9px]"></i>' + esc(priorityLabel(t.priority) || '-') + '</span>', ' ') +
            row(T.headers.date, esc(fmt(t.created_at) || '-')) +
            row(T.detail.lastActivity, esc(fmt(lastActivity(t)) || '-')) +
            row(T.detail.messages, String(messageCount(t)), 'font-bold tabular-nums text-slate-900 dark:text-slate-100') +
          '</dl>' +
          '<div class="pt-3 border-t border-slate-100 dark:border-border-subtle">' +
            '<div class="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">' + esc(T.detail.description) + '</div>' +
            '<p class="m-0 text-xs leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">' + esc(t.description) + '</p></div>';
      }

      function sendBtnHtml() {
        const dis = st.isSending || !st.replyMessage.trim();
        return '<button type="button" data-act="send"' + (dis ? ' disabled' : '') + ' aria-label="' + esc(T.detail.send) + '" class="h-9 px-4 shrink-0 inline-flex items-center justify-center gap-1.5 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white text-xs font-bold rounded-[7px]! transition-colors cursor-pointer disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed">' +
          '<i class="pi text-xs ' + (st.isSending ? 'pi-spin pi-spinner' : 'pi-send') + '"></i><span>' + esc(st.isSending ? T.detail.sending : T.detail.send) + '</span></button>';
      }

      function renderDetail() {
        const t = st.selected;
        const th = themeOf(t);
        const open = t.status === 'OPEN';
        detailEl.innerHTML =
          '<span aria-hidden="true" class="h-1 shrink-0 ' + th.bar + '"></span>' +
          '<div class="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-slate-200 dark:border-border-subtle">' +
            '<button type="button" data-act="back" title="' + esc(T.actions.back) + '" aria-label="' + esc(T.actions.back) + '" class="w-9 h-9 shrink-0 flex items-center justify-center rounded-full! text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"><i class="pi pi-arrow-left text-sm"></i></button>' +
            '<span class="w-10 h-10 shrink-0 rounded-[8px] flex items-center justify-center border ' + th.pill + '"><i class="pi pi-ticket text-base"></i></span>' +
            '<div class="min-w-0 flex-1">' +
              '<h3 class="m-0 text-[15px] font-bold leading-tight text-slate-900 dark:text-slate-100 truncate" title="' + esc(t.subject) + '"><span class="font-mono text-slate-400 dark:text-slate-500">#' + t.tck_id + '</span> ' + esc(t.subject) + '</h3>' +
              '<div class="mt-1 flex items-center gap-1.5 flex-wrap text-[11px] min-w-0">' +
                '<span class="inline-flex items-center gap-1.5 h-5 px-2 rounded-full! font-bold uppercase tracking-wide ' + (open ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-700/50 dark:text-slate-400') + '">' +
                  '<span class="w-1.5 h-1.5 rounded-full! ' + (open ? 'bg-emerald-500' : 'bg-slate-400') + '"></span>' + esc(open ? T.status.open : T.status.closed) + '</span>' +
                (t.priority ? '<span class="inline-flex items-center gap-1 h-5 px-1.5 rounded-[4px] border font-bold uppercase tracking-wide ' + th.pill + '"><i class="pi ' + th.icon + ' text-[9px]"></i>' + esc(priorityLabel(t.priority)) + '</span>' : '') +
                '<span class="text-slate-500 dark:text-slate-400 truncate min-w-0">· ' + esc(t.customer_name || t.customer_id) + '</span>' +
              '</div>' +
            '</div>' +
            (open
              ? '<button type="button" data-act="close-detail" class="shrink-0 h-9 px-3.5 inline-flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white text-xs font-bold rounded-[5px]! transition-colors cursor-pointer"><i class="pi pi-lock text-[11px]"></i><span>' + esc(T.actions.closeTicket) + '</span></button>'
              : '<button type="button" data-act="reopen-detail" class="shrink-0 h-9 px-3.5 inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold rounded-[5px]! transition-colors cursor-pointer"><i class="pi pi-lock-open text-[11px]"></i><span>' + esc(T.actions.reopenTicket) + '</span></button>') +
          '</div>' +
          '<div class="flex-1 min-h-0 flex">' +
            '<div class="flex-1 min-w-0 flex flex-col">' +
              '<div data-chat class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 bg-slate-50 dark:bg-surface-base flex flex-col gap-3">' + chatHtml(t) + '</div>' +
              (open
                ? '<div class="shrink-0 px-4 py-3 border-t border-slate-200 dark:border-border-subtle bg-white dark:bg-surface-card">' +
                    '<div class="flex items-end gap-2 p-1.5 pl-3 rounded-[10px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-surface-base focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-500/20 transition-shadow">' +
                      '<textarea data-reply rows="3" maxlength="200" placeholder="' + esc(T.detail.placeholder) + '" aria-label="' + esc(T.detail.sendReply) + '" class="flex-1 min-w-0 py-1.5 bg-transparent border-0 text-[13px] leading-snug text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none resize-none max-h-32 overflow-y-auto"' + (st.isSending ? ' disabled' : '') + '>' + esc(st.replyMessage) + '</textarea>' +
                      '<span data-limit class="self-center shrink-0 text-[10px] font-bold text-rose-500 tabular-nums' + (st.replyMessage.length >= 200 ? '' : ' hidden') + '">200/200</span>' +
                      '<span data-send class="contents">' + sendBtnHtml() + '</span>' +
                    '</div></div>'
                : '<div class="shrink-0 px-4 py-3 border-t border-slate-200 dark:border-border-subtle bg-white dark:bg-surface-card flex items-center justify-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400"><i class="pi pi-lock text-[12px] text-rose-500"></i><span>' + esc(T.detail.closedNotice) + '</span></div>') +
            '</div>' +
            '<aside class="max-xl:hidden w-72 shrink-0 border-l border-slate-200 dark:border-border-subtle flex flex-col min-h-0 bg-white dark:bg-surface-card">' +
              '<div class="shrink-0 px-4 h-11 flex items-center gap-2 border-b border-slate-100 dark:border-border-subtle text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"><i class="pi pi-info-circle text-[11px]"></i>' + esc(T.detail.info) + '</div>' +
              '<div data-info class="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">' + infoHtml(t) + '</div>' +
            '</aside>' +
          '</div>';
        scrollToBottom();
      }
      function refreshChat() {
        const c = detailEl.querySelector('[data-chat]');
        if (c && st.selected) c.innerHTML = chatHtml(st.selected);
        const i = detailEl.querySelector('[data-info]');
        if (i && st.selected) i.innerHTML = infoHtml(st.selected);
      }
      function refreshSendBtn() {
        const s = detailEl.querySelector('[data-send]');
        if (s) s.innerHTML = sendBtnHtml();
        const l = detailEl.querySelector('[data-limit]');
        if (l) l.classList.toggle('hidden', st.replyMessage.length < 200);
      }
      function scrollToBottom() {
        later(() => { const c = detailEl.querySelector('[data-chat]'); if (c) c.scrollTop = c.scrollHeight; }, 60);
      }

      function render() {
        renderHeader();
        reportMenu.update({ disabled: !st.dataLoaded });
        const det = !!st.selected;
        listEl.classList.toggle('hidden', det);
        listEl.classList.toggle('flex', !det);
        detailEl.classList.toggle('hidden', !det);
        detailEl.classList.toggle('flex', det);
        if (det) renderDetail();
        else renderList();
      }

      // =====================================================================
      // Veri yükleme (TicketService simülasyonu)
      // =====================================================================
      const normalize = rows => rows.map(r => Object.assign(r, { chat_history: safeParse(r.chat_history) }));

      function loadTickets() {
        st.isLoading = true;
        st.queryError = false;
        render();
        later(() => {
          if (forceLost) {
            toast(T.alerts.loadError, 'error', T.alerts.error);
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
        if (forceLost || !st.dataLoaded) return;
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
            const grew = (upd.chat_history || []).length > (sel.chat_history || []).length;
            sel.chat_history = upd.chat_history;
            sel.status = upd.status;
            st.tickets[st.tickets.indexOf(upd)] = sel;
            if (grew) { refreshChat(); scrollToBottom(); }
          }
          return;
        }
        if (changed) renderList();
      }

      let firstLoadDone = false;
      function afterFirstLoad() {
        if (firstLoadDone || !st.dataLoaded) return;
        firstLoadDone = true;
        const find = k => { const id = parseInt(params.get(k), 10); return id ? st.tickets.find(x => x.tck_id === id) : null; };
        const o = find('open');
        if (o) { if (o.status !== st.activeTab) st.activeTab = o.status; openTicket(o); }
        const c = find('close');
        if (c && c.status === 'OPEN') askClose(c);
        const r = find('reopen');
        if (r && r.status === 'CLOSED') { st.activeTab = 'CLOSED'; render(); askReopen(r); }
        if (params.get('report') === '1') later(() => { const b = el.querySelector('[data-report] button'); if (b) b.click(); }, 50);
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
        const newMsg = { sender_type: 'admin', sender_name: adminName, message: st.replyMessage, timestamp: new Date().toISOString() };
        st.isSending = true;
        refreshSendBtn();
        const ta = detailEl.querySelector('[data-reply]');
        if (ta) ta.disabled = true;
        later(() => {
          // HIS_AddTicketReply(tck_id, JSON.stringify(newMsg))
          const row = appendServer(t.tck_id, newMsg);
          const fu = DCIM.data.tickets.followUps && DCIM.data.tickets.followUps[t.tck_id];
          if (row && fu && !row._followUpQueued) {
            row._followUpQueued = true;
            server().pending.push({ tck_id: t.tck_id, due: Date.now() + FOLLOW_UP_MS, sender_name: fu.sender_name, message: fu.message });
          }
          t.chat_history = (t.chat_history || []).concat([newMsg]);
          st.replyMessage = '';
          st.isSending = false;
          toast(T.alerts.replySuccess, 'success', T.alerts.success);
          if (st.selected === t) {
            refreshChat();
            const area = detailEl.querySelector('[data-reply]');
            if (area) { area.disabled = false; area.value = ''; area.focus(); }
            refreshSendBtn();
            scrollToBottom();
          }
        }, SEND_MS);
      }

      // Durum değişikliği + durum olayı (logStatusEvent)
      function setStatus(t, status) {
        const ev = { sender_type: 'system', event: status === 'CLOSED' ? 'closed' : 'reopened', sender_name: adminName, message: '', timestamp: new Date().toISOString() };
        const row = server().rows.find(r => r.tck_id === t.tck_id);
        if (row) row.status = status;
        appendServer(t.tck_id, ev);
        t.status = status;
        t.chat_history = (t.chat_history || []).concat([ev]);
      }

      let modal = null;
      function confirmBox(m, variant, onOk) {
        if (modal) modal.close();
        modal = dialog({
          onClose() { modal = null; },
          title: m.title,
          variant,
          confirmLabel: m.confirm,
          cancelLabel: m.cancel,
          body: '<div class="space-y-2"><p class="font-bold text-slate-800 dark:text-slate-200">' + esc(m.confirmText) + '</p>' +
            '<p class="text-slate-500 dark:text-slate-400">' + esc(m.warningText) + '</p></div>',
          onConfirm: onOk
        });
      }
      function askClose(t) {
        confirmBox(T.closeModal, 'danger', () => {
          setStatus(t, 'CLOSED');
          toast(T.alerts.closeSuccess, 'success', T.alerts.success);
          render();
        });
      }
      function askReopen(t) {
        confirmBox(T.reopenModal, 'confirm', () => {
          setStatus(t, 'OPEN');
          toast(T.alerts.reopenSuccess, 'success', T.alerts.success);
          render();
        });
      }

      // --- Rapor (exportReport): seçilen sekmenin arama + filtre uygulanmış talepleri, oluşturulma tarih aralığı ---
      function exportReport(req) {
        const status = req.scope === 'CLOSED' ? 'CLOSED' : 'OPEN';
        const rows = DCIM.report.applyRange(filterTickets(status).map(t => Object.assign({}, t, { _ts: parseTime(t.created_at) })), req, '_ts');
        const scopeLabel = status === 'CLOSED' ? 'Kapalı talepler' : 'Açık talepler';
        const hdr = { tck_id: T.headers.id, priority: T.headers.priority, customer_name: T.headers.customer, subject: T.headers.subject, email: T.headers.email, created_at: T.headers.date };
        const filters = [st.searchQuery.trim() ? 'arama "' + st.searchQuery.trim() + '"' : '']
          .concat(Object.keys(st.filterModel).filter(k => String(st.filterModel[k] || '').trim())
            .map(k => hdr[k] + ': ' + (k === 'priority' ? priorityLabel(st.filterModel[k]) : String(st.filterModel[k]).trim())))
          .filter(Boolean);
        const count = k => rows.filter(t => priorityKey(t.priority) === k).length;
        const toneOf = t => { const k = priorityKey(t.priority); return k === 'high' ? 'alarm' : k === 'medium' ? 'warning' : k === 'low' ? 'info' : 'normal'; };
        const rangeTxt = req.from && req.to ? fmt(req.from) + ' – ' + fmt(req.to) : 'tüm zamanlar';
        DCIM.report.generate({
          title: 'Destek Talepleri Raporu',
          subtitle: [scopeLabel, filters.length ? 'Filtre: ' + filters.join(', ') : ''].filter(Boolean).join(' · ') + ' · Talepler · oluşturulma ' + rangeTxt + ' · ' + rows.length + ' talep',
          filename: status === 'CLOSED' ? 'Kapali_Talepler' : 'Acik_Talepler',
          kpis: [
            { label: 'Talep', value: rows.length },
            { label: T.priority.high, value: count('high'), tone: count('high') ? 'alarm' : 'normal' },
            { label: T.priority.medium, value: count('medium'), tone: count('medium') ? 'warning' : 'normal' },
            { label: T.priority.low, value: count('low'), tone: 'info' }
          ],
          sections: [{
            title: scopeLabel,
            toneKey: 'tone',
            columns: [
              { key: 'no', label: 'No', align: 'right' }, { key: 'pri', label: T.headers.priority }, { key: 'sta', label: 'Durum' },
              { key: 'subject', label: T.headers.subject }, { key: 'description', label: 'Açıklama' }, { key: 'customer', label: T.headers.customer },
              { key: 'email', label: T.headers.email }, { key: 'created', label: T.headers.date }, { key: 'last', label: T.detail.lastActivity },
              { key: 'msgs', label: T.detail.messages, align: 'right' }
            ],
            rows: rows.map(t => ({
              no: t.tck_id, pri: priorityLabel(t.priority) || '-', sta: t.status === 'OPEN' ? T.status.open : T.status.closed,
              subject: t.subject, description: t.description, customer: t.customer_name || t.customer_id, email: t.email,
              created: fmt(t.created_at) || '-', last: fmt(lastActivity(t)) || '-', msgs: messageCount(t), tone: toneOf(t)
            }))
          }],
          notes: ['Tarih aralığı talebin oluşturulma zamanına uygulanır.']
        }, req.format);
      }

      // --- Olay delegasyonu ---
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-act]');
        if (!b || b.disabled || !el.contains(b)) return;
        const act = b.getAttribute('data-act');
        const id = parseInt(b.getAttribute('data-id'), 10);
        const find = () => st.tickets.find(x => x.tck_id === id);
        const pages = totalPages(filtered().length);
        switch (act) {
          case 'tab': st.activeTab = b.getAttribute('data-tab'); resetPage(); renderList(); break;
          case 'filter':
            st.filter_switch = st.filter_switch === 1 ? 0 : 1;
            if (st.filter_switch === 0) { st.filterModel = EMPTY_FILTER(); resetPage(); }
            renderList();
            break;
          case 'filter-clear': st.filterModel = EMPTY_FILTER(); resetPage(); renderList(); break;
          case 'chip': {
            const v = b.getAttribute('data-val');
            st.filterModel.priority = v && st.filterModel.priority !== v ? v : '';
            resetPage(); renderList();
            break;
          }
          case 'search-clear': {
            st.searchQuery = '';
            const i = $('[data-search]'); i.value = ''; b.classList.add('hidden');
            resetPage(); renderGrid();
            break;
          }
          case 'refresh': loadTickets(); break;
          case 'open': { const t = find(); if (t) openTicket(t); break; }
          case 'close-row': { const t = find(); if (t) askClose(t); break; }
          case 'reopen-row': { const t = find(); if (t) askReopen(t); break; }
          case 'close-detail': if (st.selected) askClose(st.selected); break;
          case 'reopen-detail': if (st.selected) askReopen(st.selected); break;
          case 'back': backToList(); break;
          case 'send': sendReply(); break;
          case 'first': resetPage(); renderGrid(); break;
          case 'prev': if (st.page_ofs > 0) { st.page_ofs--; st.page_input = st.page_ofs + 1; } renderGrid(); break;
          case 'next': if (st.page_ofs + 1 < pages) { st.page_ofs++; st.page_input = st.page_ofs + 1; } renderGrid(); break;
          case 'last': if (pages > 0) { st.page_ofs = pages - 1; st.page_input = pages; } renderGrid(); break;
        }
      });

      el.addEventListener('input', e => {
        const t = e.target;
        if (t.hasAttribute('data-search')) {
          st.searchQuery = t.value;
          $('[data-act="search-clear"]').classList.toggle('hidden', !t.value);
          resetPage(); renderGrid();
          return;
        }
        const f = t.getAttribute('data-filter');
        if (f && f !== 'priority' && f !== 'created_at') {
          st.filterModel[f] = t.value;
          resetPage(); renderTabs(); renderChips(); renderGrid();
          return;
        }
        if (t.hasAttribute('data-reply')) {
          st.replyMessage = t.value;
          refreshSendBtn();
        }
      });

      el.addEventListener('change', e => {
        const t = e.target;
        const f = t.getAttribute('data-filter');
        if (t.hasAttribute('data-page-size')) {
          st.page_rng = Math.min(999, Math.max(1, parseInt(t.value, 10) || 50));
          resetPage(); renderGrid();
        } else if (t.hasAttribute('data-page-input')) {
          pageInputSubmit(t);
        } else if (f === 'priority' || f === 'created_at') {
          st.filterModel[f] = t.value;
          resetPage(); renderList();
        }
      });

      function pageInputSubmit(input) {
        const pages = totalPages(filtered().length);
        let target = parseInt(input.value, 10) || 1;
        if (target < 1) target = 1;
        if (target > pages) target = pages;
        st.page_ofs = Math.max(0, target - 1);
        st.page_input = target;
        renderGrid();
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
          if (modal) modal.close();
          reportMenu.destroy();
        }
      };
    }
  };
})();
