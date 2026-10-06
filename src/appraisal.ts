export function appraisalTotal(unitPrice: string | null | undefined, quantity: string): string | null {
  if (unitPrice == null || !/^\d+$/.test(unitPrice) || !/^\d+(?:\.\d{1,3})?$/.test(quantity)) return null
  const [whole, fraction = ''] = quantity.split('.')
  const scaled = BigInt(unitPrice) * (BigInt(whole!) * 1000n + BigInt(fraction.padEnd(3, '0')))
  const decimal = String(scaled % 1000n).padStart(3, '0').replace(/0+$/, '')
  return `${scaled / 1000n}${decimal ? `.${decimal}` : ''}`
}

export function appraisalMoney(value: string | null): string {
  if (value === null) return '미평가'
  const [whole, fraction] = value.split('.')
  return `${BigInt(whole!).toLocaleString('ko-KR')}${fraction ? `.${fraction}` : ''}원`
}