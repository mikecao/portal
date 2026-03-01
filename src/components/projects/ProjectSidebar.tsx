import { useState, type MouseEvent } from 'react';
import styles from './ProjectSidebar.module.css';

interface ProjectSidebarProps {
  projects: ProjectRecord[];
  activeProjectId: string | null;
  isLoading: boolean;
  onAddProject: () => Promise<unknown>;
  onSelectProject: (projectId: string) => void;
  onRemoveProject: (projectId: string) => Promise<unknown>;
}

export function ProjectSidebar({
  projects,
  activeProjectId,
  isLoading,
  onAddProject,
  onSelectProject,
  onRemoveProject,
}: ProjectSidebarProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [removingProjectId, setRemovingProjectId] = useState<string | null>(null);

  const handleAdd = async () => {
    if (isAdding) return;
    setIsAdding(true);
    try {
      await onAddProject();
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (event: MouseEvent<HTMLButtonElement>, project: ProjectRecord) => {
    event.stopPropagation();

    if (removingProjectId) return;

    const shouldRemove = window.confirm(
      `Remove project "${project.name}" from this app?`,
    );
    if (!shouldRemove) {
      return;
    }

    setRemovingProjectId(project.id);
    try {
      await onRemoveProject(project.id);
    } finally {
      setRemovingProjectId(null);
    }
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.topBar}>
        <button
          className={styles.addButton}
          onClick={handleAdd}
          disabled={isLoading || isAdding}
          title="Add project folder"
        >
          + Add Project
        </button>
      </div>

      <div className={styles.projectList}>
        {projects.length === 0 ? (
          <div className={styles.emptyState}>No projects yet</div>
        ) : (
          projects.map((project) => {
            const isActive = project.id === activeProjectId;

            return (
              <div
                key={project.id}
                className={`${styles.projectRow} ${isActive ? styles.activeProjectRow : ''}`}
              >
                <button
                  className={styles.projectTab}
                  onClick={() => onSelectProject(project.id)}
                  title={project.rootPath}
                >
                  <span className={styles.projectName}>{project.name}</span>
                  <span className={styles.projectPath}>{project.rootPath}</span>
                </button>
                <button
                  className={styles.removeButton}
                  onClick={(event) => handleRemove(event, project)}
                  title={`Remove ${project.name}`}
                  aria-label={`Remove ${project.name}`}
                  disabled={removingProjectId === project.id}
                >
                  x
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
