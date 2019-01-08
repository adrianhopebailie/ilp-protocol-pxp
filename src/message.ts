import { Type as IlpPacketType } from 'ilp-packet'

export interface IlpMessage {
  id: number
  batch: number
  payload: Buffer
}

export function isIlpMessage (object: any): object is IlpMessage {
  return (typeof object.id === 'number') && (typeof object.batch === 'number') && (Buffer.isBuffer(object.payload))
}

export function isRequestMessage (message: Buffer | IlpMessage): boolean {
  const [buffer, offset] = Buffer.isBuffer(message) ? [message, 9] : [message.payload, 0]
  return buffer.length >= offset && buffer[offset] === IlpPacketType.TYPE_ILP_PREPARE
}

export function isReplyMessage (message: Buffer | IlpMessage): boolean {
  const [buffer, offset] = Buffer.isBuffer(message) ? [message, 9] : [message.payload, 0]
  return buffer.length >= offset && (buffer[offset] === IlpPacketType.TYPE_ILP_FULFILL || buffer[offset] === IlpPacketType.TYPE_ILP_REJECT)
}

export function serializeIlpMessage (message: IlpMessage): Buffer {
  const buffer = Buffer.allocUnsafe(8 + message.payload.length)
  buffer.writeInt32BE(message.batch, 0)
  buffer.writeInt32BE(message.id, 4)
  message.payload.copy(buffer, 8)
  return buffer
}

export function deserializeIlpMessage (data: Buffer): IlpMessage {
  return {
    batch: data.readUInt32BE(0),
    id: data.readUInt32BE(4),
    payload: data.slice(8)
  }
}
