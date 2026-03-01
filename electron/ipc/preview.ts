import { app, BrowserWindow, type IpcMain, WebContentsView } from 'electron';

interface PreviewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SetBoundsInput {
  projectId: string;
  bounds: PreviewBounds;
}

const MIN_DIMENSION = 0;

class PreviewViewManager {
  private readonly views = new Map<string, WebContentsView>();
  private readonly boundsByProjectId = new Map<string, PreviewBounds>();
  private activeProjectId: string | null = null;
  private hostWindow: BrowserWindow | null = null;

  setActiveProject(hostWindow: BrowserWindow | null, projectId: string | null) {
    this.hostWindow = hostWindow;

    if (this.activeProjectId === projectId) {
      this.refreshActiveBounds();
      return;
    }

    const previous = this.activeProjectId;
    this.activeProjectId = projectId;

    if (previous) {
      this.detachView(previous);
    }

    if (projectId) {
      this.attachView(projectId);
      this.refreshActiveBounds();
    }
  }

  setBounds(input: SetBoundsInput) {
    this.boundsByProjectId.set(input.projectId, sanitizeBounds(input.bounds));

    if (this.activeProjectId === input.projectId) {
      this.refreshActiveBounds();
    }
  }

  async navigate(projectId: string, url: string) {
    if (!url.trim()) {
      return;
    }

    const view = this.getOrCreateView(projectId);
    await view.webContents.loadURL(url.trim());

    if (this.activeProjectId === projectId) {
      this.attachView(projectId);
      this.refreshActiveBounds();
    }
  }

  async clear(projectId: string) {
    const view = this.views.get(projectId);
    if (!view) {
      return;
    }

    await view.webContents.loadURL('about:blank');
  }

  destroy() {
    for (const [projectId, view] of this.views.entries()) {
      this.detachView(projectId);
      view.webContents.close();
    }
    this.views.clear();
    this.boundsByProjectId.clear();
    this.activeProjectId = null;
    this.hostWindow = null;
  }

  private getOrCreateView(projectId: string) {
    const existing = this.views.get(projectId);
    if (existing) {
      return existing;
    }

    const view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    this.views.set(projectId, view);
    return view;
  }

  private attachView(projectId: string) {
    if (!this.hostWindow) {
      return;
    }

    const view = this.getOrCreateView(projectId);
    const alreadyAttached = this.hostWindow.contentView.children.includes(view);

    if (!alreadyAttached) {
      this.hostWindow.contentView.addChildView(view);
    }
  }

  private detachView(projectId: string) {
    if (!this.hostWindow) {
      return;
    }

    const view = this.views.get(projectId);
    if (!view) {
      return;
    }

    const isAttached = this.hostWindow.contentView.children.includes(view);
    if (isAttached) {
      this.hostWindow.contentView.removeChildView(view);
    }
  }

  private refreshActiveBounds() {
    if (!this.hostWindow || !this.activeProjectId) {
      return;
    }

    const view = this.views.get(this.activeProjectId);
    if (!view) {
      return;
    }

    const bounds =
      this.boundsByProjectId.get(this.activeProjectId) ??
      this.boundsByProjectId.get('global');

    if (!bounds) {
      return;
    }

    view.setBounds(sanitizeBounds(bounds));
  }
}

function sanitizeBounds(bounds: PreviewBounds): PreviewBounds {
  return {
    x: Math.max(MIN_DIMENSION, Math.floor(bounds.x)),
    y: Math.max(MIN_DIMENSION, Math.floor(bounds.y)),
    width: Math.max(MIN_DIMENSION, Math.floor(bounds.width)),
    height: Math.max(MIN_DIMENSION, Math.floor(bounds.height)),
  };
}

function resolveWindow(senderId: number) {
  return BrowserWindow.getAllWindows().find((window) => window.webContents.id === senderId) ?? null;
}

export function registerPreviewHandlers(ipcMain: IpcMain) {
  const manager = new PreviewViewManager();

  ipcMain.handle('preview:set-active', async (event, projectId: string | null) => {
    const hostWindow = resolveWindow(event.sender.id);
    manager.setActiveProject(hostWindow, projectId);
  });

  ipcMain.handle('preview:set-bounds', async (_event, input: SetBoundsInput) => {
    manager.setBounds(input);
  });

  ipcMain.handle('preview:navigate', async (_event, projectId: string, url: string) => {
    await manager.navigate(projectId, url);
  });

  ipcMain.handle('preview:clear', async (_event, projectId: string) => {
    await manager.clear(projectId);
  });

  app.on('before-quit', () => {
    manager.destroy();
  });
}
