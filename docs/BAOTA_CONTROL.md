# 宝塔广告与品牌配置

宝塔只承担配置控制，不承担门户和游戏流量。浏览器从宝塔读取 JSON；读取失败时自动回退到 GitHub Pages 仓库内的 `config.json` 和 `ads.json`。

## 文件位置

在宝塔站点中建立独立目录，例如：

```text
/www/wwwroot/777723.xyz/rpg-control/
├── config.json
└── ads.json
```

先复制仓库根目录同名文件，再按需修改：

- `publishUrl`：顶部“发布页”和页脚链接。
- `acquireUrl`：所有游戏卡片“获取”按钮的默认地址。
- `adsEndpoints`：填写 `https://777723.xyz/rpg-control/ads.json`。
- `gameAd.startDelaySeconds`：进入启动器后首次广告等待时间。
- `gameAd.repeatSeconds`：后续广告间隔，最低 60 秒。
- `gameAd.closeDelaySeconds`：广告关闭按钮倒计时。
- `analytics.endpoint`：留空表示完全关闭统计。

广告文案在 `ads.json` 的 `ads` 数组中统一维护，广告位只引用 ID。卡片广告间隔由 `cardInterval.min` 和 `cardInterval.max` 控制，允许范围为 8～12。

## CORS

只允许门户读取配置。Nginx 可在 `/rpg-control/` 的 location 中加入：

```nginx
add_header Access-Control-Allow-Origin "https://777723-xyz.github.io" always;
add_header Access-Control-Allow-Methods "GET, OPTIONS" always;
add_header Access-Control-Allow-Headers "Content-Type" always;
add_header Cache-Control "no-cache, no-store, must-revalidate" always;
if ($request_method = OPTIONS) { return 204; }
```

绑定自定义门户域名后，把 `Access-Control-Allow-Origin` 改成该门户的 HTTPS Origin。不要在这些 JSON 文件中写 API 密钥、SSH 密钥或任何密码。

## 启用远程控制

确认下面地址能公开返回合法 JSON 后，再把门户仓库 `config.json` 改为：

```json
"runtimeConfigEndpoints": [
  "https://777723.xyz/rpg-control/config.json"
]
```

远程 `config.json` 中将 `adsEndpoints` 设置为：

```json
"adsEndpoints": [
  "https://777723.xyz/rpg-control/ads.json",
  "/ads.json"
]
```

远程地址排在第一位，本地文件是故障回退。修改时先在临时文件校验 JSON，再原子替换正式文件，避免用户读到只写了一半的内容。

Markdown 适合写操作说明，不适合作为浏览器运行配置；运行数据应保持 JSON，才能被校验并安全解析。
