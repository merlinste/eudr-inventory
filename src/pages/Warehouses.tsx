import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type W = { id: string; name: string; w_type: 'in_transit'|'port'|'production'|'finished'|'delivered' }
const TYPES = [
  { value:'in_transit', label:'Unterwegs/Verschifft' },
  { value:'port', label:'Hafen' },
  { value:'production', label:'Lager Produktion' },
  { value:'finished', label:'Fertigwarenlager' },
  { value:'delivered', label:'Ausgeliefert' },
]

export default function Warehouses() {
  const [rows, setRows] = useState<W[]>([])
  const [form, setForm] = useState({ name:'', w_type:'production' as W['w_type'] })
  const [err, setErr] = useState<string|null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true); setErr(null)
    const res = await supabase.from('v_my_warehouses').select('id,name,w_type').order('name')
    if (res.error) setErr(res.error.message)
    setRows((res.data ?? []) as W[])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function create() {
    setErr(null)
    try {
      const prof = await supabase.from('profiles').select('org_id').maybeSingle()
      if (prof.error) throw prof.error
      if (!prof.data?.org_id) throw new Error('Keine Org gefunden.')
      const { error } = await supabase.from('warehouses').insert([{
        org_id: prof.data.org_id,
        name: form.name.trim(),
        w_type: form.w_type
      }])
      if (error) throw error
      setForm({ name:'', w_type:'production' }); await load()
    } catch (e:any) { setErr(e.message ?? String(e)) }
  }

  async function saveRow(w: W) {
    setErr(null)
    const { error } = await supabase.from('warehouses').update({ name: w.name, w_type: w.w_type }).eq('id', w.id)
    if (error) setErr(error.message)
  }

  if (loading) return <div>Lade…</div>

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Läger verwalten</h2>

      <div className="border rounded p-4 space-y-3">
        <div className="grid grid-cols-3 gap-3 text-sm">
          <label className="col-span-2">Name
            <input className="border rounded px-3 py-2 w-full" value={form.name}
              onChange={e=>setForm({...form, name:e.target.value})}/>
          </label>
          <label>Typ
            <select className="border rounded px-3 py-2 w-full" value={form.w_type}
              onChange={e=>setForm({...form, w_type: e.target.value as W['w_type']})}>
              {TYPES.map(t=> <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
        </div>
        <div className="text-right">
          <button className="rounded bg-slate-800 text-white text-sm px-3 py-2" onClick={create} disabled={!form.name.trim()}>
            Lager anlegen
          </button>
        </div>
        {err && <div className="text-red-600 text-sm">{err}</div>}
      </div>

      <div className="border rounded">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">Typ</th>
              <th className="text-left p-2">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r,idx)=>(
              <tr key={r.id} className="border-t">
                <td className="p-2">
                  <input className="border rounded px-2 py-1 w-full"
                         value={r.name}
                         onChange={e=>{
                           const copy = [...rows]; copy[idx] = { ...r, name: e.target.value }; setRows(copy)
                         }}/>
                </td>
                <td className="p-2">
                  <select className="border rounded px-2 py-1"
                          value={r.w_type}
                          onChange={e=>{
                            const copy = [...rows]; copy[idx] = { ...r, w_type: e.target.value as W['w_type'] }; setRows(copy)
                          }}>
                    {TYPES.map(t=> <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </td>
                <td className="p-2">
                  <button className="rounded px-2 py-1 bg-slate-200" onClick={()=>saveRow(rows[idx])}>Speichern</button>
                </td>
              </tr>
            ))}
            {rows.length===0 && <tr><td className="p-2" colSpan={3}>Noch keine Läger.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
