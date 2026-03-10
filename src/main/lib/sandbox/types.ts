export interface SandboxRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string | null;
}

export interface SandboxResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface AppManifest {
  name: string;
  description: string;
  version: string;
  icon: string;
  conversationId?: string;
}

export type AppStatus = 'stopped' | 'installing' | 'developing' | 'building' | 'running';

export interface AppInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: AppStatus;
  lanUrl: string | null;
  localUrl: string | null;
  port: number | null;
  conversationId: string | null;
}

export interface PublishResult {
  lanUrl: string;
  localUrl: string;
  port: number;
}

export interface SandboxApp {
  handleRequest: (req: SandboxRequest) => Promise<SandboxResponse>;
  dispose: () => void;
}
