const ssri = require('ssri');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function fileSha512(path) {
    const content = fs.readFileSync(path);
    const hash = crypto.createHash('sha512');
    hash.update(content);
    const sha512val = hash.digest('hex');
    return sha512val;
}

function computeVariant(variants, prefix, file, variantName, extension, knownHash) {
    const fullPath = path.join(prefix, file + extension);
    try {
        const stats = fs.statSync(fullPath);
        // at this point, we know the variant exists
        
        let hash = knownHash || fileSha512(fullPath);
        
        variants[variantName] = {
            file: file + extension,
            size: stats.size,
            hash
        };
    } catch(err) {
        // no such file, just skip it
    }
}

class WebpackEntrypointListerPlugin {
    constructor(options = {}) {
        this.outputDir = options.outputDir || null;
        this.outputFilename = options.outputFilename || 'webpack-entrypoints.json';
        this.scriptTest = options.scriptTest || /\.js$/;
        this.styleTest = options.styleTest || /\.css$/;
        this.variants = options.variants || {
            'br': '.br',
            'gzip': '.gz',
        };
    }   
    
    apply(compiler) {
        compiler.hooks.done.tap(
            'WebpackEntrypointListerPlugin',
            stats => {
                let entrypoints = {};
                let hashes = {};
                let variants = {};
                for(let [name, epdata] of stats.compilation.entrypoints.entries()) {
                    console.log(`Endpoint ${name}`, epdata);
                    
                    const entrypoint = {
                        stylesheets: [],
                        scripts: [],
                    };
                    entrypoints[name] = entrypoint;

                    for(let chunk of epdata.chunks) {
                        for(let file of chunk.files) {
                            if(this.styleTest.test(file)) {
                                entrypoint.stylesheets.push(file);
                            } else if(this.scriptTest.test(file)) {
                                entrypoint.scripts.push(file);
                            } else {
                                continue;
                            }
                            
                            if(hashes[file] === undefined) {
                                const fileVariants = {};
                                variants[file] = fileVariants;
                                
                                const fullPath = path.join(stats.compilation.outputOptions.path, file);
                                const contentHash = fileSha512(fullPath);
                                
                                hashes[file] = ssri.fromHex(contentHash, "sha512").toString();
                                computeVariant(fileVariants, stats.compilation.outputOptions.path, file, "identity", "", contentHash);
                                
                                for(let [variantName, extension] of Object.entries(this.variants)) {
                                    computeVariant(fileVariants, stats.compilation.outputOptions.path, file, variantName, extension);
                                }
                            }
                        }
                    }
                }
                
                const outputDir = this.outputDir || stats.compilation.outputOptions.path;
                const outputFile = path.join(outputDir, this.outputFilename);
                fs.writeFileSync(outputFile, JSON.stringify({ entrypoints, hashes, variants }));
            }
        );
    }
}

module.exports = WebpackEntrypointListerPlugin;