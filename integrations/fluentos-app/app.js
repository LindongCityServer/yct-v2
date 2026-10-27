/*
 * 雨城通 · FluentOS Developer Center 沙箱 App
 *
 * 运行环境约束（来自 js/core/developer-created-runtime.js，务必遵守）：
 *   - 安装态 iframe sandbox 无 allow-same-origin，来源不透明：读不到 Cookie / localStorage / IndexedDB。
 *   - 安装态 CSP：connect-src 'none' / navigate-to 'none' / form-action 'none' / frame-src 'none'，
 *     因此本 App 内不得直接 fetch、不得跳转、不得提交表单，全部必须经 FluentOS 桥接。
 *   - 宿主侧 _networkRequest 固定 credentials:'omit' + redirect:'error'：
 *     不带 Cookie，且任何 3xx 都会直接抛错。故必须使用不产生重定向的规范路径。
 *   - 每个受限 API 首次调用会弹一次系统授权，拒绝是持久的，绝不能循环重试。
 */

(function () {
    'use strict';

    /* ============================ 端点与常量 ============================ */

    var API_ORIGIN = 'https://yct.shangxiaoguan.top';

    // 规范路径不带 /v2：/v2/api/... 会被 nginx 307 到 /api/...，而桥接层 redirect:'error' 会直接失败。
    // 依据：线上 GET /api/v1/public/openapi 的 servers[0].url。
    var API_BASE = API_ORIGIN + '/api/v1/public';

    // 设备授权（RFC 8628）—— 需雨城通后端实现，契约见 BACKEND_DEVICE_AUTH.md
    var DEVICE_AUTHORIZE_URL = API_ORIGIN + '/api/auth/device/authorize';
    var DEVICE_TOKEN_URL = API_ORIGIN + '/api/auth/device/token';
    var DEVICE_VERIFY_URL = API_ORIGIN + '/auth/device';

    var STORAGE_KEY = 'yct.device.session';
    var REQUEST_TIMEOUT_NOTE = 15000;

    /* ============================ 文案字典 ============================ */

    var messages = {
        zh: {
            appTitle: '雨城通',
            appSubtitle: '临东市公共交通信息',
            navLabel: '主导航',
            navHome: '首页',
            navTransit: '线路',
            navStations: '站点',
            navSchedules: '班次',
            navOperations: '公告',
            navAccount: '账户',
            refresh: '刷新数据',
            loading: '正在加载…',
            retry: '重试',
            backToList: '返回列表',
            sourceReady: '数据正常',
            sourceDegraded: '数据降级',
            sourceGeneratedAt: '生成于 {time}',
            sourceMessage: '来源说明',
            homeSummaryTitle: '线网概览',
            homeServicesTitle: '服务入口',
            homeLatestTitle: '最新公告',
            homeStatLines: '线路',
            homeStatStations: '站点',
            homeViewAll: '查看全部',
            homeOpenService: '打开',
            transitTitle: '线路',
            transitFilterAll: '全部',
            transitLineCount: '共 {count} 条',
            transitOperator: '运营方',
            transitFirstBus: '首班',
            transitLastBus: '末班',
            transitFare: '票价',
            transitStops: '途经站点（{count}）',
            transitNoLines: '没有匹配的线路',
            stationsTitle: '站点',
            stationsSearchPlaceholder: '搜索站点或线路',
            stationsNoResult: '没有匹配的站点',
            stationsPickOne: '从左侧选择一个站点查看详情',
            stationsLayers: '楼层结构',
            stationsFacilities: '站内设施',
            stationsTransfers: '换乘',
            stationsExits: '出入口',
            stationsNearby: '周边站点',
            stationsNone: '暂无数据',
            stationsDirection: '朝向',
            stationsOneWay: '单向',
            stationsEndFloor: '至',
            stationsOverGround: '地面站',
            stationsUnderGround: '地下站',
            schedulesTitle: '班次查询',
            schedulesFrom: '出发站',
            schedulesTo: '到达站',
            schedulesDate: '日期',
            schedulesAny: '不限',
            schedulesSearch: '查询',
            schedulesNoResult: '没有符合条件的班次',
            schedulesHint: '选择出发站、到达站或日期后查询',
            schedulesDepart: '出发',
            schedulesArrive: '到达',
            schedulesRuntime: '历时',
            schedulesOperator: '承运方',
            schedulesVehicle: '车型',
            schedulesGate: '进出站',
            schedulesDays: '运营日',
            schedulesNotices: '运营提示',
            schedulesFareNotConfigured: '票种未配置，仅提供查询',
            schedulesQueryOnly: '仅查询',
            schedulesBookingReference: '可预订',
            schedulesLegacyOnly: '沿用旧系统',
            operationsTitle: '公告',
            operationsFilterAll: '全部',
            operationsNoResult: '没有匹配的公告',
            operationsPublishedAt: '发布于 {date}',
            operationsEmpty: '暂无已发布内容',
            accountTitle: '账户',
            accountIntro: '雨城通账户由临东通统一提供。FluentOS 沙箱应用无法读取浏览器 Cookie，因此本 App 使用设备授权方式登录：在真实浏览器里完成临东通登录，再把授权码带回本应用。',
            accountLogin: '开始登录',
            accountLoginPending: '等待授权',
            accountCodeLabel: '授权码',
            accountCodeHint: '已在新窗口打开授权页。请在其中完成临东通登录，确认授权码后回到本应用点击“我已授权”。',
            accountOpenPage: '重新打开授权页',
            accountCheckNow: '我已授权',
            accountCancel: '取消',
            accountLogout: '退出登录',
            accountLoggedIn: '已登录',
            accountCredential: '凭证状态',
            accountTokenValid: '凭证有效期至 {time}',
            accountTokenNoExpiry: '凭证无明确有效期',
            accountLocalOnly: '凭证仅保存在本机 FluentOS 应用存储中，不会写入网页端会话。',
            accountReadonly: '只读账户',
            accountNotConfigured: '雨城通尚未开放设备授权接口，登录功能暂不可用。其余公开数据不受影响。',
            accountPermissionDenied: '存储权限被拒绝，无法保存登录凭证。可在 Developer Center 重新授权后再试。',
            accountNetworkFailed: '无法连接雨城通服务器，请检查网络后重试。',
            accountExpired: '授权码已过期，请重新开始登录。',
            accountDenied: '授权已被拒绝。',
            accountStateWaiting: '授权进行中，请稍候…',
            facilityToilet: '卫生间',
            facilityElevator: '直梯',
            facilityEscalator: '扶梯',
            facilityEscalatorStairs: '扶梯与楼梯',
            facilityStairs: '楼梯',
            facilityNursingRoom: '母婴室',
            facilityWaitingRoom: '候车室',
            layerConcourse: '站厅层',
            layerPlatform: '站台层',
            layerPassageway: '通道层',
            directionUpwards: '向上',
            directionDownwards: '向下',
            directionBoth: '双向',
            directionNone: '—',
            oneWayYes: '单向',
            oneWayNo: '双向',
            modeMetro: '地铁',
            modeTram: '有轨电车',
            modeBus: '公交',
            modeCoach: '客运',
            modeFerry: '轮渡',
            modeRailway: '地方铁路',
            modeCustom: '线路',
            opCategoryNotice: '通知公告',
            opCategoryBusOps: '公交运营',
            opCategoryMetroOps: '地铁运营',
            opCategoryTramOps: '有轨运营',
            opCategoryWebNotice: '网站公告',
            opCategoryOpsInfo: '运营信息',
            opCategoryWordpress: '站点文章',
            errNetwork: '网络请求失败（{message}）',
            errTimeout: '请求超时，请稍后重试。',
            errPermission: '权限被拒绝：{message}',
            errNotDeclared: '缺少权限声明：{message}',
            errDomain: '目标域名不在允许列表中：{message}',
            errHttp: '服务器返回 {status}',
            errData: '返回数据格式异常，无法解析。',
            errUnknown: '发生未知错误：{message}',
            errBridge: '与 FluentOS 的连接已断开，请重新打开应用。'
        },
        en: {
            appTitle: 'Yuchengtong',
            appSubtitle: 'Lindong public transport information',
            navLabel: 'Main navigation',
            navHome: 'Home',
            navTransit: 'Lines',
            navStations: 'Stations',
            navSchedules: 'Schedules',
            navOperations: 'Notices',
            navAccount: 'Account',
            refresh: 'Refresh data',
            loading: 'Loading…',
            retry: 'Retry',
            backToList: 'Back to list',
            sourceReady: 'Data healthy',
            sourceDegraded: 'Data degraded',
            sourceGeneratedAt: 'Generated at {time}',
            sourceMessage: 'Source note',
            homeSummaryTitle: 'Network overview',
            homeServicesTitle: 'Service entries',
            homeLatestTitle: 'Latest notices',
            homeStatLines: 'Lines',
            homeStatStations: 'Stations',
            homeViewAll: 'View all',
            homeOpenService: 'Open',
            transitTitle: 'Lines',
            transitFilterAll: 'All',
            transitLineCount: '{count} total',
            transitOperator: 'Operator',
            transitFirstBus: 'First',
            transitLastBus: 'Last',
            transitFare: 'Fare',
            transitStops: 'Stops ({count})',
            transitNoLines: 'No matching lines',
            stationsTitle: 'Stations',
            stationsSearchPlaceholder: 'Search station or line',
            stationsNoResult: 'No matching stations',
            stationsPickOne: 'Select a station on the left to see details',
            stationsLayers: 'Levels',
            stationsFacilities: 'Facilities',
            stationsTransfers: 'Transfers',
            stationsExits: 'Exits',
            stationsNearby: 'Nearby stations',
            stationsNone: 'No data',
            stationsDirection: 'Direction',
            stationsOneWay: 'One-way',
            stationsEndFloor: 'to',
            stationsOverGround: 'Ground level',
            stationsUnderGround: 'Underground',
            schedulesTitle: 'Schedule search',
            schedulesFrom: 'From',
            schedulesTo: 'To',
            schedulesDate: 'Date',
            schedulesAny: 'Any',
            schedulesSearch: 'Search',
            schedulesNoResult: 'No trips match the filters',
            schedulesHint: 'Pick an origin, a destination, or a date to search',
            schedulesDepart: 'Depart',
            schedulesArrive: 'Arrive',
            schedulesRuntime: 'Duration',
            schedulesOperator: 'Operator',
            schedulesVehicle: 'Vehicle',
            schedulesGate: 'Gates',
            schedulesDays: 'Operating days',
            schedulesNotices: 'Service notices',
            schedulesFareNotConfigured: 'No fare configured, search only',
            schedulesQueryOnly: 'Query only',
            schedulesBookingReference: 'Bookable',
            schedulesLegacyOnly: 'Legacy system',
            operationsTitle: 'Notices',
            operationsFilterAll: 'All',
            operationsNoResult: 'No matching notices',
            operationsPublishedAt: 'Published {date}',
            operationsEmpty: 'No published content',
            accountTitle: 'Account',
            accountIntro: 'Yuchengtong accounts are provided by Lindongtong. A FluentOS sandbox App cannot read browser cookies, so this App signs in with device authorization: complete the Lindongtong sign-in in a real browser, then bring the code back here.',
            accountLogin: 'Start sign-in',
            accountLoginPending: 'Waiting for authorization',
            accountCodeLabel: 'Authorization code',
            accountCodeHint: 'The authorization page was opened in a new window. Finish the Lindongtong sign-in there, confirm the code, then return here and select "I have authorized".',
            accountOpenPage: 'Reopen authorization page',
            accountCheckNow: 'I have authorized',
            accountCancel: 'Cancel',
            accountLogout: 'Sign out',
            accountLoggedIn: 'Signed in',
            accountCredential: 'Credential',
            accountTokenValid: 'Credential valid until {time}',
            accountTokenNoExpiry: 'Credential has no explicit expiry',
            accountLocalOnly: 'The credential is stored only in this device\'s FluentOS App storage and is never written into the website session.',
            accountReadonly: 'Read-only account',
            accountNotConfigured: 'Yuchengtong has not enabled the device authorization endpoints yet, so sign-in is unavailable. Public data is unaffected.',
            accountPermissionDenied: 'Storage permission was denied, so the credential cannot be saved. Grant it again in Developer Center and retry.',
            accountNetworkFailed: 'Cannot reach the Yuchengtong server. Check the network and retry.',
            accountExpired: 'The authorization code expired. Start the sign-in again.',
            accountDenied: 'The authorization was denied.',
            accountStateWaiting: 'Authorization in progress, please wait…',
            facilityToilet: 'Restroom',
            facilityElevator: 'Elevator',
            facilityEscalator: 'Escalator',
            facilityEscalatorStairs: 'Escalator and stairs',
            facilityStairs: 'Stairs',
            facilityNursingRoom: 'Nursing room',
            facilityWaitingRoom: 'Waiting room',
            layerConcourse: 'Concourse',
            layerPlatform: 'Platform',
            layerPassageway: 'Passageway',
            directionUpwards: 'Upwards',
            directionDownwards: 'Downwards',
            directionBoth: 'Both ways',
            directionNone: '—',
            oneWayYes: 'One-way',
            oneWayNo: 'Two-way',
            modeMetro: 'Metro',
            modeTram: 'Tram',
            modeBus: 'Bus',
            modeCoach: 'Coach',
            modeFerry: 'Ferry',
            modeRailway: 'Regional rail',
            modeCustom: 'Line',
            opCategoryNotice: 'Notices',
            opCategoryBusOps: 'Bus operations',
            opCategoryMetroOps: 'Metro operations',
            opCategoryTramOps: 'Tram operations',
            opCategoryWebNotice: 'Site notices',
            opCategoryOpsInfo: 'Operations info',
            opCategoryWordpress: 'Site articles',
            errNetwork: 'Network request failed ({message})',
            errTimeout: 'The request timed out. Please retry.',
            errPermission: 'Permission denied: {message}',
            errNotDeclared: 'Missing permission declaration: {message}',
            errDomain: 'Target domain is not in the allowlist: {message}',
            errHttp: 'Server returned {status}',
            errData: 'The response payload could not be parsed.',
            errUnknown: 'Unexpected error: {message}',
            errBridge: 'The connection to FluentOS was closed. Reopen the App.'
        }
    };

    /* ============================ 语言 ============================ */

    // 原始请求语言为中文；系统语言读回来后以系统为准。
    var promptLanguage = 'zh';

    function normalizeLanguage(value) {
        var language = String(value || '').toLowerCase();
        if (language === 'zh' || language.indexOf('zh-') === 0) return 'zh';
        if (language === 'en' || language.indexOf('en-') === 0) return 'en';
        return 'en';
    }

    var currentLanguage = promptLanguage;

    function t(key, values) {
        var dict = messages[currentLanguage] || messages.en;
        var template = dict[key];
        if (template === undefined) template = messages.en[key];
        if (template === undefined) return key;
        return String(template).replace(/\{(\w+)\}/g, function (_, name) {
            return values && values[name] !== undefined ? String(values[name]) : '';
        });
    }

    /* ============================ DOM 引用 ============================ */

    var dom = {};

    function cacheDom() {
        dom.barTitle = document.getElementById('yct-bar-title');
        dom.barSub = document.getElementById('yct-bar-sub');
        dom.sourcePill = document.getElementById('yct-source-pill');
        dom.refresh = document.getElementById('yct-refresh');
        dom.nav = document.getElementById('yct-nav');
        dom.view = document.getElementById('yct-view');
        dom.live = document.getElementById('yct-live');
    }

    /* ============================ 状态 ============================ */

    var NAV_ITEMS = [
        { id: 'home', labelKey: 'navHome', icon: 'M2.5 7.5 8 2.8l5.5 4.7V13a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1z' },
        { id: 'transit', labelKey: 'navTransit', icon: 'M3 3h10v7H3zM3 13h2M11 13h2M5 10v3M11 10v3' },
        { id: 'stations', labelKey: 'navStations', icon: 'M8 1.6a4.4 4.4 0 0 1 4.4 4.4c0 3.2-4.4 8.4-4.4 8.4S3.6 9.2 3.6 6A4.4 4.4 0 0 1 8 1.6zM8 5.6a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z' },
        { id: 'schedules', labelKey: 'navSchedules', icon: 'M2.5 4.5h11v9h-11zM2.5 7h11M5.5 2.5v3M10.5 2.5v3' },
        { id: 'operations', labelKey: 'navOperations', icon: 'M3 2.5h7l3 3v8H3zM10 2.5v3h3M5.5 8h5M5.5 10.5h3' },
        { id: 'account', labelKey: 'navAccount', icon: 'M8 8a2.6 2.6 0 1 0 0-5.2A2.6 2.6 0 0 0 8 8zM3 14c0-2.4 2.2-3.8 5-3.8s5 1.4 5 3.8' }
    ];

    var state = {
        view: 'home',
        loading: false,
        error: null,
        data: {
            overview: null,
            stations: null,
            schedules: null,
            operations: null,
            services: null
        },
        fetchedAt: null,
        transitMode: 'all',
        activeLineId: null,
        stationQuery: '',
        activeStationId: null,
        scheduleQuery: { from: '', to: '', date: '' },
        operationCategory: 'all',
        activeOperationId: null,
        auth: {
            phase: 'idle', // idle | pending | authorized | error
            deviceCode: null,
            userCode: null,
            verifyUrl: null,
            expiresAt: 0,
            interval: 5,
            errorKey: null,
            errorMessage: '',
            errorStatus: null,
            token: null,
            tokenExpiresAt: null,
            readonly: false,
            polling: false
        }
    };

    /* ============================ DOM 工具 ============================ */

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function svgIcon(path) {
        var ns = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 16 16');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        var p = document.createElementNS(ns, 'path');
        p.setAttribute('d', path);
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', 'currentColor');
        p.setAttribute('stroke-width', '1.3');
        p.setAttribute('stroke-linecap', 'round');
        p.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(p);
        return svg;
    }

    function button(label, className, onClick, primary) {
        var node = el('button', className || '');
        node.type = 'button';
        node.textContent = label;
        if (primary) node.setAttribute('data-accent', 'true');
        node.addEventListener('click', onClick);
        return node;
    }

    function announce(text) {
        if (dom.live) dom.live.textContent = text || '';
    }

    /* ============================ 桥接调用 ============================ */

    function isFluentOSAvailable() {
        return typeof FluentOS !== 'undefined' && typeof FluentOS.network === 'object';
    }

    function classifyError(error) {
        var raw = error && error.message ? String(error.message) : String(error || '');
        if (/bridge closed/i.test(raw)) return { key: 'errBridge', message: raw };
        if (/not declared/i.test(raw)) return { key: 'errNotDeclared', message: raw };
        if (/denied/i.test(raw)) return { key: 'errPermission', message: raw };
        if (/not allowed|allowlist|domain/i.test(raw)) return { key: 'errDomain', message: raw };
        if (/timed out|timeout/i.test(raw)) return { key: 'errTimeout', message: raw };
        if (raw === 'invalid-json') return { key: 'errData', message: raw };
        if (error && error.httpStatus) {
            return { key: 'errHttp', message: raw, status: error.httpStatus };
        }
        if (/Failed to fetch|NetworkError|network/i.test(raw)) return { key: 'errNetwork', message: raw };
        return { key: 'errUnknown', message: raw };
    }

    // 账户场景下的错误更贴近用户动作，单独换一套更明确的文案。
    function classifyAuthError(error) {
        var classified = classifyError(error);
        if (classified.key === 'errPermission') return { key: 'accountPermissionDenied', message: classified.message };
        if (classified.key === 'errNetwork') return { key: 'accountNetworkFailed', message: classified.message };
        return classified;
    }

    // 统一经桥接发请求。宿主会校验域名白名单、剥离凭据、禁止重定向。
    function requestJson(url, options) {
        if (!isFluentOSAvailable()) {
            return Promise.reject(new Error('FluentOS bridge is unavailable'));
        }
        return FluentOS.network.request(url, options || {}).then(function (response) {
            if (!response || response.ok !== true) {
                var status = response && response.status ? response.status : 0;
                var failure = new Error('HTTP ' + status);
                failure.httpStatus = status;
                failure.body = response && response.body ? response.body : '';
                throw failure;
            }
            var payload;
            try {
                payload = JSON.parse(response.body);
            } catch (_) {
                throw new Error('invalid-json');
            }
            return payload;
        });
    }

    function apiGet(path, query) {
        var url = API_BASE + path;
        var parts = [];
        if (query) {
            Object.keys(query).forEach(function (key) {
                var value = query[key];
                if (value === undefined || value === null || value === '') return;
                parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
            });
        }
        if (parts.length) url += '?' + parts.join('&');
        return requestJson(url, { method: 'GET' });
    }

    /* ============================ 数据加载 ============================ */

    var LOADERS = {
        overview: function () {
            return apiGet('/transit/overview', { locale: currentLanguage === 'zh' ? 'zh-CN' : 'en' });
        },
        stations: function () {
            return apiGet('/transit/stations', { locale: currentLanguage === 'zh' ? 'zh-CN' : 'en' });
        },
        schedules: function () {
            return apiGet('/travel/schedules', { locale: currentLanguage === 'zh' ? 'zh-CN' : 'en' });
        },
        operations: function () {
            return apiGet('/operations', { locale: currentLanguage === 'zh' ? 'zh-CN' : 'en' });
        },
        services: function () {
            return apiGet('/services', { locale: currentLanguage === 'zh' ? 'zh-CN' : 'en' });
        }
    };

    // 每个视图只需要它自己的那份数据；按需加载，避免一次性拉 1.2 MB。
    var VIEW_DATA = {
        home: ['overview', 'services', 'operations'],
        transit: ['overview'],
        stations: ['stations'],
        schedules: ['schedules'],
        operations: ['operations'],
        account: []
    };

    function ensureData(view) {
        var needed = VIEW_DATA[view] || [];
        var missing = needed.filter(function (key) {
            return state.data[key] === null;
        });
        if (!missing.length) return Promise.resolve();
        state.loading = true;
        state.error = null;
        render();
        return Promise.all(
            missing.map(function (key) {
                return LOADERS[key]().then(function (payload) {
                    state.data[key] = payload && payload.data !== undefined ? payload.data : null;
                    state.data[key + 'Meta'] = payload && payload.meta ? payload.meta : null;
                });
            })
        )
            .then(function () {
                state.loading = false;
                state.fetchedAt = new Date();
            })
            .catch(function (error) {
                state.loading = false;
                state.error = classifyError(error);
            });
    }

    function refreshAll() {
        Object.keys(state.data).forEach(function (key) {
            state.data[key] = null;
        });
        return ensureData(state.view);
    }

    /* ============================ 展示工具 ============================ */

    function formatDateTime(value) {
        if (!value) return '';
        var date = new Date(value);
        if (isNaN(date.getTime())) return String(value);
        try {
            return date.toLocaleString(currentLanguage === 'zh' ? 'zh-CN' : 'en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (_) {
            return date.toISOString();
        }
    }

    function modeLabel(mode) {
        var map = {
            metro: 'modeMetro',
            tram: 'modeTram',
            bus: 'modeBus',
            coach: 'modeCoach',
            ferry: 'modeFerry',
            railway: 'modeRailway',
            custom: 'modeCustom'
        };
        return map[mode] ? t(map[mode]) : String(mode || '');
    }

    function facilityLabel(type) {
        var map = {
            toilet: 'facilityToilet',
            elevator: 'facilityElevator',
            escalator: 'facilityEscalator',
            escalator_and_stairs: 'facilityEscalatorStairs',
            stairs: 'facilityStairs',
            nursing_room: 'facilityNursingRoom',
            waiting_room: 'facilityWaitingRoom'
        };
        return map[type] ? t(map[type]) : String(type || '');
    }

    function layerLabel(type) {
        var map = { concourse: 'layerConcourse', platform: 'layerPlatform', passageway: 'layerPassageway' };
        return map[type] ? t(map[type]) : String(type || '');
    }

    function directionLabel(value) {
        var map = { upwards: 'directionUpwards', downwards: 'directionDownwards', both: 'directionBoth', none: 'directionNone' };
        return map[value] ? t(map[value]) : String(value || '');
    }

    function oneWayLabel(value) {
        if (value === 'none' || value === undefined || value === null || value === '') return t('oneWayNo');
        return t('oneWayYes');
    }

    function categoryLabel(categoryId) {
        var map = {
            通知公告: 'opCategoryNotice',
            公交运营: 'opCategoryBusOps',
            地铁运营: 'opCategoryMetroOps',
            有轨运营: 'opCategoryTramOps',
            网站公告: 'opCategoryWebNotice',
            运营信息: 'opCategoryOpsInfo',
            WordPress文章: 'opCategoryWordpress'
        };
        return map[categoryId] ? t(map[categoryId]) : String(categoryId || '');
    }

    function card(titleText, bodyNode, footerNode) {
        var node = el('section', 'fluent-card');
        if (titleText) {
            var header = el('div', 'fluent-card-header');
            header.appendChild(el('p', 'fluent-card-title', titleText));
            node.appendChild(header);
        }
        var body = el('div', 'fluent-card-body');
        if (bodyNode) body.appendChild(bodyNode);
        node.appendChild(body);
        if (footerNode) {
            var footer = el('div', 'fluent-card-footer');
            footer.appendChild(footerNode);
            node.appendChild(footer);
        }
        return node;
    }

    function emptyState(titleText, descText) {
        var wrap = el('div', 'fluent-empty');
        var icon = el('div', 'fluent-empty-icon');
        icon.appendChild(svgIcon('M3 4.5h10v8H3zM3 7h10'));
        wrap.appendChild(icon);
        wrap.appendChild(el('p', 'fluent-empty-title', titleText));
        if (descText) wrap.appendChild(el('p', 'fluent-empty-desc', descText));
        return wrap;
    }

    function loadingState() {
        var wrap = el('div', 'yct-loading');
        var spinner = el('div', 'fluent-spinner fluent-spinner-medium');
        wrap.appendChild(spinner);
        wrap.appendChild(el('span', '', t('loading')));
        return wrap;
    }

    function errorState() {
        var wrap = el('div', 'yct-stack');
        var error = state.error || { key: 'errUnknown', message: '' };
        var note = el('p', 'yct-note is-warn', t(error.key, { message: error.message, status: error.status }));
        wrap.appendChild(note);
        wrap.appendChild(
            button(t('retry'), 'yct-retry', function () {
                refreshAll();
            })
        );
        return wrap;
    }

    function kv(keyText, valueText) {
        var row = el('div', 'yct-kv');
        row.appendChild(el('span', 'yct-kv-key', keyText));
        row.appendChild(el('span', 'yct-kv-val', valueText));
        return row;
    }

    /* ============================ 视图：首页 ============================ */

    function renderHome(container) {
        var overview = state.data.overview;
        var meta = state.data.overviewMeta;
        var services = state.data.services || [];
        var operations = state.data.operations || [];

        if (meta) {
            var statusLine = el('div', 'yct-between');
            var pill = el('span', 'yct-pill' + (meta.sourceStatus === 'ready' ? '' : ' is-warn'), '');
            pill.textContent = meta.sourceStatus === 'ready' ? t('sourceReady') : t('sourceDegraded');
            statusLine.appendChild(pill);
            if (meta.generatedAt) {
                statusLine.appendChild(el('span', 'yct-tiny', t('sourceGeneratedAt', { time: formatDateTime(meta.generatedAt) })));
            }
            container.appendChild(statusLine);
            if (meta.message) {
                container.appendChild(el('p', 'yct-tiny', t('sourceMessage') + ': ' + meta.message));
            }
        }

        if (overview && Array.isArray(overview.summary)) {
            var statWrap = el('div', 'fluent-card-body');
            var grid = el('div', 'yct-grid');
            overview.summary.forEach(function (item) {
                var box = el('div', 'yct-stat');
                box.appendChild(el('span', 'yct-stat-value', String(item.lineCount)));
                box.appendChild(el('span', 'yct-stat-label', modeLabel(item.mode) + ' · ' + t('homeStatLines')));
                box.appendChild(el('span', 'yct-tiny', String(item.stationCount) + ' ' + t('homeStatStations')));
                grid.appendChild(box);
            });
            statWrap.appendChild(grid);
            container.appendChild(card(t('homeSummaryTitle'), statWrap));
        }

        if (services.length) {
            var listWrap = el('div', 'fluent-card-body');
            services.forEach(function (group) {
                listWrap.appendChild(el('p', 'yct-heading', group.title || group.categoryId));
                var list = el('div', 'fluent-list fluent-list-selectable');
                (group.items || []).forEach(function (item) {
                    var row = el('div', 'fluent-list-item');
                    row.setAttribute('role', 'button');
                    row.tabIndex = 0;
                    var content = el('div', 'fluent-list-item-content');
                    content.appendChild(el('p', 'fluent-list-item-title', item.title));
                    if (item.description) content.appendChild(el('p', 'fluent-list-item-desc', item.description));
                    row.appendChild(content);
                    row.appendChild(el('span', 'fluent-list-item-extra', t('homeOpenService')));
                    var open = function () {
                        if (!item.href) return;
                        FluentOS.openExternal(item.href).catch(function (error) {
                            announce(t(classifyError(error).key, { message: error.message }));
                        });
                    };
                    row.addEventListener('click', open);
                    row.addEventListener('keydown', function (event) {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            open();
                        }
                    });
                    list.appendChild(row);
                });
                listWrap.appendChild(list);
            });
            container.appendChild(card(t('homeServicesTitle'), listWrap));
        }

        var latest = operations.slice(0, 3);
        if (latest.length) {
            var opWrap = el('div', 'fluent-card-body');
            var opList = el('div', 'fluent-list fluent-list-selectable');
            latest.forEach(function (item) {
                opList.appendChild(operationRow(item, function () {
                    state.operationCategory = 'all';
                    state.activeOperationId = item.id;
                    navigate('operations');
                }));
            });
            opWrap.appendChild(opList);
            opWrap.appendChild(
                button(t('homeViewAll'), 'yct-more', function () {
                    state.activeOperationId = null;
                    navigate('operations');
                })
            );
            container.appendChild(card(t('homeLatestTitle'), opWrap));
        }

        if (!overview && !services.length && !operations.length && !state.loading) {
            container.appendChild(emptyState(t('operationsEmpty'), ''));
        }
    }

    /* ============================ 视图：线路 ============================ */

    function renderTransit(container) {
        var overview = state.data.overview;
        var lines = overview && Array.isArray(overview.lines) ? overview.lines : [];

        if (state.activeLineId) {
            var line = lines.filter(function (item) {
                return item.id === state.activeLineId;
            })[0];
            if (line) {
                container.appendChild(renderLineDetail(line));
                return;
            }
            state.activeLineId = null;
        }

        container.appendChild(el('p', 'yct-heading', t('transitTitle')));

        var modes = ['all'];
        lines.forEach(function (line) {
            if (modes.indexOf(line.mode) === -1) modes.push(line.mode);
        });

        var filter = el('div', 'yct-filter');
        modes.forEach(function (mode) {
            var isActive = state.transitMode === mode;
            var btn = button(mode === 'all' ? t('transitFilterAll') : modeLabel(mode), 'yct-filter-btn' + (isActive ? ' is-active' : ''), function () {
                state.transitMode = mode;
                render();
            });
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            if (isActive) btn.setAttribute('data-accent', 'true');
            filter.appendChild(btn);
        });
        container.appendChild(filter);

        var visible = lines.filter(function (line) {
            return state.transitMode === 'all' || line.mode === state.transitMode;
        });

        container.appendChild(el('p', 'yct-muted', t('transitLineCount', { count: visible.length })));

        if (!visible.length) {
            container.appendChild(emptyState(t('transitNoLines'), ''));
            return;
        }

        var list = el('div', 'fluent-list fluent-list-selectable');
        visible.forEach(function (line) {
            var row = el('div', 'fluent-list-item');
            row.setAttribute('role', 'button');
            row.tabIndex = 0;
            var dot = el('span', 'yct-dot');
            if (line.color) dot.style.background = String(line.color);
            row.appendChild(dot);
            var content = el('div', 'fluent-list-item-content');
            content.appendChild(el('p', 'fluent-list-item-title', line.localizedName || line.name));
            var descParts = [modeLabel(line.mode)];
            if (line.stationCount) descParts.push(String(line.stationCount) + ' ' + t('homeStatStations'));
            if (line.firstStationName && line.lastStationName) {
                descParts.push(line.firstStationName + ' → ' + line.lastStationName);
            }
            content.appendChild(el('p', 'fluent-list-item-desc', descParts.join(' · ')));
            row.appendChild(content);
            var open = function () {
                state.activeLineId = line.id;
                render();
            };
            row.addEventListener('click', open);
            row.addEventListener('keydown', function (event) {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    open();
                }
            });
            list.appendChild(row);
        });
        container.appendChild(list);
    }

    function renderLineDetail(line) {
        var wrap = el('div', 'yct-stack');
        wrap.appendChild(
            button(t('backToList'), 'yct-back', function () {
                state.activeLineId = null;
                render();
            })
        );

        var head = el('div', 'yct-row');
        var dot = el('span', 'yct-dot');
        if (line.color) dot.style.background = String(line.color);
        head.appendChild(dot);
        head.appendChild(el('p', 'yct-heading', line.localizedName || line.name));
        wrap.appendChild(head);

        var body = el('div', 'yct-stack');
        body.appendChild(kv(t('homeStatLines'), modeLabel(line.mode)));
        if (line.operator) body.appendChild(kv(t('transitOperator'), line.operator));
        if (line.firstLastBus) {
            body.appendChild(kv(t('transitFirstBus'), String(line.firstLastBus.first || '—')));
            body.appendChild(kv(t('transitLastBus'), String(line.firstLastBus.last || '—')));
        }
        if (line.fare) body.appendChild(kv(t('transitFare'), String(line.fare)));
        wrap.appendChild(card(null, body));

        var stops = Array.isArray(line.stationNames) ? line.stationNames : [];
        if (stops.length) {
            var listWrap = el('div', 'fluent-card-body');
            var list = el('ul', 'yct-stops');
            stops.forEach(function (name) {
                list.appendChild(el('li', 'yct-stop', name));
            });
            listWrap.appendChild(list);
            wrap.appendChild(card(t('transitStops', { count: stops.length }), listWrap));
        }

        return wrap;
    }

    /* ============================ 视图：站点 ============================ */

    function renderStations(container) {
        var stations = state.data.stations || [];

        container.appendChild(el('p', 'yct-heading', t('stationsTitle')));

        var field = el('div', 'yct-field');
        field.appendChild(el('label', 'yct-field-label', t('stationsTitle')));
        var input = document.createElement('input');
        input.type = 'search';
        input.id = 'yct-station-search';
        input.value = state.stationQuery;
        input.placeholder = t('stationsSearchPlaceholder');
        input.setAttribute('aria-label', t('stationsSearchPlaceholder'));
        input.addEventListener('input', function () {
            state.stationQuery = input.value;
            renderStationList();
        });
        field.appendChild(input);
        container.appendChild(field);

        var listHost = el('div', 'yct-station-list');
        listHost.id = 'yct-station-list';
        container.appendChild(listHost);

        var detailHost = el('div', 'yct-station-detail');
        detailHost.id = 'yct-station-detail';
        container.appendChild(detailHost);

        function renderStationList() {
            listHost.replaceChildren();
            var query = state.stationQuery.trim().toLowerCase();
            var visible = stations.filter(function (station) {
                if (!query) return true;
                var haystack = (station.stationName + ' ' + station.lineName).toLowerCase();
                return haystack.indexOf(query) !== -1;
            });
            if (!visible.length) {
                listHost.appendChild(emptyState(t('stationsNoResult'), ''));
                return;
            }
            var list = el('div', 'fluent-list fluent-list-selectable');
            visible.forEach(function (station) {
                var row = el('div', 'fluent-list-item');
                if (station.sourceId === state.activeStationId) row.classList.add('active');
                row.setAttribute('role', 'button');
                row.tabIndex = 0;
                var content = el('div', 'fluent-list-item-content');
                content.appendChild(el('p', 'fluent-list-item-title', station.stationName));
                content.appendChild(el('p', 'fluent-list-item-desc', station.lineName));
                row.appendChild(content);
                var open = function () {
                    state.activeStationId = station.sourceId;
                    renderStationList();
                    renderStationDetail(station);
                };
                row.addEventListener('click', open);
                row.addEventListener('keydown', function (event) {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        open();
                    }
                });
                list.appendChild(row);
            });
            listHost.appendChild(list);
        }

        function renderStationDetail(station) {
            detailHost.replaceChildren();
            var wrap = el('div', 'yct-stack');
            var head = el('div', 'yct-between');
            head.appendChild(el('p', 'yct-heading', station.stationName + ' · ' + station.lineName));
            head.appendChild(el('span', 'yct-chip', station.overGround ? t('stationsOverGround') : t('stationsUnderGround')));
            wrap.appendChild(head);

            var layers = Array.isArray(station.layers) ? station.layers : [];
            if (layers.length) {
                var layerWrap = el('div', 'fluent-card-body');
                layers
                    .slice()
                    .sort(function (a, b) {
                        return (a.order || 0) - (b.order || 0);
                    })
                    .forEach(function (layer) {
                        var row = el('div', 'yct-floor');
                        var headRow = el('div', 'yct-floor-head');
                        headRow.appendChild(el('span', 'yct-floor-tag', String(layer.floor || '—')));
                        headRow.appendChild(el('span', '', layerLabel(layer.type)));
                        row.appendChild(headRow);
                        layerWrap.appendChild(row);
                    });
                wrap.appendChild(card(t('stationsLayers'), layerWrap));
            }

            var facilities = Array.isArray(station.facilities) ? station.facilities : [];
            if (facilities.length) {
                var facilityWrap = el('div', 'fluent-card-body');
                var facilityList = el('div', 'fluent-list');
                facilities.forEach(function (facility) {
                    var row = el('div', 'fluent-list-item');
                    var content = el('div', 'fluent-list-item-content');
                    content.appendChild(el('p', 'fluent-list-item-title', facilityLabel(facility.type)));
                    var parts = [];
                    if (facility.direction) parts.push(t('stationsDirection') + ': ' + directionLabel(facility.direction));
                    if (facility.endFloor) parts.push(t('stationsEndFloor') + ' ' + facility.endFloor);
                    if (facility.oneWay) parts.push(t('stationsOneWay') + ': ' + oneWayLabel(facility.oneWay));
                    if (parts.length) content.appendChild(el('p', 'fluent-list-item-desc', parts.join(' · ')));
                    row.appendChild(content);
                    facilityList.appendChild(row);
                });
                facilityWrap.appendChild(facilityList);
                wrap.appendChild(card(t('stationsFacilities'), facilityWrap));
            }

            var transfers = Array.isArray(station.transfers) ? station.transfers : [];
            if (transfers.length) {
                var transferWrap = el('div', 'fluent-card-body');
                var transferList = el('div', 'fluent-list');
                transfers.forEach(function (transfer) {
                    var row = el('div', 'fluent-list-item');
                    var content = el('div', 'fluent-list-item-content');
                    content.appendChild(el('p', 'fluent-list-item-title', String(transfer.line || '')));
                    var parts = [];
                    if (transfer.floor) parts.push(String(transfer.floor));
                    if (transfer.transferDirection) parts.push(directionLabel(transfer.transferDirection));
                    if (parts.length) content.appendChild(el('p', 'fluent-list-item-desc', parts.join(' · ')));
                    row.appendChild(content);
                    transferList.appendChild(row);
                });
                transferWrap.appendChild(transferList);
                wrap.appendChild(card(t('stationsTransfers'), transferWrap));
            }

            var exits = Array.isArray(station.exits) ? station.exits : [];
            if (exits.length) {
                var exitWrap = el('div', 'fluent-card-body');
                var exitList = el('div', 'fluent-list');
                exits.forEach(function (exit) {
                    var row = el('div', 'fluent-list-item');
                    var content = el('div', 'fluent-list-item-content');
                    content.appendChild(el('p', 'fluent-list-item-title', String(exit.code || '')));
                    var parts = [];
                    if (exit.floor) parts.push(String(exit.floor));
                    if (exit.direction) parts.push(directionLabel(exit.direction));
                    if (exit.description) parts.push(String(exit.description));
                    if (parts.length) content.appendChild(el('p', 'fluent-list-item-desc', parts.join(' · ')));
                    row.appendChild(content);
                    exitList.appendChild(row);
                });
                exitWrap.appendChild(exitList);
                wrap.appendChild(card(t('stationsExits'), exitWrap));
            }

            var nearby = Array.isArray(station.surroundingStationNames) ? station.surroundingStationNames : [];
            if (nearby.length) {
                var nearbyWrap = el('div', 'fluent-card-body');
                var chips = el('div', 'yct-chips');
                nearby.forEach(function (name) {
                    chips.appendChild(el('span', 'yct-chip', name));
                });
                nearbyWrap.appendChild(chips);
                wrap.appendChild(card(t('stationsNearby'), nearbyWrap));
            }

            if (!layers.length && !facilities.length && !transfers.length && !exits.length) {
                wrap.appendChild(emptyState(t('stationsNone'), ''));
            }

            detailHost.appendChild(wrap);
        }

        renderStationList();

        if (state.activeStationId) {
            var active = stations.filter(function (station) {
                return station.sourceId === state.activeStationId;
            })[0];
            if (active) renderStationDetail(active);
        } else {
            detailHost.appendChild(el('p', 'yct-muted', t('stationsPickOne')));
        }
    }

    /* ============================ 视图：班次 ============================ */

    function renderSchedules(container) {
        var schedules = state.data.schedules || {};
        var stationOptions = Array.isArray(schedules.stationOptions) ? schedules.stationOptions : [];
        var trips = Array.isArray(schedules.trips) ? schedules.trips : [];
        var notices = Array.isArray(schedules.serviceNotices) ? schedules.serviceNotices : [];

        container.appendChild(el('p', 'yct-heading', t('schedulesTitle')));

        var form = el('div', 'yct-form');

        function selectField(labelKey, id, value, onChange, options) {
            var field = el('div', 'yct-field');
            field.appendChild(el('label', 'yct-field-label', t(labelKey)));
            var select = document.createElement('select');
            select.id = id;
            select.setAttribute('aria-label', t(labelKey));
            var any = document.createElement('option');
            any.value = '';
            any.textContent = t('schedulesAny');
            select.appendChild(any);
            options.forEach(function (option) {
                var node = document.createElement('option');
                node.value = option;
                node.textContent = option;
                select.appendChild(node);
            });
            select.value = value || '';
            select.addEventListener('change', function () {
                onChange(select.value);
            });
            field.appendChild(select);
            return field;
        }

        form.appendChild(
            selectField('schedulesFrom', 'yct-from', state.scheduleQuery.from, function (value) {
                state.scheduleQuery.from = value;
            }, stationOptions)
        );
        form.appendChild(
            selectField('schedulesTo', 'yct-to', state.scheduleQuery.to, function (value) {
                state.scheduleQuery.to = value;
            }, stationOptions)
        );

        var dateField = el('div', 'yct-field');
        dateField.appendChild(el('label', 'yct-field-label', t('schedulesDate')));
        var dateInput = document.createElement('input');
        dateInput.type = 'date';
        dateInput.id = 'yct-date';
        dateInput.value = state.scheduleQuery.date;
        dateInput.setAttribute('aria-label', t('schedulesDate'));
        dateInput.addEventListener('change', function () {
            state.scheduleQuery.date = dateInput.value;
        });
        dateField.appendChild(dateInput);
        form.appendChild(dateField);

        container.appendChild(form);

        container.appendChild(
            el(
                'p',
                'yct-muted',
                t('schedulesHint')
            )
        );

        var resultHost = el('div', 'yct-stack');
        resultHost.id = 'yct-schedule-results';
        container.appendChild(resultHost);

        function renderResults() {
            resultHost.replaceChildren();
            var query = state.scheduleQuery;
            var visible = trips.filter(function (trip) {
                if (query.from && trip.originStationName !== query.from) return false;
                if (query.to && trip.destinationStationName !== query.to) return false;
                return true;
            });

            resultHost.appendChild(el('p', 'yct-muted', t('transitLineCount', { count: visible.length })));

            if (!visible.length) {
                resultHost.appendChild(emptyState(t('schedulesNoResult'), ''));
            } else {
                var list = el('div', 'fluent-list');
                visible.slice(0, 120).forEach(function (trip) {
                    var row = el('div', 'fluent-list-item');
                    var content = el('div', 'fluent-list-item-content');

                    var arrival = String(trip.arrivalTime || '—');
                    if (trip.arrivalDayOffset) arrival += ' +' + trip.arrivalDayOffset;
                    var titleParts = [
                        t('schedulesDepart') + ' ' + String(trip.departureTime || '—'),
                        t('schedulesArrive') + ' ' + arrival
                    ];
                    if (trip.tripCode) titleParts.push(String(trip.tripCode));
                    content.appendChild(el('p', 'fluent-list-item-title', titleParts.join('  ')));

                    var routeText =
                        trip.originStationName && trip.destinationStationName
                            ? trip.originStationName + ' → ' + trip.destinationStationName
                            : String(trip.lineName || '');
                    if (routeText) content.appendChild(el('p', 'fluent-list-item-desc', routeText));

                    var detailParts = [];
                    if (trip.serviceLabel) detailParts.push(String(trip.serviceLabel));
                    if (trip.runtimeText) detailParts.push(t('schedulesRuntime') + ' ' + trip.runtimeText);
                    if (trip.fareText) detailParts.push(t('transitFare') + ' ' + trip.fareText);
                    if (trip.operator) detailParts.push(t('schedulesOperator') + ' ' + trip.operator);
                    if (trip.vehicleModelText) detailParts.push(t('schedulesVehicle') + ' ' + trip.vehicleModelText);
                    if (trip.gateText) detailParts.push(t('schedulesGate') + ' ' + trip.gateText);
                    var days = Array.isArray(trip.operatingDays) ? trip.operatingDays : [];
                    if (days.length && days.length < 7) {
                        detailParts.push(t('schedulesDays') + ' ' + days.join('/'));
                    }
                    if (detailParts.length) content.appendChild(el('p', 'yct-tiny', detailParts.join(' · ')));

                    row.appendChild(content);

                    var ticketing = trip.ticketing || {};
                    var tagKey = null;
                    if (ticketing.status === 'fare_not_configured') tagKey = 'schedulesFareNotConfigured';
                    else if (ticketing.status === 'legacy_reference_only') tagKey = 'schedulesLegacyOnly';
                    else if (trip.availability === 'booking_reference') tagKey = 'schedulesBookingReference';
                    else if (trip.availability === 'query_only') tagKey = 'schedulesQueryOnly';
                    if (tagKey) row.appendChild(el('span', 'yct-chip', t(tagKey)));

                    list.appendChild(row);
                });
                resultHost.appendChild(list);
                if (visible.length > 120) {
                    resultHost.appendChild(el('p', 'yct-tiny', '…'));
                }
            }
        }

        renderResults();

        var actions = el('div', 'yct-actions');
        actions.appendChild(
            button(
                t('schedulesSearch'),
                'yct-search',
                function () {
                    renderResults();
                    announce(t('transitLineCount', { count: resultHost.querySelectorAll('.fluent-list-item').length }));
                },
                true
            )
        );
        container.appendChild(actions);

        if (notices.length) {
            var noticeWrap = el('div', 'fluent-card-body');
            notices.forEach(function (notice) {
                var note = el('div', 'yct-note');
                note.appendChild(el('p', 'yct-heading', notice.title));
                if (notice.periodText) note.appendChild(el('p', 'yct-tiny', notice.periodText));
                if (notice.reason) note.appendChild(el('p', 'yct-muted', notice.reason));
                noticeWrap.appendChild(note);
            });
            container.appendChild(card(t('schedulesNotices'), noticeWrap));
        }

        if (schedules.notice) {
            container.appendChild(el('p', 'yct-tiny', String(schedules.notice)));
        }
    }

    /* ============================ 视图：公告 ============================ */

    function operationRow(item, onClick) {
        var row = el('div', 'fluent-list-item');
        row.setAttribute('role', 'button');
        row.tabIndex = 0;
        var content = el('div', 'fluent-list-item-content');
        content.appendChild(el('p', 'fluent-list-item-title', item.title));
        var parts = [];
        if (item.categoryId) parts.push(categoryLabel(item.categoryId));
        if (item.displayDate || item.publishedAt) parts.push(item.displayDate || formatDateTime(item.publishedAt));
        if (item.excerpt) parts.push(item.excerpt);
        content.appendChild(el('p', 'fluent-list-item-desc', parts.join(' · ')));
        row.appendChild(content);
        row.addEventListener('click', onClick);
        row.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick();
            }
        });
        return row;
    }

    // 极简 Markdown 渲染：只处理标题、无序/有序列表与段落，全部经 textContent 写入，不做 HTML 注入。
    function renderMarkdown(markdown) {
        var wrap = el('div', 'yct-stack');
        var lines = String(markdown || '').split(/\r?\n/);
        var listNode = null;
        var listTag = null;

        function flushList() {
            listNode = null;
            listTag = null;
        }

        lines.forEach(function (rawLine) {
            var line = rawLine.trim();
            if (!line) {
                flushList();
                return;
            }
            if (line.indexOf('## ') === 0) {
                flushList();
                wrap.appendChild(el('p', 'yct-heading', line.slice(3)));
                return;
            }
            if (line.indexOf('### ') === 0) {
                flushList();
                wrap.appendChild(el('p', 'yct-heading', line.slice(4)));
                return;
            }
            if (/^[-*]\s+/.test(line)) {
                if (listTag !== 'ul') {
                    listNode = el('ul', 'yct-stops');
                    listTag = 'ul';
                    wrap.appendChild(listNode);
                }
                listNode.appendChild(el('li', 'yct-stop', line.replace(/^[-*]\s+/, '')));
                return;
            }
            if (/^\d+[.、]\s*/.test(line)) {
                if (listTag !== 'ol') {
                    listNode = el('ol', 'yct-stops');
                    listTag = 'ol';
                    wrap.appendChild(listNode);
                }
                listNode.appendChild(el('li', 'yct-stop', line.replace(/^\d+[.、]\s*/, '')));
                return;
            }
            flushList();
            wrap.appendChild(el('p', 'yct-muted', line));
        });

        return wrap;
    }

    function renderOperations(container) {
        var operations = state.data.operations || [];

        if (state.activeOperationId) {
            var active = operations.filter(function (item) {
                return item.id === state.activeOperationId;
            })[0];
            if (active) {
                var wrap = el('div', 'yct-stack');
                wrap.appendChild(
                    button(t('backToList'), 'yct-back', function () {
                        state.activeOperationId = null;
                        render();
                    })
                );
                wrap.appendChild(el('p', 'yct-heading', active.title));
                var metaParts = [];
                if (active.categoryId) metaParts.push(categoryLabel(active.categoryId));
                if (active.displayDate || active.publishedAt) {
                    metaParts.push(t('operationsPublishedAt', { date: active.displayDate || formatDateTime(active.publishedAt) }));
                }
                if (metaParts.length) wrap.appendChild(el('p', 'yct-tiny', metaParts.join(' · ')));
                wrap.appendChild(renderMarkdown(active.markdown || active.excerpt || ''));
                container.appendChild(wrap);
                return;
            }
            state.activeOperationId = null;
        }

        container.appendChild(el('p', 'yct-heading', t('operationsTitle')));

        var categories = ['all'];
        operations.forEach(function (item) {
            if (item.categoryId && categories.indexOf(item.categoryId) === -1) categories.push(item.categoryId);
        });

        var filter = el('div', 'yct-filter');
        categories.forEach(function (category) {
            var isActive = state.operationCategory === category;
            var btn = button(
                category === 'all' ? t('operationsFilterAll') : categoryLabel(category),
                'yct-filter-btn' + (isActive ? ' is-active' : ''),
                function () {
                    state.operationCategory = category;
                    render();
                }
            );
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            if (isActive) btn.setAttribute('data-accent', 'true');
            filter.appendChild(btn);
        });
        container.appendChild(filter);

        var visible = operations.filter(function (item) {
            return state.operationCategory === 'all' || item.categoryId === state.operationCategory;
        });

        if (!visible.length) {
            container.appendChild(emptyState(operations.length ? t('operationsNoResult') : t('operationsEmpty'), ''));
            return;
        }

        var list = el('div', 'fluent-list fluent-list-selectable');
        visible.forEach(function (item) {
            list.appendChild(
                operationRow(item, function () {
                    state.activeOperationId = item.id;
                    render();
                })
            );
        });
        container.appendChild(list);
    }

    /* ============================ 视图：账户（设备授权） ============================ */

    function setAuthError(key, message, status) {
        state.auth.phase = 'error';
        state.auth.errorKey = key;
        state.auth.errorMessage = message || '';
        state.auth.errorStatus = status || null;
        state.auth.polling = false;
        render();
    }

    function persistSession(token, expiresAt, readonly) {
        var payload = {
            accessToken: token,
            expiresAt: expiresAt || null,
            readonly: readonly === true,
            savedAt: new Date().toISOString()
        };
        // 需要 storage.local 权限；首次调用会触发一次系统授权。
        return FluentOS.storage.set(STORAGE_KEY, payload).then(function () {
            state.auth.token = token;
            state.auth.tokenExpiresAt = expiresAt || null;
            state.auth.readonly = readonly === true;
            state.auth.phase = 'authorized';
            state.auth.errorKey = null;
            state.auth.polling = false;
            render();
        });
    }

    function loadStoredSession() {
        if (!isFluentOSAvailable() || !FluentOS.storage) return Promise.resolve();
        return FluentOS.storage
            .get(STORAGE_KEY)
            .then(function (value) {
                if (value && value.accessToken) {
                    state.auth.token = value.accessToken;
                    state.auth.tokenExpiresAt = value.expiresAt || null;
                    state.auth.readonly = value.readonly === true;
                    state.auth.phase = 'authorized';
                }
            })
            .catch(function () {
                // 读取失败（例如权限被拒）不应阻塞 App 其余部分。
            });
    }

    function startDeviceAuthorization() {
        state.auth.phase = 'pending';
        state.auth.errorKey = null;
        state.auth.errorMessage = '';
        state.auth.errorStatus = null;
        render();

        requestJson(DEVICE_AUTHORIZE_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                clientId: 'yuchengtong',
                client: 'fluentos',
                scope: 'account.read'
            })
        })
            .then(function (payload) {
                if (!payload || !payload.device_code || !payload.user_code) {
                    throw new Error('invalid-json');
                }
                state.auth.deviceCode = payload.device_code;
                state.auth.userCode = payload.user_code;
                state.auth.interval = Math.max(3, Number(payload.interval) || 5);
                state.auth.expiresAt = Date.now() + Math.max(60, Number(payload.expires_in) || 600) * 1000;
                // RFC 8628：优先使用已预填授权码的 complete 地址，减少用户手动输入。
                state.auth.verifyUrl = payload.verification_uri_complete || payload.verification_uri || DEVICE_VERIFY_URL;
                render();
                return FluentOS.openExternal(state.auth.verifyUrl).catch(function () {
                    // 打开外链失败不致命：用户可自行复制授权码到浏览器完成。
                });
            })
            .catch(function (error) {
                if (error && error.httpStatus === 404) {
                    setAuthError('accountNotConfigured', 'HTTP 404 ' + DEVICE_AUTHORIZE_URL);
                    return;
                }
                var classified = classifyAuthError(error);
                setAuthError(classified.key, classified.message, classified.status);
            });
    }

    function pollDeviceToken() {
        if (state.auth.polling) return;
        if (!state.auth.deviceCode) return;
        if (Date.now() > state.auth.expiresAt) {
            setAuthError('accountExpired', '');
            return;
        }
        state.auth.polling = true;
        announce(t('accountStateWaiting'));

        requestJson(DEVICE_TOKEN_URL + '?device_code=' + encodeURIComponent(state.auth.deviceCode), {
            method: 'GET'
        })
            .then(function (payload) {
                state.auth.polling = false;
                var status = payload && payload.status ? String(payload.status) : '';
                if (status === 'approved' && payload.access_token) {
                    var expiresAt = payload.expires_in ? new Date(Date.now() + Number(payload.expires_in) * 1000).toISOString() : null;
                    return persistSession(payload.access_token, expiresAt, payload.readonly).catch(function (error) {
                        var classified = classifyAuthError(error);
                        setAuthError(classified.key, classified.message, classified.status);
                    });
                }
                if (status === 'denied') {
                    setAuthError('accountDenied', '');
                    return;
                }
                if (status === 'expired') {
                    setAuthError('accountExpired', '');
                    return;
                }
                // pending：由用户主动点击再次查询，不做自动轮询，避免触发无意义的重复请求。
                render();
            })
            .catch(function (error) {
                state.auth.polling = false;
                if (error && error.httpStatus === 404) {
                    setAuthError('accountNotConfigured', 'HTTP 404 ' + DEVICE_TOKEN_URL);
                    return;
                }
                var classified = classifyAuthError(error);
                setAuthError(classified.key, classified.message, classified.status);
            });
    }

    function signOut() {
        state.auth.phase = 'idle';
        state.auth.deviceCode = null;
        state.auth.userCode = null;
        state.auth.token = null;
        state.auth.tokenExpiresAt = null;
        state.auth.readonly = false;
        state.auth.errorKey = null;
        state.auth.errorMessage = '';
        state.auth.errorStatus = null;
        state.auth.polling = false;
        if (isFluentOSAvailable() && FluentOS.storage) {
            FluentOS.storage
                .remove(STORAGE_KEY)
                .catch(function () {
                    // 移除失败不影响本地登出表现。
                })
                .then(render);
        } else {
            render();
        }
    }

    function renderAccount(container) {
        var wrap = el('div', 'yct-stack');
        wrap.appendChild(el('p', 'yct-muted', t('accountIntro')));

        if (state.auth.phase === 'authorized') {
            var body = el('div', 'yct-stack');
            var sessionHead = el('div', 'yct-row');
            sessionHead.appendChild(el('p', 'yct-heading', t('accountLoggedIn')));
            if (state.auth.readonly) sessionHead.appendChild(el('span', 'yct-chip', t('accountReadonly')));
            body.appendChild(sessionHead);
            if (state.auth.tokenExpiresAt) {
                body.appendChild(kv(t('accountCredential'), t('accountTokenValid', { time: formatDateTime(state.auth.tokenExpiresAt) })));
            } else {
                body.appendChild(kv(t('accountCredential'), t('accountTokenNoExpiry')));
            }
            body.appendChild(el('p', 'yct-note', t('accountLocalOnly')));
            var actions = el('div', 'yct-actions');
            actions.appendChild(button(t('accountLogout'), 'yct-logout', signOut));
            body.appendChild(actions);
            wrap.appendChild(card(t('accountTitle'), body));
            container.appendChild(wrap);
            return;
        }

        if (state.auth.phase === 'pending') {
            var pending = el('div', 'yct-stack');
            pending.appendChild(el('p', 'yct-heading', t('accountLoginPending')));
            pending.appendChild(el('p', 'yct-tiny', t('accountCodeLabel')));
            pending.appendChild(el('p', 'yct-code', state.auth.userCode || ''));
            pending.appendChild(el('p', 'yct-muted', t('accountCodeHint')));
            var pendingActions = el('div', 'yct-actions');
            pendingActions.appendChild(
                button(t('accountOpenPage'), 'yct-reopen', function () {
                    FluentOS.openExternal(state.auth.verifyUrl || DEVICE_VERIFY_URL).catch(function () {});
                })
            );
            pendingActions.appendChild(
                button(
                    t('accountCheckNow'),
                    'yct-check',
                    function () {
                        pollDeviceToken();
                    },
                    true
                )
            );
            pendingActions.appendChild(
                button(t('accountCancel'), 'yct-cancel', function () {
                    state.auth.phase = 'idle';
                    state.auth.deviceCode = null;
                    state.auth.userCode = null;
                    render();
                })
            );
            pending.appendChild(pendingActions);
            wrap.appendChild(card(t('accountTitle'), pending));
            container.appendChild(wrap);
            return;
        }

        var idleBody = el('div', 'yct-stack');
        if (state.auth.phase === 'error') {
            var note = el(
                'p',
                'yct-note is-warn',
                t(state.auth.errorKey || 'errUnknown', {
                    message: state.auth.errorMessage,
                    status: state.auth.errorStatus
                })
            );
            idleBody.appendChild(note);
            if (state.auth.errorMessage) idleBody.appendChild(el('p', 'yct-tiny', state.auth.errorMessage));
        }
        var idleActions = el('div', 'yct-actions');
        idleActions.appendChild(
            button(
                t('accountLogin'),
                'yct-login',
                function () {
                    startDeviceAuthorization();
                },
                true
            )
        );
        idleBody.appendChild(idleActions);
        wrap.appendChild(card(t('accountTitle'), idleBody));
        container.appendChild(wrap);
    }

    /* ============================ 渲染与导航 ============================ */

    var VIEW_RENDERERS = {
        home: renderHome,
        transit: renderTransit,
        stations: renderStations,
        schedules: renderSchedules,
        operations: renderOperations,
        account: renderAccount
    };

    function captureFocus() {
        var active = document.activeElement;
        if (!active || !active.id || !dom.view || !dom.view.contains(active)) return null;
        var snapshot = { id: active.id, start: null, end: null };
        if (typeof active.selectionStart === 'number') {
            snapshot.start = active.selectionStart;
            snapshot.end = active.selectionEnd;
        }
        return snapshot;
    }

    function restoreFocus(snapshot) {
        if (!snapshot) return;
        var node = document.getElementById(snapshot.id);
        if (!node || typeof node.focus !== 'function') return;
        node.focus();
        if (snapshot.start !== null && typeof node.setSelectionRange === 'function') {
            try {
                node.setSelectionRange(snapshot.start, snapshot.end);
            } catch (_) {
                // 某些 input 类型不支持 setSelectionRange，忽略。
            }
        }
    }

    function render() {
        if (!dom.view) return;
        var scrollTop = dom.view.scrollTop;
        var focus = captureFocus();

        dom.view.replaceChildren();

        if (state.loading) {
            dom.view.appendChild(loadingState());
        } else if (state.error) {
            dom.view.appendChild(errorState());
        } else {
            var renderer = VIEW_RENDERERS[state.view];
            if (renderer) renderer(dom.view);
        }

        dom.view.scrollTop = scrollTop;
        restoreFocus(focus);
        renderNav();
        renderBar();
    }

    function renderBar() {
        if (dom.barTitle) dom.barTitle.textContent = t('appTitle');
        if (dom.barSub) dom.barSub.textContent = t('appSubtitle');
        if (dom.refresh) {
            dom.refresh.setAttribute('aria-label', t('refresh'));
            dom.refresh.setAttribute('title', t('refresh'));
            dom.refresh.disabled = state.loading;
        }
        if (dom.sourcePill) {
            var meta = state.data.overviewMeta;
            if (meta && meta.sourceStatus) {
                dom.sourcePill.hidden = false;
                dom.sourcePill.className = 'yct-pill' + (meta.sourceStatus === 'ready' ? '' : ' is-warn');
                dom.sourcePill.textContent = meta.sourceStatus === 'ready' ? t('sourceReady') : t('sourceDegraded');
            } else {
                dom.sourcePill.hidden = true;
            }
        }
    }

    function renderNav() {
        if (!dom.nav) return;
        dom.nav.setAttribute('aria-label', t('navLabel'));
        var existing = dom.nav.querySelectorAll('.yct-nav-item');
        if (existing.length === NAV_ITEMS.length) {
            NAV_ITEMS.forEach(function (item, index) {
                var node = existing[index];
                node.setAttribute('aria-selected', item.id === state.view ? 'true' : 'false');
                node.setAttribute('tabindex', item.id === state.view ? '0' : '-1');
                var label = node.querySelector('.yct-nav-label');
                if (label) label.textContent = t(item.labelKey);
                node.setAttribute('aria-label', t(item.labelKey));
            });
            return;
        }

        dom.nav.replaceChildren();
        NAV_ITEMS.forEach(function (item) {
            var node = el('button', 'yct-nav-item');
            node.type = 'button';
            node.id = 'yct-nav-' + item.id;
            node.setAttribute('role', 'tab');
            node.setAttribute('aria-selected', item.id === state.view ? 'true' : 'false');
            node.setAttribute('tabindex', item.id === state.view ? '0' : '-1');
            node.setAttribute('aria-label', t(item.labelKey));
            node.appendChild(svgIcon(item.icon));
            node.appendChild(el('span', 'yct-nav-label', t(item.labelKey)));
            node.addEventListener('click', function () {
                navigate(item.id);
            });
            node.addEventListener('keydown', function (event) {
                var index = NAV_ITEMS.indexOf(item);
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    var next = NAV_ITEMS[(index + (event.key === 'ArrowDown' ? 1 : NAV_ITEMS.length - 1)) % NAV_ITEMS.length];
                    var nextNode = document.getElementById('yct-nav-' + next.id);
                    if (nextNode) nextNode.focus();
                    return;
                }
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(item.id);
                }
            });
            dom.nav.appendChild(node);
        });
    }

    function navigate(view) {
        if (!VIEW_RENDERERS[view]) return;
        state.view = view;
        state.error = null;
        render();
        if (dom.view) dom.view.focus();
        ensureData(view).then(render);
    }

    /* ============================ 启动 ============================ */

    function renderLanguage() {
        document.documentElement.lang = currentLanguage === 'zh' ? 'zh-CN' : 'en';
        renderBar();
        renderNav();
        render();
    }

    function syncSystemLanguage() {
        if (!isFluentOSAvailable() || typeof FluentOS.getLanguage !== 'function') {
            renderLanguage();
            return;
        }
        FluentOS.getLanguage()
            .then(function (language) {
                currentLanguage = normalizeLanguage(language);
            })
            .catch(function () {
                currentLanguage = promptLanguage;
            })
            .then(renderLanguage);
    }

    function bindEvents() {
        if (dom.refresh) {
            dom.refresh.addEventListener('click', function () {
                refreshAll();
            });
        }

        // 主题 / 强调色 / 语言 / 材质变化：只重绘文案与视觉，保留用户已输入的内容与滚动位置。
        window.addEventListener('fluentosstatechange', function (event) {
            var detail = event && event.detail ? event.detail : {};
            if (detail.language) {
                currentLanguage = normalizeLanguage(detail.language);
            }
            renderLanguage();
        });
    }

    function boot() {
        cacheDom();
        if (!dom.view || !dom.nav) return;
        currentLanguage = typeof FluentOS !== 'undefined' && FluentOS.state && FluentOS.state.language
            ? normalizeLanguage(FluentOS.state.language)
            : promptLanguage;
        bindEvents();
        renderNav();
        renderBar();
        render();
        syncSystemLanguage();
        loadStoredSession().then(function () {
            if (state.view === 'account') render();
        });
        ensureData('home').then(render);
    }

    boot();
})();
