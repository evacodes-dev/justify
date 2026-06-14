import { useEffect, useState } from 'react'
import type { Account } from '../types'

// Real creators (verified users) from the backend, mapped to the Account UI shape.
export function useCreators() {
  const [creators, setCreators] = useState<Account[]>([])
  useEffect(() => {
    const base = import.meta.env.VITE_API_BASE ?? ''
    fetch(`${base}/api/creators`)
      .then((r) => r.json())
      .then((b) => setCreators(
        (b.creators ?? []).map((c: any) => ({
          id: c.id, name: c.name, handle: c.handle, avatar: c.avatar, bio: c.bio, verified: c.verified,
        })),
      ))
      .catch(() => {})
  }, [])
  return creators
}
