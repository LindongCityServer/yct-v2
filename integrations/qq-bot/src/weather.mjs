/**
 * 天气查询：配置 QQ_BOT_AMAP_KEY 时走高德天气（中文、有配额），
 * 否则回退 wttr.in 的免费 JSON 接口。
 */

const weatherDescriptions = {
  113: '晴',
  116: '多云',
  119: '阴',
  122: '阴',
  143: '雾',
  149: '霾',
  176: '阵雨',
  179: '阵雪',
  182: '雨夹雪',
  185: '冻毛毛雨',
  200: '雷阵雨',
  227: '小雪',
  230: '暴雪',
  248: '雾',
  260: '冻雾',
  263: '毛毛雨',
  266: '毛毛雨',
  281: '冻毛毛雨',
  284: '强冻毛毛雨',
  293: '小雨',
  296: '小雨',
  299: '中雨',
  302: '中雨',
  305: '大雨',
  308: '大雨',
  311: '冻雨',
  314: '冻雨',
  317: '雨夹雪',
  320: '雨夹雪',
  323: '小雪',
  326: '小雪',
  329: '中雪',
  332: '中雪',
  335: '大雪',
  338: '大雪',
  350: '冰粒',
  353: '小阵雨',
  356: '阵雨',
  359: '强阵雨',
  362: '小阵雪',
  365: '阵雪',
  368: '强阵雪',
  371: '强阵雪',
  374: '冰粒',
  377: '冰粒',
  386: '雷阵雨',
  389: '强雷阵雨',
  392: '雷阵雪',
  395: '强雷阵雪',
};

const cache = new Map();
const cacheTtlMs = 10 * 60 * 1000;
// 高德每月 5000 次，天气按小时缓存即可，避免多问几次就把额度用掉。
const amapCacheTtlMs = 60 * 60 * 1000;
const adcodeCache = new Map();

const regionNames = {
  Anhui: '安徽',
  Beijing: '北京',
  Chongqing: '重庆',
  Fujian: '福建',
  Gansu: '甘肃',
  Guangdong: '广东',
  Guangxi: '广西',
  Guizhou: '贵州',
  Hainan: '海南',
  Hebei: '河北',
  Heilongjiang: '黑龙江',
  Henan: '河南',
  Hubei: '湖北',
  Hunan: '湖南',
  'Inner Mongolia': '内蒙古',
  Jiangsu: '江苏',
  Jiangxi: '江西',
  Jilin: '吉林',
  Liaoning: '辽宁',
  Macau: '澳门',
  Ningxia: '宁夏',
  Qinghai: '青海',
  Shaanxi: '陕西',
  Shandong: '山东',
  Shanghai: '上海',
  Shanxi: '山西',
  Sichuan: '四川',
  Taiwan: '台湾',
  Tianjin: '天津',
  Tibet: '西藏',
  Xinjiang: '新疆',
  Yunnan: '云南',
  Zhejiang: '浙江',
  'Hong Kong': '香港',
};

const countryNames = {
  China: '中国',
  'Hong Kong': '中国香港',
  Macau: '中国澳门',
  Taiwan: '中国台湾',
};

// wttr.in 的 nearest_area 只给英文名；常见城市做一层中文映射，
// 避免回退时出现“Pootung”这类用户不熟悉的老拼写。
const areaNames = {
  Beijing: '北京',
  Changchun: '长春',
  Changsha: '长沙',
  Chengdu: '成都',
  Chongqing: '重庆',
  Dalian: '大连',
  Fuzhou: '福州',
  Guangzhou: '广州',
  Guiyang: '贵阳',
  Haikou: '海口',
  Hangzhou: '杭州',
  Harbin: '哈尔滨',
  Hefei: '合肥',
  Hohhot: '呼和浩特',
  Jinan: '济南',
  Kunming: '昆明',
  Lanzhou: '兰州',
  Lhasa: '拉萨',
  Nanchang: '南昌',
  Nanjing: '南京',
  Nanning: '南宁',
  Ningbo: '宁波',
  Pootung: '浦东',
  Pudong: '浦东',
  Qingdao: '青岛',
  Sanya: '三亚',
  Shanghai: '上海',
  Shenyang: '沈阳',
  Shenzhen: '深圳',
  Shijiazhuang: '石家庄',
  Suzhou: '苏州',
  Taiyuan: '太原',
  Tianjin: '天津',
  Urumqi: '乌鲁木齐',
  Wuhan: '武汉',
  Xiamen: '厦门',
  Xian: '西安',
  "Xi'an": '西安',
  Xining: '西宁',
  Yinchuan: '银川',
  Zhengzhou: '郑州',
};

