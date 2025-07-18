# first stage
FROM registry.access.redhat.com/ubi9/nodejs-20 AS builder

# use privilaged user
USER root

# assign token for reading packages from github package registry
ARG PACKAGE_REGISTRY_ACCESS_TOKEN=''
ARG EXHORT_JAVASCRIPT_API_VERSION='0.1.1-ea.55'

# install Java
RUN curl -kL https://download.oracle.com/java/21/archive/jdk-21.0.1_linux-x64_bin.tar.gz -o /tmp/java-package.tar.gz \
    && tar xvzf /tmp/java-package.tar.gz -C /usr/

# install Maven package manager
RUN curl -kL https://archive.apache.org/dist/maven/maven-3/3.9.6/binaries/apache-maven-3.9.6-bin.tar.gz -o /tmp/maven-package.tar.gz \
    && tar xvzf /tmp/maven-package.tar.gz -C /usr/

# install golang package manager
RUN curl -kL https://go.dev/dl/go1.21.5.linux-amd64.tar.gz -o /tmp/golang-package.tar.gz \
    && tar xvzf /tmp/golang-package.tar.gz -C /usr/

# install jq JSON formating tool
RUN curl -kL https://github.com/jqlang/jq/releases/download/jq-1.7.1/jq-linux64 -o /usr/bin/jq

# copy the .npmrc file
COPY configs/.npmrc .
# replace placeholder with the actual environment variable
RUN sed -i "s/__PACKAGE_REGISTRY_ACCESS_TOKEN__/${PACKAGE_REGISTRY_ACCESS_TOKEN}/g" ./.npmrc
# install Exhort javascript API
RUN npm install --global @trustification/exhort-javascript-api@${EXHORT_JAVASCRIPT_API_VERSION}

# add RHDA script
COPY scripts/rhda.sh /rhda.sh

# assign executable permissions to all installed binaries
RUN chmod +x /usr/jdk-21.0.1/bin/java \
    && chmod +x /usr/apache-maven-3.9.6/bin/mvn \
    && chmod +x /usr/go/bin/go \
    && chmod +x /usr/bin/jq \
    && chmod +x /opt/app-root/src/.npm-global/bin/exhort-javascript-api \
    && chmod +x /rhda.sh

# use default user
USER default

# second stage
FROM registry.access.redhat.com/ubi9/nodejs-20-minimal

LABEL org.opencontainers.image.source=https://github.com/trustification/exhort-javascript-api

# assign rhda source for exhort tracking purposes
ENV RHDA_SOURCE=''
# contains pip feeze --all data, base64 encoded
ENV EXHORT_PIP_FREEZE=''
# contains pip show data for all packages, base64 encoded
ENV EXHORT_PIP_SHOW=''
# indicate whether to use the Minimal version selection (MVS) algorithm to select a set of module versions to use when building Go packages.
ENV EXHORT_GO_MVS_LOGIC_ENABLED='false'

# Copy java executable from the builder stage
COPY --from=builder /usr/jdk-21.0.1/ /usr/jdk-21.0.1/
ENV JAVA_HOME=/usr/jdk-21.0.1

# Copy maven executable from the builder stage
COPY --from=builder /usr/apache-maven-3.9.6/ /usr/apache-maven-3.9.6/
ENV MAVEN_HOME=/usr/apache-maven-3.9.6

# Copy golang executable from the builder stage
COPY --from=builder /usr/go/ /usr/go/
ENV GOLANG_HOME=/usr/go

# Update PATH
ENV PATH=$PATH:$JAVA_HOME/bin:$MAVEN_HOME/bin:$GOLANG_HOME/bin

# Copy jq executable from the builder stage
COPY --from=builder /usr/bin/jq /usr/bin/jq

# Copy exhort-javascript-api executable from the builder stage
COPY --from=builder /opt/app-root/src/.npm-global/ /opt/app-root/src/.npm-global/

# Copy RHDA executable script from the builder stage
COPY --from=builder /rhda.sh /rhda.sh
