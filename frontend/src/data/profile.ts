import type { CSSProperties } from 'react'
import type { Account, Comment, Market, Post } from '../types'
import { elClasicoMarket } from './markets'

// Profile-page post variants the shared PostCard can't express
// (custom market link/thumb style, highlighted repost counter,
// comment-modal triggers, plain composer input).
export interface ProfilePost extends Post {
  compact?: boolean
  marketLink?: string
  marketThumbStyle?: CSSProperties
  imageOpensModal?: boolean
  repostHighlighted?: boolean
  commentsOpenModal?: boolean
  plainComposer?: boolean
}

const founder: Account = {
  id: 'founder',
  name: 'founder',
  handle: '@founder',
  avatar: '/img/images.jpeg',
  verified: true,
}

// Avatar stacks in the profile card
export const followerAvatars = [
  '/img/leo.jpg',
  '/img/barcelona.png',
  '/img/real-madrid_416x416.jpg',
  '/img/vitalik.jpg',
  '/img/1605931037447.jpeg',
]

export const followingAvatars = ['/img/barcelona.png', '/img/leo.jpg', '/img/vitalik.jpg']

export const founderValuationMarket: Market = {
  id: 'founder-2b-valuation',
  title: '$2b valuation in 2 years',
  description: 'Will Justify reach a $2 billion valuation next 2 years?',
  thumb: '/img/2b.jpeg',
  volume: '$6M Vol.',
  endTime: '23.08.2025 18.00',
  chance: 21,
  yesLabel: 'Yes',
  noLabel: 'No',
  yesPrice: 0.21,
  noPrice: 0.8,
}

// "Vogel(2)" tab — first post (custom market card: /trade-founder link + 100px thumb)
export const founderMarketPost: ProfilePost = {
  id: 'founder-2b',
  author: founder,
  date: '23 Aug',
  paragraphs: [
    { html: 'Will Justify reach a $2 billion valuation next 2 years?', className: 'text-white market-header' },
  ],
  market: founderValuationMarket,
  marketLink: '/trade-founder',
  marketThumbStyle: { height: '100px' },
  likes: '30.4k',
  commentsCount: '4.0k',
  reposts: '617',
  comments: [
    { id: 'c1', author: 'Leo Messi', avatar: '/img/leo.jpg', text: 'peace!', time: '1h' },
    { id: 'c2', author: 'FC Atlético de Madrid', avatar: '/img/Atletico_Madrid_logo.svg.png', text: 'peace!', time: '20min' },
  ],
}

// "Vogel(2)" tab — second post (plain text, fits shared PostCard)
export const founderUpdatePost: Post = {
  id: 'founder-social-trading',
  author: founder,
  date: '23 August',
  paragraphs: [{ html: "Justify is the world's first social trading platform!", fontSize: 18 }],
  likes: '2.4k',
  commentsCount: '250',
  reposts: '117',
  comments: [
    { id: 'c1', author: 'Shayne Coplan', avatar: '/img/1605931037447.jpeg', text: "Why do you have social trading and we don't?", time: '1h' },
    { id: 'c2', author: 'Cobie', avatar: '/img/zVpm_8at_400x400.jpg', text: 'trade!', time: '20min' },
    { id: 'c3', author: 'satoshi', avatar: '/img/download.jpeg', text: 'send me btc plsssss..', time: '10min' },
  ],
}

