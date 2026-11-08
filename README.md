# opsemilygohmbza.github.io

> 2026-11-08 恢复说明：这是从 2026-07-20 本地源码备份恢复的新账号部署。目录恢复不等于游戏文件恢复。旧账号的 Pages 地址已退出发布列表；只有在新账号实际部署并通过入口检查的游戏，才会写入门户 `games.json`。浏览器运行检查尚未接通，HTTP/HTML 通过不代表游戏全流程通过。

ecy.al 的公开 Web RPG 门户。仓库只承载门户、启动器和发布时生成的可用游戏目录；游戏文件由各游戏 Fork 的 GitHub Pages 承载。

## 数据闭环

1. `game-index-runner/list.json` 是唯一游戏真源。
2. Pages 工作流运行 `scripts/build-catalog.mjs`，只保留 `verified`、属于 `allowedGameHosts` 且实际返回成功状态的游戏。
3. 门户只读取本次部署生成的 `games.json`。
4. `config.json` 管理品牌、发布页、获取链接、启动器、允许的游戏域名、统计端点和游戏广告时间。
5. `ads.json` 管理 13 条广告文案及顶部、搜索下方、卡片间、游戏开始和游戏定时广告位。

门户仅在推送、手动触发和 runner 发布目录后的 `catalog-updated` 事件重新构建，已移除每小时重复构建的 cron。runner 仅每月 1、6、11、16、21、26 日北京时间 10:17 启动维护（通常间隔 5 天，跨月为 3–6 天），没有每日到期检查。平台定时任务仍是尽力调度，并非准点保证。部署前检查配置、广告引用和单元回归，只上传 `dist/`，排除 Git 历史与管理脚本。广告、样式和游戏启动器保持本次修改前的线上源码原样。

## 本地检查

```bash
node --input-type=module --check < app.js
node --test scripts/test-portal.mjs
node scripts/validate-portal.mjs
node scripts/build-catalog.mjs
```

然后在仓库根目录启动任意静态 HTTP 服务，访问 `/` 和 `/play.html?id=<游戏ID>`。

## 宝塔控制广告

直接在 GitHub 编辑 `config.json` 和 `ads.json` 即可，无需宝塔。广告总开关是 `ads.json` 顶层的 `enabled`；获取按钮默认取 `ads.json.acquireUrl`，发布页取 `config.json.publishUrl`。每条广告各自有 `url`，并非固定同一个域名。

单独关闭顶部推广的例子（其他广告保持原样）：

```json
"header": { "enabled": false, "ads": ["acg-01"] }
```

单条广告也支持 `"enabled": false`。要一键关闭全部推广，将顶层 `"enabled"` 设置为 `false`；游戏启动器仍然正常路由，不会因为广告开关而跳回旧站。

宝塔只需要提供很小的 JSON 配置文件，不存游戏、不反代游戏流量。完整操作与 CORS 示例见 [`docs/BAOTA_CONTROL.md`](docs/BAOTA_CONTROL.md)。广告服务尚未上线前，保持 `runtimeConfigEndpoints` 为空，门户会使用仓库内的安全默认配置。

## 绑定域名

域名准备好后，在本仓库 **Settings → Pages → Custom domain** 中设置，并同步修改：

1. `config.json` 的 `allowedGameHosts`。
2. `game-index-runner` 的 `SITE_ORIGIN` 和后续回写的 `pagesUrl`。

此架构不需要宝塔代理或存储游戏资源。
