import { supabase } from '@/lib/supabase/client'

const BUCKET = 'goods-photos'

/**
 * Upload foto barang ke Supabase Storage (bucket `goods-photos`).
 * Mengembalikan public URL, atau null bila gagal.
 */
export async function uploadGoodsPhoto(
  file: File,
  organizationId: string,
  scope = 'qc'
): Promise<{ url: string | null; error: string | null }> {
  try {
    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg'
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const path = `${organizationId}/${scope}/${safeName}`

    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'image/jpeg',
    })
    if (error) return { url: null, error: error.message }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return { url: data.publicUrl, error: null }
  } catch (e) {
    return { url: null, error: e instanceof Error ? e.message : 'Upload gagal' }
  }
}
