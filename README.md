# ilp-transport
> Generic transport protocol for ILP packets

[![NPM Package](https://img.shields.io/npm/v/ilp-transport.svg?style=flat)](https://npmjs.org/package/ilp-transport)
[![CircleCI](https://circleci.com/gh/interledgerjs/ilp-transport.svg?style=shield)](https://circleci.com/gh/interledgerjs/ilp-transport)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)

This is a simple protocol for exchanging ILP packets in request/reply pairs. Packets are sent in an `IlpMessage` which is simply an `IlpPacket` prefixed by a fixed length (64 bit) id.

`IlpMessages` can be sent over any underlying stream where the stream has an existing message framing protocol (e.g. WebSockets).

Alternatively a stream that guarantees packet ordering and delivery (e.g. TCP) can be used since messages can easily be parsed from a continuous byte stream. 

While untested, an implementation could reject messages that are too large to fit into a single datagram and simply send messages over a protocol such as UDP with a single message per datagram. The maximum size of ILP packets should allow for this in theory.

This work is based upon previous protocols and experiments with details on some of the design decisions provided below. Most importantly the protocol does not bind itself to an underlying message transport OR session establishment protocol but can use whatever is appropriate for the situation.

For example, client-server connections can leverage the existing session establishment through an HTTP handshake and the efficient message framing of WebSockets. Where-as a host-to-host connection may use a raw TLS connection with session establishment leveraging the TLS handshake and framing done sim;ky through use aof a message seperator.

## IlpMessages

The protocol is very simple as it leverages some of the existing fields in an ILP packet. It involves the exchange of `IlpMessage`s. Each `IlpMessage` has 2 fixed length headers and an ILP packet as payload. The headers are a fixed length `batch id` used to group messages into batches and a fixed length `correlation id` used to match requests and replies.

| Field          | Type       | Size     | Description                              |
|----------------|------------|----------|------------------------------------------|
| Batch          | UInt32BE   | 4 bytes  | Batch of the message                     |
| Correlation Id | UInt32BE   | 4 bytes  | Id of the request/reply pair             |
| Payload        | ILP Packet | Variable | An ILP Prepare, Fulfill or Reject packet |

The Javascript object representation is as follows (where the payload is expected to be a serialized ILP packet):

```typescript
export interface IlpMessage {
  id: number
  batch: number
  payload: Buffer
}
```

## Request/Reply

All messages are exchanged as request/reply pairs. A request will always contain an _ILP Prepare_ packet and a reply will always contain either an _ILP Fulfill_ or an _ILP Reject_ packet.

Requests and replies are correlated based on the `batch id` AND `correlation id`. A request will have the same `batch id` and same `correlation id` as the corresponding reply.

Since we have restricted our payload to only 3 possible types we can use the type indicator byte from the payload to differentiate between a request (ILP Prepare payload) and a reply (ILP Fulfill or ILP Reject payload). This makes it easy for implementations to differentiate between a new request and an unsolicitied reply.

As you can see from the format of an ILP packet the type is the first byte of the packet and will therefor always be the 9th byte in an `IlpMessage`.

| Field | Type                         | Description                                 |
|-------|------------------------------|---------------------------------------------|
| type  | UInt8                        | ID of the ILP Packet type                   |
| data  | Variable-Length Octet String | Packet contents, prefixed with their length |

## Expiry

Requests expire based upon the value of the `expiresAt` field in the ILP packet. An endpoint should only forward replies to a request as long as they are received before the time indicated by the `expiresAt` value in the corresponding request.

## Correlation ID

The `correlation id` is an *unsigned 32-bit integer* that must be unique per message, per batch for the lifetime of the request.

## In-flight vs Completion

A request is considered *complete* as soon as any of the following occur:
 - The sending endpoint receives a reply to the request
 - The request expires 

Until a request is complete it is *in-flight*.

If an endpoint receives a request with the same `correlation id` and `batch id` as a request that is in-flight it MUST discard the request. Once a request is complete an endpoint MAY accept another request with the same `batch id` and `correlation id` however it MAY also discard this message (this simplifies implementations as an endpoint is only forced to keep track of in-flight requests).

As a result, endpoints SHOULD avoid re-using the same `batch id` and `correlation id` during the same session as these may be silently discarded by the other endpoint.

Endpoints SHOULD use a value of `1` (`0x00000001`) for the `correlation id` of the first message sent in a batch and increment this for each subsequent message. Endpoints MAY reset the `correlation id` to `1` when the batch changes.

## Batch ID

The `batch id` is an *unsigned 32-bit integer*. 

By default, the `batch id` for a new session is `1` however the endpoints may negotiate a different starting batch during session establishment.

Either endpoint may change the current batch by sending a frame with a new `batch id`, however the `batch id` MUST be larger than the previous `batch id`.

Upon receiving a request with a new `batch id` an endpoint must send any subsequent requests in the same session using the same `batch id` or MAY use a new, higher, `batch id`.

Endpoints SHOULD start a new batch when establishing a new session.

## Sessions

When two endpoints create a connection they must establish a session.

The protocol for establishing the session may use messages exchanged using this protocol or may be a seperate handshake protocol (e.g. an HTTP handshake for WebSockets).

At a minimum the following session properties must be established between the endpoints before the session is active and payment packets can be exchanged:

  1. The identity of the counter-party endpoint
  2. The relation between the two endpoints (`parent`, `child` or `peer`)
  3. The asset and scale for amounts sent in subsequent ILP packets
  4. The current batch id

## ILP Address

An endpoint SHOULD be aware of its own ILP address so that it can populate the `triggeredBy` property of any ILP Reject packets it generates. If it generates an ILP Reject packet before it has established its own address it SHOULD use the value `peer`.

If an endpoint receives an ILP Reject from a peer and the value of the `triggeredBy` property is `peer` it should replace this with the address of the originating endpoint if it is known.

## Javascript Interface

One of the goals of this design is to make consuming the interface simple. It is better for implementations to handle complexity than to make the interface itself complex (although other design decisions have been made to also simplify implementations as much as possible).

### Sending

Therefor the interface for sending an `IlpMessage` is simply:

```javascript
endpoint.request(ilpPrepare[, sentCallback])
```
#### Parameters

  - `ilpPrepare`: is an ILP Prepare object
  - `sentCallback`: is an optional callback that is invoked by the underlying stream when the message is sent

#### Return value

The function returns a `Promise` that resolves to either an ILP Fulfill or an ILP Reject object.

#### Description

The caller passes in an ILP Prepare and gets a Promise that resolves to either an ILP Fulfill or ILP Reject object. If the Promise is rejected then the endpoint timed out waiting for the reply.

The caller can optionally provide a callback that is called when the send is complete. The callback has one optional parameter, an `Error` which is present if there was a send error. This matches the signatures of most underlying streams and allows the caller to monitor if requests are being buffered internally or if there are errors sending the request.

### Receiving

Incoming requests are passed to a handler that is registered with the endpoint via the `handlers` property. The `handlers` property is a `Map` where the keys are strings representing ILP addresses, or address prefixes, and the values are *ILP Request Handlers*.

#### ILP Request Handlers

An *ILP Request Handler* is a function that accepts two arguments, an ILP Prepare packet and an optional javascript object of request meta-data (implementation specific). It must return a `Promise` that resolves to either an ILP Fulfill or an ILP Reject object.

```javascript
handleRequest(ilpPrepare, [meta])
```

#### Parameters

  - `ilpPrepare`: is an ILP Prepare object
  - `meta`: is an optional object containing request meta-data such as the request id and batch number (specific to the implementation)

#### Return value

The handler must return a `Promise` that resolves to either an ILP Fulfill or an ILP Reject object

#### Description

When a new request is received by an endpoint it MUST resolve the *ILP Request Handler* to use to handle the request from the handlers stored in `handlers`.

The lookup algorithm MUST use the ILP Address in the `destination` field of the incoming request as the lookup value. The lookup algorithm SHOULD find either an exact match or resolve the handler whose key is the longest match of the prefix of the `destination` field.

If no handler is resolved using either an exact match or prefix match algorithm the handler with the key `*` SHOULD be used.

If no handler is resolved the endpoint MUST raise an `error` event and reject the request with a `T00 - Internal Error`.

### Errors

Endpoints SHOULD implement the EventEmitter interface and emit `error` events when an error occurs.

### Interface Definition

The complete interface of an endpoint is defined using Typescript in: [endpoint.ts](./src/endpoint.ts)

### Default Implementation

The default implementation, [`IlpTransport`](./src/transport.ts), is very simple. It manages request/reply correlation, request expiry and does simple batch management.

The constructor takes any [`stream.Duplex`](https://nodejs.org/api/stream.html#stream_duplex_and_transform_streams) that is operating in [**object mode**](https://nodejs.org/api/stream.html#stream_object_mode) and reads and writes `IlpMessage` javascript objects (as defined by the following Typescript interface):

```typescript
export interface IlpMessage {
  id: number
  batch: number
  payload: Buffer
}
```

#### WebSockets

A wrapper, [WebSocketIlpMessageStream](./src/ws.ts) is provided that wraps a WebSocket connection and satisfies the [`stream.Duplex`](https://nodejs.org/api/stream.html#stream_duplex_and_transform_streams) interface.

## Design Choices

The following design choices were made based on previous work and experiments such as BTP and ILP-GRPC.

### Fuzzy Abstractions

The protocol is intentionally crossing some lines of abstraction for the sake efficiency. Specifically the transport layer must look into the ILP packet payload for the expiry and message type.

Experiments done so far with more distinct separation between the transport layer and the ILP layer suggest that this is over-engineering and that a lot of functionality is repeated unneccessarily.

As an example, tracking an expiry for a request message that is different to the expiry of the ILP Prepare payload is pointless and adds unneccessary complexity. Likewise, defining a unique set of error codes for the transport layer adds little value.

### Correlation ID

Using a 32-bit unsigned integer allows a large number of messages to be exchanged before the id must be rolled over. Given that the unique identity of a message also considers the current `batch id` this seems large enough. 

It is also small enough to be expressed natively in all programming languages which makes implmentations significantly simpler and likely more performant.

For example, reading the batch and correlation ids from the message in Javascript are very efficient:
```js
  const batch = message.readUInt32BE(0)
  const id = message.readUInt32BE(4)
  const packet = message.slice(8)
```

### Idempotency

Most request/reply protocols define requests as being idempotent however this adds a lot of complexity to the implementation. Rather this protocol only requires an endpoint to track in-flight requests (i.e. not yet complete).

Given that ILP packets should only be in flight for a very short time this seems like a fair compromise over complex request tracking logic.

### Sub-Protocols

In comparison to previous bi-lateral protocols `ilp-transport` does not support sub-protocols. In contrast it favours simplicity and only transmits ILP packets.

Where sub-protocols were used previously they were always bi-lateral and therefor could be replaced with either:
  1. A separate, sub-protocol specific connection
  2. A protocol implemented using ILP packets and the `peer.*` address-space (see below)

### Transfers and Settlement

BTP defined a separate message type for transfers which adds complexity but very little value over using a sub-protocol or an ILP packet-based protocol for exchanging the same messages.

This protocol does away with this and proposes to use ILP packets.

A `BTP.Transfer` message is replaced with an ILP Prepare where the address prefix is `peer.settle` and the amount is the settlement amount.

Specializations of this can be defined for different settlement systems and identified by using additional address segments. For example an XRP Paychan settlement protocol could send packets with the address `peer.settle.xrp-paychan`.

The condition and fulfillment use static values of `SHA256(32 * 0x00)` and `32 * 0x00` respectively although alternative protocols MAY choose to use different values.

### Batches

Settlement protocols MAY also define a mechanism to exchange reconciliation information such that they are able to agree on the correct settlement amount or simply track gains and losses from differences between cleared and settled amounts.

The `batch id` in each message is a useful way to group exchanges for this purpose. 

A settlement protocol can, for example, initiate settlement for a specific batch by first moving onto a new `batch id` and allowing all in-flight requests from the old batch to complete. It then calculates the settlement amount for the previous batch and sends a settlement for that amount indicating to the other endpoint which batch it is settling and thereby allowing that endpoint to reconcile the settlement against its own total for that batch.

The current implementation can be configured with a batch cut-over expiry. When the batch changes, any in flight requests must complete before that expiry or they will be rejected.

### peer.* addresses

This proposal deprecates some functions of BTP in favour of messages in ILP packets using the `peer.*` address space. These new "sub-protocols" SHOULD use the following hardcoded condition and fulfillment values unless alternatives are determined for a specific use case:

- fulfillment: `0x00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00`
- condition:   `0x66 68 7a ad f8 62 bd 77 6c 8f c1 8b 8e 9f 8e 20 08 97 14 85 6e e2 33 b3 90 2a 59 1d 0d 5f 29 25`

#### peer.auth

Some message transports allow for the a session to be established during connection establishment. For example: 

  - WebSockets have an HTTP handshake that allows both parties to exchange session information prior to sending messages over the new connection. 
  - TLS connections can be secured using client and server certificates and the session information can be linked to the server and client identities.
  - gRPC has a mechnism for both securing a channel and exchanging channel metadata (session information) 

Where this is not possible or desirable a session can be established by using an exchange of `IlpMessages` in the `peer.auth` address space.

The endpoint requesting the session sends an ILP Prepare with the `destination` of `peer.auth`, an amount of `0`, the static `executionCondition` value of `0x66 68 7a ad f8 62 bd 77 6c 8f c1 8b 8e 9f 8e 20 08 97 14 85 6e e2 33 b3 90 2a 59 1d 0d 5f 29 25`, an appropriate `expiresAt` value (e.g. 10 seconds from now).

The value of the `data` field in the packet is agreed between the parties ahead of time and may be a shared secret, a bearer token or any other value that the receiving endpoint will use to authenticate the sending endpoint.

If the auth request is successful the receiving endpoint sends back an ILP Fulfill response. The `fulfillment` is all zeros and the `data` MAY contain an IL-DCP response including the address of the sending ednpoint, and the asset scale and asset code of subsequent packets exchanged in the session.

#### peer.settle

See [Transfers and Settlement](#transfers-and-settlement) above.