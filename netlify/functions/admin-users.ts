// netlify/functions/admin-users.ts
import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SITE_URL     = process.env.URL || process.env.DEPLOY_PRIME_URL || 'http://localhost:5173';

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

export const handler: Handler = async (event) => {
  try {
    const method = event.httpMethod.toUpperCase();

    if (method === 'POST') {
      // Create or invite user
      const body = JSON.parse(event.body || '{}');
      const { email, password, role = 'staff', org_id = null, invite = true } = body;

      if (!email) return resp(400, { error: 'email required' });

      let userRes;
      if (invite && !password) {
        // Einladung mit Magic Link / Invite
        userRes = await admin.auth.admin.inviteUserByEmail(email, {
          redirectTo: `${SITE_URL}/auth/callback`,
        });
        if (userRes.error) return resp(400, { error: userRes.error.message });
      } else {
        // Benutzer mit Passwort anlegen (autoConfirm)
        userRes = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        if (userRes.error) return resp(400, { error: userRes.error.message });
      }

      const uid = userRes.data.user?.id;
      if (uid) {
        // Profile setzen/aktualisieren
        const db = admin; // service role
        await db.from('profiles').upsert({
          user_id: uid,
          email,
          role,
          org_id,
        }, { onConflict: 'user_id' });
      }

      return resp(200, { ok: true, user_id: userRes.data.user?.id });
    }

    if (method === 'PATCH') {
      // Update role / org
      const body = JSON.parse(event.body || '{}');
      const { user_id, role, org_id } = body;
      if (!user_id) return resp(400, { error: 'user_id required' });
      const { error } = await admin.from('profiles').update({ role, org_id }).eq('user_id', user_id);
      if (error) return resp(400, { error: error.message });
      return resp(200, { ok: true });
    }

    if (method === 'DELETE') {
      const body = JSON.parse(event.body || '{}');
      const { user_id } = body;
      if (!user_id) return resp(400, { error: 'user_id required' });
      const { error } = await admin.auth.admin.deleteUser(user_id);
      if (error) return resp(400, { error: error.message });
      return resp(200, { ok: true });
    }

    return resp(405, { error: 'method not allowed' });
  } catch (e: any) {
    return resp(500, { error: e.message || String(e) });
  }
};

function resp(status: number, body: any) {
  return { statusCode: status, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } };
}
