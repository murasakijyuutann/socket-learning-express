# AWS Setup for LiveParty Watch App

## 1. First AWS Architecture

Your first AWS architecture can be kept simple:

```text
Browser
   │
   │ WebSocket
   ▼
API Gateway WebSocket
   │
   ▼
Lambda
   │
   ▼
DynamoDB
   │
   └──── API Gateway Management API
                    │
                    ▼
             Other browsers

Monitoring:
CloudWatch
```

You do **not** initially need RDS, SQS, EventBridge, Kubernetes, etc.

---

## 2. Create the AWS Foundation

Before creating application services, set up the basic environment:

```text
AWS Account
   │
   ├── IAM
   ├── Region
   └── Infrastructure project
          CDK / Terraform
```

Choose one region, for example:

```text
ap-northeast-1
Tokyo
```

For a learning project, it is useful to eventually use **AWS CDK or Terraform** rather than creating everything manually through the AWS Console.

However, creating the first version manually once is fine because it helps you understand how the pieces connect.

---

## 3. Create API Gateway WebSocket API

This becomes the entry point for all real-time communication.

Your browser connects to something conceptually like:

```text
wss://xxxxx.execute-api.ap-northeast-1.amazonaws.com/prod
```

API Gateway keeps the WebSocket connection alive.

Configure routes such as:

```text
$connect
$disconnect
$default

JOIN_ROOM
LEAVE_ROOM
CHAT
PLAY
PAUSE
SEEK
SYNC
```

A useful route selection expression could be:

```text
$request.body.action
```

Then the client sends:

```json
{
  "action": "PLAY",
  "roomId": "room123",
  "position": 125.5
}
```

API Gateway sees:

```text
action = PLAY
```

and sends that message to the Lambda associated with the `PLAY` route.

---

## 4. Create Lambda Functions

Lambda replaces your long-running Node.js `ws` event handlers.

Your local server might have:

```js
wss.on("connection", ...)
socket.on("message", ...)
socket.on("close", ...)
```

In AWS that becomes conceptually:

```text
$connect
   ↓
connectHandler Lambda

$disconnect
   ↓
disconnectHandler Lambda

PLAY / CHAT / SEEK / etc.
   ↓
messageHandler Lambda
```

You do not necessarily need one Lambda per event.

For your project, a simple starting point is:

```text
connectHandler

disconnectHandler

messageHandler
   ├── JOIN_ROOM
   ├── CHAT
   ├── PLAY
   ├── PAUSE
   ├── SEEK
   └── SYNC
```

---

## 5. Create DynamoDB

This is where your local:

```js
const rooms = new Map();
```

eventually moves.

Separate the state conceptually into two kinds.

### Connection State

```text
connectionId
userId
roomId
connectedAt
```

Example:

```text
connectionId: ABC123
userId: user42
roomId: party001
```

### Room State

```text
roomId
hostUserId
playing
position
updatedAt
```

Example:

```text
roomId       = party001
hostUserId   = user42
playing      = true
position     = 153.6
updatedAt    = 2026-09-15T22:00...
```

For learning purposes, you can begin with two tables:

```text
Connections
Rooms
```

Later, if you want to study DynamoDB more deeply, you can redesign this into a single-table model.

---

## 6. Implement `$connect`

When someone opens the Watch Party:

```text
Browser
   ↓
API Gateway
   ↓
$connect Lambda
   ↓
store connectionId
   ↓
DynamoDB
```

AWS automatically provides a unique:

```text
connectionId
```

for that WebSocket connection.

Example:

```json
{
  "connectionId": "dGh7abcd123="
}
```

You store that ID because you need it later to send messages back to that specific browser.

This replaces the actual `socket` object you currently keep inside:

```js
Set<socket>
```

---

## 7. Implement Room Joining

Suppose the browser sends:

```json
{
  "action": "JOIN_ROOM",
  "roomId": "abc123"
}
```

Flow:

```text
Browser
   ↓
API Gateway
   ↓
messageHandler
   ↓
DynamoDB

connection ABC
belongs to room abc123
```

Now DynamoDB lets you answer:

```text
Who is currently in room abc123?
```

This replaces what your local:

```js
rooms.get(roomId)
```

used to do.

---

## 8. Implement Broadcasting

This is one of the most important AWS concepts.

Locally you might do:

```js
for (const client of room.clients) {
    client.send(message);
}
```

With API Gateway WebSocket, Lambda does not possess those socket objects.

Instead:

```text
Lambda
   ↓
query DynamoDB

room abc123
   ↓
connection A
connection B
connection C
```

