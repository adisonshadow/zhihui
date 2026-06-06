# CC Proxies — 自定义 API 协议代理

本目录存放自定义 API 协议转换代理（Custom/Compatible Client Proxy），用于将第三方非标准 API 包装为 OpenAI 兼容协议。

## 原理

`generate_images` 等 Tool 调用的是 OpenAI 标准的 `POST {apiUrl}/images/generations` 接口，返回 `{"data": [{"url": "..."}]}`。

如果第三方 API（如 Pollinations）使用不同的协议（GET 传参、返回二进制图片等），就需要一个代理层来做协议翻译。

启动代理服务后，在 AI 模型设置中添加一个指向本地代理的模型即可：

```
apiUrl: http://127.0.0.1:19815/api/v1/proxies/{proxyName}
```

## 已有代理

| 目录 | 代理目标 | 说明 |
|------|---------|------|
| `pollinations/` | Pollinations.ai | flux 文生图，免费 |

## 添加新代理

1. 在 `ccProxys/` 下创建一个新目录
2. 实现 `handleRequest(req, res, parsedPath, apiKey) => Promise<boolean>`
3. 在 `server.ts` 中 import 并注册
4. 在 AI 模型设置中添加对应的模型配置
