// 主进程：窗口管理、数据读写（全局快捷键见阶段 5）
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ---------- 数据层 ----------

const dataFile = () => path.join(app.getPath('userData'), 'data.json');
const backupDir = () => path.join(app.getPath('userData'), 'backups');

const EMPTY_DATA = { version: 1, items: [] };

const ITEM_TYPES = ['inspiration', 'plan', 'solution', 'project'];

// 时间戳：YYYYMMDD-HHmmss（备份文件名用）
function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function loadData() {
  const file = dataFile();
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return EMPTY_DATA; // 首次运行，还没有数据文件
    // 文件损坏：挪走保留现场，避免被覆盖，下次保存会用空数据重建
    try {
      fs.renameSync(file, `${file}.corrupt-${timestamp()}`);
    } catch (e) { /* 挪不走就算了 */ }
    return EMPTY_DATA;
  }
}

// 原子写入：先写临时文件，再重命名覆盖，防止写一半损坏
function saveData(data) {
  const file = dataFile();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

// 启动时备份：距上次备份超过 24 小时才备份，最多保留 20 份
function backupIfNeeded() {
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  const backups = fs.readdirSync(dir)
    .filter((f) => f.startsWith('data-') && f.endsWith('.json'))
    .sort();
  const newest = backups[backups.length - 1];
  let need = !newest;
  if (newest) {
    // 从备份文件名解析时间：data-YYYYMMDD-HHmmss.json
    const m = newest.match(/^data-(\d{8})-(\d{6})\.json$/);
    if (m) {
      const t = new Date(
        parseInt(m[1].slice(0, 4), 10),
        parseInt(m[1].slice(4, 6), 10) - 1,
        parseInt(m[1].slice(6, 8), 10),
        parseInt(m[2].slice(0, 2), 10),
        parseInt(m[2].slice(2, 4), 10),
        parseInt(m[2].slice(4, 6), 10)
      );
      need = Date.now() - t.getTime() > 24 * 60 * 60 * 1000;
    }
  }
  if (need && fs.existsSync(dataFile())) {
    fs.copyFileSync(dataFile(), path.join(dir, `data-${timestamp()}.json`));
    // 只保留最近 20 份
    const all = fs.readdirSync(dir)
      .filter((f) => f.startsWith('data-') && f.endsWith('.json'))
      .sort();
    while (all.length > 20) {
      fs.rmSync(path.join(dir, all.shift()));
    }
  }
}

// ---------- IPC 数据接口 ----------

ipcMain.handle('data:load', () => loadData());

// 新建或更新一个条目：有 id 且能找到 = 更新；否则 = 新建
ipcMain.handle('data:saveItem', (event, input) => {
  const data = loadData();
  const now = new Date().toISOString();
  const existing = data.items.find((i) => i.id === (input && input.id));

  let item;
  if (existing) {
    item = existing;
    // 只更新允许修改的字段
    if (typeof input.title === 'string') item.title = input.title;
    if (typeof input.content === 'string') item.content = input.content;
    if (ITEM_TYPES.includes(input.type)) item.type = input.type;
    if (Number.isInteger(input.importance)) item.importance = Math.min(5, Math.max(0, input.importance));
    if (Array.isArray(input.tags)) item.tags = input.tags.filter((t) => typeof t === 'string');
    if (input.parentId === null || typeof input.parentId === 'string') item.parentId = input.parentId;
    item.updatedAt = now;
  } else {
    item = {
      id: crypto.randomUUID(),
      type: ITEM_TYPES.includes(input && input.type) ? input.type : 'inspiration',
      title: input && typeof input.title === 'string' ? input.title : '',
      content: input && typeof input.content === 'string' ? input.content : '',
      importance: input && Number.isInteger(input.importance) ? Math.min(5, Math.max(0, input.importance)) : 0,
      parentId: input && typeof input.parentId === 'string' ? input.parentId : null,
      tags: input && Array.isArray(input.tags) ? input.tags.filter((t) => typeof t === 'string') : [],
      createdAt: now,
      updatedAt: now,
      trashedAt: null
    };
    data.items.push(item);
  }
  saveData(data);
  return item;
});

// 移入回收站
ipcMain.handle('data:trashItem', (event, id) => {
  const data = loadData();
  const item = data.items.find((i) => i.id === id);
  if (!item || item.trashedAt) return null;
  item.trashedAt = new Date().toISOString();
  item.updatedAt = item.trashedAt;
  saveData(data);
  return item;
});

// 从回收站恢复
ipcMain.handle('data:restoreItem', (event, id) => {
  const data = loadData();
  const item = data.items.find((i) => i.id === id);
  if (!item || !item.trashedAt) return null;
  item.trashedAt = null;
  item.updatedAt = new Date().toISOString();
  saveData(data);
  return item;
});

// 彻底删除（只允许删除回收站中的条目，防止误删正常数据）
ipcMain.handle('data:purgeItem', (event, id) => {
  const data = loadData();
  const idx = data.items.findIndex((i) => i.id === id);
  if (idx === -1 || !data.items[idx].trashedAt) return null;
  const [removed] = data.items.splice(idx, 1);
  saveData(data);
  return removed;
});

// 打开数据文件夹
ipcMain.handle('app:openDataFolder', () => shell.openPath(app.getPath('userData')));

// ---------- 窗口 ----------

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    title: '灵感管理',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  backupIfNeeded(); // 启动时检查是否需要备份数据
  createWindow();

  app.on('activate', () => {
    // macOS 上点击 Dock 图标且无窗口时重新创建窗口
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Windows/Linux：所有窗口关闭即退出应用
  if (process.platform !== 'darwin') app.quit();
});
