/* ==========================================================================
   DCIM Sunum — Paylaşılan Bileşenler
   - rack3d   : Cabinet3dIsometricRackComponent (Babylon.js sahnesi; WebGL yoksa saf CSS 3D yedek)
   - chassis  : cabinet-isometric-drawer "Kabin İçi (2D)" 42U slot görünümü
   - assetDetail : Cihaz detay penceresi (device-detail-modal karşılığı)
   Bağımlılık: js/shell.js (DCIM.ui)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const esc = s => DCIM.ui.esc(s);

  // ---------------------------------------------------------------------------
  // Varlık listesini 3D rack yüz plakası konumlarına çevir
  // (42U: toplam 420px, U42 = y 0px, U1 = y 410px)
  // ---------------------------------------------------------------------------
  // ASM atama durumu: yalnız '0' (Kullanımda) — ya da alanı olmayan — cihazlar raf görünümlerinde yer alır
  const isAssigned = a => a.assignment == null || a.assignment === '' || String(a.assignment) === '0';

  // Model kütüphanesi SVG yüz çizimi (DCIM.data.cabinetMgr.face → CAT jsn.front_img/back_img karşılığı);
  // slot kutusunu tam doldursun diye preserveAspectRatio="none" eklenir (cabinet-3d-isometric-rack stretchSvgFace).
  const SVG_PFX = 'data:image/svg+xml;charset=utf-8,';
  function stretchSvgFace(uri) {
    if (!uri || uri.indexOf(SVG_PFX) !== 0) return uri || '';
    try {
      const svg = decodeURIComponent(uri.slice(SVG_PFX.length));
      if (/^[^>]*preserveAspectRatio=/.test(svg)) return uri;
      return SVG_PFX + encodeURIComponent(svg.replace(/<svg/, '<svg preserveAspectRatio="none"'));
    } catch (e) { return uri; }
  }
  function faceImg(a, side) {
    const M = window.DCIM && DCIM.data && DCIM.data.cabinetMgr;
    if (!M || !M.face) return '';
    try { const f = M.face(a, side); return f && f.img ? stretchSvgFace(f.img) : ''; } catch (e) { return ''; }
  }

  function toInstalledServers(assets) {
    return (assets || [])
      .filter(a => a.startU > 0 && a.startU <= 42 && isAssigned(a))
      .map(a => {
        const topU = Math.min(42, a.startU + a.uSize - 1);
        return Object.assign({}, a, {
          asset_id: a.id,
          topPx: Math.max(0, (42 - topU) * 10),
          heightPx: Math.max(9, a.uSize * 10 - 1),
          frontImg: a.frontImg || faceImg(a, 'front'),
          backImg: a.backImg || faceImg(a, 'back')
        });
      });
  }

  function angleLabel(rotationY) {
    const norm = Math.round(((rotationY % 360) + 360) % 360);
    if (norm >= 335 || norm <= 25) return 'Ön Yüz (' + norm + '°)';
    if (norm > 25 && norm < 65) return 'Ön Sağ İzometrik (' + norm + '°)';
    if (norm >= 65 && norm <= 115) return 'Sağ Profil (' + norm + '°)';
    if (norm > 115 && norm < 155) return 'Arka Sağ İzometrik (' + norm + '°)';
    if (norm >= 155 && norm <= 205) return 'Arka Yüz (' + norm + '°)';
    if (norm > 205 && norm < 245) return 'Arka Sol İzometrik (' + norm + '°)';
    if (norm >= 245 && norm <= 295) return 'Sol Profil (' + norm + '°)';
    return 'Ön Sol İzometrik (' + norm + '°)';
  }

  // ---------------------------------------------------------------------------
  // rack3d — cabinet-3d-isometric-rack (Babylon.js sahnesi)
  // Sahne: vendor/cabinet-rack-scene.bundle.min.js (orijinal cabinet-3d-isometric-rack.scene.ts'nin esbuild
  // IIFE paketi, window.DCIM_RackScene). İlk kullanımda tembel yüklenir; WebGL ya da paket yoksa eski CSS 3D raf.
  // API değişmedi: createRack3d(container, {name, frontDoorState, rearDoorState, assets, heightPx, onAssetClick})
  //   → { destroy(), select(id) }
  // ---------------------------------------------------------------------------
  const SCENE_SRC = 'vendor/cabinet-rack-scene.bundle.min.js';
  let sceneLoad = null;
  function loadRackScene() {
    if (window.DCIM_RackScene) return Promise.resolve(window.DCIM_RackScene);
    if (!sceneLoad) {
      sceneLoad = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = SCENE_SRC;
        s.onload = () => (window.DCIM_RackScene ? resolve(window.DCIM_RackScene) : reject(new Error('rack scene missing')));
        s.onerror = () => reject(new Error('rack scene load failed'));
        document.head.appendChild(s);
      });
    }
    return sceneLoad;
  }
  const isDarkTheme = () => document.documentElement.classList.contains('dark');

  function createRack3d(container, options) {
    const o = Object.assign({ name: '', frontDoorState: 'closed', rearDoorState: 'closed', assets: [], heightPx: 520, onAssetClick: null }, options);
    const servers = toInstalledServers(o.assets);
    const state = { rotationX: 13, rotationY: -27, zoom: 1.12, sceneZoom: 1, viewMode: 'front', autoRotate: false, selectedId: null };
    const baseZoom = () => {
      const scale = (DCIM.theme ? DCIM.theme.scale() : 100) / 100;
      return +Math.max(0.8, Math.min(2.8, (o.heightPx / 520) * 1.12 * scale)).toFixed(2);
    };
    state.zoom = baseZoom();
    let scene = null;
    let destroyed = false;
    let fallback = null;
    let themeObs = null;

    const presetBtnCls = active => 'px-2.5 py-1 text-[9.5px] font-bold rounded-[2px] flex items-center gap-1 cursor-pointer transition-all ' +
      (active ? 'bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/40 font-black' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white');
    const doorDot = st => 'w-1.5 h-1.5 rounded-full ' + (st === 'open' ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500');
    const pillCls = st => 'px-2 py-0.5 rounded-[2px] border text-[9px] font-bold cursor-pointer transition-all flex items-center gap-1 shadow-2xs ' +
      (st === 'open' ? 'bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400' : 'bg-white dark:bg-slate-900/80 border-slate-300 dark:border-slate-700/70 text-slate-700 dark:text-slate-300');

    container.innerHTML =
      '<div class="relative w-full rounded-[3px] border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#080d17] overflow-hidden shadow-inner flex flex-col justify-center items-center select-none" style="height:' + o.heightPx + 'px">' +
        '<div class="absolute top-2 left-2 z-30 flex items-center gap-1 bg-white/95 dark:bg-slate-950/90 p-0.5 rounded-[3px] border border-slate-200 dark:border-slate-700/60 shadow-md backdrop-blur-xs" data-top-presets>' +
          '<button type="button" data-preset="front" title="Ön Görünüm (0°)"><span>Ön</span><span class="' + doorDot(o.frontDoorState) + '"></span></button>' +
          '<button type="button" data-preset="rear" title="Arka Görünüm (180°)"><span>Arka</span><span class="' + doorDot(o.rearDoorState) + '"></span></button>' +
          '<button type="button" data-auto title="360° Sürekli Döndür"></button>' +
        '</div>' +
        '<div class="absolute top-2 right-2 z-30 flex items-center gap-1">' +
          '<div class="flex items-center bg-white/95 dark:bg-slate-950/90 p-0.5 rounded-[3px] border border-slate-200 dark:border-slate-700/60 shadow-md backdrop-blur-xs">' +
            '<button type="button" data-zoom="-1" title="Uzaklaştır" class="w-6 h-6 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-[2px] cursor-pointer transition-colors"><i class="pi pi-minus text-[8px]"></i></button>' +
            '<span data-zoom-label class="text-[8.5px] font-mono font-bold px-1 text-slate-500 dark:text-slate-400 min-w-7 text-center"></span>' +
            '<button type="button" data-zoom="1" title="Yakınlaştır" class="w-6 h-6 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-[2px] cursor-pointer transition-colors"><i class="pi pi-plus text-[8px]"></i></button>' +
          '</div>' +
          '<button type="button" data-reset title="Açıyı Sıfırla" class="w-7 h-7 flex items-center justify-center bg-white/95 hover:bg-slate-100 dark:bg-slate-950/90 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700/60 rounded-[2px] shadow-md transition-all cursor-pointer"><i class="pi pi-sync text-[9px]"></i></button>' +
        '</div>' +
        '<div class="w-full h-full relative select-none" style="touch-action:none" data-stage>' +
          '<canvas data-canvas style="position:absolute;inset:0;display:block;width:100%;height:100%;outline:none;touch-action:none;cursor:grab"></canvas>' +
          '<div data-loading class="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none p-3 text-center"><i class="pi pi-spin pi-spinner text-2xl text-sky-600 dark:text-sky-400 mb-2"></i><span class="text-xs font-semibold text-slate-700 dark:text-slate-300">Yükleniyor...</span></div>' +
        '</div>' +
        '<div class="absolute bottom-2 left-2 right-2 z-30 pointer-events-none flex items-center justify-between gap-2">' +
          '<div class="px-2 py-0.5 bg-white/95 dark:bg-slate-950/90 border border-slate-200 dark:border-slate-800 rounded-[2px] text-[8.5px] font-mono text-slate-600 dark:text-slate-400 shadow-sm flex items-center gap-1.5 backdrop-blur-xs">' +
            '<i class="pi pi-arrows-alt text-[8.5px] text-sky-500"></i><span class="font-bold text-slate-700 dark:text-slate-300">360° Sürükle:</span><span data-angle class="text-sky-600 dark:text-sky-400 font-bold"></span>' +
          '</div>' +
          '<div class="flex items-center gap-1.5 pointer-events-auto">' +
            '<button type="button" data-preset="front" class="' + pillCls(o.frontDoorState) + '"><span class="' + doorDot(o.frontDoorState) + '"></span><span>Ön: ' + (o.frontDoorState === 'open' ? 'AÇIK' : 'KAPALI') + '</span></button>' +
            '<button type="button" data-preset="rear" class="' + pillCls(o.rearDoorState) + '"><span class="' + doorDot(o.rearDoorState) + '"></span><span>Arka: ' + (o.rearDoorState === 'open' ? 'AÇIK' : 'KAPALI') + '</span></button>' +
          '</div>' +
        '</div>' +
      '</div>';

    const q = sel => container.querySelector(sel);
    const canvas = q('[data-canvas]');
    const angleEl = q('[data-angle]');
    const zoomEl = q('[data-zoom-label]');
    const autoBtn = q('[data-auto]');
    const topPresets = container.querySelectorAll('[data-top-presets] [data-preset]');

    function syncViewMode() {
      const normY = ((state.rotationY % 360) + 360) % 360;
      state.viewMode = normY >= 90 && normY <= 270 ? 'rear' : 'front';
    }
    function update() {
      if (destroyed || fallback) return;
      angleEl.textContent = angleLabel(state.rotationY);
      zoomEl.textContent = Math.round(state.zoom * 100) + '%';
      topPresets.forEach(b => { b.className = presetBtnCls(state.viewMode === b.getAttribute('data-preset') && !state.autoRotate); });
      autoBtn.className = 'px-2 py-1 text-[9.5px] font-bold rounded-[2px] flex items-center gap-1 cursor-pointer transition-all border ' +
        (state.autoRotate ? 'bg-sky-600 text-white border-sky-500 shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-sky-600 dark:text-sky-400 border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700');
      autoBtn.title = state.autoRotate ? 'Otomatik Döndürmeyi Durdur' : '360° Sürekli Döndür';
      autoBtn.innerHTML = '<i class="' + (state.autoRotate ? 'pi pi-spin pi-sync' : 'pi pi-compass') + ' text-[8.5px]"></i><span>360°</span>';
    }
    function setAuto(on) {
      state.autoRotate = on;
      if (scene) scene.setAuto(on);
      update();
    }
    function setPose(rx, ry, mode) {
      state.rotationX = rx; state.rotationY = ry; state.viewMode = mode;
      if (scene) scene.setPose(rx, ry);
      update();
    }
    function setPreset(p) {
      setAuto(false);
      const presets = { front: [13, -27, 'front'], right: [10, 63, 'front'], rear: [13, 153, 'rear'], left: [10, 243, 'rear'] };
      const v = presets[p] || presets.front;
      setPose(v[0], v[1], v[2]);
    }
    function setZoomLevel(z) {
      state.zoom = Math.max(0.6, Math.min(2.5, Math.round(z * 100) / 100));
      state.sceneZoom = state.zoom / baseZoom();
      if (scene) scene.setZoom(state.sceneZoom);
      update();
    }

    container.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); setPreset(b.getAttribute('data-preset')); }));
    autoBtn.addEventListener('click', e => { e.stopPropagation(); setAuto(!state.autoRotate); });
    container.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => setZoomLevel(state.zoom + 0.1 * parseInt(b.getAttribute('data-zoom'), 10))));
    q('[data-reset]').addEventListener('click', () => { setPreset('front'); setZoomLevel(baseZoom()); });

    function useFallback(err) {
      if (destroyed || fallback) return;
      if (err) console.warn('[rack3d] Babylon sahnesi başlatılamadı, CSS 3D rafa geçiliyor:', err.message || err);
      if (scene) { try { scene.dispose(); } catch (e) { /* yok say */ } scene = null; }
      fallback = createRackCss(container, o);
      if (state.selectedId) fallback.select(state.selectedId);
    }

    loadRackScene().then(Ctor => {
      if (destroyed) return;
      try {
        scene = new Ctor(canvas, {
          onView: v => {
            state.rotationY = v.rotY;
            state.rotationX = v.rotX;
            state.sceneZoom = v.zoom;
            state.zoom = Math.round(baseZoom() * v.zoom * 100) / 100;
            syncViewMode();
            update();
          },
          onHover: () => {},
          onSelect: s => {
            state.selectedId = s.asset_id || s.id;
            if (scene) scene.setSelected(s);
            if (o.onAssetClick) o.onAssetClick(servers.find(x => x.asset_id === state.selectedId) || s);
          },
          onInteract: () => { if (state.autoRotate) { state.autoRotate = false; update(); } }
        }, state.rotationX, state.rotationY);
        const base = baseZoom();
        scene.setZoomLimits(0.6 / base, 2.5 / base);
        scene.setTheme(isDarkTheme());
        scene.setDoors(o.frontDoorState === 'open' ? 'open' : 'closed', o.rearDoorState === 'open' ? 'open' : 'closed');
        scene.setServers(servers, true);
        if (state.selectedId) scene.setSelected(servers.find(x => x.asset_id === state.selectedId) || null);
        const ld = q('[data-loading]');
        if (ld) ld.remove();
        themeObs = new MutationObserver(() => { if (scene) scene.setTheme(isDarkTheme()); });
        themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      } catch (e) {
        useFallback(e);
      }
    }).catch(useFallback);

    update();
    return {
      destroy() {
        destroyed = true;
        if (themeObs) themeObs.disconnect();
        if (scene) { try { scene.dispose(); } catch (e) { /* yok say */ } }
        scene = null;
        if (fallback) fallback.destroy();
      },
      select(id) {
        state.selectedId = id;
        if (fallback) fallback.select(id);
        else if (scene) scene.setSelected(servers.find(x => x.asset_id === id) || null);
      }
    };
  }

  // ---------------------------------------------------------------------------
  // createRackCss — önceki saf CSS 3D raf (WebGL yoksa yedek)
  // ---------------------------------------------------------------------------
  function createRackCss(container, options) {
    const o = Object.assign({ name: '', frontDoorState: 'closed', rearDoorState: 'closed', assets: [], heightPx: 520, onAssetClick: null }, options);
    const state = {
      rotationX: 13,
      rotationY: -27,
      zoom: 1.12,
      viewMode: 'front',
      dragging: false,
      autoRotate: false,
      raf: null,
      startX: 0, startY: 0, startRotX: 0, startRotY: 0,
      selectedId: null
    };
    const servers = toInstalledServers(o.assets);

    const baseZoom = () => {
      const scale = (DCIM.theme ? DCIM.theme.scale() : 100) / 100;
      // Orijinal formül (h / 520 * 1.12); sunum ekranlarında taşmayı önlemek için 1.6 ile sınırlandı
      return +Math.max(0.8, Math.min(1.6, (o.heightPx / 520) * 1.12 * scale)).toFixed(2);
    };
    state.zoom = baseZoom();

    const presetBtnCls = active => 'px-2.5 py-1 text-[9.5px] font-bold rounded-[2px] flex items-center gap-1 cursor-pointer transition-all ' +
      (active ? 'bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/40 font-black' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white');
    const doorDot = st => 'w-1.5 h-1.5 rounded-full ' + (st === 'open' ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500');
    const pillCls = st => 'px-2 py-0.5 rounded-[2px] border text-[9px] font-bold cursor-pointer transition-all flex items-center gap-1 shadow-2xs ' +
      (st === 'open' ? 'bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400' : 'bg-white dark:bg-slate-900/80 border-slate-300 dark:border-slate-700/70 text-slate-700 dark:text-slate-300');

    const lockHandle = (st, sideLabel) =>
      '<div class="door-lock-handle' + (st === 'open' ? ' unlocked' : '') + '" title="' + sideLabel + ' Kapı Kilidi: ' + (st === 'open' ? 'AÇIK (GÜVENLİK UYARISI)' : 'KİLİTLİ (GÜVENLİ)') + '">' +
        '<div class="lock-brand">LOCK</div>' +
        '<div class="lock-body"><span class="lock-led-ring ' + (st === 'open' ? 'led-alert' : 'led-secure') + '"></span><i class="' + (st === 'open' ? 'pi pi-lock-open' : 'pi pi-lock') + ' lock-micro-icon"></i></div>' +
        '<div class="lock-lever-bar"><span class="lever-grip-line"></span><span class="lever-grip-line"></span></div>' +
        '<span class="lock-rfid-dot" title="RFID / Kart Okuyucu"></span>' +
      '</div>';

    const ticks = '<span class="u-tick">42</span><span class="u-tick">30</span><span class="u-tick">20</span><span class="u-tick">10</span><span class="u-tick">1</span>';

    const frontUnits = servers.map(s =>
      '<div class="server-faceplate-abs" data-asset="' + esc(s.id) + '" style="top:' + s.topPx + 'px;height:' + s.heightPx + 'px' + (s.frontImg ? ';background:url(&quot;' + s.frontImg + '&quot;) center/100% 100% no-repeat' : '') + '" title="Cihaz Detayını Aç: ' + esc(s.displayName) + '">' +
        '<span class="server-led ' + (s.customerType === 'internal' ? 'led-sky' : 'led-purple') + '"></span>' +
        '<div class="server-drives-grid"><span class="caddy-unit"></span><span class="caddy-unit"></span>' + (s.uSize > 1 ? '<span class="caddy-unit"></span>' : '') + '</div>' +
        '<div class="server-info-title truncate flex items-center gap-1 hover:text-sky-300"><span>' + esc(s.displayName) + '</span><i class="pi pi-external-link text-[6px] opacity-70"></i></div>' +
        (s.uSize > 1 ? '<span class="u-badge">' + s.uSize + 'U</span>' : '') +
      '</div>'
    ).join('');

    const rearUnits = servers.map(s =>
      '<div class="server-rear-abs cursor-pointer" data-asset="' + esc(s.id) + '" style="top:' + s.topPx + 'px;height:' + s.heightPx + 'px' + (s.backImg ? ';background:url(&quot;' + s.backImg + '&quot;) center/100% 100% no-repeat' : '') + '" title="Cihaz Detayını Aç: ' + esc(s.displayName) + '">' +
        '<div class="rear-fan-pair"><span class="mini-fan"></span>' + (s.uSize > 1 ? '<span class="mini-fan"></span>' : '') + '</div>' +
        '<div class="rear-psus"><span class="psu-unit"><span class="psu-plug"></span><span class="psu-led-on"></span></span><span class="psu-unit"><span class="psu-plug"></span><span class="psu-led-on"></span></span></div>' +
      '</div>'
    ).join('');

    const pdu = feed =>
      '<div class="pdu-vertical pdu-feed-' + feed.toLowerCase() + '"><span class="pdu-tag">' + feed + '</span><div class="pdu-outlets"><span class="outlet"></span><span class="outlet"></span><span class="outlet"></span></div></div>';

    container.innerHTML =
      '<div class="relative w-full rounded-[3px] border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#080d17] overflow-hidden shadow-inner flex flex-col justify-center items-center select-none" style="height:' + o.heightPx + 'px">' +
        '<div class="absolute top-2 left-2 z-30 flex items-center gap-1 bg-white/95 dark:bg-slate-950/90 p-0.5 rounded-[3px] border border-slate-200 dark:border-slate-700/60 shadow-md backdrop-blur-xs">' +
          '<button type="button" data-preset="front" title="Ön Görünüm (0°)"><span>Ön</span><span class="' + doorDot(o.frontDoorState) + '"></span></button>' +
          '<button type="button" data-preset="rear" title="Arka Görünüm (180°)"><span>Arka</span><span class="' + doorDot(o.rearDoorState) + '"></span></button>' +
          '<button type="button" data-auto title="360° Sürekli Döndür"></button>' +
        '</div>' +
        '<div class="absolute top-2 right-2 z-30 flex items-center gap-1">' +
          '<div class="flex items-center bg-white/95 dark:bg-slate-950/90 p-0.5 rounded-[3px] border border-slate-200 dark:border-slate-700/60 shadow-md backdrop-blur-xs">' +
            '<button type="button" data-zoom="-1" title="Uzaklaştır" class="w-6 h-6 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-[2px] cursor-pointer transition-colors"><i class="pi pi-minus text-[8px]"></i></button>' +
            '<span data-zoom-label class="text-[8.5px] font-mono font-bold px-1 text-slate-500 dark:text-slate-400 min-w-7 text-center"></span>' +
            '<button type="button" data-zoom="1" title="Yakınlaştır" class="w-6 h-6 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-[2px] cursor-pointer transition-colors"><i class="pi pi-plus text-[8px]"></i></button>' +
          '</div>' +
          '<button type="button" data-reset title="Açıyı Sıfırla" class="w-7 h-7 flex items-center justify-center bg-white/95 hover:bg-slate-100 dark:bg-slate-950/90 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700/60 rounded-[2px] shadow-md transition-all cursor-pointer"><i class="pi pi-sync text-[9px]"></i></button>' +
        '</div>' +
        '<div class="isometric-stage-container w-full h-full flex items-center justify-center cursor-grab active:cursor-grabbing relative select-none" data-stage>' +
          '<div class="isometric-stage">' +
            '<div class="rack-3d-box" data-box>' +
              '<div class="rack-face rack-face-top"><div class="fan-grill"></div><div class="fan-grill"></div></div>' +
              '<div class="rack-face rack-face-bottom"><div class="rack-foot foot-fl"></div><div class="rack-foot foot-fr"></div><div class="rack-foot foot-bl"></div><div class="rack-foot foot-br"></div></div>' +
              '<div class="rack-face rack-face-left"><div class="side-panel-mesh"></div><div class="side-brand-tag">42U DCIM RACK</div></div>' +
              '<div class="rack-face rack-face-right"><div class="side-panel-mesh"></div></div>' +
              '<div class="rack-face rack-face-front' + (o.frontDoorState === 'open' ? ' face-alarm' : '') + '">' +
                '<div class="rack-corner corner-tl"></div><div class="rack-corner corner-tr"></div><div class="rack-corner corner-bl"></div><div class="rack-corner corner-br"></div>' +
                '<div class="rail-left">' + ticks + '</div><div class="rail-right">' + ticks + '</div>' +
                '<div class="rack-units-stack relative">' + frontUnits + '</div>' +
                lockHandle(o.frontDoorState, 'Ön') +
              '</div>' +
              '<div class="rack-face rack-face-rear' + (o.rearDoorState === 'open' ? ' face-alarm' : '') + '">' +
                '<div class="rack-corner corner-tl"></div><div class="rack-corner corner-tr"></div><div class="rack-corner corner-bl"></div><div class="rack-corner corner-br"></div>' +
                pdu('A') + pdu('B') +
                '<div class="rack-units-stack rear-stack">' + rearUnits + '</div>' +
                lockHandle(o.rearDoorState, 'Arka') +
              '</div>' +
            '</div>' +
            '<div class="rack-floor-shadow"></div>' +
          '</div>' +
        '</div>' +
        '<div class="absolute bottom-2 left-2 right-2 z-30 pointer-events-none flex items-center justify-between gap-2">' +
          '<div class="px-2 py-0.5 bg-white/95 dark:bg-slate-950/90 border border-slate-200 dark:border-slate-800 rounded-[2px] text-[8.5px] font-mono text-slate-600 dark:text-slate-400 shadow-sm flex items-center gap-1.5 backdrop-blur-xs">' +
            '<i class="pi pi-arrows-alt text-[8.5px] text-sky-500"></i><span class="font-bold text-slate-700 dark:text-slate-300">360° Sürükle:</span><span data-angle class="text-sky-600 dark:text-sky-400 font-bold"></span>' +
          '</div>' +
          '<div class="flex items-center gap-1.5 pointer-events-auto">' +
            '<button type="button" data-preset="front" class="' + pillCls(o.frontDoorState) + '"><span class="' + doorDot(o.frontDoorState) + '"></span><span>Ön: ' + (o.frontDoorState === 'open' ? 'AÇIK' : 'KAPALI') + '</span></button>' +
            '<button type="button" data-preset="rear" class="' + pillCls(o.rearDoorState) + '"><span class="' + doorDot(o.rearDoorState) + '"></span><span>Arka: ' + (o.rearDoorState === 'open' ? 'AÇIK' : 'KAPALI') + '</span></button>' +
          '</div>' +
        '</div>' +
      '</div>';

    const box = container.querySelector('[data-box]');
    const stage = container.querySelector('[data-stage]');
    const angleEl = container.querySelector('[data-angle]');
    const zoomEl = container.querySelector('[data-zoom-label]');
    const autoBtn = container.querySelector('[data-auto]');
    const topPresets = container.querySelectorAll('.absolute.top-2.left-2 [data-preset]');

    function syncViewMode() {
      const normY = ((state.rotationY % 360) + 360) % 360;
      state.viewMode = normY >= 90 && normY <= 270 ? 'rear' : 'front';
    }

    function update() {
      box.style.transform = 'scale(' + state.zoom + ') rotateX(' + state.rotationX + 'deg) rotateY(' + state.rotationY + 'deg)';
      box.classList.toggle('is-dragging', state.dragging);
      box.classList.toggle('is-auto-rotating', state.autoRotate);
      stage.classList.toggle('is-dragging', state.dragging);
      angleEl.textContent = angleLabel(state.rotationY);
      zoomEl.textContent = Math.round(state.zoom * 100) + '%';
      topPresets.forEach(b => { b.className = presetBtnCls(state.viewMode === b.getAttribute('data-preset') && !state.autoRotate); });
      autoBtn.className = 'px-2 py-1 text-[9.5px] font-bold rounded-[2px] flex items-center gap-1 cursor-pointer transition-all border ' +
        (state.autoRotate ? 'bg-sky-600 text-white border-sky-500 shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-sky-600 dark:text-sky-400 border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700');
      autoBtn.title = state.autoRotate ? 'Otomatik Döndürmeyi Durdur' : '360° Sürekli Döndür';
      autoBtn.innerHTML = '<i class="' + (state.autoRotate ? 'pi pi-spin pi-sync' : 'pi pi-compass') + ' text-[8.5px]"></i><span>360°</span>';
      container.querySelectorAll('[data-asset]').forEach(el => el.classList.toggle('selected', el.getAttribute('data-asset') === state.selectedId));
    }

    function stopAuto() {
      state.autoRotate = false;
      if (state.raf) cancelAnimationFrame(state.raf);
      state.raf = null;
    }
    function startAuto() {
      stopAuto();
      state.autoRotate = true;
      const step = () => {
        if (!state.autoRotate || !container.isConnected) { state.autoRotate = false; return; }
        state.rotationY = (state.rotationY + 0.45) % 360;
        syncViewMode();
        update();
        state.raf = requestAnimationFrame(step);
      };
      state.raf = requestAnimationFrame(step);
    }

    function setPreset(p) {
      stopAuto();
      const presets = { front: [13, -27], right: [10, 63], rear: [13, 153], left: [10, 243] };
      const v = presets[p] || presets.front;
      state.rotationX = v[0];
      state.rotationY = v[1];
      state.viewMode = p === 'rear' ? 'rear' : 'front';
      update();
    }

    container.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); setPreset(b.getAttribute('data-preset')); }));
    autoBtn.addEventListener('click', e => { e.stopPropagation(); state.autoRotate ? stopAuto() : startAuto(); update(); });
    container.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => {
      const dir = parseInt(b.getAttribute('data-zoom'), 10);
      state.zoom = dir > 0 ? Math.min(2.5, Math.round((state.zoom + 0.1) * 100) / 100) : Math.max(0.6, Math.round((state.zoom - 0.1) * 100) / 100);
      update();
    }));
    container.querySelector('[data-reset]').addEventListener('click', () => {
      stopAuto();
      state.rotationX = 13;
      state.rotationY = -27;
      state.zoom = baseZoom();
      state.viewMode = 'front';
      update();
    });

    stage.addEventListener('pointerdown', e => {
      if (e.target.closest('[data-asset]')) return;
      stopAuto();
      state.dragging = true;
      state.startX = e.clientX;
      state.startY = e.clientY;
      state.startRotX = state.rotationX;
      state.startRotY = state.rotationY;
      stage.setPointerCapture(e.pointerId);
      update();
    });
    stage.addEventListener('pointermove', e => {
      if (!state.dragging) return;
      const dx = e.clientX - state.startX;
      const dy = e.clientY - state.startY;
      state.rotationY = (state.startRotY + dx * 0.65) % 360;
      state.rotationX = Math.max(-20, Math.min(45, state.startRotX - dy * 0.45));
      syncViewMode();
      update();
    });
    const endDrag = e => {
      if (!state.dragging) return;
      state.dragging = false;
      try { stage.releasePointerCapture(e.pointerId); } catch (err) { /* yok say */ }
      update();
    };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    stage.addEventListener('wheel', e => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      state.zoom = Math.max(0.6, Math.min(2.5, Math.round((state.zoom + delta) * 100) / 100));
      update();
    }, { passive: false });

    container.querySelectorAll('[data-asset]').forEach(el => el.addEventListener('click', e => {
      e.stopPropagation();
      state.selectedId = el.getAttribute('data-asset');
      update();
      const asset = servers.find(s => s.id === state.selectedId);
      if (asset && o.onAssetClick) o.onAssetClick(asset);
    }));

    update();
    return {
      destroy: stopAuto,
      select(id) { state.selectedId = id; update(); }
    };
  }

  // ---------------------------------------------------------------------------
  // chassis — "Kabin İçi (2D)" 42U slot listesi
  // ---------------------------------------------------------------------------
  function buildSlots(assets) {
    const slots = [];
    let u = 42;
    const byTop = {};
    (assets || []).filter(isAssigned).forEach(a => { byTop[Math.min(42, a.startU + a.uSize - 1)] = a; });
    while (u >= 1) {
      const a = byTop[u];
      if (a) {
        slots.push({ type: 'asset', asset: a });
        u -= a.uSize;
      } else {
        slots.push({ type: 'empty', uNumber: u });
        u -= 1;
      }
    }
    return slots;
  }

  function chassisHtml(assets, viewMode, anyDoorOpen, selectedId) {
    const slots = buildSlots(assets);
    const rows = slots.map(s => {
      if (s.type === 'empty') {
        return '<div style="flex: 1 1 0px; min-height: 18px;" class="w-full px-2 border border-dashed border-slate-300 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/40 rounded-[1px] text-slate-400 dark:text-slate-500 flex items-center justify-between text-[8px] font-mono leading-none overflow-hidden select-none">' +
          '<span class="font-bold text-[8px] opacity-70">U' + s.uNumber + '</span><span class="text-[7.5px] opacity-30 tracking-widest">╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌</span><span class="font-bold text-[8px] opacity-70">U' + s.uNumber + '</span></div>';
      }
      const a = s.asset;
      const internal = a.customerType === 'internal';
      const sel = selectedId === a.id;
      const range = 'U' + a.startU + (a.uSize > 1 ? '-U' + (a.startU + a.uSize - 1) : '');
      return '<div data-slot-asset="' + esc(a.id) + '" style="flex: ' + a.uSize + ' ' + a.uSize + ' 0px; min-height: ' + (a.uSize * 22) + 'px" class="w-full px-2 py-1 border rounded-[2px] flex items-center justify-between cursor-pointer transition-all shadow-xs overflow-hidden leading-none relative group ' +
        (internal ? 'border-sky-500 bg-sky-50/90 dark:bg-sky-950/40 text-sky-900 dark:text-sky-100 hover:brightness-105' : 'border-purple-500 bg-purple-50/90 dark:bg-purple-950/40 text-purple-900 dark:text-purple-100 hover:brightness-105') +
        (sel ? ' ring-2 ring-sky-500 dark:ring-sky-400 shadow-md' : '') + '">' +
        '<div class="flex items-center gap-1.5 min-w-0 truncate">' +
          '<span class="w-2 h-2 rounded-full shrink-0 ' + (internal ? 'bg-sky-500 shadow-[0_0_6px_#38bdf8]' : 'bg-purple-500 shadow-[0_0_6px_#c084fc]') + '"></span>' +
          '<span class="font-bold shrink-0 text-[8.5px] bg-slate-200/90 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-1 py-0.5 rounded-[1px] font-mono border border-slate-300 dark:border-slate-700">' + range + '</span>' +
          '<span class="truncate font-sans font-bold text-[9.5px] text-slate-900 dark:text-white tracking-wide flex items-center gap-1"><span>' + esc(viewMode === 'rear' ? a.hostname : a.displayName) + '</span><i class="pi pi-external-link text-[7.5px] opacity-60 text-sky-500"></i></span>' +
          (a.uSize > 1 ? '<span class="text-[8px] font-semibold shrink-0 text-amber-600 dark:text-amber-300 font-mono">[' + a.uSize + 'U]</span>' : '') +
        '</div>' +
        '<div class="flex items-center gap-1 shrink-0">' +
          '<span class="text-[7.5px] uppercase font-sans text-slate-500 dark:text-slate-400 truncate max-w-[70px]">' + esc(a.assetType) + '</span>' +
          (a.primaryIP ? '<span class="hidden sm:inline font-mono text-[7.5px] text-slate-400">' + esc(a.primaryIP) + '</span>' : '') +
        '</div>' +
      '</div>';
    }).join('');

    const tabBtn = (mode, icon, label) =>
      '<button type="button" data-chassis-view="' + mode + '" class="px-2 py-0.5 font-bold uppercase rounded-[2px] flex items-center gap-1 transition-all cursor-pointer ' +
      (viewMode === mode ? 'bg-sky-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white') + '"><i class="pi ' + icon + ' text-[8px]"></i><span>' + label + '</span></button>';

    return '<div class="relative w-full h-[400px] rounded-[3px] border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#080d17] p-1.5 shadow-inner flex flex-col justify-between overflow-hidden select-none">' +
      '<div class="flex items-center justify-between px-1.5 py-1 mb-1 bg-white/95 dark:bg-slate-900/90 rounded-[2px] border border-slate-200 dark:border-slate-800 text-[10px] font-mono shrink-0">' +
        '<div class="flex items-center gap-1">' + tabBtn('front', 'pi-arrow-right', 'Ön Görünüm') + tabBtn('rear', 'pi-arrow-left', 'Arka Görünüm') + '</div>' +
        '<div class="flex items-center gap-1.5 text-[9.5px] font-bold">' +
          '<span class="w-2 h-2 rounded-full ' + (anyDoorOpen ? 'bg-rose-500 shadow-[0_0_6px_#f43f5e]' : 'bg-emerald-500 shadow-[0_0_6px_#10b981]') + '"></span>' +
          '<span class="' + (anyDoorOpen ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400') + '">' + (anyDoorOpen ? 'Kapak Açık' : 'Kilitli') + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="flex-1 min-h-0 flex flex-col gap-[1.5px] overflow-y-auto custom-scrollbar pr-0.5 font-mono select-none">' + rows + '</div>' +
      '<div class="flex items-center justify-between px-2 py-0.5 bg-slate-200/80 dark:bg-slate-800/80 border-t border-slate-300 dark:border-slate-700 mt-1 shrink-0 text-[8.5px] font-mono text-slate-500 dark:text-slate-400 select-none">' +
        '<span>19" EIA-310 • 42U RACK</span><span>' + (viewMode === 'rear' ? 'REAR (ARKA)' : 'FRONT (ÖN)') + '</span>' +
      '</div>' +
    '</div>';
  }

  // ---------------------------------------------------------------------------
  // assetDetail — cihaz detay penceresi
  // ---------------------------------------------------------------------------
  function assetDetail(asset, cabinetCode) {
    const cell = (label, value, mono) =>
      '<div class="p-2 rounded-[2px] bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800">' +
        '<small class="text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-400 block font-bold">' + label + '</small>' +
        '<strong class="' + (mono ? 'font-mono ' : '') + 'text-xs text-slate-900 dark:text-white block mt-0.5 truncate">' + esc(value || '-') + '</strong></div>';
    const range = 'U' + asset.startU + (asset.uSize > 1 ? '–U' + (asset.startU + asset.uSize - 1) : '');
    DCIM.ui.dialog({
      title: asset.displayName,
      subtitle: cabinetCode + ' · ' + range + ' · ' + asset.assetType,
      variant: 'info',
      showCancel: false,
      confirmLabel: 'Kapat',
      maxWidth: 'max-w-xl',
      body:
        '<div class="grid grid-cols-2 gap-2">' +
          cell('Üretici', asset.manufacturer) + cell('Model', asset.model) +
          cell('Hostname', asset.hostname, true) + cell('Konum', cabinetCode + ' · ' + range, true) +
          cell('Tip', asset.assetType) + cell('Durum', 'NORMAL') +
          cell('IP Adresi', asset.primaryIP || '—', true) + cell('Seri No', asset.serial, true) +
          cell('Sahiplik', asset.customer) + cell('Müşteri Tipi', asset.customerType === 'internal' ? 'Dahili' : 'Harici') +
          cell('Nominal Güç', asset.powerKw ? asset.powerKw.toFixed(2) + ' kW' : '—', true) + cell('Ağırlık', asset.weight + ' kg', true) +
        '</div>'
    });
  }

  DCIM.components = { createRack3d, createRackCss, loadRackScene, chassisHtml, buildSlots, assetDetail, toInstalledServers, isAssigned };
})();
