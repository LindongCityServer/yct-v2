const bilibiliUrlPattern =
  /https?:\/\/(?:[a-z0-9-]+\.)?(?:bilibili\.com\/video\/[^\s<>"']+|b23\.tv\/[^\s<>"']+)/iu;

export function extractBilibiliUrl(text) {
  const match = bilibiliUrlPattern.exec(String(text ?? ''));
  return match?.[0] ?? '';
}

export async function fetchBilibiliVideo(url, { fetchImpl = fetch, timeoutMs = 10_000 } = {}) {
  const timeout = AbortSignal.timeout(timeoutMs);
  let finalUrl = url;
  try {
    const page = await fetchImpl(url, {
      redirect: 'follow',
      signal: timeout,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      },
    });
    finalUrl = page.url || url;
    if (/b23\.tv/i.test(url)) {
      const html = await page.text();
      const idMatch = /(BV[0-9A-Za-z]{8,})/u.exec(html);
      if (idMatch) {
        finalUrl = `https://www.bilibili.com/video/${idMatch[1]}`;
      }
    }
  } catch {
    // b23 短链解析失败时继续尝试从原链接提取 BV 号。
  }

  const bvid = /(BV[0-9A-Za-z]{8,})/u.exec(finalUrl)?.[1];
  const aid = /\/video\/av(\d+)/iu.exec(finalUrl)?.[1];
  if (!bvid && !aid) {
    return null;
  }

  const params = new URLSearchParams(bvid ? { bvid } : { aid });
  let response;
  try {
    response = await fetchImpl(`https://api.bilibili.com/x/web-interface/view?${params}`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        Referer: 'https://www.bilibili.com/',
      },
    });
  } catch {
    return null;
  }
  if (!response.ok) {
    return null;
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    return null;
  }
  const data = payload?.code === 0 ? payload.data : null;
  if (!data?.title) {
    return null;
  }
  const cover = String(data.pic ?? '').replace(/^http:/u, 'https:');
  return {
    bvid: data.bvid ?? bvid ?? '',
    title: String(data.title),
    owner: String(data.owner?.name ?? ''),
    cover: /^https:\/\//u.test(cover) ? cover : '',
    url: data.bvid
      ? `https://www.bilibili.com/video/${data.bvid}`
      : `https://www.bilibili.com/video/av${data.aid}`,
  };
}

export function formatBilibiliVideo(video) {
  return [
    `B站视频：${video.title}`,
    video.owner ? `UP：${video.owner}` : '',
    video.url,
  ]
    .filter(Boolean)
    .join('\n');
}
