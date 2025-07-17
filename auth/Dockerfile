FROM python:3.11-slim

WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy requirements and app code
COPY requirements.txt .
COPY app/ ./app/
COPY firebase_secrets/ ./app/

# Set PYTHONPATH to include the app directory
ENV PYTHONPATH=/app/app:/app

# Create data directory for SQLite database
RUN mkdir -p /app/data

# Set environment variable for database location
ENV DATABASE_URL=sqlite:///./data/auth.db

# Expose port
EXPOSE 8000

# Command to run the application
# Note: --forwarded-allow-ips *
#       Required to use correct scheme in redirects; * is ok if container exposed only on local network
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--forwarded-allow-ips", "*", "--proxy-headers", "--log-level", "warning"]
