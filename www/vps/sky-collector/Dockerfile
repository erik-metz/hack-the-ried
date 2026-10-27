FROM python:3.11-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY calculations.py main.py ./
RUN useradd --system --uid 10001 collector
USER collector
HEALTHCHECK --interval=60s --timeout=5s --start-period=60s CMD ["python", "-c", "import pathlib,time; p=pathlib.Path('/tmp/sky-heartbeat'); exit(0 if p.exists() and time.time()-p.stat().st_mtime<900 else 1)"]
CMD ["python", "main.py"]
