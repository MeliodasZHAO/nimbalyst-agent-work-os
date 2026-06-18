# 注意力系统 + 项目 Tab 右键修复 — 设计文档

- 日期：2026-06-17
- 状态：待评审（Draft）
- 范围：Electron 桌面端渲染层 + 主进程
- 关联记忆：看板命名 bug（2026-06-16）、移动端北极星原则、dispatch 自动实现队列

---

## 1. 背景

用户在使用 Agent Work OS 工作台时报告了一串相互关联的问题：

1. **右键单击项目 tab 会报错**（功能直接不可用）。
2. **项目 tab 上的数量徽章一直亮**，即使没有"回复完成"也给人"该去看了"的假通知感。
3. **不知道是哪个子智能体完成了任务**——子任务跑完后用户无从感知"是谁干完了"。
4. **主对话 session 和子智能体 session 在界面上没有区分**。

诊断后，#1 是一个确定的 bug；#2/#3/#4 指向同一个缺失的能力——一套**注意力系统**：界面应只在"真的需要用户"时提醒，且永远说清"是谁"。

---

## 2. 诊断（根因，带证据）

### 2.1 右键报错 — React error #185（无限重渲染）

渲染日志实锤（`nimbalyst-debug.log`，2026-06-16 16:45 连续两次）：

```
[ERROR] Minified React error #185
[ERROR] ErrorBoundary caught an error: ... React error #185
```

React #185 = "Maximum update depth exceeded"。根因在 `packages/electron/src/renderer/components/ProjectTabBar.tsx:394-401`：右键菜单的 floating 元素 `ref` 回调里调用了 `ctxRefs.setReference(...)`，每次 render 都传入一个**新的**虚拟锚点对象，触发 floating-ui 内部 setState → 重渲染 → ref 回调再执行 → 再 setReference …… 死循环，撞穿更新深度上限，被 ErrorBoundary 捕获。

```
右键 → setContextMenu → 菜单渲染 → ref回调 → setReference(新对象)
         ↑                                            │
         └──────── floating-ui 内部 setState 重渲染 ←─┘  (永不收敛)
```

这违反了项目 `.claude/rules/floating-ui.md`：虚拟锚点必须用 `useMemo` 缓存，并通过 `useFloating({ elements: { reference } })` 传入，禁止在 ref 回调里 `setReference`。旁边的"加项目"下拉菜单没崩，正是因为它锚在真实按钮 DOM 上。

### 2.2 徽章语义糊 + 可能卡死

徽章数 = `projectActivitySummaryAtom` 的 `processing` = `WorkspaceActivity.streaming.size`（`packages/electron/src/renderer/store/atoms/sessionActivity.ts`）。两层问题：

- **语义糊**：`streaming` 同时包含 `session:started` / `session:streaming` / `session:waiting`（见 `sessionStateListeners.ts:311-353`）。即"正在跑（不用管）"和"等你回应（需介入）"被糊成同一个数字，"完成未看"则完全没体现。
- **可能卡死**：`sessionStateListeners.ts:285-304` 的注释自己记录过一个 race——终端事件（completed/error/interrupted）若丢失 `workspacePath`，`streaming` 标志清不掉，徽章永久亮。

### 2.3 主/子 session 无区分 + 无完成通知

- 数据层**有**区分：`parentSessionId` / `sessionType='dispatch'`（`sessionStore.ts`，`AgentWorkOSDispatcher.ts:252-291`），但**左侧 session 列表（`SessionHistory.tsx` / `SessionListItem.tsx`）完全没用上**——子和主长得一样。
- 完成通知**基本缺失**：子 session 完成只是 phase 从 `implementing` 自动挪到 `validating`（`AgentWorkOSDispatcher.ts:86-99` `handleDispatchSettled`），仅靠看板挪列体现。没有 toast、没有系统通知、没有声音。

### 2.4 命名链路现状（重要修正）

第 0 单元的地基比预期好。命名代码层**已基本就位**：

- `dispatchTitle.ts` `deriveDispatchTitle`：弱名/空名 → 从 task 描述截取真名。
- `AgentWorkOSDispatcher.ts:281`：建子 session 时确实调用并落库。
- `MessageStreamingHandler.ts:397-413`：已加 `hasDefaultTitle` 守卫，dispatch 派生名不再被首条消息覆盖。

这些应在上一个 `kanban naming` commit 内，但**未重建、未端到端验证**——用户运行的打包版可能仍是旧 dispatch 代码。因此第 0 单元 = **端到端坐实 + 补运行时暴露的缺口**，而非重写。

