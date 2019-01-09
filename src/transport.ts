import { EventEmitter } from 'events'
import { IlpPrepare, IlpReply, serializeIlpPrepare, deserializeIlpReply, deserializeIlpPrepare, serializeIlpReply, serializeIlpReject, Errors as IlpErrors } from 'ilp-packet'
import { SError } from 'verror'
import { isRequestMessage, IlpMessage } from './message'
import { RequestHandler, IlpEndpoint } from './endpoint'
import { IlpSession } from './session'
import { Duplex } from 'stream'

const DEFAULT_BATCH = 1
const DEFAULT_BATCH_CUTOVER_TIMEOUT_MS = 30 * 1000
const DEFAULT_MAX_TIMEOUT_MS = 5 * 60 * 1000

interface IlpTransportOptions {

  handlers?: Map<string, RequestHandler>
  batch?: number
  batchCutoverTimeoutMs?: number
  maxTimeoutMs?: number
}

/**
 * Reference implementation of an IlpEndpoint supporting any `stream.Duplex` implementation that reads and writes `IlpMessage` objects.
 *
 * The supplied `stream.Duplex` must be in Object Mode and must read and write objects that implement the following interface:
 * ```
 * {
 *   batch: number (uint32)
 *   id: number (unint32)
 *   payload: Buffer (ILP packet)
 * }
 * ```
 *
 * This implementation uses the ILP Transport protocol as the message protocol over the supplied message stream therefor each request/reply has a unique batch and id.
 */
export class IlpTransport extends EventEmitter implements IlpEndpoint {
  protected _stream: Duplex
  protected _requestIdsByBatch: Map<number, number>
  protected _outgoing: Map<number, { respond: (response: Buffer) => void, timeout: NodeJS.Timeout }>
  protected _incoming: Set<number>
  protected _batch: number
  protected _minimumBatch: number
  protected _batchCutoverTimeoutMs: number
  protected _maxTimeoutMs: number
  constructor (stream: Duplex, options?: IlpTransportOptions) {
    super()
    this._incoming = new Set()
    this._outgoing = new Map()
    this._requestIdsByBatch = new Map()

    this._batch = (options && options.batch)
      ? options.batch
      : DEFAULT_BATCH

    this._minimumBatch = this._batch
    this._batchCutoverTimeoutMs = (options && options.batchCutoverTimeoutMs)
      ? options.batchCutoverTimeoutMs
      : DEFAULT_BATCH_CUTOVER_TIMEOUT_MS

    this._maxTimeoutMs = (options && options.maxTimeoutMs)
      ? options.maxTimeoutMs
      : DEFAULT_MAX_TIMEOUT_MS

    this._stream = stream

    this._stream.on('error', (error: any) => {
      this.emit('error', new SError(error, 'error in underlying stream.'))
    })
    this._stream.on('data', (message: IlpMessage) => {
      this._handleMessage(message)
    })

    this.handlers = (options && options.handlers) ? options.handlers : new Map()
  }

  public handlers: Map<string, RequestHandler>

  public session?: IlpSession

  public get batch (): number {
    return this._batch
  }

  public set batch (value: number) {
    if (value < this._batch) {
      throw new SError(`can't reduce batch number from current value of ${this._batch}`)
    }
    this._batch = value
    setTimeout(() => {
      this._minimumBatch = value
    }, this._batchCutoverTimeoutMs)
  }

  public request (request: IlpPrepare, sentCallback?: (error?: Error) => void): Promise<IlpReply> {
    if (!this._stream.writable) throw new Error('underlying stream is not writeable')
    const packet = serializeIlpPrepare(request)
    const message = this._nextMessage(packet)
    const key = _requestKey(message)

    const timeoutMs = request.expiresAt.valueOf() - Date.now()
    if (timeoutMs > this._maxTimeoutMs || timeoutMs < 0) {
      throw new SError('invalid expiresAt in ILP packet. timeoutMs=%s, maxTimeoutMs=%s', timeoutMs, this._maxTimeoutMs)
    }
    return new Promise<IlpReply>((replyCallback, errorCallback) => {
      const timeout = setTimeout(() => {
        this._outgoing.delete(key)
        errorCallback(new SError('timed out waiting for response'))
      }, timeoutMs)

      const respond = (response: Buffer) => {
        clearTimeout(timeout)
        this._outgoing.delete(key)
        replyCallback(deserializeIlpReply(response))
      }
      this._outgoing.set(key, { respond, timeout })
      this._stream.write(message, sentCallback)
    })
  }

