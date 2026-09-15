import { SecurityConfig } from "./config";
import { PasswordHashError } from "./error";

export namespace Password {
  export async function hash(rawPassword: string): Promise<string> {
    try {
      return await Bun.password.hash(rawPassword, {
        algorithm: "argon2id",
        memoryCost: SecurityConfig.password.memoryCost,
        timeCost: SecurityConfig.password.timeCost,
      });
    } catch (cause) {
      throw new PasswordHashError("Failed to hash password", undefined, { cause });
    }
  }

  export async function verify(
    rawPassword: string,
    encodedHash: string,
  ): Promise<boolean> {
    try {
      return await Bun.password.verify(rawPassword, encodedHash);
    } catch {
      return false;
    }
  }
}
