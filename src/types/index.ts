// Simple admin session (in-memory)
export interface IAdminSession {
  phoneNumber: string;
  chatId: string;
  lastActivity: Date;
}

// Invoice status enum
export enum INVOICE_STATUS {
  PAID = "paid",
  REJECTED = "rejected",
  PENDING = "pending",
  VALIDATING = "validating",
}

// Invoice update request interface
export interface IInvoiceUpdateRequest {
  trackId: string;
  newStatus: INVOICE_STATUS;
  referenceId?: string;
}
