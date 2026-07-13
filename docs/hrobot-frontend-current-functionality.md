# HROBOT 当前前端功能与逻辑契约

更新时间：2026-07-02

本文用于后续 Vercel / Geist 风格重构前的功能冻结。重构时可以重新设计排版、视觉、组件形态、动效和交互表现，但应保留本文记录的业务入口、前端状态、数据流、用户操作结果和 API 契约。

## 重构原则

- 可以改变：页面布局、导航样式、卡片形态、表格样式、筛选器呈现、弹窗/抽屉/面板形式、图标、动效、空状态、loading 形态、字体系统、文字层级、组件密度、左右/上下分栏关系。
- 可以重新设计：当前显得繁琐、拥挤、层级不清、左右上下排版不合理的呈现方式。只要不改变操作结果和业务数据含义，可以改成更符合 Vercel / Geist 的信息架构和组件组合。
- 必须保留：业务模块、数据字段含义、页面操作逻辑、筛选/保存/导入/导出/生成/删除等操作结果、API 调用、localStorage 兼容、人才盘点校准逻辑。
- 字体迁移属于本次整体视觉重构范围。后续可从当前 HarmonyOS Sans SC 迁移到 Geist 风格字体栈，并为中文内容保留清晰可靠的中文 fallback。
- 当前项目仍是 vanilla HTML/CSS/JS：`index.html` 提供页面结构，`static/css/app.css` 提供样式，`static/js/app.js` 是通用前端入口，`static/modules/talent-review/talent-review.js` 是人才盘点核心模块。
- 改 CSS/JS 静态资源时，同步更新 `index.html` 中对应 `?v=...` cache token。
- 默认本地运行端口仍为 `8767`。

## 全局外壳与导航

当前可见主导航入口：

- 首页：`page-1`
- 报告生成：`page-5`
- 人才盘点：`page-3`
- 设计中心：`page-8`
- Agent 中心：`page-10`
- 情报中心：`page-7`
- AI 问答：`page-4`
- 设置：`page-9`

当前存在但不属于主导航的内部/跳转页面：

- 报告展示/报告库：`page-2`，由报告生成、首页最近报告或报告卡片等路径进入。
- 人才盘点数据配置：`page-6`，由人才盘点页“配置数据”等入口进入。
- 人才盘点汇报工具页：`page-11`，由 Agent 中心内置项目进入，不作为主导航常驻项。

前端逻辑：

- `switchPage(page)` 控制 `.report-page.active` 与 `.nav-item.active`。
- 切到人才盘点页时会调用 `window.restoreTalentReviewPage()`，修复九宫格视图和滚动位置。
- 切到人才汇报工具页时会调用 `window.renderReportTool()`。
- 侧边栏通过 `sidebarToggle` 折叠/展开，状态体现为 `#shell.sidebar-collapsed`。
- 所有带 `data-home-page` 的按钮都可跳转到指定页面。

## 首页工作台

目标功能：

- 展示 HROBOT 工作台入口。
- 展示今日备忘。
- 展示最近报告摘要。
- 展示使用统计，包括报告数、海报数、AI 问答次数等。
- 提供快捷入口：人才盘点、报告生成、Agent 中心、AI 问答、情报中心、设计中心、设置。

前端状态与数据：

- 首页备忘优先来自 `/api/home-memos`。
- 老版本备忘兼容读取 localStorage：`hrobot.homeMemoRecords`，并可通过 `/api/home-memos/migrate` 迁移。
- AI 问答次数读取 localStorage：`hrobot.aiQuestionCount`。
- 最近报告来自 `/api/report/latest?list=1`。
- 海报历史来自 `/api/design/posters`。

可重构方向：

- 可以把首页改成 Vercel dashboard 风格的概览页、快捷 command panel、recent activity。
- 必须保留备忘、最近报告、使用统计和模块跳转能力。

## 人才盘点

核心文件：`static/modules/talent-review/talent-review.js`

### 数据模型

核心前端状态：

- `people`：当前人员数据。
- `selectedId`：当前选中员工工号。
- `profileExpanded`：员工详情侧栏展开状态。
- `dirty`：是否存在未保存校准调整。
- `talentPools`：人才池配置。
- `profileNotes`：员工备注。
- `filters`：筛选条件集合。
- `calibrationHistory` / `calibrationFuture`：校准撤销/重做栈。
- `expandedDepartments` / `expandedManagers`：组织/直线经理筛选树展开状态。

