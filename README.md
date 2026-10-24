# 秋招画像系统

面向应届生的求职信息管理工具。填一次信息，覆盖央国企与互联网双赛道网申，并自动生成能力画像与岗位匹配推荐。

**纯前端实现，所有数据仅保存在浏览器本地，不上传任何服务器。**

---

## 快速开始

### 在线使用（推荐）

访问部署地址即可，无需安装任何软件。

https://recuritment-portrait.top/

（备用地址：https://yub369302-cyber.github.io/Recuritment-Portrait/）

### 本地运行

```bash
cd qiuzhao-2027
python -m http.server 8765
```

浏览器访问 `http://localhost:8765`

注意：岗位匹配页使用 `fetch` 加载 `jobs/jd-library.json`，在 `file://` 协议下会因浏览器 CORS 限制而报错，必须通过 HTTP 服务器访问。

---

## 核心工作流

系统围绕应届生秋招的完整链路设计，共五个核心环节：

| 环节 | 页面 / 工具 | 核心能力 |
|------|-------------|----------|
| 信息填写 | index.html | 87 字段档案，覆盖互联网与央国企双赛道网申表单 |
| 岗位匹配 | match.html | 六维加权匹配；详情显示可用数据覆盖率 |
| 意向岗位 | intention.html | 有职责或关键词的 JD 支持经历分析和事实型文案生成 |
| 简历生成 | resume.html | 一键整合完整简历、ATS 兼容性校验、纯文本导出 |
| 网申自动填充 | Chrome 插件 | 基于档案一键自动填写各公司网申表单，数据零上传 |

数据在各页面间通过 localStorage 自动流转，无需手动导入导出。

岗位匹配页必需加载内置精选库，并会尝试加载本地增强线索库。增强库由公司级职位列表转换而来，不含逐岗职责或关键词；这类记录只提供职位、公司类别、地点、批次和投递信息。页面会标出评分数据覆盖率，缺少职责或关键词的岗位不会生成技能缺口，也不能用于经历挖掘。

---

## 它解决什么问题

秋招要填的信息又多又重复：

- 互联网网申问 GitHub、技术栈、项目难点
- 央国企网申问民族、籍贯、政治面貌、家庭情况、学生干部经历
- 每换一家公司，同样的信息重填一遍

这个工具让你一次性把所有字段填全，之后：

- 需要填网申时，打开档案照抄
- 需要做简历时，按投递对象自动取舍内容
- 需要选岗位时，系统基于你的画像自动推荐并给出差距分析

### 设计特点

**按赛道动态显示字段。** 只投互联网就不会看到"家庭主要成员"；勾了央国企才出现民族、籍贯、政治面貌等网申必填项。目前共 87 个字段，实际显示 63 至 87 个不等。

**三档技能分级。** 强制把技能分成"熟练、熟悉、了解、缺口"四档，只有"熟练"档才建议写进简历。这是防止面试被问倒的关键设计。

**记录短板。** 每段实习和项目都有一个"我讲不清楚的地方"字段。它不会出现在简历里，但面试准备时会用到——诚实记录短板比假装没有更有用。

**不鼓励编造。** 量化成果一栏明确提示"没有真实数字就写暂无量化，不要估算"。简历里的每个数字面试官都可能追问。

---

## 网申自动填充插件（Chrome Extension）

`extension/` 目录下是配套的 Chrome 插件，基于你在主站填写的档案，一键自动填写各公司网申表单。

### 安装方式

1. 打开 Chrome 的「扩展程序」管理页（`chrome://extensions`）
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」，选择本仓库的 `extension/` 文件夹
4. 插件图标出现在工具栏，点击即可使用

### 使用流程

1. **在主站填写档案**：打开 `index.html`，按步骤完成信息填写。
2. **导出档案给插件**：填写完成后点击右上角「📥 导出给插件使用」，下载 JSON 档案。
3. **导入插件**：点击插件图标 → 「📥 导入档案 JSON」，选择刚下载的文件。
4. **一键填充**：打开任意网申页面，点击插件里的「⚡ 一键填充当前页面」。

### 设计特点

**数据零上传。** 插件只申请 `activeTab`、`scripting`、`storage` 三个最小权限，所有字段匹配和填写逻辑完全在本地运行，没有任何网络请求。

**组件库适配。** 除原生表单控件外，内置对 Ant Design、Element UI、Layui 等常见组件库封装选择器的自动识别与填写策略。

**字段模糊匹配。** 采用标签语义提取 + Levenshtein 距离 + 同义词库，自动将网页上的「真实姓名」「应聘人姓名」等变体映射到档案的 `name` 字段，无需为每个网站单独配置。

**隐私优先。** 敏感字段（身份证号、家庭成员等）在档案导出时会被隔离到 `_sensitive`，导入插件后同样只存在本地 `chrome.storage.local`，不会随表单填写外泄。

### 插件目录结构

```
extension/
├── manifest.json           Chrome MV3 清单
├── background/main.js      Service Worker（安装引导与消息兜底）
├── content/
│   ├── main.js             自动填充引擎（提取 → 匹配 → 填写 → 报告）
│   └── adapters.js         组件库适配器（AntD / Element UI / Layui）
├── popup/
│   ├── popup.html          控制面板 UI
│   ├── popup.css           面板样式
│   └── popup.js            面板交互逻辑
├── config/
│   └── synonyms.zh.json    同义词库（与主站 schema.js 对齐）
└── assets/
    └── icon*.png           插件图标
```

---

## 数据怎么存、怎么带走

