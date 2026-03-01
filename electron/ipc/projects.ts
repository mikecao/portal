import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  app,
  type IpcMain,
  BrowserWindow,
  dialog,
  type OpenDialogOptions,
} from 'electron';

interface StoredChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export type ChatModelId = 'gpt-5' | 'gpt-5-codex' | 'codex-mini-latest';
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high';

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

interface PersistedProjectsData {
  version: 1;
  activeProjectId: string | null;
  projects: ProjectRecord[];
}

export interface ProjectsSnapshot {
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

const DEFAULT_DATA: PersistedProjectsData = {
  version: 1,
  activeProjectId: null,
  projects: [],
};

const ALLOWED_MODELS: ChatModelId[] = ['gpt-5', 'gpt-5-codex', 'codex-mini-latest'];
const ALLOWED_EFFORTS: ReasoningEffort[] = ['none', 'low', 'medium', 'high'];

class ProjectsStore {
  private readonly storagePath: string;
  private state: PersistedProjectsData = structuredClone(DEFAULT_DATA);
  private loaded = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(storagePath: string) {
    this.storagePath = storagePath;
  }

  async getSnapshot(): Promise<ProjectsSnapshot> {
    await this.ensureLoaded();
    return this.snapshot();
  }

  async addProject(input: AddProjectInput): Promise<ProjectsSnapshot> {
    await this.ensureLoaded();

    const rootPath = path.resolve(input.rootPath.trim());
    await assertDirectory(rootPath);

    const duplicate = this.state.projects.find(
      (project) => normalizePathForMatch(project.rootPath) === normalizePathForMatch(rootPath),
    );

    if (duplicate) {
      throw new Error(`Project already exists for path: ${rootPath}`);
    }

    const now = new Date().toISOString();
    const project: ProjectRecord = {
      id: randomUUID(),
      name: (input.name?.trim() || path.basename(rootPath)).slice(0, 120),
      rootPath,
      commands: {
        devCommand: input.commands?.devCommand?.trim() || 'pnpm dev',
        installCommand: input.commands?.installCommand?.trim() || undefined,
        testCommand: input.commands?.testCommand?.trim() || undefined,
      },
      preview: {
        expectedUrl: input.preview?.expectedUrl?.trim() || undefined,
        autoOpenPreview: input.preview?.autoOpenPreview ?? true,
      },
      chat: {
        modelId: normalizeModelId(undefined),
        reasoningEffort: normalizeReasoningEffort(undefined),
        messages: [],
      },
      createdAt: now,
      updatedAt: now,
    };

    this.state.projects.push(project);
    if (!this.state.activeProjectId) {
      this.state.activeProjectId = project.id;
    }

    await this.persist();
    return this.snapshot();
  }

