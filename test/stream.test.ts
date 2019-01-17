import 'mocha'
import { IlpMessageStream, getReadBuffer, getMessageSize } from '../src/stream'
import * as Chai from 'chai'
import * as chaiAsPromised from 'chai-as-promised'
import { MockIlpMessageStream, MockEndpointStream, BufferedStream } from './mocks/stream';
import { PassThrough, Duplex } from 'stream';
import { IlpMessage } from '../src/message';
const { assert, expect } = Chai
Chai.use(chaiAsPromised)
require('source-map-support').install()

// getReadBuffer
describe('getReadBuffer', () => {
  it('should return the chunk if there are no more bytes to read (size:10)', () => {
    const chunk = Buffer.alloc(1)
    const cursor = 10
    const buffer = Buffer.alloc(10)
    expect(getReadBuffer(buffer, cursor, chunk)).to.be.equal(chunk)
  })
  it('should return the chunk if there are no more bytes to read (size:1)', () => {
    const chunk = Buffer.alloc(1)
    const cursor = 1
    const buffer = Buffer.alloc(1)
    expect(getReadBuffer(buffer, cursor, chunk)).to.be.equal(chunk)
  })
  it('should return the chunk if there are no more bytes to read (size:0)', () => {
    const chunk = Buffer.alloc(1)
    const cursor = 0
    const buffer = Buffer.alloc(0)
    expect(getReadBuffer(buffer, cursor, chunk)).to.be.equal(chunk)
  })
  it('should return the unread bytes if chunk is empty (cursor: 0)', () => {
    const chunk = Buffer.alloc(0)
    const cursor = 0
    const buffer = Buffer.from('1234567890')
    expect(getReadBuffer(buffer, cursor, chunk).toString()).to.be.equal(buffer.slice(cursor).toString())
  })
  it('should return the unread bytes if chunk is empty (cursor: 1)', () => {
    const chunk = Buffer.alloc(0)
    const cursor = 1
    const buffer = Buffer.from('1234567890')
    expect(getReadBuffer(buffer, cursor, chunk).toString()).to.be.equal(buffer.slice(cursor).toString())
  })
  it('should return the unread bytes if chunk is empty (cursor: 9)', () => {
    const chunk = Buffer.alloc(0)
    const cursor = 9
    const buffer = Buffer.from('1234567890')
    expect(getReadBuffer(buffer, cursor, chunk).toString()).to.be.equal(buffer.slice(cursor).toString())
  })
})

// getMessageSize
describe('getMessageSize', () => {
  it('should return undefined if unread bytes is < 10', () => {
    const cursor = 0
    const buffer = Buffer.alloc(9)
    expect(getMessageSize(buffer, cursor)).to.be.undefined
  })

  it('should return undefined if length is > 0 and remainingBytes is < length (length: 1)', () => {
    const cursor = 0
    const buffer = Buffer.alloc(10)
    buffer[9] = 1
    expect(getMessageSize(buffer, cursor)).to.be.undefined
  })

  it('should return undefined if length is > 0 and remainingBytes is < length (length: 1, cursor: 1)', () => {
    const cursor = 1
    const buffer = Buffer.alloc(11)
    buffer[10] = 1
    expect(getMessageSize(buffer, cursor)).to.be.undefined
  })

  it('should return undefined if length is > 0 and remainingBytes is < length (length: 10)', () => {
    const cursor = 0
    const buffer = Buffer.alloc(19)
    buffer[9] = 10
    expect(getMessageSize(buffer, cursor)).to.be.undefined
  })

  it('should return undefined if length is > 0 and remainingBytes is < length (length: 127)', () => {
    const cursor = 0
    const buffer = Buffer.alloc(136)
    buffer[9] = 127
    expect(getMessageSize(buffer, cursor)).to.be.undefined
  })

  it('should return undefined if (length & 0x80) > 0 and actualLength is < length (length: 1)', () => {
    const cursor = 0
    const buffer = Buffer.alloc(10)
    buffer[9] = 0x81
    expect(getMessageSize(buffer, cursor)).to.be.undefined
  })

  it('should return undefined if (length & 0x80) > 0 and actualLength is < length (length: 2)', () => {
    const cursor = 0
    const buffer = Buffer.alloc(11)
    buffer[9] = 0x82
    expect(getMessageSize(buffer, cursor)).to.be.undefined
  })

  it('should return 11 (buffer: 11)', () => {
    const cursor = 0
    const buffer = Buffer.alloc(11)
    buffer[9] = 1
    expect(getMessageSize(buffer, cursor)).to.be.equal(11)
  })

  it('should return 11 (buffer: 256)', () => {
    const cursor = 0
    const buffer = Buffer.alloc(256)
    buffer[9] = 1
    expect(getMessageSize(buffer, cursor)).to.be.equal(11)
  })

  it('should return 11 (cursor: 245, buffer: 256)', () => {
    const cursor = 0
    const buffer = Buffer.alloc(256)
    buffer[9] = 1
    expect(getMessageSize(buffer, cursor)).to.be.equal(11)
  })

  it('should return undefined for length of 128', () => {
    const cursor = 0
    const buffer = Buffer.alloc(255)
    buffer[9] = 128
    buffer[10] = 128
    expect(getMessageSize(buffer, cursor)).to.be.undefined
  })

  it('should return undefined for actual length < 128', () => {
    const cursor = 0
    const buffer = Buffer.alloc(255)
    buffer[9] = 129
    buffer[10] = 127
    expect(getMessageSize(buffer, cursor)).to.be.undefined
  })

  it('should return 139 (buffer: 139)', () => {
    const cursor = 0
    const buffer = Buffer.alloc(139)
    buffer[9] = 129
    buffer[10] = 128
    expect(getMessageSize(buffer, cursor)).to.be.equal(139)
  })

  it('should return 268 (buffer: 268)', () => {
    const cursor = 0
    const buffer = Buffer.alloc(268)
    buffer[9] = 130
    buffer[10] = 1
    buffer[11] = 0
    expect(getMessageSize(buffer, cursor)).to.be.equal(268)
  })

  it('should return 65549 (buffer: 65549)', () => {
    const cursor = 0
    const buffer = Buffer.alloc(65549)
    buffer[9] = 131
    buffer[10] = 1
    buffer[11] = 0
    buffer[12] = 0
    expect(getMessageSize(buffer, cursor)).to.be.equal(65549)
  })
})

