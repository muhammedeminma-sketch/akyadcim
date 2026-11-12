/* ==========================================================================
   DCIM Sunum — Ağ Bağlantılarını İçe Aktar (NewUICMPLnkImportComponent)
   Kaynak: new-ui/pages/engineering/lnk-import/lnk-import.component.{html,ts,scss}, lnk-import.model.ts
   Metinler: messages.tr.json → lnkImport.*
   Akış: hedef ortam rozeti → (isteğe bağlı) "Excel Formatını Göster" → 1. Excel dosyası seç + "Yükle ve Doğrula"
   (64 KB parçalarla aktarım, sunucuda boyut + SHA-256 doğrulaması) → 2. Sheet / satır aralığı / tesis → "Önizle"
   (LNK ve LNK_FAILD'e yazmaz) → içe aktarma onayı (onay kutusu + PROD hedef onayı: hedefi aynen yaz) → "İçe Aktar"
   → durum ve sonuç (sonuç sayıları, gerekçeler) → "Sonuç Excel'ini İndir".
   Sunum: dosya içeriği okunmaz; seçilen dosyanın adı/boyutu kullanılır, satırlar kurgusal örnek çalışma kitabından
   (DCIM.data.lnkImport, js/mock/eng-lnk-import.data.js) gelir. "Örnek dosya seç" ornek_lnk.xlsx'i seçer.
   Sonuç Excel'i DCIM.report.generate(..., 'xlsx') ile üretilir (veri hatası satırları kırmızı).

   Derin bağlantılar (engineering.html#lnk-import?...):
     ?format=1                     Excel formatı tablosu açık
     ?step=upload                  örnek dosya yüklenmiş (Hazır), sheet seçili
     ?step=preview                 önizleme tamamlanmış        ?step=confirm   onay kutusu + PROD hedef onayı dolu
     ?step=done                    içe aktarma bitmiş, sonuç Excel'i hazır
     ?rows=3-40,52  ?site=DCA      önizleme parametreleri
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  DCIM.engRegistry = DCIM.engRegistry || {};
  const { esc, toast, buttonClasses } = DCIM.ui;
  const kit = DCIM.kit;

  // lnk-import.model.ts → LNK_FORMAT_COLUMNS + messages.tr.json lnkImport.format.desc.*
  const FORMAT_COLUMNS = [
    { col: 'A', group: 'KAYNAK', header: 'KAT', desc: 'Kaynak katı (sayı; 01 → 1). Yalnız kaynak ucun kapsamıdır.' },
    { col: 'B', group: '', header: 'SALON', desc: 'Kaynak salonu (sayı). LOC yolunda FLOOR-kat/SALOON-salon aranır.' },
    { col: 'C', group: '', header: 'KABİN', desc: 'Kaynak cihaz: kabin + U başlangıcı (ör. KABİN 12U, KABİN-SAN).' },
    { col: 'D', group: '', header: 'PORT BİLGİSİ', desc: 'Kaynak port etiketi; CAT port id/adıyla birebir eşlenir, boş olamaz.' },
    { col: 'E', group: '', header: 'KAYNAK PATCH PANEL', desc: 'Ham veri olarak saklanır; bağlantı üretmez.' },
    { col: 'F', group: 'HEDEF', header: 'HEDEF PATCH PANEL', desc: 'Ham veri olarak saklanır; bağlantı üretmez.' },
    { col: 'G', group: '', header: 'KARŞI UÇ ETİKET BİLGİSİ', desc: 'Ham veri; eşleştirmede kullanılmaz.' },
    { col: 'H', group: '', header: 'SWİTCH ETİKET BİLGİSİ', desc: 'Ham veri; eşleştirmede kullanılmaz.' },
    { col: 'I', group: '', header: 'CİHAZ BİLGİSİ', desc: 'Hedef cihaz: kabin + U başlangıcı (KABİN ile aynı biçimler, DATA NICn eki kabul).' },
    { col: 'J', group: '', header: 'PORT BİLGİSİ', desc: 'Hedef port etiketi; CAT port id/adıyla birebir eşlenir, boş olamaz.' },
    { col: 'K', group: '', header: 'ÇALIŞMA TARİHİ', desc: 'Ham veri olarak saklanır.' },
    { col: 'L', group: '', header: 'ÇALIŞMAYI YAPAN PERSONEL', desc: 'Ham veri olarak saklanır (kişisel veri; paylaşmayın).' }
  ];
  const FORMAT_RULES = [
    'Satır 1 grup başlığıdır: yalnız A = KAYNAK ve F = HEDEF dolu, diğer hücreler boş.',
    'Satır 2 kolon başlıklarıdır; sıra ve yazım birebir aynı olmalı, L\'den sonra başlık olmamalı. Uymazsa hiçbir satır işlenmez.',
    'Veri 3. satırdan başlar; boş satırlar atlanır. İki PORT BİLGİSİ kolonu konumuyla ayrılır (D kaynak, J hedef).',
    'Cihaz örnekleri yalnız biçimi gösterir (KABİN 12U, KABİN U12, KABİN 12-13, KABİN-SAN); gerçek kabin/cihaz değildir.',
    'Yalnız yeni bağlantılar eklenir; mevcut LNK kayıtları güncellenmez veya silinmez.'
  ];
  const STATE_TEXT = { IDLE: 'Boşta', UPLOADING: 'Yükleniyor', VERIFYING: 'Doğrulanıyor', READY: 'Hazır', RUNNING: 'Çalışıyor', DONE: 'Tamamlandı', FAILED: 'Başarısız', CANCELLED: 'İptal edildi', EXPIRED: 'Süresi doldu' };
  const STAGE_TEXT = { upload: 'Dosya sunucuya yükleniyor', verify: 'Dosya sunucuda doğrulanıyor', preview: 'Önizleme hazırlanıyor', import: 'İçe aktarma yapılıyor',
    export: 'Sonuç Excel\'i hazırlanıyor', download: 'Sonuç Excel\'i indiriliyor', request: 'İstek gönderiliyor' };
  const EXIT_TEXT = { 0: '0 — tamamlandı', 1: '1 — girdi/ortam hatası (yazma yok)', 2: '2 — şema hazır değil (yazma yok)', 3: '3 — durduruldu (önceki commit\'ler kalıcı olabilir)', 4: '4 — yazma başlamadan iptal edildi' };
  const EXPORT_WARN = { IMAGES_DROPPED: 'Görseller sonuç dosyasında yer almaz.', THREADED_COMMENTS: 'Yazışmalı yorumlar korunmayabilir (klasik notlar korunur).' };
  const EXPORT_CLS = { ok: 'Aktarıldı', port: 'Aktarıldı, port eşleşmedi', existing: 'Zaten kayıtlı', file_dup: 'Dosyada tekrar', data: 'Veri hatası (kırmızı)', system: 'Sistem hatası', check: 'Kontrol edilmeli', not_processed: 'İşlenmedi', out_of_scope: 'Kapsam dışı' };
  const EXPORT_ORDER = ['ok', 'port', 'existing', 'file_dup', 'data', 'system', 'check', 'not_processed', 'out_of_scope'];

  const BTN = (variant, label, icon, attrs, disabled, loading) =>
    '<button type="button" class="' + buttonClasses(variant, 'sm', !label) + '" ' + (attrs || '') + (disabled ? ' disabled' : '') + '>' +
      (loading ? '<i class="pi pi-spin pi-spinner text-current shrink-0"></i>' : icon ? '<i class="' + icon + ' text-current shrink-0"></i>' : '') +
      (label ? '<span class="truncate">' + esc(label) + '</span>' : '') + '</button>';
  const INPUT = 'scada-input w-full py-1 px-2.5 bg-slate-50 dark:bg-surface-panel border border-slate-200 dark:border-border-subtle rounded-[2px] text-[11px] text-slate-800 dark:text-slate-200';
  const sizeText = n => (n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' B');
  const pad = n => String(n).padStart(2, '0');
  const fmtTime = d => (d ? pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) : '-');
  const countsOf = rec => (rec ? Object.keys(rec).sort().map(key => ({ key, value: rec[key] })) : []);
  const reasonGroups = rec => (rec ? Object.keys(rec).map(cat => ({ cat, items: countsOf(rec[cat]).sort((a, b) => b.value - a.value).slice(0, 8) })).filter(g => g.items.length) : []);
  const SITE_RE = /^[A-Za-z0-9_-]{0,64}$/;

  function mount(el, params) {
    const L = DCIM.data.lnkImport;
    if (!L) { el.innerHTML = '<div class="p-4">' + kit.emptyState({ message: 'LNK içe aktarma verisi yok' }) + '</div>'; return null; }
    const timers = [];
    const later = (fn, ms) => { timers.push(setTimeout(fn, ms)); };
    const isProd = L.env === 'prod';

    const S = {
      showFormat: params.get('format') === '1',
      file: null, fileError: '',
      job: null,            // { state, name, size, sha, sheets, preview:{target,env} }
      stage: '', progressDone: 0, progressTotal: 0,
      sheet: '', rows: params.get('rows') || '', site: params.get('site') || '',
      lastRun: null, previewOk: false, previewSig: '', confirmImport: false, confirmTarget: '',
      exportInfo: null, notice: null, importRows: null
    };
    const sig = () => JSON.stringify([S.sheet, S.rows.trim(), S.site.trim()]);
    const terminal = () => !!S.job && ['DONE', 'FAILED', 'CANCELLED', 'EXPIRED'].indexOf(S.job.state) >= 0;
    const running = () => !!S.job && S.job.state === 'RUNNING';
    const locked = () => !!S.stage;
    const canChooseFile = () => !S.stage && (!S.job || terminal());
    const sheetError = () => (S.job && S.job.state === 'READY' && S.sheet === '' && S.lastRun === null ? '' : (S.job && S.sheet && S.job.sheets.indexOf(S.sheet) < 0 ? 'Sunucunun bildirdiği sheet\'lerden biri seçilmeli.' : ''));
    const rowsError = () => (S.rows.trim() && !L.parseRanges(S.rows) ? 'Geçersiz satır aralığı. Biçim: 3-20,25; veri satırları 3\'ten başlar.' : '');
    const siteError = () => (!SITE_RE.test(S.site.trim()) ? 'Yalnız harf, rakam, _ ve - (en çok 64 karakter).' : '');
    const paramsOk = () => !!S.sheet && !rowsError() && !siteError();
    const paramsMatchPreview = () => S.previewOk && S.previewSig === sig();
    const canImport = () => S.previewOk && S.job && S.job.state === 'READY' && paramsMatchPreview() && S.confirmImport && !locked() &&
      (!isProd || S.confirmTarget.trim().toLocaleLowerCase('en-US') === L.target.toLocaleLowerCase('en-US'));

    el.innerHTML = '<div class="eng-lnk p-4" data-lnk-root></div>';
    const root = el.querySelector('[data-lnk-root]');
    let reportApi = null;

    function box(kind, icon, html) {
      return '<div class="lnk-box lnk-box-' + kind + '"><i class="pi ' + icon + '"></i><span class="flex-1">' + html + '</span></div>';
    }
    function card(title, icon, subtitle, body, headActions, badge) {
      return '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] p-3.5 shadow-2xs">' +
        '<div class="flex items-center justify-between mb-3 border-b border-slate-100 dark:border-slate-800/80 pb-2 gap-2">' +
          '<div class="flex items-center gap-2 min-w-0"><i class="' + icon + ' text-sky-600 dark:text-sky-400 text-sm"></i><div class="min-w-0">' +
            '<h3 class="text-xs font-extrabold text-slate-900 dark:text-slate-100 leading-none">' + esc(title) + '</h3>' +
            (subtitle ? '<p class="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">' + esc(subtitle) + '</p>' : '') + '</div></div>' +
          '<div class="flex items-center gap-2">' + (badge ? '<span class="px-1.5 py-0.5 rounded-[2px] text-[9px] font-extrabold bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20">' + esc(badge) + '</span>' : '') + (headActions || '') + '</div>' +
        '</div><div class="text-xs text-slate-800 dark:text-slate-200">' + body + '</div></div>';
    }
    function field(label, control, o) {
      o = o || {};
      return '<div class="flex flex-col gap-1 w-full"><label class="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between gap-2"><span>' + esc(label) +
        (o.required ? '<span class="text-rose-500 font-bold ml-0.5">*</span>' : '') + '</span>' + (o.hint ? '<span class="text-[10px] font-normal text-slate-400 text-right">' + esc(o.hint) + '</span>' : '') + '</label>' +
        control + '<p data-lnk-err="' + (o.errKey || '') + '" class="text-[10px] text-rose-500 font-medium flex items-center gap-1' + (o.error ? '' : ' hidden') + '"><i class="pi pi-exclamation-circle text-[10px]"></i><span>' + esc(o.error || '') + '</span></p></div>';
    }

    function formatCard() {
      return '<div class="mb-4">' + card('Beklenen Excel formatı', 'pi pi-table', 'Yalnız kolon/başlık düzeni ve alan açıklamaları; gerçek veri içermez.',
        '<div class="overflow-x-auto"><table class="lnk-format-table w-full text-[11px] border-collapse"><thead><tr><th class="lnk-th w-28">Satır</th>' +
          FORMAT_COLUMNS.map(c => '<th class="lnk-th text-center">' + c.col + '</th>').join('') + '</tr></thead><tbody>' +
          '<tr><td class="lnk-td font-semibold">1 · Grup başlığı</td>' + FORMAT_COLUMNS.map(c => '<td class="lnk-td text-center font-extrabold text-sky-700 dark:text-sky-400">' + esc(c.group) + '</td>').join('') + '</tr>' +
          '<tr><td class="lnk-td font-semibold">2 · Kolon başlığı</td>' + FORMAT_COLUMNS.map(c => '<td class="lnk-td text-center font-bold whitespace-nowrap">' + esc(c.header) + '</td>').join('') + '</tr>' +
          '<tr><td class="lnk-td font-semibold">Açıklama</td>' + FORMAT_COLUMNS.map(c => '<td class="lnk-td align-top text-slate-600 dark:text-slate-400 min-w-[9rem]">' + esc(c.desc) + '</td>').join('') + '</tr>' +
        '</tbody></table></div>' +
        '<ul class="mt-3 list-disc pl-5 space-y-1 text-[11px] text-slate-600 dark:text-slate-400">' + FORMAT_RULES.map(r => '<li>' + esc(r) + '</li>').join('') + '</ul>') + '</div>';
    }

    function fileCard() {
      let b = '';
      if (canChooseFile()) {
        b += '<div class="flex flex-col gap-3">' +
          field('Excel dosyası (.xlsx / .xlsm)',
            '<input type="file" data-lnk-file accept=".xlsx,.xlsm" class="scada-input w-full py-1 px-2 bg-slate-50 dark:bg-surface-panel border border-slate-200 dark:border-border-subtle rounded-[2px] text-[11px] text-slate-800 dark:text-slate-200 file:mr-2 file:px-2 file:py-0.5 file:rounded-[2px] file:border-0 file:bg-sky-600 file:text-white file:text-[11px] file:font-bold cursor-pointer">',
            { required: true, hint: 'Dosya yalnız bu iş için sunucuda geçici tutulur', error: S.fileError }) +
          '<div class="flex items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400">' +
            '<span>' + (S.file ? 'Seçilen: ' + esc(S.file.name) + ' (' + sizeText(S.file.size) + ')' : '') + '</span>' +
            BTN('ghost', 'Örnek dosya seç (' + L.sample.name + ')', 'pi pi-file-excel', 'data-lnk-act="sample" title="Sunum: örnek LNK çalışma kitabını seçer"') + '</div>' +
          (terminal() ? '<p class="text-[10px] text-amber-700 dark:text-amber-300">Yeni dosya yüklemek önceki sonucu ve sonuç Excel\'ini kaldırır; gerekiyorsa önce indirin.</p>' : '') +
          '<div class="flex justify-end pt-2 border-t border-slate-100 dark:border-border-subtle">' + BTN('primary', 'Yükle ve Doğrula', 'pi pi-upload', 'data-lnk-act="upload"', !S.file) + '</div>' +
        '</div>';
      }
      if (S.job && S.job.state !== 'UPLOADING' && S.job.name) {
        b += '<div class="mt-1 flex flex-col gap-1 text-[11px]">' +
          '<div class="flex justify-between gap-2"><span class="text-slate-500 dark:text-slate-400">Sunucudaki dosya</span><span class="font-semibold text-right break-all">' + esc(S.job.name) + ' (' + sizeText(S.job.size) + ')</span></div>' +
          '<div class="flex justify-between gap-2"><span class="text-slate-500 dark:text-slate-400">SHA-256</span><span class="font-mono text-[10px] text-right break-all">' + esc(S.job.sha) + '</span></div>' +
          (S.job.state === 'READY' && !locked() ? '<div class="flex justify-end pt-2">' + BTN('ghost', 'Dosyayı Kaldır', 'pi pi-trash', 'data-lnk-act="discard"') + '</div>' : '') +
        '</div>';
      }
      return card('1. Excel dosyası', 'pi pi-file-excel', 'En çok ' + L.maxFileMb + ' MB; ' + L.chunkKb + ' KB\'lık parçalarla aktarılır, sunucuda boyut ve SHA-256 doğrulanır.', b);
    }

    function paramsCard() {
      if (!S.job || (S.job.state !== 'READY' && S.job.state !== 'RUNNING')) return '';
      const dis = S.job.state !== 'READY' || locked();
      let b = '<div class="flex flex-col gap-3">' +
        field('Sheet', '<select data-lnk-p="sheet" class="' + INPUT + '"' + (dis ? ' disabled' : '') + '><option value="" disabled' + (S.sheet ? '' : ' selected') + '>Sheet seçin</option>' +
          S.job.sheets.map(s => '<option' + (s === S.sheet ? ' selected' : '') + '>' + esc(s) + '</option>').join('') + '</select>', { required: true, error: sheetError() }) +
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' +
          field('Satır aralığı (isteğe bağlı)', '<input data-lnk-p="rows" maxlength="199" placeholder="3-20,25" class="' + INPUT + '" value="' + esc(S.rows) + '"' + (dis ? ' disabled' : '') + '>', { hint: 'Örn. 3-20,25; boşsa tüm sheet', error: rowsError(), errKey: 'rows' }) +
          field('Tesis daraltması (isteğe bağlı)', '<input data-lnk-p="site" maxlength="64" class="' + INPUT + '" value="' + esc(S.site) + '"' + (dis ? ' disabled' : '') + '>', { hint: 'Tesis kökünün LOC.location_id değeri; boşsa tüm tesisler', error: siteError(), errKey: 'site' }) +
        '</div>' +
        '<p class="text-[10px] text-slate-500 dark:text-slate-400">Önizleme LNK ve LNK_FAILD tablolarına yazmaz; sunucuda rapor dosyası oluşturur.</p>' +
        '<div class="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-border-subtle" data-lnk-previewbar>' + BTN('primary', 'Önizle', 'pi pi-eye', 'data-lnk-act="preview"', dis || !paramsOk(), S.stage === 'preview') + '</div>';
      if (S.previewOk && S.job.state === 'READY') {
        b += '<div class="mt-1 p-3 rounded-[2px] border border-amber-500/30 bg-amber-500/5 flex flex-col gap-2" data-lnk-confirm>' + confirmInner() + '</div>';
      }
      return card('2. Önizleme ve içe aktarma', 'pi pi-sliders-h', '', b + '</div>');
    }
    function confirmInner() {
      return '<div class="text-xs font-extrabold text-amber-700 dark:text-amber-300 flex items-center gap-2"><i class="pi pi-database"></i> İçe aktarma onayı</div>' +
        '<p class="text-[11px] text-slate-700 dark:text-slate-300">Son başarılı önizlemeyle aynı dosya, parametre ve hedef (' + esc(L.target) + ', ' + esc(L.env) + ') kullanılır. Yalnız yeni bağlantılar yazılır; her satır ayrı commit edilir, iptal önceki satırları geri almaz.</p>' +
        (!paramsMatchPreview() ? '<p class="text-[11px] text-rose-600 dark:text-rose-400">Parametreler son önizlemeden farklı. İçe aktarmadan önce yeniden önizleyin.</p>' : '') +
        '<label class="flex items-center gap-2 text-[11px] cursor-pointer select-none"><input type="checkbox" data-lnk-p="confirmImport" class="accent-sky-600"' + (S.confirmImport ? ' checked' : '') + (!paramsMatchPreview() || locked() ? ' disabled' : '') + '><span>Önizleme sonucunu inceledim; içe aktarmayı onaylıyorum.</span></label>' +
        (isProd ? field('Prod hedef onayı', '<input data-lnk-p="confirmTarget" maxlength="300" class="' + INPUT + '" value="' + esc(S.confirmTarget) + '"' + (locked() ? ' disabled' : '') + '>', { hint: 'Devam etmek için hedefi aynen yazın: ' + L.target }) : '') +
        '<div class="flex justify-end" data-lnk-importbtn>' + BTN('danger', 'İçe Aktar', 'pi pi-check', 'data-lnk-act="import"', !canImport()) + '</div>';
    }

    function resultCard() {
      let b = '';
      const job = S.job;
      if (!job) b = '<div class="py-4 text-slate-500 dark:text-slate-400">Etkin iş yok. Bir Excel dosyası yükleyerek başlayın.</div>';
      else {
        b += '<div class="flex flex-col gap-3">';
        if (running()) b += box('info', 'pi-spin pi-spinner', esc(STATE_TEXT.RUNNING) + (S.lastRun ? ' · ' + (S.lastRun.mode === 'import' ? 'İçe aktarma' : 'Önizleme') : ''));
        const lr = S.lastRun;
        if (lr) {
          const p = lr.params;
          b += '<div class="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">' +
            kv('İşlem', '<span class="font-semibold">' + (lr.mode === 'import' ? 'İçe aktarma' : 'Önizleme') + '</span>') +
            kv('Sheet', '<span class="font-semibold break-all">' + esc(p.sheet) + '</span>') +
            (p.rows ? kv('Satır aralığı (isteğe bağlı)', '<span class="font-semibold">' + esc(p.rows) + '</span>') : '') +
            (p.site ? kv('Tesis daraltması (isteğe bağlı)', '<span class="font-semibold">' + esc(p.site) + '</span>') : '') +
            kv('Başlangıç', esc(fmtTime(lr.started))) + kv('Bitiş', esc(fmtTime(lr.finished))) +
            kv('Sonuç kodu', '<span class="font-semibold">' + esc(lr.exit === null ? '-' : EXIT_TEXT[lr.exit] || lr.exit) + '</span>') +
            (lr.result ? kv('Hedef', '<span class="font-semibold break-all">' + esc(lr.result.target) + ' (' + esc(lr.result.env) + ')</span>') +
              kv('Çalıştırma', '<span class="font-mono text-[10px] break-all">' + esc(lr.result.run_id) + '</span>') : '') +
          '</div>';
          const sm = lr.result && lr.result.summary;
          if (sm) {
            if (lr.mode === 'preview') b += '<div class="text-[10px] text-slate-500 dark:text-slate-400">Önizleme: veritabanına yazılmadı; sayılar yazılacak/yazılmayacak satırları gösterir.</div>';
            const faild = countsOf(sm.lnk_faild_written);
            b += '<div class="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">' +
              kv('Kayıt (toplam / işlenen)', '<span class="font-semibold">' + lr.result.data_records + ' / ' + lr.result.selected_records + '</span>') +
              (lr.mode === 'import' ? kv('Eklenen LNK', '<span class="font-extrabold text-emerald-600 dark:text-emerald-400">' + (sm.lnk_inserted || 0) + '</span>') +
                kv('LNK_FAILD yazılan', '<span class="font-semibold">' + (faild.length ? faild.map(c => c.key + '=' + c.value).join(', ') : '0') + '</span>') : '') +
              kv('COMMIT_UNKNOWN', '<span class="font-semibold">' + (sm.commit_unknown_count || 0) + '</span>') +
            '</div>' +
            '<div><div class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Sonuç sayıları</div>' +
              '<table class="w-full text-[11px] border-collapse">' + countsOf(sm.outcome_counts).map(c => '<tr class="border-b border-slate-100 dark:border-slate-800/80"><td class="py-0.5 font-mono">' + esc(c.key) + '</td><td class="py-0.5 text-right font-semibold">' + c.value + '</td></tr>').join('') + '</table></div>';
            const rg = reasonGroups(sm.reason_counts);
            if (rg.length) {
              b += '<div><div class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Gerekçeler (en sık)</div>' +
                rg.map(g => '<div class="mb-1.5"><div class="text-[10px] font-bold text-slate-600 dark:text-slate-300">' + esc(g.cat) + '</div><div class="flex flex-wrap gap-1 mt-0.5">' +
                  g.items.map(r => '<span class="px-1.5 py-0.5 rounded-[2px] text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono">' + esc(r.key) + '=' + r.value + '</span>').join('') + '</div></div>').join('') + '</div>';
            }
            b += '<div class="text-[10px] text-slate-500 dark:text-slate-400">Sunucu raporu: ' + esc(lr.result.report_name) + ' (rapor ve journal silinmez)</div>';
          } else if (!running()) b += '<div class="text-[11px] text-slate-500 dark:text-slate-400">Sonuç henüz yok.</div>';

          if (!running()) {
            b += '<div class="flex flex-col gap-2 pt-2 border-t border-slate-100 dark:border-border-subtle"><div class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">Sonuç Excel\'i</div>';
            if (lr.mode === 'preview') b += '<p class="text-[11px] text-slate-500 dark:text-slate-400">Önizleme sonucu indirilmez; sonuç Excel\'i yalnız içe aktarmadan sonra gerçek satır sonuçlarıyla üretilir.</p>';
            else if (terminal()) {
              const ex = S.exportInfo;
              if (!ex) b += '<p class="text-[11px] text-slate-500 dark:text-slate-400">Bu içe aktarma için sonuç Excel\'i yok.</p>';
              else if (ex.state === 'BUILDING') b += '<div class="text-[11px] text-slate-600 dark:text-slate-300">Sonuç Excel\'i hazırlanıyor…</div>';
              else {
                b += '<div class="flex items-center justify-between gap-2 text-[11px]"><span class="break-all">Hazır: ' + esc(ex.name) + ' (' + sizeText(ex.size) + ')</span>' +
                    BTN('primary', 'Sonuç Excel\'ini İndir', 'pi pi-download', 'data-lnk-act="download"', locked(), S.stage === 'download') + '</div>' +
                  '<div class="flex flex-wrap gap-1">' + EXPORT_ORDER.filter(k => ex.counts[k]).map(k => '<span class="px-1.5 py-0.5 rounded-[2px] text-[10px] font-semibold ' +
                    (k === 'data' ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300') + '">' + esc(EXPORT_CLS[k]) + ': ' + ex.counts[k] + '</span>').join('') + '</div>' +
                  box('warn', 'pi-exclamation-triangle', '<div class="font-bold">Biçim uyarıları (sonuç dosyasında korunmayan içerik)</div><ul class="list-disc pl-4">' + ex.warnings.map(w => '<li>' + esc(EXPORT_WARN[w] || w) + '</li>').join('') + '</ul>') +
                  '<p class="text-[10px] text-slate-500 dark:text-slate-400">Sonuç Excel\'i rapor amaçlıdır: özgün dosya değiştirilmez, yalnız DATA nedeniyle aktarılamayan satırlar kırmızıdır. Eklenen "Sonuçlar" kolonu nedeniyle içe aktarma şablonu olarak yeniden yüklenmez.</p>' +
                  '<p class="text-[10px] text-slate-500 dark:text-slate-400">Formüller korunur; hesaplanmış değerleri Excel dosya açılırken yeniden hesaplar.</p>';
              }
            }
            b += '</div>';
          }
        }
        b += '</div>';
      }
      b += '<p class="mt-3 text-[10px] text-slate-400 dark:text-slate-500">Aktarım kimlikli oturum üzerindendir; base64 yalnız taşıma biçimidir, gizlilik sağlamaz. Ayrıntılı satır raporu bu ekranda yayımlanmaz.</p>';
      return card('Durum ve sonuç', 'pi pi-chart-bar', '', b, '<div data-lnk-report></div>', job ? STATE_TEXT[job.state] : '');
    }
    const kv = (k, v) => '<span class="text-slate-500 dark:text-slate-400">' + esc(k) + '</span><span>' + v + '</span>';

    function render() {
      const h = kit.pageHeader({
        title: 'Ağ Bağlantılarını İçe Aktar',
        breadcrumbs: [{ label: 'Mühendislik', href: 'engineering.html#home' }, { label: 'Ağ Bağlantılarını İçe Aktar' }],
        actions:
          '<span class="px-2 py-0.5 text-[10px] font-extrabold rounded-[2px] border ' + (isProd ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30' : 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30') + '">Hedef ortam: ' + esc(L.env) + '</span>' +
          BTN('secondary', S.showFormat ? 'Excel Formatını Gizle' : 'Excel Formatını Göster', 'pi pi-table', 'data-lnk-act="format"') +
          BTN('ghost', 'Yenile', 'pi pi-refresh', 'data-lnk-act="refresh"', locked())
      });
      let stageHtml = '';
      if (S.stage) {
        stageHtml = '<div class="lnk-box lnk-box-info mb-3" role="status" aria-live="polite"><i class="pi pi-spin pi-spinner"></i><div class="flex-1 flex flex-col gap-1.5 min-w-0">' +
          '<div class="flex justify-between gap-2"><span class="font-bold">' + esc(STAGE_TEXT[S.stage]) + '</span>' +
            (S.stage === 'upload' && S.progressTotal ? '<span>' + S.progressDone + ' / ' + S.progressTotal + ' parça</span>' : '') + '</div>' +
          '<div class="lnk-bar"></div><span class="font-semibold">İşlem tamamlanana kadar bu sayfadan ayrılmayın.</span></div></div>';
      }
      const notice = S.notice ? '<div class="mb-3 px-3 py-2 rounded-[2px] border text-xs flex items-start gap-2 ' +
        ({ error: 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300', warn: 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300', info: 'bg-sky-500/10 border-sky-500/30 text-sky-700 dark:text-sky-300' }[S.notice.kind]) +
        '" role="status"><i class="pi text-xs mt-0.5 ' + (S.notice.kind === 'info' ? 'pi-info-circle' : 'pi-exclamation-triangle') + '"></i><span>' + esc(S.notice.text) + '</span></div>' : '';
      root.innerHTML = h + stageHtml + notice + (S.showFormat ? formatCard() : '') +
        '<div class="grid grid-cols-1 xl:grid-cols-2 gap-4"><div class="flex flex-col gap-4">' + fileCard() + paramsCard() + '</div>' + resultCard() + '</div>';
      const rh = root.querySelector('[data-lnk-report]');
      const sm = S.lastRun && S.lastRun.result && S.lastRun.result.summary;
      if (rh && sm && !running() && DCIM.report && DCIM.report.menu) {
        reportApi = DCIM.report.menu(rh, {
          label: 'Rapor al', scopes: [{ id: 'list', label: 'Son çalıştırma sonucu', hint: 'Sonuç sayıları ve gerekçeler' }],
          options: 'limit', unit: 'gerekçe', total: reasonRows().length, defaultLimit: 50, onExport: exportReport
        });
      }
    }

    function reasonRows() {
      const rec = S.lastRun && S.lastRun.result && S.lastRun.result.summary.reason_counts;
      if (!rec) return [];
      return Object.keys(rec).flatMap(cat => countsOf(rec[cat]).sort((a, b) => b.value - a.value).map(c => ({ cat, key: c.key, value: c.value })));
    }
    function exportReport(req) {
      const lr = S.lastRun;
      const sm = lr.result.summary;
      const reasons = DCIM.report.applyLimit(reasonRows(), req);
      const mode = lr.mode === 'import' ? 'İçe aktarma' : 'Önizleme';
      DCIM.report.generate({
        title: 'Ağ Bağlantılarını İçe Aktar', filename: 'lnk_ice_aktarma_' + lr.mode,
        subtitle: mode + ' · Sheet: ' + lr.params.sheet + (lr.params.rows ? ' · Satır: ' + lr.params.rows : '') + ' · Hedef: ' + lr.result.target + ' (' + lr.result.env + ')',
        kpis: [{ label: 'Kayıt', value: lr.result.data_records }, { label: 'İşlenen', value: lr.result.selected_records },
          { label: 'Eklenen LNK', value: lr.mode === 'import' ? sm.lnk_inserted : '—', tone: 'normal' }, { label: 'COMMIT_UNKNOWN', value: sm.commit_unknown_count || 0 }],
        sections: [
          { title: 'Sonuç sayıları', columns: [{ key: 'key', label: 'Sonuç' }, { key: 'value', label: 'Sayı', align: 'right' }], rows: countsOf(sm.outcome_counts) },
          { title: 'Gerekçeler', columns: [{ key: 'cat', label: 'Kategori' }, { key: 'key', label: 'Gerekçe' }, { key: 'value', label: 'Sayı', align: 'right' }], rows: reasons }
        ],
        notes: ['Sunucunun sonuç Excel\'i satır bazlı veri dosyasıdır; bu rapor yalnız ekrandaki özeti verir.']
      }, req.format);
    }

    // ---- işlemler -----------------------------------------------------------------------
    function chooseSample() {
      S.file = { name: L.sample.name, size: L.sample.size, sample: true };
      S.fileError = '';
      render();
    }
    function upload(fast) {
      if (!S.file) return;
      S.job = { state: 'UPLOADING', name: S.file.name, size: S.file.size, sha: '', sheets: [] };
      S.lastRun = null; S.previewOk = false; S.exportInfo = null; S.confirmImport = false; S.confirmTarget = ''; S.notice = null;
      S.stage = 'upload';
      S.progressTotal = Math.max(1, Math.ceil(S.file.size / (L.chunkKb * 1024)));
      S.progressDone = 0;
      const finish = () => {
        S.job.state = 'READY';
        S.job.sha = S.file.sample ? L.sample.sha : L.sample.sha.split('').reverse().join('');
        S.job.sheets = L.sample.sheets.slice();
        S.stage = '';
        S.notice = { kind: 'info', text: 'Dosya aktarıldı ve doğrulandı. Sheet ve parametreleri seçip önizleyin.' };
        S.file = null;
        render();
      };
      if (fast) { S.progressDone = S.progressTotal; finish(); return; }
      render();
      const step = () => {
        S.progressDone = Math.min(S.progressTotal, S.progressDone + 1);
        if (S.progressDone < S.progressTotal) { render(); later(step, 60); return; }
        S.stage = 'verify'; S.job.state = 'VERIFYING'; render();
        later(finish, 500);
      };
      later(step, 60);
    }
    function runPreview(fast) {
      if (!paramsOk()) return;
      const params = { sheet: S.sheet, rows: S.rows.trim(), site: S.site.trim() };
      const started = new Date();
      const done = () => {
        const result = L.run('preview', params);
        S.lastRun = { mode: 'preview', params, started, finished: new Date(), exit: 0, result };
        S.previewOk = true; S.previewSig = sig(); S.confirmImport = false; S.confirmTarget = '';
        S.stage = ''; S.notice = null;
        render();
      };
      if (fast) { done(); return; }
      S.stage = 'preview'; S.notice = null; render();
      later(done, 900);
    }
    function runImport(fast) {
      if (!canImport() && !fast) return;
      const params = { sheet: S.sheet, rows: S.rows.trim(), site: S.site.trim() };
      const started = new Date();
      const snap = L.select(params);
      const done = () => {
        const result = L.run('import', params);
        S.importRows = snap;
        S.lastRun = { mode: 'import', params, started, finished: new Date(), exit: 0, result };
        S.job.state = 'DONE'; S.previewOk = false; S.confirmImport = false; S.confirmTarget = '';
        S.stage = 'export'; S.exportInfo = { state: 'BUILDING' };
        render();
        const ready = () => {
          const counts = {};
          snap.forEach(x => { counts[x.cls] = (counts[x.cls] || 0) + 1; });
          S.exportInfo = { state: 'READY', name: S.job.name.replace(/\.(xlsx|xlsm)$/i, '') + '_sonuc.xlsx', size: Math.round(S.job.size * 1.08), counts, warnings: ['IMAGES_DROPPED', 'THREADED_COMMENTS'] };
          S.stage = '';
          toast(result.summary.lnk_inserted + ' bağlantı eklendi (sunum: veritabanına yazılmadı).', 'success', 'LNK içe aktarma');
          render();
        };
        if (fast) ready(); else later(ready, 700);
      };
      if (fast) { S.job.state = 'RUNNING'; done(); return; }
      S.stage = 'import'; S.job.state = 'RUNNING';
      S.lastRun = { mode: 'import', params, started, finished: null, exit: null, result: null };
      render();
      later(done, 1600);
    }
    function download() {
      S.stage = 'download'; render();
      later(() => {
        S.stage = '';
        const rows = L.resultRows(S.lastRun.params, S.importRows);
        DCIM.report.generate({
          title: 'LNK İçe Aktarma Sonucu', filename: (S.exportInfo.name || 'lnk_sonuc').replace(/\.xlsx$/i, ''),
          subtitle: 'Sheet: ' + S.lastRun.params.sheet + ' · Hedef: ' + L.target + ' (' + L.env + ')',
          kpis: EXPORT_ORDER.filter(k => S.exportInfo.counts[k]).map(k => ({ label: EXPORT_CLS[k], value: S.exportInfo.counts[k], tone: k === 'data' ? 'alarm' : k === 'ok' ? 'normal' : 'info' })),
          sections: [{
            title: 'LNK', toneKey: 'tone',
            columns: [{ key: 'sheetRow', label: 'Satır', align: 'right' }, { key: 'kat', label: 'KAT' }, { key: 'salon', label: 'SALON' }, { key: 'kabin', label: 'KABİN' },
              { key: 'srcPort', label: 'PORT BİLGİSİ' }, { key: 'srcPatch', label: 'KAYNAK PATCH PANEL' }, { key: 'dstPatch', label: 'HEDEF PATCH PANEL' },
              { key: 'farLabel', label: 'KARŞI UÇ ETİKET BİLGİSİ' }, { key: 'switchLabel', label: 'SWİTCH ETİKET BİLGİSİ' }, { key: 'cihaz', label: 'CİHAZ BİLGİSİ' },
              { key: 'dstPort', label: 'PORT BİLGİSİ' }, { key: 'workDate', label: 'ÇALIŞMA TARİHİ' }, { key: 'staff', label: 'ÇALIŞMAYI YAPAN PERSONEL' }, { key: 'result', label: 'Sonuçlar' }],
            rows
          }]
        }, 'xlsx');
        toast('Sonuç Excel\'i indirildi.', 'success', 'LNK içe aktarma');
        render();
      }, 500);
    }

    // ---- olaylar ------------------------------------------------------------------------
    root.addEventListener('click', e => {
      const t = e.target.closest('[data-lnk-act]');
      if (!t || t.disabled) return;
      switch (t.dataset.lnkAct) {
        case 'format': S.showFormat = !S.showFormat; render(); break;
        case 'refresh': S.notice = null; render(); toast('Durum yenilendi.', 'info', 'LNK içe aktarma'); break;
        case 'sample': chooseSample(); break;
        case 'upload': upload(false); break;
        case 'discard': S.job = null; S.lastRun = null; S.previewOk = false; S.exportInfo = null; S.notice = null; S.sheet = ''; render(); break;
        case 'preview': runPreview(false); break;
        case 'import': runImport(false); break;
        case 'download': download(); break;
      }
    });
    // Yazarken odak kaybolmasın: yalnız hata satırı ve düğme durumları güncellenir
    function softUpdate() {
      const setErr = (key, msg) => { const p = root.querySelector('[data-lnk-err="' + key + '"]'); if (p) { p.classList.toggle('hidden', !msg); p.querySelector('span').textContent = msg; } };
      setErr('rows', rowsError());
      setErr('site', siteError());
      const pb = root.querySelector('[data-lnk-previewbar] button');
      if (pb) pb.disabled = !S.job || S.job.state !== 'READY' || locked() || !paramsOk();
      const cf = root.querySelector('[data-lnk-confirm]');
      if (cf) {
        const warn = !paramsMatchPreview();
        const hasWarn = !!cf.querySelector('.text-rose-600');
        if (warn !== hasWarn) { const ae = document.activeElement; const id = ae && ae.dataset ? ae.dataset.lnkP : ''; const pos = ae && ae.selectionStart; cf.innerHTML = confirmInner(); if (id) { const n = root.querySelector('[data-lnk-p="' + id + '"]'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* yok */ } } } }
        const ib = root.querySelector('[data-lnk-importbtn] button');
        if (ib) ib.disabled = !canImport();
        const cb = root.querySelector('[data-lnk-p="confirmImport"]');
        if (cb) cb.disabled = warn || locked();
      }
    }
    root.addEventListener('input', e => {
      const k = e.target.dataset && e.target.dataset.lnkP;
      if (!k || e.target.type === 'checkbox' || e.target.tagName === 'SELECT') return;
      S[k] = e.target.value;
      softUpdate();
    });
    root.addEventListener('change', e => {
      const t = e.target;
      if (t.matches('[data-lnk-file]')) {
        const f = t.files && t.files[0];
        if (!f) return;
        if (!/\.(xlsx|xlsm)$/i.test(f.name)) { S.file = null; S.fileError = 'Yalnız .xlsx veya .xlsm dosyası seçilebilir.'; render(); return; }
        if (!f.size) { S.file = null; S.fileError = 'Dosya boş.'; render(); return; }
        if (f.size > L.maxFileMb * 1048576) { S.file = null; S.fileError = 'Dosya ' + L.maxFileMb + ' MB sınırını aşıyor.'; render(); return; }
        S.file = { name: f.name, size: f.size, sample: false };
        S.fileError = '';
        toast('Sunumda dosya içeriği okunmaz; örnek LNK satırları kullanılır.', 'info', 'LNK içe aktarma');
        render();
        return;
      }
      const k = t.dataset && t.dataset.lnkP;
      if (!k) return;
      if (t.type === 'checkbox') { S[k] = t.checked; softUpdate(); return; }
      if (t.tagName === 'SELECT') { S[k] = t.value; render(); return; }
    });

    // ---- derin bağlantılar ---------------------------------------------------------------
    const step = params.get('step');
    const order = ['upload', 'preview', 'confirm', 'done'];
    const lvl = order.indexOf(step);
    if (lvl >= 0) {
      chooseSample();
      upload(true);
      S.notice = null;
      S.sheet = 'LNK';
      if (lvl >= 1) runPreview(true);
      if (lvl >= 2) { S.confirmImport = true; S.confirmTarget = L.target; }
      if (lvl >= 3) runImport(true);
    }
    render();

    return { destroy() { timers.forEach(clearTimeout); } };
  }

  DCIM.engRegistry['lnk-import'] = { mount };
})();
