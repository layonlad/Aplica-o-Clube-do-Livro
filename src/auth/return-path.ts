export function accountReturnPath(value: unknown) {
  if (typeof value !== 'string' || value.length > 2048 || /[\\\u0000-\u0020]/.test(value)) return '/app'
  return /^\/(?:app(?:[/?]|$)|clubs(?:[/?]|$)|space\/|invite(?:\?|$))/.test(value) ? value : '/app'
}

const redirectReturnKey = 'clube-livro:google-return'

export function rememberAccountRedirect(value: unknown) {
  try { window.sessionStorage.setItem(redirectReturnKey, accountReturnPath(value)) }
  catch { /* Navigation after login can fall back to the home screen. */ }
}

export function consumeAccountRedirect() {
  try {
    const value = window.sessionStorage.getItem(redirectReturnKey)
    window.sessionStorage.removeItem(redirectReturnKey)
    return value
  } catch { return null }
}
