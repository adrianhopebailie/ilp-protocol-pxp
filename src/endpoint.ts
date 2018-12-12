import { IlpPrepare, IlpReply } from 'ilp-packet'
import { EventEmitter } from 'events'

export type RequestHandler = (message: IlpPrepare, meta: object) => Promise<IlpReply>

export interface IlpEndpoint {

  /**
   * The ILP address of this endpoint
   */
  address?: string

  /**
   * Send a Request and wait for the Reply.
   *
   * @param message Message to send
   * @param sentCallback Callback invoked by the underlying socket when the message has been sent
   */
  request: (message: IlpPrepare, sentCallback?: () => void) => Promise<IlpReply>

  addListener (event: 'error', listener: (err: Error) => void): this

  emit (event: 'error', err: Error): boolean

  on (event: 'error', listener: (err: Error) => void): this

  once (event: 'error', listener: (err: Error) => void): this

  prependListener (event: 'error', listener: (err: Error) => void): this

  prependOnceListener (event: 'error', listener: (err: Error) => void): this

  removeListener (event: 'error', listener: (err: Error) => void): this

}
