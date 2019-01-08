/**
 * This file provides a simple example of implementing a WebSocket server supporting `ilp-transport` sub-protocol.
 *
 * It demonstrates how to authenticate a session with the client using the WebSocket handshake.
 */

import { IlpTransport } from '../src/transport'
import * as WebSocket from 'ws'
import { WebSocketIlpMessageStream } from '../src/ws'
import { IncomingMessage } from 'http'
import { IlpPrepare, Errors } from 'ilp-packet'
import { serializeIldcpResponse } from 'ilp-protocol-ildcp'

const ILP_TRANSPORT_SUB_PROTOCOL = 'ilp-transport'

/**
 * Dummy auth function for incoming client requests
 *
 * @param account client account
 * @param secret client secret
 */
function verifyAccountAndSecret (account: string, secret: string): boolean {
  return true
}

/**
 * Authenticate a WebSocket handshake.
 *
 * @param req The `IncomingMessage` representing the HTTP request sent by the client in the handshake.
 */
function authenticateRequest (req: IncomingMessage): string | undefined {

  if (req.url) {
    const url = new URL(req.url)
    if (verifyAccountAndSecret(url.username, url.password)) return url.username
  }

  if (req.headers.authorization) {
    const [authType, authValue] = req.headers.authorization.split(' ')
    if (authType.toLowerCase() === 'basic') {
      const [account, secret] = atob(authValue).split(':')
      if (verifyAccountAndSecret(account, secret)) return account
    }
    // TODO Implement alternative authorization header based auth such as tokens
  }

  return undefined
}

/**
 * Callback passed to Server constructor for client verification
 *
 * @param info incoming client info
 */
function verifyIlpTransportClient (info: { origin: string, req: IncomingMessage, secure: boolean }): boolean {
  const accountId = authenticateRequest(info.req)
  return Boolean(accountId) && info.secure
}

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

const serverIlpAddress = 'private.server'
const assetCode = 'USD'
const assetScale = 2
const wss = new WebSocket.Server({
  port: 8080,
  verifyClient: verifyIlpTransportClient,
  handleProtocols: handleIlpTransportSubProtocol
})

wss.on('connection', function connection (ws, req) {
  const accountId = authenticateRequest(req)
  const clientAddress = `${serverIlpAddress}.${accountId}`
  const endpoint = new IlpTransport(new WebSocketIlpMessageStream(ws))
  endpoint.handlers.set('*', (request: IlpPrepare) => {
    return Promise.resolve({
      triggeredBy: serverIlpAddress,
      code: Errors.codes.F02_UNREACHABLE,
      message: '',
      data: Buffer.allocUnsafe(0)
    })
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
