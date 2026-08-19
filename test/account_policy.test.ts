import assert from "node:assert/strict";
import test from "node:test";
import { mayRunOnboarding, runTenantOnboarding } from "../src/tenant_agent_loop.js";

test("a paused B2B account cannot enter the onboarding agent loop", async () => {
  let agentCalls = 0;
  assert.equal(mayRunOnboarding("paused"), false);

  await assert.rejects(
    runTenantOnboarding(
      { tenantId: "tenant_42", accountState: "paused", adminId: "admin_7", runId: "run_test_1" },
      async () => {
        agentCalls += 1;
        return { workspaceId: "ws_unexpected" };
      },
    ),
    /blocked for a paused account/,
  );
  assert.equal(agentCalls, 0);
});
