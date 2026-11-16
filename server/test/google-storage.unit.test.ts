import { beforeEach, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const transport = vi.hoisted(() => ({ bucket: vi.fn(), file: vi.fn() }))
vi.mock('@google-cloud/storage', () => ({
  Storage: class {
    bucket = transport.bucket
  },
}))
import { createPrivateStorage } from '../src/private-storage.js'
const client = () =>
  createPrivateStorage({ MEDIA_BUCKET: 'private-fixture', MEDIA_PROVIDER: 'gcs' })!
beforeEach(() => {
  vi.clearAllMocks()
  transport.bucket.mockReturnValue({ file: transport.file })
})
it('assina somente a chave, tipo e tamanho autorizados, sem chave de serviço ou ACL pública', async () => {
  const sign = vi
    .fn()
    .mockResolvedValue([
      { url: 'https://storage.googleapis.com/private-fixture', fields: { key: 'staged/photo' } },
    ])
  transport.file.mockReturnValue({ generateSignedPostPolicyV4: sign })
  const storage = client(),
    before = Date.now()
  expect(await storage.preparePhotoUpload!('staged/photo', 42, 'image/heic', 900)).toMatchObject({
    fields: { key: 'staged/photo' },
  })
  const config = sign.mock.calls[0][0]
  expect(config.expires).toBeLessThanOrEqual(Date.now() + 300000)
  expect(config.expires).toBeGreaterThanOrEqual(before + 300000)
  expect(config.conditions).toContainEqual(['content-length-range', 42, 42])
  expect(config.conditions).toContainEqual(['eq', '$Content-Type', 'image/heic'])
  expect(config.fields).not.toHaveProperty('acl')
  await expect(
    storage.preparePhotoUpload!('staged/photo', 100000001, 'image/jpeg'),
  ).rejects.toThrow('tamanho')
  await expect(storage.preparePhotoUpload!('staged/photo', 0, 'image/jpeg')).rejects.toThrow(
    'tamanho',
  )
  expect(sign).toHaveBeenCalledTimes(1)
})
it('limita download privado e prende a geração consultada, mesmo se a chave for substituída', async () => {
  const download = vi.fn().mockResolvedValue([Buffer.from('epub')]),
    getMetadata = vi.fn().mockResolvedValue([{ size: '4', generation: '17' }])
  transport.file.mockReturnValue({ getMetadata, download })
  const storage = client()
  expect(await storage.get('original/book')).toEqual(Buffer.from('epub'))
  expect(transport.file).toHaveBeenCalledWith('original/book', { generation: '17' })
  getMetadata.mockResolvedValueOnce([{ size: '10000001', generation: '18' }])
  await expect(storage.get('original/book')).rejects.toThrow('limite')
  expect(download).toHaveBeenCalledTimes(1)
})
it('confere o tamanho real no fluxo e preserva a cópia exata em arquivo privado', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'clube-gcs-test-'))
  const getMetadata = vi
      .fn()
      .mockResolvedValue([{ size: '4', generation: '17', contentType: 'image/png' }]),
    stream = vi.fn(() => Readable.from([Buffer.from('data')]))
  transport.file.mockReturnValue({ getMetadata, createReadStream: stream })
  const storage = client()
  try {
    expect(await storage.copyPhotoToFile!('stage', join(dir, 'ok'), 4)).toEqual({
      byteSize: 4,
      contentType: 'image/png',
    })
    expect(await readFile(join(dir, 'ok'), 'utf8')).toBe('data')
    stream.mockImplementationOnce(() => Readable.from([Buffer.from('excess')]))
    await expect(storage.copyPhotoToFile!('stage', join(dir, 'large'), 4)).rejects.toThrow(
      'tamanho',
    )
    stream.mockImplementationOnce(() => Readable.from([Buffer.from('no')]))
    await expect(storage.copyPhotoToFile!('stage', join(dir, 'short'), 4)).rejects.toThrow(
      'incompleto',
    )
    getMetadata.mockResolvedValueOnce([{ size: '5', generation: '17' }])
    await expect(storage.copyPhotoToFile!('stage', join(dir, 'wrong'), 4)).rejects.toThrow(
      'autorizado',
    )
    expect(stream).toHaveBeenCalledTimes(3)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
it('distingue objeto ausente de erro de permissão e mantém remoção idempotente', async () => {
  const getMetadata = vi
      .fn()
      .mockRejectedValueOnce({ code: 404 })
      .mockRejectedValueOnce({ code: 403 }),
    remove = vi.fn().mockResolvedValue([])
  transport.file.mockReturnValue({ getMetadata, delete: remove })
  const storage = client()
  expect(await storage.photoStatus!('missing')).toBeNull()
  await expect(storage.photoStatus!('forbidden')).rejects.toMatchObject({ code: 403 })
  await storage.remove('gone')
  expect(remove).toHaveBeenCalledWith({ ignoreNotFound: true })
})