> 注意区分两类"命名"：(a) dispatch 子任务名（`deriveDispatchTitle`，已就位）；(b) 通用 session 自动命名 MCP（长期遗留"没生效"，依赖运行时数据）。本设计只硬性依赖 (a)；(b) 不在范围内，主对话节点标题用"首条消息前缀"兜底即可。

---

## 3. 设计目标 / 非目标

### 目标
- 界面只在"真的需要用户"时提醒（等回应 / 完成未看），后台在跑的不抢注意力。
- 任何完成提醒都说清"是谁"（子任务标题 + 所属主任务）。
- 主对话与其派生的子任务在左侧列表里以**父子树**清晰组织。
- 修复右键崩溃，右键菜单提供 4 项项目操作。

### 非目标（本轮不做）
- 通用 session 自动命名 MCP 的修复（遗留项，依赖运行时数据，单独处理）。
- 移动端"全量项目可见"（C/E 待办，独立工作流；**原则铭记：所有桌面端项目对移动端自动可见，绝不做手动开关**）。
- 看板（`SessionKanbanBoard`）的重构——它已有父子标记，本轮只复用其数据，不改它。
- 通知中心 / 收件箱面板（可作为后续；本轮用 toast + 系统通知 + 树标记足够）。

---

## 4. 架构总览

```
                   子任务: 完成 / 等你回应
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
   [单元3 树状列表]     [单元2 tab徽章]      [单元4 结束提醒]
   挂在主对话下(N层)    只数"需要你"         前台toast/后台系统通知
   父显 N/M✓·K✗        在跑→柔和呼吸点      聚合·带"是谁"·区分完成/失败
   子: 在跑/等你/✓/✗    修race不卡死
        │                   │                   │
        └─────────┬─────────┴───────────────────┘
                  ▼
       [单元0] 子任务有真名 (deriveDispatchTitle 端到端坐实)  ← 地基
       [单元1] 右键不再崩 + 复制路径                         ← 独立 bug
```

数据来源统一：所有单元复用现有的 `parentSessionId` / `sessionType` / `phase` / session 状态事件，不新增数据模型。

---

## 5. 单元设计

### 单元 0 — 命名链路端到端坐实（前置阻塞）

**目的**：保证子任务标题是 `deriveDispatchTitle` 派生的真名，否则单元 3/4 显示的全是占位名，整套失效。

**做什么**
- 重建后端到端验证：dispatch 一批任务，确认子 session 标题在 DB、左侧列表、看板三处都是派生真名而非 `New conversation` / `Task`。
- 若运行时暴露缺口（例如 `task.title` 与 `task.prompt` 同时弱导致 fallback 到 `'Task'`，或仍被某路径覆盖），就地补齐。
- 验证 `displaySessionTitle`（`sessionTitle.ts`）对默认名的本地化映射在新的树状视图里也走到。

**接口/依赖**：`deriveDispatchTitle`、`AgentWorkOSDispatcher`、`MessageStreamingHandler`、`displaySessionTitle`。
**验证**：见 §6 测试策略——一个断言"dispatch 子 session 标题非默认名"的测试。

### 单元 1 — 右键崩溃修复 + 复制路径

**做什么**
- 按 `floating-ui.md` 重写 `ProjectTabBar.tsx` 右键菜单：用 `useMemo` 生成虚拟锚点（基于 `contextMenu.x/y`），通过 `useFloating({ elements: { reference: virtualRef } })` 传入；删除 ref 回调里的 `setReference`。
- 右键菜单最终 4 项：**在资源管理器中显示 / 在新窗口中打开 / 复制项目路径 / 关闭项目**。
- "复制项目路径"：写入剪贴板（渲染层 `navigator.clipboard` 或经 IPC 到主进程 `clipboard`，遵循现有约定）。

**接口/依赖**：`@floating-ui/react`、现有 IPC（`show-in-finder` / `workspace-manager:open-workspace` / 关闭逻辑均已注册）。
**风险**：低。隔离在单个组件内。
**验证（见评审 B-5，不靠手动确认）**：React Testing Library 渲染 `ProjectTabBar`，模拟右键打开菜单，断言**不触发 ErrorBoundary / 不超过更新深度**（即菜单挂载后多次 render 不会以新对象反复调用 `setReference`）；再断言 4 项点击各自触发对应 IPC。这是"独立可先合"的一块，更应有自动化护栏。

### 单元 2 — 徽章语义重构

