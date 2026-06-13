import type { Post } from '../types'
import { elClasicoMarket } from './markets'

export const feedPosts: Post[] = [
  {
    id: 'barcelona-clasico',
    author: { id: 'barcelona', name: 'FC Barcelona', handle: '@barcelona', avatar: '/img/barcelona.png', verified: true },
    date: '19 Feb',
    paragraphs: [
      { html: 'El Clasico - Barcelona vs Real Madrid!<br> Who will win?', className: 'text-white market-header' },
    ],
    market: elClasicoMarket,
    likes: '30.4k',
    commentsCount: '4.0k',
    reposts: '617',
    comments: [
      { id: 'c1', author: 'Leo Messi', avatar: '/img/leo.jpg', text: 'I really miss El Clásico.', time: '1h' },
      { id: 'c2', author: 'FC Atlético de Madrid', avatar: '/img/Atletico_Madrid_logo.svg.png', text: 'next one with us!! Good luck teams', time: '20min' },
    ],
  },
  {
    id: 'vitalik-eth-update',
    author: { id: 'vitalik', name: 'vitalik.eth', handle: '@VitalikButerin', avatar: '/img/vitalik.jpg', verified: true },
    date: '23 August',
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

export const trendingPosts: Post[] = [
  {
    id: 'shay-trending',
    author: { id: 'shay', name: 'Shay Jordon', handle: '@shay-jordon', avatar: '/img/rmate1.jpg', verified: true },
    date: '19 Feb',
    paragraphs: [
      {
        html: 'Congue aliquam scripserit eam ex, vis ad prompta mnesarchum, ad atqui suscipit vel. Omnis soluta ut mel, eum consequat adversarium definitionem ei. Sit cu elit laboramus similique, error exerci tacimates nam eu. Ferri eirmod latine ex sit. Cu nec munere viderer. Vix inermis periculis abhorreant te. Augue homero prompta eum eu, no est discere commune, velit mentitum vis ne. 🙂',
      },
      { html: 'Happy Vogel to you!', className: 'text-white' },
    ],
    image: '/img/post1.png',
    likes: '30.4k',
    commentsCount: '4.0k',
    reposts: '617',
    comments: [
      { id: 'c1', author: 'Leo Messi', avatar: '/img/leo.jpg', text: 'I really miss El Clásico....', time: '1h' },
      { id: 'c2', author: 'John Smith', avatar: '/img/rmate3.jpg', text: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.', time: '20min' },
      { id: 'c3', author: 'Shay Jordon', avatar: '/img/rmate2.jpg', text: 'With our vastly improved notifications system, users have more control.', time: '10min' },
    ],
  },
  {
    id: 'john-trending',
    author: { id: 'johnsmith', name: 'John Smith', handle: '@johnsmith', avatar: '/img/rmate4.jpg', verified: true },
    date: '19 Feb',
    paragraphs: [
      {
        html: 'Nam malis menandri ea, facete debitis volumus est ut, commune placerat nominati ei sea. Labore alterum probatus no sed, ius ea quas iusto inermis, ex tantas populo nonumes nam. Quo ad verear copiosae gubergren, quis commodo est et. ',
      },
    ],
    image: '/img/post2.png',
    likes: '30.4k',
    commentsCount: '4.0k',
    reposts: '617',
    comments: [
      { id: 'c1', author: 'Macie Bellis', avatar: '/img/rmate1.jpg', text: 'Consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolor.', time: '1h' },
      { id: 'c2', author: 'John Smith', avatar: '/img/rmate3.jpg', text: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.', time: '20min' },
      { id: 'c3', author: 'Shay Jordon', avatar: '/img/rmate2.jpg', text: 'With our vastly improved notifications system, users have more control.', time: '10min' },
    ],
  },
]
