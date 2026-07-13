# Packaging Rules

HRobot 的发布产物必须写到源项目外的统一目录，源项目不保留构建中间物或发布成品。

应用名为 `Hrobot`，版本号读取或对应根目录的 `app_version.json`。当前版本从 `0.1.0` 开始。

## 发布目录

```text
A:\AIProjects\HRobot package\
  windows\<版本号>\
    hrobot-win-<版本号>.exe
    release.json
    portable\
  mac-source\<版本号>\
    hrobot-mac-source-<版本号>.zip
```

- `windows/<版本号>/` 只放 Windows 安装包、`release.json` 和便携目录。
- `mac-source/<版本号>/` 只放同版本的完整 macOS 源码 zip。
- PyInstaller、压缩暂存目录和安装器生成脚本写入发布根目录下的 `.build-temp`，发布完成后自动删除。
- 不在源项目中创建或保留 `build/`、`packages/`、`dist/` 等构建和发布目录。

## 默认排除

发布包只包含代码、静态资源、文档、测试和空的数据目录骨架，不得包含：

- API Key、`data/ai_config.json`、`data/local_ai_secrets.json`、`data/mcp_config.json`
- `data/update_config.json`、用户设置、首页备忘、AI 问答上下文
- 人才池、校准结果和 HR 源数据
- `data/review_results/`、`data/talent_profiles/`、`data/talent_profile_snapshots/`
- external HRBP permissions and profile splits under `HRobot talent snapshots`
- 已生成报告、Markdown 报告、上传材料和设计图片
- backups、exports、uploads、logs、caches 和构建产物

升级安装时可以替换代码和静态资源，但必须保留安装目录中已有的 `data/`。数据骨架文件仅可在目标不存在时创建。

## 必需内容

源码包必须包含：

- `server.py`
- `index.html`
- `app_version.json`
- `requirements.txt`
- `app/`
- `app/modules/agent_center/store.py`
- `static/`
- `assets/`
- `docs/`
- `scripts/`
- `tests/`
- 空的非敏感 `data/` 骨架
- `start_hrobot.command` 和 `start_hrobot.sh`

Windows 便携目录必须包含：

- `Hrobot.exe`
- `index.html`
- `app_version.json`
- `app/`
- `app/modules/agent_center/store.py`
- `static/`
- `assets/`
- 运行辅助脚本
- 空的非敏感 `data/` 骨架

## 构建命令

Windows：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\package_windows.ps1 -Version 0.1.0
```

macOS 源码：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\package_mac_source.ps1 -Version 0.1.0
```

`scripts/package_web.ps1` 仅作为旧入口兼容，实际转调 `package_mac_source.ps1`。

## release.json

```json
{
  "app": "Hrobot",
  "version": "0.1.0",
  "installer": "hrobot-win-0.1.0.exe",
  "publishedAt": "2026-06-17T15:30:00",
  "notes": "Hrobot 0.1.0"
}
```

## macOS desktop packages

macOS desktop apps must be built on macOS. GitHub Actions uses Apple Silicon and Intel runners to create both DMG variants:

```bash
bash scripts/package_macos.sh 0.1.3 arm64 release-dist
bash scripts/package_macos.sh 0.1.3 x64 release-dist
```

Artifacts are named `hrobot-mac-arm64-<version>.dmg` and `hrobot-mac-x64-<version>.dmg`. Runtime user data lives in `~/Library/Application Support/Hrobot`; a packaged app must not depend on writable data inside the `.app` bundle.

Desktop packages use an explicit `assets/brand/` allowlist:

- `hrobot-buddy-avatar.svg`
- `hrobot-logo-dark.png`
- `hrobot-report-watermark.png`

Never package the complete local `assets/brand/` folder.

更新源应指向包含 `release.json` 的同步目录，或直接指向可读取 JSON 的文件/URL。网页分享页通常不能作为自动更新直链。
