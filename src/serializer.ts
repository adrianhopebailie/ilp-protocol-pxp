import { Transform, TransformOptions, TransformCallback } from 'stream'
import { isPrepare, serializeIlpPrepare, isFulfill, serializeIlpFulfill, isReject, serializeIlpReject } from 'ilp-packet'
import { serializeFrame, isFrame } from './packet'

export class IlpPacketSerializer extends Transform {
  constructor (options: TransformOptions) {
    super(Object.assign(options, {
      writableObjectMode: true
    }))
  }
  _transform (chunk: any, encoding: string, callback: TransformCallback): void {
    if (isPrepare(chunk)) {
      callback(undefined, serializeIlpPrepare(chunk))
      return
    }
    if (isFulfill(chunk)) {
      callback(undefined, serializeIlpFulfill(chunk))
      return
    }
    if (isReject(chunk)) {
      callback(undefined, serializeIlpReject(chunk))
      return
    }
    callback(new Error('expected an IlpPrepare, IlpFulfill or IlpReject but got ' + typeof chunk))
  }

}

export class IlpFrameSerializer extends Transform {
  constructor (options: TransformOptions) {
    super(Object.assign(options, {
      writableObjectMode: true
    }))
  }
  _transform (chunk: any, encoding: string, callback: TransformCallback): void {
    if (isFrame(chunk)) {
      callback(undefined, serializeFrame(chunk))
      return
    }
    callback(new Error('expected a Frame but got ' + typeof chunk))
  }
}