  async updateProject(input: UpdateProjectInput): Promise<ProjectsSnapshot> {
    await this.ensureLoaded();

    const project = this.state.projects.find((entry) => entry.id === input.projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const { patch } = input;

    if (typeof patch.name === 'string') {
      const nextName = patch.name.trim();
      if (!nextName) {
        throw new Error('Project name cannot be empty');
      }
      project.name = nextName.slice(0, 120);
    }

    if (patch.commands) {
      if (typeof patch.commands.devCommand === 'string') {
        const nextDevCommand = patch.commands.devCommand.trim();
        if (!nextDevCommand) {
          throw new Error('devCommand cannot be empty');
        }
        project.commands.devCommand = nextDevCommand;
      }
      if (typeof patch.commands.installCommand === 'string') {
        project.commands.installCommand = patch.commands.installCommand.trim() || undefined;
      }
      if (typeof patch.commands.testCommand === 'string') {
        project.commands.testCommand = patch.commands.testCommand.trim() || undefined;
      }
    }

    if (patch.preview) {
      if (typeof patch.preview.expectedUrl === 'string') {
        project.preview.expectedUrl = patch.preview.expectedUrl.trim() || undefined;
      }
      if (typeof patch.preview.autoOpenPreview === 'boolean') {
        project.preview.autoOpenPreview = patch.preview.autoOpenPreview;
      }
    }

    if (patch.chat) {
      if (typeof patch.chat.modelId === 'string') {
        project.chat.modelId = normalizeModelId(patch.chat.modelId);
      }
      if (typeof patch.chat.reasoningEffort === 'string') {
        project.chat.reasoningEffort = normalizeReasoningEffort(patch.chat.reasoningEffort);
      }
      if (Array.isArray(patch.chat.messages)) {
        project.chat.messages = patch.chat.messages
          .map((msg) => normalizeStoredChatMessage(msg))
          .filter((msg): msg is StoredChatMessage => msg !== null);
      }
    }

    project.updatedAt = new Date().toISOString();

    await this.persist();
    return this.snapshot();
  }

  async removeProject(projectId: string): Promise<ProjectsSnapshot> {
    await this.ensureLoaded();

    const initialCount = this.state.projects.length;
    this.state.projects = this.state.projects.filter((project) => project.id !== projectId);
    if (this.state.projects.length === initialCount) {
      throw new Error('Project not found');
    }

    if (this.state.activeProjectId === projectId) {
      this.state.activeProjectId = this.state.projects[0]?.id ?? null;
    }

    await this.persist();
    return this.snapshot();
  }

  async setActiveProject(projectId: string | null): Promise<ProjectsSnapshot> {
    await this.ensureLoaded();

    if (projectId === null) {
      this.state.activeProjectId = null;
    } else {
      const exists = this.state.projects.some((project) => project.id === projectId);
      if (!exists) {
        throw new Error('Project not found');
      }
      this.state.activeProjectId = projectId;
    }

    await this.persist();
    return this.snapshot();
  }

  private async ensureLoaded() {
    if (this.loaded) {
      return;
    }

    try {
      const raw = await readFile(this.storagePath, 'utf8');
      this.state = normalizePersistedData(JSON.parse(raw));
    } catch (error: unknown) {
      const knownError = error as NodeJS.ErrnoException;
      if (knownError.code !== 'ENOENT') {
        // Keep app usable if file is malformed or unreadable.
        console.warn('[projects] Failed to load store, resetting:', knownError.message);
      }
      this.state = structuredClone(DEFAULT_DATA);
    }

    this.loaded = true;
  }

  private async persist() {
    this.state = normalizePersistedData(this.state);

    const serialized = JSON.stringify(this.state, null, 2);
    const dirname = path.dirname(this.storagePath);

    this.writeQueue = this.writeQueue
      .catch(() => {
        // Allow new writes to continue after a previous failure.
      })
      .then(async () => {
        await mkdir(dirname, { recursive: true });
        await writeFile(this.storagePath, serialized, 'utf8');
      })
      .catch((error) => {
        console.error('[projects] Failed to persist store:', error);
        throw error;
      });

    await this.writeQueue;
  }

  private snapshot(): ProjectsSnapshot {
    return {
      activeProjectId: this.state.activeProjectId,
      projects: structuredClone(this.state.projects),
    };
  }
}

function normalizePersistedData(raw: unknown): PersistedProjectsData {
  if (!raw || typeof raw !== 'object') {
    return structuredClone(DEFAULT_DATA);
  }

  const value = raw as Partial<PersistedProjectsData>;
  const projects = Array.isArray(value.projects)
    ? value.projects
        .map((project) => normalizeProject(project))
        .filter((project): project is ProjectRecord => project !== null)
    : [];

  const activeProjectId =
    typeof value.activeProjectId === 'string' &&
    projects.some((project) => project.id === value.activeProjectId)
      ? value.activeProjectId
      : projects[0]?.id ?? null;

  return {
    version: 1,
    activeProjectId,
    projects,
  };
}

function normalizeProject(raw: unknown): ProjectRecord | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const value = raw as Partial<ProjectRecord>;
  const rootPath = typeof value.rootPath === 'string' ? value.rootPath.trim() : '';
  const name = typeof value.name === 'string' ? value.name.trim() : '';

  if (!rootPath || !name || typeof value.id !== 'string') {
    return null;
  }

  const now = new Date().toISOString();

