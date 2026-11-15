import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import type { User } from 'firebase/auth'
import { uploadPhoto } from './photo-upload'
import { apiRequest } from '../auth/api'
vi.mock('../auth/api', async (original) => ({
  ...(await original<typeof import('../auth/api')>()),
  apiRequest: vi.fn(),
}))
const account = { getIdToken: async () => '' } as unknown as User
const media = { id: 'same-ticket', kind: 'image', width: 600, height: 900, duration: null }
const requests: FakeXHR[] = []
class FakeXHR {
  upload: {
    onprogress:
      | ((event: { lengthComputable: boolean; loaded: number; total: number }) => void)
      | null
  } = { onprogress: null }
  status = 204
  timeout = 0
  withCredentials = true
  body?: FormData
  onload?: () => void
  onerror?: () => void
  onabort?: () => void
  onloadend?: () => void
  open = vi.fn()
  setRequestHeader = vi.fn()
  constructor() {
    requests.push(this)
  }
  send(body: FormData) {
    this.body = body
  }
  abort() {
    this.onabort?.()
    this.onloadend?.()
  }
}
beforeEach(() => {
  requests.length = 0
  vi.mocked(apiRequest).mockReset()
  vi.stubGlobal('XMLHttpRequest', FakeXHR)
})
afterEach(() => vi.unstubAllGlobals())
it('envia o original diretamente sem bearer, informa progresso e recebe a mesma foto ao repetir', async () => {
  const file = new File(['synthetic'], 'foto.jpg', { type: 'image/jpeg' })
  Object.defineProperty(file, 'size', { value: 100000000 })
  vi.mocked(apiRequest).mockImplementation((_u, _path, method) =>
    Promise.resolve(
      method === 'POST' && _path === '/photo-uploads'
        ? {
            id: 'same-ticket',
            completed: false,
            url: 'https://storage.example.test',
            fields: { key: 'private-stage', Policy: 'signed-policy' },
          }
        : media,
    ),
  )
  const progress = vi.fn(),
    controller = new AbortController()
  const pending = uploadPhoto(account, 'club', file, {
    id: 'same-ticket',
    signal: controller.signal,
    onProgress: progress,
  })
  await vi.waitFor(() => expect(requests).toHaveLength(1))
  expect(requests[0].open).toHaveBeenCalledWith('POST', 'https://storage.example.test')
  expect(requests[0].setRequestHeader).not.toHaveBeenCalled()
  expect(requests[0].body?.get('file')).toBe(file)
  requests[0].upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 })
  requests[0].onload?.()
  requests[0].onloadend?.()
  expect(await pending).toEqual(media)
  expect(progress).toHaveBeenLastCalledWith(100)
  vi.mocked(apiRequest).mockResolvedValue({ id: 'same-ticket', completed: true, media })
  expect(
    await uploadPhoto(account, 'club', file, {
      id: 'same-ticket',
      signal: controller.signal,
      onProgress: progress,
    }),
  ).toEqual(media)
  expect(requests).toHaveLength(1)
})
it('cancela a transferência e não finaliza nem cria uma segunda foto', async () => {
  vi.mocked(apiRequest).mockResolvedValue({
    id: 'ticket',
    completed: false,
    url: 'https://storage.example.test',
    fields: { key: 'stage' },
  })
  const controller = new AbortController(),
    pending = uploadPhoto(account, 'club', new File(['x'], 'foto.png', { type: 'image/png' }), {
      id: 'ticket',
      signal: controller.signal,
      onProgress: () => {},
    })
  const failure = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  await vi.waitFor(() => expect(requests).toHaveLength(1))
  controller.abort()
  await failure
  expect(vi.mocked(apiRequest).mock.calls.some((call) => call[1].endsWith('/complete'))).toBe(false)
})
it('retoma a finalização sem reenviar bytes já recebidos pelo armazenamento',async()=>{
 vi.mocked(apiRequest).mockImplementation((_u,path)=>Promise.resolve(path==='/photo-uploads'?{id:'same-ticket',completed:false,uploaded:true}:media))
 expect(await uploadPhoto(account,'club',new File(['x'],'foto.png',{type:'image/png'}),{id:'same-ticket',signal:new AbortController().signal,onProgress:()=>{}})).toEqual(media)
 expect(requests).toHaveLength(0)
 expect(apiRequest).toHaveBeenCalledWith(account,'/photo-uploads/same-ticket/complete','POST',{})
})
