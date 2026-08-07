import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface PrivateStorage {
  put(input: { key: string; bytes: Buffer; contentType: string; checksumSha256: string }): Promise<void>;
  signedGet(key: string, expiresInSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
  health(): Promise<boolean>;
}

export class S3PrivateStorage implements PrivateStorage {
  constructor(private readonly client: S3Client, private readonly bucket: string) {}

  async put(input: { key: string; bytes: Buffer; contentType: string; checksumSha256: string }): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      Body: input.bytes,
      ContentType: input.contentType,
      CacheControl: "private, no-store",
      ServerSideEncryption: "AES256",
      Metadata: { "sha256": input.checksumSha256 }
    }));
  }

  async signedGet(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseCacheControl: "private, no-store"
    }), { expiresIn: expiresInSeconds });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async health(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }
}
