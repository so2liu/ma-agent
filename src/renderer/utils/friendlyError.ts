export type ErrorActionType = 'settings' | 'retry';

export interface ErrorClassification {
  actionType?: ErrorActionType;
  kind:
    | 'missing_api_key'
    | 'invalid_api_key'
    | 'unauthorized'
    | 'forbidden'
    | 'rate_limit'
    | 'timeout'
    | 'network'
    | 'service_busy'
    | 'context_length'
    | 'attachment'
    | 'unknown';
  message: string;
}

const ERROR_RULES: Array<{
  pattern: RegExp;
  classification: ErrorClassification;
}> = [
  {
    pattern: /api.?key.*(not|isn't|no).*(configured|set|found)/i,
    classification: {
      kind: 'missing_api_key',
      message: '尚未配置 AI 密钥，请前往设置页面添加',
      actionType: 'settings'
    }
  },
  {
    pattern: /api.?key.*(invalid|incorrect|wrong)/i,
    classification: {
      kind: 'invalid_api_key',
      message: 'API 密钥无效或已过期',
      actionType: 'settings'
    }
  },
  {
    pattern: /unauthorized|401/i,
    classification: {
      kind: 'unauthorized',
      message: 'API 密钥无效或已过期',
      actionType: 'settings'
    }
  },
  {
    pattern: /forbidden|403/i,
    classification: {
      kind: 'forbidden',
      message: 'API 密钥权限不足或额度已用尽',
      actionType: 'settings'
    }
  },
  {
    pattern: /rate.?limit|429/i,
    classification: {
      kind: 'rate_limit',
      message: '服务暂时繁忙，请稍后再试',
      actionType: 'retry'
    }
  },
  {
    pattern: /timeout|timed?\s?out/i,
    classification: {
      kind: 'timeout',
      message: '请求超时，请检查网络后重试',
      actionType: 'retry'
    }
  },
  {
    pattern: /network|ECONNREFUSED|ENOTFOUND|fetch failed|offline|socket hang up/i,
    classification: {
      kind: 'network',
      message: '网络连接失败，请检查网络后重试',
      actionType: 'retry'
    }
  },
  {
    pattern: /overloaded|503|529/i,
    classification: {
      kind: 'service_busy',
      message: 'AI 服务暂时繁忙，请稍后再试',
      actionType: 'retry'
    }
  },
  {
    pattern: /context.*(length|window|too long)/i,
    classification: {
      kind: 'context_length',
      message: '对话内容过长，请开启新对话后重试'
    }
  },
  {
    pattern: /preparing attachments/i,
    classification: {
      kind: 'attachment',
      message: '附件处理失败，请检查文件后重试'
    }
  }
];

export function classifyError(raw: string): ErrorClassification {
  for (const rule of ERROR_RULES) {
    if (rule.pattern.test(raw)) {
      return rule.classification;
    }
  }

  return {
    kind: 'unknown',
    message: '出了点问题，请稍后重试，或复制错误详情后再次尝试'
  };
}

export function friendlyError(raw: string): string {
  return classifyError(raw).message;
}