九宫格定义：

- `gridDefs` 定义 1-9 宫格、名称、推荐比例、分组。
- 宫格展示依赖 `gridCurrent`。
- 原始落格依赖 `gridOriginal` 或后端合并后的基准字段。
- 宫格变动通过 `movement(person) = gridCurrent - gridOriginal` 计算。

人员字段读取：

- 通用读取通过 `profileValue(person, key)`，优先读 `person.profile[key]`，再读 `person[key]`。
- 直线经理读取 `manager` / `directManager` / `直接上级`。
- 序列筛选兼容标准序列和职位关键词，例如制作人/策划、客户端/服务端、美术、测试。

### 页面功能

必须保留：

- 顶部统计卡：总数、高潜/核心/风险等分布。
- 九宫格矩阵：每格人数、实际比例、推荐比例、人员卡片。
- 人员卡片点击选中员工。
- 人员卡片拖拽到其他宫格，触发校准变更。
- 分布表：按 1-9 宫格展示数量和占比。
- 员工详情侧栏：基础信息、历史落格、绩效、上级评价、潜力评分、校准表单、备注。
- 详情侧栏里可修改：
  - 当前宫格。
  - AI 能力标签。
  - 无成长预警。
  - 调整原因。
  - 员工备注。
- 未保存调整要显示状态提醒。

筛选器必须保留：

- 业务分组：`group`
- 部门树：`department`
- 职级：`level`
- 序列：`sequence`
- 直线经理团队树：`managerTeam`
- 无成长预警：`growthWarning`
- AI 能力：`aiAbility`
- 人才池：`talentPool`
- 上级是否调整：`supervisorAdjusted`
- 校准是否变化：`calibrationDiff`

筛选交互契约：

- 每个筛选器支持多选。
- 支持搜索筛选项。
- 部门和直线经理支持树形展开/收起。
- `clearFilterBtn` 清空所有筛选。
- 筛选后如果当前选中员工不在结果中，应取消选中并收起详情。

校准操作契约：

- 拖拽或详情表单修改员工校准字段前，写入撤销栈。
- `reloadBtn` 当前语义是重做一步。
- `resetSelectedBtn` 当前语义是撤销一步。
- `resetAllBtn` 重置全部人员到原始校准状态。
- `saveBtn` 调用 `/api/overrides` 保存当前变更。
- `exportBtn` 根据 `exportMode` 导出：
  - `all`：`/api/export/calibrated-excel`
  - `diff`：`/api/export/calibration-differences`
- 导出前如果 `dirty=true`，先保存调整再下载。

### 人才池

入口在 `page-6`，数据同时影响 `page-3` 筛选和汇报工具页。

必须保留：

- 读取 `/api/talent-pools`。
- 保存 `/api/talent-pools`。
- 新增/编辑人才池名称和成员。
- 成员解析支持换行、分号、中文分号、逗号、顿号。
- 支持删除整个池。
- 支持删除池内单个成员。
- 保存后刷新人才池筛选器。

### 导入数据

入口在 `page-6`。

必须保留：

- 导入人才盘点结果 Excel：`/api/import/review-excel`
- 导入人才档案 JSON：`/api/import/profiles-json`
- 导入员工关系/花名册 Excel，多文件：`/api/import/employee-roster-excel`
- 导入后重新 `loadPeople()` 并刷新 `/api/import/sources`。
- 文件选择区支持点击、键盘、拖拽、选中文件名展示。

## AI 问答与人员档案

入口：`page-4`

核心功能：

- 聊天输入发送到 `/api/ai/chat`。
- 聊天记录显示用户消息、AI 回复、等待状态。
- 每次提问保存到 localStorage：`hrobot.aiQuestionHistory`，最多 12 条。
- 右侧工作区有两个 tab：历史问题、人员档案。
- 历史问题点击后回填输入框。
- 可清空历史问题。

人员档案功能：

- “人才档案”按钮调用 `/api/mcp/person-profile-card`。
- 返回后把档案存入 `aiProfileCards`，最多 12 张。
- 右侧人员档案面板显示：
  - 基础信息。
  - 数据完整度。
  - 来源/MCP 状态。
  - 标签。
  - 基础字段表。
  - 绩效周期、盘点周期、晋升时间线、工作经历。
  - 评价摘要。
- 档案支持：
  - 最近档案切换。
  - 刷新档案。
  - 复制摘要。
  - 展开/收起阅读。
  - 横向时间线拖拽滚动。
