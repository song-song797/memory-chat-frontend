import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { Message } from '../types';
import { message } from '../services/message';
import ChatInput from './ChatInput';
import Icon from './Icons';

interface ChatWindowProps {
  conversationId: string | null;
  messages: Message[];
  streamingContent: string;
  isStreaming: boolean;
  streamingStartedAt: number | null;
  errorMessage: string;
  currentModelLabel: string;
  onSend: (message: string) => void;
  onStopStreaming: () => void;
  onOpenModelPicker: () => void;
}

type ThreadActionKey = 'copy' | 'refresh' | 'read' | 'like' | 'dislike' | 'share' | 'more';

interface ThreadActionConfig {
  key: ThreadActionKey;
  icon: string;
  tooltip: string;
  ariaLabel: string;
  activeIcon?: string;
  activeAriaLabel?: string;
}

const featureStacks = [
  {
    title: 'Explore',
    body: 'Learn how to use chat.ai platform for your needs',
    icon: 'globe' as const,
  },
  {
    title: 'Capabilities',
    body: 'How much capable chat.ai to full-fill your needs',
    icon: 'lightning' as const,
  },
  {
    title: 'Limitation',
    body: 'How much capable chat.ai to full-fill your needs',
    icon: 'warning' as const,
  },
];

const featureCards = [
  {
    title: '"Explain"',
    body: 'Quantum computing in simple terms',
  },
  {
    title: '"How to"',
    body: 'Make a search engine platform like google',
  },
  {
    title: '"Remember"',
    body: 'quantum computing in simple terms',
  },
  {
    title: '"Allows"',
    body: 'User to provide follow-up corrections',
  },
  {
    title: '"May"',
    body: 'Occasionally generate incorrect information',
  },
  {
    title: '"Limited"',
    body: 'Knowledge of world and events after 2021',
  },
];

const WELCOME_TITLE = 'Good day! How may I assist you today?';
const AUTO_SCROLL_THRESHOLD = 80;
const THREAD_ACTIONS: ThreadActionConfig[] = [
  {
    key: 'copy',
    icon: 'copy',
    activeIcon: 'check-circle',
    tooltip: 'Copy',
    ariaLabel: 'Copy answer',
    activeAriaLabel: 'Copied',
  },
  {
    key: 'refresh',
    icon: 'refresh',
    tooltip: 'Regenerate',
    ariaLabel: 'Refresh answer',
  },
  {
    key: 'read',
    icon: 'volume-loud',
    tooltip: 'Read aloud',
    ariaLabel: 'Read answer aloud',
  },
  {
    key: 'like',
    icon: 'thumb',
    tooltip: 'Like',
    ariaLabel: 'Like answer',
  },
  {
    key: 'dislike',
    icon: 'thumb-down',
    tooltip: 'Dislike',
    ariaLabel: 'Dislike answer',
  },
  {
    key: 'share',
    icon: 'share',
    tooltip: 'Share',
    ariaLabel: 'Share answer',
  },
  {
    key: 'more',
    icon: 'more-1',
    tooltip: 'More',
    ariaLabel: 'More actions',
  },
];

function normalizeMarkdownContent(content: string) {
  let normalized = content;

  // CommonMark 对 **“中文引号包裹的粗体”** 这类写法兼容较差，
  // 把引号移到 strong 外侧后可以稳定渲染。
  normalized = normalized.replace(/\*\*“([^*]+?)”\*\*/g, '“**$1**”');
  normalized = normalized.replace(/\*\*"([^*]+?)"\*\*/g, '"**$1**"');
  normalized = normalized.replace(/\*\*‘([^*]+?)’\*\*/g, '‘**$1**’');
  normalized = normalized.replace(/\*\*'([^*]+?)'\*\*/g, "'**$1**'");

  return normalized;
}

function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
    >
      {normalizeMarkdownContent(content)}
    </ReactMarkdown>
  );
}

