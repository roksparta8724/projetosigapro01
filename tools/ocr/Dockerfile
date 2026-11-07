FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
  poppler-utils tesseract-ocr tesseract-ocr-por tesseract-ocr-eng \
  && rm -rf /var/lib/apt/lists/*
RUN useradd --system --uid 10001 --home-dir /nonexistent --shell /usr/sbin/nologin sigapro-ocr
WORKDIR /opt/sigapro-ocr
COPY tools/ocr/scan_pdf.py ./scan_pdf.py
USER 10001:10001
ENTRYPOINT ["python3", "/opt/sigapro-ocr/scan_pdf.py"]
