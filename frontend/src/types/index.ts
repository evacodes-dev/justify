export interface Account {
  id: string
  name: string
  handle?: string
  avatar: string
  bio?: string
  verified?: boolean
  promoted?: boolean
  following?: boolean
}

export interface Comment {
  id: string
  author: string
  avatar: string
  text: string
  time: string
}

export interface Market {
  id: string
  title: string
  description: string
  thumb: string
  volume: string
  endTime: string
  chance: number
  yesLabel: string
  noLabel: string
  yesPrice: number
  noPrice: number
}

export interface PostParagraph {
  html: string
  className?: string
  fontSize?: number
}

export interface Post {
  id: string
  author: Account
  date: string
  paragraphs?: PostParagraph[]
  image?: string
  market?: Market
  likes: string
  commentsCount: string
  reposts: string
  comments: Comment[]
}

export interface TrendingItem {
  id: string
  author: string
  title: string
  tags: string
  image: string
}
