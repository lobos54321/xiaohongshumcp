package xiaohongshu

import (
	"context"
	"encoding/base64"
	"fmt"
	"time"

	"github.com/chromedp/chromedp"
)

// BrowserService 浏览器自动化服务
type BrowserService struct {
	ctx    context.Context
	cancel context.CancelFunc
}

// NewBrowserService 创建浏览器服务
func NewBrowserService() *BrowserService {
	// 创建浏览器上下文
	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.Flag("headless", true),
		chromedp.Flag("disable-gpu", true),
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("disable-dev-shm-usage", true),
	)

	allocCtx, _ := chromedp.NewExecAllocator(context.Background(), opts...)
	ctx, cancel := chromedp.NewContext(allocCtx)

	return &BrowserService{
		ctx:    ctx,
		cancel: cancel,
	}
}

// Close 关闭浏览器
func (bs *BrowserService) Close() {
	if bs.cancel != nil {
		bs.cancel()
	}
}

// GetLoginQRCode 获取小红书登录二维码
func (bs *BrowserService) GetLoginQRCode() (string, error) {
	var qrCodeBase64 string

	err := chromedp.Run(bs.ctx,
		// 访问小红书登录页
		chromedp.Navigate("https://www.xiaohongshu.com"),
		chromedp.Sleep(2*time.Second),

		// 点击登录按钮
		chromedp.Click(`//div[contains(text(), "登录")]`, chromedp.BySearch),
		chromedp.Sleep(1*time.Second),

		// 获取二维码图片
		chromedp.Screenshot(`//img[@class="qrcode-img"]`, &qrCodeBase64, chromedp.BySearch),
	)

	if err != nil {
		return "", fmt.Errorf("获取二维码失败: %w", err)
	}

	// 返回 base64 编码的图片
	return base64.StdEncoding.EncodeToString([]byte(qrCodeBase64)), nil
}

// CheckLoginStatus 检查登录状态并获取 cookies
func (bs *BrowserService) CheckLoginStatus() (map[string]string, error) {
	var cookies []*chromedp.Cookie

	err := chromedp.Run(bs.ctx,
		// 等待登录完成（检查是否跳转到首页）
		chromedp.WaitVisible(`//div[@class="user-info"]`, chromedp.BySearch),

		// 获取所有 cookies
		chromedp.ActionFunc(func(ctx context.Context) error {
			cookies, err := chromedp.Cookies().Do(ctx)
			if err != nil {
				return err
			}
			// 转换为 map
			cookieMap := make(map[string]string)
			for _, cookie := range cookies {
				cookieMap[cookie.Name] = cookie.Value
			}
			return nil
		}),
	)

	if err != nil {
		return nil, fmt.Errorf("检查登录状态失败: %w", err)
	}

	// 转换 cookies 格式
	cookieMap := make(map[string]string)
	for _, cookie := range cookies {
		cookieMap[cookie.Name] = cookie.Value
	}

	return cookieMap, nil
}

// PublishNote 发布笔记
func (bs *BrowserService) PublishNote(cookies map[string]string, title, content string, images []string) error {
	// 设置 cookies
	var cookieList []*chromedp.Cookie
	for name, value := range cookies {
		cookieList = append(cookieList, &chromedp.Cookie{
			Name:   name,
			Value:  value,
			Domain: ".xiaohongshu.com",
		})
	}

	err := chromedp.Run(bs.ctx,
		// 访问创作中心
		chromedp.Navigate("https://creator.xiaohongshu.com/publish/publish"),
		chromedp.Sleep(2*time.Second),

		// 设置 cookies
		chromedp.ActionFunc(func(ctx context.Context) error {
			return chromedp.SetCookies(cookieList...).Do(ctx)
		}),

		// 刷新页面
		chromedp.Reload(),
		chromedp.Sleep(2*time.Second),

		// 输入标题
		chromedp.SendKeys(`//input[@placeholder="填写标题"]`, title, chromedp.BySearch),

		// 输入内容
		chromedp.SendKeys(`//textarea[@placeholder="填写内容"]`, content, chromedp.BySearch),

		// TODO: 上传图片
		// 这里需要更复杂的逻辑来处理图片上传

		// 点击发布
		chromedp.Click(`//button[contains(text(), "发布")]`, chromedp.BySearch),
		chromedp.Sleep(2*time.Second),
	)

	if err != nil {
		return fmt.Errorf("发布笔记失败: %w", err)
	}

	return nil
}
