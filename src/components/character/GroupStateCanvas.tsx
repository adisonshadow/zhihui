/**
 * 元件组状态画布：支持拖拽移动、四角缩放、旋转，参考设计器画布
 */
import React, { useRef, useCallback, useState, useEffect } from 'react';
import { Button, Dropdown, Modal, Input, Checkbox, Card } from 'antd';
import { PlusOutlined, PictureOutlined, BgColorsOutlined, AppstoreOutlined, DeleteOutlined, SwapOutlined, VerticalAlignTopOutlined, VerticalAlignBottomOutlined } from '@ant-design/icons';
import { ScissorOutlined, BorderOutlined } from '@ant-design/icons';
import { MattingSettingsPanel } from './MattingSettingsPanel';
import { CropPanel } from './CropPanel';
import { TransformOverlay } from '@/components/common/TransformOverlay';
import type { GroupCanvasItem, GroupComponentItem } from '@/types/groupComponent';
import { GROUP_CANVAS_SIZE } from '@/types/groupComponent';
import type { SpriteSheetItem } from './SpriteSheetPanel';
import { GroupPreview } from './GroupPreview';
import { CHECKERBOARD_BACKGROUND } from '@/styles/checkerboardBackground';
/** 设计画板四周留白，避免 resize/旋转把手被裁剪 */
const DESIGN_PADDING = 20;
/** FIT 时画布内边距（px），相当于 contain 的留白 */
const FIT_MARGIN = 10;

