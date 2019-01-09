import { IlpTransport } from '../../src/transport'
import * as WebSocket from 'ws'
import { WebSocketIlpMessageStream } from '../../src/ws'
import { IncomingMessage } from 'http'
import { IlpPrepare, Errors } from 'ilp-packet'
import { serializeIldcpResponse } from 'ilp-protocol-ildcp'

const ILP_TRANSPORT_SUB_PROTOCOL = 'ilp-transport'

/**
 * Callback passed to the Server constructor for protocol negotiation
 *
 * @param protocols protocols supported by the client
 * @param request HTTP request initiating the connection
 */
function handleIlpTransportSubProtocol (protocols: Array<string>, request: IncomingMessage): string | false {
  if (protocols.includes(ILP_TRANSPORT_SUB_PROTOCOL)) {
    return ILP_TRANSPORT_SUB_PROTOCOL
  }
  return false
}

export function createServer(
  port: number, 
  options: {serverIlpAddress?: string, assetCode?: string, assetScale?: number, users: {}}
): WebSocket.Server {
  const { serverIlpAddress, assetCode, assetScale, users } = Object.assign({
    serverIlpAddress: 'private.server', 
    assetCode: 'USD', 
    assetScale: 2
  }, options)

  function verifyAccountAndSecret (account: string, secret: string): boolean {
    return users[account] === secret
  }
  
  function authenticateRequest (req: IncomingMessage): string | undefined {
  
    if (req.headers.authorization) {
      const [authType, authValue] = req.headers.authorization.split(' ')
      if (authType.toLowerCase() === 'basic') {
        const [account, secret] = Buffer.from(authValue, 'base64').toString().split(':')
        if (verifyAccountAndSecret(account, secret)) return account
      }
      // TODO Implement alternative authorization header based auth such as tokens
    }
  
    return undefined
  }  

  const wss = new WebSocket.Server({
    port: port,
    verifyClient: (info: { origin: string, req: IncomingMessage, secure: boolean }) => {
      return Boolean(authenticateRequest(info.req))
    },
    handleProtocols: (protocols: Array<string>, request: IncomingMessage): string | false => {
      if (protocols.includes(ILP_TRANSPORT_SUB_PROTOCOL)) {
        return ILP_TRANSPORT_SUB_PROTOCOL
      }
      return false
    }
  })

  wss.on('connection', function connection (ws, req) {
    const accountId = authenticateRequest(req)
    const clientAddress = `${serverIlpAddress}.${accountId}`
    const endpoint = new IlpTransport(new WebSocketIlpMessageStream(ws))
    endpoint.handlers.set('*', async (prepare: IlpPrepare) => {
      const { data, destination } = prepare
      if(destination.endsWith('reject')) {
        return {
          code: 'T00',
          message: 'Rejected by MockIlpTransport',
          triggeredBy: destination + '.mock',
          data
        }
      } else {
        const fulfillment = data.length > 0 ? data.slice(0, 32) : Buffer.alloc(32)
        return {
          fulfillment,
          data
        }
      }
    })
    endpoint.handlers.set('peer.config', (request: IlpPrepare) => {
      return Promise.resolve({
        fulfillment: Buffer.alloc(32),
        data: serializeIldcpResponse({
          clientAddress,
          assetCode,
          assetScale
        })
      })
    })
  })

  return wss
}
