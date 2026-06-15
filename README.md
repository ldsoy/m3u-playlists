# m3u-playlists

M3U 播放列表仓库，供 fnOS 飞牛影视导入 IPTV 直播源使用。

## 目录

| 目录 | 来源 | 说明 |
|------|------|------|
| `rou.video/` | rou.video | 肉视频搜索页批量提取 |

## 使用方式

1. 运行对应站点的 Tampermonkey 脚本提取 m3u
2. 将生成的 `.m3u` 文件放入对应目录
3. 飞牛影视导入时使用 raw URL：
   ```
   https://raw.githubusercontent.com/ldsoy/m3u-playlists/main/rou.video/xxx.m3u
   ```

## Tampermonkey 脚本

- **rou.video 批量提取**: 搜索页一键翻页 + iframe 捕获 m3u8 → 下载 m3u
