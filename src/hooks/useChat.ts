import { useState, useCallback, useRef } from 'react';

type Provider = 'anthropic' | 'openai';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [provider, setProvider] = useState<Provider>('openai');
  const assistantContentRef = useRef('');

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: content.trim(),
      };

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsLoading(true);
      assistantContentRef.current = '';

      const chatMessages = [...messages, userMessage].map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      try {
        if (typeof window !== 'undefined' && window.portal) {
          await window.portal.ai.chat(provider, chatMessages, (event) => {
            if (event.type === 'text-delta' && event.content) {
              assistantContentRef.current += event.content;
              const updated = assistantContentRef.current;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessage.id ? { ...m, content: updated } : m,
                ),
              );
            } else if (event.type === 'error') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessage.id
                    ? { ...m, content: `Error: ${event.error}` }
                    : m,
                ),
              );
            }
          });
        } else {
          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, messages: chatMessages }),
          });

          if (!res.ok) throw new Error(`HTTP ${res.status}`);

          const reader = res.body?.getReader();
          const decoder = new TextDecoder();

          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              assistantContentRef.current += decoder.decode(value, { stream: true });
              const updated = assistantContentRef.current;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessage.id ? { ...m, content: updated } : m,
                ),
              );
            }
          }
        }
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id ? { ...m, content: `Error: ${errMsg}` } : m,
          ),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [messages, isLoading, provider],
  );

  const stopGeneration = useCallback(() => {
    if (typeof window !== 'undefined' && window.portal) {
      window.portal.ai.abort();
    }
    setIsLoading(false);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isLoading,
    provider,
    setProvider,
    sendMessage,
    stopGeneration,
    clearMessages,
  };
}
