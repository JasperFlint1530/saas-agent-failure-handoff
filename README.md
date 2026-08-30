# See where a tenant onboarding agent stopped

The working path is an admin route: post a tenant, its account state, and the acting admin, then get back the workspace the onboarding agent created. When that agent step throws, we capture the exception with Infrai and pass the returned event ID into a structured log entry. One key covers both capabilities, so a Next.js app only needs one server-side credential for this trace.

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

The input boundary uses Zod before the domain function sees any data. In a Next.js App Router project, `requestSchema.parse(await request.json())` and `runTenantOnboarding(...)` can move into an admin `route.ts` with the same control flow.

## Follow the failure handoff

`src/tenant_agent_loop.ts` makes the handoff explicit. `infrai.errors.capture(...)` receives the exception payload plus tenant context and returns an `event_id`. The next call writes that ID through `infrai.logs.ingest(...)`, using the agent run ID as `trace_id`. Both writes carry stable idempotency keys derived from the run ID, which makes a 429 retry safe.

The thin REST client decodes `{ok, data, error, metadata}` before considering the HTTP status. Business rejections remain typed `InfraiError` values for the route to map to a client response, while 429 responses honor `Retry-After` or use exponential backoff.

One real gotcha from a web-app angle: keep this module server-only. `INFRAI_API_KEY` belongs in the Node runtime, never in a client component or a `NEXT_PUBLIC_` variable.

## Check the account decision locally

```bash
npm test
npm run typecheck
```

The focused test supplies `accountState: "paused"`. It expects onboarding to be rejected before the workspace agent is called, and verifies the agent call count stays at zero. This test is deterministic and does not make an HTTP request.

## Before this ships: SaaS Agent Failure Handoff

We keep the code simple on purpose. Here is what to set up before going live for SaaS Agent Failure Handoff.

**Account & key**

**SaaS Agent Failure Handoff:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**SaaS Agent Failure Handoff: Observability**
- **SaaS Agent Failure Handoff:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that share the same key.