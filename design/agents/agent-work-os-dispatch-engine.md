# Agent Work OS 调度引擎设计文档

## 用户需求

我在一个 session 里和智能体对话，提出多个任务。系统应该能够：

1. **自动拆分任务**：从我的描述中识别出多个独立任务
2. **并行下发**：每个任务分配给不同的 CC 或 CX session，各自在独立 worktree 中执行
3. **互不影响**：每个任务有自己的代码分支和工作空间，编译和改动不互相干扰
4. **可监控**：我能在一个面板里看到所有任务的进度（哪个在跑、哪个完成了、哪个有问题）
5. **可合并**：所有任务完成后，把各个 worktree 的改动合并到一个分支
6. **跨 provider**：任务 A 给 CC，任务 B 给 CX——根据任务性质自动选择或让我指定

### 不需要的

- 不需要过度的移动端权限管控（已有账号 + 扫码两种验证）
- 不需要项目级的 skill 文件
- 不需要 8 个 gate 的完整流程——多数任务走简化路径就行

## 已有基础设施

### 发现：Blitz 系统

代码库里已经有一个叫 **Blitz** 的系统（`BlitzHandlers.ts`），做了大部分底层工作：

```
blitz:create IPC
  → 接收 prompt + modelConfig（provider/model/count 数组）
  → 创建 N 个 worktree（git 操作自动序列化）
  → 创建 N 个 session（每个绑定一个 worktree）
  → 用 sessions:queue-prompt 自动注入 prompt 并启动执行
  → 支持不同 provider/model 组合
  → 返回所有 worktree ID 和 session ID
```

**Blitz 的限制**：
- 所有 session 用**同一个 prompt**——不支持每个任务不同描述
- 没有 Work Packet 集成——不追踪 gate 和 evidence
- 没有自动合并——merge 需要手动操作

### 其他可用的 IPC

| IPC | 功能 | 文件 |
|-----|------|------|
| `worktree:create` | 创建 git worktree | WorktreeHandlers.ts:326 |
| `sessions:create` | 创建 session（指定 provider/model/worktreeId） | SessionHandlers.ts:284 |
| `sessions:create-child` | 创建子 session | SessionHandlers.ts:689 |
| `sessions:queue-prompt` | 注入 prompt 并**自动开始执行** | QueuedPromptsStore |
| `ai:sendMessage` | 发送消息 | preload/index.ts:501 |
| `ai:saveDraftInput` | 预填输入框（需手动回车） | preload/index.ts:508 |
| `worktree:merge` | 合并 worktree 分支到主分支 | WorktreeHandlers.ts:1120 |
| `worktree:rebase` | rebase worktree | WorktreeHandlers.ts:1169 |
| `worktree:get-status` | 获取 worktree 状态（ahead/behind/uncommitted） | WorktreeHandlers.ts:494 |
| `worktree:archive` | 归档 worktree + 关联 session | WorktreeHandlers.ts:1241 |
| `tracker:link-session` | 关联 tracker item 和 session | SessionHandlers.ts:1480 |
| `ai-session-state:*` | 监控 session 状态 | preload/index.ts:457 |

## 方案：扩展 Blitz 为 Dispatch 系统

### 核心思路

不另起炉灶，基于 Blitz 扩展。新增一个 IPC handler `agent-work-os:dispatch`，和 Blitz 的区别是：**每个任务有独立的 prompt 和独立的 provider 选择**。

### 新增 IPC：`agent-work-os:dispatch`

```typescript
// 输入
interface DispatchPayload {
  workspacePath: string;
  tasks: Array<{
    title: string;              // 任务标题
    prompt: string;             // 这个任务的具体 prompt
    provider: 'claude-code' | 'openai-codex' | 'auto';  // 指定或自动选
    model?: string;             // 可选：指定模型
    complexity?: 'tiny' | 'small' | 'medium' | 'large';
    createWorkPacket?: boolean; // 是否创建 Work Packet tracker item
  }>;
  mergeStrategy?: 'manual' | 'sequential-auto';  // 完成后如何合并
}

// 输出
interface DispatchResult {
  success: boolean;
  dispatchId: string;           // 调度批次 ID
  tasks: Array<{
    title: string;
    sessionId: string;
    worktreeId: string;
    worktreePath: string;
    worktreeBranch: string;
    provider: string;
    workPacketId?: string;      // 如果创建了 Work Packet
    status: 'queued' | 'failed';
    error?: string;
  }>;
}
```

### 实现文件

```
packages/electron/src/main/ipc/AgentWorkOSDispatchHandlers.ts   ← 新建
packages/electron/src/main/services/AgentWorkOSDispatcher.ts    ← 新建
```

### 执行流程