export async function fetchWeather({
  city,
  amapKey = '',
  timeoutMs = 12_000,
  fetchImpl = fetch,
  now = Date.now,
} = {}) {
  const name = String(city ?? '').trim();
  if (!name) {
    throw new Error(
      '还没有配置天气城市。请在 .env 里填 QQ_BOT_WEATHER_CITY，例如 QQ_BOT_WEATHER_CITY=上海。',
    );
  }

  const key = String(amapKey ?? '').trim();
  const cacheKey = `${key ? 'amap' : 'wttr'}:${name}`;
  const cached = cache.get(cacheKey);
  const timestamp = now();
  if (cached && cached.expiresAt > timestamp) {
    return cached.text;
  }

  const text = key
    ? await requestAmapWeather(name, key, { timeoutMs, fetchImpl })
    : await requestWttrWeather(name, { timeoutMs, fetchImpl });
  cache.set(cacheKey, {
    expiresAt: timestamp + (key ? amapCacheTtlMs : cacheTtlMs),
    text,
  });
  return text;
}

async function requestAmapWeather(city, amapKey, { timeoutMs, fetchImpl }) {
  const location = await resolveAmapLocation(city, amapKey, { timeoutMs, fetchImpl });
  const [livePayload, forecastPayload] = await Promise.all([
    getAmapJson(
      `https://restapi.amap.com/v3/weather/weatherInfo?key=${encodeURIComponent(amapKey)}&city=${location.adcode}&extensions=base`,
      { timeoutMs, fetchImpl },
    ),
    getAmapJson(
      `https://restapi.amap.com/v3/weather/weatherInfo?key=${encodeURIComponent(amapKey)}&city=${location.adcode}&extensions=all`,
      { timeoutMs, fetchImpl },
    ),
  ]);

  const live = livePayload?.lives?.[0];
  const forecast = forecastPayload?.forecasts?.[0];
  const casts = Array.isArray(forecast?.casts) ? forecast.casts.slice(0, 2) : [];
  const lines = [];

  if (live) {
    const parts = [
      `${live.temperature}℃`,
      live.weather,
      live.humidity ? `湿度 ${live.humidity}%` : '',
      live.winddirection ? `${live.winddirection}风 ${live.windpower}级` : '',
    ].filter(Boolean);
    lines.push(`现在 ${parts.join('、')}。`);
  }

  for (const [index, cast] of casts.entries()) {
    const parts = [
      `${cast.nighttemp}~${cast.daytemp}℃`,
      `白天${cast.dayweather}`,
      cast.nightweather && cast.nightweather !== cast.dayweather ? `夜间${cast.nightweather}` : '',
      cast.daywind ? `${cast.daywind}风 ${cast.daypower}级` : '',
    ].filter(Boolean);
    lines.push(`${index === 0 ? '今天' : '明天'} ${parts.join('、')}。`);
  }

  if (lines.length === 0) {
    throw new Error(`高德没有返回“${city}”的天气数据。`);
  }

  const report = shortTime(live?.reporttime || forecast?.reporttime);
  const place = formatAmapPlace({
    province: live?.province || forecast?.province || location.province,
    city: live?.city || forecast?.city || location.city,
    district: location.district,
    fallback: city,
  });
  return `${place}天气${report ? `（${report}更新）` : ''}：\n${lines.join('\n')}`;
}

async function resolveAmapLocation(city, amapKey, options) {
  const cached = adcodeCache.get(city);
  if (cached) {
    return cached;
  }
  const payload = await getAmapJson(
    `https://restapi.amap.com/v3/geocode/geo?key=${encodeURIComponent(amapKey)}&address=${encodeURIComponent(city)}`,
    options,
  );
  const geocode = payload?.geocodes?.[0];
  const adcode = textValue(geocode?.adcode);
  if (!adcode) {
    throw new Error(`高德没有找到“${city}”这个城市，请把 QQ_BOT_WEATHER_CITY 改成真实城市名。`);
  }
  const location = {
    adcode,
    province: textValue(geocode?.province),
    city: textValue(geocode?.city),
    district: textValue(geocode?.district),
  };
  adcodeCache.set(city, location);
  return location;
}

async function getAmapJson(url, { timeoutMs, fetchImpl }) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new Error(`高德天气连接失败：${error?.message ?? '网络错误'}`);
  }
  if (!response.ok) {
    throw new Error(`高德天气返回 HTTP ${response.status}`);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('高德天气返回了无法解析的数据。');
  }
  if (String(payload?.status) !== '1') {
    throw new Error(
      `高德天气调用失败：${payload?.info ?? '未知错误'}（${payload?.infocode ?? '-'}）`,
    );
  }
  return payload;
}

