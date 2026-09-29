/* ==========================================================================
   DCIM Sunum — Mühendislik Kabuğu (NewUICMPEngineeringShellComponent)
   Sol: app-sidebar ("Mühendislik", 3 grup). Sağ: seçili mühendislik sayfası.
   Sayfa seçimi yenilemesiz yapılır; URL hash'i (#data-query-period) derin bağlantıdır.
   Sayfa modülleri (js/engineering/*.js) DCIM.engRegistry[anahtar] = { mount(el, params) → { destroy() } }
   ile kaydolur; bu dosya onlardan SONRA yüklenir. params: hash'teki ?a=b parametreleri
   (ör. #device-list?q=PDU) — URLSearchParams.
   Sunum kapsamı dışında bırakılan sayfalar menüde görünür ama devre dışıdır (üst menüyle aynı).
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, storage } = DCIM.ui;
  const kit = DCIM.kit;
  DCIM.shell.init({ active: 'engineering' });

  const REGISTRY = DCIM.engRegistry || {};

  // engineering-shell.component.ts → groups (etiketler messages.tr.json → engineering.*)
  // Tıklanamaz deaktif sayfalar, Tarihsel Noktalar, Proje Envanteri ve Admin Test grubu kaldırıldı / yorum satırına alındı.
  const GROUPS = [
    {
      title: 'ŞEMA YÖNETİMİ',
      items: [
        // { key: 'xml-editor', label: 'Konfigürasyon Editörü', icon: 'pi pi-file-edit', off: true },
        // { key: 'space-edit', label: 'Salon Planı Yönetimi', icon: 'pi pi-th-large', off: true },
        // { key: 'energy-module-edit', label: 'Enerji Modülü Yönetimi', icon: 'pi pi-bolt', off: true },
        { key: 'data-query-period', label: 'Veri Sorgulama Periyodu', icon: 'pi pi-clock' },
        { key: 'data-save-period', label: 'Veri Kayıt Periyodu', icon: 'pi pi-save' },
        { key: 'bulk-settings', label: 'Toplu Parametre Ayarları', icon: 'pi pi-sliders-h' }
      ]
    },
    {
      title: 'GENEL AYARLAR',
      items: [
        { key: 'add-device', label: 'Cihaz Tanımlama Formu', icon: 'pi pi-plus-circle' },
        { key: 'asset-device-add', label: 'Asset Cihazı Ekleme', icon: 'pi pi-server' },
        { key: 'device-list', label: 'Cihaz Listesi', icon: 'pi pi-list' },
        // { key: 'report-historical-points', label: 'Tarihsel Noktalar', icon: 'pi pi-map-marker' },
        { key: 'maintenance-module', label: 'Bakım Modülü', icon: 'pi pi-cog' },
        { key: 'ticket-management', label: 'Ticket Yönetimi', icon: 'pi pi-ticket' },
        { key: 'sendemail-report', label: 'Email Konfigürasyonu', icon: 'pi pi-envelope' },
        { key: 'authorization-management', label: 'Yetkilendirme Yönetimi', icon: 'pi pi-shield' }
      ]
    }
    /* ADMIN TEST kaldırıldı:
    {
      title: 'ADMIN TEST',
      items: [
        { key: 'ayxdb-diagnostics', label: 'AyXDB Tanılama', icon: 'pi pi-chart-line', off: true },
        { key: 'project-inventory', label: 'Proje Envanteri', icon: 'pi pi-box' },
        { key: 'system-page', label: 'Sistem Test', icon: 'pi pi-check-circle', off: true },
        { key: 'system-maintenance', label: 'Sistem Bakım', icon: 'pi pi-wrench', off: true },
        { key: 'cdr-test', label: 'TTVM Entegrasyon Test', icon: 'pi pi-send', off: true }
      ]
    }
    */
  ];
  // Menüde görünmeyen alt rotalar (parent: menüde vurgulanan öğe)
  // add-device → router.navigate(['/dcim/engineering/device-add']) (PDU Ekleme Formu)
  const HIDDEN = [
    { key: 'device-add', label: 'PDU Ekleme Formu', parent: 'add-device' }
  ];
  const MENU_ITEMS = GROUPS.flatMap(g => g.items);
  const ROUTES = MENU_ITEMS.filter(i => !i.off).concat(HIDDEN);
  // Orijinalde '' → space-edit; sunumda kapsam dışı olduğu için ilk etkin sayfa
  const DEFAULT_KEY = 'data-query-period';

  const ACTIVE_CLS = ['bg-sky-600/15', 'text-sky-600', 'dark:text-sky-400', 'font-bold', 'border-l-2', 'border-sky-600'];
  const OFF_CLS = 'opacity-40 pointer-events-none cursor-not-allowed';

  const state = {
    collapsed: storage.get('dcim_eng_sidebar') === '1',
    key: '',
    hash: '',
    instance: null
  };

  const sidebarEl = document.getElementById('eng-sidebar');
  const outlet = document.getElementById('eng-outlet');

  const menuKeyOf = key => { const h = HIDDEN.find(x => x.key === key); return h ? h.parent : key; };

  function renderGroups() {
    const activeMenu = menuKeyOf(state.key);
    return GROUPS.map(g => {
      const activeItems = g.items.filter(item => !item.off);
      if (!activeItems.length) return '';
      return '<div class="mb-3 space-y-1">' +
        (!state.collapsed ? '<div class="px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">' + esc(g.title) + '</div>' : '') +
        activeItems.map(item => {
          const on = item.key === activeMenu;
          return '<a href="#' + item.key + '" data-eng="' + item.key + '"' +
            ' class="flex items-center gap-2 px-2.5 py-1.5 rounded-[2px] text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors' +
            (on ? ' ' + ACTIVE_CLS.join(' ') : '') + '" title="' + esc(item.label) + '">' +
            '<i class="' + item.icon + ' text-xs text-sky-500 shrink-0"></i>' +
            (!state.collapsed ? '<span class="truncate">' + esc(item.label) + '</span>' : '') +
          '</a>';
        }).join('') +
      '</div>';
    }).join('');
  }

  function renderSidebar() {
    sidebarEl.innerHTML = kit.sidebar({ title: 'Mühendislik', icon: 'pi pi-wrench', collapsed: state.collapsed, body: renderGroups(), footer: '' });
    sidebarEl.querySelector('[data-sidebar-toggle]').addEventListener('click', () => {
      state.collapsed = !state.collapsed;
      storage.set('dcim_eng_sidebar', state.collapsed ? '1' : '0');
      renderSidebar();
      window.dispatchEvent(new Event('resize'));
    });
  }

  function markActive() {
    const activeMenu = menuKeyOf(state.key);
    sidebarEl.querySelectorAll('[data-eng]').forEach(a => {
      const on = a.getAttribute('data-eng') === activeMenu;
      ACTIVE_CLS.forEach(c => a.classList.toggle(c, on));
    });
  }

  function parseHash() {
    const raw = decodeURIComponent((window.location.hash || '').replace(/^#/, ''));
    const i = raw.indexOf('?');
    return { key: (i < 0 ? raw : raw.slice(0, i)) || DEFAULT_KEY, params: new URLSearchParams(i < 0 ? '' : raw.slice(i + 1)) };
  }

  function open() {
    const h = parseHash();
    let key = h.key;
    if (!ROUTES.some(r => r.key === key)) key = DEFAULT_KEY;
    if (state.hash === window.location.hash && state.instance) return;
    if (state.instance && state.instance.destroy) {
      try { state.instance.destroy(); } catch (e) { console.warn(e); }
    }
    state.instance = null;
    state.key = key;
    state.hash = window.location.hash;
    markActive();
    outlet.innerHTML = '';
    const route = ROUTES.find(r => r.key === key);
    document.title = 'DCIM TT — ' + route.label;
    const mod = REGISTRY[key];
    if (!mod || !mod.mount) {
      outlet.innerHTML = '<div class="p-3 md:p-4">' + kit.emptyState({ message: route.label + ' bu sunumda hazır değil', icon: 'pi pi-wrench' }) + '</div>';
      return;
    }
    const host = document.createElement('div');
    host.className = 'flex-1 min-h-0 flex flex-col overflow-y-auto';
    outlet.appendChild(host);
    state.instance = mod.mount(host, h.params) || null;
  }

  // Modüller arası geçiş: DCIM.eng.go('device-add', { cabinet: '1AV42' })
  DCIM.eng = {
    go(key, params) {
      const q = params ? new URLSearchParams(params).toString() : '';
      window.location.hash = key + (q ? '?' + q : '');
    }
  };

  window.addEventListener('hashchange', open);

  renderSidebar();
  open();
})();
