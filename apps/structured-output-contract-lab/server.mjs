import 'dotenv/config';
import express from 'express';
import Ajv from 'ajv';
import OpenAI from 'openai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const ajv = new Ajv({ allErrors: true, strict: false });

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function normalizeSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new Error('Schema must be a JSON object.');
  }
  return schema;
}

function parseModelJson(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  return JSON.parse(cleaned);
}

function validationResult(schema, value) {
  const validate = ajv.compile(schema);
  const valid = Boolean(validate(value));
  return { valid, errors: validate.errors || [] };
}

async function callModel({ prompt, schema, mode, variation = 0 }) {
  if (!client) throw new Error('OPENAI_API_KEY is not configured.');

  const startedAt = Date.now();
  let response;

  if (mode === 'strict') {
    response = await client.responses.create({
      model,
      input: [
        {
          role: 'system',
          content: 'Return only data that satisfies the supplied JSON Schema. Never add commentary.'
        },
        { role: 'user', content: prompt }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'demo_response',
          strict: true,
          schema
        }
      }
    });
  } else {
    const stressors = [
      'Return JSON using this schema:',
      'Explain your answer briefly, then provide JSON matching:',
      'Use markdown if helpful. The desired shape is:',
      'Be conversational. Try to follow this JSON structure:'
    ];
    response = await client.responses.create({
      model,
      input: `${prompt}\n\n${stressors[variation % stressors.length]}\n${JSON.stringify(schema, null, 2)}`
    });
  }

  const rawText = response.output_text || '';
  let parsed = null;
  let parseError = null;
  try {
    parsed = parseModelJson(rawText);
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }

  const validation = parsed === null
    ? { valid: false, errors: [{ message: parseError || 'Response was not parseable JSON.' }] }
    : validationResult(schema, parsed);

  return {
    mode,
    model,
    rawText,
    parsed,
    valid: validation.valid,
    validationErrors: validation.errors,
    latencyMs: Date.now() - startedAt,
    responseId: response.id || null
  };
}

app.post('/api/run', async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    const mode = req.body?.mode === 'strict' ? 'strict' : 'prompt-only';
    const schema = normalizeSchema(req.body?.schema);
    if (!prompt) return res.status(400).json({ error: 'Prompt is required.' });
    res.json(await callModel({ prompt, schema, mode, variation: Number(req.body?.variation || 0) }));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/test-run', async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    const mode = req.body?.mode === 'strict' ? 'strict' : 'prompt-only';
    const schema = normalizeSchema(req.body?.schema);
    const requested = Math.min(100, Math.max(1, Number(req.body?.count || 25)));
    if (!prompt) return res.status(400).json({ error: 'Prompt is required.' });

    const results = [];
    for (let index = 0; index < requested; index += 1) {
      try {
        results.push(await callModel({ prompt, schema, mode, variation: index }));
      } catch (error) {
        results.push({
          mode,
          model,
          valid: false,
          rawText: '',
          parsed: null,
          validationErrors: [],
          latencyMs: 0,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const validCount = results.filter((result) => result.valid).length;
    res.json({
      mode,
      total: requested,
      validCount,
      invalidCount: requested - validCount,
      successRate: Number(((validCount / requested) * 100).toFixed(1)),
      averageLatencyMs: Math.round(results.reduce((sum, item) => sum + (item.latencyMs || 0), 0) / requested),
      results
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model, apiKeyConfigured: Boolean(client) });
});

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(port, () => console.log(`Structured Output Contract Lab running on http://localhost:${port}`));
