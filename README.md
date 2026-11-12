# DCIM Sunum — Statik HTML/CSS/JS

AyMON DCIM `user-app` new-ui ekranlarının **Angular'dan bağımsız**, sunum amaçlı statik kopyası.
Backend, MQTT, XDB yok; tüm veri `js/mock-data.js` ve sayfa başına `js/mock/*.data.js` içinde tohumlu (her açılışta aynı) olarak üretilir.

## Açma

`login.html` dosyasına çift tıklamak yeterli (`file://` üzerinde çalışır, ES modülü veya internet gerekmez).
Giriş: kullanıcı adı `admin`, şifre `1234` (başka bilgiyle giriş yapılmaz) → `dashboard.html` (Genel Bakış; orijinaldeki `/dcim/dashboard`). Oturum yoksa tüm sayfalar
`login.html`'e yönlenir (sunum için istemci tarafı kontrol; gerçek güvenlik değildir). `tools/smoke.js` bu denetimden muaftır.

## Kurgusal saha

Sunumda gerçek saha verisi yoktur; tüm yerleşim, cihaz, kimlik ve IP'ler kurgusaldır.
`tools/gen-mock-layout.js` deterministik olarak `js/layout-data.js`'i üretir (`window.DCIM_FLOOR_LAYOUTS = [kat1, kat2, kat3]`,
geriye uyumluluk için `window.DCIM_LAYOUT` = kat 1):

| Kat | Yerleşim |
|---|---|
| Kat 1 | Tek salon: POD-1..10 + NW-1 / NW-2 ağ sıraları |
| Kat 2 | İki salon: SALON-1 POD-11..14, SALON-2 POD-15..17 + NW-3 ağ sırası |
| Kat 3 | Tek salon, sıra içi soğutmalı: POD-21..24 |

