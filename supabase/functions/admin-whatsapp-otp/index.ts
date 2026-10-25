const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function sessionIdFromJwt(token: string): string | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
    return typeof payload.session_id === 'string' ? payload.session_id : null;
  } catch {
    return null;
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const verifyServiceSid = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !accountSid || !authToken || !verifyServiceSid) {
    return json({ error: 'OTP service is not configured' }, 503);
  }

  async function authorizePassword(phone: string, password: string) {
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password }),
    });
    if (!response.ok) return null;
    const session = await response.json();
    const user = session?.user;
    if (!user?.id || user.phone !== phone || !user.phone_confirmed_at || !session.access_token || !session.refresh_token) return null;

    const adminUrl = new URL(`${supabaseUrl}/rest/v1/admin_users`);
    adminUrl.searchParams.set('select', 'user_id,phone_e164');
    adminUrl.searchParams.set('user_id', `eq.${user.id}`);
    const adminResponse = await fetch(adminUrl, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    });
    if (!adminResponse.ok) throw new Error('Could not check admin allowlist');
    const [admin] = await adminResponse.json();
    if (!admin?.phone_e164 || admin.phone_e164 !== phone || admin.user_id !== user.id) return null;
    return { session, user };
  }

  async function twilioVerify(action: 'send' | 'verify', phone: string, code?: string) {
    const form = new URLSearchParams({ To: `whatsapp:${phone}` });
    if (action === 'send') form.set('Channel', 'whatsapp');
    else if (code) form.set('Code', code);
    const endpoint = action === 'send' ? 'Verifications' : 'VerificationCheck';
    const response = await fetch(`https://verify.twilio.com/v2/Services/${verifyServiceSid}/${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });
    const result = await response.json();
    if (!response.ok) {
      console.error('Twilio Verify request failed', response.status, result?.code);
      throw new Error('WhatsApp verification request failed');
    }
    return result.status;
  }

  try {
    const body = await request.json();
    const action = body?.action;

    // Confirm that this exact Auth session passed the second-factor step, or
    // revoke its server-side grant before signing out.
    if (action === 'status' || action === 'revoke') {
      const bearer = request.headers.get('Authorization') || '';
      const token = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
      const response = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: bearer } });
      if (!token || !response.ok) return json({ error: 'Unauthorized' }, 401);
      const user = await response.json();
      const sessionId = sessionIdFromJwt(token);
      if (!sessionId || !user?.id) return json({ error: 'Unauthorized' }, 401);
      const adminUrl = new URL(`${supabaseUrl}/rest/v1/admin_users`);
      adminUrl.searchParams.set('select', 'user_id,phone_e164');
      adminUrl.searchParams.set('user_id', `eq.${user.id}`);
      const adminResponse = await fetch(adminUrl, { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } });
      const [admin] = adminResponse.ok ? await adminResponse.json() : [];
      if (!admin?.phone_e164 || admin.phone_e164 !== user.phone) return json({ error: 'Unauthorized' }, 401);
      if (action === 'status') {
        const statusUrl = new URL(`${supabaseUrl}/rest/v1/verified_admin_sessions`);
        statusUrl.searchParams.set('select', 'session_id');
        statusUrl.searchParams.set('session_id', `eq.${sessionId}`);
        statusUrl.searchParams.set('user_id', `eq.${user.id}`);
        statusUrl.searchParams.set('expires_at', `gt.${new Date().toISOString()}`);
        const statusResponse = await fetch(statusUrl, { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } });
        const [verified] = statusResponse.ok ? await statusResponse.json() : [];
        return json({ verified: Boolean(verified) });
      }
      const deleteUrl = new URL(`${supabaseUrl}/rest/v1/verified_admin_sessions`);
      deleteUrl.searchParams.set('session_id', `eq.${sessionId}`);
      deleteUrl.searchParams.set('user_id', `eq.${user.id}`);
      const deleted = await fetch(deleteUrl, { method: 'DELETE', headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } });
      if (!deleted.ok) throw new Error('Could not revoke verified session');
      return json({ revoked: true });
    }

    if (action !== 'send' && action !== 'verify') return json({ error: 'Invalid request' }, 400);
    const phone = String(body?.phone || '').trim();
    const password = String(body?.password || '');
    if (!/^\+[1-9]\d{7,14}$/.test(phone) || password.length < 1) return json({ error: 'Invalid credentials' }, 401);

    // Check credentials and the server-side admin phone allowlist before any
    // OTP is sent. The Supabase Auth session is not returned until OTP passes.
    const authorized = await authorizePassword(phone, password);
    if (!authorized) return json({ error: 'Invalid credentials' }, 401);

    if (action === 'send') {
      const status = await twilioVerify('send', phone);
      return status === 'pending' ? json({ sent: true }) : json({ error: 'Could not send code' }, 502);
    }

    const code = String(body?.code || '').trim();
    if (!/^\d{4,10}$/.test(code)) return json({ error: 'Invalid code' }, 400);
    const status = await twilioVerify('verify', phone, code);
    if (status !== 'approved') return json({ verified: false }, 200);

    // Re-check credentials after consuming the code, then grant this exact
    // Supabase session access through an RLS-checked session record.
    const confirmed = await authorizePassword(phone, password);
    if (!confirmed) return json({ error: 'Invalid credentials' }, 401);
    const sessionId = sessionIdFromJwt(confirmed.session.access_token);
    if (!sessionId) throw new Error('Supabase session ID is missing');
    const grant = await fetch(`${supabaseUrl}/rest/v1/verified_admin_sessions`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ session_id: sessionId, user_id: confirmed.user.id, expires_at: new Date(Date.now() + 14 * 86400000).toISOString() }),
    });
    if (!grant.ok) throw new Error('Could not grant verified admin session');

    return json({ verified: true, session: {
      access_token: confirmed.session.access_token,
      refresh_token: confirmed.session.refresh_token,
      expires_in: confirmed.session.expires_in,
      expires_at: confirmed.session.expires_at,
      token_type: confirmed.session.token_type,
      user: confirmed.user,
    } });
  } catch (error) {
    console.error('Admin WhatsApp OTP error', error);
    return json({ error: 'OTP request failed' }, 500);
  }
});
