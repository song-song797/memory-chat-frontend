import type {
  Attachment,
  AuthResponse,
  Conversation,
  LandingAgentMessage,
  Memory,
  Message,
  ModelCatalog,
  Project,
  ReasoningLevel,
  User,
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api';
const API_ROOT = API_BASE.replace(/\/api\/?$/, '');

let authToken: string | null = null;

function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_ROOT}${normalizedPath}`;
}

function getAuthHeaders() {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

async function apiFetch(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers ?? {});
  const authHeaders = getAuthHeaders();

  Object.entries(authHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return fetch(input, {
    ...init,
    headers,
  });
}

function normalizeAttachment(attachment: Attachment): Attachment {
  return {
    ...attachment,
    content_url: resolveApiUrl(attachment.content_url),
  };
}

export async function fetchAttachmentBlobUrl(
  contentUrl: string
): Promise<{ url: string; revokeOnCleanup: boolean }> {
  if (/^(blob:|data:|https?:\/\/)/i.test(contentUrl) && !contentUrl.includes('/api/attachments/')) {
    return {
      url: contentUrl,
      revokeOnCleanup: false,
    };
  }

  const res = await apiFetch(contentUrl);
  if (!res.ok) {
    const errorMessage = await getErrorMessage(res, 'Failed to load attachment');
    throw new Error(errorMessage);
  }

  const blob = await res.blob();
  return {
    url: URL.createObjectURL(blob),
    revokeOnCleanup: true,
  };
}

function normalizeMessage(message: Message): Message {
  return {
    ...message,
    attachments: message.attachments?.map(normalizeAttachment) ?? [],
  };
}

async function getErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.detail === 'string') {
      return data.detail;
    }
  } catch {
    // Ignore invalid JSON error bodies.
  }

  return fallback;
}

export function setAuthToken(token: string | null) {
  authToken = token;
}

export async function register(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const errorMessage = await getErrorMessage(res, 'Failed to register');
    throw new Error(errorMessage);
  }
  return res.json();
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const errorMessage = await getErrorMessage(res, 'Failed to login');
    throw new Error(errorMessage);
  }
  return res.json();
}

export async function fetchCurrentUser(): Promise<User> {
  const res = await apiFetch(`${API_BASE}/auth/me`);
  if (!res.ok) {
    const errorMessage = await getErrorMessage(res, 'Failed to fetch current user');
    throw new Error(errorMessage);
  }
  return res.json();
}

export async function logout(): Promise<void> {
  const res = await apiFetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
  });
  if (!res.ok && res.status !== 401) {
    const errorMessage = await getErrorMessage(res, 'Failed to logout');
    throw new Error(errorMessage);
  }
}

export async function fetchConversations(): Promise<Conversation[]> {
  const res = await apiFetch(`${API_BASE}/conversations`);
  if (!res.ok) {
    const errorMessage = await getErrorMessage(res, 'Failed to fetch conversations');
    throw new Error(errorMessage);
  }
  return res.json();
}

export async function fetchModels(): Promise<ModelCatalog> {
  const res = await apiFetch(`${API_BASE}/models`);
  if (!res.ok) {
    const errorMessage = await getErrorMessage(res, 'Failed to fetch models');
    throw new Error(errorMessage);
  }
  return res.json();
}

export async function fetchProjects(includeArchived = false): Promise<Project[]> {
  const query = includeArchived ? '?include_archived=true' : '';
  const res = await apiFetch(`${API_BASE}/projects${query}`);
  if (!res.ok) {
    const errorMessage = await getErrorMessage(res, 'Failed to fetch projects');
    throw new Error(errorMessage);
  }
  return res.json();
}

export async function createProject(input: {
  name: string;
  description?: string | null;
  default_model?: string | null;
  default_reasoning_level?: ReasoningLevel | null;
}): Promise<Project> {
  const res = await apiFetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const errorMessage = await getErrorMessage(res, 'Failed to create project');
    throw new Error(errorMessage);
  }
  return res.json();
}

export async function updateProject(
  projectId: string,
  updates: {
    name?: string;
    description?: string | null;
    default_model?: string | null;
    default_reasoning_level?: ReasoningLevel | null;
    archived?: boolean;
  }
): Promise<Project> {
  const res = await apiFetch(`${API_BASE}/projects/${projectId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const errorMessage = await getErrorMessage(res, 'Failed to update project');
    throw new Error(errorMessage);
  }
  return res.json();
}

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const res = await apiFetch(`${API_BASE}/conversations/${conversationId}/messages`);
  if (!res.ok) {
    const errorMessage = await getErrorMessage(res, 'Failed to fetch messages');
    throw new Error(errorMessage);
  }

  const data: Message[] = await res.json();
  return data.map(normalizeMessage);
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/conversations/${conversationId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const errorMessage = await getErrorMessage(res, 'Failed to delete conversation');
    throw new Error(errorMessage);
  }
}

