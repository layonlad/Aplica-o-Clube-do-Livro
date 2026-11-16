let locks = 0,
  body = '',
  html = ''
/** Shared by native sheets and immersive reading; nested/unmount order must not leave scrolling locked. */
export function lockPageScroll() {
  if (locks++ === 0) {
    body = document.body.style.overflow
    html = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
  }
  let live = true
  return () => {
    if (!live) return
    live = false
    if (--locks === 0) {
      document.body.style.overflow = body
      document.documentElement.style.overflow = html
    }
  }
}
