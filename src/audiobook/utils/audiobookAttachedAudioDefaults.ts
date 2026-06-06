import type { AttachedAudioKind } from '@/constants/Audiobook';

export const ATTACHED_AUDIO_DEFAULT_DELAY_SEC = 1;
export const ATTACHED_AUDIO_DEFAULT_VOLUME_SFX = 0.8;
export const ATTACHED_AUDIO_DEFAULT_VOLUME_BGM = 0.35;

export function defaultAttachedAudioVolume(kind: AttachedAudioKind): number {
  return kind === 'backgroundMusic' ? ATTACHED_AUDIO_DEFAULT_VOLUME_BGM : ATTACHED_AUDIO_DEFAULT_VOLUME_SFX;
}