  private _nextMessage (payload: Buffer): IlpMessage {
    const batch = this._batch
    const lastId = this._requestIdsByBatch.get(batch)
    const id = (typeof lastId !== 'number') ? 0 : lastId + 1
    this._requestIdsByBatch.set(batch, id)
    return { batch, id, payload }
  }

  private _handleMessage (message: IlpMessage): void {
    const { batch, id, payload } = message
    try {
      const key = _requestKey(message)
      if (isRequestMessage(message)) {
        if (this._incoming.has(key)) {
          this.emit('error', new SError(`duplicate request received for key: ${key}`))
          return
        }

        if (batch < this._minimumBatch) {
          this.emit('error', new SError(`request received for closed batch : ${batch}`))
          return
        }

        if (batch > this.batch) {
          this.batch = batch
        }

        const packet = deserializeIlpPrepare(payload)
        const handler = _resolveHandler(this.handlers, packet)
        if (!handler) {
          const err = new SError('no request handler for incoming request')
          this.emit('error', err)
          if (this._stream.writable) {
            this._stream.write({
              id,
              batch,
              payload: serializeIlpReject({
                triggeredBy: (this.session && this.session.address) ? this.session.address : 'peer',
                code: IlpErrors.codes.T00_INTERNAL_ERROR,
                message: '',
                data: Buffer.allocUnsafe(0)
              })
            }, (error?: Error) => {
              if (error) {
                this.emit('error', new SError(error, 'error sending reject. batch=%s correlationId=%s', batch, id))
              }
            })
          }
          return
        }
        this._incoming.add(key)
        const timeout = setTimeout(() => {
          this._incoming.delete(key)
          this.emit('error', new SError('timed out waiting for response from request handler. batch=%s id=%s', batch, id))
        }, packet.expiresAt.getMilliseconds() - new Date().getMilliseconds())

        handler(packet, { batch, id })
        .then(reply => {
          clearTimeout(timeout)
          this._incoming.delete(key)
          this._stream.write({
            id,
            batch,
            payload: serializeIlpReply(reply)
          }, (error?: Error) => {
            if (error) {
              this.emit('error', new SError(error, 'error sending fulfill. batch=%s id=%s', batch, id))
            }
          })
        })
        .catch(e => {
          this._incoming.delete(key)
          // Error thrown by request handler
          const err = new SError(e, 'error handling incoming request. batch=%s id=%s', batch, id)
          this.emit('error', err)
          this._stream.write({
            id,
            batch,
            payload: serializeIlpReject({
              triggeredBy: (this.session && this.session.address) ? this.session.address : 'peer',
              code: IlpErrors.codes.T00_INTERNAL_ERROR,
              message: '',
              data: Buffer.allocUnsafe(0)
            })
          }, (error?: Error) => {
            if (error) {
              this.emit('error', new SError(error, 'error sending reject. batch=%s id=%s', batch, id))
            }
          })
        })
      } else {
        const request = this._outgoing.get(key)
        if (!request) {
          this.emit('error', new SError('unsolicited response message received: %s', message))
        } else {
          request.respond(payload)
        }
      }
    } catch (e) {
      this.emit('error', new SError(e, 'error handling message. batch=%s id=%s', batch, id))
    }
  }
}

function _requestKey (message: IlpMessage): number {
  const arr = new ArrayBuffer(8)
  const view = new DataView(arr)
  view.setUint32(0, message.batch, false)
  view.setUint32(4, message.id, false)
  return view.getFloat64(0)
}

// TODO - Longest prefix match
function _resolveHandler (handlers: Map<string, RequestHandler>, request: IlpPrepare): RequestHandler | undefined {
  if (request.destination.startsWith('peer')) {
    const handler = handlers.get(request.destination)
    if (handler) return handler
  }
  return handlers.get('*')
}