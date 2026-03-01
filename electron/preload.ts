import { contextBridge, ipcRenderer } from 'electron';

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export type ChatModelId = 'gpt-5' | 'gpt-5-codex' | 'codex-mini-latest';
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high';

export interface AIChatOptions {
  modelId: ChatModelId;
  reasoningEffort: ReasoningEffort;
}

export interface StoredChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  rootPath: string;
  commands: {
    devCommand: string;
    installCommand?: string;
    testCommand?: string;
  };
  preview: {
    expectedUrl?: string;
    autoOpenPreview: boolean;
  };
  chat: {
    modelId: ChatModelId;
    reasoningEffort: ReasoningEffort;
    messages: StoredChatMessage[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface ProjectsSnapshot {
  activeProjectId: string | null;
  projects: ProjectRecord[];
}

export interface AddProjectInput {
  rootPath: string;
  name?: string;
  commands?: Partial<ProjectRecord['commands']>;
  preview?: Partial<ProjectRecord['preview']>;
}

export interface UpdateProjectInput {
  projectId: string;
  patch: {
    name?: string;
    commands?: Partial<ProjectRecord['commands']>;
    preview?: Partial<ProjectRecord['preview']>;
    chat?: Partial<ProjectRecord['chat']>;
  };
}

export interface AIStreamEvent {
  type: 'text-delta' | 'finish' | 'error';
  content?: string;
  error?: string;
}

export interface PortalAPI {
  ai: {
    chat: (
      messages: AIMessage[],
      options: AIChatOptions,
      onEvent: (event: AIStreamEvent) => void,
    ) => Promise<void>;
    abort: () => void;
  };
  projects: {
    list: () => Promise<ProjectsSnapshot>;
    add: (input: AddProjectInput) => Promise<ProjectsSnapshot>;
    update: (input: UpdateProjectInput) => Promise<ProjectsSnapshot>;
    remove: (projectId: string) => Promise<ProjectsSnapshot>;
    setActive: (projectId: string | null) => Promise<ProjectsSnapshot>;
    openFolderDialog: () => Promise<string | null>;
  };
  platform: NodeJS.Platform;
}

contextBridge.exposeInMainWorld('portal', {
  ai: {
    chat: (
      messages: AIMessage[],
      options: AIChatOptions,
      onEvent: (event: AIStreamEvent) => void,
    ) => {
      const channel = `ai:stream:${Date.now()}`;

      ipcRenderer.on(channel, (_event, data: AIStreamEvent) => {
        onEvent(data);
        if (data.type === 'finish' || data.type === 'error') {
          ipcRenderer.removeAllListeners(channel);
        }
      });

      return ipcRenderer.invoke('ai:chat', { messages, options, channel });
    },
    abort: () => {
      ipcRenderer.invoke('ai:abort');
    },
  },
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    add: (input: AddProjectInput) => ipcRenderer.invoke('projects:add', input),
    update: (input: UpdateProjectInput) =>
      ipcRenderer.invoke('projects:update', input),
    remove: (projectId: string) => ipcRenderer.invoke('projects:remove', projectId),
    setActive: (projectId: string | null) =>
      ipcRenderer.invoke('projects:set-active', projectId),
    openFolderDialog: () => ipcRenderer.invoke('projects:open-folder-dialog'),
  },
  platform: process.platform,
} satisfies PortalAPI);
