import path from 'node:path';
import os from 'node:os';
import { type IpcMain, BrowserWindow } from 'electron';
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { createChatGPTOAuth } from 'ai-sdk-provider-chatgpt-oauth';
import type { AIMessage } from '../preload.js';

const chatgpt = createChatGPTOAuth({
  autoRefresh: true,
  credentialsPath: path.join(os.homedir(), '.codex', 'auth.json'),
});

let currentAbortController: AbortController | null = null;

interface ChatRequest {
  provider: 'anthropic' | 'openai';
  messages: AIMessage[];
  channel: string;
}

function getModel(provider: 'anthropic' | 'openai') {
  switch (provider) {
    case 'anthropic':
      return anthropic('claude-sonnet-4-20250514');
    case 'openai':
      return chatgpt('gpt-5');
  }
}

export function registerAIHandlers(ipcMain: IpcMain) {
  ipcMain.handle('ai:chat', async (event, request: ChatRequest) => {
    const { provider, messages, channel } = request;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;

    currentAbortController = new AbortController();

    try {
      const result = streamText({
        model: getModel(provider),
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
