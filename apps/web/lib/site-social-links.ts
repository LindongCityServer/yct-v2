export interface SiteSocialLink {
  id: string;
  label: string;
  labelEn: string;
  href: string;
  aliases: string[];
}

/** 与门户首页、运营信息页保持一致的社会化入口。 */
export const siteSocialLinks: SiteSocialLink[] = [
  {
    id: 'afdian',
    label: '爱发电',
    labelEn: 'Afdian',
    href: 'https://afdian.com/a/LindongCityServer',
    aliases: ['爱发电', 'afdian', '赞助', '捐赠'],
  },
  {
    id: 'qq-group',
    label: 'QQ 群',
    labelEn: 'QQ group',
    href: 'https://jq.qq.com/?_wv=1027&k=2ohkcKQI',
    aliases: ['qq群', 'QQ 群', 'qq', '玩家群'],
  },
  {
    id: 'bilibili',
    label: 'Bilibili',
    labelEn: 'Bilibili',
    href: 'https://space.bilibili.com/106279202',
    aliases: ['bilibili', 'b站', 'B站', '哔哩哔哩'],
  },
  {
    id: 'wechat',
    label: '微信',
    labelEn: 'WeChat',
    href: 'https://wiki.shangxiaoguan.top/images/d/d2/%E4%B8%B4%E4%B8%9C%E5%BE%AE%E5%BF%97.png',
    aliases: ['微信', '公众号', 'wechat', '微信群'],
  },
  {
    id: 'qq-channel',
    label: 'QQ 频道',
    labelEn: 'QQ channel',
    href: 'https://pd.qq.com/g/58ocn0s744',
    aliases: ['qq频道', 'QQ 频道', '频道'],
  },
];

const socialIntentPattern =
  /社交|社区|联系|关注|官方账号|official|community|contact|bilibili|b站|qq|微信|公众号|爱发电|赞助|afdian/i;

export function getSiteSocialLinkLabel(link: SiteSocialLink, locale: string): string {
  return locale === 'en' ? link.labelEn : link.label;
}

/** 按名称或“社交/联系”等意图词匹配首页社交入口。 */
export function matchSiteSocialLinks(query: string): SiteSocialLink[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) {
    return [];
  }

  const matched = siteSocialLinks.filter((link) =>
    link.aliases.some(
      (alias) => alias.length >= 2 && normalized.includes(alias.toLocaleLowerCase()),
    ),
  );
  if (matched.length > 0) {
    return matched;
  }

  return socialIntentPattern.test(query) ? siteSocialLinks : [];
}
