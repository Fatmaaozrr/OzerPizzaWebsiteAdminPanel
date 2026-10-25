// Yönetici oturumunu doğrular, canlı siparişleri yükler ve panel değişikliklerini kaydeder.
/* Supabase-backed dashboard and two-step administrator authentication. */
(() => {
  const settings = window.OZER_SUPABASE || {};
  const configured = settings.url && !settings.url.includes('YOUR-PROJECT') &&
    settings.anonKey && !settings.anonKey.includes('YOUR_SUPABASE');

  if (!configured || !window.supabase?.createClient) {
    // Local file previews are intentionally demo-only. Live authentication and
    // order data are enabled only after Supabase is configured on a web host.
    if (location.protocol === 'file:') {
      const banner=document.createElement('div');
      banner.setAttribute('role','status');
      banner.style.cssText='position:fixed;right:16px;bottom:16px;z-index:40;max-width:min(440px,calc(100vw - 32px));padding:13px 16px;border:1px solid #795c24;border-radius:12px;background:#191711;color:#eee7d5;box-shadow:0 12px 35px #0009;font:12px/1.55 system-ui,sans-serif';
      banner.innerHTML='<strong style="color:#ffc04b">Yerel önizleme modu</strong><br>Telefon/şifre + WhatsApp doğrulaması, canlı siparişler ve finans için siteyi HTTPS üzerinden yayınlayıp Supabase bağlantısını kurun.';
      document.body.append(banner);
      return;
    }
    const blocker=document.createElement('div');
    blocker.setAttribute('role','alert');
    blocker.style.cssText='position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:24px;background:#0b0c0ef5;color:#f4f4f1;font:14px/1.6 system-ui,sans-serif;text-align:center';
    blocker.innerHTML='<section style="max-width:520px;padding:28px;border:1px solid #59441f;border-radius:16px;background:#151719"><h1 style="color:#ffc04b;font-size:22px">Yönetim paneli kurulumu gerekli</h1><p>Güvenli telefon ve WhatsApp kodu girişi için Supabase ve OTP servisi yapılandırılmalı.</p><a href="index.html" style="color:#ffc04b">Siteye dön</a></section>';
    document.body.append(blocker);
    return;
  }

  // Supabase istemcisi sipariş veritabanı ve güvenli oturum için kullanılır.
  const client = window.supabase.createClient(settings.url, settings.anonKey);
  window.ozerSupabaseClient = client;
  const notice = document.querySelector('.notice');
  if (notice) notice.innerHTML = '<span class="notice-icon">🔒</span><span><b>GÜVENLİ OTURUM</b> · Panel için telefon, şifre ve WhatsApp doğrulaması gerekir.</span>';

  const gate = document.createElement('div');
  gate.className = 'modal';
  gate.style.zIndex = '50';
  gate.innerHTML = `<section class="modal-box" aria-labelledby="adminLoginTitle"><img src="ozer-pizza-logo.png" alt="Özer Pizza" style="width:min(100%,190px);height:110px;object-fit:contain;display:block;margin:0 auto 8px"><h2 id="adminLoginTitle">Güvenli yönetici girişi</h2><p id="adminLoginHint" style="font-size:11px;color:#9da3a7;line-height:1.6">Telefon numaranız ve şifrenizle giriş yapın. Ardından kayıtlı WhatsApp numaranıza doğrulama kodu gönderilecek.</p><form id="adminLoginForm" class="form"><label>Telefon numarası<input name="phone" type="tel" inputmode="tel" autocomplete="username" placeholder="+420 777 123 456" required></label><label>Şifre<input name="password" type="password" autocomplete="current-password" required></label><p id="adminLoginError" role="alert" style="font-size:10px;color:#ff8d7f;min-height:14px;margin:0"></p><div class="form-actions"><button class="btn primary" id="adminLoginButton" type="submit">Devam et</button></div></form><form id="adminOtpForm" class="form" hidden><label>WhatsApp doğrulama kodu<input name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{4,10}" maxlength="10" placeholder="6 haneli kod" required></label><p id="adminOtpError" role="alert" style="font-size:10px;color:#ff8d7f;min-height:14px;margin:0"></p><div class="form-actions"><button class="btn primary" id="adminOtpButton" type="submit">Kodu doğrula ve giriş yap</button><button class="btn" id="adminOtpResend" type="button">Kodu yeniden gönder</button><button class="btn" id="adminOtpBack" type="button">Geri</button></div></form></section>`;
  document.body.append(gate);

  let refreshTimer;
  let pendingPhone='';
  let pendingPassword='';
  const loginForm=document.getElementById('adminLoginForm');
  const otpForm=document.getElementById('adminOtpForm');
  const loginError=document.getElementById('adminLoginError');
  const otpError=document.getElementById('adminOtpError');
  const normalizePhone=value=>{const raw=String(value||'').trim();return raw.startsWith('+')?'+'+raw.slice(1).replace(/\D/g,''):'+'+raw.replace(/\D/g,'');};
  function showLogin(message=''){
    pendingPhone='';pendingPassword='';loginForm.hidden=false;otpForm.hidden=true;
    document.getElementById('adminLoginHint').textContent='Telefon numaranız ve şifrenizle giriş yapın. Ardından kayıtlı WhatsApp numaranıza doğrulama kodu gönderilecek.';
    loginError.textContent=message;otpError.textContent='';
  }
  function showOtp(message=''){
    loginForm.hidden=true;otpForm.hidden=false;loginError.textContent='';otpError.textContent=message;
    document.getElementById('adminLoginHint').textContent=`${pendingPhone} numarasına WhatsApp doğrulama kodu gönderildi.`;
    otpForm.elements.code.focus();
  }
  async function callOtpFunction(body){
    const {data,error}=await client.functions.invoke('admin-whatsapp-otp',{body});
    if(error)throw error;
    if(data?.error)throw new Error(data.error);
    return data;
  }

  async function loadDeliverySetting(){
    const {data,error}=await client.from('store_settings').select('delivery_enabled').eq('id',true).maybeSingle();
    if(error||!data)throw error||new Error('Delivery setting is unavailable');
    window.syncOzerDeliveryToggle?.(data.delivery_enabled);
  }
  function rowToOrder(row) {
    const escapeHTML = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
    const items = (row.items || []).map(item => ({pizza:escapeHTML(item.name),qty:Number(item.qty),unit:item.unit,price:item.unit === 'whole' ? 320 : 40}));
    return {id:row.order_code,dbId:row.id,customer:escapeHTML(row.customer_name),phone:escapeHTML(row.customer_phone),address:escapeHTML(row.delivery_address),note:escapeHTML(row.customer_note),assignedTo:escapeHTML(row.assigned_to||''),fulfilment:row.fulfilment,items,status:row.status,createdAt:row.created_at};
  }
  async function loadLiveOrders(){
    const {data,error}=await client.from('orders').select('*').order('created_at',{ascending:false});
    if(error)throw error;
    orders=data.map(rowToOrder);liveMode=true;render();
  }
  async function checkAdmin(user){
    if(!user){gate.hidden=false;showLogin();return false;}
    const {data,error}=await client.from('admin_users').select('user_id,phone_e164').eq('user_id',user.id).maybeSingle();
    const authPhone=normalizePhone(user.phone||'');
    if(error||!data?.phone_e164||normalizePhone(data.phone_e164)!==authPhone||!user.phone_confirmed_at){
      await client.auth.signOut();gate.hidden=false;showLogin('Bu hesap için doğrulanmış telefon ve yönetici telefon kaydı bulunamadı.');return false;
    }
    try{
      const factor=await callOtpFunction({action:'status'});
      if(!factor.verified){await client.auth.signOut();gate.hidden=false;showLogin('WhatsApp doğrulaması tamamlanmamış.');return false;}
      await loadLiveOrders();
      await loadDeliverySetting().catch(error=>{console.error(error);showToast('Teslimat ayarı yüklenemedi')});
      gate.hidden=true;window.OZER_ADMIN_LIVE=true;window.dispatchEvent(new Event('ozer-admin-ready'));
      if(!refreshTimer)refreshTimer=setInterval(()=>loadLiveOrders().catch(console.error),30000);
      return true;
    }catch(e){otpError.textContent='Siparişler yüklenemedi. Supabase tablo ve RLS ayarlarını kontrol edin.';console.error(e);gate.hidden=false;return false;}
  }

  client.auth.getSession().then(({data})=>checkAdmin(data.session?.user));
  loginForm.addEventListener('submit',async event=>{
    event.preventDefault();const form=new FormData(event.currentTarget),button=document.getElementById('adminLoginButton');
    button.disabled=true;loginError.textContent='';
    try{
      pendingPhone=normalizePhone(form.get('phone'));pendingPassword=String(form.get('password')||'');
      await callOtpFunction({action:'send',phone:pendingPhone,password:pendingPassword});
      showOtp('WhatsApp doğrulama kodu gönderildi.');
    }catch(e){pendingPassword='';loginError.textContent='Giriş başarısız. Telefon numarası veya şifreyi kontrol edin.';console.error(e)}
    finally{button.disabled=false;}
  });
  otpForm.addEventListener('submit',async event=>{
    event.preventDefault();const button=document.getElementById('adminOtpButton');button.disabled=true;otpError.textContent='';
    try{
      const result=await callOtpFunction({action:'verify',phone:pendingPhone,password:pendingPassword,code:new FormData(otpForm).get('code')});
      if(!result.verified)throw new Error('Verification rejected');
      const {data,error}=await client.auth.setSession(result.session||{});
      if(error||!data.session)throw error||new Error('Supabase session was not created');
      pendingPassword='';await checkAdmin(data.session.user);
    }catch(e){otpError.textContent='Kod geçersiz veya süresi dolmuş. Yeniden deneyin ya da yeni kod isteyin.';console.error(e)}
    finally{button.disabled=false;}
  });
  // Tek kullanımlık doğrulama kodunu yeniden gönderme ve doğrulama adımları.
  document.getElementById('adminOtpResend').addEventListener('click',async event=>{
    const button=event.currentTarget;button.disabled=true;otpError.textContent='';
    try{await callOtpFunction({action:'send',phone:pendingPhone,password:pendingPassword});otpError.textContent='Yeni kod WhatsApp üzerinden gönderildi.';}
    catch(e){otpError.textContent='Kod gönderilemedi. Biraz sonra yeniden deneyin.';console.error(e)}
    finally{button.disabled=false;}
  });
  document.getElementById('adminOtpBack').addEventListener('click',()=>showLogin());

  const logout=document.createElement('button');
  logout.className='btn';logout.textContent='Çıkış';logout.style.position='fixed';logout.style.right='18px';logout.style.bottom='18px';logout.style.zIndex='10';logout.hidden=true;
  logout.onclick=async()=>{try{await callOtpFunction({action:'revoke'});}catch(e){console.error('Could not revoke server admin session',e)}await client.auth.signOut();clearInterval(refreshTimer);refreshTimer=undefined;liveMode=false;window.OZER_ADMIN_LIVE=false;window.dispatchEvent(new Event('ozer-admin-logout'));gate.hidden=false;logout.hidden=true;showLogin();};
  document.body.append(logout);
  client.auth.onAuthStateChange((_event,session)=>{logout.hidden=!session;if(!session){liveMode=false;pendingPhone='';pendingPassword='';window.OZER_ADMIN_LIVE=false;window.dispatchEvent(new Event('ozer-admin-logout'));gate.hidden=false;showLogin();}});

  // Canlı yönetici işlemleri: teslimat anahtarı, sipariş durumu ve personel ataması.
  document.addEventListener('change',async event=>{
    const el=event.target.closest('#deliveryToggle');if(!el||!liveMode)return;event.stopImmediatePropagation();
    const desired=el.checked,previous=!desired;el.disabled=true;
    const {data,error}=await client.from('store_settings').update({delivery_enabled:desired,updated_at:new Date().toISOString()}).eq('id',true).select('delivery_enabled').maybeSingle();
    el.disabled=false;if(error||!data){window.syncOzerDeliveryToggle?.(previous);showToast('Teslimat ayarı kaydedilemedi');console.error(error);return;}
    window.syncOzerDeliveryToggle?.(data.delivery_enabled);showToast(data.delivery_enabled?'Adrese teslim yeniden açıldı':'Siparişler gel al moduna alındı');
  },true);
  // Canlı yönetici işlemleri: teslimat anahtarı, sipariş durumu ve personel ataması.
  document.addEventListener('change',async event=>{
    const el=event.target.closest('.status-select');if(!el||!liveMode)return;event.stopImmediatePropagation();
    const order=orders.find(item=>item.id===el.dataset.id);if(!order)return;
    const {error}=await client.from('orders').update({status:el.value}).eq('id',order.dbId);
    if(error){el.value=order.status;showToast('Durum kaydedilemedi');return;}order.status=el.value;render();showToast('Sipariş durumu güncellendi');
  },true);
  // Canlı yönetici işlemleri: teslimat anahtarı, sipariş durumu ve personel ataması.
  document.addEventListener('change',async event=>{
    const el=event.target.closest('.assignee-input');if(!el||!liveMode)return;event.stopImmediatePropagation();
    const order=orders.find(item=>item.id===el.dataset.id);if(!order)return;
    const assignedTo=el.value.trim();const {error}=await client.from('orders').update({assigned_to:assignedTo}).eq('id',order.dbId);
    if(error){el.value=order.assignedTo||'';showToast('Atama kaydedilemedi');return;}order.assignedTo=assignedTo;render();showToast(assignedTo?'Kurye/personel atandı':'Atama kaldırıldı');
  },true);
  const manual=document.getElementById('manualOrderForm');
  if(manual)manual.addEventListener('submit',async event=>{
    if(!liveMode)return;event.preventDefault();event.stopImmediatePropagation();
    const values=new FormData(manual),qty=Number(values.get('qty')),modal=document.getElementById('orderModal'),pizza=values.get('pizza');
    const {error}=await client.from('orders').insert({order_code:`OZ-${Date.now().toString().slice(-8)}${Math.floor(Math.random()*90+10)}`,customer_name:values.get('customer'),customer_phone:'',fulfilment:'pickup',delivery_address:'',customer_note:'Yönetici tarafından eklendi',items:[{name:pizza,unit:'whole',qty}],total_czk:qty*320,status:values.get('status')});
    if(error){showToast('Sipariş eklenemedi');console.error(error);return;}await loadLiveOrders();modal.hidden=true;manual.reset();showToast('Sipariş eklendi');
  },true);
  document.getElementById('period').addEventListener('change',()=>{if(liveMode)render()});
  window.addEventListener('beforeunload',()=>clearInterval(refreshTimer));
})();
