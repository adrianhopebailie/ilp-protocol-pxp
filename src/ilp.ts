import { Type as IlpPacketType, IlpPrepare, IlpReply, serializeIlpPrepare, deserializeIlpReply, deserializeIlpPrepare, serializeIlpReply } from 'ilp-packet'
import { Duplex } from 'stream'
import { MessageStreamEndpoint, MessageStreamEndpointOptions } from './stream-endpoint'
import { RequestHandler } from './endpoint'
import { SError } from 'verror'

export type IlpRequestHander = RequestHandler<IlpPrepare, IlpReply>

/**
 * Test if the message is a request (Prepare).
 *
 * @param message an OER encoded ILP packet.
 */
export function isPrepare (message: Buffer): boolean {
  return message.length >= 5 && message[5] === IlpPacketType.TYPE_ILP_PREPARE
}

/**
 * Test if the message is a reply (Fulfill or Reject).
 *
 * @param message an OER encoded ILP Packet.
 */
export function isReply (message: Buffer): boolean {
  return message.length >= 5 && (message[5] === IlpPacketType.TYPE_ILP_FULFILL || message[5] === IlpPacketType.TYPE_ILP_REJECT)
}

export class IlpMessageStreamEndpoint extends MessageStreamEndpoint<IlpPrepare, IlpReply> {

  constructor (stream: Duplex, options?: MessageStreamEndpointOptions<IlpPrepare, IlpReply>) {
    super(stream, {
      serializeRequest: serializeIlpPrepare,
      deserializeRequest: deserializeIlpPrepare,
      serializeReply: serializeIlpReply,
      deserializeReply: deserializeIlpReply,
      isRequest: isPrepare
    },
    options)
  }
}

/**
 * A map of handlers than can be used as the RequestHandler for an `IlpEndpoint` where requests are passed to
 * different handlers depending on the ILP Address of the incoming packet.
 */
export class AddressMappedHandlerProvider {

  /**
   * Constructor
   *
   * @param handlers A Map of handlers to pre-load the object with.
   */
  constructor (handlers?: Map<string, IlpRequestHander>) {
    if (handlers) {
      for (const [address, handler] of handlers) {
        this.handlers.set(address, handler)
      }
    }
  }

  /**
   * The Map of handlers consulted when `handleRequest` is called.
   */
  public handlers: Map<string, IlpRequestHander>

  /**
   * The default handler provided when no match is found in the Map for the address of the request.
   */
  public get defaultHandler (): IlpRequestHander | undefined {
    return this.handlers.get('*')
  }

  public set defaultHandler (handler: IlpRequestHander | undefined) {
    if (handler) {
      this.handlers.set('*', handler)
    } else {
      this.handlers.delete('*')
    }
  }

  /**
   * Provide the handler to use for the supplied packet.
   *
   * This implementation will return a handler from the backing Map using the address
   * of the request as the key or the default handler if no match is found.
   *
   * @param request The incoming ILP packet that must be handled
   */
  public async handleRequest (request: IlpPrepare): Promise<IlpReply> {
    if (request.destination.startsWith('peer')) {
      const handler = this.handlers.get(request.destination)
      if (handler) return handler(request)
    }
    const handler = this.handlers.get('*')
    if (handler) return handler(request)

    throw new SError('no handler for request. request=%', request)
  }
}
