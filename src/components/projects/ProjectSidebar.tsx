import { useState } from 'react';
import styles from './ProjectSidebar.module.css';

interface ProjectSidebarProps {
  projects: ProjectRecord[];
  activeProjectId: string | null;
  isLoading: boolean;
  onAddProject: () => Promise<unknown>;
  onSelectProject: (projectId: string) => void;
}

export function ProjectSidebar({
  projects,
  activeProjectId,
  isLoading,
  onAddProject,
  onSelectProject,
}: ProjectSidebarProps) {
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = async () => {
    if (isAdding) return;
    setIsAdding(true);
    try {
      await onAddProject();
    } finally {
      setIsAdding(false);
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
              <button
                key={project.id}
                className={`${styles.projectTab} ${isActive ? styles.activeProjectTab : ''}`}
                onClick={() => onSelectProject(project.id)}
                title={project.rootPath}
              >
                <span className={styles.projectName}>{project.name}</span>
                <span className={styles.projectPath}>{project.rootPath}</span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
