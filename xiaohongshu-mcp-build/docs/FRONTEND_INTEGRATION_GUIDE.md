# 前端集成指南：二次验证二维码

## 🎯 问题背景

小红书登录流程可能包含二次验证：
1. 用户扫描第一个二维码（登录）
2. 小红书检测风险，显示第二个二维码（验证）
3. 用户扫描第二个二维码完成验证
4. 登录成功

**关键时间限制**：第二个二维码只有**60秒**有效期！

## 📋 后端API说明

### 现有API（已实现）

#### 1. 获取登录二维码
```
POST /api/xiaohongshu/login/qrcode
Response: {
  "qrcodeImage": "data:image/png;base64,..."
}
```

#### 2. 等待登录（后台轮询）
内部WaitForLogin会：
- 检测验证页面
- 自动提取验证二维码
- 等待验证完成

### 需要添加的API（待实现）

#### 3. 获取验证二维码
```typescript
GET /api/xiaohongshu/login/verification-qrcode

Response:
{
  "hasVerification": true,
  "qrcodeImage": "data:image/png;base64,...",
  "expiresIn": 45,  // 剩余秒数
  "message": "请扫描二维码完成安全验证"
}

或

{
  "hasVerification": false
}
```

#### 4. 检查登录状态
```typescript
GET /api/xiaohongshu/login/status

Response:
{
  "isLoggedIn": true/false,
  "stage": "qrcode" | "verification" | "success",
  "message": "状态描述"
}
```

## 🎨 前端实现方案

### 方案1：轮询方式（推荐，简单）

```typescript
// LoginPage.tsx (prome-platform)

import { useState, useEffect } from 'react';
import { Alert, Spin } from 'antd';

interface LoginStage {
  stage: 'qrcode' | 'verification' | 'success';
  qrcodeImage: string;
  message: string;
  expiresIn?: number;
}

export function XiaohongshuLogin() {
  const [loginState, setLoginState] = useState<LoginStage>({
    stage: 'qrcode',
    qrcodeImage: '',
    message: '正在获取二维码...',
  });

  useEffect(() => {
    // 1. 获取初始登录二维码
    fetchLoginQRCode();

    // 2. 开始轮询检查状态（每2秒）
    const interval = setInterval(async () => {
      // 检查是否需要验证二维码
      const verifyResp = await fetch('/api/xiaohongshu/login/verification-qrcode');
      const verifyData = await verifyResp.json();

      if (verifyData.hasVerification) {
        setLoginState({
          stage: 'verification',
          qrcodeImage: verifyData.qrcodeImage,
          message: '⚠️ 需要二次验证，请扫描下方二维码',
          expiresIn: verifyData.expiresIn,
        });
        return;
      }

      // 检查是否登录成功
      const statusResp = await fetch('/api/xiaohongshu/login/status');
      const statusData = await statusResp.json();

      if (statusData.isLoggedIn) {
        setLoginState({
          stage: 'success',
          qrcodeImage: '',
          message: '✅ 登录成功！',
        });
        clearInterval(interval);
      }
    }, 2000); // 每2秒检查一次

    return () => clearInterval(interval);
  }, []);

  async function fetchLoginQRCode() {
    const resp = await fetch('/api/xiaohongshu/login/qrcode', { method: 'POST' });
    const data = await resp.json();
    setLoginState({
      stage: 'qrcode',
      qrcodeImage: data.qrcodeImage,
      message: '请使用小红书APP扫描二维码登录',
    });
  }

  return (
    <div style={{ textAlign: 'center', padding: '40px' }}>
      <h2>{loginState.message}</h2>

      {loginState.stage === 'qrcode' && (
        <>
          <img src={loginState.qrcodeImage} alt="登录二维码" style={{ width: 200, height: 200 }} />
          <p style={{ color: '#666', marginTop: 16 }}>
            使用小红书APP扫描上方二维码
          </p>
        </>
      )}

      {loginState.stage === 'verification' && (
        <>
          <Alert
            type="warning"
            message="安全验证"
            description={`检测到需要二次验证，请尽快扫描下方二维码（剩余${loginState.expiresIn || 60}秒）`}
            showIcon
            style={{ marginBottom: 20 }}
          />
          <img src={loginState.qrcodeImage} alt="验证二维码" style={{ width: 200, height: 200 }} />
          <p style={{ color: '#ff4d4f', marginTop: 16 }}>
            ⏰ 验证二维码60秒内有效，请尽快扫描！
          </p>
        </>
      )}

      {loginState.stage === 'success' && (
        <Alert
          type="success"
          message="登录成功"
          description="即将跳转..."
          showIcon
        />
      )}

      {loginState.stage !== 'success' && <Spin tip="等待扫码..." style={{ marginTop: 20 }} />}
    </div>
  );
}
```

### 方案2：WebSocket方式（性能更好，但复杂）

```typescript
// LoginPage.tsx

import { useState, useEffect, useRef } from 'react';

export function XiaohongshuLogin() {
  const [loginState, setLoginState] = useState({
    stage: 'qrcode',
    qrcodeImage: '',
    message: '',
  });
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // 建立WebSocket连接
    const ws = new WebSocket('ws://backend/api/xiaohongshu/login/stream');
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'qrcode':
          setLoginState({
            stage: 'qrcode',
            qrcodeImage: data.image,
            message: '请扫描二维码登录',
          });
          break;

        case 'verification':
          setLoginState({
            stage: 'verification',
            qrcodeImage: data.image,
            message: `⚠️ 需要验证，剩余${data.expiresIn}秒`,
          });
          break;

        case 'success':
          setLoginState({
            stage: 'success',
            qrcodeImage: '',
            message: '✅ 登录成功！',
          });
          ws.close();
          break;
      }
    };

    ws.onerror = () => {
      setLoginState(prev => ({
        ...prev,
        message: '连接失败，请刷新页面重试',
      }));
    };

    return () => ws.close();
  }, []);

  // UI渲染同方案1
}
```

