import './App.css'
import Feature from './Feature'
import {
  DocumentTextIcon,
  TableCellsIcon,
  CommandLineIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'

// TODO: 确认正式的 GitHub 仓库地址后替换
const GITHUB_URL = 'https://github.com/so2liu/ma-agent'
const RELEASES_URL = 'https://github.com/so2liu/ma-agent/releases/latest'

const TOS_BASE =
  'https://ma-agent-releases.tos-cn-beijing.volces.com/releases/release'
// TODO: 版本号需要在每次发版时更新，或改为动态获取
const LATEST_VERSION = '0.1.3'
const DOWNLOAD_MAC = `${TOS_BASE}/Claude%20Agent%20Desktop-${LATEST_VERSION}-arm64.dmg`

function App() {
  return (
    <main className="bg-white text-gray-900">
      {/* Header */}
      <header className="container mx-auto flex items-center justify-between p-6">
        <a href="#" className="text-xl font-bold tracking-tight">
          小马快跑
        </a>
        <nav className="flex items-center gap-6">
          <a
            href="#features"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            功能
          </a>
          <a
            href="#download"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            下载
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            GitHub
          </a>
        </nav>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-6 py-20 text-center lg:py-32">
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          让 AI 成为你的
          <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
            工作搭档
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-gray-600">
          小马快跑是一款开源桌面应用，帮助你用自然语言完成文档处理、数据分析、表格操作和日常自动化。无需编程，对话即可完成工作。
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-gray-900 px-6 py-3 text-sm font-medium text-white shadow-sm hover:bg-gray-800 transition-colors"
          >
            免费下载
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-gray-300 px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            查看源码
          </a>
        </div>
        <p className="mt-4 text-xs text-gray-400">
          支持 macOS · Windows 版即将推出 · 免费开源 · 需自备 API Key
        </p>
      </section>

      {/* Features */}
      <section id="features" className="bg-gray-50 py-20">
        <div className="container mx-auto px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              你的日常工作，交给 AI
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
              不需要学习编程，用日常对话的方式描述你的需求，小马快跑帮你搞定。
            </p>
          </div>

          <div className="mt-16 grid max-w-4xl mx-auto grid-cols-1 gap-12 md:grid-cols-2">
            <Feature
              name="文档处理"
              description="自动整理、格式化和编辑 Word、PDF 等文档，批量处理也不在话下。"
            >
              <DocumentTextIcon className="h-6 w-6" />
            </Feature>
            <Feature
              name="数据分析"
              description="导入数据后用自然语言提问，获得洞察和可视化结果，无需学习 Excel 公式。"
            >
              <TableCellsIcon className="h-6 w-6" />
            </Feature>
            <Feature
              name="自动化流程"
              description="把重复性任务交给 AI，从文件整理到信息提取，一句话搞定。"
            >
              <CommandLineIcon className="h-6 w-6" />
            </Feature>
            <Feature
              name="智能助手"
              description="基于 Claude 大语言模型，理解复杂指令，给出专业且准确的回答。"
            >
              <SparklesIcon className="h-6 w-6" />
            </Feature>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              三步开始使用
            </h2>
          </div>
          <div className="mt-16 grid max-w-4xl mx-auto grid-cols-1 gap-8 md:grid-cols-3">
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-violet-600 text-lg font-bold">
                1
              </div>
              <h3 className="mt-4 text-lg font-semibold">下载安装</h3>
              <p className="mt-2 text-sm text-gray-600">
                从 GitHub Releases 下载对应系统的安装包，一键安装。
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-violet-600 text-lg font-bold">
                2
              </div>
              <h3 className="mt-4 text-lg font-semibold">填入 API Key</h3>
              <p className="mt-2 text-sm text-gray-600">
                输入你的 Anthropic API Key，即可连接 Claude 模型。
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-violet-600 text-lg font-bold">
                3
              </div>
              <h3 className="mt-4 text-lg font-semibold">开始对话</h3>
              <p className="mt-2 text-sm text-gray-600">
                用自然语言描述你的需求，小马快跑帮你完成工作。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Download CTA */}
      <section id="download" className="bg-gray-900 py-20">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            准备好提升工作效率了吗？
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-gray-400">
            免费开源，你的文件保存在本地，对话通过 API 处理。
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <a
              href={DOWNLOAD_MAC}
              className="rounded-lg bg-white px-6 py-3 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-100 transition-colors"
            >
              下载 macOS 版
            </a>
            <span className="rounded-lg border border-gray-700 px-6 py-3 text-sm font-medium text-gray-500 cursor-default">
              Windows 版敬请期待
            </span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8">
        <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <span className="text-sm text-gray-500">
            © {new Date().getFullYear()} 小马快跑 · 开源项目
          </span>
          <div className="flex gap-6">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-500 hover:text-gray-900"
            >
              GitHub
            </a>
            <a
              href={`${GITHUB_URL}/issues`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-500 hover:text-gray-900"
            >
              反馈
            </a>
          </div>
        </div>
      </footer>
    </main>
  )
}

export default App
