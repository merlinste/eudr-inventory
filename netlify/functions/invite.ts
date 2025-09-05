// netlify/functions/invite.ts
import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL as string
const service = process.env.SUPABASE_SERVICE_ROLE_KEY as string

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }
    const body = JSON.parse(event.body || '{}') as {
      email: string
      password?: string
      role?: 'admin'|'staff'|'partner'
      org_id?: string | null
    }
    if (!body.email) return { statusCode: 400, body: JSON.stringify({ error: 'email required' }) }

    const supa = createClient(url, service)

    // create (password) or invite (no password)
    let userId: string | undefined
    if (body.password) {
      const { data, error } = await supa.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true
      })
      if (error) throw error
      userId = data.user?.id
    } else {
      const { data, error } = await supa.auth.admin.inviteUserByEmail(body.email)
      if (error) throw error
      userId = data.user?.id
    }
    if (!userId) throw new Error('no user id')

    // ensure profile row
    await supa.from('profiles').upsert({
      user_id: userId,
      email: body.email,
      role: body.role ?? 'staff',
      org_id: body.org_id ?? null
    }, { onConflict: 'user_id' })

    return { statusCode: 200, body: JSON.stringify({ ok: true }) }
  } catch (err: any) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || String(err) }) }
  }
}
