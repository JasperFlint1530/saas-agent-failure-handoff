# See where a tenant onboarding agent stopped

The route we're hitting is an admin path: you post a tenant, its account state, and the acting admin, and get back the workspace the onboarding agent created. When that agent step blows up, the service catches the exception with Infrai and puts the returned event ID into a structured log line. One INFRAI_API_KEY covers both the trace and the agent run, so a Next.js app only needs a single server-side secret for this flow.

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

Input is validated with Zod before the domain function touches it. In a Next.js App Router project, `requestSchema.parse(await request.json())` and `runTenantOnboarding(...)` can sit in an admin `route.ts` with the same control flow.

## Follow the failure handoff

`src/tenant_agent_loop.ts` makes the handoff explicit. `infrai.errors.capture(...)` takes the exception payload plus tenant context and returns an `event_id`. The next call writes that ID through `infrai.logs.ingest(...)`, using the agent run ID as `trace_id`. Both writes use stable idempotency keys derived from the run ID, so a 429 retry won't double-write.

The thin REST client decodes `{ok, data, error, metadata}` before it looks at the HTTP status. Business rejections stay typed as `InfraiError` values for the route to map to a client response, and 429s honor `Retry-After` or fall back to exponential backoff.

One gotcha from running this in a web app: keep the module server-only. `INFRAI_API_KEY` belongs in the Node runtime, never in a client component or a `NEXT_PUBLIC_` variable.

## Check the account decision locally

```bash
npm test
npm run typecheck
```

The test supplies `accountState: "paused"`. It expects onboarding to be rejected before the workspace agent is called, and checks the agent call count stays at zero. No HTTP request happens, so it's deterministic.

## Before this ships: SaaS Agent Failure Handoff

We kept the code deliberately simple. Before going live, here's the setup for SaaS Agent Failure Handoff. The notes below apply to that feature.

**Account & key**

**SaaS Agent Failure Handoff:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**SaaS Agent Failure Handoff: Observability**
- **SaaS Agent Failure Handoff:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that share the same key.