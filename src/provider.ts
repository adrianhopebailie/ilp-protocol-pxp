import { RequestHandler } from './endpoint'
import { IlpPrepare, IlpReply, Errors as IlpError } from 'ilp-packet'
import { SError } from 'verror'

/**
 * A map of handlers than can be used as the RequestHandlerProvider for an `IlpEndpoint` keyed by ILP Address
 */
export class AddressMappedHandlerProvider {

  /**
   * Constructor
   *
   * @param handlers A Map of handlers to pre-load the object with.
   */
  constructor (handlers?: Map<string, RequestHandler>) {
    if (handlers) {
      for (const [address, handler] of handlers) {
        this.handlers.set(address, handler)
      }
    }
  }

  /**
   * The Map of handlers consulted when `provideHandler` is called.
   */
  public handlers: Map<string, RequestHandler>

  /**
   * The default handler provided when no match is found in the Map for the address of the request.
   */
  public get defaultHandler (): RequestHandler | undefined {
    return this.handlers.get('*')
  }

  public set defaultHandler (handler: RequestHandler | undefined) {
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
   * @param meta Any meta-data from the incoming request (transport specific)
   */
  public provideHandler (request: IlpPrepare) {
    if (request.destination.startsWith('peer')) {
      const handler = this.handlers.get(request.destination)
      if (handler) return handler
    }
    return this.handlers.get('*')
  }
}
