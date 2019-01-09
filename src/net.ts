import { Duplex } from 'stream'
import { IlpMessage, deserializeIlpMessage, serializeIlpMessage, isIlpMessage } from './message'

/**
 * This is a naive implementation of a message stream that assumes only complete messages are read from the underlying stream in each chunk and that chunks written to the stream are complete messages.
 *
 * If the underlying stream (e.g. a TCP socket) provides chunks (packets) that contain partial messages this stream will break. Using small messages that are safely packed in a single packet will likely be safe.
 *
 * TODO: This should be improved to buffer reads until a complete message is received.
 */
export class NetMessageStream<M> extends Duplex {

  protected _stream: Duplex
  protected _buffering: boolean
  protected _buffer: Array<M>
  protected _deserializer: (data: Buffer) => M
  protected _serializer: (message: M) => Buffer
  protected _isMessage: (message: any) => message is M
  constructor (
    stream: Duplex,
    deserializer: (data: Buffer) => M,
    serializer: (message: M) => Buffer,
    isMessage: (message: any) => message is M) {
    super({
      allowHalfOpen: false,
      objectMode: true
    })

    this._stream = stream
    this._buffering = false
    this._buffer = new Array()
    this._deserializer = deserializer
    this._serializer = serializer
    this._isMessage = isMessage

    this._stream.on('close', (code: number, reason: string) => {
      this._end()
    })

    this._stream.on('error', (err: Error) => {
      this.emit('error', err)
    })

    this._stream.on('data', (chunk: any) => {
      if (Buffer.isBuffer(chunk)) {
        try {
          const message = deserializer(chunk)
          if (this._buffering) {
            // We are buffering
            this._buffer.push(message)
          } else {
            this._buffering = !this.push(message)
          }
        } catch (e) {
          this._stream.end()
          this.emit('error', e)
          this._end()
        }
      } else {
        this._stream.end()
        this.emit('error', new Error('unexpected message type received'))
        this._end()
      }
    })

    // TODO - Implement a heartbeat?

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
      this._stream.write(bytes, callback)
    } else {
      callback(new Error('unexpected message type.'))
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
    this._stream.destroy((error !== null) ? error : undefined)
    callback(error)
  }

  _final (callback: (error?: Error | null) => void): void {
    try {
      this._stream.end(callback)
    } catch (e) {
      callback(e)
    }
  }

}

/**
 * A stream.Duplex implementation for `IlpMessage` objects that uses a `stream.Duplex` as the underlying byte stream.
 */
export class NetIlpMessageStream extends NetMessageStream<IlpMessage> {
  constructor (stream: Duplex) {
    super(stream, deserializeIlpMessage, serializeIlpMessage, isIlpMessage)
  }
}
