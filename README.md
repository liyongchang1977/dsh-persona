# dsh-persona

给 [DeepSeek Harness](https://github.com/deepseek-ai) 加上**可切换的对话人格**。

人格卡就是一个个 markdown 文件，在设置页点一下就能换，下一轮对话立刻生效——不用重启，也不用新开会话。

> 安装前先看一眼「安装」那一节：**光把包放进 `node_modules` 是不生效的**，还要在 profile 里登记一次。

---

## 它是什么

- **人格卡 = markdown 文件**。开头一小段 frontmatter 写名字和标签，正文就是「你该怎么说话」。想让人格损一点、软一点、话少一点，改文件就行。
- **设置页点选即换**。DSH 设置里会多出一个「对话人格」栏目，卡片列表、当前激活高亮、点一下切换。
- **两条切换通道**。懒得点界面，也可以直接对 agent 说「换成毒舌群友」，它会自己调 `persona_use`；或者手改 `~/.dsh/personas/active.json`。

人格只影响**语气和措辞**，不影响技术判断——注入时会带一句边界声明，防止 agent 变成只会角色扮演不干活的家伙。

---

## 安装

### 方式一：pnpm 从 git 装（推荐）

```bash
# 1. 进到你的 DSH profile 目录（Windows 默认在 ~/.dsh/profiles/desktop）
cd ~/.dsh/profiles/desktop

# 2. 装包（把 yourname 换成仓库实际地址）
pnpm add dsh-persona@git+https://github.com/yourname/dsh-persona.git

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

## 写第一张人格卡

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
| 正文 | 注入给 agent 的人格描述，上限 4000 字，超了会截断 |

写完之后在设置页点一下「刷新」就能看到。

> 第一次启动时，如果检测到 `~/.dsh/dsh-roost/personas/` 里已经有人格卡，会自动抄一份过来，老用户的卡不会丢。

---

## 三种切换方式

**1. 设置页**（最直观）
设置 → 对话人格 → 点卡片。当前激活的会有蓝点和边框。

**2. 让 agent 调工具**
直接说：「换成惜字如金」，agent 会调 `persona_use`。

**3. 改文件**
```json
// ~/.dsh/personas/active.json
{
  "active": "terse",
  "sessions": {
    "session-abc123": "fatfish"
  }
}
```
顶层 `active` 是全局默认；`sessions` 里可以给单个会话指定人格，优先级更高。

---

## 工具

| 工具 | 参数 | 作用 |
| --- | --- | --- |
| `persona_list` | 无 | 列出所有人格卡以及当前激活的是哪张 |
| `persona_use` | `id` | 切换到指定人格，传空字符串表示关闭人格 |
| `persona_show` | `id`? | 看某张卡的全文，不传就是当前激活的那张 |
| `persona_save` | `id`, `content`, `name`?, `tags`? | 新建或覆盖一张卡 |

## HTTP 接口

设置页面板走的就是这三个接口，也可以自己 curl：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/dsh-persona/list` | 返回 `{ ok, personas, active, dir }` |
| `POST` | `/dsh-persona/use` | body `{ "id": "fatfish" }`，切换人格 |
| `GET` | `/dsh-persona/preview?id=xxx` | 返回某张卡的完整正文 |

---

## 配置

写在 profile `package.json` 的 `bundles` 里对应条目下（或者直接改源码里的 `DEFAULTS`）：

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `dir` | `~/.dsh/personas` | 人格卡目录 |
| `seedFrom` | `~/.dsh/dsh-roost/personas` | 首次运行从哪导入旧卡 |
| `order` | `10250` | 注入在系统提示里的位置 |
| `maxChars` | `4000` | 单张卡正文上限 |
| `enabled` | `true` | 总开关 |

---

## 工作原理

没什么黑魔法，就三步：

1. **注入**：`ctx.systemPrompt.context({ name, order: 10250, text: () => renderFor(sessionId) })`。
   `text` 是个**函数**，每轮对话才现算——这就是为什么切换人格不用重启、不用新会话，下一句就生效。
   10250 这个位置是刻意选的：排在宿主自带的部署级 persona（10200）之后、语言规则（10300）之前。

2. **找会话**：`ctx.agents.list()` 每 3 秒扫一遍，新会话挂上、关掉的摘掉，这样才能支持「给单个会话单独设人格」。

3. **设置页**：客户端通过 `ctx.slots.inject('settings.section', ...)` 往设置页注册一个栏目，`order: 8` 控制排位。

---

## 目录结构

```
dsh-persona/
├── dsh/index.js          # 宿主侧：注入、工具、HTTP 路由  (490 行)
├── lib/client.js         # 浏览器侧：设置页面板          (264 行)
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

## 发布前要改的

如果你 fork 了这份代码要发自己的仓库，记得把两处 `yourname` 换掉：

- `package.json` 里的 `repository` / `homepage` / `bugs`
- 本文档「安装」一节里的 git 地址

---

## License

[MIT](./LICENSE)
