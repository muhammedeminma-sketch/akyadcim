/* ==========================================================================
   DCIM Sunum — Mühendislik Kabuğu (NewUICMPEngineeringShellComponent + engineering-nav.ts)
   Sol: kenar çubuğu — başlık ("Mühendislik") ana sayfaya döner, "Menüde ara…" süzgeci, 6 grup
   (CİHAZ VE SAHA · VERİ TOPLAMA VE ALARM · YERLEŞİM VE ŞEMALAR · SİSTEM KONFİGÜRASYONU · OPERASYON ·
   TANILAMA VE BAKIM). Sağ: seçili mühendislik sayfası. Navbardaki "Mühendislik" ana sayfaya (#home) açılır.
   Sayfa seçimi yenilemesiz yapılır; URL hash'i (#data-query-period) derin bağlantıdır.
   Sayfa modülleri (js/engineering/*.js) DCIM.engRegistry[anahtar] = { mount(el, params) → { destroy() } }
   ile kaydolur; bu dosya onlardan SONRA yüklenir. params: hash'teki ?a=b parametreleri
   (ör. #device-list?q=PDU) — URLSearchParams.
   Menü listesi DCIM.engNav olarak dışa açılır (ana sayfa araç kartları aynı listeyi kullanır).
   Sunumda modülü olmayan öğeler (Enerji Modülü Yönetimi, Sistem Test, Proje Envanteri) menüde gösterilmez.
   Eski adresler (app.routes.ts ile aynı): #device-add, #add-device → #device-manager;
   #system-communication, #visual-system-communication → #ayxdb-diagnostics.
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, storage } = DCIM.ui;
  const kit = DCIM.kit;
  DCIM.shell.init({ active: 'engineering' });

  const REGISTRY = DCIM.engRegistry || {};

  // engineering-nav.ts → ENGINEERING_NAV (etiketler messages.tr.json → engineering.items.* / engineering.desc.*)
  const NAV = [
    {
      title: 'CİHAZ VE SAHA', icon: 'pi pi-server',
      items: [
        { key: 'device-list', label: 'Cihaz Listesi', icon: 'pi pi-list', desc: 'Sahadaki cihazları listeleme, düzenleme ve devreden çıkarma.' },
        { key: 'device-manager', label: 'Cihaz Ekle (Model Kütüphanesi)', icon: 'pi pi-database', desc: 'Model kütüphanesindeki şablonla yeni cihaz tanımlama.' },
        { key: 'asset-device-add', label: 'Asset Cihazı Ekleme', icon: 'pi pi-box', desc: 'Envanter (asset) kaydına cihaz ekleme.' },
        { key: 'lnk-import', label: 'Ağ Bağlantılarını İçe Aktar', icon: 'pi pi-share-alt', desc: 'Ağ bağlantı listesini (LNK) dosyadan içe aktarma.' }
      ]
    },
    {
      title: 'VERİ TOPLAMA VE ALARM', icon: 'pi pi-sliders-h',
      items: [
        { key: 'data-query-period', label: 'Veri Sorgulama Periyodu', icon: 'pi pi-sync', desc: 'Cihaz gruplarının sahadan okunma sıklığı (evt_per).' },
        { key: 'data-save-period', label: 'Veri Kayıt Periyodu', icon: 'pi pi-history', desc: 'Ölçümlerin geçmişe yazılma sıklığı (his_per).' },
        { key: 'bulk-settings', label: 'Alarm Eşikleri', icon: 'pi pi-bell', desc: 'Toplu acil/alarm/uyarı eşikleri, gecikmeler ve sigorta eşik politikası.' }
      ]
    },
    {
      title: 'YERLEŞİM VE ŞEMALAR', icon: 'pi pi-th-large',
      items: [
        { key: 'space-edit', label: 'Salon Planı Yönetimi', icon: 'pi pi-th-large', desc: 'Salon yerleşim şemalarını düzenleme.' },
        { key: 'energy-module-edit', label: 'Enerji Modülü Yönetimi', icon: 'pi pi-bolt', desc: 'Enerji modülü tek hat şemalarını düzenleme.' }
      ]
    },
    {
      title: 'SİSTEM KONFİGÜRASYONU', icon: 'pi pi-cog',
      items: [
        { key: 'xml-editor', label: 'Konfigürasyon Editörü', icon: 'pi pi-file-edit', desc: 'AyXDB dokümanlarının özeti; bağlantı, cihaz, blok, nokta ve sınıf düzenleme.' },
        { key: 'sendemail-report', label: 'Email Konfigürasyonu', icon: 'pi pi-envelope', desc: 'Rapor ve bildirim e-postalarının alıcı ve sunucu ayarları.' }
      ]
    },
    {
      title: 'OPERASYON', icon: 'pi pi-briefcase',
      items: [
        { key: 'maintenance-module', label: 'Bakım Modülü', icon: 'pi pi-wrench', desc: 'Periyodik bakım planları ve alarm bakımları.' },
        { key: 'ticket-management', label: 'Ticket Yönetimi', icon: 'pi pi-ticket', desc: 'Arıza ve iş talepleri (ticket) takibi.' }
      ]
    },
    {
      title: 'TANILAMA VE BAKIM', icon: 'pi pi-heart',
      items: [
        { key: 'ayxdb-diagnostics', label: 'AyXDB Tanılama', icon: 'pi pi-chart-line', desc: 'Thread, bağlantı ve cihaz haberleşmesinin canlı tanılaması.' },
        { key: 'system-page', label: 'Sistem Test', icon: 'pi pi-check-circle', desc: 'Sistem bileşenlerinin test sayfası.' },
        { key: 'system-maintenance', label: 'Sistem Bakım', icon: 'pi pi-wrench', desc: 'Sistem bakım işlemleri.' },
        { key: 'user-manual', label: 'Kullanım Kılavuzu', icon: 'pi pi-book', desc: 'Uygulama kullanım kılavuzu ve SSS.' },
        { key: 'project-inventory', label: 'Proje Envanteri', icon: 'pi pi-inbox', desc: 'Projedeki cihaz ve nokta envanteri.' }
      ]
    }
  ];
  // Yalnız sunumda modülü olan öğeler görünür
  const GROUPS = NAV.map(g => Object.assign({}, g, { items: g.items.filter(i => REGISTRY[i.key] && REGISTRY[i.key].mount) }))
    .filter(g => g.items.length);
  DCIM.engNav = GROUPS;

  // Menüde görünmeyen alt rotalar (parent: menüde vurgulanan öğe)
  const HIDDEN = [
    { key: 'home', label: 'Mühendislik', parent: '' },
    { key: 'authorization-management', label: 'Müşteri Sayfaları Yetkilendirme', parent: '' }
  ];
  // app.routes.ts → redirectTo
  const REDIRECT = {
    'device-add': 'device-manager',
    'add-device': 'device-manager',
    'system-communication': 'ayxdb-diagnostics',
    'visual-system-communication': 'ayxdb-diagnostics'
  };
  const MENU_ITEMS = GROUPS.flatMap(g => g.items);
  const ROUTES = MENU_ITEMS.concat(HIDDEN);
  const DEFAULT_KEY = 'home';

  const state = {
    collapsed: storage.get('dcim_eng_sidebar') === '1',
    query: '',
    navKey: 'engineering',
    key: '',
    hash: '',
    instance: null
  };

  const sidebarEl = document.getElementById('eng-sidebar');
  const outlet = document.getElementById('eng-outlet');

  const menuKeyOf = key => { const h = HIDDEN.find(x => x.key === key); return h ? h.parent : key; };
  const norm = s => String(s || '').toLocaleLowerCase('tr-TR');

  function filteredGroups() {
    const q = norm(state.query.trim());
    if (!q) return GROUPS;
    return GROUPS.map(g => Object.assign({}, g, { items: g.items.filter(i => norm(i.label).includes(q) || norm(i.desc).includes(q)) }))
      .filter(g => g.items.length);
  }

  function itemCls(on) {
    return 'flex items-center gap-2 px-2.5 py-1.5 rounded-[2px] border-l-2 text-xs transition-colors' +
      (on ? ' bg-sky-600/10 text-sky-700 dark:text-sky-300 font-semibold border-sky-600'
          : ' border-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800') +
      (state.collapsed ? ' justify-center' : '');
  }

  function renderGroups() {
    const activeMenu = menuKeyOf(state.key);
    const groups = filteredGroups();
    if (!groups.length) return '<div class="px-2 py-3 text-[11px] text-slate-400">Eşleşen menü yok.</div>';
    return groups.map((g, gi) =>
      '<div class="mb-2.5' + (state.collapsed && gi ? ' pt-2 border-t border-slate-200 dark:border-slate-800' : '') + '">' +
        (!state.collapsed ? '<div class="flex items-center gap-1.5 px-2 pt-1 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 select-none"><span class="truncate">' + esc(g.title) + '</span></div>' : '') +
        '<div class="space-y-px">' +
        g.items.map(item => {
          const on = item.key === activeMenu;
          return '<a href="#' + item.key + '" data-eng="' + item.key + '" class="' + itemCls(on) + '" title="' + esc(item.label + ' — ' + item.desc) + '">' +
            '<i class="' + item.icon + ' text-xs shrink-0 ' + (on ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400') + '"></i>' +
            (!state.collapsed ? '<span class="truncate">' + esc(item.label) + '</span>' : '') +
          '</a>';
        }).join('') +
        '</div>' +
      '</div>'
    ).join('');
  }

  function renderSidebar() {
    const homeOn = state.key === 'home';
    const c = state.collapsed;
    sidebarEl.innerHTML =
      '<aside class="bg-white dark:bg-surface-card border-r border-slate-200 dark:border-border-subtle h-full flex flex-col transition-all duration-200 select-none overflow-hidden shrink-0 ' + (c ? 'w-12' : 'w-64') + '">' +
        '<div class="h-12 px-3 border-b border-slate-200 dark:border-border-subtle flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-900/40">' +
          (!c ? '<a href="#home" data-eng-home class="flex items-center gap-2 min-w-0 transition-colors ' + (homeOn ? 'text-sky-600 dark:text-sky-400' : 'text-slate-800 dark:text-slate-200 hover:text-sky-600 dark:hover:text-sky-400') + '" title="Genel Bakış">' +
            '<i class="pi pi-wrench text-sky-500 text-sm shrink-0"></i><span class="text-xs font-bold truncate">Mühendislik</span></a>' : '') +
          '<button type="button" data-sidebar-toggle class="w-7 h-7 rounded-[2px] hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-colors ml-auto" title="' + (c ? 'Genişlet' : 'Daralt') + '">' +
            '<i class="' + (c ? 'pi pi-chevron-right text-xs' : 'pi pi-chevron-left text-xs') + '"></i></button>' +
        '</div>' +
        '<div class="flex-1 overflow-y-auto p-2 space-y-1">' +
          (c ? '<a href="#home" data-eng-home class="flex items-center justify-center h-8 rounded-[2px] mb-1 ' + (homeOn ? 'bg-sky-600/15 text-sky-600 dark:text-sky-400' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800') + '" title="Genel Bakış"><i class="pi pi-home text-xs"></i></a>' : '') +
          (!c ? '<div class="relative mb-2">' +
            '<i class="pi pi-search absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400"></i>' +
            '<input type="text" data-eng-search value="' + esc(state.query) + '" placeholder="Menüde ara…" class="w-full pl-6 pr-6 py-1 text-[11px] bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-700 dark:text-slate-200 focus:outline-none focus:border-sky-500">' +
            '<button type="button" data-eng-search-clear class="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer' + (state.query ? '' : ' hidden') + '"><i class="pi pi-times text-[9px]"></i></button>' +
          '</div>' : '') +
          '<div data-eng-groups>' + renderGroups() + '</div>' +
        '</div>' +
      '</aside>';
    sidebarEl.querySelector('[data-sidebar-toggle]').addEventListener('click', () => {
      state.collapsed = !state.collapsed;
      storage.set('dcim_eng_sidebar', state.collapsed ? '1' : '0');
      renderSidebar();
      window.dispatchEvent(new Event('resize'));
    });
    const input = sidebarEl.querySelector('[data-eng-search]');
    const clear = sidebarEl.querySelector('[data-eng-search-clear]');
    if (input) {
      input.addEventListener('input', () => {
        state.query = input.value;
        clear.classList.toggle('hidden', !state.query);
        sidebarEl.querySelector('[data-eng-groups]').innerHTML = renderGroups();
      });
      clear.addEventListener('click', () => {
        state.query = '';
        input.value = '';
        clear.classList.add('hidden');
        sidebarEl.querySelector('[data-eng-groups]').innerHTML = renderGroups();
        input.focus();
      });
    }
  }

  function parseHash() {
    const raw = decodeURIComponent((window.location.hash || '').replace(/^#/, ''));
    const i = raw.indexOf('?');
    return { key: (i < 0 ? raw : raw.slice(0, i)) || DEFAULT_KEY, query: i < 0 ? '' : raw.slice(i + 1) };
  }

  function open() {
    const h = parseHash();
    let key = h.key;
    if (REDIRECT[key]) {
      key = REDIRECT[key];
      history.replaceState(null, '', '#' + key + (h.query ? '?' + h.query : ''));
    }
    if (!ROUTES.some(r => r.key === key)) key = DEFAULT_KEY;
    if (state.hash === window.location.hash && state.instance) return;
    if (state.instance && state.instance.destroy) {
      try { state.instance.destroy(); } catch (e) { console.warn(e); }
    }
    state.instance = null;
    const prevKey = state.key;
    state.key = key;
    state.hash = window.location.hash;
    if (prevKey !== key) {
      renderSidebar();
      // İzleme › Ticket Yönetimi aynı ekranı açar: üst menüde ilgili öğe vurgulanır
      const navKey = key === 'ticket-management' ? 'tickets' : 'engineering';
      if (state.navKey !== navKey) { state.navKey = navKey; DCIM.shell.setActive(navKey); }
    }
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
    state.instance = mod.mount(host, new URLSearchParams(h.query)) || null;
  }

  // Modüller arası geçiş: DCIM.eng.go('device-manager', { cabinet: '1NA06' })
  DCIM.eng = {
    go(key, params) {
      const q = params ? new URLSearchParams(params).toString() : '';
      window.location.hash = key + (q ? '?' + q : '');
    },
    nav: GROUPS
  };

  window.addEventListener('hashchange', open);

  renderSidebar();
  open();
})();
