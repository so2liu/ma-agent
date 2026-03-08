export interface SkillCard {
  id: string
  title: string
  icon: 'FileText' | 'BarChart3' | 'PenLine' | 'Globe' | 'Palette' | 'Sparkles'
  iconColor: string
  /** One-line scenario shown below pills when selected */
  example: string
  prefillPrompt: string | null
}

export const skillCards: SkillCard[] = [
  {
    id: 'web-app',
    title: '创建应用',
    icon: 'Globe',
    iconColor: '#8B5CF6',
    example: '做一个团建住宿统计页面，同事打开链接就能填写',
    prefillPrompt:
      '帮我创建一个露营团建住宿统计页面，同事打开链接后可以填写自己的姓名、选择住营地还是当天返回，提交后我能实时看到汇总结果。',
  },
  {
    id: 'pdf',
    title: '处理 PDF',
    icon: 'FileText',
    iconColor: '#EF4444',
    example: '把对账单 PDF 里的表格提取成 Excel',
    prefillPrompt:
      '请帮我把附件中这份对账单 PDF 里的表格数据提取出来，整理成 Excel 表格，方便我逐项核对。',
  },
  {
    id: 'xlsx',
    title: '分析表格',
    icon: 'BarChart3',
    iconColor: '#22C55E',
    example: '分析各渠道销售数据，生成带图表的报告',
    prefillPrompt:
      '请分析附件中上季度各渠道的销售数据，找出增长最快和下滑最明显的渠道，做成带图表的分析报告。',
  },
  {
    id: 'docx',
    title: '编辑文档',
    icon: 'PenLine',
    iconColor: '#3B82F6',
    example: '检查年会方案的措辞和格式，标注修改建议',
    prefillPrompt:
      '请帮我检查附件中的年会活动方案，看看有没有措辞不当、逻辑不通或格式不规范的地方，标注出来并给出修改建议。',
  },
  {
    id: 'frontend-design',
    title: '设计界面',
    icon: 'Palette',
    iconColor: '#EC4899',
    example: '设计一个数据看板，集中展示关键业务指标',
    prefillPrompt:
      '帮我设计一个内部数据看板页面，能展示今日订单量、销售额、客户数等关键指标，风格简洁清晰。',
  },
  {
    id: 'more',
    title: '更多场景',
    icon: 'Sparkles',
    iconColor: '#6B7280',
    example: '',
    prefillPrompt: null,
  },
]
