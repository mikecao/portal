import { useEffect, useMemo, useState } from 'react';
import styles from './PreviewPanel.module.css';

interface PreviewPanelProps {
  project: ProjectRecord;
  runState: RunState | null;
  runLogs: Array<{
    stream: 'stdout' | 'stderr';
    chunk: string;
    timestamp: string;
  }>;
  onRunStart: (input: RunStartInput) => Promise<RunState>;
  onRunStop: (projectId: string) => Promise<RunState>;
  onUpdateProject: (input: {
    projectId: string;
    patch: UpdateProjectInput['patch'];
  }) => Promise<ProjectsSnapshot>;
}

const RUNNING_STATES: RunStatus[] = ['starting', 'running'];

export function PreviewPanel({
  project,
  runState,
  runLogs,
  onRunStart,
  onRunStop,
  onUpdateProject,
}: PreviewPanelProps) {
  const [devCommand, setDevCommand] = useState(project.commands.devCommand);
  const [expectedUrl, setExpectedUrl] = useState(project.preview.expectedUrl ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [isRunningAction, setIsRunningAction] = useState(false);

  useEffect(() => {
    setDevCommand(project.commands.devCommand);
    setExpectedUrl(project.preview.expectedUrl ?? '');
  }, [project.commands.devCommand, project.preview.expectedUrl, project.id]);

  const status = runState?.status ?? 'idle';
  const isRunning = RUNNING_STATES.includes(status);

  const activeUrl = useMemo(() => {
    if (runState?.detectedUrl) {
      return runState.detectedUrl;
    }
    if (expectedUrl.trim()) {
      return expectedUrl.trim();
    }
    return null;
  }, [expectedUrl, runState?.detectedUrl]);

  const handleSaveSettings = async () => {
    if (!devCommand.trim()) {
      return;
    }

    setIsSaving(true);
    try {
      await onUpdateProject({
        projectId: project.id,
        patch: {
          commands: {
            ...project.commands,
            devCommand: devCommand.trim(),
          },
          preview: {
            ...project.preview,
            expectedUrl: expectedUrl.trim() || undefined,
          },
        },
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRunClick = async () => {
    if (isRunningAction) return;

    setIsRunningAction(true);
    try {
      if (isRunning) {
        await onRunStop(project.id);
      } else {
        await onRunStart({
          projectId: project.id,
          command: devCommand.trim() || project.commands.devCommand,
          cwd: project.rootPath,
        });
      }
    } finally {
      setIsRunningAction(false);
    }
  };

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <div className={styles.titleWrap}>
          <div className={styles.title}>App Preview</div>
          <span className={`${styles.statusChip} ${styles[`status${status}`]}`}>
            {status}
          </span>
        </div>
        <button
          className={isRunning ? styles.stopButton : styles.runButton}
          onClick={handleRunClick}
          disabled={isRunningAction || !devCommand.trim()}
        >
          {isRunning ? 'Stop' : 'Run'}
        </button>
      </header>

      <div className={styles.settings}>
        <label className={styles.field}>
          <span className={styles.label}>Dev Command</span>
          <input
            className={styles.input}
            value={devCommand}
            onChange={(event) => setDevCommand(event.target.value)}
            placeholder="pnpm dev"
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Expected URL</span>
          <input
            className={styles.input}
            value={expectedUrl}
            onChange={(event) => setExpectedUrl(event.target.value)}
            placeholder="http://localhost:3000"
          />
        </label>

        <button
          className={styles.saveButton}
          onClick={handleSaveSettings}
          disabled={isSaving || !devCommand.trim()}
        >
          {isSaving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      <div className={styles.previewInfo}>
        <p className={styles.name}>{project.name}</p>
        <p className={styles.path}>{project.rootPath}</p>
        {activeUrl && (
          <a className={styles.url} href={activeUrl} target="_blank" rel="noreferrer">
            {activeUrl}
          </a>
        )}
      </div>

      <div className={styles.logs}>
        <div className={styles.logsHeader}>Run Logs</div>
        <div className={styles.logsBody}>
          {runLogs.length === 0 ? (
            <div className={styles.logsEmpty}>No logs yet.</div>
          ) : (
            runLogs.map((line, index) => (
              <div
                key={`${line.timestamp}-${index}`}
                className={`${styles.logLine} ${line.stream === 'stderr' ? styles.logError : ''}`}
              >
                <span className={styles.logStream}>{line.stream}</span>
                <span className={styles.logChunk}>{line.chunk}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
