import { describe, expect, it } from "bun:test";
import {
  BaseError,
  ErrorCode,
  ServiceError,
} from "../src/frame/core";

describe("errors", () => {
  it("adds diagnostic data while preserving native Error behavior", () => {
    const cause = new Error("root cause");
    const error = new BaseError(
      "operation failed",
      { operation: "import" },
      { cause },
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("BaseError");
    expect(error.message).toBe("operation failed");
    expect(error.cause).toBe(cause);
    expect(error.data).toEqual({ operation: "import" });
  });

  it("builds stable product error codes", () => {
    expect(ErrorCode.of(100_001_001, "Operation failed")).toEqual({
      code: 100_001_001,
      message: "Operation failed",
    });
    expect(ErrorCode.prefix(100_001, 2, "Conflict")).toEqual({
      code: 100_001_002,
      message: "Conflict",
    });
  });

  it("lets business-specific errors derive from ServiceError", () => {
    const NotFound = ErrorCode.prefix(100_001, 1, "Resource not found");

    class ResourceNotFoundError extends ServiceError<{
      readonly resourceId: string;
    }> {
      constructor(resourceId: string) {
        super(NotFound, { resourceId });
      }
    }

    const error = new ResourceNotFoundError("resource-1");
    expect(error).toBeInstanceOf(ServiceError);
    expect(error.name).toBe("ResourceNotFoundError");
    expect(error.code).toBe(100_001_001);
    expect(error.message).toBe("Resource not found");
    expect(error.data).toEqual({ resourceId: "resource-1" });
  });
});
