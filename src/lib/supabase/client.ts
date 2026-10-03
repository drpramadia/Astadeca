import { createBrowserClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Browser client berbasis cookie (@supabase/ssr) agar sesi tersimpan di cookie
 * dan dapat dibaca oleh middleware untuk proteksi rute server-side.
 */
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)

/** Factory lama (tetap disediakan untuk kompatibilitas). */
export const createClient = createSupabaseClient
