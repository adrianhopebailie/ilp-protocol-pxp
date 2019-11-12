# Interledger Packet Exchange Protocol (PXP)

> Generic transport protocol for exchanging ILP packets across process
> boundaries

This is a simple protocol for exchanging ILP packets in request/reply pairs.
Packets are sent inside a frame containing a fixed length (32 bit) id and
optional meta-data.

The protocol is inspired by and takes ideas from [gRPC](), [WAMP](),
[rsocket](), and [HTTP/3]() and can be used over any underlying byte stream
(transport).

## Assumptions

PXP assumes:

- one-to-one communication
- non-proxied communication. Or if proxied, the semantics and assumptions are
  preserved across the proxy.
- no state preserved across transport protocol sessions by the protocol

Key words used by this document conform to the meanings in RFC 2119.

Byte ordering is big endian for all fields.

## Transport

PXP uses a lower level transport protocol to carry PXP frames. A transport
protocol MUST provide the following:

- Unicast Reliable Delivery.
- Connection-Oriented
- Some form of error checking is assumed to be in use either at the transport
  protocol or at each lower layer hop. But no protection against malicious
  corruption is assumed.

An implementation MAY "close" a transport connection due to protocol processing.
When this occurs, it is assumed that the connection will have no further frames
sent and all frames will be ignored.

PXP as specified here has been designed for WebSockets and QUIC.

PXP assumes that the underlying transport is able to encapsulate complete PXP
frames. Although the frame start and termination can be determined based on the
length indicators in the encoding, both WebSockets and QUIC provide a convenient
binary envelope for PXP frames.

## Framing

The protocol is very simple as it leverages some of the existing fields in an
ILP packet for protocol semantics.

Frames either carry a correlation identifier as the first 4 octets OR leverage
request/response matching features of the underlying transport.

Each frame carries an ILP packet and variable length transport layer meta-data.

PXP does not bind itself to an underlying message transport OR session
establishment protocol but can use whatever is appropriate for the situation.

For example, client-server connections can leverage the existing session
establishment through an HTTP handshake and the efficient message framing of
WebSockets. Where-as a host-to-host connection may use a QUIC connection with
session establishment leveraging the TLS handshake.

## Versions

PXP is versioned and the version used is negotiated during the transport layer
handshake.

The identifier `ilp/1` identifies this version of the protocol and is passed as
a sub-protocol identifier when using WebSockets as the transport. The following
is a non-normative example request:

```http
GET /ilp HTTP/1.1
Host: server.example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==
Sec-WebSocket-Protocol: ilp/1
Sec-WebSocket-Version: 13
```

The following is a non-normative example response:

```http
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: HSmrc0sMlYUkAGmm5OPpG2HaGWk=
Sec-WebSocket-Protocol: ilp/1
```

