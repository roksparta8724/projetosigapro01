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
    <div className="space-y-4 min-w-0">
      <div
        className={cn(
          "min-w-0 overflow-hidden rounded-[24px] border border-dashed p-4 transition sm:p-5 lg:p-6",
          dragging
            ? "border-sky-500 bg-sky-50/80 dark:border-sky-300 dark:bg-sky-400/10"
            : "border-slate-300 bg-white dark:border-white/12 dark:bg-white/[0.03]",
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
        <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-semibold leading-6 text-slate-900 dark:text-white sm:text-base">{title}</p>
            <p className="mt-1 max-w-2xl break-words text-sm leading-6 text-slate-500 dark:text-slate-300">{description}</p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap xl:w-auto xl:max-w-[240px] xl:justify-end">
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] w-full max-w-full rounded-full border-slate-200 px-4 py-2.5 text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/12 dark:bg-white/[0.02] dark:text-slate-100 dark:hover:bg-white/[0.06] sm:w-auto"
              onClick={() => inputRef.current?.click()}
            >
              <UploadCloud className="mr-2 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-200" />
              <span className="whitespace-normal text-center sm:whitespace-nowrap">Selecionar arquivo</span>
            </Button>
          </div>
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
            <div key={file.id} className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 p-4 dark:border-white/12 dark:bg-white/[0.03]">
              <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  {file.mimeType.startsWith("image/") ? (
                    <FileImage className="mt-0.5 h-5 w-5 shrink-0 text-sky-600 dark:text-sky-200" />
                  ) : (
                    <FileText className="mt-0.5 h-5 w-5 shrink-0 text-sky-600 dark:text-sky-200" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="max-w-full break-words text-sm font-medium leading-6 text-slate-900 dark:text-white">{file.fileName}</p>
                    <p className="break-words text-sm text-slate-500 dark:text-slate-300">
                      {file.mimeType} - {file.sizeLabel}
                    </p>
                  </div>
                </div>

                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap xl:max-w-[360px] xl:justify-end">
                  {file.previewUrl ? (
                    <a
                      href={file.previewUrl}
                      download={file.fileName}
                      className="inline-flex min-h-[42px] w-full items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/12 dark:text-slate-100 dark:hover:bg-white/[0.06] sm:w-auto"
                    >
                      <Download className="mr-2 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-200" />
                      <span className="whitespace-normal text-center sm:whitespace-nowrap">Download</span>
                    </a>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-[42px] w-full rounded-full text-slate-700 dark:border-white/12 dark:text-slate-100 dark:hover:bg-white/[0.06] sm:w-auto"
                    onClick={() => inputRef.current?.click()}
                  >
                    <RefreshCcw className="mr-2 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-200" />
                    <span className="whitespace-normal text-center sm:whitespace-nowrap">Substituir</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-[42px] w-full rounded-full text-red-600 dark:border-white/12 dark:text-red-300 dark:hover:bg-white/[0.06] sm:w-auto"
                    onClick={() => removeFile(file.id)}
                  >
                    <Trash2 className="mr-2 h-4 w-4 shrink-0" />
                    <span className="whitespace-normal text-center sm:whitespace-nowrap">Excluir</span>
                  </Button>
                </div>
              </div>

              {allowPreview && file.previewUrl ? (
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-white/12 dark:bg-slate-900/50">
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
