interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface AIStreamEvent {
  type: 'text-delta' | 'finish' | 'error';
  content?: string;
  error?: string;
}

interface PortalAPI {
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

declare global {
  interface Window {
    portal: PortalAPI;
  }
}

export {};
