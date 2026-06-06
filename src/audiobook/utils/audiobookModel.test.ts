import { describe, expect, it } from 'vitest';
import { SegmentType } from '@/constants/Audiobook';
import {
  audiobookSegmentOutlineForTool,
  createEmptyEpisodeAudiobook,
  episodeAudiobookHasContent,
  normalizeSegmentInput,
  normalizeSegments,
  parseEpisodeAudiobookJson,
  segmentSummary,
} from './audiobookModel';

describe('audiobookModel', () => {
  it('createEmptyEpisodeAudiobook', () => {
    const ep = createEmptyEpisodeAudiobook({ id: 'ep1', title: '第一集', episode: 1 });
    expect(ep.id).toBe('ep1');
    expect(ep.segments).toEqual([]);
  });

  it('normalizeSegmentInput 兼容 speaker + line', () => {
    const seg = normalizeSegmentInput({
      type: 'dialogue',
      speaker: '林夜',
      line: '你好。',
      tone: '平静',
    });
    expect(seg).not.toBeNull();
    expect(seg?.type).toBe(SegmentType.Dialogue);
    if (seg?.type === SegmentType.Dialogue) {
      expect(seg.text).toBe('你好。');
      expect(seg.speakerId).toBe('林夜');
    }
  });

  it('parseEpisodeAudiobookJson 往返', () => {
    const raw = JSON.stringify({
      id: 'ep1',
      segments: [
        {
          type: 'narration',
          text: '夜色降临。',
          voice: { characterId: 'narrator', tone: '平缓' },
        },
      ],
    });
    const parsed = parseEpisodeAudiobookJson(raw);
    expect(parsed?.segments).toHaveLength(1);
    expect(episodeAudiobookHasContent(parsed)).toBe(true);
    expect(segmentSummary(parsed!.segments).total).toBe(1);
  });

  it('normalizeSegments 过滤无效项', () => {
    const list = normalizeSegments([
      { type: 'dialogue', text: 'a', speakerId: 'x', voice: { characterId: 'x', tone: 't' } },
      { type: 'unknown' },
      null,
    ]);
    expect(list).toHaveLength(1);
  });

  it('audiobookSegmentOutlineForTool 含 segment_index 与对白预览', () => {
    const segs = normalizeSegments([
      {
        type: 'dialogue',
        text: '你好世界',
        speakerId: '沈管家',
        voice: { characterId: '沈管家', tone: '粗', personaTag: '中老年男性' },
      },
    ]);
    const o = audiobookSegmentOutlineForTool(segs);
    expect(o[0]?.segment_index).toBe(0);
    expect(o[0]?.speaker_id).toBe('沈管家');
    expect(o[0]?.persona_tag).toBe('中老年男性');
  });
});
