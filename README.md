# DCIM Sunum — Statik HTML/CSS/JS

AyMON DCIM `user-app` new-ui ekranlarının **Angular'dan bağımsız**, sunum amaçlı statik kopyası.
Backend, MQTT, XDB yok; tüm veri `js/mock-data.js` içinde tohumlu (her açılışta aynı) olarak üretilir.

## Açma

`login.html` dosyasına çift tıklamak yeterli (`file://` üzerinde çalışır, ES modülü veya internet gerekmez).
Herhangi bir kullanıcı adı/şifre ile giriş yapılır → `2d.html`.

## Sayfalar

| Sayfa | Kaynak Angular bileşeni |
|---|---|
| `login.html` | `NewUICMPLoginComponent` |
| `2d.html` | `NewUICMPDigitalTwin2DComponent` (+ schematic-viewer, cabinet-isometric-drawer, ups/climate tabloları) |
| `3d.html` | `NewUICMPDigitalTwin3DComponent` (Three.js r166 + OrbitControls) |
| `locks.html` | `NewUICMPLockMonitorComponent` (+ summary-cards, toolbar, topology, card-grid, table, inline-detail) |
| `alarms.html` | `NewUICMPActiveAlarmsComponent` + `NewUICMPHistoricalAlarmsComponent` |
| `pdu-detail.html` | `NewUICMPPduDetailComponent` |
| `cabinet-detail.html` | `NewUICMPCabinetManagerComponent` |
| `customer-pages.html` | `NewuicmpCustomerPagesComponent` + `NewuicmpCustomerPagesMatchingPduComponent` |
| `system-health.html` | `SystemHealthComponent` |
| `reports.html` | `NewUICMPReportingShellComponent` + 14 rapor bileşeni (`js/reports/*.js`) |
| `work-orders.html` | `NewUICMPWorkOrdersComponent` (+ detay, durum işlemi, rapor pencereleri) |
| `location-list.html` | `NewUICMPLocationListComponent` (+ `asset-loc-report-popup`) |
| `category-list.html` | `NewUICMPCategoryListComponent` + `NewUICMPCategoryManagerComponent` (`?cat=` ile aynı sayfada) |
| `energy.html` | `NewUICMPEnergyGeneralViewComponent` + rectifier / ups / generator-gauges / energy-table dashboard |
| `connectivity.html` | `NewUICMPConnectivityViewComponent` (CTD verisi: `P24A01_S01/sql/CTD_sql.txt`) |
| `events.html` | `NewUICMPEventsComponent` + `event-sta-modal` |
| `telemetry-points.html` | `NewUICMPTelemetryPointsComponent` |
| `account-settings.html` | `NewUICMPAccountSettingsComponent` |
| `permission-settings.html` | `NewUIPermissionSettingsComponent` (sihirbaz) + sunum için RBAC rol matrisi |
| `audit-logs.html` | `user-logs-report` (+ `user-logs-report-popup`), tam sayfa |
| `lock-authorization.html` | SUNUM EKLENTİSİ — Kilit Yetkilendirme (orijinalde karşılığı yok; Kapak Kilitleri + Yetki Ayarları tasarım diliyle) |

Sayfalar arası derin bağlantılar: `2d.html?cabinet=1BJ53`, `3d.html?cabinet=1BJ53`, `3d.html?focus=UPS%20A5`,
`locks.html?view=cards&cabinet=1AZ39`, `alarms.html?tab=history`, `alarms.html?filter=alarm`,
`pdu-detail.html?cabinet=1AV42&pdu=B`, `cabinet-detail.html?cabinet=1BJ53`, `customer-pages.html?tab=matched`,
`system-health.html?state=stale`, `reports.html#energy-pue`, `reports.html?cabinet=1AV42#energy`.

