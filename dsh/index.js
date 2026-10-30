// dsh-persona — DeepSeek Harness plugin
//
// 给 DSH 本身加上可切换的对话人格：人格卡是普通的 markdown 文件，
// 激活的某一篇会被注入到每个会话的系统提示里，决定「怎么说话」。
//
// 设计取舍：
//   * 人格只管语气和措辞，不接管任务 —— 注入文本开头先划这条边界，
//     否则一个强人格能把 agent 变成只会角色扮演不干活的家伙。
//   * 卡片格式和 dsh-roost 的 personas/*.md 兼容（--- name/tags --- + 正文），
//     第一次运行会把 roost 已有的卡导入过来，老人格直接能用。
//   * 注入走 systemPrompt.context 而不是 section：context 的 text 是每轮现算的，
//     切换人格下一轮就生效，不用重启，也不动宿主的前缀缓存（order 10250 排在
//     部署 persona 之后、语言规则之前）。
//   * 卡片过长会截断：人格是系统提示的一部分，无限长会把上下文吃干净。
//
// 切换方式三选一：让 agent 调 persona_use 工具、改 ~/.dsh/personas/active.json、
// 或者调 POST /dsh-persona/use。

import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  copyFileSync,
  writeFileSync,
} from 'node:fs'

export const name = 'dsh-persona'

// tools 用来给 agent 提供人格管理能力；其余是注入与路由需要的基础设施。
export const inject = ['systemPrompt', 'agents', 'webServer', 'timer', 'tools']

const DEFAULTS = {
  // 人格卡目录
  dir: join(homedir(), '.dsh', 'personas'),
  // 首次运行从这里导入人格卡（dsh-roost 的格式相同）
  seedFrom: join(homedir(), '.dsh', 'dsh-roost', 'personas'),
  // 排在部署 persona（10200）之后、语言规则（10300）之前
  order: 10250,
  // 人格正文上限，超出截断
  maxChars: 4000,
  enabled: true,
}

const ACTIVE_FILE = 'active.json'

function textResult(value) {
  return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }]
}

// --- 人格卡读写 ---------------------------------------------------------

// 解析 `--- name: X\ntags: a, b\n---\n正文`。没有 frontmatter 时整篇都是正文。
function parsePersona(raw) {
  const text = String(raw || '').replace(/^\uFEFF/, '')
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text.trim())
  if (!match) return { meta: {}, body: text.trim() }
  const meta = {}
  for (const line of match[1].split(/\r?\n/)) {
    const cut = line.indexOf(':')
    if (cut <= 0) continue
    const key = line.slice(0, cut).trim()
    let value = line.slice(cut + 1).trim()
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    } else if (key === 'tags') {
      // roost 的卡写成 `tags: 短句, 吐槽, 鲸鱼娘`（不加方括号），同样要拆成数组
      value = value
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean)
    }
    if (key) meta[key] = value
  }
  return { meta, body: match[2].trim() }
}

function listPersonas(cfg) {
  if (!existsSync(cfg.dir)) return []
  const rows = []
  for (const file of readdirSync(cfg.dir)) {
    if (!file.endsWith('.md')) continue
    try {
      const full = join(cfg.dir, file)
      if (!statSync(full).isFile()) continue
      const { meta, body } = parsePersona(readFileSync(full, 'utf8'))
      const id = file.replace(/\.md$/i, '')
      rows.push({
        id,
        name: typeof meta.name === 'string' && meta.name ? meta.name : id,
        tags: Array.isArray(meta.tags) ? meta.tags : [],
        chars: body.length,
        // 设置页的卡片摘要：跳过标题行，取正文前 90 字
        preview: body
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith('#'))
          .join(' ')
          .slice(0, 90),
      })
    } catch {
      // 单张卡读坏了不该拖垮整个列表
    }
  }
  return rows.sort((a, b) => a.id.localeCompare(b.id))
}

