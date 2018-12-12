import { IlpEndpoint } from './endpoint'
import { AccountInfo } from './account'
import { IlpPrepare, IlpReply } from 'ilp-packet'

export class IlpSession implements IlpEndpoint {

  protected _endpoint: IlpEndpoint
  protected _accountId: string
  protected _accountInfo: AccountInfo

  constructor (endpoint: IlpEndpoint, accountId: string, accountInfo: AccountInfo) {
    this._endpoint = endpoint
    this._accountId = accountId
    this._accountInfo = accountInfo
  }

  public request (message: IlpPrepare, sentCallback?: () => void): Promise<IlpReply> {
    return this._endpoint.request(message, sentCallback)
  }

  public get accountId (): string | undefined {
    return this._accountId
  }

  public get accountInfo (): AccountInfo | undefined {
    return this._accountInfo
  }
}
