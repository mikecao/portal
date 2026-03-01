import { spawn, type ChildProcess } from 'node:child_process';
import { type IpcMain, BrowserWindow, app } from 'electron';

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

interface RunStartInput {
  projectId: string;
  command: string;
  cwd: string;
}

type RunEventPayload =
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

const RUN_EVENT_CHANNEL = 'run:event';

class RunProcessManager {
  private readonly states = new Map<string, RunState>();
  private readonly processes = new Map<string, ChildProcess>();

  async start(input: RunStartInput): Promise<RunState> {
    const command = input.command.trim();
    const cwd = input.cwd.trim();

    if (!input.projectId) {
      throw new Error('projectId is required');
    }
    if (!command) {
      throw new Error('command is required');
    }
    if (!cwd) {
      throw new Error('cwd is required');
    }

    await this.stop(input.projectId);

    const state: RunState = {
      projectId: input.projectId,
      status: 'starting',
      command,
      cwd,
      startedAt: new Date().toISOString(),
    };

    this.states.set(input.projectId, state);
    this.emit({ type: 'state', state });

    const child = spawn(command, {
      cwd,
      shell: true,
      env: process.env,
      detached: process.platform !== 'win32',
    });

    this.processes.set(input.projectId, child);

    child.on('spawn', () => {
      const currentState = this.getState(input.projectId);
      const nextState: RunState = {
        ...currentState,
        status: 'running',
        pid: child.pid,
      };
      this.states.set(input.projectId, nextState);
      this.emit({ type: 'state', state: nextState });
    });

    child.stdout?.on('data', (buffer: Buffer) => {
      const chunk = buffer.toString('utf8');
      this.emit({
        type: 'log',
        projectId: input.projectId,
        stream: 'stdout',
        chunk,
        timestamp: new Date().toISOString(),
      });
      this.captureDetectedUrl(input.projectId, chunk);
    });

    child.stderr?.on('data', (buffer: Buffer) => {
      const chunk = buffer.toString('utf8');
      this.emit({
        type: 'log',
        projectId: input.projectId,
        stream: 'stderr',
        chunk,
        timestamp: new Date().toISOString(),
      });
      this.captureDetectedUrl(input.projectId, chunk);
    });

    child.on('error', (error) => {
      const nextState: RunState = {
        ...this.getState(input.projectId),
        status: 'error',
        lastError: error.message,
        exitedAt: new Date().toISOString(),
      };
      this.states.set(input.projectId, nextState);
      this.emit({ type: 'state', state: nextState });
    });

    child.on('close', (code) => {
      const current = this.getState(input.projectId);
      const nextState: RunState = {
        ...current,
        status: code === 0 || code === null ? 'stopped' : 'error',
        exitCode: code,
        exitedAt: new Date().toISOString(),
      };
      this.states.set(input.projectId, nextState);
      this.processes.delete(input.projectId);
      this.emit({ type: 'state', state: nextState });
    });

    return state;
  }

  async stop(projectId: string): Promise<RunState> {
    const child = this.processes.get(projectId);
    if (child) {
      await killProcessTree(child);
      this.processes.delete(projectId);
    }

    const current = this.getState(projectId);
    const nextState: RunState = {
      ...current,
      status: 'stopped',
      exitedAt: new Date().toISOString(),
    };
    this.states.set(projectId, nextState);
    this.emit({ type: 'state', state: nextState });

    return nextState;
  }

  getState(projectId: string): RunState {
    return (
      this.states.get(projectId) ?? {
        projectId,
        status: 'idle',
        command: '',
        cwd: '',
      }
    );
  }

  listStates(): RunState[] {
    return Array.from(this.states.values());
  }

  async stopAll() {
    await Promise.all(Array.from(this.processes.keys()).map((projectId) => this.stop(projectId)));
  }

  private captureDetectedUrl(projectId: string, chunk: string) {
    const match = chunk.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?[^\s]*/i);
    if (!match) {
      return;
    }

    const normalizedUrl = match[0].replace('0.0.0.0', 'localhost');
    const currentState = this.getState(projectId);

    if (currentState.detectedUrl === normalizedUrl) {
      return;
    }

    const nextState: RunState = {
      ...currentState,
      detectedUrl: normalizedUrl,
    };

    this.states.set(projectId, nextState);
    this.emit({ type: 'state', state: nextState });
  }

  private emit(payload: RunEventPayload) {
    const windows = BrowserWindow.getAllWindows();
    for (const window of windows) {
      window.webContents.send(RUN_EVENT_CHANNEL, payload);
    }
  }
}

async function killProcessTree(child: ChildProcess): Promise<void> {
  const pid = child.pid;
  if (!pid) {
    return;
  }

  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
        windowsHide: true,
      });
      killer.on('close', () => resolve());
      killer.on('error', () => resolve());
    });
    return;
  }

  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      return;
    }
  }

  await new Promise<void>((resolve) => {
    setTimeout(() => {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // Process is already gone.
        }
      }
      resolve();
    }, 1500);
  });
}

export function registerRunHandlers(ipcMain: IpcMain) {
  const manager = new RunProcessManager();

  ipcMain.handle('run:start', async (_event, input: RunStartInput) => {
    return manager.start(input);
  });

  ipcMain.handle('run:stop', async (_event, projectId: string) => {
    return manager.stop(projectId);
  });

  ipcMain.handle('run:state', async (_event, projectId: string) => {
    return manager.getState(projectId);
  });

  ipcMain.handle('run:states', async () => {
    return manager.listStates();
  });

  app.on('before-quit', () => {
    void manager.stopAll();
  });
}
