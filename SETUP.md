### Install node and yarn version
* Node: ^20.14.10
* yarn: 4.3.1

### Install custom nativescript:
* clone repo: https://github.com/Akylas/NativeScript
* ensure that project NativeScript and project OSS-DocumentScanner are the same folder
* cd NativeScript
* npm run setup:yarn && npm run ui-mobile-base:build && npm run core:build

### Install custom nativescrip-cli
* clone repo: https://github.com/farfromrefug/nativescript-cli
* ensure that project nativescript-cli and project OSS-DocumentScanner are the same folder
* cd nativescript-cli
* npm run setup
* ../nativescript-cli/bin/ns devices

### Install 3th parties
* download from https://github.com/Akylas/OSS-DocumentScanner/releases/tag/dev_resources and uncompress them at the root

### setup submodule (to fetch zxingcpp)
* git submodule init
* git submodule update
* cd zxingcpp
* git submodule init
* git submodule update

### yarn
* need to use yarn with this project as it uses the `portal:` protocol for some dependencies
* yarn link

### Run project
* yarn
* ../nativescript-cli/bin/ns run android --no-hmr

### Run project debug (console.log will print)
* ../nativescript-cli/bin/ns debug android --no-hmr

### build android debug
* ../nativescript-cli/bin/ns build android --debug --apk --copy-to dist/app-debug.apk

### clean project 
* ../nativescript-cli/bin/ns clean
* it sometime can not delete build folder => must delete build folder manualy


### build android release (When build release, although qr scan successfully, it can not show that qr)
* gen signed key from android studio
* ../nativescript-cli/bin/ns build android --release \
  --key-store-path PATH_TO_KEYSTORE/key_store.jks \
  --key-store-password example_password \
  --key-store-alias example_alias \
  --key-store-alias-password example_password \
  --aab \
  --copy-to dist/app-release.aab
