import { useState, useCallback } from 'react';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { EditorPanel } from '@/components/editor/EditorPanel';
import styles from './App.module.css';

export default function App() {
  const [splitPosition, setSplitPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      const container = e.currentTarget as HTMLElement;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = (x / rect.width) * 100;
      setSplitPosition(Math.min(Math.max(pct, 20), 80));
    },
    [isDragging],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div
      className={styles.container}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className={styles.editorPane} style={{ width: `${splitPosition}%` }}>
        <EditorPanel />
      </div>
      <div
        className={`${styles.divider} ${isDragging ? styles.dividerActive : ''}`}
        onMouseDown={handleMouseDown}
      />
      <div className={styles.chatPane} style={{ width: `${100 - splitPosition}%` }}>
        <ChatPanel />
      </div>
    </div>
  );
}
