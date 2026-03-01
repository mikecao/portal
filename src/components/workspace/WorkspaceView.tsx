import { Group, Panel, Separator } from 'react-resizable-panels';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { PreviewPanel } from './PreviewPanel';
import styles from './WorkspaceView.module.css';

interface WorkspaceViewProps {
  project: ProjectRecord | null;
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

export function WorkspaceView({
  project,
  runState,
  runLogs,
  onRunStart,
  onRunStop,
  onUpdateProject,
}: WorkspaceViewProps) {
  if (!project) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyStateTitle}>No Project Selected</p>
        <p className={styles.emptyStateSubtitle}>Add a project to start a workspace.</p>
      </div>
    );
  }

  return (
    <Group className={styles.container} orientation="horizontal" id="workspace-layout">
      <Panel className={styles.chatPane} defaultSize="48%" minSize="30%" maxSize="70%">
        <ChatPanel key={project.id} />
      </Panel>
      <Separator className={styles.resizeHandle}>
        <div className={styles.resizeHandleBar} />
      </Separator>
      <Panel className={styles.previewPane} defaultSize="52%" minSize="30%" maxSize="70%">
        <PreviewPanel
          project={project}
          runState={runState}
          runLogs={runLogs}
          onRunStart={onRunStart}
          onRunStop={onRunStop}
          onUpdateProject={onUpdateProject}
        />
      </Panel>
    </Group>
  );
}
