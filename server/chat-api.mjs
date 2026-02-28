import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { createChatGPTOAuth } from 'ai-sdk-provider-chatgpt-oauth';

const port = Number(process.env.API_PORT || 3334);

const chatgpt = createChatGPTOAuth({
  autoRefresh: true,
  credentialsPath: path.join(os.homedir(), '.codex', 'auth.json'),
});

function getModel(provider) {
  switch (provider) {
    case 'anthropic':
      return anthropic('claude-sonnet-4-20250514');
    case 'openai':
    default:
      return chatgpt('gpt-5');
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

    const { provider, messages } = JSON.parse(raw || '{}');

    const result = streamText({
      model: getModel(provider),
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
