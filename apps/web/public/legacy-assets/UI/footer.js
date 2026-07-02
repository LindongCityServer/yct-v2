// footer.js
document.addEventListener('DOMContentLoaded', function() {
    //console.log('DOM fully loaded and parsed');
    
    const captionContainers = document.getElementsByClassName('caption-section');
    if (captionContainers.length > 0) {
        for (let i = 0; i < captionContainers.length; i++) {
            const container = captionContainers[i];
            //console.log(`Found caption-section element at index ${i}`, container);
            
            // Ensure innerHTML is set correctly
            container.innerHTML = `
                <p class="caption">"临东""临东服务器"及其相关的各类组织、品牌均为虚构，其本体基于一个《我的世界》基岩版（Minecraft Bedrock Edition）服务器。</p>
                <p class="caption">网站部分代码使用AI生成，部分图标来自<a href="https://www.icons8.com/">Icons8</a>。</p>
                <div class="beian">
                    <a href="https://beian.miit.gov.cn" style="margin-right:8px;">辽ICP备2021004959号-1</a>
                    <a href="https://beian.mps.gov.cn/#/query/webSearch?code=21100502000117">辽公网安备21100502000117号</a>
                </div>
            `;
            //console.log(`Updated caption-section element at index ${i}`, container.innerHTML);
        }
    } else {
        console.error('No caption-section elements found');
    }
});