When using QUIC the identifier should be used as the ALPN per
[RFC 7301](https://tools.ietf.org/html/rfc7301) to identify ILP over PXP as the
application layer protocol being used.

## Frame

Each frame is an OER encoded SEQUENCE of 2 or 3 fields, an optional identifier,
an ILP packet and meta-data.

Where it is required, the identifier is a fixed length `correlation id` used to
match requests and replies. The `metadata` is a variable length field that
follows the ILP packet carrying any host-to-host transport meta-data such as a
trace context.

| Field          | Type             | Size     | Description                               |
| -------------- | ---------------- | -------- | ----------------------------------------- |
| Correlation Id | UInt32BE         | 4 bytes  | Id of the request/reply pair              |
| Payload        | ILP Packet       | Variable | An ILP Prepare, Fulfill or Reject packet  |
| Meta Data      | Var Octet String | Variable | Zero or more raw bytes carrying meta-data |

## Encoding

In keeping with other protocols in the ILP stable, the framing protocol uses OER
encoding.

When using QUIC, the stream identifiers are used to correlate requests and
replies so the correlation-id is not required.

The following ASN.1 definition describes the frame formats for use over both
WebSockets and QUIC:

```asn1
InterledgerPacketExchange
DEFINITIONS
AUTOMATIC TAGS ::=
BEGIN

IMPORTS
    UInt32
    FROM GenericTypes

    InterledgerPacket
    FROM InterledgerPacket
;

InterledgerWebsocketFrame ::= SEQUENCE {
    -- Frame identifier
    correlationId UInt32,

    -- Interledger Packet
    packet InterledgerPacket,

    -- Meta data
    metaData OCTET STRING (SIZE (0..32739))
}

InterledgerQuicFrame ::= SEQUENCE {
    -- Interledger Packet
    packet InterledgerPacket,

    -- Meta data
    metaData OCTET STRING (SIZE (0..32739))
}

END
```

## Request/Reply

All messages are exchanged as request/reply pairs. A request will always contain
an _ILP Prepare_ packet and a reply will always contain either an _ILP Fulfill_
or an _ILP Reject_ packet.

### WebSockets

Requests and replies are correlated based on the `correlation id`. A request
will have the same `correlation id` as the corresponding reply.

### QUIC

Requests and responses are correlated by using the same stream in much the same
way as HTTP/3 leverages QUIC streams for request life-cycle.

Either the client or server sends a request on a new bidirectional QUIC stream.
The sender MUST send only a single request on a given stream. The receiver sends
a single final response.

Since we have restricted our payload to only 3 possible types we can use the
type indicator byte from the payload to differentiate between a request (ILP
Prepare payload) and a reply (ILP Fulfill or ILP Reject payload). This makes it
easy for implementations to differentiate between a new request and an
unsolicited reply.

## Expiry

Requests expire based upon the value of the `expiresAt` field in the ILP packet.

An endpoint should only send a reply to a request as long as the expiry
timestamp in the original request has not passed.

## Correlation ID

The `correlation id` is an _unsigned 32-bit integer_ that must be unique per
message. A `correlation id` value MAY be reused in subsequent frames after the
last frame to use it has **completed** (see below).

An implementation SHOULD maximise the time between re-use of a `correlation id`
on the same connection.

## In-flight vs Completion

A request is considered _complete_ as soon as any of the following occur:

- The sending endpoint receives a reply to the request
- The request expires

Until a request is complete it is _in-flight_.

### WebSockets

If an endpoint receives a request with the same `correlation id` as a request
that is in-flight it MUST discard the request. Once a request is complete an
endpoint SHOULD accept another request with the same `correlation id`.

Endpoints SHOULD avoid re-using the same `correlation id` during the same
session or at least leave the maximum possible time between re-use of a
`correlation id` to avoid stale responses that should have expired being
confused as responses to subsequent requests.

### QUIC

A PXP request/response exchange fully consumes a bidirectional QUIC stream.

After sending a request, a sender MUST close the stream for sending. Senders
MUST NOT make stream closure dependent on receiving a response to their request.
After sending a final response, the receiver MUST close the stream for sending.
At this point, the QUIC stream is fully closed.

If a receiver receives a second request on the same stream it MUST discard the
request.

If the sender determines a sent request to have expired before a reply is
received it MUST reset and abort the request stream.

> TODO: Define PXP errors or re-use ILP errors? Latter preferred but doesn't
> make sense here.

## Sessions and Authentication

When two endpoints create a connection they must establish an authenticated
session before exchanging any ILP packets.

The protocol for establishing the session may use messages exchanged using this
protocol or may be a separate handshake protocol (e.g. an HTTP handshake for
WebSockets) at the transport level.

A new PXP connection is always in one of two authentication states;
**authenticated** or **not authenticated**. If it has been established on the
back of an already authenticated transport then it will be in the authenticated
state from the outset otherwise it is in the **not authenticated** state upon
establishment of the connection.

If a connection is **not authenticated** then the first packet sent by the
client MUST be an authentication request packet, an ILP Prepare packet with the
address `peer.auth` as described below in [`peer.auth`](#peerauth).

If a server receives an incoming connection that is not authenticated it MUST
close the underlying transport if anything but an authentication request packet
is received as the first packet on the connection.

It MAY return an ILP Reject packet in a response frame first, providing details
of the authentication failure if the authentication scheme chosen by the peers
supports this.

If the underlying transport is disconnected and reconnected the endpoints MUST
authenticate again and establish a new session.

## Store and Forward Replies

It is possible that a connection is lost and re-established while requests are
in-flight.

Implementations MUST store replies until they are either sent successfully or
expire. If a new connection is established and authenticated any replies that
are still valid (the request has not expired) and not sent MUST be sent
immediately.

## ILP Address

An endpoint SHOULD be aware of its own ILP address so that it can populate the
`triggeredBy` property of any ILP Reject packets it generates. If it generates
an ILP Reject packet before it has established its own address it SHOULD use the
value `peer`.

If an endpoint receives an ILP Reject from a peer and the value of the
`triggeredBy` property is `peer` it SHOULD replace this with the address of the
originating endpoint (if it is known) before forwarding the packet on to another
connection.

## Meta Data

The protocol supports sending meta-data with each frame. This is primarily for
cases where the protocol is used inside a distributed system and allows the
frame to carry data such as a trace context, or to specify routing information
if the protocol is used via a broker.

Meta-data is sent as a variable length octet string therefor a single zero byte
is sent if no meta-data is present.

## Design Choices

The following design choices were made based on previous work and experiments
such as BTP and ILP-GRPC.

### Fuzzy Abstractions

The protocol is intentionally crossing some lines of abstraction for the sake
efficiency. Specifically the transport layer must look into the ILP packet
payload for the expiry and message type.

Experiments done so far with more distinct separation between the transport
layer and the ILP layer suggest that this is over-engineering and that a lot of
functionality is repeated unnecessarily.

As an example, tracking an expiry for a request message that is different to the
expiry of the ILP Prepare payload is pointless and adds unnecessary complexity.
Likewise, defining a unique set of error codes for the transport layer adds
little value.

### Correlation ID

Using a 32-bit unsigned integer allows a large number of messages to be
exchanged before the id must be rolled over.

It is also small enough to be expressed natively in all programming languages
which makes implementations significantly simpler.

For example, reading the correlation ids from the message in the browser using a
`DataView`:

```js
var socket = new WebSocket('ws://127.0.0.1:8081')
socket.binaryType = 'arraybuffer'
connection.onmessage = function(e) {
  var data = e.data
  var dv = new DataView(data)
  var id = dv.getUint32(0)
}
```

### Idempotency

Most request/reply protocols define requests as being idempotent however this
adds a lot of complexity to the implementation. Rather this protocol only
requires an endpoint to track in-flight requests (i.e. not yet complete).

Given that ILP packets should only be in flight for a very short time this seems
like a fair compromise over complex request tracking logic.

### Sub-Protocols

In comparison to previous bi-lateral protocols PXP does not support
sub-protocols. In contrast it favours simplicity and only transmits ILP packets.

Where sub-protocols were used previously they were always bi-lateral and
therefor could be replaced with either:

1. A separate, sub-protocol specific connection
2. A protocol implemented using ILP packets and the `peer.*` address-space (see
   below)

### Transfers and Settlement

BTP defined a separate message type for transfers which adds complexity but very
little value over using a sub-protocol or an ILP packet-based protocol for
exchanging the same messages.

This protocol does away with this and proposes to use ILP packets.

A `BTP.Transfer` message is replaced with an ILP Prepare where the address
prefix is `peer.settle` and the amount is the settlement amount.

Specializations of this can be defined for different settlement systems and
identified by using additional address segments. For example an XRP Paychan
settlement protocol could send packets with the address
`peer.settle.xrp-paychan`.

The condition and fulfillment use static values of `SHA256(32 * 0x00)` and
`32 * 0x00` respectively although alternative protocols MAY choose to use
different values.

### peer.\* addresses

This proposal deprecates some functions of BTP in favour of messages in ILP
packets using the `peer.*` address space. These new "sub-protocols" SHOULD use
the following hardcoded condition and fulfillment values unless alternatives are
determined for a specific use case:

- fulfillment:
  `0x00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00`
- condition:
  `0x66 68 7a ad f8 62 bd 77 6c 8f c1 8b 8e 9f 8e 20 08 97 14 85 6e e2 33 b3 90 2a 59 1d 0d 5f 29 25`

#### peer.auth

Some message transports allow for the a session to be established during
connection establishment. For example:

- WebSockets have an HTTP handshake that allows both parties to exchange session
  information prior to sending messages over the new connection.
- QUIC connections can be secured using client and server certificates and the
  session information can be linked to the server and client identities.

Where this is not possible or desirable a session can be established by using an
exchange of packets in the `peer.auth` address space.

The endpoint requesting the session sends an ILP Prepare with the `destination`
of `peer.auth`, an amount of `0`, the static `executionCondition` value of
`0x66 68 7a ad f8 62 bd 77 6c 8f c1 8b 8e 9f 8e 20 08 97 14 85 6e e2 33 b3 90 2a 59 1d 0d 5f 29 25`,
an appropriate `expiresAt` value (e.g. 10 seconds from now).

The value of the `data` field in the packet is agreed between the parties ahead
of time and may be a shared secret, a bearer token or any other value that the
receiving endpoint will use to authenticate the sending endpoint.

If the auth request is successful the receiving endpoint sends back an ILP
Fulfill response. The `fulfillment` is all zeros and the `data` MAY contain an
IL-DCP response including the address of the sending endpoint, and the asset
scale and asset code of subsequent packets exchanged in the session.

#### peer.settle

See [Transfers and Settlement](#transfers-and-settlement) above.
