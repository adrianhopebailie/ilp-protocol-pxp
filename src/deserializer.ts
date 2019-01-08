import { Transform, TransformOptions, TransformCallback } from 'stream'
import { deserializeIlpPacket } from 'ilp-packet'
import { deserializeIlpMessage } from './message'

export class IlpPacketDeserializer extends Transform {
  constructor (options: TransformOptions) {
    super(Object.assign(options, {
      readableObjectMode: true
    }))
  }
  _transform (chunk: any, encoding: string, callback: TransformCallback): void {
    if (Buffer.isBuffer(chunk)) {
      try {
        callback(undefined, deserializeIlpPacket(chunk).data)
      } catch (e) {
        callback(e)
      }
      return
    }
    callback(new Error('expected a Buffer but got ' + typeof chunk))
  }

}

export class MessageDeserializer extends Transform {
  constructor (options: TransformOptions) {
    super(Object.assign(options, {
      readableObjectMode: true
    }))
  }
  _transform (chunk: any, encoding: string, callback: TransformCallback): void {
    if (Buffer.isBuffer(chunk)) {
      try {
        callback(undefined, deserializeIlpMessage(chunk))
      } catch (e) {
        callback(e)
      }
      return
    }
    callback(new Error('expected a Buffer but got ' + typeof chunk))
  }
}
