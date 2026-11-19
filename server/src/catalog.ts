import { OpenLibraryClient, openLibrary, searchWorks } from './literary/open-library.js'
export interface CatalogEntry {
  key: string
  title: string
  author: string
  category: string
  metadata: {
    openLibraryWorkId?: string
    ratingAverage?: number
    ratingCount?: number
    isbn?: string
    publisher?: string
    language?: string
    year?: string
    pages?: number
    source: string
    license: string
    cover?: string
  }
}

const testClients = new WeakMap<typeof fetch, OpenLibraryClient>()

export async function searchCatalog(query: string, request: typeof fetch = fetch): Promise<CatalogEntry[]> {
  let client = request === fetch ? openLibrary : testClients.get(request)
  if (!client) {
    client = new OpenLibraryClient(request)
    testClients.set(request, client)
  }
  return (await searchWorks({ q: query, page: 1, limit: 12 }, client, true)).items
}
