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

	// 🔥 快速检查：只检查Cookie和当前页面状态，不导航
	// CheckLoginStatus应该是轻量级操作，避免每次都Navigate浪费2秒+

	// 1. 检查Cookie
	cookies, err := pp.Browser().GetCookies()
	if err != nil {
		return false, errors.Wrap(err, "failed to get cookies")
	}

	hasWebSession := false
	hasA1 := false
	webSessionValue := ""
	a1Value := ""

	for _, cookie := range cookies {
		if cookie.Name == "web_session" && cookie.Value != "" && cookie.Value != "Guest" {
			hasWebSession = true
			webSessionValue = cookie.Value
		}
		if cookie.Name == "a1" && cookie.Value != "" {
			hasA1 = true
			a1Value = cookie.Value
		}
	}

	// 如果有长Cookie，很可能已登录
	if hasWebSession && hasA1 && len(webSessionValue) > 20 && len(a1Value) > 20 {
		slog.Info("✅ [Login Check] 检测到有效Cookie",
			"webSessionLen", len(webSessionValue),
			"a1Len", len(a1Value))
		return true, nil
	}

	// 2. 快速检查当前页面的DOM元素（不导航）
	// 如果当前页面有登录元素，也认为已登录
	loginSelectors := []string{
		`.main-container .user .link-wrapper .channel`,
		`.user-info`,
		`.avatar`,
		`.username`,
		`[class*="user"]`,
	}

	for _, selector := range loginSelectors {
		if exists, _, _ := pp.Has(selector); exists {
			slog.Info("✅ [Login Check] 当前页面检测到登录元素", "selector", selector)
			return true, nil
		}
	}

	// 没有Cookie也没有登录元素 → 未登录
	slog.Info("⚠️  [Login Check] 未检测到登录状态（无Cookie或登录元素）")
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

	loginCheckCount := 0
	captchaDetected := false

	for {
		select {
		case <-ctx.Done():
			slog.Warn("⏰ [WaitForLogin] 超时退出")
			return false
		case <-ticker.C:
			loginCheckCount++

			// 🔥 检测验证码页面（小红书新增的安全验证）
			if !captchaDetected {
				// 检测常见的验证码元素
				captchaSelectors := []string{
					".verify-box",           // 通用验证框
					".captcha",              // 验证码容器
					"[class*='verify']",     // 包含verify的class
					"[class*='captcha']",    // 包含captcha的class
					".slider-verify",        // 滑块验证
					"input[placeholder*='验证码']", // 验证码输入框
				}

				for _, selector := range captchaSelectors {
					if exists, _, _ := pp.Has(selector); exists {
						slog.Warn("🔐 [WaitForLogin] 检测到验证码页面，请在浏览器中完成验证！")
						slog.Info("💡 [WaitForLogin] 提示：完成验证后系统会自动继续...")
						captchaDetected = true
						break
					}
				}
			}

			// 每10次检查输出一次日志，避免日志过多
			if loginCheckCount%10 == 1 {
				if captchaDetected {
					slog.Info("⏳ [WaitForLogin] 等待验证码完成...", "count", loginCheckCount)
				} else {
					slog.Info("🔍 [WaitForLogin] 正在检查登录状态...", "count", loginCheckCount)
				}
			}

			// 🔥 优先检查Cookie（更可靠）
			cookies, err := pp.Browser().GetCookies()
			if err != nil {
				slog.Error("❌ [WaitForLogin] 获取Cookie失败", "error", err)
				continue
			}

			hasWebSession := false
			hasA1 := false
			webSessionValue := ""
			a1Value := ""

			for _, cookie := range cookies {
				if cookie.Name == "web_session" && cookie.Value != "" && cookie.Value != "Guest" {
					hasWebSession = true
					webSessionValue = cookie.Value
				}
				if cookie.Name == "a1" && cookie.Value != "" {
					hasA1 = true
					a1Value = cookie.Value
				}
			}

			// 每10次检查输出Cookie状态
			if loginCheckCount%10 == 1 {
				slog.Info("🍪 [WaitForLogin] Cookie状态",
					"hasWebSession", hasWebSession,
					"webSessionLen", len(webSessionValue),
					"hasA1", hasA1,
					"a1Len", len(a1Value))
			}

			// 🔥 优先策略：检查DOM元素（最可靠）
			// 只有真正登录后才会出现用户相关元素
			loginSelectors := []string{
				".main-container .user .link-wrapper .channel",
				".user-info",
				".avatar",
				".username",
				"[class*='user']",
			}

			for _, selector := range loginSelectors {
				if exists, _, _ := pp.Has(selector); exists {
					slog.Info("🎉 [WaitForLogin] 检测到登录元素，确认登录成功！", "selector", selector)
					return true
				}
			}

			// 🔥 辅助策略：Cookie检测（仅在有长Cookie但无DOM元素时记录）
			if hasWebSession && hasA1 && len(webSessionValue) > 20 && len(a1Value) > 20 {
				// 有Cookie但无登录元素，可能是验证码页面
				if loginCheckCount%10 == 1 {
					slog.Info("🍪 [WaitForLogin] 检测到Cookie但无登录元素",
						"webSessionLen", len(webSessionValue),
						"a1Len", len(a1Value),
						"hint", "可能在验证码页面或页面加载中")
				}
			}
		}
	}
}
