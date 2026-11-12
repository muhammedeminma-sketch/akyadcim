/* ==========================================================================
   DCIM Sunum — Rapor pop-up iskeleti (shared/components/report-modal/report-modal.component.ts)
   Tüm "Rapor Al / Rapor Oluştur / Geçmiş Veri" pencereleri aynı görünür
   (referans: Olaylar → "Olay Raporu Oluştur"). Stiller: css/report-modal.css (.rpt-*).

   DCIM.reportModal.html(opts) → string
     opts: { title, subtitle, icon:'pi pi-file', tone:'sky'|'purple'|'rose'|'emerald'|'amber'|'indigo'|'cyan'|'orange'|'slate',
             size:'md'|'lg'|'xl'|'full', z:'z-[9999]', badge:html, header:html (kapatmanın solu),
             filters:html (varsa filtre şeridi), actions:html (solda düğmeler), summary:html (sağda),
             body:html, bodyClass:'min-h-[300px]', attrs:'data-...' (örtüye eklenir) }
     Kapat düğmesi data-rpt-close, örtü data-rpt-overlay taşır.
   DCIM.reportModal.open(opts) → { el, body, close() }  (body'e eklenir; Esc / örtü / kapat ile kapanır; opts.onClose)
   DCIM.reportModal.bind(rootEl, onClose) → bir html() çıktısındaki kapatma olaylarını bağlar
   DCIM.reportModal.total(n) → "Toplam N kayıt" hapı; btn(kind, icon, label, attrs) → .rpt-btn düğmesi
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function html(opts) {
    const o = Object.assign({ title: '', subtitle: '', icon: 'pi pi-file', tone: 'sky', size: 'xl', z: 'z-[9999]', badge: '', header: '',
      filters: '', actions: '', summary: '', body: '', bodyClass: 'min-h-[300px]', attrs: '' }, opts);
    return '<div class="rpt-modal-overlay ' + o.z + '" data-rpt-overlay ' + o.attrs + '>' +
      '<div class="rpt-modal-panel rpt-size-' + o.size + '" role="dialog" aria-modal="true" data-rpt-panel>' +
        '<div class="rpt-modal-head">' +
          '<div class="flex items-center gap-3 min-w-0">' +
            '<div class="rpt-modal-icon rpt-tone-' + o.tone + '"><i class="' + o.icon + '"></i></div>' +
            '<div class="min-w-0">' +
              '<div class="flex items-center gap-2 flex-wrap"><h2 class="rpt-modal-title">' + esc(o.title) + '</h2>' + o.badge + '</div>' +
              (o.subtitle ? '<p class="rpt-modal-sub">' + esc(o.subtitle) + '</p>' : '') +
            '</div>' +
          '</div>' +
          '<div class="flex items-center gap-2 shrink-0">' + o.header +
            '<button type="button" data-rpt-close aria-label="Kapat" class="rpt-modal-close"><i class="pi pi-times"></i></button>' +
          '</div>' +
        '</div>' +
        (o.filters ? '<div class="rpt-modal-filters">' + o.filters + '</div>' : '') +
        (o.actions || o.summary ? '<div class="rpt-modal-actions"><div class="flex flex-wrap gap-2">' + o.actions + '</div>' + o.summary + '</div>' : '') +
        '<div class="rpt-modal-body ' + o.bodyClass + '" data-rpt-body>' + o.body + '</div>' +
      '</div>' +
    '</div>';
  }

  // Kapatma olayları: kapat düğmesi + örtüye tıklama (panelin dışı)
  function bind(root, onClose, closeOnBackdrop) {
    if (!root) return;
    root.querySelectorAll('[data-rpt-close]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); onClose(); }));
    if (closeOnBackdrop !== false) {
      root.querySelectorAll('[data-rpt-overlay]').forEach(ov => ov.addEventListener('click', e => { if (e.target === ov) onClose(); }));
    }
  }

  function open(opts) {
    const host = document.createElement('div');
    host.innerHTML = html(opts);
    const el = host.firstElementChild;
    document.body.appendChild(el);
    let closed = false;
    const onKey = e => { if (e.key === 'Escape') close(); };
    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      el.remove();
      if (opts.onClose) opts.onClose();
    }
    bind(el, close, opts.closeOnBackdrop);
    document.addEventListener('keydown', onKey);
    return { el, body: el.querySelector('[data-rpt-body]'), close };
  }

  const total = n => '<div class="rpt-pill">Toplam ' + (typeof n === 'number' ? n.toLocaleString('tr-TR') : esc(n)) + ' kayıt</div>';
  const btn = (kind, icon, label, attrs) =>
    '<button type="button" class="rpt-btn rpt-btn-' + kind + '" ' + (attrs || '') + '><i class="' + icon + '"></i>' + esc(label) + '</button>';

  DCIM.reportModal = { html, bind, open, total, btn };
})();
