import { useLocation } from 'react-router-dom'

// The two trading-panel pages are the only routes that widen the shell: a
// `container-fluid page-container` (80% fluid) wrapper instead of the standard
// `.container`, a `col-xxl-8` main column, and `col-xxl-2` side columns (vs. the
// usual `col-xl-3`). Without the
// `col-xxl-2` asides the row becomes 8 + 3 + 3 = 14 columns at the xxl
// breakpoint and the right sidebar wraps below the main column. Centralised
// here so the container and both sidebars stay in agreement.
export const WIDE_LAYOUT_ROUTES = ['/trade', '/trade-founder']

export function useWideLayout(): boolean {
  const { pathname } = useLocation()
  // Prefix match so the live trade route (/trade/m/:id) widens the shell too.
  return WIDE_LAYOUT_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))
}
