import { useEffect, useRef, useState } from 'react';
import type { ComposerAttachment } from '../types';
import Icon from './Icons';

interface ChatInputSubmitPayload {
  message: string;
  attachments: ComposerAttachment[];
}

interface ChatInputProps {
  onSend: (payload: ChatInputSubmitPayload) => void;
  onStop?: () => void;
  submitDisabled: boolean;
  isStreaming?: boolean;
  placeholder?: string;
}

function createComposerAttachment(file: File): ComposerAttachment {
  const kind = file.type.startsWith('image/') ? 'image' : 'file';
  const previewUrl = kind === 'image' ? URL.createObjectURL(file) : undefined;

  return {
    id: crypto.randomUUID(),
    file,
    name: file.name,
    mime_type: file.type || 'application/octet-stream',
    kind,
    size_bytes: file.size,
    preview_url: previewUrl,
  };
}

export default function ChatInput({
  onSend,
  onStop,
  submitDisabled,
  isStreaming = false,
  placeholder = "What's in your mind?...",
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef<ComposerAttachment[]>([]);
  const maxTextareaHeight = 220;
  const attachmentCount = attachments.length;
  const imageCount = attachments.filter((attachment) => attachment.kind === 'image').length;
  const fileCount = attachmentCount - imageCount;
  const attachmentSummary =
    attachmentCount === 0
      ? ''
      : [
          imageCount > 0 ? `${imageCount} 张图片` : null,
          fileCount > 0 ? `${fileCount} 个文件` : null,
        ]
          .filter(Boolean)
          .join(' · ');

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

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach((attachment) => {
        if (attachment.preview_url) {
          URL.revokeObjectURL(attachment.preview_url);
        }
      });
    };
  }, []);

  const removeAttachment = (attachmentId: string) => {
    setAttachments((current) => {
      const target = current.find((attachment) => attachment.id === attachmentId);
      if (target?.preview_url) {
        URL.revokeObjectURL(target.preview_url);
      }

      return current.filter((attachment) => attachment.id !== attachmentId);
    });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (selectedFiles.length === 0) {
      return;
    }

    setAttachments((current) => [
      ...current,
      ...selectedFiles.map((file) => createComposerAttachment(file)),
    ]);
    event.target.value = '';
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || submitDisabled) return;

    onSend({
      message: trimmed,
      attachments,
    });
    setText('');
    setAttachments([]);
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
        {attachments.length > 0 ? (
          <div className="composer-attachments">
            <div className="composer-attachments-head">
              <div className="composer-attachments-status">
                <span className="composer-attachments-badge">{attachmentCount}</span>
                <strong>已选择附件</strong>
                <span>{attachmentSummary}</span>
              </div>
              <span className="composer-attachments-hint">发送时会一并上传</span>
            </div>
            {attachments.map((attachment) => (
              <div key={attachment.id} className="composer-attachment-chip">
                {attachment.kind === 'image' && attachment.preview_url ? (
                  <img
                    className="composer-attachment-thumb"
                    src={attachment.preview_url}
                    alt={attachment.name}
                  />
                ) : (
                  <span className="composer-attachment-icon">
                    <Icon name="link" />
                  </span>
                )}
                <div className="composer-attachment-meta">
                  <strong>{attachment.name}</strong>
                  <span>{Math.max(1, Math.round(attachment.size_bytes / 1024))} KB</span>
                </div>
                <button
                  type="button"
                  className="composer-attachment-remove"
                  aria-label={`Remove ${attachment.name}`}
                  onClick={() => removeAttachment(attachment.id)}
                >
                  <Icon name="close" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="composer-input-row">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
          />
        </div>
        <div className="composer-toolbar">
          <input
            ref={fileInputRef}
            className="composer-file-input"
            type="file"
            multiple
            onChange={handleFileChange}
          />
          <button
            type="button"
            className={`composer-orb composer-orb-left ${
              attachmentCount > 0 ? 'is-active' : ''
            }`}
            aria-label="Attach files"
            data-tooltip={
              attachmentCount > 0 ? `已选择 ${attachmentCount} 个附件` : '上传图片或文件'
            }
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming}
          >
            <Icon name="paperclip" />
            {attachmentCount > 0 ? (
              <span className="composer-orb-badge" aria-hidden="true">
                {attachmentCount}
              </span>
            ) : null}
          </button>
          <span className="composer-toolbar-spacer" />
          <button
            type="button"
            className={`composer-send-button ${isStreaming ? 'is-stop' : ''}`}
            onClick={isStreaming ? onStop : handleSend}
            disabled={
              isStreaming ? !onStop : submitDisabled || (!text.trim() && attachments.length === 0)
            }
            aria-label={isStreaming ? 'Stop generating' : 'Send message'}
          >
            <Icon name={isStreaming ? 'close' : 'send'} />
          </button>
        </div>
      </div>
    </div>
  );
}
