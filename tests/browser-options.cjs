// 统一的浏览器启动参数：默认驱动本机系统 Chrome，避免额外下载 Playwright 浏览器。
// 通过环境变量覆盖：
//   ONEKNIFE_CHANNEL=chrome     使用系统 Chrome（默认）
//   ONEKNIFE_CHANNEL=chromium   使用 Playwright 自带 chromium（CI 需先执行 npx playwright install chromium）
//   ONEKNIFE_CHANNEL=msedge     使用系统 Edge 等其他已安装浏览器
//   ONEKNIFE_CHROMIUM_PATH=/usr/bin/chromium  直接指定浏览器可执行文件（容器/CI 无 Google Chrome 时用）
function browserLaunchOptions() {
  const channel = process.env.ONEKNIFE_CHANNEL ?? "chrome";
  const executablePath = process.env.ONEKNIFE_CHROMIUM_PATH;
  const options = { headless: true };
  if (executablePath) {
    // 容器内以 root 运行必须关沙箱；/dev/shm 常常只有 64MB，必须禁用共享内存。
    options.executablePath = executablePath;
    options.args = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"];
  } else if (channel && channel !== "chromium") {
    options.channel = channel;
  }
  return options;
}

module.exports = { browserLaunchOptions };
