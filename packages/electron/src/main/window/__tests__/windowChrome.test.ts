import { describe, expect, it, vi } from 'vitest';
import { applyHiddenNativeMenuBar, shouldHideNativeMenuBar } from '../windowChrome';

function makeWindowStub() {
    return {
        setAutoHideMenuBar: vi.fn(),
        setMenuBarVisibility: vi.fn(),
        setMenu: vi.fn(),
    };
}

describe('window chrome', () => {
    it('hides native menu bars on Windows and Linux', () => {
        expect(shouldHideNativeMenuBar('win32')).toBe(true);
        expect(shouldHideNativeMenuBar('linux')).toBe(true);
    });

    it('keeps native menu bars available on macOS', () => {
        expect(shouldHideNativeMenuBar('darwin')).toBe(false);
    });

    it('applies the hidden menu bar policy on Windows', () => {
        const window = makeWindowStub();

        applyHiddenNativeMenuBar(window, 'win32');

        expect(window.setAutoHideMenuBar).toHaveBeenCalledWith(true);
        expect(window.setMenuBarVisibility).toHaveBeenCalledWith(false);
        expect(window.setMenu).toHaveBeenCalledWith(null);
    });

    it('does not change macOS windows', () => {
        const window = makeWindowStub();

        applyHiddenNativeMenuBar(window, 'darwin');

        expect(window.setAutoHideMenuBar).not.toHaveBeenCalled();
        expect(window.setMenuBarVisibility).not.toHaveBeenCalled();
        expect(window.setMenu).not.toHaveBeenCalled();
    });
});
