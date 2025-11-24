import { Response } from "express";

interface SuccessResponse<T = Record<string, any>> {
  status: "DONE";
  result: T;
}

interface ErrorDetail {
  code: string;
  message: string;
}

interface ErrorResponse {
  status: string;
  error: ErrorDetail;
}

export function handleCostumeError(
  res: Response,
  statusCode: number,
  code: string,
  message: string
): Response {
  const responseBody: ErrorResponse = {
    status: "FAILED",
    error: {
      code,
      message,
    },
  };

  return res.status(statusCode).json(responseBody);
}

export const handleSuccess = <T>(
  res: Response,
  result: T,
  statusCode = 200
): void => {
  const response: SuccessResponse<T> = {
    status: "DONE",
    result,
  };
  res.status(statusCode).json(response);
};
