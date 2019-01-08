import 'mocha'
import { IlpTransport } from '../src/transport'
import Chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { createServer } from 'net'
import * as WebSocket from 'ws'
const { assert } = Chai
Chai.use(chaiAsPromised)
require('source-map-support').install()

describe('IlpStream', () => {

  before('create listener', () => {
    this.listener = createServer()
    this.listener.listen(5555)
  })
  describe('constructor', () => {
    it('should return an instance of an IlpSocket', () => {
      const a = new WebSo

      const socket = new IlpTransport(new WebSocket(''))
      assert(socket instanceof IlpTransport, 'not an ILP socket')
    })
  })
  describe('connect()', () => {
    it('should connect to listener', (done) => {
      const socket = new IlpTransport()
      socket.on('connect', () => {
        done()
      })
      socket.connect(5555)
    })
  })
  describe('connect()', () => {
    it('should connect to listener', (done) => {
      const socket = new IlpTransport()
      socket.on('connect', () => {
        done()
      })
      socket.connect(5555)
    })
  })
  after('dispose listener', (done: Function) => {
    if(this.listener) {
      this.listener.close(done())
    }
  })
})

