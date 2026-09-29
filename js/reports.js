/* ==========================================================================
   DCIM Sunum — Raporlama Kabuğu (NewUICMPReportingShellComponent)
   Sol: Rapor Kataloğu (app-sidebar, arama, 3 grup). Sağ: seçili rapor.
   Rapor seçimi sayfa yenilenmeden yapılır; URL hash'i (#energy-pue) derin bağlantıdır.
   Rapor modülleri (js/reports/*.js) DCIM.reportRegistry[anahtar] = { mount(el) → { destroy() } }
   ile kaydolur; bu dosya onlardan SONRA yüklenir.
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, storage } = DCIM.ui;
  const kit = DCIM.kit;
  DCIM.shell.init({ active: 'reports' });

  const REGISTRY = DCIM.reportRegistry || {};

  // reporting-shell.component.ts → reportGroups (etiketler reportingShell.* çevirileri)
  const REPORT_GROUPS = [
    {
      title: 'Enerji',
      items: [
        { key: 'energy-pue', label: 'PUE Raporu', icon: 'pi pi-chart-line' },
        { key: 'cue', label: 'CUE Raporu', icon: 'pi pi-globe' },
        { key: 'ups-module', label: 'UPS Raporu', icon: 'pi pi-sitemap' },
        { key: 'ups', label: 'SDP Raporu', icon: 'pi pi-server' },
        { key: 'transformer', label: 'Trafo Raporu', icon: 'pi pi-database' },
        { key: 'switch-redundancy', label: 'Şalter Yük Yedeklilik Raporu', icon: 'pi pi-power-off' },
        { key: 'capacity', label: 'Kapasite Raporu', icon: 'pi pi-percentage' }
      ]
    },
    {
      title: 'Beyaz Alan',
      items: [
        { key: 'pdu-inventory', label: 'PDU Envanter Raporu', icon: 'pi pi-list' },
        { key: 'energy', label: 'PDU Güç Raporu', icon: 'pi pi-bolt' },
        { key: 'failover', label: 'PDU Yük Raporu', icon: 'pi pi-sliders-h' },
        { key: 'maxpow', label: 'Maksimum Güç Raporu', icon: 'pi pi-chart-bar' }
      ]
    },
    {
      title: 'Soğutma',
      items: [
        { key: 'climate', label: 'Klima Raporu', icon: 'pi pi-cog' },
        { key: 'cabin', label: 'Sensör Raporu', icon: 'pi pi-box' },
        { key: 'it-power', label: 'IT Güç Tüketim Raporu', icon: 'pi pi-desktop' }
      ]
    }
  ];
  const ALL_ITEMS = REPORT_GROUPS.flatMap(g => g.items);
  const DEFAULT_KEY = 'energy-pue';

  const state = {
    collapsed: storage.get('dcim_report_sidebar') === '1',
    query: '',
    key: '',
    instance: null
  };

  const sidebarEl = document.getElementById('report-sidebar');
  const outlet = document.getElementById('report-outlet');

  function filteredGroups() {
    const q = state.query.trim().toLocaleLowerCase('tr-TR');
    if (!q) return REPORT_GROUPS;
    return REPORT_GROUPS
      .map(g => ({ title: g.title, items: g.items.filter(i => i.label.toLocaleLowerCase('tr-TR').includes(q) || g.title.toLocaleLowerCase('tr-TR').includes(q) || i.key.includes(q)) }))
      .filter(g => g.items.length);
  }

  function renderGroups() {
    const groups = filteredGroups();
    if (!groups.length) return state.collapsed ? '' : kit.emptyState({ message: 'Eşleşen rapor yok', icon: 'pi pi-search', compact: true });
    return groups.map(g =>
      '<div class="mb-3 space-y-1">' +
        (!state.collapsed ? '<div class="px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">' + esc(g.title) + '</div>' : '') +
        g.items.map(item => {
          const on = item.key === state.key;
          return '<a href="#' + item.key + '" data-report="' + item.key + '" class="flex items-center gap-2 px-2.5 py-1.5 rounded-[2px] text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors' +
            (on ? ' bg-sky-600/15 text-sky-600 dark:text-sky-400 font-bold border-l-2 border-sky-600' : '') + '" title="' + esc(item.label) + '">' +
            '<i class="' + item.icon + ' text-xs text-sky-500 shrink-0"></i>' +
            (!state.collapsed ? '<span class="truncate">' + esc(item.label) + '</span>' : '') +
          '</a>';
        }).join('') +
      '</div>'
    ).join('');
  }

  function renderSidebar() {
    const search = state.collapsed ? '' :
      '<div class="mb-2 px-1"><div class="relative">' +
        '<i class="pi pi-search absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>' +
        '<input type="text" data-report-search value="' + esc(state.query) + '" placeholder="Rapor ara..." class="w-full pl-7 pr-2 py-1 text-[11px] bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-border-subtle rounded-[2px] text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-500" />' +
      '</div></div>';
    const footer = state.collapsed ? '' :
      '<div class="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono px-1"><span>' + ALL_ITEMS.length + ' rapor</span><span>RPS · Mock</span></div>';
    sidebarEl.innerHTML = kit.sidebar({ title: 'Rapor Kataloğu', icon: 'pi pi-file', collapsed: state.collapsed, body: search + '<div data-report-groups>' + renderGroups() + '</div>', footer });

    sidebarEl.querySelector('[data-sidebar-toggle]').addEventListener('click', () => {
      state.collapsed = !state.collapsed;
      storage.set('dcim_report_sidebar', state.collapsed ? '1' : '0');
      renderSidebar();
      window.dispatchEvent(new Event('resize'));
    });
    const input = sidebarEl.querySelector('[data-report-search]');
    if (input) input.addEventListener('input', () => {
      state.query = input.value;
      sidebarEl.querySelector('[data-report-groups]').innerHTML = renderGroups();
    });
  }

  function markActive() {
    sidebarEl.querySelectorAll('[data-report]').forEach(a => {
      const on = a.getAttribute('data-report') === state.key;
      ['bg-sky-600/15', 'text-sky-600', 'dark:text-sky-400', 'font-bold', 'border-l-2', 'border-sky-600'].forEach(c => a.classList.toggle(c, on));
    });
  }

  function open(key) {
    if (!ALL_ITEMS.some(i => i.key === key)) key = DEFAULT_KEY;
    if (state.key === key && state.instance) return;
    if (state.instance && state.instance.destroy) {
      try { state.instance.destroy(); } catch (e) { console.warn(e); }
    }
    state.instance = null;
    state.key = key;
    markActive();
    outlet.innerHTML = '';
    outlet.scrollTop = 0;
    const item = ALL_ITEMS.find(i => i.key === key);
    document.title = 'DCIM TT — ' + item.label;
    const mod = REGISTRY[key];
    if (!mod || !mod.mount) {
      outlet.innerHTML = kit.emptyState({ message: item.label + ' bu sunumda hazır değil', icon: 'pi pi-file' });
      return;
    }
    const host = document.createElement('div');
    host.className = 'flex flex-col min-h-0';
    outlet.appendChild(host);
    state.instance = mod.mount(host) || null;
  }

  function fromHash() { return decodeURIComponent((window.location.hash || '').replace(/^#/, '')) || DEFAULT_KEY; }

  window.addEventListener('hashchange', () => open(fromHash()));

  renderSidebar();
  open(fromHash());
})();
