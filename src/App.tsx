import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import ChatWindow from './components/ChatWindow';
import Icon from './components/Icons';
import SettingsDrawer from './components/SettingsDrawer';
import Sidebar from './components/Sidebar';
import SignUpScreen from './components/SignUpScreen';
import { message as toast } from './services/message';
import * as api from './services/api';
import type {
  ComposerAttachment,
  Conversation,
  Memory,
  Message,
  ModelOption,
  Project,
  ReasoningLevel,
  User,
} from './types';

const MODEL_STORAGE_KEY = 'memory-chat:selected-model';
const REASONING_STORAGE_KEY = 'memory-chat:reasoning-level';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'memory-chat:sidebar-collapsed';
const VIEW_STORAGE_KEY = 'memory-chat:active-view';
const AUTH_TOKEN_STORAGE_KEY = 'memory-chat:auth-token';

type AppView = 'signup' | 'chat';
type ChatTheme = 'rose' | 'butter' | 'mist' | 'mint' | 'neutral';

function getDefaultReasoningLevel(option?: ModelOption | null): ReasoningLevel {
  switch (option?.reasoning_mode) {
    case 'toggle':
    case 'budget':
      return 'off';
    case 'always_budget':
      return 'standard';
    default:
      return 'off';
  }
}

function normalizeReasoningLevel(
  level: string | null | undefined,
  option?: ModelOption | null
): ReasoningLevel {
  const requested =
    level === 'standard' || level === 'deep' || level === 'off' ? level : null;

  switch (option?.reasoning_mode) {
    case 'toggle':
      return requested === 'off' ? 'off' : 'standard';
    case 'budget':
      return requested ?? getDefaultReasoningLevel(option);
    case 'always_budget':
      return requested === 'deep' ? 'deep' : 'standard';
    default:
      return 'off';
  }
}

function getConversationTheme(_conversationId: string | null): ChatTheme {
  return 'neutral';
}

function toTempMessageAttachments(attachments: ComposerAttachment[]) {
  return attachments.map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    mime_type: attachment.mime_type,
    kind: attachment.kind,
    size_bytes: attachment.size_bytes,
    content_url: attachment.preview_url ?? URL.createObjectURL(attachment.file),
  }));
}

function revokeAttachmentUrls(attachments: Message['attachments'] | undefined) {
  const urls = new Set(
    (attachments ?? [])
      .map((attachment) => attachment.content_url)
      .filter((url) => url.startsWith('blob:'))
  );

  urls.forEach((url) => {
    URL.revokeObjectURL(url);
  });
}