- 聊天中的档案卡片支持“查看档案”和若干 follow-up 问题回填。

可重构方向：

- 可以改成 Vercel chat layout、split pane、drawer 或 command style。
- 必须保留提问、历史、档案卡、档案详情、follow-up 回填和 localStorage 历史。

## 报告生成与报告库

入口：

- 报告库/展示：`page-2`
- 报告生成：`page-5`

### 报告类型

当前可选：

- `360`：360 报告设定说明。
- `org-diagnosis`：组织诊断报告设定说明。
- `talent-review`：人才盘点报告设定说明。

选择报告类型时：

- 更新隐藏输入 `reportTypeInput`。
- 切换按钮 active。
- 更新当前优先读取的设定文件提示。

### 报告资产

必须保留：

- 上传 Skill：`/api/report/upload-skill`
- 上传分析材料：`/api/report/upload-material`
- 刷新资产：`/api/report/assets`
- 删除导入文件：`/api/import/file`
- 资产卡片可被选中/取消，选中状态加入 `selectedReportAssets.skills/materials`。
- 选中资产自动同步到报告要求 textarea，格式为“已选报告资料”块。
- 资产不存在时自动从选中集合中移除。

### 报告生成

必须保留：

- 提交 `reportGenerateForm` 到 `/api/report/generate`。
- 请求包含 `reportType`、`instruction`、`selectedAssets`。
- 生成成功后刷新报告列表，清空当前报告详情。
- 模型未配置或失败时展示明确状态。

### 报告库与详情

必须保留：

- 报告列表来自 `/api/report/latest?list=1`。
- 两处搜索框共享 `reportSearchText`，互相同步。
- 搜索匹配标题、类型、材料来源、时间等。
- 报告卡支持点击和键盘 Enter/Space 打开。
- 打开报告详情调用 `/api/report/latest?id=...`。
- 详情支持 MD 视图和 HTML 视图。
- 如果没有 HTML，点击生成 HTML 调用 `/api/report/html`。
- HTML 详情通过 sandbox iframe 展示。
- 支持删除当前报告：`DELETE /api/report`。

## 人才盘点汇报工具页

入口：`page-11`

当前内容：

- 6 个 slide：总览、干部、关键岗位、校招生、汰换/待提升、人才策略。
- `data-report-slide` 控制导航。
- `data-report-slide-panel` 控制内容显示。
- 部分指标由 `renderReportTool()` 根据 `people` 动态填充：
  - 总人数。
  - 789 人数/占比。
  - 456 人数/占比。
  - 123 人数/占比。
  - 当前校准变化数。
  - 人数最多宫格。

校准嵌入：

- 汇报页里存在多个 `talent-calibrator-card`。
- inline calibrator 会把人才盘点工作区挂载到对应卡片，按人才池或序列快速切换。
- 静态导出时会生成可离线点击切换的校准小视图。

导出：

- `exportTalentReportHtmlBtn` 生成静态 HTML。
- 导出逻辑会克隆 deck、内联 CSS、内联图片、移除 inline onclick、加入静态脚本。

可重构方向：

- 可以把汇报页重构成 Vercel 风格 presentation/editor。
- 必须保留 slide 切换、动态指标、校准嵌入和静态 HTML 导出。

## 情报中心

入口：`page-7`

核心功能：

- 情报列表读取 `/api/intelligence`。
- 支持参数：
  - `date`
  - `history`
- 搜索字段匹配标题、摘要、来源、关键词。
- channel tab：
  - 全部
  - `ai_hr`
  - `game_org`
- 列表分为 AI × HR 和游戏组织两栏。
- 展示数量 badge。
- 支持查看来源链接。
- 手动更新调用 `/api/intelligence/update`。
- 历史查询按钮按日期读取历史。
- 查看最新按钮读取最新。

设置页里的情报配置：

- 自动更新开关。
- 每日更新时间。
- 更新渠道。
- 检索来源。
- 每词条数。
- 微信全文数。
- 是否保留未核验微信线索。
- 读取 `/api/intelligence/config`。
- 保存 `/api/intelligence/config`。

## 设计中心

入口：`page-8`

核心功能：

- 表单字段：
  - 海报类型 `posterType`
  - 风格 `posterStyle`
  - 尺寸 `posterSize`
  - 需求描述 `posterRequirement`
