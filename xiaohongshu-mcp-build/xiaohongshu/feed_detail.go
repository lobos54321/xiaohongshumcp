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

// FeedDetailAction 表示 Feed 详情页动作
type FeedDetailAction struct {
	page *rod.Page
}

// NewFeedDetailAction 创建 Feed 详情页动作
func NewFeedDetailAction(page *rod.Page) *FeedDetailAction {
	return &FeedDetailAction{page: page}
}

// GetFeedDetail 获取 Feed 详情页数据
func (f *FeedDetailAction) GetFeedDetail(ctx context.Context, feedID, xsecToken string) (*FeedDetailResponse, error) {
	page := f.page.Context(ctx).Timeout(60 * time.Second)

	// 构建详情页 URL
	url := makeFeedDetailURL(feedID, xsecToken)

	logrus.Infof("🌐 [FeedDetail] 打开 feed 详情页: %s", url)

	// 🔧 FIX: 导航到详情页 - 使用安全方法
	if err := page.Navigate(url); err != nil {
		logrus.Errorf("❌ [FeedDetail] Navigate failed: %v", err)
		return nil, fmt.Errorf("navigate to feed detail failed: %w", err)
	}

	if err := page.WaitDOMStable(30*time.Second, 0.1); err != nil {
		logrus.Warnf("⚠️  [FeedDetail] WaitDOMStable failed: %v", err)
	}
	time.Sleep(1 * time.Second)

	// 🔧 FIX: 执行JS获取数据 - 使用安全方法
	evalResult, err := page.Eval(`() => {
		if (window.__INITIAL_STATE__ &&
		    window.__INITIAL_STATE__.note &&
		    window.__INITIAL_STATE__.note.noteDetailMap) {
			const noteDetailMap = window.__INITIAL_STATE__.note.noteDetailMap;
			return JSON.stringify(noteDetailMap);
		}
		return "";
	}`)
	if err != nil {
		logrus.Errorf("❌ [FeedDetail] Eval failed: %v", err)
		return nil, fmt.Errorf("eval noteDetailMap failed: %w", err)
	}

	result := evalResult.Value.String()

	if result == "" {
		return nil, errors.ErrNoFeedDetail
	}

	var noteDetailMap map[string]struct {
		Note     FeedDetail  `json:"note"`
		Comments CommentList `json:"comments"`
	}

	if err := json.Unmarshal([]byte(result), &noteDetailMap); err != nil {
		return nil, fmt.Errorf("failed to unmarshal noteDetailMap: %w", err)
	}

	noteDetail, exists := noteDetailMap[feedID]
	if !exists {
		return nil, fmt.Errorf("feed %s not found in noteDetailMap", feedID)
	}

	return &FeedDetailResponse{
		Note:     noteDetail.Note,
		Comments: noteDetail.Comments,
	}, nil
}

func makeFeedDetailURL(feedID, xsecToken string) string {
	return fmt.Sprintf("https://www.xiaohongshu.com/explore/%s?xsec_token=%s&xsec_source=pc_feed", feedID, xsecToken)
}
