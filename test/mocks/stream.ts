import { Duplex } from 'stream'
import { IlpMessageStream } from '../../src/stream'
import { deserializeIlpMessage, serializeIlpMessage, isReplyMessage } from '../../src/message'
import { deserializeIlpPrepare, serializeIlpFulfill, IlpPrepare, serializeIlpPrepare, deserializeIlpReply, IlpReply, serializeIlpReject } from 'ilp-packet';

export class MockIlpMessageStream extends IlpMessageStream {

  constructor () {
    super(new MockEndpointStream())
  }

}

/**
 * Mocks a Duplex byte stream that expects to receive serialized `IlpMessage`s and will either reply to them if they are requests (ILP Prepare) or store them if they are replies (ILP Fulfill or ILP Reject).
 *
 * - If the address in the request ends with 'reject' then the response will be a reject.
 * - If the data in the request has at least 32 bytes of data then that is used as the fulfillment otherwise the fulfillment is zero-filled.
 * - The fulfillment data is always a copy of the prepare data
 */
export class MockEndpointStream extends Duplex {

  private _batches: Map<number, Map<number, IlpReply>>

  constructor() {
    super()
    this._batches = new Map()
  }

  _write(chunk: any, encoding: string, callback: (error?: Error) => void): void {
    try {
      const {batch, id, payload} = deserializeIlpMessage(chunk)
      if(isReplyMessage(payload)) {
        let messages = this._batches.get(batch)
        if(messages === undefined) {
          messages = new Map()
          this._batches.set(batch, messages)
        }
        messages.set(id, deserializeIlpReply(payload))
        deserializeIlpReply(payload)
      } else {
        const prepare = deserializeIlpPrepare(payload)
        const { data, destination } = prepare
        let reply
        if(destination.endsWith('reject')) {
          reply = serializeIlpReject({
            code: 'T00',
            message: 'Rejected by MockIlpTransport',
            triggeredBy: destination + '.mock',
            data
          })  
        } else {
          const fulfillment = data.length > 32 ? data.slice(0, 32) : Buffer.alloc(32)
          reply = serializeIlpFulfill({
            fulfillment,
            data
          })  
        }
        const responseBuffer = serializeIlpMessage({
          batch,
          id,
          payload: reply
        })
        callback()

        // // Node will emit the read synchronously if we don't put the this.push onto a timer
        // // TODO - Figure out why Node hasn't put the request into the _outgoing Map yet if we remove this delay
        // setTimeout(() => { this.push(responseBuffer) }, 5)
        this.push(responseBuffer)
      }
    } catch (e) {
      callback(e)
    }
  }  

  _read(size: number): void {
    // NO OP
  }

  public sendRequest (batch: number, id: number, prepare: IlpPrepare) {
    this.push(serializeIlpMessage({
      batch,
      id,
      payload: serializeIlpPrepare(prepare)
    }))
  }

  public getResponse(batch: number, id: number): IlpReply | undefined {
    const messages = this._batches.get(batch)
    if(messages) {
      return messages.get(id)
    }
  }

}


export class BufferedStream extends Duplex {

  constructor() {
    super()
    this.chunks = new Array()
  }

  public chunks: Array<any>

  public flush(): void {
    while(this.chunks.length > 0) {
      this.push(this.chunks.shift())
    }
  }

  _write(chunk: any, encoding: string, callback: (error?: Error) => void): void {
    this.chunks.push(chunk)
    callback()
  }

  _read() {
    
    // NO OP
  }
}