// "Liked" tab — compact (d-flex) layout that keeps the inner w-100 wrapper
export const likedPosts: ProfilePost[] = [
  {
    id: 'liked-barcelona-clasico',
    author: { id: 'barcelona', name: 'FC Barcelona', handle: '@barcelona', avatar: '/img/barcelona.png', verified: true },
    date: '19 Feb',
    compact: true,
    paragraphs: [
      { html: 'El Clasico - Barcelona vs Real Madrid!<br> Who will win?', className: 'text-white market-header' },
    ],
    market: { ...elClasicoMarket, volume: '$14M Vol.' },
    likes: '30.4k',
    commentsCount: '4.0k',
    reposts: '617',
    comments: [
      { id: 'c1', author: 'Leo Messi', avatar: '/img/leo.jpg', text: 'I really miss El Clásico.', time: '1h' },
      { id: 'c2', author: 'FC Atlético de Madrid', avatar: '/img/Atletico_Madrid_logo.svg.png', text: 'next one with us!! Good luck teams', time: '20min' },
    ],
  },
  {
    id: 'liked-vitalik-eth-update',
    author: { id: 'vitalik', name: 'vitalik.eth', handle: '@VitalikButerin', avatar: '/img/vitalik.jpg', verified: true },
    date: '23 August',
    compact: true,
    paragraphs: [
      {
        html: 'Would you like me to launch the next market on the topic of the new ETH network update?<br /><br />Vote with your likes and comments.',
        fontSize: 18,
      },
    ],
    likes: '2.4k',
    commentsCount: '250',
    reposts: '117',
    comments: [
      { id: 'c1', author: 'Shayne Coplan', avatar: '/img/1605931037447.jpeg', text: 'Absolutely not! You promised you would trade on Polymarket!', time: '1h' },
      { id: 'c2', author: 'Cobie', avatar: '/img/zVpm_8at_400x400.jpg', text: "Get started, I'll help with advertising! :)", time: '20min' },
      { id: 'c3', author: 'satoshi', avatar: '/img/download.jpeg', text: 'send me btc plsssss..', time: '10min' },
    ],
  },
]

// Comment thread shared by the Ree-Vogel and Mentions posts
const reactionComments: Comment[] = [
  { id: 'c1', author: 'Macie Bellis', avatar: '/img/rmate1.jpg', text: 'Consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolor.', time: '1h' },
  { id: 'c2', author: 'John Smith', avatar: '/img/rmate3.jpg', text: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.', time: '20min' },
  { id: 'c3', author: 'Shay Jordon', avatar: '/img/rmate2.jpg', text: 'With our vastly improved notifications system, users have more control.', time: '10min' },
]

const hashtagsHtml =
  '<a href="#" class="text-decoration-none text-primary">#SelectricsM12</a> <a href="#" class="text-decoration-none text-primary">#supriuasule</a> <a href="#" class="text-decoration-none text-primary">#support</a>'

// "Ree-Vogel" tab
export const reVogelPosts: ProfilePost[] = [
  {
    id: 'ree-john-smith',
    author: { id: 'johnsmith', name: 'John Smith', handle: '@johnsmith', avatar: '/img/rmate4.jpg', verified: true },
    date: '19 Feb',
    compact: true,
    paragraphs: [
      {
        html: 'Nam malis menandri ea, facete debitis volumus est ut, commune placerat nominati ei sea. Labore alterum probatus no sed, ius ea quas iusto inermis, ex tantas populo nonumes nam. Quo ad verear copiosae gubergren, quis commodo est et. ',
      },
    ],
    image: '/img/post2.png',
    imageOpensModal: true,
    repostHighlighted: true,
    commentsOpenModal: true,
    likes: '30.4k',
    commentsCount: '4.0k',
    reposts: '617',
    comments: reactionComments,
  },
]

// "Mentions" tab
export const mentionPosts: ProfilePost[] = [
  {
    id: 'mention-shay-jordon',
    author: { id: 'shay', name: 'Shay Jordon', handle: '@shay-jordon', avatar: '/img/rmate2.jpg', verified: true },
    date: '19 Feb',
    compact: true,
    repostHighlighted: true,
    commentsOpenModal: true,
    plainComposer: true,
    paragraphs: [
      { html: 'Welcome to the Vogel family 🙂', className: 'mb-3 text-primary' },
      { html: 'Happy Vogel to you!' },
      { html: hashtagsHtml, className: 'mb-2' },
    ],
    likes: '30.4k',
    commentsCount: '4.0k',
    reposts: '617',
    comments: reactionComments,
  },
  {
    id: 'mention-john-smith',
    author: { id: 'johnsmith', name: 'John Smith', handle: '@johnsmith', avatar: '/img/rmate4.jpg', verified: true },
    date: '19 Feb',
    compact: true,
    repostHighlighted: true,
    commentsOpenModal: true,
    paragraphs: [
      {
        html: 'Nam malis menandri ea, facete debitis volumus est ut, commune placerat nominati ei sea. Labore alterum probatus no sed, ius ea quas iusto inermis, ex tantas populo nonumes nam. Quo ad verear copiosae gubergren, quis commodo est et. ',
      },
      { html: hashtagsHtml, className: 'mb-2' },
    ],
    likes: '30.4k',
    commentsCount: '4.0k',
    reposts: '617',
    comments: reactionComments,
  },
]
