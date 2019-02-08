import { Type as IlpPacketType } from 'ilp-packet'

/**
 * The message frame for exchanging ILP packets over a byte stream.
 *
 * Each frame has a 64-bit identifier which is used to match a Prepare with a subsequent Fulfill/Reject.
 * The identifier is divided into a 32-bit unsigned integer for the current batch and a 32-bit unsigned integer for the packet id.
 *
 * The payload of the message is an OER encoded ILP packet.
 */
export interface IlpMessage {
  id: number
  batch: number
  payload: Buffer
}

/**
 * Test if an object is a valid IlpMessage
 *
 * @param object object to test
 */
export function isIlpMessage (object: any): object is IlpMessage {
  return (typeof object.id === 'number') && (typeof object.batch === 'number') && (Buffer.isBuffer(object.payload))
}

/**
 * Test if the message is a request (Prepare).
 *
 * The check is efficient as it doesn't decode the frame or the packet in order to check the type.
 *
 * @param message An IlpMessage, either encoded into a Buffer or as a decoded IlpMessage object.
 */
export function isRequestMessage (message: Buffer | IlpMessage): boolean {
  const [buffer, offset] = Buffer.isBuffer(message) ? [message, 9] : [message.payload, 0]
  return buffer.length >= offset && buffer[offset] === IlpPacketType.TYPE_ILP_PREPARE
}

/**
 * Test if the message is a reply (Fulfill or Reject).
 *
 * The check is efficient as it doesn't decode the frame or the packet in order to check the type.
 *
 * @param message An IlpMessage, either encoded into a Buffer or as a decoded IlpMessage object.
 */
export function isReplyMessage (message: Buffer | IlpMessage): boolean {
  const [buffer, offset] = Buffer.isBuffer(message) ? [message, 9] : [message.payload, 0]
  return buffer.length >= offset && (buffer[offset] === IlpPacketType.TYPE_ILP_FULFILL || buffer[offset] === IlpPacketType.TYPE_ILP_REJECT)
}

/**
 * Serialize an IlpMessage into a Buffer
 *
 * @param message An IlpMessage object
 */
export function serializeIlpMessage (message: IlpMessage): Buffer {
  const buffer = Buffer.allocUnsafe(8 + message.payload.length)
  buffer.writeInt32BE(message.batch, 0)
  buffer.writeInt32BE(message.id, 4)
  message.payload.copy(buffer, 8)
  return buffer
}

/**
 * Deserialize an IlpMessage object from a Buffer
 *
 * @param data the Buffer containing a serialized IlpMessage
 */
export function deserializeIlpMessage (data: Buffer): IlpMessage {
  return {
    batch: data.readUInt32BE(0),
    id: data.readUInt32BE(4),
    payload: data.slice(8)
  }
}
