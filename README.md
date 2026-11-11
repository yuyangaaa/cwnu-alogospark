# AlgoSpark

面向算法竞赛学习者的训练平台，提供 C++ 与算法课程、学习进度、刷题排行榜、VP 训练目录及 Hydro 在线评测接入。

技术栈：JavaScript、Node.js、SQLite，Hydro 插件使用 TypeScript。

## VP 训练

导航新增「VP 训练」，支持关键词、年份、ICPC / CCPC、邀请赛 / 区域赛及个人状态组合筛选。首批整理 2024—2026 年 28 场比赛，提供 CF 入口、题面 PDF、原赛每队纸质题面份数（单独核实并附出处）和金银铜末位正式获奖队的解题数及罚时；缺失资料明确标记。登录后勾选「我已 VP」即可随账号保存，在页面下方查看或取消。VP 记录由用户手动确认，不计刷题积分。来源、数据维护和发布说明见 `design/vp-module.md`。

- `GET /api/vp/contests`：公开比赛目录。
- `GET /api/vp/progress`：获取当前账号已 VP 记录。
- `POST /api/vp/completion`：提交 `{ "contestId": "目录中的稳定 ID", "completed": true }`，`false` 取消标记。

## 本地运行

需要 Node.js 22.13 或更高版本。在项目目录安装依赖并启动：

```powershell
npm.cmd ci
npm.cmd start
```

浏览器打开 <http://localhost:3000>。首次启动时，服务会自动创建 `data/algospark.db`，无需另行安装或配置数据库。管理员可以在“学习资源”中发布外链或上传 PDF；PDF 默认最大 20 MB，并保存在 `data/resource-pdfs/`。不要直接双击 `index.html`，否则页面无法连接后端并会显示 `Failed to fetch`。

登录窗口按身份分流：西华师范大学学生使用协会官网账号（账号密码或协会邮箱验证码）统一登录；其他学校用户使用 AlgoSpark 邮箱和密码登录，首次使用需完成邮箱验证注册。未配置邮件服务时，开发模式会把验证码打印在运行 `node server.js` 的终端中，便于本地测试。

也可以使用：

```powershell
npm.cmd start
npm.cmd run dev
```

开发模式会在源文件变化后自动重启服务。如果 PowerShell 禁止执行 `npm.ps1`，请像上面一样使用 `npm.cmd`。

## 身份接口

- `POST /api/auth/send-verification-code`：发送注册邮箱验证码
- `POST /api/auth/send-login-code`：向已注册的其他学校用户发送登录验证码
- `POST /api/auth/code-login`：使用 AlgoSpark 邮箱验证码登录
- `POST /api/auth/register`：注册并登录
- `POST /api/auth/login`：登录
- `POST /api/auth/association/send-code`：由后端代理发送协会官网邮箱验证码
- `POST /api/auth/association/login`：由后端代理协会官网认证并创建或关联本地账号
- `POST /api/auth/logout`：退出登录
- `GET /api/auth/me`：获取当前用户
- `GET /api/practice/progress`：获取当前账号刷题进度与积分
- `POST /api/practice/completion`：标记或取消洛谷训练题完成状态，并同步小额积分
- `GET /api/learning/progress`：获取账号的章节进度、学习日期与最近位置
- `POST /api/learning/progress`：同步 C++ 或算法章节完成状态
- `POST /api/learning/visit`：同步最近学习位置
- `POST /api/learning/import`：首次登录时迁移本地历史进度
- `GET /api/leaderboard`：获取积分前 50 名；已登录用户不在前 50 名时额外返回本人名次
- `GET /api/hydro/problems`：获取协会 Hydro 题目、绑定和通过状态
- `POST /api/hydro/account`：绑定当前网站账号的 Hydro 用户名
- `POST /api/hydro/submit`：把当前用户的代码提交到协会 Hydro 判题桥
- `GET /api/hydro/submissions/:id`：查询当前用户的一次评测结果
- `POST /api/hydro/demo-submission`：仅在本地开发模式模拟判题结果
- `POST /api/integrations/hydro/problem`：由 Hydro 插件同步题目信息
- `POST /api/integrations/hydro/account`：由 Hydro 插件使用一次性绑定码验证账号
- `POST /api/integrations/hydro/submission`：由 Hydro 插件同步判题结果
- `GET /api/admin/hydro`：管理员获取题目、统计与最近评测
- `POST /api/admin/hydro/problems`：管理员校验并发布或修改 Hydro 题目
- `POST /api/admin/hydro/problems/:id/status`：管理员上架或下架题目

