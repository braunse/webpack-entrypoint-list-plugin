// Copyright (c) 2019 Sebastien Braun
// 
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

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

interface IFileTypes {
  [name: string]: IFilenameTest;
}

export interface WebpackEntrypointListerPluginOptions {
  outputDir?: string;
  outputFilename?: string;
  fileTypes?: IFileTypes;
  additionalFileTypes?: IFileTypes;
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
  fileTypes: IFileTypes;
  variants: IVariantList;

  constructor(options: WebpackEntrypointListerPluginOptions = {}) {
    this.outputDir = options.outputDir || null;
    this.outputFilename = options.outputFilename || "webpack-entrypoints.json";
    this.fileTypes = options.fileTypes || {
      "application/javascript": /\.js$/,
      "text/css": /\.css$/,
      "image/svg+xml": /\.svg$/,
      "image/png": /\.png$/,
      "text/plain": /\.(js|css)\.map$/,
    }
    Object.assign(this.fileTypes, options.additionalFileTypes || {});
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
        const entrypoint: IEntrypointData = {
          stylesheets: [],
          scripts: []
        };
        entrypoints[name] = entrypoint;

        for (let chunk of epdata.chunks) {
          for (let file of chunk.files) {
            let fileContentType = this._determineContentType(file);

            if (fileContentType === "application/javascript") {
              entrypoint.scripts.push(file);
            } else if (fileContentType === "text/css") {
              entrypoint.stylesheets.push(file);
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

  _determineContentType(file: string): string {
    for (const [mimeType, test] of Object.entries(this.fileTypes)) {
      if (test.test(file)) return mimeType;
    }
    return "application/octet-stream";
  }
}
