import type { AssistantReference } from './assistant/retrieval';

export interface AssistantConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  references?: AssistantReference[];
}

export interface AssistantConversationState {
  history: AssistantConversationMessage[];
  followUps: string[];
  /** 本对话是否已经看过问一问彩蛋，新对话时重置。 */
  easterEggSeen: boolean;
}

const storageKey = 'yct.assistant.conversation.v1';
const maximumMessages = 20;
const maximumContentLength = 4000;
const maximumReferences = 10;
const maximumFollowUps = 6;

const createEmptyState = (): AssistantConversationState => ({
  history: [],
  followUps: [],
  easterEggSeen: false,
});

/**
 * 问一问对话保存在本地，刷新、误关页面后还能继续。
 * 只保存问答内容和引用入口，不保存模型 Key（Key 仍在会话存储里）。
 */
export function readAssistantConversation(): AssistantConversationState {
  if (typeof window === 'undefined') {
    return createEmptyState();
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return createEmptyState();
    }

    const parsed = JSON.parse(raw) as {
      version?: unknown;
      history?: unknown;
      followUps?: unknown;
      easterEggSeen?: unknown;
    };
    if (parsed.version !== 1 || !Array.isArray(parsed.history)) {
      return createEmptyState();
    }

    return {
      history: parsed.history.slice(-maximumMessages).flatMap(normalizeMessage),
      followUps: Array.isArray(parsed.followUps)
        ? parsed.followUps
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim().slice(0, 40))
            .filter(Boolean)
            .slice(0, maximumFollowUps)
        : [],
      easterEggSeen: parsed.easterEggSeen === true,
    };
  } catch {
    return createEmptyState();
  }
}

export function writeAssistantConversation(state: AssistantConversationState): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (state.history.length === 0) {
    clearAssistantConversation();
    return;
  }

  const history = state.history.slice(-maximumMessages).map((message) => ({
    role: message.role,
    content: message.content.slice(0, maximumContentLength),
    references: message.references
      ?.slice(0, maximumReferences)
      .map((reference) => ({ ...reference, snippet: reference.snippet?.slice(0, 400) })),
  }));
  // 在输入框改词、换一批追问时会先清空追问项；此时保留仍属于同一回答的旧追问。
  const previous = readAssistantConversation();
  const followUps =
    state.followUps.length > 0
      ? state.followUps
      : lastAssistantContent(history) &&
          lastAssistantContent(history) === lastAssistantContent(previous.history)
        ? previous.followUps
        : [];

  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        history,
        followUps: followUps.slice(0, maximumFollowUps),
        easterEggSeen: state.easterEggSeen === true,
      }),
    );
  } catch {
    // 存储空间不足或被禁用时不影响当前对话。
  }
}

export function clearAssistantConversation(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // 忽略存储异常。
  }
}

function lastAssistantContent(history: AssistantConversationMessage[]): string {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message?.role === 'assistant') {
      return message.content;
    }
  }
  return '';
}

function normalizeMessage(value: unknown): AssistantConversationMessage[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  const candidate = value as { role?: unknown; content?: unknown; references?: unknown };
  if (
    (candidate.role !== 'user' && candidate.role !== 'assistant') ||
    typeof candidate.content !== 'string'
  ) {
    return [];
  }

  const content = candidate.content.trim().slice(0, maximumContentLength);
  if (!content) {
    return [];
  }

  return [
    {
      role: candidate.role,
      content,
      references: normalizeReferences(candidate.references),
    },
  ];
}

function normalizeReferences(value: unknown): AssistantReference[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const references = value
    .flatMap((item, index) => {
      if (!item || typeof item !== 'object') {
        return [];
      }
      const candidate = item as Partial<AssistantReference>;
      if (typeof candidate.title !== 'string' || typeof candidate.source !== 'string') {
        return [];
      }
      return [
        {
          id: typeof candidate.id === 'number' ? candidate.id : index + 1,
          title: candidate.title.slice(0, 200),
          source: candidate.source.slice(0, 40),
          href: typeof candidate.href === 'string' ? candidate.href.slice(0, 500) : undefined,
          asOf: typeof candidate.asOf === 'string' ? candidate.asOf : undefined,
          snippet:
            typeof candidate.snippet === 'string' ? candidate.snippet.slice(0, 400) : undefined,
          color: typeof candidate.color === 'string' ? candidate.color : undefined,
          tone: typeof candidate.tone === 'string' ? candidate.tone : undefined,
        },
      ];
    })
    .slice(0, maximumReferences);

  return references.length > 0 ? references : undefined;
}
