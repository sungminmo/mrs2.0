import { useEffect, useState } from 'react'

export type CustomerBanner = {
  id: string
  desktopImageUrl: string
  mobileImageUrl: string
  linkUrl: string | null
  enabled: boolean
  startsAt: string | null
  endsAt: string | null
}

export function useBanners(ids: readonly string[]) {
  const [banners, setBanners] = useState<CustomerBanner[] | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/banners?ids=${encodeURIComponent(ids.join(','))}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('배너를 불러오지 못했습니다.')
        const body = await response.json() as { data: { banners: CustomerBanner[] } }
        setBanners(body.data.banners)
      })
      .catch((error) => { if (error instanceof Error && error.name !== 'AbortError') setBanners(null) })
    return () => controller.abort()
  }, [ids])

  return banners
}