import type { Comment } from '../types'

// Data for the trading-panel feed item on the two trade pages. The pages are
// near-identical; the per-page bits (author, market title/meta, option labels,
// comments and a few wrapper classNames) live here.
export interface TradeMarket {
  id: string
  author: {
    name: string
    handle: string
    avatar: string
    // the Barcelona logo renders square via an inline
    // `border-radius:0px !important` override
    squareAvatar?: boolean
  }
  date: string
  // The two pages differ slightly — keep exact classes
  wrapperClassName: string
  avatarClassName: string
  innerClassName: string
  headerClassName: string
  metaClassName: string
  title: string
  meta: string
  yesOption: string
  noOption: string
  likes: string
  commentsCount: string
  reposts: string
  comments: Comment[]
}

export const barcelonaTradeMarket: TradeMarket = {
  id: 'el-clasico',
  author: {
    name: 'FC Barcelona',
    handle: '@barcelona',
    avatar: '/img/barcelona.png',
    squareAvatar: true,
  },
  date: '19 Feb',
  wrapperClassName: 'd-md-flex w-full',
  avatarClassName: 'img-fluid rounded-circle user-img mb-3 mb-md-0',
  innerClassName: 'd-flex ms-md-3 align-items-start flex-grow-1',
  headerClassName: 'market-header d-flex flex-column align-items-center',
  metaClassName: 'market-meta mb-0 pt-0',
  title: 'El Clasico – Barcelona vs Real Madrid!',
  meta: '$6M Vol • 23.08.2025 18:00',
  yesOption: 'Barcelona 38¢',
  noOption: 'RealMadrid 63¢',
  likes: '30.4k',
  commentsCount: '4.0k',
  reposts: '617',
  comments: [
    { id: 'c1', author: 'Leo Messi', avatar: '/img/leo.jpg', text: 'I really miss El Clásico.', time: '1h' },
    {
      id: 'c2',
      author: 'FC Atlético de Madrid',
      avatar: '/img/Atletico_Madrid_logo.svg.png',
      text: 'next one with us!! Good luck teams',
      time: '20min',
    },
  ],
}

export const founderTradeMarket: TradeMarket = {
  id: 'ceasefire',
  author: {
    name: 'founder',
    handle: '@founder',
    avatar: '/img/images.jpeg',
  },
  date: '23 Aug',
  wrapperClassName: 'd-md-flex',
  avatarClassName: 'mb-3 mb-md-0 img-fluid rounded-circle user-img',
  innerClassName: 'd-flex ms-md-3 align-items-start w-100',
  headerClassName: 'market-header',
  metaClassName: 'market-meta',
  title: 'Ukraine x Russia ceasefire in 2025?',
  meta: '$14M Vol • 23.08.2025 18:00',
  yesOption: 'Yes 38¢',
  noOption: 'No 63¢',
  likes: '30.4k',
  commentsCount: '4.0k',
  reposts: '617',
  comments: [
    { id: 'c1', author: 'Leo Messi', avatar: '/img/leo.jpg', text: 'peace', time: '1h' },
    {
      id: 'c2',
      author: 'FC Atlético de Madrid',
      avatar: '/img/Atletico_Madrid_logo.svg.png',
      text: 'peace',
      time: '20min',
    },
  ],
}
