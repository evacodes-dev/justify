import { getAuthToken } from '@dynamic-labs/sdk-react-core'

// Auth = Dynamic session JWT. The user logs in once with Dynamic; getAuthToken() returns
// the signed JWT which we attach as x-auth-token on identity writes. The backend verifies
// it against Dynamic's JWKS and reads the wallet address from it. No message-signing popup.
export function authHeaders(): Record<string, string> {
  const t = getAuthToken()
  return t ? { 'x-auth-token': t } : {}
}
