// src/components/LotFiles.tsx
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Row = { id: string; file_name: string; file_path: string; content_type: string | null; created_at: string };

export default function LotFiles({ lotId, orgId }: { lotId: string; orgId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data, error } = await supabase
      .from('attachments')
      .select('id,file_name,file_path,content_type,created_at')
      .eq('green_lot_id', lotId)
      .order('created_at', { ascending: false });
    if (!error && data) setRows(data as any);
  }
  useEffect(() => { if (lotId) load(); }, [lotId]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    setBusy(true);
    const key = `org/${orgId}/green_lots/${lotId}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
    const up = await supabase.storage.from('attachments').upload(key, file, { contentType: file.type });
    if (up.error) { alert(up.error.message); setBusy(false); return; }

    const ins = await supabase.from('attachments').insert({
      org_id: orgId, green_lot_id: lotId, file_path: key, file_name: file.name, content_type: file.type
    });
    if (ins.error) { alert(ins.error.message); setBusy(false); return; }

    await load();
    setBusy(false);
  }

  async function openFile(row: Row) {
    const { data, error } = await supabase.storage.from('attachments').createSignedUrl(row.file_path, 60);
    if (error || !data?.signedUrl) { alert(error?.message ?? 'Download fehlgeschlagen'); return; }
    window.open(data.signedUrl, '_blank');
  }
  async function remove(row: Row) {
    if (!confirm('Datei wirklich löschen?')) return;
    await supabase.storage.from('attachments').remove([row.file_path]);
    await supabase.from('attachments').delete().eq('id', row.id);
    await load();
  }

  return (
    <div className="border rounded p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Dokumente &amp; Dateien</h3>
        <label className="text-sm">
          <span className="rounded bg-slate-800 text-white px-3 py-2 cursor-pointer">{busy ? 'Lade…' : 'Datei hochladen'}</span>
          <input type="file" className="hidden" onChange={onUpload} disabled={busy} />
        </label>
      </div>
      {rows.length === 0 ? (
        <div className="text-sm text-slate-500">Keine Dateien.</div>
      ) : (
        <ul className="text-sm">
          {rows.map(r => (
            <li key={r.id} className="flex items-center justify-between border-b py-2">
              <div>
                <div className="font-medium">{r.file_name}</div>
                <div className="text-slate-500 text-xs">{new Date(r.created_at).toLocaleString()}</div>
              </div>
              <div className="flex gap-2">
                <button className="text-blue-700 hover:underline" onClick={() => openFile(r)}>Öffnen</button>
                <button className="text-red-600 hover:underline" onClick={() => remove(r)}>Löschen</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
