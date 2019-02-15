/**
 * The message frame for exchanging messages over a byte stream.
 *
 * Each frame has a 32-bit identifier which is used to match a request with a subsequent reply.
 *
 * The payload of the message is an OER encoded ILP packet.
 */
export interface MessageFrame {

  /**
   * The message identifier decoded as an unsigned 32-bit integer (Big Endian)
   */
  id: number
  /**
   * The message payload (An OER encoded ILP Packet)
   */
  payload: Buffer
}

/**
 * Test if an object is a valid frame
 *
 * @param object object to test
 */
export function isMessageFrame (object: any): object is MessageFrame {
  return (typeof object.id === 'number') && (Buffer.isBuffer(object.payload))
}

/**
 * Serialize an frame into a Buffer
 *
 * @param frame A MessageFrame object
 */
export function serializeMessageFrame (frame: MessageFrame): Buffer {
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
