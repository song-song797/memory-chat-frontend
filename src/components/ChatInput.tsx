import { useEffect, useRef, useState } from 'react';
import Icon from './Icons';

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  submitDisabled: boolean;
  isStreaming?: boolean;
}

export default function ChatInput({
  onSend,
  onStop,
  submitDisabled,
  isStreaming = false,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const maxTextareaHeight = 220;

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;

    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, maxTextareaHeight)}px`;
    element.style.overflowY =
      element.scrollHeight > maxTextareaHeight ? 'auto' : 'hidden';
    element.scrollTop = element.scrollHeight;
  }, [maxTextareaHeight, text]);

  useEffect(() => {
    const timer = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(timer);
  }, []);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || submitDisabled) return;
    onSend(trimmed);
    setText('');
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="composer-wrap">
      <div className="composer-surface">
        <div className="composer-input-row">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What's in your mind?..."
            rows={1}
          />
        </div>
        <div className="composer-toolbar">
          <button type="button" className="composer-orb composer-orb-left" aria-label="Mood">
            <Icon name="paperclip" />
          </button>
          <span className="composer-toolbar-spacer" />
          <button
            type="button"
            className={`composer-send-button ${isStreaming ? 'is-stop' : ''}`}
            onClick={isStreaming ? onStop : handleSend}
            disabled={isStreaming ? !onStop : submitDisabled || !text.trim()}
            aria-label={isStreaming ? 'Stop generating' : 'Send message'}
          >
            <Icon name={isStreaming ? 'close' : 'send'} />
          </button>
        </div>
      </div>
    </div>
  );
}
