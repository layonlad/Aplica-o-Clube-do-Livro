/** UTF-16 text offsets are independent of page size. A boundary belongs to the next node. */
export function epubTextPoint(root: Node, offset: number): { node: Node; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Node | null,
    total = 0,
    last: Node | null = null
  const target = Math.max(0, offset)
  while ((node = walker.nextNode())) {
    const length = node.textContent?.length ?? 0
    if (!length) continue
    if (total + length > target) return { node, offset: target - total }
    total += length
    last = node
  }
  return last ? { node: last, offset: last.textContent?.length ?? 0 } : null
}
