
// 🍪 张三 专用Cookie导出脚本
// 员工ID: emp001
// 生成时间: 2025/10/9 10:32:23

console.log('🏢 企业Cookie导出工具启动');
console.log('员工: 张三 (emp001)');
console.log('请确保已在小红书网站登录');

// 检查当前网站
if (!window.location.href.includes('xiaohongshu.com')) {
    alert('⚠️ 请在小红书网站 (xiaohongshu.com) 运行此脚本');
    throw new Error('请在小红书网站运行此脚本');
}

// 导出cookies
function exportCookiesForEmployee() {
    try {
        const cookies = document.cookie.split(';').map(cookie => {
            const [name, value] = cookie.trim().split('=');
            return {
                name: name,
                value: value || '',
                domain: '.xiaohongshu.com',
                path: '/',
                expires: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30天后过期
                httpOnly: false,
                secure: true,
                employeeId: 'emp001',
                employeeName: '张三',
                exportTime: new Date().toISOString()
            };
        }).filter(cookie => cookie.name);

        if (cookies.length === 0) {
            alert('❌ 未找到有效的cookies，请确保已登录小红书');
            return;
        }

        // 生成导出数据包
        const exportData = {
            employeeId: 'emp001',
            employeeName: '张三',
            exportTime: new Date().toISOString(),
            cookieCount: cookies.length,
            checksum: generateChecksum(cookies),
            cookies: cookies
        };

        console.log('✅ 成功导出cookies');
        console.log('员工:', '张三');
        console.log('Cookie数量:', cookies.length);
        console.log('导出时间:', new Date().toLocaleString('zh-CN'));

        console.log('\n📋 请复制以下完整JSON数据包发送给IT管理员:');
        console.log('='.repeat(50));
        console.log(JSON.stringify(exportData, null, 2));
        console.log('='.repeat(50));

        // 尝试复制到剪贴板
        if (navigator.clipboard) {
            navigator.clipboard.writeText(JSON.stringify(exportData, null, 2))
                .then(() => console.log('✅ 数据已复制到剪贴板'))
                .catch(() => console.log('⚠️ 请手动复制上面的JSON数据'));
        }

        return exportData;

    } catch (error) {
        console.error('❌ 导出失败:', error.message);
        alert('Cookie导出失败: ' + error.message);
    }
}

// 生成校验和
function generateChecksum(cookies) {
    const data = cookies.map(c => c.name + c.value).join('');
    return btoa(data).substring(0, 16);
}

// 运行导出
exportCookiesForEmployee();
