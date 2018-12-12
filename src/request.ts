import { RequestFrame, ReplyFrame } from './packet'

/**
 * Represents a sent message. Emits events if a reply is received or the request times out
 */
export class Request {
  private _timer: NodeJS.Timer
  private _request: RequestFrame
  private _responseCallback: (response: ReplyFrame) => void

  constructor (frame: RequestFrame, responseCallback: (response: ReplyFrame) => void, timeoutCallback: () => void) {
    this._request = frame
    this._responseCallback = responseCallback

    const timeout = this._request.expiresAt.getMilliseconds() - new Date().getMilliseconds()
    this._timer = setTimeout(() => {
      timeoutCallback()
    }, timeout)  
  }

  public responseReceived (response: ReplyFrame): void {
    clearTimeout(this._timer)
    this._responseCallback(response)
  }

}
