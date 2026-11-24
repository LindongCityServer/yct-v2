/**
 * 预览 QQ 机器人随机物料的抽取分布（不渲染图片，秒级返回）。
 *
 * 用法：
 *   pnpm qqbot:material:preview --rounds 300
 *   pnpm qqbot:material:preview --kind metro_line --rounds 300
 *   pnpm qqbot:material:preview --data-source sample --rounds 100
 *   pnpm qqbot:material:preview --rounds 500 --json
 *
 * 输出按“对象类型 / 模板 / 版式 / 样式”汇总首次抽中的比例，并给出前 10 次抽样。
 * 这里模拟的是第一轮候选（不含渲染失败后的重试），用于判断权重手感。
 */
import {
  previewQqBotMaterialSampling,
  resolveQqBotMaterialTemplate,
  type QqBotMaterialSamplingPreview,
} from '../apps/web/lib/qq-bot-material';

function readOption(name: string, fallback = ''): string {
  const exact = `--${name}`;
  const prefix = `${exact}=`;
  for (let index = 0; index < process.argv.length; index += 1) {
    const argument = process.argv[index]!;
    if (argument === exact) {
      return process.argv[index + 1] ?? fallback;
    }
    if (argument.startsWith(prefix)) {
      return argument.slice(prefix.length) || fallback;
    }
  }
  return fallback;
}

function printCounts(title: string, counts: Record<string, number>, total: number): void {
  const entries = Object.entries(counts).sort((left, right) => right[1] - left[1]);
  console.log(`\n${title}`);
  for (const [key, count] of entries) {
    console.log(
      `  ${((count / total) * 100).toFixed(1).padStart(5)}%  ${String(count).padStart(4)}  ${key}`,
    );
  }
}

function printPreview(result: QqBotMaterialSamplingPreview): void {
  console.log(
    `随机物料抽样预览：kind=${result.kind} · dataSource=${result.dataSource} · ${result.rounds} 次`,
  );
  console.log(`数据源：${result.source.name}`);
  console.log(
    `候选池：${result.pool.objectCount} 个对象 / ${result.pool.candidateCount} 个候选（${Object.entries(
      result.pool.objectTypeCounts,
    )
      .map(([type, count]) => `${type} ${count}`)
      .join('，')}）`,
  );
  printCounts('按对象类型', result.objectTypeCounts, result.rounds);
  printCounts(
    '按模板',
    Object.fromEntries(
      Object.entries(result.templateCounts).map(([templateId, count]) => [
        `${templateId}（${resolveQqBotMaterialTemplate(templateId).title}）`,
        count,
      ]),
    ),
    result.rounds,
  );
  printCounts('按版式', result.layoutCounts, result.rounds);
  printCounts('按样式', result.styleCounts, result.rounds);

  console.log('\n前 10 次抽样');
  for (const [index, sample] of result.samples.entries()) {
    console.log(
      `  ${String(index + 1).padStart(2)}. ${sample.objectKey} → ${sample.layoutKey} / ${sample.styleKey}（${sample.templateId}）`,
    );
  }
}

const rounds = Number(readOption('rounds', '100'));
const kind = readOption('kind', 'random');
const dataSource = readOption('data-source', 'server');
const seedPrefix = readOption('seed-prefix', 'preview');
const json = process.argv.includes('--json');
const help = process.argv.includes('--help') || process.argv.includes('-h');

if (help) {
  console.log(
    [
      '用法：pnpm qqbot:material:preview [选项]',
      '  --rounds <n>        模拟次数，1-1000，默认 100',
      '  --kind <kind>       random / road_sign / address_sign / bus_stop / metro_line / custom',
      '  --data-source <s>   server / sample，默认 server',
      '  --seed-prefix <s>   抽样种子前缀，默认 preview',
      '  --json              输出完整 JSON',
    ].join('\n'),
  );
  process.exit(0);
}

try {
  const result = await previewQqBotMaterialSampling({
    rounds,
    kind,
    dataSource,
    seedPrefix,
  });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printPreview(result);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
