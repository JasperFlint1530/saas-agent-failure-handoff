import { randomUUID } from "node:crypto";
import { infrai } from "./infrai_client.js";

export type AccountState = "trial" | "active" | "paused" | "closed";

export type OnboardingCommand = {
  tenantId: string;
  accountState: AccountState;
  adminId: string;
  runId: string;
};

export type AgentStep = (tenantId: string) => Promise<{ workspaceId: string }>;

export function mayRunOnboarding(state: AccountState): boolean {
  return state === "trial" || state === "active";
}

export async function runTenantOnboarding(
  command: OnboardingCommand,
  provisionWorkspace: AgentStep,
): Promise<{ status: "completed"; workspaceId: string }> {
  if (!mayRunOnboarding(command.accountState)) {
    throw new Error(`Onboarding is blocked for a ${command.accountState} account`);
  }

  try {
    const result = await provisionWorkspace(command.tenantId);
    return { status: "completed", workspaceId: result.workspaceId };
  } catch (cause) {
    const exception = cause instanceof Error ? cause.stack ?? cause.message : String(cause);
    const captured = await infrai.errors.capture({
      title: "Tenant onboarding agent failed",
      message: cause instanceof Error ? cause.message : String(cause),
      exception,
      level: "error",
      fingerprint: ["tenant-onboarding", "provision-workspace"],
      context: {
        tenantId: command.tenantId,
        accountState: command.accountState,
        adminId: command.adminId,
        runId: command.runId,
      },
      service: "saas-onboarding-agent",
      idempotency_key: `capture:${command.runId}`,
    });

    await infrai.logs.ingest({
      entries: [{
        timestamp: new Date().toISOString(),
        level: "error",
        message: "Onboarding run linked to captured error",
        service: "saas-onboarding-agent",
        trace_id: command.runId,
        attributes: {
          tenantId: command.tenantId,
          adminId: command.adminId,
          eventId: captured.event_id,
          errorGroupId: captured.error_group_id,
        },
      }],
      idempotency_key: `log:${command.runId}`,
    });
    throw cause;
  }
}

export function newRunId(): string {
  return randomUUID();
}
