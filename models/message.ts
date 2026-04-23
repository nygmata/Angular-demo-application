export interface IMessage {
  chatId: string;
  questionId: string;
  type: string;
  message: string;
  date: Date;
  isPortfolio?: boolean;
  portfolioData?: any;
}

export interface IChatStatus {
  chatId: string;
  questionId: string;
  status: string;
  response: string;
  exploreRequest: any;
}

export interface IChatAllowed {
  message: string;
  chatId: string;
}

export interface IChatContextResponse {
  chatId: string;
  questionId: string;
  isSupport: boolean;
  mainContext: IContextInfo | undefined;
  otherOptions: IContextInfo[];
  exploreRequest: any;
  exploreType: any;
  intentType: number;
}

export interface IContextInfo {
  payload: string;
}

export interface IReceptionInfo {
  receptionId: number;
  reception: string;
}

export interface IPortfolioBrief {
  id: number;
  name: string;
  dateCreated: Date;
  companyId: number;
  details?: any;
  isOpen?: boolean;
}
