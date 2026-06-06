/**
 * 云端 TTS 音色 id 本地缓存（userData/yiman/remote-voice-id-cache）
 * 键：provider + targetModel + sourceKey；值：voiceId + createdAt
 */
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export type RemoteVoiceIdProvider = 'minimax' | 'qwen3_tts' | 'cosyvoice';

export interface RemoteVoiceIdEntry {
  voiceId: string;
  createdAt: string;
  /** 可选：MiniMax file_id 等中间态 */
  meta?: Record<string, unknown>;
}

type ProviderStore = Record<string, RemoteVoiceIdEntry>;

function cacheRoot(): string {
  const root = path.join(app.getPath('userData'), 'yiman', 'remote-voice-id-cache');
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function storePath(provider: RemoteVoiceIdProvider): string {
  return path.join(cacheRoot(), `${provider}.json`);
}

function readStore(provider: RemoteVoiceIdProvider): ProviderStore {
  const p = storePath(provider);
  if (!fs.existsSync(p)) return {};
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const o = JSON.parse(raw) as ProviderStore;
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

function writeStore(provider: RemoteVoiceIdProvider, store: ProviderStore): void {
  fs.writeFileSync(storePath(provider), JSON.stringify(store, null, 2), 'utf8');
}

export function getRemoteVoiceId(
  provider: RemoteVoiceIdProvider,
  cacheKey: string,
): RemoteVoiceIdEntry | null {
  if (!cacheKey?.trim()) return null;
  const store = readStore(provider);
  return store[cacheKey] ?? null;
}

export function setRemoteVoiceId(
  provider: RemoteVoiceIdProvider,
  cacheKey: string,
  entry: RemoteVoiceIdEntry,
): void {
  if (!cacheKey?.trim() || !entry.voiceId?.trim()) return;
  const store = readStore(provider);
  store[cacheKey] = {
    voiceId: entry.voiceId.trim(),
    createdAt: entry.createdAt || new Date().toISOString(),
    meta: entry.meta,
  };
  writeStore(provider, store);
}

export function invalidateRemoteVoiceId(provider: RemoteVoiceIdProvider, cacheKey: string): void {
  if (!cacheKey?.trim()) return;
  const store = readStore(provider);
  if (cacheKey in store) {
    delete store[cacheKey];
    writeStore(provider, store);
  }
}

export function invalidateRemoteVoiceIdProvider(provider: RemoteVoiceIdProvider): void {
  writeStore(provider, {});
}
