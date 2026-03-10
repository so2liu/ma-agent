import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { dialog, ipcMain } from 'electron';

import { getWorkspaceDir } from '../lib/config';
import { skillDiscovery } from '../lib/skill-discovery';
import { readManifest } from '../lib/skill-manifest';
import { exportSkill, getSkillsDir, importSkill, listSkills } from '../lib/skill-packaging';

export function registerSkillHandlers(getMainWindow: () => Electron.BrowserWindow | null): void {
  // List all installed skills
  ipcMain.handle('skill:list', () => {
    try {
      const workspaceDir = getWorkspaceDir();
      const skillsDir = getSkillsDir(workspaceDir);
      const skills = listSkills(skillsDir);
      return { success: true, skills };
    } catch (error) {
      return { success: false, skills: [], error: String(error) };
    }
  });

  // Toggle the shared flag on a skill
  ipcMain.handle('skill:toggle-shared', (_event, skillName: unknown) => {
    try {
      if (typeof skillName !== 'string') throw new Error('skillName must be a string');

      const workspaceDir = getWorkspaceDir();
      const skillDir = join(getSkillsDir(workspaceDir), skillName);
      const manifest = readManifest(skillDir);
      if (!manifest) throw new Error('Skill has no manifest');

      manifest.shared = !manifest.shared;
      manifest.updatedAt = new Date().toISOString();
      writeFileSync(join(skillDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

      return { success: true, shared: manifest.shared };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Update tags on a skill
  ipcMain.handle('skill:update-tags', (_event, skillName: unknown, tags: unknown) => {
    try {
      if (typeof skillName !== 'string') throw new Error('skillName must be a string');
      if (!Array.isArray(tags) || !tags.every((t) => typeof t === 'string')) {
        throw new Error('tags must be an array of strings');
      }

      const workspaceDir = getWorkspaceDir();
      const skillDir = join(getSkillsDir(workspaceDir), skillName);
      const manifest = readManifest(skillDir);
      if (!manifest) throw new Error('Skill has no manifest');

      manifest.tags = tags as string[];
      manifest.updatedAt = new Date().toISOString();
      writeFileSync(join(skillDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Export a skill as zip (save dialog)
  ipcMain.handle('skill:export', async (_event, skillName: unknown) => {
    try {
      if (typeof skillName !== 'string') throw new Error('skillName must be a string');

      const workspaceDir = getWorkspaceDir();
      const skillDir = join(getSkillsDir(workspaceDir), skillName);
      const { buffer, filename } = exportSkill(skillDir);

      const mainWindow = getMainWindow();
      if (!mainWindow) throw new Error('No main window');

      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: filename,
        filters: [{ name: 'ZIP Archives', extensions: ['zip'] }]
      });

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }

      writeFileSync(result.filePath, buffer);
      return { success: true, filePath: result.filePath };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Import a skill from zip (open dialog)
  ipcMain.handle('skill:import', async () => {
    try {
      const mainWindow = getMainWindow();
      if (!mainWindow) throw new Error('No main window');

      const result = await dialog.showOpenDialog(mainWindow, {
        filters: [{ name: 'ZIP Archives', extensions: ['zip'] }],
        properties: ['openFile']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      const zipBuffer = readFileSync(result.filePaths[0]);
      const workspaceDir = getWorkspaceDir();
      const skillsDir = getSkillsDir(workspaceDir);
      const { manifest } = importSkill(zipBuffer, skillsDir);

      return { success: true, manifest };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Discover skills on LAN
  ipcMain.handle('skill:discover', () => {
    try {
      const peers = skillDiscovery.getDiscoveredPeers();
      return { success: true, peers };
    } catch (error) {
      return { success: false, peers: [], error: String(error) };
    }
  });

  // Install a skill from a LAN peer
  ipcMain.handle('skill:install', async (_event, peerInstanceId: unknown, skillName: unknown) => {
    try {
      if (typeof peerInstanceId !== 'string') throw new Error('peerInstanceId must be a string');
      if (typeof skillName !== 'string') throw new Error('skillName must be a string');

      const peers = skillDiscovery.getDiscoveredPeers();
      const peer = peers.find((p) => p.instanceId === peerInstanceId);
      if (!peer) throw new Error('Peer not found or offline');

      const zipBuffer = await skillDiscovery.downloadSkill(peer, skillName);
      const workspaceDir = getWorkspaceDir();
      const skillsDir = getSkillsDir(workspaceDir);
      const { manifest } = importSkill(zipBuffer, skillsDir);

      return { success: true, manifest };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Start/stop discovery service
  ipcMain.handle('skill:start-discovery', async () => {
    try {
      await skillDiscovery.start();
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('skill:stop-discovery', async () => {
    try {
      await skillDiscovery.stop();
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}
