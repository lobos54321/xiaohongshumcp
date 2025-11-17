package xiaohongshu

import (
	"context"
	"fmt"
	"time"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/proto"
	"github.com/sirupsen/logrus"
)

type NavigateAction struct {
	page *rod.Page
}

func NewNavigate(page *rod.Page) *NavigateAction {
	return &NavigateAction{page: page}
}

func (n *NavigateAction) ToExplorePage(ctx context.Context) error {
	page := n.page.Context(ctx).Timeout(60 * time.Second)

	// 🔧 FIX: 导航到探索页 - 使用安全方法
	logrus.Info("🌐 [Navigate] Navigating to explore page")
	if err := page.Navigate("https://www.xiaohongshu.com/explore"); err != nil {
		logrus.Errorf("❌ [Navigate] Navigate to explore page failed: %v", err)
		return fmt.Errorf("navigate to explore page failed: %w", err)
	}

	if err := page.WaitLoad(); err != nil {
		logrus.Errorf("❌ [Navigate] WaitLoad failed: %v", err)
		return fmt.Errorf("wait load failed: %w", err)
	}

	_, err := page.Timeout(10 * time.Second).Element(`div#app`)
	if err != nil {
		logrus.Errorf("❌ [Navigate] Find app element failed: %v", err)
		return fmt.Errorf("find app element failed: %w", err)
	}

	return nil
}

func (n *NavigateAction) ToProfilePage(ctx context.Context) error {
	page := n.page.Context(ctx).Timeout(60 * time.Second)

	// First navigate to explore page
	if err := n.ToExplorePage(ctx); err != nil {
		return err
	}

	// 🔧 FIX: 等待页面稳定 - 使用安全方法
	if err := page.WaitStable(10 * time.Second); err != nil {
		logrus.Warnf("⚠️  [Navigate] WaitStable failed: %v", err)
	}

	// Find and click the "我" channel link in sidebar
	// 🔧 FIX: 查找并点击个人资料链接 - 使用安全方法
	profileLink, err := page.Timeout(10 * time.Second).Element(`div.main-container li.user.side-bar-component a.link-wrapper span.channel`)
	if err != nil {
		logrus.Errorf("❌ [Navigate] Find profile link failed: %v", err)
		return fmt.Errorf("find profile link failed: %w", err)
	}

	if err := profileLink.Click(proto.InputMouseButtonLeft, 1); err != nil {
		logrus.Errorf("❌ [Navigate] Click profile link failed: %v", err)
		return fmt.Errorf("click profile link failed: %w", err)
	}

	// Wait for navigation to complete
	if err := page.WaitLoad(); err != nil {
		logrus.Errorf("❌ [Navigate] WaitLoad after profile click failed: %v", err)
		return fmt.Errorf("wait load after profile click failed: %w", err)
	}

	logrus.Info("✅ [Navigate] Successfully navigated to profile page")
	return nil
}
