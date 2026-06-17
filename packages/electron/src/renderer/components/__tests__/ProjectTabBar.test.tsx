import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Provider, createStore } from 'jotai';
import { ProjectTabBar } from '../ProjectTabBar';
import { openProjectsAtom, activeWorkspacePathAtom } from '../../store/atoms/openProjects';

// MaterialSymbol 来自 @nimbalyst/runtime，mock 掉避免拖入 runtime 入口副作用。
vi.mock('@nimbalyst/runtime', () => ({ MaterialSymbol: () => null }));

beforeEach(() => {
  // 组件用 navigator.platform 决定 revealLabel 文案；jsdom 默认 platform 为空，
  // 会落到“文件管理器”兜底。stub 成 Win32 以断言 Windows 分支文案，而不是改组件。
  Object.defineProperty(window.navigator, 'platform', { value: 'Win32', configurable: true });
  (window as any).electronAPI = { invoke: vi.fn().mockResolvedValue(undefined), copyToClipboard: vi.fn() };
});

function renderBar() {
  const store = createStore();
  // multiProjectModeAtom 默认 true，无需设置。需 >=1 项；让 /p/aimo 处于 inactive 才可右键。
  store.set(openProjectsAtom, [
    { path: '/p/aimo', name: 'aimo', openedAt: 0 },
    { path: '/p/other', name: 'other', openedAt: 0 },
  ]);
  store.set(activeWorkspacePathAtom, '/p/other');
  return { store, ...render(<Provider store={store}><ProjectTabBar /></Provider>) };
}

describe('ProjectTabBar 右键菜单', () => {
  it('右键不触发无限重渲染，菜单显示全部 4 项', () => {
    renderBar();
    const tab = screen.getByTestId('project-tab-/p/aimo');
    expect(() => fireEvent.contextMenu(tab)).not.toThrow();
    expect(screen.getByText('在新窗口中打开')).toBeInTheDocument();
    expect(screen.getByText('在资源管理器中显示')).toBeInTheDocument(); // revealLabel(Windows)
    expect(screen.getByText('复制项目路径')).toBeInTheDocument(); // 新增项
    expect(screen.getByText('关闭项目')).toBeInTheDocument();
  });

  it('点击"复制项目路径"调用 copyToClipboard', () => {
    renderBar();
    fireEvent.contextMenu(screen.getByTestId('project-tab-/p/aimo'));
    fireEvent.click(screen.getByText('复制项目路径'));
    expect((window as any).electronAPI.copyToClipboard).toHaveBeenCalledWith('/p/aimo');
  });
});

describe('ProjectTabBar 拖拽重排', () => {
  function makeDataTransfer() {
    const store: Record<string, string> = {};
    return {
      effectAllowed: '',
      dropEffect: '',
      setData(type: string, val: string) { store[type] = val; },
      getData(type: string) { return store[type] ?? ''; },
    };
  }

  it('把一个 tab 拖到另一个 tab 上会重排 openProjects', () => {
    const { store } = renderBar(); // 初始顺序 [aimo, other]
    const aimo = screen.getByTestId('project-tab-/p/aimo');
    const other = screen.getByTestId('project-tab-/p/other');
    const dataTransfer = makeDataTransfer();

    fireEvent.dragStart(aimo, { dataTransfer });
    fireEvent.dragOver(other, { dataTransfer });
    fireEvent.drop(other, { dataTransfer });

    expect(store.get(openProjectsAtom).map((p) => p.path)).toEqual(['/p/other', '/p/aimo']);
  });

  it('拖到自己身上不改变顺序', () => {
    const { store } = renderBar();
    const aimo = screen.getByTestId('project-tab-/p/aimo');
    const dataTransfer = makeDataTransfer();

    fireEvent.dragStart(aimo, { dataTransfer });
    fireEvent.drop(aimo, { dataTransfer });

    expect(store.get(openProjectsAtom).map((p) => p.path)).toEqual(['/p/aimo', '/p/other']);
  });
});
