import { EventEmitter } from 'events'
import { SError } from 'verror'
import { MessageFrame } from './message'
import { Endpoint, RequestHandler } from './endpoint'
import { Duplex } from 'stream'

export type ExpiringRequest = { expiresAt: Date }

export const DEFAULT_MAX_TIMEOUT_MS = 5 * 60 * 1000

export interface MessageStreamCodecs<Request, Reply> {
  serializeRequest: (request: Request) => Buffer,
  deserializeRequest: (request: Buffer) => Request,
  serializeReply: (reply: Reply) => Buffer,
  deserializeReply: (reply: Buffer) => Reply,
  isRequest (payload: Buffer): boolean
}

/**
 * Constructor options for a new `MessageStreamEndpoint` object.
 */
export interface MessageStreamEndpointOptions<Request, Reply> {

  /**
   * The initial handler for incoming requests.
   */
  handler?: RequestHandler<Request, Reply>

  /**
   * The id to use for the next request.
   *
   * Subsequent requests will use an incrementally higher id until the id reaches 0xffffffff and then it will roll back to 0x00000001.
   * The id 0 is never used to avoid unpredictable behaviour if the value is 'falsey'.
   *
   * If the provided value is > 0xffffffff it will be reset to 0x00000001
   */
  nextRequestId?: number
  /**
   * Max timeout allowed in ILP Prepare packets passed via `request`.
   */
  maxTimeoutMs?: number
}

/**
 * Reference implementation of an Endpoint supporting any `stream.Duplex` implementation that reads and writes `Message` objects.
 *
 * The supplied `stream.Duplex` must be in Object Mode and must read and write objects that implement the following interface:
 * ```
 * {
 *   id: number (unint32)
 *   payload: Buffer (message payload)
 * }
 * ```
 */
export class MessageStreamEndpoint<Request extends ExpiringRequest, Reply> extends EventEmitter implements Endpoint<Request, Reply> {
  protected _messageStream: Duplex
  protected _codecs: MessageStreamCodecs<Request, Reply>
  protected _nextRequestId: number
  protected _outgoing: Map<number, { respond: (response: Buffer) => void, timeout: NodeJS.Timeout }>
  protected _incoming: Set<number>
  protected _maxTimeoutMs: number

  /**
   * Create a new MessageStreamEndpoint using the provided stream as the underlying message stream.
   *
   * @param stream a stream.Duplex that reads/writes `MessageFrame` objects
   * @param options constructor options
   */
  constructor (stream: Duplex, codecs: MessageStreamCodecs<Request, Reply>, options?: MessageStreamEndpointOptions<Request, Reply>) {

    super()

    this._codecs = codecs
    this._incoming = new Set()
    this._outgoing = new Map()

    if (options && options.nextRequestId) {
      this._nextRequestId = options.nextRequestId
      if (this._nextRequestId > 0xffffffff) {
        this._nextRequestId = 1
      }
    } else {
      this._nextRequestId = 1
    }

    this._maxTimeoutMs = (options && options.maxTimeoutMs)
      ? options.maxTimeoutMs
      : DEFAULT_MAX_TIMEOUT_MS

    this._messageStream = stream

    this._messageStream.on('error', (error: any) => {
      this.emit('error', new SError(error, 'error in underlying stream.'))
    })

    this._messageStream.on('data', (message: MessageFrame) => {
      this._handleMessage(message)
    })

    if (options && options.handler) {
      this.handler = options.handler
    } else {
      this.handler = (packet: Request): Promise<Reply> => {
        throw new SError('no request handler for incoming request', packet)
      }
    }
  }

  /**
   * Function that is invoked by the endpoint to handle outgoing requests
   *
   * Components that interface with this endpoint MUST set `handler`.
   */
  public handler: RequestHandler<Request,Reply>

  /**
   * The ILP address of this endpoint. Used in ILP Reject messages generated by the endpoint.
   */
  public address?: string

  public request (request: Request, sentCallback?: (error?: Error) => void): Promise<Reply> {
    if (!this._messageStream.writable) throw new Error('underlying stream is not writeable')
    const packet = this._codecs.serializeRequest(request)
    const message = this._nextMessage(packet)

    const timeoutMs = request.expiresAt.valueOf() - Date.now()
    if (timeoutMs > this._maxTimeoutMs || timeoutMs <= 0) {
      throw new SError('invalid expiresAt in ILP packet. timeoutMs=%s, maxTimeoutMs=%s', timeoutMs, this._maxTimeoutMs)
    }
    return new Promise<Reply>((replyCallback, errorCallback) => {
      const timeout = setTimeout(() => {
        this._outgoing.delete(message.id)
        errorCallback(new SError('timed out waiting for response'))
      }, timeoutMs)

      const respond = (reply: Buffer) => {
        clearTimeout(timeout)
        this._outgoing.delete(message.id)
        replyCallback(this._codecs.deserializeReply(reply))
      }
      this._outgoing.set(message.id, { respond, timeout })
      this._messageStream.write(message, sentCallback)
    })
  }

  private _nextMessage (payload: Buffer): MessageFrame {
    const id = this._nextRequestId++
    if (this._nextRequestId > 0xffffffff) {
      this._nextRequestId = 1
    }
    return { id, payload }
  }

  private _handleMessage (message: MessageFrame): void {
    const { id, payload } = message
    try {
      if (this._codecs.isRequest(payload)) {
        if (this._incoming.has(id)) {
          this.emit('error', new SError(`duplicate request received for id: ${id}`))
          return
        }
        const packet = this._codecs.deserializeRequest(payload)
        this._incoming.add(id)
        const timeout = setTimeout(() => {
          this._incoming.delete(id)
          this.emit('error', new SError('timed out waiting for response from request handler. id=%s', id))
        }, packet.expiresAt.getMilliseconds() - new Date().getMilliseconds())

        this.handler(packet)
        .then(reply => {
          clearTimeout(timeout)
          this._incoming.delete(id)
          this._messageStream.write({
            id,
            payload: this._codecs.serializeReply(reply)
          }, (error?: Error) => {
            if (error) {
              this.emit('error', new SError(error, 'error sending fulfill. id=%s', id))
            }
          })
        })
        .catch(e => {
          this._incoming.delete(id)
          // Error thrown by request handler
          const err = new SError(e, 'error handling incoming request. id=%s', id)
          this.emit('error', err)
        })
      } else {
        const request = this._outgoing.get(id)
        if (!request) {
          this.emit('error', new SError('unsolicited response message received: %s', message))
        } else {
          request.respond(payload)
        }
      }
    } catch (e) {
      this.emit('error', new SError(e, 'error handling message. id=%s', id))
    }
  }
}