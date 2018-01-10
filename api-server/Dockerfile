FROM python:3.6
WORKDIR /usr/src/app
VOLUME /usr/src/app
EXPOSE 5000
ENV FLASK_APP=app.py FLASK_DEBUG=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

ENTRYPOINT ["flask"]
# --with-threads is required because of Chrome:
# https://github.com/corydolphin/flask-cors/issues/147#issuecomment-289539799
CMD ["run", "--with-threads", "-h", "0.0.0.0", "-p", "5000"]
