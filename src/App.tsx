import { Group, Panel, Separator } from 'react-resizable-panels';
import { useEffect } from 'react';
import { ProjectSidebar } from '@/components/projects/ProjectSidebar';
import { WorkspaceView } from '@/components/workspace/WorkspaceView';
import { useProjects } from '@/hooks/useProjects';
import { useRun } from '@/hooks/useRun';
import styles from './App.module.css';

export default function App() {
  const {
    projects,
    activeProjectId,
    activeProject,
    isLoading,
    error,
    addProjectFromDialog,
    setActiveProject,
    updateProject,
  } = useProjects();
  const { start, stop, getProjectState, getProjectLogs } = useRun();

  useEffect(() => {
    const previewApi = window.portal?.preview;
    if (!previewApi) {
      return;
    }

    void previewApi.setActive(activeProjectId);

    return () => {
      void previewApi.setActive(null);
    };
  }, [activeProjectId]);

  const handleAddProject = async () => {
    try {
      await addProjectFromDialog();
    } catch {
      // Errors are surfaced through hook state.
    }
  };

  return (
    <Group className={styles.container} orientation="horizontal" id="portal-shell">
      <Panel
        className={styles.sidebarPane}
        defaultSize="24%"
        minSize="14%"
        maxSize="40%"
      >
        <ProjectSidebar
          projects={projects}
          activeProjectId={activeProjectId}
          isLoading={isLoading}
          onAddProject={handleAddProject}
          onSelectProject={setActiveProject}
        />
        {error && <div className={styles.errorBanner}>{error}</div>}
      </Panel>
      <Separator className={styles.resizeHandle}>
        <div className={styles.resizeHandleBar} />
      </Separator>
      <Panel
        className={styles.workspacePane}
        defaultSize="76%"
        minSize="60%"
        maxSize="86%"
      >
        <WorkspaceView
          project={activeProject}
          runState={
            activeProject ? getProjectState(activeProject.id) : null
          }
          runLogs={activeProject ? getProjectLogs(activeProject.id) : []}
          onRunStart={start}
          onRunStop={stop}
          onUpdateProject={updateProject}
        />
      </Panel>
    </Group>
  );
}
