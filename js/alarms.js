/* ==========================================================================
   DCIM Sunum — Alarmlar (NewUICMPActiveAlarmsComponent + NewUICMPHistoricalAlarmsComponent)
   app-data-table (AppDataTableComponent) davranışının vanilla JS karşılığı:
   arama, hızlı filtre, kolon içi filtreler, sıralama, sayfalama (varsayılan 50), kolon görünürlüğü.
   - Başlık: Filtre · Kat ("Tüm Katlar") · Gruplar (yalnız aktif) · Analitik · karşı sayfa (mavi) · Rapor
   - Gruplar seçici: grup gizle / "Yalnız" / "Varsayılanım yap" (localStorage); Sistem (GRP_SYSTEM) varsayılan gizli
   - Toplu Gördüm: sayfada listelenen görülmemiş alarmlar, isteğe bağlı not; Analitik'te "Görülmemiş Alarm" oranı
   - Seviye: Acil (mor) / Alarm / Uyarı / Veri Alınamıyor / Normal (kalktı, onay bekliyor)
   - Tarihsel: Olay sütunu (Alarm / Normale döndü / Görüldü) ve Bakım sütunu (Bakım Aç → form; Bakımı Gör →
     maintenance.html?tab=alarm&open=<id>). Kayıtlar sessionStorage 'dcim_alarm_maint_v1'
     ([{id, alarmRid, desc, target, opened, note, status}] + alarmId) — Bakım sayfası okur.
   Derin bağlantılar: ?tab=history, ?filter=acil|alarm|alarm_up|uyarı|kayıp, ?floor=T00|T02|T03, ?q=<metin>
   Veri: js/mock/alarms.data.js (DCIM.data.alarmsPage)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, fmtDateTime, fmtDateKey, button, dialog, toast } = DCIM.ui;
  const params = new URLSearchParams(window.location.search);
  DCIM.shell.init({ active: params.get('tab') === 'history' ? 'history' : 'alarms' });

  const PAGE = DCIM.data.alarmsPage;
  const ACTIVE = PAGE.active;
  const HISTORY = PAGE.history;
  const GROUPS = PAGE.groups;
  const FLOORS = DCIM.data.floors || [];

  // ---------------------------------------------------------------------------
  // Sözlükler (messages.tr.json alarms.* / alarmSev.* / alarmFnc.* anahtarları)
  // ---------------------------------------------------------------------------
  const SUMMARY = {
    onllo: 'Alt Eşik Değeri Geçildi',
    onlhi: 'Üst Eşik Değeri Geçildi',
    onequ: 'Değer Değişti',
    devsta: 'Cihaz Haberleşme Durumu Değişti',
    bista: 'Veri Okunamıyor',
    onlvl: 'Alarm Durumu Kalktı',
    door: 'Kapak Durumu Değişti'
  };
  const ENGINE_SUMMARY = { xdbsta: 'Doküman Sağlık Alarmı', consta: 'Bağlantı Sağlık Alarmı', thrsta: 'Thread Sağlık Alarmı', devsta_nbi: 'Cihaz Bağlantı Hatası' };
  function summaryOf(a) {
    const f = String(a.fnc || '');
    const eng = Object.keys(ENGINE_SUMMARY).find(k => f === k || f.indexOf(k + '_') === 0);
    if (eng) return ENGINE_SUMMARY[eng];
    return SUMMARY[f] || f || 'Tanımsız';
  }
  const LEVEL_LABEL = { acil: 'Acil', alarm: 'Alarm', uyari: 'Uyarı', kayip: 'Veri Alınamıyor', normal: 'Normal' };
  // status-badge lvl-* sınıfları (Acil mor)
  const LEVEL_CLS = {
    acil: 'bg-purple-600/15 text-purple-700 border-purple-400 dark:bg-purple-500/25 dark:text-purple-200 dark:border-purple-400/70',
    alarm: 'bg-rose-500/10 text-rose-600 border-rose-300 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/50',
    uyari: 'bg-amber-500/10 text-amber-700 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/50',
    kayip: 'bg-orange-500/10 text-orange-700 border-orange-300 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-500/50',
    normal: 'bg-emerald-500/10 text-emerald-700 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/50'
  };
  const LEVEL_DOT = {
    acil: 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]', alarm: 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]',
    uyari: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]', kayip: 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]',
    normal: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
  };
  const levelBadge = l => '<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] text-[11px] font-bold tracking-wide border transition-all ' + (LEVEL_CLS[l] || LEVEL_CLS.normal) + '">' +
    '<span class="w-1.5 h-1.5 rounded-full animate-pulse ' + (LEVEL_DOT[l] || LEVEL_DOT.normal) + '"></span>' + esc(LEVEL_LABEL[l] || l) + '</span>';
  const EVENT_LABEL = { raise: 'Alarm', rtn: 'Normale döndü', ack: 'Görüldü' };
  const groupOf = code => GROUPS.find(g => g.code === code) || { code, name: code || 'Diğer', color: '#94a3b8' };
  const floorName = a => { const f = FLOORS.find(x => x.id === a.flr); return f ? f.label : ''; };
  const placeText = a => [a.cab, a.pod].filter(Boolean).join(' · ') || a.loc || '';
  const isNew = a => !a.ack;
  const ackText = a => a.ack ? a.ack.user + ' tarafından ' + fmtDateTime(a.ack.tim).slice(0, 16) + ' tarihinde görüldü.' : 'Yeni';

  // ---------------------------------------------------------------------------
  // Durum
  // ---------------------------------------------------------------------------
  const QUICK = [
    { label: '-Tümü-', value: 'all' },
    { label: 'Acil', value: 'acil' },
    { label: 'Alarm', value: 'alarm' },
    { label: 'Alarm ve Acil', value: 'alarm_up' },
    { label: 'Uyarı', value: 'uyarı' },
    { label: 'Veri Alınamıyor', value: 'kayıp' }
  ];
  const QUICK_LEVELS = { acil: ['acil'], alarm: ['alarm'], alarm_up: ['alarm', 'acil'], 'uyarı': ['uyari'], 'kayıp': ['kayip'] };

  const state = {
    tab: params.get('tab') === 'history' ? 'history' : 'active',
    search: params.get('q') || '',
    quick: 'all',
    floor: FLOORS.some(f => f.id === params.get('floor')) ? params.get('floor') : '',
    hiddenGroups: new Set(),
    filters: {},
    sortField: 'createdTime',
    sortOrder: -1,
    page: 1,
    pageSize: 50,
    showFilters: false,
    showAnalytics: true,
    hiddenCols: {},
    ridPin: '',
    grpOpen: false
  };
  const qf = (params.get('filter') || '').toLocaleLowerCase('tr-TR');
  const QF_ALIAS = { uyari: 'uyarı', kayip: 'kayıp', 'uyarı': 'uyarı', 'kayıp': 'kayıp', acil: 'acil', alarm: 'alarm', alarm_up: 'alarm_up' };
  if (QF_ALIAS[qf]) state.quick = QF_ALIAS[qf];

  // Grup varsayılanı: kişisel (localStorage, kullanıcıya göre) yoksa saha varsayılanı (hide="1": Sistem)
  const grpStoreKey = () => 'aymon_alarm_hidden_groups_' + (((DCIM.session && DCIM.session.user()) || {}).usr || '');
  function savedHiddenGroups() {
    try { const v = JSON.parse(localStorage.getItem(grpStoreKey()) || 'null'); return Array.isArray(v) ? v.map(String) : null; } catch (e) { return null; }
  }
  const defaultHiddenGroups = () => new Set(savedHiddenGroups() || GROUPS.filter(g => g.hidden).map(g => g.code));
  state.hiddenGroups = defaultHiddenGroups();

  const COLUMNS = {
    active: [
      { field: 'siraNo', header: 'Sıra No', width: '50px', wrap: false, filterable: false },
      { field: 'createdTime', header: 'Alarm Oluşma Zamanı', sortable: true, width: '155px', wrap: false },
      { field: 'source', header: 'Alarm Kaynağı', sortable: true, minWidth: '220px' },
      { field: 'floor', header: 'Kat', sortable: true, filterable: false, width: '130px' },
      { field: 'summary', header: 'Alarm Özeti', minWidth: '180px' },
      { field: 'group', header: 'Alarm Grubu', filterable: false, width: '120px' },
      { field: 'detail', header: 'Alarm Detayı', minWidth: '180px' },
      { field: 'ackStatus', header: 'Onay Durumu', width: '110px' },
      { field: 'level', header: 'Alarm Seviyesi', sortable: true, width: '130px', wrap: false }
    ],
    history: [
      { field: 'siraNo', header: 'Sıra No', width: '50px', wrap: false, filterable: false },
      { field: 'createdTime', header: 'Alarm Oluşma Zamanı', sortable: true, width: '155px', wrap: false },
      { field: 'source', header: 'Alarm Kaynağı', sortable: true, minWidth: '220px' },
      { field: 'floor', header: 'Kat', filterable: false, width: '110px' },
      { field: 'summary', header: 'Alarm Özeti', minWidth: '180px' },
      { field: 'group', header: 'Alarm Grubu', width: '120px' },
      { field: 'detail', header: 'Alarm Detayı', minWidth: '180px' },
      { field: 'event', header: 'Olay', filterable: false, width: '120px', wrap: false },
      { field: 'level', header: 'Alarm Seviyesi', sortable: true, width: '130px', wrap: false },
      { field: 'maint', header: 'Bakım', sortable: false, filterable: false, width: '150px', wrap: false }
    ]
  };
  const cols = () => COLUMNS[state.tab].filter(c => !state.hiddenCols[c.field]);
  const sourceList = () => (state.tab === 'active' ? ACTIVE : HISTORY);

  // ---------------------------------------------------------------------------
  // Filtreleme / sıralama
  // ---------------------------------------------------------------------------
  let grpHiddenCount = 0;
  function filtered() {
    const f = state.filters;
    const q = state.search.trim().toLocaleLowerCase('tr-TR');
    let list = sourceList().slice();

    if (state.floor) list = list.filter(a => a.flr === state.floor);
    if (state.tab === 'history' && state.ridPin) list = list.filter(a => a.rid === state.ridPin);
    if (QUICK_LEVELS[state.quick]) list = list.filter(a => QUICK_LEVELS[state.quick].indexOf(a.level) >= 0);
    if (q) {
      list = list.filter(a => [a.rid, a.desc, a.cab, a.pod, a.loc, floorName(a), a.txt, summaryOf(a), groupOf(a.grp).name, LEVEL_LABEL[a.level]]
        .some(v => String(v || '').toLocaleLowerCase('tr-TR').indexOf(q) >= 0));
    }
    if (f.dateFrom) list = list.filter(a => fmtDateKey(a.tim) >= f.dateFrom);
    if (f.dateTo) list = list.filter(a => fmtDateKey(a.tim) <= f.dateTo);
    if (f.source) {
      const s = f.source.toLocaleLowerCase('tr-TR');
      list = list.filter(a => (a.desc + ' ' + a.rid).toLocaleLowerCase('tr-TR').indexOf(s) >= 0);
    }
    if (f.fnc) list = list.filter(a => a.fnc === f.fnc || String(a.fnc).indexOf(f.fnc + '_') === 0);
    if (f.grp) list = list.filter(a => a.grp === f.grp);
    if (f.detail) {
      const s = f.detail.toLocaleLowerCase('tr-TR');
      list = list.filter(a => (a.txt || '').toLocaleLowerCase('tr-TR').indexOf(s) >= 0);
    }
    if (f.ack === 'NEW') list = list.filter(isNew);
    else if (f.ack === 'ACKED') list = list.filter(a => !isNew(a));
    if (f.level) {
      const lv = { acil: ['acil'], alarm: ['alarm'], alarm_up: ['alarm', 'acil'], uyari: ['uyari'], kayip: ['kayip'], normal: ['normal'] }[f.level] || [f.level];
      list = list.filter(a => lv.indexOf(a.level) >= 0);
    }
    // Grup süzgeci en sonda (yalnız aktif): gizlenen sayı, diğer süzgeçler açıkken görünecek olanlardan sayılır
    grpHiddenCount = 0;
    if (state.tab === 'active' && state.hiddenGroups.size) {
      const before = list.length;
      list = list.filter(a => !state.hiddenGroups.has(a.grp));
      grpHiddenCount = before - list.length;
    }

    const LVL_ORDER = { acil: 4, alarm: 3, kayip: 2, uyari: 1, normal: 0 };
    const key = a => {
      switch (state.sortField) {
        case 'createdTime': return a.tim.getTime();
        case 'source': return a.desc;
        case 'floor': return floorName(a);
        case 'level': return LVL_ORDER[a.level] || 0;
        default: return 0;
      }
    };
    list.sort((a, b) => {
      const ka = key(a), kb = key(b);
      if (ka < kb) return -1 * state.sortOrder;
      if (ka > kb) return 1 * state.sortOrder;
      return b.tim - a.tim;
    });
    return list;
  }

  // ---------------------------------------------------------------------------
  // Başlık (app-page-header) + grup seçici
  // ---------------------------------------------------------------------------
  let reportMenu = null;
  function groupDist() {
    // Grafik ve seçici tüm aktif alarmları sayar (gösterge panosu ve 2D sayaçları gibi)
    const list = state.tab === 'active' ? ACTIVE : HISTORY.filter(a => a.event === 'raise');
    const total = list.length || 1;
    const counts = {};
    list.forEach(a => { counts[a.grp] = (counts[a.grp] || 0) + 1; });
    const codes = GROUPS.map(g => g.code);
    Object.keys(counts).forEach(c => { if (codes.indexOf(c) < 0) codes.push(c); });
    return codes.map(c => ({ code: c, name: groupOf(c).name, color: groupOf(c).color, count: counts[c] || 0, pct: Math.round(((counts[c] || 0) / total) * 100) }));
  }
  function grpLabel() {
    const all = groupDist();
    const shown = all.filter(r => !state.hiddenGroups.has(r.code));
    if (shown.length === all.length) return '-Tümü-';
    if (shown.length === 1) return shown[0].name;
    return shown.length + '/' + all.length;
  }
  const hiddenGroupNames = () => groupDist().filter(r => state.hiddenGroups.has(r.code)).map(r => r.name).join(', ');

  function renderHeader() {
    const isActive = state.tab === 'active';
    document.getElementById('page-title').textContent = isActive ? 'ANLIK ALARMLAR' : 'DCIM ALARM RAPORU';
    document.getElementById('crumb-last').textContent = isActive ? 'Alarmlar' : 'Tarihsel Alarmlar';

    const actions = document.getElementById('header-actions');
    if (reportMenu) { reportMenu.destroy(); reportMenu = null; }
    actions.innerHTML =
      button({ variant: state.showFilters ? 'primary' : 'secondary', icon: 'pi pi-filter', label: 'Filtre', attrs: 'data-act="filter"' }) +
      (FLOORS.length > 1 ? '<select data-floor aria-label="Kat" class="h-8 px-2 text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-surface-card text-slate-700 dark:text-slate-200 rounded-[2px]">' +
        '<option value="">Tüm Katlar</option>' + FLOORS.map(f => '<option value="' + f.id + '"' + (state.floor === f.id ? ' selected' : '') + '>' + esc(f.label) + '</option>').join('') + '</select>' : '') +
      (isActive ? '<div class="relative" data-grp-wrap></div>' : '') +
      button({ variant: state.showAnalytics ? 'primary' : 'secondary', icon: 'pi pi-chart-pie', label: 'Analitik', attrs: 'data-act="analytics"' }) +
      button({ variant: 'primary', icon: isActive ? 'pi pi-history' : 'pi pi-bell', label: isActive ? 'Tarihsel Alarmlar' : 'Aktif Alarmlar', attrs: 'data-act="switch"' }) +
      '<div data-report></div>';
    actions.querySelector('[data-act="filter"]').onclick = () => { state.showFilters = !state.showFilters; renderHeader(); renderHead(); };
    actions.querySelector('[data-act="analytics"]').onclick = () => { state.showAnalytics = !state.showAnalytics; renderHeader(); renderAnalytics(); };
    actions.querySelector('[data-act="switch"]').onclick = () => switchTab(isActive ? 'history' : 'active');
    const fl = actions.querySelector('[data-floor]');
    if (fl) fl.addEventListener('change', () => { state.floor = fl.value; state.page = 1; renderBody(); renderGrpNote(); });
    if (isActive) renderGroupPicker();
    reportMenu = DCIM.report.menu(actions.querySelector('[data-report]'), {
      scopes: [{ id: 'list', label: 'Filtrelenmiş liste', hint: 'Ekrandaki arama ve filtrelerle' }],
      formats: ['pdf', 'xlsx', 'csv'],
      options: 'dateRange',
      unit: 'alarm',
      disabled: !sourceList().length,
      onExport: exportReport
    });
  }

  function renderGroupPicker() {
    const wrap = document.querySelector('#header-actions [data-grp-wrap]');
    if (!wrap) return;
    const rows = groupDist();
    const personal = savedHiddenGroups() !== null;
    wrap.innerHTML =
      '<button type="button" data-grp-btn aria-expanded="' + state.grpOpen + '" title="Alarm grupları" class="h-8 px-2 flex items-center gap-1.5 text-xs font-semibold border rounded-[2px] cursor-pointer ' +
        (state.hiddenGroups.size ? 'border-sky-500/60 bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300' : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-surface-card text-slate-700 dark:text-slate-200') + '">' +
        '<i class="pi pi-tags text-[11px]"></i><span class="truncate">Gruplar: ' + esc(grpLabel()) + '</span><i class="pi pi-chevron-down text-[9px] ml-auto"></i></button>' +
      (state.grpOpen ?
        '<div class="fixed inset-0 z-[60]" data-grp-backdrop></div>' +
        '<div role="dialog" aria-label="Alarm grupları" class="absolute right-0 top-full mt-1 z-[61] w-72 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl text-xs">' +
          '<div class="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-800">' +
            '<span class="font-extrabold text-slate-900 dark:text-slate-100">Alarm grupları</span>' +
            '<div class="flex items-center gap-2">' +
              '<button type="button" data-grp-all class="font-semibold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer">-Tümü-</button>' +
              '<button type="button" data-grp-reset class="font-semibold text-slate-500 dark:text-slate-400 hover:underline cursor-pointer">Varsayılana dön</button>' +
            '</div>' +
          '</div>' +
          '<div class="max-h-72 overflow-y-auto py-1">' +
            rows.map(r =>
              '<div class="group flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">' +
                '<label class="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">' +
                  '<input type="checkbox" data-grp-toggle="' + esc(r.code) + '" class="accent-sky-600 shrink-0"' + (state.hiddenGroups.has(r.code) ? '' : ' checked') + ' />' +
                  '<span class="w-2 h-2 rounded-full shrink-0" style="background-color:' + r.color + '"></span>' +
                  '<span class="truncate font-medium text-slate-800 dark:text-slate-200">' + esc(r.name) + '</span>' +
                  (groupOf(r.code).hidden ? '<span class="shrink-0 px-1 text-[9px] font-semibold rounded-[2px] bg-slate-100 dark:bg-surface-base text-slate-500 dark:text-slate-400">varsayılan gizli</span>' : '') +
                '</label>' +
                '<span class="font-mono text-slate-500 dark:text-slate-400 shrink-0">' + r.count + '</span>' +
                '<button type="button" data-grp-only="' + esc(r.code) + '" class="shrink-0 font-semibold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer lg:invisible lg:group-hover:visible">Yalnız</button>' +
              '</div>').join('') +
          '</div>' +
          '<div class="flex items-center justify-between gap-2 px-3 py-2 border-t border-slate-200 dark:border-slate-800">' +
            '<button type="button" data-grp-save class="font-semibold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"><i class="pi pi-bookmark text-[10px] mr-1"></i>Varsayılanım yap</button>' +
            (personal ? '<button type="button" data-grp-clear class="font-semibold text-slate-500 dark:text-slate-400 hover:underline cursor-pointer">Kişisel varsayılanı sil</button>' : '') +
          '</div>' +
        '</div>' : '');
    const setHidden = codes => { state.hiddenGroups = new Set(codes); state.page = 1; renderGroupPicker(); renderBody(); renderGrpNote(); };
    wrap.querySelector('[data-grp-btn]').addEventListener('click', () => { state.grpOpen = !state.grpOpen; renderGroupPicker(); });
    if (!state.grpOpen) return;
    wrap.querySelector('[data-grp-backdrop]').addEventListener('click', () => { state.grpOpen = false; renderGroupPicker(); });
    wrap.querySelectorAll('[data-grp-toggle]').forEach(chk => chk.addEventListener('change', () => {
      const next = new Set(state.hiddenGroups), c = chk.getAttribute('data-grp-toggle');
      if (next.has(c)) next.delete(c); else next.add(c);
      setHidden(next);
    }));
    wrap.querySelectorAll('[data-grp-only]').forEach(b => b.addEventListener('click', () => setHidden(rows.map(r => r.code).filter(c => c !== b.getAttribute('data-grp-only')))));
    wrap.querySelector('[data-grp-all]').addEventListener('click', () => setHidden([]));
    wrap.querySelector('[data-grp-reset]').addEventListener('click', () => setHidden(defaultHiddenGroups()));
    wrap.querySelector('[data-grp-save]').addEventListener('click', () => {
      try { localStorage.setItem(grpStoreKey(), JSON.stringify(Array.from(state.hiddenGroups))); toast('Grup seçimi varsayılanınız olarak kaydedildi', 'success'); } catch (e) { /* depolama kapalı */ }
      renderGroupPicker();
    });
    const clr = wrap.querySelector('[data-grp-clear]');
    if (clr) clr.addEventListener('click', () => { try { localStorage.removeItem(grpStoreKey()); } catch (e) { /* yok say */ } setHidden(defaultHiddenGroups()); });
  }

  function renderGrpNote() {
    const el = document.getElementById('grp-note');
    if (state.tab !== 'active' || grpHiddenCount <= 0) { el.className = 'hidden'; el.innerHTML = ''; return; }
    el.className = 'shrink-0 flex items-center gap-2 px-3 py-1 text-[11px] rounded-[2px] border border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-surface-card text-slate-600 dark:text-slate-300';
    el.innerHTML = '<i class="pi pi-eye-slash text-[11px] text-slate-400"></i>' +
      '<span class="min-w-0 truncate">' + grpHiddenCount + ' alarm gizli gruplarda: ' + esc(hiddenGroupNames()) + '</span>' +
      '<button type="button" data-show-all class="ml-auto shrink-0 font-semibold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer">Tümünü göster</button>';
    el.querySelector('[data-show-all]').addEventListener('click', () => { state.hiddenGroups = new Set(); state.page = 1; renderGroupPicker(); renderBody(); renderGrpNote(); });
  }

  // ---------------------------------------------------------------------------
  // Tablo (app-data-table)
  // ---------------------------------------------------------------------------
  const inputCls = 'w-full px-1.5 py-0.5 text-[11px] bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500';
  const selectCls = 'w-full px-1 py-0.5 text-[11px] bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500';
  const opt = (v, l, cur) => '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + l + '</option>';

  function filterCell(col) {
    const f = state.filters;
    const hist = state.tab === 'history';
    switch (col.field) {
      case 'createdTime':
        return '<div class="flex flex-col gap-0.5">' +
          '<input type="date" data-f="dateFrom" value="' + esc(f.dateFrom || '') + '" class="w-full px-1 py-0.5 text-[10px] bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500" aria-label="Başlangıç Tarihi" />' +
          '<input type="date" data-f="dateTo" value="' + esc(f.dateTo || '') + '" class="w-full px-1 py-0.5 text-[10px] bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500" aria-label="Bitiş Tarihi" /></div>';
      case 'source':
        return '<input type="text" data-f="source" value="' + esc(f.source || '') + '" placeholder="' + (hist ? 'Kaynak / Tanım' : 'Kaynak Ara...') + '" class="' + inputCls + '" />';
      case 'summary':
        return '<select data-f="fnc" class="' + selectCls + '">' + opt('', '-Tümü-', f.fnc || '') +
          opt('onllo', hist ? 'Alt Eşik Değeri Geçildi' : 'Alt Limit', f.fnc) + opt('onlhi', hist ? 'Üst Eşik Değeri Geçildi' : 'Üst Limit', f.fnc) +
          opt('onlvl', hist ? 'Alarm Durumu Kalktı' : 'Seviye', f.fnc) + opt('devsta', hist ? 'Bağlantı Alarmı' : 'Cihaz Durumu', f.fnc) +
          opt('consta', 'Bağlantı Sağlığı', f.fnc) + opt('xdbsta', 'Doküman Sağlığı', f.fnc) + opt('thrsta', 'Thread Sağlığı', f.fnc) + '</select>';
      case 'group':
        return '<select data-f="grp" class="' + selectCls + '">' + opt('', '-Tümü-', f.grp || '') + GROUPS.map(g => opt(g.code, g.name, f.grp)).join('') + '</select>';
      case 'detail':
        return '<input type="text" data-f="detail" value="' + esc(f.detail || '') + '" placeholder="' + (hist ? 'Detay' : 'Detay Ara...') + '" class="' + inputCls + '" />';
      case 'ackStatus':
        return '<select data-f="ack" class="' + selectCls + '">' + opt('', '-Tümü-', f.ack || '') + opt('NEW', 'Görülmedi', f.ack) + opt('ACKED', 'Görüldü', f.ack) + '</select>';
      case 'level':
        return '<select data-f="level" class="w-full min-w-0 px-1 py-0.5 text-[11px] bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500">' +
          opt('', '-Tümü-', f.level || '') + opt('acil', 'Acil', f.level) + opt('alarm', 'Alarm', f.level) + opt('alarm_up', 'Alarm ve Acil', f.level) +
          opt('uyari', 'Uyarı', f.level) + opt('kayip', hist ? 'Veri Alınamıyor' : 'Veri Hatası', f.level) + opt('normal', 'Normal', f.level) + '</select>';
      default:
        return '';
    }
  }

  // Tarihsel alarmdan bakım (sessionStorage; Bakım sayfasıyla ortak)
  const MAINT_KEY = 'dcim_alarm_maint_v1';
  function maintList() { try { const v = JSON.parse(sessionStorage.getItem(MAINT_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function maintSave(list) { try { sessionStorage.setItem(MAINT_KEY, JSON.stringify(list)); } catch (e) { /* depolama kapalı */ } }
  const maintOf = a => maintList().find(m => m.alarmId === a.id) || null;

  function maintCell(a) {
    if (a.event !== 'raise') {
      const why = a.event === 'ack' || a.event === 'rtn' ? 'Onay ya da normale dönüş satırından bakım açılamaz; alarmın oluşma satırını kullanın.' : 'Bu satır bir alarm oluşumuna güvenilir biçimde bağlanamıyor.';
      return '<div class="flex items-center justify-center"><span class="text-slate-400 text-xs cursor-help" title="' + esc(why) + '">–</span></div>';
    }
    const m = maintOf(a);
    if (m) {
      return '<div class="flex items-center justify-center"><a href="maintenance.html?tab=alarm&open=' + encodeURIComponent(m.id) + '" data-mnt-view title="' + esc(/^(done|completed|tamamland)/i.test(String(m.status || '')) ? 'Bu alarmdan açılan bakım tamamlanmış.' : m.id) + '" class="inline-flex items-center justify-center font-bold tracking-tight rounded-[2px] transition-all px-2 py-1 text-[11px] gap-1 bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:border-slate-700">' +
        '<i class="pi pi-external-link text-current shrink-0"></i><span>Bakımı Gör</span></a></div>';
    }
    return '<div class="flex items-center justify-center">' + button({ variant: 'primary', size: 'sm', icon: 'pi pi-wrench', label: 'Bakım Aç', attrs: 'data-mnt-open="' + esc(a.id) + '"' }) + '</div>';
  }

  function cell(col, a, idx) {
    switch (col.field) {
      case 'siraNo':
        return '<span class="cell-nowrap">' + idx + '</span>';
      case 'createdTime':
        return '<span class="cell-nowrap font-mono">' + fmtDateTime(a.tim) + '</span>';
      case 'source':
        if (state.tab === 'active') {
          return '<div class="flex items-center gap-1.5 min-w-0 py-0.5"><span class="font-bold text-slate-900 dark:text-slate-100 break-words leading-tight" style="overflow-wrap: break-word;" title="' + esc(a.desc) + '">' + esc(a.desc) + '</span>' +
            '<button type="button" data-history="' + esc(a.id) + '" title="Son Kayıtlar" class="p-1 rounded text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 transition-colors cursor-pointer shrink-0"><i class="pi pi-eye text-xs"></i></button></div>';
        }
        return '<div class="flex items-center gap-1.5 min-w-0 py-0.5"><span class="font-bold text-slate-900 dark:text-slate-100 break-words leading-tight" style="overflow-wrap: break-word;" title="' + esc(a.desc) + '">' + esc(a.desc) + '</span>' +
          '<button type="button" data-pin="' + esc(a.rid) + '" title="Sadece bu kaynağı göster / Kaldır" class="p-1 rounded transition-colors cursor-pointer shrink-0 ' + (state.ridPin === a.rid ? 'text-amber-500 bg-amber-500/10' : 'text-slate-400 hover:text-sky-400 hover:bg-sky-500/10') + '">' +
          '<i class="' + (state.ridPin === a.rid ? 'pi pi-filter-slash' : 'pi pi-filter') + ' text-xs"></i></button></div>';
      case 'floor': {
        const fl = floorName(a) || '-';
        if (state.tab === 'history') return '<span class="cell-wrap">' + esc(fl) + '</span>';
        const pl = placeText(a);
        return '<div class="flex flex-col min-w-0 py-0.5 leading-tight" title="' + esc([fl, pl].filter(Boolean).join(' · ')) + '"><span class="text-slate-900 dark:text-slate-100 font-medium">' + esc(fl) + '</span>' +
          (pl ? '<span class="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">' + esc(pl) + '</span>' : '') + '</div>';
      }
      case 'summary':
        return '<span class="cell-wrap">' + esc(summaryOf(a)) + '</span>';
      case 'group':
        return '<span class="cell-wrap">' + esc(groupOf(a.grp).name) + '</span>';
      case 'detail':
        return '<span class="cell-wrap" title="' + esc(a.txt) + '">' + esc(a.txt) + '</span>';
      case 'ackStatus':
        if (isNew(a)) {
          return '<button type="button" data-ack="' + esc(a.id) + '" class="px-2.5 py-1 bg-sky-600/20 hover:bg-sky-600 text-sky-300 hover:text-white font-semibold text-xs rounded border border-sky-500/30 transition-all flex items-center gap-1 cursor-pointer -ml-1.5"><i class="pi pi-check"></i><span>Gördüm</span></button>';
        }
        return '<span class="text-xs text-emerald-400 font-medium flex items-center gap-1 -ml-1.5" title="' + esc(a.ack.note || '') + '"><i class="pi pi-check-circle"></i><span class="cell-wrap">' + esc(ackText(a)) + '</span></span>';
      case 'event':
        return '<span class="cell-nowrap">' + esc(EVENT_LABEL[a.event] || '') + '</span>';
      case 'level':
        return '<div class="inline-flex items-center min-w-0">' + levelBadge(a.level) + '</div>';
      case 'maint':
        return maintCell(a);
      default:
        return '';
    }
  }

  const styleOf = c => (c.width ? 'width:' + c.width + ';' : '') + ((c.minWidth || c.width) ? 'min-width:' + (c.minWidth || c.width) + ';' : '');

  function renderTableShell() {
    const host = document.getElementById('alarm-table');
    host.innerHTML =
      '<div class="p-2.5 px-3 border-b border-slate-200 dark:border-border-subtle flex flex-wrap items-center justify-between gap-2.5 bg-slate-50 dark:bg-surface-base shrink-0">' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<div class="relative w-60 sm:w-72">' +
            '<i class="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>' +
            '<input type="text" data-search placeholder="Ara" value="' + esc(state.search) + '" class="w-full pl-8 pr-3 py-1 text-xs bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500" />' +
          '</div>' +
          '<div class="flex flex-wrap items-center gap-1" data-quick>' +
            QUICK.map(q => '<button type="button" data-q="' + q.value + '" class="px-2 py-1 text-[11px] rounded-[2px] border transition-all cursor-pointer">' + q.label + '</button>').join('') +
          '</div>' +
          '<span data-chips class="flex items-center gap-1"></span>' +
        '</div>' +
        '<div class="flex items-center gap-1.5 shrink-0">' +
          '<span class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shrink-0" title="Online"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span><span>Online</span></span>' +
          '<span data-table-actions class="contents"></span>' +
          '<div class="relative">' +
            '<button type="button" data-colmenu class="px-2.5 py-1 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1 cursor-pointer"><i class="pi pi-sliders-h text-xs"></i><span>Kolonlar</span></button>' +
            '<div data-colmenu-panel class="hidden absolute right-0 mt-1 w-44 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 p-2 text-xs space-y-1"></div>' +
          '</div>' +
          '<button type="button" data-refresh class="p-1.5 text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2px] transition-colors cursor-pointer" title="Yenile"><i class="pi pi-refresh text-xs"></i></button>' +
        '</div>' +
      '</div>' +
      '<div class="flex-1 min-h-0 overflow-y-auto overflow-x-auto w-full custom-scrollbar" data-scroll>' +
        '<table class="scada-table w-full text-left border-collapse text-xs">' +
          '<thead class="sticky top-0 z-10 shadow-2xs" data-thead></thead>' +
          '<tbody class="divide-y divide-slate-100 dark:divide-border-subtle text-xs text-slate-800 dark:text-slate-200" data-tbody></tbody>' +
        '</table>' +
      '</div>' +
      '<div class="py-2 px-3 border-t border-slate-200 dark:border-[#1b263b] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs bg-slate-50 dark:bg-[#0b121e] shrink-0" data-footer></div>';

    let searchTimer = null;
    host.querySelector('[data-search]').addEventListener('input', e => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.search = e.target.value; state.page = 1; renderBody(); renderGrpNote(); }, 120);
    });
    host.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => { state.quick = b.getAttribute('data-q'); state.page = 1; renderQuick(); renderBody(); renderGrpNote(); }));
    const colBtn = host.querySelector('[data-colmenu]');
    const colPanel = host.querySelector('[data-colmenu-panel]');
    colBtn.addEventListener('click', e => { e.stopPropagation(); colPanel.classList.toggle('hidden'); renderColMenu(); });
    colPanel.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', () => colPanel.classList.add('hidden'));
    host.querySelector('[data-refresh]').addEventListener('click', () => {
      const icon = host.querySelector('[data-refresh] i');
      icon.className = 'pi pi-spin pi-spinner text-xs';
      setTimeout(() => { icon.className = 'pi pi-refresh text-xs'; renderAll(); toast('Alarm listesi CMA/S00 kaynağından yenilendi.', 'success'); }, 600);
    });

    host.querySelector('[data-tbody]').addEventListener('click', e => {
      const ackBtn = e.target.closest('[data-ack]');
      const histBtn = e.target.closest('[data-history]');
      const pinBtn = e.target.closest('[data-pin]');
      const mntBtn = e.target.closest('[data-mnt-open]');
      if (ackBtn) { e.stopPropagation(); openAck(ackBtn.getAttribute('data-ack')); return; }
      if (histBtn) { e.stopPropagation(); openHistory(histBtn.getAttribute('data-history')); return; }
      if (mntBtn) { e.stopPropagation(); openMaintenance(mntBtn.getAttribute('data-mnt-open')); return; }
      if (pinBtn) { e.stopPropagation(); const rid = pinBtn.getAttribute('data-pin'); state.ridPin = state.ridPin === rid ? '' : rid; state.page = 1; renderBody(); renderChips(); }
    });
  }

  function renderQuick() {
    document.querySelectorAll('#alarm-table [data-q]').forEach(b => {
      const on = b.getAttribute('data-q') === state.quick;
      b.className = 'px-2 py-1 text-[11px] rounded-[2px] border transition-all cursor-pointer ' +
        (on ? 'bg-sky-600 text-white font-bold border-sky-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700');
    });
  }

  function renderChips() {
    const host = document.querySelector('#alarm-table [data-chips]');
    const chips = state.ridPin ? [{ key: 'rid', label: 'Kaynak: ' + state.ridPin }] : [];
    host.innerHTML = chips.map(c =>
      '<span class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">' + esc(c.label) +
      '<button type="button" data-chip="' + c.key + '" class="hover:text-rose-500 cursor-pointer"><i class="pi pi-times text-[8px]"></i></button></span>'
    ).join('');
    host.querySelectorAll('[data-chip]').forEach(b => b.addEventListener('click', () => { state.ridPin = ''; state.page = 1; renderChips(); renderBody(); }));
  }

  // Toplu Gördüm (table-actions): yalnız bu sayfada listelenen, görülmemiş alarmlar
  function renderTableActions() {
    const host = document.querySelector('#alarm-table [data-table-actions]');
    if (state.tab !== 'active') { host.innerHTML = ''; return; }
    const n = pageUnseen().length;
    host.innerHTML = '<button type="button" data-bulk-ack' + (n ? '' : ' disabled') + ' title="Sayfadaki görülmemiş alarmları onayla" class="px-2.5 py-1 text-xs font-semibold rounded-[2px] border flex items-center gap-1 transition-all cursor-pointer bg-sky-600 hover:bg-sky-700 text-white border-sky-600 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-sky-600">' +
      '<i class="pi pi-check-square text-xs"></i><span>Toplu Gördüm</span><span class="font-mono">(' + n + ')</span></button>';
    host.querySelector('[data-bulk-ack]').addEventListener('click', openBulkAck);
  }

  function renderColMenu() {
    const panel = document.querySelector('#alarm-table [data-colmenu-panel]');
    panel.innerHTML = '<span class="font-bold text-slate-400 text-[10px] uppercase block mb-1">Kolonlar</span>' +
      COLUMNS[state.tab].map(c =>
        '<label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 p-1 rounded cursor-pointer">' +
        '<input type="checkbox" data-col="' + c.field + '"' + (state.hiddenCols[c.field] ? '' : ' checked') + ' class="rounded text-sky-600 focus:ring-sky-500" /><span>' + esc(c.header) + '</span></label>'
      ).join('');
    panel.querySelectorAll('[data-col]').forEach(chk => chk.addEventListener('change', () => {
      state.hiddenCols[chk.getAttribute('data-col')] = !chk.checked;
      renderHead();
      renderBody();
    }));
  }

  function renderHead() {
    const thead = document.querySelector('#alarm-table [data-thead]');
    const cs = cols();
    let html = '<tr class="bg-slate-100 dark:bg-surface-base text-slate-800 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-border-subtle select-none">' +
      cs.map(c =>
        '<th data-sort="' + (c.sortable ? c.field : '') + '" class="py-2 px-2 text-left font-bold ' + (c.sortable ? 'cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800 ' : '') + 'transition-colors bg-slate-100 dark:bg-surface-base text-[11px] whitespace-nowrap" style="' + styleOf(c) + '" title="' + esc(c.header) + '">' +
          '<div class="flex items-center gap-1 min-w-0"><span>' + esc(c.header) + '</span>' +
          (state.sortField === c.field ? '<i class="' + (state.sortOrder === 1 ? 'pi pi-sort-amount-up' : 'pi pi-sort-amount-down') + ' text-[10px] text-sky-600 dark:text-sky-400 shrink-0"></i>' : '') +
          '</div></th>'
      ).join('') + '</tr>';
    if (state.showFilters) {
      html += '<tr class="bg-slate-50 dark:bg-[#0b121e] border-b border-slate-200 dark:border-slate-800">' +
        cs.map((c, i) => '<th class="py-1 px-1.5 bg-slate-50 dark:bg-[#0b121e] font-normal" style="' + styleOf(c) + '">' +
          (i === 0 ? '<button type="button" data-clear-filters title="Temizle" class="text-slate-400 hover:text-rose-500 text-[10px] p-0.5 transition-colors cursor-pointer"><i class="pi pi-filter-slash"></i></button>' : (c.filterable === false ? '' : filterCell(c))) + '</th>').join('') +
        '</tr>';
    }
    thead.innerHTML = html;

    thead.querySelectorAll('[data-sort]').forEach(th => th.addEventListener('click', () => {
      const f = th.getAttribute('data-sort');
      if (!f) return;
      if (state.sortField === f) state.sortOrder *= -1; else { state.sortField = f; state.sortOrder = 1; }
      renderHead();
      renderBody();
    }));
    thead.querySelectorAll('[data-f]').forEach(inp => {
      const ev = inp.tagName === 'SELECT' || inp.type === 'date' ? 'change' : 'input';
      inp.addEventListener(ev, () => { state.filters[inp.getAttribute('data-f')] = inp.value; state.page = 1; renderBody(); renderGrpNote(); });
    });
    const clr = thead.querySelector('[data-clear-filters]');
    if (clr) clr.addEventListener('click', () => {
      state.filters = {}; state.search = ''; state.quick = 'all'; state.ridPin = ''; state.page = 1;
      document.querySelector('#alarm-table [data-search]').value = '';
      renderAll();
    });
  }

  let lastFiltered = [];
  function currentPageRows() {
    const start = (state.page - 1) * state.pageSize;
    return lastFiltered.slice(start, start + state.pageSize);
  }
  const pageUnseen = () => (state.tab === 'active' ? currentPageRows().filter(isNew) : []);

  function renderBody() {
    lastFiltered = filtered();
    const totalPages = Math.max(1, Math.ceil(lastFiltered.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const rows = currentPageRows();
    const cs = cols();
    const tbody = document.querySelector('#alarm-table [data-tbody]');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="' + cs.length + '" class="p-8 text-center text-slate-400 dark:text-slate-500"><i class="pi pi-inbox text-2xl mb-1 block opacity-40"></i><span class="italic">Veri bulunamadı</span></td></tr>';
    } else {
      const start = (state.page - 1) * state.pageSize;
      tbody.innerHTML = rows.map((a, i) =>
        '<tr data-row="' + esc(a.id) + '" class="hover:bg-slate-50 dark:hover:bg-surface-base transition-colors">' +
          cs.map(c => '<td class="py-1.5 px-2 text-[11px] ' + (c.wrap === false ? 'cell-nowrap' : 'cell-wrap') + '" style="' + styleOf(c) + '">' + cell(c, a, start + i + 1) + '</td>').join('') +
        '</tr>').join('');
    }
    renderTableActions();

    // Footer / sayfalama
    const footer = document.querySelector('#alarm-table [data-footer]');
    footer.innerHTML =
      '<div class="text-slate-500 dark:text-slate-400 font-medium">Toplam <span class="font-bold text-slate-900 dark:text-slate-100">' + lastFiltered.length + '</span> kayıt listeleniyor.</div>' +
      '<div class="flex items-center gap-3 self-end sm:self-auto">' +
        '<div class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><span>Sayfa Başına:</span>' +
          '<select data-pagesize class="bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] px-2 py-0.5 text-slate-800 dark:text-slate-200 text-xs font-bold">' +
          [10, 20, 50, 100, 250].map(n => '<option value="' + n + '"' + (n === state.pageSize ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>' +
        '<div class="flex items-center gap-1">' +
          '<button type="button" data-page="-1"' + (state.page <= 1 ? ' disabled' : '') + ' class="w-7 h-7 rounded-[2px] border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"><i class="pi pi-chevron-left text-[10px]"></i></button>' +
          '<span class="px-2 font-bold text-slate-800 dark:text-slate-200">' + state.page + ' / ' + totalPages + '</span>' +
          '<button type="button" data-page="1"' + (state.page >= totalPages ? ' disabled' : '') + ' class="w-7 h-7 rounded-[2px] border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"><i class="pi pi-chevron-right text-[10px]"></i></button>' +
        '</div>' +
      '</div>';
    footer.querySelector('[data-pagesize]').addEventListener('change', e => { state.pageSize = parseInt(e.target.value, 10); state.page = 1; renderBody(); });
    footer.querySelectorAll('[data-page]').forEach(b => b.addEventListener('click', () => {
      state.page += parseInt(b.getAttribute('data-page'), 10);
      renderBody();
      document.querySelector('#alarm-table [data-scroll]').scrollTop = 0;
    }));
  }

  // ---------------------------------------------------------------------------
  // Analitik (seviye halkası + görülmemiş oranı / grup dağılımı)
  // ---------------------------------------------------------------------------
  function renderAnalytics() {
    const host = document.getElementById('alarm-analytics');
    if (!state.showAnalytics) { host.innerHTML = ''; host.classList.add('hidden'); return; }
    host.classList.remove('hidden');
    const isActive = state.tab === 'active';
    // Aktif: sistemdeki bütün aktif alarmlar; tarihsel: yalnız yeni alarm olayları
    const list = isActive ? ACTIVE : HISTORY.filter(a => a.event === 'raise');
    const total = list.length;
    const cnt = l => list.filter(a => a.level === l).length;
    const pct = n => Math.round((n / (total || 1)) * 100);
    const segs = [
      { key: 'acil', color: '#9333ea', dot: 'bg-purple-600', txt: 'text-purple-600 dark:text-purple-400', label: 'Acil' },
      { key: 'alarm', color: '#ef4444', dot: 'bg-red-500', txt: 'text-red-500', label: 'Alarm' },
      { key: 'uyari', color: '#f59e0b', dot: 'bg-amber-500', txt: 'text-amber-500', label: 'Uyarı' },
      { key: 'kayip', color: '#f97316', dot: 'bg-orange-500', txt: 'text-orange-500', label: 'İletişim Kaybı' }
    ].concat(isActive ? [{ key: 'normal', color: '#10b981', dot: 'bg-emerald-500', txt: 'text-emerald-500', label: 'Kalktı, onay bekliyor' }] : []);
    const C = 2.3875;
    let offset = 0;
    const circles = segs.map(s => {
      const p = pct(cnt(s.key));
      const c = '<circle cx="50" cy="50" r="38" fill="none" stroke="' + s.color + '" stroke-width="12" stroke-dasharray="' + (p * C) + ' 238.75" stroke-dashoffset="' + (offset ? '-' + (offset * C) : '0') + '" />';
      offset += p;
      return c;
    }).join('');
    const legend = segs.map(s =>
      '<div class="flex items-center justify-between px-2 py-0.5 rounded bg-slate-50 dark:bg-surface-base border border-slate-200 dark:border-border-subtle">' +
        '<div class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full ' + s.dot + ' shrink-0"></span><span class="font-bold text-slate-700 dark:text-slate-200">' + s.label + '</span></div>' +
        '<span class="font-mono font-bold ' + s.txt + '">' + cnt(s.key) + ' (%' + pct(cnt(s.key)) + ')</span></div>').join('');
    const unseen = isActive ? ACTIVE.filter(isNew).length : 0;
    const bars = groupDist().map(r =>
      '<div class="space-y-0.5"><div class="flex justify-between text-xs font-bold"><span class="text-slate-700 dark:text-slate-300">' + esc(r.name) + '</span><span class="font-mono" style="color:' + r.color + '">' + r.count + ' (%' + r.pct + ')</span></div>' +
      '<div class="w-full bg-slate-100 dark:bg-surface-base h-1.5 rounded-full overflow-hidden"><div class="h-full rounded-full transition-all" style="background-color:' + r.color + ';width:' + r.pct + '%"></div></div></div>').join('');

    host.innerHTML =
      '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] p-2.5 shadow-xs">' +
        '<div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-1 mb-2">' +
          '<h3 class="text-xs font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5"><i class="pi pi-chart-pie text-rose-500"></i><span>Seviye Dağılımı</span></h3>' +
          '<span class="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-surface-base px-2 py-0.5 rounded">' + total + ' Toplam</span>' +
        '</div>' +
        '<div class="flex items-center justify-between gap-3 py-0.5">' +
          '<div class="relative w-24 h-24 shrink-0 flex items-center justify-center">' +
            '<svg viewBox="0 0 100 100" class="w-full h-full transform -rotate-90"><circle cx="50" cy="50" r="38" fill="none" stroke="#1e293b" stroke-width="12" />' + circles + '</svg>' +
            '<div class="absolute inset-0 flex flex-col items-center justify-center text-center"><span class="text-[8px] uppercase tracking-wider text-slate-400 font-bold">Toplam</span><span class="text-xs font-black font-mono text-slate-900 dark:text-white">' + total + '</span></div>' +
          '</div>' +
          '<div class="space-y-1 w-full text-xs">' + legend + '</div>' +
        '</div>' +
        (isActive ?
          '<div class="mt-2 pt-1.5 border-t border-slate-200 dark:border-slate-800 space-y-0.5">' +
            '<div class="flex justify-between text-xs font-bold"><span class="flex items-center gap-1.5 text-slate-700 dark:text-slate-200"><i class="pi pi-eye-slash text-[11px] text-sky-500"></i>Görülmemiş Alarm</span>' +
            '<span class="font-mono text-sky-600 dark:text-sky-400">' + unseen + ' / ' + total + ' (%' + pct(unseen) + ')</span></div>' +
            '<div class="w-full bg-slate-100 dark:bg-surface-base h-1.5 rounded-full overflow-hidden"><div class="h-full rounded-full bg-sky-500 transition-all" style="width:' + pct(unseen) + '%"></div></div>' +
          '</div>' : '') +
      '</div>' +
      '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] p-2.5 shadow-xs">' +
        '<div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-1 mb-2">' +
          '<h3 class="text-xs font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5"><i class="pi pi-chart-bar text-sky-500"></i><span>Grup Dağılımı</span></h3>' +
          '<span class="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-surface-base px-2 py-0.5 rounded">CMA Grubu</span>' +
        '</div>' +
        '<div class="space-y-1.5 pt-0.5">' + bars + '</div>' +
      '</div>';
  }

  // ---------------------------------------------------------------------------
  // Diyaloglar
  // ---------------------------------------------------------------------------
  const noteField = id =>
    '<label class="block text-xs text-slate-500 dark:text-slate-400 mt-3 mb-1" for="' + id + '">Not (isteğe bağlı)</label>' +
    '<textarea id="' + id + '" rows="2" maxlength="500" class="scada-textarea w-full" placeholder="Örn. ekip yönlendirildi, bakım kaydı açıldı"></textarea>';
  const sessionUser = () => { const u = DCIM.session.user() || {}; return u.fullname || u.usr || 'Operatör'; };

  function openAck(id) {
    const a = ACTIVE.find(x => x.id === id);
    if (!a) return;
    dialog({
      title: 'Alarmı Onayla (Gördüm)',
      subtitle: a.desc + ' - ' + summaryOf(a),
      variant: 'warning',
      confirmLabel: 'Gördüm Olarak İşaretle',
      body: '<p class="text-xs text-slate-600 dark:text-slate-300">Bu alarmı operasyonel incelemeye alıp \'Gördüm\' olarak onaylamak istediğinizden emin misiniz?</p>' + noteField('ackComment'),
      onConfirm: host => {
        a.ack = { user: sessionUser(), tim: new Date(), note: host.querySelector('#ackComment').value.trim() };
        renderBody();
        renderAnalytics();
        toast(a.desc + ' alarmı "Gördüm" olarak işaretlendi.', 'success', 'Alarm Onaylandı');
      }
    });
  }

  function openBulkAck() {
    const items = pageUnseen();
    if (!items.length) { toast('Bu sayfada görülmemiş alarm yok.', 'info'); return; }
    const total = ACTIVE.length;
    const unseen = ACTIVE.filter(isNew).length;
    dialog({
      title: 'Sayfadaki Alarmları Onayla (Toplu Gördüm)',
      variant: 'warning',
      confirmLabel: 'Gördüm Olarak İşaretle',
      body: '<p class="text-xs text-slate-600 dark:text-slate-300">Bu sayfada listelenen ' + items.length + ' görülmemiş alarm \'Gördüm\' olarak onaylanacak. Emin misiniz?</p>' +
        '<div class="mt-3 space-y-0.5"><div class="flex justify-between text-[11px] font-bold"><span class="flex items-center gap-1.5 text-slate-700 dark:text-slate-200"><i class="pi pi-eye-slash text-[11px] text-sky-500"></i>Görülmemiş Alarm</span>' +
        '<span class="font-mono text-sky-600 dark:text-sky-400">' + unseen + ' / ' + total + ' (%' + Math.round(unseen / (total || 1) * 100) + ')</span></div>' +
        '<div class="w-full bg-slate-100 dark:bg-surface-base h-1.5 rounded-full overflow-hidden"><div class="h-full rounded-full bg-sky-500" style="width:' + Math.round(unseen / (total || 1) * 100) + '%"></div></div></div>' +
        noteField('bulkAckComment'),
      onConfirm: host => {
        const note = host.querySelector('#bulkAckComment').value.trim();
        const tim = new Date(), user = sessionUser();
        items.forEach(a => { a.ack = { user, tim, note }; });
        renderBody();
        renderAnalytics();
        toast(items.length + ' alarm onaylandı.', 'success', 'Toplu Gördüm');
      }
    });
  }

  function openHistory(id) {
    const a = ACTIVE.find(x => x.id === id);
    if (!a) return;
    const d = dialog({
      title: 'Son Kayıtlar',
      subtitle: a.desc + ' - Geçmiş SCADA Logları',
      variant: 'info',
      showCancel: false,
      confirmLabel: 'Kapat',
      maxWidth: 'max-w-2xl',
      body: '<div class="space-y-3"><p class="text-xs text-slate-700 dark:text-slate-300"><strong>' + esc(a.desc) + '</strong> noktasına ait geçmiş alarm durumları SQL SCADA loglarından listeleniyor.</p>' +
        '<div class="p-4 text-center text-slate-500 dark:text-slate-400 text-xs" data-loading><i class="pi pi-spin pi-spinner mr-2"></i> Yükleniyor...</div></div>'
    });
    setTimeout(() => {
      const rows = HISTORY.filter(h => h.rid === a.rid || h.desc === a.desc).slice(0, 30);
      // Aynı kaynağa ait birkaç eski kayıt yoksa, benzer kayıtlar üret
      const extra = rows.length < 4 ? [
        { tim: new Date(a.tim.getTime() - 26 * 3600000), fnc: 'onlvl', txt: 'Değer normale döndü', level: 'normal' },
        { tim: new Date(a.tim.getTime() - 27 * 3600000), fnc: a.fnc, txt: a.txt.replace(/\d+\.\d/, m => (parseFloat(m) - 0.6).toFixed(1)), level: a.level === 'normal' ? 'uyari' : a.level },
        { tim: new Date(a.tim.getTime() - 3 * 86400000), fnc: 'onlvl', txt: 'Değer normale döndü', level: 'normal' },
        { tim: new Date(a.tim.getTime() - 3 * 86400000 - 3100000), fnc: a.fnc, txt: a.txt, level: a.level === 'normal' ? 'uyari' : a.level }
      ] : [];
      const all = rows.concat(extra).sort((x, y) => y.tim - x.tim);
      const loading = d.body.querySelector('[data-loading]');
      if (!loading) return;
      loading.outerHTML = '<div class="border border-slate-200 dark:border-slate-800 rounded-[2px] overflow-hidden text-xs max-h-60 overflow-y-auto custom-scrollbar">' +
        '<table class="w-full text-left"><thead class="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-400 sticky top-0"><tr><th class="p-2">Tarih / Saat</th><th class="p-2">Özet</th><th class="p-2">Detay</th><th class="p-2">Durum</th></tr></thead>' +
        '<tbody class="divide-y divide-slate-100 dark:divide-slate-800">' +
        all.map(h => '<tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50"><td class="p-2 text-slate-500 dark:text-slate-400 font-mono">' + fmtDateTime(h.tim) + '</td><td class="p-2 text-slate-800 dark:text-slate-200">' + esc(summaryOf(h)) + '</td><td class="p-2 text-slate-900 dark:text-slate-100">' + esc(h.txt) + '</td><td class="p-2">' + levelBadge(h.level) + '</td></tr>').join('') +
        '</tbody></table></div>';
    }, 450);
  }

  // Bakım Aç: kısa form → kayıt sessionStorage'a; hücre "Bakımı Gör" olur
  function openMaintenance(id) {
    const a = HISTORY.find(x => x.id === id);
    if (!a || maintOf(a)) return;
    const target = a.cab || a.target || a.desc;
    const field = (label, html) => '<div class="flex flex-col gap-1"><label class="text-xs font-semibold text-slate-700 dark:text-slate-300">' + label + '</label>' + html + '</div>';
    dialog({
      title: 'Bakım Aç',
      subtitle: a.desc + ' · ' + fmtDateTime(a.tim),
      variant: 'info',
      confirmLabel: 'Bakım Aç',
      confirmIcon: 'pi pi-wrench',
      body:
        '<div class="space-y-3">' +
          '<div class="p-2.5 rounded-[2px] bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-[11px] space-y-1">' +
            '<div class="flex justify-between gap-3"><span class="text-slate-500">Alarm kaynağı:</span><span class="font-mono font-bold text-slate-800 dark:text-slate-200">' + esc(a.rid) + '</span></div>' +
            '<div class="flex justify-between gap-3"><span class="text-slate-500">Detay:</span><span class="text-right text-slate-700 dark:text-slate-300">' + esc(a.txt) + '</span></div>' +
            '<div class="flex justify-between gap-3"><span class="text-slate-500">Seviye:</span>' + levelBadge(a.level) + '</div>' +
          '</div>' +
          field('Bakım açıklaması', '<input type="text" data-m-desc class="scada-input" value="' + esc(a.desc + ' — ' + a.txt) + '" />') +
          field('Hedef (kabin / ekipman)', '<input type="text" data-m-target class="scada-input" value="' + esc(target) + '" />') +
          field('Not (isteğe bağlı)', '<textarea data-m-note rows="2" maxlength="500" class="scada-textarea w-full" placeholder="Örn. ekip yönlendirildi, parça siparişi verildi"></textarea>') +
        '</div>',
      onConfirm: host => {
        const desc = host.querySelector('[data-m-desc]').value.trim();
        if (!desc) { toast('Bakım açıklaması boş olamaz.', 'warning'); return false; }
        const list = maintList();
        const now = new Date();
        const rec = {
          id: 'BKM-ALM-' + String(now.getFullYear()).slice(2) + String(list.length + 1).padStart(4, '0'),
          alarmRid: a.rid,
          alarmId: a.id,
          desc,
          target: host.querySelector('[data-m-target]').value.trim(),
          opened: now.toISOString(),
          note: host.querySelector('[data-m-note]').value.trim(),
          status: 'Planlandı',
          level: a.level,
          alarmTime: a.tim.toISOString(),
          floor: floorName(a)
        };
        list.push(rec);
        maintSave(list);
        renderBody();
        toast('Bakım kaydı açıldı.', 'success', 'BAŞARILI');
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Rapor (app-report-export-menu, options: 'dateRange')
  // ---------------------------------------------------------------------------
  function exportReport(req) {
    const isActive = state.tab === 'active';
    const rows = DCIM.report.applyRange(lastFiltered, req, 'tim');
    const floor = FLOORS.find(f => f.id === state.floor);
    const quick = QUICK.find(q => q.value === state.quick && q.value !== 'all');
    const filters = [
      state.search.trim() ? 'arama "' + state.search.trim() + '"' : '',
      floor ? 'kat: ' + floor.label : '',
      quick ? 'seviye: ' + quick.label : '',
      state.ridPin ? 'kaynak "' + state.ridPin + '"' : '',
      isActive && state.hiddenGroups.size ? 'gizlenen gruplar: ' + hiddenGroupNames() : ''
    ].filter(Boolean);
    const period = req.from && req.to ? fmtDateTime(req.from).slice(0, 16) + ' – ' + fmtDateTime(req.to).slice(0, 16) : 'tümü';
    const tone = l => (l === 'acil' ? 'acil' : l === 'alarm' ? 'alarm' : l === 'uyari' ? 'warning' : l === 'kayip' ? 'lost' : 'normal');
    const lvl = ls => rows.filter(a => ls.indexOf(a.level) >= 0).length;
    const mapped = rows.map(a => ({
      time: a.tim, source: a.desc, floor: floorName(a), place: placeText(a), summary: summaryOf(a), group: groupOf(a.grp).name,
      detail: a.txt, ack: ackText(a), event: EVENT_LABEL[a.event] || '', level: LEVEL_LABEL[a.level], tone: tone(a.level)
    }));
    if (isActive) {
      const unseen = rows.filter(isNew).length;
      DCIM.report.generate({
        title: 'Aktif Alarmlar Raporu',
        subtitle: 'Alarm zamanı: ' + period + (filters.length ? ' · Filtre: ' + filters.join(', ') : '') + ' · ' + rows.length + ' / ' + ACTIVE.length + ' aktif alarm',
        filename: 'Aktif_Alarmlar',
        kpis: [
          { label: 'Alarm', value: rows.length },
          { label: 'Acil', value: lvl(['acil']), tone: lvl(['acil']) ? 'acil' : 'normal' },
          { label: 'Alarm', value: lvl(['alarm']), tone: lvl(['alarm']) ? 'alarm' : 'normal' },
          { label: 'Uyarı', value: lvl(['uyari']), tone: lvl(['uyari']) ? 'warning' : 'normal' },
          { label: 'Veri alınamıyor', value: lvl(['kayip']), tone: lvl(['kayip']) ? 'lost' : 'normal' },
          { label: 'Onay bekleyen', value: unseen, tone: unseen ? 'warning' : 'normal' }
        ],
        sections: [{
          title: 'Aktif alarm listesi',
          toneKey: 'tone',
          columns: [{ key: 'time', label: 'Zaman' }, { key: 'source', label: 'Kaynak' }, { key: 'floor', label: 'Kat' }, { key: 'place', label: 'Yer' },
            { key: 'summary', label: 'Özet' }, { key: 'group', label: 'Grup' }, { key: 'detail', label: 'Detay' }, { key: 'ack', label: 'Onay' }, { key: 'level', label: 'Seviye' }],
          rows: mapped
        }],
        notes: ['Liste CMA aktif alarm kaydından (CMA_List) okunur; seviye alarm durum bitlerinden hesaplanır.']
      }, req.format);
    } else {
      const raise = rows.filter(a => a.event === 'raise');
      const rl = ls => raise.filter(a => ls.indexOf(a.level) >= 0).length;
      DCIM.report.generate({
        title: 'Tarihsel Alarmlar Raporu',
        subtitle: 'Dönem: ' + period + (filters.length ? ' · Filtre: ' + filters.join(', ') : '') + ' · ' + rows.length + ' kayıt',
        filename: 'Tarihsel_Alarmlar',
        kpis: [
          { label: 'Kayıt', value: rows.length },
          { label: 'Yeni alarm', value: raise.length, tone: raise.length ? 'warning' : 'normal' },
          { label: 'Acil / Alarm', value: rl(['acil', 'alarm']), tone: rl(['acil', 'alarm']) ? 'alarm' : 'normal' },
          { label: 'Uyarı', value: rl(['uyari']), tone: rl(['uyari']) ? 'warning' : 'normal' },
          { label: 'Veri alınamıyor', value: rl(['kayip']), tone: rl(['kayip']) ? 'lost' : 'normal' }
        ],
        sections: [{
          title: 'Alarm olayları',
          toneKey: 'tone',
          columns: [{ key: 'time', label: 'Zaman' }, { key: 'source', label: 'Kaynak' }, { key: 'floor', label: 'Kat' }, { key: 'summary', label: 'Özet' },
            { key: 'group', label: 'Grup' }, { key: 'detail', label: 'Detay' }, { key: 'event', label: 'Olay' }, { key: 'level', label: 'Seviye' }],
          rows: mapped
        }],
        notes: ['Kayıtlar alarm geçmişinden (HIS_cma_list) okunur; olay türü yeni alarm / normale dönüş / görüldü ayrımıdır. Sayaçlar yalnız yeni alarm olaylarını sayar.']
      }, req.format);
    }
  }

  // ---------------------------------------------------------------------------
  // Sayfa değişimi (Aktif ↔ Tarihsel) & ana çizim
  // ---------------------------------------------------------------------------
  function switchTab(tab) {
    if (state.tab === tab) return;
    state.tab = tab;
    state.page = 1;
    state.filters = {};
    state.ridPin = '';
    state.grpOpen = false;
    state.sortField = 'createdTime';
    state.sortOrder = -1;
    const url = new URL(window.location.href);
    if (tab === 'history') url.searchParams.set('tab', 'history'); else url.searchParams.delete('tab');
    window.history.replaceState(null, '', url.toString());
    DCIM.shell.setActive(tab === 'history' ? 'history' : 'alarms');
    renderAll();
  }

  function renderAll() {
    renderQuick();
    renderChips();
    renderHead();
    renderBody();
    renderHeader();
    renderGrpNote();
    renderAnalytics();
  }

  renderTableShell();
  renderAll();
})();
