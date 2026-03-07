export interface SkillCard {
  id: string
  title: string
  description: string
  icon: 'FileText' | 'BarChart3' | 'PenLine' | 'Globe' | 'Palette' | 'Sparkles'
  gradient: { from: string; to: string }
  prefillPrompt: string | null
}

export const skillCards: SkillCard[] = [
  {
    id: 'pdf',
    title: '处理 PDF',
    description: '提取内容、合并拆分、填写表单',
    icon: 'FileText',
    gradient: { from: '#EF4444', to: '#F97316' },
    prefillPrompt:
      '请提取附件 PDF 中的关键数据和表格，并整理成结构化的摘要。',
  },
  {
    id: 'xlsx',
    title: '分析表格',
    description: '数据分析、图表制作、公式计算',
    icon: 'BarChart3',
    gradient: { from: '#22C55E', to: '#10B981' },
    prefillPrompt:
      '请分析附件中的表格数据，找出关键趋势，并生成带图表的分析报告。',
  },
  {
    id: 'docx',
    title: '编辑文档',
    description: '创建、审阅、批注 Word 文档',
    icon: 'PenLine',
    gradient: { from: '#3B82F6', to: '#6366F1' },
    prefillPrompt:
      '请审阅附件文档的内容和结构，提供修改建议并生成带修订标记的版本。',
  },
  {
    id: 'web-app',
    title: '创建应用',
    description: '根据描述快速生成网页应用',
    icon: 'Globe',
    gradient: { from: '#8B5CF6', to: '#A855F7' },
    prefillPrompt:
      '帮我创建一个露营团建住宿统计应用，可以录入参与人员，选择是否住在营地，并汇总统计结果。',
  },
  {
    id: 'frontend-design',
    title: '设计界面',
    description: '打造高品质的前端页面',
    icon: 'Palette',
    gradient: { from: '#EC4899', to: '#F43F5E' },
    prefillPrompt:
      '设计一个现代风格的数据看板，包含侧边导航、数据卡片和图表区域，风格专业大气。',
  },
  {
    id: 'more',
    title: '更多场景',
    description: '探索其他能力',
    icon: 'Sparkles',
    gradient: { from: '#6B7280', to: '#9CA3AF' },
    prefillPrompt: null,
  },
]
