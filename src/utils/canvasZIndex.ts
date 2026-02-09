/**
 * 画布 z-index 自动管理（见功能文档 6.7）
 * 规则：分层从上到下，越上面的分层 zIndex 越高；同一分层轨道中，素材越靠后 zIndex 越高
 */
const MAX_BLOCKS_PER_LAYER = 1000;
const BASE_Z = 1;

export interface LayerForZ {
  id: string;
}

export interface BlockForZ {
  id: string;
  layer_id: string;
  start_time: number;
}

/**
 * 计算块的画布 z-index
 * @param blocks 所有块（含当前时间可见的）；需按 layer + start_time 排序后传入
 * @param layers 分层列表，index 0 = 时间线最上面 = 画布 zIndex 最高
 */
export function computeBlockZIndex(
  blockId: string,
  blocks: BlockForZ[],
  layers: LayerForZ[]
): number {
  const block = blocks.find((b) => b.id === blockId);
  if (!block) return BASE_Z;

  const layerIndex = layers.findIndex((l) => l.id === block.layer_id);
  if (layerIndex < 0) return BASE_Z;

  const layerBlocks = blocks
    .filter((b) => b.layer_id === block.layer_id)
    .sort((a, b) => a.start_time - b.start_time);
  const blockIndexInLayer = layerBlocks.findIndex((b) => b.id === blockId);
  if (blockIndexInLayer < 0) return BASE_Z;

  const layerIndexInverted = layers.length - 1 - layerIndex;
  return BASE_Z + layerIndexInverted * MAX_BLOCKS_PER_LAYER + blockIndexInLayer;
}
