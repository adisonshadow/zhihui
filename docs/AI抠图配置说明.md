# AI 抠图配置说明

AI 抠图与 AI 大模型（OpenAI 协议）分离配置：大模型用于剧本、绘图等，抠图使用独立的云端 API 服务（如火山引擎智能分割）。

## 1. 入口

在 **设置** 面板（AI 模型配置）中，「添加模型」按钮旁有 **添加 AI 抠图** 按钮。点击后新增一条 AI 抠图配置，在右侧表单中填写并保存。

## 2. 配置项

| 配置项 | 说明 |
|--------|------|
| AI 服务 | 当前仅支持「火山引擎抠图」 |
| 名称 | 可选，用于在列表中识别 |
| Access Key ID | 必填，火山引擎控制台获取 |
| Secret Access Key | 必填，火山引擎控制台获取 |
| 区域 | 可选，默认 `cn-north-1`，可选华北2、新加坡等 |
| 启用 | 是否启用该条配置，禁用后不会在抠图时被选用 |

## 3. 火山引擎凭证获取

1. 登录 [火山引擎控制台](https://console.volcengine.com/)
2. 进入 **访问控制** > **访问密钥**
3. 创建 Access Key，得到 Access Key ID 与 Secret Access Key
4. 开通「图像识别」-「通用图像分割」-「智能分割」能力

**重要**：若使用**子用户**的 Access Key，需额外为其授予 `cv:CVProcess` 权限，否则会返回  
`User is not authorized to perform: cv:CVProcess on resource:`。

- **方案一**：使用**主账号**的 Access Key（主账号拥有全部权限）
- **方案二**：为子用户添加 IAM 策略  
  1. 进入 **访问控制** > **权限策略** > **新建自定义策略**  
  2. 选择「按策略语法创建」，填入如下 JSON：

```json
{
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["cv:CVProcess"],
      "Resource": ["*"]
    }
  ]
}
```

3. 保存后，将该策略**绑定到**对应的子用户或用户组

参考文档：
- [智能分割](https://www.volcengine.com/docs/86081/1660405)
- [智能分割最佳实践](https://www.volcengine.com/docs/86081/1660408)

## 4. 连接服务

抠图 API 调用位于独立文件 `electron/main/volcengineMattingService.ts`，实现火山引擎 OpenAPI 签名与请求。当前对接 **通用图像分割（cv 服务）**，若需 veImageX 智能背景移除等，可调整服务名、Action、Version。

## 4.1 为何 DevTools Network 里看不到请求？

抠图请求在 **Electron 主进程（Node.js）** 中发起，不在渲染进程。DevTools 的 Network 面板只显示渲染进程（网页）的请求，主进程的请求不会出现在那里。

查看主进程日志：在终端中运行 `yarn dev` 启动应用时，主进程的 `console.error` 会输出到该终端。若出现「请求失败」，终端会打印更详细的错误原因（如 `原因`、`错误码`）。

## 4.2 常见「fetch failed」原因

| 现象 | 可能原因 | 处理建议 |
|------|----------|----------|
| `ECONNREFUSED` | 无法连接目标地址 | 检查本机网络、防火墙、代理 |
| `ETIMEDOUT` / 超时 | 网络慢或阻断 | 检查代理/VPN、尝试其他网络 |
| **`ENOTFOUND`** | **DNS 无法解析主机名** | 见下方 4.3 |
| `CERT_HAS_EXPIRED` / SSL 相关 | 证书或 HTTPS 问题 | 更新系统/Node、检查代理是否拦截 HTTPS |
| 代理环境 | 主进程需通过环境变量使用代理 | 启动前设置 `HTTP_PROXY`、`HTTPS_PROXY`（如 `export https_proxy=http://127.0.0.1:7897`），再运行 `yarn dev` |
| AK/SK 或签名错误 | 请求发出但被服务端拒绝 | 控制台会返回 HTTP 4xx 及具体错误，可据此核对凭证与签名 |
| `User is not authorized to perform: cv:CVProcess` | IAM 权限不足（子用户未授权） | 见上方「3. 火山引擎凭证获取」中的权限说明 |

## 4.3 ENOTFOUND 原因说明

错误 `getaddrinfo ENOTFOUND xxx.volcengineapi.com` 表示 **DNS 无法解析该主机名**。可能有两种情况：

**情况一：主机名本身不正确**

正确域名为 `visual.volcengineapi.com`（全球中心化服务）。若此前使用错误域名会出现 ENOTFOUND。

**情况二：网络/DNS 无法解析 volcengine 域名**

- **使用代理时**：若开启了代理（如 Clash、V2Ray），DNS 可能走远程解析，对 `*.volcengineapi.com` 解析异常；
- **解决**：可尝试关闭系统代理后重试，或为火山引擎域名配置直连/不代理；
- **验证**：在终端执行 `nslookup visual.volcengineapi.com`，查看是否有解析结果。

## 5. 与本地抠图的关系

项目支持两类抠图方式：
- **本地 ONNX**：RVM、BiRefNet、U2Net 等，在 `electron/ai-model-service` 中
- **云端 AI 抠图**：火山引擎等，配置在设置面板的 AI 抠图列表中

在**新建/编辑精灵图**时，抠图模型下拉框中会显示已配置的 AI 抠图（位于本地模型之上）。选择后执行抠图时使用对应云端服务。
