/**
 * 嵌入模式登录的「完成页」。
 *
 * 登录在顶层弹窗里跑完（只有顶层导航才会发送 `SameSite=Lax` 的 state Cookie），
 * 弹窗停在回调路由上。此时**不能** 302 回账号页——那会把用户留在弹窗里。
 * 正确做法是渲染这个极简页面：把结果 postMessage 回 iframe，然后自行关闭。
 *
 * 页面刻意不引用任何外部资源，也不承载任何凭据：
 * 会话由 HttpOnly Cookie 持有，iframe 内的同站请求会自动携带。
 */

import {
  embeddedAuthMessageSource,
  embeddedAuthMessageType,
  embeddedAuthMessageVersion,
  isEmbeddedAuthSuccessStatus,
} from './embedded-auth-protocol';

export interface EmbedAuthCompletePageInput {
  /** 回调路由产出的结果码：login_success / readonly / state_invalid / session_error ... */
  status: string;
  /** 来自 html lang 的站点语言。 */
  locale?: string;
}

type CompleteCopy = {
  title: string;
  ok: string;
  failed: string;
  close: string;
};

const completePageCopy: Record<'zh-CN' | 'zh-Hant' | 'en', CompleteCopy> = {
  'zh-CN': {
    title: '雨城通',
    ok: '已成功登录，正在返回应用…',
    failed: '登录未完成，请返回应用重试。',
    close: '关闭窗口',
  },
  'zh-Hant': {
    title: '雨城通',
    ok: '已成功登入，正在返回應用…',
    failed: '登入未完成，請返回應用重試。',
    close: '關閉視窗',
  },
  en: {
    title: 'Yuchengtong',
    ok: 'Signed in. Returning to the app…',
    failed: 'Sign-in was not completed. Return to the app and try again.',
    close: 'Close window',
  },
};

export function renderEmbedAuthCompletePage(input: EmbedAuthCompletePageInput): string {
  const ok = isEmbeddedAuthSuccessStatus(input.status);
  const locale = normalizeLocale(input.locale);
  const copy = completePageCopy[locale];

  // 注入到 <script> 里的 JSON 必须转义 `<`、`>`、`&`，否则结果码里若出现
  // `</script>` 就会提前闭合脚本块。结果码目前是服务端白名单值，这里仍然做防御。
  const payloadJson = JSON.stringify({
    source: embeddedAuthMessageSource,
    type: embeddedAuthMessageType,
    version: embeddedAuthMessageVersion,
    ok,
    status: input.status,
  })
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(copy.title)}</title>
<style>
:root{color-scheme:light dark}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,-apple-system,"Segoe UI","Noto Sans SC",sans-serif;background:#F6F6F4;color:#1F1F1E}
.card{width:min(360px,100%);padding:28px 24px;border-radius:14px;background:#fff;border:1px solid rgba(0,0,0,.08);text-align:center}
.mark{width:44px;height:44px;margin:0 auto 14px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;line-height:1}
.mark.is-ok{background:#EAF3DE;color:#27500A}
.mark.is-fail{background:#FCEBEB;color:#791F1F}
h1{margin:0 0 8px;font-size:16px;font-weight:500}
p{margin:0;font-size:13px;line-height:1.6;color:#5F5E5A}
button{margin-top:18px;width:100%;padding:9px 16px;font-size:13px;font-family:inherit;border-radius:8px;border:1px solid rgba(0,0,0,.14);background:transparent;color:inherit;cursor:pointer}
@media (prefers-color-scheme:dark){
body{background:#1B1B1A;color:#F1EFE8}
.card{background:#232322;border-color:rgba(255,255,255,.12)}
p{color:#B4B2A9}
button{border-color:rgba(255,255,255,.18)}
.mark.is-ok{background:#27500A;color:#C0DD97}
.mark.is-fail{background:#791F1F;color:#F7C1C1}
}
</style>
</head>
<body>
<main class="card">
<div class="mark ${ok ? 'is-ok' : 'is-fail'}" aria-hidden="true">${ok ? '&#10003;' : '!'}</div>
<h1>${escapeHtml(copy.title)}</h1>
<p>${escapeHtml(ok ? copy.ok : copy.failed)}</p>
<button type="button" id="yct-embed-close">${escapeHtml(copy.close)}</button>
</main>
<script>
(function () {
  var payload = ${payloadJson};
  function notifyOpener() {
    try {
      if (window.opener && window.opener.closed !== true) {
        // targetOrigin 用 '*' 是刻意的取舍：完成页与 iframe 理论上同源，但当
        // iframe 未获 allow-same-origin 时它的来源是不透明的（'null'），
        // 写死具体来源会让消息被静默丢弃。payload 不含任何凭据，
        // 且接收侧会校验 event.source 必须等于它亲自打开的那个窗口，因此可接受。
        window.opener.postMessage(payload, '*');
      }
    } catch (error) {
      // 跨源拒绝访问时忽略：用户仍可手动关闭窗口。
    }
  }
  function closeSelf() {
    try { window.close(); } catch (error) {}
  }
  notifyOpener();
  window.setTimeout(notifyOpener, 250);
  window.setTimeout(closeSelf, 700);
  var button = document.getElementById('yct-embed-close');
  if (button) { button.addEventListener('click', closeSelf); }
})();
</script>
</body>
</html>
`;
}

function normalizeLocale(value: string | undefined): 'zh-CN' | 'zh-Hant' | 'en' {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized.startsWith('en')) {
    return 'en';
  }
  if (
    normalized === 'zh-hant' ||
    normalized.startsWith('zh-tw') ||
    normalized.startsWith('zh-hk')
  ) {
    return 'zh-Hant';
  }
  return 'zh-CN';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
