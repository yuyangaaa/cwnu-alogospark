# AlgoSpark Hydro Bridge

插件版本 0.3.1，适配 Hydro 5.0.0-beta.17 至 5.x。

AlgoSpark Hydro Bridge 负责绑定 Hydro 账号、提交代码和同步评测结果。

## 安装

1. 将插件文件复制到 Hydro 服务器上的固定目录，例如 /opt/algospark-hydro-bridge。
   目录应包含 index.ts、package.json 和 email-account.cjs。
2. 按下方「配置网站与密钥」配置 Hydro 进程，然后在 Hydro 运行账号下执行：

   ```bash
   hydrooj addon add /opt/algospark-hydro-bridge
   pm2 restart hydrooj
   ```

3. 访问 `https://oj.example.com/algospark/health`，确认返回内容中的 `ok`、`enabled` 和 `configured` 都是 `true`。

## 已提供的接口

- `GET /algospark/health`：插件健康检查。
- `POST /algospark/account-by-email`：以完整邮箱查找唯一、可提交的 Hydro 账号，忽略大小写；仅接受共享密钥认证的站点后端请求。
- `POST /algospark/problem`：检查 Hydro 中的题目和可用语言。
- `POST /algospark/update-statement`：由 AlgoSpark 管理员同步原创入门题题面与样例；仅允许更新 `AS1001`–`AS1014`。
- `POST /algospark/submit`：以已绑定学生的 Hydro UID 创建真实提交。
- `GET/POST /algospark/link`：由学生登录 Hydro 后确认六位绑定码。
- `POST /algospark/sync-problem`：将 Hydro 题目同步发布到 AlgoSpark。

除健康检查和学生绑定页面外，服务接口都必须携带与网站一致的 Bearer 共享密钥。

## 配置网站与密钥

在 Hydro 进程中配置以下变量。也可以在 Hydro 后台设置网站地址和共享密钥。

```env
ALGOSPARK_SITE_URL=https://正式网站域名
ALGOSPARK_SECRET=与网站HYDRO_WEBHOOK_SECRET完全一致的密钥
ALGOSPARK_ENABLED=true
```

插件和网站后端使用相同的共享密钥。

## 安全说明

共享密钥只允许保存在网站后端和 Hydro 服务器中，不得写入前端 JavaScript，也不要发送给学生。网站与 Hydro 均应使用 HTTPS。

## 工作流程

1. 学生在 AlgoSpark 完成登录，网站后端使用已经认证的邮箱查询 Hydro 账号。
2. 唯一匹配时直接完成绑定，不需要绑定码；无匹配或冲突时可保留原来的 Hydro 登录确认绑定方式。已验证的绑定不会自动改绑。
3. 学生在 AlgoSpark 编辑代码并提交。
4. 插件使用该学生本人的 Hydro UID 创建评测记录。
5. Hydro 完成判题后，插件向 AlgoSpark 回传 AC/WA、分数、耗时和内存。
6. AlgoSpark 只在协会 OJ 题目首次 AC 时发放积分。
