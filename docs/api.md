# REST API & webhooks

Dispatch has a JSON API over HTTPS for automating your workspace, and webhooks that notify your systems about events in real time. The web app itself uses the same API, so everything you can do in the UI can be done programmatically.

- [Authentication](#authentication)
- [Conventions](#conventions)
- [Resources](#resources)
- [Webhooks](#webhooks)

## Authentication

Create an API key in **Workspace → Settings → Integrations → API keys**. This needs the *Manage integrations* permission. Keys look like `dsp_…` and are shown once.

Send the key as a bearer token:

```bash
curl https://mail.example.com/api/w/acme/conversations?box=inbox \
  -H "Authorization: Bearer dsp_your_key"
```

- A key belongs to **one workspace** and acts **as the member who created it**, with that member's role and inbox access. Create a dedicated member (e.g. "Automation") with a narrow custom role for integrations.
- Keys can have an expiry date and can be revoked at any time. Dispatch stores only a hash.
- Requests with a missing, invalid, expired or revoked key get `401`.

## Conventions

**Base URL.** All workspace endpoints live under your instance URL and the workspace slug (the `acme` in `/w/acme/inbox`):

```text
https://<DOMAIN>/api/w/<slug>/...
```

**Requests.** Send JSON bodies with `Content-Type: application/json`. IDs are UUIDs, and timestamps are ISO 8601 strings in UTC (`2026-09-27T14:05:00.000Z`).

**Responses and status codes.**

| Status | Meaning |
| --- | --- |
| `200` / `201` | Success (`201` when something was created) |
| `400` | Invalid JSON or failed validation (`validation_error` includes `details`) |
| `401` | Not authenticated |
| `403` | Authenticated, but missing a permission, or the workspace is read-only |
| `404` | Doesn't exist, or you don't have access to it |
| `409` | Conflict with the current state |
| `429` | Rate limited, retry later |
| `500` | Server error. Safe to retry idempotent requests |

**Errors** always have the same shape:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Invalid request",
    "details": [{ "path": ["subject"], "message": "Too long" }]
  }
}
```

Match on `code`, not on `message`: messages are for humans and may change.

**Pagination.** Large collections are cursor-paginated. Pass `limit` (max 100) and follow `nextCursor` until it's `null`:

```bash
curl "https://mail.example.com/api/w/acme/conversations?box=inbox&limit=50" -H "Authorization: Bearer $KEY"
# → { "items": [ ... ], "nextCursor": "eyJ0IjoiMjAyNi0wOS0yN..." }

curl "https://mail.example.com/api/w/acme/conversations?box=inbox&limit=50&cursor=eyJ0IjoiMjAyNi0wOS0yN..." -H "Authorization: Bearer $KEY"
```

Cursors are opaque, so don't build them yourself. Smaller collections such as contacts use `limit` and `offset`.

## Resources

The main resources and what you can do with them:

| Resource | Endpoints | Operations |
| --- | --- | --- |
| **Conversations** | `/conversations`, `/conversations/{id}` | List by box (`inbox`, `assigned`, a specific inbox, label or team) with filters (`status`, `assignee`, `unread`, `q`). Read a full thread. Compose a new email (`POST`). Update with `PATCH`: status, assignees, labels, snooze, team, priority, read/starred, trash/spam. |
| **Messages** | `/conversations/{id}/messages`, `/messages/{id}` | Reply, reply all or forward (`POST`), optionally scheduled with `sendAt`. Read a single message. |
| **Comments** | `/conversations/{id}/comments`, `/comments/{id}` | Add internal comments (HTML; mentions notify teammates), edit and delete them. |
| **Tasks** | `/tasks`, `/tasks/{id}` | List with filters (`assignee`, `status`, `conversationId`, `due`), create, update and complete tasks. |
| **Contacts** | `/contacts`, `/contacts/{id}` | Search and list, create, update, merge, import and export CSV. |
| **Labels** | `labelIds` / `addLabelIds` / `removeLabelIds` on conversations | Apply and remove labels. Labels are managed in Settings. |
| **Members** | `/members` | List the workspace's members (e.g. to resolve assignee IDs). |
| **Search** | `/search` | Full-text search across conversations you can access. |

Example: close a conversation, assign it and add a label.

```bash
curl -X PATCH "https://mail.example.com/api/w/acme/conversations/$CONVERSATION_ID" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{ "status": "closed", "addAssigneeIds": ["'$USER_ID'"], "addLabelIds": ["'$LABEL_ID'"] }'
```

Example: add an internal comment.

```bash
curl -X POST "https://mail.example.com/api/w/acme/conversations/$CONVERSATION_ID/comments" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{ "body": "<p>Refund approved, replying now.</p>" }'
```

> **Detailed reference.** The API is evolving quickly. The exact request and response schemas are documented next to each route handler in [`src/app/api/w/[slug]`](../src/app/api/w/%5Bslug%5D), with request validation in zod schemas. Endpoints not listed above (drafts, presence, events, uploads, ...) exist mainly for the web app and may change without notice.

## Webhooks

Webhooks send an HTTPS `POST` to your endpoint when something happens in the workspace. Create them in **Workspace → Settings → Integrations → Webhooks**. Choose the events, and copy the signing secret (`whsec_…`).

### Events

| Event | When |
| --- | --- |
| `conversation.created` | A new conversation starts (incoming email or composed message) |
| `conversation.closed` | A conversation is closed |
| `conversation.reopened` | A closed conversation is reopened (manually or by a new reply) |
| `conversation.assigned` | Assignees change |
| `conversation.labeled` | A label is added |
| `message.received` | An inbound email arrives |
| `message.sent` | An outbound email was delivered to the SMTP server |
| `comment.created` | An internal comment is posted |
| `task.created` | A task is created |
| `task.completed` | A task is marked done |

### Payload

Every delivery has the same envelope:

```json
{
  "id": "evt_4mJ1uQyX0pZk2cR8",
  "event": "conversation.assigned",
  "createdAt": "2026-09-27T14:05:00.000Z",
  "data": {
    "conversationId": "5f0c6b8e-...",
    "...": "event-specific fields"
  }
}
```

Use `id` to deduplicate: a retried delivery carries the same `id`. Keep `data` handling tolerant, because new fields may be added at any time.

### Verifying signatures

Each request carries a signature header:

```text
X-Dispatch-Signature: t=1790530000,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd
```

`v1` is the hex-encoded HMAC-SHA256 of `"<t>.<raw request body>"`, keyed with your webhook secret. To verify:

1. Parse `t` and `v1` from the header.
2. Compute the HMAC over `t + "." + rawBody`. Use the **raw** bytes, not re-serialized JSON.
3. Compare in constant time, and reject if `t` is more than 5 minutes away from your clock.

**Node.js**

```js
import crypto from "node:crypto"

export function verifyDispatchSignature(rawBody, header, secret, toleranceSec = 300) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")))
  const t = Number(parts.t)
  if (!t || !parts.v1) return false
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex")
  const a = Buffer.from(expected, "hex")
  const b = Buffer.from(parts.v1, "hex")
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// Express: keep the raw body for verification
app.post("/webhooks/dispatch", express.raw({ type: "application/json" }), (req, res) => {
  const ok = verifyDispatchSignature(req.body.toString("utf8"), req.get("X-Dispatch-Signature") ?? "", process.env.DISPATCH_WEBHOOK_SECRET)
  if (!ok) return res.status(400).send("invalid signature")
  const event = JSON.parse(req.body)
  // ... handle event.event / event.data, then respond quickly
  res.sendStatus(200)
})
```

**Python**

```python
import hashlib, hmac, time

def verify_dispatch_signature(raw_body: bytes, header: str, secret: str, tolerance: int = 300) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
    try:
        t = int(parts["t"])
        received = parts["v1"]
    except (KeyError, ValueError):
        return False
    if abs(time.time() - t) > tolerance:
        return False
    expected = hmac.new(secret.encode(), f"{t}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, received)

# Flask
# @app.post("/webhooks/dispatch")
# def dispatch_webhook():
#     if not verify_dispatch_signature(request.get_data(), request.headers.get("X-Dispatch-Signature", ""), SECRET):
#         abort(400)
#     event = request.get_json()
#     return "", 200
```

### Delivery and retries

Each delivery is a `POST` with these headers:

| Header | Value |
| --- | --- |
| `Content-Type` | `application/json` |
| `User-Agent` | `Dispatch-Webhooks/1.0` |
| `X-Dispatch-Event` | The event name, e.g. `conversation.assigned` |
| `X-Dispatch-Delivery` | Unique delivery ID. It stays the same across retries of that delivery. |
| `X-Dispatch-Signature` | `t=<unix>,v1=<hex>` (see above) |

- **Success:** any `2xx` response within **10 seconds**. Redirects are not followed, so use the final URL. Do slow work asynchronously after acknowledging.
- **Retries:** a failed delivery (non-2xx, timeout, connection error) is retried after **1 minute, 5 minutes, 30 minutes, 2 hours and 6 hours**, for 6 attempts in total. After that it's marked as failed. Your handler must be idempotent, so deduplicate on the event `id` or `X-Dispatch-Delivery`.
- **Auto-disable:** after **50 consecutive failed attempts**, the webhook is disabled and the event is recorded in the audit log. Re-enable it in Settings once your endpoint works again.
- **Ordering:** deliveries aren't strictly ordered. Use `createdAt`, or fetch the current state from the API when order matters.
- **Inspection:** each webhook's recent deliveries, with status codes and response bodies, are listed in its settings.
- **Private networks:** on instances with *Block private networks* enabled, webhook URLs must resolve to public IP addresses.
