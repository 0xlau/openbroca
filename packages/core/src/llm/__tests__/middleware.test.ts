import { describe, expect, it, vi } from 'vitest'
import { composeMiddleware, type CompletionChunk, type CompletionFn, type CompletionRequest, type LLMMiddleware } from '../types'

const stubRequest: CompletionRequest = {
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'hello' }],
}

async function* makeHandler(chunks: string[]): AsyncIterable<CompletionChunk> {
  for (const delta of chunks) {
    yield { delta }
  }
}

describe('composeMiddleware', () => {
  it('returns handler unchanged when no middlewares', async () => {
    const handler: CompletionFn = () => makeHandler(['a', 'b'])
    const composed = composeMiddleware([], handler)
    const result: string[] = []
    for await (const chunk of composed(stubRequest)) {
      result.push(chunk.delta)
    }
    expect(result).toEqual(['a', 'b'])
  })

  it('single middleware wraps handler', async () => {
    const order: string[] = []
    const middleware: LLMMiddleware = (next) =>
      async function* (req) {
        order.push('before')
        for await (const chunk of next(req)) {
          yield { ...chunk, delta: chunk.delta.toUpperCase() }
        }
        order.push('after')
      }

    const handler: CompletionFn = () => makeHandler(['hello'])
    const composed = composeMiddleware([middleware], handler)
    const chunks: CompletionChunk[] = []
    for await (const chunk of composed(stubRequest)) {
      chunks.push(chunk)
    }

    expect(chunks[0]?.delta).toBe('HELLO')
    expect(order).toEqual(['before', 'after'])
  })

  it('multiple middlewares compose outermost-first', async () => {
    const order: string[] = []

    const makeMiddleware = (label: string): LLMMiddleware =>
      (next) =>
        async function* (req) {
          order.push(`${label}:enter`)
          yield* next(req)
          order.push(`${label}:exit`)
        }

    const handler: CompletionFn = () => makeHandler(['x'])
    // m1 is outermost, m2 is innermost
    const composed = composeMiddleware([makeMiddleware('m1'), makeMiddleware('m2')], handler)
    for await (const _ of composed(stubRequest)) { /* consume */ }

    expect(order).toEqual(['m1:enter', 'm2:enter', 'm2:exit', 'm1:exit'])
  })

  it('middleware try/finally runs even if consumer stops early', async () => {
    const cleanup = vi.fn()
    const middleware: LLMMiddleware = (next) =>
      async function* (req) {
        try {
          yield* next(req)
        } finally {
          cleanup()
        }
      }

    const handler: CompletionFn = () => makeHandler(['a', 'b', 'c'])
    const composed = composeMiddleware([middleware], handler)

    // Only consume one chunk then break
    for await (const _ of composed(stubRequest)) {
      break
    }

    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('middleware can inspect and modify the request', async () => {
    let seenModel = ''
    const middleware: LLMMiddleware = (next) =>
      async function* (req) {
        seenModel = req.model
        yield* next({ ...req, model: 'overridden' })
      }

    let actualModel = ''
    const handler: CompletionFn = (req) => {
      actualModel = req.model
      return makeHandler([])
    }

    const composed = composeMiddleware([middleware], handler)
    for await (const _ of composed(stubRequest)) { /* consume */ }

    expect(seenModel).toBe('gpt-4o')
    expect(actualModel).toBe('overridden')
  })
})
