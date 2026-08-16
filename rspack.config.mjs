import path from "node:path";
import { fileURLToPath } from "node:url";
import rspack from "@rspack/core";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default function createConfig(mode = "production") {
  const production = mode === "production";

  return {
    mode,
    target: "web",
    entry: path.join(projectRoot, "src/main.tsx"),
    output: {
      path: path.join(projectRoot, "out"),
      filename: production ? "assets/[name].[contenthash:8].js" : "assets/[name].js",
      cssFilename: production ? "assets/[name].[contenthash:8].css" : "assets/[name].css",
      publicPath: "/",
      clean: true,
    },
    resolve: {
      extensions: [".tsx", ".ts", ".jsx", ".js"],
      alias: {
        "@": path.join(projectRoot, "src"),
      },
    },
    module: {
      rules: [
        {
          test: /\.[jt]sx?$/,
          exclude: /node_modules/,
          use: [
            {
              loader: "builtin:swc-loader",
              options: {
                jsc: {
                  parser: {
                    syntax: "typescript",
                    tsx: true,
                  },
                  transform: {
                    react: {
                      runtime: "automatic",
                      development: !production,
                      refresh: false,
                    },
                  },
                },
              },
            },
          ],
          type: "javascript/auto",
        },
        {
          test: /\.css$/,
          use: [path.join(projectRoot, "scripts/postcss-loader.cjs")],
          type: "css",
        },
        {
          test: /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf)$/i,
          type: "asset/resource",
          generator: {
            filename: "assets/[name].[contenthash:8][ext]",
          },
        },
        {
          test: /\.svg$/i,
          type: "asset/resource",
          generator: {
            filename: "assets/[name].[contenthash:8][ext]",
          },
        },
      ],
    },
    experiments: {
      css: true,
    },
    // Desktop bundles are loaded from disk, so web transfer-size hints are not actionable.
    performance: {
      hints: false,
    },
    plugins: [
      new rspack.HtmlRspackPlugin({
        template: path.join(projectRoot, "index.html"),
        favicon: path.join(projectRoot, "src/app/favicon.ico"),
      }),
      new rspack.CopyRspackPlugin({
        patterns: [
          {
            from: path.join(projectRoot, "public"),
            to: ".",
            noErrorOnMissing: true,
          },
        ],
      }),
      new rspack.DefinePlugin({
        "process.env.NODE_ENV": JSON.stringify(mode),
      }),
    ],
    devtool: production ? false : "cheap-module-source-map",
    stats: "errors-warnings",
  };
}
