import assert from 'node:assert/strict';
import test from 'node:test';
import { clearWeatherCache, fetchWeather, fetchWeatherReport } from '../src/weather.mjs';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function hourly(chance, code) {
  return Array.from({ length: 8 }, () => ({
    chanceofrain: String(chance),
    weatherCode: String(code),
  }));
}

test('城市没有配置时提示填 QQ_BOT_WEATHER_CITY', async () => {
  await assert.rejects(fetchWeather({ city: '' }), /QQ_BOT_WEATHER_CITY/);
});

test('按 wttr.in 返回格式化当前天气和今明两天', async () => {
  clearWeatherCache();
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return jsonResponse({
      current_condition: [
        {
          temp_C: '15',
          FeelsLikeC: '13',
          humidity: '68',
          windspeedKmph: '11',
          weatherCode: '149',
        },
      ],
      nearest_area: [
        {
          areaName: [{ value: 'Pootung' }],
          region: [{ value: 'Shanghai' }],
          country: [{ value: 'China' }],
        },
      ],
      weather: [
        { mintempC: '13', maxtempC: '18', hourly: hourly(17, 119) },
        { mintempC: '9', maxtempC: '14', hourly: hourly(24, 116) },
      ],
    });
  };

  const text = await fetchWeather({ city: '上海', fetchImpl });
  assert.match(decodeURIComponent(calls[0]), /wttr\.in\/上海/);
  assert.match(text, /上海（浦东，中国）天气/);
  assert.doesNotMatch(text, /^上海天气/);
  assert.match(text, /现在 15℃、霾、体感 13℃、湿度 68%、风 11 km\/h/);
  assert.match(text, /今天 13~18℃、阴、降水概率 17%/);
  assert.match(text, /明天 9~14℃、多云、降水概率 24%/);

  await fetchWeather({ city: '上海', fetchImpl });
  assert.equal(calls.length, 1);
});

test('wttr 没有定位信息时标注为附近', async () => {
  clearWeatherCache();
  const text = await fetchWeather({
    city: '上海',
    fetchImpl: async () =>
      jsonResponse({
        current_condition: [
          {
            temp_C: '15',
            FeelsLikeC: '13',
            humidity: '68',
            windspeedKmph: '11',
            weatherCode: '149',
          },
        ],
        weather: [],
      }),
  });
  assert.match(text, /^上海附近天气/);
});

test('配置高德 Key 时优先使用高德天气', async () => {
  clearWeatherCache();
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('/geocode/geo')) {
      return jsonResponse({ status: '1', info: 'OK', geocodes: [{ adcode: '310000' }] });
    }
    if (url.includes('extensions=base')) {
      return jsonResponse({
        status: '1',
        info: 'OK',
        lives: [
          {
            province: '上海',
            city: '上海市',
            weather: '晴',
            temperature: '15',
            winddirection: '西北',
            windpower: '≤3',
            humidity: '68',
            reporttime: '2026-11-17 20:00:00',
          },
        ],
      });
    }
    return jsonResponse({
      status: '1',
      info: 'OK',
      forecasts: [
        {
          city: '上海市',
          adcode: '310000',
          reporttime: '2026-11-17 20:00:00',
          casts: [
            {
              date: '2026-11-17',
              dayweather: '晴',
              nightweather: '晴',
              daytemp: '18',
              nighttemp: '13',
              daywind: '西北',
              daypower: '1-3',
            },
            {
              date: '2026-11-18',
              dayweather: '多云',
              nightweather: '阴',
              daytemp: '17',
              nighttemp: '12',
              daywind: '东',
              daypower: '1-3',
            },
          ],
        },
      ],
    });
  };

  const text = await fetchWeather({ city: '上海', amapKey: 'amap-key', fetchImpl });
  assert.equal(calls.length, 3);
  assert.match(calls[0], /geocode\/geo\?key=amap-key&address=%E4%B8%8A%E6%B5%B7/);
  assert.match(calls[1], /city=310000&extensions=base/);
  assert.match(text, /上海市天气（11-17 20:00更新）/);
  assert.match(text, /现在 15℃、晴、湿度 68%、西北风 ≤3级/);
  assert.match(text, /今天 13~18℃、白天晴、西北风 1-3级/);
  assert.match(text, /明天 12~17℃、白天多云、夜间阴、东风 1-3级/);

  await fetchWeather({ city: '上海', amapKey: 'amap-key', fetchImpl });
  assert.equal(calls.length, 3);
});

test('高德按实际行政区显示地点，不只重复查询词', async () => {
  clearWeatherCache();
  const fetchImpl = async (url) => {
    if (url.includes('/geocode/geo')) {
      return jsonResponse({
        status: '1',
        info: 'OK',
        geocodes: [
          {
            adcode: '310115',
            province: '上海市',
            city: '上海市',
            district: '浦东新区',
          },
        ],
      });
    }
    if (url.includes('extensions=base')) {
      return jsonResponse({
        status: '1',
        info: 'OK',
        lives: [
          {
            province: '上海',
            city: '上海市',
            weather: '晴',
            temperature: '15',
            humidity: '68',
            reporttime: '2026-11-17 20:00:00',
          },
        ],
      });
    }
    return jsonResponse({
      status: '1',
      info: 'OK',
      forecasts: [
        {
          city: '上海市',
          province: '上海',
          reporttime: '2026-11-17 20:00:00',
          casts: [
            {
              dayweather: '晴',
              nightweather: '晴',
              daytemp: '18',
              nighttemp: '13',
            },
          ],
        },
      ],
    });
  };

  const text = await fetchWeather({ city: '浦东', amapKey: 'amap-key', fetchImpl });
  assert.match(text, /^上海市浦东新区天气/);
  assert.doesNotMatch(text, /^浦东天气/);
});

