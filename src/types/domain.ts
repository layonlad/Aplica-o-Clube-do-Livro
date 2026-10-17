export type MemberRole = 'owner' | 'admin' | 'member'

export interface Book {
  id: string
  title: string
  author: string
  category: string
  pages: number
  progress?: number
  rating?: number
  cover: { from: string; to: string; mark: string }
  status: 'reading' | 'finished' | 'available'
}

export interface ClubEvent {
  id: string
  day: string
  month: string
  fullDate: string
  time: string
  title: string
  location: string
  attendees: number
  rsvp: 'yes' | 'maybe' | 'no' | null
  photos: number
}

export interface ForumTopic {
  id: string
  author: string
  initials: string
  title: string
  excerpt: string
  comments: number
  reactions: number
  age: string
  spoiler: boolean
  tag: string
}

export interface Member {
  id: string
  name: string
  initials: string
  role: MemberRole
  booksRead: number
  status: 'active' | 'invited'
}

export interface ThemeTokens {
  primary: string
  accent: string
  surface: string
  font: 'humanist' | 'editorial' | 'modern'
  mode: 'light' | 'dark'
  clubName: string
  monogram: string
  radius: 'soft' | 'round' | 'square'
}
