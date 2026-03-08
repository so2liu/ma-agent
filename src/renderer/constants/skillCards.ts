export interface SkillCard {
  id: string
  title: string
  description: string
  icon: 'FileText' | 'BarChart3' | 'PenLine' | 'Globe' | 'Palette' | 'Sparkles'
  gradient: { from: string; to: string }
  prefillPrompt: string | null
  /** Detail card content shown when the pill is selected */
  detail?: {
    background: string
    task: string
    output: string
  }
}

export const skillCards: SkillCard[] = [
  {
    id: 'web-app',
    title: '创建应用',
    description: '根据描述快速生成网页应用',
    icon: 'Globe',
    gradient: { from: '#8B5CF6', to: '#A855F7' },
    prefillPrompt:
      '帮我创建一个露营团建住宿统计页面，同事打开链接后可以填写自己的姓名、选择住营地还是当天返回，提交后我能实时看到汇总结果。',
    detail: {
      background:
        '公司安排小张组织一次露营形式的团建，他需要提前统计每个人是住在营地还是当天返回，方便安排帐篷和交通。',
      task: '小张让小马快跑做一个统计页面，同事打开链接就能填写自己的住宿选择。',
      output:
        '生成了一个统计页面，小张把网址发到工作群，大家点进去填完后，小张那边就能实时看到谁住营地、谁当天返回。页面运行在本机上，只有同一网络内的同事才能打开。',
    },
  },
  {
    id: 'pdf',
    title: '处理 PDF',
    description: '提取内容、合并拆分、填写表单',
    icon: 'FileText',
    gradient: { from: '#EF4444', to: '#F97316' },
    prefillPrompt:
      '请帮我把附件中这份对账单 PDF 里的表格数据提取出来，整理成 Excel 表格，方便我逐项核对。',
    detail: {
      background:
        '财务小李每月要核对十几家供应商发来的对账单，但对账单都是 PDF 格式，手动逐行比对既慢又容易出错。',
      task: '小李把对账单 PDF 发给小马快跑，让它把里面的金额、日期、明细整理成表格。',
      output:
        '生成了一份整理好的 Excel 表格，金额、日期、明细一目了然，小李直接打开就能和系统里的数据逐项核对。',
    },
  },
  {
    id: 'xlsx',
    title: '分析表格',
    description: '数据分析、图表制作、公式计算',
    icon: 'BarChart3',
    gradient: { from: '#22C55E', to: '#10B981' },
    prefillPrompt:
      '请分析附件中上季度各渠道的销售数据，找出增长最快和下滑最明显的渠道，做成带图表的分析报告。',
    detail: {
      background:
        '市场部小王拿到了上季度各销售渠道的数据表，领导下周要看各渠道的增长情况，让他准备一份分析报告。',
      task: '小王把数据表发给小马快跑，让它分析各渠道的增长趋势，生成一份带图表的报告。',
      output:
        '生成了一份带柱状图和趋势线的报告，哪个渠道在涨、哪个在跌一目了然，小王直接拿去给领导汇报。',
    },
  },
  {
    id: 'docx',
    title: '编辑文档',
    description: '创建、审阅、批注 Word 文档',
    icon: 'PenLine',
    gradient: { from: '#3B82F6', to: '#6366F1' },
    prefillPrompt:
      '请帮我检查附件中的年会活动方案，看看有没有措辞不当、逻辑不通或格式不规范的地方，标注出来并给出修改建议。',
    detail: {
      background:
        '行政小陈写好了公司年会的活动方案，提交给领导前想先检查一遍，避免有错别字或者逻辑漏洞。',
      task: '小陈把方案文档发给小马快跑，让它帮忙检查措辞、格式和逻辑。',
      output:
        '生成了一份标注好的 Word 文档，有问题的地方都加了批注和修改建议，小陈照着改完就能放心提交。',
    },
  },
  {
    id: 'frontend-design',
    title: '设计界面',
    description: '打造高品质的前端页面',
    icon: 'Palette',
    gradient: { from: '#EC4899', to: '#F43F5E' },
    prefillPrompt:
      '帮我设计一个内部数据看板页面，能展示今日订单量、销售额、客户数等关键指标，风格简洁清晰。',
    detail: {
      background:
        '运营主管每天早上要登录好几个系统分别查看业务数据，想要一个页面能一眼看到所有关键指标。',
      task: '运营主管让小马快跑设计一个数据看板页面，把分散在各系统的关键数字集中展示。',
      output:
        '生成了一个可以在浏览器中直接打开的看板页面，订单量、销售额、客户数等指标用卡片和图表呈现，每天打开就能一目了然。',
    },
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
