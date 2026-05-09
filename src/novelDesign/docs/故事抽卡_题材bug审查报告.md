# 故事抽卡 → 创建小说项目 题材显示 bug 审查报告

> 审查日期：2026-05-08
> 问题：从"故事抽卡 → 生成大纲 → 创建小说项目"后，小说列表仍显示「未设置题材」

---

## 一、数据流全景

```
ScreenwriterDrawCard（表单）
    └→ handleStart() → saveCreationPreference(f) → localStorage
    └→ onStart(buildScreenwriterDrawUserBrief(f)) → AI 生成故事

AI 返回大纲
    └→ renderAssistantContent
        └→ pref = loadCreationPreference()  ← 从 localStorage 读
        └→ preferenceBlock = 格式化的创作偏好文本
        └→ OutlinePanelA2ui 卡片显示创作偏好

用户点击"创建小说项目"
    └→ onCreateProject 闭包
        └→ genre = pref.genre !== '任意' ? pref.genre : ''
        └→ setCreateGenres(genre ? [genre] : [])  ← React state
        └→ setCreateProjectModalOpen(true)

CreateNovelProjectModal.finish
    └→ genres 来自 props（= createGenres state）
    └→ 如有值直接用，否则从 loadCreationPreference() 兜底
    └→ NovelWorkspaceItem.genres = genres
    └→ upsertNovel(item) → localStorage (novelListStorage)
```

---

## 二、Bug 根因分析

### 根因 1（最可能）：`ScreenwriterDrawCard` 表单初始化覆盖了 localStorage

