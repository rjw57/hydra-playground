FROM python:3.6
WORKDIR /usr/src/app
VOLUME /usr/src/app
EXPOSE 5000
ENV FLASK_APP=app.py FLASK_DEBUG=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

ENTRYPOINT ["flask"]
CMD ["run", "-h", "0.0.0.0", "-p", "5000"]
