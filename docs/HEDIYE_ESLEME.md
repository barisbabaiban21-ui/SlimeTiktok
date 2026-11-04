# Hediye eşlemesi önerisi · 2026-11-04

Kaynak: TikTok'un kendi hediye kataloğu (`webcast.tiktok.com/webcast/gift/list`). Bu makineden çekildi; 759 hediyeden 538'i 1.000 jeton ve altında. Tam liste `docs/tiktok-gift-catalog.csv` dosyasında. Katalog yayın odasına ve bölgeye göre değişebilir. İlk canlı yayında gelen hediye ID'leri panelden kontrol edilmeli.

## Mantık
- **En ucuz ve en çok atılan hediye (Gül) suya bağlanır.** Komedinin motoru spam olduğu için su herkesin atabileceği kadar ucuz olmalı.
- **Kurtarma biraz daha pahalı ama erişilebilir olmalı** (5-10 jeton). Böylece "su ekibi — kurtarıcılar" çekişmesi para kazandırır.
- **Bedava ve ucuz olumlu seçenek de var:** TikTok (1 jeton) ile slime kabarır. Böylece su atmayanların da yapacak bir şeyi olur.
- **Danslar ucuz Türk temalı hediyelerle tetiklenir.** Referans yayında da danslar ucuz hediyelerle açılıyordu.
- **Eşlenmeyen hediyeler jeton değerine göre çalışmaya devam eder.** Eşikler gerçek fiyat basamaklarına (1, 5, 10, 20, 30, 99, 199, 299, 500, 1.000) çekilmeli. Bugünkü 2, 15, 40, 45, 60, 80 ve 150 basamaklarına denk düşen hediye ya hiç yok ya da çok az.

## Önerilen eşleme

| Grup | Hediye (TR adı) | ID | Jeton | Aksiyon |
|---|---|---|---|---|
| Slime | Rose (Gül) | 5655 | 1 | **Su ekle** |
| Slime | TikTok | 5269 | 1 | Köpük ekle (slime kabarır) |
| Slime | Finger Heart (Parmak Kalp) | 5487 | 5 | **Boraks** (kurtarır) |
| Slime | Rosa | 8913 | 10 | **Su koruma** (20 sn) |
| Slime | GG | 6064 | 1 | Sim |
| Slime | Perfume (Parfüm) | 5658 | 20 | Tutkal |
| Slime | Money Gun (Para Tabancası) | 7168 | 500 | **Dev tutkal kovası** (en büyük hediye kartı) |
| Şov | Turkish coffee (Türk kahvesi) | 5994 | 5 | Halay |
| Şov | Turkish kebab (Türk kebabı) | 638208 | 5 | Roman havası |
| Şov | Friendship Necklace (Dostluk Kolyesi) | 9947 | 10 | Horon |
| Şov | Hat and Mustache (Bıyıklı Şapka) | 6427 | 99 | Zeybek (karakterin bıyığına uygun) |
| Kaos | Doughnut (Donut) | 5879 | 30 | Ketçap |
| Kaos | Confetti (Konfeti) | 5585 | 100 | Yumurta |
| Kaos | Mishka Bear | 5566, 5486 | 100 | Sirke |
| Koruma | Hand Heart (Kalpli Eller) | 5660, 5924 | 100 | Ketçap koruma |
| Koruma | Corgi | 6267 | 299 | Yumurta koruma |

İki ID'si olan hediyelerin (Mishka Bear, Hand Heart) her iki ID'si de kurala eklenmeli.

Kural dışında kalanlar jeton eşiğine göre işler: pudra, şampuan, boya ve boncuk.

## Viewer Wishes sırası
Panelde aynı anda yaklaşık 4 satır görünüyor. Bu yüzden ilk dört satıra su ekibi ile kurtarıcılar arasındaki çekişme konuyor:

1. Gül → Su ekle
2. Parmak Kalp → Boraks (kurtar)
3. Rosa → Su koruma
4. TikTok → Slime kabart
5. Parfüm → Tutkal
6. Türk kahvesi → Halay
7. Dostluk Kolyesi → Horon
8. Türk kebabı → Roman havası
9. Donut → Ketçap
10. Para Tabancası → Dev tutkal kovası

## Uygulama için not
- Kod tarafında `GiftRule` tek bir `giftId` alıyor. Çift ID'li hediyeler için iki ayrı kural gerekir.
- Codex'in D aşaması bir kuralın şovu (`show`) hedeflemesini ekliyor. Şov satırları ancak o aşamadan sonra çalışır.
- Şov hediyeleri ucuz olduğu için şov kuyruğuna bir sınır konmalı. Örneğin sırada en fazla 3 şov olsun, fazlası gelince sıradaki şovun süresi uzasın.
- Panelde "son gelen hediye ID'leri" listesi yok. Canlıya çıkmadan önce eklenmeli; operatör bilinmeyen bir hediyeyi tek tıkla bir aksiyona bağlayabilmeli.
