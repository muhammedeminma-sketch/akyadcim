/* ==========================================================================
   DCIM Sunum — Proje Envanteri (NewUICMPProjectInventoryComponent)
   Kaynak: new-ui/pages/engineering/project-inventory/project-inventory.component.{html,ts}
   - 5 XML dokümanı (CMR/T00..T04) için kart; her kartta Grup / Bölge başına DEV / BI / IO sayıları + TOPLAM
   - Açılışta tablo yapısı sıfırlarla kurulur (initTableStructure), ardından api.INV_project_stats()
     yanıtı gelince satırlar sunucu verisiyle değiştirilir ve toplamlar hesaplanır (fetchDataFromBackend)
   Veri: DCIM.data.projectInventory.stats() (js/mock/eng-project-inventory.data.js) — sayımlar
         kabin / UPS / klima / pano / PDU / sensör sunum verisinden türetilir.
   Sayılar orijinaldeki gibi Angular `number` borusu (varsayılan en-US: 21,246) ile biçimlenir.
   Derin bağlantı (sunum):
     engineering.html#project-inventory?wait=1   → "Veri Bekleniyor..." (boş yanıt) durumunu gösterir
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;

  // messages.tr.json → projectInventory.*
  const T = {
    title: 'Proje Envanter Özeti',
    menuEngineering: 'Mühendislik',
    groupRegion: 'Grup / Bölge',
    waitingForData: 'Veri Bekleniyor...',
    total: 'TOPLAM'
  };

  const DEFINITIONS = [
    { doc: 'CMR/T00', title: '1. Kat (CMR_T00)', groups: ['KAT1', 'IDC', 'HMI', 'H_U_R', 'K1S1'] },
    { doc: 'CMR/T01', title: '1. Kat (CMR_T01)', groups: ['PDU (POD)', 'PDU (NS)', 'PMM'] },
    { doc: 'CMR/T02', title: '2. Kat (CMR_T02)', groups: ['K2A', 'K2B', 'K2C'] },
    { doc: 'CMR/T03', title: '3. Kat (CMR_T03)', groups: ['K3A', 'K3B', 'K3C'] },
    { doc: 'CMR/T04', title: '4. Kat (CMR_T04)', groups: ['K4A', 'K4B'] }
  ];

  // Angular DecimalPipe (varsayılan yerel ayar en-US)
  const num = n => Number(n || 0).toLocaleString('en-US');

  function mount(el, params) {
    const { esc } = DCIM.ui;
    const kit = DCIM.kit;
    const M = DCIM.data.projectInventory;
    const timers = new Set();
    const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };
    let cancel = null;
    const waitOnly = params && params.get('wait') === '1';

    // initTableStructure()
    const defs = DEFINITIONS.map(d => ({
      doc: d.doc, title: d.title,
      data: waitOnly ? [] : d.groups.map(g => ({ name: g, dev: 0, bi: 0, io: 0 })),
      total: { name: T.total, dev: 0, bi: 0, io: 0 }
    }));

    function renderCard(def) {
      const rows = def.data.map(r =>
        '<tr class="hover:bg-slate-50 dark:hover:bg-surface-hover/50 transition-colors duration-100">' +
          '<td class="py-1.5 px-2.5 font-bold text-slate-900 dark:text-slate-100 text-left">' + esc(r.name) + '</td>' +
          '<td class="py-1.5 px-2.5 text-center">' + esc(r.dev) + '</td>' +
          '<td class="py-1.5 px-2.5 text-center">' + esc(r.bi) + '</td>' +
          '<td class="py-1.5 px-2.5 text-center">' + esc(num(r.io)) + '</td>' +
        '</tr>').join('');
      const empty = def.data.length === 0
        ? '<tr><td colspan="4" class="py-4 text-center italic text-slate-500 dark:text-slate-400">' + esc(T.waitingForData) + '</td></tr>'
        : '';
      return kit.card({
        title: def.title,
        subtitle: def.doc,
        icon: 'pi pi-box',
        body:
          '<div class="overflow-x-auto">' +
            '<table class="w-full text-left border-collapse text-xs select-none">' +
              '<thead><tr class="bg-slate-100 dark:bg-surface-base text-slate-800 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-border-subtle">' +
                '<th class="py-1.5 px-2.5 text-left font-bold" style="width: 35%">' + esc(T.groupRegion) + '</th>' +
                '<th class="py-1.5 px-2.5 text-center font-bold">DEV</th>' +
                '<th class="py-1.5 px-2.5 text-center font-bold">BI</th>' +
                '<th class="py-1.5 px-2.5 text-center font-bold">IO</th>' +
              '</tr></thead>' +
              '<tbody class="divide-y divide-slate-100 dark:divide-border-subtle text-slate-800 dark:text-slate-200">' + rows + empty + '</tbody>' +
              '<tfoot class="border-t border-slate-200 dark:border-border-subtle">' +
                '<tr class="bg-slate-50 dark:bg-surface-panel font-extrabold text-slate-900 dark:text-white">' +
                  '<td class="py-1.5 px-2.5 text-left">' + esc(def.total.name) + '</td>' +
                  '<td class="py-1.5 px-2.5 text-center">' + esc(def.total.dev) + '</td>' +
                  '<td class="py-1.5 px-2.5 text-center">' + esc(def.total.bi) + '</td>' +
                  '<td class="py-1.5 px-2.5 text-center">' + esc(num(def.total.io)) + '</td>' +
                '</tr>' +
              '</tfoot>' +
            '</table>' +
          '</div>'
      });
    }

    function render() {
      el.innerHTML =
        '<div class="p-4">' +
          kit.pageHeader({ title: T.title, breadcrumbs: [{ label: T.menuEngineering, href: 'engineering.html' }, { label: T.title }] }) +
          '<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-2">' + defs.map(renderCard).join('') + '</div>' +
        '</div>';
    }

    // fetchDataFromBackend(): yanıt gelince yerel tanım verisi sunucu verisiyle değiştirilir
    function apply(result) {
      result.forEach(serverDef => {
        const local = defs.find(d => d.doc === serverDef.doc);
        if (!local) return;
        local.data = serverDef.data.map(r => Object.assign({}, r));
        let tDev = 0, tBi = 0, tIo = 0;
        local.data.forEach(r => { tDev += r.dev; tBi += r.bi; tIo += r.io; });
        local.total = { name: T.total, dev: tDev, bi: tBi, io: tIo };
      });
      render();
    }

    render();
    // das.connected beklemesi + XDB_GetValue gecikmesi
    if (!waitOnly) later(() => { cancel = M.stats(apply); }, 450);

    return {
      destroy() {
        timers.forEach(id => clearTimeout(id));
        timers.clear();
        if (cancel) cancel();
      }
    };
  }

  DCIM.engRegistry = DCIM.engRegistry || {};
  DCIM.engRegistry['project-inventory'] = { mount };
})();
