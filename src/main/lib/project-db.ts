import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';

export interface Project {
  id: string;
  name: string;
  order: number;
  isArchived: boolean;
  isDefault?: boolean;
  createdAt: number;
  updatedAt: number;
}

const DEFAULT_PROJECT_NAME = '日常任务';

let projectsFilePath: string | null = null;

function getProjectsFilePath(): string {
  if (!projectsFilePath) {
    projectsFilePath = join(app.getPath('userData'), 'projects.json');
  }
  return projectsFilePath;
}

function readProjects(): Project[] {
  const filePath = getProjectsFilePath();
  if (!existsSync(filePath)) return [];
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as Project[];
  } catch (error) {
    console.error('Error reading projects.json:', error);
    return [];
  }
}

function writeProjects(projects: Project[]): void {
  writeFileSync(getProjectsFilePath(), JSON.stringify(projects, null, 2), 'utf-8');
}

function ensureDefaultProject(projects: Project[]): Project[] {
  const hasDefault = projects.some((p) => p.isDefault);
  if (hasDefault) return projects;

  const now = Date.now();
  const defaultProject: Project = {
    id: crypto.randomUUID(),
    name: DEFAULT_PROJECT_NAME,
    order: -1,
    isArchived: false,
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  };
  projects.unshift(defaultProject);
  writeProjects(projects);
  return projects;
}

export function listProjects(includeArchived = false): Project[] {
  let projects = readProjects();
  projects = ensureDefaultProject(projects);
  const filtered = includeArchived ? projects : projects.filter((p) => !p.isArchived);
  return filtered.sort((a, b) => a.order - b.order);
}

export function createProject(name: string): Project {
  const projects = readProjects();
  const maxOrder = projects.reduce((max, p) => Math.max(max, p.order), -1);
  const now = Date.now();
  const project: Project = {
    id: crypto.randomUUID(),
    name,
    order: maxOrder + 1,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  };
  projects.push(project);
  writeProjects(projects);
  return project;
}

export function updateProject(
  id: string,
  updates: Partial<Pick<Project, 'name' | 'isArchived'>>
): Project {
  const projects = readProjects();
  const index = projects.findIndex((p) => p.id === id);
  if (index === -1) throw new Error(`Project ${id} not found`);

  const project = projects[index];

  if (project.isDefault) {
    throw new Error('Cannot modify the default project');
  }

  if (updates.name !== undefined) project.name = updates.name;
  if (updates.isArchived !== undefined) project.isArchived = updates.isArchived;
  project.updatedAt = Date.now();

  projects[index] = project;
  writeProjects(projects);
  return project;
}

export function reorderProjects(orderedIds: string[]): void {
  const projects = readProjects();
  for (let i = 0; i < orderedIds.length; i++) {
    const project = projects.find((p) => p.id === orderedIds[i]);
    if (project) project.order = i;
  }
  writeProjects(projects);
}

export function deleteProject(id: string): void {
  const projects = readProjects();
  const target = projects.find((p) => p.id === id);
  if (target?.isDefault) {
    throw new Error('Cannot delete the default project');
  }
  writeProjects(projects.filter((p) => p.id !== id));
}

export function getDefaultProject(): Project {
  let projects = readProjects();
  projects = ensureDefaultProject(projects);
  return projects.find((p) => p.isDefault)!;
}