function shortTime(value) {
  const text = String(value ?? '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2})/.exec(text);
  return match ? `${match[2]}-${match[3]} ${match[4]}` : '';
}

async function requestWttrWeather(city, { timeoutMs, fetchImpl }) {
  let response;
  try {
    response = await fetchImpl(`https://wttr.in/${encodeURIComponent(city)}?format=j1&lang=zh`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; yct-qq-bot/1.0)',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new Error(`天气服务连接失败：${error?.message ?? '网络错误'}`);
  }
  if (!response.ok) {
    throw new Error(`天气服务返回 HTTP ${response.status}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('天气服务返回了无法解析的数据。');
  }

  const current = payload?.current_condition?.[0];
  if (!current) {
    throw new Error(`没查到“${city}”的天气，请把 QQ_BOT_WEATHER_CITY 改成真实城市名。`);
  }

  const lines = [];
  const currentParts = [
    `${round(current.temp_C)}℃`,
    describeWeather(current.weatherCode),
    `体感 ${round(current.FeelsLikeC)}℃`,
    `湿度 ${round(current.humidity)}%`,
    `风 ${round(current.windspeedKmph)} km/h`,
  ].filter(Boolean);
  lines.push(`现在 ${currentParts.join('、')}。`);

  const days = Array.isArray(payload.weather) ? payload.weather.slice(0, 2) : [];
  for (const [index, day] of days.entries()) {
    const rain = maxRainChance(day?.hourly);
    const parts = [
      `${round(day?.mintempC)}~${round(day?.maxtempC)}℃`,
      describeWeather(day?.hourly?.[4]?.weatherCode ?? day?.hourly?.[0]?.weatherCode),
      rain === null ? '' : `降水概率 ${rain}%`,
    ].filter(Boolean);
    lines.push(`${index === 0 ? '今天' : '明天'} ${parts.join('、')}。`);
  }

  const place = formatWttrPlace({
    areaName: nestedValue(payload?.nearest_area?.[0]?.areaName),
    region: nestedValue(payload?.nearest_area?.[0]?.region),
    country: nestedValue(payload?.nearest_area?.[0]?.country),
    fallback: city,
  });
  return `${place}天气：\n${lines.join('\n')}`;
}

function maxRainChance(hourly) {
  if (!Array.isArray(hourly) || hourly.length === 0) {
    return null;
  }
  const values = hourly
    .map((item) => Number(item?.chanceofrain))
    .filter((value) => Number.isFinite(value));
  return values.length > 0 ? Math.max(...values) : null;
}

function describeWeather(code) {
  return weatherDescriptions[Number(code)] ?? '天气状况未知';
}

/**
 * 高德返回省/市/区；直接把查询词当标题会把“浦东”写成“浦东天气”，
 * 但真实数据可能是“上海市浦东新区”，所以按行政区拼出实际位置。
 */
function formatAmapPlace({ province, city, district, fallback }) {
  const provinceName = textValue(province);
  const cityName = textValue(city);
  const districtName = textValue(district);
  const ignoredDistrict = new Set(['市辖区', '县', '省直辖县级行政区划', '自治区直辖县级行政区划']);
  const parts = [];

  if (
    provinceName &&
    cityName &&
    !cityName.startsWith(provinceName) &&
    !provinceName.startsWith(cityName)
  ) {
    parts.push(provinceName);
  }
  const main = cityName || provinceName;
  if (main) {
    parts.push(main);
  }
  if (
    districtName &&
    !ignoredDistrict.has(districtName) &&
    districtName !== cityName &&
    districtName !== provinceName &&
    !main?.endsWith(districtName)
  ) {
    parts.push(districtName);
  }

  return parts.join('') || textValue(fallback) || '当地';
}

/**
 * wttr.in 只给英文的 nearest_area，但至少能说明它实际定位到了哪个观测点，
 * 不再把用户输入的“上海”原样当标题。
 */
function formatWttrPlace({ areaName, region, country, fallback }) {
  const area = textValue(areaName);
  const regionName = textValue(region);
  const countryName = textValue(country);
  const regionLabel = regionNames[regionName] || regionName;
  const areaLabel = areaNames[area] || area;
  const countryLabel = countryNames[countryName] || countryName;
  const main = regionLabel || areaLabel;
  if (!main) {
    return textValue(fallback) ? `${textValue(fallback)}附近` : '当地';
  }

  const detail =
    areaLabel && !samePlaceName(area, regionName) && !samePlaceName(areaLabel, main)
      ? areaLabel
      : '';
  const parenthetical = [detail, countryLabel].filter(Boolean).join('，');
  return parenthetical ? `${main}（${parenthetical}）` : main;
}

function nestedValue(value) {
  if (Array.isArray(value)) {
    return textValue(value[0]?.value);
  }
  if (value && typeof value === 'object') {
    return textValue(value.value);
  }
  return textValue(value);
}

function samePlaceName(left, right) {
  const normalize = (value) =>
    textValue(value)
      .toLowerCase()
      .replace(/[\s,，.。-]/g, '');
  return normalize(left) === normalize(right);
}

function textValue(value) {
  return Array.isArray(value) ? textValue(value[0]) : String(value ?? '').trim();
}

function round(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 10) / 10 : '--';
}

/** 测试和手动排查时可以清缓存。 */
export function clearWeatherCache() {
  cache.clear();
  adcodeCache.clear();
}
