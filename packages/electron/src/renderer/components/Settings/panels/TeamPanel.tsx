import React, { useState, useEffect, useCallback } from 'react';
import { MaterialSymbol } from '@nimbalyst/runtime';
import { useDialogState } from '../../../contexts/DialogContext';
import { DIALOG_IDS } from '../../../dialogs/registry';
import type { CreateTeamData } from '../../../dialogs/teamDialogs';
import { AlphaBadge, SETTINGS_ALPHA_TOOLTIP } from '../../common/AlphaBadge';

// ============================================================================
// Types
// ============================================================================

type TrustStatus = 'verified' | 'pending' | 'unverified' | 'fingerprint-changed';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  trustStatus: TrustStatus;
  avatarColor: string;
  isYou?: boolean;
  invitedAt?: string;
}

interface MemberFingerprint {
  fingerprint: string;
  trustStatus: 'verified' | 'fingerprint-changed' | 'unverified';
}

interface TeamData {
  orgId: string;
  name: string;
  gitRemote: string;
  gitRemoteHash: string | null;
  members: TeamMember[];
  callerRole: string;
  membershipType?: string;
}

interface PendingInvite {
  orgId: string;
  name: string;
  membershipType: string;
}

interface TeamPanelProps {
  workspacePath?: string;
}

const AVATAR_COLORS = ['#60a5fa', '#a78bfa', '#4ade80', '#fbbf24', '#f472b6', '#34d399'];

function getAvatarColor(index: number): string {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

// ============================================================================
// Sub-components
// ============================================================================

function MemberAvatar({ name, email, color, isPending }: {
  name?: string;
  email: string;
  color: string;
  isPending?: boolean;
}) {
  if (isPending) {
    return (
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-[var(--nim-bg-tertiary)] text-[var(--nim-text-faint)]">
        <MaterialSymbol icon="mail" size={14} />
      </div>
    );
  }

  const initial = (name?.[0] || email[0] || '?').toUpperCase();
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[13px] font-semibold text-white"
      style={{ background: color }}
    >
      {initial}
    </div>
  );
}

function TrustStatusIcon({ status, onClick }: { status: TrustStatus; onClick?: () => void }) {
  const clickProps = onClick ? { onClick, role: 'button' as const, tabIndex: 0, style: { cursor: 'pointer' } } : {};

  if (status === 'verified') {
    return (
      <span className="flex items-center text-[var(--nim-success)]" title="身份已验证" {...clickProps}>
        <MaterialSymbol icon="verified_user" size={14} fill />
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span className="flex items-center text-[var(--nim-warning)]" title="待处理">
        <MaterialSymbol icon="schedule" size={14} />
      </span>
    );
  }
  if (status === 'fingerprint-changed') {
    return (
      <span className="flex items-center text-[var(--nim-error)]" title="验证后密钥已变更" {...clickProps}>
        <MaterialSymbol icon="gpp_maybe" size={14} fill />
      </span>
    );
  }
  return (
    <span className="flex items-center text-[#f97316]" title="未验证" {...clickProps}>
      <MaterialSymbol icon="shield" size={14} />
    </span>
  );
}

function RoleBadge({ role, editable, onChange }: { role: 'admin' | 'member'; editable?: boolean; onChange?: (newRole: 'admin' | 'member') => void }) {
  const colorClass = role === 'admin'
    ? 'bg-[rgba(96,165,250,0.15)] text-[var(--nim-primary)]'
    : 'bg-[rgba(180,180,180,0.1)] text-[var(--nim-text-faint)]';

  if (editable && onChange) {
    return (
      <select
        value={role}
        onChange={(e) => onChange(e.target.value as 'admin' | 'member')}
        className={`${colorClass} px-[5px] py-[2px] rounded-[10px] text-[10px] font-semibold border-none cursor-pointer outline-none hover:ring-1 hover:ring-[var(--nim-primary)]`}
      >
        <option value="admin">管理员</option>
        <option value="member">成员</option>
      </select>
    );
  }

  return (
    <span className={`${colorClass} px-[7px] py-[2px] rounded-[10px] text-[10px] font-semibold`}>
      {role === 'admin' ? '管理员' : '成员'}
    </span>
  );
}

function PendingBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-[7px] py-[2px] rounded-[10px] text-[10px] font-semibold bg-[rgba(251,191,36,0.15)] text-[var(--nim-warning)]">
      <MaterialSymbol icon="schedule" size={8} />
      待处理
    </span>
  );
}

function TeamPricingNotice() {
  return (
    <div className="mt-2.5 flex items-start gap-1.5 text-[12px] leading-relaxed text-[var(--nim-text-faint)]">
      <MaterialSymbol icon="info" size={13} className="mt-[2px] shrink-0" />
      <span>
        Nimbalyst 团队在 Alpha 阶段<span className="text-[var(--nim-text-muted)]">完全免费</span>。我们计划在未来推出团队付费订阅方案；现有团队将在任何价格变动前收到提前通知。
      </span>
    </div>
  );
}

