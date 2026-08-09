import type { LocaleCode } from '@yct/contracts';
import { faqGroups, type FaqAnswer, type FaqGroup, type FaqItem } from './faq-content';

type FaqTranslatedLocale = Exclude<LocaleCode, 'zh-CN'>;

interface FaqItemTranslation {
  question: string;
  answer: FaqAnswer;
  keywords: string[];
}

interface FaqGroupTranslation {
  title: string;
  items: Record<string, FaqItemTranslation>;
}

interface FaqCatalog {
  pageTitle: string;
  directoryTitle: string;
  introTitle: string;
  introDescription: string;
  groupItemCount: string;
  serviceTitle: string;
  serviceDescription: string;
  groups: Record<string, FaqGroupTranslation>;
}

export interface LocalizedFaqContent {
  pageTitle: string;
  directoryTitle: string;
  introTitle: string;
  introDescription: string;
  groupItemCount: string;
  serviceTitle: string;
  serviceDescription: string;
  groups: FaqGroup[];
}

const zhCnCatalog: FaqCatalog = {
  pageTitle: '常见问题',
  directoryTitle: '问题目录',
  introTitle: '使用中遇到问题？',
  introDescription: '这里整理了 {count} 条常见问题。',
  groupItemCount: '{count} 项',
  serviceTitle: '常见问题',
  serviceDescription: '查看雨城通常用功能的使用说明与问题解答。',
  groups: {},
};

