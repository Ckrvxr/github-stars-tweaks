# GitHub Stars Tweaks

一个油猴脚本，让 GitHub Stars 更适合像逛书架一样按分类连续浏览。

## 功能

- **同屏切换**：左侧显示现有列表，点击即可切换；移除重复的返回链接，保留浏览器前进、后退和原生分页。
- **紧凑展示**：仓库按从左到右的顺序分配到响应式瀑布流，各列卡片向上填充；一般窗口显示两列，宽屏显示更多列，窄屏显示一列。简介完整显示，卡片上的 Sponsor 按钮和首页的 Starred topics 区域仅在界面上隐藏，不影响赞助关系或 Topic 关注状态。
- **统一筛选**：全部仓库和各分类都支持关键词、仓库类型、语言和排序。关键词输入后点击 Search；类型、语言和排序使用 GitHub 风格的下拉列表，更改后立即筛选。筛选只作用于当前范围，但会读取并检查该范围的所有分页，显示结果可能需要等待。切换分类时筛选条件重置。
- **统一管理**：点击侧栏 Lists 右侧的 `⋯`，可以新建列表、编辑或删除当前列表，以及手动调整列表顺序。编辑和删除前先在侧栏选择对应列表；创建、编辑和删除使用 GitHub 原生对话框，删除需要确认。
- **保存顺序**：在 Reorder lists 中使用上下箭头排列，点击 Save order 保存。顺序保存在当前脚本管理器的数据中；Tampermonkey 与 ScriptCat 之间默认不共享，清除扩展数据或卸载扩展可能丢失顺序。列表改名后可能需要重新调整其位置。

仓库的默认顺序沿用当前页面原本的顺序，也可以选择最近收藏、最近活跃或 Star 数排序。筛选时脚本使用 GitHub 的搜索与筛选结果，并在分类内与该分类的仓库取交集；网络或页面加载失败时会显示错误，不会把不完整结果当成全部结果。

## 安装或更新

1. 在浏览器中安装 Tampermonkey 或 ScriptCat。
2. 新建脚本，或打开已有的 GitHub Stars Tweaks 脚本，将 [`github-stars-tweaks.user.js`](github-stars-tweaks.user.js) 的完整内容复制进去并保存。
3. 如管理器提示新的脚本存储权限，请确认；刷新 GitHub 个人主页的 **Stars** 标签页或列表页面。

脚本只对 GitHub Stars 首页和列表详情页调整界面。筛选和读取列表使用 GitHub 同源请求，不需要 Token、Gist 或额外服务，也不会自动修改 Star 或列表。新建、编辑、删除等操作只有在用户主动使用 GitHub 对话框时才会执行。禁用脚本即可恢复 GitHub 原界面。

GitHub 的页面结构可能变化；如果列表或筛选无法加载，请刷新页面后重试。收藏很多时，读取所有分页可能需要较长时间。

## 验证

运行全部测试需要 Node.js、`agent-browser` 和 Chromium：

```sh
node --test tests/*.test.cjs
node --check github-stars-tweaks.user.js
```

只运行不依赖浏览器的单元测试：

```sh
node --test tests/stars.test.cjs tests/filter-and-order.test.cjs
```

需求意图见 [`docs/intent/github-stars.md`](docs/intent/github-stars.md)。
