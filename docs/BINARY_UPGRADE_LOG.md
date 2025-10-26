# xiaohongshu-mcp 二进制升级日志

## 升级记录

### 2025-10-26: v2025.10.23.1552-94ed5d4

**升级原因**: 修复发布超时问题（context deadline exceeded）

**版本信息**:
- **新版本**: v2025.10.23.1552-94ed5d4
- **发布日期**: 2025年10月23日
- **提交**: 94ed5d4
- **下载源**: https://github.com/xpzouying/xiaohongshu-mcp/releases/tag/v2025.10.23.1552-94ed5d4

**包含修复**:
- ✅ PR #245: "update publish timeout" - 更新发布超时时间
- ✅ PR #246: "add panic recovery middleware" - 添加 panic 恢复中间件
- ✅ 相关 Issue: #218 - context canceled during publish

**旧版本备份**:
- 文件: `xiaohongshu-mcp.old.20251011`
- 大小: 20MB
- 日期: 2025年10月11日

**新版本信息**:
- 文件: `xiaohongshu-mcp`
- 大小: 21MB
- 日期: 2025年10月24日编译

**升级步骤**:
```bash
cd /Users/boliu/xiaohongshumcp-new/playwright-service/mcp-router

# 1. 备份旧版本
mv xiaohongshu-mcp xiaohongshu-mcp.old.20251011

# 2. 下载最新版本
curl -L -o xiaohongshu-mcp-darwin-amd64.tar.gz \
  https://github.com/xpzouying/xiaohongshu-mcp/releases/download/v2025.10.23.1552-94ed5d4/xiaohongshu-mcp-darwin-amd64.tar.gz

# 3. 解压
tar -xzf xiaohongshu-mcp-darwin-amd64.tar.gz

# 4. 重命名并设置权限
mv xiaohongshu-mcp-darwin-amd64 xiaohongshu-mcp
chmod +x xiaohongshu-mcp

# 5. 清理
rm xiaohongshu-mcp-darwin-amd64.tar.gz

# 6. 验证
./xiaohongshu-mcp -help
```

**预期效果**:
- 发布操作不再遇到 ~180秒的硬超时限制
- 发布 4 张图片的内容可以正常完成（预计耗时 ~185秒）
- 更好的错误处理和恢复机制

**验证方法**:
1. 重启服务后，尝试发布包含 4 张图片的内容
2. 查看日志，应该看到：
   ```
   [MCP Auth] Publishing content for user xxx
   [MCP Auth] Timeout: 600000ms (10 minutes)
   [~185s later] ✅ Publish completed
   ```
3. 不应该再出现 "context deadline exceeded" 错误

**回滚方法**（如果新版本有问题）:
```bash
cd /Users/boliu/xiaohongshumcp-new/playwright-service/mcp-router
mv xiaohongshu-mcp xiaohongshu-mcp.new.failed
mv xiaohongshu-mcp.old.20251011 xiaohongshu-mcp
# 重启服务
```

---

## 版本历史

### v2025.10.11（旧版本）
- 大小: 20MB
- 问题: 发布操作在 ~180秒后触发 "context deadline exceeded"
- 备份为: `xiaohongshu-mcp.old.20251011`

### v2025.10.23.1552-94ed5d4（当前版本）
- 大小: 21MB
- 修复: 发布超时问题
- 改进: panic 恢复机制
- 状态: ✅ 已部署

---

## 注意事项

1. **二进制文件不提交到 Git**
   - `xiaohongshu-mcp` 已在 .gitignore 中
   - 备份文件 `*.old.*` 也不应提交

2. **重启服务**
   - 升级后必须重启 Docker 容器
   - 或者重启 Node.js 服务器

3. **监控日志**
   - 升级后密切关注发布操作的日志
   - 记录实际发布耗时，验证是否解决超时问题

4. **备份保留**
   - 保留 `xiaohongshu-mcp.old.20251011` 至少 7 天
   - 确认新版本稳定后可删除

---

## 相关链接

- 项目仓库: https://github.com/xpzouying/xiaohongshu-mcp
- Issue #218: https://github.com/xpzouying/xiaohongshu-mcp/issues/218
- PR #245: https://github.com/xpzouying/xiaohongshu-mcp/pull/245
- PR #246: https://github.com/xpzouying/xiaohongshu-mcp/pull/246
- 发布页面: https://github.com/xpzouying/xiaohongshu-mcp/releases
