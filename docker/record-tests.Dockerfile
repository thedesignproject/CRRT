FROM crrt-record-worker:local
COPY --from=node:24-bookworm-slim /usr/local/bin/node /usr/local/bin/node
USER root
RUN apt-get update && apt-get install -y --no-install-recommends git python3 python3-venv && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/diff-coverage && /opt/diff-coverage/bin/pip install diff-cover==10.0.0
ENV PATH="/opt/diff-coverage/bin:${PATH}"
COPY . /app
ENV NODE_OPTIONS="--no-experimental-webstorage"
CMD ["bun", "run", "test:coverage"]
