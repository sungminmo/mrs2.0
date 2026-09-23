import { useEffect, useState } from 'react'

export type CustomerBannerItem = {
  id: string
  placementId: string
  desktopImageUrl: string
  mobileImageUrl: string
  linkUrl: string | null
  enabled: boolean
  sortOrder: number
  startsAt: string | null
  endsAt: string | null
}

export type CustomerBannerPlacement = {
  id: string
  name: string
  enabled: boolean
  items: CustomerBannerItem[]
}

export function useBannerPlacement(id: string) {
  const [placement, setPlacement] = useState<CustomerBannerPlacement | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/banners?placements=${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('배너를 불러오지 못했습니다.')
        const body = await response.json() as { data: { placements: CustomerBannerPlacement[] } }
        setPlacement(body.data.placements[0] ?? null)
      })
      .catch((error) => { if (error instanceof Error && error.name !== 'AbortError') setPlacement(null) })
    return () => controller.abort()
  }, [id])

  return placement
}