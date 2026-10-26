export type AssistantProviderId = 'deepseek' | 'glm' | 'mimo';

export interface AssistantProvider {
  id: AssistantProviderId;
  label: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
  maxTokensField: 'max_tokens' | 'max_completion_tokens';
}

export const assistantProviders: AssistantProvider[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-v4-flash',
    // DeepSeek 已把 deepseek-chat / deepseek-reasoner 迁移到 V4 模型名；
    // 这里只放建议值，设置页允许手动输入服务商当前可用的模型名。
    models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    maxTokensField: 'max_tokens',
  },
  {
    id: 'glm',
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    models: ['glm-4-flash', 'glm-4-plus', 'glm-4.5', 'glm-5.3'],
    maxTokensField: 'max_tokens',
  },
  {
    id: 'mimo',
    label: '小米 MiMo',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    defaultModel: 'mimo-v2.6-pro',
    models: ['mimo-v2.6-pro'],
    maxTokensField: 'max_completion_tokens',
  },
];

export function getAssistantProvider(id: string): AssistantProvider | undefined {
  return assistantProviders.find((provider) => provider.id === id);
}

export function isAssistantProviderId(value: string): value is AssistantProviderId {
  return assistantProviders.some((provider) => provider.id === value);
}
