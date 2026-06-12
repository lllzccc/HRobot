# 人才九宫格工具使用说明

## 推荐使用方式

面向普通使用者，建议使用 Windows 安装包安装后的启动程序，不再依赖根目录里的临时启动脚本。

当前源码项目保留最小运行入口：

```powershell
python server.py --host 127.0.0.1 --port 8767
```

启动后浏览器打开：

```text
http://127.0.0.1:8767/index.html
```

不要直接双击 `index.html`，页面需要后端接口读取本地数据。

## Windows 安装包打包

打包入口保留在：

```powershell
scripts\package_windows.ps1
```

在项目根目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\package_windows.ps1
```

默认只打包程序骨架，不带当前 HR 数据。如确需把本机数据也放入包内，再显式运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\package_windows.ps1 -IncludeHrData
```

生成产物位于 `packages/windows/`。该目录属于打包产物目录，不作为项目源码保留。

## Web 源码包打包

用于交给其他 agent 做环境评估、源码检查、测试和本地 Web 运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\package_web.ps1
```

生成产物位于 `packages/web/`。默认不包含 HR 数据、API Key、生成报告、上传材料和本地缓存。

## 局域网访问

服务即使用 `0.0.0.0` 启动，默认也只接受本机访问。如果确实需要让同一局域网其他电脑访问，可以改用：

```powershell
python server.py --host 0.0.0.0 --port 8767 --allow-remote-clients
```

其他电脑访问：

```text
http://启动电脑的IPv4地址:8767/index.html
```

注意：

- 当前版本没有登录鉴权；`--allow-remote-clients` 只应在受信任的内网或 VPN 中临时使用，涉及真实 HR 数据时优先保持 `127.0.0.1` 本机访问。
- 启动服务的电脑必须保持开机。
- 服务进程不能关闭。
- 两台电脑需要在同一个局域网或 VPN 内。
- 如果访问不了，通常是 Windows 防火墙拦截了 Python 或安装后的程序，需要允许通过专用网络。

## AI Key 配置

为避免 API Key 随源码、备份或打包产物外泄，`data/ai_config.json` 只保存 Base URL 和模型名，不再持久化密钥。

- 文本/多模态模型：设置环境变量 `HROBOT_AI_API_KEY`，或在本次运行中通过 09 设置页输入。
- 图片模型：设置环境变量 `HROBOT_IMAGE_API_KEY`，或在本次运行中通过 09 设置页输入。

## 数据目录

- `data/review_results/`：放 2026 人才盘点结果 Excel/JSON，作为只读盘点底稿。
- `data/talent_profiles/`：放当前启用的人才档案快照 JSON。
- `data/talent_profile_snapshots/`：放从 HRobot 拉取的部门或工作室快照原件。
- `data/hrbp_profile_splits/`：放按 HRBP 权限拆分后的人才档案。
- `data/permissions/`：放 HRBP 权限配置。
- `data/report_generation/`：放报告生成的 skill、材料、设定说明和生成历史。
- `data/design_center/posters/`：放设计中心生成的本地图片。

系统会优先读取英文目录；旧中文目录仅作为兼容 fallback。
