# VP 训练模块

实现及上线日期：2026-11-01。已发布到学校站点 `https://algospark.cwnupaa.com/#vp`。

## 使用

导航「VP 训练」对应 `#vp`。可组合搜索关键词、年份（2024—2026）、ICPC / CCPC、邀请赛 / 区域赛和个人 VP 状态，并切换年份排序。卡片提供 CF Gym 入口、题面 PDF、原赛每队纸质题面语言和份数、金银铜末位正式获奖队的解题数与总罚时、原赛榜单和资料来源。CF 里还需由用户自行发起虚拟参赛。

登录后勾选「我已 VP」，比赛出现在下方「我已 VP 的场次」，可取消。记录是用户手动确认，不会同步 CF 的实际参赛结果，也不计入刷题积分。记录存储在当前账号的 SQLite `vp_completions` 表，刷新、重新登录后恢复；退出或切换账号清空前一个账号的页面状态，迟到的请求结果会被忽略。

## 首批资料和边界

- 共 28 场：2024 年 15 场、2025 年 8 场、2026 年 5 场。是首批已核实目录，尚未覆盖这三年所有比赛。
- 26 场有核实过的 CF Gym 入口；2025 南京区域赛、2026 深圳邀请赛目前提供命题方列出的 QOJ 备用入口，没有虚构 CF 编号。
- 27 场附题面 PDF；补齐 2024 沈阳中文附件及 2026 CCPC 南昌同场非官方镜像 PDF（卡片明确标明镜像）。2026 CCPC 秦皇岛仍待补充。
- 「原赛纸质题面 / 每队」与「可下载 PDF」分别显示。现场资料现有 10 场：4 场份数完整（2024 ICPC 南京、昆明均为英文 3 + 中文 1；2024 CCPC 济南英文 1 + 中文 3；2026 ICPC 深圳英文 1 + 中文 2），另有 6 场核实部分语言或份数。其余 18 场本轮尚未找到足够的现场发放依据，不代表资料不存在。参赛者记录与命题人员记录明确区分；null 为未知，0 为来源明确未提供，已确认语言另存 confirmedLanguages，不由 PDF 语言或读题人数推定份数。逐场依据及未采纳线索见 `design/vp-onsite-research-20261101.md`。
- 17 场有可复算的完整奖牌线：按正式队排名展示末位获奖队解题数及总罚时（分钟；原赛按秒计分时保留秒），总罚时含解出题目的耗时和 AC 前应计的失败罚时。原赛同题数、同罚时时还会比较末题时间。2024 南京金 5/645 分、银 4/606 分、铜 3/406 分。其余缺少明确配额、正式队分组或完整榜单的场次仍待核实。
- 使用原比赛年份和日期，不采用 CF Gym / Universal Cup 重赛日期。XCPC Board 新旧归档的 Unix 秒 / 毫秒及 team_id / id 两种格式已兼容。

## 来源

