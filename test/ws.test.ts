import 'mocha'
import { IlpTransport } from '../src/transport'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import { createServer } from './mocks/ws-server';
import * as WebSocket from 'ws'
import { WebSocketIlpMessageStream } from '../src/ws';
const { assert, expect } = Chai
Chai.use(chaiAsPromised)
require('source-map-support').install()

describe('IlpTransport over WebSocketIlpMessageStream', () => {

  beforeEach('create mock websocket server', (done) => {
    this.server = createServer(8080, {
      users: {
        alice: 'password',
        bob: 'secret'
      }
    })
    const ws = new WebSocket('http://alice:password@localhost:8080', 'ilp-transport')
    ws.on('open', () => {
      this.stream = new WebSocketIlpMessageStream(ws)
      done()
    })
  })
  afterEach('close server', (done) => {
    this.server.close(done)
  })
  describe('constructor', () => {
    it('should return an instance of an IlpTransport with an underlying ws message stream', () => {
      const transport = new IlpTransport(this.stream)
      expect(transport).to.be.instanceOf(IlpTransport)
    })
  })
  describe('request', () => {
    it('should send an ILP prepare and get back an ILP fulfill', async () => {
      const transport = new IlpTransport(this.stream)
      const reply = transport.request({
        amount: '10',
        destination: 'test.mock',
        executionCondition: Buffer.alloc(32),
        expiresAt: new Date(Date.now() + 30000),
        data: Buffer.alloc(0)
      })
      expect(reply).to.eventually.have.property('fulfillment')
      expect(reply).to.eventually.have.property('data')
    })
    it('should send multiple of the same ILP prepare and get back fulfills', async () => {
      const transport = new IlpTransport(this.stream)
      const prepare = {
        amount: '10',
        destination: 'test.mock',
        executionCondition: Buffer.alloc(32),
        expiresAt: new Date(Date.now() + 30000),
        data: Buffer.alloc(0)
      }
      const replies = await Promise.all([
        transport.request(prepare),
        transport.request(prepare),
        transport.request(prepare),
        transport.request(prepare),
        transport.request(prepare)
      ])
      replies.forEach(i => expect(i).to.have.property('fulfillment'))
    })
    it('should send multiple of the same ILP prepare and get back rejects', async () => {
      const transport = new IlpTransport(this.stream)
      const prepare = {
        amount: '10',
        destination: 'test.mock.reject',
        executionCondition: Buffer.alloc(32),
        expiresAt: new Date(Date.now() + 30000),
        data: Buffer.alloc(0)
      }
      const replies = await Promise.all([
        transport.request(prepare),
        transport.request(prepare),
        transport.request(prepare),
        transport.request(prepare),
        transport.request(prepare)
      ])
      replies.forEach(i => expect(i).to.have.property('code'))
    })
  })
})

