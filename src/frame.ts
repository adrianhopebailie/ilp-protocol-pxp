import { IlpPacket, isIlpPacket } from 'ilp-packet'

/**
 * The frame for exchanging messages over a byte stream.
 *
 * Each frame has a 32-bit identifier which is used to match a request with a subsequent reply.
 *
 * The payload of the message is an OER encoded ILP packet.
 */
export interface Frame {

  /**
   * The message identifier decoded as an unsigned 32-bit integer (Big Endian)
   */
  id: number
  /**
   * The message payload (An OER encoded ILP Packet)
   */
  metadata?: Buffer

  /**
   * The message payload (An OER encoded ILP Packet)
   */
  packet: IlpPacket
}

/**
 * Test if an object is a valid frame
 *
 * @param object object to test
 */
export function isFrame (object: any): object is Frame {
  return (typeof object.id === 'number') && (Buffer.isBuffer(object.metadata)) && (isIlpPacket(object.packet))
}

/**
 * Serialize a frame into a Buffer
 *
 * @param frame A Frame object
 */
export function serializeFrame (frame: Frame): Buffer {
  const buffer = Buffer.allocUnsafe(4 + frame.payload.length)
  buffer.writeUInt32BE(frame.id, 0)
  frame.payload.copy(buffer, 4)
  return buffer
}

/**
 * Deserialize a frame from a Buffer
 *
 * @param data the Buffer containing a serialized MessageFrame
 */
export function deserializeMessageFrame (data: Buffer): MessageFrame {
  return {
    id: data.readUInt32BE(0),
    payload: data.slice(4)
  }
}
