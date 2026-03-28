# Git Diff 审查结论

## 结论

已修复 3 个问题，未发现剩余阻塞级 Bug / 安全漏洞。

## 已修复问题

### 1. `CodeBlock` 异步高亮存在竞态

- 文件：`src/renderer/components/ai-elements/code-block.tsx`
- 问题：流式更新或快速切换代码内容时，旧的 `highlightCode()` Promise 可能晚于新的请求返回，导致旧高亮结果覆盖新代码。
- 影响：代码块内容显示错乱，尤其在工具输出流式增长时更明显。
- 修复：为每次高亮请求引入 request id，并在 effect 清理时取消过期结果，只允许最新请求写入状态。

### 2. `MessageList` 错误缓存虚拟列表总高度

- 文件：`src/renderer/components/MessageList.tsx`
- 问题：`virtualizer.getTotalSize()` 被 `useMemo()` 以稳定对象引用缓存，动态测量后的高度变化不会重新计算。
- 影响：长消息、折叠区展开后可能出现容器高度不更新，导致列表裁切或滚动区域异常。
- 修复：去掉该处 `useMemo()`，每次渲染直接读取最新总高度。

### 3. `ChatInput` 与 `PromptInput` 附件处理重复

- 文件：
  - `src/renderer/components/ChatInput.tsx`
  - `src/renderer/components/ai-elements/prompt-input.tsx`
- 问题：`ChatInput` 已自行处理文件选择 / 拖拽 / 粘贴，但内部嵌套的 `PromptInput` 仍会注册隐藏文件输入和拖拽处理。
- 影响：
  - 同一次拖拽可能被双重接收
  - 生成不可见的内部附件状态
  - 提交时触发多余的 blob/data URL 转换，带来额外内存和计算开销
- 修复：为 `PromptInput` 增加 `disableAttachments` 开关，并在 `ChatInput` 中显式关闭其内建附件通道。

## 安全审查

未发现本次 diff 新增的注入、XSS、敏感信息泄露问题。

## 性能审查

除上述已修复项外，未发现新的明显 N+1、持续性内存泄漏或不必要的大量重复计算问题。
