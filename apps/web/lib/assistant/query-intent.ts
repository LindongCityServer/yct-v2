/** 带有明确疑问词的问句：这类问题优先交给问一问，而不是停留在搜索结果。 */
const questionPattern =
  /[？?]|什么|什麼|怎么样|怎麼樣|有没有|有沒有|是不是|能不能|可不可以|可以吗|可以嗎|在哪|哪里|哪裡|哪儿|哪兒|哪些|哪个|哪個|多少|多久|几点|幾點/;

/** 祈使式问法：帮我规划路线、推荐周边、从 A 到 B 怎么走。 */
const strongAskPattern =
  /怎么|怎麼|如何|为什么|為什麼|为啥|為啥|帮我|幫我|推荐|推薦|比较|比較|规划|規劃|换乘|換乘|从.+(?:到|去)|從.+(?:到|去)|how|why|can i|should i|from .+ to|best|recommend|plan/i;

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

  const looksLikeQuestion = questionPattern.test(input.query) || strongAskPattern.test(input.query);

  // 输入还很短时先展示搜索，避免刚打出两个字就跳到问一问。
  if (compactQuery.length < 4 && input.hasStrongResult) {
    return false;
  }

  // 问句优先；只有“纯实体名”才留在搜索，不再因为命中了实体就吞掉问题。
  if (looksLikeQuestion) {
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
