/* eslint-disable @typescript-eslint/no-explicit-any */
export interface MessageData {
  // loading 状态
  isLoading: boolean;
  // 返回数据
  data: any[];
  // 输入内容
  inputMessage: any[];
  // 当前步骤
  activeStep: number;
  // 失败步骤
  stepFailedId: number;
  // 失败信息
  failMessage: string;
}
