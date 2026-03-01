/**
 * 状态设置面板：元件/标签精灵的状态关键帧与 tag 选择
 * 第一行：状态关键帧 + KeyframeButton；第二行：与元件预览相同的多组 tag 选择
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Typography, Radio, App } from 'antd';
import { KeyframeButton } from './KeyframeButton';
import { collectGroupsWithTags, collectTaggedSpritesForPreview } from '@/utils/groupComponentTags';
import { parseStateKeyframes, getEffectiveKeyframe, type StateKeyframe } from '@/utils/stateKeyframes';
import type { GroupComponentItem } from '@/types/groupComponent';
import type { SpriteSheetItem } from '@/components/character/SpriteSheetPanel';

const { Text } = Typography;

const KF_TOLERANCE = 0.02;

export type { StateKeyframe };

export interface StateSettingsPanelProps {
  projectDir: string;
  blockId: string;
  blockStartTime: number;
  blockEndTime: number;
  currentTime: number;
  stateKeyframes: StateKeyframe[];
  characterId: string;
  group: GroupComponentItem;
  spriteSheets: SpriteSheetItem[];
  componentGroups: GroupComponentItem[];
  allCharactersData?: { characterId: string; spriteSheets: SpriteSheetItem[] }[];
  onUpdate: () => void;
  onJumpToTime?: (t: number) => void;
}

/** 当前时间是否与某状态关键帧重叠 */
function hasStateKeyframeAtTime(keyframes: StateKeyframe[], time: number): boolean {
  return keyframes.some((k) => Math.abs(k.time - time) < KF_TOLERANCE);
}

