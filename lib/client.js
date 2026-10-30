window.__ModuleLoader__.load({
	id: "dsh-persona",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		const { useState, useEffect, useCallback, createElement: h } = react;

		// 与宿主路由约定（dsh/index.js 里注册的那几条）
		const CONFIG_PATH = "/dsh-persona/config";
		const PREVIEW_PATH = "/dsh-persona/preview";

		const STYLE_ID = "dsh-persona-panel-styles";

		/** 注入面板样式（全局一次，幂等）。颜色优先取主题变量，缺省兜底中性色。 */
		function installStyles() {
			if (typeof document === "undefined") return;
			if (document.getElementById(STYLE_ID) !== null) return;
			const style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = `
.dsp-wrap { display: flex; flex-direction: column; gap: 14px; font-size: 13px; }
.dsp-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.dsp-title { font-size: 14px; font-weight: 600; color: var(--dsw-alias-text-primary, #1a1a1a); }
.dsp-sub { color: var(--dsw-alias-text-secondary, #8a8a8a); font-size: 12px; }
.dsp-field { display: flex; flex-direction: column; gap: 6px; }
.dsp-label { font-size: 12px; color: var(--dsw-alias-text-secondary, #666); display: flex; align-items: center; gap: 6px; }
.dsp-opt { font-size: 11px; padding: 0 6px; border-radius: 999px; background: var(--dsw-alias-bg-secondary, #f0f0f0); color: var(--dsw-alias-text-secondary, #888); font-weight: 400; }
.dsp-count { margin-left: auto; font-size: 11px; color: var(--dsw-alias-text-disabled, #aaa); font-weight: 400; }
.dsp-select { font: inherit; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border, #dcdcdc); background: var(--dsw-alias-bg-primary, #fff); color: var(--dsw-alias-text-primary, #1a1a1a); }
.dsp-textarea { font: inherit; font-size: 12.5px; line-height: 1.6; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--dsw-alias-border, #dcdcdc); background: var(--dsw-alias-bg-primary, #fff); color: var(--dsw-alias-text-primary, #1a1a1a); resize: vertical; min-height: 150px; box-sizing: border-box; width: 100%; }
.dsp-textarea--short { min-height: 70px; }
.dsp-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.dsp-btn { font: inherit; padding: 5px 14px; border-radius: 7px; border: 1px solid var(--dsw-alias-border, #dcdcdc); background: transparent; color: inherit; cursor: pointer; }
.dsp-btn:hover { border-color: var(--dsw-alias-accent, #4a7dff); }
.dsp-btn--primary { background: var(--dsw-alias-accent, #4a7dff); border-color: transparent; color: #fff; }
.dsp-btn:disabled { opacity: .5; cursor: default; }
.dsp-note { color: var(--dsw-alias-text-secondary, #8a8a8a); font-size: 12px; }
.dsp-note--ok { color: var(--dsw-alias-success, #18a058); }
.dsp-note--error { color: var(--dsw-alias-danger, #d03050); }
.dsp-dir { font-size: 11px; color: var(--dsw-alias-text-disabled, #aaa); word-break: break-all; }
`;
			document.head.appendChild(style);
		}

		/**
		 * 设置页「对话人格」栏目。
		 * 模板可选 → 选中后正文填进可编辑文本框 → 后面还能追加自定义提示词 → 保存。
		 */
		function PersonaSection() {
			const [data, setData] = useState(null);
			const [template, setTemplate] = useState("");
			const [body, setBody] = useState("");
			const [extra, setExtra] = useState("");
			const [note, setNote] = useState("");
			const [tone, setTone] = useState("");
			const [busy, setBusy] = useState(false);
			const [error, setError] = useState("");

			const load = useCallback(async () => {
				try {
					const res = await fetch(CONFIG_PATH, { cache: "no-store" });
					const json = await res.json();
					if (!json || json.ok !== true) throw new Error((json && json.error) || "读取失败");
					setData(json);
					setTemplate(json.template || "");
					setBody(json.body || json.templateBody || "");
					setExtra(json.extra || "");
					setError("");
				} catch (e) {
					setError(String((e && e.message) || e));
				}
			}, []);

			useEffect(() => {
				installStyles();
				load();
			}, [load]);

			// 选模板：把模板原文填进正文框，之后可以随便改
			const pickTemplate = useCallback(async (id) => {
				setTemplate(id);
				setNote("");
				setTone("");
				if (!id) {
					setBody("");
					return;
				}
				try {
					const res = await fetch(`${PREVIEW_PATH}?id=${encodeURIComponent(id)}`, { cache: "no-store" });
					const json = await res.json();
					if (!json || json.ok !== true) throw new Error((json && json.error) || "读取模板失败");
					setBody(json.body || "");
				} catch (e) {
					setNote("⚠️ " + String((e && e.message) || e));
					setTone("error");
				}
			}, []);

			const save = useCallback(async () => {
				setBusy(true);
				setNote("");
				setTone("");
				try {
					const res = await fetch(CONFIG_PATH, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ template, body, extra }),
					});
					const json = await res.json();
					if (!json || json.ok !== true) throw new Error((json && json.error) || "保存失败");
					await load();
					setNote(
						json.chars
							? `已保存，注入 ${json.chars} 字，下一轮对话生效`
							: "已保存（内容为空，等于不注入人格）",
					);
					setTone("ok");
				} catch (e) {
					setNote("⚠️ " + String((e && e.message) || e));
					setTone("error");
				} finally {
					setBusy(false);
				}
			}, [template, body, extra, load]);

			const clearAll = useCallback(async () => {
				setBusy(true);
				setNote("");
				setTone("");
				try {
					const res = await fetch(CONFIG_PATH, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ template: "", body: "", extra: "" }),
					});
					const json = await res.json();
					if (!json || json.ok !== true) throw new Error((json && json.error) || "清空失败");
					setTemplate("");
					setBody("");
					setExtra("");
					await load();
					setNote("已清空，下一轮对话恢复默认");
					setTone("ok");
				} catch (e) {
					setNote("⚠️ " + String((e && e.message) || e));
					setTone("error");
				} finally {
					setBusy(false);
				}
			}, [load]);

			if (error) {
				return h("div", { className: "dsp-wrap" }, h("p", { className: "dsp-note dsp-note--error" }, "⚠️ 读取人格配置失败：" + error));
			}
			if (!data) {
				return h("div", { className: "dsp-wrap" }, h("p", { className: "dsp-note" }, "读取中…"));
			}

			const personas = Array.isArray(data.personas) ? data.personas : [];
			const noteClass = "dsp-note" + (tone === "error" ? " dsp-note--error" : tone === "ok" ? " dsp-note--ok" : "");

			return h(
				"div",
				{ className: "dsp-wrap" },
				h(
					"div",
					{ className: "dsp-head" },
					h("span", { className: "dsp-title" }, "对话人格"),
					h("span", { className: "dsp-sub" }, "选模板 → 改正文 → 保存，下一轮生效"),
				),
				h(
					"div",
					{ className: "dsp-field" },
					h("label", { className: "dsp-label" }, "人格模板", h("span", { className: "dsp-opt" }, "可选")),
					h(
						"select",
						{ className: "dsp-select", value: template, onChange: (ev) => pickTemplate(ev.target.value) },
						h("option", { value: "" }, personas.length ? "不使用模板（只写正文）" : "还没有人格卡"),
						personas.map((p) => h("option", { key: p.id, value: p.id }, `${p.name || p.id}  —  ${p.id}`)),
					),
				),
				h(
					"div",
					{ className: "dsp-field" },
					h(
						"label",
						{ className: "dsp-label" },
						"人格正文",
						h("span", { className: "dsp-opt" }, "可编辑"),
						h("span", { className: "dsp-count" }, `${body.length} 字`),
					),
					h("textarea", {
						className: "dsp-textarea",
						value: body,
						rows: 10,
						placeholder: "你说话的方式、措辞习惯、示例对话……\n\n选一个模板会自动填进来，然后随便改。",
						onChange: (ev) => setBody(ev.target.value),
					}),
				),
				h(
					"div",
					{ className: "dsp-field" },
					h(
						"label",
						{ className: "dsp-label" },
						"追加提示词",
						h("span", { className: "dsp-opt" }, "可选"),
						h("span", { className: "dsp-count" }, `${extra.length} 字`),
					),
					h("textarea", {
						className: "dsp-textarea dsp-textarea--short",
						value: extra,
						rows: 3,
						placeholder: "在人格后面补充的要求，例如：回答尽量短，不要列一二三",
						onChange: (ev) => setExtra(ev.target.value),
					}),
				),
				h(
					"div",
					{ className: "dsp-actions" },
					h("button", { className: "dsp-btn dsp-btn--primary", disabled: busy, onClick: save }, busy ? "处理中…" : "保存并启用"),
					h("button", { className: "dsp-btn", disabled: busy, onClick: clearAll }, "清空"),
					h("button", { className: "dsp-btn", disabled: busy, onClick: load }, "刷新"),
					note ? h("span", { className: noteClass }, note) : null,
				),
				h("span", { className: "dsp-dir" }, "人格卡目录：" + (data.dir || "~/.dsh/personas")),
			);
		}

		const name = "dsh-persona-client";
		const inject = ["slots"];

		function apply(ctx) {
			installStyles();
			const slots = ctx.slots;
			if (slots === void 0) return;
			const disposers = [];
			disposers.push(
				slots.inject("settings.section", () =>
					slots.register(
						{
							name: "settings.section",
							id: "persona",
							order: 8,
							label: "对话人格",
						},
						PersonaSection,
					),
				),
			);
			ctx.effect(() => () => {
				for (const dispose of disposers.reverse()) {
					try {
						dispose();
					} catch (e) {
						/* ignore */
					}
				}
			}, "dsh-persona-client.binding");
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	},
});