- [Codeforces 官方 Gym API](https://codeforces.com/api/contest.list?gym=true) 核实比赛编号、名称。
- CF 每场 `attachments?locale=en` 页面及 PDF 附件核实题面语言和直接下载地址。
- [SUA 命题组资料](https://sua.ac/wiki/) 核实南京、昆明、武汉、深圳等场次的中英文 PDF 和备用入口。
- [XCPC Board](https://board.xcpcio.com/) 原赛的 `config.json` / `team.json` / `run.json` 提供日期、分组、奖牌配额及提交记录；按正式队的解题数、罚时、末题通过分钟排序并保留并列名次。核对 [XCPCIO 计分实现](https://github.com/xcpcio/xcpcio/tree/main/packages/libs/core/src) 后，兼容逐题向下取分钟、按秒累计及最后统一取分钟三种规则；CE 等不计罚时，AC 后提交不计，未解出题目的失败不计，未解封榜单不生成最终线；支持归档中明确的 CCPC 奖牌预设，模糊分组不推定。
- [2024 南京参赛者现场记录](https://macesuted.moe/article/2024-icpc-regional-nanjing) 记载 3 英文 + 1 中文，并在正式赛中记载共享中文本。按参赛者记录标注，未冒充官方参赛手册。
- [2024 CCPC 济南命题人员记录](https://www.cnblogs.com/imakf/p/18521489/ccpc-jinan-2024) 直接记载正式赛题册每队 3 中文 + 1 英文。

数据保存在 `vp-contests.json`，仅通过 `GET /api/vp/contests` 公开。手工核对的现场份数、来源类型、来源链接及限制说明维护在 `vp-onsite-statements.json`，生成目录时合并。`tools/refresh-vp-catalog.mjs` 维护目录及来源缓存；`tools/vp-medals.mjs` 计算完整排名和奖牌线。来源缓存位于 Git 忽略的 `backups/vp-research-20261101/`。新增比赛应使用稳定 ID，更新 CF 编号不改动 ID，以保留用户标记。

## 验证

58 项项目测试通过，VP 专项 6 项，覆盖目录及现场配额、已知语言与未知份数、明确未发放的区别、生成目录与人工资料一致、南京完整奖牌线、旧新榜单格式、非正式队排除、AC 去重及赛后提交排除、三种罚时取整、CE / 忽略提交、同分末题与并列排名、CCPC 配额预设、未解封榜单拒算，以及原有鉴权、幂等、账号隔离、持久保存、积分及资源白名单。

本地浏览器使用隔离数据库验证组合筛选、登录提示、保存、刷新恢复、取消、退出账号清理，无前端控制台错误；375px 内容宽度没有横向溢出。截图：`design/vp-desktop-20261101.jpg`。预览账号及数据仅位于 `backups/vp-preview-20261101/`，不在发布包内。

## 发布

已按用户要求发布到 `https://algospark.cwnupaa.com/#vp`。从用户之前在「更新前缀和与差分题单」中提供的登录信息恢复学校服务器访问，凭据仅经隐藏输入传递，不保存到项目文件或命令参数。

发布包为 `dist/algospark-vp-20261101.zip`，仅含 6 个应用文件、基线 / 发布哈希和发布脚本，不含数据库、账号、配置或密钥。通过 `tools/deploy-vp-school.py` 上传到 `/tmp/algospark-vp-20261101-v1`，校验既有线上基线后完成 SQLite 在线备份、应用文件安装及服务重启。发布结果 `VP_RELEASE_OK`，原代码和数据库备份位于 `/home/paa/algospark/releases/20261101-pre-vp-v1`。回滚保留新增 VP 数据表及用户记录。

基线来源：2026-10-29 二分章节发布的首页、Field Notes 发布的脚本，以及 2026-10-25 前缀和与差分发布的后端。部署前全部匹配；同版本发布脚本不能重复运行。

上线后公网首页、app.js、vp.js、vp.css 均 HTTP 200 且与本地发布包逐字节一致；VP 目录 API 返回相同 28 场比赛，匿名 VP 进度接口返回 401，原有 OJ API 返回 44 题。正式网站浏览器验证「2025 + 区域赛 + 沈阳」组合筛选，展示中英文 PDF、CF 入口和奖牌线，无控制台错误。上线截图 `design/vp-live-20261101.jpg`。未在生产站点创建测试账号或修改真实用户的 VP 标记。

### 现场份数与罚时修正发布（同日 v2）

发布包 `dist/algospark-vp-details-20261101.zip`，脚本 `deploy/vp-details-school-release.sh`，上传命令 `python tools/deploy-vp-school.py --details`。仅替换 `index.html`、`vp.js`、`vp.css`、`vp-contests.json`；重启现有服务读取新目录，不改后端代码、数据库结构、比赛 ID 或个人 VP 记录。JS / CSS 缓存版本 `20261101-vp-v2`。

发布结果 `VP_DETAILS_RELEASE_OK`；备份 `/home/paa/algospark/releases/20261101-pre-vp-details-v2`，暂存目录 `/tmp/algospark-vp-20261101-v2`。公网四份资源和 API 逐字节 / 数据匹配；28 场、17 套完整奖牌线，南京配额及罚时匹配，原 OJ 仍 44 题、匿名进度 401。浏览器验证 2024 + 南京，无控制台错误，375px 无横向溢出。截图 `design/vp-details-live-20261101.jpg`。该版本不可重复运行发布脚本。

### 现场资料补查发布（同日 v3）

本轮新增 8 场现场记录，现场资料合计 10 场（4 场份数完整、6 场部分核实），另补两份中文 PDF。网站按字段显示已确认语言、已确认份数、明确未提供及待核实状态，未知不当作零。详细来源见 design/vp-onsite-research-20261101.md。

发布包 dist/algospark-vp-onsite-20261101-v3.zip；脚本 deploy/vp-onsite-school-release.sh；命令 python tools/deploy-vp-school.py --onsite。只更新 index.html、vp.js、vp-contests.json，先核对 v2 线上基线，保留数据库和比赛 ID。发布结果 VP_ONSITE_RELEASE_OK，备份 /home/paa/algospark/releases/20261101-pre-vp-onsite-v3，暂存 /tmp/algospark-vp-20261101-v3。该版本不可重复运行。

58 项测试通过。公网首页、脚本与目录 API 匹配本地发布内容，浏览器核对深圳 1 英文 + 2 中文、部分语言与未知份数显示、镜像 PDF 标注，无控制台错误。截图 design/vp-onsite-live-20261101.jpg。
