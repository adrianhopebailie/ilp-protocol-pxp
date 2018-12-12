import { AccountInfo } from './account'
import { IlpEndpoint, RequestHandler } from './endpoint'
import { isReject } from 'ilp-packet'
import { SError } from 'verror'
import { IlpStream } from './stream'
import { IlpSession } from './session'

export interface AuthOptions {
  authProtocol: string
  authCondition: Buffer
  authData: Buffer
  authTimeout?: Date
}

export interface AuthResponse {
  accountId: string
  accountInfo: AccountInfo
  address: string
}

export function createBasicAuth (username: string, password: string, expiryMs: number): AuthOptions {
  return {
    authProtocol: 'basic',
    authCondition: Buffer.alloc(32), // TODO - Hash of password?
    authData: Buffer.from(`${username}:${password}`, 'utf8'),
    authTimeout: new Date(Date.now() + expiryMs)
  }
}

export function deserializeAuth (data: Buffer): AuthResponse {
  return {
    accountId: 'test',
    accountInfo: {
      assetCode: 'USD',
      assetScale: 2,
      relation: 'peer'
    },
    address: 'test.123.test'
  }
}

export async function authenticate (endpoint: IlpEndpoint, options: AuthOptions): Promise<IlpSession> {

  // Authenticate
  const rsp = await endpoint.request({
    destination: 'peer.auth.' + options.authProtocol,
    amount: '0',
    executionCondition: options.authCondition,
    expiresAt: options.authTimeout || new Date(Date.now() + 30 * 1000),
    data: options.authData // TODO - Define an auth protocol
  })

  if (isReject(rsp)) {
    throw new SError('auth rejected: %s', rsp)
  }
  const { accountId, accountInfo, address } = deserializeAuth(rsp.data)

  return new IlpSession(endpoint, accountId, accountInfo)

}

export async function createConnection (url: URL, requestHandler: RequestHandler): Promise<IlpStream> {

  const accountId = url.username
  const accountPassword = url.password

  return new Promise<IlpStream>((resolve, reject) => {

    async function handleConnect (socket: Socket) {
      const ilpSocket = new IlpStream(socket, requestHandler)
      await ilpSocket.auth(createBasicAuthRequest(accountId, accountPassword, 30 * 1000))
      return ilpSocket
    }

    if (url.protocol === ILP_TCP_URL_PROTOCOL) {
      const tcpSocket = createNetSocket(Number(url.port), url.hostname, () => {
        return handleConnect(tcpSocket)
      })
    } else if (url.protocol === ILP_IPC_URL_PROTOCOL) {
      const ipcSocket = createNetSocket(url.pathname, () => {
        return handleConnect(ipcSocket)
      })
    } else if (url.protocol === ILP_TLS_URL_PROTOCOL) {
      throw new Error(`TLS has not been implemented yet.`)
    } else {
      throw new Error(`Unknown protocol: ${url.protocol}`)
    }
  })
}