import React, { useEffect, useState, useCallback } from 'react';
import { MaterialSymbol, copyToClipboard } from '@nimbalyst/runtime';
import { buildShareUrl } from '../../../store/atoms/sessionShares';

interface SharedLink {
  shareId: string;
  sessionId: string;
  title: string;
  sizeBytes: number;
  createdAt: string;
  expiresAt: string | null;
  viewCount: number;
}

type PanelState = 'loading' | 'loaded' | 'unauthenticated' | 'error';

/**
 * Shared Links settings panel.
 * Displays and manages all shared file and session links for the current user.
 * Self-contained - fetches data via IPC, no props needed.
 */
export const SharedLinksPanel: React.FC = () => {
  const [shares, setShares] = useState<SharedLink[]>([]);
  const [shareKeys, setShareKeys] = useState<Record<string, string>>({});
  const [state, setState] = useState<PanelState>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchShares = useCallback(async () => {
    setState('loading');
    try {
      const [result, keys] = await Promise.all([
        (window as any).electronAPI?.listShares(),
        (window as any).electronAPI?.getShareKeys(),
      ]);
      if (keys) {
        setShareKeys(keys);
      }
      if (result?.success && result.shares) {
        setShares(result.shares);
        setState('loaded');
      } else if (result?.error?.includes('Not signed in')) {
        setState('unauthenticated');
      } else {
        setErrorMessage(result?.error || 'Failed to load shares');
        setState('error');
      }
    } catch (error) {
      setErrorMessage(String(error));
      setState('error');
    }
  }, []);

  useEffect(() => {
    fetchShares();
  }, [fetchShares]);

  const handleDelete = async (share: SharedLink) => {
    setDeletingId(share.shareId);
    try {
      const result = await (window as any).electronAPI?.deleteShare({
        shareId: share.shareId,
        sessionId: typeof share.sessionId === 'string' ? share.sessionId : undefined,
      });
      if (result?.success) {
        setShares(prev => prev.filter(s => s.shareId !== share.shareId));
      }
    } catch (error) {
      console.error('[SharedLinksPanel] Delete failed:', error);
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopyLink = (share: SharedLink) => {
    const key = typeof share.sessionId === 'string' ? shareKeys[share.sessionId] : undefined;
    const url = buildShareUrl(share.shareId, key);
    copyToClipboard(url);
    setCopiedId(share.shareId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatExpiry = (expiresAt: string | null) => {
    if (!expiresAt) return '无过期时间';
    const expires = new Date(expiresAt);
    const now = new Date();
    const diffMs = expires.getTime() - now.getTime();
    if (diffMs <= 0) return '已过期';
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (days === 1) return '明天过期';
    return `${days} 天后过期`;
  };

  const getShareKindLabel = (share: SharedLink) =>
    typeof share.sessionId === 'string' && share.sessionId.startsWith('file:') ? '文件' : '会话';

  return (
    <div className="provider-panel max-w-2xl">
      <div className="provider-panel-header flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-[var(--nim-text)] m-0">共享链接</h3>
          <p className="text-[0.8125rem] text-[var(--nim-text-muted)] mt-1 mb-0">
            管理你为文件和会话分享的链接。任何拥有链接的人都可以查看内容。
          </p>
        </div>
        {state === 'loaded' && shares.length > 0 && (
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 text-[0.8125rem] text-[var(--nim-text-muted)] bg-transparent border border-[var(--nim-border)] rounded-md cursor-pointer transition-colors duration-150 hover:bg-[var(--nim-bg-hover)] hover:text-[var(--nim-text)]"
            onClick={fetchShares}
          >
            <MaterialSymbol icon="refresh" size={14} />
            刷新
          </button>
        )}
      </div>

      {/* Loading state */}
      {state === 'loading' && (
        <div className="flex items-center justify-center py-12 text-[var(--nim-text-muted)]">
          <MaterialSymbol icon="progress_activity" size={20} className="animate-spin mr-2" />
          加载共享链接中...
        </div>
      )}

      {/* Unauthenticated state */}
      {state === 'unauthenticated' && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <MaterialSymbol icon="account_circle" size={32} className="text-[var(--nim-text-faint)] mb-3" />
          <p className="text-[0.8125rem] text-[var(--nim-text-muted)] mb-2">
            登录以分享文件和会话。
          </p>
          <p className="text-[0.75rem] text-[var(--nim-text-faint)]">
            前往"账户与同步"设置你的账户。
          </p>
        </div>
      )}

      {/* Error state */}
      {state === 'error' && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <MaterialSymbol icon="error" size={32} className="text-[var(--nim-error)] mb-3" />
          <p className="text-[0.8125rem] text-[var(--nim-text-muted)] mb-2">
            {errorMessage}
          </p>
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 text-[0.8125rem] text-[var(--nim-text)] bg-transparent border border-[var(--nim-border)] rounded-md cursor-pointer transition-colors duration-150 hover:bg-[var(--nim-bg-hover)]"
            onClick={fetchShares}
          >
            <MaterialSymbol icon="refresh" size={14} />
            重试
          </button>
        </div>
      )}

      {/* Empty state */}
      {state === 'loaded' && shares.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <MaterialSymbol icon="link" size={32} className="text-[var(--nim-text-faint)] mb-3" />
          <p className="text-[0.8125rem] text-[var(--nim-text-muted)] mb-1">
            暂无共享链接。
          </p>
          <p className="text-[0.75rem] text-[var(--nim-text-faint)]">
            右键点击文件或会话，选择"分享链接"即可创建。
          </p>
        </div>
      )}

      {/* Shares list */}
      {state === 'loaded' && shares.length > 0 && (
        <div className="flex flex-col gap-0 border border-[var(--nim-border)] rounded-lg overflow-hidden">
          {shares.map((share, index) => (
            <div
              key={share.shareId}
              className={`flex items-start gap-3 px-4 py-3 bg-[var(--nim-bg)] ${index < shares.length - 1 ? 'border-b border-[var(--nim-border)]' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[0.8125rem] font-medium text-[var(--nim-text)] truncate">
                    {share.title || '无标题'}
                  </span>
                  <span className="shrink-0 px-1.5 py-0.5 rounded bg-[var(--nim-bg-hover)] text-[0.625rem] uppercase tracking-[0.04em] text-[var(--nim-text-faint)]">
                    {getShareKindLabel(share)}
                  </span>
                  <span className="shrink-0 text-[0.6875rem] text-[var(--nim-text-faint)]">
                    {share.viewCount} 次查看
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[0.6875rem] text-[var(--nim-text-faint)]">
                  <span className="truncate">share.nimbalyst.com/share/{share.shareId.slice(0, 8)}...</span>
                  <span>{formatDate(share.createdAt)}</span>
                  <span>{formatSize(share.sizeBytes)}</span>
                  {formatExpiry(share.expiresAt) && (
                    <span className={formatExpiry(share.expiresAt) === '已过期' ? 'text-[var(--nim-error)]' : ''}>
                      {formatExpiry(share.expiresAt)}
                    </span>
                  )}
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-1">
                <button
                  className="flex items-center justify-center w-7 h-7 rounded-md bg-transparent border-none text-[var(--nim-text-faint)] cursor-pointer transition-colors duration-150 hover:text-[var(--nim-text)] hover:bg-[var(--nim-bg-hover)]"
                  title="复制链接"
                  onClick={() => handleCopyLink(share)}
                >
                  <MaterialSymbol icon={copiedId === share.shareId ? 'check' : 'content_copy'} size={14} />
                </button>
                <button
                  className="flex items-center justify-center w-7 h-7 rounded-md bg-transparent border-none text-[var(--nim-text-faint)] cursor-pointer transition-colors duration-150 hover:text-[var(--nim-error)] hover:bg-[var(--nim-bg-hover)] disabled:opacity-50 disabled:cursor-default"
                  title="删除共享链接"
                  onClick={() => handleDelete(share)}
                  disabled={deletingId === share.shareId}
                >
                  <MaterialSymbol
                    icon={deletingId === share.shareId ? 'progress_activity' : 'delete'}
                    size={14}
                    className={deletingId === share.shareId ? 'animate-spin' : ''}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
