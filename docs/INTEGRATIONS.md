# Event integrations

## İmzalı protokol

`POST /api/ingest`, `Content-Type: application/json`.

```json
{
  "id": "provider-stable-message-id",
  "source": "webhook",
  "roomId": "actual-live-room-id",
  "timestamp": 1792666800000,
  "kind": "gift",
  "user": {"id": "platform-user-id-as-string", "name": "Display name"},
  "gift": {"id": "5655", "name": "Rose", "coins": 1, "repeat": 3, "streakId": "actual-group-id", "ended": false}
}
```

Örnekteki timestamp sabit bir örnektir; gerçek çağrıda `Date.now()` kullan. İki başlık gerekir:

- `x-slime-timestamp`: milisaniye Unix zamanı.
- `x-slime-signature`: `HMAC_SHA256(WEBHOOK_SECRET, timestamp + '.' + rawJsonBody)` hex.

İmza ±60 saniye geçerlidir. Olay timestamp'i en fazla 10 dakika eski olabilir. Gövde 32 KB ile sınırlıdır. Sunucu hesabının saatini NTP ile eşitle. Gövdeyi imzadan sonra yeniden biçimlendirme. `scripts/send-event.mjs` çalışan örnektir; yalnızca demoda etkin.

Sunucu `id + source + roomId` ile tekrarları engeller. Kümülatif seri `1 → 2 → 5 → final 5` gelirse toplam **5** hediye işlenir. `gift.coins` tek hediyenin katalog birim değeri, `repeat` kümülatif adet olmalıdır. Toplam maliyeti `coins` alanına yazmak iki kez çarpmaya yol açar. Para çekilebilir gelir hesaplanmaz.

`POST /api/source` aynı imzayla `{"provider":"my-bridge","connected":true}` kabul eder. Köprü yaklaşık 10 saniyede bir heartbeat gönderir. 45 saniyeden eski bağlantı, canlı oyunu duraklatır. Yalnızca gerçekten sağlıklı kaynak için `connected:true` bildir. Admin anahtarı ve webhook anahtarı ayrı olmalıdır.

## Ücretsiz etkileşimler

`kind:comment`, `command:!yoğur/!yogur/!uzat/!slime/!knead/!stretch`. Kişi başına 6 saniye cooldown. karakter yoğurur ya da uzatır, slime biraz büyür.

`kind:like`, `count:1..5000`. Kişi başına 2 saniye cooldown ve en fazla 10 etki puanı.

`kind:follow`: kullanıcı başına 24 saatte bir 15 sıcaklık puanı. Ham sohbet yayınlanmaz veya saklanmaz.

## Hediye kuralları

Önce açık `giftId` eşleşmesi; yoksa hediyenin birim değerine uyan en yüksek boş-ID eşiği. Her kural bir **malzemeye** (su, tıraş köpüğü, sim, pudra, boraks, tutkal, şampuan, boya, ketçap, sirke, yumurta, dev tutkal kovası) ve adet sayısına bağlanır. `label` alanı yayındaki menüde görünen hediye adıdır (örneğin "Gül").

- Malzemeler sıraya girer; karakter sırayla döker ve yoğurur. Kuyruk uzadıkça her harekette birden fazla adet işler, böylece 1.000'lik bir seri saatlerce sürmez. Kuyruk 300 kayıtla sınırlıdır.
- **Koruma** malzemeleri (su koruma, ketçap koruma, yumurta koruma) sıraya girmez, anında aktif olur: her adet 20 saniye, en fazla 180 saniye. Koruma aktifken sıradaki ilgili malzeme "Engellendi" olarak düşer, kütleye eklenmez.
- Bir hareketin kazandırdığı gram 50 tonla sınırlıdır. Ketçap, sirke, yumurta ilerlemeyi asla silmez; renk, kıvam ve karakterin tepkisini değiştirir.
- Tarif çağrıları belirli aralıkla açılır; tarif dolarsa 1 dakika ×2 büyüme.

## Opsiyonel doğrudan TikTok

```bash
npm install --prefix bridges
npm run bridge
```

`.env`: `MODE=live`, `TIKTOK_USERNAME`, `CONNECTOR_LICENSE_ACK=true`, gerekirse `SIGN_API_KEY`. SDK: `tiktok-live-connector@2.5.0`. Kaynaklar: https://ttlc.docs.isaackogan.com/guides/gifts/ ve https://ttlc.docs.isaackogan.com/getting-started/connection/ . Bu resmî TikTok API'si değildir.

Modern payload'da kullanıcı `event.user`, fiyat `event.gift.diamondCount`/extended metadata, seri `groupId` üzerinden okunur. 64-bit ID'ler string kalır. Güvensiz JS sayıları, bilinmeyen fiyat, eksik seri kimliği veya başka alıcıya ait hediye reddedilir. Host kimliği otomatik çözülemezse gerçek `TIKTOK_HOST_ID` değerini gir. Tahmin edilmiş ID kullanma.

