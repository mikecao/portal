import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export type ChatModelId = 'gpt-5' | 'gpt-5-codex' | 'codex-mini-latest';
export type ReasoningEffort = 'low' | 'medium' | 'high' | 'extra-high';

interface UseChatInput {
  project: ProjectRecord;
  onPersistChat: (input: {
    projectId: string;
    chat: ProjectRecord['chat'];
  }) => Promise<void>;
}

function toLocalMessages(messages: StoredChatMessage[]): Message[] {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
    }));
}

function toStoredMessages(messages: Message[]): StoredChatMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
  }));
}

function buildChatSignature(
  messages: Array<{
    id: string;
    role: string;
    content: string;
    createdAt: string;
  }>,
  modelId: ChatModelId,
  reasoningEffort: ReasoningEffort,
): string {
  return JSON.stringify({
    modelId,
    reasoningEffort,
    messages,
  });
}

export function useChat({ project, onPersistChat }: UseChatInput) {
  const [messages, setMessages] = useState<Message[]>(() =>
    toLocalMessages(project.chat.messages),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [modelId, setModelId] = useState<ChatModelId>(project.chat.modelId);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(
    project.chat.reasoningEffort,
  );
  const assistantContentRef = useRef('');
  const localChatSignatureRef = useRef(
    buildChatSignature(
      toLocalMessages(project.chat.messages),
      project.chat.modelId,
      project.chat.reasoningEffort,
    ),
  );

  const remoteChatSignature = useMemo(
    () =>
      buildChatSignature(
        toLocalMessages(project.chat.messages),
        project.chat.modelId,
        project.chat.reasoningEffort,
      ),
    [project.chat.messages, project.chat.modelId, project.chat.reasoningEffort],
  );

  useEffect(() => {
    localChatSignatureRef.current = buildChatSignature(
      messages,
      modelId,
      reasoningEffort,
    );
  }, [messages, modelId, reasoningEffort]);

  useEffect(() => {
    if (localChatSignatureRef.current === remoteChatSignature) {
      return;
    }

    setMessages(toLocalMessages(project.chat.messages));
    setModelId(project.chat.modelId);
    setReasoningEffort(project.chat.reasoningEffort);
    setIsLoading(false);
    assistantContentRef.current = '';
    localChatSignatureRef.current = remoteChatSignature;
  }, [
    project.chat.messages,
    project.chat.modelId,
    project.chat.reasoningEffort,
    project.id,
    remoteChatSignature,
  ]);

  const persistChat = useCallback(
    async (
      nextMessages: Message[],
      nextModelId: ChatModelId = modelId,
      nextReasoningEffort: ReasoningEffort = reasoningEffort,
    ) => {
      await onPersistChat({
        projectId: project.id,
        chat: {
          modelId: nextModelId,
          reasoningEffort: nextReasoningEffort,
          messages: toStoredMessages(nextMessages),
        },
      });
    },
    [modelId, onPersistChat, project.id, reasoningEffort],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      const timestamp = new Date().toISOString();
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: content.trim(),
        createdAt: timestamp,
      };

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        createdAt: timestamp,
      };

      const optimisticMessages = [...messages, userMessage, assistantMessage];

      setMessages(optimisticMessages);
      setIsLoading(true);
      assistantContentRef.current = '';

      const chatMessages = [...messages, userMessage].map((message) => ({
        role: message.role,
        content: message.content,
      }));

      try {
        if (typeof window !== 'undefined' && window.portal) {
          await window.portal.ai.chat(
            chatMessages,
            {
              modelId,
              reasoningEffort,
              projectRootPath: project.rootPath,
              projectName: project.name,
            },
            (event) => {
              if (event.type === 'text-delta' && event.content) {
                assistantContentRef.current += event.content;
                const updatedContent = assistantContentRef.current;
                setMessages((prev) =>
                  prev.map((message) =>
                    message.id === assistantMessage.id
                      ? { ...message, content: updatedContent }
                      : message,
                  ),
                );
              } else if (event.type === 'error') {
                setMessages((prev) =>
                  prev.map((message) =>
                    message.id === assistantMessage.id
                      ? { ...message, content: `Error: ${event.error}` }
                      : message,
                  ),
                );
              }
            },
          );
        } else {
          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: chatMessages,
              modelId,
              reasoningEffort,
            }),
          });

          if (!res.ok) {
            const rawError = await res.text();
            let errorMessage = `HTTP ${res.status}`;

            if (rawError) {
              try {
                const parsed = JSON.parse(rawError) as { error?: string };
                errorMessage = parsed.error || rawError;
              } catch {
                errorMessage = rawError;
              }
            }

            throw new Error(errorMessage);
          }

          const reader = res.body?.getReader();
          const decoder = new TextDecoder();

          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              assistantContentRef.current += decoder.decode(value, { stream: true });
              const updatedContent = assistantContentRef.current;
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === assistantMessage.id
                    ? { ...message, content: updatedContent }
                    : message,
                ),
              );
            }
          }
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: `Error: ${errorMessage}` }
              : message,
          ),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, messages, modelId, reasoningEffort, project.name, project.rootPath],
  );

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const localSignature = buildChatSignature(messages, modelId, reasoningEffort);
    if (localSignature === remoteChatSignature) {
      return;
    }

    void persistChat(messages, modelId, reasoningEffort);
  }, [
    isLoading,
    messages,
    modelId,
    reasoningEffort,
    remoteChatSignature,
    persistChat,
  ]);

  const stopGeneration = useCallback(() => {
    if (typeof window !== 'undefined' && window.portal) {
      window.portal.ai.abort();
    }
    setIsLoading(false);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setIsLoading(false);
  }, []);

  const updateModelId = useCallback(
    (nextModelId: ChatModelId) => {
      setModelId(nextModelId);
    },
    [],
  );

  const updateReasoningEffort = useCallback(
    (nextReasoningEffort: ReasoningEffort) => {
      setReasoningEffort(nextReasoningEffort);
    },
    [],
  );

  const messageCount = useMemo(() => messages.length, [messages]);

  return {
    messages,
    isLoading,
    messageCount,
    modelId,
    setModelId: updateModelId,
    reasoningEffort,
    setReasoningEffort: updateReasoningEffort,
    sendMessage,
    stopGeneration,
    clearMessages,
  };
}
