# Operations

## İşletim modeli

Tek Node süreci tek oyunun otoritesidir. Canvas istemcisi sadece durumu çizer; URL/query ile hediye veya yönetim yetkisi verilmez. SQLite verisini birden fazla app container'ı arasında aynı anda paylaşma. Demo ve canlı dosyaları ayrıdır. Canlı açılış her zaman operatör onayı ister.

Oyun gözetimsiz akabilir; platform gözetimi ve moderasyon yine işletmecidedir. Panikte panelden Acil durdur seç, gerekiyorsa TikTok yayınını da kendi arayüzünden kapat. Uygulama TikTok hesabındaki LIVE'ı API üzerinden kapatmaz; opsiyonel kendi yayın işçisi readiness kaybında RTMP gönderimini keser. OBS kullanıyorsan OBS yayını ayrıca durdurulmalıdır.

Duraklatılmışken gelen hediye olayları denetim kaydına girer, oyun etkisi uygulanmaz. Ekran hediye göndermeme uyarısı gösterir. Uygulama TikTok hediye alımını teknik olarak engelleyemez veya iadeyi otomatik yapamaz.

## Sağlık ve loglar

`GET /healthz`: süreç ayakta mı? `GET /readyz`: oyun canlı yayın için etkin ve kaynak sağlıklı mı? Readiness başarısızlığında HTTP 503 döner. Bu uçlar ayrı izlenmelidir. `docker compose logs --tail=100 app bridge broadcaster` süreç olaylarını gösterir. Anahtarlar veya ham provider hataları loglanmaz. Dış bildirim servisi yapılandırılmamıştır; 24 saat işletimde bağımsız uptime alarmı ekle.

SSE en fazla 32 ekran / IP başına 8 bağlantı kabul eder; bunlar OBS ve operatör tarayıcılarıdır, TikTok izleyici sayısı değildir. Reverse proxy arkasındaki IP'ler bilerek `X-Forwarded-For` üzerinden güvenilmez; çok ekranlı operasyon için limitleri gerçek proxy topolojisine göre incele.

## Yedekleme

Yerelde: `npm run backup`. Docker'da:

```bash
docker compose exec -T app node scripts/backup.mjs
docker compose cp app:/app/data/backups ./backups
```

`VACUUM INTO` tutarlı dosya üretir; `PRAGMA integrity_check` sonucu kontrol edilir. Canlı WAL veritabanını düz `cp` ile yedekleme. Yedekleri sunucu dışında şifreli sakla ve gerçek geri yükleme denemesi yap. Bu komutlar zamanlama kurmaz; cron/backup servisini ayrıca yapılandır.

## Geri yükleme

Önce bütün yazıcıları durdur: `docker compose stop bridge broadcaster app`. Mevcut `game_data` volume'unu ayrıca arşivle. Yedekte doğru modu ve bütünlük kontrolünü doğrula. Bir kerelik yardımcı container ile volume'a bağlanıp doğru dosya adıyla (`demo.sqlite` veya `live.sqlite`) geri yükle; eski aynı-adlı `-wal`/`-shm` dosyalarını yalnızca bütün süreçler durmuşken kaldır. Dosyanın sahibi app kullanıcısı UID 1000 olmalı. App'i başlat, kontrol et, sonra köprüyü başlat ve panelden arm et. `docker compose down -v` verileri siler: normal güncellemede kullanma.

## Güncelleme

```bash
docker compose exec -T app node scripts/backup.mjs
docker compose stop broadcaster bridge
git pull --ff-only
docker compose up -d --build app
```

Sonra kontrolleri yap; canlı köprü/yayın işçisini bilinçli olarak tekrar başlat. Veritabanı şeması sürümlüdür; desteklenmeyen sürüm sessizce silinmez. İlk şema v1'dir. Şema değiştiren gelecekteki güncellemeler ayrı migration/geri dönüş planı gerektirir.

## Gizlilik ve güvenlik

İsimler varsayılan olarak yayında takma kimlikle gösterilir; raw chat saklanmaz. Platform ID'leri HMAC ile tek yönlü özetlenir, ekran isimleri özel veritabanında 30 günlük etkinlik saklama politikasıyla tutulur. Olaylar 7 gün, streak kayıtları 24 saat, günlük skorlar 30 gün saklanır. Ses önbelleği (`DATA_DIR/voice`) silinene kadar kalır. Bu süreler uygulamanın teknik varsayılanlarıdır, yasal uygunluk taahhüdü değildir. Engellenmiş kimlikler operatör kaldırana kadar kalır.

`.env`, stream key ve veritabanını Git'e ekleme. WEBHOOK_SECRET değişince kullanıcı pseudonym'leri değişir; mevcut engellerin yeniden uygulanmasını planla. ADMIN_TOKEN'ı ayrı değiştir. Disk doluluğu, bellek ve kuyruk derinliğini kontrol et. Bu teslim penetrasyon testinden geçmiş bir finans ürünü değildir; nakit muhasebe defteri olarak kullanma.
