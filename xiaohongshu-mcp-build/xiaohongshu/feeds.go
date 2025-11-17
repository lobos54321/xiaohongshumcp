package xiaohongshu

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/go-rod/rod"
	"github.com/sirupsen/logrus"
	"github.com/xpzouying/xiaohongshu-mcp/errors"
)

type FeedsListAction struct {
	page *rod.Page
}

func NewFeedsListAction(page *rod.Page) *FeedsListAction {
	pp := page.Timeout(60 * time.Second)

	// 🔧 FIX: 导航到首页 - 使用安全方法
	logrus.Info("🌐 [Feeds] Navigating to xiaohongshu.com")
	if err := pp.Navigate("https://www.xiaohongshu.com"); err != nil {
		logrus.Errorf("❌ [Feeds] Navigate failed: %v", err)
		// 不返回error,因为这是构造函数,继续创建对象
	}

	if err := pp.WaitDOMStable(30*time.Second, 0.1); err != nil {
		logrus.Warnf("⚠️  [Feeds] WaitDOMStable failed: %v", err)
	}

	return &FeedsListAction{page: pp}
}

// GetFeedsList 获取页面的 Feed 列表数据
func (f *FeedsListAction) GetFeedsList(ctx context.Context) ([]Feed, error) {
	page := f.page.Context(ctx)

	time.Sleep(1 * time.Second)

	// 🔧 FIX: 执行JS获取Feeds数据 - 使用安全方法
	evalResult, err := page.Eval(`() => {
		if (window.__INITIAL_STATE__ &&
		    window.__INITIAL_STATE__.feed &&
		    window.__INITIAL_STATE__.feed.feeds) {
			const feeds = window.__INITIAL_STATE__.feed.feeds;
			const feedsData = feeds.value !== undefined ? feeds.value : feeds._value;
			if (feedsData) {
				return JSON.stringify(feedsData);
			}
		}
		return "";
	}`)
	if err != nil {
		logrus.Errorf("❌ [Feeds] Eval failed: %v", err)
		return nil, fmt.Errorf("eval feeds data failed: %w", err)
	}

	result := evalResult.Value.String()

	if result == "" {
		return nil, errors.ErrNoFeeds
	}

	var feeds []Feed
	if err := json.Unmarshal([]byte(result), &feeds); err != nil {
		return nil, fmt.Errorf("failed to unmarshal feeds: %w", err)
	}

	return feeds, nil
}