Then Lambda uses the **API Gateway Management API**:

```text
postToConnection(A)
postToConnection(B)
postToConnection(C)
```

Conceptually:

```text
PLAY
 ↓
Lambda
 ↓
Find everyone in room
 ↓
API Gateway Management API
 ↓
A
B
C
```

This is the AWS equivalent of:

```js
socket.send(...)
```

---

## 9. Give Lambda the Correct IAM Permissions

Lambda needs permission to do things such as:

```text
read DynamoDB
write DynamoDB
delete DynamoDB records
send messages to WebSocket connections
write CloudWatch logs
```

Conceptually:

```text
Lambda
   │
   ├── dynamodb:GetItem
   ├── dynamodb:PutItem
   ├── dynamodb:Query
   ├── dynamodb:DeleteItem
   │
   └── execute-api:ManageConnections
```

Do not simply give Lambda administrator access.

Use only the permissions it actually needs.

---

## 10. Implement `$disconnect`

When a browser closes or loses its connection:

```text
Browser disappears
   ↓
API Gateway
   ↓
$disconnect
   ↓
disconnect Lambda
   ↓
delete connectionId from DynamoDB
```

Otherwise your database will accumulate dead connections.

You still need to account for abnormal or stale connections because `$disconnect` is best-effort rather than something you should treat as an absolute guarantee.

When `postToConnection()` tells you a connection no longer exists, remove that stale record as well.

---

## 11. Add CloudWatch

CloudWatch should be present from the start.

You want to see events such as:

```text
CONNECT user123
JOIN room001
PLAY room001
SEEK room001 125.3
DISCONNECT user123
```

and errors such as:

```text
DynamoDB query failed
Invalid message
Unauthorized PLAY
GoneException
```

Architecture:

```text
Lambda
   ↓
CloudWatch Logs

API Gateway
   ↓
CloudWatch metrics/logging
```

This teaches the **operations side** of cloud development, not just application coding.

---

## 12. Add Authentication with Cognito

Once the basic system works, add:

```text
Amazon Cognito
```

Conceptually:

```text
User
 ↓
login
 ↓
Cognito
 ↓
JWT
 ↓
WebSocket connection
 ↓
$connect
 ↓
validate identity
```

Then:

```text
connectionId
   ↓
userId
```

can be trusted.

You can also enforce rules such as:

```text
only host may send PLAY
only room members may CHAT
user may only join permitted room
```

---

## 13. Frontend Hosting Is Separate

Your frontend can eventually be hosted with:

```text
React / Next frontend
       ↓
       S3
       ↓
   CloudFront
```

If you use Next.js, you may choose another deployment approach depending on whether you need server-side functionality.

The key distinction is:

```text
CloudFront/S3
= frontend delivery

API Gateway WebSocket
= real-time communication
```

They serve different purposes.

---

## 14. First AWS Version

A good first complete AWS version is:

```text
                     Cognito
                        │
                        ▼
Browser ──WebSocket──> API Gateway
                        │
                        ▼
                      Lambda
                        │
                   ┌────┴────┐
                   ▼         ▼
              DynamoDB   CloudWatch
                   │
                   ▼
          Management API
                   │
                   ▼
               Browsers
```

You do **not** need these yet:

```text
RDS
SQS
EventBridge
EKS
ECS
Step Functions
ElastiCache
```

unless your application develops a genuine reason to use them.

---

## 15. Recommended Build Order

1. Finish the raw Node.js WebSocket version locally:
   - rooms
   - JOIN
   - CHAT
   - PLAY
   - PAUSE
   - SEEK
   - disconnect

2. Create an AWS region/IAM setup and CloudWatch logging.

3. Create the **API Gateway WebSocket API**.

4. Create `$connect`, `$disconnect`, and application routes.

5. Create Lambda handlers.

6. Create DynamoDB connection/room storage.

7. Connect Lambda to DynamoDB.

8. Implement API Gateway `postToConnection()` broadcasting.

9. Test several browser tabs joining one room.

10. Add authentication with Cognito.

11. Add CloudFront/S3 or your chosen frontend deployment.

12. Recreate everything with **CDK or Terraform** so the architecture is reproducible.

---

## 16. Core Mental Model

The most important transformation is:

```text
LOCAL

socket object
+
Map
+
Node server
```

becomes:

```text
AWS

connectionId
+
DynamoDB
+
API Gateway WebSocket
+
Lambda
```

If you understand **why these replacements happen**, you understand the core of the AWS WebSocket architecture rather than merely memorizing AWS product names.