Etap 3 sayfaları (tam liste her sayfa JS'inin başındaki açıklama bloğunda):

| Sayfa | Örnek derin bağlantılar |
|---|---|
| `work-orders.html` | `?q=1AV42`, `?kpi=open\|progress\|waiting\|done`, `?open=1AV42`, `?status=KLIMA%20109`, `?new=1`, `?report=1`, `?cols=all` |
| `location-list.html` | `?q=KGK`, `?focus=1BJ53`, `?expand=all`, `?edit=L015799`, `?new=1&parent=L015676`, `?report=1` |
| `category-list.html` | `?cat=CAT1003`, `?cat=CAT1003&port=PSU1`, `?view=cards`, `?nature=PDU`, `?q=dell`, `?new=model`, `?report=1` |
| `energy.html` | `?tab=overview\|rectifier\|ups\|generator\|meters`, `?tab=ups&ups=A5`, `?tab=meters&q=Klima`, `?tab=generator&gen=B` |
| `connectivity.html` | `?sdp=A5&open=ups`, `?cabinet=1AV42&side=B`, `?cabinet=1CB52&side=B` |
| `events.html` | `?q=`, `?src=ups`, `?sev=critical`, `?sta=yeni`, `?open=first`, `?report=1`, `?live=0` |
| `telemetry-points.html` | `?filter=OLD\|ALARM\|WARNING`, `?q=1CE51`, `?proto=MQTT`, `?graph=<tag>`, `?props=<tag>`, `?live=0` |
| `account-settings.html` | `?tab=corporate\|customer\|password`, `?open=add`, `?edit=<das_uid>`, `?auth=1` |
| `permission-settings.html` | `?tab=roles\|wizard`, `?role=operator`, `?uid=00549854&step=3` |
| `audit-logs.html` | `?q=1AZ39`, `?result=denied\|success\|failed`, `?user=deniz.koc`, `?cat=KAPAK`, `?report=1` |
| `lock-authorization.html` | `?tab=users\|groups\|logs`, `?pod=POD-8`, `?cabinet=1BN52`, `?status=timed`, `?result=denied`, `?new=1&user=deniz.koc`, `?grant=YTK-0119`, `?test=1`, `?reset=1` |

`lock-authorization.html` oturumdaki yetki değişikliklerini sessionStorage `dcim_lock_auth_v1`'de tutar (sekme kapanınca
sıfırlanır; sunum öncesi `?reset=1`). Yetki ekleme/düzenleme/iptal kayıtları `dcim_audit_session` kuyruğuna YETKİ kaydı olarak
yazılır ve `audit-logs.html`'de görünür. "Erişim Testi" yalnızca yetki kararını hesaplar; kilide komut gönderilmez.
Senaryo: Can Öztürk (yüklenici) 1BN52 arka kapak yetkisi 20 dk önce doldu → kart reddedildi; Hakan Yıldız 1BX54 bakım yetkisi
planlı (3 sa sonra); Emre Çelik 1BG41 bakım penceresi (İE-2026-0931) aktif; Selin Aydın 1AZ39 talebi kapsam dışı.

## Menü

Üst menü `navigation.config.ts` ile aynı kategori/etiketlere sahiptir (etiketler `messages.tr.json`). Sunumda
hazır olmayan öğeler (şu an yalnızca "Mühendislik") menüde görünür ama devre dışıdır (`opacity-40 pointer-events-none cursor-not-allowed`).
"Kilit Yetkilendirme" orijinal menüde yoktur; sunum için Yönetim altına eklenmiştir.
"Kabin Yönetimi" orijinal menüde yoktur (kabinden açılır); sunum için Varlıklar altına eklenmiştir.
"Müşteri Listesi" orijinalde `all-assets` ekranına gider; sunumda `customer-pages.html?tab=matched`'e bağlanmıştır.

## Raporlar

`js/reports.js` rapor kataloğunu (arama + 3 grup) çizer; rapor seçimi sayfa yenilenmeden URL hash'i ile yapılır.
Her rapor `js/reports/<anahtar>.js` dosyasında kendini kaydeder:
`DCIM.reportRegistry['<anahtar>'] = { mount(el) { …; return { destroy() {} }; } }`.
Grafikler orijinaldeki gibi Chart.js (`vendor/chart.umd.min.js`) ve ECharts (`vendor/echarts.min.js`) ile çizilir.
Excel butonu Türkçe Excel için `;` ayraçlı CSV indirir; PDF butonu yazdırma penceresini açar.

