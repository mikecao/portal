import path from 'node:path';
import os from 'node:os';
import { readdir, readFile, stat } from 'node:fs/promises';
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
const allowedEfforts: ReasoningEffort[] = ['low', 'medium', 'high', 'extra-high'];
const PROJECT_CONTEXT_TTL_MS = 15_000;
const PROJECT_CONTEXT_MAX_FILES = 300;
const PROJECT_CONTEXT_MAX_DEPTH = 7;
const PROJECT_CONTEXT_MAX_EXCERPT_FILES = 14;
const PROJECT_CONTEXT_MAX_FILE_BYTES = 128_000;
const PROJECT_CONTEXT_MAX_FILE_CHARS = 4_000;
const PROJECT_CONTEXT_MAX_TOTAL_CHARS = 38_000;
const IGNORED_DIRS = new Set([
  '.git',
  '.next',
  '.turbo',
  '.cache',
  '.idea',
  '.vscode',
  'node_modules',
  'dist',
  'dist-electron',
  'build',
  'coverage',
  '.pnpm-store',
]);
const IGNORED_FILE_PREFIXES = ['.env'];
const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.css',
  '.scss',
  '.less',
  '.html',
  '.yml',
  '.yaml',
  '.toml',
  '.txt',
  '.sql',
  '.graphql',
  '.gql',
  '.sh',
  '.zsh',
  '.bash',
  '.py',
  '.go',
  '.rs',
]);

interface CachedProjectContext {
  rootMtimeMs: number;
  cachedAt: number;
  context: string;
}

const projectContextCache = new Map<string, CachedProjectContext>();

function normalizeModelId(modelId: string | undefined): ChatModelId {
  if (modelId && allowedModels.includes(modelId as ChatModelId)) {
    return modelId as ChatModelId;
  }
  return 'gpt-5';
}

function normalizeReasoningEffort(
  reasoningEffort: string | undefined,
): ReasoningEffort {
  if (reasoningEffort === 'none') {
    return 'low';
  }

  if (reasoningEffort && allowedEfforts.includes(reasoningEffort as ReasoningEffort)) {
    return reasoningEffort as ReasoningEffort;
  }
  return 'medium';
}

function getModel(options: AIChatOptions | undefined) {
  const modelId = normalizeModelId(options?.modelId);
  const reasoningEffort = normalizeReasoningEffort(options?.reasoningEffort);
  const providerReasoningEffort =
    reasoningEffort === 'extra-high' ? 'high' : reasoningEffort;

  return chatgpt(modelId, {
    reasoningEffort: providerReasoningEffort,
  });
}

async function buildProjectContext(
  projectRootPath: string | undefined,
  projectName: string | undefined,
) {
  const rootPath = projectRootPath?.trim();
  if (!rootPath) {
    return null;
  }

  let rootStat;
  try {
    rootStat = await stat(rootPath);
  } catch {
    return null;
  }

  if (!rootStat.isDirectory()) {
    return null;
  }

  const cached = projectContextCache.get(rootPath);
  const now = Date.now();
  if (
    cached &&
    cached.rootMtimeMs === rootStat.mtimeMs &&
    now - cached.cachedAt < PROJECT_CONTEXT_TTL_MS
  ) {
    return cached.context;
  }

  const files = await collectProjectFiles(rootPath);
  const sorted = files.sort((a, b) => {
    const priorityDelta = getFilePriority(a) - getFilePriority(b);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return a.localeCompare(b);
  });

  const treeLines = files.slice(0, 220).map((file) => `- ${file}`);
  const truncatedTreeNote =
    files.length > treeLines.length
      ? `\n... ${files.length - treeLines.length} more files omitted`
      : '';

  const excerpts: string[] = [];
  let totalChars = 0;

  for (const relPath of sorted) {
    if (excerpts.length >= PROJECT_CONTEXT_MAX_EXCERPT_FILES) {
      break;
    }

    const excerpt = await readFileExcerpt(rootPath, relPath);
    if (!excerpt) {
      continue;
    }

    const section = `\nFile: ${relPath}\n\`\`\`\n${excerpt}\n\`\`\``;
    if (totalChars + section.length > PROJECT_CONTEXT_MAX_TOTAL_CHARS) {
      break;
    }

    excerpts.push(section);
    totalChars += section.length;
  }

  const context = [
    `You have read-only access to a local project snapshot for "${projectName || path.basename(rootPath)}".`,
    `Project root: ${rootPath}`,
    'When asked about the project, use this snapshot as source of truth. If details are missing, say what is missing.',
    '',
    'Project file tree (truncated):',
    ...treeLines,
    truncatedTreeNote,
    '',
    'Key file excerpts:',
    excerpts.length > 0 ? excerpts.join('\n') : '(No readable text files captured.)',
  ].join('\n');

  projectContextCache.set(rootPath, {
    rootMtimeMs: rootStat.mtimeMs,
    cachedAt: now,
    context,
  });

  return context;
}