**文件**：[ScreenwriterDrawCard.tsx](file:///Users/yanfang/dev/Yiman/src/novelDesign/components/ScreenwriterDrawCard.tsx#L15)

```ts
const [f, setF] = useState<ScreenwriterDrawForm>(() => loadCreationPreference());
```

**问题**：当用户通过"创作偏好"弹窗修改并保存偏好后，`ScreenwriterDrawCard` **不会重新读取 localStorage**。因为它被包在 `useMemo` 中且依赖为空：

**文件**：[ScreenwriterAIDrawPage.tsx](file:///Users/yanfang/dev/Yiman/src/novelDesign/pages/ScreenwriterAIDrawPage.tsx#L160-L168)

```ts
const emptySlot = useMemo(
    () => (
      <ScreenwriterDrawCard onStart={...} />
    ),
    []   // ← 永远不重建！
);
```

**数据覆盖链**：
1. 用户打开抽卡页 → DrawCard 初始化，localStorage 中 genre = '任意'（首次使用）
2. 用户在 DrawCard 中将题材改为「都市」，点击"开始"
3. `saveCreationPreference(f)` → localStorage `genre = '都市'` ✅
4. 用户打开"创作偏好"弹窗，确认 genre 已是「都市」，再改其他偏好（如基调改为「轻松搞笑」），保存
5. 弹窗调用 `saveCreationPreference(f)` → localStorage 正确更新 ✅
6. 用户回到抽卡页 → **DrawCard 仍然是旧实例**，表单显示的还是第 2 步的旧值
7. 用户不检查直接点"开始" → **DrawCard 以旧值覆盖了 localStorage**（如果用户在上一次之后改了 genre，就会被覆盖回去）

> ⚠️ 这个覆盖链是严重的数据一致性缺陷，但**不直接导致本题材 bug**（因为 genre 没被改的情况下值未变）。

### 根因 2（直接导致）：题材字段双向不匹配 → 空数组

**涉及两个不同存储 key**：

| 存储 | Key | 题材字段 | 类型 | 写入时机 |
|------|-----|---------|------|---------|
| 创作偏好 | `yiman:novel-design:creation-preference` | `genre` | `string`（单值，「任意」/「都市」…） | DrawCard 点"开始"时 |
| 小说列表 | `yiman:novel-design:novels-v1` | `genres` | `string[]`（数组） | CreateNovelProjectModal.finish |

**关键转换代码**：

在 `onCreateProject` 中（[ScreenwriterAIDrawPage.tsx:L239-L240](file:///Users/yanfang/dev/Yiman/src/novelDesign/pages/ScreenwriterAIDrawPage.tsx#L239-L240)）：

```ts
const genre = pref.genre !== '任意' ? pref.genre : '';   // '都市' → '都市'
setCreateGenres(genre ? [genre] : []);                     // '都市' → ['都市']
```

这个转换**逻辑正确**。但 `setCreateGenres` 是 React 异步状态更新，与 `setCreateProjectModalOpen(true)` 在同一批次中提交。React 18 的自动批处理保证在下一次渲染时两个 state 都更新完毕，所以 Modal 拿到的 `genres` prop **理论上应该是正确的**。

**但有一个边界情况**：如果用户在「创作偏好」弹窗中将题材从「都市」改回「任意」（点错了），然后点击"创建小说项目"：

```
genre = '任意'
pref.genre !== '任意' → false
setCreateGenres('' ? [''] : []) → setCreateGenres([])
```

此时 `genres` prop 是 `[]`，Modal 中兜底逻辑执行：

```ts
const pref = loadCreationPreference();  // genre = '任意'
const g = pref.genre !== '任意' ? pref.genre : '';  // → ''
return g ? [g] : [];  // → []
```

→ `NovelWorkspaceItem.genres = []` → 列表显示「未设置题材」✅ 符合预期（用户确实选了「任意」）

### 根因 3（最容易被忽略）：`drawProjectPrompt` 挂载快照过时

**文件**：[ScreenwriterAIDrawPage.tsx:L125-L131](file:///Users/yanfang/dev/Yiman/src/novelDesign/pages/ScreenwriterAIDrawPage.tsx#L125-L131)

```ts
const drawProjectPrompt = useMemo(
    () => {
      const pref = loadCreationPreference();
      const prefBlock = formatPreferenceBlock(pref);
      return `${prefBlock}\n\n编剧工作区：...`;
    },
    []  // ← 仅挂载时读取一次！
);
```

**问题**：当用户通过"创作偏好"弹窗修改偏好后，`drawProjectPrompt` **不更新**。这意味着：
- 后续的 AI 对话（故事抽卡、大纲生成）仍然使用**旧的创作偏好**作为 system prompt
- 但用户看到的大纲卡片上显示的是**新的创作偏好**（因为 `renderAssistantContent` 实时读 localStorage）

→ **AI 生成的故事可能不匹配用户的当前偏好，造成认知偏差。**

> 注：这里用 `[]` 依赖是为了修复之前 `preferencesRefreshKey` 变化导致 AIChat 重建的崩溃 bug。但这个修复引入了新问题。

### 根因 4：大纲卡片中的创作偏好展示 vs 项目创建时写入的创作偏好可能不一致

大纲卡片中显示的创作偏好（[ScreenwriterAIDrawPage.tsx:L193-L209](file:///Users/yanfang/dev/Yiman/src/novelDesign/pages/ScreenwriterAIDrawPage.tsx#L193-L209)）由 **当前渲染时** 的 `loadCreationPreference()` 决定。但创建项目时写入 outline Markdown 的偏好（`createPreferenceBlock`）也来自同一闭包中的 `pref`。

这两个值是一致的，所以大纲中显示的偏好 = 创建项目时带入的偏好。**但**如果用户在生成大纲之后、创建项目之前的窗口期修改了偏好（通过"创作偏好"弹窗），则：
- 大纲卡片显示的仍是旧偏好（因为它是已渲染的 React 元素）
- 但 `drawProjectPrompt` 也是旧的（因为 memo 不更新）
- 创建项目时 `genres` 也来自旧的 `pref`（因为 onClick 闭包捕获的是旧值）

→ **这不是 bug，而是设计上合理的取舍**（因为大纲已生成，不应在创建项目时改用新的偏好）。

---

## 三、已验证正确的部分

| 检查点 | 结论 |
|--------|------|
| `loadCreationPreference` 从 localStorage 同步读取 | ✅ |
| `saveCreationPreference` 写入 JSON.stringify | ✅ |
| `ScreenwriterDrawCard.handleStart` 中 `saveCreationPreference(f)` 先于 `onStart` 执行 | ✅ |
| `ScreenwriterPreferenceFormFields` 的 genre onChange 绑定 | ✅ |
| `ScreenwriterDrawPreferencesModal.handleSave` 调用 `saveCreationPreference` | ✅ |
| `CreateNovelProjectModal.finish` 中的 localStorage 兜底逻辑 | ✅ |
| React 18 自动批处理 `setCreateGenres` + `setCreateProjectModalOpen` | ✅ |
| `genres` 从 `CreateNovelProjectModal` prop → `upsertNovel` → localStorage | ✅ |
| `ScreenwriterListPage` 从 `loadNovelList()` 读取 genres 并渲染 | ✅ |

---

## 四、排查核对清单

如果仍然复现「未设置题材」，请按以下步骤逐项检测：

### 检查 1：确认 localStorage 中创作偏好
```
浏览器 DevTools → Application → Local Storage → 搜索 "creation-preference"
```
确认 `genre` 字段值**不是** `"任意"`。

### 检查 2：确认 localStorage 中小说列表
```
浏览器 DevTools → Application → Local Storage → 搜索 "novels-v1"
```
找到对应小说条目，确认 `genres` 是 `[]` 还是 `["都市"]`。

### 检查 3：确认是否使用了旧的抽卡表单
如果抽卡表单在页面上**没有刷新**（因为 `emptySlot` 的 `useMemo([])` ），表单中显示的题材可能是旧值，但 `handleStart` 会保存**当前表单值**到 localStorage。如果表单中显示「任意」而你以为是「都市」，那么 `saveCreationPreference` 就会保存「任意」。

### 检查 4：确认是否是旧项目
如果项目是在本次修复之前创建的，`genres` 已经是 `[]` 保存在 localStorage 中（`upsertNovel` 不会修改已有条目的 `genres`）。

---

## 五、修复建议（按优先级）

### P0: 🔴 ScreenwriterDrawCard 表单应实时反映 localStorage 变更

**问题**：`emptySlot` 的 `useMemo` 依赖为 `[]`，DrawCard 永不刷新。

**方案**：移除 `useMemo`，或给 emptySlot 加一个 `key` 随偏好变更而强制重建。

```diff
// ScreenwriterAIDrawPage.tsx
- const emptySlot = useMemo(
-     () => (<ScreenwriterDrawCard onStart={...} />),
-     []
- );
+ const emptySlot = <ScreenwriterDrawCard key={preferencesVersion} onStart={...} />;
```

### P0: 🔴 新增 `preferencesVersion` state，偏好变更时递增

```ts
const [preferencesVersion, setPreferencesVersion] = useState(0);

// 在 ScreenwriterDrawPreferencesModal.onSaved 中：
onSaved={() => setPreferencesVersion(v => v + 1)}
```

这样保存在弹窗中的偏好会立即反映到 DrawCard 表单。

### P1: 🟡 `drawProjectPrompt` 应在偏好变更时刷新

**问题**：`useMemo([], ...)` 永远不刷新 project prompt。

**方案**：同样使用 `preferencesVersion` 作为依赖：

```diff
  const drawProjectPrompt = useMemo(
      () => { ... },
-     []
+     [preferencesVersion]
  );
```

### P1: 🟡 在 `ScreenwriterNovelDetailPage` 的 `commitNovelTitle` 中保留已有 genres

**文件**：[ScreenwriterNovelDetailPage.tsx:L147-L153](file:///Users/yanfang/dev/Yiman/src/novelDesign/pages/ScreenwriterNovelDetailPage.tsx#L147-L153)

这里当用户修改标题时，`genres: []` 会**覆盖已有的 genres**：

```ts
const merged: NovelWorkspaceItem =
    item ?
      { ...item, title: raw, updatedAt: now }
    : { id: novelId, title: raw, genres: [], ... };
```

**修复**：
```diff
    : {
        id: novelId,
        title: raw,
-       genres: [],
+       genres: item?.genres ?? [],
        ...
      };
```

### P2: 🟢 统一"题材"的概念

表单中用的是 `genre`（单数 string），列表存储用 `genres`（复数 string[]）。这种不一致增加了心智负担。建议在 `ScreenwriterDrawForm` 中也用数组，或者至少明确注释二者映射关系。

---

## 六、完整修正方案

综合以上分析，最精简的修复是在 `CreateNovelProjectModal.finish` 中**硬编码** genre → genres 的优先级：

```ts
genres: (() => {
    // 1. 优先使用 props 传入的 genres
    const propGenres = genres?.filter(Boolean);
    if (propGenres && propGenres.length > 0) return propGenres;
    
    // 2. 从创作偏好 localStorage 读取
    const pref = loadCreationPreference();
    if (pref.genre && pref.genre !== '任意') return [pref.genre];
    
    // 3. 都没有则返回空
    return [];
})(),
```

**但这已经做了。** 如果仍然有问题，根源一定在上游（DrawCard 覆盖了 localStorage 的 genre，或用户在不知情时用了 genre=任意 的配置）。

建议补加诊断日志确认数据到底从哪来的。

---

## 七、其他发现的问题

### 7.1 类型安全问题

`CreateNovelProjectModal` 的 `genres` prop 声明为 `genres?: string[]`，但在 `ScreenwriterDrawForm` 中题材叫 `genre: StoryGenre`（单值）。这两个概念在代码中混用，容易出错。

### 7.2 重复代码

`renderAssistantContent` 中的偏好格式化逻辑与 `formatPreferenceBlock` 中的逻辑高度重复（都构建 `prefLines`），建议收敛到一个共享函数。

### 7.3 ScreenwriterListPage 不刷新

`ScreenwriterListPage` 只在 mount 时 `loadNovelList()` 一次。如果用户在列表页修改了 genres（通过编辑弹窗），切换回列表页时不会自动刷新。
