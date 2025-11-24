import { Response } from "express";

export const handleError = (err: any, res: Response) => {
  if (err.isExternalApiError) {
    const status = err.status || 500;
    const responseData = err.externalData;

    const errorMessagesArray = Array.isArray(responseData.errorMessages)
      ? responseData.errorMessages
      : [];
    const firstErrorMessageEntry =
      errorMessagesArray.length > 0 ? errorMessagesArray[0] : undefined;

    const code =
      responseData.responseCode ||
      responseData.error.code ||
      responseData.code ||
      responseData.Status.Code ||
      firstErrorMessageEntry?.code ||
      responseData.status ||
      "UNKNOWN_ERROR";
    const responseMessage =
      responseData.error?.message ||
      responseData.message ||
      responseData.Status.Description ||
      err.message ||
      responseData.Status.Description ||
      (firstErrorMessageEntry?.message ?? firstErrorMessageEntry);
    const message = responseMessage || "خطایی رخ داد.";

    res.status(status).json({
      status: "FAILED",
      error: {
        code,
        message,
      },
    });
  } else if (err.response && err.response.data) {
    const status = err.response.status || 500;
    const responseData = err.response.data;

    const errorMessagesArray = Array.isArray(responseData.errorMessages)
      ? responseData.errorMessages
      : [];
    const firstErrorMessageEntry =
      errorMessagesArray.length > 0 ? errorMessagesArray[0] : undefined;

    const code =
      responseData.responseCode ||
      responseData.code ||
      responseData.meta?.code ||
      responseData.meta?.error_type ||
      responseData.error?.code ||
      responseData.Status?.Code ||
      firstErrorMessageEntry?.code ||
      responseData.status ||
      "UNKNOWN_ERROR";
    const responseMessage =
      responseData.error?.message ||
      responseData.message ||
      responseData.meta?.error_message ||
      responseData.Status?.Description ||
      (firstErrorMessageEntry?.message ?? firstErrorMessageEntry) ||
      responseData.errorMessages;
    const message = responseMessage || "خطایی رخ داد.";

    res.status(status).json({
      status: "FAILED",
      error: {
        code,
        message,
      },
    });
  } else {
    res.status(500).json({
      status: "FAILED",
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: err.message || "خطای داخلی سرور رخ داد.",
      },
    });
  }
};
