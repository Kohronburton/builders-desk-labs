import { randomUUID, timingSafeEqual } from "node:crypto";
import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { bearerToken } from "./config.js";
import { createMcpServer } from "./server.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

const transports = new Map<string, StreamableHTTPServerTransport>();

function authorized(request: Request): boolean {
  const expected = bearerToken();
  if (!expected) return true;

  const header = request.header("authorization") ?? "";
  const headerToken = header.startsWith("Bearer ") ? header.slice(7) : "";
  const queryToken = typeof request.query.token === "string"
    ? request.query.token
    : "";
  const supplied = headerToken || queryToken;

  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);

  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

function requireAuthorization(
  request: Request,
  response: Response,
): boolean {
  if (authorized(request)) return true;
  response.status(401).json({ error: "Unauthorized" });
  return false;
}

function sessionId(request: Request): string | undefined {
  const value = request.header("mcp-session-id");
  return value?.trim() || undefined;
}

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "claude-github-operator",
    version: "0.1.0",
  });
});

app.post("/mcp", async (request, response) => {
  if (!requireAuthorization(request, response)) return;

  try {
    const existingId = sessionId(request);
    let transport = existingId ? transports.get(existingId) : undefined;

    if (!transport) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports.set(id, transport!);
        },
      });

      transport.onclose = () => {
        if (transport?.sessionId) transports.delete(transport.sessionId);
      };

      const server = createMcpServer();
      await server.connect(transport);
    }

    await transport.handleRequest(request, response, request.body);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) {
      response.status(500).json({ error: "MCP request failed" });
    }
  }
});

async function handleSessionRequest(request: Request, response: Response) {
  if (!requireAuthorization(request, response)) return;

  const id = sessionId(request);
  const transport = id ? transports.get(id) : undefined;
  if (!transport) {
    response.status(400).json({ error: "Missing or invalid MCP session" });
    return;
  }

  await transport.handleRequest(request, response);
}

app.get("/mcp", handleSessionRequest);
app.delete("/mcp", handleSessionRequest);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Claude GitHub Operator listening on port ${port}`);
});
