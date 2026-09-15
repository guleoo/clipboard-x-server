import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { Result, ServiceError } from "../core";
import { RequestStore } from "./request-context";
import { Log } from "../logger";
import { HttpError } from "./error";

interface ErrorResolution {
  readonly status: ContentfulStatusCode;
  readonly message: string;
}

interface ErrorResolver {
  match(error: unknown): boolean;
  resolve(error: unknown): ErrorResolution;
}

const logger = Log.create({ service: "http" });

// Add resolvers for optional concrete Frame errors before ServiceError.
const resolvers: readonly ErrorResolver[] = [
  {
    match: (error) => error instanceof HttpError,
    resolve: (error) => ({
      status: (error as HttpError).status,
      message: (error as HttpError).message,
    }),
  },
  {
    match: (error) => error instanceof ServiceError,
    resolve: (error) => ({
      status: 400,
      message: (error as ServiceError).message,
    }),
  },
  {
    match: (error) => error instanceof HTTPException,
    resolve: (error) => ({
      status: (error as HTTPException).status,
      message: (error as HTTPException).message,
    }),
  },
];

function resolveError(error: unknown): ErrorResolution {
  for (const resolver of resolvers) {
    if (resolver.match(error)) return resolver.resolve(error);
  }
  return { status: 500, message: "Internal server error" };
}

export const errorHandler: ErrorHandler = (error, context) => {
  const resolution = resolveError(error);
  const serverFailure = resolution.status >= 500;

  if (serverFailure) {
    logger.error("Unhandled HTTP request error", {
      error,
      method: context.req.method,
      route: context.req.routePath,
      requestId: RequestStore.get("requestId"),
    });
  }

  const message = serverFailure ? "Internal server error" : resolution.message;
  return context.json(
    Result.fail(resolution.status, message),
    resolution.status,
  );
};
