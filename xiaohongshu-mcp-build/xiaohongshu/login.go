package xiaohongshu

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/proto"
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
	// 提高阈值：tracking cookie约38/52字节，真实登录cookie通常>100字节
    // 🔧 FIX: 添加详细日志查看Cookie长度
    slog.Info("🔍 [Login Check] Cookie长度检查",
        "hasWebSession", hasWebSession,
        "hasA1", hasA1,
        "webSessionLen", len(webSessionValue),
        "a1Len", len(a1Value),
        "threshold", "webSession>80 && a1>40")

    if hasWebSession && hasA1 && len(webSessionValue) > 80 && len(a1Value) > 40 {
        slog.Info("✅ [Login Check] 检测到有效Cookie",
            "webSessionLen", len(webSessionValue),
            "a1Len", len(a1Value))
        return true, nil
    }

	// 2. 快速检查当前页面的DOM元素（不导航）
	// 使用更精确的选择器，避免误判验证码页面
	loginSelectors := []string{
		`.main-container .user .link-wrapper .channel`, // 主页用户菜单（具体）
		`.reds-header-user`,                            // 新版header用户区域（具体）
		`a[href='/user/profile/me']`,                   // 个人主页链接（具体）
		// 🔥 已移除 [class*="user"] - 太宽泛，会匹配验证码页面元素
	}

    for _, selector := range loginSelectors {
        if exists, _, _ := pp.Has(selector); exists {
            slog.Info("✅ [Login Check] 当前页面检测到登录元素", "selector", selector)
            return true, nil
        }
    }

    if hasWebSession && hasA1 {
        slog.Info("🔄 [Login Check] 尝试通过导航确认登录状态")

        // 🔧 FIX: 在导航前手动确保Cookie已设置
        // 问题：即使Cookie有正确的域名，Rod可能没有在HTTP请求中携带它们
        // 解决：在Navigate前显式设置Cookie到Browser
        err = pp.Browser().SetCookies(cookies)
        if err != nil {
            slog.Warn("⚠️  [Login Check] 设置Cookie失败", "error", err)
        } else {
            slog.Info("✅ [Login Check] Cookie已设置到浏览器")
        }

        _ = pp.Timeout(20 * time.Second).Navigate("https://creator.xiaohongshu.com/creator/content")
        pp.WaitLoad()
        time.Sleep(1 * time.Second)

        // 🔧 FIX: 使用Info()替代MustInfo()避免panic
        pageInfo, err := pp.Info()
        if err != nil {
            slog.Warn("⚠️  [Login Check] 无法获取页面信息", "error", err)
            return false, nil
        }

        currentURL := pageInfo.URL
        if currentURL != "" && strings.Contains(currentURL, "/login") {
            slog.Info("⚠️  [Login Check] 导航到登录页", "url", currentURL)
            return false, nil
        }
        for _, selector := range loginSelectors {
            if exists, _, _ := pp.Has(selector); exists {
                slog.Info("🎉 [Login Check] 导航后检测到登录元素", "selector", selector)
                return true, nil
            }
        }
    }

    slog.Info("⚠️  [Login Check] 未检测到登录状态（无Cookie或登录元素）")
    return false, nil
}

func (a *LoginAction) Login(ctx context.Context) error {
	pp := a.page.Context(ctx)

	// 导航到小红书首页，这会触发二维码弹窗
	slog.Info("🌐 [Login] 导航到explore页面")
	if err := pp.Navigate("https://www.xiaohongshu.com/explore"); err != nil {
		slog.Error("❌ [Login] 导航失败", "error", err)
		return errors.Wrap(err, "navigate to explore page failed")
	}
	if err := pp.WaitLoad(); err != nil {
		slog.Error("❌ [Login] 等待页面加载失败", "error", err)
		return errors.Wrap(err, "wait for page load failed")
	}

	// 等待一小段时间让页面完全加载
	time.Sleep(2 * time.Second)

	// 检查是否已经登录
	if exists, _, _ := pp.Has(".main-container .user .link-wrapper .channel"); exists {
		slog.Info("✅ [Login] 检测到已登录状态")
		return nil
	}

	// 等待扫码成功提示或者登录完成
	// 这里我们等待登录成功的元素出现，这样更简单可靠
	slog.Info("⏳ [Login] 等待登录元素出现（60秒超时）")
	_, err := pp.Timeout(60 * time.Second).Element(".main-container .user .link-wrapper .channel")
	if err != nil {
		slog.Error("❌ [Login] 等待登录元素超时", "error", err)
		return errors.Wrap(err, "wait for login element timeout")
	}
	slog.Info("✅ [Login] 登录成功")

	return nil
}

