import { Request, Response, NextFunction } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog, getClientIp, getUserAgent } from "../lib/auditLog";

const isDev = process.env.NODE_ENV !== "production";
const devLog = (...args: Parameters<typeof console.log>) => {
  if (isDev) console.log(...args);
};

function summarizeMfaFactors(
  factors: Array<{
    factor_type?: string;
    status?: string;
  }> | null | undefined,
) {
  return (factors ?? []).map((factor) => ({
    type: factor.factor_type ?? "unknown",
    status: factor.status ?? "unknown",
  }));
}

function isLoginMfaBootstrapRoute(req: Request) {
  const path = req.originalUrl.split("?")[0];
  return (
    (req.method === "GET" || req.method === "POST") &&
    (path === "/user/profile" || path === "/users/profile")
  );
}

async function enforceLoginMfaIfEnabled(
  req: Request,
  res: Response,
  admin: SupabaseClient<any, "public", any>,
  token: string,
) {
  if (isLoginMfaBootstrapRoute(req)) return true;

  const { data, error } = await admin
    .from("user_profiles")
    .select("mfa_on_login")
    .eq("user_id", res.locals.userId)
    .maybeSingle();

  if (error) {
    devLog("[auth/mfa] login preference lookup failed", {
      method: req.method,
      path: req.originalUrl,
      userId: res.locals.userId,
      error: error.message,
      code: error.code,
    });
    if (error.code === "42703") return true;
    res.status(500).json({ detail: error.message });
    return false;
  }

  const profile = data as { mfa_on_login?: boolean } | null;
  if (profile?.mfa_on_login !== true) return true;

  const { data: assurance, error: assuranceError } =
    await admin.auth.mfa.getAuthenticatorAssuranceLevel(token);

  if (assuranceError) {
    devLog("[auth/mfa] login assurance lookup failed", {
      method: req.method,
      path: req.originalUrl,
      userId: res.locals.userId,
      error: assuranceError.message,
    });
    res.status(401).json({ detail: assuranceError.message });
    return false;
  }

  if (assurance.nextLevel === "aal2" && assurance.currentLevel !== "aal2") {
    devLog("[auth/mfa] login verification required", {
      method: req.method,
      path: req.originalUrl,
      userId: res.locals.userId,
    });
    res.status(403).json({
      code: "mfa_verification_required",
      detail: "MFA verification required",
    });
    return false;
  }

  return true;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = req.headers.authorization ?? "";
  if (!auth.startsWith("Bearer ")) {
    res.status(401).json({ detail: "Missing or invalid Authorization header" });
    return;
  }
  const token = auth.slice(7).trim();

  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SECRET_KEY ?? "";

  if (!supabaseUrl || !serviceKey) {
    res.status(500).json({ detail: "Server auth is not configured" });
    return;
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
  const { data } = await admin.auth.getUser(token);
  if (!data.user) {
    res.status(401).json({ detail: "Invalid or expired token" });
    return;
  }

res.locals.userId = data.user.id;
  res.locals.userEmail = data.user.email?.toLowerCase() ?? "";
  res.locals.token = token;
  if (!(await enforceLoginMfaIfEnabled(req, res, admin, token))) {
    return;
  }

  // Fire-and-forget audit log for every authenticated request
const fullPath = req.originalUrl.split("?")[0];
  const action = inferAuditAction(req.method, fullPath);
  console.log("[audit] path check", { fullPath, method: req.method, action });
  if (action) {
    writeAuditLog({
      userId: data.user.id,
      action,
      resourceId: extractResourceId(fullPath),
      resourceType: inferResourceType(fullPath) ?? undefined,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
      sessionId: token.slice(-8),
      metadata: {
        method: req.method,
        path: fullPath,
      },
    }).catch((err) => { console.log("[audit] write failed", err instanceof Error ? err.message : String(err)); });
  }

  next();
}

function inferAuditAction(method: string, path: string): import("../lib/auditLog").AuditAction | null {
  if (path.startsWith("/chat") && method === "POST" && path.endsWith("/chat")) return "chat.create";
  if (path.startsWith("/chat") && method === "POST") return "chat.message";
  if (path.startsWith("/chat") && method === "DELETE") return "chat.delete";
  if (path.includes("/export")) return "chat.export";
  if (path.startsWith("/single-documents") && method === "POST") return "document.upload";
  if (path.startsWith("/single-documents") && method === "GET") return "document.access";
  if (path.startsWith("/download")) return "document.download";
  if (path.includes("/documents") && method === "DELETE") return "document.delete";
  if (path.startsWith("/projects") && method === "POST" && path.endsWith("/projects")) return "project.create";
  if (path.startsWith("/projects") && method === "GET") return "project.access";
  if (path.startsWith("/projects") && method === "DELETE") return "project.delete";
  if (path.startsWith("/user/account") && method === "DELETE") return "account.delete";
  if (path.includes("/api-keys") && method === "DELETE") return "api_key.delete";
  if (path.includes("/api-keys")) return "api_key.set";
  if (path.startsWith("/user")) return "settings.change";
  if (path.startsWith("/workflows") && method === "POST") return "workflow.create";
  if (path.startsWith("/workflows") && method === "GET") return "workflow.access";
  if (path.startsWith("/workflows") && method === "DELETE") return "workflow.delete";
  if (path.startsWith("/tabular-review") && method === "POST") return "tabular.create";
  if (path.startsWith("/tabular-review") && method === "GET") return "tabular.access";
  return null;
}

function inferResourceType(path: string): import("../lib/auditLog").AuditResourceType | null {
  if (path.startsWith("/chat")) return "chat";
  if (path.startsWith("/single-documents") || path.startsWith("/download")) return "document";
  if (path.startsWith("/projects")) return "project";
  if (path.startsWith("/user") || path.startsWith("/users")) return "user";
  if (path.startsWith("/workflows")) return "workflow";
  if (path.startsWith("/tabular-review")) return "tabular_review";
  return null;
}

function extractResourceId(path: string): string | null {
  // Extract UUIDs from paths like /chat/abc-123 or /projects/xyz/documents/456
  const match = path.match(
    /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  );
  return match?.[1] ?? null;
}

export async function requireMfaIfEnrolled(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = typeof res.locals.token === "string" ? res.locals.token : "";
  if (!token) {
    devLog("[auth/mfa] missing auth session", {
      method: req.method,
      path: req.originalUrl,
    });
    res.status(401).json({ detail: "Missing auth session" });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SECRET_KEY ?? "";

  if (!supabaseUrl || !serviceKey) {
    res.status(500).json({ detail: "Server auth is not configured" });
    return;
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
  const { data, error } =
    await admin.auth.mfa.getAuthenticatorAssuranceLevel(token);

  if (error) {
    devLog("[auth/mfa] assurance lookup failed", {
      method: req.method,
      path: req.originalUrl,
      userId: res.locals.userId,
      error: error.message,
    });
    res.status(401).json({ detail: error.message });
    return;
  }

  devLog("[auth/mfa] assurance level", {
    method: req.method,
    path: req.originalUrl,
    userId: res.locals.userId,
    currentLevel: data.currentLevel,
    nextLevel: data.nextLevel,
    required: data.nextLevel === "aal2" && data.currentLevel !== "aal2",
  });

  if (isDev) {
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    devLog("[auth/mfa] user factors", {
      method: req.method,
      path: req.originalUrl,
      userId: res.locals.userId,
      factorCount: userData.user?.factors?.length ?? 0,
      factors: summarizeMfaFactors(userData.user?.factors),
      error: userError?.message ?? null,
    });
  }

  if (data.nextLevel === "aal2" && data.currentLevel !== "aal2") {
    devLog("[auth/mfa] verification required", {
      method: req.method,
      path: req.originalUrl,
      userId: res.locals.userId,
    });
    res.status(403).json({
      code: "mfa_verification_required",
      detail: "MFA verification required",
    });
    return;
  }

  next();
}
