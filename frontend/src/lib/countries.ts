// Shared country list for politics markets. Used by the create form (check-boxes),
// the market cards (flags) and the feed country filter. Codes are ISO-3166 alpha-2
// and match what the backend stores in the market metadata `countries` array.
export type Country = { code: string; name: string; flag: string }

export const COUNTRIES: Country[] = [
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸' },
  { code: 'UA', name: 'Ukraine', flag: '🇺🇦' },
  { code: 'RU', name: 'Russia', flag: '🇷🇺' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷' },
  { code: 'CN', name: 'China', flag: '🇨🇳' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵' },
]

const byCode = new Map(COUNTRIES.map((c) => [c.code, c]))
export const flagOf = (code: string) => byCode.get(code)?.flag ?? '🏳️'
export const nameOf = (code: string) => byCode.get(code)?.name ?? code
