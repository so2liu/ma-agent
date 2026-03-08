const ERROR_MAP: [RegExp, string][] = [
  [/api.?key.*(not|isn't|no).*(configured|set|found)/i, '尚未配置 AI 密钥，请前往设置页面添加'],
  [/api.?key.*(invalid|incorrect|wrong)/i, 'AI 密钥无效，请检查后重新输入'],
  [/rate.?limit|429/i, '请求过于频繁，请稍后再试'],
  [/timeout|timed?\s?out/i, '请求超时，请检查网络后重试'],
  [/network|ECONNREFUSED|ENOTFOUND|fetch failed/i, '网络连接失败，请检查网络后重试'],
  [/unauthorized|401|403/i, '身份验证失败，请检查密钥是否正确'],
  [/overloaded|503|529/i, 'AI 服务暂时繁忙，请稍后再试'],
  [/context.*(length|window|too long)/i, '对话内容过长，请开启新对话后重试'],
  [/preparing attachments/i, '附件处理失败，请检查文件后重试']
];

export function friendlyError(raw: string): string {
  for (const [pattern, message] of ERROR_MAP) {
    if (pattern.test(raw)) return message;
  }
  return `出现了问题: ${raw}`;
}
