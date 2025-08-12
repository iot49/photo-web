FROM python:3.13.2

ENV USER=coder
ENV UID=1000
ENV GID=1000

ENV NODE_VERSION=22.14.0
ENV NVM_DIR=/opt/nvm

# where vscode extensions are installed
ENV XDG_DATA_HOME=/opt/vscode

WORKDIR /opt

# apps and libraries
RUN apt-get update && apt-get install -y \
    openssl \
    git \
    zsh \
    dumb-init \
    direnv \
    && rm -rf /var/lib/apt/lists/*

# npm, node
RUN mkdir -p $NVM_DIR && \
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash && \
    . "$NVM_DIR/nvm.sh" && nvm install ${NODE_VERSION} && \
    . "$NVM_DIR/nvm.sh" && nvm use v${NODE_VERSION} && \
    . "$NVM_DIR/nvm.sh" && nvm alias default v${NODE_VERSION}
ENV PATH="$NVM_DIR/versions/node/v${NODE_VERSION}/bin/:${PATH}"

# uv package manager
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

# install the latest version of code-server
RUN curl -fsSL https://code-server.dev/install.sh | sh

# Create extensions directory before installing extensions
RUN mkdir -p ${XDG_DATA_HOME}/extensions

# Individual extension installations to identify problematic extension
RUN code-server --extensions-dir ${XDG_DATA_HOME}/extensions --install-extension ms-python.python && \
    code-server --extensions-dir ${XDG_DATA_HOME}/extensions --install-extension ms-toolsai.jupyter && \
    code-server --extensions-dir ${XDG_DATA_HOME}/extensions --install-extension bierner.markdown-preview-github-styles && \
    code-server --extensions-dir ${XDG_DATA_HOME}/extensions --install-extension bierner.markdown-mermaid && \
    code-server --extensions-dir ${XDG_DATA_HOME}/extensions --install-extension rooveterinaryinc.roo-cline

# python packages
COPY requirements.txt /opt/
RUN pip install -r requirements.txt

# TO INVESTIGATE create user (note: home is in container - not mounted)
ENV HOME=/users/${USER}
ENV GIT_DISCOVERY_ACROSS_FILESYSTEM=1
RUN groupadd -g ${GID} ${USER} && \
    useradd -r -d ${HOME} -m -u ${UID} -g ${USER} -s /usr/bin/zsh ${USER} && \
    chown -R ${UID}:${GID} ${XDG_DATA_HOME}
    # no sudo for now
    # echo "${USER} ALL=(ALL) NOPASSWD:ALL" | EDITOR='tee -a' visudo

# Create vscode user data directory structure and copy settings
RUN mkdir -p ${XDG_DATA_HOME}/user-data/User && \
    chown -R ${UID}:${GID} ${XDG_DATA_HOME}

COPY settings.json ${XDG_DATA_HOME}/user-data/User/settings.json
COPY --chmod=0755 start.sh /opt/

# Ensure proper ownership of settings.json after copy
RUN chown ${UID}:${GID} ${XDG_DATA_HOME}/user-data/User/settings.json

# user space
USER ${UID}:${GID}
WORKDIR ${HOME}

ENTRYPOINT ["dumb-init", "--"]

CMD [ "/usr/bin/zsh", "/opt/start.sh" ]
