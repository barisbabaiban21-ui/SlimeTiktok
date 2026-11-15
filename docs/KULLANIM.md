# Kullanım rehberi

Bu rehber kurulumdan ilk canlı yayına kadar her adımı anlatır. İngilizce özet için [README](../README.md).

## 1. Kurulum

Gerekenler: Node.js 22.16 veya üstü, npm, Git. Karakteri kendin üretmek istersen ayrıca Blender ve bir fal.ai anahtarı ([CHARACTER.md](CHARACTER.md)).

```bash
git clone https://github.com/oguzhankayan/SlimeTiktok.git
cd SlimeTiktok
npm ci && (cd bridges && npm install --omit=dev)
npm run setup
npm run build
```

`npm run setup`, `.env` dosyasını gizli ve rastgele `ADMIN_TOKEN` ile `WEBHOOK_SECRET` değerleriyle oluşturur. `.env` git'e girmez; kimseyle paylaşma.

## 2. Demo

```bash
npm start
```

- Yayın ekranı: http://localhost:3000/overlay. Ses için adrese `?audio=1` ekle ve sayfa yüklendikten sonra bir kez tıkla.
- Kontrol paneli: http://localhost:3000/admin. Giriş için `.env` içindeki `ADMIN_TOKEN`.

Demoda sahte izleyiciler hediye gönderir; gerçek gelir ya da gerçek kullanıcı yoktur. Demo verisi `data/` klasöründe, canlı verisi ayrı bir klasörde tutulur; ikisi asla karışmaz.

## 3. Ses

Ses kapalıyken her şey altyazıyla çalışır. Sesi açmak için `.env` dosyasına:

```text
TTS_PROVIDER=fal
TTS_MODEL=xai/tts/v1
TTS_VOICE=sirius
FAL_KEY=fal_anahtarin
```

- Her cümle bir kez seslendirilip diske kaydedilir (`DATA_DIR/voice`); aynı cümle tekrar ücret almaz.
- Açılışta sabit cümleler arka planda önceden seslendirilir (`TTS_PREWARM=true`).
- Günlük sınır: `TTS_DAILY_CHARS` (varsayılan 100.000 karakter). Sınır dolunca altyazıyla devam eder.
- Başka bir sağlayıcı da kullanılabilir: `TTS_PROVIDER=elevenlabs`, `openai` ya da kendi sunucun için `http` (`.env.example` içindeki açıklamalara bak).

## 4. Canlı yayın

Ayrıntılar [CANLI_YAYIN.md](CANLI_YAYIN.md) dosyasında. Kısaca:

1. `.env.live` dosyasını oluştur (`.env`'in üstüne yazar, git'e girmez):
   ```text
   MODE=live
   DATA_DIR=./data-live
   FORWARD_CHAT=true
   TIKTOK_USERNAME=kullanici_adin
   CONNECTOR_LICENSE_ACK=true
   BRIDGE_PROVIDER=tiktok
   ```
2. Sunucu: `npm run live`. Canlı sunucu her zaman **kilitli** açılır.
3. TikTok LIVE Studio'da yayın ekranını (`/overlay?audio=1`) tarayıcı kaynağı ya da pencere yakalama olarak ekle; tuval 1080×1920. Pencere yakalamada bilgisayar sesini ayrıca aç.
4. TikTok'ta yayını başlat.
5. Köprü: `npm run bridge:live`. Günlükte `connected` görmelisin.
6. Panelde **Başlat**.

Panelde bir kez açman gereken ayarlar: "Kullanıcı adlarını göster ve sesli oku", "Filtrelenmiş kısa yorumları sesli oku".

Yayın bittiğinde köprü TikTok'un "yayın bitti" sinyalini görür, kapanır ve oyun kendiliğinden duraklar.

## 5. İzleyiciler ne yapabilir?

