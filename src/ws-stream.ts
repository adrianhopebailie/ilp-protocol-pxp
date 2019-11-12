import * as WebSocket from 'ws'
import { Duplex } from 'stream'
import { MessageFrame, deserializeMessageFrame, serializeMessageFrame, isMessageFrame } from './frame'

/**
 * Wraps a WebSocket connection so that it behaves like `stream.Duplex` in object mode.
 */
export class WebSocketMessageStream<M> extends Duplex {

  protected _socket: WebSocket
  protected _buffering: boolean
  protected _buffer: Array<M>
  protected _deserializer: (data: Buffer) => M
  protected _serializer: (message: M) => Buffer
  protected _isMessage: (message: any) => message is M
  constructor (
    socket: WebSocket,
    deserializer: (data: Buffer) => M,
    serializer: (message: M) => Buffer,
    isMessage: (message: any) => message is M) {
    super({
      allowHalfOpen: false,
      objectMode: true
    })

    this._buffering = false
    this._buffer = new Array()
    this._deserializer = deserializer
    this._serializer = serializer
    this._isMessage = isMessage

    this._socket = socket
    this._socket.on('close', (code: number, reason: string) => {
      this._end()
    })

    this._socket.on('error', (err: Error) => {
      this.emit('error', err)
    })

    this._socket.on('message', (data: WebSocket.Data) => {
      if (Buffer.isBuffer(data)) {
        try {
          const message = deserializer(data)
          if (this._buffering) {
            // We are buffering
            this._buffer.push(message)
          } else {
            this._buffering = !this.push(message)
          }
        } catch (e) {
          this._socket.close(1008, 'unable to deserialize message')
          this.emit('error', e)
          this._end()
        }
      } else {
        this._socket.close(1003, 'unexpected message type')
        this.emit('error', new Error('unexpected message type received'))
        this._end()
      }
    })

    // TODO - Implement a heartbeat

  }

  private _end () {
    while (this._buffer.length > 0) {
      this.push(this._buffer.shift())
    }
    this.push(null)
  }

  _write (chunk: any, encoding: string, callback: (error?: Error | null) => void): void {
    if (this._isMessage(chunk)) {
      const bytes = this._serializer(chunk)
      this._socket.send(bytes, callback)
    } else {
      callback(new Error('unexpected message type. expected a '))
    }
  }

  _read (size: number) {
    if (this._buffering) {
      this._buffering = false
      while (this._buffer.length > 0 && !this._buffering) {
        this._buffering = !(this.push(this._buffer.shift()))
      }
    }
  }

  _destroy (error: Error | null, callback: (error: Error | null) => void): void {
    this._socket.terminate()
    callback(error)
  }

  _final (callback: (error?: Error | null) => void): void {
    try {
      this._socket.close(1000, 'connection closed')
      callback()
    } catch (e) {
      callback(e)
    }
  }

}

/**
 * A `stream.Duplex` implementation for `IlpMessage` objects that uses a WebSocket as the underlying message stream.
 *
 * An instance of this class can be passed to the constructor of `IlpTransport`
 */
export class WebSocketIlpMessageStream extends WebSocketMessageStream<MessageFrame> {
  constructor (socket: WebSocket) {
    super(socket, deserializeMessageFrame, serializeMessageFrame, isMessageFrame)
  }
}
