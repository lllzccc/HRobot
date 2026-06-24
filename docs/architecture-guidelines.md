# 项目架构与模块边界指引

本项目后续开发优先按业务功能模块组织代码，避免继续扩大 `index.html` 和 `server.py` 单体文件。

## 当前拆分状态

- `index.html` 仅保留页面结构和资源入口。
- 全局样式入口为 `static/css/app.css`。
- 前端交互入口为 `static/js/app.js`。
- 人才盘点前端模块入口为 `static/modules/talent-review/talent-review.js`，当前承接九宫格、筛选、人才池、员工详情侧栏、档案匹配摘要、校准调整、导入导出等前端函数。
- 人才盘点后端模块入口为 `app/modules/talent_review/store.py`，当前通过 `TalentReviewStoreMixin` 接入 `DataStore`，承接人员合并、档案匹配、花名册/盘点导入、校准保存、人才池和校准导出等后端函数。
- Agent 中心后端模块入口为 `app/modules/agent_center/store.py`，当前通过 `AgentCenterStoreMixin` 接入 `DataStore`，承接项目上传解压、结构分析、运行环境判断、项目进程管理和删除清理。
- 后续新增样式和脚本不得重新写回 `index.html`。

## 目标模块边界

### talent-review

人才盘点模块是后续第一个业务模块化试点，范围包括：

- 九宫格矩阵、统计卡片、人员表格、筛选器。
- 校准调整、保存调整、重置调整、校准差异导出。
- 盘点结果导入、员工关系导入、人才池维护。
- 员工详情侧栏、档案匹配、档案摘要、人员画像展示。
- 与人才盘点强相关的后端导入、导出、匹配、补全逻辑。

建议目标目录：

- `static/modules/talent-review/view.js`
- `static/modules/talent-review/state.js`
- `static/modules/talent-review/api.js`
- `static/modules/talent-review/matrix.js`
- `static/modules/talent-review/import-export.js`
- `static/modules/talent-review/profile-panel.js`
- `static/modules/talent-review/styles.css`
- `app/modules/talent_review/store.py`（当前已落地，后续可继续拆为下列文件）
- `app/modules/talent_review/routes.py`
- `app/modules/talent_review/service.py`
- `app/modules/talent_review/repository.py`
- `app/modules/talent_review/importers.py`
- `app/modules/talent_review/exporters.py`

### reports

报告生成模块范围包括：

- 报告生成表单、报告类型、报告库、报告详情。
- Skill 导入、材料导入、报告设定文件读取。
- Markdown / HTML 报告生成、报告删除。
- 报告相关后端存储、格式转换和 AI 请求拼装。

### agent-center

Agent 中心模块范围包括：

- Web 项目上传、项目卡片、打开项目、删除项目。
- 静态项目解压、项目 manifest、项目运行进程管理。
- 孤儿进程清理、项目端口分配和运行日志。

### intelligence

情报模块范围包括：

- 情报列表、搜索、日期筛选、频道筛选。
- 情报源配置、手动更新、定时更新状态。
- 情报更新脚本调用和结果读取。

### settings

设置模块范围包括：

- AI 模型配置、图片模型配置。
- 设计提示词配置。
- 首页备忘配置。
- 其他系统级偏好设置。

## 协作规则

- 新增功能必须先判断归属模块，再修改对应模块文件。
- 修改人才盘点相关能力时，优先集中在 `talent-review` 模块；不要顺手改报告、Agent 中心、情报或设置模块。
- 跨模块复用逻辑应进入 `shared` 或 `utils`，不要让一个业务模块直接依赖另一个业务模块的内部实现。
- 后续拆分 `server.py` 时，先抽出纯函数和领域服务，再迁移路由，避免一次性大搬家。
- 每次模块迁移后都要验证 `8767` 本地页面与对应接口可用。
