import styles from './PreviewPanel.module.css';

interface PreviewPanelProps {
  project: ProjectRecord;
}

export function PreviewPanel({ project }: PreviewPanelProps) {
  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <div className={styles.title}>App Preview</div>
        <div className={styles.meta}>Run command setup in next phase</div>
      </header>
      <div className={styles.content}>
        <p className={styles.name}>{project.name}</p>
        <p className={styles.path}>{project.rootPath}</p>
      </div>
    </section>
  );
}
