import type { Account } from '../types'

// Profile card data for the Portfolio page
export const followerAvatars: string[] = [
  '/img/leo.jpg',
  '/img/barcelona.png',
  '/img/real-madrid_416x416.jpg',
  '/img/vitalik.jpg',
  '/img/1605931037447.jpeg',
]

export const followingAvatars: string[] = [
  '/img/barcelona.png',
  '/img/leo.jpg',
  '/img/vitalik.jpg',
]

// Token position inside the "Your Position" block of a portfolio market card
export interface PortfolioToken {
  name: string
  pnl: string
  pnlClass: 'positive' | 'negative'
  amount: string
  currentPrice: string
  totalValue: string
}

export interface PortfolioMarketInfo {
  title: string
  link: string
  description: string
  thumb: string
  thumbHeight?: number
  volume: string
  endTime: string
  chance: number
}

export interface PortfolioPost {
  id: string
  author: Account
  date: string
  titleHtml: string
  market: PortfolioMarketInfo
  tokens: PortfolioToken[]
  squareAvatar?: boolean
  hasTradeBox?: boolean
}

export const portfolioPosts: PortfolioPost[] = [
  {
    id: 'el-clasico-position',
    author: {
      id: 'barcelona',
      name: 'FC Barcelona',
      handle: '@barcelona',
      avatar: '/img/barcelona.png',
      verified: true,
    },
    date: '19 Feb',
    titleHtml: 'El Clasico - Barcelona vs Real Madrid!<br> Who will win?',
    market: {
      title: 'Barcelona vs Real Madrid',
      link: '/trade',
      description: 'History, blood, and goals — welcome to the most watched 90 minutes in football.',
      thumb: '/img/el-classico.png',
      volume: '$6M Vol.',
      endTime: '23.08.2025 18.00',
      chance: 21,
    },
    tokens: [
      {
        name: 'BARCELONA',
        pnl: '+12.5% ($24.30)',
        pnlClass: 'positive',
        amount: '120',
        currentPrice: '$0.85',
        totalValue: '$102.00',
      },
      {
        name: 'REAL MADRID',
        pnl: '−8.7% (−$13.40)',
        pnlClass: 'negative',
        amount: '80',
        currentPrice: '$0.75',
        totalValue: '$60.00',
      },
    ],
    squareAvatar: true,
    hasTradeBox: true,
  },
  {
    id: 'ceasefire-position',
    author: {
      id: 'founder',
      name: 'founder',
      handle: '@founder',
      avatar: '/img/images.jpeg',
      verified: true,
    },
    date: '23 Aug',
    titleHtml: 'Ukraine x Russia ceasefire in 2025?',
    market: {
      title: 'Ukraine x Russia',
      link: '/trade-founder',
      description: 'Will Ukraine and Russia reach a formal ceasefire agreement before the end of 2025?',
      thumb: '/img/russia-x-ukraine-ceasefire-in-2025-w2voYOygx80B.webp',
      thumbHeight: 100,
      volume: '$6M Vol.',
      endTime: '23.08.2025 18.00',
      chance: 21,
    },
    tokens: [
      {
        name: 'YES',
        pnl: '+224.5% ($240.30)',
        pnlClass: 'positive',
        amount: '120',
        currentPrice: '$0.85',
        totalValue: '$240.00',
      },
      {
        name: 'NO',
        pnl: '0% ($0)',
        pnlClass: 'negative',
        amount: '0',
        currentPrice: '$0',
        totalValue: '$0.00',
      },
    ],
  },
]
