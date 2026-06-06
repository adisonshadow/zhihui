# musicDesign

本目录为 **Tidal Cycles / Strudel** 实验性音乐工作台前端代码。

## 许可证说明

- 页面依赖 [`@strudel/web`](https://www.npmjs.com/package/@strudel/web)（**AGPL-3.0-or-later**）。
- 若将本应用作为完整作品对外分发（含 Electron 安装包），请确认整体许可策略与 AGPL 的兼容性，并按要求提供对应源码。详见 Strudel 官方说明：[Using Strudel in your Project](https://strudel.cc/technical-manual/project-start/)。

## AI Skill

- 作曲提示词权威来源：[`src/musicDesign/SKILL/tidal-cycles/SKILL.md`](./SKILL/tidal-cycles/SKILL.md)  
- 通过 Vite `?raw` 导入后注入 `music` Agent 的 `basePrompt`（见 `src/components/AIChat/agents/musicAgent.ts`）。
- **模型要求**：生成 Strudel 代码为纯文本任务；侧栏模型下拉仅展示 **通用智能**（`agent_orchestration`）与 **文本类**（novel/script 等 tag 或 preset 输出含 text）且 API 已配置的模型，不含绘图/视频/TTS 专用模型。
- **AI 提示词**：`SKILL/tidal-cycles/SKILL.md` 经 `musicAgent.ts` 在应用启动时 raw 导入为 `agentKey="music"` 的 `basePrompt`（非页面内重复加载）；`projectPrompt` 由页面动态注入编辑器上下文与自动播放/纠错流程。
