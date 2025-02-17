/* eslint-disable @typescript-eslint/no-explicit-any */
// 添加解析 Answer 部分的辅助函数
const extractAnswer = (response: string) => {
  try {
    const resStr = removeNewlines(response).trim();
    // 取字符串最后一个值
    const lastValue = resStr.charAt(resStr.length - 1);
    return lastValue;
  } catch (error) {
    console.error('Failed to extract answer:', error);
    return response;
  }
};

function removeNewlines(input: string) {
  // 使用正则表达式匹配所有的换行符并替换为空字符串
  return input.replace(/\n/g, '');
}

// 提取二次优化问题
function extractParseJson(input: string): any | null {
  const jsonString = removeNewlines(input);
  // 以 ```json 开头
  const jsonRegex = /```json\s*([\s\S]*)$/;

  // 尝试匹配 JSON 代码块
  const match = jsonRegex.exec(jsonString);
  if (match && match[1]) {
    // 可能会输出2个json，再匹配一次
    let match2 = jsonRegex.exec(match[1]);
    if (match2 === null) match2 = match;
    if (match2 && match2[1]) {
      const jsonString = match2[1].trim(); // 去除前后空白字符
      console.log('jsonString:', jsonString);
      try {
        // 提取json
        const jsonData = jsonString.replace(/^```json\s*/g, '').replace(/```$/g, '');
        return JSON.parse(jsonData);
      } catch (error) {
        console.error('Failed to parse JSON:', error);
        return null;
      }
    } else {
      return JSON.parse(input);
    }
  } else {
    // 匹配### Recommendation
    const recommendationRegex = /### Recommendation\s*([\s\S]*)$/;
    const matchRecommendation = recommendationRegex.exec(jsonString);
    if (matchRecommendation && matchRecommendation[1]) {
      return JSON.parse(matchRecommendation[1].trim());
    }
    return JSON.parse(input);
  }
}

const jsonParse = (data: string = '', debugSource: string = 'default source', api: string, debug: boolean = true) => {
  let jsonString = data.split('```')[0];

  jsonString = jsonString.replace(/: True/g, ': true');
  jsonString = jsonString.replace(/: False/g, ': false');

  jsonString = jsonString.replace(/: High/g, ': "High"');
  jsonString = jsonString.replace(/: high/g, ': "high"');
  jsonString = jsonString.replace(/: Medium/g, ': "Medium"');
  jsonString = jsonString.replace(/: medium/g, ': "medium"');
  jsonString = jsonString.replace(/: Low/g, ': "Low"');
  jsonString = jsonString.replace(/: low/g, ': "low"');

  try {
    const result = JSON.parse(jsonString);
    return result;
  } catch (error) {
    if (debug) {
      console.log(` #################### json parse error occurred in ${debugSource} begin #################### `);
      console.log('api:', api);
      console.log('data:', data);
      console.log('jsonString:', jsonString);
      console.warn('error:', error);
      console.log(` #################### json parse error occurred in ${debugSource} end #################### `);
    }
    return {
      data: jsonString,
    };
  }
};

const LocalIsBooleanTrue = (data: boolean | string) => {
  return (typeof data === 'boolean' && data) || (typeof data === 'string' && data.toLowerCase() === 'true');
};

const LocalNumberMaybeStringCompare = (numberMabeString: number | string, data: number | string) => {
  return numberMabeString.toString().toLocaleLowerCase() === data.toString().toLocaleLowerCase();
};

const LocalStringCompare = (numberMabeString: string = '', data: string) => {
  return numberMabeString.toString().toLocaleLowerCase() === data.toString().toLocaleLowerCase();
};

export {
  extractAnswer,
  extractParseJson,
  jsonParse,
  LocalIsBooleanTrue,
  LocalNumberMaybeStringCompare,
  LocalStringCompare,
};
