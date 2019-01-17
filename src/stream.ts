import { Duplex } from 'stream'
import { IlpMessage, serializeIlpMessage, isIlpMessage } from './message'

/**
 * Wraps a byte stream and converts into object stream reading/writing `IlpMessage` objects.
 */
export class IlpMessageStream extends Duplex {

  protected _stream: Duplex
  protected _buffering: boolean
  protected _buffer: Array<IlpMessage>

  protected _readBuffer: Buffer
  protected _readCursor: number

  constructor (stream: Duplex) {
    super({
      allowHalfOpen: false,
      objectMode: true
    })

    this._readBuffer = Buffer.allocUnsafe(0)
    this._readCursor = 0

    this._stream = stream

    this._buffering = false
    this._buffer = new Array()

    this._stream.on('close', (code: number, reason: string) => {
      this._end()
    })

    this._stream.on('error', (err: Error) => {
      this.emit('error', err)
    })

    this._stream.on('data', (chunk: any) => {
      if (Buffer.isBuffer(chunk)) {
        this._readChunk(chunk)
      } else {
        this._stream.end()
        this.emit('error', new Error('unexpected message type received'))
        this._end()
      }
    })
  }

  private _end () {
    while (this._buffer.length > 0) {
      this.push(this._buffer.shift())
    }
    this.push(null)
  }

  private _readChunk (chunk: Buffer) {
    this._readBuffer = getReadBuffer(this._readBuffer, this._readCursor, chunk)
    this._readCursor = 0

    let messageSize = getMessageSize(this._readBuffer, this._readCursor)
    while (messageSize !== undefined && this._readBuffer.length >= messageSize) {
      const message = {
        batch: this._readBuffer.readUInt32BE(this._readCursor),
        id: this._readBuffer.readUInt32BE(this._readCursor + 4),
        payload: this._readBuffer.slice(this._readCursor + 8, this._readCursor + messageSize)
      }
      if (this._buffering) {
        this._buffer.push(message)
      } else {
        this._buffering = !(this.push(message))
      }

      this._readCursor += messageSize
      messageSize = getMessageSize(this._readBuffer, this._readCursor)
    }
  }

  _write (chunk: any, encoding: string, callback: (error?: Error | null) => void): void {
    if (isIlpMessage(chunk)) {
      this._stream.write(serializeIlpMessage(chunk), callback)
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
    try {
      this._stream.destroy((error !== null) ? error : undefined)
      callback(null)
    } catch (e) {
      callback(e)
    }
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
 * Given an old buffer of data, the last position of the cursor and a new chunk of data, return a new buffer that contains any unread data from the old buffer followed by the new data.
 *
 * @param buffer The read buffer from the last read operation
 * @param cursor The position of the cursor after the last read operation
 * @param chunk The new data to be added to the buffer
 */
export function getReadBuffer (buffer: Buffer, cursor: number, chunk: Buffer): Buffer {
  const unreadBytes = getUnreadByteCount(buffer, cursor)
  if (unreadBytes > 0) {
    const newBuffer = Buffer.allocUnsafe(unreadBytes + chunk.length)
    buffer.copy(newBuffer, 0, cursor)
    chunk.copy(newBuffer, unreadBytes, 0)
    return newBuffer
  } else {
    return chunk
  }
}

function getUnreadByteCount (buffer: Buffer, cursor: number) {
  return buffer.length - cursor
}

/**
 * Calculates the byte size of the next message that will be read from the buffer.
 *
 * If there is not enough data in the buffer to read a complete message it returns `undefined`
 *
 * @param buffer read buffer
 * @param cursor read cursor
 */
export function getMessageSize (buffer: Buffer, cursor: number): number | undefined {
  const LENGTH_OFFSET = 9
  const unreadByteCount = getUnreadByteCount(buffer, cursor)
  if (unreadByteCount > LENGTH_OFFSET) {
    const length = buffer[cursor + LENGTH_OFFSET]
    if ((length & 0x80) === 0x80) {
      const lengthOfLength = length & 0x7f
      if (lengthOfLength === 0) {
        return undefined
      }
      if (unreadByteCount > (LENGTH_OFFSET + 1 + lengthOfLength)) {
        const actualLength = buffer.readUIntBE(cursor + LENGTH_OFFSET + 1, lengthOfLength)
        if (actualLength < 0x80) {
          return undefined
        }
        if (unreadByteCount >= LENGTH_OFFSET + 1 + lengthOfLength + actualLength) {
          return LENGTH_OFFSET + 1 + lengthOfLength + actualLength
        }
      }
      return undefined
    }
    if (unreadByteCount >= LENGTH_OFFSET + 1 + length) {
      return LENGTH_OFFSET + 1 + length
    }
  }
  return undefined
}
