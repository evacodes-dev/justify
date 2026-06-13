// Notification list for the /notification page
export interface NotificationItem {
  id: string
  handle: string
  message: string
  category: string
}

const base: Omit<NotificationItem, 'id'>[] = [
  { handle: '@founder', message: 'Accepted your friends request', category: 'new friend' },
  { handle: '@leo', message: 'liked your market', category: 'like' },
  { handle: '@satoshi', message: 'reposted your post', category: 'repost' },
]

// Repeat the same 3 notifications 4 times (12 rows total)
export const notifications: NotificationItem[] = Array.from({ length: 4 }, (_, round) =>
  base.map((item, i) => ({ ...item, id: `notification-${round * base.length + i + 1}` })),
).flat()
