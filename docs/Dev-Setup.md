### Electron 主进程变更后需重启

修改 `electron/main/*.ts` 后，主进程不会热更新。需**完全退出应用**（Ctrl+C 停止 yarn dev，再重新运行）后，新代码才会生效。若出现 "No handler registered for 'app:project:xxx'" 等错误，多为未重启导致。

### ffmpeg-static 的二进制

ffmpeg-static 安装时从 GitHub 下载很容易失败，遇到这个情况需手工安装

```bash
# 修复 ffmpeg-static 目录权限
sudo chmod -R u+w node_modules/ffmpeg-static/

# 设置代理并重新下载 ffmpeg 二进制
export http_proxy=http://127.0.0.1:7897
export https_proxy=http://127.0.0.1:7897
node node_modules/ffmpeg-static/install.js

```