const strongAskPattern =
  /怎么|怎麼|如何|为什么|為什麼|为啥|為啥|哪|几点|幾點|多久|能不能|可不可以|可以吗|可以嗎|帮我|幫我|推荐|推薦|比较|比較|规划|規劃|换乘|換乘|从.+(?:到|去)|從.+(?:到|去)|how|why|can i|should i|from .+ to|best|recommend|plan/i;

const weakAskPattern = /明天|今天|现在|現在|末班|最早|最晚|停运|停運|延误|延誤|tomorrow|today|now/i;

export function detectAskMode(input: {
  query: string;
  hasExactEntity: boolean;
  hasStrongResult: boolean;
  embedded: boolean;
}): boolean {
  const compactQuery = input.query.replace(/[\s　]+/g, '');
  if (input.embedded || compactQuery.length < 2) {
    return false;
  }

  if (input.hasExactEntity) {
    return false;
  }

  if (strongAskPattern.test(input.query)) {
    return true;
  }

  if (weakAskPattern.test(input.query) && !input.hasStrongResult) {
    return true;
  }

  if (compactQuery.length >= 12) {
    return true;
  }

  return !input.hasStrongResult;
}
