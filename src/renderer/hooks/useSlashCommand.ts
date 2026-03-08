import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { skillCards } from '@/constants/skillCards';

import type { SkillInfo } from '../electron';

export interface SlashCommandItem {
  id: string;
  name: string;
  displayName: string;
  description: string;
  /** If set, selecting this item replaces the entire input with this prompt */
  prefillPrompt: string | null;
}

function buildSlashItems(installedSkills: SkillInfo[]): SlashCommandItem[] {
  const items: SlashCommandItem[] = [];
  const seen = new Set<string>();

  // Skill cards first (they have friendly Chinese titles and prefill prompts)
  for (const card of skillCards) {
    if (!card.prefillPrompt) continue;
    seen.add(card.id);
    items.push({
      id: `card-${card.id}`,
      name: card.id,
      displayName: card.title,
      description: card.description,
      prefillPrompt: card.prefillPrompt,
    });
  }

  // Installed skills not already covered by cards
  for (const skill of installedSkills) {
    if (seen.has(skill.name)) continue;
    items.push({
      id: `skill-${skill.name}`,
      name: skill.name,
      displayName: skill.name,
      description: skill.manifest?.description ?? '',
      prefillPrompt: null,
    });
  }

  return items;
}

export function useSlashCommand(inputValue: string) {
  const [installedSkills, setInstalledSkills] = useState<SkillInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  // Fetch installed skills on mount and when skills page might have changed
  useEffect(() => {
    window.electron.skill
      .list()
      .then(({ skills }) => setInstalledSkills(skills))
      .catch(() => {});
  }, []);

  const allItems = useMemo(() => buildSlashItems(installedSkills), [installedSkills]);

  // Detect slash command pattern: input starts with "/" and no whitespace
  const slashMatch = useMemo(() => {
    if (!inputValue.startsWith('/')) return null;
    // Close menu if any whitespace appears (space, newline, tab)
    if (/\s/.test(inputValue)) return null;
    return inputValue.slice(1).toLowerCase();
  }, [inputValue]);

  const isOpen = slashMatch !== null && !dismissed;

  // Reset dismissed state and refresh skills when slash match changes
  const prevSlashMatchRef = useRef(slashMatch);
  if (prevSlashMatchRef.current !== slashMatch) {
    prevSlashMatchRef.current = slashMatch;
    setSelectedIndex(0);
    setDismissed(false);
    // Refresh skill list when user starts a new slash command
    if (slashMatch === '') {
      window.electron.skill
        .list()
        .then(({ skills }) => setInstalledSkills(skills))
        .catch(() => {});
    }
  }

  const filtered = useMemo(() => {
    if (slashMatch === null) return [];
    if (slashMatch === '') return allItems;
    return allItems.filter(
      (item) =>
        item.name.toLowerCase().includes(slashMatch) ||
        item.displayName.toLowerCase().includes(slashMatch) ||
        item.description.toLowerCase().includes(slashMatch),
    );
  }, [slashMatch, allItems]);

  const dismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  const refreshSkills = useCallback(() => {
    window.electron.skill
      .list()
      .then(({ skills }) => setInstalledSkills(skills))
      .catch(() => {});
  }, []);

  const moveSelection = useCallback(
    (delta: number) => {
      if (filtered.length === 0) return;
      setSelectedIndex((prev) => {
        const next = prev + delta;
        if (next < 0) return filtered.length - 1;
        if (next >= filtered.length) return 0;
        return next;
      });
    },
    [filtered.length],
  );

  const getSelectedItem = useCallback((): SlashCommandItem | null => {
    return filtered[selectedIndex] ?? null;
  }, [filtered, selectedIndex]);

  return {
    isOpen,
    items: filtered,
    selectedIndex,
    setSelectedIndex,
    moveSelection,
    getSelectedItem,
    dismiss,
    refreshSkills,
  };
}
