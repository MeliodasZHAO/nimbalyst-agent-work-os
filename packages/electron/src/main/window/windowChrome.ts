import type { BrowserWindow } from 'electron';

type MenuChromeWindow = Pick<BrowserWindow, 'setAutoHideMenuBar' | 'setMenuBarVisibility' | 'setMenu'>;

export function shouldHideNativeMenuBar(platform: NodeJS.Platform = process.platform): boolean {
    return platform !== 'darwin';
}

export function applyHiddenNativeMenuBar(window: MenuChromeWindow, platform: NodeJS.Platform = process.platform): void {
    if (!shouldHideNativeMenuBar(platform)) {
        return;
    }

    window.setAutoHideMenuBar(true);
    window.setMenuBarVisibility(false);
    window.setMenu(null);
}
