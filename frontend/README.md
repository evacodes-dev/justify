# Justify — React app

React migration of the static "Justify" prediction-market site (formerly Bootstrap/jQuery "Vogel" template). The UI is intentionally pixel-identical to the original: all original CSS (Bootstrap 5, `css/style.css`, IcoFont, Material Design Icons, Slick theme) is loaded unchanged from `public/`, and components render the same markup/classes.

## Stack

- **Vite + React 18 + TypeScript** — SPA, no SSR. Chosen deliberately: the upcoming Web3 integrations (embedded wallets, ENS, Uniswap, Chainlink, deposit flows) all rely on browser wallet providers (`window.ethereum`, WalletConnect) which are simplest in a pure client-side app.
- **react-router-dom** — one route per original HTML page.
- **react-bootstrap** — only for JS behaviors (modals, dropdowns, offcanvas, carousel); markup classes match the original Bootstrap 5 CSS.
- **react-slick** — replaces the jQuery Slick slider (same breakpoints as `js/custom.js`).

## Structure

```
src/
  components/
    layout/    AppLayout (3-column shell), Sidebar, RightSidebar, MobileHeader, Footer, UiContext
    feed/      PostCard, PostActions, CommentItem, CommentComposer, AccountSlider, AccountListItem, PostComposerBar
    market/    MarketCard (flippable buy panel — ported from the jQuery flip/payout script), ChanceArc
    modals/    PostModal, SignInModal, LanguageModal, CommentModal, WalletIcons
    common/    VerifiedBadge, FollowButton
  data/        Typed mock data (accounts, posts, markets, trending, ...) — swap for API/chain data later
  hooks/       useTheme (dark/light persisted to localStorage)
  pages/       One component per original page
  types/       Shared domain types (Account, Post, Market, Comment, ...)
```

| Route | Original page |
|---|---|
| `/` | index.html |
| `/market` | market.html |
| `/trade` | trade.html |
| `/trade-founder` | trade_founder.html |
| `/portfolio` | portfolio.html |
| `/profile` | profile.html |
| `/edit-profile` | edit-profile.html |
| `/create` | create.html |
| `/notification` | notification.html |
| `/help` | help.html |
| `*` | 404.html |

## Future Web3 integration (planned, NOT yet wired)

The original static `index.html` (now replaced by this app) carried inline wallet-connect code: MetaMask/Trust via injected provider, Coinbase Wallet SDK, WalletConnect v1, **Base chain 8453**, Infura RPC, plus Google Identity Services. That code was intentionally **not** ported as-is; the planned integration points are:

- `SignInModal` — wallet buttons (`WalletIcons.tsx`) and Google OAuth link are rendered but inert. Wire them to **wagmi + viem** (or Dynamic embedded wallets) behind a `providers/Web3Provider` once integration starts.
- `MarketCard` confirm-order button — currently UI-only; will submit orders (deposit flow / Uniswap / Chainlink-priced markets).
- `src/data/*` — replace mock modules with TanStack Query hooks against the API/chain; component props are already typed for this.

## Run

```bash
npm install
npm run dev     # dev server
npm run build   # type-check + production build
```