const faqCatalogs: Record<FaqTranslatedLocale, FaqCatalog> = {
  'zh-Hant': {
    pageTitle: '常見問題',
    directoryTitle: '問題目錄',
    introTitle: '使用中遇到問題？',
    introDescription: '這裡整理了 {count} 條常見問題。',
    groupItemCount: '{count} 項',
    serviceTitle: '常見問題',
    serviceDescription: '查看雨城通常用功能的使用說明與問題解答。',
    groups: {
      'getting-started': {
        title: '基本使用',
        items: {
          'login-required': {
            question: '使用雨城通必須登入嗎？',
            answer:
              '不需要。營運資訊、地圖、線路和班次查詢可以直接使用。登入臨東通帳號後，才可使用跨裝置同步、伺服器推送和乘車碼等帳號能力。',
            keywords: ['訪客', '未登入', '匿名使用'],
          },
          'global-search': {
            question: '怎樣快速找到地點、線路或服務？',
            answer: [
              '使用頁面右上角的',
              { icon: 'search', label: '搜尋' },
              '按鈕，可以統一檢索地點、線路、班次、營運資訊、服務入口和常見問題。搜尋結果取決於目前已發布的資料。',
            ],
            keywords: ['全域搜尋', '查找', '關鍵字'],
          },
          'data-not-found': {
            question: '為什麼搜尋不到某個地點、線路或班次？',
            answer:
              '雨城通只展示已經錄入並發布的資料。請先檢查名稱和關鍵字；仍然沒有結果時，通常表示對應內容尚未發布，或目前資料來源暫不可用。',
            keywords: ['沒有結果', '搜不到', '資料缺失'],
          },
          preferences: {
            question: '怎樣切換語言、主題或動態效果？',
            answer: [
              '前往',
              { text: '帳號設定', href: '/account' },
              '調整語言、明暗主題、材質效果和動態偏好。這些設定可以在未登入時保存在目前裝置；支援帳號同步的偏好會在登入後與帳號合併。',
            ],
            keywords: ['繁體中文', '英文', '深色模式', '動畫', '外觀'],
          },
          'translation-fallback': {
            question: '為什麼切換語言後，部分地點或線路名稱仍是中文？',
            answer:
              '地點、線路和站點會優先顯示目前語言的已發布譯名；沒有對應譯名時，系統會回退到原始名稱。不同資料來源的翻譯完成度不同，因此同一頁面中可能同時出現不同語言的名稱。',
            keywords: ['翻譯', '語言切換', '英文名稱', '繁體名稱', '名稱回退'],
          },
          'external-service-language': {
            question: '為什麼有些舊版工具沒有跟隨頁面語言切換？',
            answer:
              '雨城通只能切換主站自身的介面與 FAQ 文案。舊版工具和外部伺服器網站是獨立頁面，它們的語言取決於各自是否提供在地化支援。',
            keywords: ['舊版工具', '外部網站', '在地化', '介面語言'],
          },
          'stale-content': {
            question: '網站更新後，為什麼仍然看到舊頁面？',
            answer: [
              '瀏覽器或已安裝應用可能仍在使用快取。可前往',
              { text: '帳號設定', href: '/account' },
              '的「安裝與離線」區域使用',
              { icon: 'refresh', label: '重新整理快取' },
              '，再重新開啟頁面。重新整理快取不會取代尚未同步的本機提醒同步操作。',
            ],
            keywords: ['快取', '舊版本', '重新整理失敗', 'PWA 更新'],
          },
        },
      },
      'operations-and-updates': {
        title: '營運資訊',
        items: {
          'operations-expired': {
            question: '已過有效期的營運資訊還能查看嗎？',
            answer:
              '可以。首頁會把超過顯示有效期的內容移到目前分類下的「過期消息」摺疊區；切換分類後，只會顯示該分類目前及過期的內容。已撤回或尚未發布的內容不會在前台顯示。',
            keywords: ['過期消息', '歷史公告', '有效期', '營運分類', '找不到公告'],
          },
          'server-status-refresh': {
            question: '首頁的伺服器狀態和在線人數是即時的嗎？',
            answer:
              '伺服器狀態來自閘道的週期性查詢，頁面約每 15 秒重新整理一次，並非持續即時連線。短暫查詢失敗時會保留最近一次明確狀態；需要判斷特定玩家位置時，請進入地圖並結合「最近觀測」和「最後在線」時間查看。',
            keywords: ['伺服器狀態', '在線人數', '延遲', '重新整理頻率', '狀態未更新'],
          },
        },
      },
      'map-and-routes': {
        title: '地圖與路線',
        items: {
          'route-unavailable': {
            question: '路線規劃為什麼沒有可用方案？',
            answer:
              '請確認起點和終點已經選中，並嘗試切換步行或大眾運輸方式。規劃結果依賴已發布的道路、站點和線路拓撲；相關資料缺失或兩點尚未連通時，系統可能無法產生方案。',
            keywords: ['無法規劃', '沒有路線', '起點終點', '不連通'],
          },
          'route-estimate': {
            question: '路線時間、距離和票價是準確值嗎？',
            answer:
              '頁面會標示「沿道路估算」「直線估算」「預計」或「待確認」等狀態。帶有這些標記的數值只用於行程參考，請以實際營運資訊和現場情況為準。',
            keywords: ['預計時間', '距離誤差', '票價估算'],
          },
          'favorite-sync': {
            question: '更換裝置後，地圖收藏為什麼不見了？',
            answer: [
              '未登入時，收藏保存在目前瀏覽器中，不會自動出現在其他裝置。登入後可前往',
              { text: '帳號設定', href: '/account' },
              '查看本機歷史和同步狀態。',
            ],
            keywords: ['收藏遺失', '跨裝置', '同步收藏'],
          },
          'map-sharing': {
            question: '怎樣把地點、路線或座標分享給其他人？',
            answer: [
              '開啟地圖中的地點或路線詳情後使用',
              { icon: 'share', label: '分享' },
              '操作。依目前內容和瀏覽器能力，可以複製連結、文字、座標或傳送指令，也可以產生 QR Code 或分享圖。',
            ],
            keywords: ['QR Code', '複製座標', '傳送指令', '分享圖', '連結'],
          },
          'map-toolbar-controls': {
            question: '地圖工具列裡的加號、減號、定位和圖層圖示分別做什麼？',
            answer: [
              '地圖工具列中的',
              { icon: 'add', label: '加號' },
              '和 ',
              { icon: 'remove', label: '減號' },
              '用於縮放，',
              { icon: 'my_location', label: '定位' },
              '用於回到預設地圖視圖，不是讀取手機 GPS；',
              { icon: 'layers', label: '圖層' },
              '用於開啟瀏覽模式、投稿和瓦片來源設定。',
            ],
            keywords: ['地圖工具列', '加號', '減號', '定位圖示', '圖層圖示', 'GPS'],
          },
          'poi-action-icons': {
            question: '地點詳情下方的圖示按鈕分別有什麼作用？',
            answer: [
              '地點詳情下方的',
              { icon: 'directions', label: '路線' },
              '用於把地點設為路線規劃端點，',
              { icon: 'travel_explore', label: '附近' },
              '用於搜尋周邊內容，',
              { icon: 'bookmark', label: '收藏' },
              '用於保存或取消收藏，',
              { icon: 'share', label: '分享' },
              '用於開啟地點分享面板。圖示按鈕懸停或聚焦時也會顯示對應的文字提示。',
            ],
            keywords: ['地點詳情', '路線按鈕', '附近搜尋', '收藏圖示', '分享按鈕'],
          },
          'map-share-link': {
            question: '分享面板中的複製連結、二維碼和分享圖有什麼不同？',
            answer: [
              '地點或路線詳情中的',
              { icon: 'share', label: '分享' },
              '面板可以用',
              { icon: 'link', label: '複製連結' },
              '產生可重新開啟目前地點或路線的短連結，也可以用',
              { icon: 'qr_code_2', label: '二維碼' },
              '讓其他人掃描開啟同一連結。',
              { icon: 'image', label: '分享圖' },
              '是目前預覽的靜態圖片，適合轉發或保存，不能取代可互動的地圖連結。分享這些公開地點或路線不要求登入。',
            ],
            keywords: ['分享連結', '短連結', '二維碼', '分享圖', '不登入分享'],
          },
          'map-share-troubleshooting': {
            question: '分享操作失敗或提示瀏覽器不支援時怎麼辦？',
            answer: [
              '瀏覽器不支援系統分享時，可以改用',
              { icon: 'content_copy', label: '複製連結' },
              '或複製文字、座標和傳送指令；如果剪貼簿也不可用，請檢查目前頁面的剪貼簿權限後重試。產生短連結需要站點服務可用，遇到暫時失敗時可使用',
              { icon: 'refresh', label: '重試' },
              '，或者直接分享目前網址。',
            ],
            keywords: ['分享失敗', '瀏覽器不支援', '剪貼簿', '複製連結', '重試'],
          },
          'keyboard-shortcuts': {
            question: '怎樣查看和使用鍵盤快捷鍵？',
            answer: [
              '長按',
              { icon: 'keyboard', label: 'Ctrl' },
              '可以開啟目前頁面可用的快捷鍵清單。地圖支援加號和減號縮放、斜線聚焦搜尋、數字 0 回到預設視圖；選取地點或開啟路線規劃後，清單還會顯示規劃路線、交換起終點等目前可執行操作。輸入文字時不會觸發地圖快捷鍵。',
            ],
            keywords: ['鍵盤', '快捷鍵', 'Ctrl', '搜尋', '縮放', '預設視圖', '交換起終點'],
          },
          'poi-submission': {
            question: '地圖缺少地點，或地點資訊有誤怎麼辦？',
            answer: [
              '可以在地圖中使用',
              { icon: 'add_location_alt', label: '投稿公開 POI' },
              '，填寫名稱、分類、座標和說明後提交審核。投稿不會立即公開，管理員審核通過後才會進入已發布地圖資料。',
            ],
            keywords: ['新增地點', '糾錯', 'POI 投稿', '提交審核', '座標錯誤'],
          },
          'player-location-delay': {
            question: '地圖上的玩家位置為什麼有延遲？',
            answer:
              '玩家位置來自伺服器閘道的週期性觀測，不是瀏覽器 GPS 即時定位。網路、伺服器狀態和輪詢間隔都會帶來延遲，請結合「最近觀測」和「最後上線」時間判斷位置是否仍然有效。',
            keywords: ['即時位置', '玩家離線', '定位不準', '位置輪詢'],
          },
          'directional-stop-location': {
            question: '為什麼同一車站在不同線路或方向上顯示的停靠位置不同？',
            answer:
              '車站可以為某條線路設定預設停靠位置，也可以分別設定正向和反向位置。線路詳情和路線規劃會優先使用目前方向的位置；未設定時依次回退到該線路預設位置和車站預設位置。',
            keywords: ['停靠位置', '上下行', '正向', '反向', '站點位置', '乘車點'],
          },
          'map-tile-provider': {
            question: '衛星地圖看起來不夠新，怎樣切換瓦片來源？',
            answer: [
              '在衛星模式開啟',
              { icon: 'layers', label: '圖層與投稿' },
              '。當系統提供多個瓦片來源時，可以在「瓦片來源」中切換。不同來源的更新速度和可用性不同，目前選擇會保存在本瀏覽器中。',
            ],
            keywords: ['衛星圖', '底圖', '瓦片來源', '地圖更新', '圖層'],
          },
          'map-tiles-unavailable': {
            question: '地圖底圖或瓦片載入失敗怎麼辦？',
            answer: [
              '先檢查網路連線並使用',
              { icon: 'refresh', label: '重新整理' },
              '頁面。衛星模式下，若圖層面板提供其他瓦片來源，可以嘗試切換；所有來源都不可用時，通常表示目前地圖資料來源暫時無法存取，請稍後再試。',
            ],
            keywords: ['地圖空白', '瓦片載入失敗', '底圖遺失', '地圖資料暫不可用'],
          },
        },
      },
      'travel-and-ride': {
        title: '出行與乘車',
        items: {
          'schedule-unavailable': {
            question: '班次查詢顯示資料暫不可用怎麼辦？',
            answer: [
              '班次查詢僅提供已發布且目前有效的計畫。可以稍後重新整理，或到',
              { text: '營運資訊', href: '/' },
              '查看臨時調整、停運及其他公告。',
            ],
            keywords: ['時刻表', '車次', '停運', '發車時間'],
          },
          'schedule-filtering': {
            question: '怎樣縮小班次查詢結果範圍？',
            answer: [
              '班次查詢可使用',
              { icon: 'filter_alt', label: '篩選' },
              '，按服務類型、線路或班次關鍵字、停靠站、始發站、終到站、服務日期和過去/即將發車時段縮小範圍。日期為今天時，過去和即將發車會按目前時間區分；其他日期則按日期範圍處理。',
            ],
            keywords: ['篩選班次', '始發站', '終到站', '服務日期', '即將發車', '已過班次'],
          },
          'schedule-pending-fields': {
            question: '班次的檢票口、運行時間或車型為什麼顯示待公布？',
            answer:
              '這些欄位來自已發布的班次資料。資料來源尚未提供、無法確認或不適用於該班次時，頁面會顯示「待公布」或「待定」，並不代表系統會自行推算出該資訊。',
            keywords: ['檢票口', '運行時間', '車型', '待定', '待公布'],
          },
          'schedule-booking-link': {
            question: '為什麼有些班次只有查詢資訊，沒有訂票入口？',
            answer:
              '是否提供訂票入口取決於該班次已發布資料中是否包含有效的訂票連結。沒有連結的班次仍可用於查詢，不能據此推斷該班次一定不可購買。',
            keywords: ['訂票', '購票', '預訂', '沒有連結', '僅查詢'],
          },
          'transit-screen-scope': {
            question: '智運大屏和班次查詢有什麼不同？',
            answer:
              '智運大屏用於快速查看目前資料快照中的車站、線路、檢票口和近期班次；班次查詢提供日期、站點、服務類型和時段等詳細篩選。兩者都以目前已發布資料為準，頁面中的舊版入口可能讀取獨立資料來源。',
            keywords: ['智運大屏', '近期班次', '班次查詢', '檢票口', '舊版大屏'],
          },
          'ticketing-unavailable': {
            question: '為什麼班次可以查詢，卻顯示「暫不可訂」或不能建立訂單草稿？',
            answer:
              '可查詢不等於可售。建立新版訂單草稿需要有效的臨東通登入狀態，並且該班次已接入統一票務、設定真實票種和庫存，目前仍有可售餘量。舊版訂票連結只作為獨立參考入口，不代表新版票務已經可用。',
            keywords: ['暫不可訂', '庫存待設定', '暫無餘票', '新票務待接入', '訂單草稿'],
          },
          'ticket-draft-not-issued': {
            question: '建立訂單草稿後，是否已經買到票？',
            answer:
              '沒有。訂單草稿只會暫時佔用對應庫存，預設佔用 15 分鐘，不代表已經出票或取得可核銷憑證。草稿取消或逾時後會釋放佔用；只有後續狀態明確變為「已出票」並出現有效票券或憑證，才表示出票完成。',
            keywords: ['訂單草稿', '占座', '庫存佔用', '15 分鐘', '已出票', '核銷憑證'],
          },
          'ride-code-login': {
            question: '點擊乘車碼後為什麼跳轉到帳號頁？',
            answer: [
              '開啟',
              { icon: 'qr_code_2', label: '乘車碼' },
              '需要有效的臨東通登入狀態。請先完成登入；如果帳號處於唯讀狀態、登入服務尚未設定或乘車碼服務暫不可用，目前無法開啟乘車碼。',
            ],
            keywords: ['QR Code 乘車', '登入失效', '無法開啟乘車碼'],
          },
          'reminder-missing': {
            question: '為什麼沒有收到行程或票務提醒？',
            answer: [
              '請在',
              { text: '帳號設定', href: '/account' },
              '中確認',
              { icon: 'notifications', label: '通知' },
              '總開關、對應提醒分類和勿擾時段，並檢查瀏覽器是否允許通知。未登入時建立的本機提醒還需要同步到帳號，才能由伺服器向其他裝置推送。',
            ],
            keywords: ['通知', 'Push', '勿擾', '沒有提醒', '瀏覽器權限'],
          },
          'local-reminder-sync': {
            question: '「待同步提醒」是什麼意思？',
            answer:
              '這表示提醒目前只保存在目前瀏覽器，還沒有寫入帳號。登入後在帳號設定中執行同步，成功後才能在其他裝置讀取，並由伺服器參與後續推送。',
            keywords: ['本機提醒', 'syncedAt', '雲端同步', '帳號角標'],
          },
          'legacy-orders': {
            question: '舊站 orders 記錄為什麼不是新版票務訂單？',
            answer:
              '從舊站 orders 唯讀匯入的內容只會作為行程提醒快照，用於保留歷史和提醒資訊，不代表新版訂單、票券或核銷憑證。同步前系統會單獨徵求同意。',
            keywords: ['舊版訂單', '歷史訂單', '票券', '核銷憑證', '遷移'],
          },
        },
      },
      'account-and-offline': {
        title: '帳號與離線',
        items: {
          'readonly-account': {
            question: '帳號顯示「唯讀」是什麼意思？',
            answer:
              '系統已經識別到登入身分，但目前會話不能執行需要寫入帳號的資料操作。你仍可瀏覽公開內容；收藏同步、訂單和部分帳號功能需要帳號恢復為可用狀態後再操作。',
            keywords: ['readonly', '不能同步', '帳號異常'],
          },
          'account-badge': {
            question: '帳號按鈕上的數字或圓點表示什麼？',
            answer: [
              { icon: 'account_circle', label: '帳號' },
              '按鈕上的數字通常表示待處理項目數量，例如尚未同步的本機行程提醒或帳號側待處理內容；圓點表示帳號設定、會話或其他狀態需要注意。開啟帳號設定可以查看具體來源。',
            ],
            keywords: ['角標', '紅點', '待處理', '數字提醒'],
          },
          'push-device-scope': {
            question: '為什麼換了瀏覽器後需要重新開啟推送？',
            answer:
              '推送訂閱按裝置和瀏覽器分別登記，通知權限也由瀏覽器獨立管理。更換裝置、瀏覽器或清除網站權限後，需要在帳號設定中重新允許通知並開啟本裝置推送。',
            keywords: ['通知權限', '裝置訂閱', '換手機', '換瀏覽器'],
          },
          'account-session-unavailable': {
            question: '登入後仍顯示未登入或帳號狀態暫不可用怎麼辦？',
            answer:
              '先回到帳號設定查看具體狀態，再嘗試重新登入。公開內容不依賴帳號會話；若反覆出現會話讀取失敗、共享 Cookie 缺失或登入服務未設定，通常需要等待對應登入環境恢復後再試。',
            keywords: ['登入失敗', '會話失效', 'Cookie', '帳號不可用', '重新登入'],
          },
          'private-storage': {
            question: '為什麼偏好、收藏或瓦片來源選擇沒有保留下來？',
            answer:
              '這些選擇會先保存在瀏覽器本機。隱私瀏覽模式、網站儲存權限受限或儲存配額異常時，瀏覽器可能無法持久保存，只能在目前會話內生效。需要跨裝置保留的內容，請登入後完成對應同步。',
            keywords: ['無痕模式', '隱私模式', '本機儲存', '偏好遺失', '設定不保存'],
          },
          'offline-capabilities': {
            question: '離線時可以繼續使用哪些內容？',
            answer:
              '已快取的近期營運資訊、線路、站點詳情和服務入口可以繼續開啟，恢復網路後會重新整理最新資料。首次存取或從未快取過的內容仍然需要網路連線。',
            keywords: ['斷網', '離線頁面', '快取內容'],
          },
          'offline-package-boundary': {
            question: '儲存自訂離線範圍後，為什麼地圖仍有內容無法載入？',
            answer:
              '自訂範圍目前用於記錄 Minecraft 座標邊界並重新整理公開基礎資料，不代表該範圍內的全部地圖瓦片已經下載。完整瓦片離線包仍受產生策略和體積限制。',
            keywords: ['地圖瓦片', '自訂範圍', '離線包', 'Minecraft 座標'],
          },
          'install-app': {
            question: '怎樣把雨城通安裝到桌面或主畫面？',
            answer: [
              '前往',
              { text: '帳號設定', href: '/account' },
              '的「安裝與離線」區域使用',
              { icon: 'install_mobile', label: '安裝' },
              '按鈕。是否能夠安裝取決於瀏覽器和系統支援；如果沒有安裝按鈕，也可以使用瀏覽器內建的「加入主畫面」功能。',
            ],
            keywords: ['PWA', '加入主畫面', '桌面應用程式', '安裝按鈕'],
          },
          changelog: {
            question: '怎樣查看雨城通最近更新了什麼？',
            answer: [
              '開啟服務中的',
              { text: '版本更新', href: '/services/changelog', icon: 'history' },
              '頁面，可以查看目前版本、建置編號和最近發布的功能、修復、效能及樣式變更。沒有發布清單時，頁面會顯示暫時沒有可展示的記錄。',
            ],
            keywords: ['版本更新', '更新記錄', '建置編號', '發布清單', '變更日誌'],
          },
          'clear-local-data': {
            question: '清理快取會刪除收藏和本機提醒嗎？',
            answer: [
              { icon: 'refresh', label: '重新整理快取' },
              '或離線快取管理主要處理應用快取；收藏、偏好和本機提醒使用獨立的本機儲存與同步流程。執行帶有',
              { icon: 'delete_sweep', label: '清除本機記錄' },
              '或類似確認提示的操作前，請先閱讀確認內容並同步需要保留的資料。',
            ],
            keywords: ['清除資料', 'localStorage', '收藏刪除', '提醒刪除'],
          },
        },
      },
      'tools-and-services': {
        title: '工具與服務',
        items: {
          'legacy-service-new-tab': {
            question: '為什麼有些服務會在新分頁開啟？',
            answer:
              '「更多服務」中包含舊版工具和外部伺服器網站，這些入口會依其設定在新分頁開啟。新頁面的登入狀態、資料範圍和互動方式可能與雨城通主站不同。',
            keywords: ['外部網站', '舊版工具', '跳轉', '新視窗'],
          },
          'legacy-data-difference': {
            question: '為什麼舊版工具和雨城通主站顯示的資料不完全一致？',
            answer:
              '舊版工具、外部伺服器網站和主站可能讀取不同的資料來源或不同的發布批次。主站以目前已發布資料為準；跨站比較時，請留意頁面註明的資料來源和更新時間。',
            keywords: ['資料不一致', '舊站', '外部服務', '發布批次', '更新時間'],
          },
          'material-data-missing': {
            question: '物料產生器裡為什麼找不到某條線路或地點？',
            answer:
              '伺服器資料模式只列出已經發布且具備範本所需欄位的線路、站點和地點；草稿、審核中或資料不完整的內容不會出現。大眾運輸導視切換到專案資料後，只會列出 RMP 中可識別、已命名且在所選圖上方向存在有效線路連接的站點和線路。需要自行填寫內容時，可以改用手動輸入。',
            keywords: ['路牌物料', '大眾運輸導視', '站牌產生器', '線路資料', '專案資料'],
          },
          'material-data-modes': {
            question: '物料工作台的手動輸入、伺服器資料和專案資料有什麼差別？',
            answer: [
              '手動輸入用於自行編排範本允許編輯的內容；伺服器資料從目前已發布的線路、站點、地點或地圖座標產生；專案資料則從「線網資料」區域透過',
              { icon: 'upload_file', label: '匯入 RMP 專案' },
              '取得站點、線路、圖上方向和配色。伺服器資料與專案資料都屬於關聯資料模式，只允許修改範本明確開放的覆寫欄位，並且不需要提交自訂物料審核。',
            ],
            keywords: ['手動輸入', '伺服器資料', '專案資料', '關聯資料', 'RMP 線網'],
          },
          'material-workspace-actions': {
            question: '物料工作台頂端的圖示按鈕分別做什麼？',
            answer: [
              '頂端的',
              { icon: 'visibility', label: '預覽' },
              '用於產生含浮水印的預覽，產生後會變成',
              { icon: 'refresh', label: '更新預覽' },
              '；',
              { icon: 'publish', label: '提交審核' },
              '用於提交手動輸入的自訂物料；只有手動編輯地鐵導視牌時才會出現的',
              { icon: 'save', label: '匯出工程檔案' },
              '用於儲存可再次匯入的 JSON 工程；',
              { icon: 'download', label: '下載圖片' },
              '會依目前資料模式下載圖片。工作台也會在有效輸入變更後自動更新頁面內預覽。',
            ],
            keywords: ['預覽按鈕', '更新預覽', '提交審核', '匯出工程', '下載圖片', '頂端按鈕'],
          },
          'material-review-download': {
            question: '為什麼自訂物料可以預覽，卻還不能下載？',
            answer: [
              '在',
              { text: '物料工具', href: '/services' },
              '中，預覽一律帶有浮水印，未審核的手動輸入也只能下載帶浮水印圖片。登入後可使用',
              { icon: 'publish', label: '提交審核' },
              '；審核通過的記錄會保留在「我的物料歷史」，並可使用',
              { icon: 'download', label: '下載' },
              '取得無浮水印圖片。伺服器資料或 RMP 專案資料不需要審核；帳號權限不可用時，下載會回退為帶浮水印預覽。',
            ],
            keywords: ['物料審核', '無法下載', '預覽浮水印', '自訂物料', '物料歷史', '關聯資料'],
          },
          'metro-wayfinding-editor': {
            question: '地鐵導視牌現在可以在工作台裡編輯哪些內容？',
            answer:
              '選擇「地鐵導視牌」範本並保持手動輸入後，可以使用單行、雙行或直向版式，調整畫布尺寸、底色和預設前景色，並編排設施圖示、箭頭、一般文字、大文字、組合框、固定或彈性空白和分隔線。元素支援拖曳排序、移動、複製、刪除和逐項配色；空白工程還可以從範例工程開始。出現寬度或高度不足提示時，文字可能已經被壓縮，仍溢出的固定尺寸元素需要透過增大畫布或減少元素處理。',
            keywords: ['地鐵導視牌', '視覺化編輯', '單行', '雙行', '直向', '組合框', '尺寸不足'],
          },
          'metro-wayfinding-project-files': {
            question: '地鐵導視牌可以匯入和匯出哪些工程檔案？',
            answer: [
              '編輯器中的',
              { icon: 'upload_file', label: '匯入工程' },
              '支援 YCT 地鐵導視工程、',
              {
                text: 'NaL 導向標誌設計器',
                href: 'https://centralgo.site/vitool/vitool.html',
              },
              '和「',
              {
                text: 'Chitose.City Sign Maker',
                href: 'https://signmaker.chitose.city/',
              },
              '」的 JSON。一次最多選擇 2 個檔案、每個不超過 2 MB，不能混合不同產生器；YCT 與 NaL 工程需要逐個匯入。外部工程會先顯示轉換預覽和警告，可選擇',
              { icon: 'conversion_path', label: '僅語意（建議）' },
              '或',
              { icon: 'palette', label: '保留來源樣式' },
              '，確認後會取代目前導視牌且最多保留兩行。頁面頂端的',
              { icon: 'save', label: '匯出工程檔案' },
              '只在手動編輯地鐵導視牌時出現，匯出的 YCT JSON 可以稍後再次匯入。',
            ],
            keywords: ['匯入工程', '匯出工程', 'YCT 工程', 'NaL', 'Chitose', 'JSON', '2 MB'],
          },
          'metro-wayfinding-project-vs-rmp': {
            question: '地鐵導視的「匯入工程」和「匯入 RMP 專案」是一回事嗎？',
            answer: [
              '不是。地鐵導視編輯器裡的',
              { icon: 'upload_file', label: '匯入工程' },
              '會讀取並取代導視牌的版式和元素；「線網資料」區域的',
              { icon: 'upload_file', label: '匯入自己的專案' },
              '讀取的是 ',
              { text: 'Rail Map Painter', href: 'https://railmapgen.org/?app=rmp' },
              ' 線網，只為專案資料模式提供站點、線路、方向和顏色，不會取代目前導視牌。',
            ],
            keywords: ['匯入工程', 'RMP 專案', '線網資料', '導視牌版式', 'Rail Map Painter'],
          },
          'rmp-import-requirements': {
            question: '匯入 RMP 線網專案失敗時，應檢查哪些內容？',
            answer: [
              'RMP 指',
              {
                text: '地鐵線路圖繪製器（Rail Map Painter）',
                href: 'https://railmapgen.org/?app=rmp',
              },
              '。請在',
              { text: '大眾運輸導視', href: '/services/transit-materials' },
              '的「線網資料」區域使用',
              { icon: 'upload_file', label: '匯入自己的專案' },
              '，不要使用地鐵導視編輯器中的「匯入工程」。請選擇 JSON 格式的 RMP 專案檔案。目前支援 RMP v77 及以下版本，檔案不能超過 5 MB，最多包含 2,000 個節點和 4,000 條連接；專案還需要至少一個帶名稱的可識別車站，以及一條帶有效線路配色的連接。其他缺少名稱的站點可以在匯入後補全。也可以先使用頁面自動載入的 RMP 畫廊範例熟悉專案資料模式。',
            ],
            keywords: ['RMP', 'JSON', '匯入失敗', '5 MB', 'v77', '線網專案', '畫廊範例'],
          },
          'rmp-import-readonly': {
            question: '匯入 RMP 專案後，可以在物料工作台修改線網嗎？',
            answer: [
              '不能修改專案固有的站點位置、站序、連接或拓撲；這些內容仍需回到 ',
              { text: 'Rail Map Painter', href: 'https://railmapgen.org/?app=rmp' },
              ' 修改並重新匯入。工作台可以使用',
              { icon: 'edit_location_alt', label: '補站名' },
              '為未命名站點補充主名稱和副名稱，並使用',
              { icon: 'edit', label: '設定專案線路名稱' },
              '為線路補充顯示名稱。這些補充只影響工作台中的專案資料，不會改寫原始 JSON 檔案。',
            ],
            keywords: ['RMP 唯讀', '修改站點', '補站名', '線路名稱', '重新匯入', '自訂線網'],
          },
          'rmp-project-storage': {
            question: '匯入的 RMP 專案會保留嗎？切回伺服器線網會刪除它嗎？',
            answer: [
              '有效專案會立即用於目前頁面。帳號處於可用登入狀態時，系統還會嘗試把它暫存為目前使用者的線網草稿：「已暫存」表示重新開啟頁面後可以恢復，「僅本頁」表示沒有儲存成功。沒有已暫存專案時，頁面可能載入帶來源和授權資訊的 RMP 畫廊範例，範例上的名稱調整只在本頁有效。切換到伺服器線網不會刪除草稿，只有使用',
              { icon: 'close', label: '移除已匯入專案' },
              '才會清除已匯入專案並回到範例或伺服器線網。',
            ],
            keywords: [
              'RMP 暫存',
              '僅本頁',
              '已暫存',
              '伺服器線網',
              '移除專案',
              '畫廊範例',
              '登入',
            ],
          },
          'rmp-line-names-colors': {
            question: '為什麼匯入 RMP 後會顯示內部線路編號或未命名站點？',
            answer: [
              'RMP 專案提供線網拓撲、部分站名、線路標識和連接配色，但不一定包含適合顯示的完整名稱。使用',
              { icon: 'edit_location_alt', label: '補站名' },
              '可補充未命名站點；使用',
              { icon: 'edit', label: '設定專案線路名稱' },
              '可為每條線路補充主名稱和副名稱。線路顏色仍取自專案中的有效連接配色，補充名稱不會改變站點位置、連接或線網拓撲。',
            ],
            keywords: [
              '線路編號',
              '線路名稱',
              '未命名站點',
              '副名稱',
              '線路顏色',
              'RMP 配色',
              '線網拓撲',
            ],
          },
          'network-health-meaning': {
            question: '大眾運輸網路健康度可以直接作為營運結論嗎？',
            answer:
              '不可以。健康度頁面根據已發布線路、站點和拓撲連接計算統計指標，並用預設啟發式閾值產生建議。它適合發現待核查目標，不代表線路服務品質已得到驗證，也不能取代人工規劃判斷。',
            keywords: ['線網健康度', '啟發式建議', '營運指標', '規劃結論'],
          },
          'network-health-coverage': {
            question: '大眾運輸網路健康度顯示「部分資料」時還能參考嗎？',
            answer:
              '可以作為目前已讀取資料的排查線索，但不能把它當作完整線網結論。頁面會列出資料來源狀態；只要存在部分可用或不可用的資料來源，統計範圍和建議都可能不覆蓋全部線路、站點或營運方。',
            keywords: ['部分資料', '資料來源', '統計範圍', '線網不完整', '營運方'],
          },
        },
      },
    },
  },
  en: {
    pageTitle: 'FAQ',
    directoryTitle: 'Contents',
    introTitle: 'Need help?',
    introDescription: '{count} answers for common Yuchengtong questions.',
    groupItemCount: '{count} items',
    serviceTitle: 'FAQ',
    serviceDescription: 'Usage guidance and answers for common Yuchengtong features.',
    groups: {
      'getting-started': {
        title: 'Getting Started',
        items: {
          'login-required': {
            question: 'Do I need to sign in to use Yuchengtong?',
            answer:
              'No. Updates, maps, lines, and schedule search are available without signing in. An LDPASS account is required for cross-device sync, server push notifications, and ride codes.',
            keywords: ['guest', 'anonymous', 'sign in', 'login'],
          },
          'global-search': {
            question: 'How can I quickly find a place, line, or service?',
            answer: [
              'Use the ',
              { icon: 'search', label: 'Search' },
              ' button in the upper-right corner to search places, lines, trips, updates, service entries, and FAQ answers in one place. Results depend on currently published data.',
            ],
            keywords: ['global search', 'find', 'keyword'],
          },
          'data-not-found': {
            question: 'Why can I not find a place, line, or trip?',
            answer:
              'Yuchengtong shows data that has been entered and published. Check the name and keywords first. If there is still no result, the content may not have been published yet or its data source may be unavailable.',
            keywords: ['no results', 'not found', 'missing data'],
          },
          preferences: {
            question: 'How do I change language, theme, or motion effects?',
            answer: [
              'Open ',
              { text: 'Account Settings', href: '/account' },
              ' to change language, color scheme, material effects, and motion preferences. These settings can be stored on the current device without signing in; supported preferences merge with the account after sign-in.',
            ],
            keywords: ['Traditional Chinese', 'English', 'dark mode', 'animation', 'appearance'],
          },
          'translation-fallback': {
            question: 'Why are some place or line names still Chinese after changing language?',
            answer:
              'Places, lines, and stations prefer the published translation for the selected language. When no translation is available, Yuchengtong falls back to the source name. Translation coverage varies by data source, so multiple languages can appear on the same page.',
            keywords: ['translation', 'language switch', 'English name', 'fallback name'],
          },
          'external-service-language': {
            question: 'Why do some legacy tools not follow the page language?',
            answer:
              'Yuchengtong can switch the main site interface and FAQ copy only. Legacy tools and external server sites are independent pages, and their language depends on their own localization support.',
            keywords: ['legacy tools', 'external site', 'localization', 'interface language'],
          },
          'stale-content': {
            question: 'Why do I still see an old page after an update?',
            answer: [
              'Your browser or installed app may still be using cached content. Open ',
              { text: 'Account Settings', href: '/account' },
              ' and use ',
              { icon: 'refresh', label: 'Refresh cache' },
              ' under Install and Offline, then reopen the page. Refreshing the cache does not replace syncing local reminders that are still pending.',
            ],
            keywords: ['cache', 'old version', 'refresh failed', 'PWA update'],
          },
        },
      },
      'operations-and-updates': {
        title: 'Operations and Updates',
        items: {
          'operations-expired': {
            question: 'Can I still read an update after its display period ends?',
            answer:
              'Yes. The home page moves content past its display period into the Expired Updates section under the current category. After changing categories, only current and expired content in that category is shown. Withdrawn or unpublished content is not visible publicly.',
            keywords: [
              'expired updates',
              'old notice',
              'display period',
              'update category',
              'missing notice',
            ],
          },
          'server-status-refresh': {
            question: 'Are the server status and online player count live?',
            answer:
              'Server status comes from periodic gateway queries. The page refreshes it about every 15 seconds rather than using a continuous live connection. A brief query failure keeps the last confirmed state. To check a specific player, open the map and use the last observed and last online times.',
            keywords: [
              'server status',
              'online players',
              'latency',
              'refresh interval',
              'status not updating',
            ],
          },
        },
      },
      'map-and-routes': {
        title: 'Map and Routes',
        items: {
          'route-unavailable': {
            question: 'Why is there no route plan available?',
            answer:
              'Make sure an origin and destination are selected, then try walking or public transport modes. Plans depend on published roads, stops, and line topology. A plan may be unavailable when data is missing or the two points are not connected.',
            keywords: ['cannot plan', 'no route', 'origin destination', 'not connected'],
          },
          'route-estimate': {
            question: 'Are route time, distance, and fare exact values?',
            answer:
              'The page labels values such as road estimate, straight-line estimate, estimated, or to be confirmed. These values are for trip planning only. Follow live operations information and on-site conditions.',
            keywords: ['estimated time', 'distance error', 'fare estimate'],
          },
          'favorite-sync': {
            question: 'Why are my map favorites missing on another device?',
            answer: [
              'When not signed in, favorites remain in the current browser and do not appear on other devices automatically. After sign-in, open ',
              { text: 'Account Settings', href: '/account' },
              ' to review local history and sync status.',
            ],
            keywords: ['lost favorites', 'cross-device', 'sync favorites'],
          },
          'map-sharing': {
            question: 'How do I share a place, route, or coordinate?',
            answer: [
              'Open a place or route detail on the map and use ',
              { icon: 'share', label: 'Share' },
              '. Depending on the content and browser, you can copy a link, text, coordinates, or a teleport command, or create a QR code or share image.',
            ],
            keywords: ['QR code', 'copy coordinates', 'teleport command', 'share image', 'link'],
          },
          'map-toolbar-controls': {
            question: 'What do the plus, minus, location, and layers icons on the map toolbar do?',
            answer: [
              'On the map toolbar, ',
              { icon: 'add', label: 'plus' },
              ' and ',
              { icon: 'remove', label: 'minus' },
              ' zoom the view, ',
              { icon: 'my_location', label: 'location' },
              ' returns to the default map view rather than reading phone GPS, and ',
              { icon: 'layers', label: 'layers' },
              ' opens browse modes, submission, and tile-source settings.',
            ],
            keywords: ['map toolbar', 'plus', 'minus', 'location icon', 'layers icon', 'GPS'],
          },
          'poi-action-icons': {
            question: 'What do the icon buttons below a place detail do?',
            answer: [
              'Below a place detail, ',
              { icon: 'directions', label: 'Route' },
              ' uses the place as a route-planning endpoint, ',
              { icon: 'travel_explore', label: 'Nearby' },
              ' searches nearby content, ',
              { icon: 'bookmark', label: 'Bookmark' },
              ' saves or removes a favorite, and ',
              { icon: 'share', label: 'Share' },
              ' opens the place sharing panel. Icon buttons also show their text label on hover or focus.',
            ],
            keywords: [
              'place detail',
              'route button',
              'nearby search',
              'bookmark icon',
              'share button',
            ],
          },
          'map-share-link': {
            question: 'How are Copy link, QR code, and Share image different in the sharing panel?',
            answer: [
              'The ',
              { icon: 'share', label: 'Share' },
              ' panel for a place or route can use ',
              { icon: 'link', label: 'Copy link' },
              ' to create a short link that reopens the current place or route, or ',
              { icon: 'qr_code_2', label: 'QR code' },
              ' so someone else can scan the same link. ',
              { icon: 'image', label: 'Share image' },
              ' is a static snapshot for forwarding or saving and does not replace an interactive map link. Sharing these public places and routes does not require sign-in.',
            ],
            keywords: [
              'share link',
              'short link',
              'QR code',
              'share image',
              'share without sign-in',
            ],
          },
          'map-share-troubleshooting': {
            question: 'What should I do when sharing fails or the browser says it is unsupported?',
            answer: [
              'When system sharing is unsupported, use ',
              { icon: 'content_copy', label: 'Copy link' },
              ' or copy text, coordinates, and teleport commands. If the clipboard is unavailable too, check clipboard permission for this page and try again. Creating a short link needs the site service to be available; after a temporary failure, use ',
              { icon: 'refresh', label: 'Retry' },
              ' or share the current address directly.',
            ],
            keywords: ['share failed', 'browser unsupported', 'clipboard', 'copy link', 'retry'],
          },
          'keyboard-shortcuts': {
            question: 'How do I view and use keyboard shortcuts?',
            answer: [
              'Hold ',
              { icon: 'keyboard', label: 'Ctrl' },
              ' to open the shortcuts available on the current page. On the map, plus and minus zoom the view, slash focuses search, and 0 resets the view; after selecting a place or opening route planning, the list also shows actions such as planning a route and swapping endpoints. Map shortcuts do not trigger while you are typing.',
            ],
            keywords: [
              'keyboard',
              'shortcuts',
              'Ctrl',
              'search',
              'zoom',
              'reset view',
              'swap endpoints',
            ],
          },
          'poi-submission': {
            question: 'What should I do if a place is missing or incorrect on the map?',
            answer: [
              'Use ',
              { icon: 'add_location_alt', label: 'Submit Public POI' },
              ' on the map to provide a name, category, coordinates, and description for review. A submission is not published immediately; it enters the published map data after administrator approval.',
            ],
            keywords: ['add place', 'correction', 'POI submission', 'review', 'wrong coordinates'],
          },
          'player-location-delay': {
            question: 'Why is a player location delayed on the map?',
            answer:
              'Player locations come from periodic observations through the server gateway, not live browser GPS. Network conditions, server state, and polling intervals can add delay. Use the last observed and last online times to judge whether a location is still useful.',
            keywords: [
              'live location',
              'player offline',
              'inaccurate location',
              'location polling',
            ],
          },
          'directional-stop-location': {
            question: 'Why does one station use different stop locations by line or direction?',
            answer:
              'A station can have a default stop location for a line and separate locations for each travel direction. Line details and route planning prefer the location for the current direction, then fall back to the line default and finally the station default.',
            keywords: [
              'stop location',
              'travel direction',
              'inbound',
              'outbound',
              'station location',
              'boarding point',
            ],
          },
          'map-tile-provider': {
            question: 'How do I change the satellite tile source when the map is not current?',
            answer: [
              'Open ',
              { icon: 'layers', label: 'Layers and Submissions' },
              ' while in satellite mode. When multiple tile sources are available, choose one under Tile Source. Sources vary in freshness and availability, and the selected source is stored in the current browser.',
            ],
            keywords: ['satellite map', 'basemap', 'tile source', 'map update', 'layers'],
          },
          'map-tiles-unavailable': {
            question: 'What should I do when map tiles or the basemap fail to load?',
            answer: [
              'Check the network connection and ',
              { icon: 'refresh', label: 'refresh' },
              ' the page. In satellite mode, try another tile source if one is available in Layers. If every source is unavailable, the map data source is likely temporarily inaccessible; try again later.',
            ],
            keywords: ['blank map', 'tile load failed', 'missing basemap', 'map data unavailable'],
          },
        },
      },
      'travel-and-ride': {
        title: 'Travel and Ride',
        items: {
          'schedule-unavailable': {
            question: 'What should I do when schedule search says data is unavailable?',
            answer: [
              'Schedule search only includes published plans that are currently valid. Refresh later or check ',
              { text: 'Updates', href: '/' },
              ' for temporary adjustments, suspensions, and other notices.',
            ],
            keywords: ['timetable', 'trip', 'suspension', 'departure time'],
          },
          'schedule-filtering': {
            question: 'How can I narrow schedule search results?',
            answer: [
              'Use the ',
              { icon: 'filter_alt', label: 'Filters' },
              ' to narrow by service type, line or trip keywords, stop, origin, destination, service date, and past or upcoming departures. For today, past and upcoming are split by the current time; other dates are handled by their date range.',
            ],
            keywords: [
              'filter trips',
              'origin',
              'destination',
              'service date',
              'upcoming',
              'past trips',
            ],
          },
          'schedule-pending-fields': {
            question: 'Why do a trip gate, runtime, or vehicle show as to be announced?',
            answer:
              'Those fields come from published trip data. When a source does not provide them, they cannot be confirmed, or they do not apply to the trip, the page shows to be announced or TBD. Yuchengtong does not infer missing values.',
            keywords: ['gate', 'runtime', 'vehicle', 'TBD', 'to be announced'],
          },
          'schedule-booking-link': {
            question: 'Why do some trips have search details but no booking link?',
            answer:
              'A booking entry is shown only when the published trip data includes a valid booking URL. A trip without a link can still be searched; this does not prove that the trip cannot be purchased.',
            keywords: ['booking', 'ticket purchase', 'reservation', 'no link', 'query only'],
          },
          'transit-screen-scope': {
            question: 'How is Transit Screen different from Schedule Search?',
            answer:
              'Transit Screen gives a quick view of stations, lines, gates, and upcoming trips in the current data snapshot. Schedule Search provides detailed filters for dates, stops, service types, and time ranges. Both use currently published data, while a legacy screen link may read a separate source.',
            keywords: [
              'Transit Screen',
              'upcoming trips',
              'Schedule Search',
              'gate',
              'legacy screen',
            ],
          },
          'ticketing-unavailable': {
            question: 'Why is a searchable trip unavailable for booking or order drafts?',
            answer:
              'Searchable does not mean sellable. A new order draft requires an active LDPASS sign-in, a trip connected to unified ticketing, real fare and inventory configuration, and remaining capacity. A legacy booking link is only a separate reference and does not mean new ticketing is available.',
            keywords: [
              'unavailable',
              'inventory pending',
              'sold out',
              'ticketing pending',
              'order draft',
            ],
          },
          'ticket-draft-not-issued': {
            question: 'Have I bought a ticket after creating an order draft?',
            answer:
              'No. An order draft only holds the relevant inventory, for 15 minutes by default. It is not an issued ticket or a redeemable credential. Cancelling the draft or letting it expire releases the hold. Issuance is complete only after the status explicitly becomes Issued and a valid ticket or credential appears.',
            keywords: [
              'order draft',
              'seat hold',
              'inventory hold',
              '15 minutes',
              'issued',
              'redemption credential',
            ],
          },
          'ride-code-login': {
            question: 'Why does Ride Code take me to the account page?',
            answer: [
              { icon: 'qr_code_2', label: 'Ride Code' },
              ' requires an active LDPASS sign-in. Sign in first. It cannot open when the account is read-only, the login service is not configured, or the Ride Code service is temporarily unavailable.',
            ],
            keywords: ['ride QR code', 'sign-in expired', 'cannot open ride code'],
          },
          'reminder-missing': {
            question: 'Why am I not receiving trip or ticket reminders?',
            answer: [
              'In ',
              { text: 'Account Settings', href: '/account' },
              ', check the device push switch, the relevant reminder categories, and quiet hours. Also confirm that browser ',
              { icon: 'notifications', label: 'Notifications' },
              ' are allowed. Local reminders created without sign-in must be synced before the server can push them to other devices.',
            ],
            keywords: ['notification', 'push', 'quiet hours', 'no reminder', 'browser permission'],
          },
          'local-reminder-sync': {
            question: 'What does a pending reminder sync mean?',
            answer:
              'The reminder currently exists in this browser only and has not been saved to the account. Sign in and sync it from Account Settings. After a successful sync, other devices can read it and the server can take part in later delivery.',
            keywords: ['local reminder', 'syncedAt', 'cloud sync', 'account badge'],
          },
          'legacy-orders': {
            question: 'Why are legacy orders records not new ticket orders?',
            answer:
              'Read-only records imported from legacy orders are trip reminder snapshots for preserving history and reminders. They are not new orders, tickets, or check-in credentials. The app asks for separate consent before syncing them.',
            keywords: [
              'legacy order',
              'order history',
              'ticket',
              'check-in credential',
              'migration',
            ],
          },
        },
      },
      'account-and-offline': {
        title: 'Account and Offline',
        items: {
          'readonly-account': {
            question: 'What does a read-only account mean?',
            answer:
              'The system recognized the signed-in identity, but the current session cannot write account data. You can still browse public content. Favorite sync, orders, and some account features require the account to return to an active state.',
            keywords: ['readonly', 'cannot sync', 'account error'],
          },
          'account-badge': {
            question: 'What do the number or dot on the account button mean?',
            answer: [
              'The ',
              { icon: 'account_circle', label: 'Account' },
              ' button number usually indicates pending items, such as local trip reminders that have not been synced or account-side work. A dot indicates that account configuration, the session, or another status needs attention. Open Account Settings to see the source.',
            ],
            keywords: ['badge', 'red dot', 'pending', 'notification count'],
          },
          'push-device-scope': {
            question: 'Why do I need to enable push again in a different browser?',
            answer:
              'Push subscriptions are registered separately for each device and browser, and notification permission is also browser-specific. After changing devices or browsers, or clearing site permission, allow notifications and enable push again in Account Settings.',
            keywords: [
              'notification permission',
              'device subscription',
              'new phone',
              'new browser',
            ],
          },
          'account-session-unavailable': {
            question:
              'Why do I still appear signed out or see account unavailable after signing in?',
            answer:
              'Return to Account Settings to check the specific status, then try signing in again. Public content does not depend on an account session. Repeated session read failures, missing shared cookies, or an unconfigured login service generally require the corresponding login environment to recover.',
            keywords: [
              'login failed',
              'session expired',
              'cookie',
              'account unavailable',
              'sign in again',
            ],
          },
          'private-storage': {
            question: 'Why are my preferences, favorites, or tile source selection not saved?',
            answer:
              'These choices are stored in the browser first. Private browsing, restricted site storage permission, or storage quota problems can prevent persistent storage, leaving the selection valid only for the current session. Sign in and use the corresponding sync for data that must persist across devices.',
            keywords: [
              'incognito',
              'private mode',
              'local storage',
              'lost preferences',
              'settings not saved',
            ],
          },
          'offline-capabilities': {
            question: 'What can I continue using offline?',
            answer:
              'Recently cached updates, lines, station details, and service entries can continue to open. They refresh after the connection returns. Content that has never been opened or cached still needs a network connection.',
            keywords: ['offline', 'no connection', 'cached content'],
          },
          'offline-package-boundary': {
            question:
              'Why is some map content still unavailable after saving a custom offline area?',
            answer:
              'A custom area currently records Minecraft coordinate bounds and refreshes public base data. It does not mean every map tile in that area has been downloaded. Full offline tile packages are still constrained by generation policy and size limits.',
            keywords: ['map tiles', 'custom area', 'offline package', 'Minecraft coordinates'],
          },
          'install-app': {
            question: 'How do I install Yuchengtong to a desktop or home screen?',
            answer: [
              'Open ',
              { text: 'Account Settings', href: '/account' },
              ' and use the ',
              { icon: 'install_mobile', label: 'Install' },
              " control under Install and Offline. Availability depends on the browser and system. When no install control is shown, use the browser's Add to Home Screen feature.",
            ],
            keywords: ['PWA', 'add to home screen', 'desktop app', 'install button'],
          },
          changelog: {
            question: 'Where can I see what changed in the latest release?',
            answer: [
              'Open ',
              {
                text: 'Changelog',
                href: '/services/changelog',
                icon: 'history',
              },
              ' from More Services. It lists the available release version, build, and published changes. If no release is listed, there is no public release manifest available yet.',
            ],
            keywords: ['changelog', 'release notes', 'version', 'build', 'updates'],
          },
          'clear-local-data': {
            question: 'Does clearing cache remove favorites and local reminders?',
            answer: [
              { icon: 'refresh', label: 'Refresh cache' },
              ' or managing offline cache mainly handles application cache. Favorites, preferences, and local reminders use separate local storage and sync flows. Before confirming an action labeled ',
              { icon: 'delete_sweep', label: 'Clear local records' },
              ' or similar, read the confirmation text and sync data you need to keep.',
            ],
            keywords: ['clear data', 'localStorage', 'delete favorites', 'delete reminders'],
          },
        },
      },
      'tools-and-services': {
        title: 'Tools and Services',
        items: {
          'legacy-service-new-tab': {
            question: 'Why do some services open in a new tab?',
            answer:
              'More Services includes legacy tools and external server sites. Those entries open in a new tab according to their configuration. Their sign-in state, data scope, and interactions may differ from the Yuchengtong main site.',
            keywords: ['external site', 'legacy tool', 'redirect', 'new window'],
          },
          'legacy-data-difference': {
            question: 'Why do legacy tools and the Yuchengtong main site show different data?',
            answer:
              'Legacy tools, external server sites, and the main site can read different data sources or publication revisions. The main site uses the currently published data. When comparing sites, check the data source and update time shown on the page.',
            keywords: [
              'data mismatch',
              'legacy site',
              'external service',
              'publication revision',
              'updated time',
            ],
          },
          'material-data-missing': {
            question: 'Why can I not find a line or place in a material generator?',
            answer:
              'Server Data mode lists only published lines, stations, and places that provide the fields required by the template. Drafts, items under review, and incomplete data are not shown. After Transit Wayfinding switches to Project Data, it lists only recognized, named RMP stations and lines with a valid connection in the selected diagram direction. Use Manual Input when you need to enter the editable content yourself.',
            keywords: [
              'road sign material',
              'transit wayfinding',
              'stop generator',
              'line data',
              'project data',
            ],
          },
          'material-data-modes': {
            question: 'How do Manual Input, Server Data, and Project Data differ?',
            answer: [
              'Manual Input lets you compose the content exposed by a template. Server Data generates material from published lines, stations, places, or map coordinates. Project Data reads stations, lines, diagram directions, and colors from the Network Data section after you use ',
              { icon: 'upload_file', label: 'Import RMP project' },
              '. Server Data and Project Data are linked-data modes: only override fields explicitly exposed by the template remain editable, and custom-material review is not required.',
            ],
            keywords: ['manual input', 'server data', 'project data', 'linked data', 'RMP network'],
          },
          'material-workspace-actions': {
            question: 'What do the icon buttons at the top of the material workspace do?',
            answer: [
              'The ',
              { icon: 'visibility', label: 'Preview' },
              ' action generates a watermarked preview and changes to ',
              { icon: 'refresh', label: 'Update preview' },
              ' afterward. ',
              { icon: 'publish', label: 'Submit for review' },
              ' submits manually entered custom material. ',
              { icon: 'save', label: 'Export project file' },
              ' appears only while manually editing a metro wayfinding sign and saves JSON that can be imported again. ',
              { icon: 'download', label: 'Download image' },
              ' downloads according to the current data mode. The inline preview also refreshes automatically after valid input changes.',
            ],
            keywords: [
              'preview button',
              'update preview',
              'submit for review',
              'export project',
              'download image',
              'top buttons',
            ],
          },
          'material-review-download': {
            question: 'Why can I preview a custom material but not download it yet?',
            answer: [
              'In ',
              { text: 'Material Tools', href: '/services' },
              ', previews are always watermarked, and unreviewed Manual Input can download only a watermarked image. After signing in, use ',
              { icon: 'publish', label: 'Submit for review' },
              '. Approved records remain in My Material History, where ',
              { icon: 'download', label: 'Download' },
              ' provides an image without the watermark. Server Data and RMP Project Data do not require review; when account authorization is unavailable, downloading falls back to the watermarked preview.',
            ],
            keywords: [
              'material review',
              'cannot download',
              'preview watermark',
              'custom material',
              'material history',
              'linked data',
            ],
          },
          'metro-wayfinding-editor': {
            question: 'What can I edit in the metro wayfinding sign workspace?',
            answer:
              'Select the Metro Wayfinding Sign template and stay in Manual Input to choose a single-row, double-row, or vertical layout; adjust canvas size, background, and default foreground colors; and compose facility icons, arrows, regular text, large text, combinations, fixed or flexible spaces, and dividers. Elements support drag reordering, moving, duplicating, deleting, and per-element colors. An empty project can start from an example. A width or height warning means text may already be compressed; fixed-size elements that still overflow require a larger canvas or fewer elements.',
            keywords: [
              'metro wayfinding',
              'visual editor',
              'single row',
              'double row',
              'vertical',
              'combination',
              'insufficient size',
            ],
          },
          'metro-wayfinding-project-files': {
            question: 'Which metro wayfinding project files can I import and export?',
            answer: [
              "The editor's ",
              { icon: 'upload_file', label: 'Import project' },
              ' action supports JSON from YCT Metro Wayfinding, ',
              {
                text: 'NaL VI Tool',
                href: 'https://centralgo.site/vitool/vitool.html',
              },
              ', and ',
              {
                text: 'Chitose.City Sign Maker',
                href: 'https://signmaker.chitose.city/',
              },
              '. Select at most two files, each no larger than 2 MB, and do not mix generators. YCT and NaL projects must be imported one at a time. External projects first show a conversion preview and warnings; choose ',
              { icon: 'conversion_path', label: 'Semantics only (recommended)' },
              ' or ',
              { icon: 'palette', label: 'Preserve source style' },
              '. Confirming replaces the current sign and retains at most two rows. The top-bar ',
              { icon: 'save', label: 'Export project file' },
              ' action appears only while manually editing a metro wayfinding sign; its YCT JSON can be imported again later.',
            ],
            keywords: [
              'import project',
              'export project',
              'YCT project',
              'NaL',
              'Chitose',
              'JSON',
              '2 MB',
            ],
          },
          'metro-wayfinding-project-vs-rmp': {
            question: 'Are Import project and Import RMP project the same operation?',
            answer: [
              'No. ',
              { icon: 'upload_file', label: 'Import project' },
              ' inside the metro wayfinding editor reads and replaces the sign layout and elements. ',
              { icon: 'upload_file', label: 'Import your own project' },
              ' in Network Data reads a ',
              { text: 'Rail Map Painter', href: 'https://railmapgen.org/?app=rmp' },
              ' network only to supply stations, lines, directions, and colors to Project Data mode; it does not replace the current sign.',
            ],
            keywords: [
              'import project',
              'RMP project',
              'network data',
              'sign layout',
              'Rail Map Painter',
            ],
          },
          'rmp-import-requirements': {
            question: 'What should I check when an RMP network project fails to import?',
            answer: [
              'RMP refers to ',
              {
                text: 'Rail Map Painter',
                href: 'https://railmapgen.org/?app=rmp',
              },
              '. In ',
              {
                text: 'Transit Wayfinding',
                href: '/services/transit-materials',
              },
              ', use ',
              { icon: 'upload_file', label: 'Import your own project' },
              ' in Network Data, not Import project in the metro wayfinding editor. Choose an RMP JSON file. The importer supports RMP v77 and earlier, files up to 5 MB, 2,000 nodes, and 4,000 edges. A project needs at least one recognized named station and one edge with valid line colors; other unnamed stations can be completed after import. You can also start with the RMP Gallery example loaded by the page to learn Project Data mode.',
            ],
            keywords: [
              'RMP',
              'JSON',
              'import failed',
              '5 MB',
              'v77',
              'network project',
              'gallery example',
            ],
          },
          'rmp-import-readonly': {
            question:
              'Can I edit the network in the material workspace after importing an RMP project?',
            answer: [
              'You cannot change intrinsic station positions, station order, edges, or topology. Make those changes in ',
              { text: 'Rail Map Painter', href: 'https://railmapgen.org/?app=rmp' },
              ' and import the project again. The workspace can use ',
              { icon: 'edit_location_alt', label: 'Complete station names' },
              ' to add primary and secondary names to unnamed stations, and ',
              { icon: 'edit', label: 'Configure project line names' },
              ' to add display names for lines. These additions affect Project Data in the workspace only and do not rewrite the original JSON file.',
            ],
            keywords: [
              'RMP read-only',
              'edit station',
              'complete station names',
              'line names',
              'import again',
              'custom network',
            ],
          },
          'rmp-project-storage': {
            question:
              'Is an imported RMP project kept, and does switching to server data delete it?',
            answer: [
              'A valid project is available on the current page immediately. With an active signed-in account, the app also tries to store a network draft for that user. "Stored" means it can be restored after reopening the page; "This page only" means it was not saved. When no stored project exists, the page may load an RMP Gallery example with source and license details; name changes to that example last only on the current page. Switching to Server Network does not delete the draft. Only ',
              { icon: 'close', label: 'Remove imported project' },
              ' clears the imported project and returns to the example or server network.',
            ],
            keywords: [
              'RMP storage',
              'this page only',
              'stored',
              'server network',
              'remove project',
              'gallery example',
              'sign in',
            ],
          },
          'rmp-line-names-colors': {
            question: 'Why does an imported RMP show internal line IDs or unnamed stations?',
            answer: [
              'An RMP project provides topology, some station names, line identifiers, and edge colors, but it may not include complete display names. Use ',
              { icon: 'edit_location_alt', label: 'Complete station names' },
              ' for unnamed stations and ',
              { icon: 'edit', label: 'Configure project line names' },
              ' to add a primary and secondary name for each line. Colors still come from valid colored edges in the project. Adding names does not change station positions, edges, or topology.',
            ],
            keywords: [
              'line ID',
              'line name',
              'unnamed station',
              'secondary name',
              'line color',
              'RMP palette',
              'network topology',
            ],
          },
          'network-health-meaning': {
            question: 'Can transit network health be used as an operational conclusion?',
            answer:
              'No. The health page calculates metrics from published lines, stops, and topology, then generates suggestions using preset heuristic thresholds. It is useful for finding items to investigate, but it does not validate service quality or replace human planning judgment.',
            keywords: [
              'network health',
              'heuristic suggestions',
              'operations metrics',
              'planning conclusion',
            ],
          },
          'network-health-coverage': {
            question: 'Can I rely on transit network health when it shows partial data?',
            answer:
              'Use it as a clue for the data currently read, not as a complete network conclusion. The page lists source status. When any source is partial or unavailable, its metrics and suggestions may not cover every line, stop, or operator.',
            keywords: ['partial data', 'data source', 'coverage', 'incomplete network', 'operator'],
          },
        },
      },
    },
  },
};

export function getLocalizedFaqContent(locale: LocaleCode): LocalizedFaqContent {
  const catalog = locale === 'zh-CN' ? zhCnCatalog : faqCatalogs[locale];

  return {
    ...catalog,
    groups: faqGroups.map((group) => localizeGroup(group, catalog.groups[group.id])),
  };
}

export function formatFaqMessage(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (token, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : token,
  );
}

function localizeGroup(group: FaqGroup, translation: FaqGroupTranslation | undefined): FaqGroup {
  return {
    ...group,
    title: translation?.title ?? group.title,
    items: group.items.map((item) => localizeItem(item, translation?.items[item.id])),
  };
}

function localizeItem(item: FaqItem, translation: FaqItemTranslation | undefined): FaqItem {
  return translation
    ? {
        ...item,
        ...translation,
      }
    : item;
}
