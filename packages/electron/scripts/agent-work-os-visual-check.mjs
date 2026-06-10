#!/usr/bin/env node

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageRoot, '../..');

function readArg(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find(arg => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function readFlag(name) {
  return process.argv.includes(`--${name}`);
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function safeName(value) {
  return String(value || 'nimbalyst')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'nimbalyst';
}

async function getWorkspacePath(page) {
  try {
    return await page.evaluate(async () => {
      const api = globalThis.window?.electronAPI;
      if (!api?.getInitialState) return null;
      const state = await api.getInitialState();
      return state?.workspacePath || null;
    });
  } catch {
    return null;
  }
}

async function findNimbalystPage(browser, workspaceHint) {
  const pages = browser.contexts()
    .flatMap(context => context.pages())
    .filter(page => {
      const url = page.url();
      return !url.startsWith('devtools://') && !url.includes('mode=capture');
    });

  if (workspaceHint) {
    const normalizedHint = path.resolve(workspaceHint).toLowerCase();
    for (const page of pages) {
      const workspacePath = await getWorkspacePath(page);
      if (workspacePath && path.resolve(workspacePath).toLowerCase() === normalizedHint) {
        return page;
      }
    }
  }

  return pages.find(page => page.url().includes('theme=')) ?? pages[0] ?? null;
}

async function collectPageDiagnostics(page) {
  return await page.evaluate(() => {
    const body = document.body;
    const activeElement = document.activeElement;
    const visibleText = body?.innerText?.trim().slice(0, 2000) ?? '';
    const root = document.documentElement;
    const rect = body?.getBoundingClientRect();
    return {
      title: document.title,
      url: location.href,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      body: rect ? {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      } : null,
      theme: root?.getAttribute('data-theme') || null,
      activeElement: activeElement ? {
        tagName: activeElement.tagName,
        className: typeof activeElement.className === 'string' ? activeElement.className : '',
        testId: activeElement.getAttribute?.('data-testid') ?? null,
      } : null,
      visibleText,
      errorLikeTextFound: /\b(error|failed|exception|cannot|undefined|crash)\b/i.test(visibleText),
    };
  });
}

export async function runVisualCheck(options = {}) {
  const cdpPort = options.cdpPort || process.env.NIMBALYST_CDP_PORT || '9222';
  const cdpEndpoint = options.cdpEndpoint || `http://127.0.0.1:${cdpPort}`;
  const outputDir = path.resolve(options.outputDir || path.join(repoRoot, 'e2e_test_output', 'agent-work-os-visual'));
  const workspace = options.workspace || process.env.NIMBALYST_WORKSPACE || '';
  const label = safeName(options.label || 'agent-work-os');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const captureMobile = options.mobile !== false;
  const captureDesktop = options.desktop !== false;
  const viewports = [];
  if (captureDesktop) viewports.push({ name: 'desktop', width: 1440, height: 1000 });
  if (captureMobile) viewports.push({ name: 'mobile', width: 390, height: 844, isMobile: true });
  if (viewports.length === 0) throw new Error('At least one viewport must be enabled.');

  await fs.mkdir(outputDir, { recursive: true });

  let browser;
  try {
    browser = await chromium.connectOverCDP(cdpEndpoint);
  } catch (error) {
    throw new Error(
      `Could not connect to Nimbalyst via CDP at ${cdpEndpoint}. ` +
      `Start the desktop app in dev mode with npm run dev, or set NIMBALYST_CDP_PORT. ` +
      `Original error: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  try {
    const page = await findNimbalystPage(browser, workspace);
    if (!page) {
      throw new Error('No Nimbalyst renderer window found via CDP.');
    }

    const workspacePath = await getWorkspacePath(page);
    const screenshots = [];
    const diagnostics = [];

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await page.waitForTimeout(250);
      const screenshotPath = path.join(outputDir, `${timestamp}-${label}-${viewport.name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      screenshots.push({
        viewport: viewport.name,
        width: viewport.width,
        height: viewport.height,
        path: screenshotPath,
      });
      diagnostics.push({
        viewport: viewport.name,
        ...(await collectPageDiagnostics(page)),
      });
    }

    const result = {
      ok: true,
      capturedAt: new Date().toISOString(),
      cdpEndpoint,
      workspacePath,
      screenshots,
      diagnostics,
      notes: [
        'Attach the screenshot paths and relevant diagnostics to Work Packet verificationEvidence or runtimeEvidence.',
        'This script connects to the already-running Nimbalyst window and does not launch a second Electron instance.',
      ],
    };
    const resultPath = path.join(outputDir, `${timestamp}-${label}-result.json`);
    await fs.writeFile(resultPath, JSON.stringify(result, null, 2), 'utf8');
    return { ...result, resultPath };
  } finally {
    await browser.close();
  }
}

if (isMainModule()) {
  runVisualCheck({
    cdpPort: readArg('cdp-port', undefined),
    outputDir: readArg('output-dir', undefined),
    workspace: readArg('workspace', undefined),
    label: readArg('label', undefined),
    desktop: !readFlag('no-desktop'),
    mobile: !readFlag('no-mobile'),
  }).then(result => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
