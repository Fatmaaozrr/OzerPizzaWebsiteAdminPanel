// Sipariş formunu Supabase veritabanına gönderir ve teslimat ayarını güncel tutar.
/* Saves customer checkout submissions to Supabase when project settings exist. */
(() => {
  const settings = window.OZER_SUPABASE || {};
  const configured = settings.url && !settings.url.includes('YOUR-PROJECT') &&
    settings.anonKey && !settings.anonKey.includes('YOUR_SUPABASE');
  window.OZER_DELIVERY_ENABLED = configured ? false : true;
  if (!configured || !window.supabase?.createClient) return;

  // İstemci, müşteri sipariş formundan güvenli veritabanı isteği oluşturur.
  const client = window.supabase.createClient(settings.url, settings.anonKey);
  window.ozerSupabaseClient = client;
  const refreshDeliverySetting=()=>client.from('store_settings').select('delivery_enabled').eq('id',true).maybeSingle().then(({data,error})=>{const enabled=!error&&data?.delivery_enabled===true;window.OZER_DELIVERY_ENABLED=enabled;window.applyOzerDeliveryStatus?.(enabled);}).catch(()=>{window.OZER_DELIVERY_ENABLED=false;window.applyOzerDeliveryStatus?.(false)});refreshDeliverySetting();window.setInterval(refreshDeliverySetting,30000);
  const form = document.getElementById('checkoutForm');
  if (!form) return;

  // Form gönderiminde siparişi doğrula, veritabanına yaz ve sonucu kullanıcıya bildir.
  form.addEventListener('submit', async event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const status = document.getElementById('orderStatus');
    const submitters = form.querySelectorAll('button[type="submit"]');
    submitters.forEach(button => button.disabled = true);
    try {
      const values = new FormData(form);
      const items = cart.map(item => ({name:item.name, unit:'whole', qty:item.qty}));
      const code = `OZ-${Date.now().toString().slice(-8)}${Math.floor(Math.random()*90+10)}`;
      const total = cart.reduce((sum,item) => sum + item.qty * item.price, 0);
      const {error} = await client.from('orders').insert({
        order_code:code,
        customer_name:values.get('customerName'),
        customer_phone:values.get('customerPhone'),
        fulfilment:values.get('orderType'),
        delivery_address:values.get('customerAddress') || '',
        delivery_lat:values.get('deliveryLat') ? Number(values.get('deliveryLat')) : null,
        delivery_lng:values.get('deliveryLng') ? Number(values.get('deliveryLng')) : null,
        customer_note:values.get('customerNote') || '',
        items,
        total_czk:total,
        status:'new'
      });
      if (error) throw error;
      const lang = document.documentElement.lang;
      status.textContent = lang === 'tr'
        ? `Siparişiniz alındı: ${code}. İşletme iletişim bilgileri eklenmediği için WhatsApp/e-posta bildirimi gönderilmedi.`
        : lang === 'en'
          ? `Order received: ${code}. WhatsApp/email notification was not sent because restaurant contact details are not configured.`
          : `Objednávka přijata: ${code}. Oznámení přes WhatsApp/e-mail nebylo odesláno, protože kontaktní údaje restaurace nejsou nastaveny.`;
      cart = [];
      updateCart();
      form.reset();
    } catch (error) {
      console.error('Order submission failed:', error);
      status.textContent = document.documentElement.lang === 'tr'
        ? 'Sipariş kaydedilemedi. Lütfen daha sonra tekrar deneyin.'
        : document.documentElement.lang === 'en'
          ? 'We could not save the order. Please try again.'
          : 'Objednávku se nepodařilo uložit. Zkuste to prosím znovu.';
    } finally {
      submitters.forEach(button => button.disabled = false);
    }
  }, true);
})();
