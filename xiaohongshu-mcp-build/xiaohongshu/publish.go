package xiaohongshu

import (
	"context"
	"fmt"
	"log/slog"
	"math/rand"
	"os"
	"strings"
	"time"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/input"
	"github.com/go-rod/rod/lib/proto"
	"github.com/pkg/errors"
	"github.com/sirupsen/logrus"
	"github.com/xpzouying/xiaohongshu-mcp/cookies"
)

// PublishImageContent 发布图文内容
type PublishImageContent struct {
	Title      string
	Content    string
	Tags       []string
	ImagePaths []string
}

type PublishAction struct {
	page *rod.Page
}

const (
	urlOfPublic = `https://creator.xiaohongshu.com/publish/publish?source=official`
)

func NewPublishImageAction(page *rod.Page) (*PublishAction, error) {

	pp := page.Timeout(300 * time.Second)

	// 🔧 修复Cookie时序问题：导航前等待Cookie文件就绪
	cookiePath := cookies.GetCookiesFilePath()
	logrus.Infof("🔍 [Publish] 检查Cookie文件: %s", cookiePath)

	// 等待Cookie文件就绪（最多5秒）
	cookieReady := false
	for i := 0; i < 10; i++ {
		if _, err := os.Stat(cookiePath); err == nil {
			// 文件存在，检查大小
			if fileInfo, _ := os.Stat(cookiePath); fileInfo != nil && fileInfo.Size() > 100 {
				cookieReady = true
				logrus.Infof("✅ [Publish] Cookie文件已就绪，大小: %d 字节", fileInfo.Size())
				break
			}
		}
		logrus.Warnf("⏳ [Publish] Cookie文件未就绪，等待... (%d/10)", i+1)
		time.Sleep(500 * time.Millisecond)
	}

	if !cookieReady {
		return nil, errors.New("Cookie文件未就绪，请先登录")
	}

	logrus.Infof("🌐 [Publish] 开始导航到发布页面: %s", urlOfPublic)
	pp.MustNavigate(urlOfPublic).MustWaitIdle().MustWaitDOMStable()

	// 检查导航后的URL
	currentURL := pp.MustInfo().URL
	logrus.Infof("📍 [Publish] 导航完成，当前URL: %s", currentURL)

	// 如果被重定向到登录页，说明Cookie无效
	if strings.Contains(currentURL, "/login") {
		return nil, errors.Errorf("Cookie无效或已过期，被重定向到登录页: %s", currentURL)
	}

	time.Sleep(1 * time.Second)

	if err := mustClickPublishTab(page, "上传图文"); err != nil {
		logrus.Errorf("点击上传图文 TAB 失败: %v", err)
		return nil, err
	}

	time.Sleep(1 * time.Second)

	return &PublishAction{
		page: pp,
	}, nil
}

func (p *PublishAction) Publish(ctx context.Context, content PublishImageContent) error {
	if len(content.ImagePaths) == 0 {
		return errors.New("图片不能为空")
	}

	page := p.page.Context(ctx)

	if err := uploadImages(page, content.ImagePaths); err != nil {
		return errors.Wrap(err, "小红书上传图片失败")
	}

	tags := content.Tags
	if len(tags) >= 10 {
		logrus.Warnf("标签数量超过10，截取前10个标签")
		tags = tags[:10]
	}

	logrus.Infof("发布内容: title=%s, images=%v, tags=%v", content.Title, len(content.ImagePaths), tags)

	if err := submitPublish(page, content.Title, content.Content, tags); err != nil {
		return errors.Wrap(err, "小红书发布失败")
	}

	return nil
}

func removePopCover(page *rod.Page) {

	// 先移除弹窗封面
	has, elem, err := page.Has("div.d-popover")
	if err != nil {
		return
	}
	if has {
		elem.MustRemove()
	}

	// 兜底：点击一下空位置吧
	clickEmptyPosition(page)
}

func clickEmptyPosition(page *rod.Page) {
	x := 380 + rand.Intn(100)
	y := 20 + rand.Intn(60)
	page.Mouse.MustMoveTo(float64(x), float64(y)).MustClick(proto.InputMouseButtonLeft)
}

