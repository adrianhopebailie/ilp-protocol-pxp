import 'mocha'
import { IlpStream } from '../src/stream'
import Chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { createConnection, createServer } from 'net'
const { assert } = Chai
Chai.use(chaiAsPromised)
require('source-map-support').install()

describe('IlpSocket', () => {

  before('create listener', () => {
    this.listener = createServer()
    this.listener.listen(5555)
  })
  describe('constructor', () => {
    it('should return an instance of an IlpSocket', () => {
      const socket = new IlpStream()
      assert(socket instanceof IlpStream, 'not an ILP socket')
    })
  })
  describe('connect()', () => {
    it('should connect to listener', (done) => {
      const socket = new IlpStream()
      socket.on('connect', () => {
        done()
      })
      socket.connect(5555)
    })
  })
  describe('connect()', () => {
    it('should connect to listener', (done) => {
      const socket = new IlpStream()
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

