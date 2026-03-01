import { useCallback, useEffect, useMemo, useState } from 'react';

interface RunLogLine {
  stream: 'stdout' | 'stderr';
  chunk: string;
  timestamp: string;
}

interface UseRunState {
  statesByProjectId: Record<string, RunState>;
  logsByProjectId: Record<string, RunLogLine[]>;
}

export function useRun() {
  const [state, setState] = useState<UseRunState>({
    statesByProjectId: {},
    logsByProjectId: {},
  });

  useEffect(() => {
    let isDisposed = false;
    const runApi = window.portal?.run;

    if (!runApi) {
      return;
    }

    const setup = async () => {
      try {
        const initialStates = await runApi.states();
        if (isDisposed) {
          return;
        }

        setState((prev) => ({
          ...prev,
          statesByProjectId: initialStates.reduce<Record<string, RunState>>(
            (acc, entry) => {
              acc[entry.projectId] = entry;
              return acc;
            },
            {},
          ),
        }));
      } catch (error) {
        console.error('[run] failed to initialize states', error);
      }
    };

    void setup();

    const unsubscribe = runApi.onEvent((event) => {
      if (event.type === 'state') {
        setState((prev) => ({
          ...prev,
          statesByProjectId: {
            ...prev.statesByProjectId,
            [event.state.projectId]: event.state,
          },
        }));
        return;
      }

      setState((prev) => {
        const currentLogs = prev.logsByProjectId[event.projectId] ?? [];
        const nextLogs = [...currentLogs, event].slice(-500);

        return {
          ...prev,
          logsByProjectId: {
            ...prev.logsByProjectId,
            [event.projectId]: nextLogs,
          },
        };
      });
    });

    return () => {
      isDisposed = true;
      unsubscribe();
    };
  }, []);

  const start = useCallback(async (input: RunStartInput) => {
    const runApi = window.portal?.run;
    if (!runApi) {
      return {
        projectId: input.projectId,
        status: 'error',
        command: input.command,
        cwd: input.cwd,
        lastError: 'Run API unavailable outside Electron context',
      } satisfies RunState;
    }

    const nextState = await runApi.start(input);
    setState((prev) => ({
      ...prev,
      statesByProjectId: {
        ...prev.statesByProjectId,
        [input.projectId]: nextState,
      },
      logsByProjectId: {
        ...prev.logsByProjectId,
        [input.projectId]: [],
      },
    }));
    return nextState;
  }, []);

  const stop = useCallback(async (projectId: string) => {
    const runApi = window.portal?.run;
    if (!runApi) {
      return {
        projectId,
        status: 'stopped',
        command: '',
        cwd: '',
      } satisfies RunState;
    }

    const nextState = await runApi.stop(projectId);
    setState((prev) => ({
      ...prev,
      statesByProjectId: {
        ...prev.statesByProjectId,
        [projectId]: nextState,
      },
    }));
    return nextState;
  }, []);

  const getProjectState = useCallback(
    (projectId: string): RunState =>
      state.statesByProjectId[projectId] ?? {
        projectId,
        status: 'idle',
        command: '',
        cwd: '',
      },
    [state.statesByProjectId],
  );

  const getProjectLogs = useCallback(
    (projectId: string): RunLogLine[] => state.logsByProjectId[projectId] ?? [],
    [state.logsByProjectId],
  );

  const allStates = useMemo(
    () => Object.values(state.statesByProjectId),
    [state.statesByProjectId],
  );

  return {
    start,
    stop,
    getProjectState,
    getProjectLogs,
    allStates,
  };
}
