import assert from 'node:assert/strict';
import test from 'node:test';
import { extractBilibiliUrl, fetchBilibiliVideo, formatBilibiliVideo } from '../src/bilibili.mjs';

test('提取 B 站视频链接', () => {
  assert.equal(
    extractBilibiliUrl('看看这个 https://www.bilibili.com/video/BV1xx411c7mD 好笑'),
    'https://www.bilibili.com/video/BV1xx411c7mD',
  );
  assert.equal(extractBilibiliUrl('https://b23.tv/abc123'), 'https://b23.tv/abc123');
  assert.equal(extractBilibiliUrl('没有链接'), '');
});

test('获取视频信息和封面', async () => {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(String(url));
    if (String(url).includes('api.bilibili.com')) {
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            bvid: 'BV1xx411c7mD',
            title: '测试视频',
            pic: 'http://i0.hdslb.com/test.jpg',
            owner: { name: 'UP 主' },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response('<html></html>', { status: 200 });
  };

  const video = await fetchBilibiliVideo('https://www.bilibili.com/video/BV1xx411c7mD', {
    fetchImpl,
  });
  assert.equal(video.title, '测试视频');
  assert.equal(video.owner, 'UP 主');
  assert.equal(video.cover, 'https://i0.hdslb.com/test.jpg');
  assert.match(formatBilibiliVideo(video), /测试视频/);
  assert.match(formatBilibiliVideo(video), /BV1xx411c7mD/);
  assert.ok(requests.some((url) => url.includes('api.bilibili.com')));
});
