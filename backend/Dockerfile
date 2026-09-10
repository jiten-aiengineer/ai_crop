FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /srv/backend

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY backend/database ./database
COPY app/data/products.json /seed/products.json
COPY backend/app/data/sales_officers.json /seed/sales_officers.json

EXPOSE 8000

CMD ["sh", "-c", "python -m app.migrate && python -m app.bootstrap_catalogue /seed/products.json && python -m app.import_sales_officers /seed/sales_officers.json && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
