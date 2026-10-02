import { inspectionTemplate, parseInspectionFile } from './inspectionFile'

self.onmessage = async (event: MessageEvent<{ bytes?: ArrayBuffer }>) => {
  try {
    const data = event.data.bytes ? await parseInspectionFile(event.data.bytes) : await inspectionTemplate()
    self.postMessage({ data }, data instanceof ArrayBuffer ? { transfer: [data] } : undefined)
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : '엑셀 처리에 실패했습니다.' }) }
}