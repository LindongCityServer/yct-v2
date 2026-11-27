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
const alertCache = new Map();
const alertCacheTtlMs = 10 * 60 * 1000;

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

/**
 * 兼容旧调用：只返回格式化文本。
 * 新代码（天气卡片）用 `fetchWeatherReport` 拿结构化数据，文本与旧版保持一致。
 */
export async function fetchWeather(options = {}) {
  const report = await fetchWeatherReport({ ...options, includeAlerts: false });
  return report.text;
}

/**
 * 天气查询结构化结果：卡片直接使用 current / days / alerts / sun，
 * 不再从格式化文本里正则反解。文本仍保留给群聊回复。
 */
export async function fetchWeatherReport({
  city,
  amapKey = '',
  timeoutMs = 12_000,
  fetchImpl = fetch,
  now = Date.now,
  includeAlerts = true,
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
  // 预警列表和天气请求并行拉取：预警接口慢时不会叠加到天气查询耗时上。
  const alertItemsPromise = includeAlerts
    ? loadNmcAlarmItems({
        fetchImpl,
        timeoutMs: Math.min(timeoutMs, 6_000),
        now,
      })
    : Promise.resolve([]);
  let report = cached && cached.expiresAt > timestamp ? cached.report : undefined;
  if (!report) {
    report = key
      ? await requestAmapWeather(name, key, { timeoutMs, fetchImpl, now })
      : await requestWttrWeather(name, { timeoutMs, fetchImpl, now });
    cache.set(cacheKey, {
      expiresAt: timestamp + (key ? amapCacheTtlMs : cacheTtlMs),
      report,
    });
  }

  const alertItems = includeAlerts ? await alertItemsPromise : [];
  const alerts = includeAlerts ? pickWeatherAlerts(alertItems, report.alertLocation ?? {}) : [];
  // 天气本身缓存 10–60 分钟，但昼夜阶段必须按当前时刻重算，否则傍晚会继续用白天的主题色。
  // minutes 用于卡片在天空色矩阵之间做连续取色（日出/日落之间的渐变）。
  const sun = report.sun
    ? {
        ...report.sun,
        phase: resolveDayPhase(report.sun, timestamp),
        minutes: localMinuteOfDay(timestamp),
      }
    : undefined;
  return {
    ...report,
    sun,
    alerts,
    text: appendWeatherAlertText(report.text, alerts),
  };
}

/** 预警插在标题行之后，保持原有“现在 / 今天 / 明天”行不变。 */
function appendWeatherAlertText(text, alerts) {
  if (!Array.isArray(alerts) || alerts.length === 0) {
    return text;
  }
  const lines = text.split('\n');
  const alertLines = alerts.map(
    (alert) => `预警：${alert.title}${alert.issuedAt ? `（${alert.issuedAt} 发布）` : ''}`,
  );
  lines.splice(1, 0, ...alertLines);
  return lines.join('\n');
}

const weatherMunicipalities = new Set(['北京', '上海', '天津', '重庆']);

function weatherDayLabel(day, index) {
  if (index === 0) {
    return '今天';
  }
  if (index === 1) {
    return '明天';
  }
  const match = /^\d{4}-(\d{2})-(\d{2})/u.exec(textValue(day?.date));
  return match ? `${match[1]}-${match[2]}` : `第 ${index + 1} 天`;
}

function stripWeatherAdminSuffix(value) {
  return textValue(value).replace(
    /(?:特别行政区|自治区|自治州|自治县|自治旗|新区|开发区|高新区|地区|盟|旗|省|市|区|县)$/u,
    '',
  );
}

/**
 * 卡片标题只写地点本身，不写省；副标题用「省+市」补足上下文。
 * 查询的是区名时标题写区名，否则写市名，这样「铁西区」能通过副标题的「辽宁沈阳」区分。
 */
function resolveWeatherLocationLabels(input) {
  const province = stripWeatherAdminSuffix(input.province);
  const city = stripWeatherAdminSuffix(input.city);
  const district = stripWeatherAdminSuffix(input.district);
  const query = String(input.query ?? '')
    .replace(/\s+/gu, '')
    .trim();
  const queryName = stripWeatherAdminSuffix(query);
  const titlePlace =
    district &&
    queryName &&
    (queryName === district || queryName.includes(district) || district.includes(queryName))
      ? district
      : city || district || province || '当地';
  const regionParts = [];
  if (province && province !== city) {
    regionParts.push(province);
  }
  if (city) {
    regionParts.push(city);
  } else if (district) {
    regionParts.push(district);
  }
  const regionLabel = regionParts.join('') || province || city || district || '当地';
  return {
    cardPlace: titlePlace,
    regionLabel,
    location: {
      province: textValue(input.province),
      city: textValue(input.city),
      district: textValue(input.district),
    },
  };
}

/**
 * 高德 geocode 返回用户命中地址的省 / 市 / 区；weatherInfo 的 city 只表示
 * “查询到的区域名”：查询区县 adcode 时会直接返回区名（city=110101 → 东城区），
 * 不能当市名用，否则沈阳铁西 / 鞍山铁西都会写成“辽宁铁西”，同省重名就分不开。
 * 所以优先用 geocode 的行政区划，天气接口字段只在 geocode 缺省时兜底。
 */
function resolveAmapAdministrativeNames({ location, live, forecast }) {
  const geocodeProvince = textValue(location?.province);
  const geocodeCity = textValue(location?.city);
  const geocodeDistrict = textValue(location?.district);
  const weatherProvince = textValue(live?.province) || textValue(forecast?.province);
  const weatherArea = textValue(live?.city) || textValue(forecast?.city);
  const weatherCity = isAmapDistrictName(weatherArea, geocodeDistrict) ? '' : weatherArea;
  return {
    provinceName: geocodeProvince || weatherProvince,
    cityName: geocodeCity || weatherCity,
    districtName: geocodeDistrict,
  };
}

/** 天气接口按区县 adcode 查询时 city 返回区名；和 geocode 的 district 对得上就不当市名。 */
function isAmapDistrictName(areaName, districtName) {
  const area = textValue(areaName);
  if (!area) {
    return false;
  }
  if (districtName && stripWeatherAdminSuffix(area) === stripWeatherAdminSuffix(districtName)) {
    return true;
  }
  return /(?:区|县|旗)$/u.test(area);
}

function resolveWttrLocationLabels(query, regionLabel, areaLabel) {
  const isMunicipality = weatherMunicipalities.has(regionLabel);
  return resolveWeatherLocationLabels({
    query,
    province: regionLabel,
    city: isMunicipality ? regionLabel : areaLabel || regionLabel,
    district: isMunicipality && areaLabel !== regionLabel ? areaLabel : '',
  });
}

async function requestAmapWeather(city, amapKey, { timeoutMs, fetchImpl, now = Date.now }) {
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
  const casts = Array.isArray(forecast?.casts) ? forecast.casts.slice(0, 5) : [];
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
    lines.push(`${weatherDayLabel(cast, index)} ${parts.join('、')}。`);
  }

  if (lines.length === 0) {
    throw new Error(`高德没有返回“${city}”的天气数据。`);
  }

  const report = shortTime(live?.reporttime || forecast?.reporttime);
  // 高德天气接口的 city 是“查询到的区域名”：按区县 adcode 查询时返回区名本身
  // （例如 city=110101 → 东城区），直接当市名会把“沈阳市铁西区”写成“辽宁铁西”。
  // geocode 返回的省 / 市 / 区才是用户查询命中的完整行政区划，优先用它补全。
  const { provinceName, cityName, districtName } = resolveAmapAdministrativeNames({
    location,
    live,
    forecast,
  });
  const place = formatAmapPlace({
    province: provinceName,
    city: cityName,
    district: districtName,
    fallback: city,
  });
  const labels = resolveWeatherLocationLabels({
    query: city,
    province: provinceName,
    city: cityName,
    district: districtName,
  });
  const coordinates = parseCoordinates(location.location);
  const date = textValue(casts[0]?.date) || localDateKey(now());
  const sunTimes = coordinates ? computeSunTimes(coordinates, date) : {};
  const sun =
    sunTimes.sunrise && sunTimes.sunset
      ? { ...sunTimes, phase: resolveDayPhase(sunTimes, now()) }
      : undefined;
  const current = {
    temp: textValue(live?.temperature) || '--',
    condition: textValue(live?.weather) || '天气未知',
    feels: '',
    humidity: textValue(live?.humidity),
    wind: live?.winddirection ? `${live.winddirection}风 ${live.windpower}级` : '',
  };
  const days = casts.map((cast, index) => ({
    label: weatherDayLabel(cast, index),
    low: textValue(cast.nighttemp),
    high: textValue(cast.daytemp),
    condition: textValue(cast.dayweather),
  }));
  return {
    text: `${place}天气${report ? `（${report}更新）` : ''}：\n${lines.join('\n')}`,
    place,
    cardPlace: labels.cardPlace,
    regionLabel: labels.regionLabel,
    location: labels.location,
    alertLocation: labels.location,
    updated: report ? `${report}更新` : '',
    current,
    days,
    sun,
    coordinates,
    alertKeywords: buildAlertKeywords(provinceName, cityName, districtName, city),
    source: 'amap',
  };
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
    location: textValue(geocode?.location),
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

async function requestWttrWeather(city, { timeoutMs, fetchImpl, now = Date.now }) {
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

  const weatherDays = Array.isArray(payload.weather) ? payload.weather.slice(0, 5) : [];
  const days = [];
  for (const [index, day] of weatherDays.entries()) {
    const rain = maxRainChance(day?.hourly);
    const condition = describeWeather(
      day?.hourly?.[4]?.weatherCode ?? day?.hourly?.[0]?.weatherCode,
    );
    const parts = [
      `${round(day?.mintempC)}~${round(day?.maxtempC)}℃`,
      condition,
      rain === null ? '' : `降水概率 ${rain}%`,
    ].filter(Boolean);
    lines.push(`${weatherDayLabel(day, index)} ${parts.join('、')}。`);
    days.push({
      label: weatherDayLabel(day, index),
      low: String(round(day?.mintempC)),
      high: String(round(day?.maxtempC)),
      condition,
    });
  }

  const place = formatWttrPlace({
    areaName: nestedValue(payload?.nearest_area?.[0]?.areaName),
    region: nestedValue(payload?.nearest_area?.[0]?.region),
    country: nestedValue(payload?.nearest_area?.[0]?.country),
    fallback: city,
  });
  const astronomy = weatherDays[0]?.astronomy?.[0];
  const sunTimes = {
    sunrise: convertTo24Hour(astronomy?.sunrise),
    sunset: convertTo24Hour(astronomy?.sunset),
  };
  const sun =
    sunTimes.sunrise && sunTimes.sunset
      ? { ...sunTimes, phase: resolveDayPhase(sunTimes, now()) }
      : undefined;
  const areaName = nestedValue(payload?.nearest_area?.[0]?.areaName);
  const region = nestedValue(payload?.nearest_area?.[0]?.region);
  const regionLabel = regionNames[region] || region;
  const areaLabel = areaNames[areaName] || areaName;
  const labels = resolveWttrLocationLabels(city, regionLabel, areaLabel);
  const feels = roundOrEmpty(current.FeelsLikeC);
  const humidity = roundOrEmpty(current.humidity);
  const windSpeed = roundOrEmpty(current.windspeedKmph);
  const coordinates = parseCoordinates(
    [
      nestedValue(payload?.nearest_area?.[0]?.latitude),
      nestedValue(payload?.nearest_area?.[0]?.longitude),
    ].join(','),
  );
  return {
    text: `${place}天气：\n${lines.join('\n')}`,
    place,
    cardPlace: labels.cardPlace,
    regionLabel: labels.regionLabel,
    location: labels.location,
    alertLocation: labels.location,
    updated: '',
    current: {
      temp: String(round(current.temp_C)),
      condition: describeWeather(current.weatherCode),
      feels,
      humidity,
      wind: windSpeed ? `风 ${windSpeed} km/h` : '',
    },
    days,
    sun,
    coordinates,
    alertKeywords: buildAlertKeywords(regionLabel, areaLabel, '', city),
    source: 'wttr',
  };
}

/**
 * 国家气象中心公开预警列表：不依赖高德 Key，失败时静默降级为空。
 * 只取最新 100 条，再按省 / 市 / 区关键词过滤标题；城市级预警通常都在这一页里。
 */
async function loadNmcAlarmItems({ fetchImpl, timeoutMs, now = Date.now }) {
  const cached = alertCache.get('national');
  const timestamp = now();
  if (cached && cached.expiresAt > timestamp) {
    return cached.items;
  }

  let items = [];
  try {
    const response = await fetchImpl('https://www.nmc.cn/rest/findAlarm?pageNo=1&pageSize=100', {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; yct-qq-bot/1.0)',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.ok) {
      const payload = await response.json();
      const data = payload?.data;
      items = [
        ...(Array.isArray(data?.page?.list) ? data.page.list : []),
        ...(Array.isArray(data?.provinceAlarms) ? data.provinceAlarms : []),
      ];
    }
  } catch {
    // 预警是附加信息：接口不可用时天气卡片仍然照常出。
    items = [];
  }
  alertCache.set('national', { expiresAt: timestamp + alertCacheTtlMs, items });
  return items;
}

function pickWeatherAlerts(items, location) {
  const province = stripWeatherAdminSuffix(location?.province);
  const city = stripWeatherAdminSuffix(location?.city);
  const district = stripWeatherAdminSuffix(location?.district);
  if (!province && !city && !district) {
    return [];
  }
  const seen = new Set();
  const alerts = [];
  for (const item of Array.isArray(items) ? items : []) {
    const title = textValue(item?.title);
    if (!title || !isAlertForLocation(title, { province, city, district })) {
      continue;
    }
    if (seen.has(title)) {
      continue;
    }
    seen.add(title);
    const level = /(蓝色|黄色|橙色|红色)预警/u.exec(title)?.[1] ?? '';
    const type = /发布(.+?)(?:蓝色|黄色|橙色|红色)预警/u.exec(title)?.[1]?.trim() ?? '';
    alerts.push({
      title,
      level,
      type,
      issuedAt: textValue(item?.issuetime),
    });
  }
  return alerts;
}

/**
 * 预警标题归属判断：
 * - 标题命中城市：直接算本地；
 * - 只命中区县：必须同时命中省，且区名前面的市名就是当前城市，
 *   避免「铁西区」跨市 / 跨省重复（沈阳铁西、鞍山铁西、四平铁西）；
 * - 只命中省：若省名后面紧跟另一个市/区/县则排除，否则视为全省预警保留。
 */
function isAlertForLocation(title, { province, city, district }) {
  const hasProvince = Boolean(province) && title.includes(province);
  const hasCity = Boolean(city) && title.includes(city);
  const hasDistrict = Boolean(district) && title.includes(district);
  if (hasCity) {
    return true;
  }
  if (hasDistrict) {
    return hasProvince && isDistrictAlertForCity(title, province, city, district);
  }
  if (!hasProvince) {
    return false;
  }
  const afterProvince = title.slice(title.indexOf(province) + province.length);
  const otherPlace = /^([\u4e00-\u9fa5]{2,10}?(?:市|区|县|旗|盟|州))/u.exec(afterProvince)?.[1];
  if (!otherPlace) {
    return true;
  }
  return (
    Boolean(city && otherPlace.startsWith(city)) ||
    Boolean(district && otherPlace.startsWith(district))
  );
}

/**
 * 同省同名区县（沈阳铁西 / 鞍山铁西）的预警标题都会出现“铁西”，
 * 还要看区名前面的市名是不是当前城市，否则预警会串到另一张卡片上。
 * 标题里没写市名时无法区分，按原来的省级规则处理。
 */
function isDistrictAlertForCity(title, province, city, district) {
  if (!city) {
    return true;
  }
  const provinceIndex = title.indexOf(province);
  const districtIndex = title.indexOf(district);
  const between = title.slice(provinceIndex + province.length, districtIndex);
  const cityName = stripWeatherAdminSuffix(
    between.replace(/^(?:特别行政区|自治区|自治州|自治县|自治旗|省|市|地区|盟|旗|区|县)+/u, ''),
  );
  return !cityName || cityName === city;
}

/** 行政区名去掉通用后缀，保留 2 字以上关键词，用于兼容旧调用和排查。 */
function buildAlertKeywords(...names) {
  const keywords = [];
  for (const name of names) {
    const text = textValue(name);
    if (!text) {
      continue;
    }
    const stripped = stripWeatherAdminSuffix(text);
    for (const value of [stripped, text]) {
      if (Array.from(value).length >= 2) {
        keywords.push(value);
      }
    }
  }
  return [...new Set(keywords)];
}

function parseCoordinates(value) {
  const text = textValue(value);
  if (!text) {
    return undefined;
  }
  const [longitudeText, latitudeText] = text.split(',');
  const longitude = Number(longitudeText);
  const latitude = Number(latitudeText);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return undefined;
  }
  return { longitude, latitude };
}

