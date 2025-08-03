# Use an official Python runtime as a parent image
FROM python:3.10-slim-bullseye

# Set the working directory in the container
WORKDIR /app

# Install ImageMagick with HEIC support and other dependencies
RUN apt-get update && apt-get install -y \
    imagemagick \
    libheif-dev \
    libheif1 \
    libmagickwand-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Configure ImageMagick policy to allow processing of common image formats
RUN sed -i 's/rights="none" pattern="PDF"/rights="read|write" pattern="PDF"/' /etc/ImageMagick-6/policy.xml && \
    sed -i 's/rights="none" pattern="LABEL"/rights="read|write" pattern="LABEL"/' /etc/ImageMagick-6/policy.xml && \
    sed -i 's/rights="none" pattern="URL"/rights="read|write" pattern="URL"/' /etc/ImageMagick-6/policy.xml && \
    sed -i 's/rights="none" pattern="EPHEMERAL"/rights="read|write" pattern="EPHEMERAL"/' /etc/ImageMagick-6/policy.xml

# Copy the current directory contents into the container at /app
COPY ./requirements.txt /app/requirements.txt

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy the rest of the application code
COPY . /app

# Expose port 8000 for the FastAPI application
EXPOSE 8000

# Run the Uvicorn server with multiple workers
CMD ["gunicorn", "main:app", "--bind", "0.0.0.0:8000", "--workers", "4", "--worker-class", "uvicorn.workers.UvicornWorker", "--preload", "--log-level", "warning"]