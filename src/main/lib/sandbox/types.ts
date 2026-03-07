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
}

export interface AppInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: 'running' | 'stopped';
  lanUrl: string | null;
  localUrl: string | null;
  port: number | null;
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
