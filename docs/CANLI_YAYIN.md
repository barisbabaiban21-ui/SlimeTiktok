# Canlı yayın · kendi bilgisayarından

Oyun sunucusu, köprü ve yayın programı aynı Mac'te çalışır. Ses: xAI `sirius` (fal); ayarlar için [KULLANIM.md](KULLANIM.md#3-ses). Veritabanı demodan ayrıdır: `data-live/`.

## Bir kere yapılacaklar

1. **Euler Stream anahtarı gerekmez.** Köprü oda ve yayıncı kimliğini TikTok'un herkese açık LIVE sayfasından alır, anahtarsız bağlanır (2026-11-04'te denendi). TikTok istekleri engellerse (403, `DEVICE_BLOCKED`), önce internet bağlantısını kontrol et; sürerse eulerstream.com'dan ücretsiz anahtar alıp `SIGN_API_KEY`'e yaz.
2. **`.env.live` dosyasını doldur** (git'e girmez):
   ```text
   TIKTOK_USERNAME=kullanici_adin
   ```
3. `npm ci && (cd bridges && npm install --omit=dev) && npm run build`
4. **TikTok LIVE ayarları:**
   - Yapay zeka ile üretilmiş içerik etiketini aç; karakter ve ses yapay zekayla üretiliyor.
   - Viewer Wishes listesini kur (sıra aşağıda).

## Her yayında

1. **Sunucu:** `npm run live` (`.env` içindeki `PORT`). İlk açılışta sabit cümleler arka planda bir kez seslendirilir (birkaç kuruş); sonraki açılışlar önbellekten çalar.
2. **Yayın ekranı penceresi:**
   ```text
   open -na "Google Chrome" --args --app="http://localhost:3000/overlay?audio=1" --window-size=540,960
   ```
   Pencereye bir kez tıkla, ses açılır.
3. **TikTok LIVE Studio:**
   - Önce Link/Tarayıcı kaynağı olarak `http://localhost:3000/overlay?audio=1` adresini dene.
   - Kabul etmezse Pencere Yakalama ile 2. adımdaki Chrome penceresini ekle. Ses için LIVE Studio'da bilgisayar sesini aç.
   - Tuval: 1080×1920 (dikey).
4. TikTok'ta yayını başlat.
5. **Köprü:** `npm run bridge:live`. Günlükte `connected` görmelisin.
6. **Panel:** `http://localhost:3000/admin` adresine `.env` içindeki `ADMIN_TOKEN` ile gir.
   - Kaynak "bağlı" görünüyorsa **Başlat**'a bas. Sunucu her açılışta kilitli başlar.
7. **Kontrol:**
   - Bir Gül at: karakter su dökmeli ve adını söylemeli.
   - Olay günlüğünde `applied` görünmeli.

## Bitirirken ve acil durumda

- **Acil:** Paneldeki **■ Acil durdur** oyunu dondurur. TikTok yayını ayrıca LIVE Studio'dan kapatılır.
- **Bitiş:**
  1. Panelde Duraklat.
  2. Köprüyü kapat: terminalde Ctrl+C.
  3. LIVE Studio'da yayını bitir.
  4. Sunucuyu kapat: Ctrl+C.

## Viewer Wishes sırası (ilk dört satır görünür)

1. Gül → Su ekle
2. Parmak Kalp → Boraks (kurtar)
3. Rosa → Su koruma
4. TikTok → Slime kabart
5. Parfüm → Tutkal
6. Donut → Ketçap
7. Konfeti → Yumurta
8. Para Tabancası → Dev tutkal kovası

Eşleşen hediye ID'leri varsayılan kurallarda hazır. Paneldeki "Oyun ve hediye ayarları" bölümünden değiştirilebilir.

## Bilinenler

- **OBS:** TikTok, OBS'in hazır servis listesinde yok. "Özel" (Custom) servis seçilir. Sunucu adresi ve yayın anahtarı TikTok LIVE Center'dan alınır; bu yalnızca uygun hesaplarda açıktır (genelde 1.000 takipçi ve 18 yaş). Anahtar her yayında değişebilir.
- **Port:** `.env` içindeki `PORT` (varsayılan 3000). `INGEST_URL` ve `PUBLIC_ORIGIN` aynı portu göstermeli.
- **Sohbet okuma:** `FORWARD_CHAT=false` iken sohbet metni köprüden geçmez (komutlar ve oylar yine geçer). "X diyor ki" için `true` yap ve panelde sohbet okumayı aç.
- **Ses maliyeti:** Günlük ses sınırı 100.000 karakter (xAI ile ~$1,5). Sınır dolunca altyazıyla devam edilir.