interface GroupStateCanvasProps {
  items: GroupCanvasItem[];
  selectedItemId: string | null;
  onSelectItem: (id: string | null) => void;
  onItemUpdate: (itemId: string, patch: Partial<GroupCanvasItem>) => void;
  onItemDelete: (itemId: string) => void;
  onItemReorder: (itemId: string, direction: 'top' | 'bottom') => void;
  onAddImage: () => void;
  onAddImageFromAssets?: () => void;
  onAddSprite: (spriteId: string, characterId?: string) => void;
  onAddGroup: (groupId: string, characterId?: string) => void;
  spriteSheets: SpriteSheetItem[];
  componentGroups: GroupComponentItem[];
  currentGroupId: string;
  projectDir: string;
  characterId: string;
  getAssetDataUrl: (projectDir: string, path: string) => Promise<string | null>;
  saveAssetFromBase64?: (projectDir: string, base64Data: string, ext?: string, type?: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
  /** 单图抠图并保存到素材库，用于元件组中图片的抠图替换 */
  matteImageAndSave?: (
    projectDir: string,
    path: string,
    options?: { mattingModel?: string; downsampleRatio?: number }
  ) => Promise<{ ok: boolean; path?: string; error?: string }>;
  /** 从人物元件组打开时，可获取全部人物的精灵图/元件组以支持「仅查看本人物的」筛选 */
  getAllCharactersData?: () => Promise<
    { characterId: string; characterName?: string; spriteSheets: SpriteSheetItem[]; componentGroups: GroupComponentItem[] }[]
  >;
}

export function GroupStateCanvas({
  items,
  selectedItemId,
  onSelectItem,
  onItemUpdate,
  onItemDelete,
  onItemReorder,
  onAddImage,
  onAddImageFromAssets,
  onAddSprite,
  onAddGroup,
  spriteSheets,
  componentGroups,
  currentGroupId,
  projectDir,
  characterId,
  getAssetDataUrl,
  saveAssetFromBase64,
  matteImageAndSave,
  getAllCharactersData,
}: GroupStateCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  /** 记录 pointerdown 是否点在画布背景上；因 setPointerCapture 会使 click 的 target 变为 container，需据此区分「点背景取消选中」与「点元素选中」 */
  const pointerDownOnBackgroundRef = useRef(false);
  const [displayScale, setDisplayScale] = useState(1);
  const [mattingPanelOpen, setMattingPanelOpen] = useState(false);
  const [cropPanelOpen, setCropPanelOpen] = useState(false);
  const [spritePickerOpen, setSpritePickerOpen] = useState(false);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [allCharactersData, setAllCharactersData] = useState<
    { characterId: string; spriteSheets: SpriteSheetItem[]; componentGroups: GroupComponentItem[] }[]
  >([]);
  const [dragging, setDragging] = useState<
    | { type: 'move'; itemId: string; startX: number; startY: number; initPos_x: number; initPos_y: number }
    | null
  >(null);

  const selectedItem = items.find((it) => it.id === selectedItemId) ?? null;

  React.useEffect(() => {
    setMattingPanelOpen(false);
    setCropPanelOpen(false);
  }, [selectedItemId]);

  /** 当画板有跨人物元件时，加载全部人物数据以正确渲染 */
  const hasCrossCharacterItems = items.some(
    (it) => (it.type === 'sprite' || it.type === 'group') && it.characterId !== characterId
  );
  React.useEffect(() => {
    if (!hasCrossCharacterItems || !getAllCharactersData) return;
    getAllCharactersData().then(setAllCharactersData);
  }, [hasCrossCharacterItems, getAllCharactersData]);

  React.useEffect(() => {
    const measure = () => {
      const el = wrapperRef.current;
      if (!el) return;
      const { width, height } = el.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const innerW = Math.max(1, width - 2 * DESIGN_PADDING);
      const innerH = Math.max(1, height - 2 * DESIGN_PADDING);
      const scale = Math.min(1, innerW / GROUP_CANVAS_SIZE, innerH / GROUP_CANVAS_SIZE);
      setDisplayScale(Math.max(0.1, scale));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, []);

  const getItemPos = (it: GroupCanvasItem) => ({
    pos_x: it.pos_x ?? 0.5,
    pos_y: it.pos_y ?? 0.5,
    scale_x: it.scale_x ?? 0.2,
    scale_y: it.scale_y ?? 0.2,
    rotation: it.rotation ?? 0,
  });

  const handlePointerDownItem = useCallback(
    (e: React.PointerEvent, item: GroupCanvasItem) => {
      e.preventDefault();
      e.stopPropagation();
      pointerDownOnBackgroundRef.current = false;
      onSelectItem(item.id);
      const { pos_x, pos_y } = getItemPos(item);
      setDragging({ type: 'move', itemId: item.id, startX: e.clientX, startY: e.clientY, initPos_x: pos_x, initPos_y: pos_y });
      // 使用 container 统一 capture，避免 pointer 移出元素后丢失事件（不用浏览器原生 drag）
      containerRef.current?.setPointerCapture?.(e.pointerId);
    },
    [onSelectItem]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging || dragging.type !== 'move' || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dx = (e.clientX - dragging.startX) / Math.max(1, rect.width);
      const dy = (e.clientY - dragging.startY) / Math.max(1, rect.height);
      const newX = Math.max(0.01, Math.min(0.99, dragging.initPos_x + dx));
      const newY = Math.max(0.01, Math.min(0.99, dragging.initPos_y + dy));
      onItemUpdate(dragging.itemId, { pos_x: newX, pos_y: newY });
      setDragging({ ...dragging, startX: e.clientX, startY: e.clientY, initPos_x: newX, initPos_y: newY });
    },
    [dragging, onItemUpdate]
  );

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  const addMenuItems: { key: string; label: string; icon: React.ReactNode; onClick: () => void }[] = [
    { key: 'img', label: '本机图片', icon: <PictureOutlined />, onClick: onAddImage },
    ...(onAddImageFromAssets ? [{ key: 'img-assets', label: '素材库中的图片', icon: <PictureOutlined />, onClick: onAddImageFromAssets }] : []),
    { key: 'group', label: '元件组', icon: <AppstoreOutlined />, onClick: () => setGroupPickerOpen(true) },
    { key: 'sprite', label: '精灵图', icon: <BgColorsOutlined />, onClick: () => setSpritePickerOpen(true) },
  ];

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <Dropdown menu={{ items: addMenuItems }} trigger={['click']} placement="bottomLeft">
          <Button icon={<PlusOutlined />} />
        </Dropdown>
        {selectedItem && (
          <>
            <Button danger icon={<DeleteOutlined />} onClick={() => onItemDelete(selectedItem.id)} />
            <Button icon={<SwapOutlined />} onClick={() => onItemUpdate(selectedItem.id, { flip_x: !selectedItem.flip_x })} />

            <Button icon={<VerticalAlignTopOutlined />} onClick={() => onItemReorder(selectedItem.id, 'top')} />
            <Button icon={<VerticalAlignBottomOutlined />} onClick={() => onItemReorder(selectedItem.id, 'bottom')} />
            {selectedItem.type === 'image' &&
              selectedItem.path &&
              (matteImageAndSave || saveAssetFromBase64) && (
                <Button
                  icon={<ScissorOutlined />}
                  onClick={() => setMattingPanelOpen(true)}
                >
                  抠图
                </Button>
              )}
            {selectedItem.type === 'image' &&
              selectedItem.path &&
              saveAssetFromBase64 && (
                <Button
                  icon={<BorderOutlined />}
                  onClick={() => setCropPanelOpen(true)}
                >
                  裁剪
                </Button>
              )}
            <Button
              onClick={() => {
                if (!selectedItem) return;
                const { scale_x, scale_y } = getItemPos(selectedItem);
                const maxLen = (GROUP_CANVAS_SIZE - FIT_MARGIN) / GROUP_CANVAS_SIZE;
                const isUniform = selectedItem.type === 'sprite' || selectedItem.type === 'group';
                let newScaleX: number;
                let newScaleY: number;
                if (isUniform) {
                  newScaleX = newScaleY = maxLen;
                } else {
                  const ratio = scale_x / scale_y;
                  if (ratio >= 1) {
                    newScaleX = maxLen;
                    newScaleY = maxLen / ratio;
                  } else {
                    newScaleY = maxLen;
                    newScaleX = maxLen * ratio;
                  }
                }
                onItemUpdate(selectedItem.id, {
                  pos_x: 0.5,
                  pos_y: 0.5,
                  scale_x: Math.max(0.05, newScaleX),
                  scale_y: Math.max(0.05, newScaleY),
                });
              }}
            >
              FIT
            </Button>
          </>
        )}
      </div>
      <div
        ref={wrapperRef}
        style={{
          width: '100%',
          maxWidth: 520,
          aspectRatio: 1,
          minHeight: 200,
          padding: DESIGN_PADDING,
          boxSizing: 'border-box',
          borderRadius: 8,
          overflow: 'hidden',
          position: 'relative',
          ...CHECKERBOARD_BACKGROUND,
        }}
      >
        <div
          ref={containerRef}
          style={{
            position: 'absolute',
            left: DESIGN_PADDING,
            top: DESIGN_PADDING,
            width: GROUP_CANVAS_SIZE,
            height: GROUP_CANVAS_SIZE,
            transform: `scale(${displayScale})`,
            border: '4px dotted rgba(255,255,255,0.35)',
            transformOrigin: 'top left',
            borderRadius: 2,
            overflow: 'hidden',
            touchAction: dragging ? 'none' : undefined,
            userSelect: dragging ? 'none' : undefined,
            cursor: dragging?.type === 'move' ? 'grabbing' : undefined,
          }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) pointerDownOnBackgroundRef.current = true;
          }}
          onClick={() => {
            if (pointerDownOnBackgroundRef.current) onSelectItem(null);
            pointerDownOnBackgroundRef.current = false;
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
        {/* 按面积降序渲染，使小图在上层，重叠时可点击选中小图 */}
        {[...items]
          .sort((a, b) => {
            const sa = (a.scale_x ?? 0.2) * (a.scale_y ?? 0.2);
            const sb = (b.scale_x ?? 0.2) * (b.scale_y ?? 0.2);
            return sb - sa;
          })
          .map((item) => (
          <CanvasItemBlock
            key={item.type === 'image' ? `${item.id}:${item.path}` : item.id}
            item={item}
            designSize={GROUP_CANVAS_SIZE}
            isSelected={selectedItemId === item.id}
            isDragging={dragging?.type === 'move' && dragging.itemId === item.id}
            onPointerDown={handlePointerDownItem}
            projectDir={projectDir}
            spriteSheets={spriteSheets}
            componentGroups={componentGroups}
            allCharactersData={allCharactersData}
            characterId={characterId}
            getAssetDataUrl={getAssetDataUrl}
          />
        ))}
        </div>
        {selectedItem && (
          <TransformOverlay
            designSize={GROUP_CANVAS_SIZE}
            designToScreen={(x, y) => ({
              x: DESIGN_PADDING + x * displayScale,
              y: DESIGN_PADDING + y * displayScale,
            })}
            screenToDesign={(clientX, clientY) => {
              const rect = containerRef.current?.getBoundingClientRect();
              if (!rect) return { x: 0, y: 0 };
              const scale = GROUP_CANVAS_SIZE / Math.max(1, rect.width);
              return {
                x: (clientX - rect.left) * scale,
                y: (clientY - rect.top) * scale,
              };
            }}
            item={{
              ...getItemPos(selectedItem),
              flip_x: selectedItem.flip_x ?? false,
            }}
            onMove={(pos_x, pos_y) => onItemUpdate(selectedItem.id, { pos_x, pos_y })}
            onResize={(data) => onItemUpdate(selectedItem.id, data)}
            onRotate={(rotation) => onItemUpdate(selectedItem.id, { rotation })}
            uniformScale={selectedItem.type === 'sprite' || selectedItem.type === 'group'}
          />
        )}
      </div>

      {mattingPanelOpen &&
        selectedItem &&
        selectedItem.type === 'image' &&
        selectedItem.path &&
        (matteImageAndSave || saveAssetFromBase64) && (
          <MattingSettingsPanel
            open={mattingPanelOpen}
            onClose={() => setMattingPanelOpen(false)}
            itemId={selectedItem.id}
            projectDir={projectDir}
            imagePath={selectedItem.path}
            getAssetDataUrl={getAssetDataUrl}
            saveAssetFromBase64={saveAssetFromBase64 ?? (() => Promise.resolve({ ok: false, error: '未就绪' }))}
            matteImageAndSave={matteImageAndSave ?? (async () => ({ ok: false, error: '未就绪' }))}
            onPathChange={(itemId, path) => onItemUpdate(itemId, { path })}
          />
        )}

      {cropPanelOpen &&
        selectedItem &&
        selectedItem.type === 'image' &&
        selectedItem.path &&
        saveAssetFromBase64 && (
          <CropPanel
            open={cropPanelOpen}
            onClose={() => setCropPanelOpen(false)}
            projectDir={projectDir}
            imagePath={selectedItem.path}
            getAssetDataUrl={getAssetDataUrl}
            saveAssetFromBase64={saveAssetFromBase64}
            onConfirm={(newPath) => onItemUpdate(selectedItem.id, { path: newPath })}
          />
        )}

      <SpriteGroupPickerModal
        open={spritePickerOpen}
        onClose={() => setSpritePickerOpen(false)}
        type="sprite"
        title="选择精灵图"
        characterId={characterId}
        spriteSheets={spriteSheets}
        componentGroups={[]}
        currentExcludeId={null}
        getAllCharactersData={getAllCharactersData}
        projectDir={projectDir}
        getAssetDataUrl={getAssetDataUrl}
        onSelectSprite={(id, charId) => {
          onAddSprite(id, charId);
          setSpritePickerOpen(false);
        }}
      />

      <SpriteGroupPickerModal
        open={groupPickerOpen}
        onClose={() => setGroupPickerOpen(false)}
        type="group"
        title="选择元件组"
        characterId={characterId}
        spriteSheets={spriteSheets}
        componentGroups={componentGroups}
        currentExcludeId={currentGroupId}
        getAllCharactersData={getAllCharactersData}
        projectDir={projectDir}
        getAssetDataUrl={getAssetDataUrl}
        onSelectGroup={(id, charId) => {
          onAddGroup(id, charId);
          setGroupPickerOpen(false);
        }}
      />
    </div>
  );
}

/** 模糊匹配：关键词分词后任意一个匹配即通过 */
function fuzzyMatch(keywords: string[], text: string): boolean {
  if (keywords.length === 0) return true;
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

function SpriteGroupPickerModal({
  open,
  onClose,
  type,
  title,
  characterId,
  spriteSheets,
  componentGroups,
  currentExcludeId,
  getAllCharactersData,
  projectDir,
  getAssetDataUrl,
  onSelectSprite,
  onSelectGroup,
}: {
  open: boolean;
  onClose: () => void;
  type: 'sprite' | 'group';
  title: string;
  characterId: string;
  spriteSheets: SpriteSheetItem[];
  componentGroups: GroupComponentItem[];
  currentExcludeId: string | null;
  getAllCharactersData?: () => Promise<
    { characterId: string; characterName?: string; spriteSheets: SpriteSheetItem[]; componentGroups: GroupComponentItem[] }[]
  >;
  projectDir: string;
  getAssetDataUrl: (projectDir: string, path: string) => Promise<string | null>;
  onSelectSprite?: (id: string, characterId?: string) => void;
  onSelectGroup?: (id: string, characterId?: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [onlyCurrentCharacter, setOnlyCurrentCharacter] = useState(true);
  const [allData, setAllData] = useState<
    { characterId: string; characterName?: string; spriteSheets: SpriteSheetItem[]; componentGroups: GroupComponentItem[] }[]
  >([]);
  const [loading, setLoading] = useState(false);

  const effectiveShowCharacterFilter = !!getAllCharactersData;

  useEffect(() => {
    if (!open) return;
    if (onlyCurrentCharacter || !getAllCharactersData) {
      setAllData([]);
      return;
    }
    setLoading(true);
    getAllCharactersData()
      .then(setAllData)
      .finally(() => setLoading(false));
  }, [open, onlyCurrentCharacter, getAllCharactersData]);

  const keywords = search
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const spriteItems: (SpriteSheetItem & { characterId: string; characterName: string })[] =
    type === 'sprite'
      ? (onlyCurrentCharacter || !getAllCharactersData
          ? spriteSheets.map((s) => ({ ...s, characterId, characterName: '' }))
          : allData.flatMap((c) =>
              c.spriteSheets.map((s) => ({ ...s, characterId: c.characterId, characterName: c.characterName ?? '' }))
            )
        ).filter((s) => fuzzyMatch(keywords, s.name ?? s.id))
      : [];
  const groupItems: (GroupComponentItem & { characterId: string; characterName: string })[] =
    type === 'group'
      ? (onlyCurrentCharacter || !getAllCharactersData
          ? componentGroups
              .filter((g) => g.id !== currentExcludeId)
              .map((g) => ({ ...g, characterId, characterName: '' }))
          : allData.flatMap((c) =>
              c.componentGroups
                .filter((g) => g.id !== currentExcludeId)
                .map((g) => ({ ...g, characterId: c.characterId, characterName: c.characterName ?? '' }))
            )
        ).filter((g) => fuzzyMatch(keywords, g.name ?? g.id))
      : [];

  return (
    <Modal title={title} open={open} onCancel={onClose} footer={null} width={520} destroyOnHidden>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {effectiveShowCharacterFilter && (
          <Checkbox
            checked={onlyCurrentCharacter}
            onChange={(e) => setOnlyCurrentCharacter(e.target.checked)}
          >
            仅查看本人物的{type === 'sprite' ? '精灵图' : '元件组'}
          </Checkbox>
        )}
        <Input.Search
          placeholder="模糊搜索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
        />
        <div
          style={{
            maxHeight: 360,
            overflowY: 'auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
            gap: 12,
          }}
        >
          {loading ? (
            <div style={{ gridColumn: '1 / -1', padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.6)' }}>
              加载中…
            </div>
          ) : type === 'sprite' ? (
            spriteItems.map((s) => (
              <Card
                key={`${s.characterId}-${s.id}`}
                size="small"
                hoverable
                style={{ cursor: 'pointer' }}
                onClick={() => onSelectSprite?.(s.id, (s as SpriteSheetItem & { characterId?: string }).characterId)}
                styles={{ body: { padding: 8 } }}
              >
                <div
                  style={{
                    aspectRatio: 1,
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: 4,
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <SpriteGroupCardThumb
                    projectDir={projectDir}
                    path={s.cover_path || s.image_path}
                    getAssetDataUrl={getAssetDataUrl}
                  />
                </div>
                <div
                  style={{
                    fontSize: 12,
                    marginTop: 6,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.name || s.id}
                </div>
                {s.characterName && (
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{s.characterName}</div>
                )}
              </Card>
            ))
          ) : (
            groupItems.map((g) => (
              <Card
                key={`${g.characterId}-${g.id}`}
                size="small"
                hoverable
                style={{ cursor: 'pointer' }}
                onClick={() => onSelectGroup?.(g.id, (g as GroupComponentItem & { characterId?: string }).characterId)}
                styles={{ body: { padding: 8 } }}
              >
                <div
                  style={{
                    aspectRatio: 1,
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: 4,
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <GroupCardThumb
                    group={g}
                    spriteSheets={
                      onlyCurrentCharacter
                        ? spriteSheets
                        : (allData.find((c) => c.characterId === g.characterId)?.spriteSheets ?? [])
                    }
                    componentGroups={
                      onlyCurrentCharacter ? componentGroups : (allData.find((c) => c.characterId === g.characterId)?.componentGroups ?? [])
                    }
                    projectDir={projectDir}
                    getAssetDataUrl={getAssetDataUrl}
                  />
                </div>
                <div
                  style={{
                    fontSize: 12,
                    marginTop: 6,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {g.name || g.id}
                </div>
                {g.characterName && (
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{g.characterName}</div>
                )}
              </Card>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

function SpriteGroupCardThumb({
  projectDir,
  path,
  getAssetDataUrl,
}: {
  projectDir: string;
  path: string;
  getAssetDataUrl: (projectDir: string, path: string) => Promise<string | null>;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    getAssetDataUrl(projectDir, path).then(setDataUrl);
  }, [projectDir, path, getAssetDataUrl]);
  if (!dataUrl) return <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>加载中</span>;
  return <img src={dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />;
}

function GroupCardThumb({
  group,
  spriteSheets,
  componentGroups,
  projectDir,
  getAssetDataUrl,
}: {
  group: GroupComponentItem;
  spriteSheets: SpriteSheetItem[];
  componentGroups: GroupComponentItem[];
  projectDir: string;
  getAssetDataUrl: (projectDir: string, path: string) => Promise<string | null>;
}) {
  const coverPath = (() => {
    const first = group.states?.[0]?.items?.[0];
    if (!first) return null;
    if (first.type === 'image') return first.path;
    if (first.type === 'sprite') {
      const sp = spriteSheets.find((s) => s.id === first.spriteId);
      return sp?.cover_path || sp?.image_path || null;
    }
    if (first.type === 'group') {
      const nested = componentGroups.find((g) => g.id === first.groupId);
      if (!nested) return null;
      const nestedFirst = nested.states?.[0]?.items?.[0];
      if (!nestedFirst) return null;
      if (nestedFirst.type === 'image') return nestedFirst.path;
      if (nestedFirst.type === 'sprite') {
        const sp = spriteSheets.find((s) => s.id === nestedFirst.spriteId);
        return sp?.cover_path || sp?.image_path || null;
      }
    }
    return null;
  })();
  if (!coverPath) return <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>无封面</span>;
  return (
    <SpriteGroupCardThumb projectDir={projectDir} path={coverPath} getAssetDataUrl={getAssetDataUrl} />
  );
}

function CanvasItemBlock({
  item,
  designSize,
  isSelected,
  isDragging,
  onPointerDown,
  projectDir,
  spriteSheets,
  componentGroups,
  allCharactersData,
  characterId,
  getAssetDataUrl,
}: {
  item: GroupCanvasItem;
  designSize: number;
  isSelected: boolean;
  isDragging?: boolean;
  onPointerDown: (e: React.PointerEvent, item: GroupCanvasItem) => void;
  projectDir: string;
  spriteSheets: SpriteSheetItem[];
  componentGroups: GroupComponentItem[];
  allCharactersData: { characterId: string; spriteSheets: SpriteSheetItem[]; componentGroups: GroupComponentItem[] }[];
  characterId: string;
  getAssetDataUrl: (p: string, path: string) => Promise<string | null>;
}) {
  const { pos_x, pos_y, scale_x, scale_y, rotation } = {
    pos_x: item.pos_x ?? 0.5,
    pos_y: item.pos_y ?? 0.5,
    scale_x: item.scale_x ?? 0.2,
    scale_y: item.scale_y ?? 0.2,
    rotation: item.rotation ?? 0,
  };
  const left = pos_x * designSize - (scale_x * designSize) / 2;
  const top = pos_y * designSize - (scale_y * designSize) / 2;
  const width = scale_x * designSize;
  const height = scale_y * designSize;

  const resolveSpriteSheets = (charId: string) =>
    charId === characterId ? spriteSheets : allCharactersData.find((c) => c.characterId === charId)?.spriteSheets ?? [];
  const resolveComponentGroups = (charId: string) =>
    charId === characterId ? componentGroups : allCharactersData.find((c) => c.characterId === charId)?.componentGroups ?? [];

  let content: React.ReactNode;
  if (item.type === 'image') {
    content = <ItemImage projectDir={projectDir} path={item.path} getAssetDataUrl={getAssetDataUrl} />;
  } else if (item.type === 'sprite') {
    const sheets = resolveSpriteSheets(item.characterId);
    const sp = sheets.find((s) => s.id === item.spriteId);
    const path = sp?.cover_path || sp?.image_path;
    content = path ? <ItemImage projectDir={projectDir} path={path} getAssetDataUrl={getAssetDataUrl} /> : <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>精灵</div>;
  } else {
    const groups = resolveComponentGroups(item.characterId);
    const g = groups.find((c) => c.id === item.groupId);
    content = g ? (
      <GroupPreview
        projectDir={projectDir}
        characterId={item.characterId}
        group={g}
        tags={[]}
        spriteSheets={resolveSpriteSheets(item.characterId)}
        componentGroups={resolveComponentGroups(item.characterId)}
        getAssetDataUrl={getAssetDataUrl}
        size={Math.min(width, height)}
        showCheckerboard={false}
      />
    ) : (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>元件组</div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        transform: `rotate(${rotation}deg)${item.flip_x ? ' scaleX(-1)' : ''}${isDragging ? ' scale(1.02)' : ''}`,
        cursor: isDragging ? 'grabbing' : 'grab',
        border: isSelected ? 'none' : '1px solid rgba(255,255,255,0.3)',
        boxSizing: 'border-box',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.4)' : undefined,
        transition: isDragging ? 'none' : 'box-shadow 0.15s ease',
      }}
      onPointerDown={(e) => onPointerDown(e, item)}
    >
      {content}
    </div>
  );
}

function ItemImage({ projectDir, path, getAssetDataUrl }: { projectDir: string; path: string; getAssetDataUrl: (p: string, path: string) => Promise<string | null> }) {
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    getAssetDataUrl(projectDir, path).then((url) => {
      if (!cancelled) setDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [projectDir, path, getAssetDataUrl]);
  if (!dataUrl) return <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>加载中</div>;
  return <img key={path} src={dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} draggable={false} />;
}
