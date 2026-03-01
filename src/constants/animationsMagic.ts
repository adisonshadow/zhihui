/**
 * Magic Animations CSS3 动画定义与注册（见 docs/08-素材动画功能技术方案.md 4.2）
 * 来源：https://www.minimamente.com/project/magic/
 * 需配合 public/magic.css 使用
 */
import { registerAnimation } from './animationRegistry';

const LIBRARY_ID = 'magic';

function register(): void {
  // ---------- 出现 ----------
  registerAnimation({ id: 'magic.puffIn', label: '膨胀出现', categories: ['appear'], cssClass: 'puffIn', libraryId: LIBRARY_ID, defaultDuration: 0.6 });
  registerAnimation({ id: 'magic.vanishIn', label: '模糊出现', categories: ['appear'], cssClass: 'vanishIn', libraryId: LIBRARY_ID, defaultDuration: 0.6 });
  registerAnimation({ id: 'magic.swap', label: '交换出现', categories: ['appear'], cssClass: 'swap', libraryId: LIBRARY_ID, defaultDuration: 0.6 });
  registerAnimation({ id: 'magic.twisterInDown', label: '扭转出现（下）', categories: ['appear'], cssClass: 'twisterInDown', libraryId: LIBRARY_ID, defaultDuration: 0.6 });
  registerAnimation({ id: 'magic.twisterInUp', label: '扭转出现（上）', categories: ['appear'], cssClass: 'twisterInUp', libraryId: LIBRARY_ID, defaultDuration: 0.6 });
  registerAnimation({ id: 'magic.foolishIn', label: '弹跳出现', categories: ['appear'], cssClass: 'foolishIn', libraryId: LIBRARY_ID, defaultDuration: 0.8 });
  registerAnimation({ id: 'magic.swashIn', label: '水花出现', categories: ['appear'], cssClass: 'swashIn', libraryId: LIBRARY_ID, defaultDuration: 0.6 });
  registerAnimation({ id: 'magic.boingInUp', label: '弹跳出现（上）', categories: ['appear'], cssClass: 'boingInUp', libraryId: LIBRARY_ID, defaultDuration: 0.8 });

  registerAnimation({
    id: 'magic.spaceIn',
    label: '空间飞入',
    categories: ['appear'],
    cssClass: 'spaceInUp',
    libraryId: LIBRARY_ID,
    defaultDuration: 0.6,
    hasDirectionParam: true,
    directionMap: { up: 'spaceInUp', down: 'spaceInDown', left: 'spaceInLeft', right: 'spaceInRight' },
  });

  registerAnimation({
    id: 'magic.perspectiveReturn',
    label: '透视出现',
    categories: ['appear'],
    cssClass: 'perspectiveDownReturn',
    libraryId: LIBRARY_ID,
    defaultDuration: 0.6,
    hasDirectionParam: true,
    directionMap: { up: 'perspectiveUpReturn', down: 'perspectiveDownReturn', left: 'perspectiveLeftReturn', right: 'perspectiveRightReturn' },
  });

  registerAnimation({
    id: 'magic.slideReturn',
    label: '滑入',
    categories: ['appear'],
    cssClass: 'slideDownReturn',
    libraryId: LIBRARY_ID,
    defaultDuration: 0.6,
    hasDirectionParam: true,
    directionMap: { up: 'slideUpReturn', down: 'slideDownReturn', left: 'slideLeftReturn', right: 'slideRightReturn' },
  });

  registerAnimation({
    id: 'magic.openReturn',
    label: '展开出现',
    categories: ['appear'],
    cssClass: 'openDownLeftReturn',
    libraryId: LIBRARY_ID,
    defaultDuration: 0.6,
    hasDirectionParam: true,
    directionMap: {
      downLeft: 'openDownLeftReturn',
      downRight: 'openDownRightReturn',
      upLeft: 'openUpLeftReturn',
      upRight: 'openUpRightReturn',
    },
  });

  registerAnimation({
    id: 'magic.tinIn',
    label: '收缩出现',
    categories: ['appear'],
    cssClass: 'tinDownIn',
    libraryId: LIBRARY_ID,
    defaultDuration: 0.6,
    hasDirectionParam: true,
    directionMap: { up: 'tinUpIn', down: 'tinDownIn', left: 'tinLeftIn', right: 'tinRightIn' },
  });

  // ---------- 动作 ----------
  registerAnimation({ id: 'magic.magic', label: '魔法旋转', categories: ['action'], cssClass: 'magic', libraryId: LIBRARY_ID, defaultDuration: 1 });

  registerAnimation({
    id: 'magic.rotate',
    label: '旋转',
    categories: ['action'],
    cssClass: 'rotateDown',
    libraryId: LIBRARY_ID,
    defaultDuration: 1,
    hasDirectionParam: true,
    directionMap: { up: 'rotateUp', down: 'rotateDown', left: 'rotateLeft', right: 'rotateRight' },
  });

  registerAnimation({
    id: 'magic.perspective',
    label: '透视翻转',
    categories: ['action'],
    cssClass: 'perspectiveDown',
    libraryId: LIBRARY_ID,
    defaultDuration: 1,
    hasDirectionParam: true,
    directionMap: { up: 'perspectiveUp', down: 'perspectiveDown', left: 'perspectiveLeft', right: 'perspectiveRight' },
  });

  registerAnimation({
    id: 'magic.slide',
    label: '滑动',
    categories: ['action'],
    cssClass: 'slideDown',
    libraryId: LIBRARY_ID,
    defaultDuration: 1,
    hasDirectionParam: true,
    directionMap: { up: 'slideUp', down: 'slideDown', left: 'slideLeft', right: 'slideRight' },
  });

  registerAnimation({
    id: 'magic.open',
    label: '展开',
    categories: ['action'],
    cssClass: 'openDownLeft',
    libraryId: LIBRARY_ID,
    defaultDuration: 1,
    hasDirectionParam: true,
    directionMap: {
      downLeft: 'openDownLeft',
      downRight: 'openDownRight',
      upLeft: 'openUpLeft',
      upRight: 'openUpRight',
    },
  });

  // ---------- 消失 ----------
  registerAnimation({ id: 'magic.puffOut', label: '膨胀消失', categories: ['disappear'], cssClass: 'puffOut', libraryId: LIBRARY_ID, defaultDuration: 0.6 });
  registerAnimation({ id: 'magic.vanishOut', label: '模糊消失', categories: ['disappear'], cssClass: 'vanishOut', libraryId: LIBRARY_ID, defaultDuration: 0.6 });
  registerAnimation({ id: 'magic.foolishOut', label: '弹跳消失', categories: ['disappear'], cssClass: 'foolishOut', libraryId: LIBRARY_ID, defaultDuration: 0.8 });
  registerAnimation({ id: 'magic.holeOut', label: '洞穿消失', categories: ['disappear'], cssClass: 'holeOut', libraryId: LIBRARY_ID, defaultDuration: 0.6 });
  registerAnimation({ id: 'magic.swashOut', label: '水花消失', categories: ['disappear'], cssClass: 'swashOut', libraryId: LIBRARY_ID, defaultDuration: 0.6 });
  registerAnimation({ id: 'magic.boingOutDown', label: '弹跳消失（下）', categories: ['disappear'], cssClass: 'boingOutDown', libraryId: LIBRARY_ID, defaultDuration: 0.8 });

  registerAnimation({
    id: 'magic.bombOut',
    label: '爆炸消失',
    categories: ['disappear'],
    cssClass: 'bombRightOut',
    libraryId: LIBRARY_ID,
    defaultDuration: 0.6,
    hasDirectionParam: true,
    directionMap: { left: 'bombLeftOut', right: 'bombRightOut' },
  });

  registerAnimation({
    id: 'magic.spaceOut',
    label: '空间飞出',
    categories: ['disappear'],
    cssClass: 'spaceOutUp',
    libraryId: LIBRARY_ID,
    defaultDuration: 0.6,
    hasDirectionParam: true,
    directionMap: { up: 'spaceOutUp', down: 'spaceOutDown', left: 'spaceOutLeft', right: 'spaceOutRight' },
  });

  registerAnimation({
    id: 'magic.openOut',
    label: '收起消失',
    categories: ['disappear'],
    cssClass: 'openDownLeftOut',
    libraryId: LIBRARY_ID,
    defaultDuration: 0.6,
    hasDirectionParam: true,
    directionMap: {
      downLeft: 'openDownLeftOut',
      downRight: 'openDownRightOut',
      upLeft: 'openUpLeftOut',
      upRight: 'openUpRightOut',
    },
  });

  registerAnimation({
    id: 'magic.tinOut',
    label: '收缩消失',
    categories: ['disappear'],
    cssClass: 'tinDownOut',
    libraryId: LIBRARY_ID,
    defaultDuration: 0.6,
    hasDirectionParam: true,
    directionMap: { up: 'tinUpOut', down: 'tinDownOut', left: 'tinLeftOut', right: 'tinRightOut' },
  });
}

// 应用启动时注册
register();
