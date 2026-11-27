import assert from 'node:assert/strict';
import test from 'node:test';
import { renderCardPng } from '../src/card-render.mjs';
import { buildQqBotCardSvg, normalizeCard } from '../src/card-renderer.mjs';

test('天气卡片按零下气温显示，不再退回占位符', () => {
  const svg = buildQqBotCardSvg({
    type: 'weather',
    place: '瓦房店市',
    date: '2026-11-20',
    updated: '11-20 07:01 更新',
    current: { temp: '-5', condition: '多云', feels: '', humidity: '59', wind: '北风 5级' },
    days: [{ label: '今天', low: '-5', high: '2', condition: '多云' }],
    footer: '数据来自公开天气服务',
  });
  assert.match(svg, />-5°</u);
  assert.doesNotMatch(svg, /--°/u);
});

test('天气卡片缺少气温时用占位符代替大号 --°', () => {
  const svg = buildQqBotCardSvg({
    type: 'weather',
    place: '瓦房店市',
    date: '2026-11-20',
    updated: '',
    current: { temp: '--', condition: '天气未知', feels: '', humidity: '', wind: '' },
    days: [],
    footer: '数据来自公开天气服务',
  });
  assert.doesNotMatch(svg, /--°/u);
  assert.match(svg, />—</u);
});

test('负两位数温度把天气描述右移，避免压在大号温度上', () => {
  const svg = buildQqBotCardSvg({
    type: 'weather',
    place: '瓦房店市',
    date: '2026-11-20',
    updated: '',
    current: { temp: '-15', condition: '多云', feels: '', humidity: '', wind: '' },
    days: [],
    footer: '数据来自公开天气服务',
  });
  assert.match(svg, /-15°/u);
  const match = /<text x="([\d.]+)" y="122" font-size="30"[^>]*>多云<\/text>/u.exec(svg);
  assert.ok(match);
  assert.ok(Number(match[1]) > 250);
});

test('天气卡片显示预警、日出日落和夜间标签', () => {
  const svg = buildQqBotCardSvg({
    type: 'weather',
    place: '上海市浦东新区',
    date: '2026-11-24',
    updated: '11-24 20:00更新',
    current: { temp: '8', condition: '晴', feels: '5', humidity: '76', wind: '西北风 3级' },
    days: [{ label: '今天', low: '6', high: '12', condition: '晴' }],
    alerts: [{ title: '上海市气象台发布大风蓝色预警信号', level: '蓝色', issuedAt: '11-24 10:00' }],
    sun: { sunrise: '06:32', sunset: '16:58', phase: 'night' },
  });
  assert.match(svg, /上海市气象台发布大风蓝色预警信号/u);
  assert.match(svg, /11-24 10:00 发布 · 蓝色预警/u);
  assert.match(svg, /日出 06:32 · 日落 16:58/u);
  assert.match(svg, /晴 · 夜间/u);
  assert.match(svg, /font-weight="700" fill="#111817">8°<\/text>/u);
  const height = Number(/<svg[^>]*height="(\d+)"/u.exec(svg)?.[1] ?? 0);
  assert.ok(height > 728, `带预警的卡片应加高（实际 ${height}）`);
});

test('天气卡片标题不带省名，副标题带省市并支持多天和全部预警', () => {
  const svg = buildQqBotCardSvg({
    type: 'weather',
    place: '铁西',
    region: '辽宁沈阳',
    date: '2026-11-24',
    current: { temp: '10', condition: '晴' },
    days: Array.from({ length: 5 }, (_, index) => ({
      label: index < 2 ? ['今天', '明天'][index] : `11-${26 + index}`,
      low: '5',
      high: '15',
      condition: '晴',
    })),
    alerts: Array.from({ length: 3 }, (_, index) => ({
      title: `辽宁省沈阳市铁西区气象台发布第 ${index + 1} 条预警信号`,
      level: '蓝色',
      issuedAt: '11-24 10:00',
    })),
  });
  assert.match(svg, />铁西天气<\/text>/u);
  assert.match(svg, /天气 · 辽宁沈阳 · 2026\.11\.24/u);
  assert.equal((svg.match(/data-alert-icon=/gu) ?? []).length, 3);
  const height = Number(/<svg[^>]*height="(\d+)"/u.exec(svg)?.[1] ?? 0);
  assert.ok(height > 900, `5 天预报加 3 条预警应继续加高（实际 ${height}）`);
});

