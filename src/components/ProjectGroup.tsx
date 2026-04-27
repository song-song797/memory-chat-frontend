import { useState, type ReactNode } from 'react';
import type { Conversation, Project } from '../types';
import Icon from './Icons';
import ProjectFormDialog from './ProjectFormDialog';

function formatConversationTitle(title: string): string {
  return title.length > 28 ? `${title.slice(0, 28)}...` : title;
}

export interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  editingConversationId: string | null;
  editingTitle: string;
  onSelect: (id: string) => void;
  onEditingTitleChange: (value: string) => void;
  onEditingSubmit: () => void;
  onEditingCancel: () => void;
  renderActions: (conversation: Conversation) => ReactNode;
}

export function ConversationList({
  conversations,
  activeId,
  editingConversationId,
  editingTitle,
  onSelect,
  onEditingTitleChange,
  onEditingSubmit,
  onEditingCancel,
  renderActions,
}: ConversationListProps) {
  if (conversations.length === 0) {
    return null;
  }

  return (
    <div className="shell-conversation-list">
      {conversations.map((conversation) => {
        const isActive = conversation.id === activeId;
        const isEditing = conversation.id === editingConversationId;

        return (
          <div
            key={conversation.id}
            className={`shell-conversation-item ${isActive ? 'is-active' : ''}`}
            onClick={() => onSelect(conversation.id)}
          >
            {isEditing ? (
              <div className="shell-conversation-select">
                <input
                  type="text"
                  className="shell-conversation-rename-input"
                  value={editingTitle}
                  autoFocus
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => onEditingTitleChange(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  onBlur={onEditingSubmit}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      onEditingSubmit();
                    }

                    if (event.key === 'Escape') {
                      event.preventDefault();
                      onEditingCancel();
                    }
                  }}
                />
              </div>
            ) : (
              <button
                type="button"
                className="shell-conversation-select"
                onClick={() => onSelect(conversation.id)}
              >
                <span className="shell-conversation-title">
                  {formatConversationTitle(conversation.title)}
                </span>
              </button>
            )}

            <span
              className="shell-conversation-actions"
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
            >
              {renderActions(conversation)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface ProjectGroupProps extends Omit<ConversationListProps, 'conversations'> {
  project: Project;
  conversations: Conversation[];
  activeProjectId: string | null;
  onNewChat: () => void;
  onRenameProject: (projectId: string, name: string) => void;
  onArchiveProject: (projectId: string) => void;
}

export default function ProjectGroup({
  project,
  conversations,
  activeProjectId,
  onNewChat,
  onRenameProject,
  onArchiveProject,
  ...conversationListProps
}: ProjectGroupProps) {
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const isActive = activeProjectId === project.id;

  return (
    <div className={`shell-project-group ${isActive ? 'is-active' : ''}`}>
      <div className="shell-project-header">
        <button
          type="button"
          className="shell-project-title"
          onClick={onNewChat}
          aria-label={`Start new chat in ${project.name}`}
        >
          <span>{project.name}</span>
        </button>
        <div className="shell-project-actions">
          <button
            type="button"
            className="shell-project-action"
            aria-label={`New chat in ${project.name}`}
            onClick={onNewChat}
          >
            <span aria-hidden="true">+</span>
          </button>
          <button
            type="button"
            className="shell-project-action"
            aria-label={`Rename ${project.name}`}
            onClick={() => setIsRenameDialogOpen(true)}
          >
            <Icon name="pen" />
          </button>
          <button
            type="button"
            className="shell-project-action"
            aria-label={`Archive ${project.name}`}
            onClick={() => onArchiveProject(project.id)}
          >
            <Icon name="delete" />
          </button>
        </div>
      </div>

      <ConversationList conversations={conversations} {...conversationListProps} />

      {conversations.length === 0 ? (
        <div className="shell-project-empty">No chats in this project yet.</div>
      ) : null}

      {isRenameDialogOpen ? (
        <ProjectFormDialog
          title="Rename project"
          initialName={project.name}
          onSubmit={(name) => {
            setIsRenameDialogOpen(false);
            onRenameProject(project.id, name);
          }}
          onClose={() => setIsRenameDialogOpen(false)}
        />
      ) : null}
    </div>
  );
}