密码使用带随机盐的 scrypt 哈希保存；登录凭证保存在 HttpOnly、SameSite=Strict Cookie 中。部署到公网时请设置 `NODE_ENV=production` 并通过 HTTPS 访问，此时 Cookie 会自动启用 `Secure`。

协会官网登录需要在 `.env` 中配置 `ASSOCIATION_AUTH_APP_KEY`。该密钥只能保存在 AlgoSpark 后端，不能写入 `index.html`、`app.js` 或发送给普通用户：

```env
ASSOCIATION_AUTH_BASE_URL=https://www.cwnupaa.com/api
ASSOCIATION_AUTH_APP_KEY=协会官网接口管理中生成的密钥
```

可使用独立脚本绕过 AlgoSpark 后端，直接按协会接口文档测试。默认命令只使用虚构账号检查 API Key 是否被识别，不会登录真实用户：

```powershell
npm.cmd run test:association
```

完整账号密码登录测试（密码在终端中隐藏输入，不会写入命令历史）：

```powershell
npm.cmd run test:association -- --account 你的协会账号
```

脚本还支持 `--send-code 邮箱` 和 `--code-login 邮箱`。返回用户资料默认脱敏，API Key 和登录凭证不会输出。

## 管理员后台

在 `.env` 中用 `ADMIN_EMAILS` 指定管理员注册邮箱，多个邮箱用英文逗号分隔。使用对应邮箱登录后，顶部导航会出现“管理后台”。不要把所有注册用户设为管理员。

```env
ADMIN_EMAILS=teacher@example.edu.cn,student-admin@example.edu.cn
```

管理员可以输入 Hydro 题号并在线校验、读取题目名称、设置 1–1000 的积分、选择语法或算法题单、上下架题目，并查看最近 100 条学生评测。插件尚未安装时，可以取消“先到协会 Hydro 校验”，预先保存本地题目配置。原创题包导入 Hydro 后，可点击“一键发布入门题包”，自动校验并发布 `AS1001`–`AS1024`；重复点击会安全更新现有题目，不会重复创建。

## 刷题积分与排行榜

洛谷入门题支持手动标记完成：阶段 1—2 每题 3 分、阶段 3—4 每题 4 分、阶段 5—6 每题 5 分，共 32 题、满分 130 分。取消完成会同步扣回相应积分，同一道题不会因重复点击而累计加分。协会 OJ 题使用 Hydro 自动判题：只有收到 AC 结果才会记为完成并发放积分，同一账号完成同一道 Hydro 题只能计分一次，重复回调或重复 AC 不会重复加分。

排行榜展示积分前 50 名的昵称、姓名、学校、完成题数和积分，同时统计洛谷手动完成积分和 Hydro 自动判题积分。

## Hydro 插件接入

开发环境默认在“刷题训练 → 语法题单”的协会 OJ 区域创建一道人为演示题。登录后点击“模拟 AC”，即可验证通过状态、个人主页积分和排行榜是否同步。演示接口仅在非 production 环境开放。

可安装插件源码位于 `hydro-plugin`，可交付的 ZIP 位于 `dist`。具体安装命令和题目同步命令见插件 ZIP 内的 `README.md`。

正式接入步骤：

1. 在网站 `.env` 中填写 `HYDRO_BASE_URL`、`HYDRO_BRIDGE_URL` 和随机生成的 `HYDRO_WEBHOOK_SECRET`。
2. 师兄在协会 Hydro 安装插件 ZIP，并在 Hydro 系统设置填写网站 HTTPS 地址与同一份共享密钥。
3. 先在 Hydro 创建题目和测试数据，再调用插件的 `/algospark/sync-problem` 接口将题目及积分同步到本站。
4. 用户在网站生成 6 位绑定码，登录 Hydro 打开确认链接完成身份验证。
5. 用户直接在本网站编辑并提交代码；插件使用绑定用户的真实 Hydro UID 创建评测记录，判题完成后自动回传结果。

整个过程不保存 Hydro 管理员密码，不模拟登录 Cookie，也不需要学生跳转到 OJ 的提交页面。共享密钥只存在于两个后端，所有服务间请求都携带 `Authorization: Bearer <HYDRO_WEBHOOK_SECRET>`。

## 原创 Hydro 入门题包

第一批原创入门题位于 `hydro-problems/algospark-starter-v1`，可直接交付的批量导入文件是 `dist/algospark-starter-v1-hydro.zip`。题号为 `AS1001`–`AS1014`，覆盖输出、输入输出、乘法、字符、字符串、浮点数、数学公式、时间计算、表达式、逻辑运算、条件判断、多分支和排序。

