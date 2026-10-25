# Özer Pizza: Supabase bağlantısı

Bu site statik HTML olarak çalışır. Gerçek siparişlerin cihazlar arasında görünmesi için Supabase projesi gerekir. Bağlantı henüz etkin değil; ayarlar dosyasında bilerek örnek değerler bulunuyor.

## Kurulum

1. Supabase’te bir proje oluşturun.
2. `supabase-setup.sql` dosyasının tamamını Supabase **SQL Editor** içinde çalıştırın.
3. **Project Settings → API** bölümünden Project URL ve publishable/anon key değerlerini alın. `supabase-config.js` içindeki `url` ve `anonKey` alanlarına yazın. `service_role` anahtarını hiçbir zaman bu dosyaya eklemeyin.
4. **Authentication → Providers** bölümünde Phone girişini açın. Yönetici kullanıcısını doğrulanmış E.164 biçimli telefon numarasıyla (ülke koduyla, ör. `+420...`) ve güçlü bir şifreyle oluşturun.
5. `supabase-setup.sql` dosyasını SQL Editor'de tekrar çalıştırın. Bu güncelleme `admin_users.phone_e164` ve WhatsApp koduyla doğrulanan oturum kayıtlarını ekler; sipariş ve finans tablolarının RLS kurallarını doğrulanmış ikinci faktör gerektirecek şekilde yeniler.
6. Yönetici Auth kullanıcısının UUID'si ve Auth'taki telefon numarasıyla SQL Editor'de şu komutu çalıştırın:

   ```sql
   insert into public.admin_users (user_id, phone_e164)
   values ('AUTH-USER-UUID-HERE', '+420777123456')
   on conflict (user_id) do update set phone_e164 = excluded.phone_e164;
   ```

7. Twilio'da Verify Service oluşturun ve bu servis için kendi WhatsApp Business gönderici numaranızı ayarlayın. Verify WhatsApp için onaylı/bağlı gönderici numarası gerekir.
8. Supabase CLI ile projeye bağlanıp Edge Function sırlarını Supabase'e ekleyin; değerleri hiçbir tarayıcı dosyasına yazmayın:

   ```sh
   supabase secrets set SUPABASE_ANON_KEY="SUPABASE_ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="SERVICE_ROLE_KEY" TWILIO_ACCOUNT_SID="AC..." TWILIO_AUTH_TOKEN="..." TWILIO_VERIFY_SERVICE_SID="VA..."
   supabase functions deploy admin-whatsapp-otp
   ```

   `service_role` ve Twilio kimlik bilgileri yalnızca Supabase Function secrets içinde kalmalıdır. `supabase/config.toml`, OTP işlevinin kendi parola doğrulamasını yapması için JWT zorunluluğunu kapatır; işlev, WhatsApp OTP başarılı olmadan Auth oturumunu tarayıcıya vermez.
9. `index.html`, `admin.html`, `supabase-config.js`, `supabase-orders.js`, `admin-supabase.js`, `admin-finance.js`, `social-links.js` dosyalarını web dizinine yükleyin. `supabase/` klasörünü CLI ile deploy edin. Siteyi `file://` yerine HTTPS üzerinden açın.
10. Yönetim panelindeki aylık finans kayıtları `monthly_finances` tablosunda; “Adrese teslim” anahtarı `store_settings` tablosunda tutulur. Anahtar kapalıyken site yalnızca gel-al siparişi alır; veritabanı da teslimat siparişlerini reddeder.
11. Müşteri siparişleri ana sayfadaki sepetten `orders` tablosuna yazılır. Adrese teslim için müşteri HTTPS üzerinden konumunu doğrular; restoran merkezi Nákladní 471/32, Opava alınarak 5 km dairesi hem tarayıcıda hem veritabanında kontrol edilir. Restorandan teslim alma seçeneğinde konum kontrolü aranmaz. Yönetim panelini `admin.html` adresinden açın; önce telefon/şifre, sonra WhatsApp koduyla doğrulayın.

## Fiyat ve sipariş bildirimi

Menü yalnızca 42 cm bütün pizza siparişi alır; veritabanı sipariş fiyatını 320 Kč olarak hesaplar. Fiyat değişirse menü ve `validate_ozer_order()` SQL fonksiyonunu birlikte güncelleyin.

Siparişler veritabanına kaydedilir. WhatsApp ve e-posta adresleri henüz boş olduğu için işletmeye otomatik bildirim gönderilmez; müşteri sipariş numarasını görür ve kayıt yönetim panelinde belirir. İşletme iletişim bilgileri eklendiğinde bildirim akışı ayrıca tamamlanmalıdır.

## Güvenlik notu

Tarayıcıya yalnızca publishable/anon key konur. Yönetici sipariş ve finans erişimi, `verified_admin_sessions` kaydındaki Supabase oturum kimliği ve WhatsApp OTP doğrulamasına bağlı RLS fonksiyonuyla korunur. Doğrudan telefon/şifre ile alınmış, OTP işlevinden geçmemiş Supabase oturumu yönetim tablolarını okuyamaz veya değiştiremez. Twilio Verify kendi gönderim sınırlarını uygular; canlıya almadan önce Twilio Verify servisinde ülke/numara sınırlarını ve kullanım uyarılarını yapılandırın.

### WhatsApp OTP akışı

`supabase/functions/admin-whatsapp-otp/index.ts` önce telefon/şifreyi Supabase Auth üzerinden doğrular ve yalnızca `admin_users.phone_e164` ile eşleşen yöneticiye kod gönderir. OTP doğrulanınca Supabase oturumunu oluşturup `verified_admin_sessions` tablosuna oturum izni yazar. Sipariş ve finans RLS politikaları bu izni arar. Çıkışta izin kaydı iptal edilir; kayıt en geç 14 gün sonra da geçersiz olur.