## Sunum senaryosu (tüm sayfalarda tutarlı)

- **1BJ53 / 1BC37** yüksek sıcaklık (alarm), **1BQ55, 1CE56, 1BX50** sıcaklık uyarısı
- **1AV42** PDU-B faz kaybı, **1CB52** yüksek akım, **1BU54** yüksek nem, **1CE51** haberleşme kaybı
- **1AZ39** yetkisiz kapak açılması, **1BN52** arka kapak açık kaldı, **1BG41** yetkili bakım,
  **1BU50** yetkisiz kart denemesi, **1BX54** kilit motoru arızası
- **UPS A5** akü modunda, **KLIMA 109** yüksek basınç, **UPS B7** SNMP kaybı

## Yapı

```
css/styles.css          Orijinal derlenmiş CSS (P24A01_S01/web/k/styles.css) — değiştirilmedi
css/media/              PrimeIcons fontları ve login arka planları (styles.css bunlara referans verir)
css/tailwind-extra.css  styles.css'te bulunmayan Tailwind sınıfları (aşağıya bakın)
css/components.css      Bileşen .scss / inline stillerinin karşılıkları (rack 3D, topoloji, 3D panel...)
js/layout-data.js       Gerçek Kat-1 yerleşimi (sch-first-row.data.ts'den üretildi)
js/mock-data.js         Kabin, ekipman, alarm, kilit, kart okuma ve Etap 3 modüllerinin mock verileri
                        (ağır kümeler — telemetry, locations — DCIM.data.lazy ile ilk erişimde üretilir)
js/shell.js             Ortak başlık + menü, tema/ölçek, dialog, toast, status badge
js/ui-kit.js            app-page-header, app-card, app-form-field, app-empty-state, app-sidebar, dışa aktarım, grafik teması
js/ui-components.js     CSS 3D izometrik rack, 42U şasi, cihaz detay penceresi
js/*.js                 Sayfa mantıkları
js/reports/*.js         Rapor modülleri
vendor/three.bundle.min.js  three + OrbitControls (IIFE, window.THREE)
vendor/chart.umd.min.js     Chart.js 4.5.1 (front_end/node_modules'tan)
vendor/echarts.min.js       ECharts 6.0.0 (front_end/node_modules'tan)
tools/                  Üretim ve denetim betikleri
```

## Neden `tailwind-extra.css`?

`web/k/styles.css` 22.09 derlemesidir; güncel kaynakta kullanılan bazı sınıflar (özellikle Kapak Kilitleri ekranı)
bu derlemede yok. Orijinal dosyaya dokunmamak için eksik sınıflar projenin kendi `@theme` token'larıyla ayrı
dosyada üretilir. Varyantsız kurallar `:where()` ile sıfır özgüllüğe çekilir; böylece `styles.css`'teki
`dark:`/`hover:` kurallarını ezmezler.

## Araçlar (`dcim-presentation` kökünden, `../front_end/node_modules` gerekir)

```bash
node tools/check-classes.js     # HTML/JS'teki sınıfların CSS'te karşılığı var mı?
node tools/build-extra-css.js   # eksik sınıflar için css/tailwind-extra.css'i yeniden üret
node - <sch-first-row.data.ts> js/layout-data.js < tools/gen-layout.js   # yerleşim verisini yeniden üret
node tools/smoke.js "reports.html#cue" out.png 1600 900   # headless Chrome: konsol hataları + ekran görüntüsü
```

Orijinal şablonlarda da geçersiz olan `py-0.2`, `bg-slate-450`, `text-slate-655`, `border-emerald-250`, `border-purple-250`
sınıfları (Tailwind üretmez) bilerek aynen bırakıldı; `check-classes.js` IGNORE listesinde işaretlidir.

`tools/smoke.js` çıktısındaki ekran görüntüsü, sayfanın gerçek tarayıcıdaki hâlini doğrulamak için kullanılır;
`?cabinet=`, `?tab=`, `#rapor` gibi parametrelerle demo durumları doğrudan açılabilir.
