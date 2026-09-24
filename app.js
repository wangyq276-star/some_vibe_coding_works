// 主界面逻辑：树形列表 + 详情编辑 + 星级/标签/搜索筛选（阶段 3）

const TYPE_INFO = {
  inspiration: { label: '灵感', icon: '💡' },
  plan: { label: '计划', icon: '📝' },
  solution: { label: '方案', icon: '🧩' },
  project: { label: '项目', icon: '🎯' }
};

// 每个层级可以派生到的下级层级（允许跳级，只向下）
const DERIVE_TARGETS = {
  inspiration: ['plan', 'solution', 'project'],
  plan: ['solution', 'project'],
  solution: ['project'],
  project: []
};

let data = null;
let selectedId = null;
const expanded = new Set(); // 展开的节点 id 集合（仅本次会话有效）

// 筛选状态
let searchQuery = '';
let typeFilter = null;    // null = 全部
let importanceFilter = 0; // 0 = 全部，N = N 星以上
const tagFilters = new Set();

let binMode = false; // 回收站模式
const multiSelect = new Set(); // 多选批量编辑的条目 id 集合

const $ = (id) => document.getElementById(id);

// 当前可见的条目（不在回收站）
const visibleItems = () => data.items.filter((i) => !i.trashedAt);

// 回收站中的条目（按删除时间倒序）
const trashedItems = () =>
  data.items.filter((i) => i.trashedAt).sort((a, b) => b.trashedAt.localeCompare(a.trashedAt));

const byCreated = (a, b) => a.createdAt.localeCompare(b.createdAt);

const anyFilterActive = () =>
  searchQuery.trim() !== '' || typeFilter !== null || importanceFilter > 0 || tagFilters.size > 0;

async function refresh() {
  data = await window.api.loadData();
  if (selectedId && !data.items.some((i) => i.id === selectedId)) selectedId = null;
  // 清理已不存在或已进回收站的选中项
  for (const id of [...multiSelect]) {
    if (!visibleItems().some((i) => i.id === id)) multiSelect.delete(id);
  }
  updateBinLabel();
  renderTree();
  renderDetail();
  renderBatchBar();
}

// ---------- 筛选 ----------

function matchesFilters(item) {
  if (typeFilter && item.type !== typeFilter) return false;
  if (importanceFilter > 0 && item.importance < importanceFilter) return false;
  if (tagFilters.size > 0 && !item.tags.some((t) => tagFilters.has(t))) return false;
  const q = searchQuery.trim().toLowerCase();
  if (q && !item.title.toLowerCase().includes(q) && !item.content.toLowerCase().includes(q)) return false;
  return true;
}

// 自己匹配，或其后代有匹配 → 显示（保证推导路径可见）
function filterPass(item, memo) {
  if (memo.has(item.id)) return memo.get(item.id);
  memo.set(item.id, false); // 防环
  let show = matchesFilters(item);
  if (!show) {
    const kids = visibleItems().filter((c) => c.parentId === item.id);
    show = kids.some((k) => filterPass(k, memo));
  }
  memo.set(item.id, show);
  return show;
}

// ---------- 树形列表 ----------

// 父条目不可见（如已进回收站）时，子条目作为顶层显示
function isVisibleRoot(item) {
  return !item.parentId || !visibleItems().some((p) => p.id === item.parentId);
}

// ---------- 回收站列表 ----------

function renderBinList() {
  const tree = $('tree');
  tree.innerHTML = '';
  const items = trashedItems();
  if (items.length === 0) {
    $('treeEmpty').style.display = 'block';
    $('treeEmpty').innerHTML = '回收站是空的';
    return;
  }
  $('treeEmpty').style.display = 'none';
  items.forEach((item) => tree.appendChild(renderBinNode(item)));
}

function renderBinNode(item) {
  const row = document.createElement('div');
  row.className = 'tree-row' + (item.id === selectedId ? ' selected' : '');

  const icon = document.createElement('span');
  icon.className = 'node-icon';
  icon.textContent = '🗑';

  const title = document.createElement('span');
  title.className = 'node-title';
  title.textContent = item.title || '（无标题）';

  const badge = document.createElement('span');
  badge.className = `node-badge badge-${item.type}`;
  badge.textContent = TYPE_INFO[item.type].label;

  row.append(icon, title, badge);
  row.addEventListener('click', () => {
    selectedId = item.id;
    renderTree();
    renderDetail();
  });
  return row;
}

