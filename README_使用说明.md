# HRobot 使用说明

## 本地运行

项目默认使用唯一端口 `8767`：

```powershell
python server.py --host 127.0.0.1 --port 8767
```

浏览器打开：

```text
http://127.0.0.1:8767/index.html
```

也可以双击根目录的 `启动HRobot.bat`。不要直接双击 `index.html`，页面需要后端接口读取本地数据。

## Windows 发布

```powershell
powershell -ExecutionPolicy Bypass -File scripts\package_windows.ps1 -Version 0.1.0
```

产物位于：

```text
A:\AIProjects\HRobot package\windows\0.1.0\
```

目录中只保留安装包、`release.json` 和 `portable` 便携目录。发布包固定为代码包，不支持把本机 HR 数据、密钥、上传文件或生成结果打进安装包。

## macOS 源码发布

```powershell
powershell -ExecutionPolicy Bypass -File scripts\package_mac_source.ps1 -Version 0.1.0
```

产物位于：

```text
A:\AIProjects\HRobot package\mac-source\0.1.0\
```

zip 包含完整运行源码、文档、测试、空数据骨架和 macOS 启动脚本，不包含本机 HR 数据与敏感配置。

## 局域网访问

确需让同一可信内网或 VPN 中的其他电脑访问时：

```powershell
python server.py --host 0.0.0.0 --port 8767 --allow-remote-clients
```

其他电脑访问 `http://启动电脑的IPv4地址:8767/index.html`。当前版本没有登录鉴权，涉及真实 HR 数据时优先保持 `127.0.0.1` 本机访问。

## AI Key 配置

`data/ai_config.json` 只保存 Base URL 和模型名，不保存密钥。

- 文本/多模态模型可使用 `HROBOT_AI_API_KEY`，或通过 09 设置页输入。
- 图片模型可使用 `HROBOT_IMAGE_API_KEY`，或通过 09 设置页输入。
- 设置页输入的密钥保存在本机私有文件 `data/local_ai_secrets.json`。
- `data/local_ai_secrets.json` 已被 git 和发布包排除，不要放入共享包。

## 数据与人才快照

- `data/review_results/`：盘点结果源文件。
- `data/talent_profiles/`：应用当前启用的人才档案，属于运行数据，源项目内保留。
- `data/report_generation/`：报告材料、设置和生成历史。
- `data/design_center/posters/`：设计中心本地图片。

人才快照统一整理到：

```text
A:\AIProjects\HRobot talent snapshots\
  active\
  archive\
  legacy\
  hrbp_profile_splits\
  permissions\
```

`active` 保存当前启用档案的集中副本，`archive` 保存历史原件，`legacy` 保存旧中文目录遗留，`hrbp_profile_splits` 保存按 HRBP 范围拆分的档案，`permissions` 保存 HRBP 权限配置。

源码项目发现该外部目录时会优先读取外部 HRBP 数据；安装包或其他没有外部目录的环境会回退到本地 `data/hrbp_profile_splits/` 和 `data/permissions/` 空骨架。也可以通过环境变量 `HROBOT_TALENT_SNAPSHOT_ROOT` 指定其他人才快照根目录。
