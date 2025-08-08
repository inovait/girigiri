

#  first stage -> install all dependencies and compile typescript
FROM node:18-alpine AS builder

# set the working directory. Create it if it doesnt exist
WORKDIR /usr/src/app

# copy the package files  this will be re run if package.json or package.lock json have changed
COPY package*.json ./
# install all dependencies
RUN npm install

# copy the source code
COPY . .

# run the build - creates the dist folder
RUN npm run build

# second stage - create the lean image
FROM node:18-alpine

ARG NODE_ENV=development
ENV NODE_ENV=${NODE_ENV}

# change from default root to node (less privileged user)
USER node

# set the working directory to a folder inside the node users home directory
WORKDIR /home/node/app

# create directory for the logs
RUN mkdir -p /home/node/app/logs && chown node:node /home/node/app/logs

# copy the dependencies from the builder stage and make the node user own the files
COPY --chown=node:node --from=builder /usr/src/app/node_modules ./node_modules
COPY --chown=node:node --from=builder /usr/src/app/package*.json ./

# copy the compiled 'dist' folder from the builder stage.
COPY --chown=node:node --from=builder /usr/src/app/dist ./dist
COPY --chown=node:node .env .env

# copy the scripts and the sql directory
# COPY --chown=node:node --from=builder /usr/src/app/scripts ./scripts
 COPY --chown=node:node --from=builder /usr/src/app/migrations ./migrations

# expose the port.
EXPOSE 3000

# run the final compiled image
CMD [ "node", "dist/migrate.js" ]