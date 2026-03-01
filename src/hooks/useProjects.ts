import { useCallback, useEffect, useMemo, useState } from 'react';

interface UseProjectsState {
  projects: ProjectRecord[];
  activeProjectId: string | null;
  isLoading: boolean;
  error: string | null;
}

interface AddProjectOptions {
  rootPath: string;
  name?: string;
  commands?: Partial<ProjectRecord['commands']>;
  preview?: Partial<ProjectRecord['preview']>;
}

interface UpdateProjectOptions {
  projectId: string;
  patch: UpdateProjectInput['patch'];
}

export function useProjects() {
  const [state, setState] = useState<UseProjectsState>({
    projects: [],
    activeProjectId: null,
    isLoading: true,
    error: null,
  });

  const applySnapshot = useCallback((snapshot: ProjectsSnapshot) => {
    setState((prev) => ({
      ...prev,
      projects: snapshot.projects,
      activeProjectId: snapshot.activeProjectId,
      isLoading: false,
      error: null,
    }));
  }, []);

  const handleError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    setState((prev) => ({ ...prev, isLoading: false, error: message }));
  }, []);

  const reload = useCallback(async () => {
    try {
      const snapshot = await window.portal.projects.list();
      applySnapshot(snapshot);
      return snapshot;
    } catch (error: unknown) {
      handleError(error);
      throw error;
    }
  }, [applySnapshot, handleError]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const addProject = useCallback(
    async (input: AddProjectOptions) => {
      try {
        const snapshot = await window.portal.projects.add(input);
        applySnapshot(snapshot);
        return snapshot;
      } catch (error: unknown) {
        handleError(error);
        throw error;
      }
    },
    [applySnapshot, handleError],
  );

  const addProjectFromDialog = useCallback(async () => {
    const rootPath = await window.portal.projects.openFolderDialog();
    if (!rootPath) {
      return null;
    }

    return addProject({ rootPath });
  }, [addProject]);

  const setActiveProject = useCallback(
    async (projectId: string | null) => {
      try {
        const snapshot = await window.portal.projects.setActive(projectId);
        applySnapshot(snapshot);
      } catch (error: unknown) {
        handleError(error);
      }
    },
    [applySnapshot, handleError],
  );

  const updateProject = useCallback(
    async (input: UpdateProjectOptions) => {
      try {
        const snapshot = await window.portal.projects.update(input);
        applySnapshot(snapshot);
        return snapshot;
      } catch (error: unknown) {
        handleError(error);
        throw error;
      }
    },
    [applySnapshot, handleError],
  );

  const activeProject = useMemo(
    () => state.projects.find((project) => project.id === state.activeProjectId) ?? null,
    [state.activeProjectId, state.projects],
  );

  return {
    projects: state.projects,
    activeProjectId: state.activeProjectId,
    activeProject,
    isLoading: state.isLoading,
    error: state.error,
    reload,
    addProject,
    addProjectFromDialog,
    setActiveProject,
    updateProject,
  };
}
