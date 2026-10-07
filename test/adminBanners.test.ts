import assert from 'node:assert/strict'
import { test } from 'node:test'
import { adminHref, createAdminViews, menus } from '../src/admin/adminViews.ts'
import { validateCampaign } from '../src/admin/adminMarket.ts'

test('campaign composition belongs to content banner management, not market navigation', () => {
  assert.equal(menus.find(menu => menu.id === 'market')!.tabs.some(tab => tab.id === 'campaigns'), false)
  assert.equal(menus.find(menu => menu.id === 'content')!.tabs.some(tab => tab.id === 'banners'), true)
  const route = adminHref({ label: '기획전 배너', menu: 'market', tab: 'campaigns', id: 'CAM-EXISTING', status: '예약' })
  assert.equal(route, '#/admin/content?tab=banners&id=CAM-EXISTING&status=%EC%98%88%EC%95%BD&type=campaign')
  assert.equal(adminHref({ label: '이미지 배너', menu: 'content', tab: 'banners' }), '#/admin/content?tab=banners')
})

test('banner view preserves existing campaign composition and has no category column', () => {
  const campaign = { id: 'CAM-EXISTING', name: '보존된 배너', description: '편성 유지', enabled: false, order: 0, startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-11-01T00:00:00Z', productIds: ['PRD-EXISTING'], productCount: 1, visibleProductCount: 0 }
  const views = createAdminViews([], [], [], { sales: [], products: [], quotes: [], campaigns: [campaign] })
  assert.equal(views['market/campaigns'], undefined)
  assert.equal(views['content/banners'].title, '기획전 배너')
  assert.equal(views['content/banners'].rows[0].id, campaign.id)
  assert.equal(views['content/banners'].rows[0].cells[3], '1종')
  assert.equal(views['content/banners'].headers.includes('카테고리'), false)
  assert.equal(views['content/banners'].headers.includes('등록 영역'), true)
  assert.deepEqual(views['content/banners'].rows[0].fields.find(([label]) => label === '영역 코드'), ['영역 코드', 'MKT'])
})

test('campaign banners require a three-character text placement and readable name', () => {
  const campaign = { id: '', name: '배너', description: '설명', placementCode: 'MKT', placementName: '고객포탈 마켓 상단 기획전', enabled: false, order: 0, startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-11-01T00:00:00Z', productIds: [] }
  assert.doesNotThrow(() => validateCampaign(campaign))
  assert.doesNotThrow(() => validateCampaign({ ...campaign, placementCode: '001' }))
  for (const placementCode of ['', 'MK', 'MKTT', '   ']) assert.throws(() => validateCampaign({ ...campaign, placementCode }), /3자리/)
  assert.throws(() => validateCampaign({ ...campaign, placementName: ' ' }), /영역명/)
})