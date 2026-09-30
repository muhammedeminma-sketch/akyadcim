/* ==========================================================================
   DCIM Sunum — Ortak Çatı (NewUiShellComponent karşılığı) + UI yardımcıları
   - Üst başlık (logo, sekmeler, lokasyon rozeti, saat, aktif alarm, PDF, kullanıcı menüsü)
   - Tema (koyu/açık) ve ekran ölçeği (NewUiThemeService karşılığı)
   - Dialog, toast, status badge, tarih biçimleme yardımcıları
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});

  // ---------------------------------------------------------------------------
  // Genel yardımcılar
  // ---------------------------------------------------------------------------
  const esc = v =>
    String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const pad = n => String(n).padStart(2, '0');
  const fmtDateTime = d => {
    const x = d instanceof Date ? d : new Date(d);
    if (isNaN(x.getTime())) return '-';
    return pad(x.getDate()) + '.' + pad(x.getMonth() + 1) + '.' + x.getFullYear() + ' ' + pad(x.getHours()) + ':' + pad(x.getMinutes()) + ':' + pad(x.getSeconds());
  };
  const fmtTime = d => {
    const x = d instanceof Date ? d : new Date(d);
    return pad(x.getHours()) + ':' + pad(x.getMinutes()) + ':' + pad(x.getSeconds());
  };
  const fmtDateKey = d => {
    const x = d instanceof Date ? d : new Date(d);
    return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
  };
  const fmtNum = (n, digits) => Number(n).toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

  const storage = {
    get(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } },
    set(key, val) { try { window.localStorage.setItem(key, val); } catch (e) { /* yok say */ } },
    sessionGet(key) { try { return window.sessionStorage.getItem(key); } catch (e) { return null; } },
    sessionSet(key, val) { try { window.sessionStorage.setItem(key, val); } catch (e) { /* yok say */ } },
    sessionRemove(key) { try { window.sessionStorage.removeItem(key); } catch (e) { /* yok say */ } }
  };

  // ---------------------------------------------------------------------------
  // Tema & ölçek (NewUiThemeService ile aynı anahtarlar)
  // ---------------------------------------------------------------------------
  const SCALE_LEVELS = [75, 90, 100, 115, 130];
  const theme = {
    mode() { return document.documentElement.classList.contains('dark') ? 'dark' : 'light'; },
    apply(mode) {
      const inactive = mode === 'dark' ? 'light' : 'dark';
      [document.documentElement, document.body].forEach(el => {
        if (!el) return;
        el.classList.remove(inactive);
        el.classList.add(mode);
      });
      document.dispatchEvent(new CustomEvent('dcim:theme', { detail: mode }));
    },
    toggle() {
      const next = theme.mode() === 'dark' ? 'light' : 'dark';
      storage.set('akya_theme_mode', next);
      theme.apply(next);
    },
    scale() {
      const s = parseInt(storage.get('akya_ui_scale') || '100', 10);
      return SCALE_LEVELS.indexOf(s) >= 0 ? s : 100;
    },
    setScale(s) {
      storage.set('akya_ui_scale', String(s));
      document.documentElement.style.setProperty('--app-scale-factor', String(s / 100));
      document.documentElement.style.fontSize = s + '%';
      document.dispatchEvent(new CustomEvent('dcim:scale', { detail: s }));
    },
    init() {
      theme.apply(storage.get('akya_theme_mode') === 'light' ? 'light' : 'dark');
      theme.setScale(theme.scale());
    }
  };

  // ---------------------------------------------------------------------------
  // Oturum (login.js yazar)
  // ---------------------------------------------------------------------------
  const session = {
    user() {
      const raw = storage.sessionGet('dcim_user') || storage.get('dcim_remember_user');
      if (raw) {
        try { return JSON.parse(raw); } catch (e) { /* yok say */ }
      }
      return { usr: 'operator', fullname: 'DCIM Operatör' };
    },
    initials(u) {
      const name = (u && (u.fullname || u.usr)) || 'Guest';
      return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toLocaleUpperCase('tr-TR')).join('') || 'G';
    }
  };

  // ---------------------------------------------------------------------------
  // Status badge (AppStatusBadgeComponent)
  // ---------------------------------------------------------------------------
  function badgeLabel(s) {
    switch (s) {
      case 'alarm': case 'critical': case 'kritik': case 'acil': case 'emergency': return 'Alarm';
      case 'warning': case 'uyarı': case 'major': case 'majör': case 'minor': case 'minör': return 'Uyarı';
      case 'koptu': return 'Koptu';
      case 'kayıp': case 'lost': case 'dataerr': case 'data_err': return 'Veri Alınamıyor';
      case 'normal': return 'Normal';
      case 'info': case 'bilgi': return 'Bilgi';
      case 'maintenance': return 'Bakımda';
      default: return s.charAt(0).toUpperCase() + s.slice(1);
    }
  }
  function badgeClass(s) {
    switch (s) {
      case 'alarm': case 'critical': case 'kritik': case 'acil': case 'emergency': case 'danger':
        return 'bg-rose-500/10 text-rose-600 border-rose-300 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/50';
      case 'warning': case 'uyarı': case 'major': case 'majör': case 'minor': case 'minör':
        return 'bg-amber-500/10 text-amber-700 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/50';
      case 'koptu': case 'kayıp': case 'lost': case 'dataerr': case 'data_err':
        return 'bg-orange-500/10 text-orange-700 border-orange-300 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-500/50';
      case 'normal': case 'active': case 'completed':
        return 'bg-emerald-500/10 text-emerald-700 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/50';
      case 'info': case 'bilgi':
        return 'bg-sky-500/10 text-sky-700 border-sky-300 dark:bg-sky-500/20 dark:text-sky-300 dark:border-sky-500/50';
      case 'maintenance':
        return 'bg-purple-500/10 text-purple-700 border-purple-300 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/50';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
    }
  }
  function badgeDot(s) {
    switch (s) {
      case 'alarm': case 'critical': case 'kritik': case 'acil': case 'emergency': case 'danger': return 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]';
      case 'warning': case 'uyarı': case 'major': case 'majör': case 'minor': case 'minör': return 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]';
      case 'koptu': case 'kayıp': case 'lost': case 'dataerr': case 'data_err': return 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]';
      case 'normal': case 'active': case 'completed': return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]';
      case 'info': case 'bilgi': return 'bg-sky-500 shadow-[0_0_8px_rgba(2,132,199,0.8)]';
      case 'maintenance': return 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]';
      default: return 'bg-slate-400';
    }
  }
  function statusBadge(status, label) {
    const s = String(status || 'normal').toLowerCase();
    return '<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] text-[11px] font-bold tracking-wide border transition-all ' + badgeClass(s) + '">' +
      '<span class="w-1.5 h-1.5 rounded-full animate-pulse ' + badgeDot(s) + '"></span>' + esc(label || badgeLabel(s)) + '</span>';
  }

  // ---------------------------------------------------------------------------
  // app-button (AppButtonComponent) HTML üretici
  // ---------------------------------------------------------------------------
  function buttonClasses(variant, size, iconOnly) {
    const base = 'inline-flex items-center justify-center font-bold tracking-tight rounded-[2px] transition-all focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50 disabled:cursor-not-allowed select-none';
    let sz;
    if (iconOnly) sz = size === 'sm' ? 'w-6 h-6 text-xs p-1' : size === 'lg' ? 'w-9 h-9 text-base p-2' : 'w-7.5 h-7.5 text-sm p-1.5';
    else sz = size === 'sm' ? 'px-2 py-1 text-[11px] gap-1' : size === 'lg' ? 'px-4 py-2 text-sm gap-2' : 'px-3 py-1.5 text-xs gap-1.5';
    const variants = {
      secondary: 'bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:border-slate-700',
      ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/70 border border-transparent',
      danger: 'bg-rose-600 hover:bg-rose-700 text-white border border-rose-600 shadow-2xs',
      primary: 'bg-sky-600 hover:bg-sky-700 text-white border border-sky-600 shadow-2xs dark:bg-sky-600 dark:hover:bg-sky-500'
    };
    return base + ' ' + sz + ' ' + (variants[variant] || variants.primary);
  }
  function button(opts) {
    const o = Object.assign({ variant: 'primary', size: 'md', icon: '', label: '', attrs: '' }, opts);
    return '<button type="button" class="' + buttonClasses(o.variant, o.size, false) + '" ' + o.attrs + '>' +
      (o.icon ? '<i class="' + o.icon + ' text-current shrink-0"></i>' : '') +
      (o.label ? '<span class="truncate">' + esc(o.label) + '</span>' : '') + '</button>';
  }

  // ---------------------------------------------------------------------------
  // Dialog (AppDialogComponent)
  // ---------------------------------------------------------------------------
  const DIALOG_ICON = { warning: 'pi pi-exclamation-triangle', danger: 'pi pi-exclamation-circle', confirm: 'pi pi-check-circle', info: 'pi pi-info-circle' };
  const DIALOG_ICON_CLASS = {
    warning: 'bg-amber-500/10 text-amber-500 border border-amber-500/20',
    danger: 'bg-rose-500/10 text-rose-500 border border-rose-500/20',
    confirm: 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20',
    info: 'bg-sky-500/10 text-sky-500 border border-sky-500/20'
  };
  const DIALOG_CONFIRM_CLASS = {
    danger: 'bg-rose-600 hover:bg-rose-700 text-white',
    warning: 'bg-amber-600 hover:bg-amber-700 text-white',
    confirm: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    info: 'bg-sky-600 hover:bg-sky-700 text-white'
  };

  function dialog(opts) {
    const o = Object.assign({ title: '', subtitle: '', variant: 'info', body: '', confirmLabel: 'Tamam', cancelLabel: 'İptal', showCancel: true, confirmIcon: '', maxWidth: 'max-w-lg', onConfirm: null, onCancel: null, onClose: null }, opts);
    const host = document.createElement('div');
    host.className = 'fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 flex items-center justify-center p-4 animate-fade-in';
    host.innerHTML =
      '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl w-full ' + o.maxWidth + ' overflow-hidden transform transition-all animate-modal-pop" data-dialog-panel>' +
        '<div class="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-900/60">' +
          '<div class="flex items-center gap-2.5">' +
            '<span class="w-7 h-7 rounded-[2px] flex items-center justify-center text-xs ' + (DIALOG_ICON_CLASS[o.variant] || DIALOG_ICON_CLASS.info) + '"><i class="' + (DIALOG_ICON[o.variant] || DIALOG_ICON.info) + '"></i></span>' +
            '<div><h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">' + esc(o.title) + '</h3>' +
            (o.subtitle ? '<p class="text-[11px] text-slate-500 dark:text-slate-400">' + esc(o.subtitle) + '</p>' : '') + '</div>' +
          '</div>' +
          '<button type="button" data-dialog-close class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-[2px] hover:bg-slate-100 dark:hover:bg-slate-800"><i class="pi pi-times"></i></button>' +
        '</div>' +
        '<div class="p-5 text-xs text-slate-700 dark:text-slate-300 max-h-[70vh] overflow-y-auto" data-dialog-body>' + o.body + '</div>' +
        '<div class="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-end gap-2">' +
          (o.showCancel ? '<button type="button" data-dialog-cancel class="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-[2px] transition-colors">' + esc(o.cancelLabel) + '</button>' : '') +
          '<button type="button" data-dialog-confirm class="px-3 py-1.5 text-xs font-semibold text-white rounded-[2px] transition-all flex items-center gap-1.5 ' + (DIALOG_CONFIRM_CLASS[o.variant] || DIALOG_CONFIRM_CLASS.info) + '">' +
            (o.confirmIcon ? '<i class="' + o.confirmIcon + '"></i>' : '') + esc(o.confirmLabel) + '</button>' +
        '</div>' +
      '</div>';
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      host.remove();
      if (o.onClose) o.onClose();
    };
    const onKey = e => { if (e.key === 'Escape') close(); };
    host.addEventListener('click', e => { if (e.target === host) close(); });
    host.querySelector('[data-dialog-close]').addEventListener('click', close);
    const cancelBtn = host.querySelector('[data-dialog-cancel]');
    if (cancelBtn) cancelBtn.addEventListener('click', () => { if (o.onCancel) o.onCancel(); close(); });
    host.querySelector('[data-dialog-confirm]').addEventListener('click', () => {
      const keepOpen = o.onConfirm ? o.onConfirm(host) === false : false;
      if (!keepOpen) close();
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(host);
    return { el: host, body: host.querySelector('[data-dialog-body]'), close };
  }

  // ---------------------------------------------------------------------------
  // Toast (ngx-toastr yerine)
  // ---------------------------------------------------------------------------
  const TOAST_STYLE = {
    success: { icon: 'pi pi-check-circle', cls: 'border-emerald-500/40 text-emerald-300', iconCls: 'text-emerald-400' },
    error: { icon: 'pi pi-exclamation-circle', cls: 'border-rose-500/40 text-rose-300', iconCls: 'text-rose-400' },
    warning: { icon: 'pi pi-exclamation-triangle', cls: 'border-amber-500/40 text-amber-300', iconCls: 'text-amber-400' },
    info: { icon: 'pi pi-info-circle', cls: 'border-sky-500/40 text-sky-300', iconCls: 'text-sky-400' }
  };
  function toast(message, type, title) {
    let hostEl = document.querySelector('.dcim-toast-host');
    if (!hostEl) {
      hostEl = document.createElement('div');
      hostEl.className = 'dcim-toast-host';
      document.body.appendChild(hostEl);
    }
    const st = TOAST_STYLE[type] || TOAST_STYLE.info;
    const el = document.createElement('div');
    el.className = 'dcim-toast min-w-64 max-w-sm px-3 py-2.5 rounded-[2px] bg-slate-900/95 border shadow-2xl text-xs flex items-start gap-2.5 ' + st.cls;
    el.innerHTML = '<i class="' + st.icon + ' text-sm mt-0.5 ' + st.iconCls + '"></i><div class="min-w-0">' +
      (title ? '<div class="font-extrabold text-slate-100">' + esc(title) + '</div>' : '') +
      '<div class="text-slate-300 font-medium">' + esc(message) + '</div></div>';
    hostEl.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity 250ms'; el.style.opacity = '0'; setTimeout(() => el.remove(), 260); }, 3600);
  }

  // ---------------------------------------------------------------------------
  // Üst Başlık (new-ui-shell.component.html)
  // ---------------------------------------------------------------------------
  // navigation.config.ts → NAV_CATEGORIES (etiketler messages.tr.json'dan).
  // href'i olmayan öğeler sunumda hazır değildir: menüde görünür ama tıklanamaz.
  // "Kabin Yönetimi" orijinal menüde yoktur (kabinden açılır); sunum için Varlıklar altına eklendi.
  const NAV_CATEGORIES = [
    {
      label: 'Operasyon', icon: 'pi pi-map', items: [
        { key: '2d', label: 'Dijital İkiz (2D)', icon: 'pi pi-map', href: '2d.html' },
        { key: '3d', label: 'Dijital İkiz (3D)', icon: 'pi pi-box', href: '3d.html' },
        { key: 'work-orders', label: 'İş Emirleri', icon: 'pi pi-list-check', href: 'work-orders.html' },
        { key: 'customers', label: 'Müşteri Eşleştirme', icon: 'pi pi-users', href: 'customer-pages.html' }
      ]
    },
    {
      label: 'Varlıklar', icon: 'pi pi-server', items: [
        // Orijinalde all-assets'e gider; sunumda eşleşen müşteri listesine bağlandı
        { key: 'customer-list', label: 'Müşteri Listesi', icon: 'pi pi-server', href: 'customer-pages.html?tab=matched' },
        { key: 'pdu', label: 'PDU Detay Sayfası', icon: 'pi pi-bolt', href: 'pdu-detail.html' },
        { key: 'locations', label: 'Lokasyon Şeması', icon: 'pi pi-building', href: 'location-list.html' },
        { key: 'models', label: 'Model Kütüphanesi', icon: 'pi pi-tags', href: 'category-list.html' }
      ]
    },
    {
      label: 'Enerji', icon: 'pi pi-bolt', items: [
        { key: 'energy', label: 'Enerji Genel Görünüm', icon: 'pi pi-bolt', href: 'energy.html' },
        { key: 'connectivity', label: 'SDP Kablolama Topolojisi', icon: 'pi pi-sitemap', href: 'connectivity.html' }
      ]
    },
    {
      label: 'İzleme', icon: 'pi pi-bell', items: [
        { key: 'alarms', label: 'Aktif Alarmlar', icon: 'pi pi-exclamation-triangle', href: 'alarms.html' },
        { key: 'history', label: 'Tarihsel Alarmlar', icon: 'pi pi-history', href: 'alarms.html?tab=history' },
        { key: 'events', label: 'Otonom Olaylar', icon: 'pi pi-history', href: 'events.html' },
        { key: 'telemetry', label: 'Telemetri Noktaları', icon: 'pi pi-circle-fill', href: 'telemetry-points.html' },
        { key: 'health', label: 'Sistem Sağlığı', icon: 'pi pi-heart-fill', href: 'system-health.html' },
        { key: 'locks', label: 'Kapak Kilitleri', icon: 'pi pi-lock', href: 'locks.html' }
      ]
    },
    { key: 'reports', label: 'Raporlar', icon: 'pi pi-file', href: 'reports.html' },
    { key: 'engineering', label: 'Mühendislik', icon: 'pi pi-wrench', href: 'engineering.html' },
    {
      label: 'Yönetim', icon: 'pi pi-cog', items: [
        { key: 'accounts', label: 'Kullanıcı Ayarları', icon: 'pi pi-users', href: 'account-settings.html' },
        { key: 'permissions', label: 'Yetki Ayarları', icon: 'pi pi-shield', href: 'permission-settings.html' },
        { key: 'lock-auth', label: 'Kilit Yetkilendirme', icon: 'pi pi-key', href: 'lock-authorization.html' },
        { key: 'audit', label: 'Audit ve Loglar', icon: 'pi pi-book', href: 'audit-logs.html' }
      ]
    }
  ];
  const NAV_DISABLED = 'opacity-40 pointer-events-none cursor-not-allowed';
  const NAV_ACTIVE = 'border-b-2 border-sky-600 text-sky-600 dark:text-sky-400 font-bold';
  const NAV_IDLE = 'border-b-2 border-transparent text-slate-700 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 font-semibold';
  let openDropdown = '';

  function renderNav(active) {
    return NAV_CATEGORIES.map(cat => {
      if (!cat.items) {
        if (!cat.href) return '';
        const cls = cat.key && cat.key === active ? NAV_ACTIVE : NAV_IDLE;
        return '<a href="' + cat.href + '" class="' + cls + ' px-2.5 py-3 h-full transition-all flex items-center"><span>' + esc(cat.label) + '</span></a>';
      }
      const activeItems = cat.items.filter(i => i.href);
      if (!activeItems.length) return '';
      const catActive = activeItems.some(i => i.key && i.key === active);
      const isOpen = openDropdown === cat.label;
      const items = activeItems.map(item => {
        const on = item.key && item.key === active;
        const cls = 'px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-2 transition-colors' +
          (on ? ' bg-sky-600/10 text-sky-600 dark:text-sky-400 font-bold' : '');
        return '<a href="' + item.href + '" class="' + cls + '" title="' + esc(item.label) + '"><span>' + esc(item.label) + '</span></a>';
      }).join('');
      return '<div class="relative h-full flex items-center">' +
        '<button type="button" data-nav-toggle="' + esc(cat.label) + '" class="' + (catActive || isOpen ? NAV_ACTIVE : NAV_IDLE) + ' px-2.5 py-3 h-full transition-all flex items-center gap-1 text-xs cursor-pointer">' +
          '<span>' + esc(cat.label) + '</span><i class="pi pi-chevron-down text-[8px] opacity-60"></i>' +
        '</button>' +
        (isOpen ? '<div data-nav-menu class="absolute left-0 top-full mt-0.5 w-48 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 py-1 text-xs divide-y divide-slate-100 dark:divide-slate-800 animate-fade-in"><div class="py-1">' + items + '</div></div>' : '') +
      '</div>';
    }).join('');
  }

  function renderHeader(active) {
    const user = session.user();
    const initials = session.initials(user);
    const site = (DCIM.data && DCIM.data.site) || { badge: 'Veri Merkezi / Salon 1' };
    const activeCount = DCIM.data && DCIM.data.activeAlarms ? DCIM.data.activeAlarms.length : 0;
    const scale = theme.scale();
    const isDark = theme.mode() === 'dark';

    const scaleBtns = SCALE_LEVELS.map(s =>
      '<button type="button" data-scale="' + s + '" class="' + (scale === s ? 'bg-sky-600 text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100') + ' py-0.5 rounded-[2px] transition-colors">%' + s + '</button>'
    ).join('');

    return (
      '<div class="flex items-center gap-4">' +
        '<a href="2d.html" class="flex items-center shrink-0" title="Akya Software">' +
          '<img src="assets/img/logo-akya-white.png" alt="Akya Logo" class="h-7 w-auto object-contain invert dark:invert-0 transition-all" />' +
        '</a>' +
        '<nav class="hidden md:flex items-center gap-1 text-xs h-full">' + renderNav(active) + '</nav>' +
      '</div>' +
      '<div class="flex items-center gap-2">' +
        '<div class="hidden lg:flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">' +
          '<i class="pi pi-building text-sky-600 dark:text-sky-400 text-xs"></i>' +
          '<span class="font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-[2px] border border-slate-200 dark:border-slate-700 text-[10px]">' + esc(site.badge) + '</span>' +
        '</div>' +
        '<div class="hidden md:flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400" title="Sistem Saati">' +
          '<i class="pi pi-clock text-sky-600 dark:text-sky-400 text-xs"></i>' +
          '<span id="shell-clock" class="font-mono font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-[2px] border border-slate-200 dark:border-slate-700 text-[10px]">--:--:--</span>' +
        '</div>' +
        '<a href="alarms.html" class="flex items-center gap-1 px-2 py-1 rounded-[2px] bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 border transition-all text-xs font-bold" style="color: var(--schema-status-alarm); border-color: var(--schema-status-alarm);" title="Aktif Alarmlar">' +
          '<i class="pi pi-exclamation-triangle text-xs animate-pulse"></i><span>Aktif Alarmlar</span>' +
          (activeCount ? '<span class="font-mono text-[10px]">(' + activeCount + ')</span>' : '') +
        '</a>' +
        '<div class="relative user-menu-container">' +
          '<button type="button" data-user-toggle class="flex items-center gap-1.5 px-2 py-1 rounded-[2px] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700">' +
            '<div class="w-6 h-6 rounded-[2px] bg-sky-700 text-white font-bold text-[10px] flex items-center justify-center">' + esc(initials) + '</div>' +
            '<i class="pi pi-chevron-down text-[8px] text-slate-400"></i>' +
          '</button>' +
          '<div data-user-menu class="hidden absolute right-0 mt-1 w-64 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xl z-50 py-1.5 text-xs text-slate-700 dark:text-slate-300 divide-y divide-slate-100 dark:divide-slate-800 animate-fade-in">' +
            '<div class="px-3 py-2 bg-slate-50 dark:bg-[#0b121e] flex items-center gap-2.5">' +
              '<div class="w-8 h-8 rounded-[2px] bg-sky-700 text-white font-bold text-xs flex items-center justify-center shrink-0">' + esc(initials) + '</div>' +
              '<div class="overflow-hidden">' +
                '<p class="font-extrabold text-slate-900 dark:text-slate-100 text-xs truncate">' + esc(user.fullname || user.usr) + '</p>' +
                '<p class="text-[10px] text-sky-600 dark:text-sky-400 font-semibold truncate">Oturum</p>' +
                '<p class="text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate">' + esc(user.usr) + '</p>' +
              '</div>' +
            '</div>' +
            '<div data-theme-toggle class="px-3 py-2 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer">' +
              '<span class="flex items-center gap-2 font-medium"><i class="' + (isDark ? 'pi pi-moon text-amber-400' : 'pi pi-sun text-sky-600') + '"></i><span>Koyu Mod</span></span>' +
              '<div class="relative inline-flex items-center cursor-pointer"><span class="text-[10px] font-bold px-1.5 py-0.5 rounded-[2px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">' + (isDark ? 'Açık' : 'Kapalı') + '</span></div>' +
            '</div>' +
            '<div class="px-3 py-2 space-y-1.5">' +
              '<div class="flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-400">' +
                '<span class="flex items-center gap-1.5"><i class="pi pi-search-plus text-sky-500"></i> Ekran Ölçeği</span>' +
                '<span class="font-mono text-sky-600 dark:text-sky-400 font-bold">%' + scale + '</span>' +
              '</div>' +
              '<div class="grid grid-cols-5 gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-[2px] text-[10px] font-bold text-center">' + scaleBtns + '</div>' +
            '</div>' +
            '<div class="px-3 py-2 space-y-1.5">' +
              '<div class="flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-400"><span class="flex items-center gap-1.5"><i class="pi pi-globe text-emerald-500"></i> Dil</span></div>' +
              '<div class="py-1"><select class="w-full bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs rounded-[2px] px-2 py-1 font-semibold focus:outline-none">' +
                '<option value="tr" selected>Türkçe</option>' +
                '<option value="en" disabled>English</option>' +
                '<option value="de" disabled>Deutsch</option>' +
                '<option value="es" disabled>Español</option>' +
                '<option value="fr" disabled>Français</option>' +
                '<option value="ru" disabled>Русский</option>' +
                '<option value="ja" disabled>日本語</option>' +
                '<option value="zh" disabled>简体中文</option>' +
              '</select></div>' +
            '</div>' +
            '<div class="p-1.5 bg-slate-50 dark:bg-[#0b121e]">' +
              '<button type="button" data-logout class="w-full px-2.5 py-1.5 text-left rounded-[2px] text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/15 font-bold flex items-center justify-between transition-colors">' +
                '<span class="flex items-center gap-2"><i class="pi pi-sign-out text-xs"></i> Çıkış</span><i class="pi pi-arrow-right text-[10px]"></i>' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  let activeKey = '';
  function mountHeader() {
    const header = document.getElementById('app-header');
    if (!header) return;
    header.innerHTML = renderHeader(activeKey);

    const toggle = header.querySelector('[data-user-toggle]');
    const menu = header.querySelector('[data-user-menu]');
    toggle.addEventListener('click', e => { e.stopPropagation(); menu.classList.toggle('hidden'); });
    menu.addEventListener('click', e => e.stopPropagation());
    header.querySelectorAll('[data-nav-toggle]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      const label = b.getAttribute('data-nav-toggle');
      openDropdown = openDropdown === label ? '' : label;
      mountHeader();
    }));
    const navMenu = header.querySelector('[data-nav-menu]');
    if (navMenu) navMenu.addEventListener('click', e => e.stopPropagation());
    header.querySelector('[data-theme-toggle]').addEventListener('click', () => { theme.toggle(); mountHeader(); header.querySelector('[data-user-menu]').classList.remove('hidden'); });
    header.querySelectorAll('[data-scale]').forEach(b => b.addEventListener('click', () => {
      theme.setScale(parseInt(b.getAttribute('data-scale'), 10));
      mountHeader();
      header.querySelector('[data-user-menu]').classList.remove('hidden');
    }));
    header.querySelector('[data-logout]').addEventListener('click', () => {
      storage.sessionRemove('dcim_user');
      window.location.href = 'login.html';
    });
    const printBtn = header.querySelector('[data-shell-print]');
    if (printBtn) printBtn.addEventListener('click', () => window.print());
    updateClock();
  }

  function updateClock() {
    const el = document.getElementById('shell-clock');
    if (!el) return;
    const now = new Date();
    el.textContent = pad(now.getDate()) + '.' + pad(now.getMonth() + 1) + '.' + now.getFullYear() + ' ' + fmtTime(now);
  }

  function init(opts) {
    activeKey = (opts && opts.active) || '';
    theme.init();
    mountHeader();
    setInterval(updateClock, 1000);
    document.addEventListener('click', () => {
      const menu = document.querySelector('[data-user-menu]');
      if (menu) menu.classList.add('hidden');
      if (openDropdown) { openDropdown = ''; mountHeader(); }
    });
  }

  DCIM.ui = { esc, fmtDateTime, fmtTime, fmtDateKey, fmtNum, statusBadge, badgeLabel, button, buttonClasses, dialog, toast, storage };
  DCIM.theme = theme;
  DCIM.session = session;
  function setActive(key) {
    activeKey = key || '';
    mountHeader();
  }

  DCIM.shell = { init, setActive };
})();
