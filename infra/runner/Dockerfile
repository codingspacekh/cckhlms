# The code runner (ADR-0004): Java 21 (Temurin) and Python 3.12 (Ubuntu 24.04's), and runner.py, standard library only.
# compose.prod.yaml runs it with no network, read-only, every capability dropped but SETUID, SETGID, CHOWN and KILL.
FROM eclipse-temurin:21-jdk-noble@sha256:57424b1d8eca9c4cf8a4fe226207027911f08d6758628891bf59fcfb53777029
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 \
  && rm -rf /var/lib/apt/lists/*
COPY runner.py /app/runner.py
# The base image's entrypoint updates certificates at start; the runner needs none and its disk is read-only.
ENTRYPOINT []
ENV PYTHONDONTWRITEBYTECODE=1
CMD ["python3", "-I", "/app/runner.py"]
