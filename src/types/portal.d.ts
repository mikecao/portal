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
  platform: NodeJS.Platform;
}

declare global {
  interface Window {
    portal: PortalAPI;
  }
}

export {};
