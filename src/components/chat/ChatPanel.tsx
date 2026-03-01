import { useEffect, useRef, useState } from 'react';
import {
  useChat,
  type ChatModelId,
  type ReasoningEffort,
} from '@/hooks/useChat';
import styles from './ChatPanel.module.css';

const modelLabels: Record<ChatModelId, string> = {
  'gpt-5': 'GPT-5',
  'gpt-5-codex': 'GPT-5 Codex',
  'codex-mini-latest': 'Codex Mini',
};

interface ChatPanelProps {
  project: ProjectRecord;
  onPersistChat: (input: {
    projectId: string;
    chat: ProjectRecord['chat'];
  }) => Promise<void>;
}

export function ChatPanel({ project, onPersistChat }: ChatPanelProps) {
  const {
    messages,
    isLoading,
    messageCount,
    modelId,
    setModelId,
    reasoningEffort,
    setReasoningEffort,
    sendMessage,
    stopGeneration,
    clearMessages,
  } = useChat({ project, onPersistChat });

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = () => {
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleTextareaInput = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
    }
  };

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h2 className={styles.title}>{project.name}</h2>
          <span className={styles.meta}>{messageCount} messages</span>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.ghostButton} onClick={clearMessages}>
            Clear
          </button>
        </div>
      </header>

      <div className={styles.messages}>
        {messages.length === 0 && (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>Start building with AI</p>
            <p className={styles.emptySubtitle}>Ask for architecture, fixes, or code changes.</p>
          </div>
        )}

        {messages.map((message) => (
          <article
            key={message.id}
            className={`${styles.message} ${
              message.role === 'user' ? styles.userMessage : styles.assistantMessage
            }`}
          >
            <div className={styles.messageRole}>
              {message.role === 'user' ? 'You' : modelLabels[modelId]}
            </div>
            <div className={styles.messageContent}>{message.content || (isLoading ? '...' : '')}</div>
          </article>
        ))}

        <div ref={messagesEndRef} />
      </div>

      <div className={styles.composerWrap}>
        <div className={styles.inputShell}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleTextareaInput}
            placeholder="Ask Codex"
            rows={1}
            disabled={isLoading}
          />

          <div className={styles.composerFooter}>
            <div className={styles.optionsLeft}>
              <select
                className={styles.optionSelect}
                value={modelId}
                onChange={(event) => setModelId(event.target.value as ChatModelId)}
                disabled={isLoading}
                title="Model"
              >
                <option value="gpt-5">GPT-5</option>
                <option value="gpt-5-codex">GPT-5 Codex</option>
                <option value="codex-mini-latest">Codex Mini</option>
              </select>

              <select
                className={styles.optionSelect}
                value={reasoningEffort}
                onChange={(event) => setReasoningEffort(event.target.value as ReasoningEffort)}
                disabled={isLoading}
                title="Reasoning"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="extra-high">Extra High</option>
              </select>
            </div>

            <div className={styles.actionsRight}>
              {isLoading ? (
                <button className={styles.stopButton} onClick={stopGeneration}>
                  Stop
                </button>
              ) : (
                <button
                  className={styles.sendButton}
                  onClick={handleSubmit}
                  disabled={!input.trim()}
                >
                  Send
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
