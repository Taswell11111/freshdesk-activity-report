# Freshdesk Activity Report

This project is a web application to display activity reports from Freshdesk.

## Backend

The backend is a Python application using the FastAPI framework.

### Running the backend

To run the backend, you need to have Docker installed.

1.  Navigate to the `backend` directory:
    ```bash
    cd backend
    ```
2.  Build the Docker image:
    ```bash
    docker build -t freshdesk-activity-report-backend .
    ```
3.  Run the Docker container:
    ```bash
    docker run -d -p 8000:80 freshdesk-activity-report-backend
    ```

The backend will be available at `http://localhost:8000`.

## Frontend

The frontend is not yet implemented.
