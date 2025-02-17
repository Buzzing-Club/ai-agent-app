/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-ts-comment */
import { useCallback, useEffect, useState } from 'react';
import ReactJson from 'react-json-view';

import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Select,
  Typography,
  InputLabel,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import CloseIcon from '@mui/icons-material/Close';
import FullscreenIcon from '@mui/icons-material/Fullscreen';

import { get, post } from '../../common/request';
import { extractParseJson, jsonParse, LocalNumberMaybeStringCompare, LocalStringCompare } from '../../utils';
import {
  encludedDomainsMap,
  EStepNumber,
  preConfigIndex,
  steps,
  EEncludedDomains,
  encludedGetLinkApisMap,
  encludedGetLinkDataApisMap,
  EQuestionType,
} from './config';

import type { Dayjs } from 'dayjs';
import type { MessageData } from './typing';

export default function Index() {
  // 需要支持一次发2个请求，message 需要存到一个数组里
  const [messageMap, setMessageMap] = useState<{ [key: string]: MessageData }>({
    '0': {
      isLoading: false,
      data: [],
      inputMessage: [],
      activeStep: -1,
      stepFailedId: -1,
      failMessage: '',
    },
    '1': {
      isLoading: false,
      data: [],
      inputMessage: [],
      activeStep: -1,
      stepFailedId: -1,
      failMessage: '',
    },
  });
  // 设置每一个步骤的输入内容
  const setInputMessage = useCallback(
    (id: number, message: any, step: number) => {
      const messageMapData = messageMap[id];
      messageMapData.inputMessage[step] = message;
      setMessageMap({ ...messageMap, [id]: messageMapData });
    },
    [messageMap],
  );
  // 设置loading状态
  const setLoading = useCallback(
    (id: number) => {
      const messageMapData = messageMap[id];
      messageMapData.isLoading = true;
      setMessageMap({ ...messageMap, [id]: messageMapData });
    },
    [messageMap],
  );
  // 设置loading状态为false
  const setLoadingFalse = useCallback(
    (id: number) => {
      const messageMapData = messageMap[id];
      messageMapData.isLoading = false;
      setMessageMap({ ...messageMap, [id]: messageMapData });
    },
    [messageMap],
  );
  const handleNext = useCallback(
    (id: number, activeStep: number) => {
      const messageMapData = messageMap[id];
      messageMapData.activeStep = activeStep;
      setMessageMap({ ...messageMap, [id]: messageMapData });
    },
    [messageMap],
  );

  const [modelType, setModelType] = useState<'openai' | 'deep'>('openai');
  // 设置不同的AI模型
  const setModel = (model: 'openai' | 'deep') => {
    setModelType(model);
    localStorage.setItem('model', model);
  };
  useEffect(() => {
    const model = localStorage.getItem('model');
    if (model) {
      setModelType(model as 'openai' | 'deep');
    }
  }, []);

  const [openDialog, setOpenDialog] = useState<boolean>(false);
  const [dialogContent, setDialogContent] = useState<any>(null);
  const [dialogUseType, setDialogUseType] = useState<'pre' | 'json'>('pre');
  const handleOpenDialog = (content: any, type: 'pre' | 'json') => {
    setDialogContent(content);
    setDialogUseType(type);
    setOpenDialog(true);
  };
  const handleCloseDialog = () => {
    setOpenDialog(false);
    setDialogContent(null);
  };

  const [predictionDate, setPredictionDate] = useState<Dayjs | null>(null);

  // 递归请求数据，直到请求成功 (因为后端要去chatgpt上查，时间会很长，甚至超时，所以前端用了短轮询的方案)
  const requestData = useCallback(
    async (taskId: number, id: number) => {
      try {
        const res = await get(`/task/${taskId}`);
        // 当请求成功的时候，设置message
        if (res.status === 'success') {
          return res;
        } else if (res.status === 'failed') {
          throw new Error(res.message);
        } else {
          return await requestData(taskId, id);
        }
      } catch (error) {
        setMessageMap({ ...messageMap, [id]: { ...messageMap[id], stepFailedId: id } });
        throw error;
      }
    },
    [messageMap],
  );

  const requestTargetData = useCallback(
    async (call: () => Promise<any>, check: (res: any) => boolean, debug: boolean = true) => {
      const res = await call();
      if (debug) console.log('res:', res, 'isPassed', check(res));
      if (check(res)) {
        return res;
      } else {
        if (debug) console.log('requestTargetData try again');
        return await requestTargetData(call, check);
      }
    },
    [],
  );

  // 1.1 多语言处理
  // 将多语言输入统一处理为英文
  const translateRequest = useCallback(
    async (name: string, id: number) => {
      const messageMapData = messageMap[id];
      const tmpStep = EStepNumber.translateRequest;

      try {
        setLoading(id);
        handleNext(id, tmpStep);

        const api = '/chat/translate';
        const requestParam = {
          question: name,
          model: modelType,
        };
        setInputMessage(id, requestParam, tmpStep);
        const resTranslate = await post(api, requestParam);
        // @ts-ignore
        const dataTranslate = await requestData(resTranslate.task_id, id);
        const dataTranslateJson = jsonParse(dataTranslate.data, steps[tmpStep].label, api);

        const messageData = messageMapData.data;
        messageData[tmpStep] = dataTranslateJson;
        setMessageMap({ ...messageMap, [id]: { ...messageMap[id], data: messageData } });

        return dataTranslateJson;
      } catch (error) {
        // @ts-ignore
        messageMapData.failMessage = error.message || error.error || error;
        messageMapData.stepFailedId = tmpStep;
        setMessageMap({ ...messageMap, [id]: messageMapData });

        throw error;
      } finally {
        setLoadingFalse(id);
      }
    },
    [handleNext, messageMap, modelType, requestData, setInputMessage, setLoading, setLoadingFalse],
  );

  // 1.2 第一次搜索(自然语言)
  // 根据 1.1 的 JSON 结果中的 “topic” 直接使用 tavily 搜索前 5 条内容。
  const firstTavilySearchRequest = useCallback(
    async (id: number, data: any) => {
      const messageMapData = messageMap[id];
      const tmpStep = EStepNumber.firstTavilySearchRequest;

      try {
        setLoading(id);
        handleNext(id, tmpStep);

        const api = '/tavily/search';
        const requestParam = {
          query: data.topic,
          max_results: 5,
        };
        setInputMessage(id, requestParam, tmpStep);
        const resTavilySearch = await post(api, requestParam);
        // @ts-ignore
        const dataTavilySearch = await requestData(resTavilySearch.task_id, id);

        const messageData = messageMapData.data;
        messageData[tmpStep] = dataTavilySearch;
        setMessageMap({ ...messageMap, [id]: { ...messageMap[id], data: messageData } });

        return dataTavilySearch;
      } catch (error) {
        // @ts-ignore
        messageMapData.failMessage = error.message || error.error || error;
        messageMapData.stepFailedId = tmpStep;
        setMessageMap({ ...messageMap, [id]: messageMapData });

        throw error;
      } finally {
        setLoadingFalse(id);
      }
    },
    [handleNext, messageMap, requestData, setInputMessage, setLoading, setLoadingFalse],
  );

  // 1.3.1 第一次判别(提取实体)
  const firstJudgmentGetDataRequest = useCallback(
    async (id: number, translate: any) => {
      const messageMapData = messageMap[id];
      const tmpStep = EStepNumber.firstJudgmentGetDataRequest;

      try {
        setLoading(id);
        handleNext(id, tmpStep);

        const api = '/extract/entities';
        const requestParam = {
          topic: translate.topic,
          model: modelType,
        };
        setInputMessage(id, requestParam, tmpStep);
        const resFirstJudgmentGetData = await post(api, requestParam);
        // @ts-ignore
        const dataFirstJudgmentGetData = await requestData(resFirstJudgmentGetData.task_id, id);
        const dataFirstJudgmentGetDataJson = jsonParse(dataFirstJudgmentGetData.data, steps[tmpStep].label, api);

        const messageData = messageMapData.data;
        messageData[tmpStep] = dataFirstJudgmentGetDataJson;
        setMessageMap({ ...messageMap, [id]: { ...messageMap[id], data: messageData } });

        return dataFirstJudgmentGetDataJson;
      } catch (error) {
        // @ts-ignore
        messageMapData.failMessage = error.message || error.error || error;
        messageMapData.stepFailedId = tmpStep;
        setMessageMap({ ...messageMap, [id]: messageMapData });

        throw error;
      } finally {
        setLoadingFalse(id);
      }
    },
    [handleNext, messageMap, modelType, requestData, setInputMessage, setLoading, setLoadingFalse],
  );

  // 1.3.1 第一次判别(实体搜索)
  const firstJudgmentEntitiesTavilySearchRequest = useCallback(
    async (entities: string[], id: number) => {
      const messageMapData = messageMap[id];
      const tmpStep = EStepNumber.firstJudgmentEntitiesTavilySearchRequest;

      try {
        setLoading(id);
        handleNext(id, tmpStep);

        const api = '/tavily/search';
        const requestParam = {
          query: JSON.stringify(entities),
          max_results: 8,
        };
        setInputMessage(id, requestParam, tmpStep);
        const resTavilySearch = await post(api, requestParam);
        // @ts-ignore
        const dataTavilySearch = await requestData(resTavilySearch.task_id, id);

        const messageData = messageMapData.data;
        messageData[tmpStep] = dataTavilySearch;
        setMessageMap({ ...messageMap, [id]: { ...messageMap[id], data: messageData } });

        return dataTavilySearch;
      } catch (error) {
        // @ts-ignore
        messageMapData.failMessage = error.message || error.error || error;
        messageMapData.stepFailedId = tmpStep;
        setMessageMap({ ...messageMap, [id]: messageMapData });

        throw error;
      } finally {
        setLoadingFalse(id);
      }
    },
    [handleNext, messageMap, requestData, setInputMessage, setLoading, setLoadingFalse],
  );

  // 1.3.3 第一次判别(虚构概念)
  // 对问题是否有讨论价值和是否存在虚构概念进行判别（带搜索内容）
  const firstJudgmentIfContainsRequest = useCallback(
    async (id: number, entities: string[], search: any) => {
      const messageMapData = messageMap[id];
      const tmpStep = EStepNumber.firstJudgmentIfContainsRequest;

      try {
        setLoading(id);
        handleNext(id, tmpStep);

        const api = '/chat/first_judgment_with_search';
        const requestParam = {
          entities: JSON.stringify(entities),
          search_text: JSON.stringify(search),
          model: modelType,
        };
        setInputMessage(id, requestParam, tmpStep);
        const resFirstJudgmentIfContains = await post(api, requestParam);
        // @ts-ignore
        const dataFirstJudgmentIfContains = await requestData(resFirstJudgmentIfContains.task_id, id);
        const dataFirstJudgmentIfContainsJson = jsonParse(dataFirstJudgmentIfContains.data, steps[tmpStep].label, api);

        const messageData = messageMapData.data;
        messageData[tmpStep] = dataFirstJudgmentIfContainsJson;
        setMessageMap({ ...messageMap, [id]: { ...messageMap[id], data: messageData } });

        return dataFirstJudgmentIfContainsJson;
      } catch (error) {
        // @ts-ignore
        messageMapData.failMessage = error.message || error.error || error;
        messageMapData.stepFailedId = tmpStep;
        setMessageMap({ ...messageMap, [id]: messageMapData });

        throw error;
      } finally {
        setLoadingFalse(id);
      }
    },
    [handleNext, messageMap, modelType, requestData, setInputMessage, setLoading, setLoadingFalse],
  );

  // 1.3.4 第一次判别(价值判断)
  // 对问题是否有讨论价值进行判别（带搜索内容）
  const firstJudgmentDependOnValueRequest = useCallback(
    async (id: number, translate: any, search: any) => {
      const messageMapData = messageMap[id];
      const tmpStep = EStepNumber.firstJudgmentDependOnValueRequest;

      try {
        setLoading(id);
        handleNext(id, tmpStep);

        const api = '/chat/discussion_value';
        const requestParam = {
          topic: translate.topic,
          search_text: JSON.stringify(search.data.results.map((item: any) => item.content)),
          model: modelType,
        };
        setInputMessage(id, requestParam, tmpStep);
        const resFirstJudgmentDependOnValue = await post(api, requestParam);
        // @ts-ignore
        const dataFirstJudgmentDependOnValue = await requestData(resFirstJudgmentDependOnValue.task_id, id);
        const dataFirstJudgmentDependOnValueJson = jsonParse(
          dataFirstJudgmentDependOnValue.data,
          steps[tmpStep].label,
          api,
        );

        const messageData = messageMapData.data;
        messageData[tmpStep] = dataFirstJudgmentDependOnValueJson;
        setMessageMap({ ...messageMap, [id]: { ...messageMap[id], data: messageData } });

        return dataFirstJudgmentDependOnValueJson;
      } catch (error) {
        // @ts-ignore
        messageMapData.failMessage = error.message || error.error || error;
        messageMapData.stepFailedId = tmpStep;
        setMessageMap({ ...messageMap, [id]: messageMapData });

        throw error;
      } finally {
        setLoadingFalse(id);
      }
    },
    [handleNext, messageMap, modelType, requestData, setInputMessage, setLoading, setLoadingFalse],
  );

  // 1.3 第一次判别(退出)
  const topicStoppedBecauseOfFirstJudgment = useCallback(
    (id: number) => {
      const messageMapData = messageMap[id];
      const tmpStep = EStepNumber.topicStoppedBecauseOfFirstJudgment;

      messageMapData.failMessage = 'We will not go on the process of the topic.';
      messageMapData.stepFailedId = tmpStep;
      setMessageMap({ ...messageMap, [id]: messageMapData });
    },
    [messageMap],
  );

  // 1.4 第一次优化
  const getQuestionRequest = useCallback(
    async (id: number, translate: any, search: any) => {
      const messageMapData = messageMap[id];
      const tmpStep = EStepNumber.getQuestionRequest;

      try {
        setLoading(id);
        handleNext(id, tmpStep);

        const api = '/chat/get_question';
        const requestParam = {
          question: translate.topic,
          search_text: JSON.stringify(search.data.results),
          model: modelType,
        };
        setInputMessage(id, requestParam, tmpStep);
        const resGetQuestion = await post(api, requestParam);
        // @ts-ignore
        const dataGetQuestion = await requestData(resGetQuestion.task_id, id);
        const dataGetQuestionJson = jsonParse(dataGetQuestion.data, steps[tmpStep].label, api);

        const messageData = messageMapData.data;
        messageData[tmpStep] = dataGetQuestionJson;
        setMessageMap({ ...messageMap, [id]: { ...messageMap[id], data: messageData } });

        // 如果 JSON 中的 “date” 是 “TBA”,则不进行后续流程并输出 "justification"
        // if (dataGetQuestionJson.date === 'TBA') {
        //   throw new Error(dataGetQuestionJson.justification);
        // }

        // 如果 JSON 中的 “date” 早于或等于目前的日期，则不继续后续流程并输出 "justification"
        // if (dayjs(dataGetQuestionJson.date).isBefore(dayjs())) {
        //   throw new Error(dataGetQuestionJson.justification);
        // }

        return dataGetQuestionJson;
      } catch (error) {
        // @ts-ignore
        messageMapData.failMessage = error.message || error.error || error;
        messageMapData.stepFailedId = tmpStep;
        setMessageMap({ ...messageMap, [id]: messageMapData });

        throw error;
      } finally {
        setLoadingFalse(id);
      }
    },
    [handleNext, messageMap, modelType, requestData, setInputMessage, setLoading, setLoadingFalse],
  );

  // 2.1 相关信息搜索
  const getKeyRequest = useCallback(
    async (name: string, id: number) => {
      const messageMapData = messageMap[id];
      const tmpStep = EStepNumber.getKeyRequest;

      try {
        setLoading(id);
        handleNext(id, tmpStep);

        const api = '/chat/get_key';
        const requestParam = {
          name,
          model: modelType,
        };
        setInputMessage(id, requestParam, tmpStep);
        const resGetKey = await post(api, requestParam);
        // @ts-ignore
        const dataGetKey = await requestData(resGetKey.task_id, id);
        const dataGetKeyJson = jsonParse(dataGetKey.data, steps[tmpStep].label, api);

        const messageData = messageMapData.data;
        messageData[tmpStep] = dataGetKeyJson;
        setMessageMap({ ...messageMap, [id]: { ...messageMap[id], data: messageData } });

        return dataGetKeyJson;
      } catch (error) {
        // @ts-ignore
        messageMapData.failMessage = error.message || error.error || error;
        messageMapData.stepFailedId = tmpStep;
        setMessageMap({ ...messageMap, [id]: messageMapData });

        throw error;
      } finally {
        setLoadingFalse(id);
      }
    },
    [handleNext, messageMap, modelType, requestData, setInputMessage, setLoading, setLoadingFalse],
  );

  // 2.2 第二次搜索(关键词)
  const secondTavilySearchRequest = useCallback(
    async (keyResult: any, id: number) => {
      const messageMapData = messageMap[id];
      const tmpStep = EStepNumber.secondTavilySearchRequest;

      try {
        setLoading(id);
        handleNext(id, tmpStep);

        const api = '/tavily/search';
        const requestParam = {
          query: Array.isArray(keyResult?.keys1) ? keyResult?.keys1.join(' ') : keyResult?.keys1,
          max_results: 10,
        };
        setInputMessage(id, requestParam, tmpStep);
        const resTavilySearch = await post(api, requestParam);
        // @ts-ignore
        const dataTavilySearch = await requestData(resTavilySearch.task_id, id);

        const messageData = messageMapData.data;
        messageData[tmpStep] = dataTavilySearch;
        setMessageMap({ ...messageMap, [id]: { ...messageMap[id], data: messageData } });

        return dataTavilySearch;
      } catch (error) {
        // @ts-ignore
        messageMapData.failMessage = error.message || error.error || error;
        messageMapData.stepFailedId = tmpStep;
        setMessageMap({ ...messageMap, [id]: messageMapData });

        throw error;
      } finally {
        setLoadingFalse(id);
      }
    },
    [handleNext, messageMap, requestData, setInputMessage, setLoading, setLoadingFalse],
  );

  // 2.2 第二次搜索(date_question)
  const secondTavilySearchOfDateQuestionRequest = useCallback(
    async (query: string, id: number) => {
      const messageMapData = messageMap[id];
      const tmpStep = EStepNumber.secondTavilySearchOfDateQuestionRequest;

      try {
        setLoading(id);
        handleNext(id, tmpStep);

        const api = '/tavily/search';
        const requestParam = {
          query,
          max_results: 3,
        };
        setInputMessage(id, requestParam, tmpStep);
        const resTavilySearch = await post(api, requestParam);
        // @ts-ignore
        const dataTavilySearch = await requestData(resTavilySearch.task_id, id);

        const messageData = messageMapData.data;
        messageData[tmpStep] = dataTavilySearch;
        setMessageMap({ ...messageMap, [id]: { ...messageMap[id], data: messageData } });

        return dataTavilySearch;
      } catch (error) {
        // @ts-ignore
        messageMapData.failMessage = error.message || error.error || error;
        messageMapData.stepFailedId = tmpStep;
        setMessageMap({ ...messageMap, [id]: messageMapData });

        throw error;
      } finally {
        setLoadingFalse(id);
      }
    },
    [handleNext, messageMap, requestData, setInputMessage, setLoading, setLoadingFalse],
  );

  // // 3. 价格问题处理(可选) get_price_info
  // const priceInfoRequest = useCallback(
  //   async (topic: string, id: number) => {
  //     const messageMapData = messageMap[id];
  //     const tmpStep = EStepNumber.priceInfoRequest;

  //     try {
  //       setLoading(id);
  //       handleNext(id, tmpStep);

  //       const api = '/chat/get_price_info';
  //       const requestParam = {
  //         topic,
  //         model: modelType,
  //       };
  //       setInputMessage(id, requestParam, tmpStep);
  //       const resGetPriceInfo = await post(api, requestParam);
  //       // @ts-ignore
  //       const dataGetPriceInfo = await requestData(resGetPriceInfo.task_id, id);
  //       const dataGetPriceInfoJson = jsonParse(dataGetPriceInfo.data, steps[tmpStep].label, api);

  //       const messageData = messageMapData.data;
  //       messageData[tmpStep] = dataGetPriceInfoJson;
  //       setMessageMap({ ...messageMap, [id]: { ...messageMap[id], data: messageData } });

  //       return dataGetPriceInfoJson;
  //     } catch (error) {
  //       // @ts-ignore
  //       messageMapData.failMessage = error.message || error.error || error;
  //       messageMapData.stepFailedId = tmpStep;
  //       setMessageMap({ ...messageMap, [id]: messageMapData });
  //       throw error;
  //     } finally {
  //       setLoadingFalse(id);
  //     }
  //   },
  //   [handleNext, messageMap, modelType, requestData, setInputMessage, setLoading, setLoadingFalse],
  // );

  // // 3. 价格问题处理(可选) get_price_data
  // const priceDataRequest = useCallback(
  //   async (
  //     topic: string,
  //     search_text: string,
  //     data: {
  //       ['All-time_Related']: boolean;
  //       direction: string;
  //       target_price: number;
  //       ticker: string;
  //       time_end: string;
  //       time_start: string;
  //     },
  //     id: number,
  //   ) => {
  //     const messageMapData = messageMap[id];
  //     const tmpStep = EStepNumber.priceDataRequest;

  //     try {
  //       setLoading(id);
  //       handleNext(id, tmpStep);

  //       const api = '/chat/get_price_data';
  //       const requestParam = {
  //         topic: topic,
  //         search_text: search_text,
  //         ticker: data.ticker,
  //         all_time_related: data['All-time_Related'].toString(),
  //         direction: data.direction,
  //         time_start: data.time_start,
  //       };
  //       setInputMessage(id, requestParam, tmpStep);
  //       const resGetPriceData = await post(api, requestParam);
  //       // @ts-ignore
  //       const dataGetPriceData = await requestData(resGetPriceData.task_id, id);
  //       // const dataGetPriceDataJson = jsonParse(dataGetPriceData.data, '3. 价格问题处理(可选) get_price_data', api);

  //       const messageData = messageMapData.data;
  //       messageData[tmpStep] = dataGetPriceData;
  //       setMessageMap({ ...messageMap, [id]: { ...messageMap[id], data: messageData } });

  //       return dataGetPriceData.data;
  //     } catch (error) {
  //       // @ts-ignore
  //       messageMapData.failMessage = error.message || error.error || error;
  //       messageMapData.stepFailedId = tmpStep;
  //       setMessageMap({ ...messageMap, [id]: messageMapData });
  //       throw error;
  //     } finally {
  //       setLoadingFalse(id);
  //     }
  //   },
  //   [handleNext, messageMap, requestData, setInputMessage, setLoading, setLoadingFalse],
  // );

  // // 3. 价格信息搜索(可选) gm_price_a
  // const gmPriceA = useCallback(
  //   async (params: { topic: string; price_info: string; id: number }) => {
  //     const messageMapData = messageMap[params.id];
  //     const tmpStep = EStepNumber.gmPriceA;

  //     try {
  //       setLoading(params.id);
  //       handleNext(params.id, tmpStep);

  //       const api = '/chat/get_price_a';
  //       const requestParam = {
  //         topic: params.topic,
  //         price_info: params.price_info,
  //         model: modelType,
  //       };
  //       setInputMessage(params.id, requestParam, tmpStep);
  //       const resGetPriceA = await post(api, requestParam);
  //       // @ts-ignore
  //       const dataGetPriceA = await requestData(resGetPriceA.task_id, params.id);
  //       const dataGetPriceAJson = jsonParse(dataGetPriceA.data, steps[tmpStep].label, api);

  //       const messageData = messageMapData.data;
  //       messageData[tmpStep] = dataGetPriceA;
  //       setMessageMap({ ...messageMap, [params.id]: { ...messageMap[params.id], data: messageData } });

  //       return dataGetPriceAJson;
  //     } catch (error) {
  //       // @ts-ignore
  //       messageMapData.failMessage = error.message || error.error || error;
  //       messageMapData.stepFailedId = tmpStep;
  //       setMessageMap({ ...messageMap, [params.id]: messageMapData });

  //       throw error;
  //     } finally {
  //       setLoadingFalse(params.id);
  //     }
  //   },
  //   [handleNext, messageMap, modelType, requestData, setInputMessage, setLoading, setLoadingFalse],
  // );

  // // 3. 价格信息搜索(可选) gm_price_b
  // const gmPriceB = useCallback(
  //   async (params: { topic: string; id: number }) => {
  //     const messageMapData = messageMap[params.id];
  //     const tmpStep = EStepNumber.gmPriceB;

  //     try {
  //       setLoading(params.id);
  //       handleNext(params.id, tmpStep);

  //       const api = '/chat/get_price_b';
  //       const requestParam = {
  //         topic: params.topic,
  //         model: modelType,
  //       };
  //       setInputMessage(params.id, requestParam, tmpStep);
  //       const resGetPriceB = await post(api, requestParam);
  //       // @ts-ignore
  //       const dataGetPriceB = await requestData(resGetPriceB.task_id, params.id);
  //       const dataGetPriceBJson = jsonParse(dataGetPriceB.data, steps[tmpStep].label, api);

  //       const messageData = messageMapData.data;
  //       messageData[tmpStep] = dataGetPriceB;
  //       setMessageMap({ ...messageMap, [params.id]: { ...messageMap[params.id], data: messageData } });

  //       return dataGetPriceBJson;
  //     } catch (error) {
  //       // @ts-ignore
  //       messageMapData.failMessage = error.message || error.error || error;
  //       messageMapData.stepFailedId = tmpStep;
  //       setMessageMap({ ...messageMap, [params.id]: messageMapData });

  //       throw error;
  //     } finally {
  //       setLoadingFalse(params.id);
  //     }
  //   },
  //   [handleNext, messageMap, modelType, requestData, setInputMessage, setLoading, setLoadingFalse],
  // );

  // // 3. 价格问题处理(可选)退出
  // const topicStoppedBecauseOfPrices = useCallback(
  //   (id: number) => {
  //     const messageMapData = messageMap[id];
  //     const tmpStep = EStepNumber.topicStoppedBecauseOfPrices;

  //     messageMapData.failMessage = 'Sorry, it looks like this topic has already passed.';
  //     messageMapData.stepFailedId = tmpStep;
  //     setMessageMap({ ...messageMap, [id]: messageMapData });
  //   },
  //   [messageMap],
  // );

  // 4. 问题类型判别
  // 上述提示词请先并行执行两次，比较两次的结果：如果两次结果 “type” 相同则直接输出并执行下面的逻辑；如果两次结果不同，则进行第三次执行，选取其中重复的那一次结果进行输出并执行后续逻辑：
  const typeRequest = useCallback(
    async (params: { topic: string; searchResult: any; id: number }) => {
      const messageMapData = messageMap[params.id];
      const tmpStep = EStepNumber.typeRequest;

      try {
        setLoading(params.id);
        handleNext(params.id, tmpStep);

        const api = '/chat/get_question_type';
        const requestParam = {
          topic: params.topic,
          search_text: JSON.stringify(params.searchResult),
          model: modelType,
        };
        setInputMessage(params.id, requestParam, tmpStep);
        // 改造：先并行执行两次，比较两次的结果：如果两次结果 “type” 相同则直接输出并执行下面的逻辑；如果两次结果不同，则进行第三次执行，选取其中重复的那一次结果进行输出并执行后续逻辑
        const resGetQuestionTypeOneAndTwo = await Promise.all([post(api, requestParam), post(api, requestParam)]);

        const resultsOneAndTwo = await Promise.all(
          resGetQuestionTypeOneAndTwo.map(async resGetQuestionType => {
            // @ts-ignore
            const dataGetQuestionType = await requestData(resGetQuestionType.task_id, params.id);
            return jsonParse(dataGetQuestionType.data, steps[tmpStep].label, api);
          }),
        );

        const questionResult1 = resultsOneAndTwo[0];
        const questionResult2 = resultsOneAndTwo[1];

        let questionResult = questionResult1;
        if (questionResult1.type === questionResult2.type) {
          questionResult = questionResult1;
        } else {
          const resGetQuestionTypeThree = await post(api, requestParam);
          // @ts-ignore
          const dataGetQuestionTypeThree = await requestData(resGetQuestionTypeThree.task_id, params.id);
          questionResult = jsonParse(dataGetQuestionTypeThree.data, steps[tmpStep].label, api);
        }

        const messageData = messageMapData.data;
        messageData[tmpStep] = questionResult;
        setMessageMap({ ...messageMap, [params.id]: { ...messageMap[params.id], data: messageData } });

        return questionResult;
      } catch (error) {
        // @ts-ignore
        messageMapData.failMessage = error.message || error.error || error;
        messageMapData.stepFailedId = tmpStep;
        setMessageMap({ ...messageMap, [params.id]: messageMapData });

        throw error;
      } finally {
        setLoadingFalse(params.id);
      }
    },
    [handleNext, messageMap, modelType, requestData, setInputMessage, setLoading, setLoadingFalse],
  );

  // 4. 问题类型判别(可选)退出
  const topicStoppedBecauseOfType = useCallback(
    (id: number) => {
      const messageMapData = messageMap[id];
      const tmpStep = EStepNumber.topicStoppedBecauseOfType;

      messageMapData.failMessage = 'We will not go on the process of the topic.';
      messageMapData.stepFailedId = tmpStep;
      setMessageMap({ ...messageMap, [id]: messageMapData });
    },
    [messageMap],
  );

  // 5 信息数据获取(可拓展)
  const sourceDataRequest = useCallback(
    async (params: { topic: string; id: number }) => {
      const messageMapData = messageMap[params.id];
      const tmpStep = EStepNumber.sourceDataRequest;

      try {
        setLoading(params.id);
        handleNext(params.id, tmpStep);

        const api = '/chat/get_data_source';
        const requestParam = {
          topic: params.topic,
          model: modelType,
        };
        setInputMessage(params.id, requestParam, tmpStep);
        const resGetDataSource = await post(api, requestParam);
        // @ts-ignore
        const dataGetDataSource = await requestData(resGetDataSource.task_id, params.id);
        const dataGetDataSourceJson = jsonParse(dataGetDataSource.data, steps[tmpStep].label, api);

        const messageData = messageMapData.data;
        messageData[tmpStep] = dataGetDataSource;
        setMessageMap({ ...messageMap, [params.id]: { ...messageMap[params.id], data: messageData } });

        return dataGetDataSourceJson;
      } catch (error) {
        // @ts-ignore
        messageMapData.failMessage = error.message || error.error || error;
        messageMapData.stepFailedId = tmpStep;
        setMessageMap({ ...messageMap, [params.id]: messageMapData });

        throw error;
      } finally {
        setLoadingFalse(params.id);
      }
    },
    [handleNext, messageMap, modelType, requestData, setInputMessage, setLoading, setLoadingFalse],
  );

  // 5. 信息数据获取(退出)
  const topicStoppedBecauseOfSourceData = useCallback(
    (id: number) => {
      const messageMapData = messageMap[id];
      const tmpStep = EStepNumber.topicStoppedBecauseOfSourceData;

      messageMapData.failMessage = 'Sorry, we are currently unable to resolve related issues.';
      messageMapData.stepFailedId = tmpStep;
      setMessageMap({ ...messageMap, [id]: messageMapData });
    },
    [messageMap],
  );

  // 5. 信息数据获取(搜索 with domain)
  const sourceDataTavilySearchRequest = useCallback(
    async (
      keyResult: any,
      id: number,
      include_domain: EEncludedDomains.Youtube | EEncludedDomains.Twitter | EEncludedDomains.GitHub,
    ) => {
      const messageMapData = messageMap[id];
      const tmpStep = EStepNumber.sourceDataTavilySearchRequest;

      try {
        setLoading(id);
        handleNext(id, tmpStep);

        const api = '/tavily/search';
        const requestParam = {
          query: Array.isArray(keyResult?.keys1) ? keyResult?.keys1.join(' ') : keyResult?.keys1,
          max_results: 10,
          include_domains: [encludedDomainsMap[include_domain]],
        };
        setInputMessage(id, requestParam, tmpStep);
        const resSourceDataTavilySearch = await post(api, requestParam);
        // @ts-ignore
        const dataSourceDataTavilySearch = await requestData(resSourceDataTavilySearch.task_id, id);

        const messageData = messageMapData.data;
        messageData[tmpStep] = dataSourceDataTavilySearch;
        setMessageMap({ ...messageMap, [id]: { ...messageMap[id], data: messageData } });

        return dataSourceDataTavilySearch;
      } catch (error) {
        // @ts-ignore
        messageMapData.failMessage = error.message || error.error || error;
        messageMapData.stepFailedId = tmpStep;
        setMessageMap({ ...messageMap, [id]: messageMapData });

        throw error;
      } finally {
        setLoadingFalse(id);
      }
    },
    [handleNext, messageMap, requestData, setInputMessage, setLoading, setLoadingFalse],
  );

  // 5 信息数据获取(获取精准链接)
  const sourceDataGetLinkRequest = useCallback(
    async (params: {
      searchResult: any;
      id: number;
      include_domain: EEncludedDomains.Youtube | EEncludedDomains.Twitter | EEncludedDomains.GitHub;
    }) => {
      const messageMapData = messageMap[params.id];
      const tmpStep = EStepNumber.sourceDataGetLinkRequest;

      try {
        setLoading(params.id);
        handleNext(params.id, tmpStep);

        const api = encludedGetLinkApisMap;
        const requestParam = {
          search_text: JSON.stringify(params.searchResult),
          model: modelType,
        };
        setInputMessage(params.id, requestParam, tmpStep);
        const resSourceDataGetLink = await post(api[params.include_domain], requestParam);
        // @ts-ignore
        const dataSourceDataGetLink = await requestData(resSourceDataGetLink.task_id, params.id);
        const dataSourceDataGetLinkJson = jsonParse(
          dataSourceDataGetLink.data,
          steps[tmpStep].label,
          api[params.include_domain],
        );

        const messageData = messageMapData.data;
        messageData[tmpStep] = dataSourceDataGetLink;
        setMessageMap({ ...messageMap, [params.id]: { ...messageMap[params.id], data: messageData } });

        return dataSourceDataGetLinkJson;
      } catch (error) {
        // @ts-ignore
        messageMapData.failMessage = error.message || error.error || error;
        messageMapData.stepFailedId = tmpStep;
        setMessageMap({ ...messageMap, [params.id]: messageMapData });

        throw error;
      } finally {
        setLoadingFalse(params.id);
      }
    },
    [handleNext, messageMap, modelType, requestData, setInputMessage, setLoading, setLoadingFalse],
  );

  // 5 信息数据获取(获取数据)
  const sourceDataGetLinkDataRequest = useCallback(
    async (params: {
      url: any;
      id: number;
      include_domain: EEncludedDomains.Youtube | EEncludedDomains.Twitter | EEncludedDomains.GitHub;
    }) => {
      const messageMapData = messageMap[params.id];
      const tmpStep = EStepNumber.sourceDataGetLinkDataRequest;

      try {
        setLoading(params.id);
        handleNext(params.id, tmpStep);

        const api = encludedGetLinkDataApisMap;

        const requestParam = {
          url: params.url,
          model: modelType,
        };
        setInputMessage(params.id, requestParam, tmpStep);
        const resSourceDataGetLinkData = await post(api[params.include_domain], requestParam);
        // @ts-ignore
        const dataSourceDataGetLinkData = await requestData(resSourceDataGetLinkData.task_id, params.id);

        const messageData = messageMapData.data;
        messageData[tmpStep] = dataSourceDataGetLinkData;
        setMessageMap({ ...messageMap, [params.id]: { ...messageMap[params.id], data: messageData } });

        return dataSourceDataGetLinkData.data;
      } catch (error) {
        // @ts-ignore
        messageMapData.failMessage = error.message || error.error || error;
        messageMapData.stepFailedId = tmpStep;
        setMessageMap({ ...messageMap, [params.id]: messageMapData });

        throw error;
      } finally {
        setLoadingFalse(params.id);
      }
    },
    [handleNext, messageMap, modelType, requestData, setInputMessage, setLoading, setLoadingFalse],
  );

  // 5 信息数据获取(get_network_a)
  const sourceDataGMNetworkARequest = useCallback(
    async (params: { topic: any; id: number; url: string }) => {
      const messageMapData = messageMap[params.id];
      const tmpStep = EStepNumber.sourceDataGMNetworkARequest;

      try {
        setLoading(params.id);
        handleNext(params.id, tmpStep);

        const api = '/chat/get_network_a';

        const requestParam = {
          url: params.url,
          topic: params.topic,
          model: modelType,
        };
        setInputMessage(params.id, requestParam, tmpStep);
        const resSourceDataGMNetworkA = await post(api, requestParam);
        // @ts-ignore
        const dataSourceDataGMNetworkA = await requestData(resSourceDataGMNetworkA.task_id, params.id);
        const dataSourceDataGMNetworkAJson = jsonParse(dataSourceDataGMNetworkA.data, steps[tmpStep].label, api);

        const messageData = messageMapData.data;
        messageData[tmpStep] = dataSourceDataGMNetworkA;
        setMessageMap({ ...messageMap, [params.id]: { ...messageMap[params.id], data: messageData } });

        return dataSourceDataGMNetworkAJson;
      } catch (error) {
        // @ts-ignore
        messageMapData.failMessage = error.message || error.error || error;
        messageMapData.stepFailedId = tmpStep;
        setMessageMap({ ...messageMap, [params.id]: messageMapData });

        throw error;
      } finally {
        setLoadingFalse(params.id);
      }
    },
    [handleNext, messageMap, modelType, requestData, setInputMessage, setLoading, setLoadingFalse],
  );

  // 5. 信息数据获取(退出)
  const topicStoppedBecauseOfSourceDataGetLinkData = useCallback(
    (id: number) => {
      const messageMapData = messageMap[id];
      const tmpStep = EStepNumber.topicStoppedBecauseOfSourceDataGetLinkData;

      messageMapData.failMessage = 'Sorry, it looks like this topic has already passed.';
      messageMapData.stepFailedId = tmpStep;
      setMessageMap({ ...messageMap, [id]: messageMapData });
    },
    [messageMap],
  );

  // 6. 二次优化问题(get_time_two)
  const timeResultRequest = useCallback(
    async (params: { search_text: string; topic: string; id: number; date_question: any }) => {
      const messageMapData = messageMap[params.id];
      const tmpStep = EStepNumber.timeResultRequest;

      try {
        setLoading(params.id);
        handleNext(params.id, tmpStep);

        const api = '/chat/get_time_two';
        const requestParam = {
          date_question: JSON.stringify(params.date_question.data.results.map((item: any) => item.content)),
          search_text: params.search_text,
          topic: params.topic,
          model: modelType,
        };
        setInputMessage(params.id, requestParam, tmpStep);
        const resGetTimeTwo = await post(api, requestParam);
        // @ts-ignore
        const dataGetTimeTwo = await requestData(resGetTimeTwo.task_id, params.id);

        const messageData = messageMapData.data;
        messageData[tmpStep] = dataGetTimeTwo;
        setMessageMap({ ...messageMap, [params.id]: { ...messageMap[params.id], data: messageData } });

        return dataGetTimeTwo.data;
      } catch (error) {
        // @ts-ignore
        messageMapData.failMessage = error.message || error.error || error;
        messageMapData.stepFailedId = tmpStep;
        setMessageMap({ ...messageMap, [params.id]: messageMapData });

        throw error;
      } finally {
        setLoadingFalse(params.id);
      }
    },
    [handleNext, messageMap, modelType, requestData, setInputMessage, setLoading, setLoadingFalse],
  );

  // 7.1 第三次搜索(自然语言)
  // 根据 6 的结果的 “revised_topic” 直接搜索得到 10 条结果
  const thirdTavilySearchRequest = useCallback(
    async ({ topic, id }: { topic: string; id: number }) => {
      const messageMapData = messageMap[id];
      const tmpStep = EStepNumber.thirdTavilySearchRequest;

      try {
        setLoading(id);
        handleNext(id, tmpStep);

        const api = '/tavily/search';
        const requestParam = {
          query: topic,
          max_results: 10,
        };
        setInputMessage(id, requestParam, tmpStep);
        const resTavilySearch = await post(api, requestParam);
        // @ts-ignore
        const dataTavilySearch = await requestData(resTavilySearch.task_id, id);

        const messageData = messageMapData.data;
        messageData[tmpStep] = dataTavilySearch;
        setMessageMap({ ...messageMap, [id]: { ...messageMap[id], data: messageData } });

        return dataTavilySearch;
      } catch (error) {
        // @ts-ignore
        messageMapData.failMessage = error.message || error.error || error;
        messageMapData.stepFailedId = tmpStep;
        setMessageMap({ ...messageMap, [id]: messageMapData });

        throw error;
      } finally {
        setLoadingFalse(id);
      }
    },
    [handleNext, messageMap, requestData, setInputMessage, setLoading, setLoadingFalse],
  );

  // 7.2 事实判断
  const factRequest = useCallback(
    async ({ topic, id, searchText }: { topic: string; id: number; searchText: string }) => {
      const messageMapData = messageMap[id];
      const tmpStep = EStepNumber.factRequest;

      try {
        setLoading(id);
        handleNext(id, tmpStep);

        const api = '/chat/fact_check';
        const requestParam = {
          topic,
          search_text: searchText,
          model: modelType,
        };
        setInputMessage(id, requestParam, tmpStep);
        const resFactCheck = await post(api, requestParam);
        // @ts-ignore
        const dataFactCheck = await requestData(resFactCheck.task_id, id);
        const dataFactCheckJson = jsonParse(dataFactCheck.data, steps[tmpStep].label, api);

        const messageData = messageMapData.data;
        messageData[tmpStep] = dataFactCheckJson;
        setMessageMap({ ...messageMap, [id]: { ...messageMap[id], data: messageData } });

        return dataFactCheckJson;
      } catch (error) {
        // @ts-ignore
        messageMapData.failMessage = error.message || error.error || error;
        messageMapData.stepFailedId = tmpStep;
        setMessageMap({ ...messageMap, [id]: messageMapData });

        throw error;
      } finally {
        setLoadingFalse(id);
      }
    },
    [handleNext, messageMap, modelType, requestData, setInputMessage, setLoading, setLoadingFalse],
  );

  // 7.2 事实判断(可选)退出
  const topicStoppedBecauseOfFact = useCallback(
    (id: number) => {
      const messageMapData = messageMap[id];
      const tmpStep = EStepNumber.topicStoppedBecauseOfFact;

      messageMapData.failMessage = 'We will not go on the process of the topic.';
      messageMapData.stepFailedId = tmpStep;
      setMessageMap({ ...messageMap, [id]: messageMapData });
    },
    [messageMap],
  );

  // 7.3 概率判断
  const possibilityRequest = useCallback(
    async ({ topic, id, searchText }: { topic: string; id: number; searchText: string }) => {
      const messageMapData = messageMap[id];
      const tmpStep = EStepNumber.possibilityRequest;

      try {
        setLoading(id);
        handleNext(id, tmpStep);

        const api = '/chat/get_possibility';
        const requestParam = {
          topic,
          search_text: searchText,
          model: modelType,
        };
        setInputMessage(id, requestParam, tmpStep);
        const resGetPossibility = await post(api, requestParam);
        // @ts-ignore
        const dataGetPossibility = await requestData(resGetPossibility.task_id, id);
        const dataGetPossibilityJson = jsonParse(dataGetPossibility.data, steps[tmpStep].label, api);

        const messageData = messageMapData.data;
        messageData[tmpStep] = dataGetPossibilityJson;
        setMessageMap({ ...messageMap, [id]: { ...messageMap[id], data: messageData } });

        return dataGetPossibilityJson;
      } catch (error) {
        // @ts-ignore
        messageMapData.failMessage = error.message || error.error || error;
        messageMapData.stepFailedId = tmpStep;
        setMessageMap({ ...messageMap, [id]: messageMapData });

        throw error;
      } finally {
        setLoadingFalse(id);
      }
    },
    [handleNext, messageMap, modelType, requestData, setInputMessage, setLoading, setLoadingFalse],
  );

  // 7.3 概率判断输出
  const resultAccordingToPossibility = useCallback(
    (id: number, msg: string, isFailed: boolean) => {
      const messageMapData = messageMap[id];
      const tmpStep = EStepNumber.resultAccordingToPossibility;

      if (isFailed) {
        messageMapData.failMessage = msg;
        messageMapData.stepFailedId = tmpStep;
        setMessageMap({ ...messageMap, [id]: messageMapData });
      } else {
        const messageData = messageMapData.data;
        messageData[tmpStep] = msg;
        setMessageMap({ ...messageMap, [id]: { ...messageMap[id], data: messageData } });
      }
    },
    [messageMap],
  );

  // 8. 市场生成
  const marketRulesRequest = useCallback(
    async (topic: string, id: number) => {
      const messageMapData = messageMap[id];
      const tmpStep = EStepNumber.marketRulesRequest;

      try {
        setLoading(id);
        handleNext(id, tmpStep);

        const requestParam = {
          topic,
          model: modelType,
        };
        setInputMessage(id, requestParam, tmpStep);
        const resGetMarketRules = await post('/chat/get_market_rules', requestParam);
        // @ts-ignore
        const dataGetMarketRules = await requestData(resGetMarketRules.task_id, id);

        const messageData = messageMapData.data;
        messageData[tmpStep] = dataGetMarketRules;
        setMessageMap({ ...messageMap, [id]: { ...messageMap[id], data: messageData } });

        return dataGetMarketRules;
      } catch (error) {
        // @ts-ignore
        messageMapData.failMessage = error.message || error.error || error;
        messageMapData.stepFailedId = tmpStep;
        setMessageMap({ ...messageMap, [id]: messageMapData });

        throw error;
      } finally {
        setLoadingFalse(id);
      }
    },
    [handleNext, messageMap, modelType, requestData, setInputMessage, setLoading, setLoadingFalse],
  );

  // 清除所有数据
  const clearAll = useCallback(() => {
    for (const id in messageMap) {
      const messageMapData = messageMap[id];
      messageMapData.failMessage = '';
      messageMapData.stepFailedId = -1;
      messageMapData.data = [];
      messageMapData.activeStep = 0;
      messageMapData.inputMessage = [];
    }
    setMessageMap({ ...messageMap });
  }, [messageMap]);

  const workflowCall = useCallback(
    async (id: number, event: React.FormEvent) => {
      const formData = new FormData(event.target as HTMLFormElement);
      const clubName = formData.get('clubName');

      try {
        const translateResult = await translateRequest(clubName as string, id);

        const firstTavilySearchResult = await requestTargetData(
          () => firstTavilySearchRequest(id, translateResult),
          res => res && res.data && res.data.results && res.data.results.length > 0,
        );

        const firstJudgmentGetDataResult = await firstJudgmentGetDataRequest(id, translateResult);

        const firstJudgmentEntitiesTavilySearchResult = await requestTargetData(
          () => firstJudgmentEntitiesTavilySearchRequest(firstJudgmentGetDataResult.entities, id),
          res => res && res.data && res.data.results && res.data.results.length > 0,
        );

        const firstJudgmentIfContainsResult = await firstJudgmentIfContainsRequest(
          id,
          firstJudgmentGetDataResult.suspected_fictional_entities,
          [
            ...firstTavilySearchResult.data.results.map((item: any) => item.content),
            ...firstJudgmentEntitiesTavilySearchResult.data.results.map((item: any) => item.content),
          ],
        );

        if (!firstJudgmentIfContainsResult || LocalStringCompare(firstJudgmentIfContainsResult.if_contains, 'Yes')) {
          topicStoppedBecauseOfFirstJudgment(id);

          return;
        }

        const firstJudgmentDependOnValueResult = await firstJudgmentDependOnValueRequest(
          id,
          translateResult,
          firstTavilySearchResult,
        );

        if (!firstJudgmentDependOnValueResult || LocalStringCompare(firstJudgmentDependOnValueResult.If_Worth, 'No')) {
          topicStoppedBecauseOfFirstJudgment(id);

          return;
        }

        const getQuestionResult = await getQuestionRequest(id, translateResult, firstTavilySearchResult);

        const keyResult = await getKeyRequest(getQuestionResult.topic, id);
        if (!keyResult || !keyResult.keys1) {
          return;
        }

        // const isPriceBothRelated =
        //   LocalIsBooleanTrue(keyResult.PriceRelated) && LocalIsBooleanTrue(keyResult.CryptoRelated);

        const secondTavilySearchResult = await requestTargetData(
          () => secondTavilySearchRequest(keyResult, id),
          res => res && res.data && res.data.results && res.data.results.length > 0,
        );

        const secondTavilySearchOfDateQuestionResult = await requestTargetData(
          () => secondTavilySearchOfDateQuestionRequest(getQuestionResult.date_question, id),
          res => res && res.data && res.data.results && res.data.results.length > 0,
        );

        if (secondTavilySearchResult?.data.results.length === 0) {
          return;
        }

        // 如果 JSON 中 "PriceRelated" 和 “CryptoRelated” 都为 True, 则进行到 3
        // if (isPriceBothRelated) {
        //   const priceInfoResult = await priceInfoRequest(getQuestionResult.topic, id);

        //   let tmpPriceData: number | null = null;
        //   if (LocalIsBooleanTrue(priceInfoResult['All-time_Related'])) {
        //     // 如果 JSON 中返回的 "All-time_Related" 为 True:
        //     //  "direction" 为 higher: 获取 "time_start" 到当前时间的最高价格
        //     //  "direction" 为 lower: 获取 "time_start" 到当前时间的最低价格
        //     const priceDataResult = await priceDataRequest(
        //       getQuestionResult.topic,
        //       JSON.stringify(secondTavilySearchResult.data?.results),
        //       priceInfoResult,
        //       id,
        //     );

        //     tmpPriceData = Number(priceDataResult.price);
        //   } else {
        //     //如果 JSON 中返回的 "All-time_Related" 为 False:
        //     //  "direction" 为 higher: 获取 "time_start" 到当前时间的最高价格
        //     //  "direction" 为 lower: 获取 "time_start" 到当前时间的最低价格
        //     const priceDataResult = await priceDataRequest(
        //       getQuestionResult.topic,
        //       JSON.stringify(secondTavilySearchResult.data?.results),
        //       priceInfoResult,
        //       id,
        //     );

        //     tmpPriceData = Number(priceDataResult.price);
        //   }

        //   if (typeof priceInfoResult.target_price !== 'number' && typeof priceInfoResult.target_price !== 'string') {
        //     if (LocalIsBooleanTrue(priceInfoResult['All-time_Related'])) {
        //       await gmPriceA({ topic: getQuestionResult.topic, price_info: JSON.stringify(priceInfoResult), id });
        //     } else {
        //       await gmPriceB({ topic: getQuestionResult.topic, id });
        //     }
        //   } else {
        //     if (LocalIsBooleanTrue(priceInfoResult['All-time_Related'])) {
        //       // 如果 JSON 中返回的 "All-time_Related" 为 True:

        //       // "direction" 为 higher: 生成市场，执行提示词 gm_price_a
        //       if (priceInfoResult.direction === 'higher') {
        //         await gmPriceA({ topic: getQuestionResult.topic, price_info: JSON.stringify(priceInfoResult), id });
        //       }

        //       // "direction" 为 lower: 生成市场，执行提示词 gm_price_a
        //       if (priceInfoResult.direction === 'lower') {
        //         await gmPriceA({ topic: getQuestionResult.topic, price_info: JSON.stringify(priceInfoResult), id });
        //       }
        //     } else {
        //       //如果 JSON 中返回的 "All-time_Related" 为 False:

        //       // "direction" 为 higher:
        //       if (priceInfoResult.direction === 'higher' && !!tmpPriceData) {
        //         if (tmpPriceData >= priceInfoResult.target_price) {
        //           //  获取到的最高价格高于或等于 "target_price" 则不生成市场，返回 “Sorry, it looks like this topic has already passed.”
        //           topicStoppedBecauseOfPrices(id);
        //           return;
        //         } else {
        //           // 低于则生成市场，执行提示词 gm_price_b
        //           await gmPriceB({ topic: getQuestionResult.topic, id });
        //         }
        //       }

        //       // "direction" 为 lower:
        //       //  高于则生成市场，执行提示词 gm_price_b
        //       if (priceInfoResult.direction === 'lower' && !!tmpPriceData) {
        //         if (tmpPriceData <= priceInfoResult.target_price) {
        //           // 获取到的最低价格低于或等于 "target_price" 则不生成市场，返回 “Sorry, it looks like this topic has already passed.”
        //           topicStoppedBecauseOfPrices(id);

        //           return;
        //         } else {
        //           // 高于则生成市场，执行提示词 gm_price_b
        //           await gmPriceB({ topic: getQuestionResult.topic, id });
        //         }
        //       }
        //     }
        //   }
        // }

        const questionType = await typeRequest({
          topic: getQuestionResult.topic,
          searchResult: secondTavilySearchResult.data?.results,
          id,
        });

        // 如果 JSON 中返回的 “type” 为 3，则进行到 5
        if (LocalNumberMaybeStringCompare(questionType.type, EQuestionType.Three)) {
          const sourceDataResult: any = await sourceDataRequest({
            topic: getQuestionResult.topic,
            id,
          });

          let sourceDataResultType: Exclude<EEncludedDomains, EEncludedDomains.Others> | undefined;
          switch (sourceDataResult.type) {
            case '1':
              sourceDataResultType = EEncludedDomains.Youtube;
              break;

            case '2':
              sourceDataResultType = EEncludedDomains.Twitter;
              break;

            case '3':
              sourceDataResultType = EEncludedDomains.GitHub;
              break;

            default:
              break;
          }

          const sourceDataResultMarkNumber = Number(sourceDataResult.mark_number);

          if (
            sourceDataResultType === EEncludedDomains.Youtube ||
            sourceDataResultType === EEncludedDomains.Twitter ||
            sourceDataResultType === EEncludedDomains.GitHub
          ) {
            const sourceDataTavilySearchResult = await requestTargetData(
              () => sourceDataTavilySearchRequest(keyResult, id, sourceDataResultType),
              res => res && res.data && res.data.results && res.data.results.length > 0,
            );

            const sourceDataGetLinkResult: any = await sourceDataGetLinkRequest({
              searchResult: sourceDataTavilySearchResult.data?.results,
              id,
              include_domain: sourceDataResultType,
            });

            const sourceDataGetLinkDataResult: any = await sourceDataGetLinkDataRequest({
              url: sourceDataGetLinkResult?.URL,
              id,
              include_domain: sourceDataResultType,
            });

            if (sourceDataGetLinkDataResult.stars >= sourceDataResultMarkNumber) {
              topicStoppedBecauseOfSourceDataGetLinkData(id);

              return;
            }

            const sourceDataGMNetworkAResult: any = await sourceDataGMNetworkARequest({
              url: sourceDataGetLinkResult?.URL,
              topic: getQuestionResult.topic,
              id,
            });

            await marketRulesRequest(sourceDataGMNetworkAResult.title, id);
          } else if (sourceDataResultType === EEncludedDomains.Quit) {
            topicStoppedBecauseOfSourceData(id);
          }

          return;
        }

        // 如果 JSON 中返回的 “type” 为 1 或者 2，则进行到 6
        if (
          LocalNumberMaybeStringCompare(questionType.type, EQuestionType.One) ||
          LocalNumberMaybeStringCompare(questionType.type, EQuestionType.Two)
        ) {
          const timeResult = await timeResultRequest({
            search_text: JSON.stringify(secondTavilySearchResult.data?.results),
            date_question: secondTavilySearchOfDateQuestionResult,
            topic: getQuestionResult.topic,
            id: id,
          });

          if (!timeResult) {
            return;
          }

          const timeResultTopic = extractParseJson(timeResult).revised_topic;

          const thirdTavilySearchResult = await requestTargetData(
            () => thirdTavilySearchRequest({ id, topic: timeResultTopic }),
            res => res && res.data && res.data.results && res.data.results.length > 0,
          );

          const thirdTavilySearchResultText = JSON.stringify(thirdTavilySearchResult.data);

          const factResult = await factRequest({
            topic: timeResultTopic,
            id: id,
            searchText: thirdTavilySearchResultText,
          });

          //根据上面的 JSON 结果中的 “evaluation_1” , “evaluation_2” 和 “evaluation_3” 进行判断：
          // 其中有一个为 "Yes" 或者都为 "Yes" 则输出 "justification" 且不进行后续进程
          // 都为 "No" 则输出 "justification" 并进行后续进程
          if (
            LocalStringCompare(factResult.evaluation_1, 'Yes') ||
            LocalStringCompare(factResult.evaluation_2, 'Yes') ||
            LocalStringCompare(factResult.evaluation_3, 'Yes')
          ) {
            topicStoppedBecauseOfFact(id);
            return;
          }

          const possibilityResult = await possibilityRequest({
            topic: timeResultTopic,
            id: id,
            searchText: thirdTavilySearchResultText,
          });
          const possibilityResultNumber = possibilityResult.number;
          console.log('possibilityResultNumber:', possibilityResultNumber);

          if (LocalNumberMaybeStringCompare(possibilityResultNumber, 1)) {
            resultAccordingToPossibility(
              id,
              'This topic is very likely to happen, there is no value to set up a prediction market of it.',
              true,
            );

            return;
          }

          if (LocalNumberMaybeStringCompare(possibilityResultNumber, 4)) {
            resultAccordingToPossibility(
              id,
              'This topic has too little possibility to happen, there is no value to set up a prediction market of it.',
              true,
            );

            return;
          }

          if (
            LocalNumberMaybeStringCompare(possibilityResultNumber, 2) ||
            LocalNumberMaybeStringCompare(possibilityResultNumber, 3)
          ) {
            resultAccordingToPossibility(
              id,
              'This topic is talking about something likely to happen in the future',
              false,
            );

            await marketRulesRequest(timeResult, id);
          }

          return;
        }

        // 如果 JSON 中返回的 “type” 为 4 或者 5，则直接返回对应 "type_description"
        if (
          LocalNumberMaybeStringCompare(questionType.type, EQuestionType.Four) ||
          LocalNumberMaybeStringCompare(questionType.type, EQuestionType.Five)
        ) {
          topicStoppedBecauseOfType(id);

          return;
        }
      } catch (error) {
        console.error(error);
      }
    },
    [
      translateRequest,
      requestTargetData,
      firstJudgmentGetDataRequest,
      firstJudgmentIfContainsRequest,
      firstJudgmentDependOnValueRequest,
      getQuestionRequest,
      getKeyRequest,
      typeRequest,
      firstTavilySearchRequest,
      firstJudgmentEntitiesTavilySearchRequest,
      topicStoppedBecauseOfFirstJudgment,
      secondTavilySearchRequest,
      secondTavilySearchOfDateQuestionRequest,
      sourceDataRequest,
      sourceDataGetLinkRequest,
      sourceDataGetLinkDataRequest,
      sourceDataGMNetworkARequest,
      marketRulesRequest,
      sourceDataTavilySearchRequest,
      topicStoppedBecauseOfSourceDataGetLinkData,
      topicStoppedBecauseOfSourceData,
      timeResultRequest,
      factRequest,
      possibilityRequest,
      thirdTavilySearchRequest,
      topicStoppedBecauseOfFact,
      resultAccordingToPossibility,
      topicStoppedBecauseOfType,
    ],
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      clearAll();
      let time = 0;

      for (let i = 0; i < 2; i++) {
        time += 2000;
        setTimeout(() => {
          workflowCall(i, event);
        }, time);
      }
    },
    [clearAll, workflowCall],
  );

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        console.log('Text copied to clipboard');
      })
      .catch(err => {
        console.error('Could not copy text: ', err);
      });
  }, []);

  return (
    <div className='flex h-screen items-center bg-gray-200 '>
      <div className='flex items-center  gap-12 overflow-x-auto'>
        <form className='flex flex-col gap-4 bg-white rounded-md shadow-md min-w-[400px] p-6' onSubmit={handleSubmit}>
          <h1 className='text-2xl font-bold text-center'>Create a New Club</h1>
          <div className='flex flex-col gap-2'>
            <label className='text-sm text-light' htmlFor='clubName'>
              Prediction question
            </label>
            <input
              type='text'
              name='clubName'
              placeholder='please enter club name'
              className='border border-gray-300 rounded-md p-2 text-sm focus:border-primary-main'
            />
          </div>
          <div className='flex flex-col gap-2'>
            <label className='text-sm text-light' htmlFor='clubDescription'>
              Club Description
            </label>
            <textarea
              name='clubDescription'
              placeholder='please enter club description'
              className='border border-gray-300 h-[100px] rounded-md p-2 text-sm focus:outline-none focus:ring-primary-DEFAULT focus:border-primary-DEFAULT'
            />
          </div>
          <div>
            <label className='text-sm text-light' htmlFor='clubDescription'>
              Prediction date
            </label>
            <DatePicker className='w-full' value={predictionDate} onChange={newValue => setPredictionDate(newValue)} />
          </div>
          <InputLabel>Model</InputLabel>
          <Select
            labelId='demo-simple-select-label'
            id='demo-simple-select'
            value={modelType}
            label='Age'
            onChange={e => setModel(e.target.value as 'openai' | 'deep')}
          >
            <MenuItem value={'openai'}>openai </MenuItem>
            <MenuItem value={'deep'}>deepseek</MenuItem>
          </Select>
          <Button type='submit' variant='contained' color='primary' className='w-full text-white'>
            Submit
          </Button>
        </form>
        <div className='flex  gap-4  w-[4000px] items-center'>
          {Object.values(messageMap).map((messageData, messageIndex) => (
            <Box
              sx={{ maxWidth: 600 }}
              className='bg-white rounded-md shadow-md p-4 h-[80vh] overflow-y-auto'
              key={messageIndex.toString()}
            >
              <Stepper
                activeStep={messageData.activeStep}
                orientation='vertical'
                className='w-[560px]'
                nonLinear={true}
              >
                {steps.map((step, index) => (
                  <Step key={step.label}>
                    <StepLabel
                      optional={
                        index === steps.length - 1 ? <Typography variant='caption'>Last step</Typography> : null
                      }
                      error={index === messageData.stepFailedId}
                    >
                      {step.label}
                    </StepLabel>
                    <Box>
                      {messageData.inputMessage[index] ? (
                        <div className='flex items-center w-[530px] justify-between gap-2 mb-2'>
                          <div className='text-sm text-grey-700 font-bold'>Input:</div>
                          <FullscreenIcon
                            className='w-[20px] h-[20px] cursor-pointer'
                            onClick={() => handleOpenDialog(messageData.inputMessage[index], 'json')}
                          />
                        </div>
                      ) : null}
                      {messageData.inputMessage[index] ? (
                        <div className='w-[530px] max-h-[150px] bg-gray-100 rounded-md p-2 overflow-y-auto mb-2'>
                          <ReactJson src={messageData.inputMessage[index]} collapsed={step.inputCollapsed} />
                        </div>
                      ) : null}
                      {messageData.data[index] && index < preConfigIndex ? (
                        <div className='flex flex-col gap-2'>
                          <div className='flex items-center w-[530px] justify-between gap-2 mb-2'>
                            <div className='text-sm text-grey-700 font-bold'>Output:</div>
                            <FullscreenIcon
                              className='w-[20px] h-[20px] cursor-pointer'
                              onClick={() => handleOpenDialog(messageData.data[index], 'json')}
                            />
                          </div>
                          <div className='w-[530px] max-h-[300px] bg-gray-100 rounded-md p-2 overflow-y-auto'>
                            <ReactJson
                              src={{
                                data: messageData.data[index],
                              }}
                              collapsed={step.outputCollapsed}
                            />
                          </div>
                        </div>
                      ) : null}

                      {messageData.data[index] && index >= preConfigIndex ? (
                        <div>
                          <div className='flex justify-between items-center w-[530px]'>
                            <div className='text-sm text-grey-700 font-bold'>Output:</div>
                            <div className='flex items-center gap-2 mb-2'>
                              <FullscreenIcon
                                className='w-[20px] h-[20px] cursor-pointer'
                                onClick={() => handleOpenDialog(messageData.data[index], 'pre')}
                              />
                              <Button
                                className='w-[50px]'
                                variant='contained'
                                color='primary'
                                size='small'
                                sx={{ textTransform: 'none' }}
                                onClick={() => copyToClipboard(messageData.data[index])}
                              >
                                Copy
                              </Button>
                            </div>
                          </div>
                          <pre className='text-sm w-[530px] h-[270px] bg-gray-100 rounded-md p-2 overflow-y-auto'>
                            {messageData.data[index]?.toString()}
                          </pre>
                        </div>
                      ) : null}
                      {index === messageData.activeStep ? (
                        <Box sx={{ mb: 2 }}>
                          {messageData.isLoading ? <CircularProgress /> : null}
                          {messageData.failMessage && (
                            <div className='text-red-500 text-sm w-[400px] h-m-[70px] overflow-y-auto'>
                              {messageData.failMessage}
                            </div>
                          )}
                        </Box>
                      ) : null}
                    </Box>
                  </Step>
                ))}
              </Stepper>
            </Box>
          ))}
        </div>
      </div>
      <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth='lg'>
        <DialogTitle>
          Output Details
          <IconButton
            aria-label='close'
            onClick={handleCloseDialog}
            sx={{
              position: 'absolute',
              right: 8,
              top: 8,
              color: theme => theme.palette.grey[500],
            }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {dialogUseType === 'pre' ? (
            <pre className='text-sm '>{dialogContent}</pre>
          ) : (
            <ReactJson src={dialogContent} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
