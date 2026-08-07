import cookie from "@fastify/cookie";
import formbody from "@fastify/formbody";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthenticatedOperator, AuthService } from "../auth/service.js";
import type { PrivateStorage } from "../assets/storage.js";
import { canOperatorTransition, type JobStatus, type OperatorJobDetail, type OperatorRepository } from "./repository.js";

const jobStatusSchema = z.enum([
  "RECEIVED", "VALIDATED", "ASSET_INGESTION_PENDING", "READY_FOR_PRODUCTION",
  "ON_HOLD", "REQUIRES_REVIEW", "CANCELLED", "FAILED"
]);
const loginSchema = z.object({ email: z.string().email().max(320), password: z.string().min(1).max(1024) }).strict();
const statusSchema = z.object({
  currentStatus: jobStatusSchema,
  newStatus: jobStatusSchema,
  reason: z.string().trim().max(1000).optional()
}).strict();

export interface OperatorRouteOptions {
  auth: AuthService;
  repository: OperatorRepository;
  storage: PrivateStorage;
  signedUrlTtlSeconds: number;
  secureCookies: boolean;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]!);
}

function textHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? undefined : value;
}

function operatorCsp(reply: FastifyReply): void {
  reply.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; script-src 'none'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  reply.header("Cache-Control", "no-store");
  reply.header("X-Robots-Tag", "noindex, nofollow");
}

function shell(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
  :root{font-family:system-ui,sans-serif;color:#161616;background:#f6f7f8}body{max-width:1100px;margin:0 auto;padding:24px}a{color:#174ea6}nav{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:24px}.card{background:white;border:1px solid #ddd;border-radius:10px;padding:18px;margin:12px 0}table{width:100%;border-collapse:collapse;background:white}th,td{text-align:left;padding:10px;border-bottom:1px solid #eee;vertical-align:top}input,select,textarea,button{font:inherit;padding:9px;margin:4px 0}label{display:block;margin-top:10px}.muted{color:#666}.pill{display:inline-block;padding:3px 8px;border:1px solid #ccc;border-radius:999px}pre{white-space:pre-wrap;overflow-wrap:anywhere}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.danger{color:#8a1c1c}</style></head><body>${body}</body></html>`;
}

function money(amount: number, currency: string): string {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100); }
  catch { return `${currency} ${(amount / 100).toFixed(2)}`; }
}

function sessionNames(secure: boolean) {
  return secure
    ? { session: "__Host-mayne_session", csrf: "__Host-mayne_csrf" }
    : { session: "mayne_session", csrf: "mayne_csrf" };
}

function setAuthCookies(reply: FastifyReply, secure: boolean, names: ReturnType<typeof sessionNames>, result: Awaited<ReturnType<AuthService["login"]>> & {}) {
  if (!result) return;
  const common = { path: "/", secure, sameSite: "strict" as const, expires: result.expiresAt };
  reply.setCookie(names.session, result.sessionToken, { ...common, httpOnly: true });
  reply.setCookie(names.csrf, result.csrfToken, { ...common, httpOnly: false });
}

function clearAuthCookies(reply: FastifyReply, secure: boolean, names: ReturnType<typeof sessionNames>) {
  const common = { path: "/", secure, sameSite: "strict" as const };
  reply.clearCookie(names.session, common);
  reply.clearCookie(names.csrf, common);
}

function loginPage(error?: string): string {
  return shell("Operator Login", `<main class="card" style="max-width:480px;margin:8vh auto"><h1>Production Operator</h1><p class="muted">Authorized access only.</p>${error ? `<p class="danger">${escapeHtml(error)}</p>` : ""}<form method="post" action="/operator/login"><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button type="submit">Sign in</button></form></main>`);
}