```
agent-work-os:dispatch 被调用
  │
  ├── 1. 校验（workspacePath 有 git history、tasks 非空）
  │
  ├── 2. 创建 dispatch session（session_type='dispatch'，类似 blitz 的 parent）
  │
  ├── 3. 对每个 task（串行创建 worktree，git 操作需要序列化）：
  │   ├── a. 创建 worktree（worktree:create 的内部逻辑）
  │   ├── b. 创建 session（指定 provider/model，绑定 worktreeId，parentSessionId=dispatch）
  │   ├── c. 如果 createWorkPacket=true，创建 tracker item 并 link session
  │   └── d. queue-prompt（注入 task.prompt，自动开始执行）
  │
  ├── 4. 返回所有 session/worktree ID
  │
  └── 5. 后台监控：
      ├── 订阅所有 session 的状态变化
      ├── 当某个 session 完成时，更新 dispatch session 的 metadata
      ├── 当所有 session 完成时，触发 'agent-work-os:dispatch-complete' 事件
      └── 如果 mergeStrategy='sequential-auto'，按顺序 merge 各个 worktree
```

### 前端触发方式

#### 方式 1：从 session 对话中触发

用户在 CC session 中说"帮我同时做 A、B、C"，CC agent 通过 MCP tool 调用 dispatch：

```
新增 MCP tool: agent_work_os_dispatch
参数: { tasks: [...] }
内部调用: agent-work-os:dispatch IPC
```

这样用户在任何 session 里都能通过自然语言触发并行下发。

#### 方式 2：从 UI 触发

在 Tracker 面板或 Agent 面板新增一个"并行下发"按钮/对话框：
- 选择多个 Work Packet
- 点"Launch All"
- 系统自动为每个 WP 创建 worktree + session 并启动

### 监控面板

复用现有的 **BlitzGroup** 组件模式：
- dispatch session 是 parent
- 每个 task session 是 child
- 列表显示每个 task 的标题、provider、状态（running/done/error）
- 点击可跳转到对应 session 查看详情
- 全部完成后显示"合并"按钮

### 合并流程

```
所有 task session 标记 complete
  ↓
用户点"合并"（或自动触发）
  ↓
按创建顺序依次 merge：
  worktree-1 → merge to main branch
  worktree-2 → rebase on latest, merge
  worktree-3 → rebase on latest, merge
  ↓
如果有冲突：暂停，高亮冲突文件，等用户处理
  ↓
全部 merge 完成 → archive 所有 worktree
```

## 实施阶段

### Phase 1：Dispatch IPC + MCP Tool

**目标**：用户在 session 里说"并行做 A、B、C"，系统自动创建 worktree + session 并启动

**要做的**：
1. `AgentWorkOSDispatchHandlers.ts` — dispatch IPC handler
2. `AgentWorkOSDispatcher.ts` — 核心调度逻辑（基于 BlitzHandlers 的模式）
3. MCP tool `agent_work_os_dispatch` — 让 CC/CX agent 能调用 dispatch
4. 在 `index.ts` 注册 handler

**不做的**：自动合并、监控面板（先用现有 session 列表看进度）

### Phase 2：监控 UI

**目标**：一个面板看所有 dispatched task 的进度

**要做的**：
1. `DispatchGroup.tsx` 组件（参考 BlitzGroup 模式）
2. 在 SessionHistory 中识别 dispatch session 并用 DispatchGroup 渲染
3. 完成状态检测和通知

### Phase 3：合并编排

**目标**：所有任务完成后一键合并

**要做的**：
1. `agent-work-os:dispatch-merge` IPC — 按顺序 merge 所有 worktree
2. 冲突检测和 UI 提示
3. 全部成功后自动 archive

### Phase 4：智能路由

**目标**：根据任务描述自动选择 CC vs CX

**要做的**：
1. 任务描述分析（复用 routeWorkPacket 的风险检测 + 关键词匹配）
2. UI 任务 → CC，后端/测试 → CX，混合 → mixed
3. 用户可在 dispatch 前预览和修改分配方案

## 关键约束

1. **Git 操作必须序列化**——创建 worktree 不能并发，会冲突
2. **Session 执行可以并行**——创建完后各 session 独立跑
3. **最多 8 个 worktree**——Blitz 硬限制，也是内存合理上限
4. **Provider 在创建时绑定**——一个 session 不能中途换 provider
5. **Merge 顺序很重要**——先 merge 的分支是后续 rebase 的基础

## 文件路径参考

| 参考 | 文件 |
|------|------|
| Blitz 实现（最直接的参考） | `packages/electron/src/main/ipc/BlitzHandlers.ts` |
| Session 创建 | `packages/electron/src/main/ipc/SessionHandlers.ts` |
| Worktree 创建/合并 | `packages/electron/src/main/ipc/WorktreeHandlers.ts` |
| Prompt 排队 | `packages/electron/src/main/services/QueuedPromptsStore.ts` |
| BlitzGroup UI（参考） | `packages/electron/src/renderer/components/AgenticCoding/BlitzGroup.tsx` |
| Agent Work OS 路由逻辑 | `packages/runtime/src/agent-work-os/routeWorkPacket.ts` |
| MCP Tool 注册 | `packages/electron/src/main/mcp/tools/` |
