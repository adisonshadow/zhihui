import { describe, expect, it } from 'vitest';
import { SegmentType } from '@/constants/Audiobook';
import type { AudiobookOutlineVoiceSamples } from '@/novelDesign/storage/novelWorkspaceStorage';
import {
  outlineStyleInstructionHintForSegment,
  pickOutlineStyleInstructionForSegment,
  pickOutlineStyleInstructionForTarget,
} from './outlineVoiceStyleInstruction';

describe('outlineVoiceStyleInstruction', () => {
  const binding: AudiobookOutlineVoiceSamples = {
    narratorStyleInstruction: '温柔知性的女性旁白',
    byCharacterStyleInstruction: { liming: '青年男声偏低沉' },
    byCharacterId: { liming: 'PresetVoice/liming.wav' },
  };

  it('按 target 读取旁白/角色风格指令', () => {
    expect(pickOutlineStyleInstructionForTarget(binding, { kind: 'narrator' })).toBe('温柔知性的女性旁白');
    expect(
      pickOutlineStyleInstructionForTarget(binding, { kind: 'character', characterId: 'liming' }),
    ).toBe('青年男声偏低沉');
  });

  it('未绑 wav 时片段 Tag 显示蓝点提示', () => {
    const hint = outlineStyleInstructionHintForSegment(
      {
        type: SegmentType.Narration,
        text: '测试',
        voice: { tone: '平' },
      },
      { narratorStyleInstruction: '知性旁白' },
    );
    expect(hint.show).toBe(true);
    expect(hint.text).toBe('知性旁白');
  });

  it('已绑 wav 时不显示蓝点', () => {
    const hint = outlineStyleInstructionHintForSegment(
      {
        type: SegmentType.Dialogue,
        speakerId: 'liming',
        text: '你好',
        voice: { characterId: 'liming', tone: '平' },
      },
      binding,
    );
    expect(hint.show).toBe(false);
  });

  it('对白片段读取角色风格指令', () => {
    expect(
      pickOutlineStyleInstructionForSegment(
        {
          type: SegmentType.Dialogue,
          speakerId: 'liming',
          text: '你好',
          voice: { characterId: 'liming', tone: '平' },
        },
        binding,
      ),
    ).toBe('青年男声偏低沉');
  });
});