function convertTo24Hour(value) {
  const text = textValue(value);
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/iu.exec(text);
  if (!match) {
    return '';
  }
  let hour = Number(match[1]);
  const minute = match[2];
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hour < 12) {
    hour += 12;
  } else if (meridiem === 'AM' && hour === 12) {
    hour = 0;
  }
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
    return '';
  }
  return `${String(hour).padStart(2, '0')}:${minute}`;
}

/** 主要城市都在 UTC+8；这里用固定偏移算当地日期 / 分钟，避免依赖运行机器时区。 */
function localDateKey(nowMs) {
  const date = new Date(nowMs + 8 * 60 * 60 * 1000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function localMinuteOfDay(nowMs) {
  const date = new Date(nowMs + 8 * 60 * 60 * 1000);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

/**
 * 用 NOAA 的近似公式按经纬度和日期算日出日落（当地时间，UTC+8）。
 * 误差通常在一两分钟内，足够决定卡片主题色和“夜间”标签。
 */
function computeSunTimes({ longitude, latitude }, dateText) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(textValue(dateText));
  if (!match) {
    return {};
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dayOfYear =
    Math.floor((Date.UTC(year, month - 1, day, 12) - Date.UTC(year, 0, 1, 12)) / 86_400_000) + 1;
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1 + 0.5);
  const equationOfTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const declination =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  const latitudeRadians = (latitude * Math.PI) / 180;
  const zenith = (90.833 * Math.PI) / 180;
  const cosHourAngle =
    Math.cos(zenith) / (Math.cos(latitudeRadians) * Math.cos(declination)) -
    Math.tan(latitudeRadians) * Math.tan(declination);
  if (cosHourAngle < -1 || cosHourAngle > 1) {
    return {};
  }
  const hourAngle = (Math.acos(cosHourAngle) * 180) / Math.PI;
  const sunriseUtcMinutes = 720 - 4 * (longitude + hourAngle) - equationOfTime;
  const sunsetUtcMinutes = 720 - 4 * (longitude - hourAngle) - equationOfTime;
  return {
    sunrise: formatLocalMinutes(sunriseUtcMinutes + 8 * 60),
    sunset: formatLocalMinutes(sunsetUtcMinutes + 8 * 60),
  };
}

function formatLocalMinutes(value) {
  const minutes = ((Math.round(value) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function parseClockMinutes(value) {
  const match = /^(\d{2}):(\d{2})$/u.exec(textValue(value));
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function resolveDayPhase(sun, nowMs) {
  const sunrise = parseClockMinutes(sun?.sunrise);
  const sunset = parseClockMinutes(sun?.sunset);
  if (sunrise === null || sunset === null) {
    return undefined;
  }
  const current = localMinuteOfDay(nowMs);
  if (current < sunrise - 45 || current > sunset + 45) {
    return 'night';
  }
  if (current < sunrise + 45) {
    return 'dawn';
  }
  if (current > sunset - 45) {
    return 'dusk';
  }
  return 'day';
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

/** 卡片字段缺数据时留空，不把占位符渲染成“体感 --°”。 */
function roundOrEmpty(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(Math.round(numeric * 10) / 10) : '';
}

/** 测试和手动排查时可以清缓存。 */
export function clearWeatherCache() {
  cache.clear();
  adcodeCache.clear();
  alertCache.clear();
}