- 生成海报调用 `/api/design/posters/generate`。
- 成功后刷新海报历史。
- 海报历史读取 `/api/design/posters`。
- 海报卡支持预览。
- 预览使用 `dialog#posterPreviewDialog`，显示图片、打开原图链接、关闭按钮。
- 可跳转到设置页配置设计提示词。

设置页里的设计提示词配置：

- 读取 `/api/design/prompt-config`。
- 保存 `/api/design/prompt-config`。
- 字段：
  - 基础提示词。
  - 品牌与画面约束。
  - 自定义固定限定。
  - 参考素材说明。
  - Prompt 模板。
- 显示配置文件路径和参考素材目录。
- 显示 reference 文件列表。

## Agent 中心

入口：`page-10`

核心功能：

- 读取项目列表：`/api/agent-projects`。
- 前端合并内置项目和上传项目。
- 当前内置项目包括人才盘点汇报工具。
- 项目卡展示：
  - 名称、描述、运行类型。
  - 文件数、体积。
  - 结构识别置信度。
  - 依赖/环境状态。
  - 是否 AI 辅助识别。
- 上传 zip：`/api/agent-projects/upload`
- 重新分析：`/api/agent-projects/analyze`
- 打开项目：`/api/agent-projects/open`
- 删除项目：`/api/agent-projects/delete`
- 支持点击上传卡、拖拽 zip 到上传卡、文件 input 上传。
- 打开项目前会先开空白窗口，避免异步后被浏览器拦截；失败则关闭空白窗口或显示错误。

重构边界：

- 本次 Geist / Vercel 风格重构只改 Agent 中心外层工作台布局、项目卡片、上传入口、状态展示和操作控件。
- 不改 Agent 中心里已经添加进去的 Web 项目内容本身。
- 不改内置“人才盘点汇报工具页”的正文、slide 内容、图表内容、静态汇报结构和业务文案。
- 不改用户上传的其他 Web 项目文件、页面结构、样式、脚本和运行逻辑。
- 对这些项目只允许改变外层承载方式，例如项目列表怎么展示、如何打开、如何标注状态；项目打开后的页面应保持原样。

## 设置

入口：`page-9`

### 数据源配置

线上 MCP：

- 读取 `/api/data-sources/config`。
- 保存 `/api/data-sources/config`。
- 字段：
  - MCP 地址。
  - 鉴权 Header。
  - 鉴权密钥，留空不覆盖。

本地数据目录：

- 保存并扫描：`/api/data-sources/scan`。
- 可单独重新扫描。
- 展示扫描摘要、文件类型、目录结果。

### 模型配置

多模态大模型：

- 保存到 `/api/ai/config` 的 `multimodal` 分组。
- 字段：Base URL、模型、API Key。
- 用于 AI 问答、报告生成、情报摘要增强。

图像生成模型：

- 保存到 `/api/ai/config` 的 `image` 分组。
- 字段：Base URL、模型、API Key。
- 测试生图调用 `/api/ai/image/test`。
- 用于设计中心海报生成。

### 首页备忘录

- 读取 `/api/home-memos`。
- 保存 `/api/home-memos`。
- 删除 `/api/home-memos/delete`。
- 字段：日期、备忘文本。
- 首页展示当天精确匹配记录；没有当天记录则展示最近未来或最近记录；都没有则展示默认提醒。

### 应用更新

- 读取 `/api/app/update`。
- 保存更新源：`/api/app/update/config`。
- 检查更新：`/api/app/update/check`。
- 下载并更新：`/api/app/update/install`。
- 展示当前版本、最新版本、安装包、检查时间、安装目录提示。

### 服务器状态

- 读取 `/api/server/status`。
- 重启服务器：`/api/server/restart`。
- 展示连接状态、端口、进程 ID、启动时间、消息。
- 重启后会轮询等待服务恢复。

## 文件上传与导入通用逻辑

通用函数：

- `initFileDropzones()`
- `uploadFile(endpoint, fileInputId, statusId)`
- `uploadFiles(endpoint, fileInputId, statusId)`
- `syncFileDropzone(inputOrId, files)`
- `resetUploadInput(fileInputId)`

交互契约：

- dropzone 支持点击、键盘 Enter/Space、拖拽进入/离开/释放。
- 单文件 input 只取第一个文件。
- 多文件 input 保留全部文件。
- 上传后重置 input 与 dropzone 状态。

## 前端 API 清单

GET：