语法后半程题位于 `hydro-problems/algospark-grammar-tail-v1`，独立导入文件是 `dist/algospark-grammar-tail-v1-hydro.zip`。题号为 `AS1015`–`AS1024`，覆盖循环、嵌套循环、数组、二维数组、字符串、函数、结构体、`vector + sort` 和固定小数位数。两个题包相互独立，第二个题包不会重复导入 `AS1001`–`AS1014`。

基础算法题单已开放模拟、贪心、二分、前缀和与差分四个专题，共 32 题。每个专题包含 4 道洛谷题和 4 道协会 Hydro 现有题；洛谷题手动完成计 6—8 分，协会题首次 AC 自动计分。协会已有合适题目时直接复用，不重复导入同题。前缀和与差分专题复用 `ZS0025`、`PX0004`、`PX0005`、`PX0009`，搭配洛谷 `P1614`、`P2004`、`P2367`、`P3397`，覆盖一维、二维前缀和及差分。

算法学习当前共开放 14 节：基础算法 9 节（含概率与期望），以及线性 DP、背包 DP、树形 DP、换根 DP、区间 DP。动态规划课程包含状态定义、转移推导、初始化、递推顺序、完整 C++ 代码、复杂度和常见错误，并纳入账号学习进度同步；树形 DP 覆盖有根化、选 / 不选与树形背包，换根 DP 讲解两次 DFS 和距离和模型，区间 DP 讲解石子合并、括号匹配与两类区间转移。对应代码采用个人 XCPC 模板中的命名和组织方式，正文、公式、输入顺序及边界说明同步维护。

每道题包含原创中文题面、标准 C++17 程序、5–6 组测试数据和 Hydro 判题配置。运行以下命令可以重新生成并验证题包：

```powershell
node tools\generate-hydro-starter-pack.mjs
node tools\generate-hydro-grammar-tail.mjs
node tools\verify-hydro-starter-pack.mjs
```

导入时，在 Hydro 管理员界面进入“题库 → 从 Hydro 导入”，上传 ZIP。导入后再通过 AlgoSpark 管理后台设置积分并发布。现有洛谷题继续作为外部参考题；若协会 Hydro 已经合法收录对应题目，可直接关联协会题号，不需要复制题面和数据。

同步题目的请求示例：

```json
{
  "problemId": "P1001",
  "title": "A+B Problem",
  "points": 10,
  "track": "grammar",
  "url": "https://oj.example.com/d/association/p/P1001",
  "active": true
}
```

`track` 使用 `grammar` 或 `algorithm`，决定题目显示在语法题单还是算法题单；未提供时默认归入语法题单。

同步判题结果的请求示例：

```json
{
  "submissionId": "68001",
  "problemId": "P1001",
  "hydroUserId": "24",
  "hydroUsername": "student01",
  "verdict": "AC",
  "submittedAt": "2026-08-10T12:30:00.000Z"
}
```

账号验证请求格式为 `{"hydroUserId":"24","hydroUsername":"student01","linkCode":"123456"}`。绑定码 10 分钟有效且只能使用一次，避免其他人冒用别人的 Hydro 用户名领取积分。同步密钥只应保存在两台服务器的环境变量中，不要写入前端代码或提交到 Git。

## 学习进度同步

登录后，C++ 章节完成状态、算法章节完成状态、学习日期、连续学习天数和最近学习位置会保存到服务器。用户首次登录新版进度系统时，当前浏览器中已有的章节记录会与账号合并一次；后续以服务器记录为准。刷题进度单独由判题/积分记录管理，不会通过本地进度迁移获得积分。

## 配置真实邮件发送

准备一个支持 SMTP 的发件邮箱。先复制配置示例：

```powershell
Copy-Item .env.example .env
```

然后编辑 `.env`，填入邮箱服务商提供的 SMTP 信息。通常应填写“SMTP 授权码”，不要填写邮箱登录密码。完成后运行 `npm.cmd start`。

也可以不使用 `.env`，直接在当前 PowerShell 窗口设置环境变量：

```powershell
$env:SMTP_HOST = 'smtp.qq.com'
$env:SMTP_PORT = '465'
$env:SMTP_SECURE = 'true'
$env:SMTP_USER = '你的发件邮箱@qq.com'
$env:SMTP_PASS = '邮箱服务商生成的SMTP授权码'
$env:SMTP_FROM = 'AlgoSpark <你的发件邮箱@qq.com>'
node server.js
```

使用 587 端口的邮箱服务时，将 `SMTP_SECURE` 设置为 `false`。修改环境变量后需要重启服务。

可通过环境变量修改端口和数据位置：

```powershell
$env:PORT = '8080'
$env:DATA_DIR = 'D:\algospark-data'
node server.js
```