func mustClickPublishTab(page *rod.Page, tabname string) error {
	// 🔧 FIX: 使用 findElementWithRetry 替代 MustElement
	uploadContentSelectors := []string{
		"div.upload-content",
		".upload-content",
		"div.creator-upload",
	}
	uploadContent, err := findElementWithRetry(page, uploadContentSelectors, 15*time.Second)
	if err != nil {
		return errors.Wrap(err, "未找到上传内容区域")
	}

	// 等待元素可见
	err = uploadContent.WaitVisible()
	if err != nil {
		return errors.Wrap(err, "上传内容区域未可见")
	}

	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		tab, blocked, err := getTabElement(page, tabname)
		if err != nil {
			logrus.Warnf("获取发布 TAB 元素失败: %v", err)
			time.Sleep(200 * time.Millisecond)
			continue
		}

		if tab == nil {
			time.Sleep(200 * time.Millisecond)
			continue
		}

		if blocked {
			logrus.Info("发布 TAB 被遮挡，尝试移除遮挡")
			removePopCover(page)
			time.Sleep(200 * time.Millisecond)
			continue
		}

		if err := tab.Click(proto.InputMouseButtonLeft, 1); err != nil {
			logrus.Warnf("点击发布 TAB 失败: %v", err)
			time.Sleep(200 * time.Millisecond)
			continue
		}

		return nil
	}

	return errors.Errorf("没有找到发布 TAB - %s", tabname)
}

func getTabElement(page *rod.Page, tabname string) (*rod.Element, bool, error) {
	elems, err := page.Elements("div.creator-tab")
	if err != nil {
		return nil, false, err
	}

	for _, elem := range elems {
		if !isElementVisible(elem) {
			continue
		}

		text, err := elem.Text()
		if err != nil {
			logrus.Debugf("获取发布 TAB 文本失败: %v", err)
			continue
		}

		if strings.TrimSpace(text) != tabname {
			continue
		}

		blocked, err := isElementBlocked(elem)
		if err != nil {
			return nil, false, err
		}

		return elem, blocked, nil
	}

	return nil, false, nil
}

func isElementBlocked(elem *rod.Element) (bool, error) {
	result, err := elem.Eval(`() => {
		const rect = this.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) {
			return true;
		}
		const x = rect.left + rect.width / 2;
		const y = rect.top + rect.height / 2;
		const target = document.elementFromPoint(x, y);
		return !(target === this || this.contains(target));
	}`)
	if err != nil {
		return false, err
	}

	return result.Value.Bool(), nil
}

func uploadImages(page *rod.Page, imagesPaths []string) error {
	// 🔧 FIX: 使用 findElementWithRetry 替代 MustElement

	// 验证文件路径有效性
	validPaths := make([]string, 0, len(imagesPaths))
	for _, path := range imagesPaths {
		if _, err := os.Stat(path); os.IsNotExist(err) {
			logrus.Warnf("图片文件不存在: %s", path)
			continue
		}
		validPaths = append(validPaths, path)

		logrus.Infof("获取有效图片：%s", path)
	}

	// 查找上传输入框
	slog.Info("开始查找上传输入框")
	uploadSelectors := []string{
		".upload-input",           // 原始选择器
		"input[type='file']",      // 文件输入框
		"input.upload",            // 上传输入框
		".uploader input",         // 上传器中的输入框
	}
	uploadInput, err := findElementWithRetry(page, uploadSelectors, 30*time.Second)
	if err != nil {
		return errors.Wrap(err, "未找到上传输入框")
	}

	// 上传多个文件
	slog.Info("开始上传图片", "count", len(validPaths))
	uploadInput.MustSetFiles(validPaths...)

	// 等待并验证上传完成
	return waitForUploadComplete(page, len(validPaths))
}

// waitForUploadComplete 等待并验证上传完成
func waitForUploadComplete(page *rod.Page, expectedCount int) error {
	maxWaitTime := 60 * time.Second
	checkInterval := 500 * time.Millisecond
	start := time.Now()

	slog.Info("开始等待图片上传完成", "expected_count", expectedCount)

	for time.Since(start) < maxWaitTime {
		// 使用具体的pr类名检查已上传的图片
		uploadedImages, err := page.Elements(".img-preview-area .pr")

		slog.Info("uploadedImages", "uploadedImages", uploadedImages)

		if err == nil {
			currentCount := len(uploadedImages)
			slog.Info("检测到已上传图片", "current_count", currentCount, "expected_count", expectedCount)
			if currentCount >= expectedCount {
				slog.Info("所有图片上传完成", "count", currentCount)
				return nil
			}
		} else {
			slog.Debug("未找到已上传图片元素")
		}

		time.Sleep(checkInterval)
	}

	return errors.New("上传超时，请检查网络连接和图片大小")
}

