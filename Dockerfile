FROM node:16-alpine

RUN apk update && apk add git

WORKDIR /app

ADD package.json ./
ADD yarn.lock ./
ADD app.js ./
ADD config.js ./
ADD src ./src

RUN yarn

CMD ["yarn", "start"]

