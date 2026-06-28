import { navigationSections } from '../src/components/Layout';

const riskSection = navigationSections.find((section) => section.label === '风控管理');

if (!riskSection) {
  throw new Error('风控管理分组不存在');
}

if (riskSection.path !== '/actions/review') {
  throw new Error('风控管理应默认跳转待确认动作');
}

if (riskSection.children?.[0]?.path !== '/actions/review') {
  throw new Error('风控管理第一个二级菜单应为待确认动作');
}