Kuyruk `bridge-outbox.sqlite` içinde kalıcıdır, 5.000 kayıtla sınırlıdır. Onaylanmayan istek aynı kimlikle yeniden denenir. 9 dakikadan eski kuyruk kayıtları oyuna uygulanmaz, loglanarak reddedilir. Dolma veya kalıcı 4xx hatası köprüyü operatör incelemesi için kapatır. Bu durumda TikTok'taki hediyeyi iade etmez; platformdan para transferi yapmaz.

## TikFinity Desktop

```dotenv
BRIDGE_PROVIDER=tikfinity
TIKFINITY_WS=ws://127.0.0.1:21213/
TIKTOK_ROOM_ID=gercek-yayin-odasi
```

Köprüyü TikFinity Desktop'ın çalıştığı bilgisayarda çalıştır; `INGEST_URL` VPS'nin HTTPS adresini göstersin. Core Node kurulumu yeterlidir, doğrudan TikTok SDK'sını yüklemek gerekmez. Desktop'ın ayrıca gerçek LIVE'a bağlı olduğunu operatör doğrulamalıdır: WebSocket'in açık olması tek başına LIVE uygunluğunu ispatlamaz. Yeni LIVE oturumunda room ID'yi değiştir. Sağlayıcı payload sürümleri değişebileceği için gerçek oturumda doğrulama şarttır. Haricî masaüstü portunu herkese açma.

## Ses (TTS)

karakterin repliklerini sunucu üretir ve `speech` alanında yayınlar. Altyazı her zaman çıkar. Ses için `.env`:

```dotenv
TTS_PROVIDER=fal         # none | fal | http | elevenlabs | openai
FAL_KEY=...              # fal.ai anahtarı
TTS_MODEL=xai/tts/v1     # varsayılan
TTS_VOICE=rex            # varsayılan; karakter'nın sesi
TTS_WAIT_MS=6000         # yeni cümle sesi bu kadar bekler, sonra sadece altyazıyla çıkar
TTS_DAILY_CHARS=100000   # günlük ücretli karakter sınırı
TTS_PREWARM=true         # sabit cümleleri açılışta bir kez seslendir
```

**Seçilen ses: xAI TTS, `rex`, fal üzerinden** (2026-11-04 dinleme testi: HeyGen Turbo, xAI, Gemini 3.8 Flash, ElevenLabs v4 Turbo karşılaştırıldı). fal fiyatı 1.000 karakter için $0,015. Bu makineden ölçülen süre, istekten ses dosyası inene kadar 3,2-4,6 sn; bu yüzden `TTS_WAIT_MS=6000` önerilir. fal sağlayıcısı `https://fal.run/<TTS_MODEL>` adresine `{"text","voice","language":"tr"}` gönderir, dönen `audio.url` dosyasını indirir.

Maliyet ve hız kuralları:

- **Önceden üretme:** Açılışta değişken içermeyen bütün cümleler (isim yerine "yeğenim", "kral" gibi hitaplar dahil, ~385 cümle, ~16.300 karakter, xAI ile ~$0,24) arka planda bir kez seslendirilir. Canlı cümleler öne geçer. Diskte kaldığı için sonraki açılışlar ücretsizdir.
- **Gerçek süre:** Cümlenin ekranda kalma süresi, karaoke altyazı ve bir sonraki cümlenin zamanı ses dosyasının gerçek uzunluğundan (MP3 kareleri veya WAV başlığı) hesaplanır. Ses yarıda kesilmez.
- **Seyirci yoksa üretim yok:** Bağlı yayın ekranı (`/overlay`, panel önizlemesi dahil) yokken yeni cümle ücretli sentez için gönderilmez. Önbellekteki sesler her zaman çalar.
- **Günlük sınır:** `TTS_DAILY_CHARS` dolunca o gün yeni ses üretilmez, altyazı devam eder. Sayaç `DATA_DIR/voice/usage.json` içinde, yeniden başlatmada sıfırlanmaz. Panelde "bugün X/Y karakter" görünür.
- **Aynı anda en fazla 2 sentez** (`TTS_CONCURRENCY`), kuyrukta en fazla 6 bekleyen; fazlası altyazıyla çıkar.

`http` sağlayıcısı `POST {"text","voice","language":"tr"}` gönderir ve yanıt olarak `audio/mpeg`, `audio/wav`, `audio/ogg` veya `audio/webm` bayt bekler. Böylece istenen TTS servisinin önüne küçük bir vekil koymak yeterlidir. `elevenlabs` (TTS_VOICE = ses ID'si) ve `openai` uyarlayıcıları da var; ikisi de anahtar olmadığı için **gerçek servise karşı test edilmedi**. `fal` (xAI, `rex`) gerçek servise karşı denendi.

Üretilen dosyalar `DATA_DIR/voice/<sha256>.<ext>` altında önbelleklenir ve `/api/voice/<hash>.<ext>` yolundan servis edilir; anahtar tarayıcıya hiç gitmez. Aynı cümle tekrar üretilmez; `TTS_WAIT_MS` içinde ses gelmezse replik sadece altyazıyla yayınlanır, geç gelen ses yine de önbelleğe girer ve bir dahaki sefere sesli çalar. İsimler yalnızca `showNames` açıkken ve filtreden geçerse okunur.