- Tesis adları: **DCA** ana bina (3 kat) + **DCB** ek bina (yerleşimi `js/mock/bms.data.js`'te: UPS C1/C2, D1/D2, 6 klima, 40 kabin 4GA01…4GD10).
- Kabin kodu = kat hanesi + 2 harf + 2 rakam (ör. `1DU06`, `2EA05`, `3FA09`); kabinler `facing` (ön yüz yönü) alanını taşır.
- Lokasyon ağacı: **DCA** (L200000; KAT-1 L201000 → SALON-1 L201100; KAT-2 L202000 → SALON-1 L202100 + SALON-2 L202200; KAT-3 L203000 → SALON-1 L203100;
  ZEMİN KAT enerji odaları) + **DCB** (L300000) + **AÇIK ALAN** (L400000). Kimlik biçimi `L2 f s nn` (kat, salon, POD sırası).
- Kat dokümanları: 1. Kat · Tesis `CMR/T00`, 1. Kat · Beyaz Alan (PDU) `CMR/T01`, 2. Kat `CMR/T02`, 3. Kat `CMR/T03` (DCB `T09`).
  PDU IP blokları: 1. kat `10.10.x`, 2. kat `10.12.x`, 3. kat `10.13.x`; mühendislik ekranlarında `10.201.x.y`.
- Kablolama politikası: kabin içi veri bağlantısı ~%7–10 (yalnız patch panel); veri bağlantıları fiber runner / tel tava üzerinden
  NW omurgasına gider, ~%39'u kat geçişidir (kat 3'te omurga sırası yok → kat 2'ye çıkar); güç kabloları (PSU1/2 → PDU-A/B) kabin içindedir.
- Raf görünümleri (2D paneli, Kapak Kilitleri, 3D inspector, Kabin Detayı) cihazları model kütüphanesi SVG yüzleriyle çizer.
- Senaryo kabinleri ve cihazları aşağıdaki "Sunum senaryosu" bölümündedir.

## Sayfalar

| Sayfa | Kaynak Angular bileşeni |
|---|---|
| `login.html` | `NewUICMPLoginComponent` |
| `dashboard.html` | `DashboardComponent` (Genel Bakış / Operasyon Merkezi: KPI kartları, günlük PUE trendi, destek talepleri, kapasite ve soğutma, açık iş emirleri, Dashboard Yönetimi) |
| `2d.html` | `NewUICMPDigitalTwin2DComponent` (+ schematic-viewer, pod-details, climate/ups tabloları, `app-cabinet-inline-detail` [powerSensorMode + inlineDeviceDetail], `app-cabinet-power-sensor`, `app-location-tree`) — 3 katlı kurgusal yerleşim (`DCIM_FLOOR_LAYOUTS`), kat modeli `js/mock/twin2d.data.js` |
| `3d.html` | `NewUICMPDigitalTwin3DComponent` + `CabinetInspectorComponent` (Three.js r166 + OrbitControls; kat seçici, ısı haritası, kablo izleme; veri `js/mock/twin3d.data.js`) |
| `work-orders.html` | `NewUICMPWorkOrdersComponent` (+ detay, durum işlemi pencereleri, `app-report-export-menu`) |
| `customer-pages.html` | `NewuicmpCustomerPagesComponent` + `NewuicmpCustomerPagesMatchingPduComponent` (+ `CustomerChangeComponent` kat kat PDU/port eşleştirme penceresi; ek veri `js/mock/customer-pages.data.js`) |
| `cctv.html` | `NewUICMPCctvComponent` (NVR kanal ızgarası; canlı görüntü servisi devre dışı) |
| `bms.html` | `BmsShowcaseComponent` (`/dcim/showcase/bms`, Babylon.js 3D bina: DCA ana bina 3 kat + DCB ek bina; tüm katlar kurgusal ve canlı mock; iç duvar ve kapılar kat yerleşiminden; çatıda meteoroloji istasyonu + rüzgâr izleri; başlıkta "PDF Raporu") |
| `pms.html` | `EnergyGeneralViewComponent` PMS sürümü: `pms-dashboard` (Genel Bakış), `analyzers-view`, `app-energy-single-line` (`js/pms/single-line.js`), Kompanzasyon, Jeneratör A/B kolu, `rectifier-dashboard`, UPS (`ups-dashboard`; energy.js portu); başlıkta meteoroloji istasyonu çipi (→ BMS çatı) |
| `connectivity.html` | `NewUICMPConnectivityViewComponent` (kurgusal CTD tablosu: Kat-1 kabinleri × A1–A7 / B1–B7 SDP, `js/mock/connectivity.data.js`) |
| `energy.html` | `NewUICMPEnergyGeneralViewComponent` + rectifier / ups / generator-gauges / energy-table-dashboard (eski sayfa; menüde yok, eski derin bağlantılar için duruyor) |
| `pdu-detail.html` | `NewUICMPPduDetailComponent` (kat → POD → kabin ağacı, PDU kimlik kartı, İnlet/Outlet/Devre Kesici rapor menüsü; veri `js/mock/pdu-detail.data.js`) |
| `location-list.html` | `NewUICMPLocationListComponent` (`app-data-table` + `app-report-export-menu`; sunum eki: kurgusal kampüs ağacı) |
| `category-list.html` | `NewUICMPCategoryListComponent` (`app-data-table` + `app-report-export-menu`) + `NewUICMPCategoryManagerComponent` (`?cat=` ile aynı sayfada; tek CAT tablosu) |
| `lnk-failed-list.html` | `NewUICMPLnkFaildListComponent` (salt okunur LNK import hata listesi + detay); veri `js/mock/lnk-failed.data.js` |
| `cabinet-detail.html` | `NewUICMPCabinetManagerComponent` (satır içi cihaz paneli, model kütüphanesi SVG yüzleri, dikey 0U PDU şeritleri, yalnız assignment = 0 cihazlar, HURDA-DEPO kuralı, "Ağ Topolojisini Aç" → `connectivity.html`, 3 kat; veri `js/mock/cabinet-detail.data.js`) |
| `alarms.html` | `NewUICMPActiveAlarmsComponent` + `NewUICMPHistoricalAlarmsComponent` (Kat süzgeci, Gruplar seçici + "Varsayılanım yap", Toplu Gördüm, Rapor menüsü, tarihsel Olay + Bakım sütunu; veri `js/mock/alarms.data.js`) |
| `events.html` | `NewUICMPEventsComponent` + `event-sta-modal` + `app-report-export-menu` |
| `telemetry-points.html` | `NewUICMPTelemetryPointsComponent` (kat seçici `SITE_Floors`, mobil kartlar, `app-report-export-menu`; ek veri `js/mock/telemetry-points.data.js`) |
| `maintenance.html` | `NewUICMPMaintenanceModuleComponent` (kartlar, Bakım Tablosu, Garanti ve Bakım Tarihi Belirleme sihirbazı) + `NewUICMPMaintenancePlansComponent` + `NewUICMPMaintenanceAlarmComponent`; veri `js/mock/maintenance.data.js` |
| `system-health.html` | `SystemHealthComponent` (Genel + Performans sekmeleri; `AyxdbHealthService` + `AyxdbPerformanceService`; `app-report-export-menu`; ek veri `js/mock/system-health.data.js`) |
| `locks.html` | `NewUICMPSensplorerLockMonitorComponent` (+ monitor-toolbar [satır içi kabin/açık/kapalı/bekleyen sayaçları], cabinet-topology-view [katın 2D şeması: kurgusal yerleşim + `facing`'e göre F/R şeritleri, kapı/duvar zemini], card-grid, table, cabinet-inline-detail; başlıktaki PDF Raporu). `sensplorer-locks.html` aynı sayfanın kopyasıdır (`js/locks.js`) |
| `cabin-anomaly.html` | `CabinAnomalyComponent` + `AnomalyFloor3dComponent` (Three.js kat planı) + `UpsPanelComponent` |
| `reports.html` | `NewUICMPReportingShellComponent` + 15 rapor bileşeni (`js/reports/*.js`); Enerji grubunda alt rapor **Kapasite Tahmini** (`capacity-forecast.js` = `NewUICMPCapacityForecastComponent` + `forecast-chart-3d`); ortak pop-up iskeleti `js/reports/report-modal.js` + `css/report-modal.css` (`app-report-modal`) |
| `account-settings.html` | `NewUICMPAccountSettingsComponent` (Müşteri Yetkilendirme artık `customer-authorization.html`) |
| `customer-authorization.html` | `NewUICMPAuthorizationManagementComponent` sayfa modu (`/dcim/customer-authorization`, 9 Kas yeniden tasarım) |
| `permission-settings.html` | `NewUIPermissionSettingsComponent` (sihirbaz) + sunum için RBAC rol matrisi |
| `audit-logs.html` | `NewUICMPLogsComponent` (`/dcim/logs`): `system-logs` + `user-logs` sekmeleri, `event-detail-popup`, `user/system-logs-report-popup` (`?popup=1`), `app-report-export-menu` |
| `engineering.html` | `NewUICMPEngineeringShellComponent` + `engineering-nav.ts` (6 aranabilir grup) + `EngineeringHomeComponent` (ana sayfa) ve alt sayfalar (aşağıda) |
| `lock-authorization.html` | SUNUM EKLENTİSİ — Kilit Yetkilendirme (orijinalde karşılığı yok; Kapak Kilitleri + Yetki Ayarları tasarım diliyle) |

Sayfalar arası derin bağlantılar (Genel Bakış, Operasyon, Varlıklar, İzleme, Raporlar; Etap 3, BMS/PMS ve Mühendislik aşağıda; tam liste her sayfa JS'inin başındaki açıklama bloğunda):

| Sayfa | Örnek derin bağlantılar |
|---|---|
| `dashboard.html` | `?settings=1` (Dashboard Yönetimi açık), `?hide=tickets,orders,pue,capacity,kpi` (yalnız bu açılış için modül gizler) |
| `2d.html` | `?cabinet=1DU06` (kat koddan bulunur: `?cabinet=2EC05`, `?cabinet=3FA09`), `?focus=KLIMA%20109` (klima / UPS / pano etiketi, tüm katlarda aranır), `?floor=2` (ya da `?floor=T02`), `?floor=2&salon=S2` |
| `3d.html` | `?cabinet=1DU06`, `?focus=UPS%20A5`, `?floor=1\|2\|3`, `?heatmap=1`, `?status=1`, `?trace=1NA06` (`&asset=1NA06-A2&port=U2`), `?trace=3FA05` (kat geçişi), `?cabinet=1DU06&view=focus&neighbors=2`, `?walls=50`, `?inspector=3d`, `?tab=cables\|sensors\|power`, `?layers=1` |
| `cctv.html` | `?grid=1\|2\|3` |
| `pdu-detail.html` | `?cabinet=1NA06&pdu=B`, `?cabinet=2EG05&tab=breaker` (ACİL kesici), `?cabinet=3FE06&tab=outlet` (DEVREDIŞI), `&tab=inlet\|outlet\|breaker` |
| `cabinet-detail.html` | `?cabinet=1DU06`, `?cabinet=2EA05`, `?cabinet=1NA06&device=VPDU-A`, `?cabinet=1DU06&device=1DU06-A11` (hurdaya ayrılmış cihaz), `?cabinet=1DU06&device=U3&edit=1&assign=2&scraploc=0`, `?tab=rack\|pdu\|sensors` (dar ekran) |
| `lnk-failed-list.html` | `?category=DATA\|PORT\|SYSTEM`, `?group=<import_group>`, `?asset=<asset_id>` (ör. `SW-1DC09-14`), `?open=<faild_id>\|first`, `?group=LNKIMP-legacy-20261008&open=3088` (bozuk JSON → ham metin) |
| `alarms.html` | `?tab=history`, `?filter=acil\|alarm\|alarm_up\|uyarı\|kayıp`, `?floor=T00\|T02\|T03`, `?q=<metin>` |
| `maintenance.html` | `?tab=table\|warranty\|plans\|alarm`, `?tab=table&state=incomplete\|completed\|unknown\|cancelled\|all`, `?tab=table&open=KLIMA%20109` (mnt_id ya da ekipman adı), `?tab=table&q=UPS`, `?tab=warranty&step=2&sel=3001,3005`, `?tab=plans&new=1&asm=3023`, `?tab=alarm&view=done`, `?tab=alarm&open=<mnt_id \| sessionStorage id>` |
| `system-health.html` | `?state=fresh\|partial\|stale\|disconnected`, `?tab=overview\|performance`, `?tab=performance&state=stale`, `?report=1` |
| `locks.html` | `?view=top\|cards\|table`, `?cabinet=1DA03` (kabin kodunun hanesi katı seçer, ör. `?cabinet=2EB07`), `?floor=T00\|T02\|T03` |
| `cabin-anomaly.html` | `?cabinet=1DU06`, `?ups=UPS%20A2`, `?mode=history`, `?floor=T00\|T02\|T03`, `?q=1DA`, `?exp=top\|mid\|bot`, `?hum=1`, `?rotate=0` |
| `reports.html` | `#<anahtar>` (energy-pue, cue, ups-module, ups, transformer, switch-redundancy, capacity, capacity-forecast, pdu-inventory, energy, failover, maxpow, climate, cabin, it-power), `?cabinet=1NA06#energy` |
| `reports.html#capacity-forecast` | `?metric=energy\|cooling\|space\|weight\|cabinets\|temp`, `?level=general\|salon\|pod\|cabinet`, `?node=K2S2` (salon `K<kat>S<no>`, POD `K1S1/POD-8`, kabin `1DU06`), `?chart=3d`, `?window=90\|180\|365`, `?horizon=6\|12\|24`, `?limits=1` (ör. `reports.html?metric=cabinets&level=salon&node=K2S2#capacity-forecast`) |
| `customer-authorization.html` | `?uid=delta.altyapi`, `?customer=Ege`, `?q=delta`, `?open=kabinler\|raporlama`, `?reset=1` |

3D → 2D "2D Krokide Göster": `sessionStorage.setItem('dt2d_focus_item', JSON.stringify({ sch: 'LC-MOCK-K2-00', id, devId, label, ts: Date.now() }))`
ardından `2d.html` (sch = katın `schId`; 2 dk'dan eski istek yok sayılır; öğe kalıcı vurgulanır, kabinse sağ panel açılır).

BMS / PMS / SDP sayfaları (tam liste `js/bms.js` ve `js/pms.js` başındaki açıklama bloğunda):

| Sayfa | Örnek derin bağlantılar |
|---|---|
| `bms.html` | `?floor=KAT-1\|KAT-2\|KAT-3\|DCB`, `?cab=1DU06`, `?cab=2EA05`, `?cab=4GB03`, `?alarm=KAT1_SAL1_A5_UPS_MODE&dev=KAT1_SAL1_A5_UPS&from=pms`, `?dev=UPS%20B7`, `?dev=DCA_CATI_METEO_DV&from=pms` (çatıdaki meteoroloji istasyonu), `?theme=light` |
| `pms.html` | `?view=overview\|analyzers\|single-line\|compensation\|generator\|rectifier\|ups`, `?view=single-line&schema=DCB\|DCA-GENEL\|DCA-A\|DCA-B`, `?view=ups&ups=A5`, `?view=generator&gen=B`, `?alarm=DCA_A_KAT3_KDP1_Q36_DV_TRIP&dev=DCA_A_KAT3_KDP1_Q36_DV&from=bms`, `?alarm=DCB_TR6_DV_WTEMP&dev=DCB_TR6_DV&from=bms` |
| `connectivity.html` | `?sdp=A5&open=ups`, `?cabinet=1NA06&side=B`, `?cabinet=1DL03&side=B` |

PMS senaryosu: DCA A Blok Kat-3 KDP-A1 **Q36 kesici açtı** (TRIP, çıkış enerjisiz, yük B tarafındaki eş panoya geçti), DCA B Chiller-1 **Q89 aşırı akım**,
DCA B Jeneratör-3 **Q9 haberleşme kaybı**, DCB **TR-6 sargı sıcaklığı** uyarısı; A kolu jeneratörleri (GEN4–6) haftalık yüksüz testte (senkron barasında, ATS açık), B kolu (GEN1–3) beklemede.
Tek hat şemaları **kurgusaldır** (`js/mock/pms-single-line.data.js` içindeki kurucularla çizilir: DCA Genel = OG şalt, TR-1…TR-4, A/B ana baraları, jeneratör sahası;
DCA A/B Blok = yarım baralar, KDP'ler, UPS A1–A7 / B1–B7 girişleri, klima panoları; DCB = OG giriş-3, TR-5/TR-6, JEN-7, C/D baraları); ölçümler mock.
Analizör kimlikleri tek hat cihaz kimlikleriyle aynıdır (`DCA_A_KAT3_KDP1_Q36` ↔ `DCA_A_KAT3_KDP1_Q36_DV`).
BMS ↔ PMS geçişleri ("PMS'e geç", "Tek hatta göster", "Mekânsal konum (BMS)", meteoroloji çipi) orijinaldeki URL sözleşmesiyle çalışır.

BMS: tüm katlar kurgusal ve canlı mock — DCA KAT-1/2/3 yerleşimi `window.DCIM_FLOOR_LAYOUTS`'tan (iç duvarlar ve kapılar `bgPath`'ten çözülür), DCB ek binanın
yerleşimi `js/mock/bms.data.js`'te üretilir. KAT-1 alarmları ortak senaryo (`DCIM.data.activeAlarms`),
KAT-2/KAT-3/DCB alarmları tohumlu (kat başına 2-3, dakikada bir hafif değişir). Kabin sıcaklık/nem dağılımı tüm katlardan (kart ipucunda kat kat).
Rüzgâr çipi ve çatı izleri `DCIM.data.site.outdoor` rüzgâr değerinden (30 sn); "Yangın & Güvenlik" kategori çipi orijinaldeki gibi kaldırıldı.

Etap 3 sayfaları (tam liste her sayfa JS'inin başındaki açıklama bloğunda):

| Sayfa | Örnek derin bağlantılar |
|---|---|
| `work-orders.html` | `?q=1NA06`, `?kpi=open\|progress\|waiting\|done`, `?open=1NA06`, `?status=KLIMA%20109`, `?new=1`, `?report=1` (rapor menüsü açık), `?cols=all` |
| `location-list.html` | `?q=KGK`, `?q=UPS`, `?focus=1DU06` / `?focus=2EA05` / `?focus=L201108`, `?expand=all`, `?filter=1`, `?edit=L201100`, `?new=1&parent=L202000`, `?report=1` (rapor menüsü açık), `?reset=1` |
| `category-list.html` | `?cat=CAT1003`, `?cat=CAT1003&port=PSU1`, `?view=cards`, `?nature=PDU`, `?q=dell`, `?filter=1`, `?new=model`, `?report=1` (rapor menüsü açık), `?reset=1` |
| `energy.html` | `?tab=overview\|rectifier\|ups\|generator\|meters`, `?tab=ups&ups=A5`, `?tab=meters&q=Klima`, `?tab=generator&gen=B` |
| `events.html` | `?q=`, `?src=ups`, `?sev=critical`, `?sta=yeni`, `?open=first`, `?report=1` (rapor menüsü açık), `?live=0`, `?filters=1` |
| `telemetry-points.html` | `?filter=OLD\|ALARM\|WARNING`, `?q=1DM03`, `?floor=T00\|T01\|T02\|T03`, `?doc=T02`, `?proto=MQTT`, `?graph=<tag>`, `?props=<tag>`, `?report=1`, `?live=0` |
| `customer-pages.html` | `?tab=matching\|matched`, `?q=`, `?open=match\|matched\|edit\|details\|report`, `?tab=matched&q=5013400163&open=edit` (iki katlı eşleştirme), `?tab=matched&q=10.12.` (2. kat PDU'ları) |
| `account-settings.html` | `?tab=corporate\|customer\|password`, `?filter=1`, `?open=add`, `?edit=<das_uid>`, `?report=1`, `?auth=1` / `?auth=<das_uid>` → `customer-authorization.html[?uid=]` |
| `permission-settings.html` | `?tab=roles\|wizard`, `?role=operator`, `?uid=00549854&step=3` |
| `audit-logs.html` | `?tab=system\|user`, `?q=1DA03`, `?result=denied\|success\|failed`, `?user=deniz.koc`, `?cat=KAPAK`, `?sta=8`, `?report=1` (rapor menüsü açık), `?popup=1`, `?cme=first` |
| `lock-authorization.html` | `?tab=users\|groups\|logs`, `?pod=POD-8`, `?cabinet=1DR03`, `?status=timed`, `?result=denied`, `?new=1&user=deniz.koc`, `?grant=YTK-0119`, `?test=1`, `?reset=1` |

`lock-authorization.html` oturumdaki yetki değişikliklerini sessionStorage `dcim_lock_auth_v1`'de tutar (sekme kapanınca
sıfırlanır; sunum öncesi `?reset=1`). Yetki ekleme/düzenleme/iptal kayıtları `dcim_audit_session` kuyruğuna YETKİ kaydı olarak
yazılır ve `audit-logs.html`'de görünür. "Erişim Testi" yalnızca yetki kararını hesaplar; kilide komut gönderilmez.
Senaryo: Can Öztürk (yüklenici) 1DR03 arka kapak yetkisi 20 dk önce doldu → kart reddedildi; Hakan Yıldız 1DP06 bakım yetkisi
planlı (3 sa sonra); Emre Çelik 1DC06 bakım penceresi (İE-2026-0931) aktif; Selin Aydın 1DA03 talebi kapsam dışı.

Mühendislik alt sayfaları (`engineering.html`; hash ile seçilir, parametreler `#anahtar?p=v` biçiminde; her modülün JS başlığında tam liste var):

| Sayfa | Kaynak bileşen | Örnek derin bağlantılar |
|---|---|---|
| `engineering.html` / `#home` | `EngineeringHomeComponent`: 8 KPI, cihaz haberleşme durumu, Katlar ve dokümanlar (CMR/T00, T01, T02, T03, T09=DCB), Dikkat gerektirenler, araç kartları; 5 sn canlı yenileme | `#home?live=0` |
| `#device-list` | `NewUICMPDeviceListComponent` | `?q=PDU`, `?open=KAT1_SAL1_B7_UPS` |
| `#device-manager` | `NewUICMPDeviceManagerComponent` (Cihaz Ekle / Model Kütüphanesi). Eski `#add-device` ve `#device-add` buraya yönlenir | `?floor=2&hall=S1`, `?cabinet=1NA06&apply=1`, `?model=MDL_RARITAN_PX3_5530V`, `?dry=1`, `?mode=excel&sample=1\|errors`, `?tab=conns`, `?view=cards`, `?reset=1` |
| `#asset-device-add` | `NewUICMPAssetDeviceAddComponent` | — |
| `#lnk-import` | `NewUICMPLnkImportComponent` (Ağ Bağlantılarını İçe Aktar) | `?format=1`, `?step=upload\|preview\|confirm\|done`, `?rows=3-40`, `?site=DCA` |
| `#data-query-period` | `NewUICMPDataQueryPeriodComponent` + `bulk-config/` (app-bulk-scope, app-bulk-plan, app-period-sampler) | `?group=pdu,sensor`, `?floor=T00`, `?value=pdu:60`, `?step=preview\|apply`, `?sample=1` |
| `#data-save-period` | `NewUICMPDataSavePeriodComponent` + `bulk-config/` | `?group=ups`, `?mode=pick&pick=K1NA06_PDU_A_DV`, `?value=pdu:900`, `?step=preview\|apply` |
| `#bulk-settings` | `NewUICMPBulkSettingsComponent` (Alarm Eşikleri + Sigorta eşik politikası) + `bulk-config/` | `?group=SENSOR\|KLIMA\|SDP\|PDU`, `?step=preview\|apply`, `?mismatch=1` |
| `#space-edit` | `NewUICMPSpaceEditComponent` (Salon Planı; kurgusal 3 kat, değişiklikler sessionStorage `dcim_space_edit_v1`) | `?floor=2`, `?select=1DA01,1DA02&panel=facing&facing=E`, `?pod=POD-3&panel=pod`, `?panel=layers&solo=kabin,tel-tava,fiber-runner`, `?panel=runner&floor=3`, `?path=1NA01,1DP05&layer=fiber-runner`, `?save=1`, `?reset=1` |
| `#xml-editor` | `NewUICMPXmlEditorComponent` → `ConfigHomeComponent` (tüm dokümanların özeti) + salt okunur doküman görünümü | `?scope=CMR/T01`, `?levels=error,warning,info`, `?issue=dly_zero`, `?doc=CMR/T01&dev=K1NA06_PDU_B_DV` |
| `#sendemail-report` | `NewUICMPSendemailReportComponent` | — |
| `#maintenance-module` | `NewUICMPMaintenanceModuleComponent` | — |
| `#ticket-management` | `NewUICMPTicketManagementComponent` (Kas 2026 kart/sohbet şablonu) | `?tab=closed`, `?open=1047`, `?close=1047`, `?reopen=1035`, `?q=1NA06`, `?priority=High`, `?filter=1&customer=…`, `?report=1`, `?conn=lost` |
| `#ayxdb-diagnostics` | `AyxdbDiagnosticsComponent` (+ ayxdb-health / ayxdb-performance servisleri). Eski `#system-communication` ve `#visual-system-communication` buraya yönlenir | `?tab=overview\|performance\|runtime\|connections\|devices`, `?node=CMR/T01/SNMP_PDU_3`, `?doc=CMR/T01`, `?q=B7`, `?problems=1`, `?report=1`, `?live=0` |
| `#system-maintenance` | `NewUICMPSystemMaintenanceComponent` (K15 CMR Saklama Süresi; yalnız simülasyon, veri silinmez) | `?keep=365`, `?ask=1095` (onay penceresi açık), `?role=guest` (kaydetme reddedilir), `?undefined=1`, `?report=1` |
| `#user-manual` | `NewUICMPUserManualComponent` (kılavuz modül seçici; basit mock) | `?pick=all\|notCreated\|changed`, `?sel=6,13` |
| `#authorization-management` | `NewUICMPAuthorizationManagementComponent` (menüde yok; yalnız doğrudan adresle) | — |

Mühendislik ortak canlı durum verisi `js/mock/eng-home.data.js` → `DCIM.data.engSystem` (`docs`, `snapshot(tick)`, `perf(tick)`, `latency(nodeId, n, tick)`);
ana sayfa, Konfigürasyon Editörü, AyXDB Tanılama, toplu yapılandırma ve Cihaz Ekle bu veriyi kullanır.

## Menü

Üst menü `navigation.config.ts` ile aynı kategori/etiketlere sahiptir (etiketler `messages.tr.json`; tanım `js/shell.js` `NAV_CATEGORIES`):

| Kategori | Öğeler |
|---|---|
| Genel Bakış | `dashboard.html` (tek bağlantı) |
| Operasyon | Dijital İkiz (2D), Dijital İkiz (3D), İş Emirleri, Müşteri Eşleştirme, CCTV |
| Tesis | BMS · Bina Yönetimi, PMS Dashboard, SDP Kablolama Topolojisi |
| Varlıklar | Müşteri Varlıkları, PDU Detay Sayfası, Lokasyon Şeması, Model Kütüphanesi, Import Hata Kayıtları |
| İzleme | **Alarm ve Olaylar**: Aktif Alarmlar, Tarihsel Alarmlar, Otonom Olaylar, Telemetri Noktaları · **Servis ve Bakım**: Ticket Yönetimi (`engineering.html#ticket-management`), Bakım Modülü · **Sağlık ve Analiz**: Sistem Sağlığı, Kapak Kilitleri, Kabin Anomali |
| Raporlar | `reports.html` (tek bağlantı) |
| Yönetim | Kullanıcı Ayarları, Yetki Ayarları, Audit ve Loglar, Mühendislik, Kilit Yetkilendirme |

- "Kilit Yetkilendirme" orijinal menüde yoktur; sunum eklentisi olarak Yönetim altındadır.
- "Müşteri Varlıkları" orijinalde `all-assets` ekranına gider; sunumda `customer-pages.html?tab=matched`'e bağlanmıştır.
- Ticket Yönetimi açıkken üst menüde "İzleme", `customer-authorization.html` açıkken "Kullanıcı Ayarları" vurgulanır.
- Eski "Enerji Genel Görünüm" (`energy.html`) orijinalde PMS'e dönüştüğü için menüde yoktur; dosya eski derin bağlantılar için duruyor.
  `cabinet-detail.html` menüde yoktur (kabinden açılır).

Başlık güncel `new-ui-shell` gibidir: solda Akya logosu (altında Türk Telekom logosu — sunum eklentisi; `assets/img/tt-logo-dark.png` /
`tt-logo-light.png`, `Turk-Telekom-Symbol.png`'den kırpıldı, tema `css/components.css` `.tt-logo-*` ile seçilir) ve menü; sağda konum etiketi
(`DCIM.shell.setLocation`), alarm zili (Alarm + Acil rozeti; Acil varken mor ve nabız), yardım (Kullanım Kılavuzu & SSS okuyucusu, `DCIM.manual.open`),
sayfa raporu ("PDF Raporu"; sayfa kaynak kaydettiyse: Genel Bakış, 2D, 3D, Kapak Kilitleri, BMS, Kabin Anomali) ve kullanıcı menüsü (tema, ölçek, çıkış).
`lg` altında menü hamburger çekmecesine geçer.
Ağır sayfalarda (3D, BMS, PMS, Kabin Anomali) başlık satır içi `DCIM.shell.init(...)` ile önce çizilir; sahne betiği ilk boyamadan sonra
(`requestAnimationFrame` + `setTimeout`) yüklenir, böylece sayfa geçişinde navbar kaybolmaz.

## Raporlar

`js/reports.js` rapor kataloğunu (arama + 3 grup) çizer; rapor seçimi sayfa yenilenmeden URL hash'i ile yapılır.
Her rapor `js/reports/<anahtar>.js` dosyasında kendini kaydeder:
`DCIM.reportRegistry['<anahtar>'] = { mount(el) { …; return { destroy() {} }; } }`.
Grafikler orijinaldeki gibi Chart.js (`vendor/chart.umd.min.js`) ve ECharts (`vendor/echarts.min.js`) ile çizilir.
Rapor içi Excel butonları Türkçe Excel için `;` ayraçlı CSV indirir; PDF butonu yazdırma penceresini açar.

Ortak rapor menüsü `js/report-kit.js`:

- `DCIM.report.menu(host, opts)` = `app-report-export-menu`: kapsam × PDF / Excel / CSV; seçenek olarak kayıt sayısı ya da tarih aralığı.
  Tablo sayfalarındaki eski PDF/Excel/Rapor düğmeleri bu menüye çevrildi.
- `DCIM.report.generate(doc, format)` = new-ui PDF şablonu (`report-template.service.ts`; A4 yatay, KPI kutuları, renkli durum satırları;
  Excel `.xls` tablo, CSV `;` ayraçlı).
- `DCIM.shell.setPageReport(src)` = başlıktaki "PDF Raporu".

Rapor pop-up'ları (Geçmiş Veriler, sonuç pencereleri, Kabin Sensör Grafikleri) orijinaldeki gibi ortak `app-report-modal` görünümündedir (v1.18.9):
simge kutusu + başlık + alt başlık + kapat; isteğe bağlı filtre şeridi; dışa aktarma şeridi (solda PDF / Excel / ZIP, sağda "Toplam N kayıt");
gövdede `.rpt-table`. İskelet `js/reports/report-modal.js` (`DCIM.reportModal.html/open/bind/total/btn`), stiller `css/report-modal.css`
(orijinal `styles.css` `.rpt-*` @apply kurallarının düz CSS karşılığı).

Salon adları (`site-model locLabel`): her katta SALON-1 olduğundan SDP, Maksimum Güç ve Klima raporlarında bölge kat önekli yazılır
("KAT-1 SALON-1", "KAT-2 SALON-2"); DCB'de kat adı. PDU Güç raporunda @pod'u olmayan kabinler (2. kat NW-3) salonun "POD tanımsız" seçeneğindedir.

Ortak kurallar:

- Tablolar orijinal `app-data-table` gibi varsayılan **50 satır/sayfa**; lg altı (<1024px) ekranlarda satırlar kart olur (`DCIM.kit.dataTable` / `DCIM.kit.dataCards`).
- Acil renk kuralı: Acil her yerde (BMS, alarm ekranları, başlık zili, raporlar) **mor**; yalnız 2D/3D dijital ikizde **kırmızı** gösterilir, etiket yine "Acil" kalır.

## Sunum senaryosu (tüm sayfalarda tutarlı)

- **1DU06 / 1DA07** yüksek sıcaklık (alarm), **1DS07, 1DL01, 1DP02** sıcaklık uyarısı
- **1NA06** PDU-B faz kaybı, **1DL03** yüksek akım, **1DN05** yüksek nem, **1DM03** haberleşme kaybı
- **1DA03** yetkisiz kapak açılması, **1DR03** arka kapak açık kaldı, **1DC06** yetkili bakım,
  **1DN01** yetkisiz kart denemesi, **1DP06** kilit motoru arızası
- **UPS A5** akü modunda, **KLIMA 109** yüksek basınç, **UPS B7** SNMP kaybı
- 2. kat: PDU-A C2 kesicisi **ACİL** (PDU Detay `?cabinet=2EG05&tab=breaker`), **UPS C3** yük uyarısı, **KLIMA 205** filtre;
  3. kat: **KLIMA 304** su kaçağı **ACİL** (POD-22), **UPS F2** SNMP kaybı; 2./3. kat açık kapak alarmları Kapak Kilitleri ile tutarlı
- Kabin Anomali (kat 1): 1DU06 sıçrama, 1DA07 / 1DS07 / 1DL01 sapma (1DL01'de dünkü çelişki), 1DP02 aşağı sapma, 1DN05 nem sıçraması,
  1DM03 sıçrama sonrası haberleşme kaybı, 1DE04 kalıcı çelişki; UPS A2 yük değişimi, UPS B3 şebeke normalken batarya; sensörsüz 1DB07, 1DK07, 1DT01
- PMS / BMS senaryosu yukarıda ("PMS senaryosu"); Kapasite Tahmini salon profilleri: KAT-2 SALON-1 eşiği aşmış, KAT-1 SALON-1 yakında,
  KAT-2 SALON-2 hızlı dolan yeni salon, KAT-3 SALON-1 düz

## Notlar (orijinalden bilinçli sapmalar)

- **Oturum durumu:** Alarm grup varsayılanı localStorage `aymon_alarm_hidden_groups_<kullanıcı>` (Sistem grubu varsayılan gizli); Genel Bakış modülleri
  `dcim.dashboard.modules`; lokasyon / model listesi süzgeçleri sessionStorage `dcim_loc_list_state` / `dcim_catlist_state` (`?reset=1` temizler).
- **Alarmlar → Bakım:** Tarihsel Alarmlar "Bakım Aç" kayıtları sessionStorage `dcim_alarm_maint_v1`'e yazılır; `maintenance.html?tab=alarm&open=<id>`
  bunları "Bu oturum" rozetiyle gösterir. Bakım sayfasındaki diğer değişiklikler yalnız sayfa açıkken bellekte tutulur.
- **2D:** Krokide arama + Kategori şeridi orijinalde yalnız lg altında görünür; sunumda masaüstünde de tuvalin üstündedir. Kabin etiketleri kutuya
  sığdırılır (dar kutuda iki satır `1DA` / `01`). Raf görünümleri `assignment !== '0'` cihazları gizler (mock'ta ~%5 cihaz `'2'`).
- **İzometrik raf:** `DCIM.components.createRack3d` Babylon.js sahnesidir (`vendor/cabinet-rack-scene.bundle.min.js`, ilk kullanımda tembel yüklenir;
  WebGL yoksa eski CSS 3D raf).
- **CCTV:** canlı görüntü servisi devre dışı; kanallar "SİNYAL YOK" yer tutucusu.
- **Import Hata Kayıtları:** 4 kurgusal import grubu + 1 eski kayıt (137 satır); gerekçe kodları ve Excel kolon düzeni `import_lnk.py` sözleşmesiyle aynı.
  "Asset topolojisi" düğmeleri bilgi bildirimi gösterir (ağ topolojisi ekranı sunumda yok).
- **Müşteri Yetkilendirme:** kullanıcılar `DCIM.data.accounts.users` müşteri hesapları; ACL değişiklikleri sessionStorage `dcim_customer_auth_v1`'de,
  YETKİ kaydı olarak `dcim_audit_session`'a yazılır.
- **Audit ve Loglar:** iki sekme (Sistem Logları varsayılan); kullanıcı süzgeci içeren bağlantılar Kullanıcı Logları sekmesini açar.
- **Kapasite Tahmini:** algoritmalar orijinalden birebir; 3D "olasılık dağları"nda CSS2D yerine izdüşümlü HTML etiketleri (WebGL yoksa ECharts ısı haritası);
  salon limitleri yalnız bellekte kaydedilir; Excel → `;` ayraçlı CSV.
- **Mühendislik:** sunumda modülü olmayan "Enerji Modülü Yönetimi", "Sistem Test" ve "Proje Envanteri" menüde gösterilmez; `#system-maintenance`
  yalnız simülasyondur (veri silinmez); `#user-manual` basit mock.
- **Raporlar:** Yükleniyor ekranları `app-report-modal` dışında ayrı tam sayfa örtüleri olarak kaldı.

## Yapı

```
css/styles.css          Orijinal derlenmiş CSS (P24A01_S01/web/k/styles.css) — değiştirilmedi
css/media/              PrimeIcons fontları ve login arka planları (styles.css bunlara referans verir)
css/tailwind-extra.css  styles.css'te bulunmayan Tailwind sınıfları (aşağıya bakın)
css/components.css      Bileşen .scss / inline stillerinin karşılıkları (rack 3D, topoloji, 3D panel...)
css/report-modal.css    app-report-modal (.rpt-*) ortak rapor pop-up stilleri
css/*.css               Sayfa stilleri (eng-*.css mühendislik alt sayfaları, capacity-forecast.css ...)
js/layout-data.js       Kurgusal 3 katlı bina yerleşimi (tools/gen-mock-layout.js üretir; gerçek saha verisi değildir)
js/mock-data.js         Kabin, ekipman, alarm, kilit, kart okuma ve Etap 3 modüllerinin mock verileri
                        (ağır kümeler — telemetry, locations — DCIM.data.lazy ile ilk erişimde üretilir)
js/mock/*.data.js       Sayfa başına mock veri: alarms, twin2d, twin3d, dashboard, cabin-anomaly, cctv, maintenance,
                        lnk-failed, connectivity, pdu-detail, cabinet-detail, customer-pages, system-health,
                        telemetry-points, bms, pms, pms-single-line, eng-* (mühendislik alt sayfaları)
js/shell.js             Ortak başlık + menü (gruplu açılır menüler), tema/ölçek, dialog, toast, status badge, sayfa PDF raporu kancası
js/report-kit.js        Rapor menüsü (app-report-export-menu), new-ui PDF/Excel/CSV rapor şablonu, Kullanım Kılavuzu okuyucusu
js/ui-kit.js            app-page-header, app-card, app-form-field, app-empty-state, app-sidebar, data-table/kart, dışa aktarım, grafik teması
js/ui-components.js     İzometrik rack (Babylon sahnesi / CSS 3D yedeği), 42U şasi, cihaz detay penceresi
js/*.js                 Sayfa mantıkları
js/pms/single-line.js   PMS tek hat şeması çizici
js/reports/*.js         Rapor modülleri (capacity-forecast.js = Kapasite Tahmini; report-modal.js = ortak pop-up iskeleti)
js/engineering/*.js     Mühendislik alt sayfaları (DCIM.engRegistry[anahtar] = { mount(el, params) }); bulk-config.js = DCIM.engBulk ortak akışı
vendor/three.bundle.min.js  three + OrbitControls (IIFE, window.THREE)
vendor/babylon.bundle.min.js @babylonjs/core 9.30.0, BMS'in kullandığı alt küme (esbuild IIFE, window.BABYLON)
vendor/cabinet-rack-scene.bundle.min.js  cabinet-3d-isometric-rack.scene.ts esbuild IIFE paketi (window.DCIM_RackScene)
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
node tools/gen-mock-layout.js   # kurgusal kat yerleşimlerini (js/layout-data.js) yeniden üret
node tools/smoke.js "reports.html#cue" out.png 1600 900   # headless Chrome: konsol hataları + ekran görüntüsü
```

İzometrik raf paketini (`vendor/cabinet-rack-scene.bundle.min.js`) yeniden üretmek için `front_end` kökünden:

```bash
echo "import { CabinetRackScene } from './projects/user-app/src/app/new-ui/shared/components/cabinet-3d-isometric-rack/cabinet-3d-isometric-rack.scene'; (window as any).DCIM_RackScene = CabinetRackScene;" | node_modules/.bin/esbuild --bundle --minify --format=iife --loader=ts --sourcefile=rack-entry.ts --target=es2019 --legal-comments=none --outfile=../dcim-presentation/vendor/cabinet-rack-scene.bundle.min.js
```

Orijinal şablonlarda da geçersiz olan `py-0.2`, `bg-slate-450`, `text-slate-655`, `border-emerald-250`, `border-purple-250`
sınıfları (Tailwind üretmez) bilerek aynen bırakıldı; `check-classes.js` IGNORE listesinde işaretlidir.

`tools/smoke.js` çıktısındaki ekran görüntüsü, sayfanın gerçek tarayıcıdaki hâlini doğrulamak için kullanılır;
`?cabinet=`, `?tab=`, `#rapor` gibi parametrelerle demo durumları doğrudan açılabilir.
