import { useEffect, useState } from 'react'
import { getUser, type PublicUser, type UserMarket } from '../lib/api'

export function useUserProfile(key?: string) {
  const [data, setData] = useState<{ user: PublicUser; markets: UserMarket[] } | null>(null)
  const [loading, setLoading] = useState(!!key)
  const [error, setError] = useState(false)
  useEffect(() => {
    if (!key) { setLoading(false); return }
    setLoading(true); setError(false)
    getUser(key).then(setData).catch(() => setError(true)).finally(() => setLoading(false))
  }, [key])
  return { data, loading, error }
}
