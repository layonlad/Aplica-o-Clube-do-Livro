export const readingProviders = {
  kindle: {
    id: 'kindle',
    name: 'Amazon Kindle',
    supportsExport: true,
    supportsManualProgress: true,
    supportsAnnotationsImport: true,
    supportsAutomaticSync: false,
    transferUrl: 'https://www.amazon.com/sendtokindle',
    webLimitBytes: 200_000_000,
  },
} as const

export type ReadingProviderId = keyof typeof readingProviders

export const exportPermissions = ['blocked', 'personal', 'public_domain', 'licensed_transfer'] as const
export const exportEvents = ['download_started', 'share_requested'] as const

export interface ExternalProgress {
  bookId: string
  provider: ReadingProviderId
  percentage: number
  chapter: string
  readingDate: string
  observation: string
  source: 'manual'
  includeInSummary: boolean
  revision: number
  updatedAt: string
}

export interface ImportedClipping {
  sourceBook: string
  kind: 'note' | 'highlight'
  location: string
  sourceDate: string
  content: string
}

export const maxClippingsBytes = 256_000
export const maxImportEntries = 100