func (a *LoginAction) FetchQrcodeImage(ctx context.Context) (string, bool, error) {
	pp := a.page.Context(ctx)

	// 🔥 关键修复：清除浏览器中的所有Cookie，防止自动登录
	// 问题：browser.NewBrowser()会自动从文件加载Cookie，导致访问登录页时自动登录
	// 解决：在访问登录页前，强制清空浏览器Cookie
	slog.Info("🧹 [QR Login] 清除浏览器Cookie，确保显示二维码...")
	// 使用空的Cookie数组清除所有Cookie
	if err := pp.Browser().SetCookies(nil); err != nil {
		slog.Warn("⚠️  [QR Login] 清除Cookie失败，可能导致自动登录", "error", err)
	} else {
		slog.Info("✅ [QR Login] 浏览器Cookie已清除")
	}

	// 🔥 修复：直接访问登录页，而不是首页
	slog.Info("🌐 [QR Login] 开始访问登录页面")
	if err := pp.Navigate("https://www.xiaohongshu.com/login"); err != nil {
		slog.Error("❌ [QR Login] 导航到登录页面失败", "error", err)
		return "", false, errors.Wrap(err, "navigate to login page failed")
	}
	if err := pp.WaitLoad(); err != nil {
		slog.Error("❌ [QR Login] 等待登录页面加载失败", "error", err)
		return "", false, errors.Wrap(err, "wait for login page load failed")
	}
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
		if err := scanBtn.Click(proto.InputMouseButtonLeft, 1); err != nil {
			slog.Warn("⚠️  [QR Login] 点击扫码登录按钮失败", "error", err)
		} else {
			slog.Info("✅ [QR Login] 扫码登录按钮点击成功")
		}
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
	previouslyOnQRCodePage := false // 🔥 新增：追踪二维码页面状态

	for {
		select {
		case <-ctx.Done():
			slog.Warn("⏰ [WaitForLogin] 超时退出")
			return false
		case <-ticker.C:
			loginCheckCount++

			// 🔥 每次循环都重新检测验证码状态（验证码可能消失）

			// 🔥 关键修复：先检测是否在二维码登录页面，避免误判
			// 问题：之前的 [class*='verify'] 会匹配二维码页面的元素（如 qrcode-verify）
			// 解决：明确排除二维码页面，只在真正的验证码页面时才等待
			isQRCodePage, _, _ := pp.Has(".login-container .qrcode-img")

			// 🔥 使用精确的验证码选择器，避免误判二维码页面
			// 只检测真正的验证码特征，不使用宽泛的属性选择器
			captchaSelectors := []string{
				".verify-box",                 // 通用验证框
				".captcha-container",          // 验证码容器
				".slider-verify",              // 滑块验证
				"input[placeholder*='验证码']", // 验证码输入框
				".nc-container",               // 阿里云验证码
				"#nc_1_wrapper",               // 滑块验证ID
				".yidun",                      // 网易验证码
				".geetest_panel",              // 极验证码
				// 🔥 已移除宽泛的属性选择器：
				// "[class*='verify']"   - 太宽泛，会匹配二维码页面
				// "[class*='captcha']"  - 太宽泛，会匹配二维码页面
			}

			// 重置验证码检测状态（每次重新检测）
			captchaDetectedNow := false

			// 只在非二维码页面时检测验证码
			if !isQRCodePage {
				for _, selector := range captchaSelectors {
					if exists, _, _ := pp.Has(selector); exists {
						captchaDetectedNow = true
						// 只在首次检测到或状态变化时输出日志
						if !captchaDetected {
							slog.Warn("🔐 [WaitForLogin] 检测到验证码页面，请在浏览器中完成验证！", "selector", selector)
							slog.Info("💡 [WaitForLogin] 提示：完成验证后系统会自动继续...")
						}
						break
					}
				}
			} else {
				// 在二维码页面，明确不是验证码页面
				if loginCheckCount%10 == 1 {
					slog.Info("📱 [WaitForLogin] 当前在二维码登录页面，等待扫码...")
				}
			}

			// 🔥 关键修复1：验证码消失后，主动导航到首页获取登录Cookie
			// 问题：小红书扫码登录后，登录页不会自动跳转，Cookie不会更新
			// 解决：检测到验证码消失后，主动Navigate到首页，触发Cookie设置
			if captchaDetected && !captchaDetectedNow {
				slog.Info("✅ [WaitForLogin] 验证码已完成，正在导航到首页获取登录Cookie...")

				// 导航到explore页面，触发真正的登录Cookie设置
				if err := pp.Navigate("https://www.xiaohongshu.com/explore"); err == nil {
					slog.Info("🌐 [WaitForLogin] 正在加载首页...")
					pp.WaitLoad()
					slog.Info("✅ [WaitForLogin] 首页加载完成，等待Cookie更新...")
					time.Sleep(2 * time.Second)
				} else {
					slog.Warn("⚠️  [WaitForLogin] 导航到首页失败", "error", err)
				}
			}

			// 🔥 关键修复2：扫码成功检测 - 二维码消失或页面变化
			// 问题：扫码成功后二维码页面不会自动跳转，导致Cookie无法更新
			// 解决：检测二维码消失或扫码成功提示，主动导航获取Cookie
			qrCodeDisappeared := previouslyOnQRCodePage && !isQRCodePage

			// 检测扫码成功的提示文本
			scanSuccessDetected := false
			scanSuccessSelectors := []string{
				"text=/扫码成功/",
				"text=/登录成功/",
				".scan-success",
				".login-success-tip",
			}

			for _, selector := range scanSuccessSelectors {
				if exists, _, _ := pp.Has(selector); exists {
					scanSuccessDetected = true
					slog.Info("🎉 [WaitForLogin] 检测到扫码成功提示！", "selector", selector)
					break
				}
			}

			// 如果二维码消失或检测到扫码成功，主动导航
			if qrCodeDisappeared || scanSuccessDetected {
				slog.Info("🔄 [WaitForLogin] 触发主动导航（扫码场景），获取登录Cookie...")
				if err := pp.Navigate("https://www.xiaohongshu.com/explore"); err == nil {
					slog.Info("🌐 [WaitForLogin] 正在加载首页...")
					pp.WaitLoad()
					slog.Info("✅ [WaitForLogin] 首页加载完成，等待Cookie更新...")
					time.Sleep(2 * time.Second)
				} else {
					slog.Warn("⚠️  [WaitForLogin] 导航到首页失败", "error", err)
				}
			}

			// 更新状态
			captchaDetected = captchaDetectedNow
			previouslyOnQRCodePage = isQRCodePage

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

			// 🔥 关键修复：验证码页面时跳过登录检测，避免误判
			// 问题：验证码页面也可能包含 [class*='user'] 等元素，导致误判为已登录
			// 解决：只在验证码确实存在时才跳过登录检查（而不是用历史状态）
			if captchaDetectedNow {
				// 当前在验证码页面，跳过登录检查，等待用户完成验证
				continue
			}

			// 🔥 优先策略1：检查URL变化（最可靠）
			// 扫码成功后主动导航到explore，URL会从/login变化
			// 🔧 FIX: 使用Info()替代MustInfo()避免panic
			pageInfo, err := pp.Info()
			if err != nil {
				slog.Warn("⚠️  [WaitForLogin] 无法获取页面信息", "error", err)
				continue
			}
			currentURL := pageInfo.URL
			if currentURL != "" && !strings.Contains(currentURL, "/login") {
				slog.Info("🎉 [WaitForLogin] 检测到页面已离开登录页，确认登录成功！", "url", currentURL)
				return true
			}

			// 🔥 优先策略2：检查DOM元素（使用更精确的选择器）
			// 只有真正登录后才会出现用户相关元素
			loginSelectors := []string{
				".main-container .user .link-wrapper .channel", // 主页用户菜单（具体）
				".reds-header-user",                            // 新版header用户区域（具体）
				"a[href='/user/profile/me']",                   // 个人主页链接（具体）
				".user-info",                                   // 用户信息元素
				// 🔥 已移除 "[class*='user']" - 太宽泛，会匹配验证码页面元素
			}

			for _, selector := range loginSelectors {
				if exists, _, _ := pp.Has(selector); exists {
					slog.Info("🎉 [WaitForLogin] 检测到登录元素，确认登录成功！", "selector", selector)
					return true
				}
			}

			// 🔥 辅助策略：Cookie检测（仅在有长Cookie但无DOM元素时记录）
			// 提高阈值：tracking cookie约38/52字节，真实登录cookie通常>100字节
			if hasWebSession && hasA1 && len(webSessionValue) > 100 && len(a1Value) > 50 {
				// 有真实登录Cookie但无登录元素，可能是页面加载中
				if loginCheckCount%10 == 1 {
					slog.Info("🍪 [WaitForLogin] 检测到长Cookie但无登录元素",
						"webSessionLen", len(webSessionValue),
						"a1Len", len(a1Value),
						"hint", "可能在页面加载中，继续等待...")
				}
			}

			// 🔥 关键修复3：定时主动导航兜底机制（每30秒）
			// 在扫码成功但页面未自动跳转的情况下，定期尝试导航到首页
			if loginCheckCount%60 == 0 { // 60 * 500ms = 30秒
				slog.Info("🔄 [WaitForLogin] 定时检查：尝试导航到首页确认登录状态...", "count", loginCheckCount)
				oldWebSessionLen := len(webSessionValue)

				if err := pp.Navigate("https://www.xiaohongshu.com/explore"); err == nil {
					pp.WaitLoad()
					time.Sleep(1 * time.Second)

					// 重新检查Cookie，看是否有更新
					newCookies, err := pp.Browser().GetCookies()
					if err == nil {
						for _, cookie := range newCookies {
							if cookie.Name == "web_session" && len(cookie.Value) > oldWebSessionLen {
								slog.Info("✅ [WaitForLogin] 定时检查：检测到Cookie已更新！",
									"oldLen", oldWebSessionLen,
									"newLen", len(cookie.Value))
							}
						}
					}
				}
			}
		}
	}
}