export default function ChatWindow({
  conversationId,
  messages,
  streamingContent,
  isStreaming,
  streamingStartedAt,
  errorMessage,
  currentModelLabel,
  onSend,
  onStopStreaming,
  onOpenModelPicker,
}: ChatWindowProps) {
  const messagesRef = useRef<HTMLDivElement>(null);
  const lastErrorMessageRef = useRef('');
  const previousConversationIdRef = useRef<string | null>(conversationId);
  const pendingConversationScrollRef = useRef(false);
  const shouldAutoScrollRef = useRef(true);
  const lastScrollTopRef = useRef(0);
  const actionFeedbackTimerRef = useRef<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [typedWelcomeTitle, setTypedWelcomeTitle] = useState('');
  const [activeActionFeedback, setActiveActionFeedback] = useState<{
    messageId: string;
    action: ThreadActionKey;
  } | null>(null);

  const showActionFeedback = (messageId: string, action: ThreadActionKey) => {
    setActiveActionFeedback({ messageId, action });

    if (actionFeedbackTimerRef.current) {
      window.clearTimeout(actionFeedbackTimerRef.current);
    }

    actionFeedbackTimerRef.current = window.setTimeout(() => {
      setActiveActionFeedback((current) =>
        current?.messageId === messageId && current.action === action ? null : current
      );
      actionFeedbackTimerRef.current = null;
    }, 1400);
  };

  const handleCopy = async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      showActionFeedback(messageId, 'copy');
      return;
    } catch {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = content;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);

        if (!copied) {
          throw new Error('execCommand copy returned false');
        }

        showActionFeedback(messageId, 'copy');
      } catch {
        message.error({
          content: 'Failed to copy answer',
          placement: 'top',
        });
      }
    }
  };

  useEffect(() => {
    return () => {
      if (actionFeedbackTimerRef.current) {
        window.clearTimeout(actionFeedbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (previousConversationIdRef.current === conversationId) return;

    previousConversationIdRef.current = conversationId;
    pendingConversationScrollRef.current = true;
    setActiveActionFeedback(null);
  }, [conversationId]);

  useLayoutEffect(() => {
    const container = messagesRef.current;
    if (!container) return;

    if (pendingConversationScrollRef.current) {
      container.scrollTop = container.scrollHeight;
      shouldAutoScrollRef.current = true;
      pendingConversationScrollRef.current = false;
      return;
    }

    if (!shouldAutoScrollRef.current) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior: isStreaming ? 'auto' : 'smooth',
    });
  }, [messages, streamingContent, isStreaming]);

  useEffect(() => {
    const container = messagesRef.current;
    if (!container) return;

    const handleScroll = () => {
      const currentScrollTop = container.scrollTop;
      const distanceToBottom =
        container.scrollHeight - currentScrollTop - container.clientHeight;

      if (isStreaming && currentScrollTop < lastScrollTopRef.current) {
        shouldAutoScrollRef.current = false;
      } else if (distanceToBottom <= AUTO_SCROLL_THRESHOLD) {
        shouldAutoScrollRef.current = true;
      }

      lastScrollTopRef.current = currentScrollTop;
    };

    handleScroll();
    container.addEventListener('scroll', handleScroll);

    return () => container.removeEventListener('scroll', handleScroll);
  }, [isStreaming]);

  useEffect(() => {
    if (!isStreaming || !streamingStartedAt) {
      setElapsedSeconds(0);
      return;
    }

    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - streamingStartedAt) / 1000)));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isStreaming, streamingStartedAt]);

  const showEmpty = messages.length === 0 && !isStreaming;

  useEffect(() => {
    if (!showEmpty) {
      setTypedWelcomeTitle(WELCOME_TITLE);
      return;
    }

    setTypedWelcomeTitle('');

    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setTypedWelcomeTitle(WELCOME_TITLE.slice(0, index));

      if (index >= WELCOME_TITLE.length) {
        window.clearInterval(timer);
      }
    }, 48);

    return () => window.clearInterval(timer);
  }, [showEmpty]);

  useEffect(() => {
    if (!errorMessage) {
      lastErrorMessageRef.current = '';
      return;
    }

    if (lastErrorMessageRef.current === errorMessage) {
      return;
    }

    lastErrorMessageRef.current = errorMessage;

    message.error({
      content: errorMessage,
      placement: 'top',
    });
  }, [errorMessage]);

  return (
    <main className="chat-stage">
      <button
        type="button"
        className="chat-model-trigger"
        aria-label={`Current model ${currentModelLabel}`}
        onClick={onOpenModelPicker}
      >
        <span>{currentModelLabel}</span>
        <Icon name="arrow-down" />
      </button>

      {showEmpty ? (
        <section className="welcome-stage">
          <div className="welcome-scroll">
            <h1>
              <span
                className={`welcome-typewriter ${
                  typedWelcomeTitle === WELCOME_TITLE ? 'is-complete' : ''
                }`}
              >
                {typedWelcomeTitle}
              </span>
            </h1>

            <div className="welcome-grid">
              <div className="welcome-stack">
                {featureStacks.map((stack) => (
                  <div key={stack.title} className="welcome-stack-row">
                    <div className="welcome-stack-card">
                      <span className="welcome-stack-icon">
                        <Icon name={stack.icon} />
                      </span>
                      <strong>{stack.title}</strong>
                      <p>{stack.body}</p>
                    </div>
                    <div className="welcome-stack-divider">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                ))}
              </div>

              <div className="welcome-card-grid">
                {featureCards.map((card) => (
                  <div key={card.title} className="welcome-card">
                    <div className="welcome-card-copy">
                      <strong>{card.title}</strong>
                      <p>{card.body}</p>
                    </div>
                    <span className="welcome-card-arrow">
                      <Icon name="arrow-right" />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="chat-composer-dock">
            <ChatInput onSend={onSend} submitDisabled={false} />
          </div>
        </section>
      ) : (
        <div className="thread-shell">
          <div className="thread-scroll" ref={messagesRef}>
            <div className="thread-inner">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`thread-entry ${message.role === 'assistant' ? 'is-assistant' : 'is-user'}`}
                >
                  {message.role === 'user' && (
                    <div className="thread-head is-user">
                      <div className="thread-userline is-user">
                        <span className="thread-prompt thread-prompt--user">{message.content}</span>
                      </div>
                    </div>
                  )}

                  {message.role === 'assistant' && (
                    <div className="thread-answer-card">
                      <div className="thread-label-row">
                        <span className="thread-brand-label">CHAT A.I+</span>
                        <span className="thread-brand-badge" />
                      </div>
                      <div className="thread-answer-body">
                        <MarkdownMessage content={message.content} />
                      </div>
                      <div className="thread-answer-footer">
                        <div className="thread-actions">
                          {THREAD_ACTIONS.map((action) => {
                            const isActive =
                              activeActionFeedback?.messageId === message.id &&
                              activeActionFeedback.action === action.key;
                            const tooltip = isActive ? '' : action.tooltip;
                            const iconName =
                              isActive && action.activeIcon ? action.activeIcon : action.icon;
                            const ariaLabel =
                              isActive && action.activeAriaLabel
                                ? action.activeAriaLabel
                                : action.ariaLabel;

                            const handleClick = () => {
                              if (action.key === 'copy') {
                                return void handleCopy(message.id, message.content);
                              }
                            };

                            return (
                              <button
                                key={action.key}
                                type="button"
                                className={`thread-action-pill ${isActive ? 'is-active' : ''}`}
                                aria-label={ariaLabel}
                                data-tooltip={tooltip}
                                onClick={handleClick}
                              >
                                <Icon name={iconName} />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              ))}

              {isStreaming && (
                <article className="thread-entry is-assistant">
                  <div className="thread-head">
                    <div className="thread-userline">
                      <span className="thread-avatar assistant">AI</span>
                      <span className="thread-prompt">Generating a response...</span>
                    </div>
                  </div>
                  <div className="thread-answer-card">
                    <div className="thread-label-row">
                      <span className="thread-brand-label">CHAT A.I+</span>
                      <span className="thread-brand-badge" />
                    </div>
                    <div className="thread-answer-body">
                      {!streamingContent && (
                        <span className="thread-streaming-hint">
                          Thinking...
                          {elapsedSeconds > 0 ? ` ${elapsedSeconds}s` : ''}
                        </span>
                      )}
                      {streamingContent && <MarkdownMessage content={streamingContent} />}
                    </div>
                  </div>
                </article>
              )}
            </div>
          </div>
          <div className="chat-composer-dock">
            <ChatInput
              onSend={onSend}
              onStop={onStopStreaming}
              submitDisabled={isStreaming}
              isStreaming={isStreaming}
            />
          </div>
        </div>
      )}
    </main>
  );
}
