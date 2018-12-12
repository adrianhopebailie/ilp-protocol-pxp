import { IlpPrepare, IlpFulfill, IlpReject, isPrepare, serializeIlpPrepare, isFulfill, serializeIlpFulfill, serializeIlpReject, deserializeIlpPacket } from 'ilp-packet'

export interface FrameHeaders {
  id: number
  batch: number
}

export type Frame = RequestFrame | ResponseFrame | ErrorFrame
export type RequestFrame = FrameHeaders & IlpPrepare
export type ResponseFrame = FrameHeaders & IlpFulfill
export type ErrorFrame = FrameHeaders & IlpReject
export type ReplyFrame = ResponseFrame | ErrorFrame

export function isFrame (object: any): object is Frame {
  return (typeof object.id === 'number') && (typeof object.batch === 'number')
}
export function isRequest (packet: FrameHeaders): packet is RequestFrame {
  return (packet.id & 1) === 0
}
export function isReply (packet: FrameHeaders): packet is ReplyFrame {
  return (packet.id & 1) === 1
}

export function serializeFrame(frame: Frame): Buffer {
  const payload = 
    isPrepare(frame) ? serializeIlpPrepare(frame) :
    isFulfill(frame) ? serializeIlpFulfill(frame) :
    serializeIlpReject(frame)
  const buffer = Buffer.allocUnsafe(8 + payload.length)
  // TODO Check that id and batch are unsigned 32-bit int
  buffer.writeInt32BE(frame.id, 0)
  buffer.writeInt32BE(frame.batch, 4)
  payload.copy(buffer, 8)
  // TODO Look at optimizing after ilp-packet has been optimized for zero-copy
  return buffer
}

export function deserializeFrame(data: Buffer): Frame {
  const packet  = deserializeIlpPacket(data.slice(8))
  return Object.assign({
    id: data.readUInt32BE(0),
    batch: data.readUInt32BE(4),
  }, packet.data)
}
