import path from 'node:path';
import os from 'node:os';
import { type IpcMain, BrowserWindow } from 'electron';
import { streamText } from 'ai';
import { createChatGPTOAuth } from 'ai-sdk-provider-chatgpt-oauth';
import type {
  AIMessage,
  AIChatOptions,
  ChatModelId,
  ReasoningEffort,
} from '../preload.js';

const chatgpt = createChatGPTOAuth({
  autoRefresh: true,
  credentialsPath: path.join(os.homedir(), '.codex', 'auth.json'),
});

let currentAbortController: AbortController | null = null;

interface ChatRequest {
  messages: AIMessage[];
  options: AIChatOptions;
  channel: string;
}

const allowedModels: ChatModelId[] = ['gpt-5', 'gpt-5-codex', 'codex-mini-latest'];
const allowedEfforts: ReasoningEffort[] = ['none', 'low', 'medium', 'high'];

function normalizeModelId(modelId: string | undefined): ChatModelId {
  if (modelId && allowedModels.includes(modelId as ChatModelId)) {
    return modelId as ChatModelId;
  }
  return 'gpt-5';
}

function normalizeReasoningEffort(
  reasoningEffort: string | undefined,
): ReasoningEffort {
  if (reasoningEffort && allowedEfforts.includes(reasoningEffort as ReasoningEffort)) {
    return reasoningEffort as ReasoningEffort;
  }
  return 'medium';
}

function getModel(options: AIChatOptions | undefined) {
  const modelId = normalizeModelId(options?.modelId);
  const reasoningEffort = normalizeReasoningEffort(options?.reasoningEffort);

  return chatgpt(modelId, {
    reasoningEffort: reasoningEffort === 'none' ? null : reasoningEffort,
  });
}

export function registerAIHandlers(ipcMain: IpcMain) {
  ipcMain.handle('ai:chat', async (event, request: ChatRequest) => {
    const { messages, options, channel } = request;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;

    currentAbortController = new AbortController();

    try {
      const result = streamText({
        model: getModel(options),
        messages,
        abortSignal: currentAbortController.signal,
      });

      for await (const chunk of result.textStream) {
        win.webContents.send(channel, {
          type: 'text-delta',
          content: chunk,
        });
      }

      win.webContents.send(channel, { type: 'finish' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message !== 'This operation was aborted') {
        win.webContents.send(channel, { type: 'error', error: message });
      }
    } finally {
      currentAbortController = null;
    }
  });

  ipcMain.handle('ai:abort', async () => {
    currentAbortController?.abort();
  });
}
