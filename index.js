const ssri = require('ssri');
const fs = require('fs');
const path = require('path');

class WebpackEntrypointListerPlugin {
    constructor(options = {}) {
        this.outputDir = options.outputDir || null;
        this.outputFilename = options.outputFilename || 'webpack-entrypoints.json';
        this.scriptTest = options.scriptTest || /\.js$/;
        this.styleTest = options.styleTest || /\.css$/;
    }   
    
    apply(compiler) {
        compiler.hooks.done.tap(
            'WebpackEntrypointListerPlugin',
            stats => {
                let entrypoints = {};
                let hashes = {};
                for(let [name, epdata] of stats.compilation.entrypoints.entries()) {
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
                                const fullPath = path.join(stats.compilation.outputOptions.path, file);
                                const content = fs.readFileSync(fullPath);
                                hashes[file] = ssri.fromData(content).toString();
                            }
                        }
                    }
                }
                
                const outputDir = this.outputDir || stats.compilation.outputOptions.path;
                const outputFile = path.join(outputDir, this.outputFilename);
                fs.writeFileSync(outputFile, JSON.stringify({ entrypoints, hashes }));
            }
        );
    }
}

module.exports = WebpackEntrypointListerPlugin;