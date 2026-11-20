# 真人试玩存档（跨浏览器会话）

`real-player-progress.json` 是《一刀999》真实浏览器试玩的检查点，存档 key 为 `oneknife999-prototype-save-v4`。

## 每次开始试玩
1. 云端浏览器打开 `http://127.0.0.1:4174/`。
2. 在页面里执行：
   ```js
   localStorage.setItem('oneknife999-prototype-save-v4', <文件内容字符串>);
   location.reload();
   ```
   或直接用游戏顶部“导入”粘贴文件内容。
3. 确认 HUD 与 `试玩进度.md` 一致后再操作。

## 每次结束试玩
1. 读取 `localStorage.getItem('oneknife999-prototype-save-v4')`。
2. 覆盖本目录的 `real-player-progress.json`。
3. 更新根目录 `试玩进度.md`（时间、等级、关卡进度、死亡次数、当前目标）。
4. 关闭浏览器标签页，不在本地留浏览器进程。

## 注意
- 首领战进行中的当前血量不在这份存档里；读档后首领回到满血。已击杀/8/8 进度、等级、金币、死亡数会保留。0.8.54 起首关已完成、雾松林已解锁，检查点从 `pine_forest` 起点 `90,760` 继续。
- 换云端浏览器或清空 localStorage 后，必须从本文件恢复，否则会从选职业开始。
