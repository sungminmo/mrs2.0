export function storageImage(url: string) {
  if (url.length > 2048) return null
  try {
    const source = new URL(url)
    if (source.protocol !== 'https:' || source.host !== 'bucket-mrs.s3.ap-northeast-2.amazonaws.com' || source.username || source.password || source.search || source.hash) return null
    if (!/^\/(items|assets)\/.+\.(jpeg|jpg|png|webp)$/i.test(source.pathname)) return null
    return source.href
  } catch {
    return null
  }
}

export function imageSource(url: string) {
  return storageImage(url) ?? (url.length <= 4_200_000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(url) ? url : null)
}