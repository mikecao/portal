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

  const getProjectsApi = useCallback(() => window.portal?.projects ?? null, []);

  const reload = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true }));

    const projectsApi = getProjectsApi();
    if (!projectsApi) {
      applySnapshot({
        activeProjectId: null,
        projects: [],
      });
      return null;
    }

    try {
      const snapshot = await projectsApi.list();
      applySnapshot(snapshot);
      return snapshot;
    } catch (error: unknown) {
      handleError(error);
      return null;
    }
  }, [applySnapshot, getProjectsApi, handleError]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const addProject = useCallback(
    async (input: AddProjectOptions) => {
      const projectsApi = getProjectsApi();
      if (!projectsApi) {
        handleError(new Error('Projects API unavailable outside Electron context'));
        return null;
      }

      try {
        const snapshot = await projectsApi.add(input);
        applySnapshot(snapshot);
        return snapshot;
      } catch (error: unknown) {
        handleError(error);
        return null;
      }
    },
    [applySnapshot, getProjectsApi, handleError],
  );

  const addProjectFromDialog = useCallback(async () => {
    const projectsApi = getProjectsApi();
    if (!projectsApi) {
      return null;
    }

    const rootPath = await projectsApi.openFolderDialog();
    if (!rootPath) {
      return null;
    }

    return addProject({ rootPath });
  }, [addProject, getProjectsApi]);

  const setActiveProject = useCallback(
    async (projectId: string | null) => {
      const projectsApi = getProjectsApi();
      if (!projectsApi) {
        return;
      }

      try {
        const snapshot = await projectsApi.setActive(projectId);
        applySnapshot(snapshot);
      } catch (error: unknown) {
        handleError(error);
      }
    },
    [applySnapshot, getProjectsApi, handleError],
  );

  const updateProject = useCallback(
    async (input: UpdateProjectOptions) => {
      const projectsApi = getProjectsApi();
      if (!projectsApi) {
        handleError(new Error('Projects API unavailable outside Electron context'));
        return null;
      }

      try {
        const snapshot = await projectsApi.update(input);
        applySnapshot(snapshot);
        return snapshot;
      } catch (error: unknown) {
        handleError(error);
        return null;
      }
    },
    [applySnapshot, getProjectsApi, handleError],
  );

  const removeProject = useCallback(
    async (projectId: string) => {
      const projectsApi = getProjectsApi();
      if (!projectsApi) {
        handleError(new Error('Projects API unavailable outside Electron context'));
        return null;
      }

      try {
        const snapshot = await projectsApi.remove(projectId);
        applySnapshot(snapshot);
        return snapshot;
      } catch (error: unknown) {
        handleError(error);
        return null;
      }
    },
    [applySnapshot, getProjectsApi, handleError],
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
    removeProject,
  };
}
