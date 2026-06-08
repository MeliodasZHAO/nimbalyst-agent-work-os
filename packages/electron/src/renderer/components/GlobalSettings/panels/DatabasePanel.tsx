/**
 * DatabasePanel
 *
 * Settings → Database. Shows the current storage backend, lets alpha users
 * dry-run the PGLite → SQLite migration (zero-risk: never touches the live
 * database), and stages the eventual "Migrate" CTA.
 *
 * IPC contract (see packages/electron/src/main/ipc/MigrationHandlers.ts):
 *   - db:migration:get-status   -> { activeBackend, pgliteDirExists, sqliteDirExists, migratedDirs, runningDryRun }
 *   - db:migration:dry-run      -> { success, result: DryRunResult } | { success: false, error }
 *   - db:migration:start        -> kicks off real migration; gated behind translator work
 *   - db:migration:rollback     -> restores pglite-db/ from a preserved sibling
 *   - db:migration:progress/phase/complete/failed (events) -> live updates
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MaterialSymbol } from '@nimbalyst/runtime';

type Backend = 'pglite' | 'sqlite';

interface MigrationStatus {
  activeBackend: Backend;
  pgliteDirExists: boolean;
  sqliteDirExists: boolean;
  migratedDirs: string[];
  running: boolean;
  runningDryRun: boolean;
}

interface DryRunResult {
  summary: {
    tablesCopied: Array<{ name: string; rows: number }>;
    totalRowsCopied: number;
    durationMs: number;
    foreignKeyViolations: number;
    integrityCheck: string;
    spotCheckCount: number;
  };
  dryRunDir: string;
  sqliteFileBytes: number;
  pgliteDirBytes: number;
}

interface PhaseEvent {
  phase: string;
  info?: ProgressEvent;
}

interface ProgressEvent {
  phase?: string;
  table?: string;
  currentTable?: string;
  rowsCopied?: number;
  rowsTotal?: number;
  rowsExpected?: number;
  totalRowsCopied?: number;
  tableRowsCopied?: number;
  tableRowsExpected?: number;
  tablesCompleted?: number;
  tablesTotal?: number;
  percentOfTotal?: number;
  elapsedMs?: number;
}

interface PreflightResult {
  ok: boolean;
  reason?: string;
  pgliteDirBytes: number;
  freeBytes: number;
  requiredBytes: number;
}

interface MigrationSummary {
  totalRowsCopied: number;
  tablesCopied: Array<{ name: string; rows: number }>;
  durationMs: number;
  integrityCheck: string;
  foreignKeyViolations: number;
  spotCheckCount: number;
}

interface MigrationFailure {
  phase: string;
  message: string;
  stack?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const mins = Math.floor(ms / 60_000);
  const secs = ((ms % 60_000) / 1000).toFixed(0);
  return `${mins} min ${secs} s`;
}

export function DatabasePanel(): React.ReactElement {
  const [status, setStatus] = useState<MigrationStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [dryRunError, setDryRunError] = useState<string | null>(null);
  const [dryRunRunning, setDryRunRunning] = useState(false);
  const [phase, setPhase] = useState<PhaseEvent | null>(null);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [showMigrationModal, setShowMigrationModal] = useState(false);
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [migrationRunning, setMigrationRunning] = useState(false);
  const [migrationSummary, setMigrationSummary] = useState<MigrationSummary | null>(null);
  const [migrationFailure, setMigrationFailure] = useState<MigrationFailure | null>(null);
  const [dryRunAvailable, setDryRunAvailable] = useState<{
    completedAt: string;
    totalRows: number;
  } | null>(null);
  const [adoptRunning, setAdoptRunning] = useState(false);
  const [adoptError, setAdoptError] = useState<string | null>(null);
  const [adoptResult, setAdoptResult] = useState<{
    rowsAdded: number;
    durationMs: number;
  } | null>(null);

  const loadStatus = useCallback(async () => {
    if (!window.electronAPI) return;
    try {
      const resp = (await window.electronAPI.invoke('db:migration:get-status')) as
        | (MigrationStatus & { success: true })
        | { success: false; error: string };
      if (!resp.success) {
        setStatusError(resp.error);
        return;
      }
      setStatusError(null);
      setStatus({
        activeBackend: resp.activeBackend,
        pgliteDirExists: resp.pgliteDirExists,
        sqliteDirExists: resp.sqliteDirExists,
        migratedDirs: resp.migratedDirs,
        running: resp.running,
        runningDryRun: resp.runningDryRun,
      });
    } catch (err) {
      setStatusError(String((err as Error).message ?? err));
    }

    // Detect whether a previous dry-run is sitting on disk and adoptable.
    try {
      const resp = (await window.electronAPI.invoke('db:migration:dry-run-status')) as
        | { success: true; available: false }
        | { success: true; available: true; completedAt: string; totalRows: number }
        | { success: false; error: string };
      if (resp.success && resp.available) {
        setDryRunAvailable({ completedAt: resp.completedAt, totalRows: resp.totalRows });
      } else {
        setDryRunAvailable(null);
      }
    } catch {
      setDryRunAvailable(null);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // Subscribe to the migration event channels so the dry-run flow shows
  // live progress. The renderer-side IPC listener pattern is documented in
  // /docs/IPC_LISTENERS.md; we register here and clean up on unmount.
  useEffect(() => {
    if (!window.electronAPI) return;
    // preload's electronAPI.on strips the IPC event, so callbacks receive
    // (payload) directly — not (event, payload).
    const onPhase = (payload: PhaseEvent) => setPhase(payload);
    const onProgress = (payload: ProgressEvent) => setProgress(payload);
    const onComplete = (payload: MigrationSummary) => {
      setMigrationRunning(false);
      setMigrationFailure(null);
      setMigrationSummary(payload);
    };
    const onFailed = (payload: MigrationFailure) => {
      setMigrationRunning(false);
      setMigrationFailure(payload);
    };
    window.electronAPI.on('db:migration:phase', onPhase);
    window.electronAPI.on('db:migration:progress', onProgress);
    window.electronAPI.on('db:migration:complete', onComplete);
    window.electronAPI.on('db:migration:failed', onFailed);
    return () => {
      window.electronAPI?.off?.('db:migration:phase', onPhase);
      window.electronAPI?.off?.('db:migration:progress', onProgress);
      window.electronAPI?.off?.('db:migration:complete', onComplete);
      window.electronAPI?.off?.('db:migration:failed', onFailed);
    };
  }, []);

  const startDryRun = useCallback(async () => {
    if (!window.electronAPI || dryRunRunning) return;
    setDryRunRunning(true);
    setDryRunError(null);
    setDryRunResult(null);
    setPhase(null);
    setProgress(null);
    try {
      const resp = (await window.electronAPI.invoke('db:migration:dry-run')) as
        | { success: true; result: DryRunResult }
        | { success: false; error: string };
      if (!resp.success) {
        setDryRunError(resp.error);
      } else {
        setDryRunResult(resp.result);
      }
    } catch (err) {
      setDryRunError(String((err as Error).message ?? err));
    } finally {
      setDryRunRunning(false);
      void loadStatus();
    }
  }, [dryRunRunning, loadStatus]);

  const adoptDryRun = useCallback(async () => {
    if (!window.electronAPI || adoptRunning) return;
    const ageHrs = dryRunAvailable
      ? (Date.now() - new Date(dryRunAvailable.completedAt).getTime()) / 3_600_000
      : 0;
    const ageBlurb = ageHrs < 1
      ? 'less than an hour'
      : `about ${Math.round(ageHrs)} hour${ageHrs >= 1.5 ? 's' : ''}`;
    const ok = window.confirm(
      `Switch to the dry-run SQLite copy?\n\n`
      + `Nimbalyst will:\n`
      + `  1. Close the current PGLite database\n`
      + `  2. Copy anything new since the dry-run (${ageBlurb} ago)\n`
      + `  3. Make SQLite the active backend\n`
      + `  4. Preserve the old PGLite for rollback\n\n`
      + `A relaunch is required after switching.`,
    );
    if (!ok) return;
    setAdoptRunning(true);
    setAdoptError(null);
    setAdoptResult(null);
    setPhase(null);
    setProgress(null);
    try {
      const resp = (await window.electronAPI.invoke('db:migration:adopt-dry-run')) as
        | { success: true; result: { rowsAdded: number; durationMs: number } }
        | { success: false; error: string };
      if (!resp.success) {
        setAdoptError(resp.error);
      } else {
        setAdoptResult({
          rowsAdded: resp.result.rowsAdded,
          durationMs: resp.result.durationMs,
        });
        setDryRunAvailable(null);
        setDryRunResult(null);
      }
    } catch (err) {
      setAdoptError(String((err as Error).message ?? err));
    } finally {
      setAdoptRunning(false);
      void loadStatus();
    }
  }, [adoptRunning, dryRunAvailable, loadStatus]);

  const rollback = useCallback(async () => {
    if (!window.electronAPI) return;
    if (!window.confirm('Restore the preserved PGLite database? You will lose any data created since the migration. Requires a relaunch.')) {
      return;
    }
    const resp = (await window.electronAPI.invoke('db:migration:rollback')) as
      | { success: true; restoredFrom: string }
      | { success: false; error: string };
    if (!resp.success) {
      window.alert(`Rollback failed: ${resp.error}`);
    } else {
      window.alert(`Restored from ${resp.restoredFrom}. Please relaunch Nimbalyst.`);
    }
    void loadStatus();
  }, [loadStatus]);

  const openMigrationModal = useCallback(async () => {
    if (!window.electronAPI) return;
    setShowMigrationModal(true);
    setPreflight(null);
    setPreflightError(null);
    setMigrationFailure(null);
    setMigrationSummary(null);
    setPhase(null);
    setProgress(null);
    try {
      const resp = (await window.electronAPI.invoke('db:migration:preflight')) as
        | ({ success: true } & PreflightResult)
        | { success: false; error: string };
      if (!resp.success) {
        setPreflightError(resp.error);
        return;
      }
      setPreflight(resp);
    } catch (err) {
      setPreflightError(String((err as Error).message ?? err));
    }
  }, []);

  const startMigration = useCallback(async () => {
    if (!window.electronAPI || migrationRunning || !preflight?.ok) return;
    setMigrationRunning(true);
    setMigrationFailure(null);
    setMigrationSummary(null);
    try {
      const resp = (await window.electronAPI.invoke('db:migration:start')) as
        | { success: true; summary: MigrationSummary }
        | { success: false; error: string };
      if (!resp.success) {
        setMigrationRunning(false);
        setMigrationFailure({ phase: phase?.phase ?? 'start', message: resp.error });
      } else {
        setMigrationSummary(resp.summary);
        setMigrationRunning(false);
        void loadStatus();
      }
    } catch (err) {
      setMigrationRunning(false);
      setMigrationFailure({
        phase: phase?.phase ?? 'start',
        message: String((err as Error).message ?? err),
      });
    }
  }, [loadStatus, migrationRunning, phase?.phase, preflight?.ok]);

  const copyDiagnosticInfo = useCallback(async () => {
    const diagnostic = JSON.stringify({
      preflight,
      phase,
      progress,
      failure: migrationFailure,
    }, null, 2);
    await navigator.clipboard.writeText(diagnostic);
  }, [migrationFailure, phase, preflight, progress]);

  const backendLabel = useMemo(() => {
    if (!status) return '加载中...';
    return status.activeBackend === 'pglite' ? 'PGLite (当前)' : 'SQLite (新)';
  }, [status]);

  return (
    <div className="provider-panel flex flex-col">
      <div className="provider-panel-header mb-6 pb-4 border-b border-[var(--nim-border)]">
        <h3 className="provider-panel-title text-xl font-semibold leading-tight mb-2 text-[var(--nim-text)]">
          数据库存储
        </h3>
        <p className="provider-panel-description text-sm leading-relaxed text-[var(--nim-text-muted)]">
          会话、跟踪器和文档历史的本地存储引擎。
          PGLite 是当前默认引擎；更快的 SQLite 后端正在 Alpha 测试中。
        </p>
      </div>

      {/* Current backend section ----------------------------------------- */}
      <div className="provider-panel-section mb-6">
        <h4 className="provider-panel-section-title text-base font-semibold mb-2 text-[var(--nim-text)]">
          当前后端
        </h4>
        {statusError ? (
          <div className="p-3 rounded-md bg-[rgba(220,38,38,0.1)] border border-[rgba(220,38,38,0.3)] text-sm text-[var(--nim-text)]">
            读取状态失败：{statusError}
          </div>
        ) : (
          <div className="setting-item py-2 flex items-center justify-between gap-4 nim-database-status">
            <div className="flex flex-col gap-0 min-w-0">
              <span className="setting-name text-sm font-medium text-[var(--nim-text)]">
                {backendLabel}
              </span>
              <span className="setting-description text-xs leading-snug text-[var(--nim-text-muted)]">
                {status?.pgliteDirExists && status?.sqliteDirExists
                  ? 'pglite-db/ 和 sqlite-db/ 均存在于磁盘上。'
                  : status?.pgliteDirExists
                    ? 'pglite-db/ 在磁盘上；sqlite-db/ 尚未创建。'
                    : status?.sqliteDirExists
                      ? 'sqlite-db/ 在磁盘上；旧版 pglite-db/ 不存在。'
                      : '尚无数据库目录。'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Dry run section ------------------------------------------------- */}
      <div className="provider-panel-section mb-6">
        <h4 className="provider-panel-section-title text-base font-semibold mb-2 text-[var(--nim-text)]">
          测试 SQLite 迁移（试运行）
        </h4>
        <p className="provider-panel-hint text-sm text-[var(--nim-text-muted)] mb-3">
          将你的数据复制到一个临时 SQLite 数据库（与生产数据库并行），
          报告行数和完整性，然后删除临时副本。
          你的真实 PGLite 数据库不会被触及。随时可以安全运行。
        </p>

        <button
          type="button"
          onClick={startDryRun}
          disabled={dryRunRunning || !status}
          className="nim-database-dry-run-button setting-button inline-flex items-center gap-2 py-1.5 px-3 rounded-md text-sm font-medium bg-[var(--nim-primary)] text-white border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--nim-primary-hover)]"
        >
          <MaterialSymbol icon={dryRunRunning ? 'sync' : 'play_arrow'} size={16} />
          {dryRunRunning ? '正在试运行...' : '运行试迁移'}
        </button>

        {(dryRunRunning && (phase || progress)) && (
          <DryRunProgress phase={phase} progress={progress} />
        )}

        {dryRunError && (
          <div className="mt-3 p-3 rounded-md bg-[rgba(220,38,38,0.1)] border border-[rgba(220,38,38,0.3)] text-sm text-[var(--nim-text)] nim-database-dry-run-error">
            试运行失败：{dryRunError}
          </div>
        )}

        {dryRunResult && (
          <div className="mt-3 nim-database-dry-run-result">
            <DryRunResultCard result={dryRunResult} />
          </div>
        )}

        {dryRunAvailable && status?.activeBackend === 'pglite' && (
          <AdoptDryRunSection
            available={dryRunAvailable}
            running={adoptRunning}
            phase={phase}
            progress={progress}
            error={adoptError}
            result={adoptResult}
            onAdopt={() => { void adoptDryRun(); }}
          />
        )}
      </div>

      {/* Migrate (gated) section ----------------------------------------- */}
      <div className="provider-panel-section mb-6">
        <h4 className="provider-panel-section-title text-base font-semibold mb-2 text-[var(--nim-text)]">
          迁移到 SQLite
        </h4>
        <p className="provider-panel-hint text-sm text-[var(--nim-text-muted)] mb-3">
          将所有数据从 PGLite 迁移到 SQLite。原始 PGLite 目录
          会保留在 <code className="px-1 py-0.5 rounded bg-[var(--nim-bg-tertiary)] text-xs">pglite-db.migrated-&lt;timestamp&gt;/</code>，
          可以从此面板恢复。
        </p>

        <button
          type="button"
          onClick={() => { void openMigrationModal(); }}
          disabled={!status || status.activeBackend !== 'pglite'}
          className="setting-button inline-flex items-center gap-2 py-1.5 px-3 rounded-md text-sm font-medium bg-[var(--nim-primary)] text-white border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--nim-primary-hover)]"
        >
          <MaterialSymbol icon="upgrade" size={16} />
          迁移到 SQLite
        </button>
      </div>

      {/* Rollback section (only visible if a migrated dir exists) -------- */}
      {status && status.migratedDirs.length > 0 && (
        <div className="provider-panel-section mb-6">
          <h4 className="provider-panel-section-title text-base font-semibold mb-2 text-[var(--nim-text)]">
            恢复之前的 PGLite 数据库
          </h4>
          <p className="provider-panel-hint text-sm text-[var(--nim-text-muted)] mb-3">
            磁盘上保留的快照数：{status.migratedDirs.length}。将使用最近的一个。
          </p>
          <button
            type="button"
            onClick={rollback}
            className="setting-button inline-flex items-center gap-2 py-1.5 px-3 rounded-md text-sm font-medium bg-[var(--nim-bg-secondary)] text-[var(--nim-text)] border border-[var(--nim-border)] cursor-pointer hover:bg-[var(--nim-hover)]"
          >
            <MaterialSymbol icon="restore" size={16} />
            从保留的 PGLite 恢复
          </button>
        </div>
      )}

      {showMigrationModal && (
        <MigrationModal
          preflight={preflight}
          preflightError={preflightError}
          phase={phase}
          progress={progress}
          running={migrationRunning}
          summary={migrationSummary}
          failure={migrationFailure}
          onClose={() => {
            if (migrationRunning) return;
            setShowMigrationModal(false);
            void loadStatus();
          }}
          onStart={() => { void startMigration(); }}
          onCopyDiagnostic={() => { void copyDiagnosticInfo(); }}
        />
      )}
    </div>
  );
}