describe('IlpMessageStream', () => {

  describe('constructor', () => {
    it('should create an instance of an IlpMessageStream', () => {
      const stream = new IlpMessageStream(new PassThrough())
      expect(stream).to.be.instanceOf(IlpMessageStream)
    })
  })
  describe('write', () => {
    it('should serialize an IlpMessage and write to the underlying stream', () => {
      const buffer = new BufferedStream()
      const stream = new IlpMessageStream(buffer)
      stream.write({
        batch: 1,
        id: 1,
        payload: Buffer.from('ffffff', 'hex')
      } as IlpMessage)
  
      const message = buffer.chunks.shift()
      expect(message).to.be.instanceOf(Buffer)
      expect(message.toString('hex')).to.be.equal('0000000100000001ffffff')
    })
  })
  describe('read', () => {
    it('should deserialize an IlpMessage and from the underlying stream', (done) => {
      const buffer = new BufferedStream()
      const stream = new IlpMessageStream(buffer)
      stream.on('data', (message) => {
        expect(message).to.haveOwnProperty('batch')
        expect(message).to.haveOwnProperty('id')
        expect(message).to.haveOwnProperty('payload')
        expect(message.batch).to.be.equal(1)
        expect(message.id).to.be.equal(1)
        expect(message.payload.toString('hex')).to.be.equal('ff01ff')
        done()
      })
      buffer.chunks.push(Buffer.from('0000000100000001ff01ff','hex'))
      buffer.flush()
    })
  })

  // describe('request', () => {
  //   it('should send an ILP prepare and get back an ILP fulfill', async () => {
  //     const transport = new IlpTransport(new MockIlpMessageStream())
  //     const reply = transport.request({
  //       amount: '10',
  //       destination: 'test.mock',
  //       executionCondition: Buffer.alloc(32),
  //       expiresAt: new Date(Date.now() + 30000),
  //       data: Buffer.alloc(0)
  //     })
  //     expect(reply).to.eventually.have.property('fulfillment')
  //     expect(reply).to.eventually.have.property('data')
  //   })
  //   it('should attempt to send an ILP prepare with negative expiry and throw', async () => {
  //     const transport = new IlpTransport(new MockIlpMessageStream())
  //     expect(async () => {
  //       await transport.request({
  //         amount: '10',
  //         destination: 'test.mock',
  //         executionCondition: Buffer.alloc(32),
  //         expiresAt: new Date(Date.now() - 1000),
  //         data: Buffer.alloc(0)
  //       })
  //     }).to.throw
  //   })
  //   it('should attempt to send an ILP prepare with long expiry and throw', async () => {
  //     const transport = new IlpTransport(new MockIlpMessageStream(), { maxTimeoutMs: 10000 })
  //     expect(async () => {
  //       await transport.request({
  //         amount: '10',
  //         destination: 'test.mock',
  //         executionCondition: Buffer.alloc(32),
  //         expiresAt: new Date(Date.now() + 15000),
  //         data: Buffer.alloc(0)
  //       })
  //     }).to.throw
  //   })
  //   it('should send multiple of the same ILP prepare and get back fulfills', async () => {
  //     const transport = new IlpTransport(new MockIlpMessageStream())
  //     const prepare = {
  //       amount: '10',
  //       destination: 'test.mock',
  //       executionCondition: Buffer.alloc(32),
  //       expiresAt: new Date(Date.now() + 30000),
  //       data: Buffer.alloc(0)
  //     }
  //     const replies = await Promise.all([
  //       transport.request(prepare),
  //       transport.request(prepare),
  //       transport.request(prepare),
  //       transport.request(prepare),
  //       transport.request(prepare)
  //     ])
  //     replies.forEach(i => expect(i).to.have.property('fulfillment'))
  //   })
  //   it('should send multiple of the same ILP prepare and get back rejects', async () => {
  //     const transport = new IlpTransport(new MockIlpMessageStream())
  //     const prepare = {
  //       amount: '10',
  //       destination: 'test.mock.reject',
  //       executionCondition: Buffer.alloc(32),
  //       expiresAt: new Date(Date.now() + 30000),
  //       data: Buffer.alloc(0)
  //     }
  //     const replies = await Promise.all([
  //       transport.request(prepare),
  //       transport.request(prepare),
  //       transport.request(prepare),
  //       transport.request(prepare),
  //       transport.request(prepare)
  //     ])
  //     replies.forEach(i => expect(i).to.have.property('code'))
  //   })
  // })
})

