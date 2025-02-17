/* eslint-disable @typescript-eslint/no-explicit-any */
export interface RequestOptions extends RequestInit {
  headers?: Record<string, string>;
  body?: any;
}

export type TReponse = { status: string; message: string; data: any; error: string };

export const request = async (url: string, options: RequestOptions = {}) => {
  const { headers, body, ...restOptions } = options;
  // 是http://34.126.166.140:8000/chat/get_key
  // http://34.126.166.140:8080
  const baseUrl = 'https://agent.bubbly.finance/v1.3';

  const defaultHeaders = {
    'Content-Type': 'application/json',
    ...headers,
  };

  const model = localStorage.getItem('model');

  if (model && model !== 'openai' && restOptions.method === 'POST') {
    // 放到data中
    body['model'] = model;
  }

  const response = await fetch(baseUrl + url, {
    ...restOptions,
    headers: defaultHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Request failed');
  }

  const res = (await response.json()) as TReponse;

  // 如果返回的状态是failed，则抛出错误
  if (res.status === 'failed') {
    throw new Error(res.data || res.error);
  }

  return res;
};

export const get = (url: string, options?: RequestOptions) => {
  return request(url, { ...options, method: 'GET' });
};

export const post = (url: string, body: any, options?: RequestOptions) => {
  return request(url, { ...options, method: 'POST', body });
};

export const put = (url: string, body: any, options?: RequestOptions) => {
  return request(url, { ...options, method: 'PUT', body });
};
