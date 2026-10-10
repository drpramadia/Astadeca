import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Rute publik yang tidak memerlukan login.
 * Catatan: `/api` sengaja TIDAK ada di sini — route handler baru otomatis
 * terlindungi. Route API yang memang publik harus di-whitelist eksplisit.
 */
const PUBLIC_PATHS = ['/login', '/auth', '/_next', '/favicon', '/logo']

function isPublic(pathname: string): boolean {
  if (pathname === '/') return false
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Selalu izinkan aset & halaman publik
  if (isPublic(pathname)) {
    return NextResponse.next()
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
          )
        },
      },
    }
  )

  // Penting: panggil getUser() untuk me-refresh token & menulis cookie
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Belum login -> arahkan ke /login (simpan tujuan)
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  // Sudah login tapi membuka /login atau / -> arahkan ke dashboard
  if (pathname === '/login' || pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Cocokkan semua rute KECUALI:
     * - _next/static, _next/image (aset)
     * - favicon, file gambar publik
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