export async function clearAllConversations(): Promise<void> {
  const res = await apiFetch(`${API_BASE}/conversations`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const errorMessage = await getErrorMessage(res, 'Failed to clear conversations');
    throw new Error(errorMessage);
  }
}

export async function updateConversationTitle(
  conversationId: string,
  title: string
): Promise<Conversation> {
  return updateConversation(conversationId, { title });
}

export async function updateConversation(
  conversationId: string,
  updates: { title?: string; pinned?: boolean }
): Promise<Conversation> {
  const res = await apiFetch(`${API_BASE}/conversations/${conversationId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const errorMessage = await getErrorMessage(res, 'Failed to update conversation');
    throw new Error(errorMessage);
  }
  return res.json();
}

export async function fetchMemories(options: {
  scope?: 'global' | 'project';
  projectId?: string | null;
  includeArchived?: boolean;
} = {}): Promise<Memory[]> {
  const params = new URLSearchParams();
  if (options.scope) params.set('scope', options.scope);
  if (options.projectId) params.set('project_id', options.projectId);
  if (options.includeArchived) params.set('include_archived', 'true');
  const query = params.toString() ? `?${params.toString()}` : '';

  const res = await apiFetch(`${API_BASE}/memories${query}`);
  if (!res.ok) {
    const errorMessage = await getErrorMessage(res, 'Failed to fetch memories');
    throw new Error(errorMessage);
  }
  return res.json();
}

export async function createMemory(
  input:
    | string
    | {
        content: string;
        kind?: string;
        scope?: 'global' | 'project';
        projectId?: string | null;
      },
  kind = 'fact'
): Promise<Memory> {
  const payload =
    typeof input === 'string'
      ? {
          content: input,
          kind,
          scope: 'global',
          project_id: null,
        }
      : {
          content: input.content,
          kind: input.kind ?? 'fact',
          scope: input.scope ?? 'global',
          project_id: input.projectId ?? null,
        };

  const res = await apiFetch(`${API_BASE}/memories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorMessage = await getErrorMessage(res, 'Failed to create memory');
    throw new Error(errorMessage);
  }
  return res.json();
}

export async function updateMemory(
  memoryId: string,
  updates: { content?: string; kind?: string; enabled?: boolean; status?: 'active' | 'archived' }
): Promise<Memory> {
  const res = await apiFetch(`${API_BASE}/memories/${memoryId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const errorMessage = await getErrorMessage(res, 'Failed to update memory');
    throw new Error(errorMessage);
  }
  return res.json();
}

export async function deleteMemory(memoryId: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/memories/${memoryId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const errorMessage = await getErrorMessage(res, 'Failed to delete memory');
    throw new Error(errorMessage);
  }
}

export async function sendMessage(
  message: string,
  attachments: File[],
  conversationId: string | null,
  projectId: string | null,
  model: string | null,
  reasoningLevel: ReasoningLevel,
  onChunk: (content: string) => void,
  onConversationId: (id: string) => void,
  onError: (error: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const formData = new FormData();
  formData.append('message', message);

  if (conversationId) {
    formData.append('conversation_id', conversationId);
  }

  if (projectId) {
    formData.append('project_id', projectId);
  }

  if (model) {
    formData.append('model', model);
  }

  formData.append('reasoning_level', reasoningLevel);

  for (const attachment of attachments) {
    formData.append('files', attachment);
  }

  const res = await apiFetch(`${API_BASE}/chat`, {
    method: 'POST',
    body: formData,
    signal,
  });

  if (!res.ok) {
    const errorMessage = await getErrorMessage(res, 'Failed to send message');
    onError(errorMessage);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    onError('No response stream');
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();

      if (data === '[DONE]') return;

      try {
        const parsed = JSON.parse(data);
        if (parsed.conversation_id) {
          onConversationId(parsed.conversation_id);
        }
        if (parsed.content) {
          onChunk(parsed.content);
        }
        if (parsed.error) {
          onError(parsed.error);
        }
      } catch {
        // skip malformed JSON
      }
    }
  }
}

export async function sendLandingAgentMessage(
  message: string,
  history: LandingAgentMessage[],
  onChunk: (content: string) => void,
  onError: (error: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${API_BASE}/landing-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
    signal,
  });

  if (!res.ok) {
    const errorMessage = await getErrorMessage(res, 'Failed to contact guide agent');
    onError(errorMessage);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    onError('No response stream');
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) {
        continue;
      }

      const data = line.slice(6).trim();
      if (data === '[DONE]') {
        return;
      }

      try {
        const parsed = JSON.parse(data);
        if (parsed.content) {
          onChunk(parsed.content);
        }
        if (parsed.error) {
          onError(parsed.error);
        }
      } catch {
        // Skip malformed JSON chunks.
      }
    }
  }
}