export default function App() {
  const [appView, setAppView] = useState<AppView>(() => {
    const storedView = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return storedView === 'chat' ? 'chat' : 'signup';
  });
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthBootstrapping, setIsAuthBootstrapping] = useState(true);
  const [authErrorMessage, setAuthErrorMessage] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [draftProjectId, setDraftProjectId] = useState<string | null>(null);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [reasoningLevel, setReasoningLevel] = useState<ReasoningLevel>('off');
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingStartedAt, setStreamingStartedAt] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [globalMemories, setGlobalMemories] = useState<Memory[]>([]);
  const [projectMemories, setProjectMemories] = useState<Memory[]>([]);
  const [globalMemoryDraft, setGlobalMemoryDraft] = useState('');
  const [projectMemoryDrafts, setProjectMemoryDrafts] = useState<Record<string, string>>({});
  const [isMemoriesLoading, setIsMemoriesLoading] = useState(false);
  const [isMemoryMutating, setIsMemoryMutating] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isClearingConversations, setIsClearingConversations] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
  });
  const activeUserId = currentUser?.id ?? null;
  const streamAbortControllerRef = useRef<AbortController | null>(null);
  const stopRequestedRef = useRef(false);
  const memoryRequestSeqRef = useRef(0);
  const memoryMutationSeqRef = useRef(0);
  const currentUserIdRef = useRef<string | null>(null);
  const isSettingsOpenRef = useRef(false);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConvId) ?? null,
    [activeConvId, conversations]
  );
  const activeProjectId = activeConversation?.project_id ?? draftProjectId;
  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects]
  );
  const projectMemoryDraft = activeProjectId ? projectMemoryDrafts[activeProjectId] ?? '' : '';

  const resetChatState = useCallback(() => {
    memoryRequestSeqRef.current += 1;
    memoryMutationSeqRef.current += 1;
    setConversations([]);
    setProjects([]);
    setDraftProjectId(null);
    setActiveConvId(null);
    setMessages([]);
    setStreamingContent('');
    setIsStreaming(false);
    setStreamingStartedAt(null);
    setErrorMessage('');
    setIsSettingsOpen(false);
    setGlobalMemories([]);
    setProjectMemories([]);
    setGlobalMemoryDraft('');
    setProjectMemoryDrafts({});
    setIsMemoriesLoading(false);
    setIsMemoryMutating(false);
    setIsMobileSidebarOpen(false);
  }, []);

  useEffect(() => {
    currentUserIdRef.current = activeUserId;
  }, [activeUserId]);

  useEffect(() => {
    isSettingsOpenRef.current = isSettingsOpen;
  }, [isSettingsOpen]);

  useEffect(() => {
    const bootstrapAuth = async () => {
      const storedToken = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
      if (!storedToken) {
        api.setAuthToken(null);
        setAppView('signup');
        setIsAuthBootstrapping(false);
        return;
      }

      api.setAuthToken(storedToken);

      try {
        const user = await api.fetchCurrentUser();
        setCurrentUser(user);
        setAppView('chat');
      } catch (err) {
        console.error(err);
        api.setAuthToken(null);
        window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
        setCurrentUser(null);
        setAppView('signup');
      } finally {
        setIsAuthBootstrapping(false);
      }
    };

    void bootstrapAuth();
  }, []);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    Promise.all([api.fetchConversations(), api.fetchProjects()])
      .then(([conversationData, projectData]) => {
        setConversations(conversationData);
        setProjects(projectData);
        setErrorMessage('');
      })
      .catch((err: Error) => {
        console.error(err);
        setErrorMessage(err.message);
      });
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    api
      .fetchModels()
      .then((catalog) => {
        setModelOptions(catalog.models);

        const storedModel = window.localStorage.getItem(MODEL_STORAGE_KEY);
        const initialModel =
          storedModel && catalog.models.some((item) => item.id === storedModel)
            ? storedModel
            : catalog.default_model;
        const initialOption =
          catalog.models.find((item) => item.id === initialModel) ?? catalog.models[0] ?? null;
        const storedReasoningLevel = window.localStorage.getItem(REASONING_STORAGE_KEY);

        setSelectedModel(initialModel);
        setReasoningLevel(normalizeReasoningLevel(storedReasoningLevel, initialOption));
      })
      .catch((err: Error) => {
        console.error(err);
        setErrorMessage(err.message);
      });
  }, [currentUser]);

  useEffect(() => {
    window.localStorage.setItem(VIEW_STORAGE_KEY, appView);
  }, [appView]);

  useEffect(() => {
    if (!selectedModel) return;
    window.localStorage.setItem(MODEL_STORAGE_KEY, selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    window.localStorage.setItem(REASONING_STORAGE_KEY, reasoningLevel);
  }, [reasoningLevel]);

  useEffect(() => {
    window.localStorage.setItem(
      SIDEBAR_COLLAPSED_STORAGE_KEY,
      isSidebarCollapsed ? 'true' : 'false'
    );
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (!selectedModel || modelOptions.length === 0) return;

    const selectedOption =
      modelOptions.find((item) => item.id === selectedModel) ?? modelOptions[0] ?? null;
    setReasoningLevel((prev) => normalizeReasoningLevel(prev, selectedOption));
  }, [selectedModel, modelOptions]);

  useEffect(() => {
    if (!currentUser || !activeConvId) {
      setMessages([]);
      return;
    }

    api
      .fetchMessages(activeConvId)
      .then((data) => {
        setMessages(data);
        setErrorMessage('');
      })
      .catch((err: Error) => {
        console.error(err);
        setErrorMessage(err.message);
      });
  }, [activeConvId, currentUser]);

  const refreshConversations = useCallback(async () => {
    const convs = await api.fetchConversations();
    setConversations(convs);
    setErrorMessage('');
  }, []);

  useEffect(() => {
    if (!activeUserId || !isSettingsOpen) {
      return;
    }

    const requestSeq = memoryRequestSeqRef.current + 1;
    const userId = activeUserId;
    let isActive = true;
    memoryRequestSeqRef.current = requestSeq;

    const isStale = () =>
      !isActive ||
      memoryRequestSeqRef.current !== requestSeq ||
      currentUserIdRef.current !== userId ||
      !isSettingsOpenRef.current;

    void (async () => {
      await Promise.resolve();
      if (isStale()) return;

      setIsMemoriesLoading(true);
      try {
        const [nextGlobalMemories, nextProjectMemories] = await Promise.all([
          api.fetchMemories({ scope: 'global' }),
          activeProjectId
            ? api.fetchMemories({ scope: 'project', projectId: activeProjectId })
            : Promise.resolve([]),
        ]);
        if (isStale()) return;

        setGlobalMemories(nextGlobalMemories);
        setProjectMemories(nextProjectMemories);
        setErrorMessage('');
      } catch (err) {
        if (isStale()) return;

        console.error(err);
        const nextError = err instanceof Error ? err.message : 'Failed to fetch memories';
        setErrorMessage(nextError);
        toast.error({
          content: nextError,
          placement: 'top',
        });
      } finally {
        if (!isStale()) {
          setIsMemoriesLoading(false);
        }
      }
    })();

    return () => {
      isActive = false;
      memoryRequestSeqRef.current += 1;
    };
  }, [activeProjectId, activeUserId, isSettingsOpen]);

  const handleAuthSubmit = useCallback(
    async (mode: 'signup' | 'login', email: string, password: string) => {
      setIsAuthenticating(true);
      setAuthErrorMessage('');

      try {
        const response =
          mode === 'signup'
            ? await api.register(email, password)
            : await api.login(email, password);

        api.setAuthToken(response.token);
        window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, response.token);
        setCurrentUser(response.user);
        setAppView('chat');
        setErrorMessage('');
        setAuthErrorMessage('');
        toast.success({
          content: mode === 'signup' ? 'Account created successfully' : 'Welcome back',
          placement: 'top',
        });
      } catch (err) {
        console.error(err);
        setAuthErrorMessage(err instanceof Error ? err.message : 'Authentication failed');
        throw err;
      } finally {
        setIsAuthenticating(false);
      }
    },
    []
  );

  const handleLogout = useCallback(async () => {
    try {
      await api.logout();
    } catch (err) {
      console.error(err);
    } finally {
      streamAbortControllerRef.current?.abort();
      api.setAuthToken(null);
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
      setCurrentUser(null);
      setAuthErrorMessage('');
      resetChatState();
      setAppView('signup');
      toast.success({
        content: 'Signed out',
        placement: 'top',
      });
    }
  }, [resetChatState]);

  const handleNewChat = useCallback(() => {
    setAppView('chat');
    setActiveConvId(null);
    setDraftProjectId(null);
    setMessages([]);
    setStreamingContent('');
    setErrorMessage('');
    setIsMobileSidebarOpen(false);
  }, []);

  const handleNewProjectChat = useCallback((projectId: string) => {
    setAppView('chat');
    setActiveConvId(null);
    setDraftProjectId(projectId);
    setMessages([]);
    setStreamingContent('');
    setErrorMessage('');
    setIsMobileSidebarOpen(false);
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    setAppView('chat');
    setActiveConvId(id);
    setDraftProjectId(null);
    setStreamingContent('');
    setErrorMessage('');
    setIsMobileSidebarOpen(false);
  }, []);

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      try {
        await api.deleteConversation(id);
        if (activeConvId === id) {
          setActiveConvId(null);
          setMessages([]);
        }
        setIsMobileSidebarOpen(false);
        await refreshConversations();
      } catch (err) {
        console.error(err);
        setErrorMessage(err instanceof Error ? err.message : 'Failed to delete conversation');
      }
    },
    [activeConvId, refreshConversations]
  );

  const handleRenameConversation = useCallback(
    async (id: string, nextTitle: string) => {
      if (!nextTitle) {
        toast.warning({
          content: '会话名称不能为空',
          placement: 'top',
        });
        return;
      }

      try {
        await api.updateConversation(id, { title: nextTitle });
        await refreshConversations();
        toast.success({
          content: '会话已重命名',
          placement: 'top',
        });
      } catch (err) {
        console.error(err);
        const nextError =
          err instanceof Error ? err.message : 'Failed to rename conversation';
        setErrorMessage(nextError);
        toast.error({
          content: nextError,
          placement: 'top',
        });
      }
    },
    [refreshConversations]
  );

  const handleTogglePinConversation = useCallback(
    async (id: string, pinned: boolean) => {
      try {
        await api.updateConversation(id, { pinned: !pinned });
        await refreshConversations();
        toast.success({
          content: pinned ? '已取消置顶' : '已置顶会话',
          placement: 'top',
        });
      } catch (err) {
        console.error(err);
        const nextError =
          err instanceof Error ? err.message : 'Failed to update conversation';
        setErrorMessage(nextError);
        toast.error({
          content: nextError,
          placement: 'top',
        });
      }
    },
    [refreshConversations]
  );

  const handleClearAllConversations = useCallback(async () => {
    if (isClearingConversations) return;

    setIsClearingConversations(true);
    try {
      await api.clearAllConversations();
      setConversations([]);
      setActiveConvId(null);
      setDraftProjectId(null);
      setMessages([]);
      setStreamingContent('');
      setErrorMessage('');
      setIsMobileSidebarOpen(false);
      toast.success({
        content: 'All conversations cleared',
        placement: 'top',
      });
    } catch (err) {
      console.error(err);
      const nextError =
        err instanceof Error ? err.message : 'Failed to clear conversations';
      setErrorMessage(nextError);
      toast.error({
        content: nextError,
        placement: 'top',
      });
    } finally {
      setIsClearingConversations(false);
    }
  }, [isClearingConversations]);

  const handleCreateGlobalMemory = useCallback(async () => {
    const content = globalMemoryDraft.trim();
    const userId = activeUserId;
    if (!content || !userId || isMemoryMutating) return;

    const mutationSeq = memoryMutationSeqRef.current + 1;
    memoryMutationSeqRef.current = mutationSeq;
    const isStale = () =>
      memoryMutationSeqRef.current !== mutationSeq || currentUserIdRef.current !== userId;

    setIsMemoryMutating(true);
    try {
      const memory = await api.createMemory({ content, scope: 'global' });
      if (isStale()) return;

      setGlobalMemories((prev) => [memory, ...prev]);
      setGlobalMemoryDraft('');
      setErrorMessage('');
      toast.success({
        content: '记忆已添加',
        placement: 'top',
      });
    } catch (err) {
      if (isStale()) return;

      console.error(err);
      const nextError = err instanceof Error ? err.message : 'Failed to create memory';
      setErrorMessage(nextError);
      toast.error({
        content: nextError,
        placement: 'top',
      });
    } finally {
      if (!isStale()) {
        setIsMemoryMutating(false);
      }
    }
  }, [activeUserId, globalMemoryDraft, isMemoryMutating]);

  const handleCreateProjectMemory = useCallback(async () => {
    const content = projectMemoryDraft.trim();
    const userId = activeUserId;
    const projectId = activeProjectId;
    if (!content || !userId || !projectId || isMemoryMutating) return;

    const mutationSeq = memoryMutationSeqRef.current + 1;
    memoryMutationSeqRef.current = mutationSeq;
    const isStale = () =>
      memoryMutationSeqRef.current !== mutationSeq ||
      currentUserIdRef.current !== userId ||
      activeProjectId !== projectId;

    setIsMemoryMutating(true);
    try {
      const memory = await api.createMemory({
        content,
        scope: 'project',
        projectId,
      });
      if (isStale()) return;

      setProjectMemories((prev) => [memory, ...prev]);
      setProjectMemoryDrafts((prev) => {
        const next = { ...prev };
        delete next[projectId];
        return next;
      });
      setErrorMessage('');
      toast.success({
        content: '记忆已添加',
        placement: 'top',
      });
    } catch (err) {
      if (isStale()) return;

      console.error(err);
      const nextError = err instanceof Error ? err.message : 'Failed to create memory';
      setErrorMessage(nextError);
      toast.error({
        content: nextError,
        placement: 'top',
      });
    } finally {
      if (!isStale()) {
        setIsMemoryMutating(false);
      }
    }
  }, [activeProjectId, activeUserId, isMemoryMutating, projectMemoryDraft]);

  const handleProjectMemoryDraftChange = useCallback((value: string) => {
    const projectId = activeProjectId;
    if (!projectId) return;

    setProjectMemoryDrafts((prev) => ({
      ...prev,
      [projectId]: value,
    }));
  }, [activeProjectId]);

  const handleToggleMemory = useCallback(async (memory: Memory) => {
    const userId = activeUserId;
    if (!userId || isMemoryMutating) return;
    const isProjectMemory = memory.scope === 'project' || Boolean(memory.project_id);

    const mutationSeq = memoryMutationSeqRef.current + 1;
    memoryMutationSeqRef.current = mutationSeq;
    const isStale = () =>
      memoryMutationSeqRef.current !== mutationSeq || currentUserIdRef.current !== userId;

    setIsMemoryMutating(true);
    try {
      const updatedMemory = await api.updateMemory(memory.id, {
        enabled: !memory.enabled,
      });
      if (isStale()) return;

      if (isProjectMemory) {
        setProjectMemories((prev) =>
          prev.map((item) => (item.id === updatedMemory.id ? updatedMemory : item))
        );
      } else {
        setGlobalMemories((prev) =>
          prev.map((item) => (item.id === updatedMemory.id ? updatedMemory : item))
        );
      }
      setErrorMessage('');
      toast.success({
        content: updatedMemory.enabled ? '记忆已启用' : '记忆已停用',
        placement: 'top',
      });
    } catch (err) {
      if (isStale()) return;

      console.error(err);
      const nextError = err instanceof Error ? err.message : 'Failed to update memory';
      setErrorMessage(nextError);
      toast.error({
        content: nextError,
        placement: 'top',
      });
    } finally {
      if (!isStale()) {
        setIsMemoryMutating(false);
      }
    }
  }, [activeUserId, isMemoryMutating]);

  const handleDeleteMemory = useCallback(async (memory: Memory) => {
    const userId = activeUserId;
    if (!userId || isMemoryMutating) return;
    const isProjectMemory = memory.scope === 'project' || Boolean(memory.project_id);

    const mutationSeq = memoryMutationSeqRef.current + 1;
    memoryMutationSeqRef.current = mutationSeq;
    const isStale = () =>
      memoryMutationSeqRef.current !== mutationSeq || currentUserIdRef.current !== userId;

    setIsMemoryMutating(true);
    try {
      await api.deleteMemory(memory.id);
      if (isStale()) return;

      if (isProjectMemory) {
        setProjectMemories((prev) => prev.filter((item) => item.id !== memory.id));
      } else {
        setGlobalMemories((prev) => prev.filter((item) => item.id !== memory.id));
      }
      setErrorMessage('');
      toast.success({
        content: '记忆已删除',
        placement: 'top',
      });
    } catch (err) {
      if (isStale()) return;

      console.error(err);
      const nextError = err instanceof Error ? err.message : 'Failed to delete memory';
      setErrorMessage(nextError);
      toast.error({
        content: nextError,
        placement: 'top',
      });
    } finally {
      if (!isStale()) {
        setIsMemoryMutating(false);
      }
    }
  }, [activeUserId, isMemoryMutating]);

  const handleCreateProject = useCallback(
    async (name: string) => {
      const project = await api.createProject({ name });
      setProjects((prev) => [project, ...prev]);
      handleNewProjectChat(project.id);
    },
    [handleNewProjectChat]
  );

  const handleUpdateProject = useCallback(
    async (projectId: string, updates: { name?: string; archived?: boolean }) => {
      const updatedProject = await api.updateProject(projectId, updates);
      setProjects((prev) =>
        updates.archived
          ? prev.filter((project) => project.id !== projectId)
          : prev.map((project) => (project.id === projectId ? updatedProject : project))
      );
      if (updates.archived && activeProjectId === projectId) {
        handleNewChat();
      }
    },
    [activeProjectId, handleNewChat]
  );

  const handleSend = useCallback(
    async ({
      message,
      attachments,
    }: {
      message: string;
      attachments: ComposerAttachment[];
    }) => {
      if (isStreaming) return;

      setAppView('chat');
      const tempAttachments = toTempMessageAttachments(attachments);

      const tempUserMsg: Message = {
        id: `temp-${Date.now()}`,
        role: 'user',
        content: message,
        created_at: new Date().toISOString(),
        attachments: tempAttachments,
      };

      setMessages((prev) => [...prev, tempUserMsg]);
      setIsStreaming(true);
      setStreamingStartedAt(Date.now());
      setStreamingContent('');
      setErrorMessage('');
      stopRequestedRef.current = false;
      const abortController = new AbortController();
      streamAbortControllerRef.current = abortController;

      let currentConvId = activeConvId;
      let sendFailed = false;

      try {
        await api.sendMessage(
          message,
          attachments.map((attachment) => attachment.file),
          currentConvId,
          activeProjectId ?? null,
          selectedModel || null,
          reasoningLevel,
          (chunk) => {
            setStreamingContent((prev) => prev + chunk);
          },
          (id) => {
            currentConvId = id;
            setActiveConvId(id);
          },
          (error) => {
            sendFailed = true;
            setErrorMessage(error);
            console.error('Stream error:', error);
          },
          abortController.signal
        );
      } catch (err) {
        if (!(err instanceof Error && err.name === 'AbortError' && stopRequestedRef.current)) {
          sendFailed = true;
          setErrorMessage(err instanceof Error ? err.message : 'Failed to send message');
          console.error(err);
        }
      } finally {
        streamAbortControllerRef.current = null;
        stopRequestedRef.current = false;
        setIsStreaming(false);
        setStreamingStartedAt(null);
        setStreamingContent('');
        revokeAttachmentUrls(tempUserMsg.attachments);

        if (currentConvId) {
          try {
            const [msgs] = await Promise.all([
              api.fetchMessages(currentConvId),
              refreshConversations(),
            ]);
            setMessages(msgs);
            setDraftProjectId(null);
          } catch (err) {
            console.error(err);
            setErrorMessage(
              err instanceof Error ? err.message : 'Failed to refresh conversation'
            );
          }
        } else if (sendFailed) {
          setMessages((prev) => prev.filter((msg) => msg.id !== tempUserMsg.id));
        }
      }
    },
    [activeConvId, activeProjectId, isStreaming, reasoningLevel, refreshConversations, selectedModel]
  );

  const handleStopStreaming = useCallback(() => {
    if (!streamAbortControllerRef.current) return;
    stopRequestedRef.current = true;
    streamAbortControllerRef.current.abort();
  }, []);

  const currentTheme = useMemo(
    () => getConversationTheme(activeConvId),
    [activeConvId]
  );

  const selectedModelOption = useMemo(
    () =>
      modelOptions.find((option) => option.id === selectedModel) ?? modelOptions[0] ?? null,
    [modelOptions, selectedModel]
  );

  if (isAuthBootstrapping) {
    return <div className="auth-loading-screen">Loading...</div>;
  }

  if (!currentUser || appView === 'signup') {
    return (
      <SignUpScreen
        onSubmit={handleAuthSubmit}
        isSubmitting={isAuthenticating}
        errorMessage={authErrorMessage}
      />
    );
  }

  return (
    <div
      className={`app-shell theme-${currentTheme} ${
        isSidebarCollapsed ? 'is-sidebar-collapsed' : ''
      }`}
    >
      <button
        type="button"
        className={`mobile-sidebar-backdrop ${isMobileSidebarOpen ? 'is-open' : ''}`}
        aria-label="Close conversations"
        onClick={() => setIsMobileSidebarOpen(false)}
      />
      <Sidebar
        conversations={conversations}
        activeId={activeConvId}
        onSelect={handleSelectConversation}
        onNew={handleNewChat}
        onDelete={handleDeleteConversation}
        onRename={handleRenameConversation}
        onTogglePin={handleTogglePinConversation}
        onClearAll={handleClearAllConversations}
        onOpenSettings={() => {
          setIsMobileSidebarOpen(false);
          setIsSettingsOpen(true);
        }}
        onLogout={handleLogout}
        currentUser={currentUser}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapsed={() => setIsSidebarCollapsed((prev) => !prev)}
        isClearingAll={isClearingConversations}
        projects={projects}
        activeProjectId={activeProjectId ?? null}
        onNewProject={handleCreateProject}
        onNewProjectChat={handleNewProjectChat}
        onRenameProject={(projectId, name) => handleUpdateProject(projectId, { name })}
        onArchiveProject={(projectId) => handleUpdateProject(projectId, { archived: true })}
      />
      <div className="mobile-topbar">
        <button
          type="button"
          className="mobile-topbar-icon"
          aria-label="Open conversations"
          onClick={() => setIsMobileSidebarOpen(true)}
        >
          <Icon name="menu" />
        </button>
        <div className="mobile-topbar-brand">CHAT A.I+</div>
        <div className="mobile-topbar-actions">
          <button type="button" className="mobile-topbar-pill" onClick={handleNewChat}>
            <span className="mobile-topbar-pill-plus">+</span>
            <span>New</span>
          </button>
          <button
            type="button"
            className="mobile-topbar-icon"
            aria-label="Open settings"
            onClick={() => setIsSettingsOpen(true)}
          >
            <Icon name="settings" />
          </button>
        </div>
      </div>
      <ChatWindow
        conversationId={activeConvId}
        messages={messages}
        streamingContent={streamingContent}
        isStreaming={isStreaming}
        streamingStartedAt={streamingStartedAt}
        errorMessage={errorMessage}
        currentModelLabel={selectedModelOption?.label ?? selectedModel}
        onSend={handleSend}
        onStopStreaming={handleStopStreaming}
        onOpenModelPicker={() => setIsSettingsOpen(true)}
      />
      <SettingsDrawer
        isOpen={isSettingsOpen}
        modelOptions={modelOptions}
        selectedModel={selectedModel}
        selectedOption={selectedModelOption}
        onModelChange={setSelectedModel}
        reasoningLevel={reasoningLevel}
        onReasoningLevelChange={setReasoningLevel}
        activeProjectName={activeProject?.name ?? null}
        globalMemories={globalMemories}
        projectMemories={projectMemories}
        globalMemoryDraft={globalMemoryDraft}
        projectMemoryDraft={projectMemoryDraft}
        isMemoriesLoading={isMemoriesLoading}
        isMemoryMutating={isMemoryMutating}
        onGlobalMemoryDraftChange={setGlobalMemoryDraft}
        onProjectMemoryDraftChange={handleProjectMemoryDraftChange}
        onCreateGlobalMemory={handleCreateGlobalMemory}
        onCreateProjectMemory={handleCreateProjectMemory}
        onToggleMemory={handleToggleMemory}
        onDeleteMemory={handleDeleteMemory}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
