# 开发与验证



```sh
npm ci --ignore-scripts --legacy-peer-deps
npm test
npm run setup:host
npm run test:host
npm run pack:check
```

需要 Git 与 pnpm（锁定宿主使用 11.28.5）。宿主源码和临时 DSH_HOME 均位于 `work/`，不使用正式 profile 或 API Key。`TOOLGATE_HOST` 可指向同一固定 commit 的已有干净 checkout。

单元回归覆盖 YAML 精确编辑、复杂参数、真实补丁顺序、写入失败回滚、来源和路径检查。宿主套件使用真实 Cordis/tools/skills、HTTP 服务器和 Cookie 认证；设置 `TOOLGATE_BROWSER=1` 时还运行真实 React 设置页的浏览器操作（Windows 使用 Edge，Linux 先运行 `npx --no-install playwright install --with-deps chromium`）。CI 在 Windows/Linux 都执行单元、宿主、浏览器和安装包检查。这些设置页测试不是完整 Desktop 外壳或真实模型验收。

[GitHub](https://github.com/jidekaixin2dian/dsh-toolgate) · [Releases](https://github.com/jidekaixin2dian/dsh-toolgate/releases) · MIT


## 发布校验

发布时自动核对标签版本、包内文件与标签源码，并校验 GitHub 下载摘要。手动复核使用 Actions 中的 **Release integrity**，填入已发布标签；历史标签与附件保持原样。


---

## English



```sh
npm ci --ignore-scripts --legacy-peer-deps
npm test
npm run setup:host
npm run test:host
npm run pack:check
```

Git and pnpm are required; the pinned host uses pnpm 11.28.5. Host source and temporary DSH_HOME data stay under `work/`, without production profiles or API keys. `TOOLGATE_HOST` can select an existing clean checkout at the exact pinned commit.

Unit regressions cover precise YAML changes, complex arguments, patch precedence, failed-write rollback and path/source identity. The host suite uses real Cordis/tools/skills, HTTP and Cookie authentication. With `TOOLGATE_BROWSER=1` it also exercises the actual React settings page in Edge on Windows or Chromium on Linux (`npx --no-install playwright install --with-deps chromium`). CI runs unit, host, browser and package-install checks on Windows and Linux. These settings tests do not certify the complete Desktop shell or real-model behavior.

[GitHub](https://github.com/jidekaixin2dian/dsh-toolgate) · [Releases](https://github.com/jidekaixin2dian/dsh-toolgate/releases) · MIT


## Release verification

Published releases are checked for tag/version consistency, archive files matching tagged source, and the GitHub download digest. Run **Release integrity** in Actions with a published tag to recheck it. Historical tags and assets remain unchanged.


## npm 发布

仅在已获发布授权后操作。新 tag 必须位于 main，完整 CI 成功，GitHub Release 归档与 tag 一致；然后从相同 tag 调度 `npm-publish.yml` 并填入相同版本 tag，直接发布校验后的 GitHub 归档。首次创建 npm 包需要浏览器登录与 2FA；包建立后配置该仓库的 Trusted Publisher（仅 `npm-publish.yml`），后续发布不保存长期 token。更新检测与一键安装由市场/官方安装器完成，插件不另写自更新器。
