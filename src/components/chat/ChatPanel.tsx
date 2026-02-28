import { useState, useRef, useEffect } from 'react';
import { useChat } from '@/hooks/useChat';
import styles from './ChatPanel.module.css';

export function ChatPanel() {
  const {
    messages,
    isLoading,
    provider,
    setProvider,
    sendMessage,
    stopGeneration,
    clearMessages,
  } = useChat();
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
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.title}>Chat</span>
        </div>
        <div className={styles.headerRight}>
          <select
            className={styles.providerSelect}
            value={provider}
            onChange={(e) => setProvider(e.target.value as 'anthropic' | 'openai')}
          >
            <option value="openai">GPT-5</option>
            <option value="anthropic">Claude</option>
          </select>
          <button
            className={styles.clearButton}
            onClick={clearMessages}
            title="Clear chat"
          >
            Clear
          </button>
        </div>
      </div>

      <div className={styles.messages}>
        {messages.length === 0 && (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>Portal AI</p>
            <p className={styles.emptySubtitle}>Ask anything about your code</p>
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`${styles.message} ${
              message.role === 'user' ? styles.userMessage : styles.assistantMessage
            }`}
          >
            <div className={styles.messageRole}>
              {message.role === 'user' ? 'You' : provider === 'anthropic' ? 'Claude' : 'GPT-5'}
            </div>
            <div className={styles.messageContent}>
              {message.content || (isLoading ? '...' : '')}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className={styles.inputArea}>
        <div className={styles.inputWrapper}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleTextareaInput}
            placeholder="Ask a question..."
            rows={1}
            disabled={isLoading}
          />
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
  );
}
