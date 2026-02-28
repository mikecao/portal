import { Group, Panel, Separator } from 'react-resizable-panels';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { EditorPanel } from '@/components/editor/EditorPanel';
import styles from './App.module.css';

export default function App() {
  return (
    <Group className={styles.container} orientation="horizontal" id="portal-layout">
      <Panel
        className={styles.editorPane}
        defaultSize="50%"
        minSize="20%"
        maxSize="80%"
      >
        <EditorPanel />
      </Panel>
      <Separator className={styles.resizeHandle}>
        <div className={styles.resizeHandleBar} />
      </Separator>
      <Panel
        className={styles.chatPane}
        defaultSize="50%"
        minSize="20%"
        maxSize="80%"
      >
        <ChatPanel />
      </Panel>
    </Group>
  );
}
