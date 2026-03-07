import { randomUUID } from 'crypto';
import { createSocket, type Socket } from 'dgram';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { hostname, networkInterfaces } from 'os';

import { getWorkspaceDir } from './config';
import { exportSkill, getSkillsDir, listSkills } from './skill-packaging';

// Multicast group in the administratively-scoped range
const MULTICAST_ADDR = '239.42.42.42';
const MULTICAST_PORT = 41234;
const ANNOUNCE_INTERVAL_MS = 10_000;

/** Announced skill info sent over multicast */
export interface DiscoveredSkill {
  id: string;
  name: string;
  version: string;
  description: string;
  tags?: string[];
  author?: string;
}

/** A peer on the LAN offering shared skills */
export interface DiscoveredPeer {
  instanceId: string;
  hostname: string;
  httpPort: number;
  skills: DiscoveredSkill[];
  lastSeen: number;
}

interface AnnounceMessage {
  type: 'announce';
  instanceId: string;
  hostname: string;
  httpPort: number;
  skills: DiscoveredSkill[];
}

/**
 * LAN skill discovery service.
 * Uses UDP multicast for announcing shared skills and HTTP for downloading them.
 */
class SkillDiscoveryService {
  private instanceId = randomUUID();
  private udpSocket: Socket | null = null;
  private httpServer: Server | null = null;
  private httpPort = 0;
  private announceTimer: ReturnType<typeof setInterval> | null = null;
  private peers = new Map<string, DiscoveredPeer>();
  private running = false;

  /** Start the discovery service */
  async start(): Promise<void> {
    if (this.running) return;

    await this.startHttpServer();
    this.startUdpListener();
    this.startAnnouncing();
    this.running = true;
  }

  /** Stop the discovery service */
  async stop(): Promise<void> {
    this.running = false;

    if (this.announceTimer) {
      clearInterval(this.announceTimer);
      this.announceTimer = null;
    }

    if (this.udpSocket) {
      try {
        this.udpSocket.dropMembership(MULTICAST_ADDR);
      } catch {
        // Ignore errors when dropping membership
      }
      this.udpSocket.close();
      this.udpSocket = null;
    }

    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
      this.httpServer = null;
    }

    this.peers.clear();
  }

  /** Get all discovered peers (excluding self, pruning stale) */
  getDiscoveredPeers(): DiscoveredPeer[] {
    const now = Date.now();
    const staleThreshold = ANNOUNCE_INTERVAL_MS * 3;

    // Prune stale peers
    for (const [id, peer] of this.peers) {
      if (now - peer.lastSeen > staleThreshold) {
        this.peers.delete(id);
      }
    }

    return [...this.peers.values()].filter((p) => p.instanceId !== this.instanceId);
  }

  /** Download a skill from a peer */
  async downloadSkill(peer: DiscoveredPeer, skillName: string): Promise<Buffer> {
    const url = `http://${peer.hostname}:${peer.httpPort}/skills/${encodeURIComponent(skillName)}/download`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download skill: ${response.status} ${response.statusText}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  // --- Private methods ---

  private getSharedSkills(): DiscoveredSkill[] {
    const workspaceDir = getWorkspaceDir();
    const skills = listSkills(getSkillsDir(workspaceDir));

    return skills
      .filter((s) => s.manifest?.shared)
      .map((s) => ({
        id: s.manifest!.id,
        name: s.name,
        version: s.manifest!.version,
        description: s.manifest!.description,
        tags: s.manifest!.tags,
        author: s.manifest!.author
      }));
  }

  private buildAnnounceMessage(): AnnounceMessage {
    return {
      type: 'announce',
      instanceId: this.instanceId,
      hostname: getLocalIp(),
      httpPort: this.httpPort,
      skills: this.getSharedSkills()
    };
  }

  private startUdpListener(): void {
    this.udpSocket = createSocket({ type: 'udp4', reuseAddr: true });

    this.udpSocket.on('message', (msg) => {
      try {
        const data = JSON.parse(msg.toString()) as AnnounceMessage;
        if (data.type !== 'announce' || !data.instanceId) return;

        this.peers.set(data.instanceId, {
          instanceId: data.instanceId,
          hostname: data.hostname,
          httpPort: data.httpPort,
          skills: data.skills,
          lastSeen: Date.now()
        });
      } catch {
        // Ignore malformed messages
      }
    });

    this.udpSocket.on('error', (err) => {
      console.error('UDP discovery error:', err.message);
    });

    this.udpSocket.bind(MULTICAST_PORT, () => {
      try {
        this.udpSocket!.addMembership(MULTICAST_ADDR);
        this.udpSocket!.setMulticastTTL(1); // LAN only
      } catch (err) {
        console.error('Failed to join multicast group:', err);
      }
    });
  }

  private startAnnouncing(): void {
    const announce = () => {
      if (!this.udpSocket || !this.running) return;

      const msg = Buffer.from(JSON.stringify(this.buildAnnounceMessage()));
      this.udpSocket.send(msg, 0, msg.length, MULTICAST_PORT, MULTICAST_ADDR, (err) => {
        if (err) console.error('Announce error:', err.message);
      });
    };

    // Announce immediately, then periodically
    announce();
    this.announceTimer = setInterval(announce, ANNOUNCE_INTERVAL_MS);
  }

  private async startHttpServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer = createServer((req, res) => this.handleHttpRequest(req, res));

      this.httpServer.on('error', reject);

      // Listen on random port
      this.httpServer.listen(0, () => {
        const addr = this.httpServer!.address();
        if (typeof addr === 'object' && addr) {
          this.httpPort = addr.port;
        }
        resolve();
      });
    });
  }

  private handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    // GET /skills — list shared skills
    if (url.pathname === '/skills' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.getSharedSkills()));
      return;
    }

    // GET /skills/:name/download — download skill as zip
    const downloadMatch = url.pathname.match(/^\/skills\/([^/]+)\/download$/);
    if (downloadMatch && req.method === 'GET') {
      const skillName = decodeURIComponent(downloadMatch[1]);
      this.handleSkillDownload(skillName, res);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  }

  private handleSkillDownload(skillName: string, res: ServerResponse): void {
    try {
      const workspaceDir = getWorkspaceDir();
      const skillsDir = getSkillsDir(workspaceDir);
      const skills = listSkills(skillsDir);

      const skill = skills.find((s) => s.name === skillName && s.manifest?.shared);
      if (!skill) {
        res.writeHead(404);
        res.end('Skill not found or not shared');
        return;
      }

      const skillDir = `${skillsDir}/${skillName}`;
      const { buffer, filename } = exportSkill(skillDir);

      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length
      });
      res.end(buffer);
    } catch (err) {
      res.writeHead(500);
      res.end(String(err));
    }
  }
}

/** Get local non-loopback IPv4 address */
function getLocalIp(): string {
  const ifaces = networkInterfaces();
  for (const name in ifaces) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return hostname();
}

// Singleton instance
export const skillDiscovery = new SkillDiscoveryService();
