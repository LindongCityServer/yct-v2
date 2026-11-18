import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { QQApi, QQApiError } from '../src/qq-api.mjs';

function createMockServer() {
  const requests = [];
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      requests.push({ method: request.method, url: request.url, headers: request.headers, body });
      if (request.url === '/app/getAppAccessToken') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ access_token: 'tok-1', expires_in: '7200' }));
        return;
      }
      if (request.url === '/gateway') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ url: 'wss://api.example.com/websocket' }));
        return;
      }
      if (request.url === '/v2/groups/g1/messages') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ id: 'm-1', timestamp: '2026-11-17T20:00:00+08:00' }));
        return;
      }
      if (request.url === '/v2/groups/g1/files') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ file_info: 'file-group' }));
        return;
      }
      if (request.url === '/v2/users/u1/files') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ file_info: 'file-user' }));
        return;
      }
      if (request.url === '/v2/groups/g2/messages') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ code: 40054010, message: '不允许发送URL' }));
        return;
      }
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ code: 404, message: 'not found' }));
    });
  });
  return { server, requests };
}

test('QQApi 获取凭证、网关地址并发送群消息', async () => {
  const { server, requests } = createMockServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  const logger = { debug() {}, info() {}, warn() {}, error() {} };
  const api = new QQApi({
    apiBase: `http://127.0.0.1:${port}`,
    appId: 'app-1',
    appSecret: 'secret-1',
    logger,
  });

  try {
    assert.equal(await api.getAccessToken(), 'tok-1');
    // 第二次调用命中缓存，不再请求 token 接口。
    assert.equal(await api.getAccessToken(), 'tok-1');
    assert.equal(requests.filter((item) => item.url === '/app/getAppAccessToken').length, 1);
    assert.equal(await api.getGatewayUrl(), 'wss://api.example.com/websocket');

    await api.sendGroupMessage('g1', {
      msg_type: 0,
      content: '你好',
      msg_id: 'msg-1',
      msg_seq: 1,
    });
    const send = requests.find((item) => item.url === '/v2/groups/g1/messages');
    assert.equal(send.method, 'POST');
    assert.equal(send.headers.authorization, 'QQBot tok-1');
    assert.deepEqual(JSON.parse(send.body), {
      msg_type: 0,
      content: '你好',
      msg_id: 'msg-1',
      msg_seq: 1,
    });
  } finally {
    server.close();
  }
});

test('QQApi 上传群图片并发送富媒体消息', async () => {
  const { server, requests } = createMockServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  const logger = { debug() {}, info() {}, warn() {}, error() {} };
  const api = new QQApi({
    apiBase: `http://127.0.0.1:${port}`,
    appId: 'app-1',
    appSecret: 'secret-1',
    logger,
  });

  try {
    const fileInfo = await api.uploadGroupImage('g1', 'https://yct.example.com/a.png');
    assert.equal(fileInfo, 'file-group');
    const upload = requests.find((item) => item.url === '/v2/groups/g1/files');
    assert.deepEqual(JSON.parse(upload.body), {
      file_type: 1,
      url: 'https://yct.example.com/a.png',
      srv_send_msg: false,
    });

    await api.sendGroupImage('g1', { fileInfo, msgId: 'msg-1', msgSeq: 2 });
    const send = requests.filter((item) => item.url === '/v2/groups/g1/messages').at(-1);
    assert.deepEqual(JSON.parse(send.body), {
      msg_type: 7,
      media: { file_info: 'file-group' },
      msg_id: 'msg-1',
      msg_seq: 2,
    });

    assert.equal(await api.uploadC2CImage('u1', 'https://yct.example.com/b.png'), 'file-user');
  } finally {
    server.close();
  }
});

test('HTTP 200 但带业务错误码时抛出 QQApiError', async () => {
  const { server } = createMockServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  const logger = { debug() {}, info() {}, warn() {}, error() {} };
  const api = new QQApi({
    apiBase: `http://127.0.0.1:${port}`,
    appId: 'app-1',
    appSecret: 'secret-1',
    logger,
  });

  try {
    await assert.rejects(
      api.sendGroupMessage('g2', { msg_type: 0, content: 'https://example.com' }),
      (error) => {
        assert.ok(error instanceof QQApiError);
        assert.equal(error.code, 40054010);
        assert.match(error.message, /不允许发送URL/);
        return true;
      },
    );
  } finally {
    server.close();
  }
});
