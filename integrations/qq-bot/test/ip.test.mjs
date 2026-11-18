import assert from 'node:assert/strict';
import test from 'node:test';
import { clearIpCache, lookupIp } from '../src/ip.mjs';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('优先使用 ipwho.is 的中文属地', async () => {
  clearIpCache();
  let requested = '';
  const fetchImpl = async (url) => {
    requested = url;
    return jsonResponse({
      ip: '114.114.114.114',
      success: true,
      country: '中国',
      region: '江苏省',
      city: '南京',
      connection: { isp: 'China Telecom', asn: 137702 },
    });
  };

  const text = await lookupIp({ ip: '114.114.114.114', fetchImpl });
  assert.match(requested, /ipwho\.is\/114\.114\.114\.114/);
  assert.equal(text, '114.114.114.114：中国 江苏省 南京 · China Telecom AS137702');
});

test('ipwho.is 失败时回退 ipapi.co', async () => {
  clearIpCache();
  const fetchImpl = async (url) => {
    if (url.includes('ipwho.is')) {
      return jsonResponse({}, 503);
    }
    return jsonResponse({
      ip: '8.8.8.8',
      country_name: 'United States',
      region: 'California',
      city: 'Mountain View',
      org: 'Google LLC',
      asn: 'AS15169',
    });
  };

  const text = await lookupIp({ ip: '8.8.8.8', fetchImpl });
  assert.match(text, /8\.8\.8\.8：United States California Mountain View/);
  assert.match(text, /Google LLC AS15169/);
});

test('不传 IP 时拒绝查询，避免泄露机器人出口地址', async () => {
  clearIpCache();
  let called = false;
  await assert.rejects(
    lookupIp({
      fetchImpl: async () => {
        called = true;
      },
    }),
    /请提供要查询的 IP/,
  );
  assert.equal(called, false);
});

test('非法 IP 直接报错，不发请求', async () => {
  let called = false;
  await assert.rejects(
    lookupIp({
      ip: 'not-an-ip',
      fetchImpl: async () => {
        called = true;
      },
    }),
    /IPv4 或 IPv6/,
  );
  assert.equal(called, false);
});
