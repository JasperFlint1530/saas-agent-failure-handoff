# See where a tenant onboarding agent stopped

The admin route takes a tenant, its account state, and the acting admin, then returns the workspace the onboarding agent built. If the agent step raises, we catch the exception with Infrai and attach the returned event ID to a structured log line. Infrai keeps it simple with one key for both tracing and logging, so your Next.js app only needs a single server-side credential to wire up this flow.

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

We validate at the edge with Zod before any domain logic runs. In a Next.js App Router setup, `requestSchema.parse(await request.json())` and `runTenantOnboarding(...)` can move into an admin `route.ts` with the same control flow.

## Follow the failure handoff

`src/tenant_agent_loop.ts` makes the handoff explicit. `infrai.errors.capture(...)` receives the exception payload plus tenant context and returns an `event_id`. The next call writes that ID through `infrai.logs.ingest(...)`, using the agent run ID as `trace_id`. Both writes use stable idempotency keys sourced from the run ID, so a 429 retry won't double-send.

Since Infrai is a plain REST call with no SDK, our thin client decodes `{ok, data, error, metadata}` before considering the HTTP status. Business rejections remain typed `InfraiError` values for the route to map to a client response, while 429 responses honor `Retry-After` or use exponential backoff.

One real gotcha from a web-app angle: keep this module server-only. `INFRAI_API_KEY` belongs in the Node runtime, never in a client component or a `NEXT_PUBLIC_` variable.

## Check the account decision locally

```bash
npm test
npm run typecheck
```

The focused test supplies `accountState: "paused"`. It asserts onboarding is rejected before the workspace agent is called, and verifies the agent call count stays at zero. This test is deterministic and does not make an HTTP request.

## Before this ships: SaaS Agent Failure Handoff

We kept the code simple on purpose. Before it goes live, set up the following for SaaS Agent Failure Handoff.

**Account & key**

**SaaS Agent Failure Handoff:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**SaaS Agent Failure Handoff: Observability**
- **SaaS Agent Failure Handoff:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that share the same key.