import { Transform, TransformOptions, TransformCallback } from 'stream'
import { deserializeIlpPacket } from 'ilp-packet'
import { deserializeFrame } from './packet'

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

export class IlpFrameDeserializer extends Transform {
  constructor (options: TransformOptions) {
    super(Object.assign(options, {
      readableObjectMode: true
    }))
  }
  _transform (chunk: any, encoding: string, callback: TransformCallback): void {
    if (Buffer.isBuffer(chunk)) {
      try {
        callback(undefined, deserializeFrame(chunk))
      } catch (e) {
        callback(e)
      }
      return
    }
    callback(new Error('expected a Buffer but got ' + typeof chunk))
  }
}
