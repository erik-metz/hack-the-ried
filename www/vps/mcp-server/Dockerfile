FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd --uid 10001 --no-create-home mcp
COPY server.py .
USER 10001:10001
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8090", "--no-access-log", "--proxy-headers", "--forwarded-allow-ips", "172.16.0.0/12,10.0.0.0/8,192.168.0.0/16"]
