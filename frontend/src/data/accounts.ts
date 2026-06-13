import type { Account } from '../types'

// "Follow Creators" slider on the Feed page
export const creatorAccounts: Account[] = [
  { id: 'real-madrid', name: 'FC Real Madrid', bio: 'Football club', avatar: '/img/real-madrid_416x416.jpg', verified: true, following: true },
  { id: 'vitalik', name: 'vitalik.eth', bio: 'Enthusiast', avatar: '/img/zVpm_8at_400x400.jpg', verified: true },
  { id: 'leo', name: 'Leo Messi', bio: 'Football player', avatar: '/img/leo.jpg', verified: true },
  { id: 'cobie', name: 'Cobie', bio: 'Influencer', avatar: '/img/zVpm_8at_400x400.jpg', verified: true },
  { id: 'satoshi', name: 'satoshi', bio: 'Bloger', avatar: '/img/download.jpeg', verified: true },
]

// Right sidebar "Who to follow"
export const whoToFollow: Account[] = [
  { id: 'shayne', name: 'Shay Coplan', handle: '@shayne_c', avatar: '/img/1605931037447.jpeg', verified: true, promoted: true },
  { id: 'cobie2', name: 'Cobie', handle: '@cobie', bio: 'Influencer', avatar: '/img/zVpm_8at_400x400.jpg', verified: true },
  { id: 'leo2', name: 'Leo Messi', handle: '@leo', bio: 'Football Player', avatar: '/img/leo.jpg', verified: true },
]

// "People" tab lists on the Feed page
export const peopleYouCanFollow: Account[] = [
  { id: 'webartinfo', name: 'Webartinfo', handle: '@abcdsec', avatar: '/img/rmate5.jpg', verified: true, promoted: true },
  { id: 'johnsmith', name: 'John Smith', handle: '@johnsmith', bio: 'Designer', avatar: '/img/rmate4.jpg', verified: true },
  { id: 'konex', name: 'Konex', handle: '@Konex', bio: 'Artist/Author/Motivational Speaker', avatar: '/img/rmate3.jpg', verified: true },
]

export const popularPeople: Account[] = [
  { id: 'anushuka', name: 'Anushuka Shetty', handle: '@anushuka', avatar: '/img/rmate2.jpg', verified: true, promoted: true },
  { id: 'johnsmith2', name: 'John Smith', handle: '@johnsmith', bio: 'Actress', avatar: '/img/rmate4.jpg', verified: true },
  { id: 'williamsmith', name: 'William Smith', handle: '@williamsmith', bio: 'Motivational Speaker', avatar: '/img/rmate6.jpg', verified: true },
]

export const newsChannels: Account[] = peopleYouCanFollow
export const politicians: Account[] = popularPeople
