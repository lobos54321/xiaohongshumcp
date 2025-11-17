package xiaohongshu

import (
	"context"
	"time"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/proto"
	"github.com/pkg/errors"
	"github.com/sirupsen/logrus"
)

// CommentFeedAction 表示 Feed 评论动作
type CommentFeedAction struct {
	page *rod.Page
}

// NewCommentFeedAction 创建 Feed 评论动作
func NewCommentFeedAction(page *rod.Page) *CommentFeedAction {
	return &CommentFeedAction{page: page}
}

// PostComment 发表评论到 Feed
func (f *CommentFeedAction) PostComment(ctx context.Context, feedID, xsecToken, content string) error {
	page := f.page.Context(ctx).Timeout(60 * time.Second)

	// 构建详情页 URL
	url := makeFeedDetailURL(feedID, xsecToken)

	logrus.Infof("🌐 [Comment] Opening feed detail page: %s", url)

	// 🔧 FIX: 导航到详情页 - 使用安全方法
	if err := page.Navigate(url); err != nil {
		logrus.Errorf("❌ [Comment] Navigate failed: %v", err)
		return errors.Wrap(err, "navigate to feed detail failed")
	}

	if err := page.WaitDOMStable(30*time.Second, 0.1); err != nil {
		logrus.Warnf("⚠️  [Comment] WaitDOMStable failed: %v", err)
	}

	time.Sleep(1 * time.Second)

	// 🔧 FIX: 查找评论输入框 - 使用安全方法
	elem, err := page.Timeout(10 * time.Second).Element("div.input-box div.content-edit span")
	if err != nil {
		logrus.Errorf("❌ [Comment] Find input box failed: %v", err)
		return errors.Wrap(err, "find comment input box failed")
	}

	if err := elem.Click(proto.InputMouseButtonLeft, 1); err != nil {
		logrus.Errorf("❌ [Comment] Click input box failed: %v", err)
		return errors.Wrap(err, "click comment input box failed")
	}

	// 🔧 FIX: 查找内容输入框 - 使用安全方法
	elem2, err := page.Timeout(10 * time.Second).Element("div.input-box div.content-edit p.content-input")
	if err != nil {
		logrus.Errorf("❌ [Comment] Find content input failed: %v", err)
		return errors.Wrap(err, "find content input failed")
	}

	if err := elem2.Input(content); err != nil {
		logrus.Errorf("❌ [Comment] Input content failed: %v", err)
		return errors.Wrap(err, "input comment content failed")
	}

	time.Sleep(1 * time.Second)

	// 🔧 FIX: 查找提交按钮 - 使用安全方法
	submitButton, err := page.Timeout(10 * time.Second).Element("div.bottom button.submit")
	if err != nil {
		logrus.Errorf("❌ [Comment] Find submit button failed: %v", err)
		return errors.Wrap(err, "find submit button failed")
	}

	if err := submitButton.Click(proto.InputMouseButtonLeft, 1); err != nil {
		logrus.Errorf("❌ [Comment] Click submit button failed: %v", err)
		return errors.Wrap(err, "click submit button failed")
	}

	time.Sleep(1 * time.Second)
	logrus.Infof("✅ [Comment] Comment posted successfully")

	return nil
}