function renderTree() {
  if (binMode) { renderBinList(); return; }
  const tree = $('tree');
  tree.innerHTML = '';
  const anyFilter = anyFilterActive();
  const memo = new Map();
  const roots = visibleItems()
    .filter(isVisibleRoot)
    .filter((r) => !anyFilter || filterPass(r, memo))
    .sort(byCreated);

  if (roots.length === 0) {
    $('treeEmpty').style.display = 'block';
    $('treeEmpty').innerHTML = anyFilter
      ? '没有符合条件的条目'
      : '还没有条目<br>点左上角「＋ 新建」开始';
  } else {
    $('treeEmpty').style.display = 'none';
  }
  roots.forEach((root) => tree.appendChild(renderNode(root, 0, memo)));
}

function renderNode(item, depth, memo) {
  const anyFilter = anyFilterActive();
  const allChildren = visibleItems().filter((c) => c.parentId === item.id);
  const children = anyFilter ? allChildren.filter((c) => filterPass(c, memo)) : allChildren;
  const hasChildren = children.length > 0;
  // 筛选/搜索时强制展开，方便看到匹配的条目
  const isOpen = anyFilter ? true : expanded.has(item.id);

  const wrap = document.createElement('div');

  const row = document.createElement('div');
  row.className = 'tree-row' + (item.id === selectedId ? ' selected' : '');
  row.style.paddingLeft = `${8 + depth * 16}px`;

  const toggle = document.createElement('span');
  toggle.className = 'toggle' + (hasChildren ? '' : ' empty');
  toggle.textContent = hasChildren ? (isOpen ? '▾' : '▸') : '';
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    if (anyFilter) return; // 筛选模式下强制展开
    if (expanded.has(item.id)) expanded.delete(item.id);
    else expanded.add(item.id);
    renderTree();
  });

  const icon = document.createElement('span');
  icon.className = 'node-icon';
  icon.textContent = TYPE_INFO[item.type].icon;

  const title = document.createElement('span');
  title.className = 'node-title';
  title.textContent = item.title || '（无标题）';

  const badge = document.createElement('span');
  badge.className = `node-badge badge-${item.type}`;
  badge.textContent = TYPE_INFO[item.type].label;

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'node-check';
  cb.checked = multiSelect.has(item.id);
  cb.title = '多选';
  cb.addEventListener('click', (e) => e.stopPropagation());
  cb.addEventListener('change', () => {
    if (cb.checked) multiSelect.add(item.id);
    else multiSelect.delete(item.id);
    renderBatchBar();
  });

  row.append(cb, toggle, icon, title);
  if (item.importance > 0) {
    const stars = document.createElement('span');
    stars.className = 'node-stars';
    stars.textContent = '★'.repeat(item.importance);
    row.appendChild(stars);
  }
  row.appendChild(badge);
  row.addEventListener('click', () => {
    selectedId = item.id;
    renderTree();
    renderDetail();
  });
  wrap.appendChild(row);

  if (hasChildren && isOpen) {
    children.sort(byCreated).forEach((c) => wrap.appendChild(renderNode(c, depth + 1, memo)));
  }
  return wrap;
}

// ---------- 详情面板 ----------

function renderDetail() {
  if (binMode) { renderBinDetail(); return; }
  const item = data.items.find((i) => i.id === selectedId);
  $('binEditor').hidden = true;
  $('noSelection').hidden = !!item;
  $('editor').hidden = !item;
  if (!item) return;

  const info = TYPE_INFO[item.type];
  const badge = $('typeBadge');
  badge.textContent = `${info.icon} ${info.label}`;
  badge.className = `type-badge badge-${item.type}`;

  $('titleInput').value = item.title;
  $('contentInput').value = item.content;
  $('metaInfo').textContent =
    `创建于 ${new Date(item.createdAt).toLocaleString('zh-CN')}` +
    (item.updatedAt !== item.createdAt ? ` · 更新于 ${new Date(item.updatedAt).toLocaleString('zh-CN')}` : '');

  renderStars(item);
  renderTags(item);

  // 派生菜单：只列出可以向下派生的层级
  const menu = $('deriveMenu');
  menu.innerHTML = '';
  const targets = DERIVE_TARGETS[item.type] || [];
  $('btnDerive').style.display = targets.length > 0 ? '' : 'none';
  targets.forEach((t) => {
    const b = document.createElement('button');
    b.className = 'dropdown-item';
    b.textContent = `${TYPE_INFO[t].icon} 派生为${TYPE_INFO[t].label}`;
    b.addEventListener('click', () => derive(t));
    menu.appendChild(b);
  });
}

