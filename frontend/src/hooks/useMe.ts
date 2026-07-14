import { useEffect, useState } from 'react'
import { useWallet } from './useWallet'
import { getMe } from '../lib/api'

export interface Me { name: string; address: string; bio?: string; avatar?: string; verified: boolean; creator?: boolean }

// The connected wallet's own account record (name, verified, creator role).
// Used to gate creator-only UI (e.g. the Create Market nav item + page).
export function useMe() {
  const { address } = useWallet()
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!address) { setMe(null); return }
    setLoading(true)
    getMe(address)
      .then((b) => setMe(b.user))
      .catch(() => setMe(null))
      .finally(() => setLoading(false))
  }, [address])
  return { me, loading, isCreator: !!me?.creator }
}
