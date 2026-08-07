import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuthService } from "../auth/service.js";
import type { OperatorRepository } from "./repository.js";

export interface HistoryRouteOptions {
  auth: AuthService;
  repository: OperatorRepository;
  sessionCookieName: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]!);
}

function securePage(reply: { header(name: string, value: string): unknown }): void {
  reply.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; script-src 'none'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
  reply.header("Cache-Control", "no-store");
  reply.header("X-Robots-Tag", "noindex, nofollow");
}

export async function registerHistoryRoutes(app: FastifyInstance, options: HistoryRouteOptions): Promise<void> {
  app.get("/api/v1/jobs/:jobId/history", async (request, reply) => {
    const operator = await options.auth.authenticate(request.cookies?.[options.sessionCookieName]);
    if (!operator) return reply.code(401).send({ success: false, error: { code: "AUTH_REQUIRED", message: "Authentication required." } });
    const params = z.object({ jobId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(404).send({ success: false, error: { code: "JOB_NOT_FOUND", message: "Job not found." } });
    const job = await options.repository.getJob(params.data.jobId);
    if (!job) return reply.code(404).send({ success: false, error: { code: "JOB_NOT_FOUND", message: "Job not found." } });
    reply.header("Cache-Control", "no-store");
    return { success: true, jobId: job.jobId, publicJobNumber: job.publicJobNumber, history: await options.repository.getHistory(job.jobId) };
  });

  app.get("/operator/jobs/:jobId/history", async (request, reply) => {
    const operator = await options.auth.authenticate(request.cookies?.[options.sessionCookieName]);
    if (!operator) return reply.redirect("/operator/login");
    securePage(reply);
    const params = z.object({ jobId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(404).type("text/plain").send("Job not found");
    const job = await options.repository.getJob(params.data.jobId);
    if (!job) return reply.code(404).type("text/plain").send("Job not found");
    const history = await options.repository.getHistory(job.jobId);
    const rows = history.map((entry) => `<tr><td>${escapeHtml(entry.createdAt.toISOString())}</td><td>${escapeHtml(entry.previousStatus ?? "—")}</td><td>${escapeHtml(entry.newStatus)}</td><td>${escapeHtml(entry.reason ?? "")}</td><td>${escapeHtml(entry.changedByType)}</td></tr>`).join("");
    return reply.type("text/html; charset=utf-8").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(job.publicJobNumber)} history</title><style>body{font-family:system-ui,sans-serif;max-width:1000px;margin:0 auto;padding:24px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px;border-bottom:1px solid #ddd}a{color:#174ea6}</style></head><body><p><a href="/operator/jobs/${escapeHtml(job.jobId)}">← ${escapeHtml(job.publicJobNumber)}</a></p><h1>Status history</h1><table><thead><tr><th>Time</th><th>From</th><th>To</th><th>Reason</th><th>Changed by</th></tr></thead><tbody>${rows || `<tr><td colspan="5">No history.</td></tr>`}</tbody></table></body></html>`);
  });
}
