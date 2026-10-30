# dsh-persona

给 [DeepSeek Harness](https://github.com/deepseek-ai) 加上**可切换、可改写的对话人格**。

人格卡是 markdown 模板，在设置页拉一下就能用，正文还能直接改成你自己的版本，后面再追加几行要求。下一轮对话立刻生效——不用重启，也不用新开会话。

> 安装前先看一眼「安装」那一节：**光把包放进 `node_modules` 是不生效的**，还要在 profile 里登记一次。

---

## 它是什么

- **模板可选**。人格卡放在 `~/.dsh/personas/`，想用哪张就在设置页选哪张；也可以一张都不用，纯手写。
- **选完就能改**。模板正文会填进可编辑的文本框，改完只影响你自己，不动那张卡。
- **还能追加**。正文后面有个「追加提示词」框，写进去的内容会作为「额外交代」接在人格之后。
- **两条切换通道**。懒得点界面，直接对 agent 说「换成毒舌群友」「再加一句别列一二三」，它会自己调 `persona_use` / `persona_set`。

人格只影响**语气和措辞**，不影响技术判断——注入时会带一句边界声明，防止 agent 变成只会角色扮演不干活的家伙。

---

## 安装

### 方式一：pnpm 从 git 装（推荐）

```bash
# 1. 进到你的 DSH profile 目录（Windows 默认在 ~/.dsh/profiles/desktop）
cd ~/.dsh/profiles/desktop

# 2. 装包
pnpm add dsh-persona@git+https://github.com/liyongchang1977/dsh-persona.git

# 3. 登记到 bundle 清单
#    打开同目录下的 package.json，找到 "dsh" -> "profile" -> "bundles"，
#    在数组末尾加一行 "dsh-persona"
```

### 方式二：手动放文件

```bash
# 把仓库整个拷进 profile 的 node_modules
cp -r dsh-persona ~/.dsh/profiles/desktop/node_modules/dsh-persona
```

然后在 profile 的 `package.json` 里补两处：

```json
{
  "dependencies": {
    "dsh-persona": "file:plugins/dsh-persona"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-persona"
      ]
    }
  }
}
```

### 最后一步：重启 DSH

改完 `bundles` **必须重启 DSH** 才会装配。重启后打开设置，左侧应该多出「对话人格」。

> **看不到栏目？按 F5 刷新页面。**
> DSH 是单页应用，设置页的栏目导航是缓存的快照；客户端代码热替换后它不会自己重算。
> 这个坑踩过，重启管用但比刷新慢得多。

---

## 设置页怎么用

```
人格模板  [ 大肥鱼 — fatfish  ▾ ]   可选
人格正文
┌──────────────────────────────┐
│ 你叫大肥鱼。说话短，一两句就完。  │  可编辑
└──────────────────────────────┘
追加提示词（可选）
┌──────────────────────────────┐
│ 回答别超过三行                │
└──────────────────────────────┘
[保存并启用] [清空] [刷新]
```

1. 下拉里选一张模板。选中的卡正文会自动填进「人格正文」，光标跟着走，直接改就行。
2. 想补充要求，写进「追加提示词」，它会以「额外交代」的形式接在正文后面。
3. 点「保存并启用」。提示里会告诉你这次注入了多少字，下一轮对话生效。
4. 不想要了，点「清空」——模板和正文一起清掉，等于关掉人格注入。

选了模板但正文一个字没改时，插件会记住「跟随模板」（`followsTemplate: true`），以后你改那张卡的文件，这里会跟着变；一旦你在正文里动了字，就变成你自己的固定版本。

---

## 写一张人格卡（模板）

人格卡放在 `~/.dsh/personas/`，一个 `.md` 就是一张卡（文件名就是 id）。

```markdown
---
name: 毒舌群友
tags: 吐槽, 直球, 不哄人
---

你说话很直，看到糊弄的方案会直接说「这不行」。

但不人身攻击，只怼事情本身。用户做对了该夸就夸，别为了毒而毒。
```

格式说明：

| 部分 | 说明 |
| --- | --- |
| `---` 包起来的 frontmatter | 可选。没有的话整篇都当正文 |
| `name` | 设置页上显示的名字 |
| `tags` | 标签，逗号分隔（`a, b, c`；写成 `[a, b]` 也认） |
| 正文 | 就是那段可编辑的正文，上限 4000 字，超了会截断 |

写完在设置页点「刷新」就能在下拉里看到。

> 第一次启动时，如果检测到 `~/.dsh/dsh-roost/personas/` 里已经有人格卡，会自动抄一份过来，老用户的卡不会丢。

---

## 三种设置方式

**1. 设置页**（最直观）
选模板 → 改正文 → 追加 → 保存。

**2. 让 agent 调工具**
直接说：「换成惜字如金」，agent 调 `persona_use`；说「再补一句回答别太长」，agent 调 `persona_set`。

**3. 改文件**
```json
// ~/.dsh/personas/active.json
{
  "template": "terse",
  "body": "",
  "extra": "回答别超过三行",
  "sessions": {
    "session-abc123": "fatfish"
  }
}
```
- `template`：模板卡 id，空字符串表示不用模板
- `body`：你自己改过的正文；**空字符串表示跟随模板原文**
- `extra`：追加提示词
- `sessions`：给单个会话指定模板，优先级高于全局
- 旧字段 `active` 仍然兼容，等价于 `template`

---

## 工具

| 工具 | 参数 | 作用 |
| --- | --- | --- |
| `persona_list` | 无 | 列出所有模板卡，以及当前用的是哪张、正文改过没有 |
| `persona_use` | `id` | 换模板（清掉改过的正文，保留追加提示词）；传空字符串关闭人格 |
| `persona_set` | `template`?, `body`?, `extra`? | 整份配置：模板、可编辑正文、追加提示词 |
| `persona_show` | `id`? | 看某张卡的全文，不传就是当前模板 |
| `persona_save` | `id`, `content`, `name`?, `tags`? | 新建或覆盖一张模板卡 |

`persona_use` 和 `persona_set` 的区别：前者是「换一张卡」，后者是「这张卡我要怎么改」。

## HTTP 接口

设置页面板走的就是这几个接口，也可以自己 curl：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/dsh-persona/config` | 当前模板、模板原文、改过的正文、追加提示词、模板列表 |
| `POST` | `/dsh-persona/config` | body `{ template, body, extra }`，保存整份配置 |
| `GET` | `/dsh-persona/list` | 只要模板列表和兼容用的 active 字段 |
| `POST` | `/dsh-persona/use` | body `{ "id": "fatfish" }`，换模板 |
| `GET` | `/dsh-persona/preview?id=xxx` | 返回某张卡的完整正文 |

---

## 配置

写在 profile `package.json` 的 `bundles` 里对应条目下（或者直接改源码里的 `DEFAULTS`）：

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `dir` | `~/.dsh/personas` | 人格卡目录 |
| `seedFrom` | `~/.dsh/dsh-roost/personas` | 首次运行从哪导入旧卡 |
| `order` | `10250` | 注入在系统提示里的位置 |
| `maxChars` | `4000` | 正文上限（模板和编辑版都按这个截断） |
| `enabled` | `true` | 总开关 |

---

## 工作原理

没什么黑魔法，就四步：

1. **注入**：`ctx.systemPrompt.context({ name, order: 10250, text: () => renderFor(sessionId) })`。
   `text` 是个**函数**，每轮对话才现算——这就是为什么改人格不用重启、不用新会话，下一句就生效。
   10250 这个位置是刻意选的：排在宿主自带的部署级 persona（10200）之后、语言规则（10300）之前。

2. **拼装**：`buildPersonaText()` 把三样东西按顺序接起来：
   ```
   ## 对话人格：<模板名 或 自定义>
   <边界声明：只决定语气，不改技术判断>
   <正文：你改过的版本，没改就是模板原文>
   ### 额外交代
   <追加提示词>
   ```
   正文和追加都为空时返回空串，一点都不注入。

3. **找会话**：`ctx.agents.list()` 每 3 秒扫一遍，新会话挂上、关掉的摘掉，这样才能支持「给单个会话单独设模板」。

4. **设置页**：客户端通过 `ctx.slots.inject('settings.section', ...)` 往设置页注册一个栏目，`order: 8` 控制排位。

---

## 目录结构

```
dsh-persona/
├── dsh/index.js          # 宿主侧：注入、工具、HTTP 路由
├── lib/client.js         # 浏览器侧：设置页面板
├── cordis.patch.yml      # bundle 装配补丁
├── package.json
├── LICENSE
└── README.md
```

> `lib/client.js` 是**手写的浏览器 bundle**，用的是 DSH 的 `window.__ModuleLoader__.load({ id, factory })` 格式，不是常规的 ESM 模块，也不是用打包器生成的。改它的时候直接改这个文件，没有构建步骤。

---

## 注意

- **前端是手写 bundle**：没有 webpack/vite，`require('react')` 由宿主注入，别指望 `import` 语法能跑。
- **设置栏首次挂载要刷新**：HMR 热替换不重算设置页导航，见上面安装那节的提示。
- **人格不是越强越好**：正文写太长会挤占上下文预算，也容易让模型过度扮演、忽略任务。200~500 字通常最舒服。
- **流式/长任务**：人格注入发生在每轮开始，运行中途改文件不会影响正在跑的这一轮。

---

## 更新记录

- **v0.2.0** —— 设置页从「点卡片切换」改成「模板可选 + 正文可编辑 + 追加提示词」；新增 `persona_set` 工具与 `GET/POST /dsh-persona/config`；`active.json` 增加 `template` / `body` / `extra` 三个字段（旧 `active` 仍兼容）。
- **v0.1.0** —— 首个版本：人格卡点选、4 个工具、3 个路由。

---

## 发布前要改的

如果你 fork 了这份代码要发自己的仓库，记得把两处 `liyongchang1977` 换掉：

- `package.json` 里的 `repository` / `homepage` / `bugs`
- 本文档「安装」一节里的 git 地址

---

## License

[MIT](./LICENSE)
