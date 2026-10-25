# Özer Pizza — yayın öncesi kontrol listesi

Bu teslimat, mevcut statik siteye eklenebilecek hata/yakında sayfalarını, üç dilde politika taslaklarını, çerez tercih arayüzünü, favicon'u ve temel hosting başlıklarını içerir. Hukuki metinler işletmenin gerçek kayıtları ve veri akışıyla karşılaştırılmadan son sürüm sayılmaz.

## Önce işletme bilgilerini tamamlayın

- Ticari unvan / girişimci adı, kayıtlı adres ve IČO.
- Telefon/WhatsApp (+420 773 940 624) ve e-posta (pizzaozer@gmail.com) siteye ve sipariş akışına işlendi. Sipariş mesajı müşterinin WhatsApp uygulamasında veya e-posta taslağında açılır; müşteri gönderir ve restoran ayrıca onaylar.
- Gerçek ödeme yöntemleri, varsa teslimat ücreti, çalışma saatleri ve tahmini hazırlık/teslimat süreleri.
- Her menü kalemi için reçeteden doğrulanmış alerjen ve çapraz bulaşma bilgisi.
- Hosting, Supabase bölgesi/işleyicileri, sipariş ve muhasebe verileri için uygulanacak somut saklama süreleri.
- Ana alan adı ve HTTPS. Sonra `sitemap.xml.template` içindeki adresleri gerçek HTTPS alan adıyla değiştirip `sitemap.xml` oluşturun ve `robots.txt` dosyasına sitemap satırını ekleyin. Alan adı verilmediği için bu teslimatta sahte bir alan adı yayımlanmıyor.

## Teknik kurulum

1. `index.html`, `admin.html`, bütün `.js` dosyaları ve görseller aynı yayındaki dizinde bulunsun. Üretim için `supabase-config.js` içine yalnızca doğru Supabase URL'si ile publishable/anon anahtarını girin; `service_role` anahtarını hiçbir tarayıcı dosyasına koymayın.
2. `supabase-setup.sql` kurallarını uygulayın, yalnızca gerçek yönetici Auth hesabını `admin_users` içine ekleyin, tabloların RLS erişimlerini doğrulayın. Supabase yapılandırılmadığında `admin.html` bilerek kilit ekranı gösterir. Yapılandırıldığında dahi hosting düzeyinde `/admin.html` yoluna ek parola/VPN/IP erişim kısıtı koyun; `robots.txt` gizlilik veya erişim kontrolü değildir.
3. Netlify gibi `_headers` dosyasını destekleyen hostta `_headers` dosyasını kullanın. Apache hostta `.htaccess` dosyasını kullanın. İkisini de hosting türü doğrulanmadan çalışır kabul etmeyin. HTTPS'i hostta etkinleştirin. CSP, sayfadaki mevcut satır içi JS ve üçüncü taraf kaynakların tam izin listesi belirlenmeden eklenmedi.
4. Çerez arayüzü şu an Google Analytics/Ads betiği yüklemez. Daha sonra eklenecek her analiz/pazarlama etiketi, kullanıcı tercihi `ozer-consent-change` olayıyla olumlu olmadan başlatılmamalı; sağlayıcı, amaç ve saklama süreleri politika sayfalarına yazılmalı. Harita, video, gömülü sosyal medya ve diğer yeni dış servisleri de inceleyin.
5. Özel 404 için Apache `.htaccess` içinde hata rotası hazır. Diğer platformlarda kendi 404 yapılandırmasına `404.html` dosyasını bağlayın. `coming-soon.html` sadece geçici bilgilendirme içindir; reklamın nihai URL'si olarak kullanmayın.
6. Yayından sonra menü/sipariş akışını gerçek cihazda, mobil görünümde, üç dilde ve reddedilmiş çerez tercihinde gözden geçirin. Google Ads hedef adresi doğrudan, erişilebilir ve ilan edilen içerikle aynı olmalı.

## Hazırlanan sayfalar

- contact.html: restoran adresi ve iletişim alanı

- `404.html`: bulunamayan sayfa
- `coming-soon.html`: geçici açılış duyurusu (noindex)
- `privacy.html`, `cookies.html`, `terms.html`, `allergens.html`: Çekçe/İngilizce/Türkçe içerik
- `favicon.svg`: site simgesi
- `robots.txt`, `sitemap.xml.template`, `_headers`, `.htaccess`: tarama/yayın host yapılandırma taslakları

Bu metinler teknik hazırlık içindir ve işletmeye özel hukuki danışmanlık yerine geçmez. Kişisel veri ve tüketici mevzuatı için son metinleri Çekya'daki işletme bilgileri ve fiilî süreçlerle doğrulayın.

## Kaynaklar

- [Google Ads — Destination requirements](https://support.google.com/adspolicy/answer/16428020?hl=en)
- [EU Your Europe — Online privacy and cookies](https://europa.eu/youreurope/business/growing/digitalising/online-privacy/index_en.htm)
- [Czech ÚOOÚ — Cookies and consent](https://uoou.gov.cz/verejnost/qa-otazky-a-odpovedi/cookies)
- [GDPR Article 13 — information to data subjects](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng)