// 回收站详情：只读展示 + 恢复 / 彻底删除
function renderBinDetail() {
  const item = data.items.find((i) => i.id === selectedId);
  $('noSelection').hidden = !!item;
  $('editor').hidden = true;
  $('binEditor').hidden = !item;
  if (!item) return;

  const info = TYPE_INFO[item.type];
  const badge = $('binTypeBadge');
  badge.textContent = `${info.icon} ${info.label}`;
  badge.className = `type-badge badge-${item.type}`;

  $('binTitle').textContent = item.title || '（无标题）';
  $('binContent').textContent = item.content || '（无内容）';
  $('binMeta').textContent = `删除于 ${new Date(item.trashedAt).toLocaleString('zh-CN')}`;
}

// 五档星级：点击设星，再点同一颗星取消
function renderStars(item) {
  const stars = $('stars');
  stars.innerHTML = '';
  for (let n = 1; n <= 5; n++) {
    const s = document.createElement('span');
    s.className = 'star' + (n <= item.importance ? ' filled' : '');
    s.textContent = '★';
    s.addEventListener('click', async () => {
      const newVal = item.importance === n ? 0 : n;
      await window.api.saveItem({ id: item.id, importance: newVal });
      await refresh();
    });
    stars.appendChild(s);
  }
}

// 标签：芯片展示 + × 删除
function renderTags(item) {
  const chips = $('tagChips');
  chips.innerHTML = '';
  item.tags.forEach((t) => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    const label = document.createElement('span');
    label.textContent = t;
    const x = document.createElement('span');
    x.className = 'tag-x';
    x.textContent = '×';
    x.title = '移除标签';
    x.addEventListener('click', async () => {
      await window.api.saveItem({ id: item.id, tags: item.tags.filter((v) => v !== t) });
      await refresh();
    });
    chip.append(label, x);
    chips.appendChild(chip);
  });
}

// 在选中条目下派生一个新条目（新条目自动选中）
async function derive(type) {
  const parent = data.items.find((i) => i.id === selectedId);
  if (!parent) return;
  const child = await window.api.saveItem({
    type,
    title: '',
    content: '',
    parentId: parent.id
  });
  expanded.add(parent.id); // 自动展开父节点，让新条目可见
  selectedId = child.id;
  closeDropdowns();
  await refresh();
}

// ---------- 下拉菜单 ----------

function toggleDropdown(menuId) {
  const menu = $(menuId);
  const parent = menu.parentElement;
  const wasOpen = parent.classList.contains('open');
  closeDropdowns();
  if (!wasOpen) parent.classList.add('open');
}

function closeDropdowns() {
  document.querySelectorAll('.dropdown.open').forEach((d) => d.classList.remove('open'));
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown')) closeDropdowns();
});

// ---------- 筛选控件 ----------

function updateFilterLabels() {
  $('btnTypeFilter').textContent = typeFilter
    ? `${TYPE_INFO[typeFilter].icon} ${TYPE_INFO[typeFilter].label}`
    : '类型 ▾';
  $('btnImportanceFilter').textContent = importanceFilter > 0 ? `★ ${importanceFilter} 星以上` : '星级 ▾';
  $('btnTagFilter').textContent = tagFilters.size > 0 ? `标签(${tagFilters.size}) ▾` : '标签 ▾';

  $('btnTypeFilter').classList.toggle('filter-active', typeFilter !== null);
  $('btnImportanceFilter').classList.toggle('filter-active', importanceFilter > 0);
  $('btnTagFilter').classList.toggle('filter-active', tagFilters.size > 0);
}

// ---------- 回收站 ----------

