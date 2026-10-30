window.__ModuleLoader__.load({
	id: "dsh-persona",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		const { useState, useEffect, useCallback, createElement: h } = react;

		// 与宿主路由约定（dsh/index.js 里注册的那三条）
		const LIST_PATH = "/dsh-persona/list";
		const USE_PATH = "/dsh-persona/use";
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
.dsp-current { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px; background: var(--dsw-alias-bg-secondary, #f6f6f6); }
.dsp-current-name { font-weight: 600; color: var(--dsw-alias-text-primary, #1a1a1a); }
.dsp-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-accent, #4a7dff); flex: none; }
.dsp-dot--off { background: var(--dsw-alias-text-secondary, #b0b0b0); }
.dsp-list { display: flex; flex-direction: column; gap: 8px; }
.dsp-card { border: 1px solid var(--dsw-alias-border, #e5e5e5); border-radius: 10px; padding: 10px 12px; cursor: pointer; transition: border-color .15s, background .15s; background: transparent; text-align: left; font: inherit; color: inherit; width: 100%; }
.dsp-card:hover { border-color: var(--dsw-alias-accent, #4a7dff); }
.dsp-card--active { border-color: var(--dsw-alias-accent, #4a7dff); background: var(--dsw-alias-bg-secondary, #f4f7ff); }
.dsp-card--busy { opacity: .55; pointer-events: none; }
.dsp-row { display: flex; align-items: center; gap: 8px; }
.dsp-name { font-weight: 600; color: var(--dsw-alias-text-primary, #1a1a1a); }
.dsp-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-left: auto; }
.dsp-tag { font-size: 11px; padding: 1px 7px; border-radius: 999px; background: var(--dsw-alias-bg-secondary, #f0f0f0); color: var(--dsw-alias-text-secondary, #777); }
.dsp-preview { margin-top: 6px; color: var(--dsw-alias-text-secondary, #777); font-size: 12px; line-height: 1.5; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.dsp-full { margin-top: 8px; padding: 10px; border-radius: 8px; background: var(--dsw-alias-bg-secondary, #f6f6f6); white-space: pre-wrap; font-size: 12px; line-height: 1.6; max-height: 260px; overflow: auto; }
.dsp-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.dsp-btn { font: inherit; padding: 4px 12px; border-radius: 7px; border: 1px solid var(--dsw-alias-border, #dcdcdc); background: transparent; color: inherit; cursor: pointer; }
.dsp-btn:hover { border-color: var(--dsw-alias-accent, #4a7dff); }
.dsp-btn--primary { background: var(--dsw-alias-accent, #4a7dff); border-color: transparent; color: #fff; }
.dsp-btn:disabled { opacity: .5; cursor: default; }
.dsp-note { color: var(--dsw-alias-text-secondary, #8a8a8a); font-size: 12px; }
.dsp-note--ok { color: var(--dsw-alias-success, #18a058); }
.dsp-note--error { color: var(--dsw-alias-danger, #d03050); }
.dsp-empty { color: var(--dsw-alias-text-secondary, #8a8a8a); font-size: 12px; padding: 12px; border: 1px dashed var(--dsw-alias-border, #ddd); border-radius: 10px; }
.dsp-dir { font-size: 11px; color: var(--dsw-alias-text-disabled, #aaa); word-break: break-all; }
`;
			document.head.appendChild(style);
		}

		function previewLine(text) {
			const line = String(text || "")
				.split("\n")
				.map((s) => s.trim())
				.filter((s) => s && !s.startsWith("#"))
				.join(" ");
			return line.slice(0, 90);
		}

		/** 设置页「对话人格」栏目：点卡片即切换 */
		function PersonaSection() {
			const [data, setData] = useState(null);
			const [error, setError] = useState("");
			const [note, setNote] = useState("");
			const [busyId, setBusyId] = useState("");
			const [openedId, setOpenedId] = useState("");
			const [full, setFull] = useState("");

			const load = useCallback(async () => {
				try {
					const res = await fetch(LIST_PATH, { cache: "no-store" });
					const json = await res.json();
					if (!json || json.ok !== true) throw new Error((json && json.error) || "读取失败");
					setData(json);
					setError("");
				} catch (e) {
					setError(String((e && e.message) || e));
				}
			}, []);

			useEffect(() => {
				installStyles();
				load();
			}, [load]);

			const choose = useCallback(
				async (id) => {
					setBusyId(id || "__off__");
					setNote("");
					try {
						const res = await fetch(USE_PATH, {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ id }),
						});
						const json = await res.json();
						if (!json || json.ok !== true) throw new Error((json && json.error) || "切换失败");
						await load();
						setNote(id ? `已切到「${json.active}」，下一轮对话生效` : "已关闭人格注入，下一轮对话恢复默认");
					} catch (e) {
						setNote("⚠️ " + String((e && e.message) || e));
					} finally {
						setBusyId("");
					}
				},
				[load],
			);

			const toggleFull = useCallback(async (id) => {
				if (openedId === id) {
					setOpenedId("");
					setFull("");
					return;
				}
				try {
					const res = await fetch(`${PREVIEW_PATH}?id=${encodeURIComponent(id)}`, { cache: "no-store" });
					const json = await res.json();
					if (!json || json.ok !== true) throw new Error((json && json.error) || "读取失败");
					setOpenedId(id);
					setFull(json.body || "");
				} catch (e) {
					setNote("⚠️ " + String((e && e.message) || e));
				}
			}, [openedId]);

			if (error) {
				return h("div", { className: "dsp-wrap" }, h("p", { className: "dsp-note dsp-note--error" }, "⚠️ 读取人格列表失败：" + error));
			}
			if (!data) {
				return h("div", { className: "dsp-wrap" }, h("p", { className: "dsp-note" }, "读取中…"));
			}

			const active = data.active || "";
			const personas = Array.isArray(data.personas) ? data.personas : [];
			const currentName = (personas.find((p) => p.id === active) || {}).name || active;

			return h(
				"div",
				{ className: "dsp-wrap" },
				h(
					"div",
					{ className: "dsp-head" },
					h("span", { className: "dsp-title" }, "对话人格"),
					h("span", { className: "dsp-sub" }, "点一张卡就切换，下一轮对话生效"),
				),
				h(
					"div",
					{ className: "dsp-current" },
					h("span", { className: active ? "dsp-dot" : "dsp-dot dsp-dot--off" }),
					h("span", { className: "dsp-current-name" }, active ? currentName : "未启用"),
					active
						? h("button", { className: "dsp-btn", disabled: busyId !== "", onClick: () => choose("") }, "关闭人格")
						: h("span", { className: "dsp-sub" }, "选一张就开"),
				),
				personas.length === 0
					? h("div", { className: "dsp-empty" }, "还没有人格卡。在 ", h("code", null, data.dir || "~/.dsh/personas"), " 里放一个 .md 就行。")
					: h(
							"div",
							{ className: "dsp-list" },
							personas.map((p) => {
								const isActive = p.id === active;
								const busy = busyId === p.id;
								return h(
									"div",
									{
										key: p.id,
										className: "dsp-card" + (isActive ? " dsp-card--active" : "") + (busy ? " dsp-card--busy" : ""),
										role: "button",
										tabIndex: 0,
										onClick: () => choose(p.id),
										onKeyDown: (ev) => {
											if (ev.key === "Enter" || ev.key === " ") {
												ev.preventDefault();
												choose(p.id);
											}
										},
									},
									h(
										"div",
										{ className: "dsp-row" },
										h("span", { className: isActive ? "dsp-dot" : "dsp-dot dsp-dot--off" }),
										h("span", { className: "dsp-name" }, p.name || p.id),
										h("span", { className: "dsp-sub" }, p.id),
										h(
											"span",
											{ className: "dsp-tags" },
											(Array.isArray(p.tags) ? p.tags : []).map((t) => h("span", { className: "dsp-tag", key: t }, t)),
										),
									),
									p.preview ? h("div", { className: "dsp-preview" }, p.preview) : null,
									openedId === p.id ? h("div", { className: "dsp-full" }, full) : null,
									h(
										"div",
										{ className: "dsp-actions", style: { marginTop: "8px" } },
										h(
											"button",
											{
												className: "dsp-btn",
												onClick: (ev) => {
													ev.stopPropagation();
													toggleFull(p.id);
												},
											},
											openedId === p.id ? "收起" : "看全文",
										),
										isActive ? h("span", { className: "dsp-note dsp-note--ok" }, "当前生效") : null,
									),
								);
							}),
						),
				note ? h("p", { className: "dsp-note" + (note.startsWith("⚠️") ? " dsp-note--error" : " dsp-note--ok") }, note) : null,
				h(
					"div",
					{ className: "dsp-actions" },
					h("button", { className: "dsp-btn", onClick: load }, "刷新"),
					h("span", { className: "dsp-dir" }, "目录：" + (data.dir || "~/.dsh/personas")),
				),
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
