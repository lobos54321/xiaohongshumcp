# 前端验证界面集成方案

## 🎯 问题分析

### 当前架构问题

**前端 (prome-platform)**：
- 只显示二维码图片（通过base64或URL）
- 用户扫码后看不到验证页面
- 无法完成滑块/拼图验证

**后端 (xiaohongshu-mcp)**：
- Headless Chrome显示验证页面
- 但用户看不到
- WaitForLogin一直等待超时

### 核心矛盾

```
验证页面在后端浏览器 ≠ 用户看不到 ≠ 无法操作 ≠ 登录失败
```

## 💡 解决方案对比

### 方案A：实时截图流式传输（推荐，完整体验）

**架构**：
```
后端                          前端
┌─────────────────┐          ┌──────────────────┐
│ Headless Chrome │          │                  │
│                 │          │                  │
│ 1. 显示二维码   │ ─截图──→ │ 显示二维码       │
│ 2. 等待扫码...  │          │ 用户扫码 ✅      │
│ 3. 出现验证页面 │ ─截图──→ │ 显示验证界面 ✅  │
│                 │ ←坐标─── │ 用户拖动滑块 ✅  │
│ 4. 应用操作     │          │                  │
│ 5. 登录成功     │ ─通知──→ │ 完成登录 ✅      │
└─────────────────┘          └──────────────────┘
```

**实现步骤**：

#### 1. 后端：添加截图和事件转发接口

```go
// service.go - 新增API

// GetLoginScreenshot - 获取登录页面实时截图
func (s *XiaohongshuService) GetLoginScreenshot(ctx context.Context) (*ScreenshotResponse, error) {
    if s.loginPage == nil {
        return nil, errors.New("login page not initialized")
    }

    // 截取完整页面
    screenshot, err := s.loginPage.Screenshot(false, &proto.PageCaptureScreenshot{
        Format: proto.PageCaptureScreenshotFormatPng,
        Quality: 90,
    })
    if err != nil {
        return nil, errors.Wrap(err, "screenshot failed")
    }

    // 获取当前URL判断状态
    pageInfo, _ := s.loginPage.Info()

    return &ScreenshotResponse{
        Image: base64.StdEncoding.EncodeToString(screenshot),
        URL:   pageInfo.URL,
        State: s.detectPageState(pageInfo.URL),
    }, nil
}

// ForwardMouseEvent - 转发前端鼠标事件到浏览器
func (s *XiaohongshuService) ForwardMouseEvent(ctx context.Context, event *MouseEvent) error {
    if s.loginPage == nil {
        return errors.New("login page not initialized")
    }

    // 将前端坐标转换为浏览器坐标
    mouse := s.loginPage.Mouse

    switch event.Type {
    case "mousedown":
        mouse.Move(event.X, event.Y, 1)
        mouse.Down("left", 1)
    case "mousemove":
        mouse.Move(event.X, event.Y, 1)
    case "mouseup":
        mouse.Up("left", 1)
    case "click":
        mouse.Click("left", 1)
    }

    return nil
}

func (s *XiaohongshuService) detectPageState(url string) string {
    if strings.Contains(url, "/login") && !strings.Contains(url, "/captcha") {
        return "qrcode" // 二维码页面
    }
    if strings.Contains(url, "/captcha") || strings.Contains(url, "/verify") {
        return "verification" // 验证页面
    }
    if strings.Contains(url, "/explore") || strings.Contains(url, "/creator") {
        return "success" // 登录成功
    }
    return "unknown"
}
```

#### 2. 后端：WebSocket实时推送

```go
// websocket.go - 新增WebSocket支持

type LoginWebSocketHandler struct {
    service *XiaohongshuService
}

func (h *LoginWebSocketHandler) HandleLoginStream(w http.ResponseWriter, r *http.Request) {
    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        return
    }
    defer conn.Close()

    ctx := r.Context()
    ticker := time.NewTicker(500 * time.Millisecond) // 每500ms推送一次截图
    defer ticker.Stop()

    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            // 获取实时截图
            screenshot, err := h.service.GetLoginScreenshot(ctx)
            if err != nil {
                continue
            }

            // 推送到前端
            if err := conn.WriteJSON(screenshot); err != nil {
                return
            }

            // 如果登录成功，关闭连接
            if screenshot.State == "success" {
                return
            }
        }
    }
}

// 接收前端鼠标事件
func (h *LoginWebSocketHandler) ReceiveMouseEvents(conn *websocket.Conn) {
    for {
        var event MouseEvent
        if err := conn.ReadJSON(&event); err != nil {
            return
        }

        h.service.ForwardMouseEvent(context.Background(), &event)
    }
}
```

#### 3. 前端：实时显示和交互

```typescript
// LoginPage.tsx (prome-platform)

function LoginPage() {
  const [screenshot, setScreenshot] = useState<string>('');
  const [pageState, setPageState] = useState<'qrcode' | 'verification' | 'success'>('qrcode');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // 建立WebSocket连接
    const ws = new WebSocket('ws://backend/login/stream');
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setScreenshot(data.image); // base64图片
      setPageState(data.state);
    };

    return () => ws.close();
  }, []);

  // 转发鼠标事件到后端
  const handleMouseEvent = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    wsRef.current?.send(JSON.stringify({
      type: e.type, // mousedown, mousemove, mouseup
      x: x,
      y: y,
    }));
  };

  return (
    <div>
      <h2>
        {pageState === 'qrcode' && '请扫描二维码登录'}
        {pageState === 'verification' && '⚠️ 请完成滑块验证'}
        {pageState === 'success' && '✅ 登录成功！'}
      </h2>

      <canvas
        ref={canvasRef}
        style={{ border: '1px solid #ccc', cursor: 'pointer' }}
        onMouseDown={handleMouseEvent}
        onMouseMove={handleMouseEvent}
        onMouseUp={handleMouseEvent}
      >
        <img src={`data:image/png;base64,${screenshot}`} alt="Login" />
      </canvas>
    </div>
  );
}
```