## 🔧 后端Service实现（需要添加）

```go
// service.go

type VerificationQRCodeResponse struct {
	HasVerification bool   `json:"hasVerification"`
	QRCodeImage     string `json:"qrcodeImage,omitempty"`
	ExpiresIn       int    `json:"expiresIn,omitempty"` // 剩余秒数
	Message         string `json:"message,omitempty"`
}

func (s *XiaohongshuService) GetVerificationQRCode(ctx context.Context) (*VerificationQRCodeResponse, error) {
	if s.loginAction == nil {
		return &VerificationQRCodeResponse{HasVerification: false}, nil
	}

	qrcode, exists := s.loginAction.GetVerificationQRCode()
	if !exists || qrcode == "" {
		return &VerificationQRCodeResponse{HasVerification: false}, nil
	}

	// 计算剩余时间
	elapsed := time.Since(s.loginAction.verificationDetectedAt)
	remaining := int(60 - elapsed.Seconds())
	if remaining < 0 {
		remaining = 0
	}

	return &VerificationQRCodeResponse{
		HasVerification: true,
		QRCodeImage:     qrcode,
		ExpiresIn:       remaining,
		Message:         "请扫描二维码完成安全验证",
	}, nil
}

type LoginStatusResponse struct {
	IsLoggedIn bool   `json:"isLoggedIn"`
	Stage      string `json:"stage"` // "qrcode", "verification", "success"
	Message    string `json:"message"`
}

func (s *XiaohongshuService) CheckLoginStatus(ctx context.Context) (*LoginStatusResponse, error) {
	if s.loginAction == nil {
		return &LoginStatusResponse{
			IsLoggedIn: false,
			Stage:      "qrcode",
			Message:    "等待扫码...",
		}, nil
	}

	// 检查是否有验证二维码
	_, hasVerify := s.loginAction.GetVerificationQRCode()
	if hasVerify {
		return &LoginStatusResponse{
			IsLoggedIn: false,
			Stage:      "verification",
			Message:    "等待验证...",
		}, nil
	}

	// 检查是否已登录
	isLoggedIn, err := s.loginAction.CheckLoginStatus(ctx)
	if err != nil {
		return nil, err
	}

	if isLoggedIn {
		return &LoginStatusResponse{
			IsLoggedIn: true,
			Stage:      "success",
			Message:    "登录成功",
		}, nil
	}

	return &LoginStatusResponse{
		IsLoggedIn: false,
		Stage:      "qrcode",
		Message:    "等待扫码...",
	}, nil
}
```

## 📊 完整流程时序图

```
用户     前端                    后端                    小红书
 |       |                       |                        |
 | ----> | 打开登录页            |                        |
 |       | ---POST /qrcode-----> |                        |
 |       |                       | ---访问login页-------> |
 |       |                       | <--返回QR码图片------- |
 |       | <--返回QR码图片------ |                        |
 |       | 显示QR码              |                        |
 |       |                       |                        |
 | 扫码  |                       |                        |
 | ------|---------------------->|----扫码成功----------->|
 |       |                       |                        |
 |       |                       | <--跳转验证页(/captcha)|
 |       |                       | 🔥自动提取验证QR码      |
 |       |                       |                        |
 |       | --轮询验证QR码------> |                        |
 |       | <--返回验证QR码------ |                        |
 |       | 显示验证QR码 ⚠️       |                        |
 |       |                       |                        |
 | 扫码  |                       |                        |
 | ------|---------------------->|----验证成功----------->|
 |       |                       | <--跳转首页(/explore)--|
 |       |                       | 🔥获取真实Cookie       |
 |       |                       |                        |
 |       | --轮询登录状态------> |                        |
 |       | <--登录成功---------- |                        |
 |       | 显示成功 ✅           |                        |
```

## ⏰ 时间要求

1. **轮询间隔**：建议2秒（平衡及时性和性能）
2. **验证二维码有效期**：60秒
3. **提示刷新时机**：剩余<10秒时显示倒计时
4. **超时处理**：超过60秒未验证，提示刷新页面重新获取

## 🧪 测试场景

### 场景1：正常登录（无验证）
```
1. 显示登录QR ✅
2. 用户扫码
3. 直接登录成功 ✅
4. 不触发验证流程
```

### 场景2：需要验证
```
1. 显示登录QR ✅
2. 用户扫码
3. 后端检测到验证页 ✅
4. 前端轮询获取验证QR ✅
5. 前端显示验证QR（倒计时）✅
6. 用户扫描验证QR ✅
7. 验证完成，登录成功 ✅
```

### 场景3：验证超时
```
1-5. 同场景2
6. 用户60秒内未扫描
7. 前端显示"验证超时，请刷新重试"
8. 用户刷新页面重新开始
```

## 🔗 相关文档

- [二次二维码解决方案](./SECOND_QRCODE_SOLUTION.md)
- [验证页面识别修复](./VERIFICATION_PAGE_FIX.md)
- [skipCookies实现](../browser/browser.go)

## 📝 前端实施清单

- [ ] 添加验证二维码轮询逻辑
- [ ] 添加验证倒计时显示
- [ ] 添加超时提示和重试机制
- [ ] 添加加载状态指示器
- [ ] 测试完整登录流程
- [ ] 测试验证超时场景
- [ ] 优化UI/UX体验
