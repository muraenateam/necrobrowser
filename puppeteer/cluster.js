const fs = require('fs');
const os = require('os');
const path = require('path');
const toml = require('toml');

let configuration;

function ensureDirectory(value, field, mode = 0o700) {
    if (!value) throw new Error(`${field} path is required`);
    try {
        fs.mkdirSync(value, { recursive: true, mode });
        const stats = fs.statSync(value);
        if (!stats.isDirectory()) throw new Error('path is not a directory');
        try { fs.chmodSync(value, mode); } catch (_) { /* best effort on non-POSIX filesystems */ }
    } catch (error) {
        throw new Error(`Unable to prepare ${field} directory ${value}: ${error.message}`);
    }
}

exports.EnsureDirectory = ensureDirectory;

function requiredDirectory(value, field) {
    ensureDirectory(value, field);
}

exports.ProxyUpstream = () => configuration?.necro?.proxy?.url || 'http://localhost:9999';
exports.GetConfig = () => configuration;

exports.ParseConfig = (configPath = path.resolve(process.cwd(), 'config.toml')) => {
    let parsed;
    try {
        parsed = toml.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
        throw new Error(`Unable to parse config ${configPath}: ${error.message}`);
    }

    const platform = parsed.platform || {};
    const cluster = parsed.cluster || {};
    const page = cluster.page || {};
    const necro = parsed.necro || {};
    const supportedPlatforms = new Set(['freebsd', 'linux', 'darwin']);
    const supportedConcurrency = new Set(['browser', 'page', 'necro']);

    if (!supportedPlatforms.has(platform.type)) throw new Error(`Unsupported platform: ${platform.type}`);
    if (!supportedConcurrency.has(cluster.concurrency)) throw new Error(`Unsupported concurrency: ${cluster.concurrency}`);
    if (!Number.isInteger(cluster.poolSize) || cluster.poolSize < 1) throw new Error('cluster.poolSize must be a positive integer');
    if (!Number.isFinite(cluster.taskTimeout) || cluster.taskTimeout <= 0) throw new Error('cluster.taskTimeout must be positive');
    if (!page.windowSize) throw new Error('cluster.page.windowSize is required');

    const configDirectory = path.dirname(path.resolve(configPath));
    const extrusionPath = path.resolve(configDirectory, platform.extrusionPath || './extrusion');
    const profilesPath = path.resolve(configDirectory, platform.profilesPath || './profiles');
    const database = parsed.database || {};
    const databasePath = database.path === ':memory:'
        ? database.path
        : path.resolve(configDirectory, database.path || './necro.db');
    ensureDirectory(extrusionPath, 'platform.extrusionPath');
    ensureDirectory(profilesPath, 'platform.profilesPath');

    if (platform.type === 'freebsd') {
        if (!platform.puppetPath || !fs.existsSync(platform.puppetPath)) {
            throw new Error(`platform.puppetPath must exist on FreeBSD: ${platform.puppetPath || '(missing)'}`);
        }
        console.log(`platform is ${os.platform()}, using configured Chromium executable`);
    }

    configuration = {
        ...parsed,
        paths: { extrusionPath, profilesPath },
        platform: { ...platform, extrusionPath, profilesPath },
        database: { ...database, path: databasePath },
        cluster: { ...cluster, page },
        necro
    };
    return configuration;
};

exports.GetPuppeteerArgs = () => {
    if (!configuration) throw new Error('Configuration has not been parsed');
    const args = [];
    if (configuration.cluster.page.windowSize) args.push(`--window-size=${configuration.cluster.page.windowSize}`);
    args.push('--disable-features=site-per-process');
    if (configuration.debug && configuration.necro?.proxy?.enabled) {
        args.push(`--proxy-server=${exports.ProxyUpstream()}`);
    }
    if (configuration.root) args.push('--no-sandbox', '--disable-setuid-sandbox');
    if (configuration.ignoreHTTPSErrors === true) args.push('--ignore-certificate-errors');
    return [...new Set(args)];
};

// Kept as compatibility no-op. Runtime status now comes from browser/pool metrics.
exports.OverrideCluster = () => {};
