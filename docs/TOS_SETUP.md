# 火山引擎 TOS 配置指南

本指南帮助你在项目中启用火山引擎对象存储 TOS 作为图床，确保 Step C（参考图生成）返回的链接稳定可访问。

## 一、准备工作
- 注册并登录：[火山引擎](https://www.volcengine.com/)
- 开通对象存储 TOS 服务

## 二、获取访问密钥（AK/SK）
1. 控制台左侧导航：访问控制 → 访问密钥
2. 创建访问密钥，记录 `AccessKeyId` 与 `SecretAccessKey`

## 三、创建存储桶（Bucket）
1. 进入 TOS 控制台，点击“创建存储桶”
2. 建议设置：
   - 桶名：如 `fengshui-images`
   - 地域：`cn-beijing`（或就近地域）
   - 访问权限：`公共读`
3. 若使用自定义域名或 CDN，后续绑定到该桶

## 四、配置项目 `.env`
在项目根目录复制 `.env.template` 为 `.env`，并填入实际信息：

```env
IMAGE_HOST=auto
VOLC_ACCESS_KEY_ID=你的AK
VOLC_SECRET_ACCESS_KEY=你的SK
VOLC_BUCKET=你的桶名
VOLC_REGION=cn-beijing
VOLC_ENDPOINT=https://tos-cn-beijing.volces.com   # 可选，按地域调整
VOLC_PUBLIC_HOST=https://你的图床域名             # 可选，自定义域名更美观
# PUBLIC_SERVER_ORIGIN=https://你的后端公网域名   # 可选，用于返回本地 uploads 的公网地址
```

说明：
- `IMAGE_HOST=auto`：如果检测到 TOS 配置齐全，则优先使用 TOS 作为图床，否则回退到 `imgbb`
- `VOLC_PUBLIC_HOST`：当你给桶绑定了自定义域名时，生成的图片 URL 会以该域名开头，形如 `https://img.example.com/xxx.png`
- 若不配置 `VOLC_PUBLIC_HOST`，默认返回 `endpoint/bucket/key` 格式的公网 URL

## 五、运行并验证
1. 安装依赖并运行：
   ```bash
   npm install
   npm run dev
   ```
2. 在页面按 A→B→C 流程生成图片
3. 观察后端日志：
   - 成功时打印：`[Upload] hosted via volc => https://...`
   - 若图床异常，自动落盘到本地：`http://localhost:3001/uploads/...`

## 六、常见问题
- 返回的是本地 `uploads` URL：
  - 检查 `.env` 是否已填充并被读取（重启 dev）
  - 确认 AK/SK、Bucket、Region 正确
  - 桶是否允许公共读；或你设定了可访问的签名/策略
- Step B 超时：
  - 前端已提升超时到 60s，如仍超时，尝试更快模型或简单化输入
- Doubao 下载参考图失败：
  - TOS 公网域名稳定后，Doubao 下载成功率显著提升；仍失败时后端已自动降级为无参考图生成

## 七、参考
- TOS 公网访问样例：
  - 自定义域名：`https://img.example.com/upload_1762xxxx.png`
  - 默认格式：`https://tos-cn-beijing.volces.com/your-bucket/upload_1762xxxx.png`

如你希望我帮你直接填好 `.env`，请提供：AK、SK、桶名、地域，以及是否有自定义域名。我可以一次性生成并重启服务验证。