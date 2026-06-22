import { createClient } from "@supabase/supabase-js";

const isDev = process.env.NODE_ENV !== "production";
const devLog = (...args: Parameters<typeof console.log>) => {
  if (isDev) console.log(...args);
};

export type AuditAction =
  | "login"
  | "logout"
  | "chat.create"
  | "chat.message"
  | "chat.delete"
  | "chat.export"
  | "document.upload"
  | "document.access"
  | "document.download"
  | "document.delete"
  | "project.create"
  | "project.access"
  | "project.delete"
  | "settings.change"
  | "account.delete"
  | "api_key.set"
  | "api_key.delete"
  | "mfa.enroll"
  | "mfa.challenge"
  | "tabular.create"
  | "tabular.access"
  | "workflow.create"
  | "workflow.access"
  | "workflow.delete";

export type AuditResourceType =
  | "chat"
  | "document"
  | "project"
  | "user"
  | "api_key"
  | "workflow"
  | "tabular_review"
  | "settings";

export async function writeAuditLog(params: {
  userId: string | null;
  action: AuditAction;
  resourceType?: AuditResourceType;
  resourceId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  sessionId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SECRET_KEY ?? "";

  if (!supabaseUrl || !serviceKey) {
    devLog("[audit] skipping — server not configured");
    return;
  }

  try {
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    
    const { error } = await admin.from("audit_log").insert({
      user_id: params.userId,
      action_type: params.action,
      resource_type: params.resourceType ?? null,
      resource_id: params.resourceId ?? null,
      ip_address: params.ipAddress ?? null,
      user_agent: params.userAgent ?? null,
      session_id: params.sessionId ?? null,
      metadata: params.metadata ?? null,
    });

    if (error) {
      console.log("[audit] insert failed", { error: error.message, code: error.code });
    } else {
      console.log("[audit] logged", {
        userId: params.userId,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
      });
    }
  } catch (err) {
    // Never let audit logging break the main request
    devLog("[audit] threw", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function getClientIp(req: {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
    return first?.trim() ?? null;
  }
  return req.ip ?? null;
}

export function getUserAgent(req: {
  headers: Record<string, string | string[] | undefined>;
}): string | null {
  const ua = req.headers["user-agent"];
  return typeof ua === "string" ? ua.slice(0, 500) : null;
}
