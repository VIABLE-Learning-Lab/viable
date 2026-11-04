// The harness's store (get, put, delete, list, with JSON values) in an S3 bucket, one object per key.
// Lambda's Node runtime includes this SDK. The bucket's lifecycle rule (template.yaml) deletes old objects.
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export function s3Store(Bucket, client = new S3Client({})) {
  return {
    async get(Key) {
      try {
        const { Body } = await client.send(new GetObjectCommand({ Bucket, Key }));
        return JSON.parse(await Body.transformToString());
      } catch (error) {
        if (error.name === 'NoSuchKey') return null;
        throw error;
      }
    },
    async put(Key, value) {
      await client.send(new PutObjectCommand({ Bucket, Key, Body: JSON.stringify(value), ContentType: 'application/json' }));
    },
    async delete(Key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key }));
    },
    async list(Prefix = '') {
      const keys = [];
      let ContinuationToken;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken }));
        keys.push(...(page.Contents || []).map((item) => item.Key));
        ContinuationToken = page.NextContinuationToken;
      } while (ContinuationToken);
      return keys.sort();
    }
  };
}
