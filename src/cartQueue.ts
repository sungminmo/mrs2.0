export class CartQueue {
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private chain: Promise<unknown> = Promise.resolve()
  private stopped = false
  private send: (id: string) => Promise<void>
  private delay: number
  constructor(send: (id: string) => Promise<void>, delay = 750) { this.send = send; this.delay = delay }
  start() { this.stopped = false }
  setSend(send: (id: string) => Promise<void>) { this.send = send }
  schedule(id: string) { this.cancel(id); this.timers.set(id, setTimeout(() => { this.timers.delete(id); void this.enqueue(() => this.send(id)).catch(() => {}) }, this.delay)) }
  cancel(id: string) { clearTimeout(this.timers.get(id)); this.timers.delete(id) }
  enqueue<T>(work: () => Promise<T>): Promise<T> { const result = this.chain.catch(() => {}).then(() => { if (this.stopped) throw new Error('로그인 상태가 변경되었습니다.'); return work() }); this.chain = result; return result }
  flush() { for (const id of this.timers.keys()) { this.cancel(id); void this.enqueue(() => this.send(id)).catch(() => {}) } return this.chain }
  stop() { this.stopped = true; for (const id of this.timers.keys()) this.cancel(id) }
}