function updateBinLabel() {
  const n = data.items.filter((i) => i.trashedAt).length;
  $('btnBin').textContent = n > 0 ? `🗑 回收站(${n})` : '🗑 回收站';
}

// 回收站模式下搜索与筛选不生效，禁用避免困惑
function updateBinUI() {
  $('btnBin').classList.toggle('filter-active', binMode);
  $('btnHome').classList.toggle('filter-active', !binMode);
  $('searchInput').disabled = binMode;
  $('btnTypeFilter').disabled = binMode;
  $('btnImportanceFilter').disabled = binMode;
  $('btnTagFilter').disabled = binMode;
}

// 标签筛选菜单：列出全部已有标签，点击勾选/取消（菜单保持打开可多选）
function renderTagMenu() {
  const menu = $('tagMenu');
  menu.innerHTML = '';
  const tags = new Set();
  visibleItems().forEach((i) => i.tags.forEach((t) => tags.add(t)));
  if (tags.size === 0) {
    const empty = document.createElement('div');
    empty.className = 'menu-empty';
    empty.textContent = '暂无标签';
    menu.appendChild(empty);
    return;
  }
  [...tags].sort().forEach((t) => {
    const b = document.createElement('button');
    b.className = 'dropdown-item';
    b.textContent = `${tagFilters.has(t) ? '✓ ' : ''}${t}`;
    b.addEventListener('click', () => {
      if (tagFilters.has(t)) tagFilters.delete(t);
      else tagFilters.add(t);
      renderTagMenu();
      updateFilterLabels();
      renderTree();
    });
    menu.appendChild(b);
  });
}

// ---------- 多选批量编辑 ----------

function selectedItems() {
  return visibleItems().filter((i) => multiSelect.has(i.id));
}

function renderBatchBar() {
  const items = selectedItems();
  const bar = $('batchBar');
  if (binMode || items.length === 0) { bar.style.display = 'none'; return; }
  bar.style.display = 'block';
  $('batchInfo').textContent = `已选 ${items.length} 项`;
  renderBatchStars(items);
  renderBatchTags(items);
}

// 批量星级：所有选中项星级一致时显示该星级（点同一颗星取消）；不一致时点几星统一设为几星
function renderBatchStars(items) {
  const stars = $('batchStars');
  stars.innerHTML = '';
  const common = items.every((i) => i.importance === items[0].importance) ? items[0].importance : 0;
  for (let n = 1; n <= 5; n++) {
    const s = document.createElement('span');
    s.className = 'star' + (n <= common ? ' filled' : '');
    s.textContent = '★';
    s.addEventListener('click', async () => {
      const newVal = common === n ? 0 : n;
      for (const item of items) {
        await window.api.saveItem({ id: item.id, importance: newVal });
      }
      await refresh();
    });
    stars.appendChild(s);
  }
}

// 批量标签：芯片显示所有选中项共有的标签，× 从全部选中项移除；输入框统一添加
function renderBatchTags(items) {
  const chips = $('batchTagChips');
  chips.innerHTML = '';
  const common = items[0].tags.filter((t) => items.every((i) => i.tags.includes(t)));
  common.forEach((t) => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    const label = document.createElement('span');
    label.textContent = t;
    const x = document.createElement('span');
    x.className = 'tag-x';
    x.textContent = '×';
    x.title = `从全部选中项移除「${t}」`;
    x.addEventListener('click', async () => {
      for (const item of items) {
        await window.api.saveItem({ id: item.id, tags: item.tags.filter((v) => v !== t) });
      }
      await refresh();
    });
    chip.append(label, x);
    chips.appendChild(chip);
  });
}

$('btnBatchAddTag').addEventListener('click', async () => {
  const val = $('batchTagInput').value.trim();
  const items = selectedItems();
  if (!val || items.length === 0) return;
  for (const item of items) {
    if (!item.tags.includes(val)) {
      await window.api.saveItem({ id: item.id, tags: [...item.tags, val] });
    }
  }
  $('batchTagInput').value = '';
  await refresh();
});

$('batchTagInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) $('btnBatchAddTag').click();
});

$('btnClearMulti').addEventListener('click', () => {
  multiSelect.clear();
  renderTree();
  renderBatchBar();
});

// ---------- 事件 ----------

