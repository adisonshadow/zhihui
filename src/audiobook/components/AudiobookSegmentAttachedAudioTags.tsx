import { Tag, Tooltip } from 'antd';
import type { SegmentAttachedAudio } from '@/constants/Audiobook';
import { attachedAudioLabel, makeAttachedAudioKey } from '@/audiobook/utils/audiobookAttachedAudio';
import './AudiobookSegmentAttachedAudioTags.css';

export interface AudiobookSegmentAttachedAudioTagsProps {
  segmentIndex: number;
  items: SegmentAttachedAudio[];
  activeAttachedAudioKeys?: string[];
  onEdit: (item: SegmentAttachedAudio) => void;
}

export function AudiobookSegmentAttachedAudioTags({
  segmentIndex,
  items,
  activeAttachedAudioKeys = [],
  onEdit,
}: AudiobookSegmentAttachedAudioTagsProps) {
  if (!items.length) return null;

  return (
    <div className="audiobook-attached-audio-tags">
      {items.map((item) => {
        const key = makeAttachedAudioKey(segmentIndex, item.id);
        const playing = activeAttachedAudioKeys.includes(key);
        const missingFile = !item.audioSrc?.trim();
        const color = item.kind === 'backgroundMusic' ? 'gold' : 'lime';
        const label = attachedAudioLabel(item);

        return (
          <Tooltip key={key} title={label}>
            <Tag
              className={`audiobook-attached-audio-tag${playing ? ' audiobook-attached-audio-tag--playing' : ''}`}
              variant={missingFile ? 'outlined' : 'filled'}
              color={missingFile ? 'error' : color}
              onClick={() => onEdit(item)}
              style={{ maxWidth: 80 }}
            >
              {label}
            </Tag>
          </Tooltip>
        );
      })}
    </div>
  );
}