| İzleyici | Sonuç |
|---|---|
| Hediye atar | Hediyeye bağlı malzeme dökülür, adıyla teşekkür edilir |
| Yayına gelir | Adıyla karşılanır, slime biraz büyür |
| Beğeni atar | Slime yoğrulur ve büyür |
| `yoğur`, `uzat`, `su`, `boraks`, `köpük` yazar | Ücretsiz küçük hareketler (kişi başı 20 saniyede bir) |
| Oylamada `1`–`4` yazar | Dans seçer (twist, tavuk, kongo, Osman Tuş) |
| Görevde `yoğur` yazar | Üç kişi olursa 2× büyüme |
| Hızlı parmakta ilk `slime` yazar | Adı söylenir, "Hızlı Parmak" unvanı alır |

## 6. Gösteriler

Sunucu ortam sakinken belirli aralıklarla (canlıda 40–75 saniyede bir) bir gösteri başlatır. Gösteriler: dans, sessiz dans, dans oylaması, beğeni yarışı, `yoğur` görevi, hızlı parmak, sim yağmuru, bedava dev kova, parti, altın slime (45 saniye 2× büyüme), elektrik kesintisi, sinir krizi.

Sinir krizi: Ekran siyah beyaz olur, her şey ağır çekime geçer ve karakterin sesi elle yavaşlatılmış bir kaset gibi çalar. Su yüzünden gerçekten sinirlendiğinde de aynısı olur.

Sıklık ve süreler `src/server/service.ts` içindeki `shows()` fonksiyonundadır.

## 7. Replikleri değiştirmek

Bütün cümleler `src/server/dialogue.ts` dosyasında:

- `CHATTER`: boş zamanlarda söyledikleri
- `JOIN_NAMED`, `JOIN_COUNT`, `WELCOME`: gelenlere (`{adlar}` gelenlerin adları)
- `GIFT_THANKS`: hediye teşekkürü (`{ad}`, `{hediye}`)
- `RAGE`: sinir anı (yavaş kaset sesiyle çalınır)
- `SHOW`: gösteri açılışları
- `STARTED`: malzeme dökülürken

Bu listelerdeki kalıp cümleler 90 saniye içinde tekrar söylenmez. Değişiklikten sonra `npm run build` ve sunucuyu yeniden başlat.

## 8. Müzik

Müzik dosyaları repoda yoktur (telif). Kendi telifsiz, lisanslı veya sana ait parçalarını `public/assets/music/` klasörüne koy. Halay için iki parçayı `halay-1.mp3` ve `halay-2.mp3` adlarıyla aynı klasöre ekle. Parçalar bitmeden yaklaşık 2,5 saniye önce çapraz geçiş yapar; biri eksikse diğeri döngüde kalır. İki dosya da yoksa uygulama mevcut sentetik davul-zurna benzeri ritmi kullanır:

| Dosya | Ne zaman çalar |
|---|---|
| `muzik.mp3` | Arka planda sürekli, konuşurken kısılır |
| `disco.mp3` | Disco topu indiğinde |
| `kongo.mp3` | Kongo dansında (döngü) |
| `osman.mp3` | Osman Tuş dansında (döngü) |
| `halay.mp3` | Halay böcekleri sahneye girince otomatik başlar, son katılımcı ayrılınca durur |

Dans parçaları dansın başında baştan başlar; şarkının sevdiğin bir yerinden başlaması için önce o kısmı kes:

```bash
ffmpeg -ss 134 -t 20 -i sarki.mp3 -c:a libmp3lame -b:a 160k public/assets/music/disco.mp3
```

Dosya yoksa o müzik sessizce atlanır. Arka plan müziğini kapatmak için `?music=0`.

## 9. Sorun giderme

- **Ses yok:** Sayfaya bir kez tıkla (tarayıcılar ilk tıklamaya kadar sesi engeller). Pencere yakalamada LIVE Studio'nun bilgisayar sesini al.
- **Köprü bağlanmıyor (403, `DEVICE_BLOCKED`):** Bağlantını kontrol et; sürerse eulerstream.com'dan anahtar alıp `SIGN_API_KEY`'e yaz.
- **Oyun "kaynak bekleniyor"da:** Köprü çalışmıyor ya da yayın kapalı. Köprüyü yeniden başlat, sonra panelde Başlat.
- **Takılma:** Adrese `&quality=low` ekle (gölgeler, alan derinliği ve parlama kapanır).
