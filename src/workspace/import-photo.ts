export async function importPhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 10000000)
    throw Error('Escolha uma imagem JPG, PNG ou WebP de até 10 MB.')
  const bitmap = await createImageBitmap(file)
  try {
    const ratio = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio))
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio))
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const value = canvas.toDataURL('image/jpeg', 0.65)
    if (value.length > 220000) throw Error('A imagem é muito detalhada. Selecione uma foto menor.')
    return value
  } finally {
    bitmap.close()
  }
}