export async function registerOperatorRoutes(app: FastifyInstance, options: OperatorRouteOptions): Promise<void> {
  await app.register(cookie);
  await app.register(formbody);
  await app.register(rateLimit, { global: false });
  const names = sessionNames(options.secureCookies);

  async function requireOperator(request: FastifyRequest, reply: FastifyReply): Promise<AuthenticatedOperator | null> {
    const operator = await options.auth.authenticate(request.cookies[names.session]);
    if (!operator) {
      reply.header("Cache-Control", "no-store").code(401).send({ success: false, error: { code: "AUTH_REQUIRED", message: "Authentication required." } });
      return null;
    }
    return operator;
  }

  function csrfFrom(request: FastifyRequest, body?: Record<string, unknown>): string | undefined {
    const fromHeader = textHeader(request.headers["x-csrf-token"]);
    const fromBody = typeof body?._csrf === "string" ? body._csrf : undefined;
    return fromHeader ?? fromBody;
  }

  function validCsrf(request: FastifyRequest, operator: AuthenticatedOperator, body?: Record<string, unknown>): boolean {
    const supplied = csrfFrom(request, body);
    const cookieValue = request.cookies[names.csrf];
    return Boolean(supplied && cookieValue && supplied === cookieValue && options.auth.verifyCsrf(operator, supplied));
  }

  async function login(email: string, password: string, request: FastifyRequest) {
    return options.auth.login(email, password, {
      ip: request.ip,
      userAgent: textHeader(request.headers["user-agent"]),
      requestId: String(request.id)
    });
  }

  app.post("/api/v1/auth/login", { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ success: false, error: { code: "LOGIN_INVALID", message: "Invalid login request." } });
    const result = await login(parsed.data.email, parsed.data.password, request);
    if (!result) return reply.code(401).send({ success: false, error: { code: "LOGIN_FAILED", message: "Email or password is incorrect." } });
    setAuthCookies(reply, options.secureCookies, names, result);
    reply.header("Cache-Control", "no-store");
    return { success: true, user: result.user, csrfToken: result.csrfToken, expiresAt: result.expiresAt.toISOString() };
  });

  app.get("/api/v1/auth/me", async (request, reply) => {
    const operator = await requireOperator(request, reply);
    if (!operator) return;
    reply.header("Cache-Control", "no-store");
    return { success: true, user: { id: operator.userId, email: operator.email, role: operator.role }, expiresAt: operator.expiresAt.toISOString() };
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    const operator = await requireOperator(request, reply);
    if (!operator) return;
    if (!validCsrf(request, operator)) return reply.code(403).send({ success: false, error: { code: "CSRF_INVALID", message: "Request verification failed." } });
    await options.auth.logout(request.cookies[names.session], operator, String(request.id));
    clearAuthCookies(reply, options.secureCookies, names);
    return { success: true };
  });

  app.get("/api/v1/jobs", async (request, reply) => {
    const operator = await requireOperator(request, reply);
    if (!operator) return;
    const parsed = z.object({ status: jobStatusSchema.optional(), q: z.string().max(200).optional(), limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).default(0) }).safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ success: false, error: { code: "QUERY_INVALID", message: "Invalid job query." } });
    return { success: true, jobs: await options.repository.listJobs({ status: parsed.data.status, query: parsed.data.q, limit: parsed.data.limit, offset: parsed.data.offset }) };
  });

  app.get("/api/v1/jobs/:jobId", async (request, reply) => {
    const operator = await requireOperator(request, reply);
    if (!operator) return;
    const parsed = z.object({ jobId: z.string().uuid() }).safeParse(request.params);
    if (!parsed.success) return reply.code(404).send({ success: false, error: { code: "JOB_NOT_FOUND", message: "Job not found." } });
    const job = await options.repository.getJob(parsed.data.jobId);
    if (!job) return reply.code(404).send({ success: false, error: { code: "JOB_NOT_FOUND", message: "Job not found." } });
    const [segments, assets] = await Promise.all([options.repository.getSegments(job.jobId), options.repository.getAssets(job.jobId)]);
    return { success: true, job, segments, assets };
  });

  app.patch("/api/v1/jobs/:jobId/status", async (request, reply) => {
    const operator = await requireOperator(request, reply);
    if (!operator) return;
    if (!validCsrf(request, operator)) return reply.code(403).send({ success: false, error: { code: "CSRF_INVALID", message: "Request verification failed." } });
    const params = z.object({ jobId: z.string().uuid() }).safeParse(request.params);
    const body = statusSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(422).send({ success: false, error: { code: "STATUS_CHANGE_INVALID", message: "Invalid job status request." } });
    if (!canOperatorTransition(body.data.currentStatus, body.data.newStatus)) return reply.code(409).send({ success: false, error: { code: "STATUS_TRANSITION_DENIED", message: "That status transition is not permitted." } });
    const updated = await options.repository.updateStatus({ jobId: params.data.jobId, expectedCurrentStatus: body.data.currentStatus, newStatus: body.data.newStatus, reason: body.data.reason, operatorId: operator.userId });
    if (!updated) return reply.code(409).send({ success: false, error: { code: "STATUS_CHANGED", message: "Job status changed before this request was applied. Reload and try again." } });
    return { success: true };
  });

  async function signedAsset(assetId: string, operator: AuthenticatedOperator, requestId: string) {
    const asset = await options.repository.getAssetForAccess(assetId);
    if (!asset || asset.ingestionStatus !== "READY") return null;
    const url = await options.storage.signedGet(asset.storageKey, options.signedUrlTtlSeconds);
    await options.auth.auditAction(operator, { eventType: "asset.access_link_created", resourceType: "asset", resourceId: asset.id, requestId, safeMetadata: { jobId: asset.jobId, ttlSeconds: options.signedUrlTtlSeconds } });
    return url;
  }

  app.post("/api/v1/assets/:assetId/access-link", async (request, reply) => {
    const operator = await requireOperator(request, reply);
    if (!operator) return;
    if (!validCsrf(request, operator)) return reply.code(403).send({ success: false, error: { code: "CSRF_INVALID", message: "Request verification failed." } });
    const params = z.object({ assetId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(404).send({ success: false, error: { code: "ASSET_NOT_FOUND", message: "Asset not found." } });
    const url = await signedAsset(params.data.assetId, operator, String(request.id));
    if (!url) return reply.code(404).send({ success: false, error: { code: "ASSET_NOT_READY", message: "Asset is not available." } });
    reply.header("Cache-Control", "no-store");
    return { success: true, url, expiresInSeconds: options.signedUrlTtlSeconds };
  });

  app.get("/operator/login", async (_request, reply) => {
    operatorCsp(reply);
    return reply.type("text/html; charset=utf-8").send(loginPage());
  });

  app.post("/operator/login", { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      operatorCsp(reply);
      return reply.code(401).type("text/html; charset=utf-8").send(loginPage("Email or password is incorrect."));
    }
    const result = await login(parsed.data.email, parsed.data.password, request);
    if (!result) {
      operatorCsp(reply);
      return reply.code(401).type("text/html; charset=utf-8").send(loginPage("Email or password is incorrect."));
    }
    setAuthCookies(reply, options.secureCookies, names, result);
    return reply.redirect("/operator");
  });

  app.get("/operator", async (request, reply) => {
    const operator = await options.auth.authenticate(request.cookies[names.session]);
    if (!operator) return reply.redirect("/operator/login");
    operatorCsp(reply);
    const jobs = await options.repository.listJobs({ limit: 100, offset: 0 });
    const rows = jobs.map((job) => `<tr><td><a href="/operator/jobs/${escapeHtml(job.jobId)}">${escapeHtml(job.publicJobNumber)}</a></td><td>${escapeHtml(job.externalOrderId)}</td><td>${escapeHtml(job.customerName)}</td><td><span class="pill">${escapeHtml(job.status)}</span></td><td>${escapeHtml(job.packageCode)}</td><td>${escapeHtml(job.templateCode)}</td><td>${escapeHtml(job.createdAt.toISOString())}</td></tr>`).join("");
    const csrf = request.cookies[names.csrf] ?? "";
    return reply.type("text/html; charset=utf-8").send(shell("Production Jobs", `<nav><div><strong>Production Jobs</strong><br><span class="muted">${escapeHtml(operator.email)} · ${escapeHtml(operator.role)}</span></div><form method="post" action="/operator/logout"><input type="hidden" name="_csrf" value="${escapeHtml(csrf)}"><button>Sign out</button></form></nav><table><thead><tr><th>Job</th><th>Order</th><th>Customer</th><th>Status</th><th>Package</th><th>Template</th><th>Created</th></tr></thead><tbody>${rows || `<tr><td colspan="7">No jobs.</td></tr>`}</tbody></table>`));
  });

  app.get("/operator/jobs/:jobId", async (request, reply) => {
    const operator = await options.auth.authenticate(request.cookies[names.session]);
    if (!operator) return reply.redirect("/operator/login");
    operatorCsp(reply);
    const params = z.object({ jobId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(404).type("text/html").send(shell("Not found", "<p>Job not found.</p>"));
    const job = await options.repository.getJob(params.data.jobId);
    if (!job) return reply.code(404).type("text/html").send(shell("Not found", "<p>Job not found.</p>"));
    const [segments, assets] = await Promise.all([options.repository.getSegments(job.jobId), options.repository.getAssets(job.jobId)]);
    const csrf = request.cookies[names.csrf] ?? "";
    const segmentRows = segments.map((segment) => `<tr><td>${segment.sequence}</td><td>${escapeHtml(segment.speakerCode ?? "")}</td><td>${escapeHtml(segment.text)}</td><td>${segment.wordCount}</td></tr>`).join("");
    const assetRows = assets.map((asset) => `<tr><td>${escapeHtml(asset.assetType)}</td><td>${escapeHtml(asset.originalFileName)}</td><td>${escapeHtml(asset.ingestionStatus)}</td><td>${asset.sizeBytes}</td><td>${asset.ingestionStatus === "READY" ? `<a href="/operator/assets/${escapeHtml(asset.id)}">Open private file</a>` : "—"}</td></tr>`).join("");
    const detail = `<nav><a href="/operator">← Jobs</a><span>${escapeHtml(operator.email)}</span></nav><h1>${escapeHtml(job.publicJobNumber)}</h1><div class="grid"><div class="card"><strong>Status</strong><br>${escapeHtml(job.status)}</div><div class="card"><strong>Order</strong><br>${escapeHtml(job.externalOrderId)}</div><div class="card"><strong>Customer</strong><br>${escapeHtml(job.customerName)}<br>${escapeHtml(job.email)}</div><div class="card"><strong>Payment</strong><br>${escapeHtml(money(job.totalAmount, job.currency))}</div><div class="card"><strong>Package</strong><br>${escapeHtml(job.packageCode)}</div><div class="card"><strong>Template / Style / Voice</strong><br>${escapeHtml(job.templateCode)}<br>${escapeHtml(job.performanceStyleCode)}<br>${escapeHtml(job.voiceOptionCode)}</div></div><section class="card"><h2>Script</h2><pre>${escapeHtml(job.scriptText)}</pre><p class="muted">Words ${job.calculatedWordCount}; segments ${job.calculatedSegmentCount}; ${escapeHtml(job.segmentationVersion)}</p></section><section class="card"><h2>Segments</h2><table><thead><tr><th>#</th><th>Speaker</th><th>Text</th><th>Words</th></tr></thead><tbody>${segmentRows}</tbody></table></section><section class="card"><h2>Private Assets</h2><table><thead><tr><th>Type</th><th>Name</th><th>Status</th><th>Bytes</th><th>Access</th></tr></thead><tbody>${assetRows || `<tr><td colspan="5">No assets.</td></tr>`}</tbody></table></section><section class="card"><h2>Change status</h2><form method="post" action="/operator/jobs/${escapeHtml(job.jobId)}/status"><input type="hidden" name="_csrf" value="${escapeHtml(csrf)}"><input type="hidden" name="currentStatus" value="${escapeHtml(job.status)}"><label>New status<select name="newStatus"><option>ON_HOLD</option><option>REQUIRES_REVIEW</option><option>READY_FOR_PRODUCTION</option><option>CANCELLED</option></select></label><label>Reason<textarea name="reason" maxlength="1000"></textarea></label><button>Update status</button></form></section>`;
    return reply.type("text/html; charset=utf-8").send(shell(job.publicJobNumber, detail));
  });

  app.post("/operator/jobs/:jobId/status", async (request, reply) => {
    const operator = await options.auth.authenticate(request.cookies[names.session]);
    if (!operator) return reply.redirect("/operator/login");
    const params = z.object({ jobId: z.string().uuid() }).safeParse(request.params);
    const bodyRecord = (request.body ?? {}) as Record<string, unknown>;
    const body = statusSchema.safeParse(bodyRecord);
    if (!params.success || !body.success || !validCsrf(request, operator, bodyRecord)) return reply.code(403).type("text/plain").send("Request refused");
    if (!canOperatorTransition(body.data.currentStatus, body.data.newStatus)) return reply.code(409).type("text/plain").send("Status transition not permitted");
    const updated = await options.repository.updateStatus({ jobId: params.data.jobId, expectedCurrentStatus: body.data.currentStatus, newStatus: body.data.newStatus, reason: body.data.reason, operatorId: operator.userId });
    if (!updated) return reply.code(409).type("text/plain").send("Job changed; reload and retry");
    return reply.redirect(`/operator/jobs/${params.data.jobId}`);
  });

  app.get("/operator/assets/:assetId", async (request, reply) => {
    const operator = await options.auth.authenticate(request.cookies[names.session]);
    if (!operator) return reply.redirect("/operator/login");
    const params = z.object({ assetId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(404).type("text/plain").send("Asset not found");
    const url = await signedAsset(params.data.assetId, operator, String(request.id));
    if (!url) return reply.code(404).type("text/plain").send("Asset not available");
    reply.header("Cache-Control", "no-store");
    return reply.redirect(url);
  });

  app.post("/operator/logout", async (request, reply) => {
    const operator = await options.auth.authenticate(request.cookies[names.session]);
    if (!operator) return reply.redirect("/operator/login");
    const bodyRecord = (request.body ?? {}) as Record<string, unknown>;
    if (!validCsrf(request, operator, bodyRecord)) return reply.code(403).type("text/plain").send("Request refused");
    await options.auth.logout(request.cookies[names.session], operator, String(request.id));
    clearAuthCookies(reply, options.secureCookies, names);
    return reply.redirect("/operator/login");
  });
}