function EncryptionCard() {
  return (
    <div className="p-3.5 bg-[var(--nim-bg-secondary)] border border-[var(--nim-border)] rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <MaterialSymbol icon="lock" size={16} className="text-[var(--nim-success)]" />
        <span className="text-[13px] font-semibold text-[var(--nim-success)]">
          端到端加密
        </span>
      </div>
      <p className="m-0 mb-2 text-[12px] text-[var(--nim-text-muted)] leading-relaxed">
        团队数据通过 ECDH 密钥交换共享的密钥进行加密。服务器永远无法看到你的数据。
      </p>
      <ul className="m-0 pl-5 text-[12px] text-[var(--nim-text)] leading-7">
        <li>加密密钥直接在团队成员之间共享</li>
        <li>只有经过验证的团队成员才能解密共享数据</li>
        <li>移除成员时会轮换加密密钥</li>
      </ul>
    </div>
  );
}

function ErrorBanner({ error, onDismiss }: { error: string; onDismiss: () => void }) {
  return (
    <div className="flex items-center gap-2 p-2.5 mb-3 bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] rounded-md">
      <MaterialSymbol icon="error" size={14} className="text-[var(--nim-error)] shrink-0" />
      <span className="flex-1 text-[12px] text-[var(--nim-error)]">{error}</span>
      <button
        onClick={onDismiss}
        className="shrink-0 bg-transparent border-none cursor-pointer text-[var(--nim-text-faint)]"
      >
        <MaterialSymbol icon="close" size={14} />
      </button>
    </div>
  );
}

// ============================================================================
// Member Fingerprint Detail (expandable row)
// ============================================================================

