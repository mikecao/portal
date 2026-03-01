interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

type ChatModelId = 'gpt-5' | 'gpt-5-codex' | 'codex-mini-latest';
type ReasoningEffort = 'none' | 'low' | 'medium' | 'high';

interface AIChatOptions {
  modelId: ChatModelId;
  reasoningEffort: ReasoningEffort;
}

interface StoredChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

interface ProjectRecord {
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

interface ProjectsSnapshot {
  activeProjectId: string | null;
  projects: ProjectRecord[];
}

interface AddProjectInput {
  rootPath: string;
  name?: string;
  commands?: Partial<ProjectRecord['commands']>;
  preview?: Partial<ProjectRecord['preview']>;
}

interface UpdateProjectInput {
  projectId: string;
  patch: {
    name?: string;
    commands?: Partial<ProjectRecord['commands']>;
    preview?: Partial<ProjectRecord['preview']>;
    chat?: Partial<ProjectRecord['chat']>;
  };
}

interface AIStreamEvent {
  type: 'text-delta' | 'finish' | 'error';
  content?: string;
  error?: string;
}

type RunStatus = 'idle' | 'starting' | 'running' | 'stopped' | 'error';

interface RunState {
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

interface RunStartInput {
  projectId: string;
  command: string;
  cwd: string;
}

type RunEvent =
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

interface PreviewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PortalAPI {
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

declare global {
  interface Window {
    portal: PortalAPI;
  }
}

export {};
