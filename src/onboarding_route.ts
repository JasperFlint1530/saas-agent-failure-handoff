import { createServer } from "node:http";
import { z } from "zod";
import { InfraiError } from "./infrai_client.js";
import { newRunId, runTenantOnboarding } from "./tenant_agent_loop.js";

const requestSchema = z.object({
  tenantId: z.string().min(1),
  accountState: z.enum(["trial", "active", "paused", "closed"]),
  adminId: z.string().min(1),
  simulateAgentFailure: z.boolean().default(false),
});

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.method !== "POST" || request.url !== "/admin/onboarding/run") {
    response.writeHead(404).end(JSON.stringify({ error: "Route not found" }));
    return;
  }

  try {
    const input = requestSchema.parse(await readJson(request));
    const result = await runTenantOnboarding(
      { tenantId: input.tenantId, accountState: input.accountState, adminId: input.adminId, runId: newRunId() },
      async (tenantId) => {
        if (input.simulateAgentFailure) throw new Error("Workspace policy check rejected the plan");
        return { workspaceId: `ws_${tenantId}` };
      },
    );
    response.writeHead(200).end(JSON.stringify(result));
  } catch (error) {
    if (error instanceof z.ZodError) {
      response.writeHead(400).end(JSON.stringify({ error: "Invalid request", issues: error.issues }));
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.writeHead(status).end(JSON.stringify({ error: error.message, code: error.code }));
      return;
    }
    response.writeHead(422).end(JSON.stringify({ error: error instanceof Error ? error.message : "Onboarding failed" }));
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Admin onboarding route listening on http://localhost:${port}`));