function readActive(cfg) {
  try {
    const data = JSON.parse(readFileSync(join(cfg.dir, ACTIVE_FILE), 'utf8'))
    return {
      active: typeof data.active === 'string' ? data.active : '',
      // 可选：按会话覆盖，{ "<sessionId>": "<personaId>" }
      sessions: data.sessions && typeof data.sessions === 'object' ? data.sessions : {},
    }
  } catch {
    return { active: '', sessions: {} }
  }
}

function writeActive(cfg, patch) {
  mkdirSync(cfg.dir, { recursive: true })
  const before = readActive(cfg)
  const next = { ...before, ...patch, updatedAt: new Date().toISOString() }
  writeFileSync(join(cfg.dir, ACTIVE_FILE), JSON.stringify(next, null, 2) + '\n', 'utf8')
  return next
}

// 这个会话该用哪张人格卡：会话覆盖 > 全局激活 > 空（不注入）
function personaIdFor(cfg, sessionId) {
  const state = readActive(cfg)
  const sid = typeof sessionId === 'string' ? sessionId.trim() : ''
  if (sid && state.sessions[sid]) return state.sessions[sid]
  return state.active
}

function readPersonaBody(cfg, id) {
  if (!id) return ''
  const file = join(cfg.dir, `${id}.md`)
  if (!existsSync(file)) return ''
  const { meta, body } = parsePersona(readFileSync(file, 'utf8'))
  const clipped =
    body.length > cfg.maxChars
      ? `${body.slice(0, cfg.maxChars)}\n\n（人格卡过长，后面 ${body.length - cfg.maxChars} 字已省略）`
      : body
  const title = typeof meta.name === 'string' && meta.name ? meta.name : id
  return `## 对话人格：${title}\n\n下面是你说话的方式。它只决定语气、措辞和称呼，不改变任务本身的技术判断、事实准确性和做事方式；两者冲突时以任务为准。\n\n${clipped}`
}

// 首次运行：把 roost 已有的人格卡抄过来，用户的老人格不至于丢。
function seedIfEmpty(cfg) {
  try {
    if (existsSync(cfg.dir) && readdirSync(cfg.dir).some((f) => f.endsWith('.md'))) return
    if (!existsSync(cfg.seedFrom)) return
    mkdirSync(cfg.dir, { recursive: true })
    let copied = 0
    for (const file of readdirSync(cfg.seedFrom)) {
      if (!file.endsWith('.md')) continue
      const from = join(cfg.seedFrom, file)
      const to = join(cfg.dir, file)
      if (!statSync(from).isFile() || existsSync(to)) continue
      copyFileSync(from, to)
      copied += 1
    }
    if (copied) console.log(`[persona] 已从 ${cfg.seedFrom} 导入 ${copied} 张人格卡`)
  } catch (e) {
    console.error('[persona] 导入人格卡失败：' + (e && e.message))
  }
}

// --- 挂到每个会话 ------------------------------------------------------

function sessionIdOf(session) {
  if (!session) return ''
  for (const key of ['id', 'sessionId', 'key', 'sessionKey', 'sid']) {
    try {
      const value = session[key]
      if (typeof value === 'string' && value) return value
    } catch {
      // 读属性抛错就当没有
    }
  }
  return ''
}

