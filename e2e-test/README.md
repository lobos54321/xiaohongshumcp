# 端到端测试使用指南

## 概述

本目录包含小红书智能自动化系统的端到端测试脚本，用于验证系统的完整性和功能可用性。

## 测试架构

```
端到端测试
├── 第一层：连通性测试 (test-connectivity.sh)
│   ├── 后端健康检查
│   ├── CORS跨域验证
│   └── API可达性测试
│
├── 第二层：认证流程测试 (test-authentication.sh)
│   ├── 用户初始化
│   ├── 获取用户状态
│   ├── 自动登录流程
│   └── 登录状态检查
│
└── 第三层：核心功能测试 (test-core-functions.sh)
    ├── AI智能对话
    └── 登录状态检查API
```

## 快速开始

### 执行完整测试套件

```bash
# 进入项目根目录
cd /data/workspace/xiaohongshumcp

# 执行所有测试
bash e2e-test/run-all-tests.sh
```

### 执行单个测试层级

```bash
# 只测试连通性
bash e2e-test/test-connectivity.sh

# 只测试认证流程
bash e2e-test/test-authentication.sh

# 只测试核心功能
bash e2e-test/test-core-functions.sh
```

## 测试配置

### 后端地址配置

默认测试后端地址：`https://xiaohongshu-automation-ai.zeabur.app`

如需修改，编辑各测试脚本中的 `BASE_URL` 变量：

```bash
# 编辑测试脚本
vim e2e-test/test-connectivity.sh

# 修改BASE_URL
BASE_URL="https://your-custom-backend.com"
```

### 测试环境

测试脚本支持以下环境：

- **生产环境**：`https://xiaohongshu-automation-ai.zeabur.app`
- **本地开发环境**：`http://localhost:8080`
- **混合环境**：本地前端 + 远程后端

## 测试报告

### 报告位置

所有测试报告保存在 `e2e-test-reports/` 目录：

```
e2e-test-reports/
├── connectivity-test-YYYYMMDD_HHMMSS.txt
├── authentication-test-TIMESTAMP.txt
├── core-functions-test-TIMESTAMP.txt
├── qrcode-TIMESTAMP.png
└── test-summary-YYYYMMDD_HHMMSS.txt
```

### 查看测试报告

```bash
# 查看最新的测试总结
ls -lt e2e-test-reports/test-summary-*.txt | head -1 | xargs cat

# 查看最新的完整报告
cat e2e-test-reports/E2E测试执行报告.md
```

## 测试结果解读

### 成功标识

```
✅ 所有测试通过！系统运行正常。
通过率: 100%
```

### 失败标识

```
❌ 发现 X 个失败的测试
请查看详细报告。
```

### 测试状态说明

- **✅ PASS**：测试通过
- **❌ FAIL**：测试失败
- **⚠️ WARNING**：警告（不影响通过）

## 手动测试步骤

### 完整登录流程测试

某些测试需要人工扫码才能完成，步骤如下：

1. **执行认证测试**
   ```bash
   bash e2e-test/test-authentication.sh
   ```

2. **查找二维码**
   ```bash
   # 找到最新生成的二维码
   ls -lt e2e-test-reports/qrcode-*.png | head -1
   ```

3. **扫描二维码**
   - 打开二维码图片文件
   - 使用小红书APP扫描
   - 完成登录

4. **验证登录状态**
   ```bash
   # 使用测试脚本中提示的命令
   curl -s 'https://xiaohongshu-automation-ai.zeabur.app/api/xiaohongshu/login/status?userId=YOUR_TEST_USER_ID' | jq .
   ```

## 常见问题

### Q1: 测试失败怎么办？

**A**: 按以下步骤排查：

1. **检查后端服务状态**
   ```bash
   curl https://xiaohongshu-automation-ai.zeabur.app/health
   ```

2. **查看详细错误信息**
   ```bash
   # 查看对应测试的详细报告
   cat e2e-test-reports/connectivity-test-*.txt
   ```

3. **检查网络连接**
   ```bash
   ping xiaohongshu-automation-ai.zeabur.app
   ```

### Q2: 如何跳过某个测试？

**A**: 编辑 `run-all-tests.sh`，注释掉不需要的测试：

```bash
# 注释掉认证测试
# if bash ${SCRIPT_DIR}/test-authentication.sh; then
#     echo "✅ 认证流程测试 - 通过"
# fi
```

### Q3: 测试响应时间为空？

**A**: 这是因为系统缺少 `bc` 命令，不影响功能测试。可以安装：

```bash
# Ubuntu/Debian
apt-get install bc

# Alpine
apk add bc
```

### Q4: 如何测试本地环境？

**A**: 修改测试脚本的 `BASE_URL`：

```bash
# 编辑测试脚本
vim e2e-test/test-connectivity.sh

# 修改为本地地址
BASE_URL="http://localhost:8080"
```

## 扩展测试

### 添加新测试用例

在对应的测试脚本中添加新的测试函数：

```bash
# 在 test-core-functions.sh 中添加
test_api "新功能测试" "POST" "/api/new-feature" "{\"param\": \"value\"}"
```

### 创建新测试脚本

```bash
# 复制现有脚本作为模板
cp e2e-test/test-connectivity.sh e2e-test/test-new-feature.sh

# 编辑新脚本
vim e2e-test/test-new-feature.sh

# 在主测试脚本中调用
vim e2e-test/run-all-tests.sh
```

## 性能基准

### 预期响应时间

| API端点 | 预期时间 | 最大可接受 |
|---------|---------|-----------|
| /health | < 500ms | 2s |
| /api/user/initialize | < 2s | 5s |
| /api/user/status/:userId | < 1s | 3s |
| /agent/chat（简单对话） | < 8s | 15s |

### 监控命令

```bash
# 单独测试API响应时间
time curl https://xiaohongshu-automation-ai.zeabur.app/health

# 连续测试10次
for i in {1..10}; do
  time curl -s https://xiaohongshu-automation-ai.zeabur.app/health > /dev/null
done
```

## 最佳实践

1. **定期执行测试**
   - 建议每次部署后执行完整测试
   - 每周执行一次定期测试

2. **保留测试报告**
   - 测试报告会自动保存
   - 建议保留最近30天的报告用于对比

3. **CI/CD集成**
   - 将测试脚本集成到CI/CD流程
   - 在代码合并前自动执行测试

4. **监控告警**
   - 设置测试失败时的通知机制
   - 关注测试通过率趋势

## 技术支持

### 测试脚本维护

- 脚本位置：`e2e-test/`
- 语言：Bash Shell
- 依赖：curl, grep, sed

### 报告生成

- 格式：纯文本 + Markdown
- 编码：UTF-8
- 位置：`e2e-test-reports/`

### 相关文档

- [设计文档](/data/.task/design.md)
- [完整测试报告](e2e-test-reports/E2E测试执行报告.md)
- [项目README](../README.md)

---

**更新时间**：2025年11月17日  
**版本**：v1.0
