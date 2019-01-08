const crypto = require('crypto')

const SIZE = 1000000
const KEYS = 300000
const LOOPS = 30

function toBytesInt32 (num) {
  arr = new ArrayBuffer(4); // an Int32 takes 4 bytes
  view = new DataView(arr);
  view.setUint32(0, num, false); // byteOffset = 0; litteEndian = false
  return Buffer.from(arr);
}

function randomKey () {
  let random = crypto.randomBytes(4).readUInt32BE(0)
  while(random > SIZE) {
    random = random / 10
  }
  random.toFixed(0)
}

const data = {
  'number': {
    map: new Map(),
    keys: []
  },
  'string': {
    map: new Map(),
    keys: []
  },
  'buffer': {
    map: new Map(),
    keys: []
  }
}
console.log(`hydrating maps with ${SIZE} values...`)
for(let i = 0; i < SIZE; i++) {
  const v = crypto.randomBytes(4)
  data['number'].map.set(i, v)
  data['string'].map.set(String(i), v)
  data['buffer'].map.set(toBytesInt32(i), v)
}

console.log(`create ${KEYS} random test keys...`)
for(let i = 0; i < KEYS; i++) {
  const random = randomKey()
  data['number'].keys.push(random)
  data['string'].keys.push(String(random))
  data['buffer'].keys.push(toBytesInt32(random))
}

Object.keys(data).map((key) => {
  console.log(`testing ${key} keys...`)
  const map = data[key].map
  const keys = data[key].keys
  let start = Date.now()
  for(let j = 0; j < LOOPS; j++) {
    for(let i = 0; i < keys.length; i++) {
      let v = map.get(keys[i])
    }  
  }
  console.log(`... ${Date.now() - start} ms to get ${keys.length * LOOPS} values`)

  start = Date.now()
  for(let j = 0; j < LOOPS; j++) {
    for(let i = 0; i < keys.length; i++) {
      map.set(keys[i], crypto.randomBytes(4))
    }
  }
  console.log(`... ${Date.now() - start} ms to set ${keys.length * LOOPS} values`)  
})