| 机制 | 说明 |
|------|------|
| 自动暂存 | 每次修改后自动存入浏览器 localStorage，刷新页面不丢失 |
| 导出 JSON | 点击右上角"导出 JSON"，得到完整档案文件 |
| 导入 JSON | 换电脑或换浏览器时，点击"导入 JSON"选择文件即可完整恢复 |

### 重要提醒

localStorage 是按域名和协议隔离的，这意味着：

- 线上填的数据，本地打开时看不到（反之亦然）
- 清理浏览器缓存会清空数据
- 换设备、换浏览器不会自动同步

**导出的 JSON 文件才是你的唯一可靠备份，请务必妥善保管。** 建议每次填完都导出一次。

档案保存在浏览器本地存储中，但应用没有对 localStorage 加密；同一浏览器配置下运行的同源脚本可以读取它。浏览器扩展会把你确认的字段填入当前招聘网站页面，使用前请核对目标网站和字段内容。不要在共享设备或不可信的浏览器环境中保存真实档案。

### 敏感字段的特殊处理

身份证号、紧急联系人、家庭成员这三项标记为敏感字段，导出时会单独放进 `_sensitive` 字段：

```json
{
  "name": "张三",
  "phone": "138...",
  "_sensitive": {
    "idNumber": "...",
    "familyMembers": "..."
  }
}
```

如果你要把档案发给别人看（比如找人帮忙改简历），先手动删掉 `_sensitive` 这一段即可。导入时如果有这段会自动还原。

---

## 演示模式

所有页面支持 `?demo=1` 参数加载虚构演示数据，不会读取或覆盖你 localStorage 中的真实档案。

```
https://recuritment-portrait.top/match.html?demo=1
```

演示数据人物：陈默（虚构，2027 届，数据分析方向）。进入演示模式后页面顶部会显示黄色横幅提示。

用途：截图发朋友圈或小红书、录屏做教程、让朋友帮忙看功能而不暴露真实信息。

---

## 版本兼容

字段 schema 遵循"只增不改"原则：新版本只添加字段，不重命名或删除已有字段。

导入旧版本导出的文件时，系统会自动补齐缺失的新字段并保留所有旧数据，不会因为版本不同而报错或丢数据。已测试 v1 档案可正常导入 v3。

---

## 目录结构

```
qiuzhao-2027/
├── index.html              信息填写（表单 + 分步向导）
├── portrait.html           能力画像（雷达图 + 岗位矩阵 + 编辑面板）
├── match.html              岗位匹配（结果列表 + 筛选器 + 标记投递 + 意向标记）
├── intention.html          意向岗位（三档分析 + 对话式经历挖掘 + 五维评估）
├── resume.html             简历生成（一键整合 + ATS 校验 + 纯文本导出）
├── extension/              网申自动填充 Chrome 插件（见下方专节）
│   ├── manifest.json
│   ├── background/main.js
│   ├── content/main.js
│   ├── content/adapters.js
│   ├── popup/
│   ├── config/synonyms.zh.json
│   └── assets/
├── src/
│   ├── schema.js           字段定义与版本迁移
│   ├── design-system.css   全局设计系统
│   ├── job-library.js      岗位库合并与历史意向恢复
│   ├── portrait-engine.js  画像生成引擎（7维雷达 + 角色适配）
│   ├── match-engine.js     岗位匹配引擎（六维评分 + 缺口分析）
│   ├── experience-miner.js 经历挖掘引擎（问题树 + STAR文案 + 五维评估）
│   ├── resume-engine.js    简历生成引擎（三源装配 + 加权裁剪 + 四态审计）
│   └── demo-profile.js     演示数据档案
├── jobs/
│   ├── jd-library.json     JD 库（支持动态扩展）
│   └── README.md           JD 扩展指南
├── vendor/
│   └── vue.global.prod.js  Vue 3（已内置，离线可用）
├── tools/
│   └── install-hooks.ps1   Git 隐私防护钩子安装脚本
└── .gitignore              个人数据隔离规则
```

### 加字段 / 改字段

只需编辑 `src/schema.js`。字段定义示例：

```js
{
  key: 'github',
  label: 'GitHub 主页',
  type: 'text',                    // text|textarea|number|month|select|radio|multiselect|checkbox
  required: false,
  track: 'internet',               // soe|internet|both
  showIf: d => hasTrack(d, '互联网大厂'),
  hint: '没有可留空',
  sensitive: false                 // true 则导出时隔离到 _sensitive
}
```

改完刷新浏览器即可看到效果，不需要构建。

### 加岗位 / 加方向

详见 `jobs/README.md`。简要说明：

- **同方向扩量**：直接往 `jd-library.json` 的 `jobs` 数组追加，无需改代码
- **新增方向**：改 `jd-library.json` + `src/match-engine.js` 的 `TRACK_REGISTRY` + 可选改 `schema.js` 和 `portrait-engine.js`

### 隐私防护

本项目会收集个人信息。如果你 fork 后要公开发布，请保留：

1. `.gitignore` 中的个人数据规则——防止档案文件被提交
2. `tools/install-hooks.ps1`——安装后会在 commit 前扫描手机号、身份证号并阻止提交

安装钩子：

```powershell
powershell -ExecutionPolicy Bypass -File tools\install-hooks.ps1
```

公开仓库一旦提交了个人数据，Git 历史里会永久留存，删掉文件也无法真正清除，且任何 fork 的人都能拿到。这两层防护拦得住意外，请不要移除。

---

## 技术说明

纯静态站点，Vue 3（CDN 版本，已下载到本地）。无构建流程、无 npm 依赖、无后端。

选择这个方案是因为：字段多且条件逻辑复杂，纯手写 DOM 操作难以维护；但引入完整构建工具链又会抬高使用和贡献门槛。CDN 版 Vue 是这个规模下的平衡点。

---

## License

MIT
