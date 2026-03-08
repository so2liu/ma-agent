import {
  ArrowLeft,
  Download,
  Globe,
  Monitor,
  Package,
  RefreshCw,
  Share2,
  Tag,
  Upload,
  X
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { DiscoveredPeer, SkillInfo } from '@/electron';

interface SkillsProps {
  onBack: () => void;
}

export default function Skills({ onBack }: SkillsProps) {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [peers, setPeers] = useState<DiscoveredPeer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingTags, setEditingTags] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [installingSkill, setInstallingSkill] = useState<string | null>(null);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);

  const loadSkills = useCallback(async () => {
    try {
      const response = await window.electron.skill.list();
      if (response.success) {
        setSkills(response.skills);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const discoverPeers = useCallback(async () => {
    setIsDiscovering(true);
    try {
      const response = await window.electron.skill.discover();
      if (response.success) {
        setPeers(response.peers);
      }
    } catch {
      // Ignore discovery errors silently
    } finally {
      setIsDiscovering(false);
    }
  }, []);

  useEffect(() => {
    loadSkills();
    discoverPeers();
    // Poll discovery and refresh skills every 10s (handles workspace init race)
    const interval = setInterval(() => {
      discoverPeers();
      loadSkills();
    }, 10_000);
    return () => clearInterval(interval);
  }, [loadSkills, discoverPeers]);

  const handleToggleShared = async (skillName: string) => {
    const response = await window.electron.skill.toggleShared(skillName);
    if (response.success) {
      await loadSkills();
    } else if (response.error) {
      setError(response.error);
    }
  };

  const handleExport = async (skillName: string) => {
    const response = await window.electron.skill.export(skillName);
    if (!response.success && !response.canceled && response.error) {
      setError(response.error);
    }
  };

  const handleImport = async () => {
    const response = await window.electron.skill.import();
    if (response.success) {
      await loadSkills();
    } else if (!response.canceled && response.error) {
      setError(response.error);
    }
  };

  const handleInstall = async (peerInstanceId: string, skillName: string) => {
    setInstallingSkill(`${peerInstanceId}:${skillName}`);
    try {
      const response = await window.electron.skill.install(peerInstanceId, skillName);
      if (response.success) {
        await loadSkills();
      } else if (response.error) {
        setError(response.error);
      }
    } finally {
      setInstallingSkill(null);
    }
  };

  const handleSaveTags = async (skillName: string) => {
    const tags = tagInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const response = await window.electron.skill.updateTags(skillName, tags);
    if (response.success) {
      setEditingTags(null);
      setTagInput('');
      await loadSkills();
    } else if (response.error) {
      setError(response.error);
    }
  };

  const startEditTags = (skillName: string, currentTags?: string[]) => {
    setEditingTags(skillName);
    setTagInput((currentTags || []).join(', '));
  };

  return (
    <div className="flex h-screen flex-col bg-white dark:bg-neutral-950">
      {/* Header with drag region */}
      <div className="shrink-0 [-webkit-app-region:drag]" style={{ height: 'var(--titlebar-height)' }} />
      <div className="shrink-0">
        <div className="flex items-center gap-3 px-4 py-3 [-webkit-app-region:no-drag]">
          <button
            onClick={onBack}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-base font-semibold text-neutral-800 dark:text-neutral-100">
            Skill 精选
          </h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {/* Intro */}
        <p className="mb-4 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
          Skill 是小马快跑的能力扩展包，安装后可以处理更多类型的任务。你也可以通过局域网与同事共享 Skill。
        </p>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400">
            <span>{error}</span>
            <button onClick={() => setError(null)}>
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Installed Skills */}
        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-neutral-400 uppercase dark:text-neutral-500">
              <Package className="h-3.5 w-3.5" />
              已安装的 Skill
            </h2>
            <button
              onClick={handleImport}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <Upload className="h-3 w-3" />
              导入 ZIP
            </button>
          </div>

          {/* Tag filter */}
          {(() => {
            const allTags = [...new Set(skills.flatMap((s) => s.manifest?.tags ?? []))];
            if (allTags.length === 0) return null;
            return (
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setActiveTagFilter(null)}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition ${
                    activeTagFilter === null
                      ? 'bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900'
                      : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700'
                  }`}
                >
                  全部
                </button>
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition ${
                      activeTagFilter === tag
                        ? 'bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900'
                        : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            );
          })()}

          {isLoading ?
            <div className="py-8 text-center text-xs text-neutral-400">加载中...</div>
          : skills.length === 0 ?
            <div className="py-8 text-center text-xs text-neutral-400">暂无 Skill</div>
          : (() => {
              const filtered = skills.filter((skill) =>
                !activeTagFilter || (skill.manifest?.tags ?? []).includes(activeTagFilter)
              );
              if (filtered.length === 0) {
                return (
                  <div className="py-8 text-center text-xs text-neutral-400">
                    没有匹配「{activeTagFilter}」的 Skill
                  </div>
                );
              }
              return (
                <div className="space-y-2">
                  {filtered.map((skill) => (
                    <SkillCard
                      key={skill.name}
                      skill={skill}
                      editingTags={editingTags}
                      tagInput={tagInput}
                      onTagInputChange={setTagInput}
                      onToggleShared={handleToggleShared}
                      onExport={handleExport}
                      onStartEditTags={startEditTags}
                      onSaveTags={handleSaveTags}
                      onCancelEditTags={() => setEditingTags(null)}
                    />
                  ))}
                </div>
              );
            })()
          }
        </section>

        {/* LAN Discovery */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-neutral-400 uppercase dark:text-neutral-500">
              <Globe className="h-3.5 w-3.5" />
              局域网发现
            </h2>
            <button
              onClick={discoverPeers}
              disabled={isDiscovering}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <RefreshCw className={`h-3 w-3 ${isDiscovering ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>

          {peers.length === 0 ?
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Monitor className="h-5 w-5 text-neutral-300 dark:text-neutral-600" />
              <p className="text-xs text-neutral-400 dark:text-neutral-500">
                未发现局域网中的共享 Skill
              </p>
              <p className="text-[10px] text-neutral-300 dark:text-neutral-600">
                将你的 Skill 标记为「共享」后，同网络中的其他用户即可发现
              </p>
            </div>
          : <div className="space-y-3">
              {peers.map((peer) => (
                <PeerCard
                  key={peer.instanceId}
                  peer={peer}
                  installingSkill={installingSkill}
                  onInstall={handleInstall}
                />
              ))}
            </div>
          }
        </section>
      </div>
    </div>
  );
}

function SkillCard({
  skill,
  editingTags,
  tagInput,
  onTagInputChange,
  onToggleShared,
  onExport,
  onStartEditTags,
  onSaveTags,
  onCancelEditTags
}: {
  skill: SkillInfo;
  editingTags: string | null;
  tagInput: string;
  onTagInputChange: (v: string) => void;
  onToggleShared: (name: string) => void;
  onExport: (name: string) => void;
  onStartEditTags: (name: string, tags?: string[]) => void;
  onSaveTags: (name: string) => void;
  onCancelEditTags: () => void;
}) {
  const m = skill.manifest;

  return (
    <div className="rounded-lg border border-neutral-200 p-3 transition hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
              {m?.name || skill.name}
            </span>
            {m?.version && (
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                v{m.version}
              </span>
            )}
            {skill.isBuiltin && (
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                内置
              </span>
            )}
          </div>
          {m?.description && (
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{m.description}</p>
          )}

          {/* Tags */}
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {editingTags === skill.name ?
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => onTagInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSaveTags(skill.name);
                    if (e.key === 'Escape') onCancelEditTags();
                  }}
                  placeholder="tag1, tag2, ..."
                  className="rounded border border-neutral-300 bg-white px-2 py-0.5 text-[10px] focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900"
                  autoFocus
                />
                <button
                  onClick={() => onSaveTags(skill.name)}
                  className="rounded px-1.5 py-0.5 text-[10px] text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30"
                >
                  保存
                </button>
              </div>
            : <>
                {m?.tags?.map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                  >
                    {tag}
                  </span>
                ))}
                <button
                  onClick={() => onStartEditTags(skill.name, m?.tags)}
                  className="rounded p-0.5 text-neutral-300 hover:text-neutral-500 dark:text-neutral-600 dark:hover:text-neutral-400"
                  title="编辑标签"
                >
                  <Tag className="h-3 w-3" />
                </button>
              </>
            }
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => onToggleShared(skill.name)}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] transition ${
              m?.shared
                ? 'bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50'
                : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300'
            }`}
            title={m?.shared ? '点击取消共享' : '点击共享到局域网'}
          >
            <Share2 className="h-3 w-3" />
            {m?.shared ? '已共享' : '共享'}
          </button>
          <button
            onClick={() => onExport(skill.name)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            title="导出为 ZIP"
          >
            <Download className="h-3 w-3" />
            导出
          </button>
        </div>
      </div>
    </div>
  );
}

function PeerCard({
  peer,
  installingSkill,
  onInstall
}: {
  peer: DiscoveredPeer;
  installingSkill: string | null;
  onInstall: (peerId: string, skillName: string) => void;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="mb-2 flex items-center gap-2">
        <Monitor className="h-3.5 w-3.5 text-neutral-400" />
        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
          {peer.hostname}
        </span>
        <span className="text-[10px] text-neutral-400">
          {peer.skills.length} 个共享 Skill
        </span>
      </div>
      <div className="space-y-1.5">
        {peer.skills.map((skill) => {
          const installKey = `${peer.instanceId}:${skill.name}`;
          const isInstalling = installingSkill === installKey;
          return (
            <div
              key={skill.name}
              className="flex items-center justify-between rounded-md bg-neutral-50 px-2.5 py-1.5 dark:bg-neutral-900"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    {skill.name}
                  </span>
                  <span className="text-[10px] text-neutral-400">v{skill.version}</span>
                </div>
                {skill.description && (
                  <p className="mt-0.5 truncate text-[10px] text-neutral-400">{skill.description}</p>
                )}
              </div>
              <button
                onClick={() => onInstall(peer.instanceId, skill.name)}
                disabled={isInstalling}
                className="ml-2 flex shrink-0 items-center gap-1 rounded-lg bg-blue-500 px-2 py-1 text-[10px] text-white transition hover:bg-blue-600 disabled:opacity-50"
              >
                {isInstalling ?
                  <RefreshCw className="h-3 w-3 animate-spin" />
                : <Download className="h-3 w-3" />
                }
                安装
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