test('高德 Key 无效时返回明确错误', async () => {
  clearWeatherCache();
  await assert.rejects(
    fetchWeather({
      city: '上海',
      amapKey: 'bad-key',
      fetchImpl: async (url) => {
        if (url.includes('/geocode/geo')) {
          return jsonResponse({ status: '1', geocodes: [{ adcode: '310000' }] });
        }
        return jsonResponse({ status: '0', info: 'INVALID_USER_KEY', infocode: '10001' });
      },
    }),
    /高德天气调用失败：INVALID_USER_KEY/,
  );
});

test('城市查不到时提示换真实城市名', async () => {
  clearWeatherCache();
  await assert.rejects(
    fetchWeather({
      city: '临东市',
      fetchImpl: async () => jsonResponse({ current_condition: [] }),
    }),
    /没查到“临东市”的天气/,
  );
});

test('天气服务失败时给出可读错误', async () => {
  clearWeatherCache();
  await assert.rejects(
    fetchWeather({ city: '上海', fetchImpl: async () => jsonResponse({}, 503) }),
    /HTTP 503/,
  );
});

test('天气报告带日出日落、昼夜阶段和预警信息', async () => {
  clearWeatherCache();
  const now = () => Date.parse('2026-11-24T12:00:00+08:00');
  const fetchImpl = async (url) => {
    if (url.startsWith('https://wttr.in/')) {
      return jsonResponse({
        current_condition: [
          {
            temp_C: '15',
            FeelsLikeC: '13',
            humidity: '68',
            windspeedKmph: '11',
            weatherCode: '113',
          },
        ],
        nearest_area: [
          {
            areaName: [{ value: 'Pudong' }],
            region: [{ value: 'Shanghai' }],
            country: [{ value: 'China' }],
            latitude: '31.2304',
            longitude: '121.4737',
          },
        ],
        weather: [
          {
            mintempC: '13',
            maxtempC: '18',
            astronomy: [{ sunrise: '06:30 AM', sunset: '04:58 PM' }],
            hourly: hourly(10, 113),
          },
          {
            mintempC: '9',
            maxtempC: '14',
            astronomy: [{ sunrise: '06:31 AM', sunset: '04:57 PM' }],
            hourly: hourly(20, 116),
          },
        ],
      });
    }
    if (url.includes('nmc.cn/rest/findAlarm')) {
      return jsonResponse({
        code: 0,
        data: {
          page: {
            list: [
              {
                alertid: 'a1',
                issuetime: '2026/11/24 10:00',
                title: '上海市气象台发布大风蓝色预警信号',
              },
            ],
          },
          provinceAlarms: [],
        },
      });
    }
    throw new Error(`unexpected ${url}`);
  };

  const report = await fetchWeatherReport({ city: '上海', fetchImpl, now });
  assert.equal(report.place, '上海（浦东，中国）');
  assert.equal(report.current.temp, '15');
  assert.equal(report.days.length, 2);
  assert.deepEqual(report.sun, {
    sunrise: '06:30',
    sunset: '16:58',
    phase: 'day',
  });
  assert.equal(report.alerts.length, 1);
  assert.equal(report.alerts[0].level, '蓝色');
  assert.equal(report.alerts[0].type, '大风');
  assert.match(report.text, /预警：上海市气象台发布大风蓝色预警信号（2026\/11\/24 10:00 发布）/);
});

test('高德报告按经纬度计算日出日落', async () => {
  clearWeatherCache();
  const fetchImpl = async (url) => {
    if (url.includes('/geocode/geo')) {
      return jsonResponse({
        status: '1',
        geocodes: [
          {
            adcode: '310000',
            province: '上海市',
            city: '上海市',
            district: '浦东新区',
            location: '121.473701,31.230416',
          },
        ],
      });
    }
    if (url.includes('extensions=base')) {
      return jsonResponse({
        status: '1',
        lives: [
          {
            province: '上海',
            city: '上海市',
            weather: '晴',
            temperature: '15',
            reporttime: '2026-11-24 12:00:00',
          },
        ],
      });
    }
    return jsonResponse({
      status: '1',
      forecasts: [
        {
          city: '上海市',
          province: '上海',
          reporttime: '2026-11-24 12:00:00',
          casts: [
            {
              date: '2026-11-24',
              dayweather: '晴',
              nightweather: '晴',
              daytemp: '18',
              nighttemp: '13',
            },
          ],
        },
      ],
    });
  };
  const now = () => Date.parse('2026-11-24T12:00:00+08:00');
  const report = await fetchWeatherReport({
    city: '上海',
    amapKey: 'amap-key',
    fetchImpl,
    now,
    includeAlerts: false,
  });
  assert.match(report.sun.sunrise, /^06:\d\d$/);
  assert.match(report.sun.sunset, /^16:\d\d$/);
  assert.equal(report.sun.phase, 'day');
  assert.ok(report.alertKeywords.includes('上海'));
  assert.ok(report.alertKeywords.includes('浦东'));
});

test('预警接口不可用时天气报告照常返回', async () => {
  clearWeatherCache();
  const fetchImpl = async (url) => {
    if (url.startsWith('https://wttr.in/')) {
      return jsonResponse({
        current_condition: [{ temp_C: '15', weatherCode: '113' }],
        weather: [],
      });
    }
    throw new Error('alarm service down');
  };
  const report = await fetchWeatherReport({ city: '上海', fetchImpl });
  assert.equal(report.alerts.length, 0);
  assert.match(report.text, /上海附近天气/);
});
