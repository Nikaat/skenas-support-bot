// Simple admin session (in-memory)
export interface IAdminSession {
  phoneNumber: string;
  chatId: string;
  lastActivity: Date;
}

// Invoice status enum for crypto transactions
export enum INVOICE_STATUS {
  PAID = "paid",
  REJECTED = "rejected",
  PENDING = "pending",
  VALIDATING = "validating",
}

// Crypto invoice confirmation interface
export interface ICryptoInvoiceConfirmation {
  trackId: string;
  status: INVOICE_STATUS;
  referenceNumber?: string;
}

export interface INotificationData {
  title: string;
  description: string;
  url?: string;
  tag?: string;
  image?: string;
  actions?: string[];
  vibrate?: string[];
  silent?: boolean;
}
