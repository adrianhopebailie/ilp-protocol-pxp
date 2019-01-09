import { Duplex } from 'stream'
import { IlpMessage, deserializeIlpMessage, serializeIlpMessage, isIlpMessage, isReplyMessage } from '../../src/message'
import { NetMessageStream } from '../../src/net'
import { deserializeIlpPrepare, serializeIlpFulfill, IlpPrepare, serializeIlpPrepare, deserializeIlpReply, IlpReply, serializeIlpReject } from 'ilp-packet';

export class MockIlpMessageStream extends NetMessageStream<IlpMessage> {

  constructor () {
    super(new MockIlpTransport(), deserializeIlpMessage, serializeIlpMessage, isIlpMessage)
  }

}

export class MockIlpTransport extends Duplex {

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
          const fulfillment = data.length > 0 ? data.slice(0, 32) : Buffer.alloc(32)
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

        // Node will emit the read synchronously if we don't put the this.push onto a timer
        // TODO - Figure out why Node hasn't put the request into the _outgoing Map yet if we remove this delay
        setTimeout(() => { this.push(responseBuffer) }, 5)
      }
    } catch (e) {
      callback(e)
    }
  }  

  _read(size: number): void {
    // NO OP
  }

  public incomingRequest (batch: number, id: number, prepare: IlpPrepare) {
    const payload = serializeIlpPrepare(prepare)
    const responseBuffer = serializeIlpMessage({
      batch,
      id,
      payload
    })
    this.push(responseBuffer)
  }

  public outgoingResponse(batch: number, id: number): IlpReply | undefined {
    const messages = this._batches.get(batch)
    if(messages) {
      return messages.get(id)
    }
  }

}
