# ilp-transport
> Generic transport protocol for ILP packets

[![NPM Package](https://img.shields.io/npm/v/ilp-transport.svg?style=flat)](https://npmjs.org/package/ilp-transport)
[![CircleCI](https://circleci.com/gh/interledgerjs/ilp-transport.svg?style=shield)](https://circleci.com/gh/interledgerjs/ilp-transport)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)

This is a simple protocol for exchanging ILP packets in request/reply pairs. Packets are sent in a message prefixed by a fixed length batch id and a fixed length correlation id.

Messages can be sent over any underlying stream where either the stream has an existing message framing protocol (e.g. WebSockets), guarantees packet ordering and delivery (e.g. TCP).

While untested, an implementation may reject messages that are too large to fit into a single datagram and therefor send messages over a protocol such as UDP. The maximum size of ILP packets should allow for this in theory.

## Messages

The protocol is very simple. Each message has 2 fixed length headers and an ILP packet as payload. The headers are a fixed length `batch id` used to group messages into batches and a fixed length `correlation id` used to match requests and replies.

## Request/Reply

All messages are exchanged as request/reply pairs. A request will always contain an _ILP Prepare_ packet and a reply will always contain either an _ILP Fulfill_ or an _ILP Reject_ packet.

Requests and replies are correlated based on the `batch id` AND `correlation id`. A request will have the same `batch id` and same `correlation id` as the corresponding reply with the exception of the *least significant bit* in the correlation id.

The least significant bit in the correlation id of a request is always `0 (zero)` and the least significant bit in the correlation id of a reply is always `1 (one)`. All other bits are the same.

E.g. If the first 8 bytes (correlation id and batch id) of a request are `0x00 0x00 0x00 0x01 0x00 0x00 0x00 0x00` then the first 8 bytes of the reply will be `0x00 0x00 0x00 0x01 0x00 0x00 0x00 0x01`.

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

Endpoints SHOULD use a value of `1` (`0x00000001`) for the `correlation id` of a the first message sent in a batch and increment this for each subsequent message. Endpoints MAY reset the `correlation id` to `1` when the batch changes.

### Batch ID

The `batch id` is an *unsigned 32-bit integer*. 

By default, the `batch id` for a new session is `1` however the endpoints may negotiate a different starting batch during session establishment.

Either endpoint may change the current batch by sending a frame with a new `batch id`, however the `batch id` MUST be larger than the previous `batch id`.

Upon receiving a request with a new `batch id` an endpoint must send any subsequent requests in the same session using the same `batch id` or MAY use a new, higher, `batch id`.

Endpoinst SHOULD start a new batch when establishing a new session.

### Sessions

When two endpoints create a connection they must establish a session.

The protocol for establishing the session may use messages exchanged using this protocol or may be a seperate handshake protocol (e.g. an HTTP handshake for WebSockets).

At a minimum the following session properties must be established between the endpoints before the session is active and payment packets can be exchanged:

  1. The identity of the counter-party endpoint
  2. The relation between the two endpoints (`parent`, `child` or `peer`)
  3. The asset and scale for amounts sent in subsequent ILP packets
  4. The current batch id

### ILP Address

An endpoint SHOULD be aware of its own ILP address so that it can populate the `triggeredBy` property of any ILP Reject packets it generates. If it generates an ILP Reject packet before it has established its own address it SHOULD use the value `peer`.

## Design Choices

The following design choices were made based on previous work and experiments such as BTP and ILP-GRPC.

### Correlation ID

Using a 32-bit unsigned integer allows a large number of messages to be exchanged before the id must be reset. Given that the uniuqe identity of a message also considers the current `batch id` this seems large enough but is also small enough to be expressed natively in all programming languages.

For example, reading the batch and correlation ids from the message in Javascript are very efficient:
```js
  const batch = message.readUInt32BE(0)
  const id = message.readUInt32BE(4)
  const packet = message.slice(8)
```

### Request/Reply Indicator Bit

Rather than waste a full byte to indicate the message type (required to differentiate between a request and an unsolicited reply) the protocol simply uses one bit from the correlation id.

The result is that messages are also easily classifiable by human-eye as all requests will have an even number as the `correlation id` and all replies will have an odd number.

The operations to convert between the request and reply forms of the `correlation id` are also very efficient.

> *TODO* - Is there a need to differentiate between message types? Is the packet type byte in the ILP packet payload sufficient?

### Idempotency

Most request/reply protocols define requests as being idempotent however this add a lot of complexity to the implementation. Rather this protocol only requires an endpoint to track in-flight requests (i.e. not yet complete).

### Sub-Protocols

In comparison to previous bi-lateral protocols `ilp-transport` does not support sub-protocols. In contrast it favours simplicity and only transmits ILP packets.

Where sub-protocols were used previously they were always bi-lateral and therefor could be replaced with either:
  1. A separate, protocol specific connection
  2. A protocol implemented using ILP packets and the `peer.*` address-space

### Transfers, Settlements and Batches

BTP defined a separate message type for transfers which adds complexity but very little value over using a sub-protocol or a an ILP packet-based protocol for exchanging the same messages.

This protocol does away with this and proposes to use a ILP packets.

A `BTP.Transfer` message is replaced with an ILP Prepare where the address prefix is `peer.settle` and the amount is the settlement amount.

Specializations of this can be defined for different settlement systems and identified by using additional address segments. For example and XRP Paychan settlement protocol could send packets with the address `peer.settle.xrp-paychan`.

The condition and fulfillment use static values of `SHA256(32 * 0x00)` and `32 * 0x00` respectively although alternative protocols MAY use different values.

Settlement protocols MAY also define a mechanism to exchange reconciliation information such that they are able to agree on the correct settlement amount or simply track gains and losses from differences between cleared and settled amounts.

The `batch id` in each message is a useful way to group exchanges for this purpose. 

A settlement protocol can, for example, initiate settlement for a specific batch by first moving onto a new `batch id` and allowing all in-flight requests from the old batch to complete. It then calculates the settlement amount for the previous batch and sends a settlement for that amount indicating to the other endpoint which batch it is settling and thereby allowing that endpoint to reconcile the settlement against its own total for that batch.