export function StateSettingsPanel({
  projectDir,
  blockId,
  blockStartTime,
  blockEndTime,
  currentTime,
  stateKeyframes,
  characterId,
  group,
  spriteSheets,
  componentGroups,
  allCharactersData,
  onUpdate,
  onJumpToTime,
}: StateSettingsPanelProps) {
  const { message } = App.useApp();
  const [addingKf, setAddingKf] = useState(false);

  const timeOnBlock = currentTime >= blockStartTime && currentTime <= blockEndTime;
  const sortedKfs = [...stateKeyframes].sort((a, b) => a.time - b.time);
  const effectiveKf = getEffectiveKeyframe(sortedKfs, currentTime);
  const hasKfAtCurrent = hasStateKeyframeAtTime(sortedKfs, currentTime);
  const prevKf = sortedKfs.filter((k) => k.time < currentTime - KF_TOLERANCE).pop() ?? null;
  const nextKf = sortedKfs.find((k) => k.time > currentTime + KF_TOLERANCE) ?? null;

  const groupsWithTags = useMemo(
    () => collectGroupsWithTags(group, componentGroups),
    [group, componentGroups]
  );
  const taggedSpritesWithTags = useMemo(
    () =>
      collectTaggedSpritesForPreview(
        group,
        componentGroups,
        spriteSheets,
        characterId,
        allCharactersData
      ),
    [group, componentGroups, spriteSheets, characterId, allCharactersData]
  );

  const [selectedTagsByGroupId, setSelectedTagsByGroupId] = useState<{ [key: string]: string }>({});
  const [selectedTagsBySpriteItemId, setSelectedTagsBySpriteItemId] = useState<{ [key: string]: { [key: string]: string } }>({});

  const effectiveKfTime = effectiveKf?.time;
  const effectiveKfGroupTags = effectiveKf?.selectedTagsByGroupId
    ? JSON.stringify(effectiveKf.selectedTagsByGroupId)
    : '';
  const effectiveKfSpriteTags = effectiveKf?.selectedTagsBySpriteItemId
    ? JSON.stringify(effectiveKf.selectedTagsBySpriteItemId)
    : '';

  useEffect(() => {
    const nextGroup: { [key: string]: string } = {};
    for (const { group: g, tags } of groupsWithTags) {
      const fromKf = effectiveKf?.selectedTagsByGroupId?.[g.id];
      nextGroup[g.id] = fromKf ?? (tags[0] ?? '');
    }
    setSelectedTagsByGroupId(nextGroup);
    const nextSprite: { [key: string]: { [key: string]: string } } = {};
    for (const { itemId, properties } of taggedSpritesWithTags) {
      nextSprite[itemId] = {};
      const fromKf = effectiveKf?.selectedTagsBySpriteItemId?.[itemId];
      for (const { propertyName } of properties) {
        nextSprite[itemId][propertyName] = fromKf?.[propertyName] ?? '';
      }
    }
    setSelectedTagsBySpriteItemId(nextSprite);
  }, [effectiveKfTime, effectiveKfGroupTags, effectiveKfSpriteTags, groupsWithTags, taggedSpritesWithTags, effectiveKf]);

  const saveStateKeyframes = useCallback(
    async (kfs: StateKeyframe[]) => {
      if (!window.yiman?.project?.updateTimelineBlock) return;
      const json = JSON.stringify(kfs);
      const res = await window.yiman.project.updateTimelineBlock(projectDir, blockId, { state_keyframes: json });
      if (res?.ok) onUpdate();
      else message.error(res?.error || '保存失败');
    },
    [projectDir, blockId, onUpdate, message]
  );

  const handleAddKeyframe = useCallback(async () => {
    if (!timeOnBlock) return;
    setAddingKf(true);
    try {
      const existing = sortedKfs.filter((k) => Math.abs(k.time - currentTime) >= KF_TOLERANCE);
      const newKf: StateKeyframe = {
        time: currentTime,
        selectedTagsByGroupId: { ...selectedTagsByGroupId },
        selectedTagsBySpriteItemId: Object.fromEntries(
          Object.entries(selectedTagsBySpriteItemId).map(([k, v]) => [k, { ...v }])
        ),
      };
      const next = [...existing, newKf].sort((a, b) => a.time - b.time);
      await saveStateKeyframes(next);
    } finally {
      setAddingKf(false);
    }
  }, [timeOnBlock, currentTime, sortedKfs, selectedTagsByGroupId, selectedTagsBySpriteItemId, saveStateKeyframes]);

  const handleDeleteKeyframe = useCallback(async () => {
    if (!hasKfAtCurrent) return;
    const next = sortedKfs.filter((k) => Math.abs(k.time - currentTime) >= KF_TOLERANCE);
    await saveStateKeyframes(next);
  }, [hasKfAtCurrent, currentTime, sortedKfs, saveStateKeyframes]);

  const handleTagChange = useCallback(
    async (groupId: string, tag: string) => {
      const next = { ...selectedTagsByGroupId, [groupId]: tag };
      setSelectedTagsByGroupId(next);
      if (hasKfAtCurrent && effectiveKf) {
        const kfIdx = sortedKfs.findIndex((k) => Math.abs(k.time - currentTime) < KF_TOLERANCE);
        if (kfIdx >= 0) {
          const updated = [...sortedKfs];
          updated[kfIdx] = {
            ...updated[kfIdx]!,
            selectedTagsByGroupId: { ...(updated[kfIdx]!.selectedTagsByGroupId ?? {}), [groupId]: tag },
          };
          await saveStateKeyframes(updated);
        }
      }
    },
    [selectedTagsByGroupId, hasKfAtCurrent, effectiveKf, sortedKfs, currentTime, saveStateKeyframes]
  );

  const handleSpriteTagChange = useCallback(
    async (itemId: string, propertyName: string, value: string) => {
      const prev = selectedTagsBySpriteItemId[itemId] ?? {};
      const next = { ...selectedTagsBySpriteItemId, [itemId]: { ...prev, [propertyName]: value } };
      setSelectedTagsBySpriteItemId(next);
      if (hasKfAtCurrent && effectiveKf) {
        const kfIdx = sortedKfs.findIndex((k) => Math.abs(k.time - currentTime) < KF_TOLERANCE);
        if (kfIdx >= 0) {
          const updated = [...sortedKfs];
          const prevKfSprite = updated[kfIdx]!.selectedTagsBySpriteItemId?.[itemId] ?? {};
          updated[kfIdx] = {
            ...updated[kfIdx]!,
            selectedTagsBySpriteItemId: {
              ...(updated[kfIdx]!.selectedTagsBySpriteItemId ?? {}),
              [itemId]: { ...prevKfSprite, [propertyName]: value },
            },
          };
          await saveStateKeyframes(updated);
        }
      }
    },
    [selectedTagsBySpriteItemId, hasKfAtCurrent, effectiveKf, sortedKfs, currentTime, saveStateKeyframes]
  );

  return (
    <div className="state-settings-panel" style={{ padding: '4px 0' }}>
      {/* 第一行：状态关键帧 + KeyframeButton */}
      <section style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>状态关键帧</Text>
          <KeyframeButton
            disabled={!timeOnBlock}
            hasKeyframe={hasKfAtCurrent}
            hasPrev={!!prevKf}
            hasNext={!!nextKf}
            onToggle={hasKfAtCurrent ? handleDeleteKeyframe : handleAddKeyframe}
            onPrev={() => prevKf && onJumpToTime?.(prevKf.time)}
            onNext={() => nextKf && onJumpToTime?.(nextKf.time)}
            loading={addingKf}
          />
        </div>
      </section>

      {/* 第二行：多组 tag 选择（与元件预览相同） */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {groupsWithTags.map(({ group: g, tags }) =>
          tags.length > 0 ? (
            <div key={g.id}>
              <Text type="secondary" style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>
                {g.name || g.id}
              </Text>
              <Radio.Group
                value={selectedTagsByGroupId[g.id] ?? tags[0]}
                optionType="button"
                buttonStyle="solid"
                size="small"
                onChange={(e) => handleTagChange(g.id, e.target.value)}
                options={tags.map((t) => ({ label: t, value: t }))}
              />
            </div>
          ) : null
        )}
        {taggedSpritesWithTags.map(({ itemId, spriteName, properties }) => (
          <div key={itemId}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>
              {spriteName}
            </Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {properties.map(({ propertyName, tagValues }) => (
                <div key={propertyName}>
                  <Text type="secondary" style={{ fontSize: 11, marginRight: 8 }}>{propertyName}</Text>
                  <Radio.Group
                    value={selectedTagsBySpriteItemId[itemId]?.[propertyName] ?? ''}
                    optionType="button"
                    buttonStyle="solid"
                    size="small"
                    onChange={(e) => handleSpriteTagChange(itemId, propertyName, e.target.value)}
                    options={[{ label: '不限', value: '' }, ...tagValues.map((t) => ({ label: t, value: t }))]}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

