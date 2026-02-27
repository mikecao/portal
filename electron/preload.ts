import { contextBridge, ipcRenderer } from 'electron';

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIStreamEvent {
  type: 'text-delta' | 'finish' | 'error';
  content?: string;
  error?: string;
}

export interface PortalAPI {
  ai: {
    chat: (
      provider: 'anthropic' | 'openai',
      messages: AIMessage[],
      onEvent: (event: AIStreamEvent) => void,
    ) => Promise<void>;
    abort: () => void;
  };
  platform: NodeJS.Platform;
}

contextBridge.exposeInMainWorld('portal', {
  ai: {
    chat: (
      provider: 'anthropic' | 'openai',
      messages: AIMessage[],
      onEvent: (event: AIStreamEvent) => void,
    ) => {
      const channel = `ai:stream:${Date.now()}`;

      ipcRenderer.on(channel, (_event, data: AIStreamEvent) => {
        onEvent(data);
        if (data.type === 'finish' || data.type === 'error') {
          ipcRenderer.removeAllListeners(channel);
        }
      });

      return ipcRenderer.invoke('ai:chat', { provider, messages, channel });
    },
    abort: () => {
      ipcRenderer.invoke('ai:abort');
    },
  },
  platform: process.platform,
} satisfies PortalAPI);