export function apply(ctx, userConfig = {}) {
  const cfg = { ...DEFAULTS, ...(userConfig || {}) }
  if (!cfg.enabled) return

  seedIfEmpty(cfg)

  // 没有激活人格时不注入任何东西，省下上下文。
  const renderFor = (sessionId) => {
    const id = personaIdFor(cfg, sessionId)
    const text = readPersonaBody(cfg, id)
    return text || ''
  }

  const mounted = new Map()
  let disposed = false

  const mounts = () => {
    try {
      return ctx.agents.list() || []
    } catch {
      return []
    }
  }

  function mountFor(agent, sid) {
    const off = agent.ctx.systemPrompt.context({
      name: 'dsh-persona',
      order: cfg.order,
      text: () => renderFor(sid),
    })
    return typeof off === 'function' ? off : () => {}
  }

  function tick() {
    if (disposed) return
    let list = []
    try {
      list = mounts()
    } catch {
      return
    }
    for (const agent of list) {
      const sid = sessionIdOf(agent.session)
      if (!sid || mounted.has(sid)) continue
      try {
        mounted.set(sid, { sid, agent, off: mountFor(agent, sid) })
      } catch (e) {
        console.error('[persona] 挂 ' + sid + ' 失败：' + (e && e.message))
      }
    }
    // 会话关了就把注入摘掉，免得每次 tick 空转
    for (const [sid, entry] of mounted) {
      if (list.some((a) => sessionIdOf(a.session) === sid)) continue
      try {
        entry.off()
      } catch {
        // ignore
      }
      mounted.delete(sid)
    }
  }

  tick()
  try {
    ctx.effect(() => ctx.interval(tick, 3000))
  } catch (e) {
    console.error('[persona] 定时器不可用（不影响已挂的会话）：' + (e && e.message))
  }

  ctx.effect(() => () => {
    disposed = true
    for (const entry of mounted.values()) {
      try {
        entry.off()
      } catch {
        // ignore
      }
    }
    mounted.clear()
  })

  // --- HTTP 路由（设置页 / 脚本用）-------------------------------------

  const readBody = (req) =>
    new Promise((resolve) => {
      let raw = ''
      req.on('data', (chunk) => {
        raw += chunk
        if (raw.length > 65536) raw = raw.slice(0, 65536)
      })
      req.on('end', () => {
        try {
          resolve(JSON.parse(raw || '{}'))
        } catch {
          resolve({})
        }
      })
      req.on('error', () => resolve({}))
    })

  const sendJson = (res, code, obj) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(obj))
  }

  try {
    ctx.effect(() =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/dsh-persona/list',
        handler: async (req, res) => {
          try {
            const state = readActive(cfg)
            const personas = listPersonas(cfg)
            const active = state.active && personas.some((p) => p.id === state.active) ? state.active : ''
            return sendJson(res, 200, { ok: true, dir: cfg.dir, active, sessions: state.sessions, personas })
          } catch (e) {
            return sendJson(res, 500, { ok: false, error: String((e && e.message) || e) })
          }
        },
      }),
    )
  } catch (e) {
    console.error('[persona] 列表路由注册失败：' + (e && e.message))
  }

  try {
    ctx.effect(() =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/dsh-persona/use',
        handler: async (req, res) => {
          try {
            if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: '只接受 POST' })
            const body = await readBody(req)
            const id = String((body && body.id) || '').trim()
            if (!id) return sendJson(res, 400, { ok: false, error: '缺少 id' })
            if (!existsSync(join(cfg.dir, `${id}.md`))) {
              return sendJson(res, 404, { ok: false, error: `没有这张人格卡：${id}` })
            }
            const state = writeActive(cfg, { active: id })
            return sendJson(res, 200, { ok: true, active: state.active, appliesTo: '下一轮对话' })
          } catch (e) {
            return sendJson(res, 500, { ok: false, error: String((e && e.message) || e) })
          }
        },
      }),
    )
  } catch (e) {
    console.error('[persona] 切换路由注册失败：' + (e && e.message))
  }

  try {
    ctx.effect(() =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/dsh-persona/preview',
        handler: async (req, res) => {
          try {
            const url = new URL(req.url, 'http://x')
            const id = String(url.searchParams.get('id') || readActive(cfg).active || '').trim()
            if (!id) return sendJson(res, 400, { ok: false, error: '没有指定人格' })
            const file = join(cfg.dir, `${id}.md`)
            if (!existsSync(file)) return sendJson(res, 404, { ok: false, error: `没有这张人格卡：${id}` })
            const { meta, body } = parsePersona(readFileSync(file, 'utf8'))
            return sendJson(res, 200, {
              ok: true,
              id,
              name: typeof meta.name === 'string' && meta.name ? meta.name : id,
              tags: Array.isArray(meta.tags) ? meta.tags : [],
              body,
            })
          } catch (e) {
            return sendJson(res, 500, { ok: false, error: String((e && e.message) || e) })
          }
        },
      }),
    )
  } catch (e) {
    console.error('[persona] 预览路由注册失败：' + (e && e.message))
  }

  // --- 给 agent 的工具 --------------------------------------------------

  const tools = [
    {
      name: 'persona_list',
      description:
        '列出本机所有对话人格卡，并标出当前激活的是哪一张。人格卡是 ~/.dsh/personas/*.md，改完下一轮对话生效。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => textResult(value),
      },
      execute: async () => {
        const state = readActive(cfg)
        const personas = listPersonas(cfg)
        return {
          dir: cfg.dir,
          active: state.active || '',
          personas,
          hint: personas.length ? '用 persona_use 切换，persona_show 看全文' : '还没有人格卡，用 persona_save 新建一张',
        }
      },
    },
    {
      name: 'persona_use',
      description:
        '切换当前对话人格。id 来自 persona_list；传空字符串表示关掉人格注入，恢复默认。切换在下一轮对话生效，不用重启。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '人格卡 id，例如 fatfish；传空字符串关闭人格' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => textResult(value),
      },
      execute: async (args) => {
        const id = String(args.id ?? '').trim()
        if (id && !existsSync(join(cfg.dir, `${id}.md`))) {
          const available = listPersonas(cfg).map((p) => p.id)
          return { error: `没有这张人格卡：${id}`, available }
        }
        const state = writeActive(cfg, { active: id })
        return { ok: true, active: state.active || '(已关闭)', appliesTo: '下一轮对话' }
      },
    },
    {
      name: 'persona_show',
      description: '看某张人格卡的全文。不传 id 就看当前激活的那张。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '人格卡 id；省略则用当前激活的' },
        },
        required: [],
        additionalProperties: false,
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => textResult(value),
      },
      execute: async (args) => {
        const id = String(args.id ?? '').trim() || readActive(cfg).active
        if (!id) return { error: '当前没有激活的人格，也没指定 id' }
        const file = join(cfg.dir, `${id}.md`)
        if (!existsSync(file)) return { error: `没有这张人格卡：${id}` }
        const { meta, body } = parsePersona(readFileSync(file, 'utf8'))
        return { id, name: meta.name || id, tags: meta.tags || [], body, file }
      },
    },
    {
      name: 'persona_save',
      description:
        '新建或覆盖一张人格卡。content 是正文（说话方式、风格、示例对话）；name 是显示名，tags 是几个关键词。写完用 persona_use 激活。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '卡片 id（文件名，建议英文小写），例如 crisp' },
          content: { type: 'string', description: '人格正文：说话方式、措辞习惯、示例对话' },
          name: { type: 'string', description: '显示名，例如「惜字如金」' },
          tags: { type: 'array', items: { type: 'string' }, description: '几个关键词' },
        },
        required: ['id', 'content'],
        additionalProperties: false,
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => textResult(value),
      },
      execute: async (args) => {
        const id = String(args.id ?? '').trim()
        if (!/^[A-Za-z0-9._-]+$/.test(id)) {
          return { error: 'id 只能用字母、数字、点、下划线、连字符（它会当文件名）' }
        }
        const content = String(args.content ?? '').trim()
        if (!content) return { error: 'content 不能为空' }
        const name = String(args.name ?? '').trim() || id
        const tags = Array.isArray(args.tags) ? args.tags.map((t) => String(t).trim()).filter(Boolean) : []
        const front = ['---', `name: ${name}`, tags.length ? `tags: ${tags.join(', ')}` : null, '---', '']
          .filter((line) => line !== null)
          .join('\n')
        mkdirSync(cfg.dir, { recursive: true })
        const file = join(cfg.dir, `${id}.md`)
        writeFileSync(file, front + content + '\n', 'utf8')
        return { ok: true, id, name, chars: content.length, file, next: `persona_use({ id: "${id}" }) 激活` }
      },
    },
  ]

  for (const tool of tools) {
    ctx.effect(() => ctx.tools.register(tool), `dsh-persona:${tool.name}`)
  }
}
