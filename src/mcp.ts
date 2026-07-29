import type { IncomingMessage, ServerResponse } from 'node:http';
import { parseWorkflowInput, ValidationError } from './validation.ts';
import type { WorkflowEngine } from './engine.ts';
import type { ExecutionRepository } from './repository.ts';

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const tools = [
  {
    name: 'diagnose_workflow',
    description: 'Run the fault-tolerant support-triage workflow and return a structured diagnosis.',
    inputSchema: {
      type: 'object',
      required: ['requestId', 'sessionId', 'message'],
      properties: {
        requestId: { type: 'string' },
        sessionId: { type: 'string' },
        message: { type: 'string' },
        scenario: { type: 'string', enum: ['success', 'timeout-once', 'rate-limit-once', 'invalid-ai-once', 'duplicate', 'permanent-failure'] },
      },
    },
  },
  {
    name: 'get_execution',
    description: 'Retrieve the persisted execution record for a requestId.',
    inputSchema: {
      type: 'object',
      required: ['requestId'],
      properties: { requestId: { type: 'string' } },
    },
  },
];

function result(id: JsonRpcRequest['id'], value: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result: value };
}

function rpcError(id: JsonRpcRequest['id'], code: number, message: string, data?: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message, data } };
}

export async function handleMcp(body: JsonRpcRequest, engine: WorkflowEngine, repository: ExecutionRepository): Promise<unknown> {
  if (body.jsonrpc !== '2.0' || typeof body.method !== 'string') return rpcError(body.id, -32600, 'Invalid Request');
  if (body.method === 'initialize') {
    return result(body.id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'workflow-reliability-demo', version: '1.0.0' },
    });
  }
  if (body.method === 'tools/list') return result(body.id, { tools });
  if (body.method === 'tools/call') {
    const name = body.params?.name;
    const args = body.params?.arguments;
    try {
      if (name === 'diagnose_workflow') {
        const input = parseWorkflowInput(args);
        const output = await engine.execute(input);
        return result(body.id, { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output });
      }
      if (name === 'get_execution') {
        const requestId = args && typeof args === 'object' && 'requestId' in args ? String(args.requestId) : '';
        const record = requestId ? repository.get(requestId) : null;
        return result(body.id, { content: [{ type: 'text', text: JSON.stringify(record, null, 2) }], structuredContent: record });
      }
      return rpcError(body.id, -32602, 'Unknown tool');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tool execution failed';
      return rpcError(body.id, error instanceof ValidationError ? -32602 : -32000, message);
    }
  }
  return rpcError(body.id, -32601, 'Method not found');
}
