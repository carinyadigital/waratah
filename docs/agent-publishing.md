# Agent publishing — staging drafts over REST

**CNT01-03.** How a content agent stages a draft in Payload. The agent authenticates as the `agent` role (`src/collections/Users.ts`), which can stage drafts and cannot publish (`src/access/agentCannotPublish.ts`, ADR-0001).

## Authentication

The agent is a user in the `users` collection with `useAPIKey: true`. Requests carry the key in the `Authorization` header:

```
Authorization: users API-Key <key>
```

The key is created and rotated in the Admin UI on the agent's user record. Rotation policy lives in `config/connections.yaml` under the `payload` connection.

## Staging a draft

```bash
curl -X POST "$PAYLOAD_URL/api/posts?draft=true" \
  -H "Authorization: users API-Key $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Soil carbon, measured",
    "slug": "soil-carbon-measured",
    "_status": "draft",
    "content": { "root": { "type": "root", "children": [] } }
  }'
```

Same shape for `recipes` at `/api/recipes`. Updating an existing draft:

```bash
curl -X PATCH "$PAYLOAD_URL/api/posts/$ID?draft=true" \
  -H "Authorization: users API-Key $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "content": { ... } }'
```

## What the role can and cannot do

| Action | Result |
|---|---|
| Create a draft (`_status: "draft"`) | Allowed. Version history attributes it to the agent identity. |
| Update a draft's `content` | Allowed |
| Set `_status: "published"` | **Denied** — server-side, collection-level access, any API surface |
| Create a document born published | **Denied** |
| Update any published document | **Denied** — the query constraint puts published documents out of reach |
| Update `title` or `slug` | **Stripped** — field-level lock; the rest of the update proceeds |
| Delete anything | **Denied** |

These are asserted continuously by `tests/access/agent-publish.test.ts`, which CI runs on every PR and on the merge commit (CNT03).

## Provenance and revocation

Every staged draft's version records `updatedBy` — the agent identity — set server-side in a `beforeChange` hook. Rotating or disabling the agent's API key stops the agent without touching any other identity.

## No Local API path

Payload's Local API skips access control by default. No Local API endpoint is exposed to agents — see ADR-0004 and ADR-0003. Agents reach content over REST only, as the `agent` role, subject to the access rules above.
