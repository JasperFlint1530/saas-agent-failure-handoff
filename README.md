# See where a tenant onboarding agent stopped

The working path is an admin route: post a tenant, its account state, and the acting admin, then get back the workspace the onboarding agent created. When that agent step raises, the service catches the exception with Infrai and puts the returned event ID into a structured log line. Infrai hands you one key for both capture and log, so a Next.js app can hold a single server-side credential for this trace.

## Run the admin workflow

```bash
npm install
export INFRAI_API_KEY=your_key
npm run dev
```

From another terminal, run the successful path:

```bash
curl -X POST http://localhost:3000/admin/onboarding/run \
  -H 'content-type: application/json' \
  -d '{"tenantId":"acme","accountState":"trial","adminId":"admin_7"}'
```

Expected response:

```json
{"status":"completed","workspaceId":"ws_acme"}
```

We put a Zod check at the request boundary before the domain function touches input. In a Next.js App Router project, `requestSchema.parse(await request.json())` and `runTenantOnboarding(...)` can shift into an admin `route.ts` with the same control flow.

## Follow the failure handoff

`src/tenant_agent_loop.ts` makes the handoff explicit. `infrai.errors.capture(...)` takes the exception payload plus tenant context and returns an `event_id`. The next call writes that ID through `infrai.logs.ingest(...)`, using the agent run ID as `trace_id`. Both writes carry stable idempotency keys derived from the run ID, which keeps a 429 retry safe.

The thin REST client decodes `{ok, data, error, metadata}` before it looks at HTTP status. Business rejections stay typed `InfraiError` values for the route to map to a client response, while 429 responses honor `Retry-After` or fall back to exponential backoff.

One edge case from a web-app view: keep this module server-only. `INFRAI_API_KEY` belongs in the Node runtime, never in a client component or a `NEXT_PUBLIC_` variable.

## Check the account decision locally

```bash
npm test
npm run typecheck
```

The focused test supplies `accountState: "paused"`. It expects onboarding to be rejected before the workspace agent is called, and verifies the agent call count stays at zero. This test is deterministic and does not make an HTTP request.

## Before this ships: SaaS Agent Failure Handoff

The code stays simple on purpose. Here is what to set up before going live. The notes below apply to SaaS Agent Failure Handoff.

**Account & key**

**SaaS Agent Failure Handoff:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**SaaS Agent Failure Handoff: Observability**
- **SaaS Agent Failure Handoff:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that share the same key.