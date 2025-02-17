export interface IStepsItem {
  label: string;
  inputCollapsed: boolean;
  outputCollapsed: boolean;
}

export const steps: IStepsItem[] = [
  {
    label: '1.1 多语言处理',
    inputCollapsed: false,
    outputCollapsed: false,
  },
  {
    label: '1.2 第一次搜索(自然语言)',
    inputCollapsed: false,
    outputCollapsed: false,
  },
  {
    label: '1.3.1 第一次判别(提取实体)',
    inputCollapsed: false,
    outputCollapsed: false,
  },
  {
    label: '1.3.1 第一次判别(实体搜索)',
    inputCollapsed: false,
    outputCollapsed: false,
  },
  {
    label: '1.3.3 第一次判别(虚构概念)',
    inputCollapsed: false,
    outputCollapsed: false,
  },
  {
    label: '1.3.4 第一次判别(价值判断)',
    inputCollapsed: false,
    outputCollapsed: false,
  },
  {
    label: '1.3 第一次判别(退出)',
    inputCollapsed: false,
    outputCollapsed: false,
  },
  {
    label: '1.4 第一次优化',
    inputCollapsed: false,
    outputCollapsed: false,
  },
  {
    label: '2.1 相关信息搜索',
    inputCollapsed: false,
    outputCollapsed: false,
  },
  {
    label: '2.2 第二次搜索(关键词)',
    inputCollapsed: false,
    outputCollapsed: false,
  },
  {
    label: '2.2 第二次搜索(date_question)',
    inputCollapsed: false,
    outputCollapsed: false,
  },
  // {
  //   label: '3. 价格问题处理(可选) get_price_info',
  //   inputCollapsed: false,
  //   outputCollapsed: false,
  // },
  // {
  //   label: '3. 价格问题处理(可选) get_price_data',
  //   inputCollapsed: false,
  //   outputCollapsed: false,
  // },
  // {
  //   label: '3. 价格信息搜索(可选) gm_price_a',
  //   inputCollapsed: false,
  //   outputCollapsed: false,
  // },
  // {
  //   label: '3. 价格信息搜索(可选) gm_price_b',
  //   inputCollapsed: false,
  //   outputCollapsed: false,
  // },
  // {
  //   label: '3. 价格问题处理(可选)退出',
  //   inputCollapsed: true,
  //   outputCollapsed: false,
  // },
  {
    label: '4. 问题类型判别1',
    inputCollapsed: false,
    outputCollapsed: false,
  },
  {
    label: '4. 问题类型判别(可选)退出',
    inputCollapsed: true,
    outputCollapsed: false,
  },
  {
    label: '5. 信息数据获取(可拓展)',
    inputCollapsed: false,
    outputCollapsed: false,
  },
  {
    label: '5. 信息数据获取(可拓展)(退出)',
    inputCollapsed: false,
    outputCollapsed: false,
  },
  {
    label: '5. 信息数据获取(搜索 with domain)',
    inputCollapsed: false,
    outputCollapsed: false,
  },
  {
    label: '5. 信息数据获取(获取精准链接)',
    inputCollapsed: false,
    outputCollapsed: false,
  },
  {
    label: '5. 信息数据获取(获取数据)',
    inputCollapsed: false,
    outputCollapsed: false,
  },
  {
    label: '5. 信息数据获取(get_network_a)',
    inputCollapsed: false,
    outputCollapsed: false,
  },
  {
    label: '5. 信息数据获取(退出)',
    inputCollapsed: false,
    outputCollapsed: false,
  },
  {
    label: '6. 二次优化问题(get_time_two)',
    inputCollapsed: false,
    outputCollapsed: false,
  },
  {
    label: '7.1 第三次搜索(自然语言)',

    inputCollapsed: false,
    outputCollapsed: false,
  },
  {
    label: '7.2 事实判断',

    inputCollapsed: false,
    outputCollapsed: false,
  },
  {
    label: '7.2 事实判断(可选)退出',

    inputCollapsed: false,
    outputCollapsed: false,
  },
  {
    label: '7.3 概率判断',

    inputCollapsed: false,
    outputCollapsed: false,
  },
  {
    label: '7.3 概率判断输出',

    inputCollapsed: false,
    outputCollapsed: false,
  },
  {
    label: '8. 市场生成',

    inputCollapsed: false,
    outputCollapsed: false,
  },
];

export const preConfigIndex = 120;

export enum EStepNumber {
  translateRequest,
  firstTavilySearchRequest,
  firstJudgmentGetDataRequest,
  firstJudgmentEntitiesTavilySearchRequest,
  firstJudgmentIfContainsRequest,
  firstJudgmentDependOnValueRequest,
  topicStoppedBecauseOfFirstJudgment,
  getQuestionRequest,
  getKeyRequest,
  secondTavilySearchRequest,
  secondTavilySearchOfDateQuestionRequest,
  // priceInfoRequest,
  // priceDataRequest,
  // gmPriceA,
  // gmPriceB,
  // topicStoppedBecauseOfPrices,
  typeRequest,
  topicStoppedBecauseOfType,
  sourceDataRequest,
  topicStoppedBecauseOfSourceData,
  sourceDataTavilySearchRequest,
  sourceDataGetLinkRequest,
  sourceDataGetLinkDataRequest,
  sourceDataGMNetworkARequest,
  topicStoppedBecauseOfSourceDataGetLinkData,
  timeResultRequest,
  thirdTavilySearchRequest,
  factRequest,
  topicStoppedBecauseOfFact,
  possibilityRequest,
  resultAccordingToPossibility,
  marketRulesRequest,
}

export enum EQuestionType {
  Zero,
  One,
  Two,
  Three,
  Four,
  Five,
}

export enum EEncludedDomains {
  Others,
  Youtube,
  Twitter,
  GitHub,
  Quit,
}

export const encludedDomainsMap: Record<
  EEncludedDomains.Youtube | EEncludedDomains.Twitter | EEncludedDomains.GitHub,
  string
> = {
  [EEncludedDomains.Youtube]: 'https://www.youtube.com/',
  [EEncludedDomains.Twitter]: 'https://www.x.com/',
  [EEncludedDomains.GitHub]: 'https://www.gitHub.com/',
};

export const encludedGetLinkApisMap: Record<
  EEncludedDomains.Youtube | EEncludedDomains.Twitter | EEncludedDomains.GitHub,
  string
> = {
  [EEncludedDomains.Youtube]: '/extract/youtube_link',
  [EEncludedDomains.Twitter]: '/extract/twitter_link',
  [EEncludedDomains.GitHub]: '/extract/github_link',
};

export const encludedGetLinkDataApisMap: Record<
  EEncludedDomains.Youtube | EEncludedDomains.Twitter | EEncludedDomains.GitHub,
  string
> = {
  [EEncludedDomains.Youtube]: '/youtube/subscribers',
  [EEncludedDomains.Twitter]: '/twitter/followers',
  [EEncludedDomains.GitHub]: '/github/url',
};
