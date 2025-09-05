// netlify/functions/lot-files.ts
import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function json(status: number, body: any) {
  return { statusCode: status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

export const handler: Handler = async (event) => {
  try {
    const method = event.httpMethod.toUpperCase();

    if (method === 'POST') {
      // 1) Upload-URL erzeugen
      const { org_id, lot_id, filename } = JSON.parse(event.body || '{}');
      if (!org_id || !lot_id || !filename) return json(400, { error: 'org_id, lot_id, filename required' });
      const safe = String(filename).replace(/[^\w.\-]+/g, '_');
      const path = `org/${org_id}/green_lots/${lot_id}/${Date.now()}_${safe}`;
      const { data, error } = await admin.storage.from('attachments').createSignedUploadUrl(path);
      if (error || !data?.signedUrl) return json(400, { error: error?.message || 'cannot create signed upload url' });

      // token extrahieren (für uploadToSignedUrl)
      let token: string | null = null;
      try { token = new URL(data.signedUrl).searchParams.get('token'); } catch {}
      return json(200, { path, signedUrl: data.signedUrl, token });
    }

    if (method === 'GET') {
      // 2) Download-URL
      const path = event.queryStringParameters?.path;
      if (!path) return json(400, { error: 'path required' });
      const { data, error } = await admin.storage.from('attachments').createSignedUrl(path, 60);
      if (error || !data?.signedUrl) return json(400, { error: error?.message || 'cannot create signed url' });
      return json(200, { url: data.signedUrl });
    }

    if (method === 'PATCH') {
      // 3) Metadaten in DB speichern
      const { org_id, lot_id, path, file_name, content_type } = JSON.parse(event.body || '{}');
      if (!org_id || !lot_id || !path || !file_name) return json(400, { error: 'org_id, lot_id, path, file_name required' });
      const { error } = await admin.from('attachments').insert({
        org_id, green_lot_id: lot_id, file_path: path, file_name, content_type: content_type ?? null
      });
      if (error) return json(400, { error: error.message });
      return json(200, { ok: true });
    }

    if (method === 'DELETE') {
      // 4) Datei + optional Metadatensatz löschen
      const { id, path } = JSON.parse(event.body || '{}');
      if (!path) return json(400, { error: 'path required' });
      await admin.storage.from('attachments').remove([path]);
      if (id) await admin.from('attachments').delete().eq('id', id);
      return json(200, { ok: true });
    }

    return json(405, { error: 'method not allowed' });
  } catch (e: any) {
    return json(500, { error: e?.message || String(e) });
  }
};
