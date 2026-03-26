import { DragEvent, useRef, useState } from "react";
import { Download, FileImage, FileText, RefreshCcw, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface UploadedFileItem {
  id: string;
  fileName: string;
  mimeType: string;
  sizeLabel: string;
  previewUrl?: string;
  file?: File;
}

interface FileDropZoneProps {
  title: string;
  description: string;
  accept?: string;
  multiple?: boolean;
  allowPreview?: boolean;
  files: UploadedFileItem[];
  onFilesSelected: (files: UploadedFileItem[]) => void;
  onFilesRemoved?: (files: UploadedFileItem[]) => void;
}

function sizeLabel(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${size} B`;
}

function toDataUrl(file: File) {
  return new Promise<string | undefined>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : undefined);
    reader.onerror = () => resolve(undefined);
    reader.readAsDataURL(file);
  });
}

function canPreview(mimeType: string) {
  return mimeType.startsWith("image/") || mimeType === "application/pdf";
}

export function FileDropZone({
  title,
  description,
  accept,
  multiple = true,
  allowPreview = false,
  files,
  onFilesSelected,
  onFilesRemoved,
}: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const processFiles = async (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) {
      return;
    }

    const nextFiles = await Promise.all(
      Array.from(selectedFiles).map(async (file) => ({
        id: `upload-${crypto.randomUUID()}`,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeLabel: sizeLabel(file.size),
        previewUrl: allowPreview && canPreview(file.type || "") ? await toDataUrl(file) : undefined,
        file,
      })),
    );

    onFilesSelected(multiple ? [...files, ...nextFiles] : nextFiles.slice(0, 1));
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    await processFiles(event.dataTransfer.files);
  };

  const removeFile = (fileId: string) => {
    const next = files.filter((file) => file.id !== fileId);
    if (onFilesRemoved) {
      onFilesRemoved(next);
      return;
    }
    onFilesSelected(next);
  };

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "rounded-[24px] border border-dashed p-6 transition",
          dragging ? "border-slate-900 bg-slate-50" : "border-slate-300 bg-white",
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragging(false);
        }}
        onDrop={handleDrop}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 max-w-2xl">
            <p className="break-words text-base font-semibold leading-tight text-slate-900">{title}</p>
            <p className="mt-1 break-words text-sm leading-6 text-slate-500">{description}</p>
          </div>
          <Button type="button" variant="outline" className="rounded-full" onClick={() => inputRef.current?.click()}>
            <UploadCloud className="mr-2 h-4 w-4" />
            Selecionar arquivo
          </Button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(event) => void processFiles(event.target.files)}
        />
      </div>

      {files.length > 0 ? (
        <div className="grid gap-4">
          {files.map((file) => (
            <div key={file.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  {file.mimeType.startsWith("image/") ? (
                    <FileImage className="h-5 w-5 text-slate-700" />
                  ) : (
                    <FileText className="h-5 w-5 text-slate-700" />
                  )}
                  <div className="min-w-0">
                    <p className="max-w-[520px] break-words text-sm font-medium leading-6 text-slate-900">{file.fileName}</p>
                    <p className="break-words text-sm text-slate-500">
                      {file.mimeType} - {file.sizeLabel}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {file.previewUrl ? (
                    <a
                      href={file.previewUrl}
                      download={file.fileName}
                      className="inline-flex items-center rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </a>
                  ) : null}
                  <Button type="button" variant="outline" className="rounded-full" onClick={() => inputRef.current?.click()}>
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    Substituir
                  </Button>
                  <Button type="button" variant="outline" className="rounded-full text-rose-700" onClick={() => removeFile(file.id)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Excluir
                  </Button>
                </div>
              </div>

              {allowPreview && file.previewUrl ? (
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                  {file.mimeType === "application/pdf" ? (
                    <iframe src={file.previewUrl} title={file.fileName} className="h-72 w-full" />
                  ) : (
                    <img src={file.previewUrl} alt={file.fileName} className="max-h-80 w-full object-contain" />
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
