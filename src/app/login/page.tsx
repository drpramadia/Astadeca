'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Snowflake, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!username.trim() || !password.trim()) {
      setError('Username dan password harus diisi.')
      return
    }

    setIsLoading(true)

    try {
      // Step 1: Lookup email from username via RPC
      const { data: lookupData, error: lookupError } = await supabase.rpc(
        'login_with_username',
        { p_username: username.trim() }
      )

      if (lookupError || !lookupData?.success) {
        setError(lookupData?.message || 'Username tidak ditemukan.')
        setIsLoading(false)
        return
      }

      const email = lookupData.email as string

      // Step 2: Sign in with Supabase Auth
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        setError('Password salah. Silakan coba lagi.')
        setIsLoading(false)
        return
      }

      // Step 3: Redirect to dashboard
      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Terjadi kesalahan. Silakan coba lagi.')
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{ backgroundColor: '#0a1520' }}>
      {/* Animated gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute rounded-full blur-3xl opacity-20 animate-pulse"
          style={{
            width: 600,
            height: 600,
            background: 'radial-gradient(circle, #086b76 0%, transparent 70%)',
            top: '-20%',
            left: '-10%',
            animationDuration: '7s',
          }}
        />
        <div
          className="absolute rounded-full blur-3xl opacity-15 animate-pulse"
          style={{
            width: 500,
            height: 500,
            background: 'radial-gradient(circle, #0ea5e9 0%, transparent 70%)',
            bottom: '-15%',
            right: '-5%',
            animationDuration: '9s',
            animationDelay: '2s',
          }}
        />
        <div
          className="absolute rounded-full blur-3xl opacity-10 animate-pulse"
          style={{
            width: 400,
            height: 400,
            background: 'radial-gradient(circle, #f59e0b 0%, transparent 70%)',
            top: '40%',
            left: '60%',
            animationDuration: '11s',
            animationDelay: '4s',
          }}
        />
      </div>

      {/* Login card */}
      <div className="relative z-10 w-full max-w-md px-4">
        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-8 pt-10 pb-6 text-center border-b border-white/5">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl mb-4" style={{ background: 'linear-gradient(135deg, #086b76 0%, #0ea5e9 100%)' }}>
              <Snowflake className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white font-display tracking-tight">
              ASTADECA
            </h1>
            <p className="mt-1 text-sm text-white/50">
              Sistem ERP Cold Storage &amp; Operasional
            </p>
          </div>

          {/* Form */}
          <div className="px-8 py-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Username */}
              <div>
                <label
                  htmlFor="username"
                  className="block text-sm font-medium text-white/70 mb-1.5"
                >
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isLoading}
                  placeholder="Masukkan username"
                  className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-white/70 mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    placeholder="Masukkan password"
                    className="w-full px-4 py-3 pr-11 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isLoading}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-white/40 hover:text-white/70 transition-colors disabled:opacity-50"
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4.5 h-4.5" />
                    ) : (
                      <Eye className="w-4.5 h-4.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-lg font-semibold text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #086b76 0%, #0ea5e9 100%)' }}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <span>Masuk</span>
                )}
              </button>
            </form>
          </div>

          {/* Footer */}
          <div className="px-8 pb-6 text-center">
            <p className="text-xs text-white/30">
              &copy; {new Date().getFullYear()} PT Astadeca. Hak cipta dilindungi.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
