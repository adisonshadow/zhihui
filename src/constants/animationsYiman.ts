/**
 * 芝绘内置动作动画注册（样式见 public/yiman-animations.css）
 */
import { registerAnimation } from './animationRegistry';

const LIBRARY_ID = 'yiman';

function register(): void {
  registerAnimation({
    id: 'yiman.bounceSquash',
    label: '弹跳形变',
    categories: ['action'],
    cssClass: 'yimanBounceSquash',
    libraryId: LIBRARY_ID,
    defaultDuration: 0.95,
  });
  registerAnimation({
    id: 'yiman.branchSway',
    label: '微风摇摆',
    categories: ['action'],
    cssClass: 'yimanBranchSway',
    libraryId: LIBRARY_ID,
    defaultDuration: 2.2,
  });
  registerAnimation({
    id: 'yiman.frogJump',
    label: '蛙跳',
    categories: ['action'],
    cssClass: 'yimanFrogJump',
    libraryId: LIBRARY_ID,
    defaultDuration: 1.1,
  });
  registerAnimation({
    id: 'yiman.spin360',
    label: '旋转360°',
    categories: ['action'],
    cssClass: 'yimanSpin360',
    libraryId: LIBRARY_ID,
    defaultDuration: 1.2,
  });
}

register();
