
// overrides puppeteer-cluster  to expose extra functionality
const { Cluster } = require('puppeteer-necro-cluster');
const fs = require('fs');
const toml = require('toml');
const os = require('os');
let configuration;

exports.ProxyUpstream = () => {
    //const proxy = 'socks5://localhost:1337';
    // Burp proxy to further inspect traffic
    const proxy = 'http://localhost:9999';

    return proxy
}

exports.GetConfig = () => {
    return configuration
}

exports.ParseConfig = () => {
    const config = fs.readFileSync('./config.toml', 'utf8');
    let tomlConfig;
    try{
        tomlConfig = toml.parse(config);
    }catch(e){
        console.log(`error parsing toml config: ${e}`)
    }

    if(tomlConfig.platform.type === "freebsd") {
        console.log(`platform is ${os.platform()}, mocking node arch to hack puppeteer...`)

        // NOTE: hack to make puppeteer work on FreeBSD without overriding the shit out of its prototypes
        // 1. ChromeLauncher in arm64 mode expects a fixed path we can create:
        // 2. ln -s /usr/local/share/chromium/chrome /usr/bin/chromium-browser
        // 2. override the arch
        // 4. see internals at node_modules/puppeteer/lib/esm/puppeteer/node/Launcher.js
        // the main issue was resolveExecutablePath() that is not trivial to override
        os.arch = function () {
            return 'arm64'
        }

        if (fs.existsSync(tomlConfig.platform.puppetPath)) {
            //nothing to do
        } else {
            console.error('error: /usr/bin/chromium-browser not found. run the following:\nln -s /usr/local/share/chromium/chrome /usr/bin/chromium-browser')
            process.exit(1)
        }
    }

    if (!fs.existsSync(tomlConfig.platform.extrusionPath) && !fs.existsSync(tomlConfig.platform.profilesPath)) {
        console.error('error: check that extrusionPath and profilesPath are existing directories')
        process.exit(1)
    }


    configuration = tomlConfig
    return tomlConfig
}

exports.InitCluster = async(puppeteer) => {
    let standardOptions = {
        maxConcurrency: configuration.cluster.poolSize,   // parallel browsers to run at the same time
        timeout:  configuration.cluster.taskTimeout * 1000,  // two minutes timeout for tasks

        puppeteer,

        puppeteerOptions: {
            headless: configuration.necro.headless,
            args: this.GetPuppeteerArgs()
        },
    };

    switch (configuration.platform.type) {
        case "freebsd":
            standardOptions["executablePath"] = configuration.platform.puppetPath;
            break
        case "linux":
            break // nothing to do
        case "darwin":
            break // nothing to do
        default:
            console.log('error: platform type not supported.')
            process.exit(1)
            break
    }

    switch (configuration.cluster.concurrency) {
        case "necro":
            // full user-data-dir segregation in itw own directory, task in its own browser
            standardOptions["concurrency"] = Cluster.CONCURRENCY_NECRO;
            break
        case "browser":
            // opens each task on its own browser
            standardOptions["concurrency"] = Cluster.CONCURRENCY_BROWSER;
            break
        case "page":
            // opens each task on its own incognito page (single browser)
            standardOptions["concurrency"] = Cluster.CONCURRENCY_CONTEXT;
            break
        default:
            console.log('error: concurrency type not supported.')
            process.exit(1)
            break
    }

    return await Cluster.launch(standardOptions)
}


exports.GetPuppeteerArgs =  () => {
    // check if we need proxy
    let puppeteerArgs = [];
    if(configuration.debug){
        let proxy = ProxyUpstream()
        puppeteerArgs = [
            '--proxy-server=' + proxy,
            '--window-size=' + configuration.cluster.page.windowSize,
            // NOTE THIS IS VERY IMPORTANT for apps that uses iFrames. o364 for instance
            '--disable-features=site-per-process',
            '--ignore-certificate-errors' // this is just if proxy is enabled for debugging
        ]
    }else{
        puppeteerArgs = [
            '--window-size=' + configuration.cluster.page.windowSize,
            // NOTE THIS IS VERY IMPORTANT for apps that uses iFrames. o364 for instance
            '--disable-features=site-per-process',
            //'--ignore-certificate-errors' // this is just if proxy is enabled for debugging
        ]
    }
    return puppeteerArgs
}

exports.OverrideCluster = () => {
    // override monitor() to expose queue internals
    delete Cluster['monitor']

    Cluster.prototype.pad = function padDate(value, num) {
        const str = value.toString();
        if (str.length >= num) { return str }
        const zeroesToAdd = num - str.length;
        return '0'.repeat(zeroesToAdd) + str;
    }

    Cluster.prototype.dateFormat = function(datetime){
        const date = (typeof datetime === 'number') ? new Date(datetime) : datetime;
        const dateStr = `${date.getFullYear()}`
            + `-${this.pad(date.getMonth() + 1, 2)}`
            + `-${this.pad(date.getDate(), 2)}`;
        const timeStr = `${this.pad(date.getHours(), 2)}`
            + `:${this.pad(date.getMinutes(), 2)}`
            + `:${this.pad(date.getSeconds(), 2)}`
        return `${dateStr} ${timeStr}`;
    }

    Cluster.prototype.monitor =  function(){
        const doneTargets = this.allTargetCount - this.jobQueue.size() - this.workersBusy.length;
        const donePercentage = this.allTargetCount === 0 ? 1 : (doneTargets / this.allTargetCount);
        const donePercStr = (100 * donePercentage).toFixed(2);
        const errorPerc = doneTargets === 0 ? '0.00' : (100 * this.errorCount / doneTargets).toFixed(2);

        // TODO this doesn't work for some reasons...but would be nice to see the memory consumption,
        // even though we set a pool size depending on CPU and memory requirements.
        // const cpuUsage = this.systemMonitor.getCpuUsage().toFixed(1);
        // const memoryUsage = this.systemMonitor.getMemoryUsage().toFixed(1);

        // TODO re-enable the following only if debug=true
        // console.log(`== NecroBrowser started at: ${this.dateFormat(this.startTime)}`);
        // console.log(`== Workers: ${this.workers.length + this.workersStarting} - Queued Tasks: ${this.jobQueue.size()}`);
        // console.log(`== Task Progress:  ${doneTargets} / ${this.allTargetCount} (${donePercStr}%)`
        //     + ` - Tasks errors: ${this.errorCount} (${errorPerc}%)`);

        let output = {
            'startedAt': `${this.dateFormat(this.startTime)}`,
            'workers': `${this.workers.length + this.workersStarting}`,
            'queued': `${this.jobQueue.size()}`,
            'progress': `${doneTargets} / ${this.allTargetCount} (${donePercStr}%)`,
            'errors': `${this.errorCount} (${errorPerc}%)`
        }

        let workerOutput = []
        this.workers.forEach((worker, i) => {
            const isIdle = this.workersAvail.indexOf(worker) !== -1;
            let workOrIdle;
            if (isIdle) { console.log(`   necromancing is IDLE ...`) } else {
                workOrIdle = 'NECRO';
                if (worker.activeTarget) {
                    let taskId = worker.activeTarget.data[0]
                    let cookies = worker.activeTarget.data[1]
                    let params = worker.activeTarget.data[2]
                    let log = `   necromancing #${i} ${workOrIdle} taskId[${taskId}] (${cookies.length} cookies) on [${params.fixSession}]`
                    console.log(log);
                    workerOutput.push(log)
                } else {
                    console.log('WARNING!!!! NO TARGET (should not be happening)')
                }
            }
        });

        output['tasks'] = workerOutput
        return output
    }
};
