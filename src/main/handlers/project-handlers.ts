import { ipcMain } from 'electron';

import {
  createProject,
  deleteProject,
  listProjects,
  reorderProjects,
  updateProject
} from '../lib/project-db';

export function registerProjectHandlers(): void {
  ipcMain.handle('project:list', async (_event, includeArchived?: boolean) => {
    try {
      const projects = listProjects(includeArchived);
      return { success: true, projects };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle('project:create', async (_event, name: string) => {
    try {
      const project = createProject(name);
      return { success: true, project };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle(
    'project:update',
    async (_event, id: string, updates: { name?: string; isArchived?: boolean }) => {
      try {
        const project = updateProject(id, updates);
        return { success: true, project };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  ipcMain.handle('project:reorder', async (_event, orderedIds: string[]) => {
    try {
      reorderProjects(orderedIds);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle('project:delete', async (_event, id: string) => {
    try {
      deleteProject(id);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });
}
