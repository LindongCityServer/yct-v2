document.addEventListener('DOMContentLoaded', function() {
    const copyButton = document.getElementById('copy');
    copyButton.onclick = function() {
        // 获取页面标题
        const pageTitle = document.querySelector('h1').textContent;
        // 获取页面链接
        const pageUrl = window.location.href;
        // 构建要复制的文本
        const textToCopy = `${pageTitle} - 雨城通\n${pageUrl}`;
        
        // 创建一个临时的 textarea 元素
        const tempTextarea = document.createElement('textarea');
        tempTextarea.value = textToCopy;
        document.body.appendChild(tempTextarea);
        
        // 选择 textarea 中的文本
        tempTextarea.select();
        tempTextarea.setSelectionRange(0, 99999); // 适用于移动设备
        
        // 复制选中的文本到剪贴板
        document.execCommand('copy');
        
        // 移除临时的 textarea 元素
        document.body.removeChild(tempTextarea);
        
        // 可选：添加复制成功的提示
        showToast('链接已复制到剪贴板');
    };
});