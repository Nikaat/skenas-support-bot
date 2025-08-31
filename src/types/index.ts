// Failed Invoice types matching the main application
export interface IFailedInvoice {
  trackId: string;
  userId: string;
  mainService: string;
  subService: string;
  status: string;
  inquiryMethod: string;
  failedReason?: string;
  reqFailedData?: any;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Simple admin session (in-memory)
export interface IAdminSession {
  phoneNumber: string;
  chatId: string;
  lastActivity: Date;
}
