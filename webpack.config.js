const webpack = require('@akylas/nativescript-webpack');
module.exports = (env) => {
    webpack.init(env);
    console.log(env)
    return webpack.resolveConfig();
};