- `/api/people`
- `/api/review-results`
- `/api/profiles`
- `/api/people/context`
- `/api/overrides`
- `/api/profile-notes`
- `/api/ai/config`
- `/api/data-sources/config`
- `/api/server/status`
- `/api/app/update`
- `/api/home-memos`
- `/api/intelligence`
- `/api/intelligence/config`
- `/api/design/posters`
- `/api/design/prompt-config`
- `/api/agent-projects`
- `/api/ai/context`
- `/api/talent-pools`
- `/api/report/assets`
- `/api/report/presets`
- `/api/report/list`
- `/api/import/sources`
- `/api/report/latest`
- `/api/export/calibrated-excel`
- `/api/export/calibration-differences`

POST / DELETE：

- `DELETE /api/report`
- `DELETE /api/import/file`
- `POST /api/import/review-excel`
- `POST /api/import/profiles-json`
- `POST /api/import/employee-roster-excel`
- `POST /api/report/upload-skill`
- `POST /api/report/upload-material`
- `POST /api/agent-projects/upload`
- `POST /api/overrides`
- `POST /api/profile-notes`
- `POST /api/ai/config`
- `POST /api/data-sources/config`
- `POST /api/data-sources/scan`
- `POST /api/server/restart`
- `POST /api/app/update/config`
- `POST /api/app/update/check`
- `POST /api/app/update/install`
- `POST /api/home-memos`
- `POST /api/home-memos/delete`
- `POST /api/home-memos/migrate`
- `POST /api/intelligence/config`
- `POST /api/design/prompt-config`
- `POST /api/agent-projects/delete`
- `POST /api/agent-projects/analyze`
- `POST /api/agent-projects/open`
- `POST /api/intelligence/update`
- `POST /api/talent-pools`
- `POST /api/ai/chat`
- `POST /api/mcp/person-profile-card`
- `POST /api/ai/image/test`
- `POST /api/design/posters/generate`
- `POST /api/report/generate`
- `POST /api/report/html`

## Geist / Vercel 风格重构映射建议

建议后续先建立组件层，再替换业务页面：

- Navigation：全局侧边栏、顶部状态、页面切换。
- Button / IconButton：所有主次按钮、危险按钮、工具按钮。
- Input / Select / Textarea：设置、搜索、报告要求、聊天输入。
- Tabs / SegmentedControl：情报 channel、报告视图、AI 右侧 tab、slide 导航。
- Avatar / AvatarGroup：员工、经理链、团队、报告协作对象、AI 档案最近记录。
- Badge / StatusDot：AI 能力、无成长预警、环境状态、报告类型、情报来源。
- Table：分布表、报告明细、档案字段、静态汇报表。
- Drawer / Sheet：员工详情、报告校准、AI 档案阅读。
- Modal / Dialog：海报预览、确认删除、导出确认。
- Toast / InlineStatus：保存、导入、生成、删除、更新等状态反馈。
- Skeleton / EmptyState：数据加载、暂无报告、暂无情报、暂无档案。

优先迁移顺序：

1. 全局 tokens 与基础组件，不改业务行为。
2. 导航、按钮、输入、状态反馈。
3. 人才盘点筛选器、九宫格、员工详情。
4. 报告生成和报告库。
5. AI 问答、人员档案。
6. 情报中心、设计中心、Agent 中心、设置。
7. Agent 中心外壳。注意：只改项目管理外壳，不改内置或上传 Web 项目内容。

## 验收清单

每轮重构后至少验证：

- 页面导航不丢失，所有 `data-home-page` / nav 入口可跳转。
- 人才盘点能加载 `/api/people`，九宫格和表格人数一致。
- 筛选器多选、搜索、清空可用。
- 拖拽校准、撤销、重做、保存、导出可用。
- 员工详情字段、AI 能力、无成长预警、备注保存可用。
- 导入页三个导入入口可用，导入后刷新数据源列表。
- 人才池新增、编辑、删成员、删除池可用，并影响筛选。
- AI 问答可发送，历史问题可回填，人员档案可生成和查看。
- 报告资产可上传/选择/删除，报告可生成、打开、HTML 化、删除。
- 情报搜索、channel tab、历史查询、手动更新可用。
- 设计中心可生成海报，历史预览可打开。
- Agent 项目上传、分析、打开、删除可用。
- 设置页各配置保存后再次加载仍一致。
- 修改 CSS/JS 后 `index.html` cache token 已更新，并确认浏览器侧 HTML 包含新 token。
