import { Compiler, Stats } from "webpack";
import { fromHex as sriFromHex } from "ssri";
import { readFileSync, statSync, writeFileSync } from "fs";
import { join as pathJoin } from "path";
import { createHash } from "crypto";

interface IVariant {}

interface IVariantDict {
  [name: string]: IVariant;
}

function fileSha512(path: string): string {
  const content = readFileSync(path);
  const hash = createHash("sha512");
  hash.update(content);
  const sha512val = hash.digest("hex");
  return sha512val;
}

function computeVariant(
  variants: IVariantDict,
  prefix: string,
  file: string,
  variantName: string,
  extension: string,
  knownHash?: string
) {
  const fullPath = pathJoin(prefix, file + extension);
  try {
    const stats = statSync(fullPath);
    // at this point, we know the variant exists

    let hash = knownHash || fileSha512(fullPath);

    variants[variantName] = {
      file: file + extension,
      size: stats.size,
      hash
    };
  } catch (err) {
    // no such file, just skip it
  }
}

interface IFilenameTest {
  test(fileName: string): boolean;
}

interface IVariantList {
  [name: string]: string;
}

export interface WebpackEntrypointListerPluginOptions {
  outputDir?: string;
  outputFilename?: string;
  scriptTest?: IFilenameTest;
  styleTest?: IFilenameTest;
  variants?: IVariantList;
}

interface IEntrypointsData {
  [name: string]: IEntrypointData;
}

interface IEntrypointData {
  stylesheets: string[];
  scripts: string[];
}

interface IFilesData {
  [name: string]: IFileData;
}

interface IFileData {
  contentType: string;
  sriHash: string;
  variants: IVariantsData;
}

interface IVariantsData {
  [name: string]: IVariantData;
}

interface IVariantData {
  file: string;
  hash: string;
  size: number;
}

export class WebpackEntrypointListerPlugin {
  outputDir: string | null;
  outputFilename: string;
  scriptTest: IFilenameTest;
  styleTest: IFilenameTest;
  variants: IVariantList;

  constructor(options: WebpackEntrypointListerPluginOptions = {}) {
    this.outputDir = options.outputDir || null;
    this.outputFilename = options.outputFilename || "webpack-entrypoints.json";
    this.scriptTest = options.scriptTest || /\.js$/;
    this.styleTest = options.styleTest || /\.css$/;
    this.variants = options.variants || {
      br: ".br",
      gzip: ".gz"
    };
  }

  apply(compiler: Compiler) {
    compiler.hooks.done.tap("WebpackEntrypointListerPlugin", stats => {
      let entrypoints: IEntrypointsData = {};
      let files: IFilesData = {};
      for (let [name, epdata] of stats.compilation.entrypoints.entries()) {
        console.log(`Endpoint ${name}`, epdata);

        const entrypoint: IEntrypointData = {
          stylesheets: [],
          scripts: []
        };
        entrypoints[name] = entrypoint;

        for (let chunk of epdata.chunks) {
          for (let file of chunk.files) {
            let fileContentType;
            if (this.styleTest.test(file)) {
              entrypoint.stylesheets.push(file);
              fileContentType = "text/css";
            } else if (this.scriptTest.test(file)) {
              entrypoint.scripts.push(file);
              fileContentType = "application/javascript";
            } else {
              continue;
            }

            if (files[file] === undefined) {
              const fileVariants = {};

              const fullPath = pathJoin(
                stats.compilation.outputOptions.path,
                file
              );
              const contentHash = fileSha512(fullPath);

              const sriHash = sriFromHex(contentHash, "sha512")
                .toString();

              computeVariant(
                fileVariants,
                stats.compilation.outputOptions.path,
                file,
                "identity",
                "",
                contentHash
              );

              for (let [variantName, extension] of Object.entries(
                this.variants
              )) {
                computeVariant(
                  fileVariants,
                  stats.compilation.outputOptions.path,
                  file,
                  variantName,
                  extension
                );
              }

              files[file] = {
                contentType: fileContentType,
                variants: fileVariants,
                sriHash,
              };
            }
          }
        }
      }

      const outputDir = this.outputDir || stats.compilation.outputOptions.path;
      const outputFile = pathJoin(outputDir, this.outputFilename);
      writeFileSync(outputFile, JSON.stringify({ entrypoints, files }));
    });
  }
}
