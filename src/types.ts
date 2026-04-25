export interface Attachment {
  id: string;
  name: string;
  mime_type: string;
  kind: 'image' | 'file';
  size_bytes: number;
  content_url: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  attachments?: Attachment[];
}

export interface Conversation {
  id: string;
  title: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConversationDetail extends Conversation {
  messages: Message[];
}

export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface LandingAgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type ReasoningMode = 'none' | 'toggle' | 'budget' | 'always_budget';
export type ReasoningLevel = 'off' | 'standard' | 'deep';

export interface ModelOption {
  id: string;
  label: string;
  latency_hint?: string | null;
  reasoning_mode: ReasoningMode;
  experimental_reasoning: boolean;
}

export interface ModelCatalog {
  default_model: string;
  models: ModelOption[];
}

export interface ComposerAttachment {
  id: string;
  file: File;
  name: string;
  mime_type: string;
  kind: 'image' | 'file';
  size_bytes: number;
  preview_url?: string;
}
