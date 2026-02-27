'use client';

import styles from './EditorPanel.module.css';

export function EditorPanel() {
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Editor</span>
      </div>
      <div className={styles.content}>
        <div className={styles.placeholder}>
          <p className={styles.placeholderTitle}>Portal</p>
          <p className={styles.placeholderSubtitle}>
            Open a file or start a conversation to begin
          </p>
        </div>
      </div>
    </div>
  );
}
