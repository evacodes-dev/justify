// Shared country list for politics markets. Used by the create form (check-boxes),
// the market cards (flags) and the feed country filter. Codes are ISO-3166 alpha-2
// and match what the backend stores in the market metadata `countries` array.
export type Country = { code: string; name: string }

export const COUNTRIES: Country[] = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'RU', name: 'Russia' },
  { code: 'IN', name: 'India' },
  { code: 'BR', name: 'Brazil' },
  { code: 'CN', name: 'China' },
  { code: 'JP', name: 'Japan' },
]

const byCode = new Map(COUNTRIES.map((c) => [c.code, c]))
export const nameOf = (code: string) => byCode.get(code)?.name ?? code
