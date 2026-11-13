#!/usr/bin/env python3
"""SIGAPRO offline OCR: untrusted raster PDF -> review-only per-page text.

No internet, AI API, database access or geometry approval; run in a sandbox.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time

MAX_BYTES = 8 * 1024 * 1024
MAX_PAGES = 16
MAX_TEXT_PER_PAGE = 16000
MAX_WALL_SECONDS = 150


class ScanError(Exception):
    pass


def bounded_run(command: list[str], deadline: float, *, timeout_limit: float = 32) -> str:
    seconds = min(timeout_limit, deadline - time.monotonic())
    if seconds <= 0:
        raise ScanError("OCR_TIMEOUT")
    try:
        proc = subprocess.run(command, capture_output=True, text=True, errors="replace",
                              timeout=seconds, check=False)
    except (subprocess.TimeoutExpired, OSError) as error:
        raise ScanError("OCR_UNAVAILABLE_OR_TIMEOUT") from error
    if proc.returncode != 0:
        raise ScanError("PDF_CONVERSION_OR_OCR_FAILED")
    return proc.stdout


def parse_pdfinfo(output: str) -> tuple[int, bool]:
    lines = dict((match.group(1).lower(), match.group(2).strip())
                 for line in output.splitlines()
                 if (match := re.fullmatch(r"([A-Za-z][A-Za-z ]+):\s*(.*)", line)))
    try:
        pages = int(lines.get("pages", ""))
    except ValueError as exc:
        raise ScanError("PDF_PAGE_COUNT_UNKNOWN") from exc
    if pages < 1 or pages > MAX_PAGES:
        raise ScanError("PDF_PAGE_LIMIT")
    return pages, lines.get("encrypted", "no").lower().startswith("yes")


def process_pdf(pdf_path: Path, *, deadline_seconds: float = MAX_WALL_SECONDS) -> dict:
    if pdf_path.is_symlink() or not pdf_path.is_file():
        raise ScanError("PDF_PATH_NOT_ALLOWED")
    size = pdf_path.stat().st_size
    if size < 100 or size > MAX_BYTES:
        raise ScanError("PDF_SIZE_INVALID")
    with pdf_path.open("rb") as source:
        header = source.read(5)
        digest = hashlib.sha256(header)
        for block in iter(lambda: source.read(65536), b""):
            digest.update(block)
    if header != b"%PDF-":
        raise ScanError("PDF_HEADER_INVALID")
    deadline = time.monotonic() + deadline_seconds
    total, encrypted = parse_pdfinfo(bounded_run(["pdfinfo", str(pdf_path)], deadline))
    if encrypted:
        raise ScanError("PDF_ENCRYPTED")
    pages: list[dict] = []
    with tempfile.TemporaryDirectory(prefix="sigapro-ocr-") as work_dir:
        for page_no in range(1, total + 1):
            target = Path(work_dir) / "page"
            bounded_run(["pdftoppm", "-f", str(page_no), "-l", str(page_no),
                         "-singlefile", "-r", "150", "-scale-to", "2400",
                         "-png", str(pdf_path), str(target)], deadline)
            image = target.with_suffix(".png")
            if not image.is_file() or image.stat().st_size > 35_000_000:
                raise ScanError("PDF_RASTER_INVALID")
            content = bounded_run(["tesseract", str(image), "stdout", "-l", "por+eng",
                                   "--psm", "11"], deadline)
            image.unlink(missing_ok=True)
            content = re.sub(r"\r\n?", "\n", content).strip()
            if len(content) > MAX_TEXT_PER_PAGE:
                raise ScanError("PDF_TEXT_LIMIT")
            pages.append({"page": page_no, "text": content,
                          "has_text": bool(content), "requires_visual_review": True})
    return {"source": "sigapro_local_ocr_text_only", "document_sha256": digest.hexdigest(),
            "page_count": total, "pages": pages, "automaticallyApproved": False,
            "measurementsVerified": False,
            "warnings": ["OCR lê caracteres, não mede geometria ou escala de projeto.",
                         "Todas as páginas e cotas exigem inspeção do analista habilitado."]}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="SIGAPRO isolated OCR: review-only")
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--output", type=Path, required=True,
                        help="Private JSON output in an authorized isolated volume")
    args = parser.parse_args(argv)
    try:
        if args.output.exists():
            raise ScanError("OUTPUT_EXISTS_REFUSING_OVERWRITE")
        output = process_pdf(args.pdf)
        os.umask(0o077)
        fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf8") as file:
            json.dump(output, file, ensure_ascii=False, separators=(",", ":"))
        print("SIGAPRO_OCR_COMPLETE: "+str(output["page_count"])+" page(s), source_sha256="+
              output["document_sha256"][:12])
        return 0
    except (ScanError, OSError) as exc:
        print("SIGAPRO_OCR_FAILED: " +
              (str(exc) if isinstance(exc, ScanError) else "IO_ERROR"), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
