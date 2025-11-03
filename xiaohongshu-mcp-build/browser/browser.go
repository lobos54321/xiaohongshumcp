package browser

import (
	"os"

	"github.com/sirupsen/logrus"
	"github.com/xpzouying/headless_browser"
	"github.com/xpzouying/xiaohongshu-mcp/cookies"
)

type browserConfig struct {
	binPath string
}

type Option func(*browserConfig)

func WithBinPath(binPath string) Option {
	return func(c *browserConfig) {
		c.binPath = binPath
	}
}

func NewBrowser(headless bool, options ...Option) *headless_browser.Browser {
	cfg := &browserConfig{}
	for _, opt := range options {
		opt(cfg)
	}

	opts := []headless_browser.Option{
		headless_browser.WithHeadless(headless),
	}
	if cfg.binPath != "" {
		opts = append(opts, headless_browser.WithChromeBinPath(cfg.binPath))
	}

	// 加载 cookies
	cookiePath := cookies.GetCookiesFilePath()
	cookieLoader := cookies.NewLoadCookie(cookiePath)

	// 🔍 调试日志：显示Cookie加载详情
	cwd, _ := os.Getwd()
	logrus.Infof("🍪 [Cookie加载] 当前工作目录: %s", cwd)
	logrus.Infof("🍪 [Cookie加载] Cookie文件路径: %s", cookiePath)

	if data, err := cookieLoader.LoadCookies(); err == nil {
		cookieCount := len(data)
		preview := string(data)
		if len(preview) > 200 {
			preview = preview[:200] + "..."
		}
		logrus.Infof("🍪 [Cookie加载] ✅ 成功加载Cookie，大小: %d 字节", cookieCount)
		logrus.Infof("🍪 [Cookie加载] Cookie内容预览: %s", preview)
		opts = append(opts, headless_browser.WithCookies(string(data)))
	} else {
		logrus.Errorf("🍪 [Cookie加载] ❌ 加载Cookie失败: %v", err)
	}

	return headless_browser.New(opts...)
}
