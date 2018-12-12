import { EventEmitter } from 'events'
import { default as createLogger } from 'ilp-logger'
import { IlpPrepare, IlpReply, isReject } from 'ilp-packet'
import { codes as IlpErrorCodes } from 'ilp-packet/dist/src/errors'
import { SError } from 'verror'
import { deserializeFrame, FrameHeaders, isRequest, ReplyFrame, RequestFrame, serializeFrame } from './packet'
import { Request } from './request'
import { RequestHandler, IlpEndpoint } from './endpoint'
import { Duplex } from 'stream'
const log = createLogger('ilp-stream')

export const ILP_TLS_URL_PROTOCOL = 'ilp+tls:'
export const ILP_TCP_URL_PROTOCOL = 'ilp+tcp:'
export const ILP_IPC_URL_PROTOCOL = 'ilp+ipc:'

/**
 * Reference implementation of an IlpEndpoint supporting any Duplex stream as the underlying byte stream
 */
export class IlpStream extends EventEmitter implements IlpEndpoint {
  protected _stream: Duplex
  protected _requestIdsByBatch: Map<number, number>
  protected _requests: Map<string, Request>
  protected _requestHandler: RequestHandler

  protected _address?: string
  protected _batch: number

  constructor (stream: Duplex, requestHandler: RequestHandler) {
    super()
    this._requests = new Map()
    this._batch = 1
    this._stream = stream
    this._requestHandler = requestHandler

    this._stream.on('data', (data: Buffer) => {
      this._handleData(data)
    })
    this._stream.on('error', (error: any) => {
      this.emit('error', new SError(error, 'Error in underlying socket.'))
    })
  }

  public get address (): string | undefined {
    return this._address
  }

  public set address (value: string | undefined) {
    this._address = value
  }

  public get batch (): number {
    return this._batch
  }

  public set batch (value: number) {
    if (value < this._batch) {
      throw new SError(`can't reduce batch number from current value of ${this._batch}`)
    }
    this._batch = value
  }

  public request (message: IlpPrepare, sentCallback?: () => void): Promise<IlpReply> {
    return new Promise<IlpReply>((replyCallback, errorCallback) => {
      if (!this._stream.writable) {
        errorCallback(new SError('No session'))
        return
      }
      const frameHeader = this._nextFrameHeaders()
      const key = _requestKey(frameHeader)
      const frame = Object.assign(frameHeader, message)
      this._requests.set(key, new Request(
        frame,
        (response: ReplyFrame) => {
          this._requests.delete(key)
          replyCallback(response)
        },
        () => {
          this._requests.delete(key)
          errorCallback(new SError('timed out waiting for response'))
        }))
      this._stream.write(serializeFrame(frame), sentCallback)
    })
  }

  private _nextFrameHeaders (): FrameHeaders {
    const oldId = this._requestIdsByBatch.get(this._batch)
    const id = (typeof oldId !== 'number') ? 0 : oldId + 2
    this._requestIdsByBatch.set(this._batch, id)
    return { id, batch: this._batch }
  }

  private _handleData (data: Buffer): void {
    try {
      const frame = deserializeFrame(data)
      if (isRequest(frame)) {
        this._handleRequest(frame)
      } else {
        this._handleReply(frame)
      }
    } catch (e) {
      log.trace('error handling oncoming data', data)
      this.emit('error', new SError(e, `unable to deserialize frame: ${data.toString('hex')}`))
    }
  }

  private _handleRequest (frame: RequestFrame): void {
    this._requestHandler(frame, { batch: frame.batch })
    .then(reply => {
      if (!this._stream.writable) throw new SError('unable to send fulfill. underlying stream is not writable.')
      this._stream.write(serializeFrame(Object.assign(
        {
          id: frame.id | 1,
          batch: frame.batch
        },
        reply
      )))
    })
    .catch(e => {
      // Error thrown by request handler
      const err = new SError(e, 'error handling incoming request')
      this.emit('error', err)
      if (!this._stream.writable) throw new SError(err, 'unable to send reject. underlying stream is not writable.')
      this._stream.write(serializeFrame({
        id: frame.id | 1,
        batch: frame.batch,
        triggeredBy: this.address || 'self',
        code: IlpErrorCodes.T00_INTERNAL_ERROR,
        message: '',
        data: Buffer.allocUnsafe(0)
      }))
    })
  }

  private _handleReply (frame: ReplyFrame): void {
    const originalRequest = this._requests.get(_requestKey(frame))
    if (!originalRequest) {
      this.emit('error', new SError('unsolicited response message received: %s', frame))
    } else {
      originalRequest.responseReceived(frame)
    }
  }
}

function _requestKey (headers: FrameHeaders): string {
  const { id, batch } = headers
  const buffer = Buffer.allocUnsafe(8)
  buffer.writeInt32BE(id & 0, 0)
  buffer.writeInt32BE(batch, 4)
  return buffer.toString('hex')
}
