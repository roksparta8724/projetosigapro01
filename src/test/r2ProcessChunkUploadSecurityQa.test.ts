import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  MAX_PROCESS_ATTACHMENT_BYTES, PROCESS_CHUNK_BYTES,
  validateProcessChunkPayload,
} from "../../server/api/r2-process-proxy-upload";
import {
  PROCESS_UPLOAD_MAX_BYTES, PROCESS_UPLOAD_CHUNK_BYTES,
  PROCESS_INLINE_MAX_BYTES, largeProcessAttachmentMime,
} from "@/integrations/r2/processChunkUpload";

const tenant = "49dac0b6-6352-4744-9aab-9ff91c59d970";
const owner = "2244ccaa-1111-4111-8111-123456abcdef";
const fileId = "3234ccaa-1111-4111-8111-123456abcdef";
const uploadId = "4234ccaa-1111-4111-8111-123456abcdef";
const prefix = "municipalities/" + tenant + "/";
const key = prefix + "protocols/" + owner + "/" + fileId + "-projeto-arquitetonico.pdf";
const size = 5 * 1024 * 1024;
const sample = {
  bucket:"process-documents",objectKey:key,fileSize:size,contentType:"application/pdf",uploadId,
};

describe("SIGAPRO QA — anexos maiores que o limite HTTP, sem alterar PDFs bancários", () => {
  it("valida a operação de upload de 2MiB antes de tocar no armazenamento", () => {
    const chunk = validateProcessChunkPayload({...sample,action:"chunk",chunkIndex:0,
      base64:"QUJDRA==",chunkSha256:"a".repeat(64)});
    expect(chunk).toMatchObject({
      municipalityId:tenant,actorId:owner,action:"chunk",
      fileSize:size,count:3,index:0,contentType:"application/pdf",
    });
    expect(validateProcessChunkPayload({...sample,action:"finalize",fileSha256:"f".repeat(64)}))
      .toMatchObject({action:"finalize",count:3,fileSha256:"f".repeat(64)});
    expect(validateProcessChunkPayload({...sample,action:"abort"}))
      .toMatchObject({action:"abort",count:3});
  });

  it("nega tamanho e caminho fora da área de anexos", () => {
    const paths = [
      prefix + "dam-originals/" + owner + "/" + fileId + "-cobranca.pdf",
      prefix + "legislation-registry/" + owner + "/" + fileId + "-lei.pdf",
      prefix + "profiles/avatars/" + owner + "/" + fileId + "-foto.webp",
      prefix + "private-process-staging/" + owner + "/" + fileId + "-segredo.pdf",
      prefix + "protocols/" + owner + "/../segredo.pdf",
      prefix + "protocols/" + owner + "/" + fileId + "-doc.svg",
      prefix + "protocols/" + owner + "/" + fileId + "-doc.exe",
    ];
    for (const objectKey of paths) {
      expect(validateProcessChunkPayload({...sample,objectKey,action:"abort"})).toBeNull();
    }
    expect(validateProcessChunkPayload({...sample,action:"abort",fileSize:0})).toBeNull();
    expect(validateProcessChunkPayload({...sample,action:"abort",fileSize:MAX_PROCESS_ATTACHMENT_BYTES+1})).toBeNull();
    expect(validateProcessChunkPayload({...sample,action:"abort",uploadId:"../escape"})).toBeNull();
    expect(validateProcessChunkPayload({...sample,action:"abort",contentType:"text/html"})).toBeNull();
  });

  it("nega corpo de chunk não autenticado criptograficamente", () => {
    for (const data of [
      {...sample,action:"chunk",chunkIndex:3,base64:"QUJD",chunkSha256:"a".repeat(64)},
      {...sample,action:"chunk",chunkIndex:-1,base64:"QUJD",chunkSha256:"a".repeat(64)},
      {...sample,action:"chunk",chunkIndex:0,base64:"@@@=",chunkSha256:"a".repeat(64)},
      {...sample,action:"chunk",chunkIndex:0,base64:"QUJD",chunkSha256:"test"},
      {...sample,action:"finalize",fileSha256:"test"},
    ]) expect(validateProcessChunkPayload(data)).toBeNull();
  });

  it("mesmo contrato no cliente e servidor; formatos grandes aceitos só em anexos", () => {
    expect(PROCESS_UPLOAD_CHUNK_BYTES).toBe(PROCESS_CHUNK_BYTES);
    expect(PROCESS_UPLOAD_MAX_BYTES).toBe(MAX_PROCESS_ATTACHMENT_BYTES);
    const largeFile = {size:PROCESS_INLINE_MAX_BYTES+1,name:"projeto.pdf",type:"application/pdf"};
    expect(largeProcessAttachmentMime({bucket:"process-documents",objectKey:key,file:largeFile}))
      .toBe("application/pdf");
    expect(largeProcessAttachmentMime({bucket:"profile-assets",objectKey:key,file:largeFile}))
      .toBeNull();
    expect(largeProcessAttachmentMime({bucket:"process-documents",objectKey:key,file:{...largeFile,size:1234}}))
      .toBeNull();
    expect(largeProcessAttachmentMime({bucket:"process-documents",objectKey:key,
      file:{...largeFile,type:"text/html"}})).toBeNull();
  });

  it("confere assinaturas, perfil, tenant, quota, staging e revisão imutável", () => {
    const router = readFileSync("api/r2.ts","utf8");
    const rewrites = JSON.parse(readFileSync("vercel.json","utf8")) as {
      rewrites: Array<{source:string,destination:string}>;
    };
    expect(router).toContain('action === "process-proxy-upload"');
    expect(router).toContain('handleProcessProxyUpload(req as never, res)');
    expect(rewrites.rewrites).toContainEqual({
      source:"/api/r2-process-proxy-upload",
      destination:"/api/r2?action=process-proxy-upload",
    });
    const server = readFileSync("server/api/r2-process-proxy-upload.ts","utf8");
    const client = readFileSync("src/integrations/r2/client.ts","utf8");
    const raw = readFileSync("src/integrations/r2/processChunkUpload.ts","utf8");
    expect(server).toContain('readBearer(req)');
    expect(server).toContain('"current_profile_id"');
    expect(server).toContain('"has_tenant_access"');
    expect(server).toContain('"assert_municipality_entitlement_v1"');
    expect(server).toContain('private-process-staging/');
    expect(server).toContain('IfNoneMatch:"*"');
    expect(server).toContain('new HeadObjectCommand');
    expect(server).toContain('new CompleteMultipartUploadCommand');
    expect(server).toContain('new AbortMultipartUploadCommand');
    expect(server).toContain('new DeleteObjectsCommand');
    expect(server).toContain('fullHash.digest("hex") !== v.fileSha256');
    expect(client).toContain('uploadLargeProcessAttachment({...input,bucket:"process-documents"}');
    expect(raw).toContain('credentials:"same-origin"');
  });
});