**做什么**
- 在 `sessionActivity.ts` 把每个 workspace 的活动分为两类：
  - **needsYou** = `等你回应`（pending interactive prompt / waiting）+ `完成未看`。
  - **running** = 正在 streaming 且无 pending prompt。
- `ProjectTabBar` 徽章只渲染 `needsYou` 计数；`running > 0 且 needsYou == 0` 时渲染一个**柔和呼吸点**（不计数、低对比）。
- 修复 §2.2 的 race：终端事件无条件经 session 索引清除 streaming（沿用现有 `clearSessionStreamingAtom` 思路，确保无 `workspacePath` 时也清）。

> **unread 语义（纠正，见评审 B-1）**：桌面端的"完成未看"必须**复用现有事件驱动的内存 unread Set**——`markSessionUnreadAtom`（消息到达且该 session 非当前查看时置位）/ `clearSessionUnreadAtom`（查看时清除），定义在 `sessionStateListeners.ts`。**不要**新写一套 `lastReadAt > lastMessageAt` 的计算（那是 iOS/Android 的模型，桌面端只把 `lastReadAt` 持久化到 DB 供跨端同步，徽章并不读它）。即"完成未看" = 终端事件后该 session 的 unread 标志仍为 true。避免双轨。

**接口/依赖**：`sessionStateListeners.ts` 的事件流、`projectActivitySummaryAtom`、`sessionHasPendingInteractivePromptAtom`、`markSessionUnreadAtom` / `clearSessionUnreadAtom`。
**风险**：中。改动 atom 语义，需保证现有订阅者（如 `ProjectRail` 旧 UI）不被破坏——优先扩展 summary 字段而非替换。
**验证**：单测覆盖三态（在跑 / 等你 / 完成未看）→ 徽章计数与呼吸点显隐；race 回归测试（终端事件无 workspacePath 时徽章归零）。

### 单元 3 — 左侧列表树状分组

**做什么**
- 在 `SessionHistory.tsx` 渲染前，用一个**独立的 `useMemo` 派生**把扁平 session 列表按 `parentSessionId` 折叠成树。**树是递归 N 层**（见评审 B-3）：数据上存在「主对话 → dispatch 父 → 子任务」至少三层（`AgentWorkOSDispatcher.ts` 中 dispatch 父自身也可带 `parentSessionId`），更深的嵌套 dispatch 同样按 `parentSessionId` 链递归挂载，每层缩进。
- 父节点显示 `N/M✓ · K✗` 进度（已完成 / 总数 / 失败或中断数）；子节点各带状态标：`在跑` / `等你回应` / `✓完成·未看` / **`✗失败/中断`**（见评审 B-2——"是谁挂了"和"是谁干完了"同等重要）。
- 父节点可折叠/展开（折叠状态持久化到 workspace-settings 或本地 UI 状态，遵循 §STATE_PERSISTENCE）。
- **子节点标题渲染复用现有 `SessionListItem`（或至少显式走 `displaySessionTitle`）**，不另写一套标题逻辑（见评审 B-7，避免重复实现 + 漏掉 i18n 默认名映射）。单元 0 保证标题为真名。
- **已读触发点（见评审 B-4）**：仅"真正进入该子 session 的 transcript"才清 unread（`clearSessionUnreadAtom`）；**展开父节点不算已读**。与现有 unread 触发条件保持单一数据源。

**接口/依赖**：`parentSessionId`、`SESSION_HIERARCHY.md` 既有概念、`SessionListItem`、`displaySessionTitle`、`clearSessionUnreadAtom`。
**风险**：**高（重点隔离）**。`SessionHistory.tsx` 是 ~3900 行大组件，记忆记录过它的全量排序反模式很难碰。**策略**：分组逻辑全部抽成纯函数 + `useMemo` 派生 + 独立子组件（如 `SessionTreeGroup`），不改它的状态流主干、不引入新的 `setState`-in-render。先写针对纯函数的单测。
**验证**：纯函数单测（扁平→树），**夹具必须覆盖 ≥3 层嵌套 + 含失败子节点的进度计算**；渲染层快照/DOM 标记验证缩进、进度、四态。

### 单元 4 — 子任务结束提醒（完成 / 失败）