function DryRunResultCard({ result }: { result: DryRunResult }): React.ReactElement {
  const sizeChange = result.sqliteFileBytes - result.pgliteDirBytes;
  const sizeChangePct = result.pgliteDirBytes > 0
    ? ((sizeChange / result.pgliteDirBytes) * 100).toFixed(1)
    : '0';
  return (
    <div className="p-3 rounded-md bg-[var(--nim-bg-secondary)] border border-[var(--nim-border)]">
      <div className="grid grid-cols-2 gap-3 text-sm mb-3">
        <Stat label="已复制行数" value={result.summary.totalRowsCopied.toLocaleString()} />
        <Stat label="表" value={String(result.summary.tablesCopied.length)} />
        <Stat label="耗时" value={formatDuration(result.summary.durationMs)} />
        <Stat label="外键违规" value={String(result.summary.foreignKeyViolations)} ok={result.summary.foreignKeyViolations === 0} />
        <Stat label="完整性" value={result.summary.integrityCheck} ok={result.summary.integrityCheck === 'ok'} />
        <Stat
          label="磁盘占用"
          value={`${formatBytes(result.sqliteFileBytes)} vs ${formatBytes(result.pgliteDirBytes)} (${sizeChange >= 0 ? '+' : ''}${sizeChangePct}%)`}
        />
      </div>

      <details className="mt-2 nim-database-dry-run-per-table">
        <summary className="cursor-pointer text-xs text-[var(--nim-text-muted)] hover:text-[var(--nim-text)]">
          各表明细 ({result.summary.tablesCopied.length} 个表)
        </summary>
        <table className="w-full mt-2 text-xs">
          <thead>
            <tr className="text-left text-[var(--nim-text-muted)] border-b border-[var(--nim-border)]">
              <th className="py-1 pr-2">表名</th>
              <th className="py-1 text-right">已复制行数</th>
            </tr>
          </thead>
          <tbody>
            {result.summary.tablesCopied.map((t) => (
              <tr key={t.name} className="border-b border-[var(--nim-border)] last:border-b-0">
                <td className="py-1 pr-2 text-[var(--nim-text)] font-mono">{t.name}</td>
                <td className="py-1 text-right text-[var(--nim-text)]">{t.rows.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function Stat({ label, value, ok }: { label: string; value: string; ok?: boolean }): React.ReactElement {
  const colorClass = ok === false ? 'text-[var(--nim-error)]' : 'text-[var(--nim-text)]';
  return (
    <div className="flex flex-col gap-0">
      <span className="text-xs text-[var(--nim-text-muted)]">{label}</span>
      <span className={`text-sm font-medium ${colorClass}`}>{value}</span>
    </div>
  );
}

function MigrationModal(props: {
  preflight: PreflightResult | null;
  preflightError: string | null;
  phase: PhaseEvent | null;
  progress: ProgressEvent | null;
  running: boolean;
  summary: MigrationSummary | null;
  failure: MigrationFailure | null;
  onClose: () => void;
  onStart: () => void;
  onCopyDiagnostic: () => void;
}): React.ReactElement {
  const { preflight, preflightError, phase, progress, running, summary, failure, onClose, onStart, onCopyDiagnostic } = props;
  const currentTable = progress?.currentTable ?? progress?.table ?? 'Preparing';
  const isVerifying = phase?.phase?.startsWith('verifying') ?? false;
  const isCutover = phase?.phase === 'finalizing';

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-2xl rounded-xl border border-[var(--nim-border)] bg-[var(--nim-bg-primary)] p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h4 className="text-lg font-semibold text-[var(--nim-text)]">迁移到 SQLite</h4>
            <p className="mt-1 text-sm text-[var(--nim-text-muted)]">
              此操作将一次性完成，并保留原始 PGLite 目录以供回滚。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            className="rounded-md px-2 py-1 text-sm text-[var(--nim-text-muted)] hover:bg-[var(--nim-bg-secondary)] disabled:opacity-40"
          >
            关闭
          </button>
        </div>

        {preflightError && (
          <div className="rounded-md border border-[rgba(220,38,38,0.3)] bg-[rgba(220,38,38,0.1)] p-3 text-sm text-[var(--nim-text)]">
            预检失败：{preflightError}
          </div>
        )}

        {!running && !summary && !failure && preflight && (
          <div className="space-y-4">
            <div className="rounded-md border border-[var(--nim-border)] bg-[var(--nim-bg-secondary)] p-4 text-sm">
              <div className="mb-2 font-medium text-[var(--nim-text)]">预检</div>
              <div className="space-y-2 text-[var(--nim-text-muted)]">
                <div>磁盘空间：{formatBytes(preflight.freeBytes)} 可用 / 需要 {formatBytes(preflight.requiredBytes)} {preflight.ok ? '通过' : '不足'}</div>
                <div>PGLite 大小：{formatBytes(preflight.pgliteDirBytes)}</div>
                {!preflight.ok && preflight.reason && <div className="text-[var(--nim-error)]">{preflight.reason}</div>}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-md border border-[var(--nim-border)] px-3 py-2 text-sm text-[var(--nim-text)]">
                取消
              </button>
              <button
                type="button"
                onClick={onStart}
                disabled={!preflight.ok}
                className="rounded-md bg-[var(--nim-primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                开始迁移
              </button>
            </div>
          </div>
        )}

        {running && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-[var(--nim-text)]">
                {isCutover ? '正在切换到新数据库' : isVerifying ? '正在验证迁移' : '正在迁移数据'}
              </div>
              <div className="mt-1 text-sm text-[var(--nim-text-muted)]">
                {isCutover ? '正在保留之前的 PGLite 目录并切换活动后端。' : isVerifying ? `阶段：${phase?.phase}` : `${currentTable}：${progress?.tableRowsCopied ?? 0} / ${progress?.tableRowsExpected ?? 0}`}
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-2 overflow-hidden rounded-full bg-[var(--nim-bg-secondary)]">
                <div className="h-full bg-[var(--nim-primary)]" style={{ width: `${progress?.percentOfTotal ?? 0}%` }} />
              </div>
              <div className="flex justify-between text-xs text-[var(--nim-text-muted)]">
                <span>表 {progress?.tablesCompleted ?? 0} / {progress?.tablesTotal ?? 0}</span>
                <span>{Math.round(progress?.percentOfTotal ?? 0)}%</span>
              </div>
              <div className="text-xs text-[var(--nim-text-muted)]">
                已转移行数：{(progress?.totalRowsCopied ?? 0).toLocaleString()} · 已耗时：{formatDuration(progress?.elapsedMs ?? 0)}
              </div>
            </div>
          </div>
        )}

        {summary && (
          <div className="space-y-4">
            <div className="rounded-md border border-[var(--nim-border)] bg-[var(--nim-bg-secondary)] p-4">
              <div className="text-sm font-medium text-[var(--nim-text)]">迁移完成</div>
              <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                <Stat label="已转移行数" value={summary.totalRowsCopied.toLocaleString()} />
                <Stat label="已迁移表数" value={String(summary.tablesCopied.length)} />
                <Stat label="耗时" value={formatDuration(summary.durationMs)} />
                <Stat label="完整性" value={summary.integrityCheck} ok={summary.integrityCheck === 'ok'} />
              </div>
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="rounded-md bg-[var(--nim-primary)] px-3 py-2 text-sm font-medium text-white">
                继续
              </button>
            </div>
          </div>
        )}

        {failure && (
          <div className="space-y-4">
            <div className="rounded-md border border-[rgba(220,38,38,0.3)] bg-[rgba(220,38,38,0.1)] p-4 text-sm text-[var(--nim-text)]">
              <div className="font-medium">迁移未完成</div>
              <div className="mt-2">阶段：{failure.phase}</div>
              <div className="mt-1">{failure.message}</div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onCopyDiagnostic} className="rounded-md border border-[var(--nim-border)] px-3 py-2 text-sm text-[var(--nim-text)]">
                复制诊断信息
              </button>
              <button type="button" onClick={onClose} className="rounded-md bg-[var(--nim-primary)] px-3 py-2 text-sm font-medium text-white">
                继续使用 PGLite
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const PHASE_LABELS: Record<string, string> = {
  preparing: '准备中',
  copying: '复制数据中',
  'rebuilding-fts': '重建全文搜索索引',
  'verifying-counts': '验证行数',
  'verifying-spot-check': '抽检已复制行',
  'verifying-integrity': '验证数据库完整性',
  'verifying-foreign-keys': '验证外键',
  finalizing: '最终处理',
};

function DryRunProgress({
  phase,
  progress,
}: {
  phase: PhaseEvent | null;
  progress: ProgressEvent | null;
}): React.ReactElement {
  const phaseKey = phase?.phase ?? progress?.phase ?? 'preparing';
  const phaseLabel = PHASE_LABELS[phaseKey] ?? phaseKey;
  const currentTable = progress?.currentTable ?? phase?.info?.currentTable;
  const tableRowsCopied = progress?.tableRowsCopied ?? 0;
  const tableRowsExpected = progress?.tableRowsExpected ?? 0;
  const rowsCopied = progress?.rowsCopied ?? 0;
  const rowsExpected = progress?.rowsExpected ?? 0;
  const tablesCompleted = progress?.tablesCompleted ?? 0;
  const tablesTotal = progress?.tablesTotal ?? 0;
  const percent = progress?.percentOfTotal ?? 0;
  const elapsed = progress?.elapsedMs ?? 0;
  const isCopying = phaseKey === 'copying';

  return (
    <div className="mt-3 space-y-2 rounded-md border border-[var(--nim-border)] bg-[var(--nim-bg-secondary)] p-3 text-xs nim-database-dry-run-progress">
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-medium text-[var(--nim-text)]">{phaseLabel}</div>
        {currentTable && (
          <div className="text-[var(--nim-text-muted)]">{currentTable}</div>
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--nim-bg-primary)]">
        <div
          className="h-full bg-[var(--nim-primary)] transition-all"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-[var(--nim-text-muted)]">
        <span>
          表 {tablesCompleted} / {tablesTotal}
        </span>
        <span>
          行数 {rowsCopied.toLocaleString()}
          {rowsExpected > 0 && ` / ${rowsExpected.toLocaleString()}`}
        </span>
        <span>已耗时 {formatDuration(elapsed)}</span>
      </div>
      {isCopying && tableRowsExpected > 0 && (
        <div className="text-[var(--nim-text-muted)]">
          当前表：{tableRowsCopied.toLocaleString()} / {tableRowsExpected.toLocaleString()}
        </div>
      )}
    </div>
  );
}

function AdoptDryRunSection({
  available,
  running,
  phase,
  progress,
  error,
  result,
  onAdopt,
}: {
  available: { completedAt: string; totalRows: number };
  running: boolean;
  phase: PhaseEvent | null;
  progress: ProgressEvent | null;
  error: string | null;
  result: { rowsAdded: number; durationMs: number } | null;
  onAdopt: () => void;
}): React.ReactElement {
  const ageHrs = (Date.now() - new Date(available.completedAt).getTime()) / 3_600_000;
  const ageBlurb = ageHrs < 1
    ? 'less than an hour ago'
    : ageHrs < 24
      ? `${Math.round(ageHrs)} hour${ageHrs >= 1.5 ? 's' : ''} ago`
      : `${Math.round(ageHrs / 24)} day${ageHrs >= 36 ? 's' : ''} ago`;
  return (
    <div className="mt-4 p-4 rounded-md border border-[var(--nim-border)] bg-[var(--nim-bg-secondary)] nim-database-adopt-dry-run">
      <div className="text-sm font-medium text-[var(--nim-text)] mb-1">
        切换到试运行的 SQLite 副本
      </div>
      <p className="text-xs text-[var(--nim-text-muted)] mb-3">
        {ageBlurb}的成功试运行已保存在磁盘上
        ({available.totalRows.toLocaleString()} 行)。Nimbalyst 可以将其
        提升为你的活动数据库 — 会复制试运行后的新数据，
        然后切换后端标志。当前 PGLite 目录将保留以供回滚。
      </p>
      <button
        type="button"
        onClick={onAdopt}
        disabled={running}
        className="setting-button inline-flex items-center gap-2 py-1.5 px-3 rounded-md text-sm font-medium bg-[var(--nim-primary)] text-white border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--nim-primary-hover)] nim-database-adopt-button"
      >
        <MaterialSymbol icon={running ? 'sync' : 'swap_horiz'} size={16} />
        {running ? '切换中...' : '切换到此 SQLite 副本'}
      </button>

      {running && (phase || progress) && (
        <DryRunProgress phase={phase} progress={progress} />
      )}

      {error && (
        <div className="mt-3 p-3 rounded-md bg-[rgba(220,38,38,0.1)] border border-[rgba(220,38,38,0.3)] text-sm text-[var(--nim-text)]">
          切换失败：{error}
        </div>
      )}

      {result && (
        <div className="mt-3 p-3 rounded-md border border-[var(--nim-border)] bg-[var(--nim-bg-primary)] text-sm text-[var(--nim-text)]">
          已切换到 SQLite。追加了 {result.rowsAdded.toLocaleString()} 条新
          记录，耗时 {formatDuration(result.durationMs)}。
          请重新启动 Nimbalyst 以使更改生效。
        </div>
      )}
    </div>
  );
}