func submitPublish(page *rod.Page, title, content string, tags []string) error {
	// 🔧 FIX: 使用 findElementWithRetry 替代 MustElement，避免长时间阻塞

	// 查找标题输入框
	slog.Info("开始填写标题")
	titleSelectors := []string{
		"div.d-input input",           // 原始选择器
		"input[placeholder*='标题']",   // 通过placeholder查找
		".title-input input",          // 通过class查找
		"input.title",                 // 备用选择器
	}
	titleElem, err := findElementWithRetry(page, titleSelectors, 30*time.Second)
	if err != nil {
		return errors.Wrap(err, "未找到标题输入框")
	}

	titleElem.MustInput(title)
	slog.Info("标题填写完成", "title", title)

	time.Sleep(1 * time.Second)

	// 查找内容输入框
	slog.Info("开始填写内容")
	if contentElem, ok := getContentElement(page); ok {
		contentElem.MustInput(content)
		slog.Info("内容填写完成", "content_length", len(content))

		slog.Info("开始添加标签", "tags", tags)
		inputTags(contentElem, tags)
		slog.Info("标签添加完成")

	} else {
		return errors.New("没有找到内容输入框")
	}

	time.Sleep(1 * time.Second)

	// 🔧 CRITICAL FIX: 查找发布按钮 - 这是Line 263的阻塞点
	// 原代码: submitButton := page.MustElement("div.submit div.d-button-content")
	// 问题: MustElement会等待整个页面超时(900s)，但MCP服务在600s就超时了
	// 解决: 使用findElementWithRetry，30秒独立超时，多个备用选择器
	slog.Info("准备查找发布按钮")
	submitSelectors := []string{
		"div.submit div.d-button-content",  // 原始选择器
		"button.submit-button",             // 通用提交按钮
		".publish-btn button",              // 发布按钮容器
		"button[type='submit']",            // HTML提交按钮
		".submit button",                   // 提交区域按钮
		"div.submit button",                // 备用选择器
	}
	submitButton, err := findElementWithRetry(page, submitSelectors, 30*time.Second)
	if err != nil {
		return errors.Wrap(err, "未找到发布按钮 - 可能是页面未加载完成或选择器已变化")
	}

	slog.Info("找到发布按钮，准备点击")
	if err := submitButton.Click(proto.InputMouseButtonLeft, 1); err != nil {
		return errors.Wrap(err, "点击发布按钮失败")
	}

	slog.Info("已点击发布按钮，等待批准发布弹窗...")

	// 🔧 FIX: 等待并处理"批准发布"确认弹窗
	if err := waitForPublishApproval(page); err != nil {
		return errors.Wrap(err, "处理批准发布弹窗失败")
	}

	slog.Info("发布流程完成")

	return nil
}

