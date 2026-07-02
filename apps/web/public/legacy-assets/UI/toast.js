function showToast(message, duration = 2000) {
    // 如果已有 toast，先移除
    hideToast();
    
    const toast = document.createElement('div');
    toast.id = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // 添加显示类以触发动画
    setTimeout(() => toast.classList.add('show'), 10);
    
    // 设置自动隐藏
    setTimeout(hideToast, duration);
}

function hideToast() {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 200);
    }
} 