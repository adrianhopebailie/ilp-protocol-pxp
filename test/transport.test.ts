import 'mocha'
import { IlpTransport } from '../src/transport'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import { MockIlpMessageStream } from './mocks/stream';
const { assert, expect } = Chai
Chai.use(chaiAsPromised)
require('source-map-support').install()

describe('IlpTransport', () => {

  before('create mock message stream', () => {
  })
  describe('constructor', () => {
    it('should return an instance of an IlpSocket', () => {
      const transport = new IlpTransport(new MockIlpMessageStream())
      expect(transport).to.be.instanceOf(IlpTransport)
    })
  })
  describe('request', () => {
    it('should send an ILP prepare and get back an ILP fulfill', async () => {
      const transport = new IlpTransport(new MockIlpMessageStream())
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
    it('should attempt to send an ILP prepare with negative expiry and throw', async () => {
      const transport = new IlpTransport(new MockIlpMessageStream())
      expect(async () => {
        await transport.request({
          amount: '10',
          destination: 'test.mock',
          executionCondition: Buffer.alloc(32),
          expiresAt: new Date(Date.now() - 1000),
          data: Buffer.alloc(0)
        })
      }).to.throw
    })
    it('should attempt to send an ILP prepare with long expiry and throw', async () => {
      const transport = new IlpTransport(new MockIlpMessageStream(), { maxTimeoutMs: 10000 })
      expect(async () => {
        await transport.request({
          amount: '10',
          destination: 'test.mock',
          executionCondition: Buffer.alloc(32),
          expiresAt: new Date(Date.now() + 15000),
          data: Buffer.alloc(0)
        })
      }).to.throw
    })
    it('should send multiple of the same ILP prepare and get back fulfills', async () => {
      const transport = new IlpTransport(new MockIlpMessageStream())
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
      const transport = new IlpTransport(new MockIlpMessageStream())
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

