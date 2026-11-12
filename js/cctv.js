/* ==========================================================================
   DCIM Sunum — CCTV İzleme (cctv.html)
   Kaynak: new-ui/pages/cctv (NewUICMPCctvComponent)
   - NVR tarzı kanal ızgarası (1 kanal / 2×2 / 3×3), boş kanallar ızgarayı tamamlar
   - Canlı görüntü servisi devre dışı: her kanal "SİNYAL YOK" yer tutucusu, OSD saati her saniye
   Derin bağlantı: ?grid=1|2|3 (ızgara sütun sayısı)
   Bağımlılık: js/shell.js (DCIM.ui), js/mock/cctv.data.js (DCIM.data.cctv)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const esc = DCIM.ui.esc;
  DCIM.shell.init({ active: 'cctv' });

  const cameras = (DCIM.data.cctv && DCIM.data.cctv.cameras) || [];
  const layouts = [
    { cols: 1, icon: 'pi pi-stop', label: '1 kanal' },
    { cols: 2, icon: 'pi pi-th-large', label: '2×2' },
    { cols: 3, icon: 'pi pi-table', label: '3×3' }
  ];

  const q = new URLSearchParams(window.location.search);
  let gridCols = [1, 2, 3].indexOf(parseInt(q.get('grid'), 10)) >= 0 ? parseInt(q.get('grid'), 10) : 2;

  const pad = n => String(n).padStart(2, '0');
  const stamp = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '  ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  const slotCode = n => 'CAM-' + String(n).padStart(2, '0');

  function emptySlots() {
    const rest = cameras.length % gridCols;
    return rest === 0 ? [] : Array.from({ length: gridCols - rest }, (_, i) => cameras.length + i + 1);
  }

  function renderActions() {
    const host = document.getElementById('cctv-actions');
    host.innerHTML =
      '<div class="hidden items-center gap-3 rounded-[2px] border border-slate-200 bg-white px-3 h-8 text-[11px] font-bold text-slate-600 sm:flex dark:border-border-subtle dark:bg-surface-card dark:text-slate-300">' +
        '<span><span class="font-mono text-slate-900 dark:text-white">' + cameras.length + '</span> kamera</span>' +
        '<span class="h-3 w-px bg-slate-200 dark:bg-slate-700"></span>' +
        '<span><span class="font-mono text-slate-900 dark:text-white">0</span> canlı</span>' +
      '</div>' +
      '<div class="flex h-8 items-center gap-0.5 rounded-[2px] border border-slate-200 bg-white p-0.5 dark:border-border-subtle dark:bg-surface-card" role="group" aria-label="Izgara düzeni">' +
        layouts.map(l =>
          '<button type="button" data-cols="' + l.cols + '" aria-pressed="' + (gridCols === l.cols) + '" title="' + esc(l.label) + '" ' +
          'class="inline-flex h-full items-center gap-1.5 rounded-[2px] px-2.5 text-[10px] font-black transition-colors ' +
          (gridCols === l.cols ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800') + '">' +
          '<i class="' + l.icon + ' text-xs"></i>' + esc(l.label) + '</button>').join('') +
      '</div>';
    host.querySelectorAll('[data-cols]').forEach(b => b.addEventListener('click', () => {
      gridCols = parseInt(b.getAttribute('data-cols'), 10);
      renderActions();
      renderGrid();
    }));
  }

  const CAM_ICON =
    '<svg class="cctv-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="5" y="14" width="26" height="20" rx="2" /><path d="M31 21l11-6v18l-11-6" /><path d="M4 6l40 36" /></svg>';
  const CORNERS = '<span class="cctv-corner tl"></span><span class="cctv-corner tr"></span><span class="cctv-corner bl"></span><span class="cctv-corner br"></span>';

  function renderGrid() {
    const grid = document.getElementById('cctv-grid');
    grid.style.setProperty('--cols', String(gridCols));
    const now = stamp(new Date());
    grid.innerHTML =
      cameras.map(cam =>
        '<article class="cctv-tile">' +
          '<div class="cctv-screen">' +
            '<div class="cctv-noise"></div><div class="cctv-scan"></div><div class="cctv-vignette"></div>' + CORNERS +
            '<div class="cctv-osd top-left"><span class="cctv-ch">' + esc(cam.code) + '</span><span>' + esc(cam.name) + '</span></div>' +
            '<div class="cctv-osd top-right"><span class="cctv-dot"></span>SİNYAL YOK</div>' +
            '<div class="cctv-center">' + CAM_ICON + '<div class="cctv-title">SİNYAL YOK</div><div class="cctv-sub">Görüntü akışı bekleniyor</div></div>' +
            '<div class="cctv-osd bottom-left" data-osd-clock>' + now + '</div>' +
            '<div class="cctv-osd bottom-right">RTSP · ' + esc(cam.host) + '</div>' +
          '</div>' +
          '<footer class="cctv-foot">' +
            '<div class="min-w-0">' +
              '<div class="truncate text-[12px] font-black text-slate-900 dark:text-white">' + esc(cam.name) + '</div>' +
              '<div class="truncate font-mono text-[10px] text-slate-500 dark:text-slate-400">' + esc(cam.host) + ' · ' + esc(cam.node) + '</div>' +
            '</div>' +
            '<span class="inline-flex shrink-0 items-center gap-1.5 rounded-[2px] border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">' +
              '<span class="h-1.5 w-1.5 rounded-full bg-slate-400"></span>BAĞLANTI YOK</span>' +
          '</footer>' +
        '</article>').join('') +
      emptySlots().map(n =>
        '<article class="cctv-tile is-empty">' +
          '<div class="cctv-screen">' +
            '<div class="cctv-scan"></div>' + CORNERS +
            '<div class="cctv-osd top-left"><span class="cctv-ch">' + slotCode(n) + '</span></div>' +
            '<div class="cctv-center"><i class="pi pi-plus-circle text-2xl"></i><div class="cctv-title">KANAL BOŞ</div><div class="cctv-sub">Atanmış kamera yok</div></div>' +
          '</div>' +
          '<footer class="cctv-foot"><div class="text-[12px] font-black text-slate-400 dark:text-slate-500">—</div></footer>' +
        '</article>').join('');
  }

  renderActions();
  renderGrid();
  setInterval(() => {
    const now = stamp(new Date());
    document.querySelectorAll('[data-osd-clock]').forEach(el => { el.textContent = now; });
  }, 1000);
})();
