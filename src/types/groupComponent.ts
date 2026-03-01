/**
 * 元件类型：状态由 tag 构成，每个状态对应画板可放置图片、精灵动作、嵌套元件
 * Tag 可向内传递，子元件根据收到的 tag 选择自身状态
 */

/** 元件画布统一尺寸 1024x1024，设计、预览按此尺寸并自动 scale 适配显示 */
export const GROUP_CANVAS_SIZE = 1024;

/** 画板坐标：pos_x/pos_y 为归一化中心 (0-1)，scale_x/scale_y 为相对画布比例，rotation 为角度，flip_x 为水平翻转 */
export type GroupCanvasItem =
  | {
      id: string;
      type: 'image';
      path: string;
      pos_x?: number;
      pos_y?: number;
      scale_x?: number;
      scale_y?: number;
      rotation?: number;
      flip_x?: boolean;
    }
  | {
      id: string;
      type: 'sprite';
      characterId: string;
      spriteId: string;
      pos_x?: number;
      pos_y?: number;
      scale_x?: number;
      scale_y?: number;
      rotation?: number;
      flip_x?: boolean;
    }
  | {
      id: string;
      type: 'group';
      characterId: string;
      groupId: string;
      pos_x?: number;
      pos_y?: number;
      scale_x?: number;
      scale_y?: number;
      rotation?: number;
      flip_x?: boolean;
    };

/** 元件的一个状态：由 tags 定义，对应画板内容 */
export interface GroupComponentState {
  id: string;
  /** 该状态对应的 tag 列表，匹配时显示此状态 */
  tags: string[];
  /** 画板上的元素 */
  items: GroupCanvasItem[];
}

/** 元件：可包含多个状态，支持嵌套 */
export interface GroupComponentItem {
  id: string;
  name?: string;
  states: GroupComponentState[];
}