$('btnNew').addEventListener('click', () => toggleDropdown('newMenu'));

$('btnBin').addEventListener('click', () => {
  if (binMode) return;
  binMode = true;
  multiSelect.clear();
  selectedId = null;
  updateBinUI();
  renderBatchBar();
  renderTree();
  renderDetail();
});

$('btnHome').addEventListener('click', () => {
  if (!binMode) return;
  binMode = false;
  selectedId = null;
  updateBinUI();
  renderTree();
  renderDetail();
});

$('btnOpenDataFolder').addEventListener('click', () => window.api.openDataFolder());

$('btnRestore').addEventListener('click', async () => {
  const item = data.items.find((i) => i.id === selectedId);
  if (!item) return;
  await window.api.restoreItem(item.id);
  // 恢复后切回主视图并选中该条目，让用户立刻看到它回来了
  binMode = false;
  selectedId = item.id;
  updateBinUI();
  // 若父级是折叠状态，逐级展开保证恢复的条目可见
  let p = item.parentId;
  while (p) {
    expanded.add(p);
    const parent = data.items.find((i) => i.id === p);
    p = parent ? parent.parentId : null;
  }
  await refresh();
});

$('btnPurge').addEventListener('click', async () => {
  const item = data.items.find((i) => i.id === selectedId);
  if (!item) return;
  if (!confirm(`确定要彻底删除「${item.title || '（无标题）'}」吗？\n彻底删除后无法恢复！`)) return;
  if (!confirm('再次确认：真的要永久删除这条内容吗？此操作不可撤销。')) return;
  await window.api.purgeItem(item.id);
  selectedId = null;
  await refresh();
});

$('btnDerive').addEventListener('click', () => toggleDropdown('deriveMenu'));

$('btnTypeFilter').addEventListener('click', () => toggleDropdown('typeMenu'));

$('btnImportanceFilter').addEventListener('click', () => toggleDropdown('importanceMenu'));

$('btnTagFilter').addEventListener('click', () => {
  renderTagMenu();
  toggleDropdown('tagMenu');
});

document.querySelectorAll('#newMenu [data-type]').forEach((b) => {
  b.addEventListener('click', async () => {
    const item = await window.api.saveItem({ type: b.dataset.type, title: '', content: '' });
    binMode = false; // 新建后回到主视图，让新条目可见
    updateBinUI();
    selectedId = item.id;
    closeDropdowns();
    await refresh();
  });
});

document.querySelectorAll('#typeMenu [data-type]').forEach((b) => {
  b.addEventListener('click', () => {
    typeFilter = b.dataset.type || null;
    closeDropdowns();
    updateFilterLabels();
    renderTree();
  });
});

document.querySelectorAll('#importanceMenu [data-min]').forEach((b) => {
  b.addEventListener('click', () => {
    importanceFilter = parseInt(b.dataset.min, 10) || 0;
    closeDropdowns();
    updateFilterLabels();
    renderTree();
  });
});

$('searchInput').addEventListener('input', () => {
  searchQuery = $('searchInput').value;
  renderTree();
});

$('btnSave').addEventListener('click', async () => {
  if (!selectedId) return;
  await window.api.saveItem({
    id: selectedId,
    title: $('titleInput').value,
    content: $('contentInput').value
  });
  await refresh();
});

$('btnTrash').addEventListener('click', async () => {
  const item = data.items.find((i) => i.id === selectedId);
  if (!item) return;
  if (!confirm(`确定要删除「${item.title || '（无标题）'}」吗？\n删除后可在顶栏「回收站」中找回。`)) return;
  await window.api.trashItem(item.id);
  selectedId = null;
  await refresh();
});

// 标签：回车或点「添加」按钮提交（回车忽略输入法候选确认）
async function addTagFromInput() {
  const item = data.items.find((i) => i.id === selectedId);
  const val = $('tagInput').value.trim();
  if (!item || !val) return;
  if (!item.tags.includes(val)) {
    await window.api.saveItem({ id: item.id, tags: [...item.tags, val] });
  }
  $('tagInput').value = '';
  await refresh();
}

$('tagInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) addTagFromInput();
});

$('btnAddTag').addEventListener('click', () => addTagFromInput());

// ---------- 启动 ----------

refresh();
