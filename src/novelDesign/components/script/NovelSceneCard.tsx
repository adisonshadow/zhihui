import { Input, Select, Space, Typography, InputNumber } from 'antd';
import type { CameraMovement, Character, Scene, ShotType } from '@/constants/Script';
import { ensurePrimaryShot, getPrimaryShot } from '@/novelDesign/utils/novelScriptModel';
import { NovelSceneStagingFields } from './NovelSceneStagingFields';
import { NovelShotDialogueList } from './NovelShotDialogueList';
import { NovelShotSoundPanel } from './NovelShotSoundPanel';

const { Text } = Typography;

const SHOT_TYPE_OPTIONS: { value: ShotType; label: string }[] = [
  { value: 'MEDIUM', label: '中景' },
  { value: 'CLOSE_UP', label: '近景' },
  { value: 'EXTREME_CLOSE_UP', label: '特写' },
  { value: 'LONG', label: '远景' },
  { value: 'EXTREME_LONG', label: '大远景' },
  { value: 'OVER_SHOULDER', label: '过肩' },
  { value: 'POV', label: '主观' },
  { value: 'TWO_SHOT', label: '双人' },
  { value: 'GROUP', label: '群像' },
];

const CAMERA_OPTIONS: { value: CameraMovement; label: string }[] = [
  { value: 'STATIC', label: '固定' },
  { value: 'PAN', label: '摇镜' },
  { value: 'TILT', label: '俯仰' },
  { value: 'ZOOM_IN', label: '推' },
  { value: 'ZOOM_OUT', label: '拉' },
  { value: 'DOLLY_IN', label: '移近' },
  { value: 'TRACK', label: '跟拍' },
  { value: 'HANDHELD', label: '手持' },
];

interface NovelSceneCardProps {
  scene: Scene;
  characters: Character[];
  onChange: (scene: Scene) => void;
}

export function NovelSceneCard({ scene, characters, onChange }: NovelSceneCardProps) {
  const normalized = ensurePrimaryShot(scene);
  const shot = getPrimaryShot(normalized);

  const patchScene = (patch: Partial<Scene>) => {
    onChange(ensurePrimaryShot({ ...normalized, ...patch }));
  };

  const patchShot = (patch: Partial<typeof shot>) => {
    const shots = [...normalized.shots];
    shots[0] = { ...shot, ...patch };
    onChange({ ...normalized, shots });
  };

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size="small">
      <Space.Compact style={{ width: '100%' }}>
        <Input
          readOnly
          tabIndex={-1}
          value="场标"
          style={{
            width: 56,
            textAlign: 'center',
            cursor: 'default',
            color: 'var(--ant-color-text-secondary)',
            background: 'var(--ant-color-fill-tertiary)',
          }}
        />
        <Input
          style={{ width: 'calc(100% - 56px)' }}
          placeholder="INT. 地点 - 时间"
          value={normalized.heading}
          onChange={(e) => patchScene({ heading: e.target.value })}
        />
      </Space.Compact>
      <Space.Compact style={{ width: '100%' }}>
        <Input
          readOnly
          tabIndex={-1}
          value="地点"
          style={{
            width: 56,
            textAlign: 'center',
            cursor: 'default',
            color: 'var(--ant-color-text-secondary)',
            background: 'var(--ant-color-fill-tertiary)',
          }}
        />
        <Input
          style={{ width: 'calc(100% - 56px)' }}
          placeholder="具体地点"
          value={normalized.location}
          onChange={(e) => patchScene({ location: e.target.value })}
        />
      </Space.Compact>
      <Space wrap>
        <Select
          style={{ width: 100 }}
          value={normalized.locationType}
          onChange={(v) => patchScene({ locationType: v })}
          options={[
            { value: 'INT', label: '内景' },
            { value: 'EXT', label: '外景' },
            { value: 'INT/EXT', label: '内外' },
          ]}
        />
        <Input
          style={{ width: 120 }}
          placeholder="时间"
          value={normalized.timeOfDay}
          onChange={(e) => patchScene({ timeOfDay: e.target.value })}
        />
        <Select
          style={{ width: 100 }}
          placeholder="景别"
          value={shot.shotType}
          onChange={(v) => patchShot({ shotType: v })}
          options={SHOT_TYPE_OPTIONS}
        />
        <Select
          style={{ width: 100 }}
          placeholder="运镜"
          value={shot.cameraMovement ?? 'STATIC'}
          onChange={(v) => patchShot({ cameraMovement: v })}
          options={CAMERA_OPTIONS}
        />
        <Space.Compact>
          <InputNumber
            min={1}
            max={600}
            placeholder="时长"
            value={shot.durationEstimate}
            onChange={(v) => patchShot({ durationEstimate: v ?? undefined })}
          />
          <Input
            readOnly
            tabIndex={-1}
            value="秒"
            style={{
              width: 36,
              textAlign: 'center',
              cursor: 'default',
              color: 'var(--ant-color-text-secondary)',
              background: 'var(--ant-color-fill-tertiary)',
            }}
          />
        </Space.Compact>
      </Space>
      <Input.TextArea
        rows={2}
        placeholder="本场概要"
        value={normalized.summary ?? ''}
        onChange={(e) => patchScene({ summary: e.target.value || undefined })}
      />
      <NovelSceneStagingFields
        staging={normalized.staging}
        onChange={(staging) => patchScene({ staging })}
      />
      <Input.TextArea
        rows={4}
        placeholder="画面与动作描述（人物走位、表演、镜头内动态）"
        value={shot.description ?? ''}
        onChange={(e) => patchShot({ description: e.target.value || undefined })}
      />
      <NovelShotDialogueList
        dialogues={shot.dialogues ?? []}
        characters={characters}
        onChange={(dialogues) => patchShot({ dialogues })}
      />
      <NovelShotSoundPanel sound={shot.sound} onChange={(sound) => patchShot({ sound })} />
      <Text type="secondary" style={{ fontSize: 11 }}>
        短剧模式：每场对应一个镜头；场景要素与声音写在场上，对白与动作写在主镜头内。
      </Text>
    </Space>
  );
}
