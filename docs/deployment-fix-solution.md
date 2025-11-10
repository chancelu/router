# Vercel 环境变量配置与 Doubao 图片生成 401 修复指南

本指南帮助你在 Vercel 正确配置 Doubao（火山引擎 Ark）所需的密钥，修复线上图片生成接口返回 401（API key 格式错误）的问题。

## 一、需要配置的环境变量

- `DOUBAO_API_KEY`: Doubao Ark 平台发放的 API Key（UUID 风格，带短横线），用于兼容 OpenAI 的文本与图片接口。
- 可选（不要误用）：`OPENAI_COMPAT_API_KEY`、`OPENAI_API_KEY` 等不适用于 Doubao。请确保 Doubao 场景下优先使用 `DOUBAO_API_KEY`。

备注：后端已做密钥清洗，自动去除多余空格与引号，但建议在面板中填写干净值。

## 二、如何在 Vercel 配置环境变量

1. 打开 Vercel 项目 → Settings → Environment Variables。
2. 新增或确认：
   - `DOUBAO_API_KEY`: 粘贴 Doubao Ark 后台生成的 Key（非 `sk-...`，形如 `580cb05d-c92f-490b-8823-ca762d4e8a86`）。
3. 保存后，点击 Deploy 触发一次 Production 重新部署。
4. 部署完成后，在线上执行图片生成（步骤C），并在日志中确认：
   - `runOpenAIImagesCompat baseURL normalize { before, after }`
   - `[Key] doubao key in use (images) { source, len, prefix, looksLikeOpenAI, looksLikeAKSK }`

这两条日志可以帮助确认是否加载到了正确的 Key，不会泄露完整密钥。

## 三、常见误区与修正

- 使用 OpenAI 的 `sk-...` 作为 Doubao 的 `Bearer` 会导致 401。必须使用 Doubao Ark 的 API Key。
- 使用 AK/SK 组合（例如 `AKID:SK`）并不适用于当前 `Bearer` 认证方式。
- 基础地址需为 `https://ark.cn-beijing.volces.com/api/v3`。后端已做归一化，日志可见 `after` 字段。

## 四、本地快速自检

在项目根目录运行脚本 `npm run check:env`（下节将添加），确保：
- 本地 `.env` 有 `DOUBAO_API_KEY` 且格式看起来像 Doubao Key（非 `sk-...`）。
- 若本地使用 `.env` 正常，而线上使用 Vercel 未配置 `DOUBAO_API_KEY`，会导致线上失败。

## 五、问题仍存在时如何提供信息

请把线上这两条日志发我：
- `runOpenAIImagesCompat baseURL normalize { before, after }`
- `[Key] doubao key in use (images) { source, len, prefix, looksLikeOpenAI, looksLikeAKSK }`

我将根据日志继续定位问题（例如是否仍在使用 `OPENAI_COMPAT_API_KEY` 或 Key 值含有不可见字符等）。

---

如需我帮你在 Vercel 面板中完成配置，请提供项目访问权限；否则按本文档的步骤操作即可