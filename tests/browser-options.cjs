// 统一的浏览器启动参数：默认驱动本机系统 Chrome，避免额外下载 Playwright 浏览器。
// 通过环境变量覆盖：
//   ONEKNIFE_CHANNEL=chrome     使用系统 Chrome（默认）
//   ONEKNIFE_CHANNEL=chromium   使用 Playwright 自带 chromium（CI 需先执行 npx playwright install chromium）
//   ONEKNIFE_CHANNEL=msedge     使用系统 Edge 等其他已安装浏览器
function browserLaunchOptions() {
  const channel = process.env.ONEKNIFE_CHANNEL ?? "chrome";
  const options = { headless: true };
  if (channel && channel !== "chromium") options.channel = channel;
  return options;
}

module.exports = { browserLaunchOptions };