import path from 'node:path';
import os from 'node:os';
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { createChatGPTOAuth } from 'ai-sdk-provider-chatgpt-oauth';

const chatgpt = createChatGPTOAuth({
  autoRefresh: true,
  credentialsPath: path.join(os.homedir(), '.codex', 'auth.json'),
});

function getModel(provider: string) {
  switch (provider) {
    case 'anthropic':
      return anthropic('claude-sonnet-4-20250514');
    case 'openai':
      return chatgpt('gpt-5');
    default:
      return chatgpt('gpt-5');
  }
}

export async function POST(req: Request) {
  const { provider, messages } = await req.json();

  try {
    const result = streamText({
      model: getModel(provider),
      messages,
    });

    return result.toTextStreamResponse();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Chat API error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
