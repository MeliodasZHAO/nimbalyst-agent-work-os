import { spawn } from 'child_process';
import { app } from 'electron';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { safeHandle } from '../utils/ipcRegistry';
import { getPackageRoot } from '../utils/appPaths';

export interface AgentWorkOSVisualCheckOptions {
  label?: string;
  workspacePath?: string;
}

export interface AgentWorkOSVisualCheckResult {
  success: boolean;
  resultPath?: string;
  screenshots?: Array<{
    viewport: string;
    width: number;
    height: number;
    path: string;
  }>;
  stdout?: string;
  stderr?: string;
  error?: string;
}

const MAX_OUTPUT_CHARS = 20000;

export function sanitizeVisualCheckLabel(value: unknown): string {
  return String(value || 'agent-work-os')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'agent-work-os';
}

function parseVisualCheckStdout(stdout: string): Pick<AgentWorkOSVisualCheckResult, 'resultPath' | 'screenshots'> {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return {};
  }

  try {
    const parsed = JSON.parse(stdout.slice(start, end + 1));
    return {
      resultPath: typeof parsed.resultPath === 'string' ? parsed.resultPath : undefined,
      screenshots: Array.isArray(parsed.screenshots) ? parsed.screenshots : undefined,
    };
  } catch {
    return {};
  }
}

export function buildVisualCheckSpawnSpec(options: AgentWorkOSVisualCheckOptions = {}) {
  if (app.isPackaged) {
    throw new Error('Agent Work OS visual check runner is only available in development mode.');
  }

  const packageRoot = getPackageRoot();
  const repoRoot = resolve(packageRoot, '..', '..');
  const scriptPath = join(packageRoot, 'scripts', 'agent-work-os-visual-check.mjs');
  if (!existsSync(scriptPath)) {
    throw new Error(`Agent Work OS visual check script not found at ${scriptPath}`);
  }

  const args = [
    scriptPath,
    `--label=${sanitizeVisualCheckLabel(options.label)}`,
  ];
  if (typeof options.workspacePath === 'string' && options.workspacePath.trim()) {
    args.push(`--workspace=${options.workspacePath.trim()}`);
  }

  return {
    command: process.execPath,
    args,
    cwd: repoRoot,
  };
}

export function runAgentWorkOSVisualCheck(options: AgentWorkOSVisualCheckOptions = {}): Promise<AgentWorkOSVisualCheckResult> {
  return new Promise((resolveResult) => {
    let settled = false;
    const finish = (result: AgentWorkOSVisualCheckResult) => {
      if (settled) return;
      settled = true;
      resolveResult(result);
    };

    let spec;
    try {
      spec = buildVisualCheckSpawnSpec(options);
    } catch (error) {
      finish({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      windowsHide: true,
      shell: false,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout = (stdout + String(chunk)).slice(-MAX_OUTPUT_CHARS);
    });
    child.stderr?.on('data', (chunk) => {
      stderr = (stderr + String(chunk)).slice(-MAX_OUTPUT_CHARS);
    });
    child.on('error', (error) => {
      finish({
        success: false,
        stdout,
        stderr,
        error: error.message,
      });
    });
    child.on('close', (code) => {
      const parsed = parseVisualCheckStdout(stdout);
      finish({
        success: code === 0,
        ...parsed,
        stdout,
        stderr,
        error: code === 0 ? undefined : (stderr.trim() || `Visual check exited with code ${code ?? 'unknown'}`),
      });
    });
  });
}

export function registerAgentWorkOSHandlers(): void {
  safeHandle(
    'agent-work-os:run-visual-check',
    async (_event, options?: AgentWorkOSVisualCheckOptions): Promise<AgentWorkOSVisualCheckResult> => {
      return runAgentWorkOSVisualCheck(options ?? {});
    },
  );
}
