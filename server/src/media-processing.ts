import sharp from 'sharp'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HttpError } from './errors.js'
const exec = promisify(execFile)
sharp.concurrency(1)
sharp.cache({ memory: 16, files: 0, items: 16 })
export interface ProcessedMedia {
  bytes: Buffer
  thumbnail: Buffer
  feed?: Buffer
  kind: 'image' | 'video'
  mimeType: 'image/webp' | 'video/mp4'
  width: number
  height: number
  duration: number | null
}
let processing = false
const invalid = () =>
  new HttpError(
    400,
    'INVALID_MEDIA',
    'Selecione uma foto JPEG, PNG ou WebP de até 5 MB, um GIF de até 8 MB ou um vídeo MP4 de até 10 MB e 30 segundos.',
  )
const isGif = (bytes: Buffer) => bytes.length > 6 && bytes.toString('ascii', 0, 4) === 'GIF8'
/** GIFs (inclusive animados) viram WebP animado, menor e com o mesmo movimento. */
async function processGif(bytes: Buffer): Promise<ProcessedMedia> {
  const input = sharp(bytes, {
      animated: true,
      limitInputPixels: 40000000,
      failOn: 'error',
    }).timeout({
      seconds: 20,
    }),
    metadata = await input.metadata()
  const pages = metadata.pages ?? 1,
    width = metadata.width ?? 0,
    height = metadata.pageHeight ?? metadata.height ?? 0
  if (metadata.format !== 'gif' || !width || !height || pages > 150) throw invalid()
  const full = await input
    .resize({ width: 960, height: 960, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 72, effort: 4, loop: 0 })
    .toBuffer({ resolveWithObject: true })
  // Miniatura estática (primeiro quadro): listas e quem prefere menos movimento não recebem animação.
  const thumbnail = await sharp(bytes, { animated: false, limitInputPixels: 20000000 })
    .resize({ width: 360, height: 360, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 65 })
    .toBuffer()
  return {
    bytes: full.data,
    thumbnail,
    kind: 'image',
    mimeType: 'image/webp',
    width: full.info.width,
    height: full.info.pageHeight ?? full.info.height,
    duration: null,
  }
}
export async function processMedia(
  bytes: Buffer,
  kind: 'image' | 'video',
  env: NodeJS.ProcessEnv = process.env,
  photoInputLimit: 5000000 | 10000000 = 5000000,
): Promise<ProcessedMedia> {
  if (processing)
    throw new HttpError(
      429,
      'MEDIA_BUSY',
      'Outro arquivo está sendo preparado. Aguarde alguns segundos e tente novamente.',
    )
  const gif = kind === 'image' && isGif(bytes)
  if (
    !bytes.length ||
    bytes.length > (kind === 'image' ? (gif ? 8000000 : photoInputLimit) : 10000000)
  )
    throw invalid()
  processing = true
  try {
    if (gif) return await processGif(bytes)
    if (kind === 'image') {
      const input = sharp(bytes, {
          limitInputPixels: 20000000,
          animated: false,
          failOn: 'error',
        }).timeout({ seconds: 10 }),
        metadata = await input.metadata()
      if (
        !metadata.format ||
        !['jpeg', 'png', 'webp'].includes(metadata.format) ||
        !metadata.width ||
        !metadata.height ||
        (metadata.pages ?? 1) > 1
      )
        throw invalid()
      const full = await input
        .rotate()
        .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer({ resolveWithObject: true })
      const thumbnail = await sharp(full.data)
        .resize({ width: 360, height: 360, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 65 })
        .toBuffer()
      return {
        bytes: full.data,
        thumbnail,
        kind,
        mimeType: 'image/webp',
        width: full.info.width,
        height: full.info.height,
        duration: null,
      }
    }
    if (bytes.length < 12 || bytes.toString('ascii', 4, 8) !== 'ftyp') throw invalid()
    const directory = await mkdtemp(join(tmpdir(), 'clube-video-'))
    try {
      const input = join(directory, 'source.mp4'),
        output = join(directory, 'video.mp4'),
        poster = join(directory, 'poster.png')
      await writeFile(input, bytes, { mode: 0o600 })
      const { stdout } = await exec(
        env.FFPROBE_PATH ?? 'ffprobe',
        [
          '-v',
          'error',
          '-protocol_whitelist',
          'file,pipe',
          '-format_whitelist',
          'mov',
          '-enable_drefs',
          '0',
          '-show_entries',
          'format=duration:stream=codec_type,width,height',
          '-of',
          'json',
          input,
        ],
        { timeout: 8000, killSignal: 'SIGKILL', maxBuffer: 32768 },
      )
      const data = JSON.parse(stdout) as {
        format?: { duration?: string }
        streams?: { codec_type: string; width?: number; height?: number }[]
      }
      const videos = data.streams?.filter((stream) => stream.codec_type === 'video') ?? [],
        duration = Number(data.format?.duration)
      if (
        videos.length !== 1 ||
        (data.streams?.length ?? 0) > 2 ||
        !Number.isFinite(duration) ||
        duration <= 0 ||
        duration > 30 ||
        !videos[0].width ||
        !videos[0].height ||
        videos[0].width > 1920 ||
        videos[0].height > 1920
      )
        throw invalid()
      const common = [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-protocol_whitelist',
        'file,pipe',
        '-format_whitelist',
        'mov',
        '-enable_drefs',
        '0',
        '-i',
        input,
      ]
      await exec(
        env.FFMPEG_PATH ?? 'ffmpeg',
        [
          ...common,
          '-map',
          '0:v:0',
          '-map',
          '0:a:0?',
          '-map_metadata',
          '-1',
          '-map_chapters',
          '-1',
          '-vf',
          "scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
          '-r',
          '30',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '28',
          '-maxrate',
          '1000k',
          '-bufsize',
          '2000k',
          '-pix_fmt',
          'yuv420p',
          '-threads',
          '1',
          '-c:a',
          'aac',
          '-b:a',
          '64k',
          '-movflags',
          '+faststart',
          '-t',
          '30',
          '-y',
          output,
        ],
        { timeout: 45000, killSignal: 'SIGKILL', maxBuffer: 32768 },
      )
      await exec(
        env.FFMPEG_PATH ?? 'ffmpeg',
        [
          ...common,
          '-map',
          '0:v:0',
          '-frames:v',
          '1',
          '-vf',
          'scale=360:360:force_original_aspect_ratio=decrease',
          '-map_metadata',
          '-1',
          '-y',
          poster,
        ],
        { timeout: 10000, killSignal: 'SIGKILL', maxBuffer: 32768 },
      )
      const video = await readFile(output),
        thumbnail = await sharp(await readFile(poster), { limitInputPixels: 400000 })
          .webp({ quality: 65 })
          .toBuffer()
      if (video.length > 10000000 || thumbnail.length > 500000) throw invalid()
      // Dimensions are obtained from the normalized file, not user-supplied metadata.
      const { stdout: normalized } = await exec(
        env.FFPROBE_PATH ?? 'ffprobe',
        ['-v', 'error', '-show_entries', 'stream=codec_type,width,height', '-of', 'json', output],
        { timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 32768 },
      )
      const size = JSON.parse(normalized).streams.find(
        (stream: { codec_type: string }) => stream.codec_type === 'video',
      )
      return {
        bytes: video,
        thumbnail,
        kind,
        mimeType: 'video/mp4',
        width: size.width,
        height: size.height,
        duration,
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  } catch (error) {
    if (error instanceof HttpError) throw error
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new HttpError(
        503,
        'MEDIA_PROCESSOR_UNAVAILABLE',
        'O processamento de vídeo ainda não está disponível neste ambiente.',
      )
    throw invalid()
  } finally {
    processing = false
  }
}

/** A disk-backed source bounds memory for originals up to 100 MB. One codec job per process. */
export async function processPhotoFile(
  path: string,
  expectedType: string,
): Promise<ProcessedMedia> {
  if (processing)
    throw new HttpError(
      429,
      'MEDIA_BUSY',
      'Outro arquivo está sendo preparado. Tente novamente em alguns segundos.',
    )
  processing = true
  try {
    const input = sharp(path, {
      limitInputPixels: 40000000,
      animated: false,
      failOn: 'error',
      sequentialRead: true,
    }).timeout({ seconds: 25 })
    const meta = await input.metadata()
    const formats: Record<string, string> = {
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    }
    if (
      !meta.format ||
      formats[meta.format] !== expectedType ||
      !meta.width ||
      !meta.height ||
      (meta.pages ?? 1) > 1
    )
      throw new HttpError(
        400,
        'INVALID_PHOTO',
        'Selecione uma fotografia JPEG, PNG ou WebP válida.',
      )
    const full = await input
      .rotate()
      .resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 86, effort: 4 })
      .toBuffer({ resolveWithObject: true })
    const feed = await sharp(full.data)
      .resize({ width: 1440, height: 1440, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 84 })
      .toBuffer()
    const thumbnail = await sharp(full.data)
      .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 68 })
      .toBuffer()
    if (full.data.length > 10000000 || feed.length > 10000000 || thumbnail.length > 500000)
      throw new HttpError(400, 'INVALID_PHOTO', 'A foto não pôde ser otimizada com segurança.')
    return {
      bytes: full.data,
      feed,
      thumbnail,
      width: full.info.width,
      height: full.info.height,
      kind: 'image',
      mimeType: 'image/webp',
      duration: null,
    }
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(
      400,
      'INVALID_PHOTO',
      'Não foi possível processar esta foto. Use JPEG, PNG ou WebP com até 40 megapixels.',
    )
  } finally {
    processing = false
  }
}
