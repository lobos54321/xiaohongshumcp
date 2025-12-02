# 小红书智能自动化系统测试套件使用说明

## 概述

本测试套件包含三个主要脚本，用于诊断和验证小红书智能自动化系统的功能：

1. `comprehensive-test-and-fix.sh` - 综合测试与修复脚本
2. `detailed-component-test.sh` - 详细组件测试脚本
3. `fix-verification-script.sh` - 修复验证脚本

还有一个主控脚本 `run-all-tests.sh` 可以依次执行所有测试。

## 脚本功能说明

### 1. 综合测试与修复脚本 (comprehensive-test-and-fix.sh)

**功能**：
- 检查网络连通性和服务状态
- 测试登录和发布功能
- 验证各种修复措施的实施情况
- 生成诊断报告

**使用方法**：
```bash
./comprehensive-test-and-fix.sh
```

### 2. 详细组件测试脚本 (detailed-component-test.sh)

**功能**：
- 逐个测试系统的所有API端点
- 包括健康检查、用户管理、登录、内容管理、自动运营等模块
- 生成详细的测试报告

**使用方法**：
```bash
./detailed-component-test.sh
```

### 3. 修复验证脚本 (fix-verification-script.sh)

**功能**：
- 验证针对已知问题的修复措施是否正确实施
- 包括MCP二进制文件修复、Cookie清理修复、端口冲突修复等
- 生成修复验证报告

**使用方法**：
```bash
./fix-verification-script.sh
```

### 4. 主控脚本 (run-all-tests.sh)

**功能**：
- 依次执行所有测试脚本
- 提供统一的测试入口

**使用方法**：
```bash
./run-all-tests.sh
```

## 环境要求

- Bash shell
- curl 命令行工具
- jq JSON处理器
- 网络连接

**安装依赖**：
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install curl jq

# CentOS/RHEL
sudo yum install curl jq

# macOS
brew install curl jq
```

## 环境变量设置

某些测试需要设置以下环境变量：

```bash
export ANTHROPIC_API_KEY=your_anthropic_api_key_here
export MCP_ROUTER_URL=http://localhost:3000  # 如果MCP Router在本地运行
```

## 使用示例

### 执行单个测试脚本
```bash
# 执行综合测试
./comprehensive-test-and-fix.sh

# 执行详细组件测试
./detailed-component-test.sh

# 执行修复验证
./fix-verification-script.sh
```

### 执行所有测试
```bash
# 执行所有测试脚本
./run-all-tests.sh
```

## 输出文件

执行测试脚本会生成以下报告文件：

1. `diagnosis-report-YYYYMMDD-HHMMSS.md` - 诊断报告
2. `detailed-test-report-YYYYMMDD-HHMMSS.md` - 详细测试报告
3. `fix-verification-report-YYYYMMDD-HHMMSS.md` - 修复验证报告

## 常见问题排查

### 1. 权限问题
确保所有脚本都有执行权限：
```bash
chmod +x *.sh
```

### 2. 命令未找到
确保系统已安装所需的命令行工具：
```bash
which curl jq
```

### 3. 网络连接问题
检查网络连接和目标服务的可访问性：
```bash
curl -v https://xiaohongshu-automation-ai.zeabur.app/health
```

## 针对特定问题的测试

### 登录页面500错误
重点关注以下测试：
- Cookie清理功能验证
- MCP二进制文件状态检查
- 端口冲突检测

### 发布功能报错
重点关注以下测试：
- 登录状态验证
- 发布接口功能测试
- 用户认证状态检查

## 维护和更新

定期更新测试脚本以适应系统变化：
1. 检查API端点是否有变更
2. 更新测试数据和参数
3. 验证新功能的测试覆盖

## 贡献

如有改进建议或发现新的问题，请提交issue或pull request。