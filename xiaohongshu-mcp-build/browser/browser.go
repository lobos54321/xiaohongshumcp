package browser

import (
	"encoding/json"
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

	// 检查Cookie文件是否存在
	if _, err := os.Stat(cookiePath); os.IsNotExist(err) {
		logrus.Warnf("🍪 [Browser] Cookie文件不存在: %s", cookiePath)
	} else {
		logrus.Infof("🍪 [Browser] Cookie文件路径: %s", cookiePath)
	}

	if data, err := cookieLoader.LoadCookies(); err == nil {
		// 解析Cookie数量和内容
		var cookieList []map[string]interface{}
		if jsonErr := json.Unmarshal(data, &cookieList); jsonErr == nil {
			logrus.Infof("🍪 [Browser] 成功加载 %d 个Cookie，数据大小: %d 字节", len(cookieList), len(data))

			// 记录关键Cookie
			keyCount := 0
			for _, c := range cookieList {
				name, _ := c["name"].(string)
				domain, _ := c["domain"].(string)
				if name == "web_session" || name == "a1" || name == "xsecappid" || name == "websectiga" {
					logrus.Infof("🍪 [Browser] 关键Cookie: name=%s, domain=%s", name, domain)
					keyCount++
				}
			}
			logrus.Infof("🍪 [Browser] 关键Cookie数量: %d/4", keyCount)
		}

		opts = append(opts, headless_browser.WithCookies(string(data)))
		logrus.Infof("✅ [Browser] Cookie已传递给Rod浏览器")
	} else {
		logrus.Errorf("❌ [Browser] 加载Cookie失败: %v", err)
	}

	return headless_browser.New(opts...)
}
