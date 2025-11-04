package xiaohongshu

import (
	"context"
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
	pp.MustNavigate("https://www.xiaohongshu.com/explore").MustWaitLoad()

	time.Sleep(1 * time.Second)

	exists, _, err := pp.Has(`.main-container .user .link-wrapper .channel`)
	if err != nil {
		return false, errors.Wrap(err, "check login status failed")
	}

	if !exists {
		return false, errors.Wrap(err, "login status element not found")
	}

	return true, nil
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
	pp.MustNavigate("https://www.xiaohongshu.com/login").MustWaitLoad()

	// 等待页面完全加载
	time.Sleep(2 * time.Second)

	// 检查是否已经登录（检查用户相关元素）
	if exists, _, _ := pp.Has(".user-info, .avatar, .username, .user-avatar"); exists {
		return "", true, nil
	}

	// 🔥 修复：主动点击"扫码登录"按钮（如果存在）
	if scanBtn, err := pp.Timeout(3 * time.Second).Element("text=/扫码登录/"); err == nil {
		scanBtn.MustClick()
		time.Sleep(1 * time.Second)
	}

	// 🔍 使用 Timeout 避免永久阻塞，并添加详细日志
	// 30秒超时：配合三层降级机制，快速失败快速降级
	qrcodeEl, err := pp.Timeout(30 * time.Second).Element(".login-container .qrcode-img")
	if err != nil {
		return "", false, errors.Wrap(err, "⏰ 获取二维码元素超时(30秒) - 可能是Cookie问题或网络问题")
	}

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