test('预警列表带有左右和上下内边距', () => {
  const svg = buildQqBotCardSvg({
    type: 'weather',
    place: '上海',
    date: '2026-11-24',
    current: { temp: '15', condition: '晴' },
    days: [],
    alerts: [{ title: '上海市气象台发布大风蓝色预警信号', level: '蓝色' }],
  });
  assert.match(svg, /<g transform="translate\(48,440\)" data-alert-icon="air">/u);
});

test('天气主题色按现象和昼夜取天空色，再随气温做色温偏移', () => {
  const headerColor = (input) => {
    const svg = buildQqBotCardSvg({
      type: 'weather',
      place: '上海',
      date: '2026-11-24',
      current: { temp: input.temp, condition: input.condition ?? '晴' },
      days: [],
      sun: input.sun,
    });
    return /<rect x="40" y="40" width="88" height="88" rx="14" fill="(#[0-9a-f]{6})"/u.exec(
      svg,
    )?.[1];
  };
  const day = headerColor({ temp: '15', sun: { phase: 'day' } });
  const dawn = headerColor({ temp: '15', sun: { phase: 'dawn' } });
  const dusk = headerColor({ temp: '15', sun: { phase: 'dusk' } });
  const night = headerColor({ temp: '15', sun: { phase: 'night' } });
  const hot = headerColor({ temp: '35', sun: { phase: 'day' } });
  const cold = headerColor({ temp: '-8', sun: { phase: 'day' } });
  const rain = headerColor({ temp: '15', condition: '小雨', sun: { phase: 'day' } });
  const thunder = headerColor({ temp: '15', condition: '雷阵雨', sun: { phase: 'day' } });
  for (const [label, color] of Object.entries({
    day,
    dawn,
    dusk,
    night,
    hot,
    cold,
    rain,
    thunder,
  })) {
    assert.match(color ?? '', /^#[0-9a-f]{6}$/u, `${label} 主题色应为合法色值`);
  }
  assert.notEqual(day, night, '夜间主题色应与白天不同');
  assert.notEqual(dawn, day, '清晨主题色应与白天不同');
  assert.notEqual(dusk, day, '傍晚主题色应与白天不同');
  assert.notEqual(dawn, dusk, '清晨与傍晚主题色应不同');
  assert.notEqual(hot, cold, '高温与低温主题色应不同');
  assert.notEqual(rain, day, '雨与晴的主题色应不同');
  assert.notEqual(thunder, rain, '雷与雨的主题色应不同');
});

test('所有天空色在任意气温下图标都保持白色且对比度达标', () => {
  const whiteContrast = (hex) => {
    const channel = (index) => {
      const value = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
    return 1.05 / (luminance + 0.05);
  };
  const conditions = ['晴', '多云', '阴', '小雨', '小雪', '霾', '雷阵雨', '未知'];
  const phases = ['dawn', 'day', 'dusk', 'night'];
  const temperatures = ['-20', '-10', '0', '17', '25', '32', '38'];
  let checked = 0;
  for (const condition of conditions) {
    for (const phase of phases) {
      for (const temp of temperatures) {
        const svg = buildQqBotCardSvg({
          type: 'weather',
          place: '上海',
          date: '2026-11-24',
          current: { temp, condition },
          days: [],
          sun: { sunrise: '06:32', sunset: '16:58', phase },
        });
        const header = svg.slice(svg.indexOf('<g font-family'), svg.indexOf('现在'));
        const tile = /<rect x="40" y="40"[^>]*fill="(#[0-9a-f]{6})"/u.exec(header)?.[1];
        const icon = /<path d="[^"]+" fill="(#[0-9a-fA-F]{6})"\/>/u.exec(header)?.[1];
        assert.equal(
          icon?.toUpperCase(),
          '#FFFFFF',
          `${condition} ${phase} ${temp}° 图标应保持白色`,
        );
        assert.ok(
          whiteContrast(tile ?? '#000000') >= 3,
          `${condition} ${phase} ${temp}° 主题色 ${tile} 白图标对比度不足`,
        );
        checked += 1;
      }
    }
  }
  assert.equal(checked, 224);
});

test('连续取色过程中图标也保持白色且对比度达标', () => {
  const whiteContrast = (hex) => {
    const channel = (index) => {
      const value = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
    return 1.05 / (luminance + 0.05);
  };
  const conditions = ['晴', '多云', '阴', '小雨', '小雪', '霾', '雷阵雨', '未知'];
  let checked = 0;
  for (const condition of conditions) {
    for (let minutes = 300; minutes <= 1180; minutes += 20) {
      const svg = buildQqBotCardSvg({
        type: 'weather',
        place: '上海',
        date: '2026-11-24',
        current: { temp: '17', condition },
        days: [],
        sun: { sunrise: '06:30', sunset: '16:30', phase: 'day', minutes },
      });
      const header = svg.slice(svg.indexOf('<g font-family'), svg.indexOf('现在'));
      const tile = /<rect x="40" y="40"[^>]*fill="(#[0-9a-f]{6})"/u.exec(header)?.[1];
      const icon = /<path d="[^"]+" fill="(#[0-9a-fA-F]{6})"\/>/u.exec(header)?.[1];
      assert.equal(icon?.toUpperCase(), '#FFFFFF', `${condition} ${minutes}分 图标应保持白色`);
      assert.ok(
        whiteContrast(tile ?? '#000000') >= 3,
        `${condition} ${minutes}分 主题色 ${tile} 白图标对比度不足`,
      );
      checked += 1;
    }
  }
  assert.equal(checked, 8 * 45);
});

test('夜间把带太阳的天气图标换成月亮', () => {
  const build = (condition, phase) =>
    buildQqBotCardSvg({
      type: 'weather',
      place: '上海',
      date: '2026-11-24',
      current: { temp: '8', condition },
      days: [],
      sun: { sunrise: '06:32', sunset: '16:58', phase },
    });
  // Material Symbols 路径前缀，用来确认选中了月亮图标。
  const clearNight = 'M484-80q-84 0-157.5-32t-128-86.5';
  const partlyCloudyNight = 'M504-465Zm20 385H420';
  const sunny = 'M440-760v-160h80v160h-80Zm266 110-56-56';
  const partlyCloudyDay = 'M440-760v-160h80v160h-80Zm266 110-55-55';
  const clearNightSvg = build('晴', 'night');
  assert.ok(clearNightSvg.includes(clearNight), '晴的夜间大图标应换成月亮');
  assert.ok(clearNightSvg.includes(partlyCloudyNight), '夜间卡片角落图标应换成月+云');
  assert.ok(!clearNightSvg.includes(sunny), '晴的夜间图标不应再出现太阳');
  const cloudyNightSvg = build('多云', 'night');
  assert.ok(cloudyNightSvg.includes(partlyCloudyNight), '多云的夜间图标应换成月+云');
  assert.ok(!cloudyNightSvg.includes(partlyCloudyDay), '多云的夜间图标不应再出现太阳');
  const clearDaySvg = build('晴', 'day');
  assert.ok(clearDaySvg.includes(sunny), '白天晴仍用太阳图标');
});

test('天空色按当前时刻在矩阵锚点之间连续插值，且走色相过渡', () => {
  const headerColor = (minutes, phase = 'day') => {
    const svg = buildQqBotCardSvg({
      type: 'weather',
      place: '上海',
      date: '2026-11-24',
      current: { temp: '17', condition: '晴' },
      days: [],
      sun: { sunrise: '06:30', sunset: '16:30', phase, minutes },
    });
    return /<rect x="40" y="40" width="88" height="88" rx="14" fill="(#[0-9a-f]{6})"/u.exec(
      svg,
    )?.[1];
  };
  const rgb = (hex) => [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  const hue = (hex) => {
    const [r, g, b] = rgb(hex).map((value) => value / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    if (delta === 0) {
      return 0;
    }
    const raw =
      max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    return (raw * 60 + 360) % 360;
  };
  const close = (actual, expected, tolerance = 3) =>
    rgb(actual).every((value, index) => Math.abs(value - rgb(expected)[index]) <= tolerance);
  const whiteContrast = (hex) => {
    const channel = (index) => {
      const value = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
    return 1.05 / (luminance + 0.05);
  };
  const dawn = headerColor(420, 'dawn'); // 日出后 30 分钟，正好是清晨锚点
  const day = headerColor(510); // 日出后 2 小时，正好是白天锚点
  const noon = headerColor(690); // 11:30，日出日落中点，正午锚点
  const dusk = headerColor(1020, 'dusk'); // 日落后 30 分钟，正好是傍晚锚点
  assert.ok(close(dawn, '#D7758D'), `清晨锚点应接近矩阵清晨色（实际 ${dawn}）`);
  assert.ok(close(day, '#3B86C9'), `白天锚点应接近矩阵白天色（实际 ${day}）`);
  assert.ok(close(noon, '#6098CA'), `正午锚点应是保留饱和度的提亮色（实际 ${noon}）`);
  assert.ok(close(dusk, '#C9761B'), `傍晚锚点应接近矩阵傍晚色（实际 ${dusk}）`);
  assert.ok(
    whiteContrast(noon) < whiteContrast(day) - 0.4,
    `正午应比白天更亮（对比度 ${whiteContrast(noon).toFixed(2)} vs ${whiteContrast(day).toFixed(2)}）`,
  );
  // 上午/下午远离正午时回到更饱和的白天色
  const morning = headerColor(540);
  const afternoon = headerColor(840);
  assert.ok(!close(morning, noon, 6) && !close(afternoon, noon, 6), '远离正午时应回到白天色');
  assert.ok(
    whiteContrast(morning) > whiteContrast(noon) + 0.2 &&
      whiteContrast(afternoon) > whiteContrast(noon) + 0.2,
    '上午/下午应比正午更饱和、更暗',
  );
  const dawnToDay = headerColor(465, 'dawn'); // 清晨与白天锚点之间
  assert.ok(!close(dawnToDay, '#D7758D') && !close(dawnToDay, '#3B86C9'), '中间时刻应是插值色');
  assert.ok(
    hue(dawnToDay) > 240 && hue(dawnToDay) < 330,
    `清晨到白天应走紫红色相过渡（实际色相 ${hue(dawnToDay).toFixed(0)}）`,
  );
  const dayToDusk = headerColor(975, 'dusk'); // 白天与傍晚锚点之间
  assert.ok(
    hue(dayToDusk) > 250 && hue(dayToDusk) < 350,
    `白天到傍晚应走紫红色相、不经过黄绿（实际色相 ${hue(dayToDusk).toFixed(0)}）`,
  );
});

test('傍晚到夜间的色相过渡不经过黄绿', () => {
  const conditions = ['晴', '多云', '阴', '小雨', '小雪', '霾', '雷阵雨', '未知'];
  const hueOf = (hex) => {
    const rgb = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
    const [r, g, b] = rgb;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    if (delta === 0) {
      return 0;
    }
    const raw =
      max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    return (raw * 60 + 360) % 360;
  };
  const headerColor = (condition, minutes) => {
    const svg = buildQqBotCardSvg({
      type: 'weather',
      place: '上海',
      date: '2026-11-24',
      current: { temp: '17', condition },
      days: [],
      sun: { sunrise: '06:30', sunset: '16:30', phase: 'night', minutes },
    });
    return /<rect x="40" y="40" width="88" height="88" rx="14" fill="(#[0-9a-f]{6})"/u.exec(
      svg,
    )?.[1];
  };
  // 傍晚锚点（日落后 30 分钟）到夜间锚点（日落后 2 小时）之间采样，
  // 只能走橙 → 红 → 紫 → 蓝，不能经过黄绿（色相约 70°–170°）。
  for (const condition of conditions) {
    for (let minutes = 1020; minutes <= 1200; minutes += 15) {
      const color = headerColor(condition, minutes);
      const hue = hueOf(color);
      assert.ok(
        hue < 70 || hue > 170,
        `${condition} ${minutes}分 的色相 ${hue.toFixed(0)}° 落进了黄绿区间（${color}）`,
      );
    }
  }
});

test('天气卡片经过接口归一化后仍保留预警和日出日落', () => {
  const normalized = normalizeCard({
    type: 'weather',
    place: '上海市',
    date: '2026-11-24',
    current: { temp: '8', condition: '晴' },
    days: [],
    alerts: [{ title: '上海市气象台发布大风蓝色预警信号', level: '蓝色', issuedAt: '11-24 10:00' }],
    sun: { sunrise: '06:32', sunset: '16:58', phase: 'night' },
  });
  assert.equal(normalized?.alerts?.[0]?.level, '蓝色');
  assert.equal(normalized?.sun?.phase, 'night');
  assert.equal(normalized?.sun?.sunrise, '06:32');
});

test('天气预警按种类选择图标', () => {
  const svg = buildQqBotCardSvg({
    type: 'weather',
    place: '上海市',
    date: '2026-11-24',
    current: { temp: '15', condition: '多云' },
    days: [],
    alerts: [
      { title: '上海市气象台发布大风蓝色预警信号', level: '蓝色', type: '大风' },
      { title: '上海市气象台发布暴雨黄色预警信号', level: '黄色', type: '暴雨' },
    ],
  });
  assert.match(svg, /data-alert-icon="air"/u);
  assert.match(svg, /data-alert-icon="water"/u);
  assert.doesNotMatch(svg, /stroke-opacity="0.28"/u);
  assert.doesNotMatch(svg, /<circle cx="26" cy="25"/u);
});

test('POI 卡片使用自己的图标和分类语义色', () => {
  const icon =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2ZQAAAABJRU5ErkJggg==';
  const svg = buildQqBotCardSvg({
    type: 'poi',
    label: '临东茶话会',
    category: '餐饮',
    color: '#E86A33',
    iconDataUri: icon,
    description: '测试地点',
    shareUrl: 'https://yct.example.com/map?m=poi-1',
    date: '2026-11-24',
  });
  assert.match(svg, /<rect x="40" y="40" width="88" height="88" rx="14" fill="#E86A33"\/>/u);
  assert.match(svg, /<image x="58" y="58" width="52" height="52" href="data:image\/png;base64,/u);
});

test('GB2312 涂卡按 0-9 行对齐', () => {
  const svg = buildQqBotCardSvg({
    type: 'gb2312',
    date: '2026-11-24',
    // 12 34 → 1、2、3、4 四个数字。
    entries: [{ char: '临', area: 12, position: 34 }],
  });
  const marks = [
    ...svg.matchAll(
      /<rect x="([\d.]+)" y="([\d.]+)" width="[\d.]+" height="[\d.]+" rx="1" fill="#111817"/gu,
    ),
  ].map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
  assert.equal(marks.length, 4);
  const scale = 560 / 204;
  // 底图行中心从设计坐标 45.1 开始，每行 9；第一行是数字 0，数字 1 的中心在 54.1。
  const firstCenter = marks[0].y + 1.6 * scale;
  assert.ok(Math.abs(firstCenter - (180 + 54.1 * scale)) < 2, `首位标记中心 y=${firstCenter}`);
  for (let index = 1; index < marks.length; index += 1) {
    const spacing = marks[index].y - marks[index - 1].y;
    assert.ok(Math.abs(spacing - 9 * scale) < 1, `行距应约 ${9 * scale}（实际 ${spacing}）`);
  }
});

test('长昵称不会截掉页眉日期和页脚时间', () => {
  const name = 'AAAAAA【享受美好早八×2】沈局沈段HXD3D0635';
  const svg = buildQqBotCardSvg({
    type: 'fortune',
    name,
    score: 45,
    text: '宜看纪录片',
    date: '2026-11-20',
    reset: false,
    footer: `仅供娱乐｜${name}｜11-20 07:30`,
  });
  assert.match(svg, /· 2026\.11\.20<\/text>/u);
  assert.match(svg, /· 11-20 07:30<\/text>/u);
});

test('签文卡按文案配手绘插图，未收录的签文保持纯文字', () => {
  const withSticker = buildQqBotCardSvg({
    type: 'fortune',
    name: '测试',
    score: 88,
    text: '宜出门',
    date: '2026-11-27',
    reset: false,
  });
  assert.match(
    withSticker,
    /<image x="[\d.]+" y="[\d.]+" width="168" height="168" href="data:image\/png;base64,/u,
  );

  const withoutSticker = buildQqBotCardSvg({
    type: 'fortune',
    name: '测试',
    score: 88,
    // 故意的非签文文本，保证不会命中插图映射。
    text: '未收录的测试签文',
    date: '2026-11-27',
    reset: false,
  });
  assert.doesNotMatch(withoutSticker, /data:image\/png;base64,/u);
});

test('签文插图忽略标点差异匹配', () => {
  const svg = buildQqBotCardSvg({
    type: 'fortune',
    name: '测试',
    score: 88,
    // 文案列表写作「宜拍下偶遇的喵~」，去掉波浪号也要能配上图。
    text: '宜拍下偶遇的喵',
    date: '2026-11-27',
    reset: false,
  });
  assert.match(svg, /data:image\/png;base64,/u);
});

test('机器人在本地渲染卡片 PNG', async () => {
  const png = await renderCardPng({
    type: 'dice',
    count: 2,
    sides: 6,
    bonus: 1,
    rolls: [4, 5],
    total: 10,
    date: '2026-11-18',
    footer: '测试',
  });
  assert.ok(Buffer.isBuffer(png));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
});

test('本地 POI 卡片会生成二维码，不依赖网页卡片路由', async () => {
  const png = await renderCardPng({
    type: 'poi',
    label: '测试地点',
    category: '餐饮',
    description: '测试描述',
    shareUrl: 'https://yct.example.com/map?m=test',
    date: '2026-11-18',
  });
  assert.ok(png.length > 10_000);
});
