const { composePlugins, withNx } = require('@nx/webpack');

module.exports = composePlugins(
  withNx({
    target: 'node',
  }),
  (config) => {
    config.output = {
      ...config.output,
      ...(process.env.NODE_ENV !== 'production' && {
        clean: true,
        devtoolModuleFilenameTemplate: '[absolute-resource-path]',
      }),
    };
    config.devtool = 'source-map';

    const path = require('path');
    const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

    config.plugins = config.plugins.filter(
      (p) => !(p instanceof ForkTsCheckerWebpackPlugin)
    );
    config.plugins.push(
      new ForkTsCheckerWebpackPlugin({
        typescript: {
          configFile: path.resolve(__dirname, 'tsconfig.app.json'),
        },
      })
    );

    // Bundle @tiptap/html and happy-dom instead of externalizing them.
    // happy-dom is ESM-only and can't be require()'d at runtime.
    if (Array.isArray(config.externals)) {
      config.externals = config.externals.map((ext) => {
        if (typeof ext !== 'function') {
          return ext;
        }
        return (ctx, callback) => {
          const request = ctx.request;
          if (
            request &&
            (request.startsWith('@tiptap/html') ||
              request.startsWith('happy-dom'))
          ) {
            return callback();
          }
          return ext(ctx, callback);
        };
      });
    }

    return config;
  }
);
