import rspack from "@rspack/core";
import createConfig from "../rspack.config.mjs";

const compiler = rspack(createConfig("production"));

compiler.run((error, stats) => {
  compiler.close(() => {});

  if (error) {
    console.error(error);
    process.exitCode = 1;
    return;
  }

  if (stats?.hasErrors()) {
    console.error(stats.toString({ colors: true, errors: true, warnings: true }));
    process.exitCode = 1;
    return;
  }

  console.log(stats?.toString({ colors: true, chunks: false, modules: false }));
});