**优点**：
- ✅ 用户体验完整（看得到验证界面，能操作）
- ✅ 支持所有验证类型（滑块、拼图、点选等）
- ✅ 实时反馈

**缺点**：
- ⚠️ 开发复杂度高
- ⚠️ 需要WebSocket支持
- ⚠️ 带宽消耗（实时传输截图）

---

### 方案B：切换到非Headless模式（最简单，推荐先实施）

**原理**：让后端Chrome以可视化模式运行，用户直接操作浏览器窗口

**实现**：

```go
// service.go

func (s *XiaohongshuService) GetLoginQrcode(ctx context.Context) (*LoginQrcodeResponse, error) {
    // 🔥 关键：使用非Headless模式，让用户直接看到浏览器
    b := browser.NewBrowser(
        false, // headless=false，显示浏览器窗口 ✅
        browser.WithBinPath(configs.GetBinPath()),
        browser.WithSkipCookies(true),
    )
    defer b.Close()

    page := b.NewPage()
    loginAction := xiaohongshu.NewLogin(page)

    // 获取二维码
    qrcodeSrc, alreadyLoggedIn, err := loginAction.FetchQrcodeImage(ctx)
    if err != nil {
        return nil, err
    }

    if alreadyLoggedIn {
        return &LoginQrcodeResponse{
            AlreadyLoggedIn: true,
        }, nil
    }

    // 🔥 前端仍然显示二维码图片
    // 但浏览器窗口也在后台打开，用户可以在窗口中操作验证

    // 保存page引用供后续WaitForLogin使用
    s.loginPage = page
    s.loginBrowser = b

    return &LoginQrcodeResponse{
        QrcodeImage: qrcodeSrc,
        Message:     "请扫描二维码，如遇验证请在弹出的浏览器窗口中完成",
    }, nil
}
```

**前端提示**：
```typescript
// LoginPage.tsx

<div>
  <h2>请扫描二维码登录</h2>
  <img src={qrcodeImage} alt="QR Code" />
  <p style={{ color: 'orange', marginTop: '10px' }}>
    💡 提示：如果扫码后需要验证，请在后台弹出的浏览器窗口中完成滑块/拼图验证
  </p>
</div>
```

**优点**：
- ✅ 实现极其简单（只需改一个参数）
- ✅ 支持所有验证类型
- ✅ 用户可以直接操作真实浏览器

**缺点**：
- ⚠️ 需要服务器有图形界面（本地开发OK，生产环境需要X11或VNC）
- ⚠️ 用户需要找到浏览器窗口

---

### 方案C：自动化验证突破（风险高，不推荐）

使用验证码识别服务（如打码平台）自动完成验证

**缺点**：
- ❌ 违反小红书ToS
- ❌ 容易被检测封号
- ❌ 成本高

---

## 🚀 推荐实施路径

### 阶段1：快速方案（1小时）- 方案B

1. 修改 `configs.IsHeadless()` 返回 `false`
2. 前端添加提示："如遇验证请在浏览器窗口完成"
3. 本地测试验证流程

### 阶段2：完整方案（1-2天）- 方案A

1. 实现截图API和WebSocket推送
2. 前端实现Canvas交互
3. 测试各种验证类型

### 阶段3：生产优化（按需）

1. 服务器配置VNC/X11
2. 或者部署方案A的完整实现

## 📋 配置修改清单

### 方案B快速实施

**1. 修改配置（如果有配置文件）**：
```yaml
# configs/config.yaml
browser:
  headless: false  # 改为false，显示浏览器窗口
```

**2. 或者修改代码**：
```go
// service.go:115
b := browser.NewBrowser(
    false, // 强制非Headless
    browser.WithBinPath(configs.GetBinPath()),
    browser.WithSkipCookies(true),
)
```

**3. 前端提示**：
```typescript
const message = `
请扫描二维码登录

💡 提示：
1. 扫码后如果需要验证（滑块/拼图）
2. 请在后台弹出的浏览器窗口中完成
3. 完成后前端会自动检测到登录成功
`;
```

## 🎯 Zeabur部署考虑

### 问题：Zeabur没有图形界面

Zeabur容器默认没有X11，方案B无法直接使用

### 解决：

**选项1**：使用虚拟显示（Xvfb）
```dockerfile
# Dockerfile
RUN apt-get install -y xvfb

# 启动时
Xvfb :99 -screen 0 1280x1024x24 &
export DISPLAY=:99
```

**选项2**：部署VNC服务
```dockerfile
RUN apt-get install -y x11vnc
# 用户可以通过VNC客户端连接查看浏览器
```

**选项3**（推荐）：实施方案A
- 通过截图流传输，不需要图形界面
- 适合云端部署

## 🔄 迁移路径

```
当前状态
  → 本地测试：方案B（显示浏览器）
  → 验证流程可行
  → 生产环境：实施方案A（截图流）
  → 或配置Xvfb/VNC
```

## 📝 总结

**立即实施**：方案B（非Headless）
- 修改一行配置
- 前端加提示
- 本地完整测试

**长期规划**：方案A（截图流）
- 适合生产环境
- 用户体验最佳
- 需要开发时间

选择哪个方案取决于：
1. 开发时间预算
2. 生产环境限制
3. 用户体验要求