  return {
    id: value.id,
    name: name.slice(0, 120),
    rootPath: path.resolve(rootPath),
    commands: {
      devCommand:
        typeof value.commands?.devCommand === 'string' && value.commands.devCommand.trim()
          ? value.commands.devCommand.trim()
          : 'pnpm dev',
      installCommand:
        typeof value.commands?.installCommand === 'string'
          ? value.commands.installCommand.trim() || undefined
          : undefined,
      testCommand:
        typeof value.commands?.testCommand === 'string'
          ? value.commands.testCommand.trim() || undefined
          : undefined,
    },
    preview: {
      expectedUrl:
        typeof value.preview?.expectedUrl === 'string'
          ? value.preview.expectedUrl.trim() || undefined
          : undefined,
      autoOpenPreview: value.preview?.autoOpenPreview ?? true,
    },
    chat: {
      modelId: normalizeModelId(value.chat?.modelId),
      reasoningEffort: normalizeReasoningEffort(value.chat?.reasoningEffort),
      messages: Array.isArray(value.chat?.messages)
        ? value.chat.messages
            .map((message) => normalizeStoredChatMessage(message))
            .filter((message): message is StoredChatMessage => message !== null)
        : [],
    },
    createdAt: normalizeDateString(value.createdAt, now),
    updatedAt: normalizeDateString(value.updatedAt, now),
  };
}

function normalizeStoredChatMessage(raw: unknown): StoredChatMessage | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const value = raw as Partial<StoredChatMessage>;
  if (
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.content !== 'string' ||
    !['user', 'assistant', 'system'].includes(String(value.role))
  ) {
    return null;
  }

  return {
    id: value.id,
    role: value.role as StoredChatMessage['role'],
    content: value.content,
    createdAt: normalizeDateString(value.createdAt, new Date().toISOString()),
  };
}

function normalizeModelId(modelId: string | undefined): ChatModelId {
  if (modelId && ALLOWED_MODELS.includes(modelId as ChatModelId)) {
    return modelId as ChatModelId;
  }
  return 'gpt-5';
}

function normalizeReasoningEffort(reasoningEffort: string | undefined): ReasoningEffort {
  if (reasoningEffort && ALLOWED_EFFORTS.includes(reasoningEffort as ReasoningEffort)) {
    return reasoningEffort as ReasoningEffort;
  }
  return 'medium';
}

function normalizeDateString(value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const asDate = new Date(value);
  if (Number.isNaN(asDate.valueOf())) {
    return fallback;
  }

  return asDate.toISOString();
}

async function assertDirectory(targetPath: string) {
  const targetStat = await stat(targetPath);
  if (!targetStat.isDirectory()) {
    throw new Error('Path is not a directory');
  }
}

function normalizePathForMatch(targetPath: string): string {
  const normalized = path.normalize(targetPath);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function getOwnerWindow(webContentsId: number) {
  const allWindows = BrowserWindow.getAllWindows();
  return allWindows.find((entry) => entry.webContents.id === webContentsId) ?? null;
}

export function registerProjectHandlers(ipcMain: IpcMain) {
  const storagePath = path.join(app.getPath('userData'), 'projects.json');
  const projectsStore = new ProjectsStore(storagePath);

  ipcMain.handle('projects:list', async () => {
    return projectsStore.getSnapshot();
  });

  ipcMain.handle('projects:add', async (_event, input: AddProjectInput) => {
    return projectsStore.addProject(input);
  });

  ipcMain.handle('projects:update', async (_event, input: UpdateProjectInput) => {
    return projectsStore.updateProject(input);
  });

  ipcMain.handle('projects:remove', async (_event, projectId: string) => {
    return projectsStore.removeProject(projectId);
  });

  ipcMain.handle('projects:set-active', async (_event, projectId: string | null) => {
    return projectsStore.setActiveProject(projectId);
  });

  ipcMain.handle('projects:open-folder-dialog', async (event) => {
    const ownerWindow = getOwnerWindow(event.sender.id);

    const options: OpenDialogOptions = {
      title: 'Select Project Folder',
      properties: ['openDirectory', 'createDirectory'],
    };

    const result = await dialog.showOpenDialog(ownerWindow ?? undefined, options);

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0] ?? null;
  });
}
