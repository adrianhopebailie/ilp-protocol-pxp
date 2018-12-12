import * as http from 'http'
import { EventEmitter } from 'events'
import { GrpcTransport } from './stream'
import { AccountInfo } from './account'
import {
  Server,
  ServerCredentials,
  Metadata
} from 'grpc'
import { TransportService, DuplexStream, GrpcAuthCallback } from './grpc'
import { default as createLogger, Logger } from 'ilp-logger'
const log = createLogger('grpc-transport-server')

export interface GrpcTransportServerOptions {
  secure?: boolean
}

export interface GrpcTransportServerServices {
  log?: Logger,
  authenticate?: GrpcAuthCallback
}
export interface GrpcTransportServerListenOptions {
  port: number
}

export class GrpcTransportServer extends EventEmitter {
  protected _log: Logger
  protected _grpc: Server
  protected _authenticate: GrpcAuthCallback
  constructor (options: GrpcTransportServerOptions, services: GrpcTransportServerServices) {
    super()
    this._log = services.log || log
    this._authenticate = services.authenticate || skipAuthentication
  }
  public async listen (options: GrpcTransportServerListenOptions): Promise<void> {

    if (!options.port) {
      throw new Error(`Port must be provided`)
    }
    this._grpc = new Server()
    this._grpc.addService(TransportService.service, { MessageStream: this._handleNewStream.bind(this) })
    this._grpc.bind(String(options.port), ServerCredentials.createInsecure())
    this._grpc.start()
    log.info(`gRPC server listening on ${options.port}`)
    this.emit('listening')
  }

  _handleNewStream (stream: DuplexStream) {

    if (!this._authenticate(stream.metadata)) {
      this._log.debug(`rejecting incoming connection - failed authentication`)
      // TODO - Reject properly
      stream.cancel()
      return
    }

    const accountId = String(stream.metadata.get('accountId')[0].toString())
    const log = createLogger('grpc-server:' + accountId)
    const accountInfo = {
      relation: stream.metadata.get('accountRelation')[0],
      assetCode: stream.metadata.get('accountAssetCode')[0],
      assetScale: Number(stream.metadata.get('accountAssetScale')[0])
    } as AccountInfo

    this.emit('connection', new GrpcTransport(stream, { accountId, accountInfo },{ log }))
  }

}

/**
 * Just checks that there is an account id.
 * @param requestMetadata The metadat from the gRPC channel
 */
function skipAuthentication (requestMetadata: Metadata): boolean {

  if (requestMetadata.get('accountId').length !== 1) {
    return false
  }
  log.warn(`Skipped authentication of incoming connection from account: ${requestMetadata.get('accountId')[0]}`)
  return true
}