function MemberFingerprintDetail({ member, fingerprint, onVerify, onRevoke, onReshareKey, isAdmin }: {
  member: TeamMember;
  fingerprint: MemberFingerprint | null;
  onVerify: () => void;
  onRevoke: () => void;
  onReshareKey?: () => void;
  isAdmin?: boolean;
}) {
  if (!fingerprint) {
    return (
      <div className="px-3.5 py-2.5 bg-[var(--nim-bg)] text-[12px] text-[var(--nim-text-faint)]">
        正在加载指纹信息...
      </div>
    );
  }

  const shortFingerprint = fingerprint.fingerprint.split(':').slice(0, 16).join(':');

  return (
    <div className="px-3.5 py-3 bg-[var(--nim-bg)] border-b border-[var(--nim-bg-secondary)]">
      {fingerprint.trustStatus === 'fingerprint-changed' && (
        <div className="flex items-center gap-2 p-2 mb-2.5 bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] rounded">
          <MaterialSymbol icon="warning" size={14} className="text-[var(--nim-error)] shrink-0" />
          <span className="text-[11px] text-[var(--nim-error)]">
            此成员的身份密钥自上次验证以来已发生变更。
            在信任其数据之前，请先验证其新指纹。
          </span>
        </div>
      )}

      <div className="mb-2">
        <div className="text-[11px] text-[var(--nim-text-faint)] mb-1">身份密钥指纹</div>
        <div className="px-2.5 py-2 bg-[var(--nim-bg-secondary)] rounded font-mono text-[11px] text-[var(--nim-text-muted)] leading-relaxed break-all select-text">
          {shortFingerprint}
        </div>
      </div>

      <p className="text-[11px] text-[var(--nim-text-faint)] leading-relaxed mb-2.5 m-0">
        请通过其他渠道（如当面或通过安全通道）与 {member.name || member.email} 核对此指纹以验证其身份。
      </p>

      <div className="flex items-center gap-2">
        {fingerprint.trustStatus === 'verified' ? (
          <button
            onClick={onRevoke}
            className="px-2.5 py-1 text-[11px] bg-transparent border border-[rgba(239,68,68,0.4)] rounded text-[var(--nim-error)] cursor-pointer hover:bg-[rgba(239,68,68,0.1)]"
          >
            撤销信任
          </button>
        ) : (
          <button
            onClick={onVerify}
            className="px-2.5 py-1 text-[11px] bg-[var(--nim-success)] border-none rounded text-white cursor-pointer hover:opacity-90"
          >
            标记为已验证
          </button>
        )}
        {isAdmin && onReshareKey && (
          <button
            onClick={onReshareKey}
            className="px-2.5 py-1 text-[11px] bg-transparent border border-[var(--nim-border)] rounded text-[var(--nim-text-muted)] cursor-pointer hover:bg-[var(--nim-bg-hover)]"
            title="重新与此成员共享加密密钥（例如更换设备后）"
          >
            重新共享密钥
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// No Team State
// ============================================================================

function NoTeamState({ gitRemote, onCreateTeam, loading }: {
  gitRemote: string;
  onCreateTeam: () => void;
  loading?: boolean;
}) {
  return (
    <>
      {/* CTA Card */}
      <div className="provider-panel-section py-4 mb-4 border-b border-[var(--nim-border)] last:border-b-0 last:mb-0 last:pb-0">
        <div className="p-6 bg-[var(--nim-bg-secondary)] rounded-lg text-center">
          <div className="w-12 h-12 mx-auto mb-3 bg-[rgba(96,165,250,0.15)] rounded-xl flex items-center justify-center">
            <MaterialSymbol icon="group" size={24} className="text-[var(--nim-primary)]" />
          </div>
          <p className="text-[13px] text-[var(--nim-text-muted)] mb-4 leading-relaxed">
            此项目为个人项目。创建团队即可共享看板项目、文档，并实时协作。
          </p>
          <button
            onClick={onCreateTeam}
            disabled={loading}
            className={`inline-flex items-center gap-1.5 px-5 py-2 bg-[var(--nim-primary)] border-none rounded-md text-white text-[13px] font-medium ${
              loading ? 'cursor-wait opacity-70' : 'cursor-pointer'
            }`}
          >
            <MaterialSymbol icon="add" size={14} />
            {loading ? '创建中...' : '创建团队'}
          </button>
        </div>
      </div>

      {/* Project Identity */}
      <div className="provider-panel-section py-4 mb-4 border-b border-[var(--nim-border)] last:border-b-0 last:mb-0 last:pb-0">
        <h4 className="provider-panel-section-title text-[15px] font-semibold mb-2 text-[var(--nim-text)]">
          项目身份
        </h4>
        <p className="text-[13px] leading-relaxed text-[var(--nim-text-muted)] mb-3">
          团队与 Git 远程仓库关联，打开同一仓库克隆的成员会自动连接。
        </p>
        <div className="flex items-center gap-2 px-3 py-2.5 bg-[var(--nim-bg-secondary)] rounded-md">
          <MaterialSymbol icon="commit" size={16} className="text-[var(--nim-text-faint)]" />
          <span className="text-[12px] font-mono text-[var(--nim-text-muted)]">
            {gitRemote || '未检测到 Git 远程仓库'}
          </span>
        </div>
      </div>

      {/* Encryption Footer */}
      <div className="provider-panel-section py-4">
        <EncryptionCard />
      </div>
    </>
  );
}

// ============================================================================
// Team Exists State
// ============================================================================

function TeamExistsState({ team, onInvite, onRemoveMember, onDeleteTeam, onLinkProject, onUnlinkProject, isAdmin, localGitRemote, fingerprints, myFingerprint, onVerifyMember, onRevokeTrust, onReshareKey, onUpdateRole }: {
  team: TeamData;
  onInvite: (email: string) => void;
  onRemoveMember: (memberId: string) => void;
  onDeleteTeam: () => void;
  onLinkProject: () => void;
  onUnlinkProject: () => void;
  isAdmin: boolean;
  localGitRemote: string;
  fingerprints: Map<string, MemberFingerprint>;
  myFingerprint: string | null;
  onVerifyMember: (memberId: string, fingerprint: string) => void;
  onRevokeTrust: (memberId: string) => void;
  onReshareKey: (memberId: string) => void;
  onUpdateRole: (memberId: string, newRole: 'admin' | 'member') => void;
}) {
  const [inviteEmail, setInviteEmail] = useState('');
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);

  const handleInvite = () => {
    if (inviteEmail.trim()) {
      onInvite(inviteEmail.trim());
      setInviteEmail('');
    }
  };

  const handleInviteKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleInvite();
    }
  };

  return (
    <>
      {/* Team Header Card */}
      <div className="provider-panel-section py-4 mb-4 border-b border-[var(--nim-border)] last:border-b-0 last:mb-0 last:pb-0">
        <div className="flex items-center gap-3 p-3 bg-[var(--nim-bg-secondary)] rounded-lg">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#60a5fa] to-[#a78bfa] flex items-center justify-center shrink-0">
            <MaterialSymbol icon="group" size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold text-[var(--nim-text)]">{team.name}</div>
            <div className="text-[11px] text-[var(--nim-text-faint)] font-mono overflow-hidden text-ellipsis whitespace-nowrap">
              {team.gitRemote || '未关联项目'}
            </div>
          </div>
        </div>
      </div>

      {/* Project Identity */}
      <div className="provider-panel-section py-4 mb-4 border-b border-[var(--nim-border)] last:border-b-0 last:mb-0 last:pb-0">
        <h4 className="provider-panel-section-title text-[15px] font-semibold mb-2 text-[var(--nim-text)]">
          项目身份
        </h4>
        <p className="text-[12px] text-[var(--nim-text-muted)] mb-3 leading-relaxed">
          团队与 Git 远程仓库关联。打开同一仓库克隆的成员会自动连接。
        </p>
        {team.gitRemoteHash ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 px-3 py-2.5 bg-[var(--nim-bg-secondary)] rounded-md">
              <MaterialSymbol icon="link" size={14} className="text-[var(--nim-success)] shrink-0" />
              <span className="text-[12px] font-mono text-[var(--nim-text-muted)] overflow-hidden text-ellipsis whitespace-nowrap">
                {localGitRemote || `${team.gitRemoteHash.slice(0, 12)}...`}
              </span>
            </div>
            {isAdmin && (
              <button
                onClick={onUnlinkProject}
                className="px-2.5 py-2 text-[11px] bg-transparent border border-[var(--nim-border)] rounded text-[var(--nim-text-faint)] cursor-pointer hover:bg-[var(--nim-bg-hover)] shrink-0"
              >
                取消关联
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-[var(--nim-bg-secondary)] rounded-md">
            <MaterialSymbol icon="link_off" size={14} className="text-[var(--nim-text-faint)] shrink-0" />
            <span className="flex-1 text-[12px] text-[var(--nim-text-faint)]">
              未关联项目
            </span>
            {isAdmin && localGitRemote && (
              <button
                onClick={onLinkProject}
                className="px-2.5 py-1 text-[11px] bg-[var(--nim-primary)] border-none rounded text-white cursor-pointer"
              >
                关联此项目
              </button>
            )}
          </div>
        )}
      </div>

      {/* Members Section */}
      <div className="provider-panel-section py-4 mb-4 border-b border-[var(--nim-border)] last:border-b-0 last:mb-0 last:pb-0">
        <h4 className="provider-panel-section-title text-[15px] font-semibold mb-2 text-[var(--nim-text)] flex items-center justify-between">
          <span>成员</span>
          <span className="text-[11px] font-normal text-[var(--nim-text-faint)]">
            {team.members.length} {team.members.length === 1 ? '位成员' : '位成员'}
          </span>
        </h4>

        <div className="bg-[var(--nim-bg-secondary)] rounded-lg overflow-hidden">
          {team.members.map((member) => {
            const fp = fingerprints.get(member.id);
            // Use fingerprint-based trust for non-pending members
            const displayTrustStatus: TrustStatus = member.trustStatus === 'pending'
              ? 'pending'
              : fp?.trustStatus === 'verified'
                ? 'verified'
                : fp?.trustStatus === 'fingerprint-changed'
                  ? 'fingerprint-changed'
                  : 'unverified';
            const isExpanded = expandedMemberId === member.id;
            const canExpand = member.trustStatus !== 'pending' && !member.isYou;

            return (
              <div key={member.id}>
                <div
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 border-b border-[var(--nim-bg)] last:border-b-0 ${
                    member.trustStatus === 'pending' ? 'opacity-70' : ''
                  }`}
                >
                  <MemberAvatar
                    name={member.name}
                    email={member.email}
                    color={member.avatarColor}
                    isPending={member.trustStatus === 'pending'}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-[var(--nim-text)] flex items-center gap-1.5">
                      {member.trustStatus === 'pending' ? member.email : (member.name || member.email)}
                      {member.isYou && (
                        <span className="text-[10px] text-[var(--nim-text-faint)] font-normal">（你）</span>
                      )}
                    </div>
                    {member.trustStatus === 'pending' ? (
                      <div className="text-[11px] text-[var(--nim-text-faint)]">
                        已邀请 {member.invitedAt || '最近'}
                      </div>
                    ) : (
                      <div className="text-[11px] text-[var(--nim-text-faint)]">{member.email}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {member.trustStatus === 'pending' ? (
                      <PendingBadge />
                    ) : (
                      <>
                        <RoleBadge
                          role={member.role}
                          editable={isAdmin && !member.isYou}
                          onChange={(newRole) => onUpdateRole(member.id, newRole)}
                        />
                        <TrustStatusIcon
                          status={displayTrustStatus}
                          onClick={canExpand ? () => setExpandedMemberId(isExpanded ? null : member.id) : undefined}
                        />
                      </>
                    )}
                  </div>
                  {!member.isYou && isAdmin && (
                    <div className="shrink-0">
                      <button
                        onClick={() => onRemoveMember(member.id)}
                        className={`px-2.5 py-1 text-[11px] bg-transparent border rounded cursor-pointer ${
                          member.trustStatus === 'pending'
                            ? 'border-[var(--nim-border)] text-[var(--nim-text-disabled)] hover:bg-[var(--nim-bg-hover)]'
                            : 'border-[rgba(239,68,68,0.4)] text-[var(--nim-error)] hover:bg-[rgba(239,68,68,0.1)]'
                        }`}
                      >
                        {member.trustStatus === 'pending' ? '撤回邀请' : '移除'}
                      </button>
                    </div>
                  )}
                </div>
                {isExpanded && canExpand && (
                  <MemberFingerprintDetail
                    member={member}
                    fingerprint={fp || null}
                    onVerify={() => {
                      if (fp) onVerifyMember(member.id, fp.fingerprint);
                    }}
                    onRevoke={() => onRevokeTrust(member.id)}
                    onReshareKey={() => onReshareKey(member.id)}
                    isAdmin={isAdmin}
                  />
                )}
              </div>
            );
          })}

          {/* Invite Input Row (admin only) */}
          {isAdmin && (
            <div className="flex items-center gap-2 px-3.5 py-2 border-t border-[var(--nim-bg)] bg-[rgba(255,255,255,0.02)]">
              <MaterialSymbol icon="add" size={14} className="text-[var(--nim-text-disabled)] shrink-0" />
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={handleInviteKeyDown}
                placeholder="输入邮箱地址以邀请..."
                className="flex-1 py-1.5 px-2.5 border border-[var(--nim-border)] rounded bg-[var(--nim-bg)] text-[var(--nim-text)] text-[12px] outline-none placeholder:text-[var(--nim-text-disabled)]"
              />
              <button
                onClick={handleInvite}
                disabled={!inviteEmail.trim()}
                className={`px-3 py-1.5 bg-[var(--nim-primary)] border-none rounded text-white text-[12px] font-medium whitespace-nowrap ${
                  inviteEmail.trim()
                    ? 'cursor-pointer opacity-100'
                    : 'cursor-not-allowed opacity-50'
                }`}
              >
                邀请
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Your Fingerprint */}
      {myFingerprint && (
        <div className="provider-panel-section py-4 mb-4 border-b border-[var(--nim-border)] last:border-b-0 last:mb-0 last:pb-0">
          <h4 className="provider-panel-section-title text-[15px] font-semibold mb-2 text-[var(--nim-text)]">
            你的指纹
          </h4>
          <p className="text-[12px] text-[var(--nim-text-muted)] mb-2 leading-relaxed">
            将此指纹分享给你的团队成员，以便他们验证你的身份。
          </p>
          <div className="px-2.5 py-2 bg-[var(--nim-bg-secondary)] rounded font-mono text-[11px] text-[var(--nim-text-muted)] leading-relaxed break-all select-text">
            {myFingerprint.split(':').slice(0, 16).join(':')}
          </div>
        </div>
      )}

      {/* Encryption Footer */}
      <div className="provider-panel-section py-4 mb-4 border-b border-[var(--nim-border)] last:border-b-0 last:mb-0 last:pb-0">
        <EncryptionCard />
      </div>

      {/* Danger Zone */}
      {isAdmin && (
        <div className="provider-panel-section py-4">
          <h4 className="provider-panel-section-title text-[13px] font-semibold mb-2 text-[var(--nim-text-muted)]">
            危险操作
          </h4>
          <button
            onClick={onDeleteTeam}
            className="px-3.5 py-1.5 text-[12px] bg-transparent border border-[rgba(239,68,68,0.4)] rounded-md text-[var(--nim-error)] cursor-pointer hover:bg-[rgba(239,68,68,0.1)]"
          >
            删除团队
          </button>
        </div>
      )}
    </>
  );
}

// ============================================================================
// Invite Pending State
// ============================================================================

function InvitePendingState({ invite, onAccept, loading, gitRemote }: {
  invite: PendingInvite;
  onAccept: () => void;
  loading?: boolean;
  gitRemote: string;
}) {
  return (
    <>
      {/* Invite Card */}
      <div className="provider-panel-section py-4 mb-4 border-b border-[var(--nim-border)] last:border-b-0 last:mb-0 last:pb-0">
        <div className="p-6 bg-[var(--nim-bg-secondary)] rounded-lg text-center">
          <div className="w-12 h-12 mx-auto mb-3 bg-[rgba(251,191,36,0.15)] rounded-xl flex items-center justify-center">
            <MaterialSymbol icon="mail" size={24} className="text-[var(--nim-warning)]" />
          </div>
          <div className="text-[15px] font-semibold text-[var(--nim-text)] mb-1">
            {invite.name}
          </div>
          <p className="text-[13px] text-[var(--nim-text-muted)] mb-4 leading-relaxed">
            你已被邀请加入此团队。接受邀请即可协作共享看板项目和文档，并享有端到端加密保护。
          </p>
          <button
            onClick={onAccept}
            disabled={loading}
            className={`inline-flex items-center gap-1.5 px-5 py-2 bg-[var(--nim-primary)] border-none rounded-md text-white text-[13px] font-medium ${
              loading ? 'cursor-wait opacity-70' : 'cursor-pointer'
            }`}
          >
            <MaterialSymbol icon="group_add" size={14} />
            {loading ? '加入中...' : '加入团队'}
          </button>
        </div>
      </div>

      {/* Project Identity */}
      <div className="provider-panel-section py-4 mb-4 border-b border-[var(--nim-border)] last:border-b-0 last:mb-0 last:pb-0">
        <h4 className="provider-panel-section-title text-[15px] font-semibold mb-2 text-[var(--nim-text)]">
          项目身份
        </h4>
        <p className="text-[13px] leading-relaxed text-[var(--nim-text-muted)] mb-3">
          团队与 Git 远程仓库关联，打开同一仓库克隆的成员会自动连接。
        </p>
        <div className="flex items-center gap-2 px-3 py-2.5 bg-[var(--nim-bg-secondary)] rounded-md">
          <MaterialSymbol icon="commit" size={16} className="text-[var(--nim-text-faint)]" />
          <span className="text-[12px] font-mono text-[var(--nim-text-muted)]">
            {gitRemote || '未检测到 Git 远程仓库'}
          </span>
        </div>
      </div>

      {/* Encryption Footer */}
      <div className="provider-panel-section py-4">
        <EncryptionCard />
      </div>
    </>
  );
}

// ============================================================================
// TeamPanel
// ============================================================================

export function TeamPanel({ workspacePath }: TeamPanelProps) {
  const [team, setTeam] = useState<TeamData | null>(null);
  const [pendingInvite, setPendingInvite] = useState<PendingInvite | null>(null);
  const [gitRemote, setGitRemote] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [fingerprints, setFingerprints] = useState<Map<string, MemberFingerprint>>(new Map());
  const [myFingerprint, setMyFingerprint] = useState<string | null>(null);
  const [stytchAuth, setStytchAuth] = useState<{
    isAuthenticated: boolean;
    user: { user_id: string; emails: Array<{ email: string }>; name?: { first_name?: string; last_name?: string } } | null;
  }>({ isAuthenticated: false, user: null });

  const createTeamDialog = useDialogState<CreateTeamData>(DIALOG_IDS.CREATE_TEAM);

  // Load Stytch auth state on mount
  useEffect(() => {
    if (!(window as any).electronAPI?.stytch) return;

    (window as any).electronAPI.stytch.getAuthState().then((state: any) => {
      setStytchAuth({ isAuthenticated: state.isAuthenticated, user: state.user });
      // Validate session is alive server-side; if dead, signOut broadcasts
      // auth state change and the listener below updates the UI
      if (state.isAuthenticated) {
        (window as any).electronAPI.stytch.refreshSession();
      }
    });

    // Subscribe to auth state changes
    (window as any).electronAPI.stytch.subscribeAuthState();
    const unsubscribe = (window as any).electronAPI.stytch.onAuthStateChange((state: any) => {
      setStytchAuth({ isAuthenticated: state.isAuthenticated, user: state.user });
    });

    return unsubscribe;
  }, []);

  // Load git remote on mount
  useEffect(() => {
    if (!workspacePath) return;
    (window as any).electronAPI.team.getGitRemote(workspacePath).then((result: any) => {
      if (result.success && result.remote) {
        setGitRemote(result.remote);
      }
    });
  }, [workspacePath]);

  // Load team data for an orgId: fetch members, envelopes, and fingerprints
  const loadTeamDetails = useCallback(async (orgId: string, teamName: string, teamGitRemoteHash: string | null) => {
    const membersResult = await (window as any).electronAPI.team.listMembers(orgId);
    if (!membersResult.success) return;

    const currentUserId = membersResult.callerMemberId || '';

    // Fetch key envelopes to determine trust status
    let envelopeUserIds = new Set<string>();
    try {
      const envelopesResult = await (window as any).electronAPI.team.listKeyEnvelopes(orgId);
      if (envelopesResult.success && envelopesResult.envelopes) {
        envelopeUserIds = new Set(envelopesResult.envelopes.map((e: any) => e.targetUserId));
      }
    } catch {
      // Envelope listing may fail if not admin -- that's OK
    }

    const members: TeamMember[] = (membersResult.members || []).map((m: any, i: number) => ({
      id: m.memberId,
      name: m.name || '',
      email: m.email,
      role: m.role as 'admin' | 'member',
      trustStatus: m.status === 'pending'
        ? 'pending' as const
        : envelopeUserIds.has(m.memberId)
          ? 'verified' as const
          : 'unverified' as const,
      avatarColor: getAvatarColor(i),
      isYou: m.memberId === currentUserId,
      invitedAt: m.status === 'pending' ? '最近' : undefined,
    }));

    setTeam({
      orgId,
      name: teamName,
      gitRemote: gitRemote || teamGitRemoteHash || '',
      gitRemoteHash: teamGitRemoteHash,
      members,
      callerRole: membersResult.callerRole || 'member',
    });

    // Load fingerprints for non-pending members (fire-and-forget, doesn't block UI)
    loadFingerprints(orgId, members, currentUserId);
  }, [gitRemote]);

  // Load team data -- find team matching this workspace's git remote, or fall back to listing all teams
  const loadTeamData = useCallback(async () => {
    if (!workspacePath) {
      setInitialLoading(false);
      return;
    }

    try {
      // Find team by workspace git remote (per-project lookup).
      // This returns active teams OR pending invites that match this workspace.
      const findResult = await (window as any).electronAPI.team.findForWorkspace(workspacePath);
      console.log('[TeamPanel] findForWorkspace result:', findResult);
      if (findResult.success && findResult.team) {
        const matchedTeam = findResult.team;
        const isPending = matchedTeam.membershipType && matchedTeam.membershipType !== 'active_member';

        if (isPending) {
          // Matched a pending invite for this workspace -- show join prompt
          setPendingInvite({
            orgId: matchedTeam.orgId,
            name: matchedTeam.name,
            membershipType: matchedTeam.membershipType,
          });
          setTeam(null);
          return;
        }

        // Active team match
        setPendingInvite(null);
        await loadTeamDetails(matchedTeam.orgId, matchedTeam.name, matchedTeam.gitRemoteHash);
        return;
      }

      // No git remote match -- check if user has any pending invites at all.
      // Only show pending invites (not unrelated active teams) since
      // showing an unrelated team is confusing.
      const listResult = await (window as any).electronAPI.team.list();
      console.log('[TeamPanel] team.list result:', listResult);
      if (listResult.success && listResult.teams && listResult.teams.length > 0) {
        const pendingTeams = listResult.teams.filter((t: any) => t.membershipType && t.membershipType !== 'active_member');

        // Show a pending invite if one exists (user may need to join before project identity is linked)
        if (pendingTeams.length > 0) {
          const invite = pendingTeams[0];
          setPendingInvite({
            orgId: invite.orgId,
            name: invite.name,
            membershipType: invite.membershipType,
          });
          setTeam(null);
          return;
        }
      }

      console.log('[TeamPanel] No matching team for this workspace, showing create UI');
      setPendingInvite(null);
      setTeam(null);
    } catch (err) {
      console.error('[TeamPanel] loadTeamData error:', err);
      setPendingInvite(null);
      setTeam(null);
    } finally {
      setInitialLoading(false);
    }
  }, [workspacePath, loadTeamDetails]);

  useEffect(() => {
    loadTeamData();
  }, [loadTeamData]);

  // Load fingerprints for non-pending members (async, doesn't block team load)
  const loadFingerprints = useCallback(async (orgId: string, members: TeamMember[], currentUserId: string) => {
    const fpMap = new Map<string, MemberFingerprint>();

    // Fetch fingerprints for each non-pending, non-self member
    const fetchPromises = members
      .filter(m => m.trustStatus !== 'pending' && m.id !== currentUserId)
      .map(async (m) => {
        try {
          const result = await (window as any).electronAPI.team.getMemberFingerprint(orgId, m.id);
          if (result.success) {
            fpMap.set(m.id, {
              fingerprint: result.fingerprint,
              trustStatus: result.trustStatus,
            });
          }
        } catch {
          // Fingerprint fetch may fail if member hasn't uploaded key yet
        }
      });

    await Promise.all(fetchPromises);
    setFingerprints(fpMap);

    // Fetch own fingerprint
    try {
      const myResult = await (window as any).electronAPI.team.getMyFingerprint(orgId);
      if (myResult.success) {
        setMyFingerprint(myResult.fingerprint);
      }
    } catch {
      // Ignore -- own fingerprint is optional display
    }
  }, []);

  const handleVerifyMember = async (memberId: string, fingerprint: string) => {
    if (!team) return;
    setError(null);
    try {
      const result = await (window as any).electronAPI.team.verifyMember(team.orgId, memberId, fingerprint);
      if (result.success) {
        // Update local fingerprint state
        setFingerprints(prev => {
          const next = new Map(prev);
          const existing = next.get(memberId);
          if (existing) {
            next.set(memberId, { ...existing, trustStatus: 'verified' });
          }
          return next;
        });
      } else {
        setError(result.error || 'Failed to verify member');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify member');
    }
  };

  const handleRevokeTrust = async (memberId: string) => {
    if (!team) return;
    setError(null);
    try {
      const result = await (window as any).electronAPI.team.revokeMemberTrust(team.orgId, memberId);
      if (result.success) {
        setFingerprints(prev => {
          const next = new Map(prev);
          const existing = next.get(memberId);
          if (existing) {
            next.set(memberId, { ...existing, trustStatus: 'unverified' });
          }
          return next;
        });
      } else {
        setError(result.error || 'Failed to revoke trust');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke trust');
    }
  };

  const handleCreateTeam = async () => {
    // Load accounts to show picker if multiple are signed in
    let accounts: Array<{ personalOrgId: string; email: string | null; isPrimary: boolean }> = [];
    try {
      accounts = await (window as any).electronAPI.stytch.getAccounts() || [];
    } catch {
      // Fall back to empty -- dialog will work without account picker
    }

    createTeamDialog.open({
      gitRemote: gitRemote || 'No git remote detected',
      suggestedName: workspacePath?.split('/').pop() || 'my-project',
      accounts,
      onCreateTeam: async (name: string, accountOrgId?: string) => {
        setLoading(true);
        setError(null);
        try {
          const result = await (window as any).electronAPI.team.create(name, workspacePath, accountOrgId);
          if (result.success) {
            await loadTeamData();
          } else {
            setError(result.error || 'Failed to create team');
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to create team');
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const handleInvite = async (email: string) => {
    if (!team) return;
    setError(null);
    try {
      const result = await (window as any).electronAPI.team.invite(team.orgId, email);
      if (result.success) {
        // Optimistic update -- add pending member
        setTeam({
          ...team,
          members: [
            ...team.members,
            {
              id: `invite-${Date.now()}`,
              name: '',
              email,
              role: 'member',
              trustStatus: 'pending',
              avatarColor: getAvatarColor(team.members.length),
              invitedAt: 'just now',
            },
          ],
        });
        // Refresh from server after a short delay
        setTimeout(() => loadTeamData(), 2000);
      } else {
        setError(result.error || 'Failed to send invite');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invite');
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!team) return;
    setError(null);
    try {
      const result = await (window as any).electronAPI.team.removeMember(team.orgId, memberId);
      if (result.success) {
        // Optimistic update
        setTeam({
          ...team,
          members: team.members.filter((m) => m.id !== memberId),
        });
      } else {
        setError(result.error || 'Failed to remove member');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  const handleAcceptInvite = async () => {
    if (!pendingInvite) return;
    setLoading(true);
    setError(null);
    try {
      const result = await (window as any).electronAPI.team.acceptInvite(pendingInvite.orgId);
      if (result.success) {
        setPendingInvite(null);
        await loadTeamData();
      } else {
        setError(result.error || 'Failed to join team');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join team');
    } finally {
      setLoading(false);
    }
  };

  const handleLinkProject = async () => {
    if (!team || !workspacePath) return;
    setError(null);
    try {
      const result = await (window as any).electronAPI.team.setProjectIdentity(team.orgId, workspacePath);
      if (result.success) {
        await loadTeamData();
      } else {
        setError(result.error || 'Failed to link project');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link project');
    }
  };

  const handleUnlinkProject = async () => {
    if (!team) return;
    setError(null);
    try {
      const result = await (window as any).electronAPI.team.clearProjectIdentity(team.orgId);
      if (result.success) {
        await loadTeamData();
      } else {
        setError(result.error || 'Failed to unlink project');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlink project');
    }
  };

  const handleReshareKey = async (memberId: string) => {
    if (!team) return;
    setError(null);
    try {
      const result = await (window as any).electronAPI.team.reshareKey(team.orgId, memberId);
      if (result.success) {
        // Reload team data to refresh envelope state
        await loadTeamData();
      } else {
        setError(result.error || 'Failed to re-share key');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to re-share key');
    }
  };

  const handleUpdateRole = async (memberId: string, newRole: 'admin' | 'member') => {
    if (!team) return;
    setError(null);
    try {
      const result = await (window as any).electronAPI.team.updateRole(team.orgId, memberId, newRole);
      if (result.success) {
        // Optimistic update
        setTeam({
          ...team,
          members: team.members.map((m) =>
            m.id === memberId ? { ...m, role: newRole } : m
          ),
        });
      } else {
        setError(result.error || 'Failed to update role');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const handleDeleteTeam = async () => {
    if (!team) return;
    const confirmed = window.confirm(
      `永久删除团队 "${team.name}"？这将移除所有成员、共享文档和加密密钥。此操作无法撤销。`
    );
    if (!confirmed) return;
    setError(null);
    try {
      const result = await (window as any).electronAPI.team.deleteTeam(team.orgId);
      if (result.success) {
        setTeam(null);
      } else {
        setError(result.error || 'Failed to delete team');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete team');
    }
  };

  if (initialLoading) {
    return (
      <div className="provider-panel flex flex-col items-center justify-center py-12">
        <span className="text-[13px] text-[var(--nim-text-muted)]">正在加载团队数据...</span>
      </div>
    );
  }

  // Not authenticated - show sign-in prompt
  if (!stytchAuth.isAuthenticated) {
    return (
      <div className="provider-panel flex flex-col">
        <div className="provider-panel-header mb-5 pb-4 border-b border-[var(--nim-border)]">
          <h3 className="provider-panel-title text-xl font-semibold leading-tight mb-1.5 text-[var(--nim-text)] flex items-center gap-2">
            团队
            <AlphaBadge size="sm" tooltip={SETTINGS_ALPHA_TOOLTIP} />
          </h3>
          <p className="provider-panel-description text-[13px] leading-relaxed text-[var(--nim-text-muted)]">
            创建团队以协作共享看板项目和文档，并享有端到端加密保护。
          </p>
          <TeamPricingNotice />
        </div>
        <div className="p-6 bg-[var(--nim-bg-secondary)] rounded-lg text-center">
          <div className="w-12 h-12 mx-auto mb-3 bg-[rgba(96,165,250,0.15)] rounded-xl flex items-center justify-center">
            <MaterialSymbol icon="account_circle" size={24} className="text-[var(--nim-primary)]" />
          </div>
          <p className="text-[13px] text-[var(--nim-text-muted)] mb-2 leading-relaxed">
            登录以创建或加入团队。
          </p>
          <p className="text-[12px] text-[var(--nim-text-faint)] m-0">
            前往侧边栏的<strong className="text-[var(--nim-text-muted)]">账号与同步</strong>进行登录。
          </p>
        </div>
      </div>
    );
  }

  const userEmail = stytchAuth.user?.emails?.[0]?.email;
  const userName = stytchAuth.user?.name?.first_name
    ? `${stytchAuth.user.name.first_name} ${stytchAuth.user.name.last_name || ''}`.trim()
    : null;

  return (
    <div className="provider-panel flex flex-col">
      {/* Header */}
      <div className="provider-panel-header mb-5 pb-4 border-b border-[var(--nim-border)]">
        <h3 className="provider-panel-title text-xl font-semibold leading-tight mb-1.5 text-[var(--nim-text)] flex items-center gap-2">
          Team
          <AlphaBadge size="sm" tooltip={SETTINGS_ALPHA_TOOLTIP} />
        </h3>
        <p className="provider-panel-description text-[13px] leading-relaxed text-[var(--nim-text-muted)]">
          Create a team to collaborate on shared tracker items and documents with end-to-end encryption.
        </p>
        <TeamPricingNotice />
        {userEmail && team && (
          <div className="flex items-center gap-1.5 mt-2 text-[12px] text-[var(--nim-text-faint)]">
            <MaterialSymbol icon="person" size={13} />
            <span>已登录为 <span className="text-[var(--nim-text-muted)]">{userName || userEmail}</span></span>
          </div>
        )}
      </div>

      {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}

      {team ? (
        <TeamExistsState
          team={team}
          onInvite={handleInvite}
          onRemoveMember={handleRemoveMember}
          onDeleteTeam={handleDeleteTeam}
          onLinkProject={handleLinkProject}
          onUnlinkProject={handleUnlinkProject}
          isAdmin={team.callerRole === 'admin'}
          localGitRemote={gitRemote}
          fingerprints={fingerprints}
          myFingerprint={myFingerprint}
          onVerifyMember={handleVerifyMember}
          onRevokeTrust={handleRevokeTrust}
          onReshareKey={handleReshareKey}
          onUpdateRole={handleUpdateRole}
        />
      ) : pendingInvite ? (
        <InvitePendingState
          invite={pendingInvite}
          onAccept={handleAcceptInvite}
          loading={loading}
          gitRemote={gitRemote}
        />
      ) : (
        <NoTeamState
          gitRemote={gitRemote}
          onCreateTeam={handleCreateTeam}
          loading={loading}
        />
      )}
    </div>
  );
}
