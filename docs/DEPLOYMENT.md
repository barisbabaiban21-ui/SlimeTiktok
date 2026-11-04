# Deployment

## 1. Önce demo

Node 24, Git, Docker Engine ve Docker Compose v2 kurulu bir Linux sunucu kullan. Gereken paketleri sunucunun dağıtımına uygun resmî kurulum yöntemiyle kur. Genel amaçlı VPS için garanti edilmiş minimum CPU/RAM vermiyoruz: Chromium ve video kodlama, oyun sunucusundan çok daha fazla kaynak tüketir.

```bash
git clone https://github.com/oguzhankayan/SlimeTiktok.git
cd SlimeTiktok
node scripts/setup.mjs
chmod 600 .env
docker compose up -d --build app
docker compose logs --tail=50 app
```

Docker görüntüsü derlenirken testler çalışır. Kalıcı veriler `game_data` isimli volume içindedir; `.env` görüntüye kopyalanmaz. Uygulama container'ı non-root, salt-okunur root filesystem, sınırlı log büyümesi ve capability drop ile çalışır.

SSH tüneli ile `http://localhost:3000/admin` aç, anahtarla giriş yap, demo malzemelerini dene; slime büyürken karakterin döküp yoğurduğunu gör. `PUBLIC_ORIGIN` tarayıcıda kullanılan origin ile tam eşleşmelidir. Varsayılan `http://localhost:3000`; `http://127.0.0.1:3000` farklı bir origin'dir.

## 2. İsteğe bağlı HTTPS

DNS A/AAAA kaydını sunucuya yönlendir; 80/443 portlarını aç. `.env`:

```dotenv
DOMAIN=slime.example.com
PUBLIC_ORIGIN=https://slime.example.com
```

```bash
docker compose --profile edge up -d --build app edge
```

Caddy TLS sertifikasını yönetir; sertifika volume'larını silme. Yönetim API'si ayrıca Bearer anahtarı ister. Kurumsal kurulumda yönetim yolunu VPN veya reverse-proxy IP kısıtı arkasında tut. SSE için proxy buffering kapalı olmalı.

## 3. TikTok köprüsü

Önce `THIRD_PARTY.md` ve sağlayıcı koşullarını incele. `.env`:

```dotenv
MODE=live
TIKTOK_USERNAME=gercek_hesap
CONNECTOR_LICENSE_ACK=true
BRIDGE_PROVIDER=tiktok
# Gerekiyorsa sağlayıcı hesabından alınan SIGN_API_KEY değerini yalnızca sunucuda gir.
```

```bash
docker compose up -d --build app
docker compose --profile live up -d --build bridge
```

Hesap yayında değilse köprü sınırlı geri çekilmeyle yeniden dener. TikTok tarafında canlı yayın, hesabın izin verilen yöntemiyle başlatılır. Köprü sağlıklı göründüğünde panelden Başlat seç. Hesap/signer kısıtlarını aşmak için yeniden başlatma veya kimlik rotasyonu yapılmaz. `streamEnd` sonrasında köprü çıkış yapar; operatörün yeni oturumu değerlendirmesi gerekir.

Tiktok-live-connector opsiyonel bağımlılığı burada ağ üzerinden kurulur. Ana projenin lockfile'ı vardır; opsiyonel köprünün transitive bağımlılıkları bu teslimde lockfile'a sabitlenmemiştir. Üretim dağıtımında başarılı kurulumun ardından `bridges/package-lock.json` dosyasını inceleyip commit et ve build'i `npm ci`'a geçir.

## 4. OBS ile yayın

OBS tarayıcı kaynağına `/overlay` adresini ekle. Dikey canvas 720×1280 veya 1080×1920; tarayıcı kaynağı aynı boyutta olsun. Hızlı CPU profili için `?quality=low` kullan. İsteğe bağlı ses için `?audio=1`, tarayıcının autoplay izni ve OBS ses yönlendirmesi gerekir. Yayın hesabının verdiği stream key'i sadece OBS'ye gir.

## 5. VPS yayın işçisi

Bu bölüm gerçek VPS/RTMP üzerinde henüz doğrulanmadı. İzinli RTMP(S) erişimi olmadan çalıştırma. `.env`:

```dotenv
BROADCAST_ENABLED=true
RTMP_URL=rtmps://izinli-sunucu/uygulama/YAYIN_ANAHTARI
STREAM_WIDTH=720
STREAM_HEIGHT=1280
STREAM_FPS=30
STREAM_BITRATE=2500k
BROADCAST_STARTUP_GRACE_SECONDS=120
```

```bash
docker compose --profile broadcast up -d --build broadcaster
```

İşçi demo modunu reddeder. İlk 120 saniye, canlıyı başlatıp olay köprüsünü bağlamak ve panelden oyunu etkinleştirmek için duraklatılmış bekleme ekranı yayımlayabilir. Bu sürede oyun hazır olmazsa durur. Bir kez hazır olduktan sonra readiness kaybı, acil durdurma, API erişim sorunu veya alt süreç çıkışı yayını keser. Otomatik yeniden yayın başlatmaz.

Chromium sandbox, sunucunun user-namespace/seccomp desteğine bağlıdır. Sandbox hatası varsa önce host politikasını düzelt veya OBS kullan. `CHROMIUM_NO_SANDBOX=true` yalnızca izole, non-root ve güvenilen tek sayfayı açan worker container'ında bilinçli bir güvenlik tavizi olarak seçilebilir; ana sunucuda veya genel web taraması için önerilmez. `--privileged` gerekmez ve kullanılmamalıdır.

Ses: `BROADCAST_AUDIO=silent` (varsayılan) sessiz AAC kanalı üretir. `BROADCAST_AUDIO=pulse` işçinin içinde özel bir PulseAudio null-sink açar; Chromium karakterin sesini ve slime efektlerini oraya çalar, FFmpeg `-f pulse -i slime.monitor` ile kaydeder. Worker imajına `pulseaudio` eklendi. **Bu yol bu geliştirme ortamında test edilemedi** (PulseAudio kurulu değildi); ilk kurulumda kısa bir kayıtla sesi doğrula.

Performans (ölçüldü): 4 vCPU, GPU'suz SwiftShader, 720×1280, `quality=low` ile sahne yaklaşık 17-21 FPS çiziyor (ölçüm aracı aynı makinede çalışırken). Yayın için `STREAM_FPS=24` kullan; 8 vCPU önerilir. En iyi görüntü için GPU'lu bir bilgisayarda OBS tarayıcı kaynağı (`/overlay?audio=1`, kalite parametresiz) kullan. RTMP anahtarı FFmpeg argümanında bulunduğundan sunucu/process yönetim erişimini kısıtla. Loglar encoder çıktısını anahtarı sızdırmamak için aktarmıyor; hata teşhisi yalnızca operatör kontrollü, anahtarları maskeleyen bir oturumda yapılmalı.

## Canlıya çıkış kontrolü

Gerçek bir küçük hediye ve seri hediyeyi kontrollü yayında test et; katalog değeri, recipient/host ID ve etkileri doğrula. Bedelsiz komutları test et. Köprüyü kes ve duraklamayı gözle. Sunucuyu yeniden başlat ve otomatik arm olmadığını doğrula. Yedeği ayrı klasöre restore et. Son olarak hedef çözünürlükte uzun süreli CPU, RAM, bitrate, kare atlama ve disk büyümesi ölç. Bu adımlar bitmeden 7/24 üretim güvenilirliği varsayma.