async function collectProjectFiles(rootPath: string) {
  const files: string[] = [];
  const queue: Array<{ abs: string; rel: string; depth: number }> = [
    { abs: rootPath, rel: '', depth: 0 },
  ];

  while (queue.length > 0 && files.length < PROJECT_CONTEXT_MAX_FILES) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    let entries;
    try {
      entries = await readdir(current.abs, { withFileTypes: true });
    } catch {
      continue;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const relPath = current.rel ? path.join(current.rel, entry.name) : entry.name;
      const absPath = path.join(current.abs, entry.name);

      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        if (current.depth >= PROJECT_CONTEXT_MAX_DEPTH) {
          continue;
        }
        if (IGNORED_DIRS.has(entry.name)) {
          continue;
        }
        queue.push({
          abs: absPath,
          rel: relPath,
          depth: current.depth + 1,
        });
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (IGNORED_FILE_PREFIXES.some((prefix) => entry.name.startsWith(prefix))) {
        continue;
      }

      files.push(relPath);
      if (files.length >= PROJECT_CONTEXT_MAX_FILES) {
        break;
      }
    }
  }

  return files;
}

function getFilePriority(relPath: string) {
  const basename = path.basename(relPath).toLowerCase();

  if (basename === 'readme.md' || basename === 'readme') return 0;
  if (basename === 'package.json') return 1;
  if (basename === 'pnpm-lock.yaml' || basename === 'yarn.lock') return 2;
  if (basename === 'tsconfig.json' || basename === 'vite.config.ts') return 3;
  if (basename === 'next.config.js' || basename === 'next.config.mjs') return 4;
  if (basename === 'app.tsx' || basename === 'main.tsx' || basename === 'index.tsx')
    return 5;
  if (relPath.startsWith('src/')) return 6;
  if (relPath.startsWith('electron/')) return 7;
  if (relPath.startsWith('server/')) return 8;

  return 20;
}

async function readFileExcerpt(rootPath: string, relPath: string) {
  const ext = path.extname(relPath).toLowerCase();
  const basename = path.basename(relPath).toLowerCase();
  const looksText = TEXT_EXTENSIONS.has(ext) || basename === 'dockerfile';
  if (!looksText) {
    return null;
  }

  const absPath = path.join(rootPath, relPath);
  let fileStat;
  try {
    fileStat = await stat(absPath);
  } catch {
    return null;
  }

  if (!fileStat.isFile() || fileStat.size > PROJECT_CONTEXT_MAX_FILE_BYTES) {
    return null;
  }

  let content = '';
  try {
    content = await readFile(absPath, 'utf8');
  } catch {
    return null;
  }

  if (!content || content.includes('\u0000')) {
    return null;
  }

  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length <= PROJECT_CONTEXT_MAX_FILE_CHARS) {
    return normalized;
  }

  return `${normalized.slice(0, PROJECT_CONTEXT_MAX_FILE_CHARS)}\n... [truncated]`;
}

export function registerAIHandlers(ipcMain: IpcMain) {
  ipcMain.handle('ai:chat', async (event, request: ChatRequest) => {
    const { messages, options, channel } = request;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;

    currentAbortController = new AbortController();

    try {
      let requestMessages: AIMessage[] = messages;
      const projectContext = await buildProjectContext(
        options?.projectRootPath,
        options?.projectName,
      );

      if (projectContext) {
        requestMessages = [
          { role: 'system', content: projectContext },
          ...messages,
        ];
      }

      const result = streamText({
        model: getModel(options),
        messages: requestMessages,
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
