FROM python:latest
EXPOSE 8000
WORKDIR /usr/src/app
VOLUME /usr/src/app
COPY requirements.txt entrypoint.sh ./
RUN pip install -r requirements.txt
ENTRYPOINT ["./entrypoint.sh"]
CMD ["runserver", "0.0.0.0:8000"]
