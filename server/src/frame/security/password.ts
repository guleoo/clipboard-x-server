import { PasswordHashError } from "./error";

export namespace Password {
  export interface HashOptions {
    readonly memoryCost?: number
    readonly timeCost?: number
  }

  export async function hash(rawPassword: string, options: HashOptions = {}): Promise<string> {
    try {
      return await Bun.password.hash(rawPassword, {
        algorithm: "argon2id",
        memoryCost: options.memoryCost ?? 65_536,
        timeCost: options.timeCost ?? 3,
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
