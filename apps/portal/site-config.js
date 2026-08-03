(function configureLindongPortal() {
  'use strict';

  // 新版雨城通已经迁移到子域根路径；/v2 仅保留旧链接兼容跳转。
  const yctBaseUrl = 'https://yct.shangxiaoguan.top/';
  // 旧工具当前由子域根路径的静态文件兜底提供，不跟随 Next.js basePath。
  const legacyBaseUrl = 'https://yct.shangxiaoguan.top/';
  const fromYctRoot = (path) => new URL(path.replace(/^\/+/, ''), yctBaseUrl).toString();
  const fromLegacyRoot = (path) => new URL(path.replace(/^\/+/, ''), legacyBaseUrl).toString();

  window.LINDONG_PORTAL_CONFIG = Object.freeze({
    yctBaseUrl,
    legacyBaseUrl,
    links: Object.freeze({
      yct: yctBaseUrl,
      yctMap: fromYctRoot('map'),
      roadMaterials: fromYctRoot('services/road-materials'),
      transitMaterials: fromYctRoot('services/transit-materials'),
      dataComposer: fromLegacyRoot('data_composer/'),
      dynamicRouteMap: fromLegacyRoot('dynamic_routemap/'),
      productGallery: fromLegacyRoot('product_gallery/'),
      lindongWiki: 'https://wiki.shangxiaoguan.top/%E4%B8%B4%E4%B8%9C%E5%B8%82',
      annualReports:
        'https://wiki.shangxiaoguan.top/%E5%88%86%E7%B1%BB:%E6%9C%8D%E5%8A%A1%E5%99%A8%E5%B9%B4%E5%BA%A6%E6%8A%A5%E5%91%8A',
      annualReport2025: fromYctRoot(
        'operations/local_content_4f81ff67-00d4-4152-a833-5a3099f1e8b6',
      ),
      staticMap: 'https://map.shangxiaoguan.top/',
      freshMap: 'http://ld.cmsy.xyz:19136/',
      telegramPaperGenerator: fromLegacyRoot('generator/dianbao.html'),
    }),
    heroes: Object.freeze([
      {
        id: 'city-government',
        poiId: 'unmined-marker-168--1428--685',
        label: '临东市政府',
        imageUrl: './assets/hero/city-government.jpg',
        imageAlt: '临东市政府与周边城市景观',
        objectPosition: 'center 50%',
      },
      {
        id: 'snow-government',
        poiId: 'unmined-marker-170-642-3952',
        label: '雪乡乡政府',
        imageUrl: './assets/hero/snow-government.webp',
        imageAlt: '雪乡乡政府前的城市广场',
        objectPosition: 'center 52%',
      },
      {
        id: 'luojiabao-station',
        poiId: 'unmined-marker-174--3238-1018',
        label: '骆家堡站',
        imageUrl: './assets/hero/luojiabao-station.webp',
        imageAlt: '骆家堡站的站房与站前空间',
        objectPosition: 'center 48%',
      },
      {
        id: 'telegraph-building',
        poiId: 'unmined-marker-202--1661--605',
        label: '电报大楼',
        imageUrl: './assets/hero/telegraph-building.webp',
        imageAlt: '电报大楼与周边街道',
        objectPosition: 'center 50%',
      },
      {
        id: 'foreign-affairs-building',
        poiId: 'unmined-marker-208--804--161',
        label: '外事大厦',
        imageUrl: './assets/hero/foreign-affairs-building.webp',
        imageAlt: '外事大厦建筑立面',
        objectPosition: 'center 48%',
      },
      {
        id: 'first-high-school',
        poiId: 'unmined-marker-327--242--3176',
        label: '临东市第一高级中学',
        imageUrl: './assets/hero/first-high-school.webp',
        imageAlt: '临东市第一高级中学校园',
        objectPosition: 'center 52%',
      },
      {
        id: 'snow-coach-station',
        poiId: 'unmined-marker-355-811-4668',
        label: '雪乡客运站',
        imageUrl: './assets/hero/snow-coach-station.webp',
        imageAlt: '雪乡客运站站房与站前道路',
        objectPosition: 'center 53%',
      },
      {
        id: 'lindong-station-exit',
        poiId: 'unmined-marker-369--2129--1058',
        label: '临东站 B 出口',
        imageUrl: './assets/hero/lindong-station-exit.webp',
        imageAlt: '临东站 B 出口与公交车辆',
        objectPosition: 'center 52%',
      },
      {
        id: 'dingxiang-market',
        poiId: 'poi-local_poi_b6f75fe6-ac93-4825-a201-90c1e83aedaf',
        label: '爱临丁香超市',
        imageUrl: './assets/hero/dingxiang-market.webp',
        imageAlt: '爱临丁香超市与街区建筑',
        objectPosition: 'center 54%',
      },
      {
        id: 'zhaoda-plaza',
        poiId: 'poi-local_poi_9f5f6533-8231-4b6b-9f7b-1cf54923faaf',
        label: '兆达商业广场',
        imageUrl: './assets/hero/zhaoda-plaza.webp',
        imageAlt: '兆达商业广场街景',
        objectPosition: 'center 50%',
      },
    ]),
  });
})();
