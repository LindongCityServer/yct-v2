ll.registerPlugin('YctRideGateway', '雨城通乘车设备事件桥接', [1, 0, 0], {
  Author: 'Yuchengtong',
});

const configPath = 'plugins/YctRideGateway/config.json';
const config = readConfig();

if (config) {
  mc.regPlayerCmd(
    config.command,
    '上报雨城通乘车设备事件',
    (player, args) => {
      const operation = args[0];
      const deviceId = args[1];
      if ((operation !== 'entry' && operation !== 'exit') || !deviceId) {
        player.tell(`用法: /${config.command} <entry|exit> <deviceId>`);
        return;
      }

      const payload = JSON.stringify({
        deviceEventId: createUuid(),
        deviceId,
        operation,
        playerName: player.realName,
        occurredAt: new Date().toISOString(),
      });

      network.httpPost(
        config.gatewayUrl,
        {
          'x-yct-ride-gateway-token': config.gatewayToken,
        },
        payload,
        'application/json',
        (status, body) => {
          const response = parseResponse(body);
          if (status >= 200 && status < 300 && response?.accepted === true) {
            player.tell(
              operation === 'entry' ? '雨城通: 已冻结最高票价。' : '雨城通: 已按实际票价结算。',
            );
            return;
          }
          player.tell(`雨城通: ${response?.message ?? `设备网关请求失败 (${status})`}`);
        },
      );
    },
    0,
  );
}

function readConfig() {
  if (!File.exists(configPath)) {
    logger.error(`未找到 ${configPath}，乘车设备桥接未启用。`);
    return null;
  }

  try {
    const parsed = JSON.parse(File.readFrom(configPath));
    if (
      !parsed ||
      typeof parsed.gatewayUrl !== 'string' ||
      !parsed.gatewayUrl.trim() ||
      typeof parsed.gatewayToken !== 'string' ||
      !parsed.gatewayToken.trim() ||
      typeof parsed.command !== 'string' ||
      !parsed.command.trim()
    ) {
      throw new Error('gatewayUrl、gatewayToken 和 command 必须是非空字符串。');
    }
    return {
      gatewayUrl: parsed.gatewayUrl.trim(),
      gatewayToken: parsed.gatewayToken.trim(),
      command: parsed.command.trim(),
    };
  } catch (error) {
    logger.error(`读取 ${configPath} 失败: ${error}`);
    return null;
  }
}

function createUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function parseResponse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
