// 월말 기준 총 평가 가치 스냅샷(예시). 현재 월은 화면에서 실시간 합계로 채운다.
export const assetValueHistory = [
  { month: '2026.04', value: 4_120_000 },
  { month: '2026.05', value: 4_860_000 },
  { month: '2026.06', value: 5_390_000 },
  { month: '2026.07', value: 6_240_000 },
  { month: '2026.08', value: 7_232_000 },
] as const

export const monthLabel = (month: string) => `${Number(month.slice(5))}월`
