import { Client } from "pg";
import { z } from "zod";
import { hashPassword } from "../src/auth/password.js";

const input = z.object({
  databaseUrl: z.string().min(1),
  email: z.string().email().max(320),
  password: z.string().min(12).max(1024),
  role: z.enum(["ADMIN", "OPERATOR"])
}).parse({
  databaseUrl: process.env.DATABASE_URL,
  email: process.env.NEW_USER_EMAIL,
  password: process.env.NEW_USER_PASSWORD,
  role: process.env.NEW_USER_ROLE ?? "OPERATOR"
});

const client = new Client({ connectionString: input.databaseUrl, connectionTimeoutMillis: 5000 });
await client.connect();
try {
  const passwordHash = await hashPassword(input.password);
  const emailNormalized = input.email.trim().toLowerCase();
  const result = await client.query<{ id: string }>(
    `INSERT INTO app.users(email,email_normalized,password_hash,role)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [input.email.trim(), emailNormalized, passwordHash, input.role]
  );
  console.log(`created ${input.role} ${emailNormalized} (${result.rows[0]!.id})`);
} catch (error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
    throw new Error("User already exists; no changes made");
  }
  throw error;
} finally {
  await client.end();
}
