/**
 * Bridges callback/event-driven producers to an `AsyncIterable<T>` consumer.
 *
 * Producer calls `push` for each item, `fail` to abort with an error, or `end`
 * when the stream completes naturally. After any of `fail` / `end`, further
 * `push` / `fail` / `end` calls are ignored.
 *
 * Consumer iterates `drain()` once. The iterator yields any items already
 * queued, suspends when the queue is empty, and resumes as the producer pushes
 * more. When the producer calls `end`, drain returns; if it calls `fail`,
 * drain throws.
 */
export class AsyncPushQueue<T> {
  private readonly items: T[] = []
  private waiter: (() => void) | null = null
  private finished = false
  private error: Error | null = null

  push(item: T): void {
    if (this.finished) return
    this.items.push(item)
    this.wake()
  }

  fail(error: Error): void {
    if (this.finished) return
    this.error = error
    this.finished = true
    this.wake()
  }

  end(): void {
    if (this.finished) return
    this.finished = true
    this.wake()
  }

  async *drain(): AsyncIterable<T> {
    while (true) {
      while (this.items.length > 0) {
        yield this.items.shift()!
      }
      if (this.error) throw this.error
      if (this.finished) return
      await new Promise<void>((resolve) => {
        this.waiter = resolve
      })
    }
  }

  private wake(): void {
    const w = this.waiter
    this.waiter = null
    w?.()
  }
}
