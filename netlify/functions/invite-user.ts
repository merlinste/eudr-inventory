import { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,          // gleiche URL
  process.env.SUPABASE_SERVICE_ROLE_KEY!   // Netlify Secret (service_role)
)

export const handler: Handler = async (evt) => {
  try {
    const { email, password } = JSON.parse(evt.body || '{}')
    // Entweder direkt anlegen...
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true
    })
    if (error) throw error
    // ...und evtl. gleich ein Profil anlegen:
    // await supabaseAdmin.from('profiles').insert({ user_id: data.user!.id, role: 'user' })

    return { statusCode: 200, body: JSON.stringify({ ok: true }) }
  } catch (e:any) {
    return { statusCode: 400, body: JSON.stringify({ error: e.message ?? String(e) }) }
  }
}
