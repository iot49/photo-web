# fetch default configuration from github
if [[ ! -d ~/.git ]]; then
    cd ~
    git init
    git remote add origin https://github.com/iot49/dotfiles && \
    git pull --set-upstream origin main
fi

# create keypair
if [[ ! -f ~/.ssh/id_rsa ]];then
    /usr/bin/ssh-keygen -t rsa -N '' -f ~/.ssh/id_rsa
fi

# ENV XDG_DATA_HOME=/opt/... ?
# RUN EXT_LIST="ms-toolsai.jupyter ms-python.python yzhang.markdown-all-in-one" && \
#     for EXT in $EXT_LIST; do code-server --install-extension $EXT; done

# start the editor with Microsoft marketplace
code-server --host 0.0.0.0 --port 8080 --auth none \
  --extensions-dir ${XDG_DATA_HOME}/extensions \
  --user-data-dir ${XDG_DATA_HOME}/user-data \
  /home

