import { useEffect, useRef, useState } from 'react';
import Icon from './Icons';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled: boolean;
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
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

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
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
            disabled={disabled}
          />
        </div>
        <div className="composer-toolbar">
          <button type="button" className="composer-orb composer-orb-left" aria-label="Mood">
            <Icon name="paperclip" />
          </button>
          <span className="composer-toolbar-spacer" />
          <button
            type="button"
            className="composer-send-button"
            onClick={handleSend}
            disabled={disabled || !text.trim()}
            aria-label="Send message"
          >
            <Icon name="send" />
          </button>
        </div>
      </div>
    </div>
  );
}