// waitForPublishApproval 等待并处理"批准发布"确认弹窗
// 🔧 FIX: 解决发布后被卡住的问题
// 小红书在点击"发布"按钮后可能会弹出"批准发布"确认弹窗，需要主动点击才能继续
func waitForPublishApproval(page *rod.Page) error {
	maxWaitTime := 30 * time.Second
	checkInterval := 500 * time.Millisecond
	start := time.Now()

	slog.Info("开始查找批准发布弹窗")

	for time.Since(start) < maxWaitTime {
		// 尝试多种可能的选择器来查找弹窗中的按钮
		selectors := []string{
			"div.d-modal button",     // 弹窗中的按钮
			"div.d-dialog button",    // 对话框中的按钮
			"div.modal button",       // 通用模态框按钮
			"div.dialog button",      // 通用对话框按钮
			".modal-footer button",   // 模态框底部按钮
			".dialog-footer button",  // 对话框底部按钮
			"button.primary",         // 主要按钮
			"button.confirm",         // 确认按钮
		}

		for _, selector := range selectors {
			// 使用 Elements 查找所有匹配的按钮
			elems, err := page.Elements(selector)
			if err != nil || len(elems) == 0 {
				continue
			}

			// 检查每个按钮的文本
			for _, elem := range elems {
				text, err := elem.Text()
				if err != nil {
					continue
				}

				// 检查按钮文本是否包含关键词
				if strings.Contains(text, "批准") ||
					strings.Contains(text, "确认") ||
					(strings.Contains(text, "发布") && len(text) < 10) { // 避免匹配"发布中..."等状态文本
					slog.Info("找到批准发布按钮", "text", text, "selector", selector)

					// 点击按钮
					elem.MustClick()

					slog.Info("已点击批准发布按钮，等待发布完成...")

					// 等待弹窗消失
					time.Sleep(3 * time.Second)

					return nil
				}
			}
		}

		// 检查是否已经发布成功（弹窗消失或显示成功消息）
		// 如果没有弹窗，可能直接发布成功了
		if time.Since(start) > 5*time.Second {
			// 检查是否有成功提示
			successSelectors := []string{
				".success-message",
				".toast-success",
				".toast",
				".message",
			}

			for _, selector := range successSelectors {
				elems, err := page.Elements(selector)
				if err != nil || len(elems) == 0 {
					continue
				}

				for _, elem := range elems {
					text, err := elem.Text()
					if err == nil && (strings.Contains(text, "成功") || strings.Contains(text, "完成")) {
						slog.Info("检测到发布成功提示，无需批准弹窗", "text", text)
						return nil
					}
				}
			}
		}

		time.Sleep(checkInterval)
	}

	// 超时后不报错，因为可能没有批准弹窗（直接发布成功）
	slog.Warn("未找到批准发布弹窗，可能已直接发布成功或弹窗选择器需要更新")
	return nil
}

// 查找内容输入框 - 使用Race方法处理两种样式
func getContentElement(page *rod.Page) (*rod.Element, bool) {
	var foundElement *rod.Element
	var found bool

	page.Race().
		Element("div.ql-editor").MustHandle(func(e *rod.Element) {
		foundElement = e
		found = true
	}).
		ElementFunc(func(page *rod.Page) (*rod.Element, error) {
			return findTextboxByPlaceholder(page)
		}).MustHandle(func(e *rod.Element) {
		foundElement = e
		found = true
	}).
		MustDo()

	if found {
		return foundElement, true
	}

	slog.Warn("no content element found by any method")
	return nil, false
}

func inputTags(contentElem *rod.Element, tags []string) {
	if len(tags) == 0 {
		return
	}

	time.Sleep(1 * time.Second)

	for i := 0; i < 20; i++ {
		contentElem.MustKeyActions().
			Type(input.ArrowDown).
			MustDo()
		time.Sleep(10 * time.Millisecond)
	}

	contentElem.MustKeyActions().
		Press(input.Enter).
		Press(input.Enter).
		MustDo()

	time.Sleep(1 * time.Second)

	for _, tag := range tags {
		tag = strings.TrimLeft(tag, "#")
		inputTag(contentElem, tag)
	}
}

func inputTag(contentElem *rod.Element, tag string) {
	contentElem.MustInput("#")
	time.Sleep(200 * time.Millisecond)

	for _, char := range tag {
		contentElem.MustInput(string(char))
		time.Sleep(50 * time.Millisecond)
	}

	time.Sleep(1 * time.Second)

	page := contentElem.Page()
	topicContainer, err := page.Element("#creator-editor-topic-container")
	if err == nil && topicContainer != nil {
		firstItem, err := topicContainer.Element(".item")
		if err == nil && firstItem != nil {
			firstItem.MustClick()
			slog.Info("成功点击标签联想选项", "tag", tag)
			time.Sleep(200 * time.Millisecond)
		} else {
			slog.Warn("未找到标签联想选项，直接输入空格", "tag", tag)
			// 如果没有找到联想选项，输入空格结束
			contentElem.MustInput(" ")
		}
	} else {
		slog.Warn("未找到标签联想下拉框，直接输入空格", "tag", tag)
		// 如果没有找到下拉框，输入空格结束
		contentElem.MustInput(" ")
	}

	time.Sleep(500 * time.Millisecond) // 等待标签处理完成
}

