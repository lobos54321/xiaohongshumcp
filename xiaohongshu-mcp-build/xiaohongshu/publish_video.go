package xiaohongshu

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/proto"
	"github.com/pkg/errors"
	"github.com/sirupsen/logrus"
)

// PublishVideoContent 发布视频内容
type PublishVideoContent struct {
	Title     string
	Content   string
	Tags      []string
	VideoPath string
}

// NewPublishVideoAction 进入发布页并切换到"上传视频"
func NewPublishVideoAction(page *rod.Page) (*PublishAction, error) {
	pp := page.Timeout(300 * time.Second)

	// 🔧 FIX: 导航到发布页 - 使用安全方法
	logrus.Info("🌐 [PublishVideo] Navigating to publish page")
	if err := pp.Navigate(urlOfPublic); err != nil {
		logrus.Errorf("❌ [PublishVideo] Navigate failed: %v", err)
		return nil, fmt.Errorf("navigate to publish page failed: %w", err)
	}

	if err := pp.WaitIdle(30 * time.Second); err != nil {
		logrus.Warnf("⚠️  [PublishVideo] WaitIdle failed: %v", err)
	}

	if err := pp.WaitDOMStable(30*time.Second, 0.1); err != nil {
		logrus.Warnf("⚠️  [PublishVideo] WaitDOMStable failed: %v", err)
	}

	time.Sleep(1 * time.Second)

	if err := mustClickPublishTab(page, "上传视频"); err != nil {
		return nil, errors.Wrap(err, "切换到上传视频失败")
	}

	time.Sleep(1 * time.Second)

	return &PublishAction{page: pp}, nil
}

// PublishVideo 上传视频并提交
func (p *PublishAction) PublishVideo(ctx context.Context, content PublishVideoContent) error {
	if content.VideoPath == "" {
		return errors.New("视频不能为空")
	}

	page := p.page.Context(ctx)

	if err := uploadVideo(page, content.VideoPath); err != nil {
		return errors.Wrap(err, "小红书上传视频失败")
	}

	if err := submitPublishVideo(page, content.Title, content.Content, content.Tags); err != nil {
		return errors.Wrap(err, "小红书发布失败")
	}
	return nil
}

// uploadVideo 上传单个本地视频
func uploadVideo(page *rod.Page, videoPath string) error {
	pp := page.Timeout(5 * time.Minute) // 视频处理耗时更长

	if _, err := os.Stat(videoPath); os.IsNotExist(err) {
		return errors.Wrapf(err, "视频文件不存在: %s", videoPath)
	}

	// 寻找文件上传输入框（与图文一致的 class，或退回到 input[type=file]）
	var fileInput *rod.Element
	var err error
	fileInput, err = pp.Element(".upload-input")
	if err != nil || fileInput == nil {
		fileInput, err = pp.Element("input[type='file']")
		if err != nil || fileInput == nil {
			return errors.New("未找到视频上传输入框")
		}
	}

	// 🔧 FIX: 设置文件 - 使用安全方法
	if err := fileInput.SetFiles([]string{videoPath}); err != nil {
		logrus.Errorf("❌ [PublishVideo] SetFiles failed: %v", err)
		return fmt.Errorf("set video file failed: %w", err)
	}
	logrus.Info("✅ [PublishVideo] Video file set successfully")

	// 对于视频，等待发布按钮变为可点击即表示处理完成
	btn, err := waitForPublishButtonClickable(pp)
	if err != nil {
		return err
	}
	slog.Info("视频上传/处理完成，发布按钮可点击", "btn", btn)
	return nil
}

// waitForPublishButtonClickable 等待发布按钮可点击
func waitForPublishButtonClickable(page *rod.Page) (*rod.Element, error) {
	maxWait := 10 * time.Minute
	interval := 1 * time.Second
	start := time.Now()
	selector := "button.publishBtn"

	slog.Info("开始等待发布按钮可点击(视频)")

	for time.Since(start) < maxWait {
		btn, err := page.Element(selector)
		if err == nil && btn != nil {
			// 可见性
			vis, verr := btn.Visible()
			if verr == nil && vis {
				// 检查 disabled 属性
				if disabled, _ := btn.Attribute("disabled"); disabled == nil {
					// 再通过 class 名粗略判断不在禁用态
					if cls, _ := btn.Attribute("class"); cls != nil && !strings.Contains(*cls, "disabled") {
						return btn, nil
					}
					// 即使 class 包含 disabled，只要没有 disabled 属性，也尝试点击一次以确认
					return btn, nil
				}
			}
		}
		time.Sleep(interval)
	}
	return nil, errors.New("等待发布按钮可点击超时")
}

// submitPublishVideo 填写标题、正文、标签并点击发布（等待按钮可点击后再提交）
func submitPublishVideo(page *rod.Page, title, content string, tags []string) error {
	// 🔧 FIX: 查找标题输入框 - 使用安全方法
	titleElem, err := page.Timeout(10 * time.Second).Element("div.d-input input")
	if err != nil {
		logrus.Errorf("❌ [PublishVideo] Find title element failed: %v", err)
		return fmt.Errorf("find title element failed: %w", err)
	}

	if err := titleElem.Input(title); err != nil {
		logrus.Errorf("❌ [PublishVideo] Input title failed: %v", err)
		return fmt.Errorf("input title failed: %w", err)
	}
	time.Sleep(1 * time.Second)

	// 正文 + 标签
	// 🔧 FIX: 输入内容 - 使用安全方法
	if contentElem, ok := getContentElement(page); ok {
		if err := contentElem.Input(content); err != nil {
			logrus.Errorf("❌ [PublishVideo] Input content failed: %v", err)
			return fmt.Errorf("input content failed: %w", err)
		}
		inputTags(contentElem, tags)
	} else {
		return errors.New("没有找到内容输入框")
	}

	time.Sleep(1 * time.Second)

	// 等待发布按钮可点击
	btn, err := waitForPublishButtonClickable(page)
	if err != nil {
		return err
	}

	// 点击发布
	if err := btn.Click(proto.InputMouseButtonLeft, 1); err != nil {
		return errors.Wrap(err, "点击发布按钮失败")
	}

	time.Sleep(3 * time.Second)
	return nil
}
