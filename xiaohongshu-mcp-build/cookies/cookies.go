package cookies

import (
	"os"

	"github.com/pkg/errors"
)

type Cookier interface {
	LoadCookies() ([]byte, error)
	SaveCookies(data []byte) error
}

type localCookie struct {
	path string
}

func NewLoadCookie(path string) Cookier {
	if path == "" {
		panic("path is required")
	}

	return &localCookie{
		path: path,
	}
}

// LoadCookies 从文件中加载 cookies。
func (c *localCookie) LoadCookies() ([]byte, error) {

	data, err := os.ReadFile(c.path)
	if err != nil {
		return nil, errors.Wrap(err, "failed to read cookies from tmp file")
	}

	return data, nil
}

// SaveCookies 保存 cookies 到文件中。
func (c *localCookie) SaveCookies(data []byte) error {
	return os.WriteFile(c.path, data, 0644)
}

// GetCookiesFilePath 获取 cookies 文件路径。
// 优先使用环境变量 COOKIES_PATH；否则使用 /app/data/cookies.json；最后回退到当前目录 cookies.json
func GetCookiesFilePath() string {
	if p := os.Getenv("COOKIES_PATH"); p != "" {
		return p
	}
	if _, err := os.Stat("/app/data/cookies.json"); err == nil {
		return "/app/data/cookies.json"
	}
	return "cookies.json"
}
