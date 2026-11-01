FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/parquet-venv \
    && /opt/parquet-venv/bin/pip install --no-cache-dir 'pyarrow>=20,<24'
COPY package*.json ./
RUN npm ci --omit=dev
COPY *.mjs *.py ./
ENV PYTHON=/opt/parquet-venv/bin/python
RUN mkdir /data && chown node:node /data
USER node
CMD ["node", "worker.mjs", "--watch"]
