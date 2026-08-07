import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const COST = 32768;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, cost = COST, blockSize = BLOCK_SIZE, parallelization = PARALLELIZATION): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { cost, blockSize, parallelization, maxmem: MAX_MEMORY }, (error, key) => {
      if (error) reject(error);
      else resolve(key as Buffer);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 1024) throw new Error("PASSWORD_LENGTH_INVALID");
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  return ["scrypt", "v1", COST, BLOCK_SIZE, PARALLELIZATION, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, version, costText, blockText, parallelText, saltText, hashText] = encoded.split("$");
  if (algorithm !== "scrypt" || version !== "v1" || !costText || !blockText || !parallelText || !saltText || !hashText) return false;
  const cost = Number(costText);
  const blockSize = Number(blockText);
  const parallelization = Number(parallelText);
  if (cost !== COST || blockSize !== BLOCK_SIZE || parallelization !== PARALLELIZATION) return false;
  const expected = Buffer.from(hashText, "base64url");
  if (expected.length !== KEY_LENGTH) return false;
  const actual = await derive(password, Buffer.from(saltText, "base64url"), cost, blockSize, parallelization);
  return timingSafeEqual(expected, actual);
}
