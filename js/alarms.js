/* ==========================================================================
   DCIM Sunum — Alarmlar (NewUICMPActiveAlarmsComponent + NewUICMPHistoricalAlarmsComponent)
   app-data-table (AppDataTableComponent) davranışının vanilla JS karşılığı:
   arama, hızlı filtre, kolon içi filtreler, sıralama, sayfalama, seçim, kolon görünürlüğü.
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, fmtDateTime, fmtDateKey, statusBadge, button, dialog, toast } = DCIM.ui;
  DCIM.shell.init({ active: new URLSearchParams(window.location.search).get('tab') === 'history' ? 'history' : 'alarms' });

  const ACTIVE = DCIM.data.activeAlarms;
  const HISTORY = DCIM.data.historicalAlarms;

  // ---------------------------------------------------------------------------
  // Sözlükler (messages.tr.json alarms.* anahtarları)
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
  const SEVERITY = {
    critical: { label: 'Kritik', cls: 'bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/40', dot: 'bg-rose-500' },
    major: { label: 'Majör', cls: 'bg-orange-500/15 text-orange-600 dark:text-orange-300 border-orange-500/40', dot: 'bg-orange-500' },
    minor: { label: 'Minör', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40', dot: 'bg-amber-500' },
    warning: { label: 'Uyarı', cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/40', dot: 'bg-sky-500' }
  };
  const LEVEL_BADGE = { alarm: 'alarm', warning: 'warning', lost: 'kayıp', normal: 'normal' };
  const summaryOf = a => SUMMARY[a.fnc] || a.fnc || 'Tanımsız';
  const ackText = a => a.ack ? a.ack.user + ' tarafından ' + fmtDateTime(a.ack.tim).slice(0, 16) + ' tarihinde görüldü.' : 'Yeni';
  const staText = a => {
    const base = a.level === 'alarm' ? (a.severity === 'critical' ? 'ACİL' : 'ALARM') : a.level === 'warning' ? 'UYARI' : a.level === 'lost' ? 'VERİ ALINAMIYOR' : 'NORMAL';
    return base + (a.ack && a.level !== 'normal' ? '-GÖRÜLDÜ' : '');
  };
  const deviceGroup = a => {
    const g = a.grp || '';
    if (g.indexOf('Beyaz') >= 0) return 'whiteSpace';
    if (g.indexOf('Soğut') >= 0) return 'cooling';
    if (g.indexOf('Enerj') >= 0) return 'energy';
    return 'other';
  };

  // ---------------------------------------------------------------------------
  // Durum
  // ---------------------------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const state = {
    tab: params.get('tab') === 'history' ? 'history' : 'active',
    search: '',
    quick: 'all',
    severity: params.get('severity') || '',
    filters: {},
    sortField: 'createdTime',
    sortOrder: -1,
    page: 1,
    pageSize: 15,
    showFilters: false,
    showAnalytics: true,
    showColMenu: false,
    selected: new Set(),
    hiddenCols: {},
    ridPin: ''
  };
  const qf = (params.get('filter') || '').toLowerCase();
  if (qf === 'alarm' || qf === 'uyarı' || qf === 'kayıp') state.quick = qf;

  const COLUMNS = {
    active: [
      { field: 'siraNo', header: 'Sıra No', width: '50px', wrap: false, filterable: false },
      { field: 'createdTime', header: 'Alarm Oluşma Zamanı', sortable: true, width: '155px', wrap: false },
      { field: 'severity', header: 'Şiddet', sortable: true, width: '92px', wrap: false },
      { field: 'source', header: 'Alarm Kaynağı', sortable: true, minWidth: '220px' },
      { field: 'location', header: 'Lokasyon', sortable: true, minWidth: '170px' },
      { field: 'summary', header: 'Alarm Özeti', minWidth: '180px' },
      { field: 'group', header: 'Alarm Grubu', width: '120px' },
      { field: 'detail', header: 'Alarm Detayı', minWidth: '220px' },
      { field: 'ackStatus', header: 'Onay Durumu', width: '150px' },
      { field: 'level', header: 'Alarm Seviyesi', sortable: true, width: '130px', wrap: false }
    ],
    history: [
      { field: 'siraNo', header: 'Sıra No', width: '50px', wrap: false, filterable: false },
      { field: 'createdTime', header: 'Alarm Oluşma Zamanı', sortable: true, width: '155px', wrap: false },
      { field: 'severity', header: 'Şiddet', sortable: true, width: '92px', wrap: false },
      { field: 'source', header: 'Alarm Kaynağı', sortable: true, minWidth: '220px' },
      { field: 'location', header: 'Lokasyon', sortable: true, minWidth: '170px' },
      { field: 'summary', header: 'Alarm Özeti', minWidth: '180px' },
      { field: 'group', header: 'Alarm Grubu', width: '120px' },
      { field: 'detail', header: 'Alarm Detayı', minWidth: '220px' },
      { field: 'level', header: 'Alarm Seviyesi', sortable: true, width: '130px', wrap: false }
    ]
  };
  const cols = () => COLUMNS[state.tab].filter(c => !state.hiddenCols[c.field]);
  const sourceList = () => (state.tab === 'active' ? ACTIVE : HISTORY);

  // ---------------------------------------------------------------------------
  // Filtreleme / sıralama
  // ---------------------------------------------------------------------------
  function filtered() {
    const f = state.filters;
    const q = state.search.trim().toLocaleLowerCase('tr-TR');
    let list = sourceList().slice();

    if (state.tab === 'history' && state.ridPin) list = list.filter(a => a.rid === state.ridPin);
    if (state.quick === 'alarm') list = list.filter(a => a.level === 'alarm');
    else if (state.quick === 'uyarı') list = list.filter(a => a.level === 'warning');
    else if (state.quick === 'kayıp') list = list.filter(a => a.level === 'lost');
    if (state.severity) list = list.filter(a => a.severity === state.severity && a.level !== 'normal');

    if (q) {
      list = list.filter(a => [a.rid, a.desc, a.location, a.fnc, a.grp, a.txt, summaryOf(a), staText(a), (SEVERITY[a.severity] || {}).label]
        .some(v => String(v || '').toLocaleLowerCase('tr-TR').indexOf(q) >= 0));
    }
    if (f.dateFrom) list = list.filter(a => fmtDateKey(a.tim) >= f.dateFrom);
    if (f.dateTo) list = list.filter(a => fmtDateKey(a.tim) <= f.dateTo);
    if (f.severity) list = list.filter(a => a.severity === f.severity);
    if (f.source) {
      const s = f.source.toLocaleLowerCase('tr-TR');
      list = list.filter(a => (a.desc + ' ' + a.rid).toLocaleLowerCase('tr-TR').indexOf(s) >= 0);
    }
    if (f.location) {
      const s = f.location.toLocaleLowerCase('tr-TR');
      list = list.filter(a => (a.location || '').toLocaleLowerCase('tr-TR').indexOf(s) >= 0);
    }
    if (f.fnc) list = list.filter(a => a.fnc === f.fnc);
    if (f.grp) list = list.filter(a => (a.grp || '').indexOf(f.grp) >= 0);
    if (f.detail) {
      const s = f.detail.toLocaleLowerCase('tr-TR');
      list = list.filter(a => (a.txt || '').toLocaleLowerCase('tr-TR').indexOf(s) >= 0);
    }
    if (f.ack === 'NEW') list = list.filter(a => !a.ack);
    else if (f.ack === 'ACKED') list = list.filter(a => !!a.ack);
    if (f.level === 'NORMAL') list = list.filter(a => a.level === 'normal');
    else if (f.level === 'WARNING') list = list.filter(a => a.level === 'warning');
    else if (f.level === 'ALARM') list = list.filter(a => a.level === 'alarm');
    else if (f.level === 'DATA_ERR') list = list.filter(a => a.level === 'lost');

    const SEV_ORDER = { critical: 4, major: 3, minor: 2, warning: 1 };
    const LVL_ORDER = { alarm: 3, lost: 2, warning: 1, normal: 0 };
    const key = a => {
      switch (state.sortField) {
        case 'createdTime': return a.tim.getTime();
        case 'severity': return SEV_ORDER[a.severity] || 0;
        case 'source': return a.desc;
        case 'location': return a.location;
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
  // Sayfa başlığı / sekmeler / sayaçlar
  // ---------------------------------------------------------------------------
  function renderHeader() {
    const isActive = state.tab === 'active';
    document.getElementById('page-title').textContent = isActive ? 'ANLIK ALARMLAR' : 'DCIM ALARM RAPORU';
    document.getElementById('crumb-last').textContent = isActive ? 'Alarmlar' : 'Tarihsel Alarmlar';
    const badge = document.getElementById('page-badge');
    badge.textContent = isActive ? 'CANLI' : 'SON 7 GÜN';

    const actions = document.getElementById('header-actions');
    actions.innerHTML =
      button({ variant: state.showFilters ? 'primary' : 'secondary', icon: 'pi pi-filter', label: 'Filtre', attrs: 'data-act="filter"' }) +
      button({ variant: state.showAnalytics ? 'primary' : 'secondary', icon: 'pi pi-chart-pie', label: 'Analitik', attrs: 'data-act="analytics"' }) +
      button({ variant: 'secondary', icon: isActive ? 'pi pi-history' : 'pi pi-bell', label: isActive ? 'Tarihsel Alarmlar' : 'Aktif Alarmlar', attrs: 'data-act="switch"' }) +
      button({ variant: isActive ? 'secondary' : 'primary', icon: 'pi pi-file', label: 'Rapor', attrs: 'data-act="report"' });
    actions.querySelector('[data-act="filter"]').onclick = () => { state.showFilters = !state.showFilters; renderAll(); };
    actions.querySelector('[data-act="analytics"]').onclick = () => { state.showAnalytics = !state.showAnalytics; renderAll(); };
    actions.querySelector('[data-act="switch"]').onclick = () => switchTab(isActive ? 'history' : 'active');
    actions.querySelector('[data-act="report"]').onclick = openReportDrawer;

    const tabCls = on => 'px-3 py-1.5 text-xs font-bold rounded-[2px] transition-colors cursor-pointer flex items-center gap-1.5 ' +
      (on ? 'bg-white dark:bg-surface-card text-sky-600 dark:text-sky-400 shadow-xs border border-slate-200 dark:border-border-subtle' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent');
    const tabs = document.getElementById('alarm-tabs');
    const unacked = ACTIVE.filter(a => !a.ack).length;
    const tA = tabs.querySelector('[data-tab="active"]');
    const tH = tabs.querySelector('[data-tab="history"]');
    tA.className = tabCls(isActive);
    tA.innerHTML = '<i class="pi pi-bell text-xs"></i><span>Aktif Alarmlar</span><span class="font-mono text-[10px] px-1.5 py-0.5 rounded-[2px] bg-rose-500/15 text-rose-600 dark:text-rose-300 border border-rose-500/30">' + ACTIVE.length + '</span>' +
      (unacked ? '<span class="font-mono text-[9px] text-slate-500 dark:text-slate-400">' + unacked + ' yeni</span>' : '');
    tH.className = tabCls(!isActive);
    tH.innerHTML = '<i class="pi pi-history text-xs"></i><span>Tarihsel Alarmlar</span><span class="font-mono text-[10px] px-1.5 py-0.5 rounded-[2px] bg-slate-500/15 text-slate-600 dark:text-slate-300 border border-slate-500/30">' + HISTORY.length + '</span>';
    tA.onclick = () => switchTab('active');
    tH.onclick = () => switchTab('history');
    document.getElementById('last-refresh').textContent = 'Son güncelleme: ' + DCIM.ui.fmtTime(new Date());
  }

  function renderSeverityCards() {
    const list = sourceList().filter(a => a.level !== 'normal');
    const count = sev => list.filter(a => a.severity === sev).length;
    const unacked = sev => list.filter(a => a.severity === sev && !a.ack).length;
    const defs = [
      { key: 'critical', label: 'Kritik', icon: 'pi pi-times-circle', color: 'rose', sub: 'Acil müdahale' },
      { key: 'major', label: 'Majör', icon: 'pi pi-exclamation-circle', color: 'orange', sub: 'Servis etkisi' },
      { key: 'minor', label: 'Minör', icon: 'pi pi-exclamation-triangle', color: 'amber', sub: 'Eşik aşımı' },
      { key: 'warning', label: 'Uyarı', icon: 'pi pi-info-circle', color: 'sky', sub: 'Bilgilendirme' }
    ];
    const COLORS = {
      rose: { on: 'border-rose-500/60 bg-rose-50/50 dark:bg-rose-950/25', txt: 'text-rose-600 dark:text-rose-400', num: 'text-rose-600 dark:text-rose-300', dot: 'bg-rose-500' },
      orange: { on: 'border-orange-500/60 bg-orange-50 dark:bg-orange-950/25', txt: 'text-orange-600 dark:text-orange-400', num: 'text-orange-600 dark:text-orange-300', dot: 'bg-orange-500' },
      amber: { on: 'border-amber-500/60 bg-amber-50 dark:bg-amber-950/25', txt: 'text-amber-600 dark:text-amber-400', num: 'text-amber-600 dark:text-amber-300', dot: 'bg-amber-500' },
      sky: { on: 'border-sky-500/60 bg-sky-50 dark:bg-sky-950/25', txt: 'text-sky-600 dark:text-sky-400', num: 'text-sky-600 dark:text-sky-300', dot: 'bg-sky-500' }
    };
    const host = document.getElementById('severity-cards');
    host.innerHTML = defs.map(d => {
      const c = COLORS[d.color];
      const n = count(d.key);
      const selected = state.severity === d.key;
      return '<div data-sev="' + d.key + '" title="' + d.label + ' alarmları filtrele" class="bg-white dark:bg-surface-card border rounded-[2px] p-2.5 sm:p-3 shadow-2xs transition-all select-none cursor-pointer ' +
        (selected ? c.on + ' ring-2 ring-sky-500/30' : (n > 0 ? c.on.split(' ')[0] + ' hover:shadow-xs' : 'border-slate-200 dark:border-border-subtle hover:border-slate-300')) + '">' +
        '<div class="flex items-center justify-between ' + c.txt + '">' +
          '<div class="flex items-center gap-1.5"><span class="text-[9.5px] sm:text-[10px] font-black uppercase tracking-wider">' + d.label + '</span>' +
          (n > 0 && d.key === 'critical' ? '<span class="w-1.5 h-1.5 rounded-full ' + c.dot + ' animate-pulse"></span>' : '') + '</div>' +
          '<div class="flex items-center gap-1">' + (selected ? '<i class="pi pi-filter-fill text-[10px]"></i>' : '<i class="pi pi-filter text-[10px] opacity-60"></i>') + '<i class="' + d.icon + ' text-sm"></i></div>' +
        '</div>' +
        '<div class="mt-1 flex items-baseline gap-1.5 sm:gap-2"><span class="text-xl sm:text-2xl font-black tracking-tight ' + (n > 0 ? c.num : 'text-slate-900 dark:text-slate-100') + '">' + n + '</span>' +
          '<span class="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase">alarm</span></div>' +
        '<div class="mt-1 text-[8.5px] sm:text-[9px] font-mono flex items-center justify-between gap-1 text-slate-400">' +
          '<span class="truncate">' + d.sub + '</span>' +
          (state.tab === 'active' ? '<span class="shrink-0">' + unacked(d.key) + ' onaysız</span>' : '') +
        '</div>' +
      '</div>';
    }).join('');
    host.querySelectorAll('[data-sev]').forEach(el => el.addEventListener('click', () => {
      const k = el.getAttribute('data-sev');
      state.severity = state.severity === k ? '' : k;
      state.page = 1;
      renderAll();
    }));
  }

  // ---------------------------------------------------------------------------
  // Tablo (app-data-table)
  // ---------------------------------------------------------------------------
  const inputCls = 'w-full px-1.5 py-0.5 text-[11px] bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500';
  const selectCls = 'w-full px-1 py-0.5 text-[11px] bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500';
  const opt = (v, l, cur) => '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + l + '</option>';

  function filterCell(col) {
    const f = state.filters;
    switch (col.field) {
      case 'createdTime':
        return '<div class="flex flex-col gap-0.5">' +
          '<input type="date" data-f="dateFrom" value="' + esc(f.dateFrom || '') + '" class="w-full px-1 py-0.5 text-[10px] bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500" aria-label="Başlangıç Tarihi" />' +
          '<input type="date" data-f="dateTo" value="' + esc(f.dateTo || '') + '" class="w-full px-1 py-0.5 text-[10px] bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500" aria-label="Bitiş Tarihi" /></div>';
      case 'severity':
        return '<select data-f="severity" class="' + selectCls + '">' + opt('', '-Tümü-', f.severity || '') + opt('critical', 'Kritik', f.severity) + opt('major', 'Majör', f.severity) + opt('minor', 'Minör', f.severity) + opt('warning', 'Uyarı', f.severity) + '</select>';
      case 'source':
        return '<input type="text" data-f="source" value="' + esc(f.source || '') + '" placeholder="Kaynak Ara..." class="' + inputCls + '" />';
      case 'location':
        return '<input type="text" data-f="location" value="' + esc(f.location || '') + '" placeholder="Lokasyon Ara..." class="' + inputCls + '" />';
      case 'summary':
        return '<select data-f="fnc" class="' + selectCls + '">' + opt('', '-Tümü-', f.fnc || '') + opt('onllo', 'Alt Limit', f.fnc) + opt('onlhi', 'Üst Limit', f.fnc) + opt('onequ', 'Değer Değişti', f.fnc) + opt('door', 'Kapak Durumu', f.fnc) + opt('onlvl', 'Seviye', f.fnc) + opt('devsta', 'Cihaz Durumu', f.fnc) + '</select>';
      case 'group':
        return '<select data-f="grp" class="' + selectCls + '">' + opt('', '-Tümü-', f.grp || '') + opt('Beyaz Alan', 'Beyaz Alan', f.grp) + opt('Enerji', 'Enerji', f.grp) + opt('Soğutma', 'Soğutma', f.grp) + opt('Diğer', 'Diğer', f.grp) + '</select>';
      case 'detail':
        return '<input type="text" data-f="detail" value="' + esc(f.detail || '') + '" placeholder="Detay Ara..." class="' + inputCls + '" />';
      case 'ackStatus':
        return '<select data-f="ack" class="' + selectCls + '">' + opt('', '-Tümü-', f.ack || '') + opt('NEW', 'Görülmedi', f.ack) + opt('ACKED', 'Görüldü', f.ack) + '</select>';
      case 'level':
        return '<select data-f="level" class="w-full min-w-0 px-1 py-0.5 text-[11px] bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500">' +
          opt('', '-Tümü-', f.level || '') + opt('NORMAL', 'Normal', f.level) + opt('WARNING', 'Uyarı', f.level) + opt('ALARM', 'Alarm', f.level) + opt('DATA_ERR', 'Veri Hatası', f.level) + '</select>';
      default:
        return '';
    }
  }

  function cell(col, a, idx) {
    switch (col.field) {
      case 'siraNo':
        return '<span class="cell-nowrap">' + idx + '</span>';
      case 'createdTime':
        return '<span class="cell-nowrap font-mono">' + fmtDateTime(a.tim) + '</span>';
      case 'severity': {
        const s = SEVERITY[a.severity] || SEVERITY.warning;
        return '<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] text-[10px] font-black uppercase tracking-wider border ' + s.cls + '"><span class="w-1.5 h-1.5 rounded-full ' + s.dot + '"></span>' + s.label + '</span>';
      }
      case 'source':
        if (state.tab === 'active') {
          return '<div class="flex items-center gap-1.5 min-w-0 py-0.5"><span class="font-bold text-slate-900 dark:text-slate-100 break-words leading-tight" style="overflow-wrap: break-word;" title="' + esc(a.rid) + '">' + esc(a.desc) + '</span>' +
            '<button type="button" data-history="' + esc(a.id) + '" title="Son Kayıtlar" class="p-1 rounded text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 transition-colors cursor-pointer shrink-0"><i class="pi pi-eye text-xs"></i></button></div>';
        }
        return '<div class="flex items-center gap-1.5 min-w-0 py-0.5"><span class="font-bold text-slate-900 dark:text-slate-100 break-words leading-tight" style="overflow-wrap: break-word;" title="' + esc(a.rid) + '">' + esc(a.desc) + '</span>' +
          '<button type="button" data-pin="' + esc(a.rid) + '" title="Sadece bu kaynağı göster / Kaldır" class="p-1 rounded transition-colors cursor-pointer shrink-0 ' + (state.ridPin === a.rid ? 'text-amber-500 bg-amber-500/10' : 'text-slate-400 hover:text-sky-400 hover:bg-sky-500/10') + '">' +
          '<i class="' + (state.ridPin === a.rid ? 'pi pi-filter-slash' : 'pi pi-filter') + ' text-xs"></i></button></div>';
      case 'location':
        return '<span class="cell-wrap text-slate-600 dark:text-slate-300"><i class="pi pi-map-marker text-[9px] text-sky-500 mr-1"></i>' + esc(a.location) + '</span>';
      case 'summary':
        return '<span class="cell-wrap">' + esc(summaryOf(a)) + '</span>';
      case 'group':
        return '<span class="cell-wrap">' + esc(a.grp) + '</span>';
      case 'detail':
        return '<span class="cell-wrap" title="' + esc(a.txt) + '">' + esc(a.txt) + '</span>';
      case 'ackStatus':
        if (!a.ack) {
          return '<button type="button" data-ack="' + esc(a.id) + '" class="px-2.5 py-1 bg-sky-600/20 hover:bg-sky-600 text-sky-300 hover:text-white font-semibold text-xs rounded border border-sky-500/30 transition-all flex items-center gap-1 cursor-pointer -ml-1.5"><i class="pi pi-check"></i><span>Gördüm</span></button>';
        }
        return '<span class="text-xs text-emerald-400 font-medium flex items-center gap-1 -ml-1.5"><i class="pi pi-check-circle"></i><span class="cell-wrap">' + esc(ackText(a)) + '</span></span>';
      case 'level':
        return '<div class="inline-flex items-center min-w-0">' + statusBadge(LEVEL_BADGE[a.level] || 'normal') + '</div>';
      default:
        return '';
    }
  }

  const styleOf = c => (c.width ? 'width:' + c.width + ';' : '') + ((c.minWidth || c.width) ? 'min-width:' + (c.minWidth || c.width) + ';' : '');

  function renderTableShell() {
    const host = document.getElementById('alarm-table');
    const quick = [
      { label: '-Tümü-', value: 'all' },
      { label: 'Alarm', value: 'alarm' },
      { label: 'Uyarı', value: 'uyarı' },
      { label: 'Veri Alınamıyor', value: 'kayıp' }
    ];
    host.innerHTML =
      '<div class="p-2.5 px-3 border-b border-slate-200 dark:border-border-subtle flex flex-wrap items-center justify-between gap-2.5 bg-slate-50 dark:bg-surface-base shrink-0">' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<div class="relative w-60 sm:w-72">' +
            '<i class="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>' +
            '<input type="text" data-search placeholder="Ara" value="' + esc(state.search) + '" class="w-full pl-8 pr-3 py-1 text-xs bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500" />' +
          '</div>' +
          '<div class="flex items-center gap-1" data-quick>' +
            quick.map(q => '<button type="button" data-q="' + q.value + '" class="px-2 py-1 text-[11px] rounded-[2px] border transition-all cursor-pointer">' + q.label + '</button>').join('') +
          '</div>' +
          '<span data-chips class="flex items-center gap-1"></span>' +
        '</div>' +
        '<div class="flex items-center gap-1.5 shrink-0">' +
          '<span class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shrink-0" title="Online"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span><span>Online</span></span>' +
          '<div data-bulk class="hidden px-2 py-1 bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20 rounded-[2px] text-[11px] font-bold flex items-center gap-1.5"></div>' +
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
      searchTimer = setTimeout(() => { state.search = e.target.value; state.page = 1; renderBody(); renderAnalytics(); }, 120);
    });
    host.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => { state.quick = b.getAttribute('data-q'); state.page = 1; renderQuick(); renderBody(); }));
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

    // Tablo içi delegasyonlar
    host.querySelector('[data-tbody]').addEventListener('click', e => {
      const ackBtn = e.target.closest('[data-ack]');
      const histBtn = e.target.closest('[data-history]');
      const pinBtn = e.target.closest('[data-pin]');
      const chk = e.target.closest('[data-row-check]');
      if (ackBtn) { e.stopPropagation(); openAck(ackBtn.getAttribute('data-ack')); return; }
      if (histBtn) { e.stopPropagation(); openHistory(histBtn.getAttribute('data-history')); return; }
      if (pinBtn) { e.stopPropagation(); const rid = pinBtn.getAttribute('data-pin'); state.ridPin = state.ridPin === rid ? '' : rid; state.page = 1; renderBody(); renderChips(); return; }
      const row = e.target.closest('[data-row]');
      if (row) {
        const id = row.getAttribute('data-row');
        if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
        if (chk) e.stopPropagation();
        renderBody();
      }
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
    const chips = [];
    if (state.severity) chips.push({ key: 'severity', label: 'Şiddet: ' + SEVERITY[state.severity].label });
    if (state.ridPin) chips.push({ key: 'rid', label: 'Kaynak: ' + state.ridPin });
    host.innerHTML = chips.map(c =>
      '<span class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">' + esc(c.label) +
      '<button type="button" data-chip="' + c.key + '" class="hover:text-rose-500 cursor-pointer"><i class="pi pi-times text-[8px]"></i></button></span>'
    ).join('');
    host.querySelectorAll('[data-chip]').forEach(b => b.addEventListener('click', () => {
      if (b.getAttribute('data-chip') === 'severity') state.severity = ''; else state.ridPin = '';
      state.page = 1;
      renderAll();
    }));
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
      '<th class="py-2 px-1 text-center bg-slate-100 dark:bg-surface-base" style="width: 36px; min-width: 36px; max-width: 36px;"><input type="checkbox" data-check-all class="rounded-[2px] border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-sky-500" /></th>' +
      cs.map(c =>
        '<th data-sort="' + (c.sortable ? c.field : '') + '" class="py-2 px-2 text-left font-bold cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors bg-slate-100 dark:bg-surface-base text-[11px] whitespace-nowrap" style="' + styleOf(c) + '" title="' + esc(c.header) + '">' +
          '<div class="flex items-center gap-1 min-w-0"><span>' + esc(c.header) + '</span>' +
          (state.sortField === c.field ? '<i class="' + (state.sortOrder === 1 ? 'pi pi-sort-amount-up' : 'pi pi-sort-amount-down') + ' text-[10px] text-sky-600 dark:text-sky-400 shrink-0"></i>' : '') +
          '</div></th>'
      ).join('') + '</tr>';
    if (state.showFilters) {
      html += '<tr class="bg-slate-50 dark:bg-[#0b121e] border-b border-slate-200 dark:border-slate-800">' +
        '<th class="py-1 px-1 text-center bg-slate-50 dark:bg-[#0b121e]" style="width: 36px; min-width: 36px; max-width: 36px;"><button type="button" data-clear-filters title="Temizle" class="text-slate-400 hover:text-rose-500 text-[10px] p-0.5 transition-colors cursor-pointer"><i class="pi pi-filter-slash"></i></button></th>' +
        cs.map(c => '<th class="py-1 px-1.5 bg-slate-50 dark:bg-[#0b121e] font-normal" style="' + styleOf(c) + '">' + (c.filterable === false ? '' : filterCell(c)) + '</th>').join('') +
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
      inp.addEventListener(ev, () => { state.filters[inp.getAttribute('data-f')] = inp.value; state.page = 1; renderBody(); });
    });
    const clr = thead.querySelector('[data-clear-filters]');
    if (clr) clr.addEventListener('click', () => {
      state.filters = {}; state.search = ''; state.quick = 'all'; state.severity = ''; state.ridPin = ''; state.page = 1;
      document.querySelector('#alarm-table [data-search]').value = '';
      renderAll();
    });
    thead.querySelector('[data-check-all]').addEventListener('change', e => {
      const pageRows = currentPageRows();
      if (e.target.checked) pageRows.forEach(a => state.selected.add(a.id)); else state.selected.clear();
      renderBody();
    });
  }

  let lastFiltered = [];
  function currentPageRows() {
    const start = (state.page - 1) * state.pageSize;
    return lastFiltered.slice(start, start + state.pageSize);
  }

  function renderBody() {
    lastFiltered = filtered();
    const totalPages = Math.max(1, Math.ceil(lastFiltered.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const rows = currentPageRows();
    const cs = cols();
    const tbody = document.querySelector('#alarm-table [data-tbody]');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="' + (cs.length + 1) + '" class="p-8 text-center text-slate-400 dark:text-slate-500"><i class="pi pi-inbox text-2xl mb-1 block opacity-40"></i><span class="italic">Veri bulunamadı</span></td></tr>';
    } else {
      const start = (state.page - 1) * state.pageSize;
      tbody.innerHTML = rows.map((a, i) => {
        const sel = state.selected.has(a.id);
        const fresh = state.tab === 'active' && !a.ack && a.severity === 'critical';
        return '<tr data-row="' + esc(a.id) + '" class="hover:bg-slate-50 dark:hover:bg-surface-base transition-colors cursor-pointer' + (sel ? ' bg-sky-500/5' : '') + (fresh ? ' bg-rose-500/5' : '') + '">' +
          '<td class="py-1.5 px-1 text-center" style="width: 36px; min-width: 36px; max-width: 36px;"><input type="checkbox" data-row-check' + (sel ? ' checked' : '') + ' class="rounded-[2px] border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-sky-500" /></td>' +
          cs.map(c => '<td class="py-1.5 px-2 text-[11px] ' + (c.wrap === false ? 'cell-nowrap' : 'cell-wrap') + '" style="' + styleOf(c) + '">' + cell(c, a, start + i + 1) + '</td>').join('') +
          '</tr>';
      }).join('');
    }
    const checkAll = document.querySelector('#alarm-table [data-check-all]');
    if (checkAll) checkAll.checked = rows.length > 0 && rows.every(a => state.selected.has(a.id));

    // Toplu işlem bilgisi
    const bulk = document.querySelector('#alarm-table [data-bulk]');
    const selectable = Array.from(state.selected).filter(id => ACTIVE.some(a => a.id === id && !a.ack));
    if (state.selected.size > 0) {
      bulk.classList.remove('hidden');
      bulk.innerHTML = '<span>' + state.selected.size + ' seçili</span>' +
        (state.tab === 'active' && selectable.length ? '<button type="button" data-bulk-ack class="underline hover:text-sky-800 dark:hover:text-sky-300">Seçilenleri Onayla</button>' : '');
      const b = bulk.querySelector('[data-bulk-ack]');
      if (b) b.onclick = () => bulkAck(selectable);
    } else {
      bulk.classList.add('hidden');
    }

    // Footer / sayfalama
    const footer = document.querySelector('#alarm-table [data-footer]');
    footer.innerHTML =
      '<div class="text-slate-500 dark:text-slate-400 font-medium">Toplam <span class="font-bold text-slate-900 dark:text-slate-100">' + lastFiltered.length + '</span> kayıt listeleniyor.</div>' +
      '<div class="flex items-center gap-3 self-end sm:self-auto">' +
        '<div class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><span>Sayfa Başına:</span>' +
          '<select data-pagesize class="bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] px-2 py-0.5 text-slate-800 dark:text-slate-200 text-xs font-bold">' +
          [5, 10, 15, 20, 50, 100].map(n => '<option value="' + n + '"' + (n === state.pageSize ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>' +
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
  // Analitik (donut + grup dağılımı)
  // ---------------------------------------------------------------------------
  function renderAnalytics() {
    const host = document.getElementById('alarm-analytics');
    if (!state.showAnalytics) { host.innerHTML = ''; host.classList.add('hidden'); return; }
    host.classList.remove('hidden');
    const list = sourceList().filter(a => a.level !== 'normal');
    const total = list.length || 1;
    const nA = list.filter(a => a.level === 'alarm').length;
    const nW = list.filter(a => a.level === 'warning').length;
    const nL = list.filter(a => a.level === 'lost').length;
    const pA = Math.round((nA / total) * 100), pW = Math.round((nW / total) * 100), pL = Math.round((nL / total) * 100);
    const g = { whiteSpace: 0, cooling: 0, energy: 0, other: 0 };
    list.forEach(a => { g[deviceGroup(a)]++; });
    const pg = k => Math.round((g[k] / total) * 100);
    const C = 2.3875;
    const bar = (label, count, pct, textCls, barCls) =>
      '<div class="space-y-0.5"><div class="flex justify-between text-xs font-bold"><span class="text-slate-700 dark:text-slate-300">' + label + '</span><span class="font-mono ' + textCls + '">' + count + ' (%' + pct + ')</span></div>' +
      '<div class="w-full bg-slate-100 dark:bg-surface-base h-1.5 rounded-full overflow-hidden"><div class="' + barCls + ' h-full rounded-full transition-all" style="width:' + pct + '%"></div></div></div>';
    const legend = (dot, label, count, pct, cls) =>
      '<div class="flex items-center justify-between px-2 py-0.5 rounded bg-slate-50 dark:bg-surface-base border border-slate-200 dark:border-border-subtle">' +
        '<div class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full ' + dot + ' shrink-0"></span><span class="font-bold text-slate-700 dark:text-slate-200">' + label + '</span></div>' +
        '<span class="font-mono font-bold ' + cls + '">' + count + ' (%' + pct + ')</span></div>';

    host.innerHTML =
      '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] p-2.5 shadow-xs">' +
        '<div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-1 mb-2">' +
          '<h3 class="text-xs font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5"><i class="pi pi-chart-pie text-rose-500"></i><span>Seviye Dağılımı</span></h3>' +
          '<span class="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-surface-base px-2 py-0.5 rounded">' + list.length + ' Toplam</span>' +
        '</div>' +
        '<div class="flex items-center justify-between gap-3 py-0.5">' +
          '<div class="relative w-24 h-24 shrink-0 flex items-center justify-center">' +
            '<svg viewBox="0 0 100 100" class="w-full h-full transform -rotate-90">' +
              '<circle cx="50" cy="50" r="38" fill="none" stroke="#1e293b" stroke-width="12" />' +
              '<circle cx="50" cy="50" r="38" fill="none" stroke="#ef4444" stroke-width="12" stroke-dasharray="' + (pA * C) + ' 238.75" stroke-dashoffset="0" />' +
              '<circle cx="50" cy="50" r="38" fill="none" stroke="#f59e0b" stroke-width="12" stroke-dasharray="' + (pW * C) + ' 238.75" stroke-dashoffset="-' + (pA * C) + '" />' +
              '<circle cx="50" cy="50" r="38" fill="none" stroke="#f97316" stroke-width="12" stroke-dasharray="' + (pL * C) + ' 238.75" stroke-dashoffset="-' + ((pA + pW) * C) + '" />' +
            '</svg>' +
            '<div class="absolute inset-0 flex flex-col items-center justify-center text-center"><span class="text-[8px] uppercase tracking-wider text-slate-400 font-bold">Toplam</span><span class="text-xs font-black font-mono text-slate-900 dark:text-white">' + list.length + '</span></div>' +
          '</div>' +
          '<div class="space-y-1 w-full text-xs">' +
            legend('bg-red-500', 'Alarm', nA, pA, 'text-red-500') +
            legend('bg-amber-500', 'Uyarı', nW, pW, 'text-amber-500') +
            legend('bg-orange-500', 'İletişim Kaybı', nL, pL, 'text-orange-500') +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] p-2.5 shadow-xs">' +
        '<div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-1 mb-2">' +
          '<h3 class="text-xs font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5"><i class="pi pi-chart-bar text-sky-500"></i><span>Grup Dağılımı</span></h3>' +
          '<span class="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-surface-base px-2 py-0.5 rounded">CMA Grubu</span>' +
        '</div>' +
        '<div class="space-y-1.5 pt-0.5">' +
          bar('Beyaz Alan', g.whiteSpace, pg('whiteSpace'), 'text-sky-500', 'bg-sky-500') +
          bar('Soğutma', g.cooling, pg('cooling'), 'text-red-500', 'bg-red-500') +
          bar('Enerji', g.energy, pg('energy'), 'text-emerald-500', 'bg-emerald-500') +
          bar('Diğer', g.other, pg('other'), 'text-amber-500', 'bg-amber-500') +
        '</div>' +
      '</div>';
  }

  // ---------------------------------------------------------------------------
  // Diyaloglar
  // ---------------------------------------------------------------------------
  function openAck(id) {
    const a = ACTIVE.find(x => x.id === id);
    if (!a) return;
    dialog({
      title: 'Alarmı Onayla (Gördüm)',
      subtitle: a.desc + ' - ' + summaryOf(a),
      variant: 'warning',
      confirmLabel: 'Gördüm Olarak İşaretle',
      body: '<p class="text-xs text-slate-600 dark:text-slate-300">Bu alarmı operasyonel incelemeye alıp \'Gördüm\' olarak onaylamak istediğinizden emin misiniz?</p>' +
        '<div class="mt-3 p-2.5 rounded-[2px] bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-[11px] space-y-1">' +
          '<div class="flex justify-between gap-3"><span class="text-slate-500">Kaynak:</span><span class="font-mono font-bold text-slate-800 dark:text-slate-200">' + esc(a.rid) + '</span></div>' +
          '<div class="flex justify-between gap-3"><span class="text-slate-500">Detay:</span><span class="font-bold text-amber-500 text-right">' + esc(a.txt) + '</span></div>' +
          '<div class="flex justify-between gap-3"><span class="text-slate-500">Lokasyon:</span><span class="text-slate-700 dark:text-slate-300">' + esc(a.location) + '</span></div>' +
        '</div>',
      onConfirm: () => {
        const user = DCIM.session.user();
        a.ack = { user: user.fullname || user.usr, tim: new Date() };
        renderAll();
        toast(a.desc + ' alarmı "Gördüm" olarak işaretlendi.', 'success', 'Alarm Onaylandı');
      }
    });
  }

  function bulkAck(ids) {
    dialog({
      title: 'Seçili Alarmları Onayla',
      subtitle: ids.length + ' onaysız alarm',
      variant: 'warning',
      confirmLabel: 'Tümünü Gördüm Olarak İşaretle',
      body: '<p class="text-xs text-slate-600 dark:text-slate-300">Seçili ' + ids.length + ' alarm operasyonel incelemeye alınarak onaylanacak.</p>',
      onConfirm: () => {
        const user = DCIM.session.user();
        ids.forEach(id => { const a = ACTIVE.find(x => x.id === id); if (a) a.ack = { user: user.fullname || user.usr, tim: new Date() }; });
        state.selected.clear();
        renderAll();
        toast(ids.length + ' alarm onaylandı.', 'success', 'Toplu Onay');
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
      body: '<div class="space-y-3"><p class="text-xs text-slate-600 dark:text-slate-300"><strong>' + esc(a.desc) + '</strong> noktasına ait geçmiş alarm durumları SQL SCADA loglarından listeleniyor.</p>' +
        '<div class="p-4 text-center text-slate-400 text-xs" data-loading><i class="pi pi-spin pi-spinner mr-2"></i> Yükleniyor...</div></div>'
    });
    setTimeout(() => {
      const rows = HISTORY.filter(h => h.rid === a.rid || h.desc === a.desc).slice(0, 30);
      // Aynı kaynağa ait birkaç eski kayıt yoksa, benzer kayıtlar üret
      const extra = rows.length < 4 ? [
        { tim: new Date(a.tim.getTime() - 26 * 3600000), fnc: 'onlvl', txt: 'Değer normale döndü', level: 'normal', ack: null, severity: a.severity },
        { tim: new Date(a.tim.getTime() - 27 * 3600000), fnc: a.fnc, txt: a.txt.replace(/\d+\.\d/, m => (parseFloat(m) - 0.6).toFixed(1)), level: a.level, ack: { user: 'Ayşe Demir' }, severity: a.severity },
        { tim: new Date(a.tim.getTime() - 3 * 86400000), fnc: 'onlvl', txt: 'Değer normale döndü', level: 'normal', ack: null, severity: a.severity },
        { tim: new Date(a.tim.getTime() - 3 * 86400000 - 3100000), fnc: a.fnc, txt: a.txt, level: a.level, ack: { user: 'Mehmet Kaya' }, severity: a.severity }
      ] : [];
      const all = rows.concat(extra).sort((x, y) => y.tim - x.tim);
      const loading = d.body.querySelector('[data-loading]');
      if (!loading) return;
      loading.outerHTML = '<div class="border border-slate-200 dark:border-slate-800 rounded-[2px] overflow-hidden text-xs max-h-60 overflow-y-auto custom-scrollbar">' +
        '<table class="w-full text-left"><thead class="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 sticky top-0"><tr><th class="p-2">Tarih / Saat</th><th class="p-2">Özet</th><th class="p-2">Detay</th><th class="p-2">Durum</th></tr></thead>' +
        '<tbody class="divide-y divide-slate-200 dark:divide-slate-800">' +
        all.map(h => '<tr class="hover:bg-slate-100 dark:hover:bg-slate-800/50"><td class="p-2 text-slate-500 dark:text-slate-400 font-mono">' + fmtDateTime(h.tim) + '</td><td class="p-2 text-slate-700 dark:text-slate-200">' + esc(summaryOf(h)) + '</td><td class="p-2 font-bold text-amber-500">' + esc(h.txt) + '</td><td class="p-2 text-slate-600 dark:text-slate-300">' + esc(staText(h)) + '</td></tr>').join('') +
        '</tbody></table></div>';
    }, 450);
  }

  function openReportDrawer() {
    const host = document.createElement('div');
    host.className = 'fixed inset-0 z-50 overflow-hidden bg-slate-950/75 transition-opacity animate-fade-in';
    const today = fmtDateKey(new Date());
    host.innerHTML =
      '<div class="fixed inset-y-0 right-0 max-w-full flex pl-8">' +
        '<div class="w-screen max-w-xl bg-white dark:bg-surface-card border-l border-slate-200 dark:border-border-subtle shadow-xl flex flex-col justify-between" data-panel>' +
          '<div class="p-3 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-surface-base">' +
            '<div><h2 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2"><i class="pi pi-file text-sky-600 dark:text-sky-400 text-sm"></i>Alarm Raporu</h2>' +
            '<p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Filtrelenmiş alarmlar için PDF raporu oluştur</p></div>' +
            '<button type="button" data-close class="w-7 h-7 rounded-[2px] flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><i class="pi pi-times text-xs"></i></button>' +
          '</div>' +
          '<div class="p-4 overflow-y-auto flex-1 text-xs text-slate-800 dark:text-slate-200"><div class="space-y-4">' +
            '<div class="flex flex-col gap-1 w-full"><label class="text-xs font-semibold text-slate-700 dark:text-slate-300">Başlangıç Tarihi</label><input type="date" class="scada-input" value="' + today + '" /></div>' +
            '<div class="flex flex-col gap-1 w-full"><label class="text-xs font-semibold text-slate-700 dark:text-slate-300">Grup</label><select class="scada-select"><option>Tüm Gruplar (Soğutma, Enerji, Güvenlik)</option><option>Soğutma Alarmları</option><option>Enerji Alarmları</option></select></div>' +
            '<div class="p-3 rounded-[2px] bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-[11px] space-y-1">' +
              '<div class="flex justify-between"><span class="text-slate-500">Rapor kapsamı:</span><b>' + (state.tab === 'active' ? 'Aktif Alarmlar' : 'Tarihsel Alarmlar') + '</b></div>' +
              '<div class="flex justify-between"><span class="text-slate-500">Kayıt sayısı:</span><b class="font-mono">' + lastFiltered.length + '</b></div>' +
              '<div class="flex justify-between"><span class="text-slate-500">Lokasyon:</span><b>Veri Merkezi / Salon 1</b></div>' +
            '</div>' +
          '</div></div>' +
          '<div class="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-surface-base flex justify-end gap-2">' +
            button({ variant: 'secondary', label: 'Kapat', attrs: 'data-close' }) +
            button({ variant: 'primary', icon: 'pi pi-download', label: 'PDF İndir', attrs: 'data-print' }) +
          '</div>' +
        '</div>' +
      '</div>';
    const close = () => host.remove();
    host.addEventListener('click', e => { if (!e.target.closest('[data-panel]')) close(); });
    host.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    host.querySelector('[data-print]').addEventListener('click', () => { close(); setTimeout(() => window.print(), 150); });
    document.body.appendChild(host);
  }

  // ---------------------------------------------------------------------------
  // Sekme değişimi & ana çizim
  // ---------------------------------------------------------------------------
  function switchTab(tab) {
    if (state.tab === tab) return;
    state.tab = tab;
    state.page = 1;
    state.filters = {};
    state.selected.clear();
    state.ridPin = '';
    state.sortField = 'createdTime';
    state.sortOrder = -1;
    const url = new URL(window.location.href);
    if (tab === 'history') url.searchParams.set('tab', 'history'); else url.searchParams.delete('tab');
    window.history.replaceState(null, '', url.toString());
    DCIM.shell.setActive(tab === 'history' ? 'history' : 'alarms');
    renderAll();
  }

  function renderAll() {
    renderHeader();
    renderSeverityCards();
    renderQuick();
    renderChips();
    renderHead();
    renderBody();
    renderAnalytics();
  }

  renderTableShell();
  renderAll();

  // Canlı akış hissi: son güncelleme saati
  setInterval(() => { document.getElementById('last-refresh').textContent = 'Son güncelleme: ' + DCIM.ui.fmtTime(new Date()); }, 10000);
})();
