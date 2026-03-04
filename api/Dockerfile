FROM python:3.11-slim

WORKDIR /app

COPY api /app/api
COPY config /app/config
RUN pip install --no-cache-dir /app/api

WORKDIR /app/api

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
