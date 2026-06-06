/**
 * MiMo VoiceDesign：解析 voice_design capability 引擎并合成试听
 * @deprecated 请使用 voiceDesignSynthesize.ts
 */
import type { AIModelConfig } from '@/types/settings';
import {
  findMimoVoiceDesignEngine,
  findVoiceDesignEngines,
} from '@/components/tts/voiceCapabilityInference';
import {
  synthesizeMimoVoiceDesignPreview,
  synthesizeVoiceDesignPreview,
} from '@/novelDesign/utils/voiceDesignSynthesize';

export { findVoiceDesignEngines, findMimoVoiceDesignEngine, synthesizeMimoVoiceDesignPreview, synthesizeVoiceDesignPreview };

/** @deprecated 使用 findMimoVoiceDesignEngine */
export function findMimoTtsEngine(models: AIModelConfig[] | undefined) {
  return findMimoVoiceDesignEngine(models);
}
