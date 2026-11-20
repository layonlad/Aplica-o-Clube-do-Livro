import { expect, it } from 'vitest'
import sharp from 'sharp'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { processMedia, processPhotoFile } from '../src/media-processing.js'
it('valida, reduz e remove metadados das fotos no servidor', async () => {
  const original = await sharp({
    create: { width: 1600, height: 900, channels: 3, background: '#794384' },
  })
    .jpeg()
    .withMetadata()
    .toBuffer()
  const normalized = await processMedia(original, 'image')
  expect(normalized.kind).toBe('image')
  expect(normalized.width).toBe(1280)
  expect(normalized.height).toBe(720)
  const info = await sharp(normalized.bytes).metadata(),
    thumb = await sharp(normalized.thumbnail).metadata()
  expect(info.format).toBe('webp')
  expect(info.exif).toBeUndefined()
  expect(thumb.width).toBeLessThanOrEqual(360)
})
it('recusa HTML, SVG, arquivo vazio e arquivo acima da cota antes do armazenamento', async () => {
  for (const file of [
    Buffer.from('<html>not image</html>'),
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    Buffer.alloc(0),
    Buffer.alloc(5000001),
  ])
    await expect(processMedia(file, 'image')).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_MEDIA',
    })
  await expect(processMedia(Buffer.from('not video'), 'video')).rejects.toMatchObject({
    statusCode: 400,
  })
})
it.skipIf(process.env.RUN_VIDEO_TESTS !== '1')(
  'decodifica e normaliza MP4 real, produz capa e recusa duração excessiva',
  async () => {
    const exec = promisify(execFile)
    const fixture = async (duration: string) => {
      const { stdout } = await exec(
        process.env.FFMPEG_PATH ?? 'ffmpeg',
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-f',
          'lavfi',
          '-i',
          'color=c=purple:s=64x64:r=5',
          '-t',
          duration,
          '-an',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-movflags',
          'frag_keyframe+empty_moov',
          '-f',
          'mp4',
          'pipe:1',
        ],
        { encoding: 'buffer', maxBuffer: 1000000, timeout: 15000 },
      )
      return stdout
    }
    const result = await processMedia(await fixture('0.4'), 'video')
    expect(result.mimeType).toBe('video/mp4')
    expect(result.bytes.toString('ascii', 4, 8)).toBe('ftyp')
    expect(result.duration).toBeGreaterThan(0)
    expect(result.duration).toBeLessThanOrEqual(1)
    expect((await sharp(result.thumbnail).metadata()).format).toBe('webp')
    await expect(processMedia(await fixture('31'), 'video')).rejects.toMatchObject({
      statusCode: 400,
    })
  },
  30000,
)
it('aceita GIF animado e o converte em WebP animado com miniatura estática', async () => {
  const frame = (color: string) =>
    sharp({ create: { width: 1200, height: 600, channels: 3, background: color } }).png().toBuffer()
  const gif = await sharp([await frame('#462b70'), await frame('#fc7667')], { join: { animated: true } })
    .gif({ delay: [200, 200], loop: 0 })
    .toBuffer()
  expect(gif.toString('ascii', 0, 4)).toBe('GIF8')
  const result = await processMedia(gif, 'image')
  expect(result.mimeType).toBe('image/webp')
  expect(result.width).toBe(960)
  expect(result.height).toBe(480)
  const animated = await sharp(result.bytes, { animated: true }).metadata(),
    thumb = await sharp(result.thumbnail, { animated: true }).metadata()
  expect(animated.format).toBe('webp')
  expect(animated.pages).toBe(2)
  expect(thumb.pages ?? 1).toBe(1)
  // GIF acima de 8 MB é recusado antes de qualquer processamento.
  const huge = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(8000001)])
  await expect(processMedia(huge, 'image')).rejects.toMatchObject({ statusCode: 400 })
})


it('gera miniatura, foto de feed e ampliação com metadados removidos', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'clube-photo-test-'))
  try {
    const source = join(directory, 'original.jpg')
    await sharp({ create: { width: 2900, height: 1600, channels: 3, background: '#4a768e' } })
      .jpeg().withMetadata({ orientation: 6 }).toFile(source)
    const image = await processPhotoFile(source, 'image/jpeg')
    const sizes = await Promise.all([image.thumbnail, image.feed!, image.bytes].map((bytes) => sharp(bytes).metadata()))
    expect(sizes.map((size) => size.height)).toEqual([480, 1120, 2560])
    expect(sizes.every((size) => size.format === 'webp' && !size.exif)).toBe(true)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
