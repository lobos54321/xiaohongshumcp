package xiaohongshu

import (
	"context"
	"log/slog"
	"time"

	"github.com/go-rod/rod"
	"github.com/pkg/errors"
)

type LoginAction struct {
	page *rod.Page
}

func NewLogin(page *rod.Page) *LoginAction {
	return &LoginAction{page: page}
}

func (a *LoginAction) CheckLoginStatus(ctx context.Context) (bool, error) {
	pp := a.page.Context(ctx)
	
	// 🔥 优化：先检查Cookie，更快更准确
	cookies, err := pp.Browser().GetCookies()
	if err != nil {
		return false, errors.Wrap(err, "failed to get cookies")
	}
	
	// 检查关键Cookie是否存在
	hasWebSession := false
	hasA1 := false
	for _, cookie := range cookies {
		if cookie.Name == "web_session" && cookie.Value != "" {
			hasWebSession = true
		}
		if cookie.Name == "a1" && cookie.Value != "" {
			hasA1 = true
		}
	}
	
	// 如果有关键Cookie，说明已登录
	if hasWebSession && hasA1 {
		slog.Info("✅ [Login Check] 检测到有效Cookie (web_session + a1)")
		return true, nil
	}
	
	// Cookie检查失败，尝试DOM元素检查
	pp.MustNavigate("https://www.xiaohongshu.com/explore").MustWaitLoad()
	time.Sleep(1 * time.Second)

	// 尝试多个可能的登录状态元素
	selectors := []string{
		`.main-container .user .link-wrapper .channel`,
		`.user-info`,
		`.avatar`,
		`.username`,
		`[class*="user"]`,
	}
	
	for _, selector := range selectors {
		if exists, _, _ := pp.Has(selector); exists {
			slog.Info("✅ [Login Check] 检测到登录元素", "selector", selector)
			return true, nil
		}
	}
	
	slog.Warn("⚠️  [Login Check] 未检测到登录状态")
	return false, nil
}

func (a *LoginAction) Login(ctx context.Context) error {
	pp := a.page.Context(ctx)

	// 导航到小红书首页，这会触发二维码弹窗
	pp.MustNavigate("https://www.xiaohongshu.com/explore").MustWaitLoad()

	// 等待一小段时间让页面完全加载
	time.Sleep(2 * time.Second)

	// 检查是否已经登录
	if exists, _, _ := pp.Has(".main-container .user .link-wrapper .channel"); exists {
		// 已经登录，直接返回
		return nil
	}

	// 等待扫码成功提示或者登录完成
	// 这里我们等待登录成功的元素出现，这样更简单可靠
	pp.MustElement(".main-container .user .link-wrapper .channel")

	return nil
}

func (a *LoginAction) FetchQrcodeImage(ctx context.Context) (string, bool, error) {
	pp := a.page.Context(ctx)

	// 🔥 修复：直接访问登录页，而不是首页
	slog.Info("🌐 [QR Login] 开始访问登录页面")
	pp.MustNavigate("https://www.xiaohongshu.com/login").MustWaitLoad()
	slog.Info("✅ [QR Login] 登录页面加载完成")

	// 等待页面完全加载
	time.Sleep(2 * time.Second)

	// 检查是否已经登录（检查用户相关元素）
	if exists, _, _ := pp.Has(".user-info, .avatar, .username, .user-avatar"); exists {
		slog.Info("👤 [QR Login] 检测到已登录状态")
		return "", true, nil
	}

	// 🔥 修复：主动点击"扫码登录"按钮（如果存在）
	slog.Info("🔍 [QR Login] 查找扫码登录按钮")
	if scanBtn, err := pp.Timeout(3 * time.Second).Element("text=/扫码登录/"); err == nil {
		slog.Info("👆 [QR Login] 点击扫码登录按钮")
		scanBtn.MustClick()
		time.Sleep(1 * time.Second)
	} else {
		slog.Warn("⚠️  [QR Login] 未找到扫码登录按钮，可能已在扫码模式")
	}

	// 🔍 使用 Timeout 避免永久阻塞，并添加详细日志
	// 30秒超时：配合三层降级机制，快速失败快速降级
	slog.Info("⏳ [QR Login] 等待二维码元素出现（30秒超时）")
	qrcodeEl, err := pp.Timeout(30 * time.Second).Element(".login-container .qrcode-img")
	if err != nil {
		slog.Error("❌ [QR Login] 获取二维码元素失败", "error", err)
		return "", false, errors.Wrap(err, "⏰ 获取二维码元素超时(30秒) - 页面可能未正确加载二维码")
	}
	slog.Info("✅ [QR Login] 找到二维码元素")

	// 获取二维码图片src属性
	src, err := qrcodeEl.Attribute("src")
	if err != nil {
		return "", false, errors.Wrap(err, "❌ 读取二维码src属性失败")
	}
	if src == nil || len(*src) == 0 {
		return "", false, errors.New("❌ 二维码src为空 - 页面可能未正确加载")
	}

	return *src, false, nil
}

func (a *LoginAction) WaitForLogin(ctx context.Context) bool {
	pp := a.page.Context(ctx)
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return false
		case <-ticker.C:
			el, err := pp.Element(".main-container .user .link-wrapper .channel")
			if err == nil && el != nil {
				return true
			}
		}
	}
}
