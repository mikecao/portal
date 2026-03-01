import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import fs from 'node:fs';
import { streamText } from 'ai';
import { createChatGPTOAuth } from 'ai-sdk-provider-chatgpt-oauth';

const port = Number(process.env.API_PORT || 3334);
const credentialsPath = path.join(os.homedir(), '.codex', 'auth.json');

const chatgpt = createChatGPTOAuth({
  autoRefresh: true,
  credentialsPath,
});

const allowedModels = ['gpt-5', 'gpt-5-codex', 'codex-mini-latest'];
const allowedEfforts = ['none', 'low', 'medium', 'high'];

function normalizeModelId(modelId) {
  if (typeof modelId === 'string' && allowedModels.includes(modelId)) {
    return modelId;
  }
  return 'gpt-5';
}

function normalizeReasoningEffort(reasoningEffort) {
  if (typeof reasoningEffort === 'string' && allowedEfforts.includes(reasoningEffort)) {
    return reasoningEffort;
  }
  return 'medium';
}

function getModel(modelId, reasoningEffort) {
  return chatgpt(modelId, {
    reasoningEffort: reasoningEffort === 'none' ? null : reasoningEffort,
  });
}

function assertProviderConfigured() {
  if (!process.env.OPENAI_API_KEY && !fs.existsSync(credentialsPath)) {
    throw new Error(
      'OpenAI is not configured. Run codex login to create ~/.codex/auth.json or set OPENAI_API_KEY.',
    );
  }
}

function writeJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (!req.url || req.method !== 'POST') {
    writeJson(res, 404, { error: 'Not found' });
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/api/chat') {
    writeJson(res, 404, { error: 'Not found' });
    return;
  }

  try {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
    }

    const { messages, modelId, reasoningEffort } = JSON.parse(raw || '{}');
    const resolvedModelId = normalizeModelId(modelId);
    const resolvedReasoningEffort = normalizeReasoningEffort(reasoningEffort);
    assertProviderConfigured();

    const result = streamText({
      model: getModel(resolvedModelId, resolvedReasoningEffort),
      messages,
    });

    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Transfer-Encoding': 'chunked',
    });

    for await (const chunk of result.textStream) {
      res.write(chunk);
    }
    res.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Chat API error:', message);
    writeJson(res, 500, { error: message });
  }
});

server.listen(port, () => {
  console.log(`Chat API server listening on http://localhost:${port}`);
});
