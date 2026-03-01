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

export type RunStatus = 'idle' | 'starting' | 'running' | 'stopped' | 'error';

export interface RunState {
  projectId: string;
  status: RunStatus;
  command: string;
  cwd: string;
  pid?: number;
  startedAt?: string;
  exitedAt?: string;
  exitCode?: number | null;
  detectedUrl?: string;
  lastError?: string;
}

export interface RunStartInput {
  projectId: string;
  command: string;
  cwd: string;
}

export type RunEvent =
  | {
      type: 'state';
      state: RunState;
    }
  | {
      type: 'log';
      projectId: string;
      stream: 'stdout' | 'stderr';
      chunk: string;
      timestamp: string;
    };

export interface PreviewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
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
  run: {
    start: (input: RunStartInput) => Promise<RunState>;
    stop: (projectId: string) => Promise<RunState>;
    state: (projectId: string) => Promise<RunState>;
    states: () => Promise<RunState[]>;
    onEvent: (listener: (event: RunEvent) => void) => () => void;
  };
  preview: {
    setActive: (projectId: string | null) => Promise<void>;
    setBounds: (input: { projectId: string; bounds: PreviewBounds }) => Promise<void>;
    navigate: (projectId: string, url: string) => Promise<void>;
    clear: (projectId: string) => Promise<void>;
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
  run: {
    start: (input: RunStartInput) => ipcRenderer.invoke('run:start', input),
    stop: (projectId: string) => ipcRenderer.invoke('run:stop', projectId),
    state: (projectId: string) => ipcRenderer.invoke('run:state', projectId),
    states: () => ipcRenderer.invoke('run:states'),
    onEvent: (listener: (event: RunEvent) => void) => {
      const channel = 'run:event';
      const handler = (_event: Electron.IpcRendererEvent, data: RunEvent) => {
        listener(data);
      };

      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
  },
  preview: {
    setActive: (projectId: string | null) =>
      ipcRenderer.invoke('preview:set-active', projectId),
    setBounds: (input: { projectId: string; bounds: PreviewBounds }) =>
      ipcRenderer.invoke('preview:set-bounds', input),
    navigate: (projectId: string, url: string) =>
      ipcRenderer.invoke('preview:navigate', projectId, url),
    clear: (projectId: string) => ipcRenderer.invoke('preview:clear', projectId),
  },
  platform: process.platform,
} satisfies PortalAPI);