**做什么**
- 主进程在子 session **settled** 时发事件给渲染层（新 IPC 频道，camelCase）。**settled 含三种终态**：`completed` / `error` / `interrupted`（见评审 B-2；注意现有 `handleDispatchSettled` 只对 `completed` 推进 phase，本单元的提醒需覆盖 error/interrupted）。载荷：`{ sessionId, title, parentTitle, outcome: 'completed'|'failed', completed, failed, total }`。
- 渲染层订阅（走中央 listener，遵循 `IPC_LISTENERS.md`，组件不直接订阅）：
  - **聚合**：同一 dispatch 批次的结束在一个 debounce 窗口内合并（默认 **2000ms**，作为可注入常量便于测试），不逐个弹（"3 个完成、1 个失败，还有 2 个在跑"）。
  - **文案区分**：完成 = 普通信息态；失败/中断 = 醒目态，引导用户去处理。
  - **前台**（对应窗口 focused）：右下角轻 toast，点击跳转到该 session。
  - **后台**（失焦/最小化）：Electron `Notification` 系统通知，点击拉回并定位。
  - **多窗口归属（见评审 B-6）**：项目可在新窗口打开；通知归属到**子 session 所属 workspace 对应的窗口**，该窗口 focused 则前台 toast，否则系统通知。无对应窗口时一律系统通知。
  - **声音**：默认关，留一个设置开关（app-settings）。
- 结束同时驱动单元 2 的 needsYou（完成未看 / 失败待处理）与单元 3 的 `✓` / `✗` 标记（统一 unread 语义）。

**接口/依赖**：新 IPC 频道、`safeOn`、中央 listener、Electron `Notification`、`BrowserWindow.isFocused()`、workspace→window 映射。
**风险**：中。聚合窗口与失焦判定需要稳；通知点击的"定位到 session"路由要打通。
**验证**：见 §6——可断言"settled 事件（含 failed）→产生一条聚合通知载荷（含正确标题/outcome/进度）"的纯函数/服务测试；前台 toast vs 后台系统通知的分支用 focus 状态注入，不依赖手动重启。

---

## 6. 测试策略（遵循 end-to-end-verification 规则）

对每个"需重启/手动操作才能验证"的行为，**先写失败测试**，再写实现：

- 单元 0：测试断言新建 dispatch 子 session 的标题非默认名（先红后绿）。
- 单元 1：React Testing Library 渲染右键菜单，断言不触发 ErrorBoundary / 不超更新深度 + 4 项点击触发对应 IPC（自动化，不靠手动）。
- 单元 2：`sessionActivity` 三态单测（在跑 / 等你 / 完成未看）+ race 回归单测（终端事件无 workspacePath 时徽章归零）。
- 单元 3：扁平→树 纯函数单测，**夹具含 ≥3 层嵌套与失败子节点的进度计算**。
- 单元 4：settled 事件（含 failed）→聚合通知载荷 的纯函数/服务测试；前台 toast vs 后台系统通知的分支用 focus 状态注入。

不以"代码路径看着对"或"typecheck 通过"作为完成依据。涉及主进程事件的，验证后 grep `main.log` 确认未被 try/catch 静默吞掉。

---

## 7. 关键依赖与风险汇总

| 项 | 类型 | 说明 | 缓解 |
| --- | --- | --- | --- |
| 子任务真名 | 阻塞依赖 | 单元 3/4 的"是谁"全押在标题上 | 单元 0 先端到端坐实 |
| `SessionHistory.tsx` ~3900 行 | 高风险 | 全量排序反模式，难碰 | 分组抽纯函数+useMemo+子组件，不动主干 |
| atom 语义变更 | 中风险 | 旧 `ProjectRail` 等订阅者 | 扩展 summary 字段而非替换 |
| 双数据库后端 | 约束 | PGLite / SQLite JSON 分歧 | 本设计不新增表/查询；如读 metadata 用标准 parse 兜底 |
| 通知点击路由 | 中风险 | 后台通知点击需定位 session | 复用现有 session 激活/跳转 IPC |

---

## 8. 落地顺序

0 →（1 与 2/3/4 可并行，但 3/4 依赖 0）。建议：**0 坐实命名 → 1 右键修复（独立可先合）→ 2 徽章 → 3 树 → 4 通知**。单元 1 因独立且低风险，可作为最先落地、单独验证的一块。

---

## 9. 验收标准

- 右键项目 tab 不再报错；菜单 4 项可用。
- 项目 tab 徽章只在"等你回应 / 完成未看"时亮；纯后台在跑只显柔和呼吸点；不再永久卡亮。
- 左侧列表中子任务以缩进树（递归 N 层）挂在主对话下，父节点显 `N/M✓·K✗` 进度，子节点显四态（在跑 / 等你 / `✓完成·未看` / `✗失败`），标题为真名。
- 子任务结束时：完成与失败都有提醒，前台轻 toast / 后台系统通知，聚合不刷屏，明确显示"是谁 + outcome + 进度"，失败文案更醒目。
