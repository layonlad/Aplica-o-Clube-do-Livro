import { it, expect, vi } from 'vitest'
import { S3Client } from '@aws-sdk/client-s3'
import { Readable } from 'node:stream'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPrivateStorage } from '../src/private-storage.js'
import { processPhotoFile } from '../src/media-processing.js'
const env = {
  MEDIA_BUCKET: 'synthetic-private',
  AWS_ENDPOINT_URL_S3: 'https://storage.example.test',
  AWS_REGION: 'us-east-1',
  AWS_ACCESS_KEY_ID: 'synthetic-access',
  AWS_SECRET_ACCESS_KEY: 'synthetic-secret',
}
it('assina POST somente para a chave, tipo e tamanho exatos, sem abrir o bucket', async () => {
  const result = await createPrivateStorage(env)!.preparePhotoUpload!(
    'photo-staging/synthetic/id',
    100000000,
    'image/jpeg',
  )
  const policy = JSON.parse(Buffer.from(result.fields.Policy, 'base64').toString())
  expect(policy.conditions).toContainEqual(['content-length-range', 100000000, 100000000])
  expect(policy.conditions).toContainEqual(['eq', '$Content-Type', 'image/jpeg'])
  expect(policy.conditions).toContainEqual({ key: 'photo-staging/synthetic/id' })
  expect(new Date(policy.expiration).getTime() - Date.now()).toBeLessThanOrEqual(300000)
  expect(result.fields).not.toHaveProperty('acl')
})
it('interrompe stream que excede o tamanho autorizado sem acumular o original na memória', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'photo-stream-test-'))
  const send = vi
    .spyOn(S3Client.prototype, 'send')
    .mockResolvedValue({
      ContentLength: 10,
      ContentType: 'image/jpeg',
      Body: Readable.from([Buffer.alloc(6), Buffer.alloc(6)]),
    } as never)
  try {
    await expect(
      createPrivateStorage(env)!.copyPhotoToFile!('synthetic', join(directory, 'original'), 10),
    ).rejects.toMatchObject({ code: 'INVALID_PHOTO_SIZE' })
  } finally {
    send.mockRestore()
    await rm(directory, { recursive: true, force: true })
  }
})
it('rejeita SVG e dimensões explosivas antes de gerar versões públicas', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'photo-decode-test-')),
    path = join(directory, 'source')
  try {
    await writeFile(
      path,
      '<svg xmlns="http://www.w3.org/2000/svg" width="50000" height="50000"><rect width="100%" height="100%"/></svg>',
    )
    await expect(processPhotoFile(path, 'image/jpeg')).rejects.toMatchObject({
      code: 'INVALID_PHOTO',
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
