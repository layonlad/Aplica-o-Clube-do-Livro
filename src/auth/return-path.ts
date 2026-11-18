export function accountReturnPath(value: unknown) {
  if (typeof value !== 'string' || value.length > 2048 || /[\\\u0000-\u0020]/.test(value)) return '/app'
  return /^\/(?:app(?:[/?]|$)|clubs(?:[/?]|$)|space\/|invite(?:\?|$))/.test(value) ? value : '/app'
}
