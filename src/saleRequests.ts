import { authenticatedFetch, readAuthSession } from './authSession'

export type SaleSubmission = { assetId: string; expectedQuantity: string; desiredAmount: number }
export type SaleSubmissionResult = { assetId: string; state: 'success' | 'failed' | 'blocked' | 'unknown'; message: string; requestId?: string }

class SaleSubmissionError extends Error {
  state: SaleSubmissionResult['state']
  stop: boolean
  constructor(message: string, state: SaleSubmissionResult['state'], stop = false) {
    super(message)
    this.state = state
    this.stop = stop
  }
}

export async function requestAssetSale(input: SaleSubmission, accessToken: string): Promise<{ id: string }> {
  if (!accessToken || readAuthSession()?.accessToken !== accessToken) throw new SaleSubmissionError('로그인 상태가 변경되어 요청을 중단했습니다.', 'blocked', true)
  let response: Response
  try {
    response = await authenticatedFetch(`/api/assets/${encodeURIComponent(input.assetId)}/sale-requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ desiredAmount: input.desiredAmount, expectedQuantity: input.expectedQuantity }) })
  } catch {
    throw new SaleSubmissionError('접수 여부를 확인하지 못했습니다. 판매 요청 내역을 확인해 주세요.', 'unknown', true)
  }
  const body = await response.json().catch(() => null) as { success?: boolean; data?: { request?: { id?: string } }; error?: { message?: string } } | null
  if (readAuthSession()?.accessToken !== accessToken) throw new SaleSubmissionError('로그인 상태가 변경되었습니다. 기존 계정의 판매 요청 내역을 확인해 주세요.', 'unknown', true)
  if (!response.ok) {
    const stop = response.status === 401 || response.status === 403 || response.status >= 500
    const state = response.status >= 500 ? 'unknown' : [401, 403, 404, 409].includes(response.status) ? 'blocked' : 'failed'
    throw new SaleSubmissionError(body?.error?.message ?? '판매 요청에 실패했습니다.', state, stop)
  }
  if (body?.success !== true || typeof body.data?.request?.id !== 'string' || !body.data.request.id) throw new SaleSubmissionError('접수 결과를 확인하지 못했습니다. 판매 요청 내역을 확인해 주세요.', 'unknown', true)
  return { id: body.data.request.id }
}

export async function submitAssetSales(inputs: SaleSubmission[], accessToken: string, onResult: (result: SaleSubmissionResult) => void, cancelled: () => boolean = () => false, send = requestAssetSale) {
  if (!inputs.length || inputs.length > 100 || new Set(inputs.map(input => input.assetId)).size !== inputs.length) throw new Error('현재 페이지에서 1~100개의 서로 다른 자산을 선택해 주세요.')
  if (inputs.some(input => !/^\d{6}-\d{4}$/.test(input.assetId) || !/^\d+(\.\d{1,3})?$/.test(input.expectedQuantity) || Number(input.expectedQuantity) <= 0 || !Number.isSafeInteger(input.desiredAmount) || input.desiredAmount < 1 || input.desiredAmount > 1e12)) throw new Error('자산별 전체 수량과 1원 이상 1조원 이하의 정수 희망금액을 확인해 주세요.')
  const results: SaleSubmissionResult[] = []
  let stopped = false
  for (const input of inputs) {
    if (cancelled()) break
    let result: SaleSubmissionResult
    if (stopped) result = { assetId: input.assetId, state: 'failed', message: '이전 요청이 중단되어 전송하지 않았습니다.' }
    else {
      try {
        const request = await send(input, accessToken)
        result = { assetId: input.assetId, state: 'success', message: '접수 완료', requestId: request.id }
      } catch (failure) {
        result = { assetId: input.assetId, state: failure instanceof SaleSubmissionError ? failure.state : 'failed', message: failure instanceof Error ? failure.message : '판매 요청에 실패했습니다.' }
        stopped = failure instanceof SaleSubmissionError && failure.stop
      }
    }
    results.push(result)
    if (!cancelled()) onResult(result)
  }
  return results
}