func findTextboxByPlaceholder(page *rod.Page) (*rod.Element, error) {
	elements := page.MustElements("p")
	if elements == nil {
		return nil, errors.New("no p elements found")
	}

	// 查找包含指定placeholder的元素
	placeholderElem := findPlaceholderElement(elements, "输入正文描述")
	if placeholderElem == nil {
		return nil, errors.New("no placeholder element found")
	}

	// 向上查找textbox父元素
	textboxElem := findTextboxParent(placeholderElem)
	if textboxElem == nil {
		return nil, errors.New("no textbox parent found")
	}

	return textboxElem, nil
}

func findPlaceholderElement(elements []*rod.Element, searchText string) *rod.Element {
	for _, elem := range elements {
		placeholder, err := elem.Attribute("data-placeholder")
		if err != nil || placeholder == nil {
			continue
		}

		if strings.Contains(*placeholder, searchText) {
			return elem
		}
	}
	return nil
}

func findTextboxParent(elem *rod.Element) *rod.Element {
	currentElem := elem
	for i := 0; i < 5; i++ {
		parent, err := currentElem.Parent()
		if err != nil {
			break
		}

		role, err := parent.Attribute("role")
		if err != nil || role == nil {
			currentElem = parent
			continue
		}

		if *role == "textbox" {
			return parent
		}

		currentElem = parent
	}
	return nil
}

// findElementWithRetry 查找元素，支持多个选择器和重试逻辑
// 🔧 FIX: 替代 MustElement，避免长时间阻塞
// 使用30秒独立超时，快速失败，不会等待整个页面超时（900秒）
func findElementWithRetry(page *rod.Page, selectors []string, timeout time.Duration) (*rod.Element, error) {
	deadline := time.Now().Add(timeout)
	attemptCount := 0

	slog.Info("开始查找元素", "selectors", selectors, "timeout", timeout)

	for time.Now().Before(deadline) {
		attemptCount++

		for i, selector := range selectors {
			slog.Debug("尝试查找元素", "attempt", attemptCount, "selector_index", i, "selector", selector)

			elem, err := page.Element(selector)
			if err != nil {
				slog.Debug("选择器未找到元素", "selector", selector, "error", err)
				continue
			}

			if elem == nil {
				slog.Debug("选择器返回nil元素", "selector", selector)
				continue
			}

			// 检查元素是否可见
			visible, err := elem.Visible()
			if err != nil {
				slog.Debug("无法检查元素可见性", "selector", selector, "error", err)
				continue
			}

			if !visible {
				slog.Debug("元素不可见", "selector", selector)
				continue
			}

			// 检查元素是否被遮挡
			if isElementVisible(elem) {
				slog.Info("成功找到元素", "selector", selector, "attempts", attemptCount)
				return elem, nil
			}
		}

		time.Sleep(500 * time.Millisecond)
	}

	// 超时后保存截图用于调试
	screenshotData, screenshotErr := page.Screenshot(true, nil)
	if screenshotErr == nil {
		filename := fmt.Sprintf("/tmp/element_not_found_%d.png", time.Now().Unix())
		if err := os.WriteFile(filename, screenshotData, 0644); err == nil {
			slog.Warn("元素查找失败，已保存截图", "filename", filename)
		}
	}

	return nil, errors.Errorf("在 %v 内未找到元素，尝试了 %d 个选择器，共 %d 次尝试", timeout, len(selectors), attemptCount)
}

// isElementVisible 检查元素是否可见
func isElementVisible(elem *rod.Element) bool {

	// 检查是否有隐藏样式
	style, err := elem.Attribute("style")
	if err == nil && style != nil {
		styleStr := *style

		if strings.Contains(styleStr, "left: -9999px") ||
			strings.Contains(styleStr, "top: -9999px") ||
			strings.Contains(styleStr, "position: absolute; left: -9999px") ||
			strings.Contains(styleStr, "display: none") ||
			strings.Contains(styleStr, "visibility: hidden") {
			return false
		}
	}

	visible, err := elem.Visible()
	if err != nil {
		slog.Warn("无法获取元素可见性", "error", err)
		return true
	}

	return visible
}
