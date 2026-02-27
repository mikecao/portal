import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';

function getModel(provider: string) {
  switch (provider) {
    case 'anthropic':
      return anthropic('claude-sonnet-4-20250514');
    case 'openai':
      return openai('gpt-4o');
    default:
      return anthropic('claude-sonnet-4-20250514');
  }
}

export async function POST(req: Request) {
  const { provider, messages } = await req.json();

  const result = streamText({
    model: getModel(provider),
    messages,
  });

  return result.toTextStreamResponse();
}
